from fastapi import APIRouter, HTTPException, Query
from google.cloud import bigquery
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel

router = APIRouter(prefix="/entregas", tags=["Entregas"])

class EntregaConsolidada(BaseModel):
    tracking: str
    fecha: str
    tipo: str
    cliente: str
    valor: float
    estado_conciliacion: str
    referencia_pago: str
    correo_conductor: str
    entidad_pago: str
    fecha_conciliacion: Optional[str] = None
    valor_total_consignacion: Optional[float] = None
    id_banco_asociado: Optional[str] = None

@router.get("/entregas-consolidadas")
def obtener_entregas_consolidadas(
    cliente: Optional[str] = Query(None, description="Filtrar por cliente específico"),
    desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)"),
    solo_conciliadas: bool = Query(False, description="Solo mostrar entregas conciliadas"),
    incluir_problematicas: bool = Query(False, description="Incluir entregas con problemas de conciliación")
):
    """
    ✅ MEJORADO: Endpoint principal que integra completamente cruces bancarios
    🎯 OBJETIVO: Vista unificada del estado real de conciliación
    """
    
    client = bigquery.Client()
    
    # Construir condiciones WHERE dinámicamente
    condiciones = []
    parametros = []
    
    # ✅ FILTRO PRINCIPAL MEJORADO
    if solo_conciliadas:
        if incluir_problematicas:
            # Incluir conciliadas + problemáticas para revisión
            condiciones.append("""
                (bm.estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual')
                 OR bm.estado_conciliacion IN ('diferencia_valor', 'diferencia_fecha', 'multiple_match'))
            """)
        else:
            # Solo perfectamente conciliadas
            condiciones.append("""
                bm.estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual')
            """)
    
    if cliente:
        condiciones.append("COALESCE(pc.cliente, 'Sin Cliente') = @cliente")
        parametros.append(bigquery.ScalarQueryParameter("cliente", "STRING", cliente))
    
    if desde:
        condiciones.append("pc.fecha_pago >= @fecha_desde")
        parametros.append(bigquery.ScalarQueryParameter("fecha_desde", "DATE", desde))
    
    if hasta:
        condiciones.append("pc.fecha_pago <= @fecha_hasta")
        parametros.append(bigquery.ScalarQueryParameter("fecha_hasta", "DATE", hasta))
    
    # Condiciones base
    condiciones.extend([
        "pc.referencia_pago IS NOT NULL",
        "pc.estado IN ('pagado', 'aprobado', 'liquidado')"
    ])
    
    where_clause = "WHERE " + " AND ".join(condiciones) if condiciones else ""
    
    # 🔥 QUERY PRINCIPAL CON INTEGRACIÓN COMPLETA DE CRUCES
    query = f"""
    WITH entregas_con_conciliacion AS (
        SELECT 
            -- ✅ INFORMACIÓN BÁSICA DEL PAGO
            COALESCE(pc.tracking, CONCAT('TRK-', RIGHT(pc.referencia_pago, 6))) as tracking,
            pc.fecha_pago as fecha,
            CASE 
                WHEN UPPER(COALESCE(pc.tipo, pc.entidad, '')) LIKE '%NEQUI%' THEN 'Pago Digital'
                WHEN UPPER(COALESCE(pc.tipo, pc.entidad, '')) LIKE '%BANCOLOMBIA%' THEN 'Transferencia Bancaria'
                WHEN UPPER(COALESCE(pc.tipo, pc.entidad, '')) LIKE '%DAVIPLATA%' THEN 'Pago Digital'
                WHEN UPPER(COALESCE(pc.tipo, pc.entidad, '')) LIKE '%TRANSFERENCIA%' THEN 'Transferencia'
                ELSE COALESCE(pc.tipo, 'Transferencia')
            END as tipo,
            COALESCE(pc.cliente, 'Sin Cliente') as cliente,
            COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) as valor,
            pc.referencia_pago,
            COALESCE(pc.correo, 'conductor@unknown.com') as correo_conductor,
            COALESCE(pc.entidad, 'Sin Entidad') as entidad_pago,
            pc.estado as estado_pago,
            pc.creado_en,
            
            -- ✅ INFORMACIÓN COMPLETA DE CONCILIACIÓN BANCARIA
            bm.id as id_banco_asociado,
            bm.fecha as fecha_banco,
            bm.valor_banco,
            bm.descripcion as descripcion_banco,
            bm.estado_conciliacion as estado_conciliacion_db,
            bm.confianza_match,
            bm.observaciones as observaciones_conciliacion,
            bm.conciliado_en as fecha_conciliacion,
            bm.cargado_en as fecha_carga_banco,
            
            -- ✅ CÁLCULOS DE DIFERENCIAS Y VALIDACIONES
            ABS(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) - COALESCE(bm.valor_banco, 0)) as diferencia_valor,
            ABS(DATE_DIFF(pc.fecha_pago, COALESCE(bm.fecha, pc.fecha_pago), DAY)) as diferencia_dias,
            
            -- ✅ ESTADO CONSOLIDADO PARA FRONTEND
            CASE 
                WHEN bm.estado_conciliacion = 'conciliado_exacto' THEN 'Conciliado Exacto'
                WHEN bm.estado_conciliacion = 'conciliado_aproximado' THEN 'Conciliado Aproximado'
                WHEN bm.estado_conciliacion = 'conciliado_manual' THEN 'Conciliado Manual'
                WHEN bm.estado_conciliacion = 'diferencia_valor' THEN 'Diferencia de Valor'
                WHEN bm.estado_conciliacion = 'diferencia_fecha' THEN 'Diferencia de Fecha'
                WHEN bm.estado_conciliacion = 'multiple_match' THEN 'Múltiples Coincidencias'
                WHEN bm.estado_conciliacion = 'sin_match' THEN 'Sin Conciliar'
                WHEN bm.estado_conciliacion = 'pendiente' THEN 'En Proceso'
                WHEN pc.estado = 'aprobado' AND bm.id IS NULL THEN 'Aprobado (Pendiente Conciliación)'
                WHEN pc.estado = 'pagado' AND bm.id IS NULL THEN 'Pagado (Pendiente Aprobación)'
                WHEN pc.estado = 'liquidado' THEN 'Liquidado'
                ELSE 'Pendiente'
            END as estado_conciliacion,
            
            -- ✅ INDICADORES DE CALIDAD Y VALIDACIÓN
            CASE 
                WHEN bm.estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual') 
                     AND pc.estado = 'aprobado'
                     AND ABS(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) - COALESCE(bm.valor_banco, 0)) <= 1000
                THEN TRUE
                ELSE FALSE
            END as listo_para_liquidar,
            
            CASE 
                WHEN ABS(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) - COALESCE(bm.valor_banco, 0)) <= 1 
                THEN TRUE 
                ELSE FALSE 
            END as valor_exacto,
            
            CASE 
                WHEN ABS(DATE_DIFF(pc.fecha_pago, COALESCE(bm.fecha, pc.fecha_pago), DAY)) <= 1 
                THEN TRUE 
                ELSE FALSE 
            END as fecha_consistente,
            
            CASE 
                WHEN ABS(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) - COALESCE(bm.valor_banco, 0)) <= 1000
                     AND ABS(DATE_DIFF(pc.fecha_pago, COALESCE(bm.fecha, pc.fecha_pago), DAY)) <= 3
                THEN TRUE 
                ELSE FALSE 
            END as integridad_ok
            
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
        
        -- ✅ LEFT JOIN para ver todos los pagos y su estado de conciliación
        LEFT JOIN `datos-clientes-441216.Conciliaciones.banco_movimientos` bm
            ON bm.referencia_pago_asociada = pc.referencia_pago
        
        {where_clause}
        AND pc.fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)  -- Últimos 6 meses
    ),
    
    estadisticas_agregadas AS (
        SELECT 
            COUNT(*) as total_entregas,
            SUM(valor) as valor_total,
            COUNT(CASE WHEN listo_para_liquidar THEN 1 END) as entregas_listas,
            SUM(CASE WHEN listo_para_liquidar THEN valor ELSE 0 END) as valor_listo,
            COUNT(CASE WHEN estado_conciliacion_db IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual') THEN 1 END) as conciliadas,
            COUNT(CASE WHEN estado_conciliacion_db IS NULL THEN 1 END) as sin_conciliar,
            COUNT(CASE WHEN integridad_ok = FALSE THEN 1 END) as con_problemas,
            AVG(COALESCE(confianza_match, 0)) as confianza_promedio
        FROM entregas_con_conciliacion
    )
    
    SELECT 
        -- Datos principales
        tracking,
        DATE(fecha) as fecha,
        tipo,
        cliente,
        valor,
        estado_conciliacion,
        referencia_pago,
        correo_conductor,
        entidad_pago,
        DATE(fecha_conciliacion) as fecha_conciliacion,
        
        -- Información de conciliación bancaria
        valor_banco,
        id_banco_asociado,
        observaciones_conciliacion,
        confianza_match,
        descripcion_banco,
        
        -- Validaciones y calidad
        diferencia_valor,
        diferencia_dias,
        integridad_ok,
        listo_para_liquidar,
        valor_exacto,
        fecha_consistente,
        
        -- Metadatos
        estado_pago,
        estado_conciliacion_db,
        
        -- Estadísticas agregadas (repetidas para cada fila)
        (SELECT total_entregas FROM estadisticas_agregadas) as stats_total_entregas,
        (SELECT valor_total FROM estadisticas_agregadas) as stats_valor_total,
        (SELECT entregas_listas FROM estadisticas_agregadas) as stats_entregas_listas,
        (SELECT valor_listo FROM estadisticas_agregadas) as stats_valor_listo,
        (SELECT conciliadas FROM estadisticas_agregadas) as stats_conciliadas,
        (SELECT sin_conciliar FROM estadisticas_agregadas) as stats_sin_conciliar,
        (SELECT con_problemas FROM estadisticas_agregadas) as stats_con_problemas,
        (SELECT confianza_promedio FROM estadisticas_agregadas) as stats_confianza_promedio
        
    FROM entregas_con_conciliacion
    ORDER BY 
        cliente ASC,
        fecha_conciliacion DESC NULLS LAST,
        fecha DESC,
        valor DESC
    """
    
    try:
        job_config = bigquery.QueryJobConfig(query_parameters=parametros)
        resultados = client.query(query, job_config=job_config).result()
        
        entregas = []
        clientes_stats = {}
        alertas_sistema = []
        
        # Variables para estadísticas
        stats_generales = None
        
        for row in resultados:
            # Capturar estadísticas generales (solo una vez)
            if stats_generales is None:
                stats_generales = {
                    "total_entregas": int(row["stats_total_entregas"]),
                    "valor_total": float(row["stats_valor_total"]),
                    "entregas_listas": int(row["stats_entregas_listas"]),
                    "valor_listo": float(row["stats_valor_listo"]),
                    "conciliadas": int(row["stats_conciliadas"]),
                    "sin_conciliar": int(row["stats_sin_conciliar"]),
                    "con_problemas": int(row["stats_con_problemas"]),
                    "confianza_promedio": float(row["stats_confianza_promedio"])
                }
            
            valor = float(row["valor"]) if row["valor"] else 0.0
            diferencia_valor = float(row["diferencia_valor"]) if row["diferencia_valor"] else 0.0
            diferencia_dias = int(row["diferencia_dias"]) if row["diferencia_dias"] else 0
            
            # ✅ DETECTAR ALERTAS DEL SISTEMA
            if diferencia_valor > 10000:
                alertas_sistema.append({
                    "tipo": "diferencia_critica",
                    "referencia": row["referencia_pago"],
                    "cliente": row["cliente"],
                    "valor_pago": valor,
                    "valor_banco": float(row["valor_banco"]) if row["valor_banco"] else 0,
                    "diferencia": diferencia_valor,
                    "severidad": "critica"
                })
            
            if diferencia_dias > 10:
                alertas_sistema.append({
                    "tipo": "diferencia_fecha_extrema",
                    "referencia": row["referencia_pago"],
                    "cliente": row["cliente"],
                    "diferencia_dias": diferencia_dias,
                    "severidad": "alta"
                })
            
            # ✅ EVALUAR CALIDAD DE CONCILIACIÓN
            calidad = _evaluar_calidad_conciliacion(
                row["estado_conciliacion_db"],
                diferencia_valor,
                diferencia_dias,
                int(row["confianza_match"]) if row["confianza_match"] else 0
            )
            
            # ✅ CREAR OBJETO ENTREGA COMPLETO
            entrega = {
                "tracking": row["tracking"] or f"REF-{row['referencia_pago'][-6:]}",
                "fecha": row["fecha"].isoformat() if row["fecha"] else datetime.now().date().isoformat(),
                "tipo": row["tipo"] or "Transferencia",
                "cliente": row["cliente"] or "Sin Cliente",
                "valor": valor,
                "estado_conciliacion": row["estado_conciliacion"] or "Pendiente",
                "referencia_pago": row["referencia_pago"] or "",
                "correo_conductor": row["correo_conductor"] or "",
                "entidad_pago": row["entidad_pago"] or "",
                "fecha_conciliacion": row["fecha_conciliacion"].isoformat() if row["fecha_conciliacion"] else None,
                
                # ✅ INFORMACIÓN EXTENDIDA DE CONCILIACIÓN
                "valor_banco_conciliado": float(row["valor_banco"]) if row["valor_banco"] else None,
                "id_banco_asociado": row["id_banco_asociado"],
                "observaciones_conciliacion": row["observaciones_conciliacion"],
                "confianza_match": int(row["confianza_match"]) if row["confianza_match"] else 0,
                "descripcion_banco": row["descripcion_banco"],
                
                # ✅ INDICADORES DE CALIDAD
                "diferencia_valor": diferencia_valor,
                "diferencia_dias": diferencia_dias,
                "integridad_ok": bool(row["integridad_ok"]),
                "listo_para_liquidar": bool(row["listo_para_liquidar"]),
                "valor_exacto": bool(row["valor_exacto"]),
                "fecha_consistente": bool(row["fecha_consistente"]),
                "calidad_conciliacion": calidad,
                
                # ✅ METADATOS
                "estado_pago": row["estado_pago"],
                "estado_conciliacion_db": row["estado_conciliacion_db"],
                
                # ✅ INDICADORES VISUALES
                "icono_estado": _get_icono_estado(row["estado_conciliacion"], calidad),
                "color_estado": _get_color_estado(row["estado_conciliacion"], bool(row["integridad_ok"])),
                "requiere_atencion": not bool(row["integridad_ok"]) and row["estado_conciliacion_db"] not in ['conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual']
            }
            
            entregas.append(entrega)
            
            # ✅ AGRUPAR ESTADÍSTICAS POR CLIENTE
            cliente = entrega["cliente"]
            if cliente not in clientes_stats:
                clientes_stats[cliente] = {
                    "cantidad": 0, 
                    "valor": 0, 
                    "conciliadas": 0, 
                    "valor_conciliado": 0,
                    "listas_liquidar": 0,
                    "con_problemas": 0,
                    "calidad_promedio": 0,
                    "alertas": []
                }
            
            stats_cliente = clientes_stats[cliente]
            stats_cliente["cantidad"] += 1
            stats_cliente["valor"] += valor
            stats_cliente["calidad_promedio"] += entrega["confianza_match"]
            
            if entrega["listo_para_liquidar"]:
                stats_cliente["conciliadas"] += 1
                stats_cliente["valor_conciliado"] += valor
                stats_cliente["listas_liquidar"] += 1
            
            if not entrega["integridad_ok"]:
                stats_cliente["con_problemas"] += 1
                if diferencia_valor > 5000:
                    stats_cliente["alertas"].append({
                        "referencia": entrega["referencia_pago"],
                        "tipo": "diferencia_valor",
                        "valor": diferencia_valor
                    })
        
        # ✅ CALCULAR PROMEDIOS POR CLIENTE
        for cliente in clientes_stats:
            stats = clientes_stats[cliente]
            cantidad = stats["cantidad"]
            stats["valor_promedio"] = stats["valor"] / max(cantidad, 1)
            stats["calidad_promedio"] = stats["calidad_promedio"] / max(cantidad, 1)
            stats["porcentaje_conciliadas"] = (stats["conciliadas"] / max(cantidad, 1)) * 100
            stats["porcentaje_problemas"] = (stats["con_problemas"] / max(cantidad, 1)) * 100
        
        # ✅ RESPUESTA COMPLETA CON TODAS LAS MÉTRICAS
        return {
            "entregas": entregas,
            "estadisticas": {
                "total_entregas": stats_generales["total_entregas"] if stats_generales else len(entregas),
                "valor_total": stats_generales["valor_total"] if stats_generales else sum(e["valor"] for e in entregas),
                "entregas_conciliadas": stats_generales["conciliadas"] if stats_generales else len([e for e in entregas if "Conciliado" in e["estado_conciliacion"]]),
                "entregas_listas": stats_generales["entregas_listas"] if stats_generales else len([e for e in entregas if e["listo_para_liquidar"]]),
                "valor_listo": stats_generales["valor_listo"] if stats_generales else sum(e["valor"] for e in entregas if e["listo_para_liquidar"]),
                "sin_conciliar": stats_generales["sin_conciliar"] if stats_generales else len([e for e in entregas if not e["valor_banco_conciliado"]]),
                "con_problemas": stats_generales["con_problemas"] if stats_generales else len([e for e in entregas if not e["integridad_ok"]]),
                "confianza_promedio": stats_generales["confianza_promedio"] if stats_generales else 0,
                "porcentaje_conciliado": (stats_generales["conciliadas"] / max(stats_generales["total_entregas"], 1)) * 100 if stats_generales else 0,
                "porcentaje_listo": (stats_generales["entregas_listas"] / max(stats_generales["total_entregas"], 1)) * 100 if stats_generales else 0,
                "clientes": clientes_stats
            },
            "alertas_sistema": alertas_sistema,
            "filtros_aplicados": {
                "cliente": cliente,
                "desde": desde,
                "hasta": hasta,
                "solo_conciliadas": solo_conciliadas,
                "incluir_problematicas": incluir_problematicas
            },
            "calidad_datos": {
                "entregas_perfectas": len([e for e in entregas if e["calidad_conciliacion"] == "Excelente"]),
                "entregas_buenas": len([e for e in entregas if e["calidad_conciliacion"] in ["Muy Buena", "Buena"]]),
                "entregas_problematicas": len([e for e in entregas if e["calidad_conciliacion"] == "Requiere Revisión"]),
                "alertas_criticas": len([a for a in alertas_sistema if a["severidad"] == "critica"]),
                "score_calidad_general": _calcular_score_calidad(entregas)
            },
            "recomendaciones": _generar_recomendaciones(entregas, alertas_sistema, clientes_stats),
            "metadatos": {
                "timestamp": datetime.now().isoformat(),
                "periodo_consulta": f"{desde or 'Últimos 6 meses'} - {hasta or 'Hoy'}",
                "total_clientes": len(clientes_stats),
                "version_api": "2.0"
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error al consultar entregas consolidadas: {str(e)}"
        )

@router.get("/entregas-listas-liquidar")
def obtener_entregas_listas_liquidar(
    cliente: Optional[str] = Query(None),
    desde: Optional[str] = Query(None),
    hasta: Optional[str] = Query(None),
    incluir_aproximadas: bool = Query(True, description="Incluir conciliaciones aproximadas")
):
    """
    🎯 MEJORADO: Solo entregas que YA están conciliadas bancariamente
    ✅ RESULTADO: Lista exacta de pagos listos para liquidar
    """
    
    client = bigquery.Client()
    
    # ✅ ESTADOS DE CONCILIACIÓN VÁLIDOS
    estados_validos = ["'conciliado_exacto'", "'conciliado_manual'"]
    if incluir_aproximadas:
        estados_validos.append("'conciliado_aproximado'")
    
    estados_sql = ", ".join(estados_validos)
    
    # Construir filtros dinámicamente
    condiciones = [
        f"bm.estado_conciliacion IN ({estados_sql})",
        "pc.estado IN ('aprobado', 'pagado')",  # Expandir estados válidos
        "pc.referencia_pago IS NOT NULL",
        "bm.referencia_pago_asociada IS NOT NULL"
    ]
    parametros = []
    
    if cliente:
        condiciones.append("COALESCE(pc.cliente, 'Sin Cliente') = @cliente")
        parametros.append(bigquery.ScalarQueryParameter("cliente", "STRING", cliente))
    
    if desde:
        condiciones.append("pc.fecha_pago >= @fecha_desde")
        parametros.append(bigquery.ScalarQueryParameter("fecha_desde", "DATE", desde))
    
    if hasta:
        condiciones.append("pc.fecha_pago <= @fecha_hasta")
        parametros.append(bigquery.ScalarQueryParameter("fecha_hasta", "DATE", hasta))
    
    where_clause = "WHERE " + " AND ".join(condiciones)
    
    # 🔥 CONSULTA MEJORADA CON VALIDACIONES DE INTEGRIDAD
    query = f"""
    WITH entregas_conciliadas AS (
        SELECT 
            -- Información básica del pago
            COALESCE(pc.tracking, pc.referencia_pago) as tracking,
            pc.referencia_pago,
            COALESCE(pc.cliente, 'Sin Cliente') as cliente,
            COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) as valor,
            pc.fecha_pago,
            COALESCE(pc.correo, 'conductor@unknown.com') as correo_conductor,
            COALESCE(pc.entidad, 'Sin Entidad') as entidad_pago,
            COALESCE(pc.tipo, 'Transferencia') as tipo,
            pc.estado as estado_pago,
            
            -- ✅ INFORMACIÓN DE CONCILIACIÓN BANCARIA
            bm.id as id_banco_asociado,
            bm.fecha as fecha_banco,
            bm.valor_banco,
            bm.descripcion as descripcion_banco,
            bm.estado_conciliacion,
            bm.confianza_match,
            bm.observaciones as observaciones_conciliacion,
            bm.conciliado_en as fecha_conciliacion,
            
            -- ✅ VALIDACIONES DE INTEGRIDAD Y CALIDAD
            ABS(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) - bm.valor_banco) as diferencia_valor,
            ABS(DATE_DIFF(pc.fecha_pago, bm.fecha, DAY)) as diferencia_dias,
            
            -- ✅ INDICADORES DE CALIDAD
            CASE 
                WHEN ABS(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) - bm.valor_banco) <= 1 
                THEN TRUE 
                ELSE FALSE 
            END as valor_exacto,
            
            CASE 
                WHEN ABS(DATE_DIFF(pc.fecha_pago, bm.fecha, DAY)) <= 2 
                THEN TRUE 
                ELSE FALSE 
            END as fecha_consistente,
            
            -- ✅ ESTADO FINAL DE LIQUIDACIÓN
            CASE 
                WHEN bm.estado_conciliacion = 'conciliado_exacto' AND pc.estado = 'aprobado' THEN TRUE
                WHEN bm.estado_conciliacion = 'conciliado_manual' AND pc.estado = 'aprobado' THEN TRUE
                WHEN bm.estado_conciliacion = 'conciliado_aproximado' AND pc.estado = 'aprobado' 
                     AND ABS(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) - bm.valor_banco) <= 1000
                THEN TRUE
                ELSE FALSE
            END as listo_para_liquidar
            
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
        
        -- ✅ INNER JOIN: Solo pagos con conciliación exitosa
        INNER JOIN `datos-clientes-441216.Conciliaciones.banco_movimientos` bm
            ON bm.referencia_pago_asociada = pc.referencia_pago
        
        {where_clause}
    )
    
    SELECT 
        tracking,
        referencia_pago,
        cliente,
        valor,
        DATE(fecha_pago) as fecha,
        correo_conductor,
        entidad_pago,
        tipo,
        estado_pago,
        
        -- Información de conciliación
        id_banco_asociado,
        DATE(fecha_banco) as fecha_banco,
        valor_banco,
        descripcion_banco,
        estado_conciliacion,
        confianza_match,
        observaciones_conciliacion,
        DATE(fecha_conciliacion) as fecha_conciliacion,
        
        -- Validaciones
        diferencia_valor,
        diferencia_dias,
        valor_exacto,
        fecha_consistente,
        listo_para_liquidar
        
    FROM entregas_conciliadas
    WHERE listo_para_liquidar = TRUE  -- ✅ FILTRO FINAL DE CALIDAD
    ORDER BY 
        cliente ASC,
        fecha_conciliacion DESC NULLS LAST,
        fecha_pago DESC,
        valor DESC
    """
    
    try:
        job_config = bigquery.QueryJobConfig(query_parameters=parametros)
        resultados = client.query(query, job_config=job_config).result()
        
        entregas = []
        total_valor = 0
        clientes_agrupados = {}
        alertas_integridad = []
        estadisticas_calidad = {
            "exactas": 0,
            "aproximadas": 0,
            "manuales": 0,
            "con_diferencias": 0
        }
        
        for row in resultados:
            valor = float(row["valor"])
            diferencia_valor = float(row["diferencia_valor"]) if row["diferencia_valor"] else 0
            diferencia_dias = int(row["diferencia_dias"]) if row["diferencia_dias"] else 0
            
            # ✅ ALERTAS DE INTEGRIDAD MEJORADAS
            if diferencia_valor > 1000:  # Diferencias significativas
                alertas_integridad.append({
                    "tipo": "diferencia_valor_alta",
                    "referencia": row["referencia_pago"],
                    "cliente": row["cliente"],
                    "valor_pago": valor,
                    "valor_banco": float(row["valor_banco"]),
                    "diferencia": diferencia_valor,
                    "severidad": "alta" if diferencia_valor > 10000 else "media"
                })
            
            if diferencia_dias > 5:  # Diferencias de fecha significativas
                alertas_integridad.append({
                    "tipo": "diferencia_fecha",
                    "referencia": row["referencia_pago"],
                    "cliente": row["cliente"],
                    "diferencia_dias": diferencia_dias,
                    "severidad": "media"
                })
            
            # ✅ ESTRUCTURA DE ENTREGA MEJORADA
            entrega = {
                "tracking": row["tracking"] or f"REF-{row['referencia_pago'][-6:]}",
                "fecha": row["fecha"].isoformat(),
                "tipo": row["tipo"] or "Transferencia",
                "cliente": row["cliente"],
                "valor": valor,
                "estado_conciliacion": _mapear_estado_conciliacion(row["estado_conciliacion"]),
                "referencia_pago": row["referencia_pago"],
                "correo_conductor": row["correo_conductor"],
                "entidad_pago": row["entidad_pago"],
                "fecha_conciliacion": row["fecha_conciliacion"].isoformat() if row["fecha_conciliacion"] else None,
                
                # ✅ INFORMACIÓN EXTENDIDA DE CONCILIACIÓN
                "valor_banco_conciliado": float(row["valor_banco"]),
                "id_banco_asociado": row["id_banco_asociado"],
                "observaciones_conciliacion": row["observaciones_conciliacion"],
                "confianza_match": int(row["confianza_match"]) if row["confianza_match"] else 0,
                "descripcion_banco": row["descripcion_banco"],
                
                # ✅ INDICADORES DE CALIDAD
                "diferencia_valor": diferencia_valor,
                "diferencia_dias": diferencia_dias,
                "integridad_ok": diferencia_valor <= 1000 and diferencia_dias <= 3,
                "valor_exacto": bool(row["valor_exacto"]),
                "fecha_consistente": bool(row["fecha_consistente"]),
                "listo_para_liquidar": True,  # Ya filtrado en query
                
                # ✅ METADATOS ADICIONALES
                "calidad_conciliacion": _evaluar_calidad_conciliacion(
                    row["estado_conciliacion"], 
                    diferencia_valor, 
                    diferencia_dias,
                    int(row["confianza_match"]) if row["confianza_match"] else 0
                )
            }
            
            entregas.append(entrega)
            total_valor += valor
            
            # ✅ Actualizar estadísticas de calidad
            if row["estado_conciliacion"] == "conciliado_exacto":
                estadisticas_calidad["exactas"] += 1
            elif row["estado_conciliacion"] == "conciliado_aproximado":
                estadisticas_calidad["aproximadas"] += 1
            elif row["estado_conciliacion"] == "conciliado_manual":
                estadisticas_calidad["manuales"] += 1
            
            if diferencia_valor > 1000:
                estadisticas_calidad["con_diferencias"] += 1
            
            # ✅ Agrupar por cliente con estadísticas detalladas
            cliente = entrega["cliente"]
            if cliente not in clientes_agrupados:
                clientes_agrupados[cliente] = {
                    "cantidad_entregas": 0,
                    "valor_total": 0,
                    "entregas": [],
                    "valor_promedio": 0,
                    "calidad_promedio": 0,
                    "alertas": 0
                }
            
            clientes_agrupados[cliente]["cantidad_entregas"] += 1
            clientes_agrupados[cliente]["valor_total"] += valor
            clientes_agrupados[cliente]["entregas"].append(entrega)
            clientes_agrupados[cliente]["calidad_promedio"] += entrega["confianza_match"]
            
            if not entrega["integridad_ok"]:
                clientes_agrupados[cliente]["alertas"] += 1
        
        # ✅ Calcular promedios por cliente
        for cliente in clientes_agrupados:
            datos = clientes_agrupados[cliente]
            cantidad = datos["cantidad_entregas"]
            datos["valor_promedio"] = datos["valor_total"] / max(cantidad, 1)
            datos["calidad_promedio"] = datos["calidad_promedio"] / max(cantidad, 1)
            datos["porcentaje_alertas"] = (datos["alertas"] / max(cantidad, 1)) * 100
        
        return {
            "mensaje": f"✅ {len(entregas)} entregas conciliadas y listas para liquidar",
            "total_entregas": len(entregas),
            "valor_total": total_valor,
            "entregas": entregas,
            "clientes_agrupados": clientes_agrupados,
            "alertas_integridad": alertas_integridad,
            "estadisticas_calidad": estadisticas_calidad,
            "filtros_aplicados": {
                "cliente": cliente,
                "desde": desde,
                "hasta": hasta,
                "incluir_aproximadas": incluir_aproximadas
            },
            "calidad_datos": {
                "entregas_sin_diferencias": len([e for e in entregas if e["integridad_ok"]]),
                "alertas_criticas": len([a for a in alertas_integridad if a["severidad"] == "alta"]),
                "confianza_promedio": sum(e["confianza_match"] for e in entregas) / max(len(entregas), 1),
                "porcentaje_calidad": (len([e for e in entregas if e["integridad_ok"]]) / max(len(entregas), 1)) * 100
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo entregas listas: {str(e)}"
        )

@router.get("/validar-integridad-liquidacion/{cliente}")
def validar_integridad_para_liquidacion(cliente: str):
    """
    🎯 NUEVO: Valida que todas las entregas de un cliente estén listas para liquidar
    ✅ BENEFICIO: Prevenir errores antes del procesamiento
    """
    
    client = bigquery.Client()
    
    query = """
    WITH validacion AS (
        SELECT 
            pc.referencia_pago,
            pc.valor_total_consignacion,
            pc.estado as estado_pago,
            bm.estado_conciliacion,
            bm.valor_banco,
            bm.observaciones,
            
            -- Validaciones específicas
            CASE 
                WHEN bm.estado_conciliacion IS NULL THEN 'SIN_CONCILIAR'
                WHEN bm.estado_conciliacion NOT IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual') THEN 'CONCILIACION_INCOMPLETA'
                WHEN pc.estado != 'aprobado' THEN 'PAGO_NO_APROBADO'
                WHEN ABS(pc.valor_total_consignacion - bm.valor_banco) > 5000 THEN 'DIFERENCIA_VALOR_ALTA'
                ELSE 'OK'
            END as validacion_resultado,
            
            ABS(pc.valor_total_consignacion - bm.valor_banco) as diferencia_valor
            
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
        LEFT JOIN `datos-clientes-441216.Conciliaciones.banco_movimientos` bm
            ON bm.referencia_pago_asociada = pc.referencia_pago
        WHERE COALESCE(pc.cliente, 'Sin Cliente') = @cliente
        AND pc.fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
        AND pc.referencia_pago IS NOT NULL
    )
    
    SELECT 
        validacion_resultado,
        COUNT(*) as cantidad,
        SUM(valor_total_consignacion) as valor_total,
        AVG(diferencia_valor) as diferencia_promedio,
        ARRAY_AGG(referencia_pago LIMIT 5) as ejemplos_referencias
    FROM validacion
    GROUP BY validacion_resultado
    ORDER BY 
        CASE validacion_resultado
            WHEN 'OK' THEN 1
            WHEN 'DIFERENCIA_VALOR_ALTA' THEN 2
            WHEN 'CONCILIACION_INCOMPLETA' THEN 3
            WHEN 'PAGO_NO_APROBADO' THEN 4
            WHEN 'SIN_CONCILIAR' THEN 5
        END
    """
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("cliente", "STRING", cliente)
        ]
    )
    
    try:
        resultados = client.query(query, job_config=job_config).result()
        
        validaciones = []
        resumen = {
            "listas_liquidar": 0,
            "con_problemas": 0,
            "valor_listo": 0,
            "valor_bloqueado": 0
        }
        
        for row in resultados:
            validacion = {
                "resultado": row["validacion_resultado"],
                "cantidad": int(row["cantidad"]),
                "valor_total": float(row["valor_total"] or 0),
                "diferencia_promedio": float(row["diferencia_promedio"] or 0),
                "ejemplos_referencias": list(row["ejemplos_referencias"]),
                "descripcion": _get_descripcion_validacion(row["validacion_resultado"])
            }
            validaciones.append(validacion)
            
            if row["validacion_resultado"] == "OK":
                resumen["listas_liquidar"] += validacion["cantidad"]
                resumen["valor_listo"] += validacion["valor_total"]
            else:
                resumen["con_problemas"] += validacion["cantidad"]
                resumen["valor_bloqueado"] += validacion["valor_total"]
        
        return {
            "cliente": cliente,
            "validaciones": validaciones,
            "resumen": resumen,
            "listo_para_procesar": resumen["con_problemas"] == 0,
            "recomendacion": _get_recomendacion_liquidacion(validaciones),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error validando integridad: {str(e)}"
        )

