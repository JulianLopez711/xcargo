from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Form, Body, Request
from pydantic import BaseModel
from typing import Optional
from google.cloud import bigquery
import bcrypt
import logging
import random
import string
import json
import os
from app.core.email_utils import enviar_codigo_verificacion
import jwt

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Archivo temporal para persistencia de códigos
TEMP_CODES_FILE = "temp_codes.json"

# Variables globales para gestión de códigos
codigo_temporal = {}
codigo_expiracion = {}

SECRET_KEY = "supersecreto"
ALGORITHM = "HS256"
CODIGO_DURACION_MINUTOS = 15

def cargar_codigos_desde_archivo():
    """Carga códigos desde archivo al iniciar el servidor"""
    global codigo_temporal, codigo_expiracion
    try:
        if os.path.exists(TEMP_CODES_FILE):
            with open(TEMP_CODES_FILE, 'r') as f:
                data = json.load(f)
                codigo_temporal = data.get('codigos', {})
                codigo_expiracion = {}
                for correo, fecha_str in data.get('expiraciones', {}).items():
                    try:
                        codigo_expiracion[correo] = datetime.fromisoformat(fecha_str)
                    except:
                        pass
                print(f"📁 Códigos cargados desde archivo: {len(codigo_temporal)}")
    except Exception as e:
        print(f"⚠️ Error cargando códigos: {e}")
        codigo_temporal = {}
        codigo_expiracion = {}

def guardar_codigos_en_archivo():
    """Guarda códigos en archivo"""
    try:
        data = {
            'codigos': codigo_temporal,
            'expiraciones': {
                correo: fecha.isoformat() 
                for correo, fecha in codigo_expiracion.items()
            }
        }
        with open(TEMP_CODES_FILE, 'w') as f:
            json.dump(data, f)
        print(f"💾 Códigos guardados: {len(codigo_temporal)}")
    except Exception as e:
        print(f"⚠️ Error guardando códigos: {e}")

def limpiar_codigos_expirados():
    """Limpia códigos expirados automáticamente"""
    ahora = datetime.now()
    expirados = []
    
    for correo, expira in codigo_expiracion.items():
        if ahora > expira:
            expirados.append(correo)
            
    for correo in expirados:
        if correo in codigo_temporal:
            del codigo_temporal[correo]
        if correo in codigo_expiracion:
            del codigo_expiracion[correo]
    
    if expirados:
        print(f"🧹 Códigos expirados limpiados: {len(expirados)} - {expirados}")
        guardar_codigos_en_archivo()
    
    return len(expirados) > 0

def verificar_codigo(correo: str, codigo: str, eliminar: bool = True) -> bool:
    """Verifica si un código es válido y no ha expirado"""
    correo = correo.lower().strip()
    
    # Verificar si existe un código para este correo
    if correo not in codigo_temporal:
        print(f"❌ Código no encontrado en memoria para {correo}")
        return False
    
    # Verificar si el código ha expirado
    if correo in codigo_expiracion:
        ahora = datetime.now()
        if ahora > codigo_expiracion[correo]:
            print(f"❌ Código expirado para {correo}")
            if eliminar:
                limpiar_codigos_expirados()
            return False
    
    # Verificar si el código coincide
    codigo_almacenado = codigo_temporal[correo]
    if codigo != codigo_almacenado:
        print(f"❌ Código inválido para {correo}")
        return False
    
    print(f"✅ Código verificado correctamente para {correo}")
    
    # Solo eliminar si se solicita
    if eliminar:
        eliminar_codigo(correo)
    
    return True

