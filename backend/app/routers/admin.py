from fastapi import APIRouter, HTTPException, Form, Depends, Query, Header, Request
from google.cloud import bigquery
from datetime import datetime, timedelta
from uuid import uuid4
import bcrypt
import os
from typing import Optional, List
import traceback
import logging

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Administrador"])

PROJECT_ID = "datos-clientes-441216"
DATASET = "Conciliaciones"

# Inicializar cliente BigQuery con manejo de errores
try:
    bq_client = bigquery.Client()
    logger.info("✅ Cliente BigQuery inicializado correctamente")
except Exception as e:
    logger.error(f"❌ Error inicializando BigQuery: {e}")
    bq_client = None

# Helper para generar IDs
def generar_id_usuario():
    return str(uuid4())

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
    """Listar entregas con manejo robusto de errores"""
    logger.info(f"📦 Listando entregas para usuario: {user.get('correo', 'desconocido')}")
    logger.info(f"   Parámetros: página={page}, límite={limit}")
    
    try:
        # Verificar BigQuery antes de proceder
        if not verificar_bigquery():
            logger.error("❌ BigQuery no disponible, retornando datos de ejemplo")
            return generar_datos_ejemplo_entregas(page, limit)
        
        # Construir condiciones WHERE
        conditions = ["cp.Valor > 0"]
        params = []
        
        # Agregar filtros si existen
        if carrier:
            conditions.append("LOWER(COALESCE(cp.Carrier, '')) LIKE LOWER(@carrier)")
            params.append(bigquery.ScalarQueryParameter("carrier", "STRING", f"%{carrier}%"))
            
        if conductor:
            conditions.append("LOWER(COALESCE(ub.Employee_Name, '')) LIKE LOWER(@conductor)")
            params.append(bigquery.ScalarQueryParameter("conductor", "STRING", f"%{conductor}%"))
            
        if estado:
            conditions.append("LOWER(COALESCE(cp.Status_Big, '')) LIKE LOWER(@estado)")
            params.append(bigquery.ScalarQueryParameter("estado", "STRING", f"%{estado}%"))
            
        if ciudad:
            conditions.append("LOWER(COALESCE(cp.Ciudad, '')) LIKE LOWER(@ciudad)")
            params.append(bigquery.ScalarQueryParameter("ciudad", "STRING", f"%{ciudad}%"))
            
        if fecha_inicio:
            conditions.append("cp.Status_Date >= @fecha_inicio")
            params.append(bigquery.ScalarQueryParameter("fecha_inicio", "DATE", fecha_inicio))
            
        if fecha_fin:
            conditions.append("cp.Status_Date <= @fecha_fin")
            params.append(bigquery.ScalarQueryParameter("fecha_fin", "DATE", fecha_fin))
            
        if valor_min is not None:
            conditions.append("cp.Valor >= @valor_min")
            params.append(bigquery.ScalarQueryParameter("valor_min", "FLOAT", valor_min))
            
        if valor_max is not None:
            conditions.append("cp.Valor <= @valor_max")
            params.append(bigquery.ScalarQueryParameter("valor_max", "FLOAT", valor_max))
        
        where_clause = " AND ".join(conditions)
        
        # Query principal con paginación
        offset = (page - 1) * limit
        params.extend([
            bigquery.ScalarQueryParameter("limit", "INT64", limit),
            bigquery.ScalarQueryParameter("offset", "INT64", offset)
        ])
        
        # Verificar que las tablas existen antes de hacer la query
        logger.info("🔍 Verificando existencia de tablas...")
        try:
            tables_query = f"""
            SELECT table_name 
            FROM `{PROJECT_ID}.{DATASET}.INFORMATION_SCHEMA.TABLES` 
            WHERE table_name IN ('COD_pendientes_v1', 'usuarios_BIG')
            """
            tables_result = bq_client.query(tables_query).result()
            existing_tables = [row.table_name for row in tables_result]
            logger.info(f"   Tablas encontradas: {existing_tables}")
            
            if 'COD_pendientes_v1' not in existing_tables:
                logger.error("❌ Tabla COD_pendientes_v1 no encontrada")
                return generar_datos_ejemplo_entregas(page, limit)
                
        except Exception as e:
            logger.error(f"❌ Error verificando tablas: {e}")
            return generar_datos_ejemplo_entregas(page, limit)
        
        # Query principal
        query = f"""
        SELECT 
            COALESCE(cp.Guia, 'N/A') as tracking_number,
            COALESCE(ub.Employee_Name, 'Sin nombre') as conductor,
            COALESCE(ub.Employee_Mail, 'Sin email') as conductor_email,
            COALESCE(cp.Carrier, 'Sin carrier') as carrier,
            COALESCE(cp.carrier_id, 0) as carrier_id,
            COALESCE(cp.Cliente, 'Sin cliente') as cliente,
            COALESCE(cp.Ciudad, 'Sin ciudad') as ciudad,
            COALESCE(cp.Departamento, 'Sin departamento') as departamento,
            COALESCE(cp.Valor, 0) as valor,
            COALESCE(cp.Status_Date, CURRENT_DATE()) as fecha,
            COALESCE(cp.Status_Big, 'Sin estado') as estado,
            COALESCE(cp.Employee_id, 0) as employee_id
        FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1` cp
        LEFT JOIN `{PROJECT_ID}.{DATASET}.usuarios_BIG` ub 
            ON cp.Employee_id = ub.Employee_id
        WHERE {where_clause}
        ORDER BY cp.Status_Date DESC
        LIMIT @limit OFFSET @offset
        """
        
        logger.info(f"🔍 Ejecutando query con {len(params)} parámetros")
        job_config = bigquery.QueryJobConfig(query_parameters=params)
        result = bq_client.query(query, job_config=job_config).result()
        
        entregas = []
        for row in result:
            entregas.append({
                "tracking_number": str(row.tracking_number or "N/A"),
                "conductor": str(row.conductor or "Sin nombre"),
                "conductor_email": str(row.conductor_email or "Sin email"),
                "carrier": str(row.carrier or "Sin carrier"),
                "carrier_id": int(row.carrier_id or 0),
                "cliente": str(row.cliente or "Sin cliente"),
                "ciudad": str(row.ciudad or "Sin ciudad"),
                "departamento": str(row.departamento or "Sin departamento"),
                "valor": float(row.valor or 0),
                "fecha": str(row.fecha) if row.fecha else "",
                "estado": str(row.estado or "Sin estado"),
                "employee_id": int(row.employee_id or 0)
            })
        
        # Query para contar total (más simple)
        count_query = f"""
        SELECT COUNT(*) as total
        FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1` cp
        LEFT JOIN `{PROJECT_ID}.{DATASET}.usuarios_BIG` ub 
            ON cp.Employee_id = ub.Employee_id
        WHERE {where_clause}
        """
        
        count_params = [p for p in params if p.name not in ['limit', 'offset']]
        count_job_config = bigquery.QueryJobConfig(query_parameters=count_params)
        count_result = bq_client.query(count_query, job_config=count_job_config).result()
        total = list(count_result)[0].total
        
        logger.info(f"✅ Entregas consultadas: {len(entregas)} de {total} total")
        
        return {
            "entregas": entregas,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": (total + limit - 1) // limit if total > 0 else 1
        }
        
    except Exception as e:
        logger.error(f"❌ Error listando entregas: {str(e)}")
        logger.error(f"   Tipo de error: {type(e).__name__}")
        traceback.print_exc()
        
        # En caso de error, retornar datos de ejemplo
        logger.info("🔄 Retornando datos de ejemplo debido al error")
        return generar_datos_ejemplo_entregas(page, limit)

