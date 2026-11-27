import bcrypt from 'bcryptjs'
import { pool, withTransaction } from '../db.js'
import { formatId, parseId, parsePrice, statusToBoolean } from '../domain.js'
import { createNotification } from './notificationsService.js'
import { sendOrderReceiptEmail, sendOrderStatusEmail } from './mailService.js'


const badRequest = (message) => Object.assign(new Error(message), { status: 400 })
const notFound = (message) => Object.assign(new Error(message), { status: 404 })
const statusNumber = (value) => Number(statusToBoolean(value) ? 1 : 0)

function required(value, label) {
  const clean = String(value ?? '').trim()
  if (!clean) throw badRequest(`${label} es obligatorio.`)
  return clean
}

function numberValue(value, label, { minimum = 0 } = {}) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < minimum) throw badRequest(`${label} debe ser igual o mayor que ${minimum}.`)
  return number
}

function statusValue(value, fallback = 'Activo') {
  return String(value || fallback).trim()
}

function clientInput(data) {
  return {
    personType: data.personType ?? data.person_type ?? data.tipo_persona,
    documentType: data.documentType ?? data.document_type ?? data.tipo_documento,
    documentNumber: data.documentNumber ?? data.document_number ?? data.num_documento,
    name: data.name ?? data.name_or_business_name ?? data.nombre_o_razon_social,
    phone: data.phone ?? data.telefono,
    email: String(data.email ?? data.correo ?? '').trim().toLowerCase(),
    department: data.department ?? data.departamento,
    municipality: data.municipality ?? data.municipio,
    address: data.address ?? data.delivery_address ?? data.direccion,
  }
}

async function roleIdFrom(data, connection) {
  const roleReference = data.roleId || data.role_id || data.role
  if (!roleReference) throw badRequest('Selecciona un rol para el usuario.')
  if (typeof roleReference === 'string' && !/^\d+$/.test(roleReference)) {
    const { rows } = await connection.query('SELECT id_role FROM roles WHERE name = $1 LIMIT 1', [roleReference])
    if (!rows[0]) throw badRequest('El rol seleccionado ya no existe.')
    return Number(rows[0].id_role)
  }
  return parseId('roles', roleReference)
}

async function saveRole(connection, input, id = null) {
  const name = required(input.name, 'El nombre del rol')
  const description = String(input.description || '').trim() || null
  const status = statusNumber(input.status ?? input.estado ?? 1)
  let roleId = id
  if (roleId) {
    const result = await connection.query(
      'UPDATE roles SET name = $1, description = $2, status = $3 WHERE id_role = $4',
      [name, description, status, roleId],
    )
    if (!result.rowCount) throw notFound('El rol no existe.')
  } else {
    const { rows } = await connection.query(
      'INSERT INTO roles (name, description, status) VALUES ($1, $2, $3) RETURNING id_role',
      [name, description, status],
    )
    roleId = rows[0].id_role
  }

  if (Array.isArray(input.permissionCodes)) {
    await connection.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId])
    const permissionCodes = [...new Set(input.permissionCodes.filter((code) => typeof code === 'string'))]
    if (permissionCodes.length) {
      const placeholders = permissionCodes.map((_, index) => `$${index + 1}`).join(',')
      const { rows: allowed } = await connection.query(
        `SELECT pp.permission_id, pp.privilege_id, (p.module_key || ':' || v.action_key) AS code
         FROM permission_privileges AS pp
         INNER JOIN permissions AS p ON p.id_permission = pp.permission_id
         INNER JOIN privileges AS v ON v.id_privilege = pp.privilege_id
         WHERE (p.module_key || ':' || v.action_key) IN (${placeholders})`,
        permissionCodes,
      )
      if (allowed.length !== permissionCodes.length) throw badRequest('El rol contiene permisos no disponibles en la base de datos.')
      for (const permission of allowed) {
        await connection.query(
          `INSERT INTO role_permissions (role_id, permission_id, privilege_id)
           VALUES ($1, $2, $3)`,
          [roleId, permission.permission_id, permission.privilege_id],
        )
      }
    }
  }
  return formatId('roles', roleId)
}

