import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './db.js'
import authRouter from './routes/auth.js'
import modulesRouter, { getPublicProducts } from './routes/modules.js'
import notificationsRouter from './routes/notifications.js'
import { safeError } from './domain.js'

const app = express()
const port = Number(process.env.PORT || 3000)
const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectDirectory = path.resolve(currentDirectory, '..')
const contentSecurityPolicy = {
  directives: {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    imgSrc: ["'self'", 'data:', 'https://images.unsplash.com', 'https://plus.unsplash.com'],
    connectSrc: ["'self'", 'https://api-colombia.com'],
  },
}

app.disable('x-powered-by')
app.use(helmet({ contentSecurityPolicy }))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

// Soporte CORS para modo standalone o peticiones cruzadas desde el frontend
app.use((request, response, next) => {
  const origin = request.headers.origin
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Credentials', 'true')
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept')
  }
  if (request.method === 'OPTIONS') {
    return response.sendStatus(204)
  }
  next()
})

app.get('/api/health', async (_request, response, next) => {
  try {
    await pool.query('SELECT 1')
    response.json({ status: 'ok', database: 'connected' })
  } catch (error) {
    next(error)
  }
})

app.get('/api/public/products', async (_request, response, next) => {
  try {
    response.json(await getPublicProducts())
  } catch (error) {
    next(error)
  }
})

app.get('/', (_request, response) => {
  response.json({ mensaje: 'API de Lacombalpalo activa' })
})

app.use('/api/auth', authRouter)
app.use('/api/modules', modulesRouter)
app.use('/api/notifications', notificationsRouter)

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'Ruta de API no encontrada.' })
})

app.use((error, _request, response, _next) => {
  const safe = safeError(error)
  const status = Number(safe.status) || 500
  if (status >= 500) console.error('Error de API:', error.message || error)
  response.status(status).json({
    error: safe.message || 'Ocurrió un error al procesar la solicitud.',
  })
})

async function ensurePermissions() {
  try {
    await pool.query(
      `INSERT INTO permissions (module_key, name, description)
       VALUES ('categories', 'Categorías', 'Gestión de categorías de productos')
       ON CONFLICT DO NOTHING`
    )
    await pool.query(
      `INSERT INTO permission_privileges (permission_id, privilege_id)
       SELECT p.id_permission, v.id_privilege
       FROM permissions AS p
       CROSS JOIN privileges AS v
       WHERE p.module_key = 'categories'
         AND v.action_key IN ('read', 'create', 'update', 'delete')
       ON CONFLICT DO NOTHING`
    )
    await pool.query(
      `INSERT INTO role_permissions (role_id, permission_id, privilege_id)
       SELECT r.id_role, pp.permission_id, pp.privilege_id
       FROM roles AS r
       CROSS JOIN permission_privileges AS pp
       JOIN permissions AS p ON p.id_permission = pp.permission_id
       WHERE r.name = 'Administrador' AND p.module_key = 'categories'
       ON CONFLICT DO NOTHING`
    )
    await pool.query('ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS image VARCHAR(500) NULL')
  } catch {}
}

const server = app.listen(port, '0.0.0.0', () => {
  ensurePermissions()
  console.log(`API lista en http://0.0.0.0:${port}`)
})

async function shutdown(signal) {
  console.log(`Cerrando API por ${signal}.`)
  server.close(async () => {
    await pool.end()
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