@router.get("/resumen-liquidaciones")
def obtener_resumen_liquidaciones():
    """
    ✅ MEJORADO: Resumen basado en estado real de conciliación bancaria
    """
    client = bigquery.Client()
    
    query = """
    WITH resumen_por_cliente AS (
        SELECT 
            COALESCE(pc.cliente, 'Sin Cliente') as cliente,
            COUNT(*) as total_entregas,
            SUM(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0)) as valor_total,
            
            -- ✅ CONTAR ENTREGAS REALMENTE CONCILIADAS
            COUNT(CASE 
                WHEN bm.estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual') 
                THEN 1 
            END) as entregas_conciliadas,
            
            SUM(CASE 
                WHEN bm.estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual') 
                THEN COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0)
                ELSE 0
            END) as valor_conciliado,
            
            COUNT(CASE WHEN pc.estado = 'aprobado' THEN 1 END) as entregas_aprobadas,
            COUNT(CASE WHEN pc.estado = 'pagado' THEN 1 END) as entregas_pagadas,
            MIN(pc.fecha_pago) as fecha_primera_entrega,
            MAX(pc.fecha_pago) as fecha_ultima_entrega,
            COUNT(DISTINCT pc.correo) as conductores_involucrados
            
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
        
        -- ✅ LEFT JOIN para verificar conciliación
        LEFT JOIN `datos-clientes-441216.Conciliaciones.banco_movimientos` bm
            ON bm.referencia_pago_asociada = pc.referencia_pago
        
        WHERE pc.fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
        AND pc.referencia_pago IS NOT NULL
        GROUP BY pc.cliente
    )
    
    SELECT 
        cliente,
        total_entregas,
        valor_total,
        entregas_conciliadas,
        valor_conciliado,
        entregas_aprobadas,
        entregas_pagadas,
        fecha_primera_entrega,
        fecha_ultima_entrega,
        conductores_involucrados,
        
        -- ✅ CÁLCULOS MEJORADOS
        ROUND((entregas_conciliadas * 100.0) / NULLIF(total_entregas, 0), 2) as porcentaje_conciliadas,
        ROUND(valor_total / NULLIF(total_entregas, 0), 2) as valor_promedio_entrega,
        ROUND(valor_conciliado / NULLIF(entregas_conciliadas, 0), 2) as valor_promedio_conciliado,
        
        -- ✅ INDICADORES DE EFICIENCIA
        (total_entregas - entregas_conciliadas) as pendientes_conciliacion,
        ROUND((valor_conciliado * 100.0) / NULLIF(valor_total, 0), 2) as porcentaje_valor_conciliado
        
    FROM resumen_por_cliente
    WHERE total_entregas > 0
    ORDER BY valor_conciliado DESC, entregas_conciliadas DESC
    """
    
    try:
        resultados = client.query(query).result()
        return [dict(row) for row in resultados]
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al obtener resumen de liquidaciones: {str(e)}"
        )