async function saveUser(connection, input, id = null) {
  const roleId = await roleIdFrom(input, connection)
  const identificationType = input.tipo_identificacion ?? input.identification_type
  const identification = required(input.identificacion ?? input.identification, 'La identificación')
  const firstName = required(input.primer_nombre ?? input.first_name, 'El primer nombre')
  const secondName = String(input.segundo_nombre ?? input.second_name ?? '').trim() || null
  const firstSurname = required(input.primer_apellido ?? input.first_surname, 'El primer apellido')
  const secondSurname = String(input.segundo_apellido ?? input.second_surname ?? '').trim() || null
  const email = required(input.correo ?? input.email, 'El correo').toLowerCase()
  const phone = required(input.telefono ?? input.phone, 'El teléfono')
  const status = statusNumber(input.status ?? input.estado ?? 1)
  const password = input.password ?? input.clave
  const fields = [roleId, identificationType || null, identification, firstName, secondName, firstSurname, secondSurname, email, phone, status]

  if (!id && !password) throw badRequest('Asigna una contraseña al nuevo usuario.')
  if (password && String(password).length < 8) throw badRequest('La contraseña debe tener al menos 8 caracteres.')
  const passwordHash = password ? await bcrypt.hash(String(password), 12) : null
  if (id) {
    const params = [...fields.slice(0, 9), status, ...(passwordHash ? [passwordHash] : []), id]
    const whereParamIndex = params.length
    const result = await connection.query(
      `UPDATE users
       SET role_id = $1, identification_type = $2, identification = $3, first_name = $4,
           second_name = $5, first_surname = $6, second_surname = $7, email = $8, phone = $9, status = $10
           ${passwordHash ? ', password_hash = $11' : ''}
       WHERE id_user = $${whereParamIndex}`,
      params,
    )
    if (!result.rowCount) throw notFound('El usuario no existe.')
  } else {
    const { rows } = await connection.query(
      `INSERT INTO users
        (role_id, identification_type, identification, first_name, second_name,
         first_surname, second_surname, email, phone, password_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id_user`,
      [...fields.slice(0, 9), passwordHash, status],
    )
    id = rows[0].id_user
  }
  return formatId('users', id)
}

async function ensureCategory(connection, category) {
  const name = required(category, 'La categoría')
  const { rows } = await connection.query(
    'SELECT id_category FROM product_categories WHERE name = $1 LIMIT 1',
    [name],
  )
  if (rows[0]) return Number(rows[0].id_category)
  const { rows: inserted } = await connection.query(
    'INSERT INTO product_categories (name) VALUES ($1) RETURNING id_category',
    [name],
  )
  return inserted[0].id_category
}
async function saveCategory(connection, input, id = null) {
  const name = required(input.name, 'El nombre de la categoría')
  const description = String(input.description ?? input.descripcion ?? '').trim() || null
  const image = String(input.image ?? input.image_url ?? input.imageUrl ?? input.imagen ?? input.url_imagen ?? '').trim() || null
  const status = statusNumber(input.status ?? input.estado ?? 1)


  let hasImageCol = false
  try {
    const { rows: cols } = await connection.query(
      `SELECT COUNT(*)::int AS count FROM information_schema.columns 
       WHERE table_schema = current_schema() AND table_name = 'product_categories' AND column_name = 'image'`,
    )
    hasImageCol = (cols[0]?.count || 0) > 0
  } catch {}

  let categoryId = id
  if (categoryId) {
    if (hasImageCol) {
      const result = await connection.query(
        'UPDATE product_categories SET name = $1, description = $2, image = $3, status = $4 WHERE id_category = $5',
        [name, description, image, status, categoryId],
      )
      if (!result.rowCount) throw notFound('La categoría no existe.')
    } else {
      const result = await connection.query(
        'UPDATE product_categories SET name = $1, description = $2, status = $3 WHERE id_category = $4',
        [name, description, status, categoryId],
      )
      if (!result.rowCount) throw notFound('La categoría no existe.')
    }
  } else {
    if (hasImageCol) {
      const { rows } = await connection.query(
        'INSERT INTO product_categories (name, description, image, status) VALUES ($1, $2, $3, $4) RETURNING id_category',
        [name, description, image, status],
      )
      categoryId = rows[0].id_category
    } else {
      const { rows } = await connection.query(
        'INSERT INTO product_categories (name, description, status) VALUES ($1, $2, $3) RETURNING id_category',
        [name, description, status],
      )
      categoryId = rows[0].id_category
    }
  }
  return formatId('categories', categoryId)
}

