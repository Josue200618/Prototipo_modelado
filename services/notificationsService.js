import { pool } from '../db.js'

function formatNotification(row) {
  const notification = {
    id: `NOT-${String(row.id_notification).padStart(6, '0')}`,
    category: row.category,
    message: row.message,
    recipient: row.recipient_type,
    read: Number(row.is_read) === 1,
    createdAt: row.created_at,
  }
  if (row.client_id) notification.clientId = `CLI-${String(row.client_id).padStart(3, '0')}`
  if (row.related_id) notification.relatedId = row.related_id
  return notification
}

export async function createNotification({
  recipient,
  clientId = null,
  category,
  message,
  relatedId = null,
}, executor = pool) {
  const [result] = await executor.execute(
    `INSERT INTO notifications (recipient_type, client_id, category, message, related_id)
     VALUES (?, ?, ?, ?, ?)`,
    [recipient, clientId, category, message, relatedId],
  )
  const [rows] = await executor.execute(
    'SELECT * FROM notifications WHERE id_notification = ?',
    [result.insertId],
  )
  return formatNotification(rows[0])
}

export async function listNotifications(user) {
  const [rows] = user.audience === 'client'
    ? await pool.execute(
      `SELECT * FROM notifications
       WHERE recipient_type = 'client' AND client_id = ?
       ORDER BY created_at DESC, id_notification DESC`,
      [user.id],
    )
    : await pool.execute(
      `SELECT * FROM notifications
       WHERE recipient_type = 'admin'
       ORDER BY created_at DESC, id_notification DESC`,
    )
  return rows.map(formatNotification)
}

export function parseNotificationId(value) {
  const match = /^NOT-(\d+)$/.exec(String(value))
  const id = match ? Number(match[1]) : Number(value)
  if (!Number.isSafeInteger(id) || id < 1) {
    throw Object.assign(new Error('Identificador de notificación no válido.'), { status: 400 })
  }
  return id
}
