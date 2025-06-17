from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from google.cloud import bigquery
from app.dependencies import get_current_user
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import logging
import csv
import io

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/master", tags=["Master"])

PROJECT_ID = "datos-clientes-441216"
DATASET = "Conciliaciones"

try:
    bq_client = bigquery.Client(project=PROJECT_ID)
    logger.info(f"✅ Cliente BigQuery inicializado para proyecto: {PROJECT_ID}")
except Exception as e:
    logger.error(f"❌ Error inicializando BigQuery: {e}")
    raise HTTPException(
        status_code=500,
        detail=f"Error inicializando conexión con BigQuery: {str(e)}"
    )

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
        logger.info(f"📊 Obteniendo datos del dashboard para {current_user.get('sub', 'usuario desconocido')}")
        
        # Obtener estadísticas globales
        logger.info("1️⃣ Ejecutando query de estadísticas globales...")
        stats_query = f"""
        WITH GuiaStats AS (
            SELECT 
                COUNT(*) as total_guias,
                COUNT(CASE WHEN Status_Big LIKE '%Pendiente%' THEN 1 END) as guias_pendientes,
                COUNT(CASE WHEN Status_Big LIKE '%Entregado%' THEN 1 END) as guias_entregadas,
                COUNT(CASE WHEN Status_Big LIKE '%Pagado%' THEN 1 END) as guias_pagadas,
                SUM(CASE WHEN Status_Big LIKE '%Pendiente%' THEN Valor ELSE 0 END) as valor_pendiente,
                SUM(CASE WHEN Status_Big LIKE '%Entregado%' THEN Valor ELSE 0 END) as valor_entregado,
                SUM(CASE WHEN Status_Big LIKE '%Pagado%' THEN Valor ELSE 0 END) as valor_pagado,
                AVG(Valor) as promedio_valor_guia
            FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1`
            WHERE DATE(Status_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        )
        SELECT * FROM GuiaStats;
        """
        
        logger.info(f"Query a ejecutar: {stats_query}")
        stats_job = bq_client.query(stats_query)
        stats_result = next(stats_job.result())
        logger.info("✅ Estadísticas globales obtenidas exitosamente")

        # Obtener ranking de carriers        
        logger.info("2️⃣ Ejecutando query de ranking de carriers...")
        carriers_query = f"""
        SELECT 
            carrier_id,
            MAX(Carrier) as carrier_nombre,
            COUNT(DISTINCT Empleado) as total_conductores,
            COUNT(*) as total_guias,
            COUNT(CASE WHEN Status_Big LIKE '%Pendiente%' THEN 1 END) as guias_pendientes,
            COUNT(CASE WHEN Status_Big LIKE '%Entregado%' THEN 1 END) as guias_entregadas,
            SUM(CASE WHEN Status_Big LIKE '%Pendiente%' THEN Valor ELSE 0 END) as valor_pendiente,
            SUM(CASE WHEN Status_Big LIKE '%Entregado%' THEN Valor ELSE 0 END) as valor_entregado,
            AVG(Valor) as promedio_valor_guia,
            STRING_AGG(DISTINCT Ciudad, ', ' LIMIT 3) as ciudades_principales,
            MAX(Status_Date) as ultima_actividad,
            ROUND(COUNT(CASE WHEN Status_Big LIKE '%Entregado%' THEN 1 END) * 100.0 / COUNT(*), 2) as eficiencia
        FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1`
        WHERE DATE(Status_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        GROUP BY carrier_id
        ORDER BY total_guias DESC
        LIMIT 10
        """
        
        carriers_job = bq_client.query(carriers_query)
        carriers_result = [dict(row) for row in carriers_job.result()]
        logger.info("✅ Ranking de carriers obtenido exitosamente")

        # Obtener análisis por ciudades
        logger.info("3️⃣ Ejecutando query de análisis por ciudades...")
        ciudades_query = f"""
        SELECT 
            Ciudad,
            COUNT(*) as total_guias,
            COUNT(DISTINCT Empleado) as conductores_activos,
            COUNT(DISTINCT carrier_id) as carriers_activos,
            SUM(CASE WHEN Status_Big LIKE '%Pendiente%' THEN Valor ELSE 0 END) as valor_pendiente,
            COUNT(CASE WHEN Status_Big LIKE '%Pendiente%' THEN 1 END) as guias_pendientes,
            ROUND(COUNT(CASE WHEN Status_Big LIKE '%Entregado%' THEN 1 END) * 100.0 / COUNT(*), 2) as eficiencia
        FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1`
        WHERE DATE(Status_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        GROUP BY Ciudad
        ORDER BY total_guias DESC
        LIMIT 10
        """
        
        ciudades_job = bq_client.query(ciudades_query)
        ciudades_result = [dict(row) for row in ciudades_job.result()]
        logger.info("✅ Análisis por ciudades obtenido exitosamente")

        # Obtener tendencias mensuales
        logger.info("4️⃣ Ejecutando query de tendencias mensuales...")
        tendencias_query = f"""
        SELECT 
            FORMAT_DATE('%Y-%m', Status_Date) as mes,
            COUNT(*) as total_guias,
            COUNT(DISTINCT Empleado) as conductores_activos,
            COUNT(DISTINCT carrier_id) as carriers_activos,
            SUM(Valor) as valor_total,
            COUNT(CASE WHEN Status_Big LIKE '%Entregado%' THEN 1 END) as guias_entregadas,
            ROUND(COUNT(CASE WHEN Status_Big LIKE '%Entregado%' THEN 1 END) * 100.0 / COUNT(*), 2) as eficiencia_mensual
        FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1`
        WHERE DATE(Status_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)
        GROUP BY mes
        ORDER BY mes DESC
        """

        tendencias_job = bq_client.query(tendencias_query)
        tendencias_result = [dict(row) for row in tendencias_job.result()]
        logger.info("✅ Tendencias mensuales obtenidas exitosamente")

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

        logger.info("✅ Dashboard generado exitosamente")
        return response_data

    except Exception as e:
        logger.error(f"❌ Error en dashboard master: {str(e)}")
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

