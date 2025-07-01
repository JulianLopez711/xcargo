from fastapi import APIRouter, HTTPException, Query
from google.cloud import bigquery
from google.api_core import exceptions as gcp_exceptions
from datetime import datetime
import logging
from typing import List, Dict, Any, Optional
import asyncio
import concurrent.futures

# Configurar logging específico para contabilidad
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contabilidad", tags=["Contabilidad"])

# Configuración de BigQuery - CORREGIDA según tu estructura
PROJECT_ID = "datos-clientes-441216"
DATASET_CONCILIACIONES = "Conciliaciones"

def get_bigquery_client() -> bigquery.Client:
    """Obtiene cliente de BigQuery con manejo de errores"""
    try:
        return bigquery.Client(project=PROJECT_ID)
    except Exception as e:
        logger.error(f"Error inicializando cliente BigQuery: {e}")
        raise HTTPException(
            status_code=500, 
            detail="Error de configuración de base de datos"
        )

async def verificar_tablas_disponibles(client: bigquery.Client) -> Dict[str, bool]:
    """Verifica qué tablas están disponibles en tu proyecto"""
    
    tablas_a_verificar = {
        "pagosconductor": f"{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor",
        "COD_pendientes_v1": f"{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1",
    }
    
    tablas_disponibles = {}
    
    for nombre, tabla_id in tablas_a_verificar.items():
        try:
            # Test de acceso simple
            query = f"SELECT COUNT(*) as total FROM `{tabla_id}` LIMIT 1"
            result = client.query(query)
            next(result.result())
            tablas_disponibles[nombre] = True
            logger.info(f"✅ Tabla disponible: {tabla_id}")
        except gcp_exceptions.NotFound:
            tablas_disponibles[nombre] = False
            logger.warning(f"❌ Tabla no encontrada: {tabla_id}")
        except Exception as e:
            tablas_disponibles[nombre] = False
            logger.error(f"❌ Error accediendo tabla {tabla_id}: {e}")
    
    return tablas_disponibles

