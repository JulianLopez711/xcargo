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

@router.get("/entregas-consolidadas")
def obtener_entregas_consolidadas(
    cliente: Optional[str] = Query(None, description="Filtrar por cliente específico"),
    desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)"),
    solo_conciliadas: bool = Query(True, description="Solo mostrar entregas conciliadas")
):
    """
    Obtiene las entregas consolidadas listas para liquidación a clientes.
    Incluye información de conciliación bancaria y pagos de conductores.
    """
    
    client = bigquery.Client()
    
    # Construir condiciones WHERE dinámicamente
    condiciones = []
    parametros = []
    
    if solo_conciliadas:
        condiciones.append("pc.conciliado = TRUE")
    
    if cliente:
        condiciones.append("pc.cliente = @cliente")
        parametros.append(bigquery.ScalarQueryParameter("cliente", "STRING", cliente))
    
    if desde:
        condiciones.append("pc.fecha_pago >= @fecha_desde")
        parametros.append(bigquery.ScalarQueryParameter("fecha_desde", "DATE", desde))
    
    if hasta:
        condiciones.append("pc.fecha_pago <= @fecha_hasta")
        parametros.append(bigquery.ScalarQueryParameter("fecha_hasta", "DATE", hasta))
    
    where_clause = ""
    if condiciones:
        where_clause = "WHERE " + " AND ".join(condiciones)
    
    # Query principal que une pagos conciliados con información de conciliación
    query = f"""
    WITH entregas_base AS (
        SELECT 
            -- Información del pago/entrega
            COALESCE(pc.tracking, pc.referencia) as tracking,
            pc.fecha_pago as fecha,
            CASE 
                WHEN pc.tipo = 'Transferencia' THEN 'Transferencia'
                WHEN pc.tipo = 'Nequi' THEN 'Pago Digital'
                WHEN pc.tipo = 'Bancolombia' THEN 'Transferencia Bancaria'
                ELSE pc.tipo
            END as tipo,
            COALESCE(pc.cliente, 'Sin Cliente') as cliente,
            pc.valor,
            
            -- Información de conciliación
            CASE 
                WHEN pc.conciliado = TRUE THEN 'Conciliado'
                WHEN pc.estado = 'aprobado' THEN 'Aprobado'
                WHEN pc.estado = 'pagado' THEN 'Pagado'
                ELSE 'Pendiente'
            END as estado_conciliacion,
            
            pc.referencia_pago,
            pc.correo as correo_conductor,
            pc.entidad as entidad_pago,
            pc.fecha_conciliacion,
            
            -- Información adicional para agrupación
            pc.estado,
            pc.creado_en
            
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
        {where_clause}
    ),
    
    entregas_agrupadas AS (
        SELECT 
            tracking,
            fecha,
            tipo,
            cliente,
            valor,
            estado_conciliacion,
            referencia_pago,
            correo_conductor,
            entidad_pago,
            fecha_conciliacion,
            
            -- Información de agrupación por cliente y fecha
            ROW_NUMBER() OVER (
                PARTITION BY cliente, fecha 
                ORDER BY creado_en DESC
            ) as rn
            
        FROM entregas_base
    )
    
    SELECT 
        tracking,
        DATE(fecha) as fecha,
        tipo,
        cliente,
        valor,
        estado_conciliacion,
        referencia_pago,
        correo_conductor,
        entidad_pago,
        fecha_conciliacion
        
    FROM entregas_agrupadas
    ORDER BY 
        cliente ASC,
        fecha DESC,
        valor DESC
    """
    
    try:
        job_config = bigquery.QueryJobConfig(query_parameters=parametros)
        resultados = client.query(query, job_config=job_config).result()
        
        entregas = []
        for row in resultados:
            entregas.append({
                "tracking": row["tracking"] or "N/A",
                "fecha": row["fecha"].isoformat() if row["fecha"] else datetime.now().date().isoformat(),
                "tipo": row["tipo"] or "Sin Tipo",
                "cliente": row["cliente"] or "Sin Cliente",
                "valor": float(row["valor"]) if row["valor"] else 0.0,
                "estado_conciliacion": row["estado_conciliacion"] or "Pendiente",
                "referencia_pago": row["referencia_pago"] or "",
                "correo_conductor": row["correo_conductor"] or "",
                "entidad_pago": row["entidad_pago"] or "",
                "fecha_conciliacion": row["fecha_conciliacion"].isoformat() if row["fecha_conciliacion"] else None
            })
        
        # Estadísticas adicionales
        total_entregas = len(entregas)
        valor_total = sum(e["valor"] for e in entregas)
        
        # Agrupación por cliente
        clientes_stats = {}
        for entrega in entregas:
            cliente = entrega["cliente"]
            if cliente not in clientes_stats:
                clientes_stats[cliente] = {"cantidad": 0, "valor": 0}
            clientes_stats[cliente]["cantidad"] += 1
            clientes_stats[cliente]["valor"] += entrega["valor"]
        
        return {
            "entregas": entregas,
            "estadisticas": {
                "total_entregas": total_entregas,
                "valor_total": valor_total,
                "clientes": clientes_stats
            },
            "filtros_aplicados": {
                "cliente": cliente,
                "desde": desde,
                "hasta": hasta,
                "solo_conciliadas": solo_conciliadas
            },
            "fecha_consulta": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error al consultar entregas consolidadas: {str(e)}"
        )

