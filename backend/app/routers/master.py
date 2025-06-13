from fastapi import APIRouter, HTTPException, Depends, Query
from google.cloud import bigquery
from app.dependencies import get_current_user
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

router = APIRouter(prefix="/master", tags=["Master"])

PROJECT_ID = "datos-clientes-441216"
DATASET = "Conciliaciones"

bq_client = bigquery.Client()

def verificar_master(current_user: dict = Depends(get_current_user)):
    """
    Verificar que el usuario tenga permisos de master o admin
    Se cambió para permitir tanto 'admin' como 'master'
    """
    print(f"🔐 Usuario verificando acceso master: {current_user}")
    print(f"   - Email: {current_user.get('correo', 'No definido')}")
    print(f"   - Rol: {current_user.get('rol', 'No definido')}")
    
    if current_user["rol"] not in ["admin", "master"]:
        print(f"❌ Acceso denegado - Rol requerido: admin o master, Rol actual: {current_user['rol']}")
        raise HTTPException(status_code=403, detail="No autorizado - Solo admin y master")
    
    print(f"✅ Acceso autorizado para usuario {current_user.get('correo')} con rol {current_user['rol']}")
    return current_user

@router.get("/dashboard")
async def get_dashboard_data(current_user: dict = Depends(verificar_master)):
    try:
        # Obtener estadísticas globales
        stats_query = """
        WITH GuiaStats AS (
            SELECT 
                COUNT(*) as total_guias,
                COUNT(CASE WHEN estado = 'PENDIENTE' THEN 1 END) as guias_pendientes,
                COUNT(CASE WHEN estado = 'ENTREGADO' THEN 1 END) as guias_entregadas,
                COUNT(CASE WHEN estado_pago = 'PAGADO' THEN 1 END) as guias_pagadas,
                SUM(CASE WHEN estado = 'PENDIENTE' THEN valor ELSE 0 END) as valor_pendiente,
                SUM(CASE WHEN estado = 'ENTREGADO' THEN valor ELSE 0 END) as valor_entregado,
                SUM(CASE WHEN estado_pago = 'PAGADO' THEN valor ELSE 0 END) as valor_pagado,
                AVG(valor) as promedio_valor_guia
            FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1`
            WHERE DATE(fecha_creacion) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        )
        SELECT * FROM GuiaStats
        """
        
        stats_job = bq_client.query(stats_query)
        stats_result = next(stats_job.result())
        
        # Obtener ranking de carriers
        carriers_query = """
        SELECT 
            carrier_id,
            MAX(carrier_nombre) as carrier_nombre,
            COUNT(DISTINCT conductor_id) as total_conductores,
            COUNT(*) as total_guias,
            COUNT(CASE WHEN estado = 'PENDIENTE' THEN 1 END) as guias_pendientes,
            COUNT(CASE WHEN estado = 'ENTREGADO' THEN 1 END) as guias_entregadas,
            SUM(CASE WHEN estado = 'PENDIENTE' THEN valor ELSE 0 END) as valor_pendiente,
            SUM(CASE WHEN estado = 'ENTREGADO' THEN valor ELSE 0 END) as valor_entregado,
            AVG(valor) as promedio_valor_guia,
            STRING_AGG(DISTINCT ciudad, ', ' LIMIT 3) as ciudades_principales,
            MAX(fecha_creacion) as ultima_actividad,
            ROUND(COUNT(CASE WHEN estado = 'ENTREGADO' THEN 1 END) * 100.0 / COUNT(*), 2) as eficiencia
        FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1`
        WHERE DATE(fecha_creacion) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        GROUP BY carrier_id
        ORDER BY total_guias DESC
        LIMIT 10
        """
        
        carriers_job = bq_client.query(carriers_query)
        carriers_result = [dict(row) for row in carriers_job.result()]

        # Obtener análisis por ciudades
        ciudades_query = """
        SELECT 
            ciudad,
            COUNT(*) as total_guias,
            COUNT(DISTINCT conductor_id) as conductores_activos,
            COUNT(DISTINCT carrier_id) as carriers_activos,
            SUM(CASE WHEN estado = 'PENDIENTE' THEN valor ELSE 0 END) as valor_pendiente,
            COUNT(CASE WHEN estado = 'PENDIENTE' THEN 1 END) as guias_pendientes,
            ROUND(COUNT(CASE WHEN estado = 'ENTREGADO' THEN 1 END) * 100.0 / COUNT(*), 2) as eficiencia
        FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1`
        WHERE DATE(fecha_creacion) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        GROUP BY ciudad
        ORDER BY total_guias DESC
        LIMIT 10
        """
        
        ciudades_job = bq_client.query(ciudades_query)
        ciudades_result = [dict(row) for row in ciudades_job.result()]

        # Obtener tendencias mensuales
        tendencias_query = """
        SELECT 
            FORMAT_DATE('%Y-%m', fecha_creacion) as mes,
            COUNT(*) as total_guias,
            COUNT(DISTINCT conductor_id) as conductores_activos,
            COUNT(DISTINCT carrier_id) as carriers_activos,
            SUM(valor) as valor_total,
            COUNT(CASE WHEN estado = 'ENTREGADO' THEN 1 END) as guias_entregadas,
            ROUND(COUNT(CASE WHEN estado = 'ENTREGADO' THEN 1 END) * 100.0 / COUNT(*), 2) as eficiencia_mensual
        FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1`
        WHERE DATE(fecha_creacion) >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)
        GROUP BY mes
        ORDER BY mes DESC
        """

        tendencias_job = bq_client.query(tendencias_query)
        tendencias_result = [dict(row) for row in tendencias_job.result()]

        # Calcular alertas
        alertas = []
        
        # Alerta de eficiencia baja
        if stats_result.guias_entregadas / stats_result.total_guias < 0.7:
            alertas.append({
                "tipo": "warning",
                "mensaje": "La eficiencia global está por debajo del 70%",
                "prioridad": "alta"
            })

        # Alerta de valor pendiente alto
        if stats_result.valor_pendiente > 100000000:  # 100 millones
            alertas.append({
                "tipo": "critical",
                "mensaje": f"Valor pendiente superior a {stats_result.valor_pendiente:,.0f} COP",
                "prioridad": "alta"
            })

        response_data = {
            "stats_globales": dict(stats_result),
            "ranking_carriers": carriers_result,
            "analisis_ciudades": ciudades_result,
            "tendencias_mensuales": tendencias_result,
            "alertas": alertas,
            "periodo_analisis": "Últimos 30 días",
            "fecha_actualizacion": datetime.now().isoformat()
        }

        return response_data

    except Exception as e:
        print(f"Error en dashboard master: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo datos del dashboard: {str(e)}"
        )

@router.get("/export/data")
async def export_dashboard_data(
    formato: str = Query("json", regex="^(json|csv)$"),
    current_user: dict = Depends(verificar_master)
):
    try:
        # Reutilizar la función del dashboard
        data = await get_dashboard_data(current_user)
        
        if formato == "json":
            return data
        else:
            # TODO: Implementar exportación CSV
            raise HTTPException(
                status_code=400,
                detail="Formato CSV no implementado aún"
            )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error exportando datos: {str(e)}"
        )

