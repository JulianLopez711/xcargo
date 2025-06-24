#!/bin/bash

# Script maestro de gestión XCargo
# Uso: ./deploy.sh [frontend|backend|all|status|help]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_PATH="/home/devxcargo/xcargo"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para imprimir con colores
print_info() {
    echo -e "${BLUE}ℹ️ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Función para mostrar el estado completo
show_status() {
    echo "======================================="
    echo "       Estado de XCargo System"
    echo "======================================="
    
    # Estado del backend
    echo ""
    print_info "BACKEND:"
    if pgrep -f "uvicorn.*app.main:app" > /dev/null; then
        print_success "Backend ejecutándose"
        echo "   Puerto 8000: $(netstat -tlnp 2>/dev/null | grep :8000 | wc -l) conexión(es)"
    else
        print_warning "Backend no está ejecutándose"
    fi
    
    # Estado del frontend
    echo ""
    print_info "FRONTEND:"
    if [ -d "$DEPLOY_PATH/frontend/dist" ]; then
        print_success "Frontend desplegado"
        echo "   Archivos: $(ls -1 "$DEPLOY_PATH/frontend/dist" 2>/dev/null | wc -l)"
        echo "   Tamaño: $(du -sh "$DEPLOY_PATH/frontend/dist" 2>/dev/null | cut -f1 || echo "N/A")"
    else
        print_warning "Frontend no está desplegado"
    fi
    
    # Estado de nginx
    echo ""
    print_info "NGINX:"
    if systemctl is-active nginx >/dev/null 2>&1; then
        print_success "Nginx activo"
    else
        print_error "Nginx no está activo"
    fi
    
    # Estado del sistema
    echo ""
    print_info "SISTEMA:"
    echo "   Carga: $(uptime | awk -F'load average:' '{print $2}')"
    echo "   Memoria: $(free -h | awk 'NR==2{printf "%.1f%% used", $3/$2*100}')"
    echo "   Disco: $(df -h "$DEPLOY_PATH" | awk 'NR==2{print $5 " used"}')"
    
    echo "======================================="
}

# Función para desplegar frontend
deploy_frontend() {
    print_info "Iniciando despliegue del frontend..."
    
    cd "$DEPLOY_PATH/frontend" || {
        print_error "No se puede acceder al directorio del frontend"
        return 1
    }
    
    # Build
    print_info "Construyendo frontend..."
    if bash "$SCRIPT_DIR/manage_frontend.sh" build; then
        print_success "Build del frontend completado"
    else
        print_error "Error en el build del frontend"
        return 1
    fi
    
    # Deploy
    print_info "Desplegando frontend..."
    if bash "$SCRIPT_DIR/manage_frontend.sh" deploy; then
        print_success "Frontend desplegado exitosamente"
    else
        print_error "Error desplegando frontend"
        return 1
    fi
}

# Función para desplegar backend
deploy_backend() {
    print_info "Iniciando despliegue del backend..."
    
    # Detener backend actual
    print_info "Deteniendo backend actual..."
    bash "$SCRIPT_DIR/manage_backend.sh" stop
    
    # Actualizar dependencias
    print_info "Actualizando dependencias Python..."
    cd "$DEPLOY_PATH" || {
        print_error "No se puede acceder al directorio de despliegue"
        return 1
    }
    
    python3 -m pip install -r requirements.txt > /dev/null 2>&1 || {
        print_warning "Error actualizando dependencias (continuando...)"
    }
    
    # Iniciar backend
    print_info "Iniciando backend..."
    if bash "$SCRIPT_DIR/manage_backend.sh" start; then
        print_success "Backend desplegado exitosamente"
    else
        print_error "Error desplegando backend"
        return 1
    fi
}

# Función para despliegue completo
deploy_all() {
    print_info "Iniciando despliegue completo de XCargo..."
    
    # Verificar que estamos en el directorio correcto
    if [ ! -d "$DEPLOY_PATH" ]; then
        print_error "Directorio de despliegue no encontrado: $DEPLOY_PATH"
        return 1
    fi
    
    # Desplegar backend primero
    if deploy_backend; then
        print_success "Backend desplegado correctamente"
    else
        print_error "Error en despliegue del backend"
        return 1
    fi
    
    echo ""
    
    # Desplegar frontend
    if deploy_frontend; then
        print_success "Frontend desplegado correctamente"
    else
        print_error "Error en despliegue del frontend"
        return 1
    fi
    
    echo ""
    print_success "🚀 Despliegue completo finalizado exitosamente!"
    echo ""
    show_status
}

# Función para mostrar ayuda
show_help() {
    echo "Script maestro de gestión XCargo"
    echo ""
    echo "Uso: $0 [comando]"
    echo ""
    echo "Comandos disponibles:"
    echo "  frontend  - Desplegar solo el frontend (build + deploy)"
    echo "  backend   - Desplegar solo el backend (restart + deps)"
    echo "  all       - Despliegue completo (backend + frontend)"
    echo "  status    - Mostrar estado completo del sistema"
    echo "  help      - Mostrar esta ayuda"
    echo ""
    echo "Ejemplos:"
    echo "  $0 all"
    echo "  $0 frontend"
    echo "  $0 backend"
    echo "  $0 status"
    echo ""
    echo "Scripts individuales disponibles:"
    echo "  ./manage_backend.sh   - Gestión específica del backend"
    echo "  ./manage_frontend.sh  - Gestión específica del frontend"
}

# Verificar que los scripts existen
check_scripts() {
    if [ ! -f "$SCRIPT_DIR/manage_backend.sh" ]; then
        print_error "Script manage_backend.sh no encontrado"
        return 1
    fi
    
    if [ ! -f "$SCRIPT_DIR/manage_frontend.sh" ]; then
        print_error "Script manage_frontend.sh no encontrado"
        return 1
    fi
    
    # Hacer ejecutables
    chmod +x "$SCRIPT_DIR/manage_backend.sh" "$SCRIPT_DIR/manage_frontend.sh"
}

# Verificar scripts al inicio
check_scripts || exit 1

# Procesar comando
case "${1:-help}" in
    "frontend")
        deploy_frontend
        ;;
    "backend")
        deploy_backend
        ;;
    "all")
        deploy_all
        ;;
    "status")
        show_status
        ;;
    "help"|"--help"|"-h")
        show_help
        ;;
    *)
        print_error "Comando desconocido: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
