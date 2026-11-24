import 'dotenv/config'
import mysql from 'mysql2/promise'

const requiredVariables = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET']
const missingVariables = requiredVariables.filter((name) => process.env[name] === undefined)

if (missingVariables.length) {
  throw new Error(`Faltan variables locales en .env: ${missingVariables.join(', ')}`)
}

if (process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('replace-this-')) {
  throw new Error('JWT_SECRET debe ser un secreto privado de al menos 32 caracteres.')
}

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  ssl: {
    rejectUnauthorized: false,
  },
})

export async function withTransaction(work) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
