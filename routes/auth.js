import crypto from 'node:crypto'
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { rateLimit } from 'express-rate-limit'
import { pool, withTransaction } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { getPrincipal } from '../services/authService.js'
import { createNotification } from '../services/notificationsService.js'
import {
  sendRegisterOtpEmail,
  sendWelcomeEmail,
  sendPasswordRecoveryEmail,
} from '../services/mailService.js'

const router = Router()
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'production' ? 10 : 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo nuevamente.' },
})
const sessionCookie = 'lacombalpalo_session'
const cookieOptions = {
  httpOnly: true,
  sameSite: 'none',
  secure: true,
  path: '/',
  maxAge: 8 * 60 * 60 * 1000,
}

function issueSession(response, user) {
  const token = jwt.sign(
    { sub: String(user.id), audience: user.audience },
    process.env.JWT_SECRET,
    { expiresIn: '8h' },
  )
  response.cookie(sessionCookie, token, cookieOptions)
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function generateSixDigitCode() {
  return String(crypto.randomInt(100000, 1000000))
}

function invalidCredentials(response, email, audience) {
  createNotification({
    recipient: 'admin',
    category: 'login-failure',
    message: `Intento fallido de acceso ${audience === 'client' ? 'de cliente' : audience === 'admin' ? 'de administrador' : 'de empleado'} para ${email}.`,
  }).catch((error) => {
    console.error('No se pudo registrar la notificación de inicio de sesión fallido.', error)
  })
  return response.status(401).json({ error: 'Correo o contraseña incorrectos, o cuenta inactiva.' })
}

router.post('/login', loginLimiter, async (request, response, next) => {
  const email = normalizeEmail(request.body?.email)
  const password = String(request.body?.password || '')
  const audience = request.body?.audience
  if (!email || !password || !['admin', 'employee', 'client'].includes(audience)) {
    return response.status(400).json({ error: 'Correo, contraseña y tipo de acceso son obligatorios.' })
  }

  try {
    if (audience === 'client') {
      const { rows } = await pool.query(
        'SELECT id_client, email, password_hash, status FROM clients WHERE email = $1 LIMIT 1',
        [email],
      )
      const client = rows[0]
      if (!client || Number(client.status) !== 1 || !client.password_hash || !await bcrypt.compare(password, client.password_hash)) {
        return invalidCredentials(response, email, audience)
      }
      const user = await getPrincipal(client.id_client, 'client')
      issueSession(response, user)
      return response.json({ user })
    }

    const { rows } = await pool.query(
      `SELECT u.id_user, u.password_hash, u.status, r.name AS role_name, r.status AS role_status
       FROM users AS u
       INNER JOIN roles AS r ON r.id_role = u.role_id
       WHERE u.email = $1
       LIMIT 1`,
      [email],
    )
    const account = rows[0]
    const isAdmin = account?.role_name.toLowerCase() === 'administrador'
    if (
      !account
      || Number(account.status) !== 1
      || Number(account.role_status) !== 1
      || (audience === 'admin') !== isAdmin
      || !await bcrypt.compare(password, account.password_hash)
    ) {
      return invalidCredentials(response, email, audience)
    }
    const user = await getPrincipal(account.id_user, audience)
    issueSession(response, user)
    return response.json({ user })
  } catch (error) {
    return next(error)
  }
})
router.post('/register', async (request, response, next) => {
  const input = request.body || {}
  const email = normalizeEmail(input.email)
  const password = String(input.password || '')
  const required = [
    input.personType,
    input.documentType,
    input.documentNumber,
    input.name,
    input.phone,
    email,
    input.department,
    input.municipality,
    input.address,
  ]
  if (required.some((value) => !String(value || '').trim()) || password.length < 8) {
    return response.status(400).json({ error: 'Completa todos los datos y usa una contraseña de al menos 8 caracteres.' })
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12)
    const cleanName = String(input.name).trim()
    const otpCode = generateSixDigitCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    await withTransaction(async (connection) => {
      const { rows: existing } = await connection.query(
        'SELECT id_client, status FROM clients WHERE email = $1 LIMIT 1',
        [email],
      )

      if (existing[0] && Number(existing[0].status) === 1) {
        throw Object.assign(new Error('Ya existe una cuenta verificada con ese correo electrónico.'), { status: 409 })
      }

      if (existing[0]) {
        await connection.query(
          `UPDATE clients
           SET person_type = $1, document_type = $2, document_number = $3,
               name_or_business_name = $4, phone = $5, department = $6,
               municipality = $7, delivery_address = $8, password_hash = $9, status = 0
           WHERE id_client = $10`,
          [
            String(input.personType).trim(),
            String(input.documentType).trim(),
            String(input.documentNumber).trim(),
            cleanName,
            String(input.phone).trim(),
            String(input.department).trim(),
            String(input.municipality).trim(),
            String(input.address).trim(),
            passwordHash,
            existing[0].id_client,
          ],
        )
      } else {
        await connection.query(
          `INSERT INTO clients
            (person_type, document_type, document_number, name_or_business_name, phone,
             email, department, municipality, delivery_address, password_hash, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0)`,
          [
            String(input.personType).trim(),
            String(input.documentType).trim(),
            String(input.documentNumber).trim(),
            cleanName,
            String(input.phone).trim(),
            email,
            String(input.department).trim(),
            String(input.municipality).trim(),
            String(input.address).trim(),
            passwordHash,
          ],
        )
      }

      await connection.query(
        `DELETE FROM verification_codes WHERE email = $1 AND purpose = 'register'`,
        [email],
      )
      await connection.query(
        `INSERT INTO verification_codes (email, purpose, code, attempts, expires_at)
         VALUES ($1, 'register', $2, 0, $3)`,
        [email, otpCode, expiresAt],
      )
    })

    await sendRegisterOtpEmail(email, cleanName, otpCode)

    return response.status(201).json({
      requiresVerification: true,
      email,
      message: 'Te enviamos un código de 6 dígitos a tu correo para activar tu cuenta.',
    })
  } catch (error) {
    return next(error)
  }
})

