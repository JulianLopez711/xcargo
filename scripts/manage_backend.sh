#!/bin/bash

# Script de gestión del backend XCargo
# Uso: ./manage_backend.sh [start|stop|restart|status|logs]

DEPLOY_PATH="/home/devxcargo/xcargo"
BACKEND_DIR="$DEPLOY_PATH/backend"
LOG_FILE="$BACKEND_DIR/uvicorn.log"
PID_FILE="$BACKEND_DIR/uvicorn.pid"

# Función para mostrar el estado
show_status() {
    echo "=== Estado del Backend XCargo ==="
    if pgrep -f "uvicorn.*app.main:app" > /dev/null; then
        echo "✅ Backend está ejecutándose"
        echo "Procesos uvicorn:"
        ps aux | grep uvicorn | grep -v grep
        echo ""
        echo "Puerto 8000:"
        netstat -tlnp | grep :8000 || echo "Puerto 8000 no está siendo usado"
    else
        echo "❌ Backend no está ejecutándose"
    fi
}

# Función para detener el backend
stop_backend() {
    echo "🛑 Deteniendo backend..."
    pkill -f "uvicorn.*app.main:app"
    sleep 2
    
    if pgrep -f "uvicorn.*app.main:app" > /dev/null; then
        echo "⚠️ Forzando detención..."
        pkill -9 -f "uvicorn.*app.main:app"
        sleep 1
    fi
    
    if ! pgrep -f "uvicorn.*app.main:app" > /dev/null; then
        echo "✅ Backend detenido exitosamente"
    else
        echo "❌ Error: No se pudo detener el backend"
        return 1
    fi
}

# Función para iniciar el backend
start_backend() {
    echo "🚀 Iniciando backend..."
    
    # Verificar que no esté ejecutándose
    if pgrep -f "uvicorn.*app.main:app" > /dev/null; then
        echo "⚠️ Backend ya está ejecutándose"
        show_status
        return 1
    fi
    
    # Cambiar al directorio del backend
    cd "$BACKEND_DIR" || {
        echo "❌ Error: No se puede acceder a $BACKEND_DIR"
        return 1
    }
    
    # Verificar que existe el archivo main.py
    if [ ! -f "app/main.py" ]; then
        echo "❌ Error: No se encuentra app/main.py en $BACKEND_DIR"
        return 1
    fi
    
    # Instalar/actualizar dependencias
    echo "📦 Verificando dependencias..."
    python3 -m pip install -r ../requirements.txt > /dev/null 2>&1
    
    # Iniciar uvicorn
    echo "▶️ Ejecutando uvicorn..."
    nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > "$LOG_FILE" 2>&1 &
    
    # Guardar PID
    echo $! > "$PID_FILE"
    
    sleep 3
    
    # Verificar que se inició correctamente
    if pgrep -f "uvicorn.*app.main:app" > /dev/null; then
        echo "✅ Backend iniciado exitosamente"
        show_status
    else
        echo "❌ Error: Backend no se pudo iniciar"
        echo "Últimas líneas del log:"
        tail -10 "$LOG_FILE" 2>/dev/null || echo "No se puede leer el log"
        return 1
    fi
}

# Función para reiniciar el backend
restart_backend() {
    echo "🔄 Reiniciando backend..."
    stop_backend
    sleep 2
    start_backend
}

# Función para mostrar logs
show_logs() {
    if [ -f "$LOG_FILE" ]; then
        echo "📄 Últimas líneas del log de uvicorn:"
        echo "======================================="
        tail -20 "$LOG_FILE"
        echo "======================================="
        echo "Para ver el log en tiempo real: tail -f $LOG_FILE"
    else
        echo "❌ No se encuentra el archivo de log: $LOG_FILE"
    fi
}

# Función para mostrar ayuda
show_help() {
    echo "Script de gestión del backend XCargo"
    echo ""
    echo "Uso: $0 [comando]"
    echo ""
    echo "Comandos disponibles:"
    echo "  start    - Iniciar el backend"
    echo "  stop     - Detener el backend"
    echo "  restart  - Reiniciar el backend"
    echo "  status   - Mostrar estado del backend"
    echo "  logs     - Mostrar logs del backend"
    echo "  help     - Mostrar esta ayuda"
    echo ""
    echo "Ejemplos:"
    echo "  $0 status"
    echo "  $0 restart"
    echo "  $0 logs"
}

# Procesar comando
case "${1:-help}" in
    "start")
        start_backend
        ;;
    "stop")
        stop_backend
        ;;
    "restart")
        restart_backend
        ;;
    "status")
        show_status
        ;;
    "logs")
        show_logs
        ;;
    "help"|"--help"|"-h")
        show_help
        ;;
    *)
        echo "❌ Comando desconocido: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
