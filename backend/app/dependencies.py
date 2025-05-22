from fastapi import HTTPException
from typing import Dict, Any

def get_current_user() -> Dict[str, Any]:
    """
    Versión simplificada que devuelve un usuario admin por defecto
    TODO: Implementar autenticación real con JWT
    """
    # Por ahora devolvemos un usuario admin fijo para que funcione
    # En producción esto debe validar tokens JWT reales
    return {
        "correo": "admin@x-cargo.co",
        "rol": "admin", 
        "nombre": "Administrador",
        "telefono": "+57 300 123 4567"
    }

def get_current_admin_user() -> Dict[str, Any]:
    """
    Dependencia para verificar que el usuario actual es administrador
    """
    user = get_current_user()
    if user.get("rol") != "admin":
        raise HTTPException(
            status_code=403, 
            detail="Acceso denegado: se requieren permisos de administrador"
        )
    return user