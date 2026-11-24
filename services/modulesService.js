import { pool } from '../db.js'
import { formatId } from '../domain.js'

const moduleSpanishNames = {
  dashboard: 'Dashboard',
  roles: 'Roles y permisos',
  users: 'Usuarios',
  products: 'Productos',
  categories: 'Categorías',
  suppliers: 'Proveedores',
  purchases: 'Compras',
  clients: 'Clientes',
  orders: 'Pedidos',
  sales: 'Ventas',
  deliveries: 'Entregas',
  reviews: 'Reseñas',
}

const privilegeNames = {
  read: 'Consultar (acceso al módulo)',
  create: 'Registrar',
  update: 'Editar',
  delete: 'Eliminar',
  approve: 'Aprobar',
  export: 'Exportar',
}

function isActive(value) {
  return Number(value) === 1 ? 'Activo' : 'Inactivo'
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('es-CO')
}

function canRead(user, key) {
  if (user.audience === 'admin') return true
  if (user.audience === 'client') return ['products', 'clients', 'orders', 'deliveries', 'reviews'].includes(key)
  return user.permissionCodes?.some((permission) => permission === '*' || permission === `${key}:read`)
}

async function getRoles() {
  const [rows] = await pool.execute(
    `SELECT r.id_role, r.name, r.description, r.status,
            GROUP_CONCAT(DISTINCT CONCAT(p.module_key, ':', v.action_key) ORDER BY p.module_key, v.action_key SEPARATOR ',') AS permission_codes
     FROM roles AS r
     LEFT JOIN role_permissions AS rp ON rp.role_id = r.id_role
     LEFT JOIN permissions AS p ON p.id_permission = rp.permission_id
     LEFT JOIN privileges AS v ON v.id_privilege = rp.privilege_id
     GROUP BY r.id_role, r.name, r.description, r.status
     ORDER BY r.id_role`,
  )
  return rows.map((row) => {
    const permissionCodes = row.permission_codes ? row.permission_codes.split(',') : []
    const moduleAccess = [...new Set(permissionCodes.map((code) => code.split(':')[0]))]
    const isAll = row.name.toLowerCase() === 'administrador'
      || moduleAccess.length >= Object.keys(moduleSpanishNames).length
      || permissionCodes.includes('*')

    const moduleLabels = moduleAccess.map((m) => moduleSpanishNames[m] || m)
    let permissionsSummary = 'Sin permisos'
    if (isAll) {
      permissionsSummary = 'Todo'
    } else if (moduleLabels.length <= 5) {
      permissionsSummary = moduleLabels.join(', ')
    } else {
      permissionsSummary = `${moduleLabels.slice(0, 5).join(', ')} (+${moduleLabels.length - 5} más)`
    }

    return {
      id: formatId('roles', row.id_role),
      name: row.name,
      description: row.description || '',
      permissions: permissionsSummary,
      moduleAccess: isAll ? ['*'] : moduleAccess,
      permissionCodes: isAll ? ['*'] : permissionCodes,
      status: isActive(row.status),
    }
  })
}

async function getUsers() {
  const [rows] = await pool.execute(
    `SELECT u.id_user, u.role_id, u.identification_type, u.identification,
            u.first_name, u.second_name, u.first_surname, u.second_surname,
            u.email, u.phone, u.status, r.name AS role_name
     FROM users AS u
     INNER JOIN roles AS r ON r.id_role = u.role_id
     ORDER BY u.id_user`,
  )
  return rows.map((row) => ({
    id: formatId('users', row.id_user),
    name: [row.first_name, row.second_name, row.first_surname, row.second_surname].filter(Boolean).join(' '),
    tipo_identificacion: row.identification_type,
    identificacion: row.identification,
    primer_nombre: row.first_name,
    segundo_nombre: row.second_name || '',
    primer_apellido: row.first_surname,
    segundo_apellido: row.second_surname || '',
    email: row.email,
    correo: row.email,
    phone: row.phone,
    telefono: row.phone,
    role: row.role_name,
    roleId: formatId('roles', row.role_id),
    status: isActive(row.status),
    estado: Number(row.status),
  }))
}

