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
) -> Dict[str, Any]:
    """
    Devuelve el resumen diario de conciliación bancaria para un mes dado.
    SOLO usa datos reales de BigQuery - SIN simulaciones.
    """
    client = get_bigquery_client()
    try:
        # Validar mes
        try:
            year, month = map(int, mes.split("-"))
        except Exception:
            raise HTTPException(status_code=400, detail="Formato de mes inválido. Usa YYYY-MM")

        from calendar import monthrange
        dias_mes = monthrange(year, month)[1]
        fecha_inicio = f"{year}-{str(month).zfill(2)}-01"
        fecha_fin = f"{year}-{str(month).zfill(2)}-{str(dias_mes).zfill(2)}"

        fechas = [f"{year}-{str(month).zfill(2)}-{str(d).zfill(2)}" for d in range(1, dias_mes+1)]
        dias_conciliacion = {fecha: {"fecha": fecha} for fecha in fechas}

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("fecha_inicio", "DATE", fecha_inicio),
                bigquery.ScalarQueryParameter("fecha_fin", "DATE", fecha_fin),
            ]
        )

        # SOPORTES MENSUALES
        soportes_aprobados = 0
        try:
            query_soportes_aprobados = f"""
                SELECT 
                    COUNT(*) AS total
                FROM ( 
                SELECT referencia_pago, correo
                FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
                WHERE DATE(fecha_pago) BETWEEN @fecha_inicio AND @fecha_fin
                    AND estado_conciliacion IN ('conciliado_manual', 'conciliado_automatico')
                    AND correo IS NOT NULL AND referencia_pago IS NOT NULL
                    AND SAFE_CAST(valor AS FLOAT64) > 0
                    AND (novedades IS NULL OR novedades = '')
                GROUP BY referencia_pago, correo
                )
            """
            row = next(client.query(query_soportes_aprobados, job_config=job_config).result())
            soportes_aprobados = int(row["total"] or 0)
        except Exception as exc:
            logger.error(f"Error obteniendo soportes_aprobados: {exc}")
            soportes_aprobados = 0


        # VALOR TOTAL DE SOPORTES APROBADOS

        valor_soportes_aprobados = 0
        try:
            query_valor_soportes_aprobados = f"""
            SELECT
                SUM(SAFE_CAST(valor_unico AS FLOAT64)) AS plata_soportes_aprobados
            FROM ( 
                SELECT
                COALESCE(
                    NULLIF(MAX(valor_total_consignacion), 0),
                    SUM(SAFE_CAST(valor AS FLOAT64))
                ) AS valor_unico
                FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
                WHERE DATE(fecha_pago) BETWEEN @fecha_inicio AND @fecha_fin
                    AND estado_conciliacion IN ('conciliado_automatico', 'conciliado_manual')
                    AND referencia_pago IS NOT NULL AND correo IS NOT NULL
                    AND (
                        (valor_total_consignacion IS NOT NULL AND SAFE_CAST(valor_total_consignacion AS FLOAT64) > 0)
                    OR (valor IS NOT NULL AND SAFE_CAST(valor AS FLOAT64) > 0)
                    )
                    AND (novedades IS NULL OR novedades = '')
                GROUP BY referencia_pago, correo
            )
            """
            row = next(client.query(query_valor_soportes_aprobados, job_config=job_config).result())
            valor_soportes_aprobados = float(row["plata_soportes_aprobados"] or 0)
        except Exception as exc:
            logger.error(f"Error obteniendo soportes_aprobados: {exc}")
            valor_soportes_aprobados = 0



        
        # Utilidad para ejecutar una consulta y llenar resultados por fecha
        def ejecutar_y_cargar(query, campo_nombre, cast_func=int):
            try:
                with concurrent.futures.ThreadPoolExecutor() as executor:
                    future = executor.submit(lambda: list(client.query(query, job_config=job_config).result()))
                    rows = future.result(timeout=180)  # 180 segundos de timeout
                for row in rows:
                    fecha = str(row["fecha"])
                    valor = row.get("valor") if "valor" in row else row.get(campo_nombre)
                    if valor is None:
                        valor = 0
                    dias_conciliacion[fecha][campo_nombre] = cast_func(valor)
            except Exception as exc:
                logger.error(f"Error en ejecutar_y_cargar para campo {campo_nombre}: {exc}")
                # No lanzar, solo loguear

