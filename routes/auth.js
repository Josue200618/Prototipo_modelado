import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { rateLimit } from 'express-rate-limit'
import { pool, withTransaction } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { getPrincipal } from '../services/authService.js'
import { createNotification } from '../services/notificationsService.js'

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
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
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
      const [rows] = await pool.execute(
        'SELECT id_client, email, password_hash, status FROM clients WHERE email = ? LIMIT 1',
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

    const [rows] = await pool.execute(
      `SELECT u.id_user, u.password_hash, u.status, r.name AS role_name, r.status AS role_status
       FROM users AS u
       INNER JOIN roles AS r ON r.id_role = u.role_id
       WHERE u.email = ?
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
    const result = await withTransaction(async (connection) => {
      const [insert] = await connection.execute(
        `INSERT INTO clients
          (person_type, document_type, document_number, name_or_business_name, phone,
           email, department, municipality, delivery_address, password_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(input.personType).trim(),
          String(input.documentType).trim(),
          String(input.documentNumber).trim(),
          String(input.name).trim(),
          String(input.phone).trim(),
          email,
          String(input.department).trim(),
          String(input.municipality).trim(),
          String(input.address).trim(),
          passwordHash,
        ],
      )
      const clientId = insert.insertId
      await createNotification({
        recipient: 'admin',
        category: 'client-registration',
        message: `Nuevo cliente registrado: ${String(input.name).trim()} (${email}).`,
        relatedId: `CLI-${clientId}`,
      }, connection)
      await createNotification({
        recipient: 'client',
        clientId,
        category: 'welcome',
        message: '¡Bienvenido a Lacombalpalo! Tu cuenta ya está lista: explora el catálogo y consulta tus pedidos desde tu perfil.',
      }, connection)
      return clientId
    })
    const user = await getPrincipal(result, 'client')
    issueSession(response, user)
    return response.status(201).json({ user })
  } catch (error) {
    return next(error)
  }
})

router.get('/me', requireAuth, (request, response) => response.json({ user: request.user }))

router.post('/logout', (request, response) => {
  response.clearCookie(sessionCookie, { ...cookieOptions, maxAge: undefined })
  response.status(204).end()
})

router.post('/recover', (_request, response) => {
  response.status(501).json({ error: 'La recuperación por correo requiere configurar un servicio de email.' })
})

export default router