@router.get("/carriers/guias")
async def get_carriers_guias_entregadas(
    fecha_inicio: Optional[str] = Query(None, description="Fecha inicio filtro (YYYY-MM-DD)"),
    fecha_fin: Optional[str] = Query(None, description="Fecha fin filtro (YYYY-MM-DD)"),
    carrier: Optional[str] = Query(None, description="Filtro por carrier"),
    estado_pago: Optional[str] = Query(None, description="Filtro por estado: pendiente|pagado"),
    page: int = Query(1, ge=1, description="Número de página (inicia en 1)"),
    page_size: int = Query(50, ge=1, le=200, description="Registros por página (máximo 200)"),
    current_user: dict = Depends(verificar_master)
):
    """
    🚛 CARRIER MANAGEMENT: Obtiene todas las guías entregadas (estado 360) 
    con su estado de pago correspondiente
    """
    try:
        logger.info(f"📦 Obteniendo guías de carriers para {current_user.get('correo', 'usuario desconocido')}")
        
        # Construir filtros dinámicos
        filtros_where = []
        query_params = []
        
        # Filtro de fechas
        if fecha_inicio:
            filtros_where.append("DATE(cod.Status_Date) >= @fecha_inicio")
            query_params.append(bigquery.ScalarQueryParameter("fecha_inicio", "DATE", fecha_inicio))
        else:
            # Por defecto, últimos 30 días
            filtros_where.append("DATE(cod.Status_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)")
            
        if fecha_fin:
            filtros_where.append("DATE(cod.Status_Date) <= @fecha_fin")
            query_params.append(bigquery.ScalarQueryParameter("fecha_fin", "DATE", fecha_fin))
            
        # Filtro por carrier
        if carrier:
            filtros_where.append("LOWER(cod.Carrier) LIKE LOWER(@carrier)")
            query_params.append(bigquery.ScalarQueryParameter("carrier", "STRING", f"%{carrier}%"))
        
        where_clause = " AND ".join(filtros_where) if filtros_where else "1=1"
        
        # Query principal con JOIN para verificar estado de pago
        carriers_query = f"""
        WITH GuiasEntregadas AS (
            SELECT 
                cod.tracking_number,
                cod.Cliente,
                cod.Ciudad,
                cod.Departamento,
                CAST(cod.Valor AS FLOAT64) as Valor,
                cod.Status_Date,
                cod.Status_Big,
                cod.Carrier,
                cod.carrier_id,
                cod.Empleado,
                cod.Employee_id,
                -- Verificar estado de pago
                CASE 
                    WHEN gl.tracking_number IS NOT NULL AND gl.estado_liquidacion = 'pagado' THEN 'pagado'
                    WHEN gl.tracking_number IS NOT NULL AND gl.estado_liquidacion IN ('liquidado', 'procesado') THEN 'pagado'
                    ELSE 'pendiente'
                END as estado_pago,                gl.pago_referencia,
                gl.fecha_entrega as fecha_liquidacion
            FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1` cod
            LEFT JOIN `{PROJECT_ID}.{DATASET}.guias_liquidacion` gl
                ON cod.tracking_number = gl.tracking_number
            WHERE cod.Status_Big = '360 - Entregado al cliente'
                AND cod.Valor > 0
                AND {where_clause}
        )
        SELECT * FROM GuiasEntregadas
        """
          # Aplicar filtro de estado de pago si se especifica
        where_estado_pago = ""
        if estado_pago and estado_pago in ['pendiente', 'pagado']:
            where_estado_pago = f" WHERE estado_pago = @estado_pago"
            query_params.append(bigquery.ScalarQueryParameter("estado_pago", "STRING", estado_pago))
        
        # Primero obtener el total de registros para paginación
        count_query = carriers_query + where_estado_pago
        
        # Query principal con paginación
        offset = (page - 1) * page_size
        carriers_query += where_estado_pago + f" ORDER BY Status_Date DESC LIMIT @limit OFFSET @offset"
        
        # Agregar parámetros de paginación
        query_params.extend([
            bigquery.ScalarQueryParameter("limit", "INT64", page_size),
            bigquery.ScalarQueryParameter("offset", "INT64", offset)
        ])
        
        logger.info(f"🔍 Ejecutando query de carriers con paginación - Página {page}, Tamaño {page_size}...")
        
        # Ejecutar query para obtener total de registros
        job_config_count = bigquery.QueryJobConfig(query_parameters=query_params[:-2])  # Sin limit/offset
        count_job = bq_client.query(count_query, job_config=job_config_count)
        total_registros = len([row for row in count_job.result()])
        
        # Ejecutar query principal con paginación
        job_config = bigquery.QueryJobConfig(query_parameters=query_params)
        carriers_job = bq_client.query(carriers_query, job_config=job_config)
        guias_result = [dict(row) for row in carriers_job.result()]
        
        # Calcular totales del total de registros (sin paginación)
        total_job = bq_client.query(count_query, job_config=job_config_count)
        todas_las_guias = [dict(row) for row in total_job.result()]
        
        total_guias = len(todas_las_guias)
        valor_total = sum(float(guia['Valor']) for guia in todas_las_guias)
        guias_pendientes = sum(1 for guia in todas_las_guias if guia['estado_pago'] == 'pendiente')
        guias_pagadas = sum(1 for guia in todas_las_guias if guia['estado_pago'] == 'pagado')
        valor_pendiente = sum(float(guia['Valor']) for guia in todas_las_guias if guia['estado_pago'] == 'pendiente')
        valor_pagado = sum(float(guia['Valor']) for guia in todas_las_guias if guia['estado_pago'] == 'pagado')
        
        # Calcular información de paginación
        total_pages = (total_registros + page_size - 1) // page_size
        has_next = page < total_pages
        has_prev = page > 1
        
        # Resumen por carrier
        carriers_resumen = {}
        for guia in guias_result:
            carrier_name = guia['Carrier']
            if carrier_name not in carriers_resumen:
                carriers_resumen[carrier_name] = {
                    'carrier_id': guia['carrier_id'],
                    'nombre': carrier_name,
                    'total_guias': 0,
                    'valor_total': 0,
                    'guias_pendientes': 0,
                    'guias_pagadas': 0,
                    'valor_pendiente': 0,
                    'valor_pagado': 0,
                    'conductores_unicos': set(),
                    'ciudades_uniques': set()
                }
            
            carrier_data = carriers_resumen[carrier_name]
            carrier_data['total_guias'] += 1
            carrier_data['valor_total'] += float(guia['Valor'])
            carrier_data['conductores_unicos'].add(guia['Empleado'])
            carrier_data['ciudades_uniques'].add(guia['Ciudad'])
            
            if guia['estado_pago'] == 'pendiente':
                carrier_data['guias_pendientes'] += 1
                carrier_data['valor_pendiente'] += float(guia['Valor'])
            else:
                carrier_data['guias_pagadas'] += 1
                carrier_data['valor_pagado'] += float(guia['Valor'])
          # Convertir sets a listas para JSON
        for carrier in carriers_resumen.values():
            carrier['total_conductores'] = len(carrier['conductores_unicos'])
            carrier['total_ciudades'] = len(carrier['ciudades_uniques'])
            carrier['conductores'] = list(carrier['conductores_unicos'])
            carrier['ciudades'] = list(carrier['ciudades_uniques'])
            del carrier['conductores_unicos']
            del carrier['ciudades_uniques']
        
        response_data = {
            "guias": guias_result,
            "resumen_general": {
                "total_guias": total_guias,
                "valor_total": valor_total,
                "guias_pendientes": guias_pendientes,
                "guias_pagadas": guias_pagadas,
                "valor_pendiente": valor_pendiente,
                "valor_pagado": valor_pagado,
                "porcentaje_pagado": round((guias_pagadas / total_guias * 100), 2) if total_guias > 0 else 0
            },
            "paginacion": {
                "page": page,
                "page_size": page_size,
                "total": total_registros,
                "total_pages": total_pages,
                "has_next": has_next,
                "has_prev": has_prev,
                "count": len(guias_result)
            },
            "resumen_por_carrier": list(carriers_resumen.values()),
            "filtros_aplicados": {
                "fecha_inicio": fecha_inicio,
                "fecha_fin": fecha_fin,
                "carrier": carrier,
                "estado_pago": estado_pago
            },
            "fecha_consulta": datetime.now().isoformat(),
            "total_carriers": len(carriers_resumen)
        }
        
        logger.info(f"✅ Datos de carriers obtenidos: {total_guias} guías de {len(carriers_resumen)} carriers")
        return response_data
        
    except Exception as e:
        logger.error(f"❌ Error obteniendo datos de carriers: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo datos de carriers: {str(e)}"
        )

