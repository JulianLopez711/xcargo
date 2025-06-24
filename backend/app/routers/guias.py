# ✅ CORRECCIÓN COMPLETA - guias.py

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from google.cloud import bigquery
from typing import List, Dict, Any, Optional
import os
from app.dependencies import get_current_user
from datetime import datetime, date
from uuid import uuid4
import json

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
    ✅ VALIDADO: Endpoint para obtener guías pendientes de liquidación
    
    VALIDACIONES APLICADAS:
    - Solo guías en estado '360 - Entregado al cliente' de COD_pendientes_v1
    - Excluye guías ya pagadas/liquidadas en guias_liquidacion
    - Incluye guías desde el 9 de junio de 2025 en adelante
    - Combina guías de ambas tablas que estén pendientes de pago
    
    Returns:
        - Guías de guias_liquidacion con estado 'pendiente' o 'disponible'
        - Guías de COD_pendientes_v1 que no estén marcadas como pagadas
    """
    print("🔍 ===== INICIO REQUEST GUIAS PENDIENTES (CORREGIDO) =====")
    FECHA_INICIO = "2025-06-09"  # Fecha desde la cual queremos las guías

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

        print(f"✅ Employee_id encontrado para {usuario}: {employee_id}")        # ✅ QUERY MEJORADA: Validación más estricta para evitar duplicados y asegurar solo estado 360 pendiente
        query = """
        WITH GuiasCombinadas AS (
            -- 1️⃣ Guías de guias_liquidacion que están PENDIENTES (no pagadas)
            SELECT
                gl.tracking_number AS tracking,
                COALESCE(gl.conductor_nombre_completo, u.Employee_Name, 'Conductor') AS conductor,
                COALESCE(gl.cliente, 'XCargo') AS empresa,
                gl.valor_guia AS valor,
                gl.estado_liquidacion AS estado,
                CAST(NULL AS STRING) AS novedad,
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
                CONCAT('LIQ_', gl.tracking_number, '_', gl.employee_id) AS liquidacion_id,
                'guias_liquidacion' as origen
            FROM `datos-clientes-441216.Conciliaciones.guias_liquidacion` gl
            LEFT JOIN `datos-clientes-441216.Conciliaciones.usuarios_BIG` u 
                ON u.Employee_id = gl.employee_id            WHERE gl.estado_liquidacion IN ('pendiente', 'disponible')  -- ✅ Solo pendientes (ya excluye pagadas)
                AND gl.employee_id = @employee_id
                AND gl.valor_guia > 0
                AND DATE(gl.fecha_entrega) >= @fecha_inicio

            UNION ALL

            -- 2️⃣ Guías de COD_pendientes_v1 con estado 360 que NO estén pagadas en guias_liquidacion
            SELECT
                cod.tracking_number AS tracking,
                COALESCE(cod.Empleado, u.Employee_Name, 'Conductor') AS conductor,
                COALESCE(cod.Cliente, 'XCargo') AS empresa,
                CAST(cod.Valor AS FLOAT64) AS valor,
                'pendiente' AS estado,
                CAST(NULL AS STRING) AS novedad,
                DATE(cod.Status_Date) as fecha_entrega,
                cod.Carrier as carrier,
                cod.carrier_id,
                cod.Ciudad as ciudad,
                cod.Departamento as departamento,
                cod.Status_Big as status_big,
                cod.Status_Date as status_date,
                cod.Employee_id as employee_id,
                COALESCE(u.Employee_Mail, '') as conductor_email,
                NULL as pago_referencia,
                CONCAT('COD_', cod.tracking_number, '_', cod.Employee_id) AS liquidacion_id,
                'cod_pendientes' as origen
            FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` cod
            LEFT JOIN `datos-clientes-441216.Conciliaciones.usuarios_BIG` u 
                ON u.Employee_id = cod.Employee_id            LEFT JOIN `datos-clientes-441216.Conciliaciones.guias_liquidacion` gl
                ON gl.tracking_number = cod.tracking_number 
                AND gl.employee_id = cod.Employee_id  -- ✅ Validar también employee_id
            LEFT JOIN `datos-clientes-441216.Conciliaciones.pagosconductor` pc
                ON pc.tracking = cod.tracking_number  -- ✅ Validar también contra pagos registrados
            WHERE cod.Status_Big = '360 - Entregado al cliente'  -- ✅ Solo estado 360
                AND cod.Employee_id = @employee_id
                AND cod.Valor > 0
                AND DATE(cod.Status_Date) >= @fecha_inicio
                AND pc.tracking IS NULL  -- ✅ NO debe existir pago registrado
                AND (
                    gl.tracking_number IS NULL  -- ✅ No existe en liquidacion
                    OR (gl.tracking_number IS NOT NULL 
                        AND gl.estado_liquidacion NOT IN ('pagado', 'liquidado', 'procesado'))  -- ✅ O existe pero no está pagada
                )
        ),
        GuiasLimpias AS (
            -- 3️⃣ Eliminar duplicados por tracking_number, priorizando guias_liquidacion
            SELECT DISTINCT
                tracking,
                conductor,
                empresa,
                valor,
                estado,
                novedad,
                fecha_entrega,
                carrier,
                carrier_id,
                ciudad,
                departamento,
                status_big,
                status_date,
                employee_id,
                conductor_email,
                pago_referencia,
                liquidacion_id,
                origen,
                -- Priorizar guias_liquidacion sobre cod_pendientes
                ROW_NUMBER() OVER (
                    PARTITION BY tracking 
                    ORDER BY 
                        CASE WHEN origen = 'guias_liquidacion' THEN 1 ELSE 2 END,
                        fecha_entrega DESC
                ) as rn
            FROM GuiasCombinadas
        )
        SELECT * EXCEPT(rn) 
        FROM GuiasLimpias 
        WHERE rn = 1  -- ✅ Solo la primera ocurrencia de cada tracking
        ORDER BY fecha_entrega DESC
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("employee_id", "INT64", employee_id),
                bigquery.ScalarQueryParameter("fecha_inicio", "DATE", FECHA_INICIO)
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
                "pago_referencia": row.pago_referencia,                "origen": row.origen
            })

        print(f"✅ Total de guías encontradas desde {FECHA_INICIO}: {len(guias)}")
        print(f"✅ Guías pendientes de liquidacion: {sum(1 for g in guias if g['origen'] == 'guias_liquidacion')}")
        print(f"✅ Guías entregadas no pagadas de COD: {sum(1 for g in guias if g['origen'] == 'cod_pendientes')}")
          # Validación: Solo guías con estado 360 de COD que no estén pagadas
        guias_validadas = [g for g in guias if g['estado'] in ['pendiente', 'disponible']]

        return {
            "guias": guias_validadas,  # Usando guías validadas
            "total": len(guias_validadas),
            "timestamp": datetime.utcnow().isoformat(),
            "employee_id": employee_id,
            "usuario": usuario,
            "fecha_inicio": FECHA_INICIO,
            "desglose": {
                "guias_liquidacion": sum(1 for g in guias_validadas if g['origen'] == 'guias_liquidacion'),
                "cod_pendientes": sum(1 for g in guias_validadas if g['origen'] == 'cod_pendientes')
            },
            "validacion": {
                "solo_estado_360": True,
                "excluye_pagadas": True,
                "desde_fecha": FECHA_INICIO,
                "estados_incluidos": ["pendiente", "disponible"]
            }
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

def crear_bono_conductor(
    employee_id: int,
    conductor_email: str,
    valor_bono: float,
    tipo_bono: str,
    referencia_pago: str,
    descripcion: str,
    creado_por: str,
    client: bigquery.Client
) -> Dict[str, Any]:
    """
    Crea un nuevo bono para un conductor
    """
    try:
        # Validar límite de bonos activos
        query_limite = """
        SELECT SUM(saldo_disponible) as total_bonos
        FROM `datos-clientes-441216.Conciliaciones.conductor_bonos`
        WHERE employee_id = @employee_id
        AND estado_bono = 'activo'
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id)
            ]
        )
        
        result = client.query(query_limite, job_config=job_config).result()
        total_actual = next(iter(result)).total_bonos or 0
        
        if total_actual + valor_bono > 800000:
            raise Exception(
                f"El conductor ya tiene ${total_actual:,.0f} en bonos activos. " +
                f"No se puede generar un bono adicional de ${valor_bono:,.0f} " +
                "porque excedería el límite de $800,000"
            )
        
        # Crear nuevo bono
        bono = {
            "id": f"BONO_{uuid4()}",
            "employee_id": employee_id,
            "conductor_email": conductor_email,
            "tipo_bono": tipo_bono,
            "valor_bono": valor_bono,
            "saldo_disponible": valor_bono,
            "referencia_pago_origen": referencia_pago,
            "descripcion": descripcion,
            "fecha_generacion": datetime.now().date().isoformat(),
            "estado_bono": "activo",
            "fecha_ultimo_uso": None,
            "fecha_creacion": datetime.now().isoformat(),
            "fecha_modificacion": datetime.now().isoformat(),
            "creado_por": creado_por,
            "modificado_por": creado_por
        }
        
        table_id = f"{PROJECT_ID}.{DATASET}.conductor_bonos"
        errors = client.insert_rows_json(table_id, [bono])
        
        if errors:
            raise Exception(f"Error guardando bono: {errors}")
            
        # Registrar movimiento inicial
        movimiento = {
            "id": f"MOV_{uuid4()}",
            "bono_id": bono["id"],
            "tipo_movimiento": "GENERACION",
            "valor_movimiento": valor_bono,
            "saldo_anterior": 0,
            "saldo_nuevo": valor_bono,
            "fecha_movimiento": datetime.now().isoformat(),
            "creado_por": creado_por,
            "guias_aplicadas": None
        }
        
        table_id = f"{PROJECT_ID}.{DATASET}.bono_movimientos"
        errors = client.insert_rows_json(table_id, [movimiento])
        
        if errors:
            raise Exception(f"Error registrando movimiento: {errors}")
            
        return bono
        
    except Exception as e:
        raise Exception(f"Error creando bono: {str(e)}")

def usar_bono(
    bono_id: str,
    monto_uso: float,
    guias: List[Dict],
    usuario: str,
    client: bigquery.Client
) -> Dict[str, Any]:
    """
    Registra el uso de un bono
    """
    try:
        # Verificar bono
        query = """
        SELECT *
        FROM `datos-clientes-441216.Conciliaciones.conductor_bonos`
        WHERE id = @bono_id
        AND estado_bono = 'activo'
        AND saldo_disponible >= @monto_uso
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("bono_id", "STRING", bono_id),
                bigquery.ScalarQueryParameter("monto_uso", "FLOAT", monto_uso)
            ]
        )
        
        result = client.query(query, job_config=job_config).result()
        bono = next(iter(result), None)
        
        if not bono:
            raise Exception("Bono no encontrado o saldo insuficiente")
            
        # Actualizar saldo
        update_query = """
        UPDATE `datos-clientes-441216.Conciliaciones.conductor_bonos`
        SET 
            saldo_disponible = saldo_disponible - @monto_uso,
            fecha_ultimo_uso = CURRENT_DATE(),
            fecha_modificacion = CURRENT_TIMESTAMP(),
            modificado_por = @usuario,
            estado_bono = CASE 
                WHEN saldo_disponible - @monto_uso <= 0 THEN 'agotado'
                ELSE 'activo'
            END
        WHERE id = @bono_id
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("monto_uso", "FLOAT", monto_uso),
                bigquery.ScalarQueryParameter("usuario", "STRING", usuario),
                bigquery.ScalarQueryParameter("bono_id", "STRING", bono_id)
            ]
        )
        
        update_job = client.query(update_query, job_config=job_config)
        update_job.result()
        
        # Registrar movimiento
        movimiento = {
            "id": f"MOV_{uuid4()}",
            "bono_id": bono_id,
            "tipo_movimiento": "USO",
            "valor_movimiento": -monto_uso,
            "saldo_anterior": float(bono.saldo_disponible),
            "saldo_nuevo": float(bono.saldo_disponible) - monto_uso,
            "fecha_movimiento": datetime.now().isoformat(),
            "creado_por": usuario,
            "guias_aplicadas": json.dumps(guias)
        }
        
        table_id = f"{PROJECT_ID}.{DATASET}.bono_movimientos"
        errors = client.insert_rows_json(table_id, [movimiento])
        
        if errors:
            raise Exception(f"Error registrando movimiento: {errors}")
            
        return {
            "mensaje": "Bono usado exitosamente",
            "monto_usado": monto_uso,
            "saldo_restante": float(bono.saldo_disponible) - monto_uso
        }
        
    except Exception as e:
        raise Exception(f"Error usando bono: {str(e)}")

def verificar_vencimiento_bonos(client: bigquery.Client):
    """
    Verifica y marca como vencidos los bonos que han superado los 90 días
    """
    try:
        query = """
        UPDATE `datos-clientes-441216.Conciliaciones.conductor_bonos`
        SET 
            estado_bono = 'vencido',
            fecha_modificacion = CURRENT_TIMESTAMP(),
            modificado_por = 'sistema'
        WHERE estado_bono = 'activo'
        AND DATE_DIFF(CURRENT_DATE(), fecha_generacion, DAY) > 90
        """
        
        job = client.query(query)
        job.result()
        
        # Obtener cantidad de bonos vencidos
        count_query = """
        SELECT COUNT(*) as vencidos
        FROM `datos-clientes-441216.Conciliaciones.conductor_bonos`
        WHERE estado_bono = 'vencido'
        AND DATE(fecha_modificacion) = CURRENT_DATE()        """
        
        result = client.query(count_query).result()
        vencidos = next(iter(result)).vencidos
        
        if vencidos > 0:
            print(f"✅ {vencidos} bonos marcados como vencidos")
            
    except Exception as e:
        print(f"❌ Error verificando vencimiento de bonos: {str(e)}")
        raise Exception(f"Error en verificación de vencimientos: {str(e)}")

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

@router.get("/validar-guias-estado-360")
async def validar_guias_estado_360(
    request: Request,
    client: bigquery.Client = Depends(get_bigquery_client)
) -> Dict[str, Any]:
    """
    🔍 VALIDACIÓN ESPECÍFICA: Verifica que solo se traigan guías con estado 360 
    de COD_pendientes_v1 que NO estén pagadas en guias_liquidacion
    """
    usuario = request.headers.get("usuario")
    
    if not usuario:
        return {"error": "Usuario no autenticado"}
    
    try:
        employee_id = obtener_employee_id_usuario(usuario, client)
        
        if not employee_id:
            return {"error": "Employee_id no encontrado"}
        
        # Query de validación específica
        query_validacion = """
        SELECT 
            cod.tracking_number,
            cod.Status_Big,
            cod.Valor,
            DATE(cod.Status_Date) as fecha_entrega,
            gl.estado_liquidacion,
            CASE 
                WHEN gl.tracking_number IS NULL THEN 'NO_EN_LIQUIDACION'
                WHEN gl.estado_liquidacion IN ('pagado', 'liquidado', 'procesado') THEN 'YA_PAGADA'
                ELSE 'PENDIENTE_OK'
            END as estado_validacion
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` cod
        LEFT JOIN `datos-clientes-441216.Conciliaciones.guias_liquidacion` gl
            ON gl.tracking_number = cod.tracking_number
        WHERE cod.Employee_id = @employee_id
            AND DATE(cod.Status_Date) >= '2025-06-09'
            AND cod.Valor > 0
        ORDER BY 
            CASE 
                WHEN cod.Status_Big = '360 - Entregado al cliente' THEN 1 
                ELSE 2 
            END,
            cod.Status_Date DESC
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("employee_id", "INT64", employee_id)
            ]
        )
        
        result = client.query(query_validacion, job_config=job_config).result()
        
        guias_validacion = []
        estado_360_pendientes = 0
        estado_360_pagadas = 0
        otros_estados = 0
        
        for row in result:
            guia_info = {
                "tracking": row.tracking_number,
                "status_big": row.Status_Big,
                "valor": float(row.Valor),
                "fecha_entrega": row.fecha_entrega.isoformat(),
                "estado_liquidacion": row.estado_liquidacion,
                "estado_validacion": row.estado_validacion,
                "incluir_en_pendientes": (
                    row.Status_Big == '360 - Entregado al cliente' and 
                    row.estado_validacion in ['NO_EN_LIQUIDACION', 'PENDIENTE_OK']
                )
            }
            guias_validacion.append(guia_info)
            
            # Contadores
            if row.Status_Big == '360 - Entregado al cliente':
                if row.estado_validacion in ['NO_EN_LIQUIDACION', 'PENDIENTE_OK']:
                    estado_360_pendientes += 1
                else:
                    estado_360_pagadas += 1
            else:
                otros_estados += 1
        
        return {
            "employee_id": employee_id,
            "usuario": usuario,
            "total_guias_desde_9_junio": len(guias_validacion),
            "resumen_validacion": {
                "estado_360_pendientes": estado_360_pendientes,
                "estado_360_ya_pagadas": estado_360_pagadas,
                "otros_estados": otros_estados
            },
            "criterios_validacion": {
                "solo_estado_360": "✅ Solo guías con estado '360 - Entregado al cliente'",
                "excluir_pagadas": "✅ Excluye las marcadas como pagadas en liquidacion",
                "desde_9_junio": "✅ Desde 9 de junio de 2025 en adelante",
                "valor_mayor_a_cero": "✅ Solo guías con valor > 0"
            },
            "guias_detalle": guias_validacion[:10],  # Muestra solo las primeras 10 para no sobrecargar
            "total_mostrado": min(10, len(guias_validacion)),
            "validacion_exitosa": estado_360_pendientes > 0,
            "mensaje": f"Se encontraron {estado_360_pendientes} guías con estado 360 pendientes de liquidación"
        }
        
    except Exception as e:
        return {
            "error": str(e),
            "validacion_exitosa": False,
            "timestamp": datetime.now().isoformat()
        }