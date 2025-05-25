from fastapi import APIRouter, HTTPException, Form
from pydantic import BaseModel
from typing import Optional
from google.cloud import bigquery
import bcrypt
import random
import string
from app.core.email_utils import enviar_codigo_verificacion

router = APIRouter(prefix="/auth", tags=["Auth"])

class LoginRequest(BaseModel):
    correo: str
    password: str

class CambiarClaveRequest(BaseModel):
    correo: str
    nueva_clave: str
    codigo: Optional[str] = None

class VerificarCodigoRequest(BaseModel):
    correo: str
    codigo: str

codigo_temporal = {}

def hash_clave(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode(), bcrypt.gensalt()).decode()

@router.post("/login")
def login(data: LoginRequest):
    client = bigquery.Client()
    
    # 1. Verificar credenciales
    query_cred = """
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
    result = client.query(query_cred, job_config=job_config).result()
    rows = list(result)

    if not rows:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    cred = rows[0]
    if not bcrypt.checkpw(data.password.encode(), cred["hashed_password"].encode()):
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")

    # 2. Obtener permisos del usuario
    query_permisos = """
        SELECT p.id_permiso, p.nombre, p.modulo, p.ruta
        FROM `datos-clientes-441216.Conciliaciones.rol_permisos` rp
        JOIN `datos-clientes-441216.Conciliaciones.permisos` p 
        ON rp.id_permiso = p.id_permiso
        WHERE rp.id_rol = @rol
    """
    job_config_permisos = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("rol", "STRING", cred["rol"])
        ]
    )
    permisos_result = client.query(query_permisos, job_config=job_config_permisos).result()
    permisos = [{"id": row["id_permiso"], "nombre": row["nombre"], "modulo": row["modulo"], "ruta": row["ruta"]} for row in permisos_result]

    # 3. Obtener ruta por defecto del rol
    query_ruta = """
        SELECT ruta_defecto
        FROM `datos-clientes-441216.Conciliaciones.roles`
        WHERE id_rol = @rol
        LIMIT 1
    """
    job_config_ruta = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("rol", "STRING", cred["rol"])
        ]
    )
    ruta_result = client.query(query_ruta, job_config=job_config_ruta).result()
    ruta_rows = list(ruta_result)
    
    # 4. Determinar ruta de redirección
    ruta_defecto = None
    if ruta_rows and ruta_rows[0]["ruta_defecto"]:
        ruta_defecto = ruta_rows[0]["ruta_defecto"]
    elif permisos:
        # Fallback: usar la primera ruta disponible de los permisos
        ruta_defecto = permisos[0]["ruta"]
    else:
        # Fallback final
        ruta_defecto = "/"

    return {
        "correo": cred["correo"],
        "rol": cred["rol"],
        "clave_defecto": cred["clave_defecto"],
        "permisos": permisos,
        "ruta_defecto": ruta_defecto
    }

@router.post("/cambiar-clave")
def cambiar_clave(data: CambiarClaveRequest):
    client = bigquery.Client()

    if data.codigo:
        if codigo_temporal.get(data.correo) != data.codigo:
            raise HTTPException(status_code=400, detail="Código inválido o expirado")

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

    # Eliminar código usado
    if data.correo in codigo_temporal:
        del codigo_temporal[data.correo]

    return {"mensaje": "Contraseña actualizada correctamente"}

@router.post("/solicitar-codigo")
def solicitar_codigo(correo: str = Form(...)):
    client = bigquery.Client()
    query = """
        SELECT correo
        FROM `datos-clientes-441216.Conciliaciones.credenciales`
        WHERE correo = @correo
        LIMIT 1
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("correo", "STRING", correo)
        ]
    )
    result = client.query(query, job_config=job_config).result()
    if not list(result):
        raise HTTPException(status_code=404, detail="Correo no registrado")

    codigo = ''.join(random.choices(string.digits, k=6))
    codigo_temporal[correo] = codigo
    enviado = enviar_codigo_verificacion(correo, codigo)
    if not enviado:
        raise HTTPException(status_code=500, detail="Error al enviar el correo")

    return {"mensaje": "Código enviado correctamente al correo"}

@router.post("/verificar-codigo")
def verificar_codigo(data: VerificarCodigoRequest):
    if codigo_temporal.get(data.correo) != data.codigo:
        raise HTTPException(status_code=400, detail="Código incorrecto o expirado")
    return {"mensaje": "Código verificado. Puedes cambiar tu contraseña."}
