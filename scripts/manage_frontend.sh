#!/bin/bash

# Script de gestión del frontend XCargo
# Uso: ./manage_frontend.sh [build|deploy|status|help]

DEPLOY_PATH="/home/devxcargo/xcargo"
FRONTEND_DIR="$DEPLOY_PATH/frontend"

# Función para mostrar el estado
show_status() {
    echo "=== Estado del Frontend XCargo ==="
    
    if [ -d "$FRONTEND_DIR/dist" ]; then
        echo "✅ Frontend desplegado en: $FRONTEND_DIR/dist"
        echo "Archivos en dist: $(ls -1 "$FRONTEND_DIR/dist" | wc -l)"
        echo "Tamaño total: $(du -sh "$FRONTEND_DIR/dist" | cut -f1)"
        echo ""
        echo "Últimos archivos modificados:"
        ls -lt "$FRONTEND_DIR/dist" | head -5
    else
        echo "❌ No se encuentra el directorio dist del frontend"
    fi
    
    echo ""
    echo "Estado de nginx:"
    if systemctl is-active nginx >/dev/null 2>&1; then
        echo "✅ Nginx está ejecutándose"
    else
        echo "❌ Nginx no está ejecutándose"
    fi
}

# Función para construir el frontend
build_frontend() {
    echo "🏗️ Construyendo frontend..."
    
    # Cambiar al directorio del frontend
    cd "$FRONTEND_DIR" || {
        echo "❌ Error: No se puede acceder a $FRONTEND_DIR"
        return 1
    }
    
    # Verificar que existe package.json
    if [ ! -f "package.json" ]; then
        echo "❌ Error: No se encuentra package.json en $FRONTEND_DIR"
        return 1
    fi
    
    # Limpiar instalación anterior
    echo "🧹 Limpiando caché y node_modules..."
    rm -rf node_modules package-lock.json
    npm cache clean --force
    
    # Instalar dependencias
    echo "📦 Instalando dependencias..."
    npm install || {
        echo "❌ Error instalando dependencias"
        return 1
    }
    
    # Ejecutar build
    echo "⚙️ Ejecutando build..."
    npm run build || {
        echo "❌ Error en el proceso de build"
        return 1
    }
    
    # Verificar que se creó el directorio dist
    if [ -d "dist" ]; then
        echo "✅ Build completado exitosamente"
        echo "Archivos generados: $(ls -1 dist | wc -l)"
        ls -la dist/
    else
        echo "❌ Error: No se generó el directorio dist"
        return 1
    fi
}

# Función para desplegar el frontend
deploy_frontend() {
    echo "🚀 Desplegando frontend..."
    
    # Verificar que existe el directorio dist
    if [ ! -d "$FRONTEND_DIR/dist" ]; then
        echo "❌ Error: No existe el directorio dist. Ejecute primero: $0 build"
        return 1
    fi
    
    # Crear backup del despliegue anterior
    if [ -d "$FRONTEND_DIR/dist_current" ]; then
        backup_name="dist_backup_$(date +%Y%m%d_%H%M%S)"
        echo "📦 Creando backup: $backup_name"
        mv "$FRONTEND_DIR/dist_current" "$FRONTEND_DIR/$backup_name"
    fi
    
    # Mover la nueva versión
    echo "📁 Desplegando nueva versión..."
    mv "$FRONTEND_DIR/dist" "$FRONTEND_DIR/dist_current" || {
        echo "❌ Error moviendo archivos"
        return 1
    }
    
    # Crear symlink para nginx (si es necesario)
    if [ ! -L "$FRONTEND_DIR/dist" ]; then
        ln -sf "$FRONTEND_DIR/dist_current" "$FRONTEND_DIR/dist"
    fi
    
    # Recargar nginx
    echo "🔄 Recargando nginx..."
    sudo systemctl reload nginx || {
        echo "⚠️ Error recargando nginx"
        echo "Puedes recargarlo manualmente con: sudo systemctl reload nginx"
    }
    
    # Limpiar backups antiguos (mantener solo los últimos 3)
    echo "🧹 Limpiando backups antiguos..."
    ls -dt "$FRONTEND_DIR"/dist_backup_* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true
    
    echo "✅ Frontend desplegado exitosamente"
    show_status
}

# Función para mostrar ayuda
show_help() {
    echo "Script de gestión del frontend XCargo"
    echo ""
    echo "Uso: $0 [comando]"
    echo ""
    echo "Comandos disponibles:"
    echo "  build    - Construir el frontend (npm install + npm run build)"
    echo "  deploy   - Desplegar el frontend construido"
    echo "  status   - Mostrar estado del frontend"
    echo "  help     - Mostrar esta ayuda"
    echo ""
    echo "Ejemplos:"
    echo "  $0 build"
    echo "  $0 deploy"
    echo "  $0 status"
    echo ""
    echo "Para un despliegue completo:"
    echo "  $0 build && $0 deploy"
}

# Procesar comando
case "${1:-help}" in
    "build")
        build_frontend
        ;;
    "deploy")
        deploy_frontend
        ;;
    "status")
        show_status
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