async function getProducts() {
  let hasInCatalog = false
  try {
    const [cols] = await pool.execute(
      `SELECT COUNT(*) AS count FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'in_catalog'`,
    )
    hasInCatalog = cols[0]?.count > 0
  } catch {}

  const inCatalogCol = hasInCatalog ? 'p.in_catalog' : '1 AS in_catalog'
  const [rows] = await pool.execute(
    `SELECT p.id_product, p.name, p.description, p.base_price, p.stock, p.status,
            ${inCatalogCol},
            c.name AS category, pi.image_url
     FROM products AS p
     INNER JOIN product_categories AS c ON c.id_category = p.category_id
     LEFT JOIN product_images AS pi ON pi.product_id = p.id_product AND pi.is_primary = 1
     ORDER BY p.id_product`,
  )
  return rows.map((row) => ({
    id: formatId('products', row.id_product),
    name: row.name,
    description: row.description,
    category: row.category,
    price: formatCurrency(row.base_price),
    priceValue: Number(row.base_price),
    stock: Number(row.stock),
    image: row.image_url || '',
    status: isActive(row.status),
    in_catalog: row.in_catalog !== undefined && row.in_catalog !== null ? Number(row.in_catalog) === 1 : true,
    inCatalog: row.in_catalog !== undefined && row.in_catalog !== null ? Number(row.in_catalog) === 1 : true,
  }))
}

async function getSuppliers() {
  const [rows] = await pool.execute(
    `SELECT s.id_supplier, s.document_type, s.document_number, s.name, s.phone, s.email,
            s.department, s.municipality, s.address, s.status,
            sp.product_id, sp.acquisition_cost, sp.minimum_stock, p.name AS product_name,
            p.stock AS product_stock
     FROM suppliers AS s
     LEFT JOIN supplier_products AS sp
       ON sp.id_supplier_product = (
         SELECT MIN(sp2.id_supplier_product)
         FROM supplier_products AS sp2
         WHERE sp2.supplier_id = s.id_supplier
       )
     LEFT JOIN products AS p ON p.id_product = sp.product_id
     ORDER BY s.id_supplier`,
  )
  return rows.map((row) => ({
    id: formatId('suppliers', row.id_supplier),
    name: row.name,
    tipo_de_documento: row.document_type,
    num_documento: row.document_number,
    phone: row.phone,
    telefono: row.phone,
    email: row.email,
    correo: row.email,
    department: row.department,
    departamento: row.department,
    municipality: row.municipality,
    municipio: row.municipality,
    address: row.address,
    direccion: row.address,
    productId: row.product_id ? formatId('products', row.product_id) : '',
    product: row.product_name || '',
    acquisitionCost: Number(row.acquisition_cost || 0),
    minStock: Number(row.minimum_stock || 0),
    stock: Number(row.product_stock || 0),
    status: isActive(row.status),
    estado: Number(row.status),
  }))
}

async function getPurchases() {
  const [rows] = await pool.execute(
    `SELECT pu.id_purchase, pu.supplier_id, pu.purchase_date, pu.total, pu.status,
            s.name AS supplier_name, pd.product_id, pd.quantity, pd.unit_price,
            p.name AS product_name
     FROM purchases AS pu
     INNER JOIN suppliers AS s ON s.id_supplier = pu.supplier_id
     LEFT JOIN purchase_details AS pd
       ON pd.id_purchase_detail = (
         SELECT MIN(pd2.id_purchase_detail)
         FROM purchase_details AS pd2
         WHERE pd2.purchase_id = pu.id_purchase
       )
     LEFT JOIN products AS p ON p.id_product = pd.product_id
     ORDER BY pu.id_purchase DESC`,
  )
  return rows.map((row) => ({
    id: formatId('purchases', row.id_purchase),
    supplierId: formatId('suppliers', row.supplier_id),
    supplier: row.supplier_name,
    productId: row.product_id ? formatId('products', row.product_id) : '',
    product: row.product_name || '',
    quantity: Number(row.quantity || 0),
    total: Number(row.total),
    date: row.purchase_date instanceof Date ? row.purchase_date.toISOString().slice(0, 10) : String(row.purchase_date).slice(0, 10),
    status: row.status,
  }))
}

