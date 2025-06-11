from fastapi import APIRouter, HTTPException, Depends, Query
from google.cloud import bigquery
from app.dependencies import get_current_user
from typing import List, Dict, Any, Optional
from datetime import datetime

router = APIRouter(prefix="/supervisor", tags=["Supervisor"])

PROJECT_ID = "datos-clientes-441216"
DATASET = "Conciliaciones"

bq_client = bigquery.Client()

def verificar_supervisor(current_user: dict = Depends(get_current_user)):
    if current_user["rol"] not in ["admin", "supervisor", "master"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    return current_user

def obtener_carrier_id_supervisor(correo: str, client: bigquery.Client) -> List[int]:
    """
    Obtiene los IDs de carriers que puede supervisar un usuario
    FUNCIÓN FALTANTE - FIX CRÍTICO
    """
    try:
        # Primero buscar en usuarios administrativos
        query_admin = """
        SELECT DISTINCT
            CAST(SPLIT(empresa_carrier, ',')[OFFSET(0)] AS INT64) as carrier_id
        FROM `datos-clientes-441216.Conciliaciones.usuarios`
        WHERE correo = @correo
        AND empresa_carrier IS NOT NULL
        AND empresa_carrier != ''
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo", "STRING", correo)
            ]
        )
        
        result = client.query(query_admin, job_config=job_config).result()
        rows = list(result)
        
        carrier_ids = []
        if rows:
            carrier_ids = [row.carrier_id for row in rows if row.carrier_id]
        
        # Si no está en usuarios, buscar en usuarios_BIG (conductores que pueden ser supervisores)
        if not carrier_ids:
            query_big = """
            SELECT DISTINCT Carrier_id
            FROM `datos-clientes-441216.Conciliaciones.usuarios_BIG`
            WHERE LOWER(Employee_Mail) = LOWER(@correo)
            AND Carrier_id IS NOT NULL
            """
            
            result_big = client.query(query_big, job_config=job_config).result()
            rows_big = list(result_big)
            
            if rows_big:
                carrier_ids = [row.Carrier_id for row in rows_big if row.Carrier_id]
        
        print(f"✅ Supervisor {correo} tiene acceso a carriers: {carrier_ids}")
        return carrier_ids
        
    except Exception as e:
        print(f"❌ Error obteniendo carrier_ids para supervisor {correo}: {e}")
        return []


def obtener_carrier_info_supervisor(correo: str, client: bigquery.Client) -> List[Dict[str, Any]]:
    """
    Obtiene información completa de los carriers que puede supervisar un usuario
    """
    try:
        # Buscar en usuarios (administrativos)
        query_admin = """
        SELECT DISTINCT
            CAST(SPLIT(empresa_carrier, ',')[OFFSET(0)] AS INT64) as carrier_id
        FROM `datos-clientes-441216.Conciliaciones.usuarios`
        WHERE correo = @correo
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo", "STRING", correo)
            ]
        )
        
        result = client.query(query_admin, job_config=job_config).result()
        rows = list(result)
        
        carrier_ids = []
        if rows:
            carrier_ids = [row.carrier_id for row in rows if row.carrier_id]
        
        # Si no está en usuarios, buscar en usuarios_BIG
        if not carrier_ids:
            query_big = """
            SELECT DISTINCT Carrier_id
            FROM `datos-clientes-441216.Conciliaciones.usuarios_BIG`
            WHERE LOWER(Employee_Mail) = LOWER(@correo)
            """
            
            result_big = client.query(query_big, job_config=job_config).result()
            rows_big = list(result_big)
            
            if rows_big:
                carrier_ids = [row.Carrier_id for row in rows_big if row.Carrier_id]
        
        if not carrier_ids:
            print(f"⚠️ No se encontraron carriers para supervisor {correo}")
            return []
        
        # Obtener nombres de los carriers
        carrier_ids_str = ','.join(map(str, carrier_ids))
        query_nombres = f"""
        SELECT DISTINCT 
            carrier_id,
            Carrier as nombre
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1`
        WHERE carrier_id IN ({carrier_ids_str})
        """
        
        result_nombres = client.query(query_nombres).result()
        carriers_info = []
        
        for row in result_nombres:
            carriers_info.append({
                "id": row.carrier_id,
                "nombre": row.nombre or f"Carrier {row.carrier_id}"
            })
        
        print(f"✅ Supervisor {correo} tiene acceso a carriers: {carriers_info}")
        return carriers_info
        
    except Exception as e:
        print(f"❌ Error obteniendo carrier_info para supervisor: {e}")
        return []

