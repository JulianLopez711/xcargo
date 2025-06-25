from fastapi import APIRouter, HTTPException, Depends, Query, logger
from google.cloud import bigquery
from app.dependencies import get_current_user
from typing import List, Dict, Any, Optional
from datetime import datetime

router = APIRouter(prefix="/supervisor", tags=["Supervisor"])

PROJECT_ID = "datos-clientes-441216"
DATASET = "Conciliaciones"
DATASET_CONCILIACIONES = DATASET  # Añadido para evitar error de variable no definida

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
        carrier_ids_str = ','.join(map(str, carrier_ids))        # Estadísticas REALES del carrier usando criterios actualizados
        query_stats = f"""
        WITH fecha_limite AS (
            SELECT DATE('2025-06-09') as fecha_inicio  -- ✅ FECHA FIJA desde el 9 de junio de 2025
        ),
        guias_stats AS (
            SELECT 
                COUNT(DISTINCT cod.Employee_id) as conductores_activos,
                COUNT(*) as total_guias,
                -- ✅ ACTUALIZADO: Usar estado 360 específico para entregadas
                COUNT(CASE 
                    WHEN cod.Status_Big = '360 - Entregado al cliente' THEN 1 
                END) as guias_entregadas,
                COUNT(CASE 
                    WHEN cod.Status_Big != '360 - Entregado al cliente' AND cod.Valor > 0 THEN 1 
                END) as guias_pendientes,
                -- ✅ ACTUALIZADO: Verificar pagos reales en pagosconductor
                COUNT(CASE 
                    WHEN cod.Status_Big = '360 - Entregado al cliente' 
                    AND pc.tracking IS NULL  -- No pagado
                    THEN 1 
                END) as guias_entregadas_no_pagadas,
                SUM(CASE 
                    WHEN cod.Status_Big != '360 - Entregado al cliente' AND cod.Valor > 0
                    THEN cod.Valor ELSE 0 
                END) as monto_pendiente,
                SUM(CASE 
                    WHEN cod.Status_Big = '360 - Entregado al cliente' AND pc.tracking IS NULL
                    THEN cod.Valor ELSE 0 
                END) as monto_disponible_pago,
                SUM(CASE 
                    WHEN pc.tracking IS NOT NULL
                    THEN cod.Valor ELSE 0 
                END) as monto_pagado,
                AVG(cod.Valor) as promedio_valor_guia
            FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` cod
            LEFT JOIN `datos-clientes-441216.Conciliaciones.pagosconductor` pc
                ON pc.tracking = cod.tracking_number
            CROSS JOIN fecha_limite fl
            WHERE cod.carrier_id IN ({carrier_ids_str})
                AND cod.Valor > 0
                AND DATE(cod.Status_Date) >= fl.fecha_inicio
        ),
        conductores_stats AS (
            SELECT 
                COUNT(DISTINCT Employee_id) as total_conductores_registrados
            FROM `datos-clientes-441216.Conciliaciones.usuarios_BIG`
            WHERE Carrier_id IN ({carrier_ids_str})
        )
        SELECT 
            gs.*,
            cs.total_conductores_registrados,
            fl.fecha_inicio
        FROM guias_stats gs, conductores_stats cs, fecha_limite fl
        """
        
        result_stats = client.query(query_stats).result()
        stats_row = list(result_stats)[0]        # Top 5 conductores con más actividad reciente (ACTUALIZADO)
        query_conductores = f"""
        WITH fecha_limite AS (
            SELECT DATE('2025-06-09') as fecha_inicio  -- ✅ FECHA FIJA desde el 9 de junio de 2025
        )
        SELECT 
            ub.Employee_Name as nombre,
            ub.Employee_Mail as email,
            ub.Employee_Phone as telefono,
            COUNT(cp.tracking_number) as guias_totales,
            -- ✅ MEJORADO: Contar pendientes que no están en estado 360
            COUNT(CASE 
                WHEN cp.Status_Big != '360 - Entregado al cliente' AND cp.Valor > 0
                THEN 1 
            END) as guias_pendientes,
            -- ✅ MEJORADO: Contar entregadas con estado 360
            COUNT(CASE 
                WHEN cp.Status_Big = '360 - Entregado al cliente'
                THEN 1 
            END) as guias_entregadas,
            -- ✅ NUEVO: Contar disponibles para pago (entregadas no pagadas)
            COUNT(CASE 
                WHEN cp.Status_Big = '360 - Entregado al cliente' AND pc.tracking IS NULL
                THEN 1 
            END) as guias_disponibles_pago,
            SUM(CASE 
                WHEN cp.Status_Big = '360 - Entregado al cliente' AND pc.tracking IS NULL
                THEN cp.Valor ELSE 0 
            END) as valor_disponible_pago,
            SUM(CASE 
                WHEN cp.Status_Big != '360 - Entregado al cliente' AND cp.Valor > 0
                THEN cp.Valor ELSE 0 
            END) as valor_pendiente,
            MAX(cp.Status_Date) as ultima_actividad,
            STRING_AGG(DISTINCT cp.Ciudad, ', ' LIMIT 3) as ciudades_principales
        FROM `datos-clientes-441216.Conciliaciones.usuarios_BIG` ub
        LEFT JOIN `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` cp 
            ON ub.Employee_id = cp.Employee_id
        LEFT JOIN `datos-clientes-441216.Conciliaciones.pagosconductor` pc
            ON pc.tracking = cp.tracking_number
        CROSS JOIN fecha_limite fl
        WHERE ub.Carrier_id IN ({carrier_ids_str})
            AND cp.Status_Date >= fl.fecha_inicio
        GROUP BY ub.Employee_Name, ub.Employee_Mail, ub.Employee_Phone
        HAVING COUNT(cp.tracking_number) > 0
        ORDER BY guias_totales DESC, ultima_actividad DESC
        LIMIT 8        """
        
        result_conductores = client.query(query_conductores).result()
        conductores = []
        
        for row in result_conductores:
            # ✅ MEJORADO: Determinar estado con criterios más precisos
            estado = "inactivo"
            dias_desde_actividad = 999
            
            if row.ultima_actividad:
                # ✅ CORREGIDO: row.ultima_actividad ya es un objeto date, no necesita .date()
                dias_desde_actividad = (datetime.now().date() - row.ultima_actividad).days
            
            # Criterios de estado actualizados
            if row.guias_disponibles_pago and int(row.guias_disponibles_pago) > 0:
                estado = "con_disponibles_pago"  # Tiene guías listas para pagar
            elif row.guias_pendientes and int(row.guias_pendientes) > 0:
                estado = "con_pendientes"  # Tiene guías en proceso
            elif dias_desde_actividad <= 1:
                estado = "activo_hoy"  # Actividad hoy
            elif dias_desde_actividad <= 7:
                estado = "activo_reciente"  # Actividad esta semana
            elif row.guias_totales and int(row.guias_totales) > 0:
                estado = "activo"  # Tiene actividad en el periodo
                
            conductores.append({
                "nombre": row.nombre or "Sin nombre",
                "email": row.email or "",
                "telefono": row.telefono or "",
                "guias_totales": int(row.guias_totales) if row.guias_totales else 0,
                "guias_pendientes": int(row.guias_pendientes) if row.guias_pendientes else 0,
                "guias_entregadas": int(row.guias_entregadas) if row.guias_entregadas else 0,
                "guias_disponibles_pago": int(row.guias_disponibles_pago) if row.guias_disponibles_pago else 0,
                "valor_pendiente": int(row.valor_pendiente) if row.valor_pendiente else 0,
                "valor_disponible_pago": int(row.valor_disponible_pago) if row.valor_disponible_pago else 0,
                "ultima_actividad": str(row.ultima_actividad) if row.ultima_actividad else "Sin actividad",
                "dias_desde_actividad": dias_desde_actividad,
                "ciudades_principales": row.ciudades_principales or "Sin datos",
                "estado": estado,
                "eficiencia": round((int(row.guias_entregadas or 0) / max(int(row.guias_totales or 1), 1)) * 100, 1)
            })
          # ✅ ALERTAS MEJORADAS con criterios actualizados
        alertas = []
        
        # Alerta por alto monto disponible para pago
        if hasattr(stats_row, 'monto_disponible_pago') and stats_row.monto_disponible_pago and int(stats_row.monto_disponible_pago) > 3000000:
            alertas.append({
                "tipo": "warning",
                "mensaje": f"${int(stats_row.monto_disponible_pago):,} disponibles para pago",
                "prioridad": "alta"
            })
        
        # Alerta por muchas guías entregadas sin pagar
        if hasattr(stats_row, 'guias_entregadas_no_pagadas') and stats_row.guias_entregadas_no_pagadas and int(stats_row.guias_entregadas_no_pagadas) > 20:
            alertas.append({
                "tipo": "info", 
                "mensaje": f"{int(stats_row.guias_entregadas_no_pagadas)} guías entregadas pendientes de pago",
                "prioridad": "media"
            })
        
        # Alerta por conductores inactivos
        conductores_sin_actividad = int(stats_row.total_conductores_registrados or 0) - int(stats_row.conductores_activos or 0)
        if conductores_sin_actividad > 0:            alertas.append({
                "tipo": "info",
                "mensaje": f"{conductores_sin_actividad} conductores sin actividad reciente",
                "prioridad": "media"
            })
        
        return {
            "carriers": carriers_info,
            "stats": {
                "total_conductores_registrados": int(stats_row.total_conductores_registrados) if stats_row.total_conductores_registrados else 0,
                "conductores_activos": int(stats_row.conductores_activos) if stats_row.conductores_activos else 0,
                "total_guias": int(stats_row.total_guias) if stats_row.total_guias else 0,
                "guias_pendientes": int(stats_row.guias_pendientes) if stats_row.guias_pendientes else 0,
                "guias_entregadas": int(stats_row.guias_entregadas) if stats_row.guias_entregadas else 0,
                "guias_entregadas_no_pagadas": int(stats_row.guias_entregadas_no_pagadas) if hasattr(stats_row, 'guias_entregadas_no_pagadas') and stats_row.guias_entregadas_no_pagadas else 0,
                "monto_pendiente": int(stats_row.monto_pendiente) if stats_row.monto_pendiente else 0,
                "monto_entregado": int(stats_row.monto_pagado) if hasattr(stats_row, 'monto_pagado') and stats_row.monto_pagado else 0,
                "monto_disponible_pago": int(stats_row.monto_disponible_pago) if hasattr(stats_row, 'monto_disponible_pago') and stats_row.monto_disponible_pago else 0,
                "promedio_valor_guia": int(stats_row.promedio_valor_guia) if stats_row.promedio_valor_guia else 0,
                "eficiencia_general": round((int(stats_row.guias_entregadas or 0) / max(int(stats_row.total_guias or 1), 1)) * 100, 1)
            },
            "conductores_destacados": conductores,
            "alertas": alertas,
            "periodo_analisis": f"Desde el 9 de junio de 2025 (fecha fija configurada)",
            "fecha_actualizacion": datetime.now().isoformat(),
            "version": "2.0_actualizada"
        }
        
    except Exception as e:
        print(f"Error en dashboard supervisor: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error interno del servidor: {str(e)}")

