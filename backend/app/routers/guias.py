from fastapi import APIRouter, Depends, HTTPException, Query
from google.cloud import bigquery
from typing import List, Dict, Any, Optional
import os
from app.dependencies import get_current_user
from datetime import datetime, date

router = APIRouter(prefix="/guias", tags=["Guías"])

def get_bigquery_client():
    """Obtiene el cliente de BigQuery"""
    return bigquery.Client()

def obtener_employee_id_usuario(correo: str, client: bigquery.Client) -> Optional[int]:
    """
    Obtiene el Employee_id del usuario basado en su correo
    """
    try:
        query = """
        SELECT Employee_id
        FROM `datos-clientes-441216.Conciliaciones.usuarios_BIG`
        WHERE LOWER(Employee_Mail) = LOWER(@correo)
        LIMIT 1
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo", "STRING", correo)
            ]
        )
        
        result = client.query(query, job_config=job_config).result()
        rows = list(result)
        
        if rows:
            employee_id = rows[0]["Employee_id"]
            print(f"✅ Employee_id encontrado para {correo}: {employee_id}")
            return employee_id
        else:
            print(f"⚠️ No se encontró Employee_id para {correo}")
            return None
            
    except Exception as e:
        print(f"❌ Error obteniendo Employee_id: {e}")
        return None

@router.get("/pendientes")
async def obtener_guias_pendientes_conductor(
    cliente_filtro: Optional[str] = Query(None, description="Filtrar por cliente específico"),
    fecha_desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    fecha_hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)"),
    limite: int = Query(100, description="Límite de registros", ge=1, le=500),
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    🔄 NUEVA VERSIÓN: Usa guias_liquidacion + COD_pendientes_v1 con JOIN
    Solo muestra guías disponibles para liquidar (no pagadas)
    """
    try:
        print(f"🔍 ===== INICIO REQUEST GUIAS PENDIENTES (NUEVA ESTRUCTURA) =====")
        print(f"🔍 Usuario: {current_user.get('correo') or current_user.get('sub')}")
        print(f"🔍 Rol: {current_user.get('rol', 'N/A')}")
        print(f"🔍 Filtros: cliente={cliente_filtro}, desde={fecha_desde}, hasta={fecha_hasta}")

        user_email = current_user.get("correo") or current_user.get("sub")

        if not user_email:
            print(f"❌ No se encontró email en el token")
            return {"guias": [], "total": 0, "error": "Usuario no autenticado"}

        # Construir filtros dinámicos
        filtros_adicionales = []
        parametros = []

        if cliente_filtro:
            filtros_adicionales.append("AND UPPER(gl.cliente) LIKE UPPER(@cliente_filtro)")
            parametros.append(bigquery.ScalarQueryParameter("cliente_filtro", "STRING", f"%{cliente_filtro}%"))

        if fecha_desde:
            filtros_adicionales.append("AND gl.fecha_entrega >= @fecha_desde")
            parametros.append(bigquery.ScalarQueryParameter("fecha_desde", "DATE", fecha_desde))

        if fecha_hasta:
            filtros_adicionales.append("AND gl.fecha_entrega <= @fecha_hasta")
            parametros.append(bigquery.ScalarQueryParameter("fecha_hasta", "DATE", fecha_hasta))

        filtros_sql = " ".join(filtros_adicionales)

        # Si es admin o rol superior, puede ver todas las guías disponibles
        if current_user.get("rol") in ["admin", "master", "supervisor"]:
            print("👑 Usuario con privilegios - mostrando todas las guías disponibles")
            
            query = f"""
            SELECT 
                gl.id as liquidacion_id,
                gl.tracking_number as tracking,
                gl.cliente as empresa,
                gl.valor_guia as valor,
                gl.fecha_entrega,
                gl.estado_liquidacion,
                gl.employee_id,
                gl.conductor_email,
                -- Datos enriquecidos de COD_pendientes_v1
                cod.Status_Big as estado,
                cod.Status_Date as fecha_estado,
                cod.Empleado as conductor,
                cod.Carrier,
                cod.carrier_id,
                -- Información adicional útil
                CASE 
                    WHEN DATE_DIFF(CURRENT_DATE(), gl.fecha_entrega, DAY) <= 7 THEN 'RECIENTE'
                    WHEN DATE_DIFF(CURRENT_DATE(), gl.fecha_entrega, DAY) <= 30 THEN 'NORMAL'
                    ELSE 'ANTIGUA'
                END as antiguedad
            FROM `datos-clientes-441216.Conciliaciones.guias_liquidacion` gl
            INNER JOIN `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` cod
                ON gl.tracking_number = cod.tracking_number
            WHERE gl.estado_liquidacion = 'disponible'
                AND cod.Status_Big = '360 - Entregado al cliente'
                {filtros_sql}
            ORDER BY gl.fecha_entrega DESC
            LIMIT @limite
            """

            parametros.append(bigquery.ScalarQueryParameter("limite", "INTEGER", limite))

        else:
            # Para conductores: solo sus guías asignadas disponibles
            print("🚛 Usuario conductor - buscando Employee_id")
            employee_id = obtener_employee_id_usuario(user_email, client)

            if not employee_id:
                print(f"❌ Conductor {user_email} no tiene Employee_id")
                return {
                    "guias": [], 
                    "total": 0, 
                    "error": f"Conductor {user_email} no encontrado en el sistema"
                }

            print(f"🔍 Employee_id obtenido: {employee_id}")

            query = f"""
            SELECT 
                gl.id as liquidacion_id,
                gl.tracking_number as tracking,
                gl.cliente as empresa,
                gl.valor_guia as valor,
                gl.fecha_entrega,
                gl.estado_liquidacion,
                gl.employee_id,
                gl.conductor_email,
                -- Datos enriquecidos de COD_pendientes_v1
                cod.Status_Big as estado,
                cod.Status_Date as fecha_estado,
                cod.Empleado as conductor,
                cod.Carrier,
                cod.carrier_id,
                -- Información adicional útil
                CASE 
                    WHEN DATE_DIFF(CURRENT_DATE(), gl.fecha_entrega, DAY) <= 7 THEN 'RECIENTE'
                    WHEN DATE_DIFF(CURRENT_DATE(), gl.fecha_entrega, DAY) <= 30 THEN 'NORMAL'
                    ELSE 'ANTIGUA'
                END as antiguedad
            FROM `datos-clientes-441216.Conciliaciones.guias_liquidacion` gl
            INNER JOIN `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` cod
                ON gl.tracking_number = cod.tracking_number
            WHERE gl.employee_id = @employee_id
                AND gl.estado_liquidacion = 'disponible'
                AND cod.Status_Big = '360 - Entregado al cliente'
                {filtros_sql}
            ORDER BY gl.fecha_entrega DESC
            LIMIT @limite
            """

            parametros.extend([
                bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id),
                bigquery.ScalarQueryParameter("limite", "INTEGER", limite)
            ])

        # Ejecutar query
        job_config = bigquery.QueryJobConfig(query_parameters=parametros)
        query_job = client.query(query, job_config=job_config)
        results = query_job.result()

        guias_pendientes = []
        total_valor = 0
        clientes_unicos = set()

        for row in results:
            valor = float(row.valor) if row.valor else 0
            total_valor += valor
            clientes_unicos.add(row.empresa)
            
            guia = {
                "liquidacion_id": row.liquidacion_id,  # 🔄 NUEVO: ID interno para liquidación
                "tracking": row.tracking,
                "conductor": row.conductor,
                "empresa": row.empresa,
                "valor": valor,
                "estado": row.estado,
                "fecha_estado": row.fecha_estado.isoformat() if row.fecha_estado else None,
                "fecha_entrega": row.fecha_entrega.isoformat() if row.fecha_entrega else None,  # 🔄 NUEVO
                "employee_id": row.employee_id,
                "carrier_id": row.carrier_id,
                "carrier": row.Carrier,
                "antiguedad": row.antiguedad,
                # ✅ Información útil para liquidación
                "listo_para_liquidar": True,
                "estado_liquidacion": row.estado_liquidacion
            }
            guias_pendientes.append(guia)

        print(f"✅ Guías disponibles encontradas para {user_email}: {len(guias_pendientes)}")

        # ✅ Respuesta enriquecida con estadísticas
        return {
            "guias": guias_pendientes,
            "total": len(guias_pendientes),
            "estadisticas": {
                "total_guias": len(guias_pendientes),
                "valor_total": total_valor,
                "clientes_unicos": len(clientes_unicos),
                "clientes": list(clientes_unicos),
                "promedio_valor": total_valor / len(guias_pendientes) if len(guias_pendientes) > 0 else 0
            },
            "filtros_aplicados": {
                "cliente": cliente_filtro,
                "fecha_desde": fecha_desde,
                "fecha_hasta": fecha_hasta,
                "limite": limite
            },
            "usuario": {
                "email": user_email,
                "rol": current_user.get("rol"),
                "puede_ver_todos": current_user.get("rol") in ["admin", "master", "supervisor"]
            },
            "fuente_datos": "guias_liquidacion",  # 🔄 NUEVO: Indicar fuente
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        print(f"❌ Error al obtener guías pendientes: {str(e)}")
        import traceback
        print(f"❌ Traceback: {traceback.format_exc()}")
        return {
            "guias": [],
            "total": 0,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@router.get("/bonos-disponibles")
async def obtener_bonos_disponibles(
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    🔄 NUEVO: Obtiene los bonos disponibles del conductor
    """
    try:
        user_email = current_user.get("correo") or current_user.get("sub")
        employee_id = obtener_employee_id_usuario(user_email, client)
        
        if not employee_id:
            return {
                "bonos": [], 
                "total_disponible": 0,
                "error": "Conductor no encontrado"
            }
        
        query = """
        SELECT 
            id,
            tipo_bono,
            valor_bono,
            saldo_disponible,
            descripcion,
            fecha_generacion,
            referencia_pago_origen
        FROM `datos-clientes-441216.Conciliaciones.conductor_bonos`
        WHERE employee_id = @employee_id
            AND estado_bono = 'activo'
            AND saldo_disponible > 0
        ORDER BY fecha_generacion ASC
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id)
            ]
        )
        
        result = client.query(query, job_config=job_config).result()
        bonos = []
        total_disponible = 0
        
        for row in result:
            bono = {
                "id": row.id,
                "tipo": row.tipo_bono,
                "valor_original": float(row.valor_bono),
                "saldo_disponible": float(row.saldo_disponible),
                "descripcion": row.descripcion,
                "fecha": row.fecha_generacion.isoformat(),
                "origen": row.referencia_pago_origen
            }
            bonos.append(bono)
            total_disponible += float(row.saldo_disponible)
        
        return {
            "bonos": bonos,
            "total_disponible": total_disponible,
            "cantidad_bonos": len(bonos),
            "conductor": {
                "email": user_email,
                "employee_id": employee_id
            }
        }
        
    except Exception as e:
        print(f"Error obteniendo bonos: {e}")
        return {
            "bonos": [],
            "total_disponible": 0,
            "error": str(e)
        }

