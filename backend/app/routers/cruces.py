from fastapi import APIRouter, HTTPException, Query
from google.cloud import bigquery
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from pydantic import BaseModel
import logging

router = APIRouter(prefix="/cruces", tags=["Cruces"])

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CruceResponse(BaseModel):
    """Modelo de respuesta para cruces bancarios"""
    id_banco: str
    fecha_banco: str
    valor_banco: float
    descripcion_banco: str
    estado_conciliacion: str
    confianza_match: int
    referencia_pago: Optional[str] = None
    fecha_pago: Optional[str] = None
    valor_pago: Optional[float] = None
    tracking: Optional[str] = None
    observaciones: Optional[str] = None

class EstadisticasCruces(BaseModel):
    """Estadísticas de cruces"""
    total_movimientos: int
    conciliados: int
    pendientes: int
    diferencias: int
    porcentaje_conciliacion: float

@router.get("/obtener-cruces", response_model=List[CruceResponse])
def obtener_cruces_bancarios(
    estado: Optional[str] = Query(None, description="Filtrar por estado: todos, conciliado, pendiente, diferencia"),
    fecha_desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    fecha_hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)"),
    limit: int = Query(100, description="Límite de registros")
):
    """
    Obtiene cruces bancarios con filtros avanzados
    
    🎯 **BENEFICIO**: Vista consolidada de todos los cruces con filtros inteligentes
    """
    client = bigquery.Client()
    
    try:
        # Construir query base con filtros dinámicos
        where_conditions = ["1=1"]  # Condición base siempre verdadera
        
        if estado and estado != "todos":
            if estado == "conciliado":
                where_conditions.append("estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual')")
            elif estado == "pendiente":
                where_conditions.append("estado_conciliacion = 'pendiente'")
            elif estado == "diferencia":
                where_conditions.append("estado_conciliacion IN ('diferencia_valor', 'diferencia_fecha', 'multiple_match')")
        
        if fecha_desde:
            where_conditions.append(f"fecha >= DATE('{fecha_desde}')")
        
        if fecha_hasta:
            where_conditions.append(f"fecha <= DATE('{fecha_hasta}')")
        
        where_clause = " AND ".join(where_conditions)
        
        # Query principal con JOIN optimizado
        query = f"""
        WITH banco_con_pagos AS (
            SELECT 
                bm.id,
                bm.fecha,
                bm.valor_banco,
                bm.descripcion,
                bm.estado_conciliacion,
                bm.confianza_match,
                bm.observaciones,
                -- Datos del pago asociado (si existe)
                pc.referencia_pago,
                pc.fecha_pago,
                pc.valor as valor_pago,
                pc.tracking,
                -- Calcular diferencias
                ABS(bm.valor_banco - COALESCE(pc.valor, 0)) as diferencia_valor,
                ABS(DATE_DIFF(bm.fecha, pc.fecha_pago, DAY)) as diferencia_dias
            FROM `datos-clientes-441216.Conciliaciones.banco_movimientos` bm
            LEFT JOIN `datos-clientes-441216.Conciliaciones.pagosconductor` pc
                ON bm.id = pc.id_banco_asociado  -- Asumiendo que existe esta relación
            WHERE {where_clause}
        )
        SELECT 
            id as id_banco,
            FORMAT_DATE('%Y-%m-%d', fecha) as fecha_banco,
            valor_banco,
            descripcion as descripcion_banco,
            estado_conciliacion,
            COALESCE(confianza_match, 0) as confianza_match,
            referencia_pago,
            FORMAT_DATE('%Y-%m-%d', fecha_pago) as fecha_pago,
            valor_pago,
            tracking,
            CASE 
                WHEN observaciones IS NOT NULL AND observaciones != '' THEN observaciones
                WHEN diferencia_valor > 0 THEN CONCAT('Diferencia valor: 
                , FORMAT('%,.0f', diferencia_valor))
                WHEN diferencia_dias > 0 THEN CONCAT('Diferencia días: ', diferencia_dias)
                ELSE 'Sin observaciones'
            END as observaciones
        FROM banco_con_pagos
        ORDER BY fecha DESC, valor_banco DESC
        LIMIT {limit}
        """
        
        logger.info(f"Ejecutando query de cruces con filtros: estado={estado}, fecha_desde={fecha_desde}, fecha_hasta={fecha_hasta}")
        
        # Ejecutar query
        results = client.query(query).result()
        cruces = [dict(row) for row in results]
        
        logger.info(f"Se encontraron {len(cruces)} cruces bancarios")
        
        return cruces
        
    except Exception as e:
        logger.error(f"Error obteniendo cruces: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error consultando cruces: {str(e)}")

