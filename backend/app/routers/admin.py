"""
Módulo de administración para el sistema XCargo.
Maneja las rutas y funciones administrativas incluyendo verificación de permisos
y gestión de entregas.
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Header, Request
from google.cloud import bigquery
from datetime import datetime
import traceback
import logging
from typing import Optional

router = APIRouter(prefix="/admin", tags=["Administrador"])

PROJECT_ID = "datos-clientes-441216"
DATASET = "Conciliaciones"

# Configuración de logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    bq_client = bigquery.Client()
    logger.info("✅ Cliente BigQuery inicializado")
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