async function getClients(user) {
  const clientFilter = user.audience === 'client' ? 'WHERE id_client = ?' : ''
  const [rows] = await pool.execute(
    `SELECT id_client, person_type, document_type, document_number, name_or_business_name,
            phone, email, department, municipality, delivery_address, status, created_at
     FROM clients ${clientFilter}
     ORDER BY id_client`,
    user.audience === 'client' ? [user.id] : [],
  )
  return rows.map((row) => ({
    id: formatId('clients', row.id_client),
    name: row.name_or_business_name,
    email: row.email,
    phone: row.phone,
    address: row.delivery_address,
    department: row.department,
    municipality: row.municipality,
    personType: row.person_type,
    documentType: row.document_type,
    documentNumber: row.document_number,
    tipo_persona: row.person_type,
    tipo_documento: row.document_type,
    num_documento: row.document_number,
    nombre_o_razon_social: row.name_or_business_name,
    telefono: row.phone,
    correo: row.email,
    direccion: row.delivery_address,
    status: isActive(row.status),
    estado: Number(row.status),
    createdAt: row.created_at,
  }))
}

async function getOrders(user) {
  const clientFilter = user.audience === 'client' ? 'WHERE o.client_id = ?' : ''
  const [rows] = await pool.execute(
    `SELECT o.id_order, o.client_id, o.order_date, o.status, o.total, o.payment_method,
            c.name_or_business_name AS client_name, c.email AS client_email,
            c.department, c.municipality, d.address, d.scheduled_date
     FROM orders AS o
     INNER JOIN clients AS c ON c.id_client = o.client_id
     LEFT JOIN deliveries AS d ON d.order_id = o.id_order
     ${clientFilter}
     ORDER BY o.id_order DESC`,
    user.audience === 'client' ? [user.id] : [],
  )
  if (!rows.length) return []
  const ids = rows.map((row) => row.id_order)
  const placeholders = ids.map(() => '?').join(',')
  const [detailRows] = await pool.execute(
    `SELECT od.order_id, od.product_id, od.unit_price, od.quantity, p.name AS product_name
     FROM order_details AS od
     INNER JOIN products AS p ON p.id_product = od.product_id
     WHERE od.order_id IN (${placeholders})
     ORDER BY od.id_order_detail`,
    ids,
  )
  const detailsByOrder = new Map()
  detailRows.forEach((detail) => {
    const items = detailsByOrder.get(detail.order_id) || []
    items.push({
      id: formatId('products', detail.product_id),
      name: detail.product_name,
      unitPrice: Number(detail.unit_price),
      quantity: Number(detail.quantity),
    })
    detailsByOrder.set(detail.order_id, items)
  })
  return rows.map((row) => {
    const id = formatId('orders', row.id_order)
    const items = detailsByOrder.get(row.id_order) || []
    const generatedAt = row.order_date instanceof Date
      ? row.order_date.toISOString()
      : new Date(row.order_date).toISOString()
    const address = row.address || ''
    const payment = row.payment_method || 'Por definir'
    const total = Number(row.total)
    return {
      id,
      clientId: formatId('clients', row.client_id),
      client: row.client_name,
      clientEmail: row.client_email,
      items,
      payment,
      total: formatCurrency(total),
      totalValue: total,
      status: row.status,
      date: formatDate(row.order_date),
      createdAt: generatedAt,
      address,
      department: row.department || '',
      municipality: row.municipality || '',
      scheduledDate: row.scheduled_date,
      receipt: {
        number: `COMP-${id}`,
        generatedAt,
        clientName: row.client_name,
        clientEmail: row.client_email,
        paymentMethod: payment,
        paymentStatus: 'Simulado',
        items,
        total,
        address,
        department: row.department || '',
        municipality: row.municipality || '',
      },
    }
  })
}

