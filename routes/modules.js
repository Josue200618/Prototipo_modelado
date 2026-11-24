import { Router } from 'express'
import { requireAuth, requireAudience, requirePermission } from '../middleware/auth.js'
import { listModules, listPublicProducts } from '../services/modulesService.js'
import { saveModuleRecord, removeModuleRecord, setModuleStatus, setCatalogStatus, changeOrderStatus, createClientOrder, updateClientProfile } from '../services/moduleWrites.js'
import { modulePrefixes } from '../domain.js'

const router = Router()
router.use(requireAuth)

function modulePermission(action) {
  return (request, response, next) => {
    const { moduleKey } = request.params
    if (!modulePrefixes[moduleKey]) return response.status(404).json({ error: 'Módulo no disponible.' })
    return requirePermission(moduleKey, action)(request, response, next)
  }
}

router.get('/', async (request, response, next) => {
  try {
    response.json(await listModules(request.user))
  } catch (error) {
    next(error)
  }
})

router.post('/orders', requireAudience('client'), async (request, response, next) => {
  try {
    response.status(201).json(await createClientOrder(request.body || {}, request.user))
  } catch (error) {
    next(error)
  }
})

router.post('/reviews', requireAudience('client'), async (request, response, next) => {
  try {
    const id = await saveModuleRecord('reviews', request.body || {}, request.user)
    response.status(201).json({ id })
  } catch (error) {
    next(error)
  }
})

router.put('/clients/:id', requireAudience('admin', 'employee', 'client'), async (request, response, next) => {
  if (request.user.audience !== 'client' && !request.user.permissionCodes.includes('*') && !request.user.permissionCodes.includes('clients:update')) {
    return response.status(403).json({ error: 'Tu rol no tiene permiso para modificar clientes.' })
  }
  try {
    const id = await updateClientProfile(request.params.id, request.body || {}, request.user)
    response.json({ id })
  } catch (error) {
    next(error)
  }
})

router.patch('/orders/:id/status', requireAudience('admin', 'employee'), async (request, response, next) => {
  const status = String(request.body?.status || '')
  const action = status === 'Aprobado' ? 'approve' : 'update'
  if (!request.user.permissionCodes.includes('*') && !request.user.permissionCodes.includes(`orders:${action}`)) {
    return response.status(403).json({ error: 'Tu rol no tiene permiso para cambiar el estado del pedido.' })
  }
  try {
    const id = await changeOrderStatus(request.params.id, status, request.user)
    response.json({ id })
  } catch (error) {
    next(error)
  }
})

router.post('/:moduleKey', requireAudience('admin', 'employee'), modulePermission('create'), async (request, response, next) => {
  try {
    const id = await saveModuleRecord(request.params.moduleKey, request.body || {}, request.user)
    response.status(201).json({ id })
  } catch (error) {
    next(error)
  }
})

router.put('/:moduleKey/:id', requireAudience('admin', 'employee'), modulePermission('update'), async (request, response, next) => {
  try {
    const id = await saveModuleRecord(request.params.moduleKey, request.body || {}, request.user, request.params.id)
    response.json({ id })
  } catch (error) {
    next(error)
  }
})

router.delete('/:moduleKey/:id', requireAudience('admin', 'employee'), modulePermission('delete'), async (request, response, next) => {
  try {
    await removeModuleRecord(request.params.moduleKey, request.params.id)
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

router.patch('/products/:id/catalog', requireAudience('admin', 'employee'), requirePermission('products', 'update'), async (request, response, next) => {
  try {
    await setCatalogStatus(request.params.id, request.body?.inCatalog)
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

router.patch('/:moduleKey/:id/status', requireAudience('admin', 'employee'), modulePermission('update'), async (request, response, next) => {
  try {
    await setModuleStatus(request.params.moduleKey, request.params.id, request.body?.status)
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

export async function getPublicProducts() {
  return listPublicProducts()
}

export default router