def generar_datos_ejemplo_entregas(page: int = 1, limit: int = 50):
    """Generar datos de ejemplo cuando BigQuery no está disponible"""
    entregas_ejemplo = [
        {
            "tracking_number": "TRK001234567",
            "conductor": "Carlos Mendoza",
            "conductor_email": "carlos.mendoza@logitechcorp.com",
            "carrier": "LogiTech Corp",
            "carrier_id": 101,
            "cliente": "Dafity",
            "ciudad": "Bogotá",
            "departamento": "Cundinamarca",
            "valor": 45000,
            "fecha": "2025-05-29",
            "estado": "Entregado",
            "employee_id": 1001
        },
        {
            "tracking_number": "TRK001234568",
            "conductor": "Ana Rodríguez",
            "conductor_email": "ana.rodriguez@fasttrack.com",
            "carrier": "FastTrack Inc",
            "carrier_id": 102,
            "cliente": "Dropi",
            "ciudad": "Medellín",
            "departamento": "Antioquia",
            "valor": 67000,
            "fecha": "2025-05-28",
            "estado": "Pendiente",
            "employee_id": 1002
        },
        {
            "tracking_number": "TRK001234569",
            "conductor": "Diego Silva",
            "conductor_email": "diego.silva@quickship.com",
            "carrier": "QuickShip SA",
            "carrier_id": 103,
            "cliente": "triddi",
            "ciudad": "Cali",
            "departamento": "Valle del Cauca",
            "valor": 89000,
            "fecha": "2025-05-27",
            "estado": "PAGADO",
            "employee_id": 1003
        }
    ]
    
    # Simular paginación
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    entregas_pagina = entregas_ejemplo[start_idx:end_idx]
    
    return {
        "entregas": entregas_pagina,
        "total": len(entregas_ejemplo),
        "page": page,
        "limit": limit,
        "total_pages": 1,
        "mensaje": "Datos de ejemplo - BigQuery no disponible"
    }

