from fastapi import APIRouter, HTTPException, Query
from google.cloud import bigquery
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel
import logging
logging.basicConfig(level=logging.DEBUG)


router = APIRouter(prefix="/entregas", tags=["Entregas"])
client = bigquery.Client()

# ✅ 1. ENDPOINT PRINCIPAL QUE EL FRONTEND NECESITA
@router.get("/entregas-consolidadas")
def obtener_entregas_consolidadas(
    cliente: Optional[str] = Query(None),
    desde: Optional[str] = Query(None),
    hasta: Optional[str] = Query(None),
    solo_conciliadas: Optional[bool] = Query(True)
):
    """
    🎯 ENDPOINT PRINCIPAL que coincide exactamente con lo que el frontend espera
    """
    
    client = bigquery.Client()
    
    try:
        # Construir filtros
        condiciones = []
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
        
        where_clause = ""
        if condiciones:
            where_clause = "AND " + " AND ".join(condiciones)
        
        # Filtro de conciliación
        filtro_conciliacion = ""
        if solo_conciliadas:
            filtro_conciliacion = "AND bm.estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual')"
        
        query = f"""
        WITH entregas_procesadas AS (
            SELECT 
                COALESCE(pc.tracking, pc.referencia_pago) as tracking,
                pc.referencia_pago,
                COALESCE(pc.cliente, 'Sin Cliente') as cliente,
                COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) as valor,
                pc.fecha_pago,
                COALESCE(pc.correo, 'conductor@unknown.com') as correo_conductor,
                COALESCE(pc.entidad, 'Sin Entidad') as entidad_pago,
                COALESCE(pc.tipo, 'Transferencia') as tipo,
                pc.estado as estado_pago,
                
                -- Información de conciliación
                COALESCE(bm.id, 'N/A') as id_banco_asociado,
                COALESCE(bm.fecha, pc.fecha_pago) as fecha_banco,
                COALESCE(bm.valor_banco, pc.valor_total_consignacion) as valor_banco,
                COALESCE(bm.descripcion, 'Sin descripción banco') as descripcion_banco,
                COALESCE(bm.estado_conciliacion, 'pendiente') as estado_conciliacion_raw,
                COALESCE(bm.confianza_match, 0) as confianza_match,
                COALESCE(bm.observaciones, 'Sin observaciones') as observaciones_conciliacion,
                COALESCE(bm.conciliado_en, bm.cargado_en) as fecha_conciliacion,
                
                -- Validaciones
                ABS(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) - COALESCE(bm.valor_banco, pc.valor_total_consignacion, pc.valor, 0)) as diferencia_valor,
                
                -- Estado final procesado
                CASE 
                    WHEN bm.estado_conciliacion = 'conciliado_exacto' THEN 'Conciliado Exacto'
                    WHEN bm.estado_conciliacion = 'conciliado_aproximado' THEN 'Conciliado Aproximado'
                    WHEN bm.estado_conciliacion = 'conciliado_manual' THEN 'Conciliado Manual'
                    WHEN pc.estado = 'aprobado' AND bm.estado_conciliacion IS NULL THEN 'Aprobado (Pendiente Conciliación)'
                    WHEN pc.estado = 'pagado' THEN 'Pagado (Pendiente Aprobación)'
                    ELSE 'Pendiente'
                END as estado_conciliacion,
                
                -- Calidad de conciliación
                CASE 
                    WHEN bm.estado_conciliacion = 'conciliado_exacto' AND bm.confianza_match >= 95 THEN 'Excelente'
                    WHEN bm.estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado') AND bm.confianza_match >= 80 THEN 'Buena'
                    WHEN bm.estado_conciliacion IS NOT NULL THEN 'Regular'
                    ELSE 'Sin Conciliar'
                END as calidad_conciliacion,
                
                -- Flags de validación
                CASE 
                    WHEN bm.estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual') 
                         AND pc.estado = 'aprobado' 
                    THEN TRUE
                    ELSE FALSE
                END as listo_para_liquidar,
                
                CASE 
                    WHEN ABS(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) - COALESCE(bm.valor_banco, pc.valor_total_consignacion, pc.valor, 0)) <= 1000 
                    THEN TRUE
                    ELSE FALSE
                END as integridad_ok
                
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
            
            LEFT JOIN `datos-clientes-441216.Conciliaciones.banco_movimientos` bm
                ON bm.referencia_pago_asociada = pc.referencia_pago
            
            WHERE pc.estado IN ('aprobado', 'pagado')
            AND pc.referencia_pago IS NOT NULL
            AND pc.fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
            {where_clause}
            {filtro_conciliacion}
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
            estado_conciliacion,
            
            -- Información de conciliación extendida
            id_banco_asociado,
            DATE(fecha_banco) as fecha_banco,
            valor_banco as valor_banco_conciliado,
            descripcion_banco,
            estado_conciliacion_raw,
            confianza_match,
            observaciones_conciliacion,
            COALESCE(DATE(fecha_conciliacion), DATE(fecha_pago)) as fecha_conciliacion,
            
            -- Validaciones
            diferencia_valor,
            listo_para_liquidar,
            integridad_ok,
            calidad_conciliacion
            
        FROM entregas_procesadas
        ORDER BY 
            listo_para_liquidar DESC,
            cliente ASC,
            fecha_pago DESC
        """
        
        job_config = bigquery.QueryJobConfig(query_parameters=parametros)
        resultados = client.query(query, job_config=job_config).result()
        
        entregas = []
        total_valor = 0
        clientes_agrupados = {}
        
        # Métricas de calidad
        stats_calidad = {
            'exactas': 0,
            'aproximadas': 0,
            'manuales': 0,
            'sin_conciliar': 0
        }
        
        for row in resultados:
            valor = float(row["valor"])
            diferencia_valor = float(row["diferencia_valor"]) if row["diferencia_valor"] else 0
            
            entrega = {
                "tracking": row["tracking"],
                "fecha": row["fecha"].isoformat(),
                "tipo": row["tipo"],
                "cliente": row["cliente"],
                "valor": valor,
                "estado_conciliacion": row["estado_conciliacion"],
                "referencia_pago": row["referencia_pago"],
                "correo_conductor": row["correo_conductor"],
                "entidad_pago": row["entidad_pago"],
                "fecha_conciliacion": row["fecha_conciliacion"].isoformat() if row["fecha_conciliacion"] else None,
                
                # Información extendida de conciliación
                "valor_banco_conciliado": float(row["valor_banco_conciliado"]) if row["valor_banco_conciliado"] else None,
                "id_banco_asociado": row["id_banco_asociado"],
                "observaciones_conciliacion": row["observaciones_conciliacion"],
                "confianza_match": int(row["confianza_match"]) if row["confianza_match"] else 0,
                "diferencia_valor": diferencia_valor,
                "integridad_ok": bool(row["integridad_ok"]),
                "listo_para_liquidar": bool(row["listo_para_liquidar"]),
                "calidad_conciliacion": row["calidad_conciliacion"]
            }
            
            entregas.append(entrega)
            total_valor += valor
            
            # Actualizar estadísticas de calidad
            if row["estado_conciliacion"] == "Conciliado Exacto":
                stats_calidad['exactas'] += 1
            elif row["estado_conciliacion"] == "Conciliado Aproximado":
                stats_calidad['aproximadas'] += 1
            elif row["estado_conciliacion"] == "Conciliado Manual":
                stats_calidad['manuales'] += 1
            else:
                stats_calidad['sin_conciliar'] += 1
            
            # Agrupar por cliente
            cliente_key = entrega["cliente"]
            if cliente_key not in clientes_agrupados:
                clientes_agrupados[cliente_key] = {
                    "cantidad": 0,
                    "valor": 0
                }
            
            clientes_agrupados[cliente_key]["cantidad"] += 1
            clientes_agrupados[cliente_key]["valor"] += valor
        
        # Calcular métricas de calidad
        total_entregas = len(entregas)
        entregas_conciliadas = stats_calidad['exactas'] + stats_calidad['aproximadas'] + stats_calidad['manuales']
        confianza_promedio = sum(e['confianza_match'] for e in entregas) / max(total_entregas, 1)
        
        return {
            "entregas": entregas,
            "total_entregas": total_entregas,
            "valor_total": total_valor,
            "estadisticas": {
                "total_entregas": total_entregas,
                "valor_total": total_valor,
                "clientes": clientes_agrupados
            },
            "clientes_agrupados": clientes_agrupados,
            "estadisticas_calidad": stats_calidad,
            "calidad_datos": {
                "porcentaje_calidad": (entregas_conciliadas / max(total_entregas, 1)) * 100,
                "confianza_promedio": confianza_promedio,
                "alertas_criticas": len([e for e in entregas if not e['integridad_ok']])
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo entregas: {str(e)}"
        )

# ✅ 2. ENDPOINT RESUMEN LIQUIDACIONES
@router.get("/resumen-liquidaciones")
def obtener_resumen_liquidaciones():
    """
    Resumen de liquidaciones por cliente
    """
    
    client = bigquery.Client()
    
    try:
        query = """
        WITH resumen_clientes AS (
            SELECT 
                COALESCE(pc.cliente, 'Sin Cliente') as cliente,
                COUNT(*) as total_entregas,
                SUM(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0)) as valor_total,
                COUNT(CASE WHEN bm.estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual') THEN 1 END) as entregas_conciliadas,
                AVG(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0)) as valor_promedio_entrega
                
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
            
            LEFT JOIN `datos-clientes-441216.Conciliaciones.banco_movimientos` bm
                ON bm.referencia_pago_asociada = pc.referencia_pago
            
            WHERE pc.estado IN ('aprobado', 'pagado')
            AND pc.fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
            
            GROUP BY pc.cliente
        )
        
        SELECT 
            cliente,
            total_entregas,
            valor_total,
            entregas_conciliadas,
            CASE 
                WHEN total_entregas > 0 THEN (entregas_conciliadas / total_entregas) * 100
                ELSE 0
            END as porcentaje_conciliadas,
            valor_promedio_entrega
            
        FROM resumen_clientes
        ORDER BY valor_total DESC
        """
        
        resultados = client.query(query).result()
        
        resumen = []
        for row in resultados:
            resumen.append({
                "cliente": row["cliente"],
                "total_entregas": int(row["total_entregas"]),
                "valor_total": float(row["valor_total"]),
                "entregas_conciliadas": int(row["entregas_conciliadas"]),
                "porcentaje_conciliadas": float(row["porcentaje_conciliadas"]),
                "valor_promedio_entrega": float(row["valor_promedio_entrega"])
            })
        
        return resumen
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo resumen: {str(e)}"
        )

