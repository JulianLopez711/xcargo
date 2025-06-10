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
async def get_dashboard_master(current_user = Depends(verificar_master)):
    """
    Dashboard Master con vista global de TODOS los carriers y supervisores
    Datos en tiempo real desde BigQuery
    """
    try:
        print(f"🎯 Iniciando dashboard master para usuario: {current_user.get('correo')}")
        client = bigquery.Client()
        
        # 1. ESTADÍSTICAS GLOBALES - Todos los carriers
        print("📊 Consultando estadísticas globales...")
        query_stats_globales = """
        WITH guias_globales AS (
            SELECT 
                COUNT(*) as total_guias,
                COUNT(DISTINCT Employee_id) as total_conductores_activos,
                COUNT(DISTINCT carrier_id) as total_carriers_activos,
                COUNT(CASE 
                    WHEN Status_Big NOT LIKE '%360%' AND Status_Big NOT LIKE '%Entregado%' 
                    AND Status_Big NOT LIKE '%PAGADO%' AND Status_Big NOT LIKE '%liberado%'
                    THEN 1 
                END) as guias_pendientes,
                COUNT(CASE 
                    WHEN Status_Big LIKE '%360%' OR Status_Big LIKE '%Entregado%' 
                    THEN 1 
                END) as guias_entregadas,
                COUNT(CASE 
                    WHEN Status_Big LIKE '%PAGADO%' OR Status_Big LIKE '%liberado%'
                    THEN 1 
                END) as guias_pagadas,
                SUM(CASE 
                    WHEN Status_Big NOT LIKE '%360%' AND Status_Big NOT LIKE '%Entregado%' 
                    AND Status_Big NOT LIKE '%PAGADO%' AND Status_Big NOT LIKE '%liberado%'
                    THEN Valor ELSE 0 
                END) as valor_pendiente,
                SUM(CASE 
                    WHEN Status_Big LIKE '%360%' OR Status_Big LIKE '%Entregado%' 
                    THEN Valor ELSE 0 
                END) as valor_entregado,
                SUM(CASE 
                    WHEN Status_Big LIKE '%PAGADO%' OR Status_Big LIKE '%liberado%'
                    THEN Valor ELSE 0 
                END) as valor_pagado,
                AVG(Valor) as promedio_valor_guia
            FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1`
            WHERE Valor > 0
                AND Status_Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
        ),
        conductores_totales AS (
            SELECT COUNT(DISTINCT Employee_id) as total_conductores_registrados
            FROM `datos-clientes-441216.Conciliaciones.usuarios_BIG`
        ),
        carriers_totales AS (
            SELECT COUNT(DISTINCT Carrier_id) as total_carriers_registrados
            FROM `datos-clientes-441216.Conciliaciones.usuarios_BIG`
        )
        SELECT 
            gg.*,
            ct.total_conductores_registrados,
            car.total_carriers_registrados
        FROM guias_globales gg, conductores_totales ct, carriers_totales car
        """
        
        result_stats = client.query(query_stats_globales).result()
        stats_globales = list(result_stats)[0]
        print(f"✅ Estadísticas globales obtenidas: {stats_globales.total_guias} guías")
        
        # 2. RANKING DE CARRIERS - Vista comparativa
        print("🏆 Consultando ranking de carriers...")
        query_ranking_carriers = """
        SELECT 
            cp.carrier_id,
            cp.Carrier as carrier_nombre,
            COUNT(DISTINCT cp.Employee_id) as total_conductores,
            COUNT(*) as total_guias,
            COUNT(CASE 
                WHEN cp.Status_Big NOT LIKE '%360%' AND cp.Status_Big NOT LIKE '%Entregado%' 
                AND cp.Status_Big NOT LIKE '%PAGADO%' AND cp.Status_Big NOT LIKE '%liberado%'
                THEN 1 
            END) as guias_pendientes,
            COUNT(CASE 
                WHEN cp.Status_Big LIKE '%360%' OR cp.Status_Big LIKE '%Entregado%' 
                THEN 1 
            END) as guias_entregadas,
            SUM(CASE 
                WHEN cp.Status_Big NOT LIKE '%360%' AND cp.Status_Big NOT LIKE '%Entregado%' 
                AND cp.Status_Big NOT LIKE '%PAGADO%' AND cp.Status_Big NOT LIKE '%liberado%'
                THEN cp.Valor ELSE 0 
            END) as valor_pendiente,
            SUM(CASE 
                WHEN cp.Status_Big LIKE '%360%' OR cp.Status_Big LIKE '%Entregado%' 
                THEN cp.Valor ELSE 0 
            END) as valor_entregado,
            AVG(cp.Valor) as promedio_valor_guia,
            STRING_AGG(DISTINCT cp.Ciudad, ', ' LIMIT 5) as ciudades_principales,
            MAX(cp.Status_Date) as ultima_actividad
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` cp
        WHERE cp.Valor > 0
            AND cp.Status_Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
        GROUP BY cp.carrier_id, cp.Carrier
        HAVING COUNT(*) > 0
        ORDER BY 
            (COUNT(CASE WHEN cp.Status_Big LIKE '%360%' OR cp.Status_Big LIKE '%Entregado%' THEN 1 END) / COUNT(*)) DESC,
            COUNT(*) DESC
        LIMIT 15
        """
        
        result_carriers = client.query(query_ranking_carriers).result()
        ranking_carriers = []
        
        for row in result_carriers:
            eficiencia = 0
            if row.total_guias and int(row.total_guias) > 0:
                eficiencia = round((int(row.guias_entregadas or 0) / int(row.total_guias)) * 100, 1)
            
            ranking_carriers.append({
                "carrier_id": row.carrier_id,
                "carrier_nombre": row.carrier_nombre or f"Carrier {row.carrier_id}",
                "total_conductores": int(row.total_conductores) if row.total_conductores else 0,
                "total_guias": int(row.total_guias) if row.total_guias else 0,
                "guias_pendientes": int(row.guias_pendientes) if row.guias_pendientes else 0,
                "guias_entregadas": int(row.guias_entregadas) if row.guias_entregadas else 0,
                "valor_pendiente": int(row.valor_pendiente) if row.valor_pendiente else 0,
                "valor_entregado": int(row.valor_entregado) if row.valor_entregado else 0,
                "promedio_valor_guia": int(row.promedio_valor_guia) if row.promedio_valor_guia else 0,
                "ciudades_principales": row.ciudades_principales or "Sin datos",
                "ultima_actividad": str(row.ultima_actividad) if row.ultima_actividad else "Sin actividad",
                "eficiencia": eficiencia
            })
        
        print(f"✅ Ranking de carriers obtenido: {len(ranking_carriers)} carriers")
        
        # 3. TOP SUPERVISORES - Basado en usuarios administrativos
        print("👥 Consultando supervisores...")
        query_supervisores = """
        SELECT 
            u.nombre as supervisor_nombre,
            u.correo as supervisor_email,
            u.empresa_carrier,
            'supervisor' as rol_usuario
        FROM `datos-clientes-441216.Conciliaciones.usuarios` u
        JOIN `datos-clientes-441216.Conciliaciones.credenciales` c 
            ON u.correo = c.correo
        WHERE c.rol IN ('supervisor', 'admin')
            AND u.empresa_carrier IS NOT NULL
            AND u.empresa_carrier != ''
        ORDER BY u.nombre
        LIMIT 10
        """
        
        result_supervisores = client.query(query_supervisores).result()
        top_supervisores = []
        
        for row in result_supervisores:
            carriers_asignados = 1 if row.empresa_carrier else 0
            top_supervisores.append({
                "nombre": row.supervisor_nombre or "Sin nombre",
                "email": row.supervisor_email or "",
                "empresa_carrier": row.empresa_carrier or "",
                "carriers_asignados": carriers_asignados,
                "rol": row.rol_usuario or "supervisor"
            })
        
        print(f"✅ Supervisores obtenidos: {len(top_supervisores)} supervisores")
        
        # 4. ANÁLISIS POR CIUDADES
        print("🏙️ Consultando análisis por ciudades...")
        query_ciudades = """
        SELECT 
            Ciudad,
            COUNT(*) as total_guias,
            COUNT(DISTINCT Employee_id) as conductores_activos,
            COUNT(DISTINCT carrier_id) as carriers_activos,
            SUM(CASE 
                WHEN Status_Big NOT LIKE '%360%' AND Status_Big NOT LIKE '%Entregado%' 
                AND Status_Big NOT LIKE '%PAGADO%' AND Status_Big NOT LIKE '%liberado%'
                THEN Valor ELSE 0 
            END) as valor_pendiente,
            COUNT(CASE 
                WHEN Status_Big NOT LIKE '%360%' AND Status_Big NOT LIKE '%Entregado%' 
                AND Status_Big NOT LIKE '%PAGADO%' AND Status_Big NOT LIKE '%liberado%'
                THEN 1 
            END) as guias_pendientes,
            ROUND((COUNT(CASE WHEN Status_Big LIKE '%360%' OR Status_Big LIKE '%Entregado%' THEN 1 END) / COUNT(*)) * 100, 1) as eficiencia
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1`
        WHERE Valor > 0
            AND Ciudad IS NOT NULL 
            AND Ciudad != ''
            AND Status_Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        GROUP BY Ciudad
        HAVING COUNT(*) >= 10
        ORDER BY total_guias DESC
        LIMIT 10
        """
        
        result_ciudades = client.query(query_ciudades).result()
        analisis_ciudades = []
        
        for row in result_ciudades:
            analisis_ciudades.append({
                "ciudad": row.Ciudad,
                "total_guias": int(row.total_guias) if row.total_guias else 0,
                "conductores_activos": int(row.conductores_activos) if row.conductores_activos else 0,
                "carriers_activos": int(row.carriers_activos) if row.carriers_activos else 0,
                "valor_pendiente": int(row.valor_pendiente) if row.valor_pendiente else 0,
                "guias_pendientes": int(row.guias_pendientes) if row.guias_pendientes else 0,
                "eficiencia": float(row.eficiencia) if row.eficiencia else 0.0
            })
        
        print(f"✅ Análisis de ciudades obtenido: {len(analisis_ciudades)} ciudades")
        
        # 5. TENDENCIAS MENSUALES - Últimos 6 meses
        print("📈 Consultando tendencias mensuales...")
        query_tendencias = """
        SELECT 
            FORMAT_DATE('%Y-%m', Status_Date) as mes,
            COUNT(*) as total_guias,
            COUNT(DISTINCT Employee_id) as conductores_activos,
            COUNT(DISTINCT carrier_id) as carriers_activos,
            SUM(Valor) as valor_total,
            COUNT(CASE 
                WHEN Status_Big LIKE '%360%' OR Status_Big LIKE '%Entregado%' 
                THEN 1 
            END) as guias_entregadas,
            ROUND((COUNT(CASE WHEN Status_Big LIKE '%360%' OR Status_Big LIKE '%Entregado%' THEN 1 END) / COUNT(*)) * 100, 1) as eficiencia_mensual
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1`
        WHERE Valor > 0
            AND Status_Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)
        GROUP BY FORMAT_DATE('%Y-%m', Status_Date)
        ORDER BY mes DESC
        LIMIT 6
        """
        
        result_tendencias = client.query(query_tendencias).result()
        tendencias_mensuales = []
        
        for row in result_tendencias:
            tendencias_mensuales.append({
                "mes": row.mes,
                "total_guias": int(row.total_guias) if row.total_guias else 0,
                "conductores_activos": int(row.conductores_activos) if row.conductores_activos else 0,
                "carriers_activos": int(row.carriers_activos) if row.carriers_activos else 0,
                "valor_total": int(row.valor_total) if row.valor_total else 0,
                "guias_entregadas": int(row.guias_entregadas) if row.guias_entregadas else 0,
                "eficiencia_mensual": float(row.eficiencia_mensual) if row.eficiencia_mensual else 0.0
            })
        
        # Invertir para mostrar cronológicamente
        tendencias_mensuales.reverse()
        print(f"✅ Tendencias mensuales obtenidas: {len(tendencias_mensuales)} meses")
        
        # 6. ALERTAS CRÍTICAS
        print("🚨 Generando alertas...")
        alertas = []
        
        # Alerta por alto monto pendiente
        if stats_globales.valor_pendiente and int(stats_globales.valor_pendiente) > 50000000:  # Más de 50M
            alertas.append({
                "tipo": "critical",
                "mensaje": f"Monto pendiente crítico: ${int(stats_globales.valor_pendiente):,}",
                "prioridad": "alta"
            })
        
        # Alerta por carriers con baja eficiencia
        carriers_baja_eficiencia = [c for c in ranking_carriers if c["eficiencia"] < 70]
        if carriers_baja_eficiencia:
            alertas.append({
                "tipo": "warning",
                "mensaje": f"{len(carriers_baja_eficiencia)} carriers con eficiencia < 70%",
                "prioridad": "media"
            })
        
        # Alerta por conductores inactivos
        conductores_inactivos = int(stats_globales.total_conductores_registrados or 0) - int(stats_globales.total_conductores_activos or 0)
        if conductores_inactivos > 50:
            alertas.append({
                "tipo": "info",
                "mensaje": f"{conductores_inactivos} conductores sin actividad reciente",
                "prioridad": "baja"
            })
        
        print(f"✅ Alertas generadas: {len(alertas)} alertas")
        
        # RESPUESTA FINAL
        dashboard_response = {
            "stats_globales": {
                "total_guias": int(stats_globales.total_guias) if stats_globales.total_guias else 0,
                "total_conductores_registrados": int(stats_globales.total_conductores_registrados) if stats_globales.total_conductores_registrados else 0,
                "total_conductores_activos": int(stats_globales.total_conductores_activos) if stats_globales.total_conductores_activos else 0,
                "total_carriers_registrados": int(stats_globales.total_carriers_registrados) if stats_globales.total_carriers_registrados else 0,
                "total_carriers_activos": int(stats_globales.total_carriers_activos) if stats_globales.total_carriers_activos else 0,
                "guias_pendientes": int(stats_globales.guias_pendientes) if stats_globales.guias_pendientes else 0,
                "guias_entregadas": int(stats_globales.guias_entregadas) if stats_globales.guias_entregadas else 0,
                "guias_pagadas": int(stats_globales.guias_pagadas) if stats_globales.guias_pagadas else 0,
                "valor_pendiente": int(stats_globales.valor_pendiente) if stats_globales.valor_pendiente else 0,
                "valor_entregado": int(stats_globales.valor_entregado) if stats_globales.valor_entregado else 0,
                "valor_pagado": int(stats_globales.valor_pagado) if stats_globales.valor_pagado else 0,
                "promedio_valor_guia": int(stats_globales.promedio_valor_guia) if stats_globales.promedio_valor_guia else 0,
                "eficiencia_global": round((int(stats_globales.guias_entregadas or 0) / max(int(stats_globales.total_guias or 1), 1)) * 100, 1)
            },
            "ranking_carriers": ranking_carriers,
            "top_supervisores": top_supervisores,
            "analisis_ciudades": analisis_ciudades,
            "tendencias_mensuales": tendencias_mensuales,
            "alertas": alertas,
            "periodo_analisis": "Últimos 90 días",
            "fecha_actualizacion": datetime.now().isoformat(),
            "usuario_master": {
                "nombre": current_user.get("nombre", ""),
                "correo": current_user.get("correo", ""),
                "rol": current_user.get("rol", ""),
                "acceso_completo": True
            }
        }
        
        print(f"🎉 Dashboard master generado exitosamente para {current_user.get('correo')}")
        return dashboard_response
        
    except Exception as e:
        print(f"❌ Error en dashboard master: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error interno del servidor: {str(e)}")