@router.get("/estadisticas-entregas")
async def estadisticas_entregas(user = Depends(verificar_admin)):
    """Estadísticas globales de entregas con fallback"""
    logger.info(f"📊 Consultando estadísticas para usuario: {user.get('correo', 'desconocido')}")
    
    try:
        if not verificar_bigquery():
            return generar_estadisticas_ejemplo()
        
        query = f"""
        SELECT 
            COUNT(*) as total_entregas,
            COUNT(CASE 
                WHEN LOWER(COALESCE(Status_Big, '')) NOT LIKE '%360%' 
                AND LOWER(COALESCE(Status_Big, '')) NOT LIKE '%entregado%' 
                AND LOWER(COALESCE(Status_Big, '')) NOT LIKE '%pagado%' 
                AND LOWER(COALESCE(Status_Big, '')) NOT LIKE '%liberado%'
                THEN 1 
            END) as entregas_pendientes,
            COUNT(CASE 
                WHEN LOWER(COALESCE(Status_Big, '')) LIKE '%360%' 
                OR LOWER(COALESCE(Status_Big, '')) LIKE '%entregado%' 
                THEN 1 
            END) as entregas_completadas,
            COUNT(CASE 
                WHEN LOWER(COALESCE(Status_Big, '')) LIKE '%pagado%' 
                OR LOWER(COALESCE(Status_Big, '')) LIKE '%liberado%'
                THEN 1 
            END) as entregas_pagadas,
            SUM(COALESCE(Valor, 0)) as valor_total,
            SUM(CASE 
                WHEN LOWER(COALESCE(Status_Big, '')) NOT LIKE '%360%' 
                AND LOWER(COALESCE(Status_Big, '')) NOT LIKE '%entregado%' 
                AND LOWER(COALESCE(Status_Big, '')) NOT LIKE '%pagado%' 
                AND LOWER(COALESCE(Status_Big, '')) NOT LIKE '%liberado%'
                THEN COALESCE(Valor, 0) ELSE 0 
            END) as valor_pendiente,
            COUNT(DISTINCT Employee_id) as conductores_activos,
            COUNT(DISTINCT carrier_id) as carriers_activos
        FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1`
        WHERE COALESCE(Valor, 0) > 0
            AND Status_Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
        """
        
        result = bq_client.query(query).result()
        data = dict(list(result)[0])
        
        # Convertir a enteros y manejar nulos
        for key, value in data.items():
            if value is not None:
                data[key] = int(value)
            else:
                data[key] = 0
                
        logger.info(f"✅ Estadísticas consultadas: {data['total_entregas']} entregas total")
        return data
        
    except Exception as e:
        logger.error(f"❌ Error en estadísticas de entregas: {e}")
        traceback.print_exc()
        return generar_estadisticas_ejemplo()

