# app/dependencies.py
from fastapi import HTTPException, Depends, Request
from typing import Dict, Any

def get_current_user(request: Request) -> Dict[str, Any]:
    """
    Obtiene el usuario actual de la sesión/token
    Por ahora simula desde headers, pero deberías usar JWT
    """
    
    # TEMPORAL: Obtener usuario desde headers
    # En producción, usa JWT tokens
    user_email = request.headers.get("X-User-Email")
    user_role = request.headers.get("X-User-Role") 
    user_name = request.headers.get("X-User-Name")
    
    if not user_email:
        raise HTTPException(
            status_code=401, 
            detail="No autorizado - Usuario no encontrado en la sesión"
        )
    
    # Simular usuario para pruebas
    # En producción, extraer desde JWT decodificado
    return {
        "correo": user_email,
        "rol": user_role or "conductor",
        "nombre": user_name or user_email.split("@")[0],
        "id_usuario": "temp_id"
    }

# Alternativa más segura usando JWT (para implementar después):
"""
from jose import JWTError, jwt
from datetime import datetime

def get_current_user_jwt(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Token inválido")
        
        # Aquí buscarías el usuario en la base de datos
        user = get_user_from_db(email)
        if user is None:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
            
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")
"""