@router.get("/resumen-liquidaciones")
def obtener_resumen_liquidaciones():
    """
    Obtiene un resumen ejecutivo de las liquidaciones por cliente
    """
    client = bigquery.Client()
    
    query = """
    WITH resumen_por_cliente AS (
        SELECT 
            COALESCE(cliente, 'Sin Cliente') as cliente,
            COUNT(*) as total_entregas,
            SUM(valor) as valor_total,
            COUNT(CASE WHEN conciliado = TRUE THEN 1 END) as entregas_conciliadas,
            COUNT(CASE WHEN estado = 'aprobado' THEN 1 END) as entregas_aprobadas,
            COUNT(CASE WHEN estado = 'pagado' THEN 1 END) as entregas_pagadas,
            MIN(fecha_pago) as fecha_primera_entrega,
            MAX(fecha_pago) as fecha_ultima_entrega,
            COUNT(DISTINCT correo) as conductores_involucrados
            
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
        GROUP BY cliente
    )
    
    SELECT 
        cliente,
        total_entregas,
        valor_total,
        entregas_conciliadas,
        entregas_aprobadas,
        entregas_pagadas,
        fecha_primera_entrega,
        fecha_ultima_entrega,
        conductores_involucrados,
        
        -- Cálculos adicionales
        ROUND((entregas_conciliadas * 100.0) / total_entregas, 2) as porcentaje_conciliadas,
        ROUND(valor_total / total_entregas, 2) as valor_promedio_entrega
        
    FROM resumen_por_cliente
    ORDER BY valor_total DESC
    """
    
    try:
        resultados = client.query(query).result()
        return [dict(row) for row in resultados]
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al obtener resumen de liquidaciones: {str(e)}"
        )

@router.post("/marcar-como-liquidado")
def marcar_entregas_como_liquidadas(data: dict):
    """
    Marca un conjunto de entregas como liquidadas después del pago al cliente
    """
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
      AND cliente = @cliente
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
        
        # Log en auditoría
        audit_query = """
        INSERT INTO `datos-clientes-441216.Conciliaciones.auditoria_conciliacion` (
            id, fecha_accion, tipo_accion, usuario, observaciones, detalles_adicionales
        ) VALUES (
            @audit_id,
            CURRENT_TIMESTAMP(),
            'liquidacion_cliente',
            @usuario,
            @observaciones,
            PARSE_JSON(@detalles)
        )
        """
        
        audit_id = f"LIQUIDACION_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{cliente}"
        detalles = {
            "cliente": cliente,
            "referencias_procesadas": referencias_pago,
            "cantidad_entregas": len(referencias_pago)
        }
        
        audit_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("audit_id", "STRING", audit_id),
                bigquery.ScalarQueryParameter("usuario", "STRING", usuario),
                bigquery.ScalarQueryParameter("observaciones", "STRING", observaciones),
                bigquery.ScalarQueryParameter("detalles", "STRING", str(detalles))
            ]
        )
        
        client.query(audit_query, job_config=audit_config).result()
        
        return {
            "mensaje": f"Se marcaron {len(referencias_pago)} entregas como liquidadas para {cliente}",
            "referencias_procesadas": referencias_pago,
            "audit_id": audit_id
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al marcar entregas como liquidadas: {str(e)}"
        )