@router.get("/resumen")
async def obtener_resumen_contabilidad() -> List[Dict[str, Any]]:
    """
    Obtiene el resumen de contabilidad usando SOLO las tablas disponibles
    """
    client = get_bigquery_client()

    try:
        logger.info("Iniciando consulta de resumen contabilidad")
        
        # PASO 1: Verificar qué tablas tenemos disponibles
        tablas_disponibles = await verificar_tablas_disponibles(client)
        logger.info(f"Tablas disponibles: {tablas_disponibles}")
        
        # PASO 2: Construir consulta usando ambas tablas reales
        if tablas_disponibles.get("pagosconductor", False):
            # Datos de pagos realizados por conductores
            query = """
            WITH datos_pagos AS (
                SELECT 
                    COALESCE(UPPER(TRIM(cliente)), 'SIN_CLIENTE') AS cliente,
                    CONCAT('PAGO - ', COALESCE(UPPER(TRIM(estado)), 'SIN_ESTADO')) AS estado,
                    COUNT(*) AS guias,
                    COALESCE(SUM(SAFE_CAST(valor AS FLOAT64)), 0) AS valor,
                    0 AS pendiente  -- Los pagos ya no están pendientes
                FROM `{project}.{dataset}.pagosconductor`
                WHERE cliente IS NOT NULL 
                    AND cliente != ''
                    AND valor IS NOT NULL
                    AND fecha_pago >= '2025-06-09'
                    AND SAFE_CAST(valor AS FLOAT64) > 0
                GROUP BY cliente, estado
            )
            """.format(
                project=PROJECT_ID,
                dataset=DATASET_CONCILIACIONES
            )
            
            # Agregar datos de COD_pendientes_v1 (guías por cobrar)
            if tablas_disponibles.get("COD_pendientes_v1", False):
                query += """
                , datos_pendientes AS (
                    SELECT 
                        COALESCE(UPPER(TRIM(Cliente)), 'SIN_CLIENTE') AS cliente,
                        CONCAT('COD - ', COALESCE(UPPER(TRIM(Status_Big)), 'SIN_ESTADO')) AS estado,
                        COUNT(*) AS guias,
                        COALESCE(SUM(SAFE_CAST(Valor AS FLOAT64)), 0) AS valor,
                        CASE 
                            WHEN UPPER(Status_Big) LIKE '%ENTREGADO%' OR UPPER(Status_Big) LIKE '%360%'
                            THEN 0  -- Ya entregado, no pendiente
                            ELSE COALESCE(SUM(SAFE_CAST(Valor AS FLOAT64)), 0)  -- Aún pendiente
                        END AS pendiente
                    FROM `{project}.{dataset}.COD_pendientes_v1`
                    WHERE Cliente IS NOT NULL
                        AND Cliente != ''
                        AND Valor IS NOT NULL
                        AND Status_Date >= '2025-06-09'
                        AND SAFE_CAST(Valor AS FLOAT64) > 0
                    GROUP BY Cliente, Status_Big
                ),
                datos_combinados AS (
                    SELECT * FROM datos_pagos
                    UNION ALL
                    SELECT * FROM datos_pendientes
                )
                """.format(
                    project=PROJECT_ID,
                    dataset=DATASET_CONCILIACIONES
                )
            else:
                query += ", datos_combinados AS (SELECT * FROM datos_pagos)"
        else:
            # Si no hay pagosconductor, usar solo COD_pendientes_v1
            if tablas_disponibles.get("COD_pendientes_v1", False):
                query = """
                WITH datos_combinados AS (
                    SELECT 
                        COALESCE(UPPER(TRIM(Cliente)), 'SIN_CLIENTE') AS cliente,
                        CONCAT('COD - ', COALESCE(UPPER(TRIM(Status_Big)), 'SIN_ESTADO')) AS estado,
                        COUNT(*) AS guias,
                        COALESCE(SUM(SAFE_CAST(Valor AS FLOAT64)), 0) AS valor,
                        CASE 
                            WHEN UPPER(Status_Big) LIKE '%ENTREGADO%' OR UPPER(Status_Big) LIKE '%360%'
                            THEN 0
                            ELSE COALESCE(SUM(SAFE_CAST(Valor AS FLOAT64)), 0)
                        END AS pendiente
                    FROM `{project}.{dataset}.COD_pendientes_v1`
                    WHERE Cliente IS NOT NULL
                        AND Cliente != ''
                        AND Valor IS NOT NULL
                        AND Status_Date >= '2025-06-09'
                        AND SAFE_CAST(Valor AS FLOAT64) > 0
                    GROUP BY Cliente, Status_Big
                )
                """.format(
                    project=PROJECT_ID,
                    dataset=DATASET_CONCILIACIONES
                )
            else:
                logger.warning("No se encontraron tablas de datos disponibles")
                return []
        
        # PASO 3: Finalizar consulta
        query += """
        SELECT 
            cliente,
            estado,
            guias,
            valor,
            pendiente
        FROM datos_combinados
        WHERE cliente != 'SIN_CLIENTE'
            AND guias > 0
        ORDER BY cliente, estado
        """

        # PASO 4: Ejecutar consulta con timeout manual
        logger.info("Ejecutando consulta principal...")
        query_job = client.query(query)
        
        # Timeout manual usando concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(lambda: list(query_job.result()))
            try:
                rows = future.result(timeout=30)  # 30 segundos timeout
            except concurrent.futures.TimeoutError:
                logger.error("Query timeout después de 30 segundos")
                raise HTTPException(
                    status_code=504, 
                    detail="La consulta tardó demasiado tiempo. Intente nuevamente."
                )
        
        # PASO 5: Procesar resultados
        agrupado = {}
        
        for row in rows:
            cliente_raw = row["cliente"]
            cliente = normalizar_nombre_cliente(cliente_raw)
            
            if cliente not in agrupado:
                agrupado[cliente] = []
            
            agrupado[cliente].append({
                "estado": normalizar_estado(row["estado"]),
                "guias": int(row["guias"]) if row["guias"] else 0,
                "valor": float(row["valor"]) if row["valor"] else 0.0,
                "pendiente": float(row["pendiente"]) if row["pendiente"] else 0.0
            })
        
        # PASO 6: Formato final
        resumen = []
        for cliente, datos in agrupado.items():
            datos_ordenados = sorted(datos, key=lambda x: obtener_prioridad_estado(x["estado"]))
            resumen.append({
                "cliente": cliente,
                "datos": datos_ordenados
            })
        
        resumen.sort(key=lambda x: x["cliente"])
        
        logger.info(f"✅ Resumen generado: {len(resumen)} clientes, tablas usadas: {[k for k,v in tablas_disponibles.items() if v]}")
        
        return resumen

    except gcp_exceptions.NotFound as e:
        logger.error(f"Tabla no encontrada: {e}")
        raise HTTPException(
            status_code=404, 
            detail="Tabla de datos no encontrada en BigQuery. Verifique la configuración."
        )
    except concurrent.futures.TimeoutError:
        logger.error("Timeout en consulta de resumen")
        raise HTTPException(
            status_code=504, 
            detail="La consulta tardó demasiado tiempo. Intente nuevamente."
        )
    except Exception as e:
        logger.error(f"Error en obtener_resumen_contabilidad: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail="Error interno del servidor. Contacte al administrador."
        )