def generar_estadisticas_ejemplo():
    """Estadísticas de ejemplo"""
    return {
        "total_entregas": 15847,
        "entregas_pendientes": 3234,
        "entregas_completadas": 11892,
        "entregas_pagadas": 721,
        "valor_total": 208350000,
        "valor_pendiente": 42580000,
        "carriers_activos": 12,
        "conductores_activos": 198,
        "mensaje": "Estadísticas de ejemplo - BigQuery no disponible"
    }

@router.get("/filtros-entregas")
async def filtros_entregas(user = Depends(verificar_admin)):
    """Obtener opciones para los filtros de entregas con fallback"""
    logger.info(f"🔍 Consultando filtros para usuario: {user.get('correo', 'desconocido')}")
    
    try:
        if not verificar_bigquery():
            return generar_filtros_ejemplo()
        
        # Queries más simples y robustas
        carriers = []
        conductores = []
        ciudades = []
        estados = []
        
        try:
            query_carriers = f"""
            SELECT DISTINCT Carrier 
            FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1`
            WHERE Carrier IS NOT NULL AND TRIM(Carrier) != ''
            ORDER BY Carrier
            LIMIT 50
            """
            carriers = [row.Carrier for row in bq_client.query(query_carriers).result() if row.Carrier]
        except Exception as e:
            logger.warning(f"Error obteniendo carriers: {e}")
        
        try:
            query_conductores = f"""
            SELECT DISTINCT ub.Employee_Name 
            FROM `{PROJECT_ID}.{DATASET}.usuarios_BIG` ub
            WHERE ub.Employee_Name IS NOT NULL AND TRIM(ub.Employee_Name) != ''
            ORDER BY ub.Employee_Name
            LIMIT 100
            """
            conductores = [row.Employee_Name for row in bq_client.query(query_conductores).result() if row.Employee_Name]
        except Exception as e:
            logger.warning(f"Error obteniendo conductores: {e}")
        
        try:
            query_ciudades = f"""
            SELECT DISTINCT Ciudad 
            FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1`
            WHERE Ciudad IS NOT NULL AND TRIM(Ciudad) != ''
            ORDER BY Ciudad
            LIMIT 100
            """
            ciudades = [row.Ciudad for row in bq_client.query(query_ciudades).result() if row.Ciudad]
        except Exception as e:
            logger.warning(f"Error obteniendo ciudades: {e}")
        
        try:
            query_estados = f"""
            SELECT DISTINCT Status_Big 
            FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1`
            WHERE Status_Big IS NOT NULL AND TRIM(Status_Big) != ''
            ORDER BY Status_Big
            LIMIT 50
            """
            estados = [row.Status_Big for row in bq_client.query(query_estados).result() if row.Status_Big]
        except Exception as e:
            logger.warning(f"Error obteniendo estados: {e}")
        
        logger.info(f"✅ Filtros consultados: {len(carriers)} carriers, {len(conductores)} conductores")
        
        return {
            "carriers": carriers,
            "conductores": conductores,
            "ciudades": ciudades,
            "estados": estados
        }
        
    except Exception as e:
        logger.error(f"❌ Error obteniendo filtros: {e}")
        traceback.print_exc()
        return generar_filtros_ejemplo()

