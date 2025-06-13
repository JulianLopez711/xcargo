"""
Módulo de administración para el sistema XCargo.
Maneja las rutas y funciones administrativas incluyendo verificación de permisos
y gestión de entregas.
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Header, Request, Form
from google.cloud import bigquery
from datetime import datetime
import traceback
import logging
from typing import Optional, List
from pydantic import BaseModel
import bcrypt
import uuid
import re

router = APIRouter(prefix="/admin", tags=["Administrador"])

# Configuración correcta del proyecto BigQuery
PROJECT_ID = "datos-clientes-441216"  # Este es el ID correcto
DATASET = "Conciliaciones"

# Configuración de logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    bq_client = bigquery.Client(project=PROJECT_ID)  # Especificamos explícitamente el proyecto
    logger.info(f"✅ Cliente BigQuery inicializado para proyecto: {PROJECT_ID}")
except Exception as e:
    logger.error(f"❌ Error inicializando BigQuery: {e}")
    bq_client = None

def verificar_admin(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role")
):
    """
    Verifica si el usuario tiene permisos de administrador.
    
    Args:
        request (Request): Objeto de solicitud FastAPI
        authorization (str, optional): Token de autorización
        x_user_email (str, optional): Email del usuario en los headers
        x_user_role (str, optional): Rol del usuario en los headers
    
    Returns:
        dict: Información del usuario autorizado
    
    Raises:
        HTTPException: Si el usuario no está autorizado o las credenciales son inválidas
    """
    logger.info(f"🔐 Verificando admin para endpoint: {request.url.path}")
    logger.info(f"   - Email: {x_user_email} | Rol: {x_user_role}")
    if x_user_email and x_user_role:
        if x_user_role.lower() in ["admin", "master", "contabilidad"]:
            return {"correo": x_user_email, "rol": x_user_role.lower()}
        raise HTTPException(status_code=403, detail="Rol no autorizado")
    raise HTTPException(status_code=403, detail="Credenciales no válidas")

def verificar_bigquery():
    """
    Verifica la conexión con BigQuery realizando una consulta simple.
    
    Returns:
        bool: True si la conexión está activa, False en caso contrario
    """
    if not bq_client:
        logger.error("❌ BigQuery no inicializado")
        return False
    try:
        bq_client.query("SELECT 1").result()
        return True
    except Exception as e:
        logger.error(f"❌ Error BigQuery: {e}")
        return False

@router.get("/entregas")
async def listar_entregas(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    carrier: Optional[str] = Query(None),
    conductor: Optional[str] = Query(None),
    ciudad: Optional[str] = Query(None),
    user = Depends(verificar_admin)
):
    """
    Lista las entregas con filtros y paginación.
    
    Args:
        request (Request): Objeto de solicitud FastAPI
        page (int): Número de página actual (mínimo 1)
        limit (int): Cantidad de registros por página (entre 1 y 100)
        carrier (str, optional): Filtro por nombre del carrier
        conductor (str, optional): Filtro por nombre del conductor
        ciudad (str, optional): Filtro por ciudad
        user (dict): Usuario autenticado (inyectado por verificar_admin)
    
    Returns:
        dict: Contiene:
            - entregas: Lista de entregas encontradas
            - page: Página actual
            - limit: Límite de registros
            - total: Total de registros encontrados
    
    Raises:
        HTTPException: Si hay error en la consulta o BigQuery no está disponible
    """
    logger.info(f"📦 Listando entregas para: {user['correo']}")

    if not verificar_bigquery():
        raise HTTPException(status_code=503, detail="BigQuery no disponible")

    offset = (page - 1) * limit
    filtros = ["cp.Valor > 0", "LOWER(COALESCE(cp.Status_Big, '')) LIKE '%360%'"]
    parametros = [
        bigquery.ScalarQueryParameter("limit", "INT64", limit),
        bigquery.ScalarQueryParameter("offset", "INT64", offset)
    ]

    if carrier:
        filtros.append("LOWER(cp.Carrier) LIKE LOWER(@carrier)")
        parametros.append(bigquery.ScalarQueryParameter("carrier", "STRING", f"%{carrier}%"))

    if conductor:
        filtros.append("LOWER(ub.Employee_Name) LIKE LOWER(@conductor)")
        parametros.append(bigquery.ScalarQueryParameter("conductor", "STRING", f"%{conductor}%"))

    if ciudad:
        filtros.append("LOWER(cp.Ciudad) LIKE LOWER(@ciudad)")
        parametros.append(bigquery.ScalarQueryParameter("ciudad", "STRING", f"%{ciudad}%"))

    where_clause = " AND ".join(filtros)

    query = f"""
        SELECT 
            COALESCE(cp.tracking_number, 'N/A') as tracking_number,
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

    job_config = bigquery.QueryJobConfig(query_parameters=parametros)
    try:
        resultado = bq_client.query(query, job_config=job_config).result()
        entregas = [dict(row) for row in resultado]
        logger.info(f"✅ {len(entregas)} entregas obtenidas")

        return {
            "entregas": entregas,
            "page": page,
            "limit": limit,
            "total": len(entregas)
        }

    except Exception as e:
        logger.error(f"❌ Error ejecutando query: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error consultando entregas")