def normalizar_nombre_cliente(cliente_raw: str) -> str:
    """Normaliza el nombre del cliente para consistencia"""
    if not cliente_raw or cliente_raw.upper() == 'SIN_CLIENTE':
        return 'Sin Cliente'
    
    cliente_limpio = cliente_raw.strip().title()
    
    # Casos especiales conocidos
    replacements = {
        'Dropi': 'DROPI',
        'Xcargo': 'XCargo',
        'Tcc': 'TCC'
    }
    
    for old, new in replacements.items():
        cliente_limpio = cliente_limpio.replace(old, new)
    
    return cliente_limpio

def normalizar_estado(estado_raw: str) -> str:
    """Normaliza el estado para consistencia"""
    if not estado_raw:
        return 'Sin Estado'
    
    estado = estado_raw.strip()
    
    # Normalizar estados de pagos
    if estado.startswith('PAGO - '):
        estado_pago = estado.replace('PAGO - ', '').title()
        if 'PAGADO' in estado_pago.upper():
            return '💰 Pago - Pagado'
        elif 'APROBADO' in estado_pago.upper():
            return '✅ Pago - Aprobado'
        elif 'RECHAZADO' in estado_pago.upper():
            return '❌ Pago - Rechazado'
        else:
            return f'💳 Pago - {estado_pago}'
    
    # Normalizar estados de COD
    elif estado.startswith('COD - '):
        estado_cod = estado.replace('COD - ', '')
        if '360' in estado_cod or 'ENTREGADO' in estado_cod.upper():
            return '✅ COD - Entregado'
        elif 'RUTA' in estado_cod.upper():
            return '🚚 COD - En Ruta'
        elif 'ASIGNADO' in estado_cod.upper():
            return '📋 COD - Asignado'
        elif 'PENDIENTE' in estado_cod.upper():
            return '⏳ COD - Pendiente'
        else:
            return f'📦 COD - {estado_cod.title()}'
    
    # Estados sin prefijo
    elif 'PENDIENTE' in estado.upper():
        return '⏳ Pendiente'
    elif 'PAGADO' in estado.upper():
        return '💰 Pagado'
    elif 'APROBADO' in estado.upper():
        return '✅ Aprobado'
    elif '360' in estado or 'ENTREGADO' in estado.upper():
        return '✅ Entregado'
    
    return estado.title()

def obtener_prioridad_estado(estado: str) -> int:
    """Determina la prioridad de ordenamiento para los estados"""
    estado_lower = estado.lower()
    
    # Prioridades por tipo
    if 'pendiente' in estado_lower:
        return 1
    elif 'asignado' in estado_lower:
        return 2
    elif 'ruta' in estado_lower:
        return 3
    elif 'pagado' in estado_lower:
        return 4
    elif 'aprobado' in estado_lower:
        return 5
    elif 'entregado' in estado_lower:
        return 6
    elif 'rechazado' in estado_lower:
        return 10  # Al final
    
    return 999  # Estados desconocidos al final