def generar_filtros_ejemplo():
    """Filtros de ejemplo"""
    return {
        "carriers": ["LogiTech Corp", "FastTrack Inc", "QuickShip SA", "SpeedCorp"],
        "conductores": ["Carlos Mendoza", "Ana Rodríguez", "Diego Silva"],
        "ciudades": ["Bogotá", "Medellín", "Cali", "Barranquilla", "Bucaramanga"],
        "estados": ["Pendiente", "En Ruta", "Entregado", "PAGADO", "liberado"],
        "mensaje": "Filtros de ejemplo - BigQuery no disponible"
    }

# ENDPOINTS PARA GESTIÓN DE ROLES Y PERMISOS

@router.get("/roles")
async def listar_roles(user = Depends(verificar_admin)):
    """Listar todos los roles disponibles"""
    try:
        logger.info(f"📋 Listando roles para usuario: {user.get('correo')}")
        
        if not verificar_bigquery():
            return generar_roles_defecto()
        
        query = f"""
        SELECT id_rol, nombre_rol, descripcion, ruta_defecto
        FROM `{PROJECT_ID}.{DATASET}.roles`
        ORDER BY nombre_rol
        """
        
        result = bq_client.query(query).result()
        roles = [dict(row) for row in result]
        
        logger.info(f"✅ Roles encontrados: {len(roles)}")
        return roles
        
    except Exception as e:
        logger.error(f"❌ Error listando roles: {e}")
        return generar_roles_defecto()

@router.get("/roles-con-permisos")
async def listar_roles_con_permisos(user = Depends(verificar_admin)):
    """Listar todos los roles con sus permisos asociados"""
    try:
        logger.info(f"📋 Listando roles con permisos para usuario: {user.get('correo')}")
        
        if not verificar_bigquery():
            return generar_roles_con_permisos_defecto()
        
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
                ) IGNORE NULLS
            ) as permisos
        FROM `{PROJECT_ID}.{DATASET}.roles` r
        LEFT JOIN `{PROJECT_ID}.{DATASET}.rol_permisos` rp ON r.id_rol = rp.id_rol
        LEFT JOIN `{PROJECT_ID}.{DATASET}.permisos` p ON rp.id_permiso = p.id_permiso
        GROUP BY r.id_rol, r.nombre_rol, r.descripcion, r.ruta_defecto
        ORDER BY r.nombre_rol
        """
        
        result = bq_client.query(query).result()
        roles = [dict(row) for row in result]
        
        logger.info(f"✅ Roles con permisos encontrados: {len(roles)}")
        return roles
        
    except Exception as e:
        logger.error(f"❌ Error listando roles con permisos: {e}")
        return generar_roles_con_permisos_defecto()

@router.get("/permisos")
async def listar_permisos(user = Depends(verificar_admin)):
    """Listar todos los permisos disponibles"""
    try:
        logger.info(f"📋 Listando permisos para usuario: {user.get('correo')}")
        
        if not verificar_bigquery():
            return generar_permisos_defecto()
        
        query = f"""
        SELECT id_permiso, nombre, descripcion, modulo, ruta
        FROM `{PROJECT_ID}.{DATASET}.permisos`
        ORDER BY modulo, nombre
        """
        
        result = bq_client.query(query).result()
        permisos = [dict(row) for row in result]
        
        logger.info(f"✅ Permisos encontrados: {len(permisos)}")
        return permisos
        
    except Exception as e:
        logger.error(f"❌ Error listando permisos: {e}")
        return generar_permisos_defecto()

@router.post("/crear-rol")
async def crear_rol(
    id_rol: str = Form(...),
    nombre_rol: str = Form(...),
    descripcion: str = Form(""),
    ruta_defecto: str = Form(""),
    user = Depends(verificar_admin)
):
    """Crear un nuevo rol"""
    try:
        logger.info(f"👤 Creando rol: {id_rol} - {nombre_rol}")
        
        if not verificar_bigquery():
            raise HTTPException(status_code=503, detail="BigQuery no disponible")
        
        query = f"""
        INSERT INTO `{PROJECT_ID}.{DATASET}.roles`
        (id_rol, nombre_rol, descripcion, ruta_defecto)
        VALUES (@id, @nombre, @desc, @ruta)
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("id", "STRING", id_rol),
                bigquery.ScalarQueryParameter("nombre", "STRING", nombre_rol),
                bigquery.ScalarQueryParameter("desc", "STRING", descripcion),
                bigquery.ScalarQueryParameter("ruta", "STRING", ruta_defecto),
            ]
        )
        bq_client.query(query, job_config=job_config).result()
        
        logger.info(f"✅ Rol {id_rol} creado exitosamente")
        return {"mensaje": "Rol creado correctamente"}
        
    except Exception as e:
        logger.error(f"❌ Error creando rol: {e}")
        if "already exists" in str(e).lower():
            raise HTTPException(status_code=400, detail="El rol ya existe")
        raise HTTPException(status_code=500, detail=f"Error creando rol: {str(e)}")