def eliminar_codigo(correo: str):
    """Elimina un código después de usarlo exitosamente"""
    correo = correo.lower().strip()
    if correo in codigo_temporal:
        del codigo_temporal[correo]
    if correo in codigo_expiracion:
        del codigo_expiracion[correo]
    guardar_codigos_en_archivo()

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

    # Si no existe en credenciales, intentar crear automáticamente desde usuarios_big o usuarios
    if not rows and "@" in data.correo:
        print(f"🔄 Usuario {data.correo} no encontrado en credenciales. Verificando origen...")
        print("📬 Correo recibido:", data.correo)
        print("📨 Tipo:", type(data.correo))
        # Buscar en usuarios_big
        query_big = """
            SELECT Employee_Mail AS correo, Employee_Name AS nombre, 'conductor' AS rol
            FROM `datos-clientes-441216.Conciliaciones.usuarios_BIG`
            WHERE LOWER(Employee_Mail) = LOWER(@correo)
            LIMIT 1
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo", "STRING", data.correo)
            ]
        )

        result_big = client.query(query_big, job_config=job_config).result()
        
        if list(result_big):
            print(f"✅ Usuario encontrado en usuarios_big. Creando credencial automática...")
            crear_usuario_conductor_automatico(data.correo, client, origen="big")
        else:
            # Buscar en usuarios
            query_usuarios = """
                SELECT correo FROM `datos-clientes-441216.Conciliaciones.usuarios`
                WHERE correo = @correo LIMIT 1
            """
            result_usuarios = client.query(query_usuarios, job_config=job_config).result()
            if list(result_usuarios):
                print(f"✅ Usuario encontrado en usuarios. Creando credencial automática...")
                crear_usuario_conductor_automatico(data.correo, client, origen="interno")
            else:
                print(f"❌ Usuario no encontrado en ninguna fuente")
                raise HTTPException(status_code=401, detail="Usuario no encontrado")

        # Reintentar búsqueda en credenciales
        result = client.query(query_cred, job_config=job_config).result()
        rows = list(result)

    if not rows:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    cred = rows[0]
    if not bcrypt.checkpw(data.password.encode(), cred["hashed_password"].encode()):
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")

    # 2. Obtener datos completos del usuario
    datos_usuario = obtener_datos_usuario_completos(data.correo, cred["rol"], client)
    if not datos_usuario:
        datos_usuario = {
            "id_usuario": cred.get("id_usuario", ""),
            "nombre": data.correo.split("@")[0].title(),
            "correo": cred["correo"],
            "telefono": "",
            "empresa_carrier": cred.get("empresa_carrier", ""),
            "tipo_usuario": "fallback"
        }
        print(f"⚠️ Usando datos de fallback para {data.correo}")

    # 3. Obtener permisos
    query_permisos = """
        SELECT p.id_permiso, p.nombre, p.modulo, p.ruta
        FROM `datos-clientes-441216.Conciliaciones.rol_permisos` rp
        JOIN `datos-clientes-441216.Conciliaciones.permisos` p 
        ON rp.id_permiso = p.id_permiso
        WHERE rp.id_rol = @rol
    """
    job_config_permisos = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("rol", "STRING", cred["rol"])]
    )
    permisos_result = client.query(query_permisos, job_config=job_config_permisos).result()
    permisos = [{"id": row["id_permiso"], "nombre": row["nombre"], "modulo": row["modulo"], "ruta": row["ruta"]} for row in permisos_result]

    # 4. Obtener ruta por defecto
    query_ruta = """
        SELECT ruta_defecto
        FROM `datos-clientes-441216.Conciliaciones.roles`
        WHERE id_rol = @rol
        LIMIT 1
    """
    job_config_ruta = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("rol", "STRING", cred["rol"])]
    )
    ruta_result = client.query(query_ruta, job_config=job_config_ruta).result()
    ruta_rows = list(ruta_result)

    ruta_defecto = (
        ruta_rows[0]["ruta_defecto"] if ruta_rows and ruta_rows[0]["ruta_defecto"]
        else (permisos[0]["ruta"] if permisos else "/")
    )    # 5. Generar JWT y retornar
    payload = {
        "sub": datos_usuario["correo"],  # Mantener sub para compatibilidad JWT
        "correo": datos_usuario["correo"],  # Agregar correo explícitamente
        "rol": cred["rol"],
        "exp": datetime.utcnow() + timedelta(hours=12)
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

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
        "carrier_id": datos_usuario.get("Carrier_id"),
        "carrier_mail": datos_usuario.get("Carrier_Mail"),
        "token": token
    }


@router.post("/cambiar-clave")
async def cambiar_clave(request: Request):
    """Endpoint para cambiar contraseña con código de verificación"""
    try:
        # Intentar obtener datos como JSON primero
        try:
            data = await request.json()
            correo = data.get("correo")
            nueva_clave = data.get("nueva_clave")
            codigo = data.get("codigo")
        except:
            # Si no es JSON, intentar como form data
            form = await request.form()
            correo = form.get("correo")
            nueva_clave = form.get("nueva_clave")
            codigo = form.get("codigo")
        
        if not all([correo, nueva_clave, codigo]):
            raise HTTPException(
                status_code=422,
                detail="Se requieren correo, nueva contraseña y código"
            )
            
        correo = correo.lower().strip()
        
        print(f"🔄 Cambiando contraseña para: {correo}")
        print(f"   - Código proporcionado: {codigo}")
        print(f"   - Códigos activos: {list(codigo_temporal.keys())}")
        
        # Verificar si hay un código activo
        if correo not in codigo_temporal:
            raise HTTPException(
                status_code=400,
                detail="No hay código activo para este correo. Solicita uno nuevo."
            )
            
        # Verificar el código
        codigo_almacenado = codigo_temporal.get(correo)
        if codigo != codigo_almacenado:
            raise HTTPException(
                status_code=400,
                detail="Código inválido. Por favor verifica e intenta nuevamente."
            )
            
        # Verificar que el código no haya expirado
        if correo not in codigo_expiracion or datetime.now() > codigo_expiracion[correo]:
            raise HTTPException(
                status_code=400,
                detail="El código ha expirado. Por favor solicita uno nuevo."
            )
            
        # Hash de la nueva contraseña
        hashed_password = bcrypt.hashpw(nueva_clave.encode(), bcrypt.gensalt()).decode()
        
        # Actualizar en BigQuery
        client = bigquery.Client()
        query = """
            UPDATE `datos-clientes-441216.Conciliaciones.credenciales`
            SET hashed_password = @password,
                actualizado_en = CURRENT_TIMESTAMP()
            WHERE correo = @correo
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("password", "STRING", hashed_password),
                bigquery.ScalarQueryParameter("correo", "STRING", correo),
            ]
        )
        
        result = client.query(query, job_config=job_config).result()
        
        # Eliminar el código después de usarlo
        eliminar_codigo(correo)
        
        print(f"✅ Contraseña actualizada exitosamente para: {correo}")
        return {"mensaje": "Contraseña actualizada correctamente"}
        
    except Exception as e:
        print(f"❌ Error en cambiar_clave: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=500,
            detail="Error al cambiar la contraseña. Por favor intente nuevamente."
        )