# ------------------------------------Resumenes Diarios  ------------------------------------------------------

        # 1. Plata del banco y total consignaciones
        ejecutar_y_cargar(
            f"""
            SELECT 
                DATE(fecha) AS fecha, 
                SUM(valor_banco) AS plata_banco
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.banco_movimientos`
            WHERE DATE(fecha) BETWEEN @fecha_inicio AND @fecha_fin
              AND valor_banco IS NOT NULL 
              AND SAFE_CAST(valor_banco AS FLOAT64) > 0
            GROUP BY fecha
            """, "plata_banco", int)
        ejecutar_y_cargar(
            f"""
            SELECT
                DATE(fecha) AS fecha, 
                COUNT(*) AS total_consignaciones_banco
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.banco_movimientos`
            WHERE DATE(fecha) BETWEEN @fecha_inicio AND @fecha_fin
              AND valor_banco IS NOT NULL 
              AND SAFE_CAST(valor_banco AS FLOAT64) > 0
            GROUP BY fecha
            """, "total_consignaciones_banco")
          
        # 2. Plata soportes
        ejecutar_y_cargar(
            f"""
            SELECT 
                fecha,
                SUM(valor_unico) AS plata_soportes
            FROM (
                SELECT 
                    DATE(fecha_pago) AS fecha,
                    referencia_pago,
                    correo,
                    COALESCE(
                        NULLIF(MAX(valor_total_consignacion), 0),
                        SUM(SAFE_CAST(valor AS FLOAT64))
                    ) AS valor_unico
                FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
                WHERE DATE(fecha_pago) BETWEEN @fecha_inicio AND @fecha_fin
                AND estado_conciliacion IN ('conciliado_manual', 'conciliado_automatico')
                AND referencia_pago IS NOT NULL AND correo IS NOT NULL
                AND (
                        (valor_total_consignacion IS NOT NULL AND SAFE_CAST(valor_total_consignacion AS FLOAT64) > 0)
                    OR (valor IS NOT NULL AND SAFE_CAST(valor AS FLOAT64) > 0)
                )
                AND (novedades IS NULL OR novedades = '')
                GROUP BY fecha, referencia_pago, correo
            )
            GROUP BY fecha
            """, "plata_soportes", float)

        # 3. Soportes conciliados
        ejecutar_y_cargar(
            f"""
            SELECT DATE(fecha_pago) AS fecha, COUNT(DISTINCT referencia_pago) AS soportes_conciliados
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
            WHERE DATE(fecha_pago) BETWEEN @fecha_inicio AND @fecha_fin
                AND estado_conciliacion IN ('conciliado_manual', 'conciliado_automatico')
                AND referencia_pago IS NOT NULL
                AND correo IS NOT NULL
                AND SAFE_CAST(valor AS FLOAT64) > 0
                AND (novedades IS NULL OR novedades = '')
            GROUP BY fecha
            """, "soportes_conciliados"
        )

        # 4. Guías pagadas
        ejecutar_y_cargar(
            f"""
            SELECT DATE(fecha) AS fecha, COUNT(*) AS guias_pagadas
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
            WHERE DATE(fecha) BETWEEN @fecha_inicio AND @fecha_fin
              AND estado_conciliacion IN ('conciliado_manual', 'conciliado_automatico')
              AND estado_conciliacion IS NOT NULL
              AND referencia_pago IS NOT NULL 
              AND correo IS NOT NULL
              AND valor IS NOT NULL
              AND valor IS NOT NULL AND SAFE_CAST(valor AS FLOAT64) > 0
              
            GROUP BY fecha
            """, "guias_pagadas")

        # 5. Guías totales
        ejecutar_y_cargar(
            f"""
            SELECT DATE(fecha) AS fecha, COUNT(*) AS guias_totales
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
            WHERE DATE(fecha) BETWEEN @fecha_inicio AND @fecha_fin
              AND valor IS NOT NULL AND SAFE_CAST(valor AS FLOAT64) > 0
            GROUP BY fecha
            """, "guias_totales")

        # Calcular campos derivados: diferencia y avance
        # Las variables ya están inicializadas antes del bucle, no duplicar

        resultado_dias = []
        # Totales mensuales
        total_plata_banco = 0.0
        total_soportes_conciliados = 0
        total_consignaciones_banco = 0
        total_diferencia = 0.0
        total_guias_totales = 0
        total_plata_soportes = 0.0
        total_guias_pagadas = 0

        # Calcular totales mensuales independientes
        total_plata_banco = 0.0
        total_soportes_conciliados = 0
        total_consignaciones_banco = 0
        total_diferencia = 0.0
        total_guias_totales = 0
        total_plata_soportes = 0.0
        total_guias_pagadas = 0
        resultado_dias = []

        for dia in fechas:
            try:
                d = dias_conciliacion[dia]
                pb = d.get("plata_banco", 0.0)
                ps = d.get("plata_soportes", 0.0)
                soportes_conciliados = d.get("soportes_conciliados", 0)
                total_consignaciones = d.get("total_consignaciones_banco", 0)
                guias_totales = d.get("guias_totales", 0)
                guias_pagadas = d.get("guias_pagadas", 0)
                diferencia = ps - pb
                if ps == 0 and pb == 0:
                    avance = 0.0
                elif ps == 0:
                    avance = 0.0
                else:
                    avance = round(100 * (1 - abs(ps - pb) / max(ps, 1)), 1)

                resultado_dias.append({
                    "fecha": dia,
                    "plata_banco": pb,
                    "soportes_conciliados": soportes_conciliados,
                    "total_consignaciones_banco": total_consignaciones,
                    "diferencia": int(diferencia),
                    "guias_totales": guias_totales,
                    "plata_soportes": ps,
                    "guias_pagadas": guias_pagadas,
                    "avance": avance,
                })

                # Acumular totales mensuales independientes
                total_plata_banco += pb
                total_soportes_conciliados += soportes_conciliados
                total_consignaciones_banco += total_consignaciones
                total_diferencia += diferencia
                total_guias_totales += guias_totales
                total_plata_soportes += ps
                total_guias_pagadas += guias_pagadas
            except Exception as exc:
                logger.error(f"Error procesando día {dia}: {exc}")
                resultado_dias.append({
                    "fecha": dia,
                    "plata_banco": 0.0,
                    "soportes_conciliados": 0,
                    "total_consignaciones_banco": 0,
                    "diferencia": 0,
                    "guias_totales": 0,
                    "plata_soportes": 0.0,
                    "guias_pagadas": 0,
                    "avance": 0.0,
                })

        # Calcular avance mensual
        avance_mensual = 0.0
        if total_plata_soportes > 0:
            avance_mensual = round(100 * (1 - abs(total_plata_soportes - total_plata_banco) / max(total_plata_soportes, 1)), 1)

        # Estructura de respuesta
        respuesta = {
            "totales_mensuales": {
                "plata_banco": total_plata_banco,
                "soportes_conciliados": total_soportes_conciliados,
                "total_consignaciones_banco": total_consignaciones_banco,
                "diferencia": int(total_diferencia),
                "guias_totales": total_guias_totales,
                "plata_soportes": total_plata_soportes,
                "guias_pagadas": total_guias_pagadas,
                "avance": avance_mensual,
                "valor_soportes_mensuales": valor_soportes_aprobados,  # <-- Nuevo campo independiente
                "soportes_mensuales": soportes_aprobados  # <-- Nuevo campo independiente
            },
            "dias": resultado_dias
        }

        logger.info(f"✅ Conciliación mensual obtenida con totales y días: {len(resultado_dias)} días")
        return respuesta

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en conciliacion_mensual: {e}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


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