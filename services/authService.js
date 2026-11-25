import { pool } from '../db.js'

export async function getPrincipal(id, audience) {
  if (audience === 'client') {
    const { rows } = await pool.query(
      `SELECT id_client, name_or_business_name, email, status, phone, person_type,
              document_type, document_number, department, municipality, delivery_address
       FROM clients
       WHERE id_client = $1
       LIMIT 1`,
      [id],
    )
    const client = rows[0]
    if (!client) return null
    return {
      id: client.id_client,
      clientId: client.id_client,
      name: client.name_or_business_name,
      email: client.email,
      role: 'Cliente',
      audience: 'client',
      status: Number(client.status),
      profile: {
        name: client.name_or_business_name,
        email: client.email,
        phone: client.phone,
        personType: client.person_type,
        documentType: client.document_type,
        documentNumber: client.document_number,
        department: client.department,
        municipality: client.municipality,
        address: client.delivery_address,
      },
      moduleAccess: [],
      permissionCodes: [],
    }
  }

  const { rows } = await pool.query(
    `SELECT u.id_user, u.email, u.first_name, u.second_name, u.first_surname,
            u.second_surname, u.status, r.id_role, r.name AS role_name
     FROM users AS u
     INNER JOIN roles AS r ON r.id_role = u.role_id
     WHERE u.id_user = $1
     LIMIT 1`,
    [id],
  )
  const user = rows[0]
  if (!user) return null

  const { rows: permissionRows } = await pool.query(
    `SELECT DISTINCT p.module_key, v.action_key
     FROM role_permissions AS rp
     INNER JOIN permissions AS p ON p.id_permission = rp.permission_id
     INNER JOIN privileges AS v ON v.id_privilege = rp.privilege_id
     WHERE rp.role_id = $1
     ORDER BY p.module_key, v.action_key`,
    [user.id_role],
  )
  const permissionCodes = permissionRows.map(({ module_key, action_key }) => `${module_key}:${action_key}`)
  const moduleAccess = [...new Set(permissionRows.map(({ module_key }) => module_key))]
  const name = [user.first_name, user.second_name, user.first_surname, user.second_surname].filter(Boolean).join(' ')
  const isAdmin = user.role_name.toLowerCase() === 'administrador'

  return {
    id: user.id_user,
    name,
    email: user.email,
    role: user.role_name,
    roleId: user.id_role,
    audience: isAdmin ? 'admin' : 'employee',
    status: Number(user.status),
    moduleAccess: isAdmin ? ['*'] : moduleAccess,
    permissionCodes: isAdmin ? ['*'] : permissionCodes,
  }
}
