from fastapi import APIRouter, HTTPException, Form, Depends
from google.cloud import bigquery
from datetime import datetime
from uuid import uuid4
import bcrypt
import os

from app.dependencies import get_current_user

router = APIRouter(prefix="/admin", tags=["Administrador"])

PROJECT_ID = "datos-clientes-441216"
DATASET = "Conciliaciones"

bq_client = bigquery.Client()

# Helper para generar IDs

def generar_id_usuario():
    return f"USR{str(uuid4())[:5].upper()}"

# Helper para hashear contraseña

def hashear_clave(plain_password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(plain_password.encode('utf-8'), salt)
    return hashed.decode()

# Verificar rol admin

def verificar_admin(user = Depends(get_current_user)):
    if user["rol"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    return user

# Crear usuario
@router.post("/crear-usuario")
async def crear_usuario(
    nombre: str = Form(...),
    correo: str = Form(...),
    telefono: str = Form(...),
    rol: str = Form(...),
    user = Depends(verificar_admin)
):
    id_usuario = generar_id_usuario()
    ahora = datetime.utcnow()

    # Insertar en usuarios
    query_usuarios = f"""
        INSERT INTO `{PROJECT_ID}.{DATASET}.usuarios`
        (id_usuario, nombre, correo, telefono, creado_en)
        VALUES (@id_usuario, @nombre, @correo, @telefono, @creado_en)
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("id_usuario", "STRING", id_usuario),
            bigquery.ScalarQueryParameter("nombre", "STRING", nombre),
            bigquery.ScalarQueryParameter("correo", "STRING", correo),
            bigquery.ScalarQueryParameter("telefono", "STRING", telefono),
            bigquery.ScalarQueryParameter("creado_en", "TIMESTAMP", ahora),
        ]
    )
    bq_client.query(query_usuarios, job_config=job_config).result()

    # Insertar en credenciales
    hashed_password = hashear_clave("123456")
    query_credenciales = f"""
        INSERT INTO `{PROJECT_ID}.{DATASET}.credenciales`
        (correo, hashed_password, rol, clave_defecto, creado_en, id_usuario)
        VALUES (@correo, @hashed, @rol, TRUE, @creado_en, @id_usuario)
    """
    job_config2 = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("correo", "STRING", correo),
            bigquery.ScalarQueryParameter("hashed", "STRING", hashed_password),
            bigquery.ScalarQueryParameter("rol", "STRING", rol),
            bigquery.ScalarQueryParameter("creado_en", "TIMESTAMP", ahora),
            bigquery.ScalarQueryParameter("id_usuario", "STRING", id_usuario),
        ]
    )
    bq_client.query(query_credenciales, job_config=job_config2).result()
    return {"mensaje": "Usuario creado con clave por defecto (123456)"}

# Cambiar rol
@router.post("/cambiar-rol")
async def cambiar_rol_usuario(
    correo: str = Form(...),
    nuevo_rol: str = Form(...),
    user = Depends(verificar_admin)
):
    ahora = datetime.utcnow()
    query = f"""
        UPDATE `{PROJECT_ID}.{DATASET}.credenciales`
        SET rol = @nuevo_rol, actualizado_en = @ahora
        WHERE correo = @correo
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("nuevo_rol", "STRING", nuevo_rol),
            bigquery.ScalarQueryParameter("ahora", "TIMESTAMP", ahora),
            bigquery.ScalarQueryParameter("correo", "STRING", correo),
        ]
    )
    bq_client.query(query, job_config=job_config).result()
    return {"mensaje": "Rol actualizado correctamente"}

# Crear rol
@router.post("/crear-rol")
async def crear_rol(
    id_rol: str = Form(...),
    nombre_rol: str = Form(...),
    descripcion: str = Form(None),
    user = Depends(verificar_admin)
):
    query = f"""
        INSERT INTO `{PROJECT_ID}.{DATASET}.roles`
        (id_rol, nombre_rol, descripcion)
        VALUES (@id, @nombre, @desc)
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("id", "STRING", id_rol),
            bigquery.ScalarQueryParameter("nombre", "STRING", nombre_rol),
            bigquery.ScalarQueryParameter("desc", "STRING", descripcion),
        ]
    )
    bq_client.query(query, job_config=job_config).result()
    return {"mensaje": "Rol creado correctamente"}

# Restablecer clave
@router.post("/restablecer-clave")
async def restablecer_clave(
    correo: str = Form(...),
    user = Depends(verificar_admin)
):
    nueva_hash = hashear_clave("123456")
    ahora = datetime.utcnow()

    query = f"""
        UPDATE `{PROJECT_ID}.{DATASET}.credenciales`
        SET hashed_password = @clave, clave_defecto = TRUE, actualizado_en = @ahora
        WHERE correo = @correo
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("clave", "STRING", nueva_hash),
            bigquery.ScalarQueryParameter("ahora", "TIMESTAMP", ahora),
            bigquery.ScalarQueryParameter("correo", "STRING", correo),
        ]
    )
    bq_client.query(query, job_config=job_config).result()
    return {"mensaje": "Clave restablecida a valor por defecto (123456)"}