@router.get("/carriers/export")
async def export_carriers_data(
    formato: str = Query("csv", regex="^(json|csv|excel)$"),
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    carrier: Optional[str] = Query(None),
    estado_pago: Optional[str] = Query(None),
    current_user: dict = Depends(verificar_master)
):
    """
    📤 EXPORTAR: Exporta datos de carriers en diferentes formatos
    """
    try:
        # Obtener los datos usando el endpoint anterior
        data = await get_carriers_guias_entregadas(
            fecha_inicio=fecha_inicio,
            fecha_fin=fecha_fin,
            carrier=carrier,
            estado_pago=estado_pago,
            current_user=current_user        )
        
        if formato == "json":
            return data
        elif formato == "csv":
            # Convertir a CSV (implementación básica)
            output = io.StringIO()
            writer = csv.writer(output)
            
            # Escribir headers
            headers = [
                "tracking_number", "Cliente", "Ciudad", "Departamento", 
                "Valor", "Status_Date", "Carrier", "Empleado", 
                "Employee_id", "estado_pago", "pago_referencia"
            ]
            writer.writerow(headers)
            
            # Escribir datos
            for guia in data["guias"]:
                writer.writerow([
                    guia.get("tracking_number", ""),
                    guia.get("Cliente", ""),
                    guia.get("Ciudad", ""),
                    guia.get("Departamento", ""),
                    guia.get("Valor", 0),
                    guia.get("Status_Date", ""),
                    guia.get("Carrier", ""),
                    guia.get("Empleado", ""),
                    guia.get("Employee_id", ""),
                    guia.get("estado_pago", ""),
                    guia.get("pago_referencia", "")
                ])
            
            output.seek(0)
            return StreamingResponse(
                io.BytesIO(output.getvalue().encode('utf-8')),
                media_type="text/csv",
                headers={"Content-Disposition": "attachment; filename=carriers_guias.csv"}
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="Formato Excel no implementado aún"
            )
            
    except Exception as e:
        logger.error(f"❌ Error exportando datos: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error exportando datos: {str(e)}"
        )
