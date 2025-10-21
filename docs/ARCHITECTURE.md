# Arquitectura del proyecto XCargo

## Resumen
Proyecto XCargo: backend en Python (FastAPI) y frontend en React + TypeScript (Vite). Datos y analítica en Google BigQuery. El backend expone APIs REST protegidas con JWT y realiza operaciones de lectura/escritura en BigQuery; además guarda comprobantes en disco y sirve archivos estáticos.

## Componentes principales
- Frontend (React + TypeScript, Vite)
  - `frontend/src` contiene las rutas, contextos (autenticación) y páginas (Admin, Master, Supervisor, Contabilidad, Operador, Conductor, Login).
  - `AuthProvider` guarda `user` y `token` en `localStorage`; `ProtectedRoute` protege vistas usando permisos (`user.permisos`) y roles.

- Backend (FastAPI)
  - `backend/app/main.py`: aplicación FastAPI principal; monta `StaticFiles` para `comprobantes/` y registra routers.
  - `backend/app/routers/`: rutas agrupadas por responsabilidad: `auth`, `admin`, `guias`, `pagos`, `contabilidad`, `supervisor`, `asistente`, `roles`, `pagoCliente`, `operador`, etc.
  - `backend/app/dependencies.py`: dependencia `get_current_user` que valida JWT (HS256) y devuelve payload con `correo` y `rol`.
  - `backend/app/core/config.py`: carga `.env` (busca `backend/.env`) y variables: `GOOGLE_CREDENTIALS_PATH`, `OPENAI_API_KEY`, `FRONTEND_ORIGIN`.

- Storage / Datos
  - Google BigQuery: dataset `datos-clientes-441216`, tablas principales: `credenciales`, `usuarios`, `usuarios_BIG`, `COD_pendientes_v1`, `guias_liquidacion`, `pagosconductor`, `permisos`, `roles`, `rol_permisos`, `conductor_bonos`, `bono_movimientos`, `banco_movimientos`, etc.
  - Archivos estáticos: carpeta `comprobantes/` en `backend/` servida en `/static`.
  - Archivo temporal: `temp_codes.json` para códigos de recuperación de contraseña (persistencia simple).

- Servicios externos
  - Correo (email utils / fastapi-mail)
  - OpenAI (integración en `app/routers/asistente.py`) - usa `OPENAI_API_KEY`
  - Google Cloud (BigQuery client) - usa `GOOGLE_APPLICATION_CREDENTIALS` apuntando a `GOOGLE_CREDENTIALS_PATH` configurado.

## Diagrama lógico (texto)

Frontend (React) <--HTTP Bearer Token--> Backend (FastAPI)
Backend (FastAPI) <--> BigQuery (lectura/escritura)
Backend (FastAPI) --> Storage local `comprobantes/` (servido vía StaticFiles)
Backend (FastAPI) --> Email service
Backend (FastAPI) --> OpenAI (chat assistant)

## Variables de entorno relevantes
- `GOOGLE_CREDENTIALS_PATH` - ruta al JSON de credenciales Google (BigQuery).
- `OPENAI_API_KEY` - API key para OpenAI (usado por `/asistente`).
- `FRONTEND_ORIGIN` - origen permitido para CORS.
- SECRET del JWT: actualmente `supersecreto` (en `app/dependencies.py`) — debe moverse a `backend/.env`.

## Seguridad y recomendaciones inmediatas
1. No dejar `SECRET_KEY` hardcodeado; moverlo a `backend/.env` y asegurar que `.env` esté en `.gitignore`.
2. Implementar Refresh Token y/o mecanismo de revocación de tokens si se requiere logout seguro.
3. Verificar que `verificar_admin` y otros validadores no dependan de cabeceras inseguras (`X-User-Email`, `X-User-Role`) sin comprobar JWT.
4. Revisar el uso de BigQuery como "store" transaccional: operaciones tipo `SELECT MAX(Id_Transaccion)` pueden ser susceptibles a condiciones de carrera; si necesitas idempotencia/atomicidad, considerar otro mecanismo (Cloud SQL, Firestore, o uso de BigQuery insert idempotente con deduplicación).
5. Asegurar control de acceso a archivos en `comprobantes/` (no exponer información sensible por URL pública sin control).

## Cómo ejecutar localmente (alto nivel)
1. Configurar un virtualenv y `pip install -r requirements.txt`.
2. Poner el JSON de credenciales de Google y añadir `GOOGLE_CREDENTIALS_PATH` en `backend/.env`.
3. Añadir `OPENAI_API_KEY` en `backend/.env` si quieres usar el asistente.
4. Ejecutar backend: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` (o la configuración que uses).
5. Ejecutar frontend: `cd frontend && npm install && npm run dev`.

## Observabilidad y next steps operativos
- Añadir métricas básicas (Prometheus / logs estructurados) y trazas para queries largas a BigQuery.
- Centralizar logs y rotación de archivos.

---
Archivo generado automáticamente: `docs/ARCHITECTURE.md`.