async function saveProduct(connection, input, id = null) {
  const name = required(input.name, 'El nombre del producto')
  const description = required(input.description ?? input.descripcion ?? name, 'La descripción')
  const categoryId = await ensureCategory(connection, input.category)
  const price = numberValue(input.priceValue ?? input.price ?? input.base_price, 'El precio', { minimum: 0.01 })
  const stock = numberValue(input.stock, 'El stock')
  const status = statusNumber(input.status ?? 1)
  const inCatalog = (input.in_catalog !== undefined ? (input.in_catalog ? 1 : 0) : (input.inCatalog !== undefined ? (input.inCatalog ? 1 : 0) : 1))

  let hasInCatalog = false
  try {
    const { rows: cols } = await connection.query(
      `SELECT COUNT(*)::int AS count FROM information_schema.columns 
       WHERE table_schema = current_schema() AND table_name = 'products' AND column_name = 'in_catalog'`,
    )
    hasInCatalog = (cols[0]?.count || 0) > 0
  } catch {}

  if (id) {
    if (hasInCatalog) {
      const result = await connection.query(
        `UPDATE products
         SET category_id = $1, name = $2, description = $3, base_price = $4, stock = $5, status = $6, in_catalog = $7
         WHERE id_product = $8`,
        [categoryId, name, description, price, stock, status, inCatalog, id],
      )
      if (!result.rowCount) throw notFound('El producto no existe.')
    } else {
      const result = await connection.query(
        `UPDATE products
         SET category_id = $1, name = $2, description = $3, base_price = $4, stock = $5, status = $6
         WHERE id_product = $7`,
        [categoryId, name, description, price, stock, status, id],
      )
      if (!result.rowCount) throw notFound('El producto no existe.')
    }
  } else {
    if (hasInCatalog) {
      const { rows } = await connection.query(
        `INSERT INTO products (category_id, name, description, base_price, stock, status, in_catalog)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id_product`,
        [categoryId, name, description, price, stock, status, inCatalog],
      )
      id = rows[0].id_product
    } else {
      const { rows } = await connection.query(
        `INSERT INTO products (category_id, name, description, base_price, stock, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id_product`,
        [categoryId, name, description, price, stock, status],
      )
      id = rows[0].id_product
    }
  }

  const imageUrl = input.image || input.image_url || input.imageUrl || null
  if (imageUrl && String(imageUrl).trim()) {
    const cleanUrl = String(imageUrl).trim()
    const { rows: existing } = await connection.query(
      'SELECT id_image FROM product_images WHERE product_id = $1 AND is_primary = 1 LIMIT 1',
      [id],
    )
    if (existing[0]) {
      await connection.query(
        'UPDATE product_images SET image_url = $1 WHERE id_image = $2',
        [cleanUrl, existing[0].id_image],
      )
    } else {
      await connection.query(
        'INSERT INTO product_images (product_id, image_url, is_primary) VALUES ($1, $2, 1)',
        [id, cleanUrl],
      )
    }
  }

  const rawImage = input.image ?? input.image_url ?? input.imageUrl ?? input.imagen ?? input.url_imagen
if (rawImage !== undefined) {
  const cleanUrl = String(rawImage || '').trim()
  const { rows: existing } = await connection.query(
    'SELECT id_image FROM product_images WHERE product_id = $1 AND is_primary = 1 LIMIT 1',
    [id],
  )
  if (cleanUrl) {
    if (existing[0]) {
      await connection.query(
        'UPDATE product_images SET image_url = $1 WHERE id_image = $2',
        [cleanUrl, existing[0].id_image],
      )
    } else {
      await connection.query(
        'INSERT INTO product_images (product_id, image_url, is_primary) VALUES ($1, $2, 1)',
        [id, cleanUrl],
      )
    }
  } else if (existing[0]) {
    await connection.query('DELETE FROM product_images WHERE id_image = $1', [existing[0].id_image])
  }
}


  return formatId('products', id)
}
async function saveSupplier(connection, input, id = null) {
  const name = required(input.name, 'El nombre del proveedor')
  const documentType = required(input.tipo_de_documento ?? input.document_type, 'El tipo de documento')
  const documentNumber = required(input.num_documento ?? input.document_number, 'El número de documento')
  const phone = required(input.telefono ?? input.phone, 'El teléfono')
  const email = required(input.correo ?? input.email, 'El correo').toLowerCase()
  const department = required(input.departamento ?? input.department, 'El departamento')
  const municipality = required(input.municipio ?? input.municipality, 'El municipio')
  const address = required(input.direccion ?? input.address, 'La dirección')
  const status = statusNumber(input.status ?? input.estado ?? 1)
  const values = [documentType, documentNumber, name, phone, email, department, municipality, address, status]
  if (id) {
    const result = await connection.query(
      `UPDATE suppliers SET document_type = $1, document_number = $2, name = $3, phone = $4,
       email = $5, department = $6, municipality = $7, address = $8, status = $9
       WHERE id_supplier = $10`,
      [...values, id],
    )
    if (!result.rowCount) throw notFound('El proveedor no existe.')
  } else {
    const { rows } = await connection.query(
      `INSERT INTO suppliers
        (document_type, document_number, name, phone, email, department, municipality, address, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id_supplier`,
      values,
    )
    id = rows[0].id_supplier
  }

  await connection.query('DELETE FROM supplier_products WHERE supplier_id = $1', [id])
  if (input.productId) {
    const productId = parseId('products', input.productId)
    await connection.query(
      `INSERT INTO supplier_products (supplier_id, product_id, acquisition_cost, minimum_stock)
       VALUES ($1, $2, $3, $4)`,
      [
        id,
        productId,
        numberValue(input.acquisitionCost, 'El costo de adquisición', { minimum: 0.01 }),
        numberValue(input.minStock, 'La existencia mínima'),
      ],
    )
  }
  return formatId('suppliers', id)
}

async function applyStockChanges(connection, changes) {
  for (const [productId, delta] of changes) {
    if (!delta) continue
    const { rows } = await connection.query(
      'SELECT stock, name FROM products WHERE id_product = $1 FOR UPDATE',
      [productId],
    )
    const product = rows[0]
    if (!product) throw badRequest('Un producto relacionado con la operación ya no existe.')
    const nextStock = Number(product.stock) + delta
    if (nextStock < 0) throw badRequest(`No hay stock suficiente de "${product.name}" para completar la operación.`)
    await connection.query('UPDATE products SET stock = $1 WHERE id_product = $2', [nextStock, productId])
    const { rows: minimumRows } = await connection.query(
      `SELECT s.id_supplier, s.name, sp.minimum_stock
       FROM supplier_products AS sp
       INNER JOIN suppliers AS s ON s.id_supplier = sp.supplier_id
       WHERE sp.product_id = $1 AND s.status = 1`,
      [productId],
    )
    for (const supplier of minimumRows) {
      if (nextStock <= Number(supplier.minimum_stock)) {
        const label = nextStock === Number(supplier.minimum_stock) ? 'alcanzó' : 'está por debajo de'
        await createNotification({
          recipient: 'admin',
          category: 'low-stock',
          message: `${product.name} ${label} su stock mínimo: ${nextStock} unidades (mínimo ${supplier.minimum_stock}).`,
          relatedId: formatId('products', productId),
        }, connection)
      }
    }
  }
}