@router.get("/dashboard-conciliacion")
def obtener_dashboard_conciliacion():
    """
    🎯 NUEVO: Dashboard ejecutivo del estado de conciliación
    ✅ BENEFICIO: Visibilidad completa del flujo en tiempo real
    """
    
    client = bigquery.Client()
    
    query = """
    WITH estado_completo AS (
        SELECT 
            pc.cliente,
            pc.referencia_pago,
            pc.estado as estado_pago,
            pc.valor_total_consignacion,
            pc.fecha_pago,
            
            CASE 
                WHEN bm.estado_conciliacion = 'conciliado_exacto' THEN 'CONCILIADO_EXACTO'
                WHEN bm.estado_conciliacion = 'conciliado_aproximado' THEN 'CONCILIADO_APROXIMADO'
                WHEN bm.estado_conciliacion = 'conciliado_manual' THEN 'CONCILIADO_MANUAL'
                WHEN pc.estado = 'aprobado' AND bm.id IS NULL THEN 'APROBADO_SIN_CONCILIAR'
                WHEN pc.estado = 'pagado' THEN 'PAGADO_SIN_APROBAR'
                WHEN pc.estado = 'rechazado' THEN 'RECHAZADO'
                ELSE 'OTRO'
            END as estado_flujo,
            
            bm.conciliado_en,
            
            -- Cálculo de días en cada etapa
            CASE 
                WHEN bm.conciliado_en IS NOT NULL THEN 
                    DATE_DIFF(DATE(bm.conciliado_en), pc.fecha_pago, DAY)
                ELSE 
                    DATE_DIFF(CURRENT_DATE(), pc.fecha_pago, DAY)
            END as dias_en_proceso
            
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
        LEFT JOIN `datos-clientes-441216.Conciliaciones.banco_movimientos` bm
            ON bm.referencia_pago_asociada = pc.referencia_pago
        WHERE pc.fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        AND pc.referencia_pago IS NOT NULL
    ),
    
    resumen_estados AS (
        SELECT 
            estado_flujo,
            COUNT(*) as cantidad,
            SUM(valor_total_consignacion) as valor_total,
            AVG(dias_en_proceso) as dias_promedio_proceso,
            COUNT(CASE WHEN dias_en_proceso > 7 THEN 1 END) as casos_lentos,
            COUNT(DISTINCT cliente) as clientes_afectados
        FROM estado_completo
        GROUP BY estado_flujo
    )
    
    SELECT 
        estado_flujo,
        cantidad,
        valor_total,
        dias_promedio_proceso,
        casos_lentos,
        clientes_afectados
    FROM resumen_estados
    ORDER BY cantidad DESC
    """
    
    try:
        resultados = client.query(query).result()
        
        estados = []
        totales = {
            "cantidad_total": 0,
            "valor_total": 0,
            "casos_lentos_total": 0,
            "clientes_total": set()
        }
        
        for row in resultados:
            estado = {
                "estado_flujo": row["estado_flujo"],
                "cantidad": int(row["cantidad"]),
                "valor_total": float(row["valor_total"] or 0),
                "dias_promedio_proceso": round(float(row["dias_promedio_proceso"] or 0), 1),
                "casos_lentos": int(row["casos_lentos"]),
                "clientes_afectados": int(row["clientes_afectados"])
            }
            estados.append(estado)
            
            totales["cantidad_total"] += estado["cantidad"]
            totales["valor_total"] += estado["valor_total"]
            totales["casos_lentos_total"] += estado["casos_lentos"]
        
        # Calcular eficiencia del flujo
        conciliados = sum(e["cantidad"] for e in estados if "CONCILIADO" in e["estado_flujo"])
        aprobados_sin_conciliar = next((e["cantidad"] for e in estados if e["estado_flujo"] == "APROBADO_SIN_CONCILIAR"), 0)
        
        return {
            "estados_flujo": estados,
            "totales": {
                "cantidad_total": totales["cantidad_total"],
                "valor_total": totales["valor_total"],
                "casos_lentos_total": totales["casos_lentos_total"]
            },
            "eficiencia": {
                "porcentaje_conciliado": (conciliados / max(totales["cantidad_total"], 1)) * 100,
                "cuello_botella_cantidad": aprobados_sin_conciliar,
                "dias_promedio_conciliacion": sum(e["dias_promedio_proceso"] * e["cantidad"] for e in estados if "CONCILIADO" in e["estado_flujo"]) / max(conciliados, 1)
            },
            "alertas": {
                "total_casos_lentos": totales["casos_lentos_total"],
                "porcentaje_casos_lentos": (totales["casos_lentos_total"] / max(totales["cantidad_total"], 1)) * 100
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generando dashboard: {str(e)}"
        )

@router.post("/marcar-como-liquidado")
def marcar_entregas_como_liquidadas(data: dict):
    """Marca entregas como liquidadas después del pago al cliente"""
    referencias_pago = data.get("referencias_pago", [])
    cliente = data.get("cliente")
    usuario = data.get("usuario", "sistema")
    observaciones = data.get("observaciones", "Liquidado automáticamente")
    
    if not referencias_pago:
        raise HTTPException(status_code=400, detail="Se requieren referencias de pago")
    
    client = bigquery.Client()
    
    # Convertir lista a string para la consulta
    refs_str = "', '".join(referencias_pago)
    
    query = f"""
    UPDATE `datos-clientes-441216.Conciliaciones.pagosconductor`
    SET 
        estado = 'liquidado',
        modificado_en = CURRENT_TIMESTAMP(),
        modificado_por = @usuario,
        novedades = CONCAT(
            COALESCE(novedades, ''), 
            ' | Liquidado: ', 
            @observaciones
        )
    WHERE referencia_pago IN ('{refs_str}')
      AND COALESCE(cliente, 'Sin Cliente') = @cliente
    """
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("usuario", "STRING", usuario),
            bigquery.ScalarQueryParameter("cliente", "STRING", cliente),
            bigquery.ScalarQueryParameter("observaciones", "STRING", observaciones)
        ]
    )
    
    try:
        result = client.query(query, job_config=job_config).result()
        
        return {
            "mensaje": f"Se marcaron {len(referencias_pago)} entregas como liquidadas para {cliente}",
            "referencias_procesadas": referencias_pago,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al marcar entregas como liquidadas: {str(e)}"
        )

