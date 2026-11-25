import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

const requiredVariables = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET']
const missingVariables = requiredVariables.filter((name) => process.env[name] === undefined)

if (missingVariables.length) {
  throw new Error(`Faltan variables locales en .env: ${missingVariables.join(', ')}`)
}

if (process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('replace-this-')) {
  throw new Error('JWT_SECRET debe ser un secreto privado de al menos 32 caracteres.')
}

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 10,
  ssl: process.env.DB_HOST === 'localhost' ? false : { rejectUnauthorized: false },
})

export async function withTransaction(work) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
