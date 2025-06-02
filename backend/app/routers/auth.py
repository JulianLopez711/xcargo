from datetime import datetime
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
        SELECT correo, hashed_password, rol, clave_defecto, id_usuario, empresa_carrier
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

    # Si no existe en credenciales pero es conductor, crear automáticamente
    if not rows and "@" in data.correo:
        print(f"🔄 Usuario {data.correo} no encontrado en credenciales, verificando si es conductor...")
        if crear_usuario_conductor_automatico(data.correo, client):
            # Intentar nuevamente después de crear las credenciales
            result = client.query(query_cred, job_config=job_config).result()
            rows = list(result)

    if not rows:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    cred = rows[0]
    if not bcrypt.checkpw(data.password.encode(), cred["hashed_password"].encode()):
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")

    # 2. Obtener datos completos del usuario (NUEVA FUNCIONALIDAD)
    datos_usuario = obtener_datos_usuario_completos(data.correo, cred["rol"], client)
    
    if not datos_usuario:
        # Fallback: usar datos básicos de credenciales
        datos_usuario = {
            "id_usuario": cred.get("id_usuario", ""),
            "nombre": data.correo.split("@")[0].title(),
            "correo": cred["correo"],
            "telefono": "",
            "empresa_carrier": cred.get("empresa_carrier", ""),
            "tipo_usuario": "fallback"
        }
        print(f"⚠️ Usando datos de fallback para {data.correo}")

    # 3. Obtener permisos del usuario
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

    # 4. Obtener ruta por defecto del rol
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
    
    # 5. Determinar ruta de redirección
    ruta_defecto = None
    if ruta_rows and ruta_rows[0]["ruta_defecto"]:
        ruta_defecto = ruta_rows[0]["ruta_defecto"]
    elif permisos:
        ruta_defecto = permisos[0]["ruta"]
    else:
        ruta_defecto = "/"

    # 6. Respuesta unificada con datos completos
    return {
        "id_usuario": datos_usuario["id_usuario"],
        "nombre": datos_usuario["nombre"],
        "correo": datos_usuario["correo"],
        "telefono": datos_usuario.get("telefono", ""),
        "rol": cred["rol"],
        "empresa_carrier": datos_usuario.get("empresa_carrier", ""),
        "clave_defecto": cred["clave_defecto"],
        "permisos": permisos,
        "ruta_defecto": ruta_defecto,
        "tipo_usuario": datos_usuario.get("tipo_usuario", ""),
        # Campos adicionales para conductores
        "carrier_id": datos_usuario.get("Carrier_id"),
        "carrier_mail": datos_usuario.get("Carrier_Mail")
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

def obtener_datos_usuario_completos(correo: str, rol: str, client: bigquery.Client):
    """
        Obtiene los datos completos del usuario desde usuarios o usuarios_BIG según el rol
    """
    try:
        if rol in ["admin", "contabilidad", "supervisor", "operador"]:
            # Usuarios administrativos - buscar en tabla usuarios
            query_admin = """
                SELECT 
                    id_usuario,
                    nombre,
                    correo,
                    telefono,
                    empresa_carrier,
                    creado_en,
                    'administrativo' as tipo_usuario
                FROM `datos-clientes-441216.Conciliaciones.usuarios`
                WHERE correo = @correo
                LIMIT 1
            """
            
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("correo", "STRING", correo)
                ]
            )
            
            result = client.query(query_admin, job_config=job_config).result()
            rows = list(result)
            
            if rows:
                user_data = dict(rows[0])
                print(f"✅ Usuario administrativo encontrado: {user_data['nombre']}")
                return user_data
            else:
                print(f"⚠️ Usuario administrativo no encontrado: {correo}")
                return None
                
        elif rol == "conductor":
            # Conductores - buscar en tabla usuarios_BIG
            query_conductor = """
                SELECT 
                    CAST(Employee_id AS STRING) as id_usuario,
                    Employee_Name as nombre,
                    Employee_Mail as correo,
                    Employee_Phone as telefono,
                    Carrier_Name as empresa_carrier,
                    Created as creado_en,
                    'conductor' as tipo_usuario,
                    Carrier_id,
                    Carrier_Mail
                FROM `datos-clientes-441216.Conciliaciones.usuarios_BIG`
                WHERE LOWER(Employee_Mail) = LOWER(@correo)
                   OR LOWER(Employee_Mail) LIKE LOWER(@correo_pattern)
                LIMIT 1
            """
            
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("correo", "STRING", correo),
                    bigquery.ScalarQueryParameter("correo_pattern", "STRING", f"%{correo}%")
                ]
            )
            
            result = client.query(query_conductor, job_config=job_config).result()
            rows = list(result)
            
            if rows:
                user_data = dict(rows[0])
                print(f"✅ Conductor encontrado: {user_data['nombre']}")
                return user_data
            else:
                print(f"⚠️ Conductor no encontrado: {correo}")
                return None
        else:
            print(f"⚠️ Rol no reconocido: {rol}")
            return None
            
    except Exception as e:
        print(f"❌ Error obteniendo datos de usuario: {e}")
        import traceback
        traceback.print_exc()
        return None

def crear_usuario_conductor_automatico(correo: str, client: bigquery.Client):
    """
    Crea automáticamente credenciales para un conductor que existe en usuarios_BIG
    pero no tiene credenciales aún
    """
    try:
        # Verificar si el conductor existe en usuarios_BIG
        query_check = """
            SELECT Employee_id, Employee_Name, Employee_Mail, Carrier_Name
            FROM `datos-clientes-441216.Conciliaciones.usuarios_BIG`
            WHERE LOWER(Employee_Mail) = LOWER(@correo)
            LIMIT 1
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo", "STRING", correo)
            ]
        )
        
        result = client.query(query_check, job_config=job_config).result()
        rows = list(result)
        
        if not rows:
            print(f"❌ Conductor {correo} no existe en usuarios_BIG")
            return False
            
        conductor = dict(rows[0])
        
        # Crear credenciales automáticamente
        hashed_password = hash_clave("123456")  # Clave por defecto
        ahora = datetime.utcnow()
        
        query_insert = """
            INSERT INTO `datos-clientes-441216.Conciliaciones.credenciales`
            (correo, hashed_password, rol, clave_defecto, creado_en, id_usuario, empresa_carrier)
            VALUES (@correo, @hashed, 'conductor', TRUE, @creado_en, @id_usuario, @empresa)
        """
        
        job_config_insert = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo", "STRING", correo),
                bigquery.ScalarQueryParameter("hashed", "STRING", hashed_password),
                bigquery.ScalarQueryParameter("creado_en", "TIMESTAMP", ahora),
                bigquery.ScalarQueryParameter("id_usuario", "STRING", str(conductor["Employee_id"])),
                bigquery.ScalarQueryParameter("empresa", "STRING", conductor.get("Carrier_Name", ""))
            ]
        )
        
        client.query(query_insert, job_config=job_config_insert).result()
        
        print(f"✅ Credenciales creadas automáticamente para conductor: {conductor['Employee_Name']}")
        return True
        
    except Exception as e:
        print(f"❌ Error creando conductor automático: {e}")
        return False