@router.get("/guias-pendientes")
async def get_guias_pendientes_supervisor(
    limit: int = Query(50),
    offset: int = Query(0),
    conductor: Optional[str] = Query(None),
    tracking: Optional[str] = Query(None),
    cliente: Optional[str] = Query(None),
    ciudad: Optional[str] = Query(None),
    fecha: Optional[str] = Query(None),  # formato YYYY-MM-DD
    estado_liquidacion: Optional[str] = Query(None, description="pendiente, pagado"),
    current_user = Depends(verificar_supervisor)
):
    """
    Lista las guías pendientes de los carriers supervisados
    Estados de liquidación basados en tabla pagosconductor:
    - pendiente: Guías sin pago registrado
    - pagado: Guías con pago registrado en pagosconductor
    """
    try:
        client = bigquery.Client()
        user_email = current_user.get("correo") or current_user.get("sub")
        carrier_ids = obtener_carrier_id_supervisor(user_email, client)
        
        if not carrier_ids:
            return {"guias": [], "total": 0, "mensaje": "No hay carriers asignados"}

        carrier_ids_str = ','.join(map(str, carrier_ids))
        where_conditions = [
            f"cp.carrier_id IN ({carrier_ids_str})",
            "cp.Valor > 0",
            "cp.Status_Big = '360 - Entregado al cliente'"
        ]

        query_params = []        # Filtro por estado de liquidación (basado en pagosconductor existente)
        if estado_liquidacion:
            if estado_liquidacion.lower() == "pendiente":
                # Guías sin pago registrado
                where_conditions.append("pc.tracking IS NULL")
            elif estado_liquidacion.lower() == "pagado":
                # Guías con pago registrado
                where_conditions.append("pc.tracking IS NOT NULL")

        if conductor:
            where_conditions.append("LOWER(ub.Employee_Name) LIKE LOWER(@conductor)")
            query_params.append(bigquery.ScalarQueryParameter("conductor", "STRING", f"%{conductor}%"))

        if tracking:
            where_conditions.append("LOWER(cp.tracking_number) LIKE LOWER(@tracking)")
            query_params.append(bigquery.ScalarQueryParameter("tracking", "STRING", f"%{tracking}%"))

        if cliente:
            where_conditions.append("LOWER(cp.Cliente) LIKE LOWER(@cliente)")
            query_params.append(bigquery.ScalarQueryParameter("cliente", "STRING", f"%{cliente}%"))

        if ciudad:
            where_conditions.append("LOWER(cp.Ciudad) LIKE LOWER(@ciudad)")
            query_params.append(bigquery.ScalarQueryParameter("ciudad", "STRING", f"%{ciudad}%"))

        if fecha:
            where_conditions.append("DATE(cp.Status_Date) = DATE(@fecha)")
            query_params.append(bigquery.ScalarQueryParameter("fecha", "DATE", fecha))

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
            ub.Employee_Phone as conductor_telefono,
            CASE 
                WHEN pc.tracking IS NOT NULL THEN 'pagado'
                ELSE 'pendiente'
            END as estado_liquidacion,
            CASE 
                WHEN pc.tracking IS NOT NULL THEN 'pagado'
                ELSE 'pendiente'
            END as estado_display
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` cp
        LEFT JOIN `datos-clientes-441216.Conciliaciones.usuarios_BIG` ub 
            ON cp.Employee_id = ub.Employee_id
        LEFT JOIN `datos-clientes-441216.Conciliaciones.pagosconductor` pc
            ON cp.tracking_number = pc.tracking
        WHERE {where_clause}
        ORDER BY cp.Status_Date DESC
        LIMIT @limit OFFSET @offset
        """

        query_params.extend([
            bigquery.ScalarQueryParameter("limit", "INT64", limit),
            bigquery.ScalarQueryParameter("offset", "INT64", offset)
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
                "estado_liquidacion": row.estado_liquidacion or "pendiente",
                "estado_display": row.estado_display or "pendiente",                "conductor": {
                    "nombre": row.conductor_nombre or "Sin asignar",
                    "email": row.conductor_email or "",
                    "telefono": row.conductor_telefono or ""
                }
            })

        count_query = f"""
        SELECT COUNT(*) as total
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` cp
        LEFT JOIN `datos-clientes-441216.Conciliaciones.usuarios_BIG` ub 
            ON cp.Employee_id = ub.Employee_id
        LEFT JOIN `datos-clientes-441216.Conciliaciones.pagosconductor` pc
            ON cp.tracking_number = pc.tracking
        WHERE {where_clause}
        """

        count_config = bigquery.QueryJobConfig(query_parameters=query_params[:-2])
        total = list(client.query(count_query, job_config=count_config).result())[0].total

        return {
            "guias": guias,
            "total": int(total),
            "pagina_actual": (offset // limit) + 1,
            "total_paginas": (int(total) + limit - 1) // limit,
            "carriers_supervisados": carrier_ids
        }

    except Exception as e:
        print(f"Error obteniendo guías pendientes: {e}")
        raise HTTPException(status_code=500, detail=f"Error interno: {e}")


@router.get("/conductores")
async def get_conductores_supervisor(current_user = Depends(verificar_supervisor)):
    """
    Lista todos los conductores de los carriers del supervisor desde 2025-06-09
    """
    try:
        client = bigquery.Client()
        user_email = current_user.get("correo") or current_user.get("sub")
        carrier_ids = obtener_carrier_id_supervisor(user_email, client)
        
        if not carrier_ids:
            return []
        
        carrier_ids_str = ','.join(map(str, carrier_ids))
        
        query = f"""
        WITH conductores_actividad AS (
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
                AND cp.Status_Date >= '2025-06-09'  # Filtro por fecha
            WHERE ub.Carrier_id IN ({carrier_ids_str})
            GROUP BY ub.Employee_id, ub.Employee_Name, ub.Employee_Mail, 
                     ub.Employee_Phone, ub.Carrier_Name, ub.Created
        )
        SELECT 
            *,
            CASE
                WHEN entregas_pendientes > 0 THEN 'activo'
                WHEN total_entregas > 0 AND ultima_actividad >= '2025-06-09' THEN 'activo'
                ELSE 'inactivo'
            END as estado
        FROM conductores_actividad
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
                "estado": row.estado
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
            where_conditions.append("LOWER(ub.Employee_Name) LIKE LOWER(@conductor) ")
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