class Usuario(BaseModel):
    id_usuario: str
    nombre: str
    correo: str
    telefono: str
    empresa_carrier: Optional[str] = None
    creado_en: Optional[datetime] = None
    actualizado_en: Optional[datetime] = None

class UsuarioBasico(BaseModel):
    correo: str
    nombre: str
    empresa_carrier: Optional[str] = None
    rol_actual: Optional[str] = None

class CambioRolRequest(BaseModel):
    """Modelo para solicitud de cambio de rol"""
    correo: str
    nuevo_rol: str

class UsuarioResponse(BaseModel):
    """Modelo para respuesta de detalles de usuario"""
    correo: str
    rol: str
    nombre: Optional[str] = None
    id_usuario: Optional[str] = None

@router.get("/buscar-usuarios", response_model=List[UsuarioBasico])
async def buscar_usuarios(
    q: str = Query(..., min_length=3),
    current_user: dict = Depends(verificar_admin)
):
    """
    Busca usuarios autenticados por correo o nombre para sugerencias.
    Busca en la tabla credenciales ya que estos son los usuarios que pueden iniciar sesión.
    """
    try:
        if not verificar_bigquery():
            raise HTTPException(status_code=503, detail="Error de conexión con BigQuery")

        query = f"""
        SELECT DISTINCT
            c.correo,
            u.nombre,
            c.empresa_carrier,
            c.rol as rol_actual
        FROM `{PROJECT_ID}.{DATASET}.credenciales` c
        LEFT JOIN `{PROJECT_ID}.{DATASET}.usuarios` u ON c.correo = u.correo
        WHERE 
            LOWER(c.correo) LIKE LOWER(@query)
            OR LOWER(u.nombre) LIKE LOWER(@query)
        ORDER BY 
            CASE 
                WHEN LOWER(c.correo) = LOWER(@exact_query) THEN 0
                WHEN LOWER(c.correo) LIKE LOWER(CONCAT(@exact_query, '%')) THEN 1
                ELSE 2
            END,
            c.correo
        LIMIT 5
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("query", "STRING", f"%{q}%"),
                bigquery.ScalarQueryParameter("exact_query", "STRING", q),
            ]
        )

        results = bq_client.query(query, job_config=job_config).result()
        
        usuarios = []
        for row in results:
            usuario = UsuarioBasico(
                correo=row.correo,
                nombre=row.nombre or row.correo,  # Si no hay nombre, usamos el correo
                empresa_carrier=row.empresa_carrier,
                rol_actual=row.rol_actual
            )
            usuarios.append(usuario)
        
        logger.info(f"✅ {len(usuarios)} usuarios encontrados para la búsqueda: {q}")
        return usuarios

    except Exception as e:
        logger.error(f"❌ Error buscando usuarios: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Error buscando usuarios: {str(e)}"
        )

@router.post("/crear-usuario")
async def crear_usuario(
    nombre: str = Form(...),
    correo: str = Form(...),
    telefono: str = Form(...),
    rol: str = Form(...),
    empresa_carrier: Optional[str] = Form(None),
    current_user: dict = Depends(verificar_admin)
):
    """
    Crea un nuevo usuario en el sistema
    """
    try:
        # Validar correo
        if not re.match(r"[^@]+@[^@]+\.[^@]+", correo):
            raise HTTPException(
                status_code=400,
                detail="Formato de correo inválido"
            )        # Validar que el rol exista
        if not validar_rol(rol):
            raise HTTPException(
                status_code=400,
                detail=f"El rol '{rol}' no es válido"
            )

        # Verificar si el correo ya existe
        check_query = f"""
        SELECT COUNT(*) as count
        FROM `{PROJECT_ID}.{DATASET}.usuarios`
        WHERE correo = @correo
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo", "STRING", correo),
            ]
        )
        
        result = next(bq_client.query(check_query, job_config=job_config).result())
        if result.count > 0:
            raise HTTPException(
                status_code=400,
                detail="El correo ya está registrado"
            )

        # Generar ID único
        id_usuario = f"USR_{uuid.uuid4().hex[:8]}_{int(datetime.now().timestamp())}"
        now = datetime.utcnow()

        # Insertar en tabla usuarios
        usuarios_query = f"""
        INSERT INTO `{PROJECT_ID}.{DATASET}.usuarios`
        (id_usuario, nombre, correo, telefono, empresa_carrier, creado_en, actualizado_en)
        VALUES
        (@id_usuario, @nombre, @correo, @telefono, @empresa_carrier, @creado_en, @actualizado_en)
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("id_usuario", "STRING", id_usuario),
                bigquery.ScalarQueryParameter("nombre", "STRING", nombre),
                bigquery.ScalarQueryParameter("correo", "STRING", correo.lower()),
                bigquery.ScalarQueryParameter("telefono", "STRING", telefono),
                bigquery.ScalarQueryParameter("empresa_carrier", "STRING", empresa_carrier),
                bigquery.ScalarQueryParameter("creado_en", "TIMESTAMP", now),
                bigquery.ScalarQueryParameter("actualizado_en", "TIMESTAMP", now),
            ]
        )

        bq_client.query(usuarios_query, job_config=job_config).result()

        # Generar contraseña temporal y hash
        temp_password = "123456"  # Contraseña por defecto
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(temp_password.encode(), salt)

        # Insertar en tabla credenciales
        credenciales_query = f"""
        INSERT INTO `{PROJECT_ID}.{DATASET}.credenciales`
        (correo, hashed_password, rol, clave_defecto, creado_en, actualizado_en, id_usuario, empresa_carrier)
        VALUES
        (@correo, @hashed_password, @rol, @clave_defecto, @creado_en, @actualizado_en, @id_usuario, @empresa_carrier)
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo", "STRING", correo.lower()),
                bigquery.ScalarQueryParameter("hashed_password", "STRING", hashed.decode()),
                bigquery.ScalarQueryParameter("rol", "STRING", rol),
                bigquery.ScalarQueryParameter("clave_defecto", "BOOL", True),
                bigquery.ScalarQueryParameter("creado_en", "TIMESTAMP", now),
                bigquery.ScalarQueryParameter("actualizado_en", "TIMESTAMP", now),
                bigquery.ScalarQueryParameter("id_usuario", "STRING", id_usuario),
                bigquery.ScalarQueryParameter("empresa_carrier", "STRING", empresa_carrier),
            ]
        )

        bq_client.query(credenciales_query, job_config=job_config).result()

        return {
            "mensaje": f"Usuario creado exitosamente. Contraseña temporal: {temp_password}",
            "id_usuario": id_usuario
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"❌ Error creando usuario: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Error creando usuario: {str(e)}"
        )