async function findPurchase(connection, id) {
  const { rows } = await connection.query(
    `SELECT pu.id_purchase, pu.supplier_id, pu.purchase_date, pu.total, pu.status,
            pd.product_id, pd.quantity, pd.unit_price
     FROM purchases AS pu
     LEFT JOIN purchase_details AS pd ON pd.purchase_id = pu.id_purchase
     WHERE pu.id_purchase = $1
     ORDER BY pd.id_purchase_detail
     LIMIT 1`,
    [id],
  )
  return rows[0]
}

async function savePurchase(connection, input, id = null) {
  const supplierId = parseId('suppliers', input.supplierId)
  const productId = parseId('products', input.productId)
  const { rows: supplierProducts } = await connection.query(
    'SELECT id_supplier_product FROM supplier_products WHERE supplier_id = $1 AND product_id = $2 LIMIT 1',
    [supplierId, productId],
  )
  if (!supplierProducts.length) throw badRequest('El proveedor seleccionado no suministra este producto.')
  const quantity = numberValue(input.quantity, 'La cantidad', { minimum: 1 })
  const total = numberValue(input.total, 'El valor total', { minimum: 0.01 })
  const status = statusValue(input.status, 'Pendiente')
  if (!['Pendiente', 'Recibida', 'Cancelada'].includes(status)) throw badRequest('El estado de la compra no es válido.')
  const date = input.date ? new Date(`${input.date}T12:00:00`) : new Date()
  if (Number.isNaN(date.getTime())) throw badRequest('La fecha de compra no es válida.')

  const previous = id ? await findPurchase(connection, id) : null
  if (id && !previous) throw notFound('La compra no existe.')
  const stockChanges = new Map()
  if (previous?.status === 'Recibida' && previous.product_id) {
    stockChanges.set(Number(previous.product_id), (stockChanges.get(Number(previous.product_id)) || 0) - Number(previous.quantity))
  }
  if (status === 'Recibida') stockChanges.set(productId, (stockChanges.get(productId) || 0) + quantity)
  await applyStockChanges(connection, stockChanges)

  if (id) {
    await connection.query(
      'UPDATE purchases SET supplier_id = $1, purchase_date = $2, total = $3, status = $4 WHERE id_purchase = $5',
      [supplierId, date, total, status, id],
    )
    await connection.query('DELETE FROM purchase_details WHERE purchase_id = $1', [id])
  } else {
    const { rows } = await connection.query(
      'INSERT INTO purchases (supplier_id, purchase_date, total, status) VALUES ($1, $2, $3, $4) RETURNING id_purchase',
      [supplierId, date, total, status],
    )
    id = rows[0].id_purchase
  }
  await connection.query(
    `INSERT INTO purchase_details (purchase_id, product_id, quantity, unit_price)
     VALUES ($1, $2, $3, $4)`,
    [id, productId, quantity, total / quantity],
  )
  if (previous && previous.status !== status) {
    await createNotification({
      recipient: 'admin',
      category: 'purchase-status',
      message: `La compra ${formatId('purchases', id)} cambió de estado de "${previous.status}" a "${status}".`,
      relatedId: formatId('purchases', id),
    }, connection)
  }
  return formatId('purchases', id)
}
async function saveClient(connection, input, id = null) {
  const client = clientInput(input)
  const personType = required(client.personType, 'El tipo de persona')
  const documentType = required(client.documentType, 'El tipo de documento')
  const documentNumber = required(client.documentNumber, 'El número de documento')
  const name = required(client.name, 'El nombre del cliente')
  const phone = required(client.phone, 'El teléfono')
  const email = required(client.email, 'El correo').toLowerCase()
  const department = required(client.department, 'El departamento')
  const municipality = required(client.municipality, 'El municipio')
  const address = required(client.address, 'La dirección')
  const status = statusNumber(input.status ?? input.estado ?? 1)
  const password = input.password ?? input.clave
  if (password && String(password).length < 8) throw badRequest('La contraseña debe tener al menos 8 caracteres.')
  const passwordHash = password ? await bcrypt.hash(String(password), 12) : null
  const values = [personType, documentType, documentNumber, name, phone, email, department, municipality, address]
  if (id) {
    const params = [...values, status, ...(passwordHash ? [passwordHash] : []), id]
    const whereParamIndex = params.length
    const result = await connection.query(
      `UPDATE clients SET person_type = $1, document_type = $2, document_number = $3,
       name_or_business_name = $4, phone = $5, email = $6, department = $7, municipality = $8,
       delivery_address = $9, status = $10${passwordHash ? ', password_hash = $11' : ''}
       WHERE id_client = $${whereParamIndex}`,
      params,
    )
    if (!result.rowCount) throw notFound('El cliente no existe.')
  } else {
    const { rows } = await connection.query(
      `INSERT INTO clients
        (person_type, document_type, document_number, name_or_business_name, phone,
         email, department, municipality, delivery_address, password_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id_client`,
      [...values, passwordHash, status],
    )
    id = rows[0].id_client
  }
  return formatId('clients', id)
}

