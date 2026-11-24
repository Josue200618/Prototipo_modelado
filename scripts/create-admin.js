import 'dotenv/config'
import bcrypt from 'bcryptjs'
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { pool } from '../db.js'

function readHidden(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    return Promise.reject(new Error('Ejecuta este comando desde una terminal interactiva para proteger la contraseña.'))
  }
  return new Promise((resolve, reject) => {
    stdout.write(prompt)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    const finish = (error) => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', onData)
      stdout.write('\n')
      if (error) reject(error)
      else resolve(value)
    }
    const onData = (key) => {
      if (key === '\u0003') return finish(new Error('Creación cancelada.'))
      if (key === '\r' || key === '\n') return finish()
      if (key === '\u007f' || key === '\b') {
        value = value.slice(0, -1)
        return
      }
      value += key
    }
    stdin.on('data', onData)
  })
}

const prompt = readline.createInterface({ input: stdin, output: stdout })
try {
  const [roles] = await pool.execute(
    `SELECT id_role FROM roles WHERE name = 'Administrador' AND status = 1 LIMIT 1`,
  )
  if (!roles[0]) throw new Error('No existe un rol activo llamado Administrador. Ejecuta primero el SQL y su migración.')

  const email = (await prompt.question('Correo del administrador: ')).trim().toLowerCase()
  const identificationType = (await prompt.question('Tipo de identificación (ej. CC): ')).trim()
  const identification = (await prompt.question('Número de identificación: ')).trim()
  const firstName = (await prompt.question('Primer nombre: ')).trim()
  const secondName = (await prompt.question('Segundo nombre (opcional): ')).trim() || null
  const firstSurname = (await prompt.question('Primer apellido: ')).trim()
  const secondSurname = (await prompt.question('Segundo apellido (opcional): ')).trim() || null
  const phone = (await prompt.question('Teléfono: ')).trim()
  prompt.close()

  if (!email || !identification || !firstName || !firstSurname || !phone) {
    throw new Error('Correo, identificación, nombre, apellido y teléfono son obligatorios.')
  }
  const password = await readHidden('Contraseña (mínimo 8 caracteres): ')
  if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.')
  const passwordHash = await bcrypt.hash(password, 12)
  await pool.execute(
    `INSERT INTO users
      (role_id, identification_type, identification, first_name, second_name,
       first_surname, second_surname, email, phone, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      roles[0].id_role,
      identificationType || null,
      identification,
      firstName,
      secondName,
      firstSurname,
      secondSurname,
      email,
      phone,
      passwordHash,
    ],
  )
  console.log('Cuenta de administrador creada correctamente.')
} catch (error) {
  console.error(`No se pudo crear el administrador: ${error.message}`)
  process.exitCode = 1
} finally {
  prompt.close()
  await pool.end()
}
