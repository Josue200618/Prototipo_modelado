import { Router } from 'express'
import { requireAuth, requireAudience } from '../middleware/auth.js'
import { parseNotificationId, createNotification, listNotifications } from '../services/notificationsService.js'
import { parseId } from '../domain.js'
import { pool } from '../db.js'

const router = Router()
router.use(requireAuth)

router.get('/', async (request, response, next) => {
  try {
    response.json(await listNotifications(request.user))
  } catch (error) {
    next(error)
  }
})

router.post('/', async (request, response, next) => {
  const { recipient, clientId, category, message, relatedId } = request.body || {}
  if (!['admin', 'client'].includes(recipient) || !category || !message) {
    return response.status(400).json({ error: 'Destinatario, categoría y mensaje son obligatorios.' })
  }
  if ((recipient === 'admin' && request.user.audience === 'client')
    || (recipient === 'client' && request.user.audience !== 'admin' && parseId('clients', clientId) !== request.user.id)) {
    return response.status(403).json({ error: 'No puedes crear notificaciones para ese destinatario.' })
  }
  try {
    const notification = await createNotification({
      recipient,
      clientId: recipient === 'client' ? parseId('clients', clientId) : null,
      category: String(category).slice(0, 60),
      message: String(message).slice(0, 1000),
      relatedId: relatedId ? String(relatedId).slice(0, 80) : null,
    })
    response.status(201).json(notification)
  } catch (error) {
    next(error)
  }
})

router.patch('/read', async (request, response, next) => {
  try {
    if (request.user.audience === 'client') {
      await pool.query(
        `UPDATE notifications SET is_read = 1
         WHERE recipient_type = 'client' AND client_id = $1`,
        [request.user.id],
      )
    } else {
      await pool.query(
        `UPDATE notifications SET is_read = 1
         WHERE recipient_type = 'admin'`,
      )
    }
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', requireAudience('admin'), async (request, response, next) => {
  try {
    const id = parseNotificationId(request.params.id)
    const result = await pool.query(
      `DELETE FROM notifications
       WHERE id_notification = $1 AND recipient_type = 'admin'`,
      [id],
    )
    if (!result.rowCount) return response.status(404).json({ error: 'La notificación no existe.' })
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

export default router