async function getSales() {
  const [rows] = await pool.execute(
    `SELECT s.id_sale, s.order_id, s.sale_date, s.payment_method, s.total, s.status,
            o.client_id, c.email AS client_email
     FROM sales AS s
     INNER JOIN orders AS o ON o.id_order = s.order_id
     INNER JOIN clients AS c ON c.id_client = o.client_id
     ORDER BY s.id_sale DESC`,
  )
  return rows.map((row) => ({
    id: formatId('sales', row.id_sale),
    order: formatId('orders', row.order_id),
    payment: row.payment_method,
    total: formatCurrency(row.total),
    status: row.status,
    clientId: formatId('clients', row.client_id),
    clientEmail: row.client_email,
    date: formatDate(row.sale_date),
  }))
}

async function getDeliveries(user) {
  const clientFilter = user.audience === 'client' ? 'WHERE o.client_id = ?' : ''
  const [rows] = await pool.execute(
    `SELECT d.id_delivery, d.order_id, d.address, d.scheduled_date, d.status,
            o.client_id, c.email AS client_email
     FROM deliveries AS d
     INNER JOIN orders AS o ON o.id_order = d.order_id
     INNER JOIN clients AS c ON c.id_client = o.client_id
     ${clientFilter}
     ORDER BY d.id_delivery DESC`,
    user.audience === 'client' ? [user.id] : [],
  )
  return rows.map((row) => ({
    id: formatId('deliveries', row.id_delivery),
    order: formatId('orders', row.order_id),
    address: row.address,
    date: row.scheduled_date ? formatDate(row.scheduled_date) : 'Por coordinar',
    status: row.status,
    clientId: formatId('clients', row.client_id),
    clientEmail: row.client_email,
  }))
}

async function getReviews(user) {
  const clientFilter = user.audience === 'client' ? 'WHERE r.client_id = ?' : ''
  const [rows] = await pool.execute(
    `SELECT r.id_review, r.client_id, r.order_id, r.product_id, r.rating, r.comment, r.status,
            r.created_at, c.name_or_business_name AS client_name, c.email AS client_email
     FROM reviews AS r
     INNER JOIN clients AS c ON c.id_client = r.client_id
     ${clientFilter}
     ORDER BY r.id_review DESC`,
    user.audience === 'client' ? [user.id] : [],
  )
  return rows.map((row) => ({
    id: formatId('reviews', row.id_review),
    clientId: formatId('clients', row.client_id),
    client: row.client_name,
    clientEmail: row.client_email,
    orderId: row.order_id ? formatId('orders', row.order_id) : '',
    productId: row.product_id ? formatId('products', row.product_id) : '',
    rating: `${row.rating}/5`,
    ratingValue: Number(row.rating),
    comment: row.comment,
    date: formatDate(row.created_at),
    status: row.status,
  }))
}

async function getCategories() {
  let hasImageCol = false
  try {
    const [cols] = await pool.execute(
      `SELECT COUNT(*) AS count FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_categories' AND COLUMN_NAME = 'image'`
    )
    hasImageCol = cols[0]?.count > 0
  } catch {}

  const [rows] = await pool.execute(
    hasImageCol
      ? `SELECT id_category, name, description, image, status FROM product_categories ORDER BY id_category`
      : `SELECT id_category, name, description, status FROM product_categories ORDER BY id_category`
  )
  return rows.map((row) => ({
    id: formatId('categories', row.id_category),
    id_category: row.id_category,
    name: row.name,
    description: row.description || '',
    image: row.image || '',
    status: isActive(row.status),
    estado: Number(row.status),
  }))
}

const readers = {
  roles: getRoles,
  users: getUsers,
  products: getProducts,
  categories: getCategories,
  suppliers: getSuppliers,
  purchases: getPurchases,
  clients: getClients,
  orders: getOrders,
  sales: getSales,
  deliveries: getDeliveries,
  reviews: getReviews,
}

export async function listModules(user) {
  const rows = Object.fromEntries(Object.keys(readers).map((key) => [key, []]))
  await Promise.all(Object.entries(readers).map(async ([key, reader]) => {
    if (canRead(user, key)) rows[key] = await reader(user)
  }))
  return rows
}

export async function listPublicProducts() {
  const products = await getProducts()
  return products.filter((product) => product.status === 'Activo' && product.in_catalog !== false && product.inCatalog !== false)
}
