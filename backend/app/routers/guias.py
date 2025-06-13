# ✅ CORRECCIÓN COMPLETA - guias.py

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from google.cloud import bigquery
from typing import List, Dict, Any, Optional
import os
from app.dependencies import get_current_user
from datetime import datetime, date

router = APIRouter()
PROJECT_ID = "datos-clientes-441216"
DATASET = "Conciliaciones"

router = APIRouter(prefix="/guias", tags=["Guías"])

def get_bigquery_client():
    """Obtiene el cliente de BigQuery"""
    return bigquery.Client()

def consumir_bono(employee_id, valor_a_usar, usuario, referencia_uso):
    client = bigquery.Client()
    # Obtiene bonos activos ordenados por antigüedad (FIFO)
    query = """
        SELECT id, saldo_disponible
        FROM `datos-clientes-441216.Conciliaciones.conductor_bonos`
        WHERE employee_id = @employee_id AND estado_bono = 'activo' AND saldo_disponible > 0
        ORDER BY fecha_generacion ASC
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id)]
    )
    bonos = list(client.query(query, job_config=job_config).result())
    restante = valor_a_usar
    for bono in bonos:
        bono_id = bono.id
        disponible = bono.saldo_disponible
        a_usar = min(disponible, restante)
        # Actualiza el bono
        update_query = """
            UPDATE `datos-clientes-441216.Conciliaciones.conductor_bonos`
            SET saldo_disponible = saldo_disponible - @a_usar,
                fecha_ultimo_uso = CURRENT_DATE(),
                fecha_modificacion = CURRENT_TIMESTAMP(),
                modificado_por = @usuario,
                estado_bono = CASE WHEN saldo_disponible - @a_usar <= 0 THEN 'usado' ELSE 'activo' END
            WHERE id = @bono_id
        """
        job_config_upd = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("a_usar", "FLOAT", a_usar),
                bigquery.ScalarQueryParameter("usuario", "STRING", usuario),
                bigquery.ScalarQueryParameter("bono_id", "STRING", bono_id)
            ]
        )
        client.query(update_query, job_config=job_config_upd).result()
        restante -= a_usar
        if restante <= 0:
            break
    if restante > 0:
        raise Exception("Saldo de bono insuficiente para cubrir lo solicitado")

def registrar_bono_excedente(employee_id, conductor_email, excedente, referencia_pago, descripcion, creado_por):
    client = bigquery.Client()
    table_id = "datos-clientes-441216.Conciliaciones.conductor_bonos"
    bono = {
        "id": f"BONO_{referencia_pago}_{employee_id}_{int(datetime.now().timestamp())}",
        "employee_id": employee_id,
        "conductor_email": conductor_email,
        "tipo_bono": "excedente_pago",
        "valor_bono": float(excedente),
        "saldo_disponible": float(excedente),
        "referencia_pago_origen": referencia_pago,
        "descripcion": descripcion,
        "fecha_generacion": date.today().isoformat(),
        "estado_bono": "activo",
        "fecha_ultimo_uso": None,
        "fecha_creacion": datetime.now().isoformat(),
        "fecha_modificacion": datetime.now().isoformat(),
        "creado_por": creado_por,
        "modificado_por": creado_por,
    }
    errors = client.insert_rows_json(table_id, [bono])
    if errors:
        print("❌ Error guardando bono excedente:", errors)
    else:
        print("✅ Bono excedente registrado correctamente")

def obtener_employee_id_usuario(correo: str, client: bigquery.Client) -> Optional[int]:
    """
    ✅ MEJORADO: Obtiene el Employee_id con múltiples estrategias
    """
    try:
        # Estrategia 1: Búsqueda en usuarios_BIG (tabla principal de usuarios)
        query1 = """
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
        
        result = client.query(query1, job_config=job_config).result()
        rows = list(result)
        
        if rows:
            employee_id = rows[0]["Employee_id"]
            print(f"✅ Employee_id encontrado en usuarios_BIG para {correo}: {employee_id}")
            return employee_id
        
        # Estrategia 2: Búsqueda en guias_liquidacion
        query2 = """
        SELECT DISTINCT employee_id
        FROM `datos-clientes-441216.Conciliaciones.guias_liquidacion`
        WHERE LOWER(conductor_email) = LOWER(@correo)
        LIMIT 1
        """
        
        result2 = client.query(query2, job_config=job_config).result()
        rows2 = list(result2)
        
        if rows2:
            employee_id = rows2[0]["employee_id"]
            print(f"✅ Employee_id encontrado en guias_liquidacion para {correo}: {employee_id}")
            return employee_id
            
        # Estrategia 3: Búsqueda en COD_pendientes_v1 como fallback
        query3 = """
        SELECT DISTINCT Employee_id
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1`
        WHERE LOWER(Empleado) LIKE LOWER(@correo_pattern)
        LIMIT 1
        """
        
        job_config3 = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo_pattern", "STRING", f"%{correo}%")
            ]
        )
        
        result3 = client.query(query3, job_config=job_config3).result()
        rows3 = list(result3)
        
        if rows3:
            employee_id = rows3[0]["Employee_id"]
            print(f"✅ Employee_id encontrado en COD_pendientes_v1 para {correo}: {employee_id}")
            return employee_id
        
        print(f"⚠️ No se encontró Employee_id para {correo}")
        return None
            
    except Exception as e:
        print(f"❌ Error obteniendo Employee_id: {e}")
        return None

