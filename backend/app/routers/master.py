from fastapi import APIRouter, HTTPException, Depends, Query, Request, Header
from fastapi.responses import StreamingResponse
from google.cloud import bigquery
from app.dependencies import get_current_user
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import logging
import csv
import io
import os
import json
import concurrent.futures

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

def verificar_master(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role")
):
    """
    Verificar que el usuario tenga permisos de master o admin
    Compatible con JWT y headers X-User
    """
    logger.info(f"🔐 Verificando master para endpoint: {request.url.path}")
    logger.info(f"   - Authorization: {'Presente' if authorization else 'No presente'}")
    logger.info(f"   - X-User-Email: {x_user_email}")
    logger.info(f"   - X-User-Role: {x_user_role}")
    
    # Método 1: Headers X-User (usado por el frontend)
    if x_user_email and x_user_role:
        logger.info(f"🔑 Usando autenticación por headers X-User")
        if x_user_role.lower() in ["admin", "master"]:
            user_data = {"correo": x_user_email, "rol": x_user_role.lower()}
            logger.info(f"✅ Acceso autorizado para {x_user_email} con rol {x_user_role}")
            return user_data
        else:
            logger.error(f"❌ Rol no autorizado: {x_user_role} (se requiere admin o master)")
            raise HTTPException(status_code=403, detail="No autorizado - Solo admin y master")
    
    # Método 2: JWT Authorization (fallback)
    if authorization and authorization.startswith("Bearer "):
        try:
            logger.info(f"🔑 Usando autenticación JWT")
            from fastapi.security import HTTPAuthorizationCredentials
            credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=authorization[7:])
            current_user = get_current_user(credentials)
            
            if current_user["rol"] in ["admin", "master"]:
                logger.info(f"✅ Acceso JWT autorizado para {current_user.get('correo')} con rol {current_user['rol']}")
                return current_user
            else:
                logger.error(f"❌ Rol JWT no autorizado: {current_user['rol']}")
                raise HTTPException(status_code=403, detail="No autorizado - Solo admin y master")
        except Exception as e:
            logger.error(f"❌ Error validando JWT: {e}")
            raise HTTPException(status_code=401, detail="Token inválido")
    
    logger.error("❌ No se encontraron credenciales válidas")
    raise HTTPException(status_code=401, detail="Credenciales de autenticación requeridas")

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
            WHERE DATE(Status_Date) >= '2025-06-09'
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
        WHERE DATE(Status_Date) >= '2025-06-09'
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
        WHERE DATE(Status_Date) >= '2025-06-09'
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
            "periodo_analisis": "Desde 9 de junio 2025",
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
    page_size: int = Query(100, ge=1, le=1000, description="Registros por página (máximo 1000)"),
    current_user: dict = Depends(verificar_master)
):
    """
    🚛 CARRIER MANAGEMENT: Obtiene todas las guías entregadas (estado 360) 
    con su estado de pago correspondiente - OPTIMIZADO
    """
    try:
        logger.info(f"📦 Obteniendo guías de carriers para {current_user.get('correo', 'usuario desconocido')}")
        logger.info(f"🔍 Filtros recibidos: fecha_inicio={fecha_inicio}, fecha_fin={fecha_fin}, carrier={carrier}, estado_pago={estado_pago}")
        
        # Construir filtros dinámicos
        filtros_where = []
        query_params = []
        
        # Filtro de fechas con validación
        if fecha_inicio:
            try:
                # Validar formato de fecha
                fecha_inicio_obj = datetime.strptime(fecha_inicio, '%Y-%m-%d')
                filtros_where.append("DATE(cod.Status_Date) >= @fecha_inicio")
                query_params.append(bigquery.ScalarQueryParameter("fecha_inicio", "DATE", fecha_inicio))
                logger.info(f"✅ Filtro fecha_inicio aplicado: {fecha_inicio}")
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Formato de fecha_inicio inválido: {fecha_inicio}. Use YYYY-MM-DD")
        else:
            # Por defecto, desde el inicio de la aplicación (9 de junio 2025)
            filtros_where.append("DATE(cod.Status_Date) >= '2025-06-09'")
            logger.info("📅 Usando filtro por defecto: desde inicio de aplicación (2025-06-09)")
            
        if fecha_fin:
            try:
                # Validar formato de fecha
                fecha_fin_obj = datetime.strptime(fecha_fin, '%Y-%m-%d')
                
                # Validar que fecha_fin no sea anterior a fecha_inicio
                if fecha_inicio:
                    fecha_inicio_obj = datetime.strptime(fecha_inicio, '%Y-%m-%d')
                    if fecha_fin_obj < fecha_inicio_obj:
                        raise HTTPException(status_code=400, detail="La fecha_fin no puede ser anterior a fecha_inicio")
                
                filtros_where.append("DATE(cod.Status_Date) <= @fecha_fin")
                query_params.append(bigquery.ScalarQueryParameter("fecha_fin", "DATE", fecha_fin))
                logger.info(f"✅ Filtro fecha_fin aplicado: {fecha_fin}")
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Formato de fecha_fin inválido: {fecha_fin}. Use YYYY-MM-DD")
            
        # Filtro por carrier
        if carrier:
            filtros_where.append("LOWER(cod.Carrier) LIKE LOWER(@carrier)")
            query_params.append(bigquery.ScalarQueryParameter("carrier", "STRING", f"%{carrier}%"))
            logger.info(f"✅ Filtro carrier aplicado: {carrier}")
        
        # Filtro por estado de pago - agregar parámetro siempre para evitar duplicaciones
        estado_pago_value = estado_pago if estado_pago and estado_pago in ['pendiente', 'pagado'] else None
        query_params.append(bigquery.ScalarQueryParameter("estado_pago", "STRING", estado_pago_value))
        if estado_pago_value:
            logger.info(f"✅ Filtro estado_pago aplicado: {estado_pago_value}")
        else:
            logger.info("📋 No se aplicó filtro de estado_pago (mostrando todos)")
        
        where_clause = " AND ".join(filtros_where) if filtros_where else "1=1"
        logger.info(f"🔍 WHERE clause construido: {where_clause}")
        logger.info(f"📋 Total parámetros de query: {len(query_params)}")
        
        # Calcular offset
        offset = (page - 1) * page_size
        
        # Query OPTIMIZADO que obtiene todo en una sola consulta
        optimized_query = f"""
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
                -- Verificar estado de pago de forma optimizada
                CASE 
                    WHEN gl.tracking_number IS NOT NULL AND gl.estado_liquidacion IN ('pagado', 'liquidado', 'procesado') THEN 'pagado'
                    ELSE 'pendiente'
                END as estado_pago,
                gl.pago_referencia,
                gl.fecha_entrega as fecha_liquidacion
            FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1` cod
            LEFT JOIN `{PROJECT_ID}.{DATASET}.guias_liquidacion` gl
                ON cod.tracking_number = gl.tracking_number
            WHERE cod.Status_Big = '360 - Entregado al cliente'
                AND cod.Valor > 0
                AND {where_clause}
        ),
        GuiasFiltradas AS (
            SELECT *
            FROM GuiasEntregadas
            WHERE (@estado_pago IS NULL OR estado_pago = @estado_pago)
        ),
        ConteoTotal AS (
            SELECT COUNT(*) as total_count
            FROM GuiasFiltradas
        ),
        ResumenGeneral AS (
            SELECT
                COUNT(*) as total_guias,
                SUM(Valor) as valor_total,
                COUNT(CASE WHEN estado_pago = 'pendiente' THEN 1 END) as guias_pendientes,
                COUNT(CASE WHEN estado_pago = 'pagado' THEN 1 END) as guias_pagadas,
                SUM(CASE WHEN estado_pago = 'pendiente' THEN Valor ELSE 0 END) as valor_pendiente,
                SUM(CASE WHEN estado_pago = 'pagado' THEN Valor ELSE 0 END) as valor_pagado
            FROM GuiasFiltradas
        ),
        GuiasPaginadas AS (
            SELECT *
            FROM GuiasFiltradas
            ORDER BY Status_Date DESC
            LIMIT @page_size OFFSET @offset
        )
        SELECT 
            'data' as tipo,
            tracking_number,
            Cliente,
            Ciudad,
            Departamento,
            Valor,
            Status_Date,
            Status_Big,
            Carrier,
            carrier_id,
            Empleado,
            Employee_id,
            estado_pago,
            pago_referencia,
            fecha_liquidacion,
            NULL as total_count,
            NULL as total_guias,
            NULL as valor_total,
            NULL as guias_pendientes,
            NULL as guias_pagadas,
            NULL as valor_pendiente,
            NULL as valor_pagado
        FROM GuiasPaginadas
        
        UNION ALL
        
        SELECT 
            'count' as tipo,
            NULL as tracking_number,
            NULL as Cliente,
            NULL as Ciudad,
            NULL as Departamento,
            NULL as Valor,
            NULL as Status_Date,
            NULL as Status_Big,
            NULL as Carrier,
            NULL as carrier_id,
            NULL as Empleado,
            NULL as Employee_id,
            NULL as estado_pago,
            NULL as pago_referencia,
            NULL as fecha_liquidacion,
            (SELECT total_count FROM ConteoTotal) as total_count,
            NULL as total_guias,
            NULL as valor_total,
            NULL as guias_pendientes,
            NULL as guias_pagadas,
            NULL as valor_pendiente,
            NULL as valor_pagado
        FROM ConteoTotal
        
        UNION ALL
        
        SELECT 
            'summary' as tipo,
            NULL as tracking_number,
            NULL as Cliente,
            NULL as Ciudad,
            NULL as Departamento,
            NULL as Valor,
            NULL as Status_Date,
            NULL as Status_Big,
            NULL as Carrier,
            NULL as carrier_id,
            NULL as Empleado,
            NULL as Employee_id,
            NULL as estado_pago,
            NULL as pago_referencia,
            NULL as fecha_liquidacion,
            NULL as total_count,
            total_guias,
            valor_total,
            guias_pendientes,
            guias_pagadas,
            valor_pendiente,
            valor_pagado
        FROM ResumenGeneral
        
        ORDER BY tipo, Status_Date DESC
        """
        
        # Agregar parámetros de paginación
        query_params.extend([
            bigquery.ScalarQueryParameter("page_size", "INT64", page_size),
            bigquery.ScalarQueryParameter("offset", "INT64", offset)
        ])
        
        logger.info(f"🔍 Ejecutando query optimizado de carriers - Página {page}, Tamaño {page_size}...")
        
        # Ejecutar query optimizado con timeout correcto para BigQuery
        job_config = bigquery.QueryJobConfig(
            query_parameters=query_params,
            use_query_cache=True,
            job_timeout_ms=60000  # 60 segundos en milisegundos
        )
        
        # Usar ThreadPoolExecutor para timeout personalizado adicional
        def ejecutar_query():
            query_job = bq_client.query(optimized_query, job_config=job_config)
            return query_job.result(timeout=45)  # 45 segundos timeout en result()
        
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(ejecutar_query)
            try:
                results = future.result(timeout=50)  # 50 segundos timeout total
            except concurrent.futures.TimeoutError:
                raise HTTPException(
                    status_code=504,
                    detail="Consulta demoró demasiado tiempo. Intenta reducir el rango de fechas o usar más filtros."
                )
        
        # Procesar resultados
        guias_result = []
        total_registros = 0
        resumen_data = {}
        
        for row in results:
            row_dict = dict(row)
            if row_dict['tipo'] == 'data':
                # Datos de guías
                guia_data = {k: v for k, v in row_dict.items() if k not in ['tipo', 'total_count', 'total_guias', 'valor_total', 'guias_pendientes', 'guias_pagadas', 'valor_pendiente', 'valor_pagado']}
                guias_result.append(guia_data)
            elif row_dict['tipo'] == 'count':
                # Total de registros
                total_registros = int(row_dict['total_count']) if row_dict['total_count'] else 0
            elif row_dict['tipo'] == 'summary':
                # Resumen general
                resumen_data = {
                    'total_guias': int(row_dict['total_guias']) if row_dict['total_guias'] else 0,
                    'valor_total': float(row_dict['valor_total']) if row_dict['valor_total'] else 0,
                    'guias_pendientes': int(row_dict['guias_pendientes']) if row_dict['guias_pendientes'] else 0,
                    'guias_pagadas': int(row_dict['guias_pagadas']) if row_dict['guias_pagadas'] else 0,
                    'valor_pendiente': float(row_dict['valor_pendiente']) if row_dict['valor_pendiente'] else 0,
                    'valor_pagado': float(row_dict['valor_pagado']) if row_dict['valor_pagado'] else 0
                }
        
        # Calcular información de paginación
        total_pages = (total_registros + page_size - 1) // page_size if total_registros > 0 else 1
        has_next = page < total_pages
        has_prev = page > 1
        
        # Crear resumen por carrier solo con datos de la página actual
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
        
        # Calcular porcentaje pagado
        porcentaje_pagado = 0
        if resumen_data.get('total_guias', 0) > 0:
            porcentaje_pagado = round((resumen_data['guias_pagadas'] / resumen_data['total_guias'] * 100), 2)
        
        response_data = {
            "guias": guias_result,
            "resumen_general": {
                **resumen_data,
                "porcentaje_pagado": porcentaje_pagado
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
        
        logger.info(f"✅ Datos de carriers obtenidos: {len(guias_result)} guías de {len(carriers_resumen)} carriers")
        return response_data
        
    except HTTPException:
        # Re-lanzar HTTPExceptions
        raise
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
        logger.info(f"📤 Exportando datos de carriers en formato {formato}")
        logger.info(f"🔍 Filtros recibidos para exportación: fecha_inicio={fecha_inicio}, fecha_fin={fecha_fin}, carrier={carrier}, estado_pago={estado_pago}")
        
        # Construir filtros dinámicos para exportación
        filtros_where = []
        query_params = []
        
        # Filtro de fechas con validación (igual que en endpoint principal)
        if fecha_inicio:
            try:
                # Validar formato de fecha
                fecha_inicio_obj = datetime.strptime(fecha_inicio, '%Y-%m-%d')
                filtros_where.append("DATE(cod.Status_Date) >= @fecha_inicio")
                query_params.append(bigquery.ScalarQueryParameter("fecha_inicio", "DATE", fecha_inicio))
                logger.info(f"✅ Filtro fecha_inicio aplicado en exportación: {fecha_inicio}")
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Formato de fecha_inicio inválido: {fecha_inicio}. Use YYYY-MM-DD")
        else:
            # Por defecto, desde el inicio de la aplicación (9 de junio 2025) para exportación
            filtros_where.append("DATE(cod.Status_Date) >= '2025-06-09'")
            logger.info("📅 Usando filtro por defecto en exportación: desde inicio de aplicación (2025-06-09)")
            
        if fecha_fin:
            try:
                # Validar formato de fecha
                fecha_fin_obj = datetime.strptime(fecha_fin, '%Y-%m-%d')
                
                # Validar que fecha_fin no sea anterior a fecha_inicio
                if fecha_inicio:
                    fecha_inicio_obj = datetime.strptime(fecha_inicio, '%Y-%m-%d')
                    if fecha_fin_obj < fecha_inicio_obj:
                        raise HTTPException(status_code=400, detail="La fecha_fin no puede ser anterior a fecha_inicio")
                
                filtros_where.append("DATE(cod.Status_Date) <= @fecha_fin")
                query_params.append(bigquery.ScalarQueryParameter("fecha_fin", "DATE", fecha_fin))
                logger.info(f"✅ Filtro fecha_fin aplicado en exportación: {fecha_fin}")
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Formato de fecha_fin inválido: {fecha_fin}. Use YYYY-MM-DD")
            
        # Filtro por carrier
        if carrier:
            filtros_where.append("LOWER(cod.Carrier) LIKE LOWER(@carrier)")
            query_params.append(bigquery.ScalarQueryParameter("carrier", "STRING", f"%{carrier}%"))
            logger.info(f"✅ Filtro carrier aplicado en exportación: {carrier}")
        
        # Filtro por estado de pago - agregar parámetro siempre para evitar duplicaciones
        estado_pago_value = estado_pago if estado_pago and estado_pago in ['pendiente', 'pagado'] else None
        query_params.append(bigquery.ScalarQueryParameter("estado_pago", "STRING", estado_pago_value))
        if estado_pago_value:
            logger.info(f"✅ Filtro estado_pago aplicado en exportación: {estado_pago_value}")
        
        where_clause = " AND ".join(filtros_where) if filtros_where else "1=1"
        logger.info(f"🔍 WHERE clause construido para exportación: {where_clause}")
        logger.info(f"📋 Total parámetros de query para exportación: {len(query_params)}")
        
        # Query simplificada para exportación (sin paginación)
        export_query = f"""
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
                WHEN gl.tracking_number IS NOT NULL AND gl.estado_liquidacion IN ('pagado', 'liquidado', 'procesado') THEN 'pagado'
                ELSE 'pendiente'
            END as estado_pago,
            gl.pago_referencia,
            gl.fecha_entrega as fecha_liquidacion
        FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1` cod
        LEFT JOIN `{PROJECT_ID}.{DATASET}.guias_liquidacion` gl
            ON cod.tracking_number = gl.tracking_number
        WHERE cod.Status_Big = '360 - Entregado al cliente'
            AND cod.Valor > 0
            AND {where_clause}
            AND (@estado_pago IS NULL OR 
                 (CASE 
                    WHEN gl.tracking_number IS NOT NULL AND gl.estado_liquidacion IN ('pagado', 'liquidado', 'procesado') THEN 'pagado'
                    ELSE 'pendiente'
                  END) = @estado_pago)
        ORDER BY cod.Status_Date DESC
        LIMIT 50000  -- Límite para exportación
        """
        
        # Ejecutar query para exportación
        job_config = bigquery.QueryJobConfig(
            query_parameters=query_params,
            use_query_cache=True,
            job_timeout_ms=120000  # 2 minutos para exportación
        )
        
        query_job = bq_client.query(export_query, job_config=job_config)
        results = query_job.result(timeout=90)  # 90 segundos timeout
        
        # Convertir resultados a lista de diccionarios
        guias_data = [dict(row) for row in results]
        
        logger.info(f"✅ Obtenidos {len(guias_data)} registros para exportación")
        
        if formato == "json":
            return {
                "guias": guias_data,
                "total_registros": len(guias_data),
                "filtros_aplicados": {
                    "fecha_inicio": fecha_inicio,
                    "fecha_fin": fecha_fin,
                    "carrier": carrier,
                    "estado_pago": estado_pago
                },
                "fecha_exportacion": datetime.now().isoformat()
            }
        elif formato == "csv":
            # Convertir a CSV
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
            for guia in guias_data:
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