async function saveOrder(connection, input, id = null) {
  const clientId = input.clientId
    ? parseId('clients', input.clientId)
    : null
  let resolvedClientId = clientId
  if (!resolvedClientId && input.client) {
    const { rows: clientRows } = await connection.query(
      `SELECT id_client FROM clients
       WHERE email = $1 OR name_or_business_name = $2
       LIMIT 1`,
      [String(input.clientEmail || ''), String(input.client)],
    )
    resolvedClientId = clientRows[0]?.id_client
  }
  if (!resolvedClientId) throw badRequest('Selecciona un cliente existente para el pedido.')
  const total = parsePrice(input.totalValue ?? input.total)
  const payment = String(input.payment ?? input.payment_method ?? '').trim() || null
  const status = statusValue(input.status, 'Pedido pendiente')
  const date = input.createdAt ? new Date(input.createdAt) : input.date ? new Date(input.date) : new Date()
  if (Number.isNaN(date.getTime())) throw badRequest('La fecha del pedido no es válida.')
  if (id) {
    const result = await connection.query(
      `UPDATE orders SET client_id = $1, order_date = $2, status = $3, total = $4,
       payment_method = $5 WHERE id_order = $6`,
      [resolvedClientId, date, status, total, payment, id],
    )
    if (!result.rowCount) throw notFound('El pedido no existe.')
    return formatId('orders', id)
  }
  const { rows } = await connection.query(
    `INSERT INTO orders (client_id, order_date, status, total, payment_method)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id_order`,
    [resolvedClientId, date, status, total, payment],
  )
  id = rows[0].id_order
  return formatId('orders', id)
}

async function saveSale(connection, input, id = null) {
  const orderId = parseId('orders', input.orderId ?? input.order)
  const { rows: orderRows } = await connection.query(
    'SELECT total, payment_method FROM orders WHERE id_order = $1 LIMIT 1',
    [orderId],
  )
  if (!orderRows[0]) throw badRequest('Selecciona un pedido existente.')
  const payment = String(input.payment ?? input.payment_method ?? orderRows[0].payment_method ?? 'Por definir')
  const total = input.total === undefined ? Number(orderRows[0].total) : parsePrice(input.total)
  const status = String(input.status || 'Pagada y entregada')
  if (id) {
    const result = await connection.query(
      `UPDATE sales SET order_id = $1, payment_method = $2, total = $3, status = $4
       WHERE id_sale = $5`,
      [orderId, payment, total, status, id],
    )
    if (!result.rowCount) throw notFound('La venta no existe.')
  } else {
    const { rows } = await connection.query(
      `INSERT INTO sales (order_id, payment_method, total, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id_sale`,
      [orderId, payment, total, status],
    )
    id = rows[0].id_sale
  }
  return formatId('sales', id)
}