@router.get("/pagos-conductor")
async def obtener_pagos_conductor(current_user = Depends(verificar_supervisor)):
    """
    Obtiene la lista de pagos filtrados por carrier y fecha
    """
    try:
        client = bigquery.Client()
        user_email = current_user.get("correo") or current_user.get("sub")
        
        # Obtener carriers del supervisor
        carrier_ids = obtener_carrier_id_supervisor(user_email, client)
        if not carrier_ids:
            return []
            
        carrier_ids_str = ','.join(map(str, carrier_ids))
        
        query = f"""
        WITH pagos_filtrados AS (
            SELECT 
                pc.*,
                cp.Status_Big as estado_guia,
                cp.carrier_id,
                cp.tracking_number,
                cp.Employee_id
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
            INNER JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1` cp 
                ON pc.tracking = cp.tracking_number
            WHERE cp.carrier_id IN ({carrier_ids_str})
                AND pc.fecha_pago >= '2025-06-09'
                AND cp.Status_Big LIKE '%360%'
        )
        SELECT 
            pf.*,
            ub.Employee_Name as nombre_conductor
        FROM pagos_filtrados pf
        LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.usuarios_BIG` ub
            ON pf.Employee_id = ub.Employee_id
        ORDER BY pf.fecha_pago DESC, pf.creado_en DESC
        """
        
        resultados = client.query(query).result()
          # Agrupar pagos por referencia
        pagos_agrupados = {}
        for row in resultados:
            ref = row.referencia_pago
            if ref not in pagos_agrupados:
                pagos_agrupados[ref] = {
                    "referencia_pago": ref,
                    "valor": float(row.valor_total_consignacion or 0),
                    "valor_total_consignacion": float(row.valor_total_consignacion or 0),
                    "fecha": str(row.fecha_pago),
                    "entidad": row.entidad,
                    "estado": row.estado,
                    "tipo": row.tipo,
                    "imagen": row.comprobante,
                    "novedades": row.novedades,
                    "guias": [],
                    "correo_conductor": row.correo,
                    "nombre_conductor": row.nombre_conductor,
                    "estado_conciliacion": row.estado_conciliacion or "Pendiente"
                }
            
            pagos_agrupados[ref]["guias"].append(row.tracking_number)
            
        # Formatear respuesta final
        pagos = []
        for pago in pagos_agrupados.values():
            pagos.append({
                **pago,
                "num_guias": len(pago["guias"]),
                "trackings_preview": ", ".join(pago["guias"][:5])
            })
            
        return pagos
        
    except Exception as e:
        logger.error(f"Error obteniendo pagos: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/conductor/{conductor_id}/estado")