# ✅ 3. ENDPOINT DASHBOARD CONCILIACIÓN
@router.get("/dashboard-conciliacion")
def obtener_dashboard_conciliacion():
    query = """
    SELECT * FROM `datos-clientes-441216.Conciliaciones.view_resumen_conciliacion`
    """
    result = client.query(query).result()
    return [dict(row.items()) for row in result]


# ✅ 4. ENDPOINT VALIDAR INTEGRIDAD
@router.get("/validar-integridad-liquidacion/{cliente}")
def validar_integridad_liquidacion(cliente: str):
    """
    Valida la integridad de las entregas de un cliente específico
    """
    
    client = bigquery.Client()
    
    try:
        query = """
        WITH validacion_cliente AS (
            SELECT 
                pc.referencia_pago,
                COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) as valor_pago,
                COALESCE(bm.valor_banco, 0) as valor_banco,
                ABS(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) - COALESCE(bm.valor_banco, 0)) as diferencia_valor,
                bm.estado_conciliacion,
                pc.estado as estado_pago,
                
                CASE 
                    WHEN bm.estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual') 
                         AND pc.estado = 'aprobado'
                         AND ABS(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) - COALESCE(bm.valor_banco, 0)) <= 1000
                    THEN 'LISTO'
                    WHEN pc.estado = 'aprobado' AND bm.estado_conciliacion IS NULL 
                    THEN 'PENDIENTE_CONCILIAR'
                    WHEN ABS(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) - COALESCE(bm.valor_banco, 0)) > 1000
                    THEN 'DIFERENCIA_VALOR'
                    ELSE 'OTRO_PROBLEMA'
                END as resultado_validacion
                
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
            
            LEFT JOIN `datos-clientes-441216.Conciliaciones.banco_movimientos` bm
                ON bm.referencia_pago_asociada = pc.referencia_pago
            
            WHERE COALESCE(pc.cliente, 'Sin Cliente') = @cliente
            AND pc.estado IN ('aprobado', 'pagado')
            AND pc.fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        )
        
        SELECT 
            resultado_validacion,
            COUNT(*) as cantidad,
            SUM(valor_pago) as valor_total,
            AVG(diferencia_valor) as diferencia_promedio,
            
            CASE resultado_validacion
                WHEN 'LISTO' THEN 'Entregas listas para liquidar'
                WHEN 'PENDIENTE_CONCILIAR' THEN 'Pendientes de conciliación bancaria'
                WHEN 'DIFERENCIA_VALOR' THEN 'Diferencias de valor significativas'
                ELSE 'Otros problemas de integridad'
            END as descripcion
            
        FROM validacion_cliente
        GROUP BY resultado_validacion, descripcion
        ORDER BY 
            CASE resultado_validacion
                WHEN 'LISTO' THEN 1
                WHEN 'PENDIENTE_CONCILIAR' THEN 2
                WHEN 'DIFERENCIA_VALOR' THEN 3
                ELSE 4
            END
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("cliente", "STRING", cliente)
            ]
        )
        
        resultados = client.query(query, job_config=job_config).result()
        
        validaciones = []
        total_listas = 0
        total_problemas = 0
        valor_listo = 0
        valor_bloqueado = 0
        
        for row in resultados:
            validacion = {
                "resultado": row["resultado_validacion"],
                "cantidad": int(row["cantidad"]),
                "valor_total": float(row["valor_total"]),
                "diferencia_promedio": float(row["diferencia_promedio"]) if row["diferencia_promedio"] else 0,
                "descripcion": row["descripcion"]
            }
            
            validaciones.append(validacion)
            
            if row["resultado_validacion"] == "LISTO":
                total_listas += int(row["cantidad"])
                valor_listo += float(row["valor_total"])
            else:
                total_problemas += int(row["cantidad"])
                valor_bloqueado += float(row["valor_total"])
        
        listo_para_procesar = total_listas > 0 and total_problemas == 0
        
        recomendacion = ""
        if listo_para_procesar:
            recomendacion = f"Cliente listo para liquidar {total_listas} entregas"
        elif total_problemas > 0:
            recomendacion = f"Resolver {total_problemas} entregas con problemas antes de liquidar"
        else:
            recomendacion = "No hay entregas disponibles para este cliente"
        
        return {
            "cliente": cliente,
            "validaciones": validaciones,
            "resumen": {
                "listas_liquidar": total_listas,
                "con_problemas": total_problemas,
                "valor_listo": valor_listo,
                "valor_bloqueado": valor_bloqueado
            },
            "listo_para_procesar": listo_para_procesar,
            "recomendacion": recomendacion
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error validando integridad: {str(e)}"
        )

# ✅ MANTENER ENDPOINTS EXISTENTES IMPORTANTES
@router.get("/entregas-listas-liquidar")
def obtener_entregas_listas_liquidar(
    cliente: Optional[str] = Query(None),
    desde: Optional[str] = Query(None),
    hasta: Optional[str] = Query(None),
    incluir_aproximadas: Optional[bool] = Query(True)
):
    """
    🎯 ENDPOINT SIMPLIFICADO SOLO PARA ENTREGAS LISTAS
    """
    
    client = bigquery.Client()
    
    # Construir filtros
    condiciones = []
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
    
    where_clause = ""
    if condiciones:
        where_clause = "AND " + " AND ".join(condiciones)
    
    # Filtro de tipos de conciliación
    tipos_conciliacion = ["'conciliado_exacto'"]
    if incluir_aproximadas:
        tipos_conciliacion.extend(["'conciliado_aproximado'", "'conciliado_manual'"])
    
    tipos_str = ", ".join(tipos_conciliacion)
    
    query = f"""
    SELECT 
        COALESCE(pc.tracking, pc.referencia_pago) as tracking,
        pc.referencia_pago,
        COALESCE(pc.cliente, 'Sin Cliente') as cliente,
        COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) as valor,
        DATE(pc.fecha_pago) as fecha,
        COALESCE(pc.correo, 'conductor@unknown.com') as correo_conductor,
        COALESCE(pc.entidad, 'Sin Entidad') as entidad_pago,
        COALESCE(pc.tipo, 'Transferencia') as tipo,
        
        -- Información de conciliación
        bm.estado_conciliacion,
        COALESCE(bm.valor_banco, 0) as valor_banco,
        bm.id as id_banco_asociado,
        DATE(COALESCE(bm.conciliado_en, bm.cargado_en)) as fecha_conciliacion,
        COALESCE(bm.confianza_match, 0) as confianza_match,
        
        -- Estado legible
        CASE 
            WHEN bm.estado_conciliacion = 'conciliado_exacto' THEN 'Conciliado Exacto'
            WHEN bm.estado_conciliacion = 'conciliado_aproximado' THEN 'Conciliado Aproximado'
            WHEN bm.estado_conciliacion = 'conciliado_manual' THEN 'Conciliado Manual'
            ELSE 'Conciliado'
        END as estado_conciliacion_legible
        
    FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
    
    INNER JOIN `datos-clientes-441216.Conciliaciones.banco_movimientos` bm
        ON bm.referencia_pago_asociada = pc.referencia_pago
    
    WHERE pc.estado = 'aprobado'
    AND bm.estado_conciliacion IN ({tipos_str})
    AND pc.fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
    {where_clause}
    
    ORDER BY pc.cliente ASC, pc.fecha_pago DESC
    """
    
    try:
        job_config = bigquery.QueryJobConfig(query_parameters=parametros)
        resultados = client.query(query, job_config=job_config).result()
        
        entregas = []
        total_valor = 0
        clientes_agrupados = {}
        
        # Métricas de calidad
        stats_calidad = {
            'exactas': 0,
            'aproximadas': 0,
            'manuales': 0
        }
        
        for row in resultados:
            valor = float(row["valor"])
            
            entrega = {
                "tracking": row["tracking"],
                "fecha": row["fecha"].isoformat(),
                "tipo": row["tipo"],
                "cliente": row["cliente"],
                "valor": valor,
                "estado_conciliacion": row["estado_conciliacion_legible"],
                "referencia_pago": row["referencia_pago"],
                "correo_conductor": row["correo_conductor"],
                "entidad_pago": row["entidad_pago"],
                "fecha_conciliacion": row["fecha_conciliacion"].isoformat() if row["fecha_conciliacion"] else None,
                "valor_banco_conciliado": float(row["valor_banco"]),
                "id_banco_asociado": row["id_banco_asociado"],
                "confianza_match": int(row["confianza_match"]),
                "listo_para_liquidar": True,
                "integridad_ok": True
            }
            
            entregas.append(entrega)
            total_valor += valor
            
            # Actualizar estadísticas
            if row["estado_conciliacion"] == "conciliado_exacto":
                stats_calidad['exactas'] += 1
            elif row["estado_conciliacion"] == "conciliado_aproximado":
                stats_calidad['aproximadas'] += 1
            elif row["estado_conciliacion"] == "conciliado_manual":
                stats_calidad['manuales'] += 1
            
            # Agrupar por cliente
            cliente_key = entrega["cliente"]
            if cliente_key not in clientes_agrupados:
                clientes_agrupados[cliente_key] = {
                    "cantidad": 0,
                    "valor": 0
                }
            
            clientes_agrupados[cliente_key]["cantidad"] += 1
            clientes_agrupados[cliente_key]["valor"] += valor
        
        # Calcular métricas de calidad
        total_entregas = len(entregas)
        confianza_promedio = sum(e['confianza_match'] for e in entregas) / max(total_entregas, 1)
        
        return {
            "mensaje": f"✅ {len(entregas)} entregas listas para liquidar",
            "entregas": entregas,
            "total_entregas": total_entregas,
            "valor_total": total_valor,
            "clientes_agrupados": clientes_agrupados,
            "estadisticas_calidad": stats_calidad,
            "calidad_datos": {
                "porcentaje_calidad": 100.0,  # Solo entregas listas
                "confianza_promedio": confianza_promedio,
                "alertas_criticas": 0  # Solo entregas sin problemas
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error: {str(e)}"
        )

# ✅ ENDPOINTS DE DIAGNÓSTICO Y REPARACIÓN
@router.get("/debug-relacion-tablas")
def debug_relacion_tablas():
    """Debug: Verificar cómo están relacionadas las tablas"""
    
    client = bigquery.Client()
    
    try:
        query_banco = """
        SELECT 
            COUNT(*) as total_movimientos,
            COUNT(referencia_pago_asociada) as con_referencia,
            COUNT(CASE WHEN estado_conciliacion LIKE 'conciliado%' THEN 1 END) as conciliados
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        """
        
        query_pagos = """
        SELECT 
            COUNT(*) as total_pagos,
            COUNT(CASE WHEN estado = 'aprobado' THEN 1 END) as aprobados,
            COUNT(CASE WHEN estado = 'pagado' THEN 1 END) as pagados,
            COUNT(DISTINCT referencia_pago) as referencias_unicas
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        """

        query_join = """
        SELECT 
            COUNT(*) as total_matches,
            COUNT(CASE WHEN bm.estado_conciliacion LIKE 'conciliado%' THEN 1 END) as matches_conciliados
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
        INNER JOIN `datos-clientes-441216.Conciliaciones.banco_movimientos` bm
            ON bm.referencia_pago_asociada = pc.referencia_pago
        WHERE pc.fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        """
        
        banco_stats = dict(list(client.query(query_banco).result())[0])
        pagos_stats = dict(list(client.query(query_pagos).result())[0])
        join_stats = dict(list(client.query(query_join).result())[0])
        
        return {
            "banco_movimientos": banco_stats,
            "pagosconductor": pagos_stats,
            "relacion_join": join_stats,
            "diagnostico": {
                "problema_detectado": join_stats["total_matches"] == 0,
                "solucion": "Verificar campo referencia_pago_asociada en banco_movimientos"
            }
        }
        
    except Exception as e:
        return {"error": str(e)}

@router.get("/verificar-datos-conciliados")
def verificar_datos_conciliados():
    """Verifica si hay datos conciliados en el sistema"""
    
    client = bigquery.Client()
    
    try:
        query = """
        WITH verificacion AS (
            SELECT 
                -- Tabla banco_movimientos
                (SELECT COUNT(*) FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`) as total_banco,
                (SELECT COUNT(*) FROM `datos-clientes-441216.Conciliaciones.banco_movimientos` 
                 WHERE estado_conciliacion LIKE 'conciliado%') as banco_conciliados,
                (SELECT COUNT(*) FROM `datos-clientes-441216.Conciliaciones.banco_movimientos` 
                 WHERE referencia_pago_asociada IS NOT NULL) as banco_con_referencia,
                
                -- Tabla pagosconductor
                (SELECT COUNT(*) FROM `datos-clientes-441216.Conciliaciones.pagosconductor` 
                 WHERE estado = 'aprobado') as pagos_aprobados,
                
                -- JOIN entre tablas
                (SELECT COUNT(*) FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
                 INNER JOIN `datos-clientes-441216.Conciliaciones.banco_movimientos` bm
                    ON bm.referencia_pago_asociada = pc.referencia_pago
                 WHERE pc.estado = 'aprobado' 
                 AND bm.estado_conciliacion LIKE 'conciliado%') as entregas_conciliadas_listas
        )
        SELECT * FROM verificacion
        """
        
        resultado = dict(list(client.query(query).result())[0])
        
        # Diagnóstico
        diagnostico = {
            "hay_movimientos_banco": resultado["total_banco"] > 0,
            "hay_conciliados": resultado["banco_conciliados"] > 0,
            "hay_referencias_asociadas": resultado["banco_con_referencia"] > 0,
            "hay_pagos_aprobados": resultado["pagos_aprobados"] > 0,
            "hay_entregas_listas": resultado["entregas_conciliadas_listas"] > 0
        }
        
        problema_detectado = None
        solucion = None
        
        if not diagnostico["hay_entregas_listas"]:
            if not diagnostico["hay_conciliados"]:
                problema_detectado = "No hay movimientos bancarios conciliados"
                solucion = "Ejecutar proceso de conciliación automática"
            elif not diagnostico["hay_referencias_asociadas"]:
                problema_detectado = "Los movimientos conciliados no tienen referencias asociadas"
                solucion = "Verificar campo referencia_pago_asociada en banco_movimientos"
            elif not diagnostico["hay_pagos_aprobados"]:
                problema_detectado = "No hay pagos en estado 'aprobado'"
                solucion = "Aprobar pagos de conductores antes de conciliar"
            else:
                problema_detectado = "Error en la relación entre tablas"
                solucion = "Verificar JOIN entre pagosconductor y banco_movimientos"
        
        return {
            "estadisticas": resultado,
            "diagnostico": diagnostico,
            "problema_detectado": problema_detectado,
            "solucion_recomendada": solucion,
            "estado_sistema": "OK" if diagnostico["hay_entregas_listas"] else "PROBLEMA"
        }
        
    except Exception as e:
        return {"error": str(e)}

@router.post("/reparar-referencias-conciliacion")
def reparar_referencias_conciliacion():
    """
    Repara las referencias entre pagos y movimientos bancarios si están rotas
    """
    
    client = bigquery.Client()
    
    try:
        # 1. Verificar si hay movimientos conciliados sin referencia
        query_verificar = """
        SELECT COUNT(*) as movimientos_sin_referencia
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual')
        AND (referencia_pago_asociada IS NULL OR referencia_pago_asociada = '')
        """
        
        sin_referencia = list(client.query(query_verificar).result())[0]["movimientos_sin_referencia"]
        
        if sin_referencia == 0:
            return {"mensaje": "No hay referencias que reparar", "movimientos_reparados": 0}
        
        # 2. Intentar reparar basado en valor y fecha
        query_reparar = """
        UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos` bm
        SET referencia_pago_asociada = (
            SELECT pc.referencia_pago
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
            WHERE pc.estado = 'aprobado'
            AND ABS(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) - bm.valor_banco) <= 1000
            AND ABS(DATE_DIFF(pc.fecha_pago, bm.fecha, DAY)) <= 3
            ORDER BY 
                ABS(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) - bm.valor_banco),
                ABS(DATE_DIFF(pc.fecha_pago, bm.fecha, DAY))
            LIMIT 1
        )
        WHERE bm.estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual')
        AND (bm.referencia_pago_asociada IS NULL OR bm.referencia_pago_asociada = '')
        AND EXISTS (
            SELECT 1 FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
            WHERE pc.estado = 'aprobado'
            AND ABS(COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) - bm.valor_banco) <= 1000
            AND ABS(DATE_DIFF(pc.fecha_pago, bm.fecha, DAY)) <= 3
        )
        """
        
        resultado = client.query(query_reparar).result()
        
        # 3. Verificar cuántos se repararon
        reparados = list(client.query(query_verificar).result())[0]["movimientos_sin_referencia"]
        movimientos_reparados = sin_referencia - reparados
        
        return {
            "mensaje": f"Proceso de reparación completado",
            "movimientos_sin_referencia_antes": sin_referencia,
            "movimientos_reparados": movimientos_reparados,
            "movimientos_sin_referencia_despues": reparados
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reparando referencias: {str(e)}")

# ✅ ENDPOINTS DE ASOCIACIÓN MANUAL
@router.get("/analizar-datos-para-asociar")
def analizar_datos_para_asociar():
    """
    Analiza los datos para identificar qué se puede asociar
    """
    client = bigquery.Client()
    
    try:
        # 1. Ver movimientos bancarios conciliados sin referencia
        query_banco = """
        SELECT 
            id,
            fecha,
            valor_banco,
            descripcion,
            estado_conciliacion
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual')
        AND (referencia_pago_asociada IS NULL OR referencia_pago_asociada = '')
        ORDER BY fecha DESC, valor_banco DESC
        """
        
        # 2. Ver pagos aprobados disponibles
        query_pagos = """
        SELECT 
            referencia_pago,
            fecha_pago,
            COALESCE(valor_total_consignacion, CAST(valor AS FLOAT64), 0) as valor,
            COALESCE(cliente, 'Sin Cliente') as cliente,
            correo
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE estado = 'aprobado'
        AND referencia_pago IS NOT NULL
        ORDER BY fecha_pago DESC, valor DESC
        """
        
        movimientos_banco = [dict(row) for row in client.query(query_banco).result()]
        pagos_disponibles = [dict(row) for row in client.query(query_pagos).result()]
        
        # 3. Sugerir asociaciones basadas en valor y fecha
        sugerencias = []
        
        for mov in movimientos_banco:
            valor_banco = float(mov["valor_banco"])
            fecha_banco = mov["fecha"]
            
            for pago in pagos_disponibles:
                valor_pago = float(pago["valor"])
                fecha_pago = pago["fecha_pago"]
                
                # Calcular diferencias
                diff_valor = abs(valor_banco - valor_pago)
                diff_dias = abs((fecha_banco - fecha_pago).days) if fecha_banco and fecha_pago else 999
                
                # Criterio de match
                if diff_valor <= 1000 and diff_dias <= 7:
                    score = 100 - diff_valor/100 - diff_dias*2
                    
                    sugerencias.append({
                        "id_banco": mov["id"],
                        "referencia_pago": pago["referencia_pago"],
                        "valor_banco": valor_banco,
                        "valor_pago": valor_pago,
                        "fecha_banco": str(fecha_banco),
                        "fecha_pago": str(fecha_pago),
                        "diferencia_valor": diff_valor,
                        "diferencia_dias": diff_dias,
                        "score": round(score, 1),
                        "cliente": pago["cliente"],
                        "match_quality": "EXCELENTE" if diff_valor <= 1 and diff_dias <= 1 
                                       else "BUENO" if diff_valor <= 100 and diff_dias <= 3
                                       else "REGULAR"
                    })
        
        # Ordenar por score
        sugerencias.sort(key=lambda x: x["score"], reverse=True)
        
        return {
            "movimientos_sin_referencia": movimientos_banco,
            "pagos_disponibles": pagos_disponibles,
            "sugerencias_asociacion": sugerencias,
            "resumen": {
                "movimientos_bancarios": len(movimientos_banco),
                "pagos_disponibles": len(pagos_disponibles),
                "sugerencias_encontradas": len(sugerencias),
                "matches_excelentes": len([s for s in sugerencias if s["match_quality"] == "EXCELENTE"]),
                "matches_buenos": len([s for s in sugerencias if s["match_quality"] == "BUENO"])
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@router.post("/asociar-referencias-automatico")
def asociar_referencias_automatico():
    """
    Asocia referencias automáticamente basado en las mejores sugerencias
    """
    client = bigquery.Client()
    
    try:
        # 1. Obtener sugerencias
        analisis = analizar_datos_para_asociar()
        sugerencias = analisis["sugerencias_asociacion"]
        
        # 2. Filtrar solo matches de buena calidad
        matches_buenos = [s for s in sugerencias if s["match_quality"] in ["EXCELENTE", "BUENO"]]
        
        if not matches_buenos:
            return {"mensaje": "No se encontraron matches de buena calidad para asociar automáticamente"}
        
        # 3. Asociar uno por uno para evitar conflictos
        referencias_usadas = set()
        asociaciones_exitosas = []
        errores = []
        
        for match in matches_buenos:
            # Evitar duplicados
            if match["referencia_pago"] in referencias_usadas:
                continue
                
            try:
                query_update = """
                UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
                SET referencia_pago_asociada = @referencia_pago,
                    observaciones = CONCAT(
                        COALESCE(observaciones, ''), 
                        ' | Asociado automáticamente - Score: ', 
                        @score
                    )
                WHERE id = @id_banco
                AND (referencia_pago_asociada IS NULL OR referencia_pago_asociada = '')
                """
                
                job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("referencia_pago", "STRING", match["referencia_pago"]),
                        bigquery.ScalarQueryParameter("score", "STRING", str(match["score"])),
                        bigquery.ScalarQueryParameter("id_banco", "STRING", match["id_banco"])
                    ]
                )
                
                client.query(query_update, job_config=job_config).result()
                
                referencias_usadas.add(match["referencia_pago"])
                asociaciones_exitosas.append(match)
                
            except Exception as e:
                errores.append({
                    "id_banco": match["id_banco"],
                    "referencia_pago": match["referencia_pago"],
                    "error": str(e)
                })
        
        return {
            "mensaje": f"✅ {len(asociaciones_exitosas)} referencias asociadas exitosamente",
            "asociaciones_exitosas": asociaciones_exitosas,
            "errores": errores,
            "referencias_usadas": list(referencias_usadas)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@router.post("/asociar-referencia-manual")
def asociar_referencia_manual(data: dict):
    """
    Asocia una referencia manualmente
    """
    id_banco = data.get("id_banco")
    referencia_pago = data.get("referencia_pago")
    
    if not id_banco or not referencia_pago:
        raise HTTPException(status_code=400, detail="id_banco y referencia_pago son requeridos")
    
    client = bigquery.Client()
    
    try:
        # Verificar que la referencia no esté ya usada
        query_verificar = """
        SELECT COUNT(*) as count
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE referencia_pago_asociada = @referencia_pago
        """
        
        job_config_verificar = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia_pago", "STRING", referencia_pago)
            ]
        )
        
        resultado = list(client.query(query_verificar, job_config=job_config_verificar).result())[0]
        
        if resultado.count > 0:
            raise HTTPException(status_code=400, detail=f"La referencia {referencia_pago} ya está asociada")
        
        # Asociar la referencia
        query_update = """
        UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
        SET referencia_pago_asociada = @referencia_pago,
            observaciones = CONCAT(
                COALESCE(observaciones, ''), 
                ' | Asociado manualmente'
            )
        WHERE id = @id_banco
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia_pago", "STRING", referencia_pago),
                bigquery.ScalarQueryParameter("id_banco", "STRING", id_banco)
            ]
        )
        
        client.query(query_update, job_config=job_config).result()
        
        return {
            "mensaje": f"✅ Referencia {referencia_pago} asociada al movimiento {id_banco}",
            "id_banco": id_banco,
            "referencia_pago": referencia_pago
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@router.get("/verificar-asociaciones-exitosas")
def verificar_asociaciones_exitosas():
    """
    Verifica qué asociaciones se hicieron correctamente
    """
    client = bigquery.Client()
    
    try:
        query = """
        SELECT 
            bm.id as id_banco,
            bm.fecha as fecha_banco,
            bm.valor_banco,
            bm.estado_conciliacion,
            bm.referencia_pago_asociada,
            
            pc.referencia_pago,
            pc.fecha_pago,
            COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0) as valor_pago,
            COALESCE(pc.cliente, 'Sin Cliente') as cliente,
            
            ABS(bm.valor_banco - COALESCE(pc.valor_total_consignacion, CAST(pc.valor AS FLOAT64), 0)) as diferencia_valor,
            ABS(DATE_DIFF(bm.fecha, pc.fecha_pago, DAY)) as diferencia_dias
            
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos` bm
        
        INNER JOIN `datos-clientes-441216.Conciliaciones.pagosconductor` pc
            ON bm.referencia_pago_asociada = pc.referencia_pago
            
        WHERE bm.estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual')
        AND pc.estado = 'aprobado'
        
        ORDER BY bm.fecha DESC
        """
        
        resultados = [dict(row) for row in client.query(query).result()]
        
        # Estadísticas
        total_asociaciones = len(resultados)
        valor_total = sum(r["valor_banco"] for r in resultados)
        
        return {
            "mensaje": f"✅ {total_asociaciones} entregas conciliadas y listas para liquidar",
            "entregas_listas": resultados,
            "estadisticas": {
                "total_asociaciones": total_asociaciones,
                "valor_total": valor_total,
                "diferencia_valor_promedio": sum(r["diferencia_valor"] for r in resultados) / max(total_asociaciones, 1),
                "diferencia_dias_promedio": sum(r["diferencia_dias"] for r in resultados) / max(total_asociaciones, 1)
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@router.get("/liquidacion/{cliente}")
def obtener_liquidacion(cliente: str):
    client = bigquery.Client()
    query = """
        SELECT
          gl.tracking_number,
          gl.cliente,
          gl.valor_guia,
          gl.fecha_pago,
          gl.metodo_pago AS entidad,
          gl.pago_referencia,
          gl.estado_liquidacion,
          gl.conductor_email,
          pc.imagen AS comprobante
        FROM `datos-clientes-441216.Conciliaciones.guias_liquidacion` gl
        LEFT JOIN `datos-clientes-441216.Conciliaciones.pagosconductor` pc
          ON gl.pago_referencia = pc.referencia_pago
        WHERE gl.estado_liquidacion = 'liquidado'
          AND LOWER(gl.cliente) = LOWER(@cliente)
        ORDER BY gl.fecha_pago DESC
    """
    result = client.query(query, job_config=bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("cliente", "STRING", cliente)]
    )).result()

    return [dict(row.items()) for row in result]