# ✅ FUNCIONES AUXILIARES CORREGIDAS

def _evaluar_calidad_conciliacion(estado: str, diff_valor: float, diff_dias: int, confianza: int) -> str:
    """Evalúa la calidad general de la conciliación"""
    if estado == "conciliado_exacto" and diff_valor <= 1 and diff_dias <= 1:
        return "Excelente"
    elif estado == "conciliado_manual" and confianza >= 90:
        return "Muy Buena"
    elif estado == "conciliado_aproximado" and diff_valor <= 1000 and diff_dias <= 3:
        return "Buena"
    elif diff_valor > 10000 or diff_dias > 7:
        return "Requiere Revisión"
    else:
        return "Aceptable"

def _get_icono_estado(estado: str, calidad: str) -> str:
    """Retorna icono apropiado para el estado"""
    iconos_base = {
        'Conciliado Exacto': '✅',
        'Conciliado Aproximado': '🔸',
        'Conciliado Manual': '👤',
        'Aprobado (Pendiente Conciliación)': '⏳',
        'Pagado (Pendiente Aprobación)': '📋',
        'Pendiente': '❓',
        'Diferencia de Valor': '💰',
        'Diferencia de Fecha': '📅',
        'Sin Conciliar': '❌'
    }
    
    icono_base = iconos_base.get(estado, '❓')
    
    if calidad == 'Excelente':
        return icono_base + '🌟'
    elif calidad == 'Requiere Revisión':
        return icono_base + '⚠️'
    
    return icono_base