class Rol(BaseModel):
    id_rol: str
    nombre_rol: str
    descripcion: str
    ruta_defecto: str

@router.get("/roles", response_model=List[Rol])
async def obtener_roles(current_user: dict = Depends(verificar_admin)):
    """
    Obtiene la lista de roles disponibles en el sistema desde la tabla roles
    """
    try:
        logger.info(f"📝 Obteniendo roles para {current_user.get('email', 'usuario desconocido')}")
        query = f"""
        SELECT 
            id_rol,
            nombre_rol,
            descripcion,
            CASE
                WHEN id_rol = 'admin' THEN '/admin/dashboard'
                WHEN id_rol = 'master' THEN '/master/dashboard'
                WHEN id_rol = 'supervisor' THEN '/supervisor/dashboard'
                WHEN id_rol = 'contabilidad' THEN '/contabilidad/dashboard'
                WHEN id_rol = 'operador' THEN '/operador/dashboard'
                WHEN id_rol = 'conductor' THEN '/conductor/dashboard'
                ELSE '/'
            END as ruta_defecto
        FROM `{PROJECT_ID}.{DATASET}.roles`
        WHERE id_rol IS NOT NULL
        """

        try:
            results = bq_client.query(query).result()
            roles_db = [dict(row) for row in results]
            
            if roles_db:
                logger.info(f"✅ {len(roles_db)} roles encontrados en BD")
                return [
                    Rol(
                        id_rol=rol['id_rol'],
                        nombre_rol=rol['nombre_rol'].title(),
                        descripcion=rol['descripcion'],
                        ruta_defecto=rol['ruta_defecto']
                    ) for rol in roles_db
                ]
        except Exception as e:
            logger.warning(f"⚠️ Error obteniendo roles de BD: {str(e)}")

        # Si no hay roles en BD o hay error, usar roles por defecto
        logger.info("📋 Usando roles predeterminados")
        return [
            Rol(
                id_rol="admin",
                nombre_rol="Administrador",
                descripcion="Acceso completo al sistema",
                ruta_defecto="/admin/dashboard"
            ),
            Rol(
                id_rol="master",
                nombre_rol="Master",
                descripcion="Control total de operaciones",
                ruta_defecto="/master/dashboard"
            ),
            Rol(
                id_rol="supervisor",
                nombre_rol="Supervisor",
                descripcion="Supervisión de operaciones",
                ruta_defecto="/supervisor/dashboard"
            ),
            Rol(
                id_rol="contabilidad",
                nombre_rol="Contabilidad",
                descripcion="Gestión financiera",
                ruta_defecto="/contabilidad/dashboard"
            ),
            Rol(
                id_rol="operador",
                nombre_rol="Operador",
                descripcion="Operaciones básicas",
                ruta_defecto="/operador/dashboard"
            ),
            Rol(
                id_rol="conductor",
                nombre_rol="Conductor",
                descripcion="Acceso de conductor",
                ruta_defecto="/conductor/dashboard"
            )
        ]

    except Exception as e:
        logger.error(f"❌ Error obteniendo roles: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo roles: {str(e)}"
        )