router.post('/verify-otp', loginLimiter, async (request, response, next) => {
  const email = normalizeEmail(request.body?.email)
  const code = String(request.body?.code || '').trim()
  if (!email || !/^\d{6}$/.test(code)) {
    return response.status(400).json({ error: 'Ingresa el correo y el código de 6 dígitos.' })
  }

  try {
    const verifiedClient = await withTransaction(async (connection) => {
      const { rows: codeRows } = await connection.query(
        `SELECT id_code, code, attempts, expires_at
         FROM verification_codes
         WHERE email = $1 AND purpose = 'register'
         ORDER BY id_code DESC
         LIMIT 1
         FOR UPDATE`,
        [email],
      )
      const record = codeRows[0]
      if (!record) {
        throw Object.assign(new Error('No hay un código pendiente para este correo. Solicita uno nuevo.'), { status: 400 })
      }
      if (Number(record.attempts) >= 5) {
        throw Object.assign(new Error('Superaste el máximo de 5 intentos fallidos. Solicita un nuevo código.'), { status: 429 })
      }
      if (new Date(record.expires_at) < new Date()) {
        throw Object.assign(new Error('El código ha expirado. Solicita uno nuevo.'), { status: 400 })
      }
      if (record.code !== code) {
        await connection.query(
          'UPDATE verification_codes SET attempts = attempts + 1 WHERE id_code = $1',
          [record.id_code],
        )
        const remaining = 4 - Number(record.attempts)
        throw Object.assign(
          new Error(remaining > 0 ? `Código incorrecto. Te quedan ${remaining} intentos.` : 'Código incorrecto. Superaste el límite de intentos.'),
          { status: 400 },
        )
      }

      const { rows: clientRows } = await connection.query(
        `UPDATE clients SET status = 1
         WHERE email = $1
         RETURNING id_client, name_or_business_name`,
        [email],
      )
      const client = clientRows[0]
      if (!client) {
        throw Object.assign(new Error('La cuenta asociada no existe.'), { status: 404 })
      }

      await connection.query('DELETE FROM verification_codes WHERE id_code = $1', [record.id_code])

      await createNotification({
        recipient: 'admin',
        category: 'client-registration',
        message: `Nuevo cliente registrado y verificado: ${client.name_or_business_name} (${email}).`,
        relatedId: `CLI-${client.id_client}`,
      }, connection)

      await createNotification({
        recipient: 'client',
        clientId: client.id_client,
        category: 'welcome',
        message: '¡Bienvenido a Lacombalpalo! Tu cuenta ya está lista: explora el catálogo y consulta tus pedidos desde tu perfil.',
      }, connection)

      return client
    })

    sendWelcomeEmail(email, verifiedClient.name_or_business_name).catch((err) => {
      console.error('No se pudo enviar el correo de bienvenida:', err.message)
    })

    const user = await getPrincipal(verifiedClient.id_client, 'client')
    issueSession(response, user)
    return response.json({ user })
  } catch (error) {
    return next(error)
  }
})
router.post('/resend-otp', loginLimiter, async (request, response, next) => {
  const email = normalizeEmail(request.body?.email)
  if (!email) {
    return response.status(400).json({ error: 'El correo electrónico es obligatorio.' })
  }

  try {
    const { rows } = await pool.query(
      'SELECT name_or_business_name, status FROM clients WHERE email = $1 LIMIT 1',
      [email],
    )
    const client = rows
    if (!client) {
      return response.status(404).json({ error: 'No existe un registro pendiente con ese correo.' })
    }
    if (Number(client.status) === 1) {
      return response.status(400).json({ error: 'Esta cuenta ya está verificada. Inicia sesión normalmente.' })
    }

    const otpCode = generateSixDigitCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    await withTransaction(async (connection) => {
      await connection.query(
        `DELETE FROM verification_codes WHERE email = $1 AND purpose = 'register'`,
        [email],
      )
      await connection.query(
        `INSERT INTO verification_codes (email, purpose, code, attempts, expires_at)
         VALUES ($1, 'register', $2, 0, $3)`,
        [email, otpCode, expiresAt],
      )
    })

    await sendRegisterOtpEmail(email, client.name_or_business_name, otpCode)
    return response.json({ message: 'Hemos enviado un nuevo código de 6 dígitos a tu correo.' })
  } catch (error) {
    return next(error)
  }
})