@router.get("/pendientes")
def obtener_guias_pendientes(request: Request) -> Dict:
    """
    ✅ CORREGIDO: Endpoint principal para obtener guías pendientes de liquidación
    """
    print("🔍 ===== INICIO REQUEST GUIAS PENDIENTES (CORREGIDO) =====")

    usuario = request.headers.get("usuario")
    rol = request.headers.get("rol")

    if not usuario:
        return {"guias": [], "total": 0, "error": "Usuario no autenticado"}

    try:
        # Conexión a BigQuery
        client = bigquery.Client()

        # Obtener employee_id
        employee_id = obtener_employee_id_usuario(usuario, client)
        
        if not employee_id:
            print(f"❌ No se encontró employee_id para {usuario}")
            return {"guias": [], "total": 0, "error": "Employee_id no encontrado"}

        print(f"✅ Employee_id encontrado para {usuario}: {employee_id}")

        # ✅ QUERY CORREGIDA: Mapear correctamente los campos para el frontend
        query = """
            SELECT
                gl.tracking_number AS tracking,
                COALESCE(gl.conductor_nombre_completo, u.Employee_Name, 'Conductor') AS conductor,
                COALESCE(gl.cliente, 'XCargo') AS empresa,
                gl.valor_guia AS valor,
                gl.estado_liquidacion AS estado,
                CAST(NULL AS STRING) AS novedad,  -- Campo requerido por frontend
                gl.fecha_entrega,
                gl.carrier,
                gl.carrier_id,
                gl.ciudad,
                gl.departamento,
                gl.status_big,
                gl.status_date,
                gl.employee_id,
                gl.conductor_email,
                gl.pago_referencia,
                -- Generar liquidacion_id para el frontend
                CONCAT('LIQ_', gl.tracking_number, '_', gl.employee_id) AS liquidacion_id
            FROM `datos-clientes-441216.Conciliaciones.guias_liquidacion` gl
            LEFT JOIN `datos-clientes-441216.Conciliaciones.usuarios_BIG` u 
                ON u.Employee_id = gl.employee_id
            WHERE gl.estado_liquidacion = 'pendiente'  -- Solo disponibles para pago
              AND gl.employee_id = @employee_id
              AND gl.valor_guia > 0  -- Solo con valor
            ORDER BY gl.fecha_entrega DESC
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("employee_id", "INT64", employee_id)
            ]
        )

        result = client.query(query, job_config=job_config).result()

        guias = []
        for row in result:
            guias.append({
                "tracking": row.tracking,
                "conductor": row.conductor,
                "empresa": row.empresa,
                "valor": float(row.valor),
                "estado": row.estado,
                "novedad": row.novedad or "",
                "fecha_entrega": row.fecha_entrega.isoformat() if row.fecha_entrega else None,
                "carrier": row.carrier,
                "carrier_id": row.carrier_id,
                "ciudad": row.ciudad,
                "departamento": row.departamento,
                "status_big": row.status_big,
                "status_date": row.status_date.isoformat() if row.status_date else None,
                "employee_id": row.employee_id,
                "liquidacion_id": row.liquidacion_id,
                "pago_referencia": row.pago_referencia
            })

        print(f"✅ Guías encontradas: {len(guias)}")

        return {
            "guias": guias,
            "total": len(guias),
            "timestamp": datetime.utcnow().isoformat(),
            "employee_id": employee_id,
            "usuario": usuario
        }

    except Exception as e:
        print(f"❌ Error obteniendo guías pendientes: {e}")
        return {
            "guias": [],
            "total": 0,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }

@router.post("/sincronizar-guias-desde-cod")
async def sincronizar_guias_desde_cod_pendientes(
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    🔄 NUEVO: Sincroniza guías entregadas de COD_pendientes_v1 a guias_liquidacion
    """
    try:
        # Verificar permisos
        if current_user.get("rol") not in ["admin", "master"]:
            raise HTTPException(status_code=403, detail="Solo administradores pueden sincronizar")
        
        print("🔄 Iniciando sincronización desde COD_pendientes_v1...")
        
        # 1️⃣ INSERTAR nuevas guías entregadas que no estén en guias_liquidacion
        insert_query = """
        INSERT INTO `datos-clientes-441216.Conciliaciones.guias_liquidacion` (
            id,
            tracking_number,
            employee_id,
            conductor_email,
            cliente,
            valor_guia,
            fecha_entrega,
            estado_liquidacion,
            carrier,
            carrier_id,
            ciudad,
            departamento,
            status_big,
            status_date,
            conductor_nombre_completo,
            fecha_creacion,
            creado_por
        )
        SELECT 
            CONCAT('SYNC_', UNIX_MILLIS(CURRENT_TIMESTAMP()), '_', ROW_NUMBER() OVER(ORDER BY cod.tracking_number)) as id,
            cod.tracking_number,
            cod.Employee_id,
            COALESCE(u.Employee_Mail, CONCAT('conductor_', CAST(cod.Employee_id AS STRING), '@unknown.com')) as conductor_email,
            cod.Cliente,
            CAST(cod.Valor AS FLOAT64),
            DATE(cod.Status_Date) as fecha_entrega,
            'disponible' as estado_liquidacion,
            cod.Carrier,
            cod.carrier_id,
            cod.Ciudad,
            cod.Departamento,
            cod.Status_Big,
            cod.Status_Date,
            cod.Empleado,
            CURRENT_TIMESTAMP(),
            @usuario
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` cod
        LEFT JOIN `datos-clientes-441216.Conciliaciones.usuarios_BIG` u 
            ON u.Employee_id = cod.Employee_id
        LEFT JOIN `datos-clientes-441216.Conciliaciones.guias_liquidacion` gl
            ON gl.tracking_number = cod.tracking_number
        WHERE cod.Status_Big = '360 - Entregado al cliente'
            AND cod.Valor > 0
            AND gl.tracking_number IS NULL  -- Solo las que NO existen
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("usuario", "STRING", current_user.get("correo", "admin"))
            ]
        )
        
        result = client.query(insert_query, job_config=job_config).result()
        
        # 2️⃣ ACTUALIZAR guías existentes con nueva información de COD_pendientes_v1
        update_query = """
        UPDATE `datos-clientes-441216.Conciliaciones.guias_liquidacion` AS gl
        SET 
            cliente = cod.Cliente,
            valor_guia = CAST(cod.Valor AS FLOAT64),
            ciudad = cod.Ciudad,
            departamento = cod.Departamento,
            status_big = cod.Status_Big,
            status_date = cod.Status_Date,
            carrier = cod.Carrier,
            carrier_id = cod.carrier_id,
            conductor_nombre_completo = cod.Empleado,
            fecha_modificacion = CURRENT_TIMESTAMP(),
            modificado_por = @usuario
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` AS cod
        WHERE gl.tracking_number = cod.tracking_number
          AND cod.Status_Big = '360 - Entregado al cliente'
          AND gl.estado_liquidacion = 'disponible'  -- Solo actualizar disponibles
        """
        
        client.query(update_query, job_config=job_config).result()
        
        # 3️⃣ Contar las nuevas guías sincronizadas
        count_query = """
        SELECT COUNT(*) as nuevas_guias
        FROM `datos-clientes-441216.Conciliaciones.guias_liquidacion`
        WHERE DATE(fecha_creacion) = CURRENT_DATE()
            AND creado_por = @usuario
        """
        
        count_result = list(client.query(count_query, job_config=job_config).result())[0]
        nuevas_guias = count_result.nuevas_guias if count_result.nuevas_guias else 0
        
        return {
            "mensaje": f"Sincronización completada exitosamente",
            "nuevas_guias": nuevas_guias,
            "fecha_sincronizacion": datetime.now().isoformat(),
            "ejecutado_por": current_user.get("correo", "admin"),
            "proceso": "sync_cod_to_liquidacion"
        }
        
    except Exception as e:
        print(f"❌ Error en sincronización: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/bonos-disponibles")
async def obtener_bonos_disponibles(
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    ✅ MANTENER: Obtiene los bonos disponibles del conductor
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
        print(f"❌ Error obteniendo bonos: {e}")
        return {
            "bonos": [],
            "total_disponible": 0,
            "error": str(e)
        }







@router.post("/verificar-datos-conductor")
async def verificar_datos_conductor(
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    🔍 DEBUG: Verifica la consistencia de datos del conductor
    """
    try:
        user_email = current_user.get("correo") or current_user.get("sub")
        employee_id = obtener_employee_id_usuario(user_email, client)
        
        if not employee_id:
            return {"error": "Conductor no encontrado en ninguna tabla"}
        
        # Verificar datos en usuarios_BIG
        query_usuario = """
        SELECT Employee_id, Employee_Name, Employee_Mail
        FROM `datos-clientes-441216.Conciliaciones.usuarios_BIG`
        WHERE Employee_id = @employee_id
        """
        
        # Verificar datos en guias_liquidacion
        query_guias = """
        SELECT 
            COUNT(*) as total_guias,
            COUNT(CASE WHEN estado_liquidacion = 'disponible' THEN 1 END) as disponibles,
            COUNT(CASE WHEN estado_liquidacion = 'pagado' THEN 1 END) as pagadas,
            MIN(fecha_entrega) as primera_entrega,
            MAX(fecha_entrega) as ultima_entrega,
            SUM(CASE WHEN estado_liquidacion = 'disponible' THEN valor_guia ELSE 0 END) as valor_disponible
        FROM `datos-clientes-441216.Conciliaciones.guias_liquidacion`
        WHERE employee_id = @employee_id
        """
        
        # Verificar datos en COD_pendientes_v1 para comparación
        query_cod = """
        SELECT 
            COUNT(*) as total_cod,
            COUNT(CASE WHEN Status_Big = '360 - Entregado al cliente' THEN 1 END) as entregadas_cod
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1`
        WHERE Employee_id = @employee_id
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id)
            ]
        )
        
        usuario_result = list(client.query(query_usuario, job_config=job_config).result())
        guias_result = list(client.query(query_guias, job_config=job_config).result())
        cod_result = list(client.query(query_cod, job_config=job_config).result())
        
        return {
            "employee_id": employee_id,
            "email_consultado": user_email,
            "datos_usuario": dict(usuario_result[0]) if usuario_result else None,
            "estadisticas_guias_liquidacion": dict(guias_result[0]) if guias_result else None,
            "estadisticas_cod_pendientes": dict(cod_result[0]) if cod_result else None,
            "estado": "ok" if usuario_result else "usuario_no_encontrado",
            "necesita_sincronizacion": (cod_result and cod_result[0]['entregadas_cod'] > 
                                      (guias_result[0]['total_guias'] if guias_result else 0)),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {"error": str(e), "timestamp": datetime.now().isoformat()}

# ✅ MANTENER ENDPOINTS EXISTENTES PARA COMPATIBILIDAD
@router.get("/estadisticas-liquidacion")
async def obtener_estadisticas_liquidacion(
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    ✅ MANTENER: Estadísticas usando la estructura de guias_liquidacion
    """
    try:
        user_email = current_user.get("correo") or current_user.get("sub")
        employee_id = obtener_employee_id_usuario(user_email, client)
        
        if not employee_id:
            return {"error": "Conductor no encontrado"}
        
        query = """
        SELECT 
            COUNT(*) as total_guias,
            SUM(valor_guia) as valor_total,
            COUNT(CASE WHEN estado_liquidacion = 'disponible' THEN 1 END) as disponibles,
            COUNT(CASE WHEN estado_liquidacion = 'pagado' THEN 1 END) as pagadas,
            COUNT(CASE WHEN estado_liquidacion = 'procesando' THEN 1 END) as procesando,
            SUM(CASE WHEN estado_liquidacion = 'disponible' THEN valor_guia ELSE 0 END) as valor_disponible,
            SUM(CASE WHEN estado_liquidacion = 'pagado' THEN valor_guia ELSE 0 END) as valor_pagado,
            COUNT(DISTINCT cliente) as clientes_unicos,
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
        print(f"❌ Error obteniendo estadísticas: {e}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo estadísticas: {str(e)}")