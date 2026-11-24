-- ==============================================================
-- BASE DE DATOS LACOMBALPALO
-- Esquema completo y datos iniciales para Prototipo Modelado
-- ==============================================================

CREATE DATABASE IF NOT EXISTS `Lacombalpalo`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `Lacombalpalo`;

-- 1. ROLES
CREATE TABLE IF NOT EXISTS `roles` (
  `id_role` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(60) NOT NULL,
  `description` VARCHAR(255) NULL,
  `status` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_role`),
  UNIQUE KEY `uq_roles_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. PERMISOS (MÓDULOS)
CREATE TABLE IF NOT EXISTS `permissions` (
  `id_permission` INT NOT NULL AUTO_INCREMENT,
  `module_key` VARCHAR(40) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `description` VARCHAR(255) NULL,
  PRIMARY KEY (`id_permission`),
  UNIQUE KEY `uq_permissions_module` (`module_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. PRIVILEGIOS (ACCIONES)
CREATE TABLE IF NOT EXISTS `privileges` (
  `id_privilege` INT NOT NULL AUTO_INCREMENT,
  `action_key` VARCHAR(30) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  PRIMARY KEY (`id_privilege`),
  UNIQUE KEY `uq_privileges_action` (`action_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. ACCIONES PERMITIDAS POR MÓDULO
CREATE TABLE IF NOT EXISTS `permission_privileges` (
  `permission_id` INT NOT NULL,
  `privilege_id` INT NOT NULL,
  PRIMARY KEY (`permission_id`, `privilege_id`),
  CONSTRAINT `fk_permission_privileges_permission`
    FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id_permission`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_permission_privileges_privilege`
    FOREIGN KEY (`privilege_id`) REFERENCES `privileges` (`id_privilege`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. PERMISOS ASIGNADOS A ROLES
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` INT NOT NULL,
  `permission_id` INT NOT NULL,
  `privilege_id` INT NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`, `privilege_id`),
  CONSTRAINT `fk_role_permissions_role`
    FOREIGN KEY (`role_id`) REFERENCES `roles` (`id_role`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_role_permissions_allowed_action`
    FOREIGN KEY (`permission_id`, `privilege_id`)
    REFERENCES `permission_privileges` (`permission_id`, `privilege_id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. USUARIOS INTERNOS
CREATE TABLE IF NOT EXISTS `users` (
  `id_user` INT NOT NULL AUTO_INCREMENT,
  `role_id` INT NOT NULL,
  `identification_type` VARCHAR(25) NULL,
  `identification` VARCHAR(45) NOT NULL,
  `first_name` VARCHAR(60) NOT NULL,
  `second_name` VARCHAR(60) NULL,
  `first_surname` VARCHAR(60) NOT NULL,
  `second_surname` VARCHAR(60) NULL,
  `email` VARCHAR(254) NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `status` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_user`),
  UNIQUE KEY `uq_users_identification` (`identification`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `ix_users_role` (`role_id`),
  CONSTRAINT `fk_users_role`
    FOREIGN KEY (`role_id`) REFERENCES `roles` (`id_role`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. CLIENTES
CREATE TABLE IF NOT EXISTS `clients` (
  `id_client` INT NOT NULL AUTO_INCREMENT,
  `person_type` VARCHAR(20) NOT NULL,
  `document_type` VARCHAR(30) NOT NULL,
  `document_number` VARCHAR(30) NOT NULL,
  `name_or_business_name` VARCHAR(120) NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `department` VARCHAR(60) NOT NULL,
  `municipality` VARCHAR(80) NOT NULL,
  `delivery_address` VARCHAR(180) NOT NULL,
  `password_hash` VARCHAR(255) NULL,
  `status` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_client`),
  UNIQUE KEY `uq_clients_document` (`document_type`, `document_number`),
  UNIQUE KEY `uq_clients_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. PROVEEDORES
CREATE TABLE IF NOT EXISTS `suppliers` (
  `id_supplier` INT NOT NULL AUTO_INCREMENT,
  `document_type` VARCHAR(30) NOT NULL,
  `document_number` VARCHAR(30) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `department` VARCHAR(60) NOT NULL,
  `municipality` VARCHAR(80) NOT NULL,
  `address` VARCHAR(180) NOT NULL,
  `status` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id_supplier`),
  UNIQUE KEY `uq_suppliers_document` (`document_type`, `document_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. CATEGORÍAS DE PRODUCTOS
CREATE TABLE IF NOT EXISTS `product_categories` (
  `id_category` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(60) NOT NULL,
  `description` VARCHAR(255) NULL,
  `image` VARCHAR(500) NULL,
  `status` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id_category`),
  UNIQUE KEY `uq_product_categories_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. PRODUCTOS
CREATE TABLE IF NOT EXISTS `products` (
  `id_product` INT NOT NULL AUTO_INCREMENT,
  `category_id` INT NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NOT NULL,
  `base_price` DECIMAL(12,2) NOT NULL,
  `stock` INT UNSIGNED NOT NULL DEFAULT 0,
  `status` TINYINT(1) NOT NULL DEFAULT 1,
  `in_catalog` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_product`),
  KEY `ix_products_category` (`category_id`),
  CONSTRAINT `fk_products_category`
    FOREIGN KEY (`category_id`) REFERENCES `product_categories` (`id_category`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. IMÁGENES DE PRODUCTOS
CREATE TABLE IF NOT EXISTS `product_images` (
  `id_image` INT NOT NULL AUTO_INCREMENT,
  `product_id` INT NOT NULL,
  `image_url` VARCHAR(500) NOT NULL,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id_image`),
  KEY `ix_product_images_product` (`product_id`),
  CONSTRAINT `fk_product_images_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id_product`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. PRODUCTOS SUMINISTRADOS POR PROVEEDORES
CREATE TABLE IF NOT EXISTS `supplier_products` (
  `id_supplier_product` INT NOT NULL AUTO_INCREMENT,
  `supplier_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `acquisition_cost` DECIMAL(12,2) NOT NULL,
  `minimum_stock` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id_supplier_product`),
  UNIQUE KEY `uq_supplier_products_supplier_product` (`supplier_id`, `product_id`),
  KEY `ix_supplier_products_product` (`product_id`),
  CONSTRAINT `fk_supplier_products_supplier`
    FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id_supplier`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_supplier_products_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id_product`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. COMPRAS A PROVEEDORES
CREATE TABLE IF NOT EXISTS `purchases` (
  `id_purchase` INT NOT NULL AUTO_INCREMENT,
  `supplier_id` INT NOT NULL,
  `purchase_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `total` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
  PRIMARY KEY (`id_purchase`),
  KEY `ix_purchases_supplier` (`supplier_id`),
  CONSTRAINT `fk_purchases_supplier`
    FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id_supplier`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. DETALLES DE COMPRAS
CREATE TABLE IF NOT EXISTS `purchase_details` (
  `id_purchase_detail` INT NOT NULL AUTO_INCREMENT,
  `purchase_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `quantity` INT UNSIGNED NOT NULL,
  `unit_price` DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (`id_purchase_detail`),
  KEY `ix_purchase_details_purchase` (`purchase_id`),
  KEY `ix_purchase_details_product` (`product_id`),
  CONSTRAINT `fk_purchase_details_purchase`
    FOREIGN KEY (`purchase_id`) REFERENCES `purchases` (`id_purchase`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_purchase_details_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id_product`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. PEDIDOS DE CLIENTES
CREATE TABLE IF NOT EXISTS `orders` (
  `id_order` INT NOT NULL AUTO_INCREMENT,
  `client_id` INT NOT NULL,
  `order_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` VARCHAR(40) NOT NULL DEFAULT 'Pedido pendiente',
  `total` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `payment_method` VARCHAR(50) NULL,
  `receipt_url` TEXT NULL,
  PRIMARY KEY (`id_order`),
  KEY `ix_orders_client` (`client_id`),
  CONSTRAINT `fk_orders_client`
    FOREIGN KEY (`client_id`) REFERENCES `clients` (`id_client`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. DETALLES DE PEDIDOS
CREATE TABLE IF NOT EXISTS `order_details` (
  `id_order_detail` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `unit_price` DECIMAL(12,2) NOT NULL,
  `quantity` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`id_order_detail`),
  KEY `ix_order_details_order` (`order_id`),
  KEY `ix_order_details_product` (`product_id`),
  CONSTRAINT `fk_order_details_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id_order`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_order_details_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id_product`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. VENTAS REGISTRADAS
CREATE TABLE IF NOT EXISTS `sales` (
  `id_sale` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `sale_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `payment_method` VARCHAR(50) NOT NULL,
  `total` DECIMAL(12,2) NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'Pagada y entregada',
  PRIMARY KEY (`id_sale`),
  UNIQUE KEY `uq_sales_order` (`order_id`),
  CONSTRAINT `fk_sales_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id_order`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. ENTREGAS
CREATE TABLE IF NOT EXISTS `deliveries` (
  `id_delivery` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `address` VARCHAR(180) NOT NULL,
  `scheduled_date` DATETIME NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
  `approved_by_user_id` INT NULL,
  PRIMARY KEY (`id_delivery`),
  UNIQUE KEY `uq_deliveries_order` (`order_id`),
  KEY `ix_deliveries_approver` (`approved_by_user_id`),
  CONSTRAINT `fk_deliveries_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id_order`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_deliveries_approver`
    FOREIGN KEY (`approved_by_user_id`) REFERENCES `users` (`id_user`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. RESEÑAS
CREATE TABLE IF NOT EXISTS `reviews` (
  `id_review` INT NOT NULL AUTO_INCREMENT,
  `client_id` INT NOT NULL,
  `order_id` INT NULL,
  `product_id` INT NULL,
  `rating` TINYINT UNSIGNED NOT NULL,
  `comment` VARCHAR(1000) NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_review`),
  KEY `ix_reviews_client` (`client_id`),
  KEY `ix_reviews_order` (`order_id`),
  KEY `ix_reviews_product` (`product_id`),
  CONSTRAINT `fk_reviews_client`
    FOREIGN KEY (`client_id`) REFERENCES `clients` (`id_client`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_reviews_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id_order`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_reviews_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id_product`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 20. NOTIFICACIONES
CREATE TABLE IF NOT EXISTS `notifications` (
  `id_notification` BIGINT NOT NULL AUTO_INCREMENT,
  `recipient_type` ENUM('admin', 'client') NOT NULL,
  `client_id` INT NULL,
  `category` VARCHAR(60) NOT NULL,
  `message` VARCHAR(1000) NOT NULL,
  `related_id` VARCHAR(80) NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_notification`),
  KEY `ix_notifications_recipient_read` (`recipient_type`, `client_id`, `is_read`, `created_at`),
  CONSTRAINT `fk_notifications_client`
    FOREIGN KEY (`client_id`) REFERENCES `clients` (`id_client`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================
-- DATOS INICIALES (SEED DATA)
-- ==============================================================

-- ROLES
INSERT IGNORE INTO `roles` (`name`, `description`) VALUES
  ('Administrador', 'Acceso total a todos los módulos del sistema'),
  ('Vendedor', 'Acceso a la gestión de ventas, pedidos y clientes'),
  ('Taller', 'Acceso a productos e inventario, y control de entregas');

-- PERMISOS (MÓDULOS DEL SISTEMA)
INSERT IGNORE INTO `permissions` (`module_key`, `name`, `description`) VALUES
  ('dashboard', 'Dashboard', 'Métricas y estadísticas'),
  ('roles', 'Roles', 'Gestión de roles y privilegios'),
  ('users', 'Usuarios', 'Gestión de usuarios y empleados'),
  ('products', 'Productos', 'Gestión de productos y stock'),
  ('categories', 'Categorías', 'Gestión de categorías de productos'),
  ('suppliers', 'Proveedores', 'Gestión de proveedores y suministros'),
  ('purchases', 'Compras', 'Abastecimiento de inventario'),
  ('clients', 'Clientes', 'Gestión de clientes'),
  ('orders', 'Pedidos', 'Gestión de pedidos'),
  ('sales', 'Ventas', 'Gestión de ventas y comprobantes'),
  ('deliveries', 'Entregas', 'Gestión y aprobación de entregas'),
  ('reviews', 'Reseñas', 'Gestión de opiniones y valoraciones');

-- PRIVILEGIOS
INSERT IGNORE INTO `privileges` (`action_key`, `name`) VALUES
  ('read', 'Consultar'),
  ('create', 'Crear'),
  ('update', 'Editar'),
  ('delete', 'Eliminar'),
  ('approve', 'Aprobar'),
  ('export', 'Exportar');

-- ASOCIACIÓN PERMISO - PRIVILEGIO
INSERT IGNORE INTO `permission_privileges` (`permission_id`, `privilege_id`)
SELECT p.`id_permission`, v.`id_privilege`
FROM `permissions` AS p
CROSS JOIN `privileges` AS v
WHERE
  (p.`module_key` = 'dashboard' AND v.`action_key` IN ('read', 'export'))
  OR (p.`module_key` IN ('roles', 'users', 'products', 'categories', 'suppliers', 'clients', 'reviews')
      AND v.`action_key` IN ('read', 'create', 'update', 'delete'))
  OR (p.`module_key` = 'purchases'
      AND v.`action_key` IN ('read', 'create', 'update', 'delete', 'export'))
  OR (p.`module_key` = 'orders'
      AND v.`action_key` IN ('read', 'create', 'update', 'delete', 'approve'))
  OR (p.`module_key` = 'sales'
      AND v.`action_key` IN ('read', 'create', 'update', 'delete', 'export'))
  OR (p.`module_key` = 'deliveries'
      AND v.`action_key` IN ('read', 'create', 'update', 'delete', 'approve'));

-- PERMISOS DEL ROL: Administrador (Todos)
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `privilege_id`)
SELECT r.`id_role`, pp.`permission_id`, pp.`privilege_id`
FROM `roles` AS r
CROSS JOIN `permission_privileges` AS pp
WHERE r.`name` = 'Administrador';

-- PERMISOS DEL ROL: Vendedor
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `privilege_id`)
SELECT r.`id_role`, p.`id_permission`, v.`id_privilege`
FROM `roles` AS r
JOIN `permissions` AS p ON p.`module_key` IN ('sales', 'orders', 'clients')
JOIN `privileges` AS v ON
  (p.`module_key` = 'sales' AND v.`action_key` IN ('read', 'create', 'export'))
  OR (p.`module_key` = 'orders' AND v.`action_key` IN ('read'))
  OR (p.`module_key` = 'clients' AND v.`action_key` IN ('read', 'create'))
WHERE r.`name` = 'Vendedor';

-- PERMISOS DEL ROL: Taller
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `privilege_id`)
SELECT r.`id_role`, p.`id_permission`, v.`id_privilege`
FROM `roles` AS r
JOIN `permissions` AS p ON p.`module_key` IN ('products', 'deliveries')
JOIN `privileges` AS v
  ON (p.`module_key` = 'products' AND v.`action_key` IN ('read', 'update'))
  OR (p.`module_key` = 'deliveries' AND v.`action_key` IN ('read', 'approve'))
WHERE r.`name` = 'Taller';

-- CATEGORÍAS DE PRODUCTOS
INSERT IGNORE INTO `product_categories` (`id_category`, `name`, `description`, `image`) VALUES
  (1, 'Mesas', 'Mesas y comedores artesanales en madera maciza', 'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=900&q=80'),
  (2, 'Decoración', 'Espejos y piezas decorativas con acabados naturales', 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=80'),
  (3, 'Bancas', 'Bancas resistentes para jardín y exteriores', 'https://images.unsplash.com/photo-1598300056393-4aac492f4344?auto=format&fit=crop&w=900&q=80'),
  (4, 'Señalética', 'Letreros y señalética personalizada tallada', 'https://images.unsplash.com/photo-1567225557594-88d73e55f2cb?auto=format&fit=crop&w=900&q=80'),
  (5, 'Infantil', 'Mobiliario infantil artesanal a medida', 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=80'),
  (6, 'Cabañas', 'Estructuras y cabañas en madera diseñadas al espacio', 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=900&q=80');

-- PRODUCTOS
INSERT IGNORE INTO `products` (`id_product`, `category_id`, `name`, `description`, `base_price`, `stock`, `status`, `in_catalog`) VALUES
  (1, 1, 'Mesa Campestre', 'Mesa de comedor en roble macizo para 8 personas con acabado rústico poliuretánico.', 2850000.00, 8, 1, 1),
  (2, 2, 'Espejo Roble', 'Espejo decorativo con marco tallado en madera maciza de roble y sellado natural.', 680000.00, 15, 1, 1),
  (3, 3, 'Banca Jardín', 'Banca ergonómica tratada contra intemperie y humedad para exteriores.', 1200000.00, 5, 1, 1),
  (4, 4, 'Letrero Tallado', 'Señalética tallada en bajo relieve sobre tablón de pino inmunizado.', 450000.00, 12, 1, 1),
  (5, 5, 'Silla Infantil', 'Silla anatómica de madera con esquinas redondeadas y pintura no tóxica.', 320000.00, 10, 1, 1),
  (6, 6, 'Cabaña Alpina', 'Estructura modular tipo cabaña alpina en madera tratada resistente a la lluvia.', 18500000.00, 2, 1, 1);

-- IMÁGENES DE PRODUCTOS
INSERT IGNORE INTO `product_images` (`product_id`, `image_url`, `is_primary`) VALUES
  (1, 'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=900&q=80', 1),
  (2, 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=80', 1),
  (3, 'https://images.unsplash.com/photo-1598300056393-4aac492f4344?auto=format&fit=crop&w=900&q=80', 1),
  (4, 'https://images.unsplash.com/photo-1567225557594-88d73e55f2cb?auto=format&fit=crop&w=900&q=80', 1),
  (5, 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=80', 1),
  (6, 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=900&q=80', 1);

-- USUARIOS DEL SISTEMA (Contraseñas: Admin1234*, Vendedor1234*, Taller1234*)
INSERT IGNORE INTO `users` (`id_user`, `role_id`, `identification_type`, `identification`, `first_name`, `second_name`, `first_surname`, `second_surname`, `email`, `phone`, `password_hash`, `status`) VALUES
  (1, 1, 'CC', '100000001', 'Administrador', NULL, 'Sistema', NULL, 'admin@lacombalpalo.com', '3001234567', '$2b$10$w2XKedjT85Y656Y3m3xJhueBNbNhZ4tirxeGVZVle1on0H.Iu5bEq', 1),
  (2, 1, 'CC', '100000002', 'Ana', 'María', 'Martínez', 'López', 'ana@lacombalpalo.com', '3009876543', '$2b$10$w2XKedjT85Y656Y3m3xJhueBNbNhZ4tirxeGVZVle1on0H.Iu5bEq', 1),
  (3, 2, 'CC', '100000003', 'Carlos', 'Andrés', 'Ruiz', 'Pérez', 'carlos@lacombalpalo.com', '3104567890', '$2b$10$jZKi6RKuNkIVYFr5PfVKrO.Ux172hSXEQQpcJfmzHF43rPpsf4pUu', 1),
  (4, 3, 'CC', '100000004', 'Laura', 'Elena', 'Gómez', 'Díaz', 'laura@lacombalpalo.com', '3157890123', '$2b$10$SlBdFnqwPGUebMZku4DTYOnn.MJvW9WL5MOzRkuaPuWW/0VscQz5G', 1);

-- CLIENTES (Contraseña: Cliente1234*)
INSERT IGNORE INTO `clients` (`id_client`, `person_type`, `document_type`, `document_number`, `name_or_business_name`, `phone`, `email`, `department`, `municipality`, `delivery_address`, `password_hash`, `status`) VALUES
  (1, 'Natural', 'CC', '1020304050', 'Carlos Gómez', '3101234567', 'cliente@lacombalpalo.com', 'Antioquia', 'Medellín', 'Cra 45 # 12-34 El Poblado', '$2b$10$PP/UEKm5tGoneC1ap6TPSem2vmcFg./mbpFh5Anr/Pag8GLr7ePKy', 1),
  (2, 'Natural', 'CC', '1030405060', 'María Rodríguez', '3129876543', 'maria@lacombalpalo.com', 'Antioquia', 'Envigado', 'Calle 38 Sur # 43A-25', '$2b$10$PP/UEKm5tGoneC1ap6TPSem2vmcFg./mbpFh5Anr/Pag8GLr7ePKy', 1);

-- PROVEEDORES
INSERT IGNORE INTO `suppliers` (`id_supplier`, `document_type`, `document_number`, `name`, `phone`, `email`, `department`, `municipality`, `address`, `status`) VALUES
  (1, 'NIT', '900123456-1', 'Maderas del Bosque S.A.S.', '3105551234', 'contacto@maderasdelbosque.com', 'Antioquia', 'Rionegro', 'Km 5 Vía Llanogrande', 1),
  (2, 'NIT', '800987654-2', 'Distribuidora Forestal S.A.', '3124445678', 'ventas@distriforestal.com', 'Antioquia', 'Medellín', 'Calle 30 # 65-10', 1);

-- RELACIÓN PROVEEDOR - PRODUCTOS
INSERT IGNORE INTO `supplier_products` (`supplier_id`, `product_id`, `acquisition_cost`, `minimum_stock`) VALUES
  (1, 1, 1800000.00, 3),
  (2, 3, 750000.00, 2);

-- COMPRAS INICIALES
INSERT IGNORE INTO `purchases` (`id_purchase`, `supplier_id`, `purchase_date`, `total`, `status`) VALUES
  (1, 1, '2026-11-15 10:30:00', 9000000.00, 'Recibida');

INSERT IGNORE INTO `purchase_details` (`id_purchase_detail`, `purchase_id`, `product_id`, `quantity`, `unit_price`) VALUES
  (1, 1, 1, 5, 1800000.00);

-- PEDIDOS INICIALES
INSERT IGNORE INTO `orders` (`id_order`, `client_id`, `order_date`, `status`, `total`, `payment_method`, `receipt_url`) VALUES
  (1, 1, '2026-11-18 14:20:00', 'Aprobado', 2850000.00, 'Transferencia bancaria', 'COMP-PED-001');

INSERT IGNORE INTO `order_details` (`id_order_detail`, `order_id`, `product_id`, `unit_price`, `quantity`) VALUES
  (1, 1, 1, 2850000.00, 1);

-- VENTAS INICIALES
INSERT IGNORE INTO `sales` (`id_sale`, `order_id`, `sale_date`, `payment_method`, `total`, `status`) VALUES
  (1, 1, '2026-11-18 14:30:00', 'Transferencia bancaria', 2850000.00, 'Pagada y entregada');

-- ENTREGAS INICIALES
INSERT IGNORE INTO `deliveries` (`id_delivery`, `order_id`, `address`, `scheduled_date`, `status`, `approved_by_user_id`) VALUES
  (1, 1, 'Cra 45 # 12-34 El Poblado', '2026-11-20 09:00:00', 'Entregado', 4);

-- RESEÑAS INICIALES
INSERT IGNORE INTO `reviews` (`id_review`, `client_id`, `order_id`, `product_id`, `rating`, `comment`, `status`, `created_at`) VALUES
  (1, 1, 1, 1, 5, 'Excelente mesa de comedor, la madera maciza tiene un acabado espectacular.', 'Aprobado', '2026-11-21 16:00:00');

-- NOTIFICACIONES INICIALES
INSERT IGNORE INTO `notifications` (`id_notification`, `recipient_type`, `client_id`, `category`, `message`, `related_id`, `is_read`, `created_at`) VALUES
  (1, 'client', 1, 'welcome', '¡Bienvenido a Lacombalpalo! Tu cuenta ya está lista: explora el catálogo y consulta tus pedidos desde tu perfil.', 'CLI-001', 0, '2026-11-18 14:00:00'),
  (2, 'admin', NULL, 'client-registration', 'Nuevo cliente registrado: Carlos Gómez (cliente@lacombalpalo.com).', 'CLI-001', 1, '2026-11-18 14:05:00'),
  (3, 'admin', NULL, 'order-created', 'Nuevo pedido registrado: PED-001 por $ 2.850.000.', 'PED-001', 1, '2026-11-18 14:20:00');