router.post('/recover', loginLimiter, async (request, response, next) => {
  const email = normalizeEmail(request.body?.email)
  if (!email) {
    return response.status(400).json({ error: 'Ingresa tu correo electrónico.' })
  }

  try {
    const { rows: clients } = await pool.query(
      'SELECT name_or_business_name AS name FROM clients WHERE email = $1 AND status = 1 LIMIT 1',
      [email],
    )
    const { rows: users } = !clients
      ? await pool.query(
        'SELECT first_name AS name FROM users WHERE email = $1 AND status = 1 LIMIT 1',
        [email],
      )
      : { rows: [] }

    const account = clients || users
    if (account) {
      const code = generateSixDigitCode()
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      await withTransaction(async (connection) => {
        await connection.query(
          `DELETE FROM verification_codes WHERE email = $1 AND purpose = 'recover'`,
          [email],
        )
        await connection.query(
          `INSERT INTO verification_codes (email, purpose, code, attempts, expires_at)
           VALUES ($1, 'recover', $2, 0, $3)`,
          [email, code, expiresAt],
        )
      })
      await sendPasswordRecoveryEmail(email, account.name, code)
    }

    return response.json({
      message: 'Si el correo está registrado, recibirás un código de recuperación en unos momentos.',
    })
  } catch (error) {
    return next(error)
  }
})

router.post('/reset-password', loginLimiter, async (request, response, next) => {
  const email = normalizeEmail(request.body?.email)
  const code = String(request.body?.code || '').trim()
  const newPassword = String(request.body?.newPassword || '')

  if (!email || !/^\d{6}$/.test(code) || newPassword.length < 8) {
    return response.status(400).json({ error: 'Completa el correo, el código de 6 dígitos y una nueva contraseña de al menos 8 caracteres.' })
  }

  try {
    const passwordHash = await bcrypt.hash(newPassword, 12)
    await withTransaction(async (connection) => {
      const { rows } = await connection.query(
        `SELECT id_code, code, attempts, expires_at
         FROM verification_codes
         WHERE email = $1 AND purpose = 'recover'
         ORDER BY id_code DESC
         LIMIT 1
         FOR UPDATE`,
        [email],
      )
      const record = rows
      if (!record || Number(record.attempts) >= 5 || new Date(record.expires_at) < new Date()) {
        throw Object.assign(new Error('El código es inválido, expiró o superó los intentos permitidos.'), { status: 400 })
      }
      if (record.code !== code) {
        await connection.query('UPDATE verification_codes SET attempts = attempts + 1 WHERE id_code = $1', [record.id_code])
        throw Object.assign(new Error('El código de recuperación es incorrecto.'), { status: 400 })
      }

      const clientRes = await connection.query(
        'UPDATE clients SET password_hash = $1 WHERE email = $2',
        [passwordHash, email],
      )
      if (!clientRes.rowCount) {
        await connection.query(
          'UPDATE users SET password_hash = $1 WHERE email = $2',
          [passwordHash, email],
        )
      }
      await connection.query('DELETE FROM verification_codes WHERE id_code = $1', [record.id_code])
    })

    return response.json({ message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' })
  } catch (error) {
    return next(error)
  }
})

router.get('/me', requireAuth, (request, response) => response.json({ user: request.user }))

router.post('/logout', (request, response) => {
  response.clearCookie(sessionCookie, { ...cookieOptions, maxAge: undefined })
  response.status(204).end()
})

export default router