@router.get("/resumen/cliente/{cliente}")
async def obtener_resumen_cliente(cliente: str) -> Dict[str, Any]:
    """
    Obtiene el resumen detallado de un cliente específico
    """
    client = get_bigquery_client()
    
    try:
        cliente_upper = cliente.upper().strip()
        
        if not cliente_upper:
            raise HTTPException(status_code=400, detail="Nombre de cliente requerido")
        
        # Verificar tablas disponibles
        tablas_disponibles = await verificar_tablas_disponibles(client)
        
        if not tablas_disponibles.get("pagosconductor", False):
            raise HTTPException(status_code=503, detail="Tabla de pagos no disponible")
        
        query = """
        SELECT 
            COALESCE(UPPER(TRIM(estado)), 'SIN_ESTADO') AS estado,
            COUNT(*) AS guias,
            COALESCE(SUM(SAFE_CAST(valor AS FLOAT64)), 0) AS valor,
            0 AS pendiente  -- Simplificado para evitar errores GROUP BY
        FROM `{project}.{dataset}.pagosconductor`
        WHERE UPPER(TRIM(cliente)) = @cliente_upper
            AND valor IS NOT NULL 
            AND SAFE_CAST(valor AS FLOAT64) > 0
            AND fecha_pago >= '2025-06-09'
        GROUP BY estado
        """.format(
            project=PROJECT_ID,
            dataset=DATASET_CONCILIACIONES
        )
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("cliente_upper", "STRING", cliente_upper)
            ]
        )
        
        query_job = client.query(query, job_config=job_config)
        
        # Timeout manual
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(lambda: list(query_job.result()))
            rows = future.result(timeout=15)
        
        datos = []
        for row in rows:
            datos.append({
                "estado": normalizar_estado(row["estado"]),
                "guias": int(row["guias"]) if row["guias"] else 0,
                "valor": float(row["valor"]) if row["valor"] else 0.0,
                "pendiente": float(row["pendiente"]) if row["pendiente"] else 0.0
            })
        
        return {
            "cliente": normalizar_nombre_cliente(cliente),
            "datos": sorted(datos, key=lambda x: obtener_prioridad_estado(x["estado"]))
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo resumen de cliente {cliente}: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error obteniendo datos del cliente"
        )