@router.get("/dashboard")
async def get_dashboard_supervisor(current_user = Depends(verificar_supervisor)):
    """
    Dashboard del supervisor con estadísticas REALES de su(s) carrier(s)
    """
    try:
        client = bigquery.Client()
        # CAMBIO: Obtener correo correctamente desde el JWT
        user_email = current_user.get("correo") or current_user.get("sub")
        carriers_info = obtener_carrier_info_supervisor(user_email, client)
        
        if not carriers_info:
            return {
                "error": "No se encontraron carriers asignados",
                "stats": {"total_conductores": 0, "pagos_pendientes": 0},
                "conductores_recientes": [],
                "carriers": []
            }
        
        carrier_ids = [c["id"] for c in carriers_info]
        carrier_ids_str = ','.join(map(str, carrier_ids))
        
        # Estadísticas REALES del carrier
        query_stats = f"""
        WITH guias_stats AS (
            SELECT 
                COUNT(DISTINCT Employee_id) as conductores_activos,
                COUNT(*) as total_guias,
                COUNT(CASE 
                    WHEN Status_Big NOT LIKE '%360%' AND Status_Big NOT LIKE '%Entregado%' 
                    AND Status_Big NOT LIKE '%PAGADO%'
                    THEN 1 
                END) as guias_pendientes,
                COUNT(CASE 
                    WHEN Status_Big LIKE '%360%' OR Status_Big LIKE '%Entregado%' 
                    THEN 1 
                END) as guias_entregadas,
                SUM(CASE 
                    WHEN Status_Big NOT LIKE '%360%' AND Status_Big NOT LIKE '%Entregado%' 
                    AND Status_Big NOT LIKE '%PAGADO%'
                    THEN Valor ELSE 0 
                END) as monto_pendiente,
                SUM(CASE 
                    WHEN Status_Big LIKE '%360%' OR Status_Big LIKE '%Entregado%' 
                    THEN Valor ELSE 0 
                END) as monto_entregado,
                AVG(Valor) as promedio_valor_guia
            FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1`
            WHERE carrier_id IN ({carrier_ids_str})
                AND Valor > 0
                AND Status_Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        ),
        conductores_stats AS (
            SELECT 
                COUNT(DISTINCT Employee_id) as total_conductores_registrados
            FROM `datos-clientes-441216.Conciliaciones.usuarios_BIG`
            WHERE Carrier_id IN ({carrier_ids_str})
        )
        SELECT 
            gs.*,
            cs.total_conductores_registrados
        FROM guias_stats gs, conductores_stats cs
        """
        
        result_stats = client.query(query_stats).result()
        stats_row = list(result_stats)[0]
        
        # Top 5 conductores con más actividad reciente
        query_conductores = f"""
        SELECT 
            ub.Employee_Name as nombre,
            ub.Employee_Mail as email,
            ub.Employee_Phone as telefono,
            COUNT(cp.tracking_number) as guias_totales,
            COUNT(CASE 
                WHEN cp.Status_Big NOT LIKE '%360%' AND cp.Status_Big NOT LIKE '%Entregado%' 
                AND cp.Status_Big NOT LIKE '%PAGADO%'
                THEN 1 
            END) as guias_pendientes,
            COUNT(CASE 
                WHEN cp.Status_Big LIKE '%360%' OR cp.Status_Big LIKE '%Entregado%' 
                THEN 1 
            END) as guias_entregadas,
            SUM(CASE 
                WHEN cp.Status_Big NOT LIKE '%360%' AND cp.Status_Big NOT LIKE '%Entregado%' 
                AND cp.Status_Big NOT LIKE '%PAGADO%'
                THEN cp.Valor ELSE 0 
            END) as valor_pendiente,
            MAX(cp.Status_Date) as ultima_actividad,
            STRING_AGG(DISTINCT cp.Ciudad, ', ' LIMIT 3) as ciudades_principales
        FROM `datos-clientes-441216.Conciliaciones.usuarios_BIG` ub
        LEFT JOIN `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` cp 
            ON ub.Employee_id = cp.Employee_id
            AND cp.Status_Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        WHERE ub.Carrier_id IN ({carrier_ids_str})
        GROUP BY ub.Employee_Name, ub.Employee_Mail, ub.Employee_Phone
        HAVING COUNT(cp.tracking_number) > 0
        ORDER BY guias_totales DESC, ultima_actividad DESC
        LIMIT 8
        """
        
        result_conductores = client.query(query_conductores).result()
        conductores = []
        
        for row in result_conductores:
            # Determinar estado del conductor
            estado = "inactivo"
            if row.guias_pendientes and int(row.guias_pendientes) > 0:
                estado = "con_pendientes"
            elif row.ultima_actividad and str(row.ultima_actividad) >= str(datetime.now().date()):
                estado = "activo_hoy"
            elif row.guias_totales and int(row.guias_totales) > 0:
                estado = "activo"
            
            conductores.append({
                "nombre": row.nombre or "Sin nombre",
                "email": row.email or "",
                "telefono": row.telefono or "",
                "guias_totales": int(row.guias_totales) if row.guias_totales else 0,
                "guias_pendientes": int(row.guias_pendientes) if row.guias_pendientes else 0,
                "guias_entregadas": int(row.guias_entregadas) if row.guias_entregadas else 0,
                "valor_pendiente": int(row.valor_pendiente) if row.valor_pendiente else 0,
                "ultima_actividad": str(row.ultima_actividad) if row.ultima_actividad else "Sin actividad",
                "ciudades_principales": row.ciudades_principales or "Sin datos",
                "estado": estado,
                "eficiencia": round((int(row.guias_entregadas or 0) / max(int(row.guias_totales or 1), 1)) * 100, 1)
            })
        
        # Alertas importantes
        alertas = []
        if stats_row.monto_pendiente and int(stats_row.monto_pendiente) > 5000000:  # Más de 5M pendientes
            alertas.append({
                "tipo": "warning",
                "mensaje": f"Alto monto pendiente: ${int(stats_row.monto_pendiente):,}",
                "prioridad": "alta"
            })
        
        conductores_sin_actividad = int(stats_row.total_conductores_registrados or 0) - int(stats_row.conductores_activos or 0)
        if conductores_sin_actividad > 0:
            alertas.append({
                "tipo": "info",
                "mensaje": f"{conductores_sin_actividad} conductores sin guías recientes",
                "prioridad": "media"
            })
        
        return {
            "carriers": carriers_info,  # Ahora incluye ID y nombre
            "stats": {
                "total_conductores_registrados": int(stats_row.total_conductores_registrados) if stats_row.total_conductores_registrados else 0,
                "conductores_activos": int(stats_row.conductores_activos) if stats_row.conductores_activos else 0,
                "total_guias": int(stats_row.total_guias) if stats_row.total_guias else 0,
                "guias_pendientes": int(stats_row.guias_pendientes) if stats_row.guias_pendientes else 0,
                "guias_entregadas": int(stats_row.guias_entregadas) if stats_row.guias_entregadas else 0,
                "monto_pendiente": int(stats_row.monto_pendiente) if stats_row.monto_pendiente else 0,
                "monto_entregado": int(stats_row.monto_entregado) if stats_row.monto_entregado else 0,
                "promedio_valor_guia": int(stats_row.promedio_valor_guia) if stats_row.promedio_valor_guia else 0,
                "eficiencia_general": round((int(stats_row.guias_entregadas or 0) / max(int(stats_row.total_guias or 1), 1)) * 100, 1)
            },
            "conductores_destacados": conductores,
            "alertas": alertas,
            "periodo_analisis": "Últimos 30 días",
            "fecha_actualizacion": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"Error en dashboard supervisor: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error interno del servidor: {str(e)}")