async function saveDelivery(connection, input, id = null) {
  const orderId = parseId('orders', input.orderId ?? input.order)
  const address = required(input.address, 'La dirección de entrega')
  const status = statusValue(input.status, 'Pendiente')
  const scheduledDate = input.scheduledDate || input.date
    ? new Date(input.scheduledDate || input.date)
    : null
  if (scheduledDate && Number.isNaN(scheduledDate.getTime())) throw badRequest('La fecha de entrega no es válida.')
  const { rows: orderRows } = await connection.query('SELECT id_order FROM orders WHERE id_order = $1', [orderId])
  if (!orderRows.length) throw badRequest('El pedido seleccionado no existe.')
  if (id) {
    const result = await connection.query(
      `UPDATE deliveries SET order_id = $1, address = $2, scheduled_date = $3, status = $4
       WHERE id_delivery = $5`,
      [orderId, address, scheduledDate, status, id],
    )
    if (!result.rowCount) throw notFound('La entrega no existe.')
  } else {
    const { rows } = await connection.query(
      `INSERT INTO deliveries (order_id, address, scheduled_date, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id_delivery`,
      [orderId, address, scheduledDate, status],
    )
    id = rows[0].id_delivery
  }
  return formatId('deliveries', id)
}
async function saveReview(connection, input, user, id = null) {
  let clientId = user.audience === 'client'
    ? user.id
    : input.clientId
      ? parseId('clients', input.clientId)
      : null
  if (!clientId && input.client) {
    const { rows: clientRows } = await connection.query(
      'SELECT id_client FROM clients WHERE name_or_business_name = $1 LIMIT 1',
      [String(input.client).trim()],
    )
    clientId = clientRows[0]?.id_client || null
  }
  if (!clientId) throw badRequest('Selecciona el cliente de la reseña.')
  const rating = Number(input.ratingValue ?? String(input.rating || '').split('/')[0])
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw badRequest('La calificación debe estar entre 1 y 5.')
  const comment = required(input.comment, 'El comentario')
  const orderId = input.orderId ? parseId('orders', input.orderId) : null
  const productId = input.productId ? parseId('products', input.productId) : null
  if (user.audience === 'client' && !orderId) {
    throw badRequest('La reseña debe estar asociada a un pedido entregado.')
  }
  const status = statusValue(input.status, user.audience === 'client' ? 'Publicada' : 'Pendiente')
  if (orderId) {
    const { rows: orders } = await connection.query(
      'SELECT client_id, status FROM orders WHERE id_order = $1 LIMIT 1',
      [orderId],
    )
    if (!orders[0] || Number(orders[0].client_id) !== Number(clientId)) {
      throw badRequest('La reseña debe corresponder a un pedido del cliente.')
    }
    if (user.audience === 'client' && orders[0].status !== 'Entregado') {
      throw badRequest('Solo puedes reseñar un pedido que ya fue entregado.')
    }
    if (user.audience === 'client') {
      const { rows: existingReviews } = await connection.query(
        'SELECT id_review FROM reviews WHERE order_id = $1 AND client_id = $2 LIMIT 1',
        [orderId, clientId],
      )
      if (existingReviews.length) throw badRequest('Ya enviaste una reseña para este pedido.')
    }
  }
  if (id) {
    const result = await connection.query(
      `UPDATE reviews SET client_id = $1, order_id = $2, product_id = $3, rating = $4, comment = $5, status = $6
       WHERE id_review = $7`,
      [clientId, orderId, productId, rating, comment, status, id],
    )
    if (!result.rowCount) throw notFound('La reseña no existe.')
  } else {
    const { rows } = await connection.query(
      `INSERT INTO reviews (client_id, order_id, product_id, rating, comment, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id_review`,
      [clientId, orderId, productId, rating, comment, status],
    )
    id = rows[0].id_review
  }
  if (user.audience === 'client') {
    const { rows: clients } = await connection.query(
      'SELECT name_or_business_name FROM clients WHERE id_client = $1 LIMIT 1',
      [clientId],
    )
    await createNotification({
      recipient: 'admin',
      category: 'client-review',
      message: `Nueva reseña de ${clients[0]?.name_or_business_name || 'un cliente'} para el pedido ${formatId('orders', orderId)}.`,
      relatedId: formatId('reviews', id),
    }, connection)
  }
  return formatId('reviews', id)
}

const saveFunctions = {
  roles: saveRole,
  users: saveUser,
  products: saveProduct,
  categories: saveCategory,
  suppliers: saveSupplier,
  purchases: savePurchase,
  clients: saveClient,
  orders: saveOrder,
  sales: saveSale,
  deliveries: saveDelivery,
  reviews: saveReview,
}

export async function saveModuleRecord(moduleKey, input, user, displayId = null) {
  const save = saveFunctions[moduleKey]
  if (!save) throw notFound('Módulo no disponible.')
  const id = displayId ? parseId(moduleKey, displayId) : null
  return withTransaction((connection) => save(connection, input, ...(moduleKey === 'reviews' ? [user, id] : [id])))
}

async function deleteModuleRecord(connection, moduleKey, id) {
  if (moduleKey === 'purchases') {
    const previous = await findPurchase(connection, id)
    if (!previous) throw notFound('La compra no existe.')
    if (previous.status === 'Recibida' && previous.product_id) {
      await applyStockChanges(connection, new Map([[Number(previous.product_id), -Number(previous.quantity)]]))
    }
    await connection.query('DELETE FROM purchases WHERE id_purchase = $1', [id])
    return
  }
  const deleteTables = {
    roles: ['roles', 'id_role'],
    users: ['users', 'id_user'],
    products: ['products', 'id_product'],
    categories: ['product_categories', 'id_category'],
    suppliers: ['suppliers', 'id_supplier'],
    clients: ['clients', 'id_client'],
    orders: ['orders', 'id_order'],
    sales: ['sales', 'id_sale'],
    deliveries: ['deliveries', 'id_delivery'],
    reviews: ['reviews', 'id_review'],
  }
  const target = deleteTables[moduleKey]
  if (!target) throw notFound('Módulo no disponible.')
  const result = await connection.query(`DELETE FROM "${target[0]}" WHERE "${target[1]}" = $1`, [id])
  if (!result.rowCount) throw notFound('El registro no existe.')

    
}
export async function removeModuleRecord(moduleKey, displayId) {
  const id = parseId(moduleKey, displayId)
  return withTransaction((connection) => deleteModuleRecord(connection, moduleKey, id))
}

