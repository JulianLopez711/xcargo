# Resumen de la API (XCargo)

Este documento resume los endpoints más relevantes del backend, los requisitos de autenticación y permisos aproximados.

> Nota: las rutas están agrupadas por router. Para detalles de parámetros y respuestas ver los módulos `backend/app/routers/*.py`.

---

## Auth
- POST /auth/login
  - Descripción: valida credenciales en BigQuery y devuelve JWT (+ permisos, ruta_defecto y datos usuario).
  - Auth: pública
  - Output: token JWT (Bearer), `permisos` (lista), `rol`, `correo`, `ruta_defecto`.

- POST /auth/solicitar-codigo
  - Descripción: solicita código de recuperación (envía email).
  - Auth: pública (form-data: correo)

- POST /auth/verificar-codigo
  - Descripción: verifica código temporal.
  - Auth: pública

- POST /auth/cambiar-clave
  - Descripción: cambia contraseña (requiere código válido).
  - Auth: pública (uso flujo recuperación)

---

## Rutas de Guías (`/guias`)
- GET /guias/pendientes
  - Descripción: devuelve guías pendientes para el conductor (usa header `usuario`/`rol` o `get_current_user`).
  - Auth: JWT (dependencia) o header `usuario` en algunos flujos

- POST /guias/sincronizar-guias-desde-cod
  - Descripción: sincroniza COD_pendientes_v1 -> guias_liquidacion
  - Auth: admin/master

- GET /guias/bonos-disponibles
  - Descripción: obtiene bonos activos del conductor
  - Auth: JWT

---

## Pagos (`/pagos`)
- POST /pagos/registrar-conductor
  - Descripción: registra pago por conductor. Recibe form-data (correo, valor, fecha, hora, tipo, entidad, referencia, guias JSON) y archivos.
  - Auth: JWT (token required)
  - Notas: guarda comprobantes en `comprobantes/`, inserta en BigQuery (`pagosconductor`) y hace MERGE/UPDATE en `guias_liquidacion`. Calcula bonos por excedente.

- GET /pagos/detalles-pago
  - Descripción: obtiene trackings únicos por referencia o Id_Transaccion
  - Auth: JWT

- GET /pagos/imagenes-transaccion/{id_transaccion}
  - Descripción: retorna URLs de comprobantes asociados a Id_Transaccion
  - Auth: JWT

- POST /pagos/verificar-referencia-nequi
  - Descripción: valida si la referencia NEQUI ya existe
  - Auth: pública (se ejecuta solo si tipo == 'Nequi')

- GET /pagos/bonos-disponibles, POST /pagos/aplicar-bonos
  - Descripción: gestión de bonos de conductor
  - Auth: JWT

---

## Contabilidad (`/contabilidad`)
- GET /contabilidad/resumen
  - Descripción: resumen combinando `pagosconductor` y `COD_pendientes_v1`. Usa timeouts y verifica disponibilidad de tablas.
  - Auth: JWT (normalmente rol contabilidad/admin)

- GET /contabilidad/conciliacion-mensual
  - Descripción: conciliación diaria por mes (usa `banco_movimientos`, `pagosconductor`)
  - Auth: JWT

- GET /contabilidad/estructura-tablas, /debug-tablas
  - Descripción: endpoints para debug y estructura de tablas
  - Auth: JWT

---

## Supervisor (`/supervisor`)
- GET /supervisor/dashboard
  - Descripción: estadísticas y alertas por carrier(s) asignados
  - Auth: JWT; rol supervisor/admin/master

- GET /supervisor/conductores
  - Descripción: lista conductores por carrier(s)
  - Auth: JWT; rol supervisor/admin/master

- GET /supervisor/guias-pendientes
  - Descripción: lista guías pendientes filtrables
  - Auth: JWT; rol supervisor/admin/master

- POST /supervisor/... (acciones de control)
  - Requieren `verificar_supervisor` y checks por carrier

---

## Admin (`/admin`)
- GET /admin/roles, GET /admin/roles-con-permisos
  - Descripción: obtención de roles y permisos desde BD
  - Auth: admin/master

- POST /admin/crear-usuario, /admin/crear-rol, /admin/crear-permiso
  - Descripción: creación de usuarios, roles y permisos
  - Auth: admin/master

- POST /admin/cambiar-rol
  - Descripción: cambio de rol en la tabla `credenciales`
  - Auth: admin

---

## Asistente (OpenAI) (`/asistente`)
- POST /asistente/chat
  - Descripción: recibe `pregunta`, `correo_usuario` y contexto; consulta BigQuery para contexto y envía prompt a OpenAI; retorna respuesta generada.
  - Auth: JWT (solo el usuario o admin puede solicitar para un correo concreto)

- GET /asistente/estado-usuario/{correo}
  - Descripción: obtiene guías y resumen del usuario consultado (autorización: admin o el propio usuario).

---

## Roles y permisos (en general)
- Los permisos se almacenan en BigQuery (`permisos`, `rol_permisos`) y al hacer `login` el backend devuelve la lista de permisos asociados al rol.
- Frontend protege rutas con `ProtectedRoute(requiredPermission="...")` y compara `user.permisos[].id === requiredPermission`.
- Roles y permisos más usados (ejemplos): `admin_dashboard`, `admin_usuarios`, `admin_roles`, `master_dashboard`, `master_carriers`, `supervisor_dashboard`, `supervisor_pagos`, `contabilidad_dashboard`, `contabilidad_pagos`, `operador_dashboard`, `conductor_pagos`.

---

## Notas finales
- Ver `backend/app/routers/*.py` para la lógica completa y validaciones específicas de cada endpoint.
- El sistema depende fuertemente de BigQuery; revisar latencias y costos asociados a consultas frecuentes y a `SELECT/UPDATE/MERGE`.

Archivo generado automáticamente: `docs/API_SUMMARY.md`.