@router.post("/crear-permiso")
async def crear_permiso(
    id_permiso: str = Form(...),
    nombre: str = Form(...),
    descripcion: str = Form(""),
    modulo: str = Form(...),
    ruta: str = Form(""),
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
    permisos_ids: List[str] = Form(...),
    user = Depends(verificar_admin)
):
    """Asignar/actualizar permisos de un rol"""
    try:
        logger.info(f"🔐 Asignando permisos al rol {id_rol}: {permisos_ids}")
        
        if not verificar_bigquery():
            raise HTTPException(status_code=503, detail="BigQuery no disponible")
        
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

        logger.info(f"✅ Permisos actualizados para rol {id_rol}")
        return {"mensaje": f"Permisos actualizados para el rol {id_rol}"}
        
    except Exception as e:
        logger.error(f"❌ Error asignando permisos: {e}")
        raise HTTPException(status_code=500, detail=f"Error asignando permisos: {str(e)}")

@router.post("/rol/{id_rol}/ruta-defecto")
async def actualizar_ruta_defecto(
    id_rol: str,
    ruta_defecto: str = Form(...),
    user = Depends(verificar_admin)
):
    """Actualizar ruta por defecto de un rol"""
    try:
        logger.info(f"🛣️ Actualizando ruta por defecto del rol {id_rol}: {ruta_defecto}")
        
        if not verificar_bigquery():
            raise HTTPException(status_code=503, detail="BigQuery no disponible")
        
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
        result = bq_client.query(query, job_config=job_config).result()
        
        logger.info(f"✅ Ruta por defecto actualizada para {id_rol}")
        return {"mensaje": f"Ruta por defecto actualizada para {id_rol}"}
        
    except Exception as e:
        logger.error(f"❌ Error actualizando ruta: {e}")
        raise HTTPException(status_code=500, detail=f"Error actualizando ruta: {str(e)}")

# FUNCIONES DE FALLBACK PARA CUANDO BIGQUERY NO ESTÁ DISPONIBLE

def generar_roles_defecto():
    """Roles por defecto"""
    return [
        {
            "id_rol": "admin",
            "nombre_rol": "Administrador", 
            "descripcion": "Acceso completo al sistema",
            "ruta_defecto": "/admin/dashboard"
        },
        {
            "id_rol": "contabilidad",
            "nombre_rol": "Contabilidad",
            "descripcion": "Gestión financiera y contable", 
            "ruta_defecto": "/contabilidad/dashboard"
        },
        {
            "id_rol": "supervisor", 
            "nombre_rol": "Supervisor",
            "descripcion": "Supervisión de operaciones",
            "ruta_defecto": "/supervisor/dashboard"
        },
        {
            "id_rol": "operador",
            "nombre_rol": "Operador", 
            "descripcion": "Operaciones básicas",
            "ruta_defecto": "/operador/dashboard"
        },
        {
            "id_rol": "conductor",
            "nombre_rol": "Conductor",
            "descripcion": "Acceso para conductores", 
            "ruta_defecto": "/conductor/dashboard"
        }
    ]