def validar_rol(rol: str) -> bool:
    """
    Valida si un rol está permitido consultando la tabla de roles.
    
    Args:
        rol (str): Rol a validar
    
    Returns:
        bool: True si el rol es válido, False si no
    """
    try:
        query = f"""
        SELECT id_rol FROM `{PROJECT_ID}.{DATASET}.roles` 
        WHERE LOWER(id_rol) = LOWER(@rol)
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("rol", "STRING", rol),
            ]
        )
        
        query_job = bq_client.query(query, job_config=job_config)
        results = query_job.result()
        return results.total_rows > 0
    except Exception as e:
        logger.error(f"Error validando rol: {e}")
        return False

@router.get("/obtener-usuario/{correo}", response_model=UsuarioResponse)
async def obtener_usuario(
    correo: str,
    user = Depends(verificar_admin)
):
    """
    Obtiene los detalles de un usuario por su correo.
    
    Args:
        correo (str): Correo del usuario a buscar
        user (dict): Usuario administrador autenticado
        
    Returns:
        UsuarioResponse: Detalles del usuario encontrado
        
    Raises:
        HTTPException: Si el usuario no existe o hay error en la consulta
    """
    try:
        if not verificar_bigquery():
            raise HTTPException(status_code=503, detail="Error de conexión con BigQuery")

        query = f"""
        SELECT u.correo, u.nombre, u.id_usuario, c.rol
        FROM `{PROJECT_ID}.{DATASET}.usuarios` u
        JOIN `{PROJECT_ID}.{DATASET}.credenciales` c
        ON u.correo = c.correo
        WHERE LOWER(u.correo) = LOWER('{correo}')
        """
        
        query_job = bq_client.query(query)
        results = query_job.result()
        
        if results.total_rows == 0:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
            
        user_data = next(results)
        return UsuarioResponse(
            correo=user_data.correo,
            rol=user_data.rol,
            nombre=user_data.nombre,
            id_usuario=user_data.id_usuario
        )
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error obteniendo usuario: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

@router.post("/cambiar-rol")
async def cambiar_rol(
    request: CambioRolRequest,
    user = Depends(verificar_admin)
):
    """
    Cambia el rol de un usuario existente.
    
    Args:
        request (CambioRolRequest): Datos de la solicitud (correo y nuevo rol)
        user (dict): Usuario administrador autenticado
        
    Returns:
        dict: Mensaje de éxito o error
        
    Raises:
        HTTPException: Si el usuario no existe, el rol es inválido o hay error en la actualización
    """
    try:
        if not verificar_bigquery():
            raise HTTPException(status_code=503, detail="Error de conexión con BigQuery")

        # Validar que el nuevo rol esté permitido
        if not validar_rol(request.nuevo_rol):
            raise HTTPException(
                status_code=400,
                detail=f"El rol '{request.nuevo_rol}' no es válido"
            )
            
        # Verificar que el usuario existe
        check_query = f"""
        SELECT correo FROM `{PROJECT_ID}.{DATASET}.credenciales`
        WHERE LOWER(correo) = LOWER(@correo)
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo", "STRING", request.correo),
            ]
        )
        
        results = bq_client.query(check_query, job_config=job_config).result()
        
        if results.total_rows == 0:
            raise HTTPException(
                status_code=404,
                detail="Usuario no encontrado"
            )

        # Actualizar el rol en la tabla de credenciales
        update_query = f"""
        UPDATE `{PROJECT_ID}.{DATASET}.credenciales`
        SET rol = @nuevo_rol,
            actualizado_en = CURRENT_TIMESTAMP()
        WHERE LOWER(correo) = LOWER(@correo)
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("nuevo_rol", "STRING", request.nuevo_rol),
                bigquery.ScalarQueryParameter("correo", "STRING", request.correo),
            ]
        )
        
        update_job = bq_client.query(update_query, job_config=job_config)
        update_job.result()
        
        logger.info(f"✅ Rol actualizado para usuario {request.correo}: {request.nuevo_rol}")
        return {"message": "Rol actualizado exitosamente"}
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"❌ Error cambiando rol: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor: {str(e)}"
        )

@router.get("/roles")
async def obtener_roles(
    user = Depends(verificar_admin)
):
    """
    Obtiene la lista de roles disponibles en el sistema.
    
    Args:
        user (dict): Usuario administrador autenticado
        
    Returns:
        list: Lista de roles con su descripción
        
    Raises:
        HTTPException: Si hay error en la consulta
    """
    try:
        if not verificar_bigquery():
            raise HTTPException(status_code=503, detail="Error de conexión con BigQuery")
            
        query = f"""
        SELECT rol, descripcion
        FROM `{PROJECT_ID}.{DATASET}.roles`
        ORDER BY rol
        """
        
        query_job = bq_client.query(query)
        results = query_job.result()
        
        roles = [
            {
                "rol": row.rol,
                "descripcion": row.descripcion if hasattr(row, "descripcion") else None
            }
            for row in results
        ]
        
        return roles
        
    except Exception as e:
        logger.error(f"Error obteniendo roles: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

class Permiso(BaseModel):
    """Modelo para permisos del sistema"""
    id_permiso: str
    nombre: str
    descripcion: Optional[str] = None
    modulo: str
    ruta: Optional[str] = None

class RolConPermisos(BaseModel):
    """Modelo para roles con sus permisos"""
    id_rol: str
    nombre_rol: str
    descripcion: str
    ruta_defecto: str
    permisos: List[dict]

class NuevoRol(BaseModel):
    """Modelo para crear un nuevo rol"""
    id_rol: str
    nombre_rol: str
    descripcion: Optional[str] = None
    ruta_defecto: Optional[str] = None

class NuevoPermiso(BaseModel):
    """Modelo para crear un nuevo permiso"""
    id_permiso: str
    nombre: str
    descripcion: Optional[str] = None
    modulo: str
    ruta: Optional[str] = None

@router.get("/roles-con-permisos", response_model=List[RolConPermisos])
async def obtener_roles_con_permisos(
    user = Depends(verificar_admin)
):
    """
    Obtiene la lista de roles con sus permisos asignados
    """
    try:
        if not verificar_bigquery():
            raise HTTPException(status_code=503, detail="Error de conexión con BigQuery")

        query = f"""
        SELECT 
            r.id_rol,
            r.nombre_rol,
            r.descripcion,
            r.ruta_defecto,
            ARRAY_AGG(STRUCT(
                p.id_permiso,
                p.nombre as permiso_nombre,
                p.modulo
            )) as permisos
        FROM `{PROJECT_ID}.{DATASET}.roles` r
        LEFT JOIN `{PROJECT_ID}.{DATASET}.rol_permisos` rp ON r.id_rol = rp.id_rol
        LEFT JOIN `{PROJECT_ID}.{DATASET}.permisos` p ON rp.id_permiso = p.id_permiso
        GROUP BY r.id_rol, r.nombre_rol, r.descripcion, r.ruta_defecto
        """

        results = bq_client.query(query).result()
        roles = []
        
        for row in results:
            permisos = [
                {
                    "id_permiso": p["id_permiso"],
                    "permiso_nombre": p["permiso_nombre"],
                    "modulo": p["modulo"]
                }
                for p in row.permisos if p["id_permiso"] is not None
            ] if row.permisos else []

            roles.append(RolConPermisos(
                id_rol=row.id_rol,
                nombre_rol=row.nombre_rol,
                descripcion=row.descripcion,
                ruta_defecto=row.ruta_defecto,
                permisos=permisos
            ))

        return roles

    except Exception as e:
        logger.error(f"Error obteniendo roles con permisos: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/permisos", response_model=List[Permiso])
async def obtener_permisos(
    user = Depends(verificar_admin)
):
    """
    Obtiene la lista de todos los permisos disponibles
    """
    try:
        if not verificar_bigquery():
            raise HTTPException(status_code=503, detail="Error de conexión con BigQuery")

        query = f"""
        SELECT *
        FROM `{PROJECT_ID}.{DATASET}.permisos`
        ORDER BY modulo, nombre
        """

        results = bq_client.query(query).result()
        return [Permiso(**dict(row)) for row in results]

    except Exception as e:
        logger.error(f"Error obteniendo permisos: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/crear-rol")
async def crear_rol(
    rol: NuevoRol,
    user = Depends(verificar_admin)
):
    """
    Crea un nuevo rol en el sistema
    """
    try:
        if not verificar_bigquery():
            raise HTTPException(status_code=503, detail="Error de conexión con BigQuery")

        # Verificar si el rol ya existe
        check_query = f"""
        SELECT COUNT(*) as count
        FROM `{PROJECT_ID}.{DATASET}.roles`
        WHERE id_rol = @id_rol
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("id_rol", "STRING", rol.id_rol),
            ]
        )
        
        result = next(bq_client.query(check_query, job_config=job_config).result())
        if result.count > 0:
            raise HTTPException(status_code=400, detail="El rol ya existe")

        # Insertar nuevo rol
        insert_query = f"""
        INSERT INTO `{PROJECT_ID}.{DATASET}.roles`
        (id_rol, nombre_rol, descripcion, ruta_defecto)
        VALUES
        (@id_rol, @nombre_rol, @descripcion, @ruta_defecto)
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("id_rol", "STRING", rol.id_rol),
                bigquery.ScalarQueryParameter("nombre_rol", "STRING", rol.nombre_rol),
                bigquery.ScalarQueryParameter("descripcion", "STRING", rol.descripcion),
                bigquery.ScalarQueryParameter("ruta_defecto", "STRING", rol.ruta_defecto or "/"),
            ]
        )
        
        bq_client.query(insert_query, job_config=job_config).result()
        
        return {"message": "Rol creado exitosamente"}

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error creando rol: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/crear-permiso")
async def crear_permiso(
    permiso: NuevoPermiso,
    user = Depends(verificar_admin)
):
    """
    Crea un nuevo permiso en el sistema
    """
    try:
        if not verificar_bigquery():
            raise HTTPException(status_code=503, detail="Error de conexión con BigQuery")

        # Verificar si el permiso ya existe
        check_query = f"""
        SELECT COUNT(*) as count
        FROM `{PROJECT_ID}.{DATASET}.permisos`
        WHERE id_permiso = @id_permiso
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("id_permiso", "STRING", permiso.id_permiso),
            ]
        )
        
        result = next(bq_client.query(check_query, job_config=job_config).result())
        if result.count > 0:
            raise HTTPException(status_code=400, detail="El permiso ya existe")

        # Insertar nuevo permiso
        insert_query = f"""
        INSERT INTO `{PROJECT_ID}.{DATASET}.permisos`
        (id_permiso, nombre, descripcion, modulo, ruta)
        VALUES
        (@id_permiso, @nombre, @descripcion, @modulo, @ruta)
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("id_permiso", "STRING", permiso.id_permiso),
                bigquery.ScalarQueryParameter("nombre", "STRING", permiso.nombre),
                bigquery.ScalarQueryParameter("descripcion", "STRING", permiso.descripcion),
                bigquery.ScalarQueryParameter("modulo", "STRING", permiso.modulo),
                bigquery.ScalarQueryParameter("ruta", "STRING", permiso.ruta),
            ]
        )
        
        bq_client.query(insert_query, job_config=job_config).result()
        
        return {"message": "Permiso creado exitosamente"}

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error creando permiso: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rol/{id_rol}/permisos")
async def actualizar_permisos_rol(
    id_rol: str,
    permisos_ids: List[str] = Form(...),
    user = Depends(verificar_admin)
):
    """
    Actualiza los permisos asignados a un rol
    """
    try:
        if not verificar_bigquery():
            raise HTTPException(status_code=503, detail="Error de conexión con BigQuery")

        # Verificar que el rol existe
        check_query = f"""
        SELECT COUNT(*) as count
        FROM `{PROJECT_ID}.{DATASET}.roles`
        WHERE id_rol = @id_rol
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("id_rol", "STRING", id_rol),
            ]
        )
        
        result = next(bq_client.query(check_query, job_config=job_config).result())
        if result.count == 0:
            raise HTTPException(status_code=404, detail="Rol no encontrado")

        # Eliminar permisos actuales del rol
        delete_query = f"""
        DELETE FROM `{PROJECT_ID}.{DATASET}.rol_permisos`
        WHERE id_rol = @id_rol
        """
        
        bq_client.query(delete_query, job_config=job_config).result()

        # Insertar nuevos permisos
        if permisos_ids:
            values = ", ".join([f"(@id_rol, @permiso_{i})" for i in range(len(permisos_ids))])
            insert_query = f"""
            INSERT INTO `{PROJECT_ID}.{DATASET}.rol_permisos` (id_rol, id_permiso)
            VALUES {values}
            """
            
            params = [bigquery.ScalarQueryParameter("id_rol", "STRING", id_rol)]
            params.extend([
                bigquery.ScalarQueryParameter(f"permiso_{i}", "STRING", permiso_id)
                for i, permiso_id in enumerate(permisos_ids)
            ])
            
            job_config = bigquery.QueryJobConfig(query_parameters=params)
            bq_client.query(insert_query, job_config=job_config).result()

        return {"message": "Permisos actualizados exitosamente"}

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error actualizando permisos: {e}")
        raise HTTPException(status_code=500, detail=str(e))