def _get_color_estado(estado: str, integridad_ok: bool) -> str:
    """Retorna color apropiado para el estado"""
    if not integridad_ok:
        return '#f59e0b'  # Amarillo/naranja para advertencia
    
    colores = {
        'Conciliado Exacto': '#22c55e',
        'Conciliado Aproximado': '#3b82f6',
        'Conciliado Manual': '#8b5cf6',
        'Aprobado (Pendiente Conciliación)': '#f59e0b',
        'Pagado (Pendiente Aprobación)': '#ef4444',
        'Pendiente': '#6b7280',
        'Diferencia de Valor': '#ef4444',
        'Diferencia de Fecha': '#f59e0b',
        'Sin Conciliar': '#ef4444'
    }
    return colores.get(estado, '#6b7280')

def _calcular_score_calidad(entregas: list) -> float:
    """Calcula un score de calidad general del 0-100"""
    if not entregas:
        return 0
    
    total = len(entregas)
    excelentes = len([e for e in entregas if e["calidad_conciliacion"] == "Excelente"])
    muy_buenas = len([e for e in entregas if e["calidad_conciliacion"] == "Muy Buena"])
    buenas = len([e for e in entregas if e["calidad_conciliacion"] == "Buena"])
    problematicas = len([e for e in entregas if e["calidad_conciliacion"] == "Requiere Revisión"])
    
    score = (
        (excelentes * 100 + muy_buenas * 85 + buenas * 70 + problematicas * 30) / 
        max(total, 1)
    )
    
    return round(score, 1)