def generar_roles_con_permisos_defecto():
    """Roles con permisos por defecto"""
    return [
        {
            "id_rol": "admin",
            "nombre_rol": "Administrador",
            "descripcion": "Acceso completo al sistema",
            "ruta_defecto": "/admin/dashboard",
            "permisos": [
                {"id_permiso": "ver_entregas", "permiso_nombre": "Ver Entregas", "modulo": "admin"},
                {"id_permiso": "crear_usuarios", "permiso_nombre": "Crear Usuarios", "modulo": "admin"},
                {"id_permiso": "gestionar_roles", "permiso_nombre": "Gestionar Roles", "modulo": "admin"}
            ]
        },
        {
            "id_rol": "contabilidad",
            "nombre_rol": "Contabilidad",
            "descripcion": "Gestión financiera y contable",
            "ruta_defecto": "/contabilidad/dashboard",
            "permisos": [
                {"id_permiso": "ver_reportes", "permiso_nombre": "Ver Reportes", "modulo": "contabilidad"},
                {"id_permiso": "exportar_datos", "permiso_nombre": "Exportar Datos", "modulo": "contabilidad"}
            ]
        },
        {
            "id_rol": "supervisor",
            "nombre_rol": "Supervisor",
            "descripcion": "Supervisión de operaciones",
            "ruta_defecto": "/supervisor/dashboard",
            "permisos": [
                {"id_permiso": "ver_entregas", "permiso_nombre": "Ver Entregas", "modulo": "operador"},
                {"id_permiso": "aprobar_entregas", "permiso_nombre": "Aprobar Entregas", "modulo": "operador"}
            ]
        },
        {
            "id_rol": "operador",
            "nombre_rol": "Operador",
            "descripcion": "Operaciones básicas",
            "ruta_defecto": "/operador/dashboard",
            "permisos": [
                {"id_permiso": "crear_entregas", "permiso_nombre": "Crear Entregas", "modulo": "operador"}
            ]
        },
        {
            "id_rol": "conductor",
            "nombre_rol": "Conductor",
            "descripcion": "Acceso para conductores",
            "ruta_defecto": "/conductor/dashboard",
            "permisos": [
                {"id_permiso": "ver_mis_entregas", "permiso_nombre": "Ver Mis Entregas", "modulo": "conductor"}
            ]
        }
    ]

def generar_permisos_defecto():
    """Permisos por defecto"""
    return [
        {"id_permiso": "ver_entregas", "nombre": "Ver Entregas", "descripcion": "Visualizar listado de entregas", "modulo": "admin", "ruta": "/admin/entregas"},
        {"id_permiso": "crear_usuarios", "nombre": "Crear Usuarios", "descripcion": "Crear nuevos usuarios del sistema", "modulo": "admin", "ruta": "/admin/usuarios"},
        {"id_permiso": "gestionar_roles", "nombre": "Gestionar Roles", "descripcion": "Administrar roles y permisos", "modulo": "admin", "ruta": "/admin/roles"},
        {"id_permiso": "ver_reportes", "nombre": "Ver Reportes", "descripcion": "Acceder a reportes financieros", "modulo": "contabilidad", "ruta": "/contabilidad/reportes"},
        {"id_permiso": "exportar_datos", "nombre": "Exportar Datos", "descripcion": "Exportar información del sistema", "modulo": "contabilidad", "ruta": ""},
        {"id_permiso": "aprobar_entregas", "nombre": "Aprobar Entregas", "descripcion": "Aprobar y validar entregas", "modulo": "operador", "ruta": ""},
        {"id_permiso": "crear_entregas", "nombre": "Crear Entregas", "descripcion": "Registrar nuevas entregas", "modulo": "operador", "ruta": "/operador/entregas"},
        {"id_permiso": "ver_mis_entregas", "nombre": "Ver Mis Entregas", "descripcion": "Ver entregas asignadas", "modulo": "conductor", "ruta": "/conductor/entregas"}
    ]