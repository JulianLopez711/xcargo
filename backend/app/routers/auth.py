from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from google.cloud import bigquery
import bcrypt

# Inicializar router
router = APIRouter(prefix="/auth", tags=["Auth"])

# ==== MODELOS ====

class LoginRequest(BaseModel):
    correo: str
    password: str

class CambiarClaveRequest(BaseModel):
    correo: str
    nueva_clave: str
    codigo: Optional[str] = None  # Opcional, útil si viene de recuperación

# ==== UTILIDADES ====

def hash_clave(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode(), bcrypt.gensalt()).decode()

# ==== RUTAS ====

@router.post("/login")
def login(data: LoginRequest):
    client = bigquery.Client()
    
    query = """
        SELECT correo, hashed_password, rol, clave_defecto
        FROM `datos-clientes-441216.Conciliaciones.credenciales`
        WHERE correo = @correo
        LIMIT 1
    """
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("correo", "STRING", data.correo)
        ]
    )
    
    result = client.query(query, job_config=job_config).result()
    rows = list(result)
    
    if not rows:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    
    cred = rows[0]
    if not bcrypt.checkpw(data.password.encode(), cred["hashed_password"].encode()):
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")
    
    return {
        "correo": cred["correo"],
        "rol": cred["rol"],
        "clave_defecto": cred["clave_defecto"]
    }

@router.post("/cambiar-clave")
def cambiar_clave(data: CambiarClaveRequest):
    client = bigquery.Client()

    nueva_hash = hash_clave(data.nueva_clave)

    query = """
        UPDATE `datos-clientes-441216.Conciliaciones.credenciales`
        SET hashed_password = @password,
            clave_defecto = false,
            actualizado_en = CURRENT_TIMESTAMP()
        WHERE correo = @correo
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("correo", "STRING", data.correo),
            bigquery.ScalarQueryParameter("password", "STRING", nueva_hash)
        ]
    )

    client.query(query, job_config=job_config).result()

    return {"mensaje": "Contraseña actualizada correctamente"}

