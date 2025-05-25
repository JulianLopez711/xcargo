from fastapi import APIRouter, HTTPException, Query
from google.cloud import bigquery
from datetime import datetime
import logging

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contabilidad", tags=["Contabilidad"])

@router.get("/resumen")
def obtener_resumen_contabilidad():
    """
    Obtiene el resumen de contabilidad combinando datos de pagos y pendientes
    """
    client = bigquery.Client()

    try:
        logger.info("Iniciando consulta de resumen contabilidad")
        
        # Consulta unificada para obtener todos los datos
        query = """
        WITH pagos_realizados AS (
            SELECT 
                COALESCE(TRIM(UPPER(cliente)), 'SIN_CLIENTE') AS cliente,
                COALESCE(TRIM(estado), 'SIN_ESTADO') AS estado,
                COUNT(*) AS guias,
                COALESCE(SUM(CAST(valor AS FLOAT64)), 0) AS valor,
                0 AS pendiente
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            WHERE cliente IS NOT NULL 
            AND valor IS NOT NULL
            AND valor > 0
            GROUP BY cliente, estado
        ),
        pendientes AS (
            SELECT 
                COALESCE(TRIM(UPPER(cliente)), 'SIN_CLIENTE') AS cliente,
                'PENDIENTE' AS estado,
                COUNT(*) AS guias,
                COALESCE(SUM(CAST(valor AS FLOAT64)), 0) AS valor,
                COALESCE(SUM(CAST(valor AS FLOAT64)), 0) AS pendiente
            FROM `datos-clientes-441216.pickup_data.COD_pendiente`
            WHERE cliente IS NOT NULL
            AND valor IS NOT NULL
            AND valor > 0
            GROUP BY cliente
        )
        SELECT * FROM pagos_realizados
        UNION ALL
        SELECT * FROM pendientes
        ORDER BY cliente, estado
        """

        # Ejecutar consulta
        query_job = client.query(query)
        rows = query_job.result()
        
        # Procesar resultados
        agrupado = {}
        
        for row in rows:
            cliente = row["cliente"].title() if row["cliente"] != 'SIN_CLIENTE' else 'Sin Cliente'
            estado = row["estado"].title()
            
            if cliente not in agrupado:
                agrupado[cliente] = []
            
            agrupado[cliente].append({
                "estado": estado,
                "guias": int(row["guias"]),
                "valor": float(row["valor"]),
                "pendiente": float(row["pendiente"])
            })
        
        # Convertir a formato esperado por el frontend
        resumen = []
        for cliente, datos in agrupado.items():
            resumen.append({
                "cliente": cliente,
                "datos": datos
            })
        
        # Ordenar por cliente
        resumen.sort(key=lambda x: x["cliente"])
        
        logger.info(f"Resumen generado exitosamente: {len(resumen)} clientes procesados")
        return resumen

    except Exception as e:
        logger.error(f"Error en obtener_resumen_contabilidad: {str(e)}")
        # Devolver estructura vacía en caso de error para que el frontend no falle
        return []

@router.get("/resumen/cliente/{cliente}")
def obtener_resumen_cliente(cliente: str):
    """
    Obtiene el resumen detallado de un cliente específico
    """
    client = bigquery.Client()
    
    try:
        cliente_upper = cliente.upper()
        
        query = f"""
        WITH pagos_cliente AS (
            SELECT 
                COALESCE(TRIM(estado), 'SIN_ESTADO') AS estado,
                COUNT(*) AS guias,
                COALESCE(SUM(CAST(valor AS FLOAT64)), 0) AS valor,
                0 AS pendiente
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            WHERE UPPER(TRIM(cliente)) = '{cliente_upper}'
            AND valor IS NOT NULL AND valor > 0
            GROUP BY estado
        ),
        pendientes_cliente AS (
            SELECT 
                'PENDIENTE' AS estado,
                COUNT(*) AS guias,
                COALESCE(SUM(CAST(valor AS FLOAT64)), 0) AS valor,
                COALESCE(SUM(CAST(valor AS FLOAT64)), 0) AS pendiente
            FROM `datos-clientes-441216.pickup_data.COD_pendiente`
            WHERE UPPER(TRIM(cliente)) = '{cliente_upper}'
            AND valor IS NOT NULL AND valor > 0
        )
        SELECT * FROM pagos_cliente
        UNION ALL
        SELECT * FROM pendientes_cliente
        """
        
        rows = client.query(query).result()
        
        datos = []
        for row in rows:
            datos.append({
                "estado": row["estado"].title(),
                "guias": int(row["guias"]),
                "valor": float(row["valor"]),
                "pendiente": float(row["pendiente"])
            })
        
        return {
            "cliente": cliente.title(),
            "datos": datos
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo resumen de cliente {cliente}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo datos del cliente: {str(e)}")

@router.get("/health")
def health_check():
    """
    Endpoint de verificación de salud
    """
    return {"status": "ok", "timestamp": datetime.now().isoformat()}