@router.get("/health")
def health_check() -> Dict[str, str]:
    """Endpoint de verificación de salud"""
    try:
        client = get_bigquery_client()
        
        # Test simple de conectividad
        test_query = "SELECT 1 as test"
        result = client.query(test_query)
        next(result.result())
        
        return {
            "status": "healthy",
            "module": "contabilidad",
            "bigquery": "connected",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy", 
            "module": "contabilidad",
            "bigquery": "disconnected",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@router.get("/debug-tablas")
async def debug_tablas_disponibles() -> Dict[str, Any]:
    """
    Debug: Verifica qué tablas están disponibles en tu proyecto
    """
    client = get_bigquery_client()
    
    try:
        tablas_disponibles = await verificar_tablas_disponibles(client)
        
        # Información adicional sobre el dataset
        datasets_info = {}
        try:
            datasets = client.list_datasets(PROJECT_ID)
            for dataset in datasets:
                dataset_id = dataset.dataset_id
                tables = client.list_tables(f"{PROJECT_ID}.{dataset_id}")
                datasets_info[dataset_id] = [table.table_id for table in tables]
        except Exception as e:
            datasets_info["error"] = str(e)
        
        return {
            "project_id": PROJECT_ID,
            "tablas_verificadas": tablas_disponibles,
            "datasets_y_tablas": datasets_info,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error en debug de tablas: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error verificando tablas: {str(e)}"
        )

@router.get("/test-consulta-simple")
def test_consulta_simple() -> Dict[str, Any]:
    """
    Test: Consulta simple para verificar acceso a pagosconductor
    """
    client = get_bigquery_client()
    
    try:
        query = f"""
        SELECT 
            COUNT(*) as total_registros,
            COUNT(DISTINCT cliente) as clientes_unicos,
            MAX(fecha_pago) as fecha_mas_reciente
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
        WHERE valor IS NOT NULL
        """
        
        result = client.query(query).result()
        row = next(result)
        
        return {
            "status": "success",
            "tabla": f"{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor",
            "total_registros": int(row["total_registros"]) if row["total_registros"] else 0,
            "clientes_unicos": int(row["clientes_unicos"]) if row["clientes_unicos"] else 0,
            "fecha_mas_reciente": str(row["fecha_mas_reciente"]) if row["fecha_mas_reciente"] else None,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error en test simple: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error en consulta de test: {str(e)}"
        )

@router.get("/test-datos-muestra")
def test_datos_muestra(limite: int = Query(5, ge=1, le=20)) -> Dict[str, Any]:
    """
    Test: Muestra datos reales de la tabla para debugging
    """
    client = get_bigquery_client()
    
    try:
        query = f"""
        SELECT 
            cliente,
            estado,
            valor,
            fecha_pago
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
        WHERE cliente IS NOT NULL 
            AND valor IS NOT NULL
            AND fecha_pago >= '2025-06-09'
        ORDER BY fecha_pago DESC
        LIMIT {limite}
        """
        
        result = client.query(query).result()
        
        muestra = []
        for row in result:
            muestra.append({
                "cliente": row["cliente"],
                "estado": row["estado"],
                "valor": float(row["valor"]) if row["valor"] else 0,
                "fecha_pago": str(row["fecha_pago"]) if row["fecha_pago"] else None
            })
        
        return {
            "status": "success",
            "tabla": f"{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor",
            "limite": limite,
            "registros_encontrados": len(muestra),
            "muestra_datos": muestra,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo muestra: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error en consulta de muestra: {str(e)}"
        )

@router.get("/conciliacion-mensual")
async def conciliacion_mensual(
    mes: str = Query(..., description="Mes en formato YYYY-MM")
) -> List[Dict[str, Any]]:
    """
    Devuelve el resumen diario de conciliación bancaria para un mes dado.
    SOLO usa datos reales de BigQuery - SIN simulaciones.
    """
    client = get_bigquery_client()
    
    try:
        # Parsear año y mes
        try:
            year, month = map(int, mes.split("-"))
        except Exception:
            raise HTTPException(status_code=400, detail="Formato de mes inválido. Usa YYYY-MM")

        # Verificar tablas disponibles
        tablas_disponibles = await verificar_tablas_disponibles(client)
        
        # Determinar rango de fechas del mes
        from calendar import monthrange
        
        dias_mes = monthrange(year, month)[1]
        fecha_inicio = f"{year}-{str(month).zfill(2)}-01"
        fecha_fin = f"{year}-{str(month).zfill(2)}-{str(dias_mes).zfill(2)}"

        logger.info(f"Consultando conciliación para {mes}: {fecha_inicio} a {fecha_fin}")

        # Intentar usar tabla de conciliación real primero
        dias_conciliacion = []
        
        # OPCIÓN 1: Construir conciliación usando banco_movimientos y pagosconductor (SOLO DATOS REALES)
        try:
            # Usar banco_movimientos para obtener los valores reales del banco - SIN ESTIMACIONES
            query_conciliacion = f"""
            WITH datos_soportes AS (
                SELECT
                    DATE(fecha_pago) as fecha,
                    SUM(SAFE_CAST(valor AS FLOAT64)) as valor_soportes,
                    COUNT(DISTINCT tracking) as guias_soportes,
                    COUNT(*) as movimientos_soportes
                FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
                WHERE DATE(fecha_pago) BETWEEN @fecha_inicio AND @fecha_fin
                    AND estado IN ('aprobado', 'pagado')
                    AND valor IS NOT NULL
                    AND SAFE_CAST(valor AS FLOAT64) > 0
                GROUP BY DATE(fecha_pago)
            ),
            datos_banco AS (
                SELECT
                    DATE(fecha) as fecha,
                    SUM(SAFE_CAST(valor_banco AS FLOAT64)) as valor_banco_real,
                    COUNT(*) as movimientos_banco
                FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.banco_movimientos`
                WHERE DATE(fecha) BETWEEN @fecha_inicio AND @fecha_fin
                    AND valor_banco IS NOT NULL
                    AND SAFE_CAST(valor_banco AS FLOAT64) > 0
                GROUP BY DATE(fecha)
            )
            SELECT
                COALESCE(ds.fecha, db.fecha) as fecha,
                COALESCE(ds.valor_soportes, 0) as soportes,
                COALESCE(db.valor_banco_real, 0) as banco,  -- SOLO datos reales, no estimaciones
                COALESCE(ds.valor_soportes, 0) - COALESCE(db.valor_banco_real, 0) as diferencia,
                COALESCE(ds.guias_soportes, 0) as guias,
                COALESCE(ds.movimientos_soportes, 0) + COALESCE(db.movimientos_banco, 0) as movimientos,
                CASE
                    WHEN COALESCE(ds.valor_soportes, 0) = 0 AND COALESCE(db.valor_banco_real, 0) = 0 THEN 0
                    WHEN COALESCE(ds.valor_soportes, 0) = 0 THEN 0
                    ELSE ROUND(100 * (1 - ABS(COALESCE(ds.valor_soportes, 0) - COALESCE(db.valor_banco_real, 0)) / GREATEST(COALESCE(ds.valor_soportes, 0), 1)), 1)
                END as avance
            FROM datos_soportes ds
            FULL OUTER JOIN datos_banco db ON ds.fecha = db.fecha
            WHERE COALESCE(ds.fecha, db.fecha) IS NOT NULL
            ORDER BY COALESCE(ds.fecha, db.fecha)
            """
            
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("fecha_inicio", "DATE", fecha_inicio),
                    bigquery.ScalarQueryParameter("fecha_fin", "DATE", fecha_fin),
                ]
            )

            result = client.query(query_conciliacion, job_config=job_config)
            
            # Timeout manual
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(lambda: list(result.result()))
                rows = future.result(timeout=30)
                
            for row in rows:
                dias_conciliacion.append({
                    "fecha": str(row.fecha),
                    "soportes": int(row.soportes) if row.soportes else 0,
                    "banco": int(row.banco) if row.banco else 0,
                    "diferencia": int(row.diferencia) if row.diferencia else 0,
                    "guias": int(row.guias) if row.guias else 0,
                    "movimientos": int(row.movimientos) if row.movimientos else 0,
                    "avance": float(row.avance) if row.avance is not None else 0.0
                })
                
            if dias_conciliacion:
                logger.info(f"✅ Datos de conciliación obtenidos usando banco_movimientos: {len(dias_conciliacion)} días")
                return dias_conciliacion
            else:
                logger.info("⚠️ No se encontraron datos en banco_movimientos para el período solicitado")
                return []  # Retornar array vacío si no hay datos reales
                
        except Exception as e:
            logger.warning(f"Error consultando con banco_movimientos: {e}")
            logger.info("⚠️ No se pudieron obtener datos de banco_movimientos")
            return []  # Retornar array vacío en caso de error

        # NOTA: Se han deshabilitado las opciones de fallback con estimaciones
        # para garantizar que solo se muestren datos reales de banco_movimientos
        logger.info("📊 No hay datos disponibles en banco_movimientos para este período")
        return []
    except HTTPException:
        raise
    except concurrent.futures.TimeoutError:
        logger.error("Timeout en consulta de conciliación mensual")
        raise HTTPException(
            status_code=504, 
            detail="La consulta de conciliación tardó demasiado tiempo. Intente nuevamente."
        )
    except Exception as e:
        logger.error(f"Error en conciliacion_mensual: {e}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error interno al consultar conciliación mensual: {str(e)}"
        )