@router.get("/guias-pendientes")
async def get_guias_pendientes_supervisor(
    limit: int = Query(50, description="Límite de resultados"),
    offset: int = Query(0, description="Desplazamiento para paginación"),
    conductor: Optional[str] = Query(None, description="Filtrar por conductor específico"),
    current_user = Depends(verificar_supervisor)
):
    """
    Obtiene todas las guías pendientes de los carriers del supervisor
    """
    try:
        client = bigquery.Client()
        # CORRECCIÓN: Obtener correo correctamente desde el JWT
        user_email = current_user.get("correo") or current_user.get("sub")
        carrier_ids = obtener_carrier_id_supervisor(user_email, client)
        
        if not carrier_ids:
            return {"guias": [], "total": 0, "mensaje": "No hay carriers asignados"}
        
        carrier_ids_str = ','.join(map(str, carrier_ids))
        
        # Construir condiciones WHERE
        where_conditions = [
            f"cp.carrier_id IN ({carrier_ids_str})",
            "cp.Valor > 0",
            "cp.Status_Big NOT LIKE '%360%'",
            "cp.Status_Big NOT LIKE '%Entregado%'"
        ]
        
        query_params = []
        
        if conductor:
            where_conditions.append("LOWER(ub.Employee_Name) LIKE LOWER(@conductor)")
            query_params.append(bigquery.ScalarQueryParameter("conductor", "STRING", f"%{conductor}%"))
        
        where_clause = " AND ".join(where_conditions)
        
        # Consulta principal
        query = f"""
        SELECT 
            cp.tracking_number,
            cp.Cliente,
            cp.Ciudad,
            cp.Departamento,
            cp.Valor,
            cp.Status_Date,
            cp.Status_Big,
            cp.Carrier,
            ub.Employee_Name as conductor_nombre,
            ub.Employee_Mail as conductor_email,
            ub.Employee_Phone as conductor_telefono
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` cp
        LEFT JOIN `datos-clientes-441216.Conciliaciones.usuarios_BIG` ub 
            ON cp.Employee_id = ub.Employee_id
        WHERE {where_clause}
        ORDER BY cp.Status_Date DESC
        LIMIT @limit OFFSET @offset
        """
        
        # Agregar parámetros de paginación
        query_params.extend([
            bigquery.ScalarQueryParameter("limit", "INTEGER", limit),
            bigquery.ScalarQueryParameter("offset", "INTEGER", offset)
        ])
        
        job_config = bigquery.QueryJobConfig(query_parameters=query_params)
        result = client.query(query, job_config=job_config).result()
        
        guias = []
        for row in result:
            guias.append({
                "tracking_number": row.tracking_number,
                "cliente": row.Cliente or "Sin cliente",
                "ciudad": row.Ciudad or "",
                "departamento": row.Departamento or "",
                "valor": int(row.Valor) if row.Valor else 0,
                "fecha": str(row.Status_Date) if row.Status_Date else "",
                "estado": row.Status_Big or "Sin estado",
                "carrier": row.Carrier or "",
                "conductor": {
                    "nombre": row.conductor_nombre or "Sin asignar",
                    "email": row.conductor_email or "",
                    "telefono": row.conductor_telefono or ""
                }
            })
        
        # Contar total para paginación
        count_query = f"""
        SELECT COUNT(*) as total
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` cp
        LEFT JOIN `datos-clientes-441216.Conciliaciones.usuarios_BIG` ub 
            ON cp.Employee_id = ub.Employee_id
        WHERE {where_clause}
        """
        
        count_params = [p for p in query_params if p.name != "limit" and p.name != "offset"]
        count_job_config = bigquery.QueryJobConfig(query_parameters=count_params)
        count_result = client.query(count_query, job_config=count_job_config).result()
        total = list(count_result)[0].total
        
        return {
            "guias": guias,
            "total": int(total),
            "pagina_actual": (offset // limit) + 1,
            "total_paginas": (int(total) + limit - 1) // limit,
            "carriers_supervisados": carrier_ids
        }
        
    except Exception as e:
        print(f"Error obteniendo guías pendientes supervisor: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@router.get("/conductores")
async def get_conductores_supervisor(current_user = Depends(verificar_supervisor)):
    """
    Lista todos los conductores de los carriers del supervisor
    """
    try:
        client = bigquery.Client()
        # CORRECCIÓN: Obtener correo correctamente desde el JWT
        user_email = current_user.get("correo") or current_user.get("sub")
        carrier_ids = obtener_carrier_id_supervisor(user_email, client)
        
        if not carrier_ids:
            return []
        
        carrier_ids_str = ','.join(map(str, carrier_ids))
        
        query = f"""
        SELECT 
            ub.Employee_id,
            ub.Employee_Name as nombre,
            ub.Employee_Mail as correo,
            ub.Employee_Phone as telefono,
            ub.Carrier_Name as empresa,
            ub.Created as fecha_registro,
            COUNT(cp.tracking_number) as total_entregas,
            COUNT(CASE 
                WHEN cp.Status_Big NOT LIKE '%360%' AND cp.Status_Big NOT LIKE '%Entregado%' 
                THEN 1 
            END) as entregas_pendientes,
            SUM(CASE 
                WHEN cp.Status_Big NOT LIKE '%360%' AND cp.Status_Big NOT LIKE '%Entregado%' 
                THEN cp.Valor ELSE 0 
            END) as valor_pendiente,
            MAX(cp.Status_Date) as ultima_actividad
        FROM `datos-clientes-441216.Conciliaciones.usuarios_BIG` ub
        LEFT JOIN `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` cp 
            ON ub.Employee_id = cp.Employee_id
        WHERE ub.Carrier_id IN ({carrier_ids_str})
        GROUP BY ub.Employee_id, ub.Employee_Name, ub.Employee_Mail, 
                 ub.Employee_Phone, ub.Carrier_Name, ub.Created
        ORDER BY ultima_actividad DESC NULLS LAST
        """
        
        result = client.query(query).result()
        
        conductores = []
        for row in result:
            conductores.append({
                "id": str(row.Employee_id),
                "nombre": row.nombre or "Sin nombre",
                "correo": row.correo or "",
                "telefono": row.telefono or "",
                "empresa": row.empresa or "",
                "fecha_registro": str(row.fecha_registro) if row.fecha_registro else "",
                "total_entregas": int(row.total_entregas) if row.total_entregas else 0,
                "entregas_pendientes": int(row.entregas_pendientes) if row.entregas_pendientes else 0,
                "valor_pendiente": int(row.valor_pendiente) if row.valor_pendiente else 0,
                "ultima_actividad": str(row.ultima_actividad) if row.ultima_actividad else "Sin actividad",
                "estado": "activo" if row.entregas_pendientes and int(row.entregas_pendientes) > 0 else "inactivo"
            })
        
        return conductores
        
    except Exception as e:
        print(f"Error obteniendo conductores supervisor: {e}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@router.get("/resumen-carrier")
async def get_resumen_carrier(current_user = Depends(verificar_supervisor)):
    """
    Resumen ejecutivo del/los carrier(s) del supervisor
    """
    try:
        client = bigquery.Client()
        carrier_ids = obtener_carrier_id_supervisor(current_user["correo"], client)
        
        if not carrier_ids:
            return {"mensaje": "No hay carriers asignados", "carriers": []}
        
        resultados = []
        
        for carrier_id in carrier_ids:
            query = f"""
            SELECT 
                c.Carrier as nombre_carrier,
                COUNT(DISTINCT c.Employee_id) as total_conductores,
                COUNT(c.tracking_number) as total_guias,
                COUNT(CASE 
                    WHEN c.Status_Big NOT LIKE '%360%' AND c.Status_Big NOT LIKE '%Entregado%' 
                    THEN 1 
                END) as guias_pendientes,
                SUM(CASE 
                    WHEN c.Status_Big NOT LIKE '%360%' AND c.Status_Big NOT LIKE '%Entregado%' 
                    THEN c.Valor ELSE 0 
                END) as valor_pendiente,
                AVG(c.Valor) as promedio_valor_guia
            FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` c
            WHERE c.carrier_id = {carrier_id}
                AND c.Valor > 0
            GROUP BY c.Carrier
            """
            
            result = client.query(query).result()
            rows = list(result)
            
            if rows:
                row = rows[0]
                resultados.append({
                    "carrier_id": carrier_id,
                    "nombre": row.nombre_carrier or f"Carrier {carrier_id}",
                    "total_conductores": int(row.total_conductores) if row.total_conductores else 0,
                    "total_guias": int(row.total_guias) if row.total_guias else 0,
                    "guias_pendientes": int(row.guias_pendientes) if row.guias_pendientes else 0,
                    "valor_pendiente": int(row.valor_pendiente) if row.valor_pendiente else 0,
                    "promedio_valor_guia": int(row.promedio_valor_guia) if row.promedio_valor_guia else 0
                })
        
        return {
            "carriers": resultados,
            "total_carriers": len(resultados)
        }
        
    except Exception as e:
        print(f"Error obteniendo resumen carrier: {e}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")
    
    
@router.get("/guias-entregadas")
async def get_guias_entregadas_supervisor(
    limit: int = Query(100),
    offset: int = Query(0),
    conductor: Optional[str] = Query(None),
    current_user = Depends(verificar_supervisor)
):
    """
    Lista las guías en estado 360 (entregadas) de los carriers supervisados
    """
    try:
        client = bigquery.Client()
        user_email = current_user.get("correo") or current_user.get("sub")
        carrier_ids = obtener_carrier_id_supervisor(user_email, client)
        
        if not carrier_ids:
            return {"guias": [], "total": 0}

        carrier_ids_str = ','.join(map(str, carrier_ids))
        where_conditions = [
            f"cp.carrier_id IN ({carrier_ids_str})",
            "cp.Valor > 0",
            "(cp.Status_Big LIKE '%360%' OR cp.Status_Big LIKE '%Entregado%')"
        ]
        
        query_params = []

        if conductor:
            where_conditions.append("LOWER(ub.Employee_Name) LIKE LOWER(@conductor)")
            query_params.append(bigquery.ScalarQueryParameter("conductor", "STRING", f"%{conductor}%"))

        where_clause = " AND ".join(where_conditions)
        
        query = f"""
        SELECT 
            cp.tracking_number,
            cp.Cliente,
            cp.Ciudad,
            cp.Departamento,
            cp.Valor,
            cp.Status_Date,
            cp.Status_Big,
            cp.Carrier,
            ub.Employee_Name as conductor_nombre,
            ub.Employee_Mail as conductor_email,
            ub.Employee_Phone as conductor_telefono
        FROM `{PROJECT_ID}.{DATASET}.COD_pendientes_v1` cp
        LEFT JOIN `{PROJECT_ID}.{DATASET}.usuarios_BIG` ub 
            ON cp.Employee_id = ub.Employee_id
        WHERE {where_clause}
        ORDER BY cp.Status_Date DESC
        LIMIT @limit OFFSET @offset
        """
        
        query_params += [
            bigquery.ScalarQueryParameter("limit", "INT64", limit),
            bigquery.ScalarQueryParameter("offset", "INT64", offset),
        ]

        job_config = bigquery.QueryJobConfig(query_parameters=query_params)
        result = client.query(query, job_config=job_config).result()
        
        guias = [{
            "tracking_number": row.tracking_number,
            "cliente": row.Cliente or "Sin cliente",
            "ciudad": row.Ciudad,
            "departamento": row.Departamento,
            "valor": int(row.Valor),
            "fecha": str(row.Status_Date),
            "estado": row.Status_Big,
            "carrier": row.Carrier,
            "conductor": {
                "nombre": row.conductor_nombre or "Sin asignar",
                "email": row.conductor_email or "",
                "telefono": row.conductor_telefono or ""
            }
        } for row in result]

        return {
            "guias": guias,
            "total": len(guias)
        }

    except Exception as e:
        print(f"Error cargando guías entregadas supervisor: {e}")
        raise HTTPException(status_code=500, detail="Error interno")