@router.get("/estadisticas-cruces", response_model=EstadisticasCruces)
def obtener_estadisticas_cruces():
    """
    Obtiene estadísticas generales de cruces bancarios
    
    🎯 **BENEFICIO**: KPIs de conciliación en tiempo real
    """
    client = bigquery.Client()
    
    try:
        query = """
        SELECT 
            COUNT(*) as total_movimientos,
            COUNT(CASE WHEN estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual') THEN 1 END) as conciliados,
            COUNT(CASE WHEN estado_conciliacion = 'pendiente' THEN 1 END) as pendientes,
            COUNT(CASE WHEN estado_conciliacion IN ('diferencia_valor', 'diferencia_fecha', 'multiple_match', 'sin_match') THEN 1 END) as diferencias
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE fecha >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        """
        
        result = list(client.query(query).result())[0]
        
        total = result.total_movimientos
        conciliados = result.conciliados
        
        porcentaje_conciliacion = (conciliados / total * 100) if total > 0 else 0
        
        estadisticas = EstadisticasCruces(
            total_movimientos=total,
            conciliados=conciliados,
            pendientes=result.pendientes,
            diferencias=result.diferencias,
            porcentaje_conciliacion=round(porcentaje_conciliacion, 2)
        )
        
        logger.info(f"Estadísticas generadas: {estadisticas}")
        return estadisticas
        
    except Exception as e:
        logger.error(f"Error obteniendo estadísticas: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error consultando estadísticas: {str(e)}")

