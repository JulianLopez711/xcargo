# Scripts de Gestión XCargo

Este directorio contiene scripts para facilitar la gestión y despliegue de la aplicación XCargo en el VPS.

## 📁 Archivos Incluidos

- `deploy.sh` - Script maestro para despliegues completos
- `manage_backend.sh` - Gestión específica del backend (FastAPI + Uvicorn)
- `manage_frontend.sh` - Gestión específica del frontend (React/Vite)

## 🚀 Despliegue Automático (GitHub Actions)

El despliegue principal se maneja automáticamente mediante GitHub Actions cuando haces push a la rama `main`:

- **Frontend**: Se construye y despliega automáticamente cuando hay cambios en `frontend/`
- **Backend**: Se reinicia automáticamente cuando hay cambios en `backend/` o `requirements.txt`
- **Detección inteligente**: Solo despliega lo que cambió

### Configuración de GitHub Actions

El workflow está en `.github/workflows/deploy.yml` y incluye:

1. **Detección de cambios**: Determina si cambió frontend, backend o ambos
2. **Build condicional**: Solo construye el frontend si es necesario
3. **Despliegue del backend**: 
   - Transfiere archivos del backend
   - Actualiza dependencias Python
   - Reinicia el servidor Uvicorn
4. **Despliegue del frontend**:
   - Transfiere archivos construidos
   - Realiza despliegue atómico con backup
   - Recarga Nginx

## 🛠️ Gestión Manual

### Script Maestro: `deploy.sh`

```bash
# Despliegue completo (backend + frontend)
./deploy.sh all

# Solo frontend
./deploy.sh frontend

# Solo backend  
./deploy.sh backend

# Ver estado del sistema
./deploy.sh status
```

### Backend: `manage_backend.sh`

```bash
# Iniciar backend
./manage_backend.sh start

# Detener backend
./manage_backend.sh stop

# Reiniciar backend
./manage_backend.sh restart

# Ver estado
./manage_backend.sh status

# Ver logs
./manage_backend.sh logs
```

### Frontend: `manage_frontend.sh`

```bash
# Construir frontend
./manage_frontend.sh build

# Desplegar frontend construido
./manage_frontend.sh deploy

# Ver estado
./manage_frontend.sh status

# Build + Deploy
./manage_frontend.sh build && ./manage_frontend.sh deploy
```

## 📍 Ubicaciones en el VPS

```
/home/devxcargo/xcargo/
├── backend/              # Código del backend FastAPI
│   ├── app/             # Aplicación principal
│   ├── uvicorn.log      # Logs del servidor
│   └── uvicorn.pid      # PID del proceso
├── frontend/            # Código y build del frontend
│   ├── dist/           # Archivos construidos (servidos por Nginx)
│   ├── dist_backup_*   # Backups automáticos
│   └── node_modules/   # Dependencias npm
├── requirements.txt     # Dependencias Python
└── scripts/            # Scripts de gestión
    ├── deploy.sh
    ├── manage_backend.sh
    └── manage_frontend.sh
```

## 🔍 Diagnóstico y Troubleshooting

### Verificar estado general
```bash
./deploy.sh status
```

### Problemas con el backend
```bash
# Ver si está ejecutándose
ps aux | grep uvicorn

# Ver logs
./manage_backend.sh logs

# Reiniciar completamente
./manage_backend.sh restart
```

### Problemas con el frontend
```bash
# Verificar archivos
ls -la /home/devxcargo/xcargo/frontend/dist/

# Estado de Nginx
sudo systemctl status nginx

# Recargar Nginx
sudo systemctl reload nginx
```

### Problemas de puertos
```bash
# Ver qué usa el puerto 8000
netstat -tlnp | grep :8000

# Matar procesos en el puerto 8000
sudo lsof -ti:8000 | xargs kill -9
```

## 🔧 Configuración Inicial

1. **Hacer ejecutables los scripts**:
```bash
chmod +x scripts/*.sh
```

2. **Verificar dependencias del sistema**:
```bash
# Node.js (para frontend)
node --version
npm --version

# Python (para backend)
python3 --version
pip3 --version

# Nginx (para servir frontend)
nginx -v
```

3. **Configurar variables de entorno** (si es necesario):
```bash
export DEPLOY_PATH="/home/devxcargo/xcargo"
```

## 📋 Comandos Rápidos de Referencia

```bash
# Estado completo
./deploy.sh status

# Despliegue completo
./deploy.sh all

# Solo reiniciar backend
./manage_backend.sh restart

# Solo reconstruir frontend
./manage_frontend.sh build && ./manage_frontend.sh deploy

# Ver logs del backend
./manage_backend.sh logs

# Ver procesos relacionados
ps aux | grep -E "(uvicorn|nginx)"
```

## 🆘 En Caso de Emergencia

Si algo falla gravemente:

1. **Restaurar frontend**:
```bash
cd /home/devxcargo/xcargo/frontend
ls -la dist_backup_*
mv dist_backup_XXXXXX_XXXXXX dist
sudo systemctl reload nginx
```

2. **Reiniciar backend desde cero**:
```bash
pkill -f uvicorn
cd /home/devxcargo/xcargo/backend
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
```

3. **Verificar logs del sistema**:
```bash
journalctl -u nginx -f
tail -f /home/devxcargo/xcargo/backend/uvicorn.log
```