@router.post("/sincronizar-guias")
async def sincronizar_guias_liquidacion(
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    🔄 NUEVO: Sincroniza guias_liquidacion con nuevas entregas 360
    Solo admin puede ejecutar esto
    """
    try:
        # Verificar permisos
        if current_user.get("rol") not in ["admin", "master"]:
            raise HTTPException(status_code=403, detail="Solo administradores pueden sincronizar")
        
        # Buscar guías 360 que no estén en guias_liquidacion
        query = """
        INSERT INTO `datos-clientes-441216.Conciliaciones.guias_liquidacion` (
            id,
            tracking_number,
            employee_id,
            conductor_email,
            cliente,
            valor_guia,
            fecha_entrega,
            estado_liquidacion,
            fecha_creacion,
            creado_por
        )
        SELECT 
            CONCAT('GUIA_LIQ_', UNIX_MILLIS(CURRENT_TIMESTAMP()), '_', ROW_NUMBER() OVER(ORDER BY cod.tracking_number)) as id,
            cod.tracking_number,
            cod.Employee_id,
            COALESCE(u.Employee_Mail, CONCAT('conductor_', CAST(cod.Employee_id AS STRING), '@unknown.com')) as conductor_email,
            cod.Cliente,
            cod.Valor,
            DATE(cod.Status_Date) as fecha_entrega,
            'disponible' as estado_liquidacion,
            CURRENT_TIMESTAMP() as fecha_creacion,
            @usuario as creado_por
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` cod
        LEFT JOIN `datos-clientes-441216.Conciliaciones.usuarios_BIG` u 
            ON u.Employee_id = cod.Employee_id
        LEFT JOIN `datos-clientes-441216.Conciliaciones.guias_liquidacion` gl
            ON gl.tracking_number = cod.tracking_number
        WHERE cod.Status_Big = '360 - Entregado al cliente'
            AND cod.Valor > 0
            AND gl.tracking_number IS NULL
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("usuario", "STRING", current_user.get("correo", "admin"))
            ]
        )
        
        result = client.query(query, job_config=job_config).result()
        
        # Contar las nuevas guías sincronizadas
        count_query = """
        SELECT COUNT(*) as nuevas_guias
        FROM `datos-clientes-441216.Conciliaciones.guias_liquidacion`
        WHERE DATE(fecha_creacion) = CURRENT_DATE()
            AND creado_por = @usuario
        """
        
        count_result = list(client.query(count_query, job_config=job_config).result())[0]
        nuevas_guias = count_result.nuevas_guias if count_result.nuevas_guias else 0
        
        return {
            "mensaje": f"Sincronización completada",
            "nuevas_guias": nuevas_guias,
            "fecha_sincronizacion": datetime.now().isoformat(),
            "ejecutado_por": current_user.get("correo", "admin")
        }
        
    except Exception as e:
        print(f"Error en sincronización: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/estadisticas-liquidacion")
async def obtener_estadisticas_liquidacion(
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    🔄 NUEVO: Estadísticas de liquidación usando la nueva estructura
    """
    try:
        user_email = current_user.get("correo") or current_user.get("sub")
        employee_id = obtener_employee_id_usuario(user_email, client)
        
        if not employee_id:
            return {"error": "Conductor no encontrado"}
        
        query = """
        SELECT 
            -- Estadísticas generales
            COUNT(*) as total_guias,
            SUM(valor_guia) as valor_total,
            
            -- Por estado de liquidación
            COUNT(CASE WHEN estado_liquidacion = 'disponible' THEN 1 END) as disponibles,
            COUNT(CASE WHEN estado_liquidacion = 'pagado' THEN 1 END) as pagadas,
            COUNT(CASE WHEN estado_liquidacion = 'procesando' THEN 1 END) as procesando,
            
            -- Valores por estado
            SUM(CASE WHEN estado_liquidacion = 'disponible' THEN valor_guia ELSE 0 END) as valor_disponible,
            SUM(CASE WHEN estado_liquidacion = 'pagado' THEN valor_guia ELSE 0 END) as valor_pagado,
            
            -- Clientes únicos
            COUNT(DISTINCT cliente) as clientes_unicos,
            
            -- Estadísticas de tiempo
            COUNT(CASE WHEN estado_liquidacion = 'disponible' 
                       AND DATE_DIFF(CURRENT_DATE(), fecha_entrega, DAY) <= 7 THEN 1 END) as disponibles_recientes
            
        FROM `datos-clientes-441216.Conciliaciones.guias_liquidacion`
        WHERE employee_id = @employee_id
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id)
            ]
        )
        
        result = client.query(query, job_config=job_config).result()
        rows = list(result)
        
        if rows:
            row = rows[0]
            return {
                "conductor": {
                    "email": user_email,
                    "employee_id": employee_id
                },
                "estadisticas": {
                    "total_guias": int(row.total_guias) if row.total_guias else 0,
                    "valor_total": float(row.valor_total) if row.valor_total else 0,
                    "disponibles": int(row.disponibles) if row.disponibles else 0,
                    "pagadas": int(row.pagadas) if row.pagadas else 0,
                    "procesando": int(row.procesando) if row.procesando else 0,
                    "valor_disponible": float(row.valor_disponible) if row.valor_disponible else 0,
                    "valor_pagado": float(row.valor_pagado) if row.valor_pagado else 0,
                    "clientes_unicos": int(row.clientes_unicos) if row.clientes_unicos else 0,
                    "disponibles_recientes": int(row.disponibles_recientes) if row.disponibles_recientes else 0
                },
                "porcentajes": {
                    "pagadas": round((int(row.pagadas) / int(row.total_guias)) * 100, 1) if row.total_guias and row.total_guias > 0 else 0,
                    "valor_pagado": round((float(row.valor_pagado) / float(row.valor_total)) * 100, 1) if row.valor_total and row.valor_total > 0 else 0
                },
                "timestamp": datetime.now().isoformat()
            }
        
        return {
            "error": "No se encontraron datos",
            "conductor": {"email": user_email, "employee_id": employee_id}
        }
        
    except Exception as e:
        print(f"Error obteniendo estadísticas: {e}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo estadísticas: {str(e)}")

# ✅ MANTENER ENDPOINTS EXISTENTES PARA COMPATIBILIDAD
@router.get("/entregadas")
async def obtener_guias_entregadas_conductor(
    cliente_filtro: Optional[str] = Query(None, description="Filtrar por cliente específico"),
    fecha_desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    fecha_hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)"),
    limite: int = Query(100, description="Límite de registros", ge=1, le=500),
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    ✅ ALIAS: Endpoint específico para obtener guías entregadas (usa nueva estructura)
    """
    return await obtener_guias_pendientes_conductor(
        cliente_filtro=cliente_filtro,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        limite=limite,
        client=client,
        current_user=current_user
    )

@router.get("/resumen-conductor")
async def obtener_resumen_conductor(
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    ✅ ALIAS: Resumen específico del conductor (usa nueva estructura)
    """
    return await obtener_estadisticas_liquidacion(client=client, current_user=current_user)

@router.get("/test-connection")
async def test_connection(
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
):
    """
    🔄 ACTUALIZADO: Test de conexión con nueva estructura
    """
    try:
        print(f"🔧 Test de conexión para: {current_user}")
        
        user_email = current_user.get("correo") or current_user.get("sub")
        employee_id = obtener_employee_id_usuario(user_email, client) if user_email else None
        
        # Test simple de conexión a BigQuery
        query = "SELECT 1 as test"
        result = client.query(query).result()
        rows = list(result)
        
        # Test de nueva tabla guias_liquidacion
        query_count = """
        SELECT 
            COUNT(*) as total_liquidacion,
            COUNT(CASE WHEN estado_liquidacion = 'disponible' THEN 1 END) as disponibles,
            COUNT(CASE WHEN estado_liquidacion = 'pagado' THEN 1 END) as pagadas
        FROM `datos-clientes-441216.Conciliaciones.guias_liquidacion`
        """
        result_count = client.query(query_count).result()
        count_rows = list(result_count)
        
        stats = count_rows[0] if count_rows else {"total_liquidacion": 0, "disponibles": 0, "pagadas": 0}
        
        return {
            "status": "ok",
            "user": {
                "email": user_email,
                "rol": current_user.get("rol"),
                "employee_id": employee_id
            },
            "bigquery_connection": "ok",
            "nueva_estructura": {
                "total_guias_liquidacion": int(stats["total_liquidacion"]),
                "guias_disponibles": int(stats["disponibles"]),
                "guias_pagadas": int(stats["pagadas"])
            },
            "test_query_result": rows[0]["test"] if rows else None,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"❌ Error en test de conexión: {e}")
        return {
            "status": "error",
            "error": str(e),
            "user": current_user,
            "timestamp": datetime.now().isoformat()
        }

# ✅ MANTENER ENDPOINTS EXISTENTES (compatibilidad hacia atrás)
@router.get("/pendientes/conductor/{correo_conductor}")
async def obtener_guias_pendientes_por_conductor(
    correo_conductor: str,
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """
    ✅ COMPATIBLE: Mantener para compatibilidad (usa estructura antigua)
    """
    try:
        # Verificar permisos
        user_email = current_user.get("correo") or current_user.get("sub")
        if user_email != correo_conductor and current_user["rol"] not in ["admin", "supervisor", "master"]:
            raise HTTPException(status_code=403, detail="No autorizado para ver guías de otro conductor")
        
        employee_id = obtener_employee_id_usuario(correo_conductor, client)
        
        if not employee_id:
            print(f"❌ Conductor {correo_conductor} no tiene Employee_id")
            return []
        
        # Usar COD_pendientes_v1 para estados que NO son 360 (compatible)
        query = """
        SELECT 
            tracking_number AS tracking,
            Empleado AS conductor,
            Cliente AS empresa,
            Valor AS valor,
            Status_Big as estado,
            Status_Date as fecha_estado,
            Employee_id,
            carrier_id,
            Carrier
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1`
        WHERE Valor > 0 
            AND Status_Big NOT LIKE '%Entregado%' 
            AND Status_Big NOT LIKE '%360%'
            AND Employee_id = @employee_id
        ORDER BY Status_Date DESC
        LIMIT 100
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id)
            ]
        )

        query_job = client.query(query, job_config=job_config)
        results = query_job.result()

        guias_pendientes = []
        for row in results:
            guia = {
                "tracking": row.tracking,
                "conductor": row.conductor,
                "empresa": row.empresa,
                "valor": int(row.valor),
                "estado": row.estado,
                "fecha_estado": row.fecha_estado.isoformat() if row.fecha_estado else None,
                "employee_id": row.Employee_id,
                "carrier_id": row.carrier_id,
                "carrier": row.Carrier
            }
            guias_pendientes.append(guia)

        print(f"✅ Guías encontradas para conductor {correo_conductor}: {len(guias_pendientes)}")
        return guias_pendientes

    except Exception as e:
        print(f"Error al obtener guías pendientes del conductor: {str(e)}")
        return []

@router.get("/mis-estadisticas")
async def obtener_estadisticas_conductor(
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    ✅ ALIAS: Redirigir al nuevo endpoint más completo
    """
    return await obtener_estadisticas_liquidacion(client=client, current_user=current_user)