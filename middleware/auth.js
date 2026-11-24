import jwt from 'jsonwebtoken'
import { getPrincipal } from '../services/authService.js'

export async function requireAuth(request, response, next) {
  const token = request.cookies?.lacombalpalo_session
  if (!token) {
    return response.status(401).json({ error: 'Inicia sesión para continuar.' })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const principal = await getPrincipal(Number(payload.sub), payload.audience)
    if (!principal || principal.status !== 1) {
      response.clearCookie('lacombalpalo_session', { path: '/' })
      return response.status(401).json({ error: 'La cuenta está inactiva o ya no existe.' })
    }
    request.user = principal
    return next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      response.clearCookie('lacombalpalo_session', { path: '/' })
      return response.status(401).json({ error: 'La sesión expiró. Inicia sesión nuevamente.' })
    }
    return next(error)
  }
}

export function requireAudience(...audiences) {
  return (request, response, next) => {
    if (!request.user || !audiences.includes(request.user.audience)) {
      return response.status(403).json({ error: 'No tienes permiso para esta acción.' })
    }
    return next()
  }
}

export function requirePermission(moduleKey, action) {
  return (request, response, next) => {
    if (request.user?.audience === 'admin' || request.user?.role?.toLowerCase() === 'administrador') {
      return next()
    }
    const permissions = request.user?.permissionCodes || []
    if (permissions.includes('*') || permissions.includes(`${moduleKey}:${action}`)) {
      return next()
    }
    return response.status(403).json({ error: 'Tu rol no tiene permiso para esta acción.' })
  }
}
