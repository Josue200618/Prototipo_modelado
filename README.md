# Backend Prototipo - Lacombalpalo

Servidor backend desarrollado en **Node.js + Express** para la plataforma artesanal **Lacombalpalo**. Gestiona autenticación con JWT en cookies HttpOnly, control de roles y permisos, y operaciones de base de datos MySQL para todos los módulos.

## 🚀 Inicio rápido

### 1. Requisitos
- Node.js v18+ instalado.
- Servidor MySQL ejecutándose (puerto 3306 por defecto).
- Base de datos importada mediante el script `Lacombalpalo.sql`.

### 2. Base de datos
Abre **MySQL Workbench** (o phpMyAdmin / DBeaver) y ejecuta el archivo:
`Lacombalpalo.sql` (incluido en esta carpeta y en el frontend).

Este archivo crea automáticamente la base de datos `Lacombalpalo`, todas sus tablas, restricciones de integridad referencial, roles, permisos y los datos iniciales (usuarios, productos, proveedores, clientes, etc.).

### 3. Configuración (.env)
El archivo `.env` ya está creado con los valores por defecto:
```env
NODE_ENV=development
API_PORT=3001
API_HOST=127.0.0.1

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=Lacombalpalo

JWT_SECRET=lacombalpalo_super_secret_jwt_key_2026_minimum_32_characters_length
```
> **Nota:** Si tu usuario de MySQL tiene contraseña, edita `DB_PASSWORD=tu_contraseña`.

### 4. Ejecutar el servidor
Para iniciar el servidor:
```bash
npm start
```
O en modo desarrollo con reinicio automático al guardar cambios:
```bash
npm run dev
```
El servidor escuchará en `http://127.0.0.1:3001`.

---

## 🔑 Cuentas demo preconfiguradas

| Tipo de usuario | Correo | Contraseña | Rol / Permisos |
|---|---|---|---|
| **Administrador** | `admin@lacombalpalo.com` | `Admin1234*` | Acceso total al Dashboard y módulos |
| **Administrador (Secundario)** | `ana@lacombalpalo.com` | `Admin1234*` | Administradora |
| **Vendedor** | `carlos@lacombalpalo.com` | `Vendedor1234*` | Ventas, Pedidos y Clientes |
| **Taller** | `laura@lacombalpalo.com` | `Taller1234*` | Productos y Entregas |
| **Cliente** | `cliente@lacombalpalo.com` | `Cliente1234*` | Portal del cliente, catálogo, compras |
| **Cliente 2** | `maria@lacombalpalo.com` | `Cliente1234*` | Portal del cliente |

---

## 🛠️ Scripts adicionales

- **Verificar conexión a la base de datos:**
  ```bash
  npm run check-db
  ```
- **Crear un nuevo usuario Administrador:**
  ```bash
  npm run create-admin
  ```