export async function setModuleStatus(moduleKey, displayId, status) {
  const id = parseId(moduleKey, displayId)
  const active = statusNumber(status)
  const tableAndId = {
    roles: ['roles', 'id_role'],
    users: ['users', 'id_user'],
    products: ['products', 'id_product'],
    categories: ['product_categories', 'id_category'],
    suppliers: ['suppliers', 'id_supplier'],
    clients: ['clients', 'id_client'],
  }[moduleKey]
  if (!tableAndId) throw badRequest('Este módulo no tiene estado activo/inactivo.')
  const result = await pool.query(
    `UPDATE "${tableAndId[0]}" SET status = $1 WHERE "${tableAndId[1]}" = $2`,
    [active, id],
  )
  if (!result.rowCount) throw notFound('El registro no existe.')
  if (moduleKey === 'roles' || moduleKey === 'users') {
    const query = moduleKey === 'roles'
      ? 'SELECT name FROM roles WHERE id_role = $1'
      : `SELECT CONCAT_WS(' ', first_name, second_name, first_surname, second_surname) AS name
         FROM users WHERE id_user = $1`
    const { rows } = await pool.query(query, [id])
    await createNotification({
      recipient: 'admin',
      category: moduleKey === 'roles' ? 'role-status' : 'user-status',
      message: `${moduleKey === 'roles' ? 'El rol' : 'El usuario'} ${rows[0]?.name || formatId(moduleKey, id)} fue ${active ? 'activado' : 'inactivado'}.`,
      relatedId: formatId(moduleKey, id),
    })
  }
}

export async function setCatalogStatus(displayId, inCatalog) {
  const id = parseId('products', displayId)
  const val = inCatalog ? 1 : 0
  await withTransaction(async (connection) => {
    await connection.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS in_catalog SMALLINT NOT NULL DEFAULT 1')
    await connection.query('UPDATE products SET in_catalog = $1 WHERE id_product = $2', [val, id])
  })
}