@router.get("/carriers/comparativa")
async def get_comparativa_carriers(
    periodo: str = Query("30", description="Días del período (30, 60, 90)"),
    current_user = Depends(verificar_master)
):
    """
    Comparativa detallada entre todos los carriers
    """
    try:
        client = bigquery.Client()
        
        query = f"""
        SELECT 
            cp.carrier_id,
            cp.Carrier as carrier_nombre,
            COUNT(*) as total_guias,
            COUNT(DISTINCT cp.Employee_id) as total_conductores,
            COUNT(CASE 
                WHEN cp.Status_Big NOT LIKE '%360%' AND cp.Status_Big NOT LIKE '%Entregado%' 
                THEN 1 
            END) as guias_pendientes,
            COUNT(CASE 
                WHEN cp.Status_Big LIKE '%360%' OR cp.Status_Big LIKE '%Entregado%' 
                THEN 1 
            END) as guias_entregadas,
            SUM(cp.Valor) as valor_total,
            AVG(cp.Valor) as valor_promedio,
            COUNT(DISTINCT cp.Ciudad) as ciudades_cobertura,
            MIN(cp.Status_Date) as primera_actividad,
            MAX(cp.Status_Date) as ultima_actividad
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` cp
        WHERE cp.Valor > 0
            AND cp.Status_Date >= DATE_SUB(CURRENT_DATE(), INTERVAL {periodo} DAY)
        GROUP BY cp.carrier_id, cp.Carrier
        ORDER BY COUNT(*) DESC
        """
        
        result = client.query(query).result()
        comparativa = []
        
        for row in result:
            eficiencia = 0
            if row.total_guias and int(row.total_guias) > 0:
                eficiencia = round((int(row.guias_entregadas or 0) / int(row.total_guias)) * 100, 1)
            
            comparativa.append({
                "carrier_id": row.carrier_id,
                "carrier_nombre": row.carrier_nombre or f"Carrier {row.carrier_id}",
                "total_guias": int(row.total_guias) if row.total_guias else 0,
                "total_conductores": int(row.total_conductores) if row.total_conductores else 0,
                "guias_pendientes": int(row.guias_pendientes) if row.guias_pendientes else 0,
                "guias_entregadas": int(row.guias_entregadas) if row.guias_entregadas else 0,
                "valor_total": int(row.valor_total) if row.valor_total else 0,
                "valor_promedio": int(row.valor_promedio) if row.valor_promedio else 0,
                "ciudades_cobertura": int(row.ciudades_cobertura) if row.ciudades_cobertura else 0,
                "primera_actividad": str(row.primera_actividad) if row.primera_actividad else "",
                "ultima_actividad": str(row.ultima_actividad) if row.ultima_actividad else "",
                "eficiencia": eficiencia
            })
        
        return {
            "comparativa_carriers": comparativa,
            "periodo_dias": int(periodo),
            "total_carriers": len(comparativa),
            "fecha_consulta": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"❌ Error en comparativa carriers: {e}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@router.get("/export/data")
async def export_master_data(
    formato: str = Query("json", description="Formato de exportación (json, csv)"),
    current_user = Depends(verificar_master)
):
    """
    Exportar datos completos del dashboard master
    """
    try:
        # Obtener datos del dashboard
        dashboard_data = await get_dashboard_master(current_user)
        
        if formato.lower() == "json":
            return {
                "export_data": dashboard_data,
                "metadata": {
                    "exported_by": current_user.get("correo", ""),
                    "export_date": datetime.now().isoformat(),
                    "format": "json",
                    "total_records": len(dashboard_data.get("ranking_carriers", []))
                }
            }
        else:
            # Para CSV u otros formatos, retornar estructura simplificada
            return {
                "message": "Exportación en formato CSV disponible próximamente",
                "available_formats": ["json"],
                "data_summary": {
                    "total_carriers": len(dashboard_data.get("ranking_carriers", [])),
                    "total_supervisores": len(dashboard_data.get("top_supervisores", [])),
                    "export_timestamp": datetime.now().isoformat()
                }
            }
        
    except Exception as e:
        print(f"❌ Error en exportación: {e}")
        raise HTTPException(status_code=500, detail=f"Error en exportación: {str(e)}")