def _generar_recomendaciones(entregas: list, alertas: list, clientes_stats: dict) -> list:
    """Genera recomendaciones basadas en el análisis de datos"""
    recomendaciones = []
    
    # Analizar alertas críticas
    alertas_criticas = [a for a in alertas if a["severidad"] == "critica"]
    if alertas_criticas:
        recomendaciones.append({
            "tipo": "critica",
            "titulo": "Diferencias críticas detectadas",
            "descripcion": f"{len(alertas_criticas)} entregas con diferencias mayores a $10,000 requieren revisión inmediata",
            "accion": "Revisar y conciliar manualmente las entregas con alertas críticas"
        })
    
    # Analizar clientes con problemas
    clientes_problematicos = [c for c, stats in clientes_stats.items() if stats["porcentaje_problemas"] > 20]
    if clientes_problematicos:
        recomendaciones.append({
            "tipo": "advertencia",
            "titulo": "Clientes con alta tasa de problemas",
            "descripcion": f"{len(clientes_problematicos)} clientes tienen más del 20% de entregas con problemas",
            "accion": "Revisar procesos de pago con estos clientes: " + ", ".join(clientes_problematicos[:3])
        })
    
    # Analizar entregas listas para liquidar
    entregas_listas = [e for e in entregas if e["listo_para_liquidar"]]
    if entregas_listas:
        valor_listo = sum(e["valor"] for e in entregas_listas)
        recomendaciones.append({
            "tipo": "oportunidad",
            "titulo": "Entregas listas para liquidar",
            "descripcion": f"{len(entregas_listas)} entregas por ${valor_listo:,.0f} están listas para procesar",
            "accion": "Proceder con la liquidación de estas entregas"
        })
    
    return recomendaciones