@router.post("/solicitar-codigo")
def solicitar_codigo(correo: str = Form(...)):
    """Endpoint para solicitar código de recuperación de contraseña"""
    client = bigquery.Client()
    correo = correo.lower().strip()
    
    print(f"📧 Iniciando solicitud de código para: {correo}")
    print(f"   - Códigos actuales en memoria: {len(codigo_temporal)}")
    
    # Limpiar códigos expirados
    limpiar_codigos_expirados()
    
    try:
        # Verificar que el usuario existe en ambas tablas
        query_usuario = """
        SELECT u.correo, u.nombre, c.rol
        FROM `datos-clientes-441216.Conciliaciones.usuarios` u
        JOIN `datos-clientes-441216.Conciliaciones.credenciales` c
        ON u.correo = c.correo
        WHERE u.correo = @correo
        LIMIT 1
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo", "STRING", correo)
            ]
        )

        # Ejecutar consulta
        result = client.query(query_usuario, job_config=job_config).result()
        usuario = next(result, None)

        if not usuario:
            print(f"❌ Usuario no encontrado: {correo}")
            raise HTTPException(
                status_code=404, 
                detail="No se encontró una cuenta asociada a este correo electrónico"
            )
        
        # Generar código aleatorio de 6 dígitos
        codigo = ''.join(random.choices(string.digits, k=6))
        
        # Guardar código y su tiempo de expiración (15 minutos)
        codigo_temporal[correo] = codigo
        codigo_expiracion[correo] = datetime.now() + timedelta(minutes=15)
        
        # Persistir códigos en archivo
        guardar_codigos_en_archivo()
        
        # Enviar correo con el código
        enviar_codigo_verificacion(correo, codigo)
        
        print(f"✅ Código enviado exitosamente a: {correo}")
        return {
            "mensaje": "Código enviado correctamente",
            "correo": correo,
            "expiracion": codigo_expiracion[correo].isoformat()
        }
        
    except Exception as e:
        print(f"❌ Error en solicitar_codigo: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        logger.error(f"Error enviando código: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail="Error al enviar el código de verificación. Por favor intente nuevamente."
        )

@router.post("/verificar-codigo")
async def verificar_codigo_endpoint(request: Request):
    """Endpoint para verificar código de recuperación"""
    try:
        # Intentar obtener datos como JSON primero
        try:
            data = await request.json()
            correo = data.get("correo")
            codigo = data.get("codigo")
        except:
            # Si no es JSON, intentar como form data
            form = await request.form()
            correo = form.get("correo")
            codigo = form.get("codigo")
        
        if not correo or not codigo:
            raise HTTPException(
                status_code=422,
                detail="Se requiere correo y código"
            )
            
        correo = correo.lower().strip()
        
        print(f"🔍 Verificando código para: {correo}")
        print(f"   - Código recibido: {codigo}")
        print(f"   - Total códigos en memoria: {len(codigo_temporal)}")
        print(f"   - Todos los códigos: {list(codigo_temporal.keys())}")
        
        if correo in codigo_temporal:
            print(f"   - Código almacenado para este correo: {codigo_temporal[correo]}")
        
        # Verificar el código sin eliminarlo
        if not verificar_codigo(correo, codigo, eliminar=False):
            raise HTTPException(
                status_code=400,
                detail="Código inválido o expirado. Por favor solicite un nuevo código."
            )
        
        # Extender el tiempo de expiración por 5 minutos más para dar tiempo a cambiar la contraseña
        if correo in codigo_expiracion:
            codigo_expiracion[correo] = datetime.now() + timedelta(minutes=5)
            guardar_codigos_en_archivo()
        
        return {
            "mensaje": "Código verificado correctamente",
            "correo": correo
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error en verificar_codigo_endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Error al verificar el código. Por favor intente nuevamente."
        )

@router.get("/debug-codigos")
async def debug_codigos():
    """Endpoint para verificar códigos activos (solo en desarrollo)"""
    codigos_activos = {}
    ahora = datetime.now()
    
    for correo, codigo in codigo_temporal.items():
        if correo in codigo_expiracion and codigo_expiracion[correo] > ahora:
            codigos_activos[correo] = {
                "codigo": codigo,
                "expira": codigo_expiracion[correo].isoformat()
            }
    
    return {
        "codigos_activos": codigos_activos,
        "total_codigos": len(codigos_activos),
        "timestamp": ahora.isoformat()
    }

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

def crear_usuario_conductor_automatico(correo: str, client: bigquery.Client, origen: str = "big"):
    """
    Crea automáticamente credenciales para un usuario que existe en usuarios_BIG o usuarios
    pero no tiene credenciales aún
    """
    try:
        if origen == "big":
            # CASO 1: Usuario de usuarios_BIG (conductores)
            # Verificar existencia en tabla usuarios_BIG
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
                print(f"❌ Usuario {correo} no existe en usuarios_BIG")
                return False
                
            usuario_data = dict(rows[0])
            
            # Crear credenciales automáticamente
            hashed_password = hash_clave("Xcargo123")  # Clave por defecto
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
                    bigquery.ScalarQueryParameter("id_usuario", "STRING", str(usuario_data["Employee_id"])),
                    bigquery.ScalarQueryParameter("empresa", "STRING", usuario_data.get("Carrier_Name", ""))
                ]
            )
            
            client.query(query_insert, job_config=job_config_insert).result()
            
            print(f"✅ Credenciales creadas automáticamente para conductor: {usuario_data['Employee_Name']}")
            return True
            
        elif origen == "interno":
            # CASO 2: Usuario de tabla usuarios (administrativos)
            # Buscar los datos del usuario interno
            query_check = """
                SELECT id_usuario, nombre, correo, telefono, empresa_carrier
                FROM `datos-clientes-441216.Conciliaciones.usuarios`
                WHERE LOWER(correo) = LOWER(@correo)
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
                print(f"❌ Usuario {correo} no existe en usuarios")
                return False
                
            usuario_data = dict(rows[0])
            
            # Asignación inteligente de roles basada en el correo
            rol = "operador"  # rol predeterminado
            if "@x-cargo.co" in correo.lower():
                # Asignar rol según palabras clave en el correo
                if "admin" in correo.lower():
                    rol = "admin"  # Administrador del sistema
                elif "contabilidad" in correo.lower() or "contable" in correo.lower():
                    rol = "contabilidad"  # Usuario de contabilidad
                elif "supervisor" in correo.lower():
                    rol = "supervisor"  # Supervisor de operaciones
                else:
                    rol = "operador"  # Operador regular
            
            # Crear credenciales con contraseña por defecto
            hashed_password = hash_clave("Xcargo123")  # TODO: Cambiar en producción
            ahora = datetime.utcnow()
            
            # Query para insertar nuevas credenciales
            query_insert = """
                INSERT INTO `datos-clientes-441216.Conciliaciones.credenciales`
                (correo, hashed_password, rol, clave_defecto, creado_en, id_usuario, empresa_carrier)
                VALUES (@correo, @hashed, @rol, TRUE, @creado_en, @id_usuario, @empresa)
            """
            
            # Configurar parámetros de la query
            job_config_insert = bigquery.QueryJobConfig(
                query_parameters=[
                    # Datos básicos del usuario
                    bigquery.ScalarQueryParameter("correo", "STRING", correo),
                    bigquery.ScalarQueryParameter("hashed", "STRING", hashed_password),
                    bigquery.ScalarQueryParameter("rol", "STRING", rol),
                    # Metadatos de creación
                    bigquery.ScalarQueryParameter("creado_en", "TIMESTAMP", ahora),
                    bigquery.ScalarQueryParameter("id_usuario", "STRING", usuario_data["id_usuario"]),
                    # Datos de empresa
                    bigquery.ScalarQueryParameter("empresa", "STRING", usuario_data.get("empresa_carrier", ""))
                ]
            )
            
            # Ejecutar la inserción
            client.query(query_insert, job_config=job_config_insert).result()
            
            print(f"✅ Credenciales creadas automáticamente para usuario interno: {usuario_data['nombre']} con rol {rol}")
            return True
        
        else:
            # Origen no reconocido
            print(f"❌ Origen desconocido: {origen}")
            return False
            
    except Exception as e:
        # Manejo de errores con logging detallado
        print(f"❌ Error creando usuario automático: {e}")
        import traceback
        traceback.print_exc()
        return False