# 🔥 AGREGAR AL FINAL DE entregas.py (antes del último })

@router.get("/entregas-listas-liquidar")
def obtener_entregas_listas_liquidar(
    cliente: Optional[str] = Query(None),
    desde: Optional[str] = Query(None),
    hasta: Optional[str] = Query(None)
):
    """
    🎯 NUEVA FUNCIÓN: Obtiene entregas automáticamente listas para liquidar
    ✅ BENEFICIO: No más búsqueda manual - el sistema sabe qué liquidar
    """
    
    client = bigquery.Client()
    
    # Construir filtros dinámicamente
    condiciones = ["pc.conciliado = TRUE"]  # 🔥 FILTRO CLAVE
    parametros = []
    
    if cliente:
        condiciones.append("pc.cliente = @cliente")
        parametros.append(bigquery.ScalarQueryParameter("cliente", "STRING", cliente))
    
    if desde:
        condiciones.append("pc.fecha_pago >= @fecha_desde")
        parametros.append(bigquery.ScalarQueryParameter("fecha_desde", "DATE", desde))
    
    if hasta:
        condiciones.append("pc.fecha_pago <= @fecha_hasta")
        parametros.append(bigquery.ScalarQueryParameter("fecha_hasta", "DATE", hasta))
    
    where_clause = "WHERE " + " AND ".join(condiciones)
    
    # 🔥 CONSULTA INTELIGENTE: Solo entregas verdaderamente listas
    query = f"""
    SELECT 
        pc.tracking,
        pc.referencia_pago,
        COALESCE(pc.cliente, 'Sin Cliente') as cliente,
        pc.valor,
        pc.fecha_pago,
        pc.correo as conductor,
        pc.entidad,
        pc.tipo,
        pc.fecha_conciliacion,
        pc.estado_conciliacion
        
    FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
    {where_clause}
    AND pc.estado = 'aprobado'  -- Solo pagos aprobados
    AND pc.referencia_pago IS NOT NULL
    ORDER BY pc.cliente, pc.fecha_conciliacion DESC
    """
    
    try:
        job_config = bigquery.QueryJobConfig(query_parameters=parametros)
        resultados = client.query(query, job_config=job_config).result()
        
        entregas = []
        total_valor = 0
        clientes_agrupados = {}
        
        for row in resultados:
            entrega = {
                "tracking": row["tracking"],
                "referencia_pago": row["referencia_pago"],
                "cliente": row["cliente"],
                "valor": float(row["valor"]),
                "fecha_pago": row["fecha_pago"].isoformat(),
                "conductor": row["conductor"],
                "entidad": row["entidad"],
                "tipo": row["tipo"],
                "fecha_conciliacion": row["fecha_conciliacion"].isoformat() if row["fecha_conciliacion"] else None,
                "estado_conciliacion": row["estado_conciliacion"]
            }
            entregas.append(entrega)
            total_valor += entrega["valor"]
            
            # Agrupar por cliente
            cliente = entrega["cliente"]
            if cliente not in clientes_agrupados:
                clientes_agrupados[cliente] = {
                    "cantidad_entregas": 0,
                    "valor_total": 0,
                    "entregas": []
                }
            clientes_agrupados[cliente]["cantidad_entregas"] += 1
            clientes_agrupados[cliente]["valor_total"] += entrega["valor"]
            clientes_agrupados[cliente]["entregas"].append(entrega)
        
        return {
            "mensaje": f"✅ {len(entregas)} entregas automáticamente listas para liquidar",
            "total_entregas": len(entregas),
            "valor_total": total_valor,
            "entregas": entregas,
            "clientes_agrupados": clientes_agrupados,
            "filtros_aplicados": {
                "cliente": cliente,
                "desde": desde,
                "hasta": hasta
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo entregas listas: {str(e)}"
        )

@router.get("/estado-flujo-resumen")
def obtener_estado_flujo_resumen():
    """
    🎯 RESUMEN EJECUTIVO: Estado rápido del flujo en tiempo real
    ✅ BENEFICIO: Visibilidad total sin búsquedas manuales
    """
    
    client = bigquery.Client()
    
    query = """
    WITH estado_clasificado AS (
        SELECT 
            CASE 
                WHEN estado = 'rechazado' THEN 'RECHAZADO'
                WHEN estado = 'pagado' THEN 'PENDIENTE_APROBACION'
                WHEN estado = 'aprobado' AND (conciliado IS NULL OR conciliado = FALSE) THEN 'PENDIENTE_CONCILIACION'
                WHEN estado = 'aprobado' AND conciliado = TRUE THEN 'LISTO_LIQUIDAR'
                WHEN estado = 'liquidado' THEN 'LIQUIDADO'
                ELSE 'OTRO'
            END as estado_flujo,
            
            COUNT(*) as cantidad,
            SUM(valor) as valor_total,
            COUNT(DISTINCT correo) as conductores_involucrados,
            
            -- Alertas automáticas
            COUNT(CASE 
                WHEN estado = 'pagado' AND DATE_DIFF(CURRENT_DATE(), fecha_pago, DAY) > 2 
                THEN 1 
            END) as alertas_aprobacion_lenta,
            
            COUNT(CASE 
                WHEN estado = 'aprobado' AND (conciliado IS NULL OR conciliado = FALSE) 
                     AND DATE_DIFF(CURRENT_DATE(), fecha_pago, DAY) > 7 
                THEN 1 
            END) as alertas_conciliacion_lenta
            
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        AND referencia_pago IS NOT NULL
        GROUP BY estado_flujo
    )
    
    SELECT 
        estado_flujo,
        cantidad,
        valor_total,
        conductores_involucrados,
        alertas_aprobacion_lenta,
        alertas_conciliacion_lenta
    FROM estado_clasificado
    ORDER BY cantidad DESC
    """
    
    try:
        resultados = client.query(query).result()
        
        estados = []
        total_general = 0
        valor_total_sistema = 0
        total_alertas = 0
        
        for row in resultados:
            estado = {
                "estado_flujo": row["estado_flujo"],
                "cantidad": int(row["cantidad"]),
                "valor_total": float(row["valor_total"]),
                "conductores_involucrados": int(row["conductores_involucrados"]),
                "alertas_aprobacion_lenta": int(row["alertas_aprobacion_lenta"]),
                "alertas_conciliacion_lenta": int(row["alertas_conciliacion_lenta"])
            }
            estados.append(estado)
            total_general += estado["cantidad"]
            valor_total_sistema += estado["valor_total"]
            total_alertas += estado["alertas_aprobacion_lenta"] + estado["alertas_conciliacion_lenta"]
        
        # Calcular métricas de eficiencia
        listo_liquidar = next((e for e in estados if e["estado_flujo"] == "LISTO_LIQUIDAR"), {"cantidad": 0, "valor_total": 0})
        pendiente_aprobacion = next((e for e in estados if e["estado_flujo"] == "PENDIENTE_APROBACION"), {"cantidad": 0})
        
        return {
            "estados_flujo": estados,
            "resumen": {
                "total_pagos": total_general,
                "valor_total_sistema": valor_total_sistema,
                "total_alertas": total_alertas
            },
            "eficiencia": {
                "porcentaje_listo_liquidar": (listo_liquidar["cantidad"] / max(total_general, 1)) * 100,
                "valor_listo_liquidar": listo_liquidar["valor_total"],
                "cuellos_botella": pendiente_aprobacion["cantidad"]
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo estado del flujo: {str(e)}"
        )