export async function changeOrderStatus(displayId, status, user) {
  const orderId = parseId('orders', displayId)
  const validStatuses = ['Pedido pendiente', 'Aprobado', 'En producción', 'En reparto', 'Entregado', 'Rechazado']
  if (!validStatuses.includes(status)) throw badRequest('El estado del pedido no es válido.')
  return withTransaction(async (connection) => {
     const { rows: orderRows } = await connection.query(
   `SELECT o.id_order, o.client_id, o.total, o.payment_method, o.status,
           c.name_or_business_name AS client_name, c.email AS client_email, c.delivery_address
    FROM orders AS o
    INNER JOIN clients AS c ON c.id_client = o.client_id
    WHERE o.id_order = $1
    FOR UPDATE`,
   [orderId],
 )
 const order = orderRows[0]
 if (!order) throw notFound('El pedido no existe.')


      const { rows: existingSales } = await connection.query('SELECT id_sale FROM sales WHERE order_id = $1 LIMIT 1', [orderId])
    if (status === 'Entregado' && !existingSales.length) {
      const { rows: details } = await connection.query(
        'SELECT product_id, quantity FROM order_details WHERE order_id = $1',
        [orderId],
      )
      const changes = new Map()
      details.forEach((detail) => {
        changes.set(Number(detail.product_id), (changes.get(Number(detail.product_id)) || 0) - Number(detail.quantity))
      })
      await applyStockChanges(connection, changes)
      await connection.query(
        `INSERT INTO sales (order_id, payment_method, total, status)
         VALUES ($1, $2, $3, 'Pagada y entregada')`,
        [orderId, order.payment_method || 'Por definir', Number(order.total) || 0],
      )
    }


    await connection.query('UPDATE orders SET status = $1 WHERE id_order = $2', [status, orderId])
    const deliveryStatuses = {
      'Pedido pendiente': 'Pendiente',
      Aprobado: 'Aprobada',
      'En producción': 'Preparando',
      'En reparto': 'En reparto',
      Entregado: 'Entregado',
      Rechazado: 'Rechazado',
    }
     const { rows: deliveryRows } = await connection.query('SELECT id_delivery FROM deliveries WHERE order_id = $1 LIMIT 1', [orderId])
 const delivery = deliveryRows[0]
 if (delivery) {
   await connection.query(
     `UPDATE deliveries SET status = $1, approved_by_user_id = $2
      WHERE id_delivery = $3`,
     [deliveryStatuses[status], status === 'Aprobado' && user.audience !== 'client' ? user.id : null, delivery.id_delivery],
   )
 }
 else {
      await connection.query(
        'INSERT INTO deliveries (order_id, address, status, approved_by_user_id) VALUES ($1, $2, $3, $4)',
        [
          orderId,
          order.delivery_address || 'Por confirmar',
          deliveryStatuses[status],
          status === 'Aprobado' && user.audience !== 'client' ? user.id : null,
        ],
      )
    }

    await createNotification({
      recipient: 'admin',
      category: status === 'Entregado' ? 'sale-completed' : status === 'Aprobado' ? 'order-approved' : 'order-status',
      message: status === 'Entregado'
        ? `La venta del pedido ${formatId('orders', orderId)} se completó por ${formatCurrency(order.total)}.`
        : `El pedido ${formatId('orders', orderId)} cambió al estado "${status}".`,
      relatedId: formatId('orders', orderId),
    }, connection)
    await createNotification({
      recipient: 'client',
      clientId: order.client_id,
      category: 'order-status',
      message: `El estado de tu pedido ${formatId('orders', orderId)} cambió a "${status}".`,
      relatedId: formatId('orders', orderId),
    }, connection)
    
        const orderCode = formatId('orders', orderId)
    sendOrderStatusEmail(order.client_email, order.client_name, orderCode, status).catch((err) => {
      console.error('No se pudo enviar el correo de cambio de estado:', err.message)
    })

    return orderCode

  })
}
export async function createClientOrder(input, user) {
  const items = Array.isArray(input.items) ? input.items : []
  if (!items.length) throw badRequest('Agrega al menos un producto antes de confirmar el pedido.')
  const address = required(input.address, 'La dirección de entrega')
  const paymentMethod = required(input.paymentMethod, 'El método de pago')
  const department = required(input.department, 'El departamento')
  const municipality = required(input.municipality, 'El municipio')

  return withTransaction(async (connection) => {
    const productIds = items.map((item) => parseId('products', item.id))
    const quantities = new Map()
    productIds.forEach((productId, index) => {
      const quantity = numberValue(items[index].quantity, 'La cantidad', { minimum: 1 })
      quantities.set(productId, (quantities.get(productId) || 0) + quantity)
    })
    const placeholders = productIds.map((_, index) => `$${index + 1}`).join(',')
    const { rows: products } = await connection.query(
      `SELECT p.id_product, p.name, p.base_price, p.stock, p.status
       FROM products AS p WHERE p.id_product IN (${placeholders}) FOR UPDATE`,
      productIds,
    )
    const productsById = new Map(products.map((product) => [Number(product.id_product), product]))
    let total = 0
    const orderItems = []
    for (const [productId, quantity] of quantities) {
      const product = productsById.get(productId)
      if (!product || Number(product.status) !== 1) throw badRequest('Uno de los productos ya no está disponible.')
      if (Number(product.stock) < quantity) throw badRequest(`Stock insuficiente para "${product.name}".`)
      const unitPrice = Number(product.base_price)
      total += unitPrice * quantity
      orderItems.push({ productId, name: product.name, quantity, unitPrice })
    }

    const { rows: orderRows } = await connection.query(
      `INSERT INTO orders (client_id, status, total, payment_method)
       VALUES ($1, 'Pedido pendiente', $2, $3)
       RETURNING id_order`,
      [user.id, total, paymentMethod],
    )
    const orderId = orderRows[0].id_order
    for (const item of orderItems) {
      await connection.query(
        `INSERT INTO order_details (order_id, product_id, unit_price, quantity)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.productId, item.unitPrice, item.quantity],
      )
    }
    await connection.query(
      `INSERT INTO deliveries (order_id, address, status)
       VALUES ($1, $2, 'Pendiente')`,
      [orderId, address],
    )
    await connection.query(
      `UPDATE clients SET department = $1, municipality = $2, delivery_address = $3
       WHERE id_client = $4`,
      [department, municipality, address, user.id],
    )
    const orderCode = formatId('orders', orderId)
    const receipt = {
      number: `COMP-${orderCode}`,
      generatedAt: new Date().toISOString(),
      clientName: user.name,
      clientEmail: user.email,
      paymentMethod,
      paymentStatus: 'Registrado',
      items: orderItems.map((item) => ({
        id: formatId('products', item.productId),
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      total,
      address,
      department,
      municipality,
    }
    await createNotification({
      recipient: 'client',
      clientId: user.id,
      category: 'new-order',
      message: 'Acabas de registrar un nuevo pedido en Lacombalpalo.',
      relatedId: orderCode,
    }, connection)
    await createNotification({
      recipient: 'client',
      clientId: user.id,
      category: 'receipt',
      message: `El comprobante ${receipt.number} está listo y ha sido enviado a tu correo electrónico (${user.email}).`,
      relatedId: orderCode,
    }, connection)
    await createNotification({
      recipient: 'admin',
      category: 'new-order',
      message: `Nuevo pedido ${orderCode} registrado por ${user.name}.`,
      relatedId: orderCode,
    }, connection)
        sendOrderReceiptEmail(user.email, receipt).catch((err) => {
      console.error('No se pudo enviar el comprobante por correo:', err.message)
    })

    return {
      id: orderCode,
      clientId: formatId('clients', user.id),
      client: user.name,
      clientEmail: user.email,
      items: receipt.items,
      payment: paymentMethod,
      paymentStatus: 'Confirmación simulada',
      total: formatCurrency(total),
      totalValue: total,
      status: 'Pedido pendiente',
      createdAt: receipt.generatedAt,
      address,
      department,
      municipality,
      receipt,
    }
  })
}

export async function updateClientProfile(displayId, input, user) {
  const id = parseId('clients', displayId)
  if (user.audience === 'client' && id !== user.id) {
    throw Object.assign(new Error('No puedes modificar la información de otro cliente.'), { status: 403 })
  }
  return withTransaction(async (connection) => {
    const clientId = await saveClient(connection, input, id)
    if (user.audience === 'client') {
      const client = clientInput(input)
      await createNotification({
        recipient: 'admin',
        category: 'client-profile',
        message: `El cliente ${required(client.name, 'El nombre del cliente')} actualizó sus datos de perfil.`,
        relatedId: clientId,
      }, connection)
    }
    return clientId
  })
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}
