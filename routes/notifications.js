import 'dotenv/config'
import { pool } from '../db.js'

try {
  await pool.query('SELECT 1')
  console.log(`Conexión correcta con la base PostgreSQL ${process.env.DB_NAME}.`)
} catch (error) {
  console.error(`No se pudo conectar a PostgreSQL: ${error.message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