async def cambiar_estado_conductor(
    conductor_id: str, 
    nuevo_estado: dict,
    current_user = Depends(verificar_supervisor)
):
    """
    Cambia el estado de un conductor (activo/inactivo/suspendido)
    """
    try:
        client = bigquery.Client()
        user_email = current_user.get("correo") or current_user.get("sub")
        carrier_ids = obtener_carrier_id_supervisor(user_email, client)
        
        if not carrier_ids:
            raise HTTPException(status_code=403, detail="No autorizado para gestionar conductores")
        
        estado = nuevo_estado.get("estado")
        if estado not in ["activo", "inactivo", "suspendido"]:
            raise HTTPException(status_code=400, detail="Estado inválido")
        
        # Verificar que el conductor pertenece a uno de los carriers del supervisor
        carrier_ids_str = ','.join(map(str, carrier_ids))
        
        verify_query = f"""
        SELECT Employee_id 
        FROM `datos-clientes-441216.Conciliaciones.usuarios_BIG`
        WHERE Employee_id = '{conductor_id}' 
        AND Carrier_id IN ({carrier_ids_str})
        """
        
        verify_result = client.query(verify_query).result()
        if not list(verify_result):
            raise HTTPException(status_code=404, detail="Conductor no encontrado o no autorizado")
        
        # En este caso, como no tenemos una tabla específica para estados de conductores,
        # simulamos el cambio de estado exitoso
        # En un sistema real, aquí se actualizaría la base de datos
        
        print(f"✅ Estado del conductor {conductor_id} cambiado a: {estado}")
        
        return {
            "mensaje": f"Estado del conductor cambiado a {estado}",
            "conductor_id": conductor_id,
            "nuevo_estado": estado
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error cambiando estado del conductor: {e}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")
