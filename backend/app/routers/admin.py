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
    hashed_password = hashear_clave("Xcargo123")
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
    return {"mensaje": "Usuario creado con clave por defecto (Xcargo123)"}

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
    nueva_hash = hashear_clave("Xcargo123")
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
    return {"mensaje": "Clave restablecida a valor por defecto (Xcargo123)"}

@router.get("/permisos")
async def listar_permisos(user = Depends(verificar_admin)):
    query = f"""
        SELECT id_permiso, nombre, descripcion, modulo, ruta
        FROM `{PROJECT_ID}.{DATASET}.permisos`
        ORDER BY modulo, nombre
    """
    result = bq_client.query(query).result()
    return [dict(row) for row in result]

# Obtener permisos de un rol específico
@router.get("/rol/{id_rol}/permisos")
async def obtener_permisos_rol(id_rol: str, user = Depends(verificar_admin)):
    query = f"""
        SELECT p.id_permiso, p.nombre, p.descripcion, p.modulo, p.ruta
        FROM `{PROJECT_ID}.{DATASET}.rol_permisos` rp
        JOIN `{PROJECT_ID}.{DATASET}.permisos` p ON rp.id_permiso = p.id_permiso
        WHERE rp.id_rol = @id_rol
        ORDER BY p.modulo, p.nombre
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("id_rol", "STRING", id_rol)
        ]
    )
    result = bq_client.query(query, job_config=job_config).result()
    return [dict(row) for row in result]

# Asignar/actualizar permisos de un rol
@router.post("/rol/{id_rol}/permisos")
async def asignar_permisos_rol(
    id_rol: str,
    permisos_ids: list = Form(...),
    user = Depends(verificar_admin)
):
    # 1. Eliminar permisos actuales del rol
    delete_query = f"""
        DELETE FROM `{PROJECT_ID}.{DATASET}.rol_permisos`
        WHERE id_rol = @id_rol
    """
    job_config_delete = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("id_rol", "STRING", id_rol)
        ]
    )
    bq_client.query(delete_query, job_config=job_config_delete).result()

    # 2. Insertar nuevos permisos
    if permisos_ids:
        values = []
        for permiso_id in permisos_ids:
            values.append(f"('{id_rol}', '{permiso_id}')")
        
        insert_query = f"""
            INSERT INTO `{PROJECT_ID}.{DATASET}.rol_permisos` (id_rol, id_permiso)
            VALUES {','.join(values)}
        """
        bq_client.query(insert_query).result()

    return {"mensaje": f"Permisos actualizados para el rol {id_rol}"}

# Crear nuevo permiso
@router.post("/crear-permiso")
async def crear_permiso(
    id_permiso: str = Form(...),
    nombre: str = Form(...),
    descripcion: str = Form(None),
    modulo: str = Form(...),
    ruta: str = Form(None),
    user = Depends(verificar_admin)
):
    query = f"""
        INSERT INTO `{PROJECT_ID}.{DATASET}.permisos`
        (id_permiso, nombre, descripcion, modulo, ruta)
        VALUES (@id_permiso, @nombre, @descripcion, @modulo, @ruta)
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("id_permiso", "STRING", id_permiso),
            bigquery.ScalarQueryParameter("nombre", "STRING", nombre),
            bigquery.ScalarQueryParameter("descripcion", "STRING", descripcion),
            bigquery.ScalarQueryParameter("modulo", "STRING", modulo),
            bigquery.ScalarQueryParameter("ruta", "STRING", ruta),
        ]
    )
    bq_client.query(query, job_config=job_config).result()
    return {"mensaje": "Permiso creado correctamente"}

# Listar todos los roles con sus permisos
@router.get("/roles-con-permisos")
async def listar_roles_con_permisos(user = Depends(verificar_admin)):
    query = f"""
        SELECT 
            r.id_rol,
            r.nombre_rol, 
            r.descripcion,
            r.ruta_defecto,
            ARRAY_AGG(
                STRUCT(
                    p.id_permiso,
                    p.nombre as permiso_nombre,
                    p.modulo
                )
            ) as permisos
        FROM `{PROJECT_ID}.{DATASET}.roles` r
        LEFT JOIN `{PROJECT_ID}.{DATASET}.rol_permisos` rp ON r.id_rol = rp.id_rol
        LEFT JOIN `{PROJECT_ID}.{DATASET}.permisos` p ON rp.id_permiso = p.id_permiso
        GROUP BY r.id_rol, r.nombre_rol, r.descripcion, r.ruta_defecto
        ORDER BY r.nombre_rol
    """
    result = bq_client.query(query).result()
    return [dict(row) for row in result]

# Actualizar ruta por defecto de un rol
@router.post("/rol/{id_rol}/ruta-defecto")
async def actualizar_ruta_defecto(
    id_rol: str,
    ruta_defecto: str = Form(...),
    user = Depends(verificar_admin)
):
    query = f"""
        UPDATE `{PROJECT_ID}.{DATASET}.roles`
        SET ruta_defecto = @ruta_defecto
        WHERE id_rol = @id_rol
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("id_rol", "STRING", id_rol),
            bigquery.ScalarQueryParameter("ruta_defecto", "STRING", ruta_defecto),
        ]
    )
    bq_client.query(query, job_config=job_config).result()
    return {"mensaje": f"Ruta por defecto actualizada para {id_rol}"}

# Eliminar permiso
@router.delete("/permiso/{id_permiso}")
async def eliminar_permiso(id_permiso: str, user = Depends(verificar_admin)):
    # 1. Eliminar de rol_permisos primero
    delete_rel_query = f"""
        DELETE FROM `{PROJECT_ID}.{DATASET}.rol_permisos`
        WHERE id_permiso = @id_permiso
    """
    job_config_rel = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("id_permiso", "STRING", id_permiso)
        ]
    )
    bq_client.query(delete_rel_query, job_config=job_config_rel).result()

    # 2. Eliminar el permiso
    delete_query = f"""
        DELETE FROM `{PROJECT_ID}.{DATASET}.permisos`
        WHERE id_permiso = @id_permiso
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("id_permiso", "STRING", id_permiso)
        ]
    )
    bq_client.query(delete_query, job_config=job_config).result()
    return {"mensaje": "Permiso eliminado correctamente"}