def _mapear_estado_conciliacion(estado_db: str) -> str:
    """Mapea estados de BD a estados legibles"""
    mapeo = {
        "conciliado_exacto": "Conciliado Exacto",
        "conciliado_aproximado": "Conciliado Aproximado", 
        "conciliado_manual": "Conciliado Manual",
        "pendiente": "Pendiente",
        "sin_match": "Sin Conciliar",
        "multiple_match": "Múltiples Coincidencias",
        "diferencia_valor": "Diferencia de Valor",
        "diferencia_fecha": "Diferencia de Fecha"
    }
    return mapeo.get(estado_db, estado_db)

def _get_descripcion_validacion(resultado: str) -> str:
    """Descripciones legibles para cada tipo de validación"""
    descripciones = {
        "OK": "Entregas listas para liquidar sin problemas",
        "SIN_CONCILIAR": "Entregas sin conciliación bancaria",
        "CONCILIACION_INCOMPLETA": "Conciliación iniciada pero no completada",
        "PAGO_NO_APROBADO": "Pagos que requieren aprobación previa",
        "DIFERENCIA_VALOR_ALTA": "Diferencias significativas entre pago y banco"
    }
    return descripciones.get(resultado, resultado)

def _get_recomendacion_liquidacion(validaciones: list) -> str:
    """Genera recomendación basada en validaciones"""
    problemas = [v for v in validaciones if v["resultado"] != "OK"]
    
    if not problemas:
        return "✅ Todas las entregas están listas para liquidar"
    
    if any(p["resultado"] == "SIN_CONCILIAR" for p in problemas):
        return "❌ Completar conciliación bancaria antes de proceder"
    
    if any(p["resultado"] == "DIFERENCIA_VALOR_ALTA" for p in problemas):
        return "⚠️ Revisar diferencias de valor antes de liquidar"
    
    return "⚠️ Resolver problemas identificados antes de liquidar"