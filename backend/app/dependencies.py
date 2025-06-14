# app/dependencies.py
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

SECRET_KEY = "supersecreto"
ALGORITHM = "HS256"
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Valida el token JWT y devuelve la información del usuario.
    El token debe contener al menos el correo (en 'correo' o 'sub') y el rol.
    """
    token = credentials.credentials
    try:
        # Decodificar el token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Obtener correo del usuario (priorizar 'correo', fallback a 'sub')
        correo = payload.get("correo") or payload.get("sub")
        if not correo:
            raise HTTPException(
                status_code=401, 
                detail="Token inválido: falta el correo del usuario"
            )
        
        # Obtener rol del usuario
        rol = payload.get("rol")
        if not rol:
            raise HTTPException(
                status_code=401,
                detail="Token inválido: falta el rol del usuario"
            )
        
        # Normalizar datos
        correo = correo.lower().strip()
        rol = rol.lower().strip()
        
        # Retornar payload normalizado
        return {
            **payload,
            "correo": correo,
            "rol": rol
        }
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token expirado"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Token inválido o mal formado"
        )
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Error de autenticación: {str(e)}"
        )