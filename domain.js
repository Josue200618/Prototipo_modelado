export const modulePrefixes = {
  roles: 'ROL',
  users: 'USR',
  products: 'PRD',
  categories: 'CAT',
  suppliers: 'SUP',
  purchases: 'COM',
  clients: 'CLI',
  orders: 'PED',
  sales: 'VEN',
  deliveries: 'ENT',
  reviews: 'REV',
}

export function formatId(moduleKey, id) {
  return `${modulePrefixes[moduleKey]}-${String(id).padStart(3, '0')}`
}

export function parseId(moduleKey, value) {
  const prefix = modulePrefixes[moduleKey]
  if (!prefix) throw Object.assign(new Error('Módulo no válido.'), { status: 404 })
  const match = new RegExp(`^${prefix}-(\\d+)$`).exec(String(value))
  const id = match ? Number(match[1]) : Number(value)
  if (!Number.isSafeInteger(id) || id < 1) {
    throw Object.assign(new Error('Identificador no válido.'), { status: 400 })
  }
  return id
}

export function parsePrice(value) {
  if (typeof value === 'number') return value
  const normalized = String(value ?? '').replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')
  const price = Number(normalized)
  return Number.isFinite(price) ? price : 0
}

export function statusToBoolean(status) {
  return status === true || status === 1 || status === '1' || status === 'Activo'
}

export function toDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export function publicClient(client) {
  if (!client) return null
  const name = client.name_or_business_name
  const status = Number(client.status) === 1 ? 'Activo' : 'Inactivo'
  return {
    id: formatId('clients', client.id_client),
    name,
    email: client.email,
    phone: client.phone,
    address: client.delivery_address,
    department: client.department,
    municipality: client.municipality,
    personType: client.person_type,
    documentType: client.document_type,
    documentNumber: client.document_number,
    status,
    estado: Number(client.status),
    createdAt: client.created_at,
  }
}

export function safeError(error) {
  if (error?.code === 'ER_DUP_ENTRY') {
    return Object.assign(new Error('Ya existe un registro con ese correo, documento o nombre.'), { status: 409 })
  }
  if (error?.code === 'ER_ROW_IS_REFERENCED_2' || error?.code === 'ER_ROW_IS_REFERENCED') {
    return Object.assign(new Error('No se puede eliminar porque existen registros relacionados.'), { status: 409 })
  }
  if (error?.code === 'ECONNREFUSED') {
    return Object.assign(new Error('No se pudo conectar a MySQL (127.0.0.1:3306). Asegúrate de que el servicio MySQL esté iniciado en Workbench o XAMPP.'), { status: 503 })
  }
  if (error?.code === 'ER_BAD_DB_ERROR') {
    return Object.assign(new Error(`La base de datos '${process.env.DB_NAME || 'Lacombalpalo'}' no fue encontrada en MySQL. Ejecuta el archivo Lacombalpalo.sql en MySQL Workbench.`), { status: 503 })
  }
  if (error?.code === 'ER_ACCESS_DENIED_ERROR') {
    return Object.assign(new Error('Acceso denegado a MySQL. Verifica el usuario y la contraseña en el archivo .env.'), { status: 503 })
  }
  return error
}