@router.post("/aprobar-cruce/{id_banco}")
def aprobar_cruce_manual(
    id_banco: str,
    referencia_pago: Optional[str] = None,
    observaciones: str = "Aprobado manualmente"
):
    """
    Aprueba un cruce de forma manual
    
    🎯 **BENEFICIO**: Resolver casos complejos que requieren intervención humana
    """
    client = bigquery.Client()
    
    try:
        # Actualizar estado del movimiento bancario
        query_update = """
        UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
        SET 
            estado_conciliacion = 'conciliado_manual',
            confianza_match = 100,
            observaciones = @observaciones,
            fecha_conciliacion_manual = CURRENT_TIMESTAMP()
        WHERE id = @id_banco
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("id_banco", "STRING", id_banco),
                bigquery.ScalarQueryParameter("observaciones", "STRING", observaciones)
            ]
        )
        
        client.query(query_update, job_config=job_config).result()
        
        # Si se proporciona referencia de pago, también actualizar la tabla de pagos
        if referencia_pago:
            query_pago = """
            UPDATE `datos-clientes-441216.Conciliaciones.pagosconductor`
            SET 
                conciliado = TRUE,
                fecha_conciliacion = CURRENT_DATE(),
                id_banco_asociado = @id_banco
            WHERE referencia_pago = @referencia_pago
            """
            
            job_config_pago = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("id_banco", "STRING", id_banco),
                    bigquery.ScalarQueryParameter("referencia_pago", "STRING", referencia_pago)
                ]
            )
            
            client.query(query_pago, job_config=job_config_pago).result()
        
        logger.info(f"Cruce {id_banco} aprobado manualmente con referencia {referencia_pago}")
        
        return {
            "mensaje": "Cruce aprobado exitosamente",
            "id_banco": id_banco,
            "referencia_pago": referencia_pago,
            "fecha_aprobacion": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error aprobando cruce {id_banco}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error aprobando cruce: {str(e)}")

@router.post("/rechazar-cruce/{id_banco}")
def rechazar_cruce(
    id_banco: str,
    motivo: str = "Rechazado por revisión manual"
):
    """
    Rechaza un cruce y lo marca para revisión
    
    🎯 **BENEFICIO**: Gestión de excepciones y casos especiales
    """
    client = bigquery.Client()
    
    try:
        query_update = """
        UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
        SET 
            estado_conciliacion = 'rechazado',
            observaciones = @motivo,
            fecha_rechazo = CURRENT_TIMESTAMP()
        WHERE id = @id_banco
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("id_banco", "STRING", id_banco),
                bigquery.ScalarQueryParameter("motivo", "STRING", motivo)
            ]
        )
        
        client.query(query_update, job_config=job_config).result()
        
        logger.info(f"Cruce {id_banco} rechazado: {motivo}")
        
        return {
            "mensaje": "Cruce rechazado exitosamente",
            "id_banco": id_banco,
            "motivo": motivo,
            "fecha_rechazo": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error rechazando cruce {id_banco}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error rechazando cruce: {str(e)}")

@router.get("/cruces-pendientes")
def obtener_cruces_pendientes(limite: int = Query(50, description="Límite de registros")):
    """
    Obtiene solo los cruces que requieren atención manual
    
    🎯 **BENEFICIO**: Vista enfocada en tareas pendientes para mayor productividad
    """
    client = bigquery.Client()
    
    try:
        query = """
        SELECT 
            id,
            FORMAT_DATE('%Y-%m-%d', fecha) as fecha_banco,
            valor_banco,
            descripcion,
            estado_conciliacion,
            observaciones,
            DATETIME_DIFF(CURRENT_DATETIME(), cargado_en, DAY) as dias_pendiente
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE estado_conciliacion IN ('sin_match', 'multiple_match', 'diferencia_valor', 'diferencia_fecha')
        ORDER BY 
            CASE estado_conciliacion
                WHEN 'multiple_match' THEN 1
                WHEN 'diferencia_valor' THEN 2
                WHEN 'diferencia_fecha' THEN 3
                WHEN 'sin_match' THEN 4
            END,
            dias_pendiente DESC
        LIMIT @limite
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("limite", "INT64", limite)
            ]
        )
        
        results = client.query(query, job_config=job_config).result()
        cruces_pendientes = [dict(row) for row in results]
        
        logger.info(f"Se encontraron {len(cruces_pendientes)} cruces pendientes")
        
        return {
            "total_pendientes": len(cruces_pendientes),
            "cruces": cruces_pendientes,
            "prioridades": {
                "multiple_match": "Alta - Requiere selección de match correcto",
                "diferencia_valor": "Media - Verificar diferencias monetarias",
                "diferencia_fecha": "Media - Verificar diferencias de fecha",
                "sin_match": "Baja - Revisar manualmente o crear entrada"
            }
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo cruces pendientes: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error consultando cruces pendientes: {str(e)}")

@router.get("/auditoria-conciliacion")
def obtener_auditoria_conciliacion(
    fecha_desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    fecha_hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)")
):
    """
    Obtiene log de auditoría de todas las acciones de conciliación
    
    🎯 **BENEFICIO**: Trazabilidad completa para cumplimiento y revisión
    """
    client = bigquery.Client()
    
    try:
        # Filtros de fecha
        where_conditions = ["1=1"]
        if fecha_desde:
            where_conditions.append(f"DATE(fecha_accion) >= DATE('{fecha_desde}')")
        if fecha_hasta:
            where_conditions.append(f"DATE(fecha_accion) <= DATE('{fecha_hasta}')")
        
        where_clause = " AND ".join(where_conditions)
        
        query = f"""
        SELECT 
            id,
            fecha_accion,
            tipo_accion,
            usuario,
            observaciones,
            DATETIME_DIFF(CURRENT_DATETIME(), fecha_accion, HOUR) as horas_transcurridas
        FROM `datos-clientes-441216.Conciliaciones.auditoria_conciliacion`
        WHERE {where_clause}
        ORDER BY fecha_accion DESC
        LIMIT 200
        """
        
        results = client.query(query).result()
        auditoria = [dict(row) for row in results]
        
        # Estadísticas de auditoría
        stats_query = f"""
        SELECT 
            tipo_accion,
            COUNT(*) as total_acciones,
            COUNT(DISTINCT usuario) as usuarios_unicos
        FROM `datos-clientes-441216.Conciliaciones.auditoria_conciliacion`
        WHERE {where_clause}
        GROUP BY tipo_accion
        ORDER BY total_acciones DESC
        """
        
        stats_results = client.query(stats_query).result()
        estadisticas = [dict(row) for row in stats_results]
        
        return {
            "registros_auditoria": auditoria,
            "estadisticas_por_accion": estadisticas,
            "total_registros": len(auditoria),
            "periodo_consultado": {
                "desde": fecha_desde or "Inicio",
                "hasta": fecha_hasta or "Actual"
            }
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo auditoría: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error consultando auditoría: {str(e)}")

@router.post("/ejecutar-conciliacion-lote")
def ejecutar_conciliacion_lote(
    fecha_desde: str,
    fecha_hasta: str,
    auto_aprobar_exactos: bool = True
):
    """
    Ejecuta conciliación masiva para un rango de fechas
    
    🎯 **BENEFICIO**: Procesamiento eficiente de grandes volúmenes
    """
    client = bigquery.Client()
    
    try:
        # Llamar al procedimiento de conciliación automática del backend principal
        from .conciliacion import ejecutar_conciliacion_automatica
        
        # Filtrar por fechas específicas
        query_update_dates = f"""
        UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
        SET estado_conciliacion = 'pendiente'
        WHERE fecha >= DATE('{fecha_desde}')
        AND fecha <= DATE('{fecha_hasta}')
        AND estado_conciliacion = 'pendiente'
        """
        
        client.query(query_update_dates).result()
        
        # Ejecutar conciliación
        resultado = ejecutar_conciliacion_automatica()
        
        logger.info(f"Conciliación lote ejecutada para período {fecha_desde} - {fecha_hasta}")
        
        return {
            "mensaje": f"Conciliación lote completada para período {fecha_desde} - {fecha_hasta}",
            "periodo": {"desde": fecha_desde, "hasta": fecha_hasta},
            "resultado_conciliacion": resultado,
            "fecha_ejecucion": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error en conciliación lote: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error ejecutando conciliación lote: {str(e)}")

# 🔥 NUEVA FUNCIONALIDAD: Dashboard en tiempo real
@router.get("/dashboard-tiempo-real")
def obtener_dashboard_tiempo_real():
    """
    Dashboard con métricas en tiempo real para monitoreo
    
    🎯 **BENEFICIO**: Visibilidad instantánea del estado de conciliación
    """
    client = bigquery.Client()
    
    try:
        # Métricas principales
        query_metricas = """
        WITH metricas_hoy AS (
            SELECT 
                COUNT(*) as movimientos_hoy,
                SUM(valor_banco) as valor_total_hoy,
                COUNT(CASE WHEN estado_conciliacion LIKE 'conciliado%' THEN 1 END) as conciliados_hoy
            FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
            WHERE DATE(cargado_en) = CURRENT_DATE()
        ),
        metricas_mes AS (
            SELECT 
                COUNT(*) as movimientos_mes,
                SUM(valor_banco) as valor_total_mes,
                COUNT(CASE WHEN estado_conciliacion LIKE 'conciliado%' THEN 1 END) as conciliados_mes
            FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
            WHERE DATE(cargado_en) >= DATE_TRUNC(CURRENT_DATE(), MONTH)
        )
        SELECT * FROM metricas_hoy, metricas_mes
        """
        
        metricas = list(client.query(query_metricas).result())[0]
        
        # Tendencias por hora (últimas 24 horas)
        query_tendencias = """
        SELECT 
            EXTRACT(HOUR FROM cargado_en) as hora,
            COUNT(*) as movimientos,
            COUNT(CASE WHEN estado_conciliacion LIKE 'conciliado%' THEN 1 END) as conciliados
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE cargado_en >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 24 HOUR)
        GROUP BY hora
        ORDER BY hora
        """
        
        tendencias = [dict(row) for row in client.query(query_tendencias).result()]
        
        # Estados críticos que requieren atención
        query_criticos = """
        SELECT 
            COUNT(CASE WHEN estado_conciliacion = 'sin_match' AND 
                         DATETIME_DIFF(CURRENT_DATETIME(), cargado_en, DAY) > 3 THEN 1 END) as sin_match_antiguos,
            COUNT(CASE WHEN estado_conciliacion = 'multiple_match' THEN 1 END) as multiple_matches,
            COUNT(CASE WHEN estado_conciliacion = 'diferencia_valor' AND 
                         valor_banco > 1000000 THEN 1 END) as diferencias_altas
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE estado_conciliacion NOT LIKE 'conciliado%'
        """
        
        criticos = list(client.query(query_criticos).result())[0]
        
        dashboard = {
            "timestamp": datetime.utcnow().isoformat(),
            "metricas_principales": {
                "hoy": {
                    "movimientos": metricas.movimientos_hoy,
                    "valor_total": float(metricas.valor_total_hoy or 0),
                    "conciliados": metricas.conciliados_hoy,
                    "porcentaje_conciliacion": round(
                        (metricas.conciliados_hoy / metricas.movimientos_hoy * 100) 
                        if metricas.movimientos_hoy > 0 else 0, 2
                    )
                },
                "mes_actual": {
                    "movimientos": metricas.movimientos_mes,
                    "valor_total": float(metricas.valor_total_mes or 0),
                    "conciliados": metricas.conciliados_mes,
                    "porcentaje_conciliacion": round(
                        (metricas.conciliados_mes / metricas.movimientos_mes * 100) 
                        if metricas.movimientos_mes > 0 else 0, 2
                    )
                }
            },
            "tendencias_24h": tendencias,
            "alertas_criticas": {
                "sin_match_antiguos": criticos.sin_match_antiguos,
                "multiple_matches": criticos.multiple_matches,
                "diferencias_valor_alto": criticos.diferencias_altas,
                "total_criticos": (
                    criticos.sin_match_antiguos + 
                    criticos.multiple_matches + 
                    criticos.diferencias_altas
                )
            },
            "estado_sistema": {
                "estado": "activo",
                "ultima_conciliacion": "En tiempo real",
                "proxima_actualizacion": "Continua"
            }
        }
        
        return dashboard
        
    except Exception as e:
        logger.error(f"Error generando dashboard: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generando dashboard: {str(e)}") 