@router.get("/estructura-tablas")
async def obtener_estructura_tablas() -> Dict[str, Any]:
    """
    Debug: Obtiene la estructura real de las tablas disponibles
    """
    client = get_bigquery_client()
    
    try:
        estructura = {}
        
        # Verificar estructura de pagosconductor
        try:
            tabla_pagos = client.get_table(f"{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor")
            estructura["pagosconductor"] = {
                "existe": True,
                "total_filas": tabla_pagos.num_rows,
                "columnas": [field.name for field in tabla_pagos.schema]
            }
        except Exception as e:
            estructura["pagosconductor"] = {
                "existe": False,
                "error": str(e)
            }
        
        # Verificar estructura de COD_pendientes_v1
        try:
            tabla_cod = client.get_table(f"{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1")
            estructura["COD_pendientes_v1"] = {
                "existe": True,
                "total_filas": tabla_cod.num_rows,
                "columnas": [field.name for field in tabla_cod.schema]
            }
        except Exception as e:
            estructura["COD_pendientes_v1"] = {
                "existe": False,
                "error": str(e)
            }
        
        # Verificar estructura de conciliacion_diaria
        try:
            tabla_conciliacion = client.get_table(f"{PROJECT_ID}.{DATASET_CONCILIACIONES}.conciliacion_diaria")
            estructura["conciliacion_diaria"] = {
                "existe": True,
                "total_filas": tabla_conciliacion.num_rows,
                "columnas": [field.name for field in tabla_conciliacion.schema]
            }
        except Exception as e:
            estructura["conciliacion_diaria"] = {
                "existe": False,
                "error": str(e)
            }
        
        return {
            "project_id": PROJECT_ID,
            "dataset": DATASET_CONCILIACIONES,
            "estructura_tablas": estructura,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo estructura de tablas: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error verificando estructura de tablas: {str(e)}"
        )