from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Form, Body
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
        print(f"⚠️ Error guardando: {e}")

def limpiar_codigos_expirados():
    """Limpia códigos expirados automáticamente"""
    ahora = datetime.utcnow()
    expirados = [
        correo for correo, expira in codigo_expiracion.items() 
        if ahora > expira
    ]
    for correo in expirados:
        if correo in codigo_temporal:
            del codigo_temporal[correo]
        del codigo_expiracion[correo]
    
    if expirados:
        print(f"🧹 Códigos expirados limpiados: {len(expirados)} - {expirados}")
        guardar_codigos_en_archivo()

# Cargar códigos al inicializar el módulo
cargar_codigos_desde_archivo()

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

        # Buscar en usuarios_big
        query_big = """
            SELECT correo FROM `datos-clientes-441216.Conciliaciones.usuarios_big`
            WHERE correo = @correo LIMIT 1
        """
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
    )

    # 5. Generar JWT y retornar
    payload = {
        "sub": datos_usuario["correo"],
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
def cambiar_clave(request_data: dict = Body(...)):
    """
    Endpoint unificado para cambio de contraseña
    Maneja: recuperación con código, cambio normal, y primera configuración
    """
    # Cargar códigos por si el servidor se reinició
    cargar_codigos_desde_archivo()
    
    client = bigquery.Client()
    
    try:
        
        # DETECTAR TIPO DE SOLICITUD
        correo = request_data.get("correo", "").lower().strip()
        nueva_clave = request_data.get("nueva_clave", "")
        codigo = request_data.get("codigo")
        
        # DEBUG: Mostrar estado de códigos
        print(f"🔍 DEBUG códigos:")
        print(f"   - Correo solicitante: {correo}")
        print(f"   - Código recibido: {codigo}")
        print(f"   - Códigos temporales activos: {list(codigo_temporal.keys())}")
        print(f"   - Código almacenado para este correo: {codigo_temporal.get(correo, 'NO ENCONTRADO')}")
        print(f"   - Archivo de códigos existe: {os.path.exists(TEMP_CODES_FILE)}")
        
        # Mostrar información de expiración
        if correo in codigo_expiracion:
            print(f"   - Expiración: {codigo_expiracion[correo]}")
            print(f"   - Tiempo actual: {datetime.utcnow()}")
            print(f"   - ¿Expirado?: {datetime.utcnow() > codigo_expiracion[correo]}")
        
        # Validaciones básicas
        if not correo or '@' not in correo:
            raise HTTPException(status_code=400, detail="Correo válido requerido")
        
        if not nueva_clave or len(nueva_clave) < 8:
            raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")
        
        # CASO 1: Recuperación con código
        if codigo:
            # Limpiar códigos expirados primero
            limpiar_codigos_expirados()
            
            # Verificar que existe el código para este correo
            if correo not in codigo_temporal:
                print(f"❌ No hay código activo para {correo}")
                print(f"   - Intentando recargar desde archivo...")
                cargar_codigos_desde_archivo()
                
                if correo not in codigo_temporal:
                    raise HTTPException(status_code=400, detail="No hay código activo para este correo. Solicita uno nuevo.")
                else:
                    print(f"✅ Código encontrado después de recargar archivo")
            
            # Verificar expiración específica
            if correo in codigo_expiracion and datetime.utcnow() > codigo_expiracion[correo]:
                print(f"❌ Código expirado para {correo}")
                # Limpiar código expirado
                del codigo_temporal[correo]
                del codigo_expiracion[correo]
                guardar_codigos_en_archivo()
                raise HTTPException(status_code=400, detail="Código expirado. Solicita uno nuevo.")
            
            # Verificar coincidencia del código
            if codigo_temporal.get(correo) != codigo:
                print(f"❌ Código incorrecto: esperado={codigo_temporal.get(correo)}, recibido={codigo}")
                raise HTTPException(status_code=400, detail="Código incorrecto")
            
            print(f"✅ Código validado correctamente para {correo}")
        
        # Verificar que el usuario existe
        query_exists = """
            SELECT correo, clave_defecto
            FROM `datos-clientes-441216.Conciliaciones.credenciales`
            WHERE correo = @correo
            LIMIT 1
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo", "STRING", correo)
            ]
        )
        result = client.query(query_exists, job_config=job_config).result()
        rows = list(result)
        
        if not rows:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
        # Actualizar contraseña
        nueva_hash = hash_clave(nueva_clave)
        
        query_insert_clave = f"""
            INSERT INTO `datos-clientes-441216.Conciliaciones.credenciales` (
                correo, clave, creado_en, forzar_cambio
            )
            VALUES (
                @correo, @clave, CURRENT_TIMESTAMP(), FALSE
            )
            """

        job_config_insert = bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("correo", "STRING", correo),
            bigquery.ScalarQueryParameter("clave", "STRING", nueva_clave),
        ])

        client.query(query_insert_clave, job_config=job_config_insert).result()
        logger.info(f"✅ Nueva clave insertada correctamente para {correo}")
        
        # Eliminar código usado si existe
        if correo in codigo_temporal:
            del codigo_temporal[correo]
            print(f"🧹 Código eliminado después del uso exitoso")
        if correo in codigo_expiracion:
            del codigo_expiracion[correo]
        
        # Actualizar archivo
        guardar_codigos_en_archivo()
        
        print(f"✅ Contraseña actualizada exitosamente para: {correo}")
        return {"mensaje": "Contraseña actualizada correctamente"}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error en cambiar_clave: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error interno del servidor")

@router.post("/solicitar-codigo")
def solicitar_codigo(
    correo: str = Form(...),
    clave_ingresada: str = Form(...)
):
    client = bigquery.Client()
    correo = correo.lower().strip()
    
    print(f"📧 Iniciando solicitud de código para: {correo}")
    print(f"   - Códigos actuales en memoria: {len(codigo_temporal)}")
    
    # Limpiar códigos expirados
    limpiar_codigos_expirados()
    
    # Verificar que el usuario existe
    query_clave = """
    SELECT clave
    FROM `datos-clientes-441216.Conciliaciones.credenciales`
    WHERE correo = @correo
    ORDER BY creado_en DESC
    LIMIT 1
    """

    job_config = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("correo", "STRING", correo),
    ])

    result = client.query(query_clave, job_config=job_config).result()
    clave_registrada = next(result, None)

    if not clave_registrada:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    # Validar la clave con la ingresada
    if clave_registrada.clave != clave_ingresada:
        raise HTTPException(status_code=401, detail="Clave incorrecta")

    # Generar código con expiración
    codigo = ''.join(random.choices(string.digits, k=6))
    expiracion = datetime.utcnow() + timedelta(minutes=15)
    
    # Guardar en memoria
    codigo_temporal[correo] = codigo
    codigo_expiracion[correo] = expiracion
    
    # Guardar en archivo para persistencia
    guardar_codigos_en_archivo()
    
    print(f"📧 Código generado y guardado:")
    print(f"   - Correo: {correo}")
    print(f"   - Código: {codigo}")
    print(f"   - Expira: {expiracion}")
    print(f"   - Total códigos: {len(codigo_temporal)}")
    print(f"   - Guardado en archivo: ✅")
    
    # Enviar código por email
    try:
        enviado = enviar_codigo_verificacion(correo, codigo)
        if not enviado:
            print(f"⚠️ Email falló, pero código mantenido para desarrollo")
        else:
            print(f"✅ Email enviado exitosamente")
    except Exception as e:
        print(f"⚠️ Error enviando email: {e}")
        print(f"   - Código mantenido para desarrollo")

    return {
        "mensaje": "Código enviado correctamente al correo",
        "debug_info": f"Código guardado para {correo} (expira en 15 min)"
    }

@router.post("/verificar-codigo")
def verificar_codigo(data: VerificarCodigoRequest):
    correo = data.correo.lower().strip()
    
    print(f"🔍 Verificando código para: {correo}")
    print(f"   - Código recibido: {data.codigo}")
    print(f"   - Total códigos en memoria: {len(codigo_temporal)}")
    print(f"   - Todos los códigos: {list(codigo_temporal.keys())}")
    print(f"   - Código almacenado para este correo: {codigo_temporal.get(correo, 'NO ENCONTRADO')}")
    
    # Limpiar códigos expirados
    limpiar_codigos_expirados()
    
    # Verificar que existe el código
    if correo not in codigo_temporal:
        print(f"❌ Código no encontrado en memoria para {correo}")
        raise HTTPException(status_code=400, detail="No hay código activo para este correo")
    
    # Verificar expiración específica
    if correo in codigo_expiracion and datetime.utcnow() > codigo_expiracion[correo]:
        print(f"❌ Código expirado para {correo}")
        codigo_temporal.pop(correo, None)
        codigo_expiracion.pop(correo, None)
        guardar_codigos_en_archivo()
        raise HTTPException(status_code=400, detail="Código expirado")
    
    # Verificar código
    if codigo_temporal.get(correo) != data.codigo:
        print(f"❌ Código incorrecto: esperado={codigo_temporal.get(correo)}, recibido={data.codigo}")
        raise HTTPException(status_code=400, detail="Código incorrecto")
    
    # NO eliminar el código aquí - mantenerlo para cambiar-clave
    print(f"✅ Código verificado correctamente para: {correo}")
    print(f"   - Código mantenido para cambio de contraseña")
    print(f"   - Códigos restantes: {list(codigo_temporal.keys())}")
    
    return {"mensaje": "Código verificado. Puedes cambiar tu contraseña."}

@router.get("/debug-codigos")
def debug_codigos():
    """Debug de códigos con información del archivo - ELIMINAR EN PRODUCCIÓN"""
    cargar_codigos_desde_archivo()  # Recargar por si acaso
    
    ahora = datetime.utcnow()
    debug_info = {}
    
    for correo in codigo_temporal:
        debug_info[correo] = {
            "codigo": codigo_temporal[correo],
            "expira": codigo_expiracion.get(correo, "Sin expiración").isoformat() if correo in codigo_expiracion else "Sin expiración",
            "expirado": correo in codigo_expiracion and ahora > codigo_expiracion[correo],
            "tiempo_restante": str(codigo_expiracion[correo] - ahora) if correo in codigo_expiracion and ahora < codigo_expiracion[correo] else "Expirado"
        }
    
    return {
        "tiempo_actual": ahora.isoformat(),
        "codigos_activos": debug_info,
        "total_codigos": len(codigo_temporal),
        "archivo_existe": os.path.exists(TEMP_CODES_FILE),
        "memoria_vs_archivo": "Sincronizado" if len(codigo_temporal) > 0 else "Memoria vacía"
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
                print(f"❌ Usuario {correo} no existe en usuarios_BIG")
                return False
                
            usuario_data = dict(rows[0])
            
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
                    bigquery.ScalarQueryParameter("id_usuario", "STRING", str(usuario_data["Employee_id"])),
                    bigquery.ScalarQueryParameter("empresa", "STRING", usuario_data.get("Carrier_Name", ""))
                ]
            )
            
            client.query(query_insert, job_config=job_config_insert).result()
            
            print(f"✅ Credenciales creadas automáticamente para conductor: {usuario_data['Employee_Name']}")
            return True
            
        elif origen == "interno":
            # Verificar si el usuario existe en usuarios (tabla interna)
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
            
            # Determinar el rol basado en el dominio del correo o empresa
            rol = "operador"  # rol por defecto
            if "@x-cargo.co" in correo.lower():
                if "admin" in correo.lower():
                    rol = "admin"
                elif "contabilidad" in correo.lower() or "contable" in correo.lower():
                    rol = "contabilidad"
                elif "supervisor" in correo.lower():
                    rol = "supervisor"
                else:
                    rol = "operador"
            
            # Crear credenciales automáticamente
            hashed_password = hash_clave("123456")  # Clave por defecto
            ahora = datetime.utcnow()
            
            query_insert = """
                INSERT INTO `datos-clientes-441216.Conciliaciones.credenciales`
                (correo, hashed_password, rol, clave_defecto, creado_en, id_usuario, empresa_carrier)
                VALUES (@correo, @hashed, @rol, TRUE, @creado_en, @id_usuario, @empresa)
            """
            
            job_config_insert = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("correo", "STRING", correo),
                    bigquery.ScalarQueryParameter("hashed", "STRING", hashed_password),
                    bigquery.ScalarQueryParameter("rol", "STRING", rol),
                    bigquery.ScalarQueryParameter("creado_en", "TIMESTAMP", ahora),
                    bigquery.ScalarQueryParameter("id_usuario", "STRING", usuario_data["id_usuario"]),
                    bigquery.ScalarQueryParameter("empresa", "STRING", usuario_data.get("empresa_carrier", ""))
                ]
            )
            
            client.query(query_insert, job_config=job_config_insert).result()
            
            print(f"✅ Credenciales creadas automáticamente para usuario interno: {usuario_data['nombre']} con rol {rol}")
            return True
        
        else:
            print(f"❌ Origen desconocido: {origen}")
            return False
            
    except Exception as e:
        print(f"❌ Error creando usuario automático: {e}")
        import traceback
        traceback.print_exc()
        return False