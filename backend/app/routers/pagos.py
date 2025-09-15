from fastapi import APIRouter, Form, UploadFile, File, HTTPException, Body, Query, Depends, status, Request
from fastapi import Query as FastAPIQuery
from typing import List
from fastapi.responses import JSONResponse
from google.cloud import bigquery
from google.api_core import exceptions as gcp_exceptions
from typing import Optional, Dict, Any, List
from datetime import datetime, date
from uuid import uuid4
import pandas as pd
import os
import json
import traceback
import logging
import concurrent.futures
from pathlib import Path
from app.dependencies import get_current_user
from pydantic import BaseModel
from .guias import obtener_employee_id_usuario

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pagos", tags=["Pagos"])

# Configuración
PROJECT_ID = "datos-clientes-441216"
DATASET_CONCILIACIONES = "Conciliaciones"
COMPROBANTES_DIR = "comprobantes"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB para comprobantes

# Crear directorio de comprobantes si no existe
os.makedirs(COMPROBANTES_DIR, exist_ok=True)

def get_bigquery_client() -> bigquery.Client:
    """Obtiene cliente de BigQuery con manejo de errores"""
    try:
        return bigquery.Client(project=PROJECT_ID)
    except Exception as e:
        
        raise HTTPException(
            status_code=500, 
            detail="Error de configuración de base de datos"
        )

def validar_archivo_comprobante(archivo: UploadFile) -> None:
    """Valida que el archivo de comprobante sea válido"""
    
    # Validar tamaño
    if hasattr(archivo, 'size') and archivo.size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Archivo demasiado grande. Máximo: {MAX_FILE_SIZE // (1024*1024)}MB"
        )
    
    # Validar tipo de archivo
    extensiones_permitidas = {'.jpg', '.jpeg', '.png', '.pdf', '.webp'}
    if archivo.filename:
        extension = Path(archivo.filename).suffix.lower()
        if extension not in extensiones_permitidas:
            raise HTTPException(
                status_code=400,
                detail=f"Tipo de archivo no permitido. Permitidos: {', '.join(extensiones_permitidas)}"
            )
    else:
        raise HTTPException(status_code=400, detail="Nombre de archivo requerido")

async def guardar_comprobante(archivo: UploadFile) -> str:
    """Guarda el comprobante de pago y retorna la URL"""
    
    validar_archivo_comprobante(archivo)
    
    # Generar nombre único
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    extension = Path(archivo.filename).suffix.lower()
    nombre_archivo = f"{uuid4()}_{timestamp}{extension}"
    ruta_local = os.path.join(COMPROBANTES_DIR, nombre_archivo)
    
    try:
        
        # Crear directorio si no existe
        os.makedirs(COMPROBANTES_DIR, exist_ok=True)
        
        
        # Leer contenido
        content = await archivo.read()
       
        
        if len(content) == 0:
            
            raise ValueError("Archivo vacío")
        
        # Guardar archivo
        with open(ruta_local, "wb") as f:
            bytes_written = f.write(content)
       
        
        # Verificar que se guardó correctamente
        if not os.path.exists(ruta_local):

            raise FileNotFoundError(f"No se pudo guardar: {ruta_local}")
        
        # Verificar tamaño y permisos
        file_stat = os.stat(ruta_local)
        
        
        # Establecer permisos correctos
        os.chmod(ruta_local, 0o644)
        
        # URL para acceso
        comprobante_url = f"http://127.0.0.1:8000/static/{nombre_archivo}"
  
        
        return comprobante_url
        
    except Exception as e:

        # Limpiar archivo si hay error
        if os.path.exists(ruta_local):
            try:
                os.remove(ruta_local)

            except:
                pass
        raise HTTPException(
            status_code=500,
            detail=f"Error guardando comprobante de pago: {str(e)}"
        )



@router.post("/registrar-conductor")
async def registrar_pago_conductor(
    request: Request,
    correo: str = Form(..., description="Correo del conductor"),
    valor_pago_str: str = Form(..., description="Valor total del pago"),
    fecha_pago: str = Form(..., description="Fecha del pago (YYYY-MM-DD)"),
    hora_pago: str = Form(..., description="Hora del pago (HH:MM)"),
    tipo: str = Form(..., description="Tipo de pago (Transferencia, Nequi, etc.)"),
    entidad: str = Form(..., description="Entidad bancaria"),
    referencia: str = Form(..., description="Referencia única del pago"),
    guias: str = Form(..., description="JSON con las guías asociadas"),
    comprobante: UploadFile = File(None, description="Imagen/PDF del comprobante (compatibilidad)")
):
    """
    Registra un pago realizado por un conductor con validaciones robustas
    """
    client = get_bigquery_client()
    comprobante_urls = []
    # LOG: Mostrar los campos recibidos
    logger.info(f"Campos recibidos: correo={correo}, valor_pago_str={valor_pago_str}, fecha_pago={fecha_pago}, hora_pago={hora_pago}, tipo={tipo}, entidad={entidad}, referencia={referencia}")
    logger.info(f"Archivos recibidos: {request.headers.get('content-type')}")
    # Obtener todos los archivos enviados como comprobante_0, comprobante_1, ...
    form = await request.form()
    archivos = []
    tipos_individuales = []
    
    for key in form.keys():
        if key.startswith("comprobante_"):
            archivos.append(form[key])
        elif key.startswith("tipo_comprobante_"):
            # Capturar tipos individuales enviados desde el frontend
            tipos_individuales.append(form[key])
    
    # Si no hay múltiples, usar el comprobante único (para compatibilidad)
    if not archivos and comprobante is not None:
        archivos = [comprobante]
    
    logger.info(f"Total comprobantes recibidos: {len(archivos)}")
    logger.info(f"Tipos individuales recibidos: {tipos_individuales}")
    
    # 🔥 LOG DETALLADO PARA DEBUGGING
    logger.info("🔍 ANÁLISIS DE TIPOS RECIBIDOS EN BACKEND:")
    for idx, tipo_individual in enumerate(tipos_individuales):
        logger.info(f"   - tipo_comprobante_{idx}: {tipo_individual}")
    logger.info(f"   - Tipo principal (compatibilidad): {tipo}")

    # Obtener el nuevo Id_Transaccion autoincrementable SOLO UNA VEZ POR LOTE (request)
    # Todas las guías asociadas en este request compartirán el mismo Id_Transaccion
    query_id = f"SELECT MAX(Id_Transaccion) as max_id FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`"
    result_id = list(client.query(query_id).result())
    nuevo_id_transaccion = (result_id[0].max_id or 0) + 1
    # Este valor se asigna a todas las filas generadas en este request, sin incrementarse por cada inserción

    try:
        try:
            valor_pago = float(valor_pago_str.replace(',', '').replace('$', ''))
            if valor_pago <= 0:
                raise ValueError("El valor debe ser mayor a cero")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Valor de pago inválido: {e}")

        # Validar fecha
        try:
            fecha_obj = datetime.strptime(fecha_pago, "%Y-%m-%d").date()
            if fecha_obj > date.today():
                raise HTTPException(status_code=400, detail="La fecha no puede ser futura")
            elif fecha_obj <= date(2025, 6, 8):
                raise HTTPException(status_code=400, detail="La fecha no puede ser anterior a 2025-06-09")
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha inválido (YYYY-MM-DD)")

        # Validar hora
        try:
            # Intentar parsear como HH:MM
            hora_obj = datetime.strptime(hora_pago, "%H:%M")
            # Convertir a formato HH:MM:SS para BigQuery
            hora_pago = hora_obj.strftime("%H:%M:%S")
            
        except ValueError:
            try:
                # Si falla, intentar como HH:MM:SS
                datetime.strptime(hora_pago, "%H:%M:%S")
                # Ya está en formato correcto
            except ValueError:
                raise HTTPException(status_code=400, detail="Formato de hora inválido (HH:MM o HH:MM:SS)")
        # PASO 2: Validar referencia única
        
        verificacion_ref = client.query("""
                SELECT COUNT(*) as total
                FROM `{project}.{dataset}.pagosconductor`
                WHERE referencia_pago = @referencia
                AND valor_total_consignacion = @valor
                AND fecha_pago = @fecha
                AND hora_pago = @hora
            """.format(project=PROJECT_ID, dataset=DATASET_CONCILIACIONES),
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("referencia", "STRING", referencia),
                        bigquery.ScalarQueryParameter("valor", "FLOAT64", valor_pago),
                        bigquery.ScalarQueryParameter("fecha", "DATE", fecha_pago),
                        bigquery.ScalarQueryParameter("hora", "TIME", hora_pago),
                    ]
                )
            ).result()



        if next(verificacion_ref)["total"] > 0:
            raise HTTPException(
                status_code=409,
                detail="Ya existe un pago registrado con esa referencia"
            )

        try:
            lista_guias = json.loads(guias)
            # LOG: Mostrar referencias y trackings recibidos
            logger.info(f"Referencias de pago recibidas: {[g.get('referencia') for g in lista_guias]}")
            logger.info(f"Trackings de guías recibidas: {[g.get('tracking') for g in lista_guias]}")
            if not lista_guias:
                raise HTTPException(status_code=400, detail="Debe asociar al menos una guía")
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Formato de guías inválido (JSON requerido)")

        # PASO 5: 🔥 CORREGIDO: Obtener trackings únicos para consultar COD_pendientes_v1
        trackings_guias = []
        for guia in lista_guias:
            tracking = str(guia.get("tracking", "")).strip()
            if tracking and tracking not in ["null", "none", "", "undefined"]:
                trackings_guias.append(tracking)
        
        # Eliminar duplicados manteniendo el orden
        trackings_unicos = list(dict.fromkeys(trackings_guias))
        
        if not trackings_unicos:
            raise HTTPException(status_code=400, detail="No se encontraron trackings válidos en las guías")

        logger.info(f"📊 Trackings únicos para consultar COD_pendientes_v1: {trackings_unicos}")
        
        trackings_str = "', '".join(trackings_unicos)

        # 🔥 CORREGIDO: Usar trackings para buscar en COD_pendientes_v1
        query_clientes = f"""
            SELECT 
                tracking_number,
                Cliente as cliente, 
                Ciudad as ciudad,
                Departamento as departamento,
                Valor as valor,
                Status_Date as status_date,
                Status_Big as status_big,
                Carrier as carrier,
                carrier_id,
                Empleado as conductor_nombre_completo,
                Employee_id as employee_id
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1`
            WHERE tracking_number IN ('{trackings_str}')
        """

        try:
            resultado_clientes = client.query(query_clientes).result()
            clientes_data = {
                row["tracking_number"]: {
                    "cliente": row["cliente"],
                    "ciudad": row["ciudad"],
                    "departamento": row["departamento"],
                    "valor": row["valor"],  # 🔥 Este será el valor de COD_pendientes_v1.Valor
                    "status_date": row["status_date"],
                    "status_big": row["status_big"],
                    "carrier": row["carrier"],
                    "carrier_id": row["carrier_id"],
                    "conductor_nombre_completo": row["conductor_nombre_completo"],
                    "employee_id": row["employee_id"]
                } for row in resultado_clientes
            }
            
            # 🔥 NUEVO: Logging para verificar que se obtuvieron datos de BD por tracking
            logger.info(f"📊 Trackings encontrados en COD_pendientes_v1: {len(clientes_data)}")
            for tracking, data in clientes_data.items():
                logger.info(f"✅ Tracking {tracking}: Cliente={data['cliente']}, Ciudad={data.get('ciudad', '')}, Valor BD={data['valor']}")
            
        except Exception as e:
            logger.error(f"❌ Error consultando COD_pendientes_v1: {e}")
            clientes_data = {}


        # PASO 6: Guardar comprobantes
        for idx, archivo in enumerate(archivos):
            logger.info(f"Guardando comprobante {idx+1}: {getattr(archivo, 'filename', 'sin nombre')}")
            url = await guardar_comprobante(archivo)
            comprobante_urls.append(url)
        # Para compatibilidad, usar el primer comprobante como comprobante_url principal
        comprobante_url = comprobante_urls[0] if comprobante_urls else None

        # PASO 7: Preparar datos para inserción
        
        creado_en = datetime.utcnow()
        filas = []

        # Calcular valor_bonos y valor_total_combinado
        valor_bonos = 0.0
        referencia_bonos = None
        valor_total_combinado = valor_pago  # Por defecto solo efectivo

        # Si las guías tienen campo 'bono_aplicado', sumar
        for guia in lista_guias:
            if isinstance(guia, dict) and "bono_aplicado" in guia and guia["bono_aplicado"]:
                try:
                    valor_bonos += float(guia["bono_aplicado"])
                except Exception:
                    pass
                if "referencia_bonos" in guia and guia["referencia_bonos"]:
                    referencia_bonos = guia["referencia_bonos"]

        valor_total_combinado = valor_pago + valor_bonos

        # 🔎 FASE 2: Establecer estado


        estado_conciliacion = "pendiente_conciliacion"

        filas = []

        # Calcular valor_bonos y valor_total_combinado
        valor_bonos = 0.0
        referencia_bonos = None
        valor_total_combinado = valor_pago  # Por defecto solo efectivo

        # Si las guías tienen campo 'bono_aplicado', sumar
        for guia in lista_guias:
            if isinstance(guia, dict) and "bono_aplicado" in guia and guia["bono_aplicado"]:
                try:
                    valor_bonos += float(guia["bono_aplicado"])
                except Exception:
                    pass
                if "referencia_bonos" in guia and guia["referencia_bonos"]:
                    referencia_bonos = guia["referencia_bonos"]

        valor_total_combinado = valor_pago + valor_bonos

        for i, guia in enumerate(lista_guias):
            referencia_value = str(guia.get("referencia", "")).strip()
            if not referencia_value:
                continue
            
            # Procesar tracking PRIMERO para usarlo en la consulta de datos
            tracking_value = guia.get("tracking", "")
            if not tracking_value or str(tracking_value).lower() in ["null", "none", "", "undefined"]:
                tracking_clean = referencia_value
            else:
                tracking_clean = str(tracking_value).strip()
            
            # 🔥 CAMBIO 1: Usar valor del soporte individual que viene del frontend
            valor_soporte_individual = float(guia.get("valor", 0))  # Valor del soporte específico
            logger.info(f"✅ Usando valor del soporte para {referencia_value} (tracking: {tracking_clean}): {valor_soporte_individual}")
            
            # 🔥 CORREGIDO: Usar tracking_clean para buscar datos en COD_pendientes_v1
            if tracking_clean in clientes_data:
                cod_data = clientes_data[tracking_clean]
                cliente_clean = cod_data["cliente"] or "Sin Cliente"
                ciudad = cod_data.get("ciudad", "")
                departamento = cod_data.get("departamento", "")
                valor_guia_bd = cod_data.get("valor", 0)
                status_date = cod_data.get("status_date")
                status_big = cod_data.get("status_big", "")
                carrier = cod_data.get("carrier", "")
                carrier_id = cod_data.get("carrier_id")
                conductor_nombre_completo = cod_data.get("conductor_nombre_completo", "")
                employee_id_cod = cod_data.get("employee_id")
                logger.info(f"✅ Datos COD_pendientes_v1 para tracking {tracking_clean}: Cliente={cliente_clean}, Ciudad={ciudad}, Departamento={departamento}")
            else:
                cliente_clean = "Sin Cliente"
                ciudad = ""
                departamento = ""
                valor_guia_bd = 0
                status_date = None
                status_big = ""
                carrier = ""
                carrier_id = None
                conductor_nombre_completo = ""
                employee_id_cod = None
                logger.warning(f"⚠️ Tracking {tracking_clean} NO encontrado en COD_pendientes_v1 para obtener datos completos")
            
            # Asociar comprobante por índice (si hay suficientes, si no usar el primero)
            comprobante_url_asociado = comprobante_urls[i] if i < len(comprobante_urls) else (comprobante_urls[0] if comprobante_urls else None)
            
            # 🔥 NUEVO: Usar tipo individual para cada comprobante
            tipo_individual = tipos_individuales[i] if i < len(tipos_individuales) else tipo
            logger.info(f"🎯 Asignando tipo individual para guía {i}: {tipo_individual}")
            
            fila = {
                "referencia": referencia_value,  # Referencia individual de la guía
                "valor": valor_soporte_individual,  # 🔥 CAMBIO 2: Valor del soporte individual
                "fecha": fecha_pago,
                "entidad": entidad,
                "estado": "pagado",
                "tipo": tipo_individual,  # 🔥 CAMBIO 4: Usar tipo individual por comprobante
                "comprobante": comprobante_url_asociado,
                "novedades": "",
                "creado_en": creado_en,
                "creado_por": correo,
                "modificado_en": None,
                "modificado_por": correo,
                "hora_pago": hora_pago,
                "correo": correo,
                "fecha_pago": fecha_pago,
                "id_string": None,
                "referencia_pago": referencia_value,  # 🔥 CAMBIO 3: Mismo valor que referencia
                "valor_total_consignacion": valor_pago,
                "tracking": tracking_clean,
                "cliente": cliente_clean,
                "estado_conciliacion": estado_conciliacion,
                "Id_Transaccion": nuevo_id_transaccion,
                # 🔥 NUEVOS CAMPOS: Datos de COD_pendientes_v1 para guias_liquidacion
                "ciudad": ciudad,
                "departamento": departamento,
                "valor_guia_bd": valor_guia_bd,  # Valor original de COD_pendientes_v1
                "status_date": status_date,
                "status_big": status_big,
                "carrier": carrier,
                "carrier_id": carrier_id,
                "conductor_nombre_completo": conductor_nombre_completo,
                "employee_id_cod": employee_id_cod,
            }
            filas.append(fila)

        if not filas:
            raise HTTPException(status_code=400, detail="No se procesaron guías válidas")
        
        # Preparar valores para consulta SQL
        valores_sql = []
        for fila in filas:
            def escape_value(value, field_type='STRING'):
                if value is None:
                    return 'NULL'
                elif field_type == 'STRING':
                    escaped = str(value).replace("'", "''")
                    return f"'{escaped}'"
                elif field_type in ['NUMERIC', 'FLOAT64']:
                    return str(value)
                elif field_type == 'DATE':
                    return f"'{value}'"
                elif field_type == 'TIMESTAMP':
                    return f"TIMESTAMP('{value}')" if value else 'NULL'
                else:
                    return f"'{str(value)}'"
            
            valores_fila = f"""(
                {escape_value(fila['referencia'])},
                {escape_value(fila['valor'], 'NUMERIC')},
                {escape_value(fila['fecha'], 'DATE')},
                {escape_value(fila['entidad'])},
                {escape_value(fila['estado'])},
                {escape_value(fila['tipo'])},
                {escape_value(fila['comprobante'])},
                {escape_value(fila['novedades'])},
                {escape_value(fila['creado_en'], 'TIMESTAMP')},
                {escape_value(fila['creado_por'])},
                {escape_value(fila['modificado_en'], 'TIMESTAMP')},
                {escape_value(fila['modificado_por'])},
                {escape_value(fila['hora_pago'])},
                {escape_value(fila['correo'])},
                {escape_value(fila['fecha_pago'], 'DATE')},
                {escape_value(fila['id_string'])},
                {escape_value(fila['referencia_pago'])},
                {escape_value(fila['valor_total_consignacion'], 'NUMERIC')},
                {escape_value(fila['tracking'])},
                {escape_value(fila['cliente'])},
                {escape_value(fila['estado_conciliacion'])}

            )"""
            valores_sql.append(valores_fila)
        
        # Ejecutar inserción
        tabla = f"{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor"
        query = f"""
        INSERT INTO `{tabla}` (
            referencia, valor, fecha, entidad, estado, tipo, comprobante, 
            novedades, creado_en, creado_por, modificado_en, modificado_por,
            hora_pago, correo, fecha_pago, id_string, referencia_pago, 
            valor_total_consignacion, tracking, cliente,
            estado_conciliacion, Id_Transaccion
        ) VALUES {', '.join([vs[:-1] + f", {escape_value(nuevo_id_transaccion, 'NUMERIC')})" for vs in valores_sql])}
        """
        
        # Timeout para inserción
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(lambda: client.query(query).result())
            future.result(timeout=30)
        

        
 # PASO 9: Insertar o actualizar en guias_liquidacion (MERGE/UPSERT por guía)
        try:
            todas_referencias_pago = []
            for fila_ref in filas:
                ref_individual = fila_ref.get('referencia', '').strip()
                if ref_individual and ref_individual not in todas_referencias_pago:
                    todas_referencias_pago.append(ref_individual)
            
            pago_referencia_concatenado = ', '.join(todas_referencias_pago)
            
            for fila in filas:
                merge_query = f"""
                MERGE `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion` AS gl
                USING (SELECT
                        @tracking AS tracking_number,
                        @employee_id_usuario AS employee_id,
                        @correo AS conductor_email,
                        @cliente AS cliente,
                        @ciudad AS ciudad,
                        @departamento AS departamento,
                        @valor_guia_bd AS valor_guia,
                        @status_date AS status_date,
                        @status_big AS status_big,
                        @carrier AS carrier,
                        @carrier_id AS carrier_id,
                        @conductor_nombre_completo AS conductor_nombre_completo,
                        @employee_id_cod AS employee_id_cod,
                        @fecha_pago AS fecha_entrega,
                        @pago_referencia_concatenado AS pago_referencia,
                        @fecha_pago AS fecha_pago,
                        @valor AS valor_pagado,
                        @tipo AS metodo_pago,
                        @id_transaccion AS Id_Transaccion,
                        CURRENT_TIMESTAMP() AS fecha_creacion,
                        CURRENT_TIMESTAMP() AS fecha_modificacion,
                        @correo AS creado_por,
                        @correo AS modificado_por
                ) AS src
                ON gl.tracking_number = src.tracking_number
                WHEN MATCHED THEN
                  UPDATE SET
                    cliente = src.cliente,
                    ciudad = src.ciudad,
                    departamento = src.departamento,
                    valor_guia = src.valor_guia,
                    status_date = src.status_date,
                    status_big = src.status_big,
                    carrier = src.carrier,
                    carrier_id = src.carrier_id,
                    conductor_nombre_completo = src.conductor_nombre_completo,
                    employee_id = COALESCE(src.employee_id_cod, src.employee_id),
                    pago_referencia = src.pago_referencia,
                    fecha_pago = src.fecha_pago,
                    valor_pagado = src.valor_pagado,
                    metodo_pago = src.metodo_pago,
                    estado_liquidacion = 'pagado',
                    fecha_modificacion = CURRENT_TIMESTAMP(),
                    modificado_por = src.modificado_por
                WHEN NOT MATCHED THEN
                  INSERT (
                    tracking_number, employee_id, conductor_email, cliente, ciudad, departamento,
                    valor_guia, status_date, status_big, carrier, carrier_id, conductor_nombre_completo,
                    fecha_entrega, pago_referencia, fecha_pago, valor_pagado, metodo_pago, Id_Transaccion,
                    fecha_creacion, fecha_modificacion, creado_por, modificado_por, estado_liquidacion
                  ) VALUES (
                    src.tracking_number, COALESCE(src.employee_id_cod, src.employee_id), src.conductor_email, 
                    src.cliente, src.ciudad, src.departamento, src.valor_guia, src.status_date, src.status_big,
                    src.carrier, src.carrier_id, src.conductor_nombre_completo, src.fecha_entrega,
                    src.pago_referencia, src.fecha_pago, src.valor_pagado, src.metodo_pago, src.Id_Transaccion,
                    src.fecha_creacion, src.fecha_modificacion, src.creado_por, src.modificado_por, 'pagado'
                  )
                """
                job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("tracking", "STRING", fila['tracking']),
                        bigquery.ScalarQueryParameter("employee_id_usuario", "INTEGER", obtener_employee_id_usuario(correo, client) or 0),
                        bigquery.ScalarQueryParameter("correo", "STRING", correo),
                        bigquery.ScalarQueryParameter("cliente", "STRING", fila['cliente']),
                        bigquery.ScalarQueryParameter("ciudad", "STRING", fila.get('ciudad', '')),
                        bigquery.ScalarQueryParameter("departamento", "STRING", fila.get('departamento', '')),
                        bigquery.ScalarQueryParameter("valor_guia_bd", "FLOAT64", fila.get('valor_guia_bd', 0)),
                        bigquery.ScalarQueryParameter("status_date", "DATE", fila.get('status_date')),
                        bigquery.ScalarQueryParameter("status_big", "STRING", fila.get('status_big', '')),
                        bigquery.ScalarQueryParameter("carrier", "STRING", fila.get('carrier', '')),
                        bigquery.ScalarQueryParameter("carrier_id", "INTEGER", fila.get('carrier_id')),
                        bigquery.ScalarQueryParameter("conductor_nombre_completo", "STRING", fila.get('conductor_nombre_completo', '')),
                        bigquery.ScalarQueryParameter("employee_id_cod", "INTEGER", fila.get('employee_id_cod')),
                        bigquery.ScalarQueryParameter("valor", "FLOAT64", fila['valor']),
                        bigquery.ScalarQueryParameter("fecha_pago", "DATE", fila['fecha_pago']),
                        bigquery.ScalarQueryParameter("pago_referencia_concatenado", "STRING", pago_referencia_concatenado),
                        bigquery.ScalarQueryParameter("tipo", "STRING", fila['tipo']),
                        bigquery.ScalarQueryParameter("id_transaccion", "INTEGER", nuevo_id_transaccion),
                    ]
                )
                client.query(merge_query, job_config=job_config).result()
            
        except Exception as e:
            


        # 🔥 FASE 1: Registrar bono por excedente si aplica
       # 🔥 FASE 1: Registrar bono por excedente si aplica        try:
            # Calcular excedente con validación
            try:
                valor_total_guias = sum(float(g.get('valor', 0)) for g in lista_guias)
                excedente = round(valor_total_combinado - valor_total_guias, 2)
                
            except Exception as e:
                
                return

            if excedente > 0:
                

                # Obtener y validar employee_id
                employee_id = obtener_employee_id_usuario(correo, client)
                if not employee_id:
                    
                    # Enviar notificación al administrador
                    await notificar_error_bono(correo, excedente, "No se encontró employee_id")
                    logger.warning(f"⚠️ No se pudo obtener el Employee ID para {correo}, no se registrará bono")
                else:
                    timestamp_actual = datetime.now()
                    bono_id = f"BONO_EXCEDENTE_{timestamp_actual.strftime('%Y%m%d_%H%M%S')}_{employee_id}"
                    
                    # Construir descripción detallada
                    descripcion = f"Excedente generado automáticamente del pago ref: {referencia}. Valor total pagado: ${valor_total_combinado}, Valor guías: ${valor_total_guias}"
                    
                    insertar_bono_query = f"""
                    INSERT INTO `{PROJECT_ID}.{DATASET_CONCILIACIONES}.conductor_bonos` (
                        id, tipo_bono, valor_bono, saldo_disponible, descripcion,
                        fecha_generacion, referencia_pago_origen, estado_bono, employee_id,
                        conductor_email, fecha_creacion, fecha_modificacion, 
                        creado_por, modificado_por
                    ) VALUES (
                        @id, 'excedente', @valor, @valor, @descripcion,
                        CURRENT_DATE(), @referencia, 'activo', @employee_id,
                        @correo, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(),
                        @creado_por, @modificado_por
                    )
                    """
                    
                    # Configuración mejorada de parámetros
                    job_config = bigquery.QueryJobConfig(query_parameters=[
                        bigquery.ScalarQueryParameter("id", "STRING", bono_id),
                        bigquery.ScalarQueryParameter("valor", "FLOAT64", excedente),
                        bigquery.ScalarQueryParameter("descripcion", "STRING", descripcion),
                        bigquery.ScalarQueryParameter("referencia", "STRING", referencia),
                        bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id),
                        bigquery.ScalarQueryParameter("correo", "STRING", correo),
                        bigquery.ScalarQueryParameter("creado_por", "STRING", correo),
                        bigquery.ScalarQueryParameter("modificado_por", "STRING", correo),
                    ])
                    client.query(insertar_bono_query, job_config=job_config).result()
                    
        except Exception as e:
            
            # ⚠️ IMPORTANTE: NO hacer raise aquí a menos que quieras que falle todo el pago
            # Solo registrar el error pero continuar con el flujo
            logger.warning("⚠️ Continuando sin registrar bono de excedente")

        # ✅ RESPUESTA EXITOSA - Esta debe estar FUERA del try/except del bono
        return {
            "mensaje": "✅ Pago híbrido registrado correctamente",
            "valor_efectivo": valor_pago,
            "valor_bonos": valor_bonos,
            "valor_total": valor_total_combinado,
            "guias_procesadas": len(filas),
            "referencia_pago": referencia,
            "referencia_bonos": referencia_bonos,
            "comprobante_url": comprobante_url,
            "tipo_pago": "híbrido" if valor_bonos > 0 else "efectivo"
        }

    except HTTPException:
        raise
    except Exception as e:

        
        # Limpiar comprobante si hay error
        if comprobante_url:
            try:
                filename = comprobante_url.split('/')[-1]
                filepath = os.path.join(COMPROBANTES_DIR, filename)
                if os.path.exists(filepath):
                    os.remove(filepath)
            except:
                pass
        
        raise HTTPException(
            status_code=500, 
            detail="Error interno del servidor procesando el pago híbrido"
        )


# 🔥 NUEVA RUTA: Consultar bonos disponibles por conductor

@router.get("/bonos-disponibles")
async def obtener_bonos_disponibles(
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Obtiene los bonos disponibles del conductor con su saldo total
    """
    try:
        logger.info(f"[BONOS DISPONIBLES] Usuario autenticado: {current_user}")
        email = current_user.get("email") or current_user.get("correo") or current_user.get("sub")
        if not email:
            logger.error(f"[BONOS DISPONIBLES] No se recibió email/correo/sub en current_user: {current_user}")
            raise HTTPException(status_code=401, detail="Usuario no autenticado o sin email/correo/sub")
        employee_id = obtener_employee_id_usuario(email, client)
        logger.info(f"[BONOS DISPONIBLES] employee_id para {email}: {employee_id}")
        if not employee_id:
            logger.error(f"[BONOS DISPONIBLES] No se encontró employee_id para {email}")
            raise HTTPException(
                status_code=404,
                detail="No se encontró el ID de empleado asociado"
            )

        # Consultar bonos activos
        query = """
        SELECT
            id,
            employee_id,
            conductor_email,
            tipo_bono,
            valor_bono,
            saldo_disponible,
            referencia_pago_origen,
            descripcion,
            fecha_generacion,
            estado_bono,
            fecha_ultimo_uso,
            fecha_creacion,
            fecha_modificacion,
            creado_por,
            modificado_por
        FROM `datos-clientes-441216.Conciliaciones.conductor_bonos`
        WHERE employee_id = @employee_id
        AND estado_bono = 'activo'
        AND saldo_disponible > 0
        AND DATE_DIFF(CURRENT_DATE(), fecha_generacion, DAY) <= 90
        ORDER BY fecha_generacion ASC
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id)
            ]
        )

        bonos = []
        total_disponible = 0

        # Ejecutar consulta
        try:
            query_job = client.query(query, job_config=job_config)
            results = query_job.result()
        except Exception as e:
            logger.error(f"[BONOS DISPONIBLES] Error ejecutando consulta BigQuery: {e}")
            raise HTTPException(status_code=500, detail=f"Error consultando bonos en BigQuery: {str(e)}")

        # Procesar resultados
        for row in results:
            bono = {
                "id": row.id,
                "employee_id": row.employee_id,
                "conductor_email": getattr(row, "conductor_email", None),
                "tipo_bono": row.tipo_bono,
                "valor_bono": float(row.valor_bono),
                "saldo_disponible": float(row.saldo_disponible),
                "referencia_pago_origen": row.referencia_pago_origen,
                "descripcion": row.descripcion,
                "fecha_generacion": row.fecha_generacion.isoformat() if row.fecha_generacion else None,
                "estado_bono": row.estado_bono,
                "fecha_ultimo_uso": row.fecha_ultimo_uso.isoformat() if getattr(row, "fecha_ultimo_uso", None) else None,
                "fecha_creacion": row.fecha_creacion.isoformat() if getattr(row, "fecha_creacion", None) else None,
                "fecha_modificacion": row.fecha_modificacion.isoformat() if getattr(row, "fecha_modificacion", None) else None,
                "creado_por": getattr(row, "creado_por", None),
                "modificado_por": getattr(row, "modificado_por", None)
            }
            bonos.append(bono)
            total_disponible += float(row.saldo_disponible)

        logger.info(f"[BONOS DISPONIBLES] Bonos encontrados: {len(bonos)} | Total disponible: {total_disponible}")
        return {
            "bonos": bonos,
            "total_disponible": total_disponible
        }

    except Exception as e:
        logger.error(f"[BONOS DISPONIBLES] Error general: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error consultando bonos disponibles: {str(e)}"
        )

@router.post("/aplicar-bonos")
async def aplicar_bonos_conductor(
    datos_bonos: Dict[str, Any],
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Aplica bonos del conductor a guías específicas
    """
    try:
        # Validar datos requeridos
        if "bono_id" not in datos_bonos or "guias" not in datos_bonos:
            raise HTTPException(
                status_code=400,
                detail="Se requiere bono_id y guias"
            )

        bono_id = datos_bonos["bono_id"]
        guias = datos_bonos["guias"]
        
        # Verificar bono
        query_bono = """
        SELECT *
        FROM `datos-clientes-441216.Conciliaciones.conductor_bonos`
        WHERE id = @bono_id
        AND estado_bono = 'activo'
        AND saldo_disponible > 0
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("bono_id", "STRING", bono_id)
            ]
        )

        bono_result = client.query(query_bono, job_config=job_config).result()
        bono = next(iter(bono_result), None)

        if not bono:
            raise HTTPException(
                status_code=404,
                detail="Bono no encontrado o no disponible"
            )

        # Calcular total de guías
        total_guias = sum(float(guia["valor"]) for guia in guias)
        
        if total_guias > bono.saldo_disponible:
            raise HTTPException(
                status_code=400,
                detail="Saldo del bono insuficiente"
            )

        # Actualizar saldo del bono
        update_query = """
        UPDATE `datos-clientes-441216.Conciliaciones.conductor_bonos`
        SET 
            saldo_disponible = saldo_disponible - @monto_usado,
            fecha_ultimo_uso = CURRENT_DATE(),
            fecha_modificacion = CURRENT_TIMESTAMP(),
            modificado_por = @usuario,
            estado_bono = CASE 
                WHEN saldo_disponible - @monto_usado <= 0 THEN 'agotado'
                ELSE estado_bono
            END
        WHERE id = @bono_id
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("monto_usado", "FLOAT", total_guias),
                bigquery.ScalarQueryParameter("usuario", "STRING", current_user["email"]),
                bigquery.ScalarQueryParameter("bono_id", "STRING", bono_id)
            ]
        )

        update_job = client.query(update_query, job_config=job_config)
        update_job.result()  # Esperar actualización

        # Registrar uso del bono
        movimiento = {
            "id": f"MOV_{uuid4()}",
            "bono_id": bono_id,
            "tipo_movimiento": "USO",
            "valor_movimiento": -total_guias,
            "saldo_anterior": float(bono.saldo_disponible),
            "saldo_nuevo": float(bono.saldo_disponible) - total_guias,
            "fecha_movimiento": datetime.now().isoformat(),
            "creado_por": current_user["email"],
            "guias_aplicadas": json.dumps(guias)
        }

        table_id = f"{PROJECT_ID}.{DATASET_CONCILIACIONES}.bono_movimientos"
        errors = client.insert_rows_json(table_id, [movimiento])

        if errors:
            
            raise Exception("Error registrando movimiento del bono")

        return {
            "mensaje": "Bono aplicado exitosamente",
            "monto_aplicado": total_guias,
            "saldo_restante": float(bono.saldo_disponible) - total_guias
        }

    except HTTPException as http_err:
        raise http_err
    except Exception as e:
        
        raise HTTPException(
            status_code=500,
            detail=f"Error aplicando bono: {str(e)}"        )

@router.get("/detalles-pago")
def obtener_detalles_pago(
    referencia_pago: Optional[str] = Query(None, description="Referencia de pago (opcional)"),
    id_transaccion: Optional[int] = Query(None, description="Id_Transaccion para pagos agrupados (opcional)"),
    correo: str = Query(None, description="Filtrar por correo del conductor (opcional)"),
    fecha_pago: str = Query(None, description="Filtrar por fecha de pago (YYYY-MM-DD, opcional)"),
    hora_pago: str = Query(None, description="Filtrar por hora de pago (opcional)"),
    valor: float = Query(None, description="Filtrar por valor del pago (opcional)"),
    estado_conciliacion: str = Query(None, description="Filtrar por estado de conciliación (opcional)"),
):
    """
    Obtiene apariciones ÚNICAS del campo tracking para un pago seleccionado.
    - Si tiene Id_Transaccion: busca por Id_Transaccion únicamente
    - Si NO tiene Id_Transaccion: usa valor, fecha, correo y estado para ser específico
    - Solo trae valor_guia de la tabla guias_liquidacion (sin COD_pendientes_v1)
    """
    try:
        client = get_bigquery_client()
        
        condiciones = []
        query_params = []
        
        if id_transaccion is not None:
            # Caso 1: Pago con Id_Transaccion - buscar solo por este campo
            logger.info(f"🔍 Buscando trackings únicos por Id_Transaccion: {id_transaccion}")
            condiciones.append("pc.Id_Transaccion = @id_transaccion")
            query_params.append(
                bigquery.ScalarQueryParameter("id_transaccion", "INTEGER", id_transaccion)
            )
        else:
            # Caso 2: Pago sin Id_Transaccion - usar valor, fecha, correo y estado para ser específico
            logger.info(f"🔍 Buscando trackings únicos por criterios específicos: referencia={referencia_pago}")
            
            # Referencia de pago es obligatoria en este caso
            if not referencia_pago:
                raise HTTPException(
                    status_code=400, 
                    detail="referencia_pago es requerida cuando no se proporciona id_transaccion"
                )
            
            condiciones.append("pc.referencia_pago = @referencia_pago")
            query_params.append(
                bigquery.ScalarQueryParameter("referencia_pago", "STRING", referencia_pago)
            )
            
            # Agregar filtros adicionales para ser específico cuando no hay Id_Transaccion
            if correo:
                condiciones.append("pc.correo = @correo")
                query_params.append(bigquery.ScalarQueryParameter("correo", "STRING", correo))
            if fecha_pago:
                condiciones.append("pc.fecha_pago = @fecha_pago")
                query_params.append(bigquery.ScalarQueryParameter("fecha_pago", "DATE", fecha_pago))
            if valor is not None:
                condiciones.append("pc.valor_total_consignacion = @valor")
                query_params.append(bigquery.ScalarQueryParameter("valor", "FLOAT64", valor))
            if estado_conciliacion:
                condiciones.append("pc.estado_conciliacion = @estado_conciliacion")
                query_params.append(bigquery.ScalarQueryParameter("estado_conciliacion", "STRING", estado_conciliacion))
        
        where_clause = "WHERE " + " AND ".join(condiciones)
        
        # 🔥 CONSULTA OPTIMIZADA: Solo guias_liquidacion, trackings únicos
        query = f"""
        SELECT DISTINCT
            pc.tracking,
            pc.referencia_pago,
            pc.referencia,
            pc.valor as valor,
            pc.valor_total_consignacion as valor_total_consignacion_pc,
            gl.valor_guia as valor_guia,  -- Solo valor_guia de guias_liquidacion
            pc.correo,
            pc.cliente,
            gl.carrier as carrier,  -- Solo carrier de guias_liquidacion
            pc.tipo,
            pc.fecha_pago,
            pc.hora_pago,
            pc.estado_conciliacion as estado,
            pc.novedades,
            pc.Id_Transaccion,
            pc.comprobante,
            pc.creado_en
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
        LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion` gl 
            ON pc.tracking = gl.tracking_number
        {where_clause}
        ORDER BY pc.tracking, pc.creado_en ASC
        """
        
        job_config = bigquery.QueryJobConfig(query_parameters=query_params)
        results = client.query(query, job_config=job_config).result()
        
        detalles = []
        trackings_unicos = set()  # Para garantizar trackings únicos
        
        for row in results:
            # Solo agregar si el tracking no se ha visto antes
            if row.tracking and row.tracking not in trackings_unicos:
                trackings_unicos.add(row.tracking)
                
                detalle = {
                    "tracking": row.tracking or "N/A",
                    "referencia": row.referencia_pago,
                    "referencia_individual": row.referencia or "N/A",
                    "valor": float(row.valor) if row.valor else 0.0,
                    "valor_total_consignacion_pc": float(row.valor_total_consignacion_pc) if row.valor_total_consignacion_pc else 0.0,
                    "valor_guia": float(row.valor_guia) if row.valor_guia else 0.0,  # Solo valor_guia
                    "correo": row.correo or "N/A",
                    "cliente": row.cliente or "N/A",
                    "carrier": row.carrier or "N/A",
                    "tipo": row.tipo or "N/A",
                    "fecha_pago": row.fecha_pago.isoformat() if row.fecha_pago else "N/A",
                    "hora_pago": str(row.hora_pago) if row.hora_pago else "N/A",
                    "estado": row.estado or "N/A",
                    "novedades": row.novedades or "",
                    "comprobante": row.comprobante or "",
                    "id_transaccion": row.Id_Transaccion or "N/A",
                }
                detalles.append(detalle)
        
        if not detalles:
            error_msg = f"No se encontraron trackings únicos para "
            if id_transaccion:
                error_msg += f"Id_Transaccion: {id_transaccion}"
            else:
                error_msg += f"referencia de pago: {referencia_pago}"
            
            raise HTTPException(status_code=404, detail=error_msg)
        
        # Logging de resultados
        if id_transaccion:
            logger.info(f"📋 Found {len(detalles)} unique trackings for Id_Transaccion {id_transaccion}")
        else:
            logger.info(f"📋 Found {len(detalles)} unique trackings for referencia {referencia_pago}")
        
        return {
            "detalles": detalles,
            "total_guias": len(detalles),
            "valor_total": sum(d["valor"] for d in detalles),
            "referencia_pago": referencia_pago,
            "id_transaccion": id_transaccion,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error obteniendo detalles: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor: {str(e)}"
        )


@router.get("/detalles-guias")
def obtener_detalles_guias(
    referencia_pago: Optional[str] = Query(None, description="Referencia de pago (opcional)"),
    id_transaccion: Optional[int] = Query(None, description="Id_Transaccion para pagos agrupados (opcional)"),
    fecha_pago: Optional[str] = Query(None, description="Filtrar por fecha de pago (YYYY-MM-DD, opcional)"),  # 🔥 NUEVO
    valor_pagado: Optional[float] = Query(None, description="Filtrar por valor pagado (opcional)")              # 🔥 NUEVO
):
    """
    Obtiene todas las guías asociadas a una referencia de pago o Id_Transaccion, con filtros opcionales.
    """
    try:
        client = get_bigquery_client()
        condiciones = []
        query_params = []

        if id_transaccion is not None:
            condiciones.append("gl.Id_Transaccion = @id_transaccion")
            query_params.append(bigquery.ScalarQueryParameter("id_transaccion", "INTEGER", id_transaccion))
        elif referencia_pago:
            condiciones.append("gl.pago_referencia = @referencia_pago")
            query_params.append(bigquery.ScalarQueryParameter("referencia_pago", "STRING", referencia_pago))
        else:
            raise HTTPException(status_code=400, detail="Debe proporcionar referencia_pago o id_transaccion")

        # 🔥 NUEVOS FILTROS
        if fecha_pago:
            condiciones.append("gl.fecha_pago = @fecha_pago")
            query_params.append(bigquery.ScalarQueryParameter("fecha_pago", "DATE", fecha_pago))
        if valor_pagado is not None:
            condiciones.append("gl.valor_pagado = @valor_pagado")
            query_params.append(bigquery.ScalarQueryParameter("valor_pagado", "FLOAT64", valor_pagado))

        where_clause = "WHERE " + " AND ".join(condiciones)

        query = f"""
        SELECT
            gl.tracking_number,
            gl.pago_referencia,
            gl.Id_Transaccion,
            gl.valor_guia,
            gl.valor_pagado,
            gl.metodo_pago,
            gl.cliente,
            gl.conductor_email,
            gl.fecha_pago,
            gl.estado_liquidacion,
            gl.carrier,
            cod.Valor as valor_cod
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion` gl
        LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1` cod
            ON gl.tracking_number = cod.tracking_number
        {where_clause}
        ORDER BY gl.tracking_number ASC
        """

        job_config = bigquery.QueryJobConfig(query_parameters=query_params)
        results = client.query(query, job_config=job_config).result()

        guias = []
        for row in results:
            guias.append({
                "tracking": row.tracking_number or "N/A",
                "pago_referencia": row.pago_referencia or "N/A",
                "id_transaccion": row.Id_Transaccion or "N/A",
                "valor_guia": float(row.valor_guia) if row.valor_guia else 0.0,
                "valor_pagado": float(row.valor_pagado) if row.valor_pagado else 0.0,
                "valor_cod": float(row.valor_cod) if getattr(row, "valor_cod", None) else 0.0,
                "metodo_pago": row.metodo_pago or "N/A",
                "cliente": row.cliente or "N/A",
                "conductor_email": row.conductor_email or "N/A",
                "fecha_pago": row.fecha_pago.isoformat() if row.fecha_pago else "N/A",
                "estado_liquidacion": row.estado_liquidacion or "N/A",
                "carrier": row.carrier or "N/A"
            })

        if not guias:
            raise HTTPException(status_code=404, detail="No se encontraron guías asociadas.")

        return {
            "guias": guias,
            "total_guias": len(guias),
            "referencia_pago": referencia_pago,
            "id_transaccion": id_transaccion,
            "timestamp": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error obteniendo detalles de guías: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor: {str(e)}"
        )

@router.get("/detalles-pago-cruces/{referencia_pago}")
def obtener_detalles_pago_cruces(
    referencia_pago: str,
    correo: str = Query(None, description="Filtrar por correo del conductor (opcional)"),
    valor: float = Query(None, description="Filtrar por valor del pago (opcional)"),
    fecha_pago: str = Query(None, description="Filtrar por fecha de pago (YYYY-MM-DD, opcional)"),
    estado_conciliacion: str = Query(None, description="Filtrar por estado de conciliación (opcional)")
):
    """
    Obtiene los datos generales de un pago y los trackings asociados.
    """
    try:
        client = get_bigquery_client()
        
        # Consulta para obtener los datos generales del pago (solo una fila)
        query_pago = """
        SELECT 
            referencia_pago,
            correo,
            valor_total_consignacion,
            cliente,
            tipo,
            fecha_pago,
            hora_pago,
            estado_conciliacion as estado,
            novedades,
            comprobante,
            entidad
        FROM `{project}.{dataset}.pagosconductor`
        WHERE referencia_pago = @referencia_pago
        """.format(project=PROJECT_ID, dataset=DATASET_CONCILIACIONES)

        query_params = [
            bigquery.ScalarQueryParameter("referencia_pago", "STRING", referencia_pago)
        ]

        # Agregar filtros opcionales
        if correo:
            query_pago += " AND correo = @correo"
            query_params.append(bigquery.ScalarQueryParameter("correo", "STRING", correo))
        if fecha_pago:
            query_pago += " AND fecha_pago = @fecha_pago"
            query_params.append(bigquery.ScalarQueryParameter("fecha_pago", "DATE", fecha_pago))
        if valor is not None:
            query_pago += " AND valor_total_consignacion = @valor"
            query_params.append(bigquery.ScalarQueryParameter("valor", "FLOAT64", valor))
        if estado_conciliacion:
            query_pago += " AND estado_conciliacion = @estado_conciliacion"
            query_params.append(bigquery.ScalarQueryParameter("estado_conciliacion", "STRING", estado_conciliacion))
        else:
            # Si no se especifica estado, filtrar por defecto por pendiente_conciliacion
            query_pago += " AND estado_conciliacion = 'pendiente_conciliacion'"

        query_pago += " LIMIT 1"

        job_config_pago = bigquery.QueryJobConfig(query_parameters=query_params)
        pago_result = client.query(query_pago, job_config=job_config_pago).result()
        pago_row = next(pago_result, None)
        if not pago_row:
            raise HTTPException(
                status_code=404,
                detail=f"No se encontró el pago con referencia: {referencia_pago}"
            )

        # Consulta para obtener los trackings asociados con JOIN
        query_trackings = """
        SELECT 
            cod.tracking_number as tracking,
            cod.Valor as valor,
            cod.cliente,
            pc.tipo,    
            pc.estado_conciliacion as estado,
            pc.referencia
        FROM `{project}.{dataset}.COD_pendientes_v1` cod
        INNER JOIN `{project}.{dataset}.pagosconductor` pc 
            ON cod.tracking_number = pc.tracking
        WHERE pc.referencia_pago = @referencia_pago
        """.format(project=PROJECT_ID, dataset=DATASET_CONCILIACIONES)

        # Aplicar los mismos filtros a la consulta de trackings
        if correo:
            query_trackings += " AND pc.correo = @correo"
        if fecha_pago:
            query_trackings += " AND pc.fecha_pago = @fecha_pago"
        if valor is not None:
            query_trackings += " AND pc.valor_total_consignacion = @valor"
        if estado_conciliacion:
            query_trackings += " AND pc.estado_conciliacion = @estado_conciliacion"
        else:
            # Si no se especifica estado, filtrar por defecto por pendiente_conciliacion
            query_trackings += " AND pc.estado_conciliacion = 'pendiente_conciliacion'"

        job_config_trackings = bigquery.QueryJobConfig(query_parameters=query_params)
        trackings_result = client.query(query_trackings, job_config=job_config_trackings).result()
        trackings = []
        suma_valores_guias = 0.0  # Variable para sumar los valores de las guías
        
        for row in trackings_result:
            valor_guia = float(row.valor) if row.valor else 0.0
            trackings.append({
                "tracking": row.tracking,
                "referencia": row.referencia,
                "valor": valor_guia,
                "cliente": row.cliente,
                "tipo": row.tipo,
                "estado": row.estado
            })
            # Sumar el valor de la guía al total
            suma_valores_guias += valor_guia

        # Estructura de respuesta: pago + lista de trackings
        pago = {
            "cliente": pago_row.cliente,
            "comprobante": pago_row.comprobante,
            "correo": pago_row.correo,
            "entidad": pago_row.entidad,
            "estado": pago_row.estado,
            "fecha_pago": pago_row.fecha_pago.isoformat() if pago_row.fecha_pago else None,
            "hora_pago": pago_row.hora_pago,
            "novedades": pago_row.novedades,
            "referencia_pago": pago_row.referencia_pago,
            "tipo": pago_row.tipo,
            "trackings": trackings,
            "valor_total_consignacion": float(pago_row.valor_total_consignacion) if pago_row.valor_total_consignacion else 0.0,
            "suma_valores_guias": suma_valores_guias  # Nueva variable con la suma de valores
        }

        return {
            "pago": pago,
            "referencia_pago": referencia_pago,
            "total_trackings": len(trackings),
            "suma_valores_guias": suma_valores_guias,  # También incluirla en el nivel superior para fácil acceso
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor: {str(e)}"
        )

# ...existing code...

@router.get("/imagenes-transaccion/{id_transaccion}")
def obtener_imagenes_por_transaccion(
    id_transaccion: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Obtiene todas las imágenes de comprobantes asociadas a un Id_Transaccion específico.
    Si no hay Id_Transaccion o solo hay una imagen, devuelve esa imagen única.
    Si hay múltiples imágenes con el mismo Id_Transaccion, devuelve todas.
    """
    try:
        client = get_bigquery_client()
        
        # Primero verificar si el id_transaccion es válido (numérico)
        try:
            id_transaccion_num = int(id_transaccion)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Id_Transaccion debe ser un número válido"
            )
        
        # Consultar todos los comprobantes con el mismo Id_Transaccion
        query = """
        SELECT DISTINCT
            comprobante,
            referencia_pago,
            fecha_pago,
            correo,
            valor_total_consignacion,
            Id_Transaccion
        FROM `{project}.{dataset}.pagosconductor`
        WHERE Id_Transaccion = @id_transaccion
        AND comprobante IS NOT NULL 
        AND comprobante != ''
        ORDER BY referencia_pago, fecha_pago
        """.format(project=PROJECT_ID, dataset=DATASET_CONCILIACIONES)
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("id_transaccion", "INTEGER", id_transaccion_num)
            ]
        )
        
        results = client.query(query, job_config=job_config).result()
        
        imagenes = []
        detalles_pagos = []
        
        for row in results:
            if row.comprobante:  # Verificar que no sea None o vacío
                imagenes.append(row.comprobante)
                detalles_pagos.append({
                    "referencia_pago": row.referencia_pago,
                    "fecha_pago": row.fecha_pago.isoformat() if row.fecha_pago else None,
                    "correo": row.correo,
                    "valor": float(row.valor_total_consignacion) if row.valor_total_consignacion else 0.0,
                    "comprobante": row.comprobante,
                    "id_transaccion": row.Id_Transaccion
                })
        
        if not imagenes:
            raise HTTPException(
                status_code=404,
                detail=f"No se encontraron comprobantes para Id_Transaccion: {id_transaccion}"
            )
        
        # Remover duplicados manteniendo el orden
        imagenes_unicas = []
        for img in imagenes:
            if img not in imagenes_unicas:
                imagenes_unicas.append(img)
        
        return {
            "id_transaccion": id_transaccion_num,
            "total_imagenes": len(imagenes_unicas),
            "imagenes": imagenes_unicas,
            "detalles_pagos": detalles_pagos,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error obteniendo imágenes por transacción {id_transaccion}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor: {str(e)}"
        )

@router.get("/imagenes-pago/{referencia_pago}")
def obtener_imagenes_por_referencia(
    referencia_pago: str,
    correo: Optional[str] = Query(None, description="Filtrar por correo del conductor (opcional)"),
    valor: Optional[float] = Query(None, description="Filtrar por valor del pago (opcional)"),
    fecha_pago: Optional[str] = Query(None, description="Filtrar por fecha de pago (YYYY-MM-DD, opcional)"),
    id_transaccion: Optional[int] = Query(None, description="Filtrar por Id_Transaccion (opcional)")
):
    """
    Obtiene todas las imágenes relacionadas con una referencia de pago específica.
    Si el pago tiene Id_Transaccion, busca todas las imágenes con ese mismo Id_Transaccion.
    Si no tiene Id_Transaccion, devuelve solo la imagen de esa referencia.
    Los parámetros opcionales ayudan a filtrar referencias duplicadas con datos diferentes.
    ✅ MEJORADO: Soporta búsqueda por Id_Transaccion para pagos agrupados
    ✅ CORREGIDO: Elimina duplicados de URLs de imágenes
    """
    try:
        client = get_bigquery_client()
        
        # 🔥 LÓGICA MEJORADA: Buscar por Id_Transaccion primero
        condiciones = []
        parametros = []
        
        # Si tenemos id_transaccion, buscar por ese ID en lugar de referencia específica
        if id_transaccion is not None:
            logger.info(f"🔍 Buscando imágenes por Id_Transaccion: {id_transaccion}")
            condiciones.append("pc.Id_Transaccion = @id_transaccion")
            parametros.append(
                bigquery.ScalarQueryParameter("id_transaccion", "INTEGER", id_transaccion)
            )
        else:
            # Búsqueda tradicional por referencia_pago
            logger.info(f"🔍 Buscando imágenes por referencia_pago: {referencia_pago}")
            condiciones.append("pc.referencia_pago = @referencia_pago")
            parametros.append(
                bigquery.ScalarQueryParameter("referencia_pago", "STRING", referencia_pago)
            )
        
        # Agregar filtros adicionales opcionales
        if correo:
            condiciones.append("pc.correo = @correo")
            parametros.append(
                bigquery.ScalarQueryParameter("correo", "STRING", correo)
            )
            
        if valor is not None:
            condiciones.append("(pc.valor = @valor OR pc.valor_total_consignacion = @valor)")
            parametros.append(
                bigquery.ScalarQueryParameter("valor", "FLOAT64", float(valor))
            )
            
        if fecha_pago:
            try:
                # Validar formato de fecha
                datetime.strptime(fecha_pago, "%Y-%m-%d")
                condiciones.append("pc.fecha_pago = @fecha_pago")
                parametros.append(
                    bigquery.ScalarQueryParameter("fecha_pago", "DATE", fecha_pago)
                )
            except ValueError:
                raise HTTPException(status_code=400, detail="Formato de fecha inválido (YYYY-MM-DD)")
        
        where_clause = "WHERE " + " AND ".join(condiciones) if condiciones else ""
        
        # 🔥 CONSULTA MEJORADA: Usar subconsulta para garantizar URLs únicas
        query = f"""
        WITH imagenes_unicas AS (
            SELECT DISTINCT
                pc.comprobante as imagen_url,
                MIN(pc.creado_en) as primera_creacion,
                STRING_AGG(DISTINCT pc.referencia_pago, ', ') as referencias_agrupadas
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
            {where_clause}
                AND pc.comprobante IS NOT NULL 
                AND pc.comprobante != ''
            GROUP BY pc.comprobante
        )
        SELECT 
            imagen_url,
            referencias_agrupadas,
            primera_creacion
        FROM imagenes_unicas
        ORDER BY primera_creacion DESC
        """
        
        job_config = bigquery.QueryJobConfig(query_parameters=parametros)
        result = client.query(query, job_config=job_config).result()
        
        imagenes_encontradas = []
        referencias_asociadas = set()
        
        for row in result:
            imagen_url = row.get("imagen_url", "").strip()
            if imagen_url and imagen_url not in imagenes_encontradas:  # 🔥 DOBLE VERIFICACIÓN
                imagenes_encontradas.append(imagen_url)
                # Agregar todas las referencias de esta imagen
                refs = row.get("referencias_agrupadas", "").split(", ")
                referencias_asociadas.update(ref.strip() for ref in refs if ref.strip())
        
        # 🔥 LOGGING MEJORADO
        if id_transaccion:
            logger.info(f"📸 Found {len(imagenes_encontradas)} unique images for Id_Transaccion {id_transaccion}")
            logger.info(f"📋 Referencias asociadas: {list(referencias_asociadas)}")
        else:
            logger.info(f"📸 Found {len(imagenes_encontradas)} unique images for referencia {referencia_pago}")
        
        if not imagenes_encontradas:
            if id_transaccion:
                raise HTTPException(
                    status_code=404, 
                    detail=f"No se encontraron comprobantes para la transacción ID {id_transaccion}"
                )
            else:
                raise HTTPException(
                    status_code=404, 
                    detail=f"No se encontraron comprobantes para la referencia {referencia_pago}"
                )
        
        return {
            "referencia_busqueda": referencia_pago,
            "id_transaccion": id_transaccion,
            "referencias_asociadas": list(referencias_asociadas),
            "total_imagenes": len(imagenes_encontradas),
            "imagenes": imagenes_encontradas,  # 🔥 Ya sin duplicados
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error obteniendo imágenes: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor: {str(e)}"
        )

@router.get("/pendientes-contabilidad")
def obtener_pagos_pendientes_contabilidad(
    limit: int = Query(20, ge=1, le=10000, description="Número de registros por página (máximo 10000 para carga completa)"),
    offset: int = Query(0, ge=0, description="Número de registros a omitir"),
    referencia: Optional[str] = Query(None, description="Filtrar por referencia de pago"),
    carrier: Optional[str] = Query(None, description="Filtar por carrier"),
    valor: Optional[float] = Query(None, ge=0, description="Filtrar por valor del pago"),
    estado: Optional[List[str]] = Query(None, description="Filtrar por uno o varios estados de conciliación"),
    fecha_desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    fecha_hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)"),
    id_transaccion: Optional[int] = Query(None, ge=1, description="Filtrar por Id_Transaccion exacto")  # 🔥 NUEVO
):
    """
    Obtiene pagos pendientes de contabilidad con paginación y filtros avanzados
    ✅ ACTUALIZADO: Agrupa por Id_Transaccion cuando existe, o por referencia individual
    ✅ NUEVO: Filtro por Id_Transaccion exacto
    """
    try:
        client = get_bigquery_client()

        FECHA_MINIMA = "2025-06-09"
        logger.info(f"🗓️ [DIAGNÓSTICO PAGOS] Filtro automático aplicado: >= {FECHA_MINIMA}")

        condiciones = ["1=1"]
        parametros = []

        condiciones.append("pc.fecha_pago >= @fecha_minima_auto")
        parametros.append(
            bigquery.ScalarQueryParameter("fecha_minima_auto", "DATE", FECHA_MINIMA)
        )

        if referencia and referencia.strip():
            condiciones.append("pc.referencia_pago LIKE @referencia_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("referencia_filtro", "STRING", f"%{referencia.strip()}%")
            )

        if carrier and carrier.strip():
            condiciones.append("LOWER(COALESCE(cod.Carrier, gl.carrier, '')) LIKE @carrier_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("carrier_filtro", "STRING", f"%{carrier.strip().lower()}%")
            )
        
        if valor is not None:
            condiciones.append("pc.valor_total_consignacion = @valor_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("valor_filtro", "FLOAT64", float(valor))
            )

        # 🔥 NUEVO FILTRO: Id_Transaccion exacto
        if id_transaccion is not None:
            condiciones.append("pc.Id_Transaccion = @id_transaccion_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("id_transaccion_filtro", "INTEGER", id_transaccion)
            )

        if estado:
            estados_limpios = [e.strip() for e in estado if e and e.strip()]
            if len(estados_limpios) == 1:
                condiciones.append("pc.estado_conciliacion = @estado_filtro")
                parametros.append(
                    bigquery.ScalarQueryParameter("estado_filtro", "STRING", estados_limpios[0])
                )
            elif len(estados_limpios) > 1:
                in_params = []
                for idx, est in enumerate(estados_limpios):
                    param_name = f"estado_filtro_{idx}"
                    in_params.append(f"@{param_name}")
                    parametros.append(
                        bigquery.ScalarQueryParameter(param_name, "STRING", est)
                    )
                condiciones.append(f"pc.estado_conciliacion IN ({', '.join(in_params)})")
        elif not any([
            referencia and referencia.strip(),
            carrier and carrier.strip(),
            fecha_desde,
            fecha_hasta,
            id_transaccion is not None # 🔥 AGREGAR A LA CONDICIÓN
        ]):
            condiciones.append("pc.estado_conciliacion = 'pendiente_conciliacion'")

        if fecha_desde:
            try:
                datetime.strptime(fecha_desde, "%Y-%m-%d")
                condiciones.append("pc.fecha_pago >= @fecha_desde")
                parametros.append(
                    bigquery.ScalarQueryParameter("fecha_desde", "DATE", fecha_desde)
                )
            except ValueError:
                raise HTTPException(status_code=400, detail="Formato de fecha_desde inválido (YYYY-MM-DD)")

        if fecha_hasta:
            try:
                datetime.strptime(fecha_hasta, "%Y-%m-%d")
                condiciones.append("pc.fecha_pago <= @fecha_hasta")
                parametros.append(
                    bigquery.ScalarQueryParameter("fecha_hasta", "DATE", fecha_hasta)
                )
            except ValueError:
                raise HTTPException(status_code=400, detail="Formato de fecha_hasta inválido (YYYY-MM-DD)")

        where_clause = "WHERE " + " AND ".join(condiciones)

        # ⭐ NUEVA CONSULTA: Agrupa por Id_Transaccion cuando existe
        count_query = f"""
            SELECT COUNT(*) as total
            FROM (
                SELECT 
                    CASE 
                        WHEN pc.Id_Transaccion IS NOT NULL THEN CAST(pc.Id_Transaccion AS STRING)
                        ELSE pc.referencia_pago
                    END as grupo_pago
                FROM (
                    SELECT DISTINCT
                        pc.Id_Transaccion,
                        pc.referencia_pago,
                        pc.referencia,
                        pc.tracking
                    FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
                    LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1` cod 
                        ON pc.tracking = cod.tracking_number
                    LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion` gl 
                        ON pc.tracking = gl.tracking_number
                    {where_clause}
                ) pc
                GROUP BY grupo_pago
            )
        """


        # ⭐ CONSULTA PRINCIPAL CORREGIDA - SIN DUPLICADOS CON MOVIMIENTOS BANCARIOS INDIVIDUALES
        main_query = f"""
            WITH movimientos_relacionados AS (
                -- Pre-calcular todos los movimientos bancarios relacionados por Id_Transaccion
                SELECT DISTINCT
                    pc.Id_Transaccion,
                    pc.id_banco_asociado,
                    bm.id as banco_id,
                    bm.valor_banco,
                    bm.fecha as fecha_banco,
                    bm.descripcion
                FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
                INNER JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.banco_movimientos` bm 
                    ON pc.id_banco_asociado = bm.id
                WHERE pc.Id_Transaccion IS NOT NULL
                AND pc.id_banco_asociado IS NOT NULL
            ),
            transacciones_banco_ids AS (
                -- Agrupar todos los IDs de banco por Id_Transaccion
                SELECT 
                    Id_Transaccion,
                    STRING_AGG(DISTINCT CAST(id_banco_asociado AS STRING), ', ') as todos_ids_banco,
                    STRING_AGG(DISTINCT 
                        CONCAT('ID:', CAST(banco_id AS STRING), '|Valor:', CAST(valor_banco AS STRING), '|Fecha:', CAST(fecha_banco AS STRING))
                        , ' || '
                    ) as movimientos_detalle,
                    SUM(DISTINCT valor_banco) as total_movimientos
                FROM movimientos_relacionados
                GROUP BY Id_Transaccion
            )
            SELECT 
                CASE 
                    WHEN pc.Id_Transaccion IS NOT NULL THEN CAST(pc.Id_Transaccion AS STRING)
                    ELSE CONCAT(pc.referencia_pago, '|', pc.correo, '|', CAST(pc.fecha_pago AS STRING))
                END as grupo_id,
                
                -- 🔥 REFERENCIAS AGRUPADAS - CORREGIDO: usar 'referencia' para Id_Transaccion
                CASE 
                    WHEN pc.Id_Transaccion IS NOT NULL AND COUNT(DISTINCT pc.referencia) > 1 THEN 
                        STRING_AGG(DISTINCT pc.referencia, ', ')
                    WHEN pc.Id_Transaccion IS NOT NULL THEN 
                        MAX(pc.referencia)
                    ELSE MAX(pc.referencia_pago)
                END as referencia_pago_display,
                
                -- Principal: usar referencia_pago para operaciones, pero referencia para display cuando hay Id_Transaccion
                CASE 
                    WHEN pc.Id_Transaccion IS NOT NULL THEN MAX(pc.referencia)
                    ELSE MAX(pc.referencia_pago)
                END as referencia_pago_principal,
                
                -- Contar referencias correctas según el caso
                CASE 
                    WHEN pc.Id_Transaccion IS NOT NULL THEN COUNT(DISTINCT pc.referencia)
                    ELSE COUNT(DISTINCT pc.referencia_pago)
                END as num_referencias,
                
                MAX(pc.correo) as correo_conductor,
                MAX(pc.fecha_pago) as fecha,
                MAX(FORMAT_TIMESTAMP('%Y-%m-%d', pc.creado_en, 'America/Bogota')) AS creado_en,
                COALESCE(MAX(pc.valor_total_consignacion), SUM(pc.valor)) AS valor,
                MAX(pc.hora_pago) AS hora_pago,
                MAX(pc.entidad) AS entidad,
                MAX(pc.tipo) AS tipo,
                MAX(pc.comprobante) AS imagen,
                COUNT(DISTINCT pc.tracking) AS num_guias,
                STRING_AGG(DISTINCT SAFE_CAST(pc.tracking AS STRING), ', ' LIMIT 5) AS trackings_preview,
                MAX(pc.estado_conciliacion) as estado_conciliacion,
                MAX(pc.novedades) as novedades,
                MAX(pc.creado_en) as fecha_creacion,
                MAX(pc.modificado_en) as fecha_modificacion,
                MAX(COALESCE(cod.Carrier, gl.carrier, 'N/A')) as carrier,
                MAX(pc.Id_Transaccion) AS Id_Transaccion,
                
                -- 🔥 CAMPOS DE BANCO ASOCIADO - TODOS LOS IDs usando CTE
                COALESCE(
                    MAX(tbi.todos_ids_banco), 
                    STRING_AGG(DISTINCT CAST(pc.id_banco_asociado AS STRING), ', ')
                ) AS ids_banco_asociado,
                
                COALESCE(
                    COUNT(DISTINCT CASE WHEN tbi.Id_Transaccion IS NOT NULL THEN tbi.Id_Transaccion END),
                    COUNT(DISTINCT pc.id_banco_asociado)
                ) AS num_movimientos_banco,
                
                -- 🔥 MOVIMIENTOS BANCARIOS INDIVIDUALES desde CTE
                COALESCE(
                    MAX(tbi.movimientos_detalle),
                    STRING_AGG(DISTINCT 
                        CASE 
                            WHEN bm.valor_banco IS NOT NULL THEN 
                                CONCAT('ID:', CAST(bm.id AS STRING), '|Valor:', CAST(bm.valor_banco AS STRING), '|Fecha:', CAST(bm.fecha AS STRING))
                            ELSE NULL 
                        END, ' || '
                    )
                ) AS movimientos_bancarios_detalle,
                
                -- 🔥 SUMA TOTAL DE MOVIMIENTOS BANCARIOS
                COALESCE(MAX(tbi.total_movimientos), SUM(DISTINCT bm.valor_banco)) AS total_valor_movimientos_banco,

                -- 🔥 REFERENCIA_PAGO ORIGINAL DE LA TABLA
                MAX(pc.referencia_pago) AS referencia_pago_original,  -- 🔥 CAMPO ADICIONAL SOLICITADO
                
                -- 🔥 INDICADOR DE AGRUPACIÓN - Usar la lógica correcta
                CASE 
                    WHEN pc.Id_Transaccion IS NOT NULL AND COUNT(DISTINCT pc.referencia) > 1 
                    THEN true 
                    ELSE false 
                END as es_grupo_transaccion
                
                FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
                LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1` cod 
                    ON pc.tracking = cod.tracking_number
                LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion` gl 
                    ON pc.tracking = gl.tracking_number
                LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.banco_movimientos` bm 
                    ON pc.id_banco_asociado = bm.id
                LEFT JOIN transacciones_banco_ids tbi
                    ON pc.Id_Transaccion = tbi.Id_Transaccion
                {where_clause}
                GROUP BY grupo_id, pc.Id_Transaccion
                ORDER BY MAX(pc.fecha_pago) DESC, MAX(pc.creado_en) DESC
                LIMIT {limit}
                OFFSET {offset}
        """


        job_config = bigquery.QueryJobConfig(query_parameters=parametros)

        with concurrent.futures.ThreadPoolExecutor() as executor:
            future_count = executor.submit(lambda: client.query(count_query, job_config=job_config).result())
            future_main = executor.submit(lambda: client.query(main_query, job_config=job_config).result())

            count_result = future_count.result(timeout=30)
            main_result = future_main.result(timeout=30)

        total_registros = next(count_result)["total"]
        total_paginas = (total_registros + limit - 1) // limit
        pagina_actual = (offset // limit) + 1

        pagos = []
        for row in main_result:
            trackings_preview = row.get("trackings_preview", "")
            if trackings_preview:
                trackings_list = trackings_preview.split(", ")
                if len(trackings_list) > 3:
                    trackings_preview = ", ".join(trackings_list[:3]) + f" (+{len(trackings_list) - 3} más)"

            # 🔥 FORMATEAR REFERENCIA DISPLAY
            referencia_display = row.get("referencia_pago_display", "")
            num_referencias = row.get("num_referencias", 1)
            es_grupo = row.get("es_grupo_transaccion", False)
            
            if es_grupo and num_referencias > 1:
                referencia_display = f"🔗 {referencia_display}"  # Emoji para indicar agrupación

            # 🔥 PROCESAR MOVIMIENTOS BANCARIOS INDIVIDUALES
            movimientos_bancarios = []
            movimientos_detalle = row.get("movimientos_bancarios_detalle", "")
            
            if movimientos_detalle:
                # Dividir por el separador ' || ' y procesar cada movimiento
                movimientos_raw = movimientos_detalle.split(" || ")
                for mov in movimientos_raw:
                    if mov and mov.strip():
                        try:
                            # Parsear formato: ID:123|Valor:1000|Fecha:2025-01-01
                            parts = mov.split("|")
                            mov_dict = {}
                            for part in parts:
                                if ":" in part:
                                    key, value = part.split(":", 1)
                                    if key == "ID":
                                        mov_dict["id"] = int(value) if value.isdigit() else value
                                    elif key == "Valor":
                                        mov_dict["valor"] = float(value) if value.replace(".", "").replace("-", "").isdigit() else value
                                    elif key == "Fecha":
                                        mov_dict["fecha"] = value
                            if mov_dict:
                                movimientos_bancarios.append(mov_dict)
                        except (ValueError, IndexError):
                            # Si hay error en el parsing, guardar como string
                            movimientos_bancarios.append({"raw": mov})

            pagos.append({
                "referencia_pago": referencia_display,  # 🔥 PRINCIPAL CAMBIO
                "referencia_pago_principal": row.get("referencia_pago_principal", ""),
                "referencia_pago_original": str(row.get("referencia_pago_original", "")),  # 🔥 CAMPO ADICIONAL SOLICITADO
                "num_referencias": num_referencias,
                "es_grupo_transaccion": es_grupo,
                "valor": float(row.get("valor", 0)) if row.get("valor") else 0.0,
                "fecha": str(row.get("fecha", "")),
                "creado_en": str(row.get("creado_en", "")),
                "hora_pago": str(row.get("hora_pago", "")),
                "entidad": str(row.get("entidad", "")),
                "estado_conciliacion": str(row.get("estado_conciliacion", "")),
                "tipo": str(row.get("tipo", "")),
                "imagen": str(row.get("imagen", "")),
                "novedades": str(row.get("novedades", "")),
                "num_guias": int(row.get("num_guias", 0)),
                "trackings_preview": trackings_preview,
                "correo_conductor": str(row.get("correo_conductor", "")),
                "fecha_creacion": row.get("fecha_creacion").isoformat() if row.get("fecha_creacion") else None,
                "fecha_modificacion": row.get("fecha_modificacion").isoformat() if row.get("fecha_modificacion") else None,
                "carrier": str(row.get("carrier", "N/A")),
                "Id_Transaccion": row.get("Id_Transaccion", None),
                # 🔥 CAMPOS NUEVOS DE MOVIMIENTOS BANCARIOS
                "ids_banco_asociado": row.get("ids_banco_asociado", None),
                "num_movimientos_banco": int(row.get("num_movimientos_banco", 0)),
                "movimientos_bancarios": movimientos_bancarios,
                "total_valor_movimientos_banco": float(row.get("total_valor_movimientos_banco", 0)) if row.get("total_valor_movimientos_banco") else 0.0,
                # 🔥 CAMPOS LEGACY PARA COMPATIBILIDAD
                "id_banco_asociado": row.get("ids_banco_asociado", "").split(", ")[0] if row.get("ids_banco_asociado") else None,
                "valor_banco_asociado": movimientos_bancarios[0].get("valor") if movimientos_bancarios else None,
                "fecha_movimiento_banco": movimientos_bancarios[0].get("fecha") if movimientos_bancarios else None
            })

        paginacion_info = {
            "total_registros": total_registros,
            "total_paginas": total_paginas,
            "pagina_actual": pagina_actual,
            "registros_por_pagina": limit,
            "tiene_siguiente": pagina_actual < total_paginas,
            "tiene_anterior": pagina_actual > 1,
            "desde_registro": offset + 1 if pagos else 0,
            "hasta_registro": offset + len(pagos)
        }

        return {
            "pagos": pagos,
            "paginacion": paginacion_info,
            "filtros": {
                "referencia": referencia,
                "estado": estado,
                "fecha_desde": fecha_desde,
                "fecha_hasta": fecha_hasta,
                "carrier": carrier,
                "valor": valor,
                "id_transaccion": id_transaccion
            },
            "timestamp": datetime.now().isoformat(),
            "status": "success"
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error("❌ Error en /pendientes-contabilidad:\n%s", traceback.format_exc())
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "pagos": [],
                "paginacion": {
                    "total_registros": 0,
                    "total_paginas": 0,
                    "pagina_actual": 1,
                    "registros_por_pagina": limit,
                    "tiene_siguiente": False,
                    "tiene_anterior": False,
                    "desde_registro": 0,
                    "hasta_registro": 0
                },
                "filtros": {
                    "referencia": referencia,
                    "estado": estado,
                    "fecha_desde": fecha_desde,
                    "fecha_hasta": fecha_hasta
                },
                "error": str(e),
                "trace": traceback.format_exc(),
                "status": "error",
                "timestamp": datetime.now().isoformat()
            }
        )

# 🔥 NUEVO ENDPOINT: Verificación de referencias Nequi
@router.post("/verificar-referencia-nequi")
async def verificar_referencia_nequi(
    referencia: str = Form(..., description="Referencia extraída del comprobante"),
    tipo: str = Form(..., description="Tipo de pago detectado por OCR")
):
    """
    Verifica si una referencia de pago Nequi ya existe en la base de datos.
    Solo se ejecuta si el tipo detectado es 'Nequi'.
    
    Retorna:
    - permitir_registro: bool - Si se puede proceder con el registro
    - mensaje: str - Mensaje explicativo
    - referencia_existente: dict - Datos del pago existente si se encuentra
    """
    try:
        client = get_bigquery_client()
        
        # Validar que el tipo sea Nequi
        if not tipo or tipo.strip().lower() != 'nequi':
            return {
                "permitir_registro": True,
                "mensaje": "✅ Verificación no requerida: El tipo de pago no es Nequi",
                "tipo_detectado": tipo,
                "referencia_verificada": referencia,
                "requiere_verificacion": False
            }
        
        # Limpiar y validar referencia
        referencia_limpia = referencia.strip()
        if not referencia_limpia:
            raise HTTPException(
                status_code=400,
                detail="❌ Referencia vacía o inválida"
            )
        
        logger.info(f"🔍 Verificando referencia Nequi: {referencia_limpia}")
        
        # 🔥 CONSULTA: Buscar en campos 'referencia' y 'referencia_pago' de pagosconductor
        query_verificacion = f"""
        SELECT 
            referencia,
            referencia_pago,
            valor,
            valor_total_consignacion,
            fecha_pago,
            hora_pago,
            correo,
            tipo,
            entidad,
            estado_conciliacion,
            tracking,
            cliente,
            comprobante,
            creado_en,
            Id_Transaccion
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
        WHERE (
            LOWER(TRIM(referencia)) = LOWER(@referencia_buscar) 
            OR LOWER(TRIM(referencia_pago)) = LOWER(@referencia_buscar)
        )
        AND LOWER(TRIM(tipo)) = 'nequi'
        ORDER BY creado_en DESC
        LIMIT 5
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia_buscar", "STRING", referencia_limpia.lower())
            ]
        )
        
        resultado = client.query(query_verificacion, job_config=job_config).result()
        pagos_existentes = list(resultado)
        
        if not pagos_existentes:
            # No se encontraron referencias duplicadas
            logger.info(f"✅ Referencia Nequi no duplicada: {referencia_limpia}")
            return {
                "permitir_registro": True,
                "mensaje": "✅ Referencia Nequi válida: No se encontraron duplicados en la base de datos",
                "tipo_detectado": tipo,
                "referencia_verificada": referencia_limpia,
                "requiere_verificacion": True,
                "referencias_existentes": []
            }
        else:
            # Se encontraron referencias duplicadas
            logger.warning(f"⚠️ Referencia Nequi duplicada encontrada: {referencia_limpia}")
            
            # Formatear datos de pagos existentes
            referencias_existentes = []
            for pago in pagos_existentes:
                referencias_existentes.append({
                    "referencia": pago.referencia,
                    "referencia_pago": pago.referencia_pago,
                    "valor": float(pago.valor) if pago.valor else 0.0,
                    "valor_total_consignacion": float(pago.valor_total_consignacion) if pago.valor_total_consignacion else 0.0,
                    "fecha_pago": pago.fecha_pago.isoformat() if pago.fecha_pago else None,
                    "hora_pago": str(pago.hora_pago) if pago.hora_pago else None,
                    "correo": pago.correo or "",
                    "tipo": pago.tipo or "",
                    "entidad": pago.entidad or "",
                    "estado_conciliacion": pago.estado_conciliacion or "",
                    "tracking": pago.tracking or "",
                    "cliente": pago.cliente or "",
                    "comprobante": pago.comprobante or "",
                    "creado_en": pago.creado_en.isoformat() if pago.creado_en else None,
                    "Id_Transaccion": pago.Id_Transaccion
                })
            
            # Determinar mensaje según cantidad de duplicados
            total_duplicados = len(referencias_existentes)
            if total_duplicados == 1:
                pago_existente = referencias_existentes[0]
                mensaje_detalle = (
                    f"❌ REFERENCIA NEQUI DUPLICADA:\n\n"
                    f"Esta referencia ya existe en la base de datos:\n"
                    f"• Referencia: {pago_existente['referencia']}\n"
                    f"• Valor: ${pago_existente['valor_total_consignacion']:,.2f}\n"
                    f"• Fecha: {pago_existente['fecha_pago']}\n"
                    f"• Conductor: {pago_existente['correo']}\n"
                    f"• Estado: {pago_existente['estado_conciliacion']}\n\n"
                    f"No se puede registrar un pago Nequi con referencia duplicada."
                )
            else:
                mensaje_detalle = (
                    f"❌ REFERENCIA NEQUI DUPLICADA:\n\n"
                    f"Esta referencia aparece {total_duplicados} veces en la base de datos.\n"
                    f"No se puede registrar un pago Nequi con referencia duplicada.\n\n"
                    f"Revise los pagos existentes en la respuesta."
                )
            
            return {
                "permitir_registro": False,
                "mensaje": mensaje_detalle,
                "tipo_detectado": tipo,
                "referencia_verificada": referencia_limpia,
                "requiere_verificacion": True,
                "total_duplicados": total_duplicados,
                "referencias_existentes": referencias_existentes
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error en verificación de referencia Nequi: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error interno verificando referencia: {str(e)}"
        )

# Reportes ---

@router.get("/historial-2")
def obtener_historial_pagos_simplificado():
    """
    Endpoint que trae todos los pagos de la tabla pagosconductor con campos específicos:
    - referencia, referencia_pago, valor, valor_total_consignacion, fecha, estado_conciliacion, tipo, 
    - cantidad de tracking por referencia, tracking, comprobante, cliente, Id_Transaccion
    """
    try:
        client = get_bigquery_client()
        
        logger.info("📊 Iniciando consulta para historial-2 con campos extendidos")
        
        query = f"""
        WITH tracking_counts AS (
            SELECT 
                referencia,
                COUNT(tracking) as cantidad_tracking
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
            WHERE tracking IS NOT NULL AND tracking != ''
            GROUP BY referencia
        )
        SELECT 
            pc.referencia,
            pc.referencia_pago,
            pc.valor,
            pc.valor_total_consignacion,
            DATE(pc.fecha) AS fecha,
            pc.estado_conciliacion,
            pc.tipo,
            pc.entidad,
            
            -- Cantidad de tracking por referencia
            COALESCE(tc.cantidad_tracking, 0) as cantidad_tracking,
            
            pc.tracking,
            pc.comprobante,
            pc.cliente,
            pc.Id_Transaccion
            
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
        LEFT JOIN tracking_counts tc ON pc.referencia = tc.referencia
        ORDER BY pc.creado_en DESC
        """
        
        logger.info("🔍 Ejecutando consulta en BigQuery...")
        results = client.query(query).result()
        
        historial = []
        
        for row in results:
            registro = {
                "referencia": row.referencia or "",
                "referencia_pago": row.referencia_pago or "",
                "valor": float(row.valor) if row.valor is not None else 0.0,
                "valor_total_consignacion": float(row.valor_total_consignacion) if row.valor_total_consignacion is not None else 0.0,
                "fecha": row.fecha or "",
                "estado_conciliacion": row.estado_conciliacion or "",
                "tipo": row.tipo or "",
                "entidad": row.entidad or "",
                "cantidad_tracking": int(row.cantidad_tracking) if row.cantidad_tracking is not None else 0,
                "tracking": row.tracking or "",
                "comprobante": row.comprobante or "",
                "cliente": row.cliente or "",
                "id_transaccion": row.Id_Transaccion or ""
            }
            historial.append(registro)
        
        logger.info(f"✅ Consulta completada. Total registros: {len(historial)}")
        
        return {
            "historial": historial,
            "total_registros": len(historial),
            "columnas": [
                "referencia",
                "referencia_pago",
                "valor",
                "valor_total_consignacion",
                "fecha",
                "estado_conciliacion",
                "tipo",
                "entidad",
                "cantidad_tracking",
                "tracking",
                "comprobante",
                "cliente",
                "id_transaccion"
            ],
            "timestamp": datetime.now().isoformat(),
            "status": "success"
        }
        
    except Exception as e:
        logger.error(f"❌ Error en historial-2: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo historial simplificado: {str(e)}"
        )


@router.get("/detalles-pago-reportes/{referencia_pago}")
def obtener_detalles_pago_reportes(
    referencia_pago: str,
    id_transaccion: Optional[Any] = FastAPIQuery(None, description="Id de la transacción"),
    carrier: str = FastAPIQuery(None, description="Carrier"),
    fecha: str = FastAPIQuery(None, description="Fecha (YYYY-MM-DD)"),
    tipo: str = FastAPIQuery(None, description="Tipo de pago"),
    estado: str = FastAPIQuery(None, description="Estado de conciliación")
):
    """
    Obtiene los detalles de un pago específico incluyendo todas las guías asociadas
    """
    try:
        client = get_bigquery_client()
        # Validar si el parámetro id_transaccion viene como string 'null' y convertirlo a None
        id_transaccion_final = id_transaccion
        if isinstance(id_transaccion_final, str) and id_transaccion_final.lower() == "null":
            id_transaccion_final = None

        # Si id_transaccion es None, traer TODAS las guías de esa referencia (con y sin Id_Transaccion)
        if id_transaccion_final is None:
            query = f"""
            SELECT 
                pc.referencia_pago,
                pc.referencia,
                pc.tracking,
                pc.valor,
                pc.cliente,
                COALESCE(cod.Carrier, gl.carrier, 'N/A') as carrier,
                pc.tipo,
                pc.fecha_pago,
                pc.hora_pago,
                pc.estado_conciliacion as estado,
                pc.novedades,
                pc.comprobante,
                pc.Id_Transaccion
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
            LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1` cod 
                ON pc.tracking = cod.tracking_number
            LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion` gl 
                ON pc.tracking = gl.tracking_number
            WHERE pc.referencia_pago = @referencia_pago
            """
            query_params = [
                bigquery.ScalarQueryParameter("referencia_pago", "STRING", referencia_pago)
            ]
            if carrier:
                query += " AND (COALESCE(cod.Carrier, gl.carrier, 'N/A') = @carrier)"
                query_params.append(bigquery.ScalarQueryParameter("carrier", "STRING", carrier))
            if fecha:
                query += " AND pc.fecha_pago = @fecha"
                query_params.append(bigquery.ScalarQueryParameter("fecha", "DATE", fecha))
            if tipo:
                query += " AND pc.tipo = @tipo"
                query_params.append(bigquery.ScalarQueryParameter("tipo", "STRING", tipo))
            if estado:
                query += " AND pc.estado_conciliacion = @estado"
                query_params.append(bigquery.ScalarQueryParameter("estado", "STRING", estado))
            query += " ORDER BY pc.creado_en ASC"

            job_config = bigquery.QueryJobConfig(query_parameters=query_params)
            results = list(client.query(query, job_config=job_config).result())
        else:
            # Consultar solo las guías asociadas a ese Id_Transaccion
            query = f"""
            SELECT 
                pc.referencia_pago,
                pc.referencia,
                pc.tracking,
                pc.valor,
                pc.cliente,
                COALESCE(cod.Carrier, gl.carrier, 'N/A') as carrier,
                pc.tipo,
                pc.fecha_pago,
                pc.hora_pago,
                pc.estado_conciliacion as estado,
                pc.novedades,
                pc.comprobante,
                pc.Id_Transaccion
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
            LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1` cod 
                ON pc.tracking = cod.tracking_number
            LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion` gl 
                ON pc.tracking = gl.tracking_number
            WHERE pc.referencia_pago = @referencia_pago
              AND pc.Id_Transaccion = @id_transaccion
            """
            query_params = [
                bigquery.ScalarQueryParameter("referencia_pago", "STRING", referencia_pago),
                bigquery.ScalarQueryParameter("id_transaccion", "INT64", id_transaccion_final)
            ]
            if carrier:
                query += " AND (COALESCE(cod.Carrier, gl.carrier, 'N/A') = @carrier)"
                query_params.append(bigquery.ScalarQueryParameter("carrier", "STRING", carrier))
            if fecha:
                query += " AND pc.fecha_pago = @fecha"
                query_params.append(bigquery.ScalarQueryParameter("fecha", "DATE", fecha))
            if tipo:
                query += " AND pc.tipo = @tipo"
                query_params.append(bigquery.ScalarQueryParameter("tipo", "STRING", tipo))
            if estado:
                query += " AND pc.estado_conciliacion = @estado"
                query_params.append(bigquery.ScalarQueryParameter("estado", "STRING", estado))
            query += " ORDER BY pc.creado_en ASC"

            job_config = bigquery.QueryJobConfig(query_parameters=query_params)
            results = list(client.query(query, job_config=job_config).result())

        detalles = []
        for row in results:
            detalle = {
                "tracking": row.tracking or "N/A",
                "referencia": row.referencia_pago,
                "valor": float(row.valor) if row.valor else 0.0,
                "cliente": row.cliente or "N/A",
                "carrier": row.carrier or "N/A",
                "tipo": row.tipo or "N/A",
                "fecha_pago": row.fecha_pago.isoformat() if row.fecha_pago else "N/A",
                "hora_pago": row.hora_pago or "N/A",
                "estado": row.estado or "N/A",
                "novedades": row.novedades or "",
                "comprobante": row.comprobante or "",
                "Id_Transaccion": row.Id_Transaccion
            }
            detalles.append(detalle)

        if not detalles:
            raise HTTPException(
                status_code=404,
                detail=f"No se encontraron detalles para la referencia de pago: {referencia_pago} y transacción: {id_transaccion_final}"
            )

        return {
            "detalles": detalles,
            "total_guias": len(detalles),
            "valor_total": sum(d["valor"] for d in detalles),
            "referencia_pago": referencia_pago,
            "Id_Transaccion": id_transaccion_final,
            "timestamp": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor: {str(e)}"
        )

@router.get("/reportes-pendientes-contabilidad")
def obtener_pagos_pendientes_contabilidad_2(
    limit: int = Query(20, ge=1, le=100, description="Número de registros por página"),
    offset: int = Query(0, ge=0, description="Número de registros a omitir"),
    referencia: Optional[str] = Query(None, description="Filtrar por referencia de pago"),
    tracking: Optional[str] = Query(None, description="Filtrar por tracking number"),
    carrier: Optional[str] = Query(None, description="Filtrar por carrier"),
    cliente: Optional[str] = Query(None, description="Filtrar por cliente"),
    tipo: Optional[str] = Query(None, description="Filtrar por tipo de pago"),
    id_transaccion: Optional[str] = Query(None, description="Filtrar por ID de transacción"),
    estado: Optional[List[str]] = Query(None, description="Filtrar por uno o varios estados de conciliación"),
    fecha_desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    fecha_hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)")
):
    """
    Obtiene pagos pendientes de contabilidad con paginación y filtros avanzados
    ✅ VALIDADO: Incluye filtro automático desde el 9 de junio de 2025
    """
    try:
        client = get_bigquery_client()

        FECHA_MINIMA = "2025-06-09"
        logger.info(f"🗓️ [DIAGNÓSTICO PAGOS] Filtro automático aplicado: >= {FECHA_MINIMA}")

        condiciones = ["1=1"]
        parametros = []

        condiciones.append("pc.fecha_pago >= @fecha_minima_auto")
        parametros.append(
            bigquery.ScalarQueryParameter("fecha_minima_auto", "DATE", FECHA_MINIMA)
        )

        if referencia and referencia.strip():
            condiciones.append("referencia_pago LIKE @referencia_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("referencia_filtro", "STRING", f"%{referencia.strip()}%")
            )

        if estado:
            estados_limpios = [e.strip().lower() for e in estado if e and e.strip()]
            if len(estados_limpios) == 1:
                condiciones.append("LOWER(estado_conciliacion) = @estado_filtro")
                parametros.append(
                    bigquery.ScalarQueryParameter("estado_filtro", "STRING", estados_limpios[0])
                )
            elif len(estados_limpios) > 1:
                in_params = []
                for idx, est in enumerate(estados_limpios):
                    param_name = f"estado_filtro_{idx}"
                    in_params.append(f"@{param_name}")
                    parametros.append(
                        bigquery.ScalarQueryParameter(param_name, "STRING", est)
                    )
                condiciones.append(f"LOWER(estado_conciliacion) IN ({', '.join(in_params)})")
        elif not (referencia and referencia.strip()):
            condiciones.append("estado_conciliacion = 'pendiente_conciliacion'")

        if fecha_desde:
            try:
                datetime.strptime(fecha_desde, "%Y-%m-%d")
                condiciones.append("pc.fecha_pago >= @fecha_desde")
                parametros.append(
                    bigquery.ScalarQueryParameter("fecha_desde", "DATE", fecha_desde)
                )
            except ValueError:
                raise HTTPException(status_code=400, detail="Formato de fecha_desde inválido (YYYY-MM-DD)")

        if fecha_hasta:
            try:
                datetime.strptime(fecha_hasta, "%Y-%m-%d")
                condiciones.append("pc.fecha_pago <= @fecha_hasta")
                parametros.append(
                    bigquery.ScalarQueryParameter("fecha_hasta", "DATE", fecha_hasta)
                )
            except ValueError:
                raise HTTPException(status_code=400, detail="Formato de fecha_hasta inválido (YYYY-MM-DD)")

        # Filtros adicionales
        if tracking and tracking.strip():
            condiciones.append("pc.tracking LIKE @tracking_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("tracking_filtro", "STRING", f"%{tracking.strip()}%")
            )

        if carrier and carrier.strip():
            condiciones.append("(COALESCE(cod.Carrier, gl.carrier, '') LIKE @carrier_filtro)")
            parametros.append(
                bigquery.ScalarQueryParameter("carrier_filtro", "STRING", f"%{carrier.strip()}%")
            )

        if cliente and cliente.strip():
            condiciones.append("(COALESCE(cod.Cliente, gl.cliente, '') LIKE @cliente_filtro)")
            parametros.append(
                bigquery.ScalarQueryParameter("cliente_filtro", "STRING", f"%{cliente.strip()}%")
            )

        if tipo and tipo.strip():
            condiciones.append("pc.tipo LIKE @tipo_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("tipo_filtro", "STRING", f"%{tipo.strip()}%")
            )

        if id_transaccion and id_transaccion.strip():
            try:
                id_trans_int = int(id_transaccion.strip())
                condiciones.append("pc.Id_Transaccion = @id_transaccion_filtro")
                parametros.append(
                    bigquery.ScalarQueryParameter("id_transaccion_filtro", "INTEGER", id_trans_int)
                )
            except ValueError:
                raise HTTPException(status_code=400, detail="ID de transacción debe ser un número válido")

        where_clause = "WHERE " + " AND ".join(condiciones)

        logger.info(f"🔍 Filtros aplicados - Referencia: {referencia}, Estado: {estado}, Fecha desde: {fecha_desde}, Fecha hasta: {fecha_hasta}")
        logger.info(f"📋 Condiciones SQL: {condiciones}")
        logger.info(f"🔧 WHERE clause: {where_clause}")

        count_query = f"""
            SELECT COUNT(*) as total
            FROM (
                SELECT pc.Id_Transaccion, pc.tracking, pc.referencia_pago
                FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
                LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1` cod 
                    ON pc.tracking = cod.tracking_number
                LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion` gl 
                    ON pc.tracking = gl.tracking_number
                {where_clause}
                GROUP BY pc.Id_Transaccion, pc.tracking, pc.referencia_pago
            ) as grouped_results
            """


        main_query = f"""
        SELECT 
            pc.referencia_pago,
            MAX(pc.correo) as correo_conductor,
            MAX(pc.fecha_pago) AS fecha,
            MAX(pc.valor_total_consignacion) AS valor,
            MAX(pc.entidad) AS entidad,
            MAX(pc.tipo) AS tipo,
            MAX(pc.comprobante) AS imagen,
            COUNT(*) AS num_comprobantes,
            pc.tracking AS trackings_preview,
            MAX(pc.estado_conciliacion) as estado_conciliacion,
            MAX(pc.novedades) as novedades,
            MAX(pc.creado_en) as fecha_creacion,
            MAX(pc.modificado_en) as fecha_modificacion,
            MAX(COALESCE(cod.Carrier, gl.carrier, 'N/A')) as carrier,
            MAX(COALESCE(cod.Cliente, gl.cliente, pc.cliente, 'N/A')) as cliente,
            MAX(COALESCE(cod.Valor, gl.valor_guia, 0)) as valor_tn,
            pc.Id_Transaccion as Id_Transaccion
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
        LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1` cod 
            ON pc.tracking = cod.tracking_number
        LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion` gl 
            ON pc.tracking = gl.tracking_number
        {where_clause}
        GROUP BY pc.Id_Transaccion, pc.tracking, pc.referencia_pago
        ORDER BY MAX(pc.fecha_pago) DESC, MAX(pc.creado_en) DESC, pc.referencia_pago, pc.tracking
        LIMIT {limit}
        OFFSET {offset}
        """

        job_config = bigquery.QueryJobConfig(query_parameters=parametros)

        with concurrent.futures.ThreadPoolExecutor() as executor:
            future_count = executor.submit(lambda: client.query(count_query, job_config=job_config).result())
            future_main = executor.submit(lambda: client.query(main_query, job_config=job_config).result())

            count_result = future_count.result(timeout=30)
            main_result = future_main.result(timeout=30)

        total_registros = next(count_result)["total"]
        total_paginas = (total_registros + limit - 1) // limit
        pagina_actual = (offset // limit) + 1

        pagos = []
        for row in main_result:
            # Ahora cada fila tiene un solo tracking, no necesitamos procesar múltiples
            trackings_preview = row.get("trackings_preview", "") or ""

            pagos.append({
                "referencia_pago": row.get("referencia_pago", ""),
                "valor": float(row.get("valor", 0)) if row.get("valor") else 0.0,
                "fecha": str(row.get("fecha", "")),
                "entidad": str(row.get("entidad", "")),
                "estado_conciliacion": str(row.get("estado_conciliacion", "")),
                "tipo": str(row.get("tipo", "")),
                "imagen": str(row.get("imagen", "")),
                "novedades": str(row.get("novedades", "")),
                "num_guias": int(row.get("num_comprobantes", 0)),
                "trackings_preview": trackings_preview,
                "correo_conductor": str(row.get("correo_conductor", "")),
                "fecha_creacion": row.get("fecha_creacion").isoformat() if row.get("fecha_creacion") else None,
                "fecha_modificacion": row.get("fecha_modificacion").isoformat() if row.get("fecha_modificacion") else None,
                "carrier": str(row.get("carrier", "N/A")),
                "cliente": str(row.get("cliente", "N/A")),
                "valor_tn": float(row.get("valor_tn", 0)) if row.get("valor_tn") else 0.0,
                "Id_Transaccion": row.get("Id_Transaccion", None)
            })

        paginacion_info = {
            "total_registros": total_registros,
            "total_paginas": total_paginas,
            "pagina_actual": pagina_actual,
            "registros_por_pagina": limit,
            "tiene_siguiente": pagina_actual < total_paginas,
            "tiene_anterior": pagina_actual > 1,
            "desde_registro": offset + 1 if pagos else 0,
            "hasta_registro": offset + len(pagos)
        }

        return {
            "pagos": pagos,
            "paginacion": paginacion_info,
            "filtros": {
                "referencia": referencia,
                "estado": estado,
                "fecha_desde": fecha_desde,
                "fecha_hasta": fecha_hasta
            },
            "timestamp": datetime.now().isoformat(),
            "status": "success"
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error("❌ Error en /pendientes-contabilidad:\n%s", traceback.format_exc())
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "pagos": [],
                "paginacion": {
                    "total_registros": 0,
                    "total_paginas": 0,
                    "pagina_actual": 1,
                    "registros_por_pagina": limit,
                    "tiene_siguiente": False,
                    "tiene_anterior": False,
                    "desde_registro": 0,
                    "hasta_registro": 0
                },
                "filtros": {
                    "referencia": referencia,
                    "estado": estado,
                    "fecha_desde": fecha_desde,
                    "fecha_hasta": fecha_hasta
                },
                "error": str(e),
                "trace": traceback.format_exc(),
                "status": "error",
                "timestamp": datetime.now().isoformat()
            }
        )

@router.get("/estadisticas-pendientes-contabilidad")
def obtener_estadisticas_pendientes_contabilidad(
    referencia: Optional[str] = Query(None, description="Filtrar por referencia de pago"),
    estado: Optional[List[str]] = Query(None, description="Filtrar por uno o varios estados de conciliación"),
    fecha_desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    fecha_hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)"),
    tracking: Optional[str] = Query(None, description="Filtrar por tracking"),
    carrier: Optional[str] = Query(None, description="Filtrar por carrier"),
    cliente: Optional[str] = Query(None, description="Filtrar por cliente"),
    tipo: Optional[str] = Query(None, description="Filtrar por tipo"),
    id_transaccion: Optional[str] = Query(None, description="Filtrar por ID de transacción")
):
    """
    Obtiene estadísticas globales de pagos pendientes de contabilidad sin paginación
    """
    try:
        client = get_bigquery_client()

        FECHA_MINIMA = "2025-06-09"
        logger.info(f"🗓️ [ESTADÍSTICAS] Filtro automático aplicado: >= {FECHA_MINIMA}")

        condiciones = ["1=1"]
        parametros = []

        condiciones.append("pc.fecha_pago >= @fecha_minima_auto")
        parametros.append(
            bigquery.ScalarQueryParameter("fecha_minima_auto", "DATE", FECHA_MINIMA)
        )

        if referencia and referencia.strip():
            condiciones.append("referencia_pago LIKE @referencia_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("referencia_filtro", "STRING", f"%{referencia.strip()}%")
            )

        if tracking and tracking.strip():
            condiciones.append("pc.tracking LIKE @tracking_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("tracking_filtro", "STRING", f"%{tracking.strip()}%")
            )

        if carrier and carrier.strip():
            condiciones.append("(COALESCE(cp.Carrier, gl.carrier, 'N/A') LIKE @carrier_filtro)")
            parametros.append(
                bigquery.ScalarQueryParameter("carrier_filtro", "STRING", f"%{carrier.strip()}%")
            )

        if cliente and cliente.strip():
            condiciones.append("(COALESCE(cp.Cliente, gl.client, pc.correo) LIKE @cliente_filtro)")
            parametros.append(
                bigquery.ScalarQueryParameter("cliente_filtro", "STRING", f"%{cliente.strip()}%")
            )

        if tipo and tipo.strip():
            condiciones.append("pc.tipo LIKE @tipo_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("tipo_filtro", "STRING", f"%{tipo.strip()}%")
            )

        if fecha_desde:
            try:
                datetime.strptime(fecha_desde, "%Y-%m-%d")
                condiciones.append("pc.fecha_pago >= @fecha_desde")
                parametros.append(
                    bigquery.ScalarQueryParameter("fecha_desde", "DATE", fecha_desde)
                )
            except ValueError:
                pass

        if fecha_hasta:
            try:
                datetime.strptime(fecha_hasta, "%Y-%m-%d")
                condiciones.append("pc.fecha_pago <= @fecha_hasta")
                parametros.append(
                    bigquery.ScalarQueryParameter("fecha_hasta", "DATE", fecha_hasta)
                )
            except ValueError:
                pass

        if id_transaccion and id_transaccion.strip():
            try:
                id_trans_int = int(id_transaccion.strip())
                condiciones.append("pc.Id_Transaccion = @id_transaccion_filtro")
                parametros.append(
                    bigquery.ScalarQueryParameter("id_transaccion_filtro", "INTEGER", id_trans_int)
                )
            except ValueError:
                pass  # En estadísticas, ignoramos el error silenciosamente

        if estado and len(estado) > 0:
            placeholders = []
            for i, e in enumerate(estado):
                param_name = f"estado_{i}"
                placeholders.append(f"@{param_name}")
                parametros.append(
                    bigquery.ScalarQueryParameter(param_name, "STRING", e.strip().lower())
                )
            condiciones.append(f"LOWER(pc.estado_conciliacion) IN ({', '.join(placeholders)})")

        condiciones_sql = " AND ".join(condiciones)

        # Query para estadísticas (COUNT, SUM)
        estadisticas_query = f"""
        SELECT 
            COUNT(DISTINCT pc.referencia_pago) as total_registros,
            ROUND(SUM(CAST(pc.valor AS FLOAT64)), 2) as total_valor,
            ROUND(SUM(CASE 
                WHEN pc.estado_conciliacion IN ('pendiente_conciliacion', 'conciliado_automatico') 
                THEN COALESCE(CAST(cp.Valor AS FLOAT64), 0.0)
                ELSE COALESCE(CAST(gl.valor_guia AS FLOAT64), 0.0)
            END), 2) as total_valor_tn,
            ROUND(SUM(CAST(pc.valor AS FLOAT64)) - SUM(CASE 
                WHEN pc.estado_conciliacion IN ('pendiente_conciliacion', 'conciliado_automatico') 
                THEN COALESCE(CAST(cp.Valor AS FLOAT64), 0.0)
                ELSE COALESCE(CAST(gl.valor_guia AS FLOAT64), 0.0)
            END), 2) as total_saldo
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
        LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1` cp 
            ON pc.tracking = cp.tracking_number
        LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion` gl 
            ON pc.tracking = gl.tracking_number
        WHERE {condiciones_sql}
        """

        job_config = bigquery.QueryJobConfig(query_parameters=parametros)
        query_job = client.query(estadisticas_query, job_config=job_config)
        resultados = list(query_job.result())

        if resultados:
            estadisticas = resultados[0]
            return {
                "total_registros": estadisticas.total_registros or 0,
                "total_valor": estadisticas.total_valor or 0.0,
                "total_valor_tn": estadisticas.total_valor_tn or 0.0,
                "total_saldo": estadisticas.total_saldo or 0.0
            }
        else:
            return {
                "total_registros": 0,
                "total_valor": 0.0,
                "total_valor_tn": 0.0,
                "total_saldo": 0.0
            }

    except Exception as e:
        logger.error("❌ Error en /estadisticas-pendientes-contabilidad:\n%s", traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor: {str(e)}"
        )


@router.post("/aprobar-pago")
def aprobar_pago(payload: dict):
    """
    Aprueba un pago cambiando su estado a conciliado_manual
    """
    referencia = payload.get("referencia_pago")
    modificado_por = payload.get("modificado_por")

    if not referencia or not modificado_por:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": "Faltan campos requeridos (referencia_pago, modificado_por)."}
        )

    try:
        client = get_bigquery_client()
        
        # Verificar que el pago existe y está en estado pendiente
        verificacion_query = """
        SELECT COUNT(*) as total, MAX(estado_conciliacion) as estado_actual
        FROM `{project}.{dataset}.pagosconductor`
        WHERE referencia_pago = @referencia
        """.format(project=PROJECT_ID, dataset=DATASET_CONCILIACIONES)
        
        job_config_verificacion = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia)
            ]
        )
        
        resultado_verificacion = client.query(verificacion_query, job_config=job_config_verificacion).result()
        fila_verificacion = next(resultado_verificacion)
        
        if fila_verificacion["total"] == 0:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={"detail": f"No se encontró el pago con referencia {referencia}"}
            )
        
        estado_actual = fila_verificacion["estado_actual"]
        if estado_actual != "pendiente_conciliacion":
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"detail": f"El pago ya ha sido procesado (estado actual: {estado_actual})"}
            )

        # Actualizar el estado del pago
        timestamp_actual = datetime.now()
        
        query_aprobar = """
        UPDATE `{project}.{dataset}.pagosconductor`
        SET estado_conciliacion = 'conciliado_manual',
            modificado_por = @modificado_por,
            modificado_en = @timestamp_modificacion,
            novedades = CASE 
                WHEN novedades IS NULL OR novedades = '' 
                THEN CONCAT('Aprobado por ', @modificado_por, ' el ', FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', @timestamp_modificacion))
                ELSE CONCAT(novedades, ' | Aprobado por ', @modificado_por, ' el ', FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', @timestamp_modificacion))
            END
        WHERE referencia_pago = @referencia
        """.format(project=PROJECT_ID, dataset=DATASET_CONCILIACIONES)

        job_config_aprobar = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia),
                bigquery.ScalarQueryParameter("modificado_por", "STRING", modificado_por),
                bigquery.ScalarQueryParameter("timestamp_modificacion", "TIMESTAMP", timestamp_actual),
            ]
        )

        # Ejecutar la actualización
        job = client.query(query_aprobar, job_config=job_config_aprobar)
        job.result()  # Esperar a que termine

        # Contar cuántas guías fueron liberadas
        conteo_query = """
        SELECT COUNT(*) as total_guias
        FROM `{project}.{dataset}.pagosconductor`
        WHERE referencia_pago = @referencia
        """.format(project=PROJECT_ID, dataset=DATASET_CONCILIACIONES)
        
        job_config_conteo = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia)
            ]
        )
        
        resultado_conteo = client.query(conteo_query, job_config=job_config_conteo).result()
        total_guias = next(resultado_conteo)["total_guias"]

        

        return {
            "mensaje": "Pago aprobado y conciliado manualmente",
            "referencia_pago": referencia,
            "total_guias": total_guias,
            "modificado_por": modificado_por,
            "timestamp": timestamp_actual.isoformat(),
            "nuevo_estado": "conciliado_manual"
        }

    except Exception as e:

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": f"Error interno del servidor: {str(e)}"}
        )


@router.post("/rechazar-pago")
def rechazar_pago(payload: dict):
    """
    Rechaza un pago cambiando su estado a rechazado y agregando la novedad
    """
    referencia_pago = payload.get("referencia_pago")
    id_transaccion = payload.get("id_transaccion")
    novedad = payload.get("novedad")
    modificado_por = payload.get("modificado_por")

    if (not referencia_pago and not id_transaccion) or not novedad or not modificado_por:
        raise HTTPException(
            status_code=400,
            detail="Faltan campos requeridos (referencia_pago o id_transaccion, novedad, modificado_por)"
        )

    if not novedad.strip():
        raise HTTPException(
            status_code=400,
            detail="La observación de rechazo no puede estar vacía"
        )

    try:
        client = get_bigquery_client()
        # Si se envía id_transaccion, priorizarlo
        if id_transaccion is not None:
            # Validar que todos los pagos del grupo puedan ser rechazados
            verificacion_query = f"""
                SELECT COUNT(*) as total, COUNTIF(estado_conciliacion IN ('rechazado', 'conciliado_manual', 'conciliado_automatico')) as no_rechazables
                FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
                WHERE Id_Transaccion = @id_transaccion
            """
            job_config_verificacion = bigquery.QueryJobConfig(query_parameters=[
                bigquery.ScalarQueryParameter("id_transaccion", "INT64", id_transaccion)
            ])
            resultado_verificacion = client.query(verificacion_query, job_config=job_config_verificacion).result()
            fila_verificacion = next(resultado_verificacion)
            if fila_verificacion["total"] == 0:
                raise HTTPException(status_code=404, detail=f"No se encontró ningún pago con Id_Transaccion {id_transaccion}")
            if fila_verificacion["no_rechazables"] > 0:
                raise HTTPException(status_code=400, detail="No se puede rechazar porque uno o más pagos del grupo ya están rechazados o conciliados")

            # Actualizar todos los pagos con ese Id_Transaccion
            query_rechazar = f"""
                UPDATE `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
                SET estado_conciliacion = 'rechazado',
                    novedades = CONCAT('RECHAZADO: ', @novedad, ' | Por: ', @modificado_por, ' el ', FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', @timestamp_modificacion)),
                    modificado_por = @modificado_por,
                    modificado_en = @timestamp_modificacion
                WHERE Id_Transaccion = @id_transaccion
            """
            job_config_rechazar = bigquery.QueryJobConfig(query_parameters=[
                bigquery.ScalarQueryParameter("id_transaccion", "INT64", id_transaccion),
                bigquery.ScalarQueryParameter("novedad", "STRING", novedad.strip()),
                bigquery.ScalarQueryParameter("modificado_por", "STRING", modificado_por),
                bigquery.ScalarQueryParameter("timestamp_modificacion", "TIMESTAMP", datetime.now()),
            ])
            job = client.query(query_rechazar, job_config=job_config_rechazar)
            job.result()

            # Contar cuántas guías fueron afectadas
            conteo_query = f"""
                SELECT COUNT(*) as total_guias
                FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
                WHERE Id_Transaccion = @id_transaccion
            """
            job_config_conteo = bigquery.QueryJobConfig(query_parameters=[
                bigquery.ScalarQueryParameter("id_transaccion", "INT64", id_transaccion)
            ])
            resultado_conteo = client.query(conteo_query, job_config=job_config_conteo).result()
            total_guias = next(resultado_conteo)["total_guias"]

            return {
                "mensaje": f"Pagos con Id_Transaccion {id_transaccion} rechazados exitosamente",
                "Id_Transaccion": id_transaccion,
                "novedad": novedad,
                "total_guias": total_guias,
                "modificado_por": modificado_por,
                "timestamp": datetime.now().isoformat(),
                "nuevo_estado": "rechazado"
            }
        else:
            # Buscar el Id_Transaccion de la referencia
            query_id_trans = f"""
                SELECT Id_Transaccion FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
                WHERE referencia_pago = @referencia
                LIMIT 1
            """
            job_config_id = bigquery.QueryJobConfig(query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago)
            ])
            result_id = client.query(query_id_trans, job_config=job_config_id).result()
            row_id = next(result_id, None)
            id_trans = row_id.Id_Transaccion if row_id else None

            if id_trans is not None:
                # Validar que todos los pagos del grupo puedan ser rechazados
                verificacion_query = f"""
                    SELECT COUNT(*) as total, COUNTIF(estado_conciliacion IN ('rechazado', 'conciliado_manual', 'conciliado_automatico')) as no_rechazables
                    FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
                    WHERE Id_Transaccion = @id_transaccion
                """
                job_config_verificacion = bigquery.QueryJobConfig(query_parameters=[
                    bigquery.ScalarQueryParameter("id_transaccion", "INT64", id_trans)
                ])
                resultado_verificacion = client.query(verificacion_query, job_config=job_config_verificacion).result()
                fila_verificacion = next(resultado_verificacion)
                if fila_verificacion["total"] == 0:
                    raise HTTPException(status_code=404, detail=f"No se encontró ningún pago con Id_Transaccion {id_trans}")
                if fila_verificacion["no_rechazables"] > 0:
                    raise HTTPException(status_code=400, detail="No se puede rechazar porque uno o más pagos del grupo ya están rechazados o conciliados")

                # Actualizar todos los pagos con ese Id_Transaccion
                query_rechazar = f"""
                    UPDATE `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
                    SET estado_conciliacion = 'rechazado',
                        novedades = CONCAT('RECHAZADO: ', @novedad, ' | Por: ', @modificado_por, ' el ', FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', @timestamp_modificacion)),
                        modificado_por = @modificado_por,
                        modificado_en = @timestamp_modificacion
                    WHERE Id_Transaccion = @id_transaccion
                """
                job_config_rechazar = bigquery.QueryJobConfig(query_parameters=[
                    bigquery.ScalarQueryParameter("id_transaccion", "INT64", id_trans),
                    bigquery.ScalarQueryParameter("novedad", "STRING", novedad.strip()),
                    bigquery.ScalarQueryParameter("modificado_por", "STRING", modificado_por),
                    bigquery.ScalarQueryParameter("timestamp_modificacion", "TIMESTAMP", datetime.now()),
                ])
                job = client.query(query_rechazar, job_config=job_config_rechazar)
                job.result()

                conteo_query = f"""
                    SELECT COUNT(*) as total_guias
                    FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
                    WHERE Id_Transaccion = @id_transaccion
                """
                job_config_conteo = bigquery.QueryJobConfig(query_parameters=[
                    bigquery.ScalarQueryParameter("id_transaccion", "INT64", id_trans)
                ])
                resultado_conteo = client.query(conteo_query, job_config=job_config_conteo).result()
                total_guias = next(resultado_conteo)["total_guias"]

                return {
                    "mensaje": f"Pagos con Id_Transaccion {id_trans} rechazados exitosamente",
                    "Id_Transaccion": id_trans,
                    "novedad": novedad,
                    "total_guias": total_guias,
                    "modificado_por": modificado_por,
                    "timestamp": datetime.now().isoformat(),
                    "nuevo_estado": "rechazado"
                }
            else:
                # Comportamiento original: solo por referencia_pago
                verificacion_query = f"""
                    SELECT COUNT(*) as total, MAX(estado_conciliacion) as estado_actual
                    FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
                    WHERE referencia_pago = @referencia
                """
                job_config_verificacion = bigquery.QueryJobConfig(query_parameters=[
                    bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago)
                ])
                resultado_verificacion = client.query(verificacion_query, job_config=job_config_verificacion).result()
                fila_verificacion = next(resultado_verificacion)
                if fila_verificacion["total"] == 0:
                    raise HTTPException(status_code=404, detail=f"No se encontró el pago con referencia {referencia_pago}")
                estado_actual = fila_verificacion["estado_actual"]
                if estado_actual in ["rechazado", "conciliado_manual", "conciliado_automatico"]:
                    raise HTTPException(status_code=400, detail=f"El pago no puede ser rechazado (estado actual: {estado_actual})")

                query_rechazar = f"""
                    UPDATE `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
                    SET estado_conciliacion = 'rechazado',
                        novedades = CONCAT('RECHAZADO: ', @novedad, ' | Por: ', @modificado_por, ' el ', FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', @timestamp_modificacion)),
                        modificado_por = @modificado_por,
                        modificado_en = @timestamp_modificacion
                    WHERE referencia_pago = @referencia_pago
                """
                job_config_rechazar = bigquery.QueryJobConfig(query_parameters=[
                    bigquery.ScalarQueryParameter("referencia_pago", "STRING", referencia_pago),
                    bigquery.ScalarQueryParameter("novedad", "STRING", novedad.strip()),
                    bigquery.ScalarQueryParameter("modificado_por", "STRING", modificado_por),
                    bigquery.ScalarQueryParameter("timestamp_modificacion", "TIMESTAMP", datetime.now()),
                ])
                job = client.query(query_rechazar, job_config=job_config_rechazar)
                job.result()

                conteo_query = f"""
                    SELECT COUNT(*) as total_guias
                    FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
                    WHERE referencia_pago = @referencia
                """
                job_config_conteo = bigquery.QueryJobConfig(query_parameters=[
                    bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago)
                ])
                resultado_conteo = client.query(conteo_query, job_config=job_config_conteo).result()
                total_guias = next(resultado_conteo)["total_guias"]

                return {
                    "mensaje": f"Pago con referencia {referencia_pago} rechazado exitosamente",
                    "referencia_pago": referencia_pago,
                    "novedad": novedad,
                    "total_guias": total_guias,
                    "modificado_por": modificado_por,
                    "timestamp": datetime.now().isoformat(),
                    "nuevo_estado": "rechazado"
                }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno del servidor: {str(e)}")

async def notificar_error_bono(correo: str, excedente: float, razon: str):
    """
    Notifica a los administradores cuando hay un error al registrar un bono por excedente
    """
    try:
        error_log = {
            "tipo": "error_bono_excedente",
            "correo_conductor": correo,
            "excedente": excedente,
            "razon": razon,
            "fecha": datetime.now().isoformat()
        }
        
        # Registrar en tabla de errores
        client = bigquery.Client()
        table_id = f"{PROJECT_ID}.{DATASET_CONCILIACIONES}.errores_bonos"
        
        query = f"""
        INSERT INTO `{table_id}` (
            tipo_error, correo_conductor, excedente, razon, fecha_error
        ) VALUES (
            'error_bono_excedente', @correo, @excedente, @razon, CURRENT_TIMESTAMP()
        )
        """
        
        job_config = bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("correo", "STRING", correo),
            bigquery.ScalarQueryParameter("excedente", "FLOAT64", excedente),
            bigquery.ScalarQueryParameter("razon", "STRING", razon),
        ])
        
        client.query(query, job_config=job_config).result()
        
        
    except Exception as e:
        logger.error(f"❌ Error al notificar error de bono: {e}")

@router.get("/historial")
async def obtener_historial_pagos(
    limite: int = Query(50, description="Número máximo de registros a devolver (0 = todos)"),
    offset: int = Query(0, description="Número de registros a omitir"),
    fecha_inicio: Optional[str] = Query(None, description="Fecha de inicio (YYYY-MM-DD)"),
    fecha_fin: Optional[str] = Query(None, description="Fecha de fin (YYYY-MM-DD)"),
    estado: Optional[str] = Query(None, description="Estado del pago"),
    conductor: Optional[str] = Query(None, description="Email del conductor")
):
    """
    Obtiene el historial de pagos con filtros opcionales
    limite = 0 devuelve TODOS los registros sin límite
    """
    try:
        client = get_bigquery_client()
        
        # Construir la consulta base simplificada
        query = f"""
        SELECT 
            pc.referencia_pago,
            pc.fecha_pago,
            pc.hora_pago,
            pc.correo as correo_conductor,
            pc.cliente,
            pc.tipo,
            pc.entidad,
            COALESCE(pc.valor_total_consignacion, pc.valor) as valor_pago,
            pc.estado_conciliacion,
            pc.creado_en as fecha_registro,
            pc.creado_por,
            pc.tracking,
            COUNT(*) OVER (PARTITION BY pc.referencia_pago) as num_guias,
            COALESCE(cod.Carrier, gl.carrier, 'N/A') as carrier
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
        LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1` cod 
            ON pc.tracking = cod.tracking_number
        LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion` gl 
            ON pc.tracking = gl.tracking_number
        WHERE 1=1
        """
        
        # Agregar filtros dinámicamente
        query_params = []
        
        if fecha_inicio:
            query += " AND DATE(fecha_pago) >= @fecha_inicio"
            query_params.append(bigquery.ScalarQueryParameter("fecha_inicio", "DATE", fecha_inicio))
        
        if fecha_fin:
            query += " AND DATE(fecha_pago) <= @fecha_fin"
            query_params.append(bigquery.ScalarQueryParameter("fecha_fin", "DATE", fecha_fin))
        
        if estado:
            query += " AND estado_conciliacion = @estado"
            query_params.append(bigquery.ScalarQueryParameter("estado", "STRING", estado))
        
        if conductor:
            query += " AND LOWER(correo) LIKE @conductor"
            query_params.append(bigquery.ScalarQueryParameter("conductor", "STRING", f"%{conductor.lower()}%"))
        
        # Agregar ordenación
        query += " ORDER BY fecha_pago DESC, hora_pago DESC, creado_en DESC"
        
        # Solo agregar límite si es mayor que 0
        if limite > 0:
            query += " LIMIT @limite OFFSET @offset"
            query_params.extend([
                bigquery.ScalarQueryParameter("limite", "INT64", limite),
                bigquery.ScalarQueryParameter("offset", "INT64", offset)
            ])
        
       
        
        # Ejecutar consulta
        job_config = bigquery.QueryJobConfig(query_parameters=query_params)
        results = client.query(query, job_config=job_config).result()
        
        # Convertir resultados
        historial = []
        for row in results:
            # Log temporal para depuración de creado_por
            logger.info(f"[HISTORIAL] referencia_pago={row.referencia_pago} | creado_por={getattr(row, 'creado_por', None)} | carrier={getattr(row, 'carrier', None)}")
            pago = {
                "referencia_pago": row.referencia_pago or "",
                "fecha": row.fecha_pago.isoformat() if row.fecha_pago else None,
                "hora_pago": str(row.hora_pago) if row.hora_pago else "",
                "correo_conductor": row.correo_conductor or "",
                "cliente": row.cliente or "",
                "tipo": row.tipo or "",
                "entidad": row.entidad or "",
                "valor": float(row.valor_pago) if row.valor_pago else 0.0,
                "estado": row.estado_conciliacion or "pendiente",
                "fecha_registro": row.fecha_registro.isoformat() if row.fecha_registro else None,
                "creado_por": getattr(row, 'creado_por', None) or "",
                "tracking": row.tracking or "",
                "num_guias": int(row.num_guias) if row.num_guias else 0,
                "imagen": "",  # Agregar campo imagen vacío por compatibilidad
                "novedades": "",  # Agregar campo novedades vacío por compatibilidad
                "carrier": getattr(row, 'carrier', None) or "N/A"
            }
            historial.append(pago)
        
        # Obtener conteo total para paginación - consulta simplificada
        count_query = """
        SELECT COUNT(DISTINCT referencia_pago) as total
        FROM `{project}.{dataset}.pagosconductor`
        WHERE 1=1
        """.format(project=PROJECT_ID, dataset=DATASET_CONCILIACIONES)
        
        # Aplicar los mismos filtros para el conteo
        count_params = []
        
        if fecha_inicio:
            count_query += " AND DATE(fecha_pago) >= @fecha_inicio"
            count_params.append(bigquery.ScalarQueryParameter("fecha_inicio", "DATE", fecha_inicio))
        
        if fecha_fin:
            count_query += " AND DATE(fecha_pago) <= @fecha_fin"
            count_params.append(bigquery.ScalarQueryParameter("fecha_fin", "DATE", fecha_fin))
        
        if estado:
            count_query += " AND estado_conciliacion = @estado"
            count_params.append(bigquery.ScalarQueryParameter("estado", "STRING", estado))
        
        if conductor:
            count_query += " AND LOWER(correo) LIKE @conductor"
            count_params.append(bigquery.ScalarQueryParameter("conductor", "STRING", f"%{conductor.lower()}%"))
        
        count_job_config = bigquery.QueryJobConfig(query_parameters=count_params)
        count_result = list(client.query(count_query, job_config=count_job_config).result())
        total_registros = count_result[0].total if count_result else 0
        
        
        return {
            "historial": historial,
            "total": total_registros,
            "limite": limite,
            "offset": offset,
            "tiene_mas": (offset + limite) < total_registros if limite > 0 else False
        }
        
    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor: {str(e)}"
        )

@router.get("/exportar-pendientes-contabilidad")
def exportar_todos_pagos_pendientes_contabilidad(
    referencia: Optional[str] = Query(None, description="Filtrar por referencia de pago"),
    carrier: Optional[str] = Query(None, description="Filtrar por carrier"),
    valor: Optional[float] = Query(None, ge=0, description="Filtrar por valor del pago"),
    estado: Optional[List[str]] = Query(None, description="Filtrar por uno o varios estados de conciliación"),
    fecha_desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    fecha_hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)"),
    id_transaccion: Optional[int] = Query(None, ge=1, description="Filtrar por Id_Transaccion exacto")
):
    """
    Exporta TODOS los pagos pendientes de contabilidad que coincidan con los filtros (sin paginación)
    ✅ ACTUALIZADO: Usa exactamente los mismos filtros que obtener_pagos_pendientes_contabilidad
    ✅ NUEVO: Agrupa por Id_Transaccion cuando existe, o por referencia individual
    ✅ INCLUYE: Todas las columnas de banco asociado (id_banco_asociado, valor_banco_asociado, etc.)
    """
    try:
        client = get_bigquery_client()

        FECHA_MINIMA = "2025-06-09"
        logger.info(f"🗓️ [DIAGNÓSTICO EXPORTAR] Filtro automático aplicado: >= {FECHA_MINIMA}")

        # 🔥 USAR EXACTAMENTE LA MISMA LÓGICA DE FILTROS
        condiciones = ["1=1"]
        parametros = []

        # Filtro automático de fecha mínima
        condiciones.append("pc.fecha_pago >= @fecha_minima_auto")
        parametros.append(
            bigquery.ScalarQueryParameter("fecha_minima_auto", "DATE", FECHA_MINIMA)
        )

        if referencia and referencia.strip():
            condiciones.append("pc.referencia_pago LIKE @referencia_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("referencia_filtro", "STRING", f"%{referencia.strip()}%")
            )

        if carrier and carrier.strip():
            condiciones.append("LOWER(COALESCE(cod.Carrier, gl.carrier, '')) LIKE @carrier_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("carrier_filtro", "STRING", f"%{carrier.strip().lower()}%")
            )
        
        if valor is not None:
            condiciones.append("pc.valor_total_consignacion = @valor_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("valor_filtro", "FLOAT64", float(valor))
            )

        # 🔥 FILTRO: Id_Transaccion exacto
        if id_transaccion is not None:
            condiciones.append("pc.Id_Transaccion = @id_transaccion_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("id_transaccion_filtro", "INTEGER", id_transaccion)
            )

        # 🔥 LÓGICA EXACTA DE ESTADOS
        if estado:
            estados_limpios = [e.strip() for e in estado if e and e.strip()]
            if len(estados_limpios) == 1:
                condiciones.append("pc.estado_conciliacion = @estado_filtro")
                parametros.append(
                    bigquery.ScalarQueryParameter("estado_filtro", "STRING", estados_limpios[0])
                )
            elif len(estados_limpios) > 1:
                in_params = []
                for idx, est in enumerate(estados_limpios):
                    param_name = f"estado_filtro_{idx}"
                    in_params.append(f"@{param_name}")
                    parametros.append(
                        bigquery.ScalarQueryParameter(param_name, "STRING", est)
                    )
                condiciones.append(f"pc.estado_conciliacion IN ({', '.join(in_params)})")
        elif not any([
            referencia and referencia.strip(),
            carrier and carrier.strip(),
            fecha_desde,
            fecha_hasta,
            id_transaccion is not None
        ]):
            # Solo aplicar filtro por defecto si no hay otros filtros específicos
            condiciones.append("pc.estado_conciliacion = 'pendiente_conciliacion'")

        if fecha_desde:
            try:
                datetime.strptime(fecha_desde, "%Y-%m-%d")
                condiciones.append("pc.fecha_pago >= @fecha_desde")
                parametros.append(
                    bigquery.ScalarQueryParameter("fecha_desde", "DATE", fecha_desde)
                )
            except ValueError:
                raise HTTPException(status_code=400, detail="Formato de fecha_desde inválido (YYYY-MM-DD)")

        if fecha_hasta:
            try:
                datetime.strptime(fecha_hasta, "%Y-%m-%d")
                condiciones.append("pc.fecha_pago <= @fecha_hasta")
                parametros.append(
                    bigquery.ScalarQueryParameter("fecha_hasta", "DATE", fecha_hasta)
                )
            except ValueError:
                raise HTTPException(status_code=400, detail="Formato de fecha_hasta inválido (YYYY-MM-DD)")

        where_clause = "WHERE " + " AND ".join(condiciones)

        # ⭐ CONSULTA DE EXPORTACIÓN CON AGRUPACIÓN IDÉNTICA A LA CONSULTA PRINCIPAL
        export_query = f"""
        SELECT 
            CASE 
                WHEN pc.Id_Transaccion IS NOT NULL THEN CAST(pc.Id_Transaccion AS STRING)
                ELSE CONCAT(pc.referencia_pago, '|', pc.correo, '|', CAST(pc.fecha_pago AS STRING))
            END as grupo_id,
            
            -- 🔥 REFERENCIAS AGRUPADAS
            CASE 
                WHEN pc.Id_Transaccion IS NOT NULL AND COUNT(DISTINCT pc.referencia) > 1 THEN 
                    STRING_AGG(DISTINCT pc.referencia, ', ')
                WHEN pc.Id_Transaccion IS NOT NULL THEN 
                    MAX(pc.referencia)
                ELSE MAX(pc.referencia_pago)
            END as referencia_pago_display,
            
            CASE 
                WHEN pc.Id_Transaccion IS NOT NULL THEN MAX(pc.referencia)
                ELSE MAX(pc.referencia_pago)
            END as referencia_pago_principal,
            
            CASE 
                WHEN pc.Id_Transaccion IS NOT NULL THEN COUNT(DISTINCT pc.referencia)
                ELSE COUNT(DISTINCT pc.referencia_pago)
            END as num_referencias,
            
            MAX(pc.correo) as correo_conductor,
            MAX(pc.fecha_pago) as fecha,
            MAX(FORMAT_TIMESTAMP('%Y-%m-%d', pc.creado_en, 'America/Bogota')) AS creado_en,
            COALESCE(MAX(pc.valor_total_consignacion), SUM(pc.valor)) AS valor,
            MAX(pc.hora_pago) AS hora_pago,
            MAX(pc.entidad) AS entidad,
            MAX(pc.tipo) AS tipo,
            MAX(pc.comprobante) AS imagen,
            COUNT(DISTINCT pc.tracking) AS num_guias,
            STRING_AGG(DISTINCT SAFE_CAST(pc.tracking AS STRING), ', ') AS trackings_completos,
            MAX(pc.estado_conciliacion) as estado_conciliacion,
            MAX(pc.novedades) as novedades,
            MAX(pc.creado_en) as fecha_creacion,
            MAX(pc.modificado_en) as fecha_modificacion,
            MAX(COALESCE(cod.Carrier, gl.carrier, 'N/A')) as carrier,
            MAX(pc.Id_Transaccion) AS Id_Transaccion,
            -- 🔥 CAMPOS DE BANCO ASOCIADO COMPLETOS
            MAX(pc.id_banco_asociado) AS id_banco_asociado,
            MAX(bm.valor_banco) AS valor_banco_asociado,
            MAX(bm.fecha) AS fecha_movimiento_banco,
            MAX(bm.descripcion) AS descripcion_banco,

            CASE 
                WHEN pc.Id_Transaccion IS NOT NULL AND COUNT(DISTINCT pc.referencia) > 1 
                THEN true 
                ELSE false 
            END as es_grupo_transaccion
            
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
        LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1` cod 
            ON pc.tracking = cod.tracking_number
        LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion` gl 
            ON pc.tracking = gl.tracking_number
        -- 🔥 AGREGADO: JOIN CON TABLA DE MOVIMIENTOS BANCARIOS
        LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.banco_movimientos` bm 
            ON pc.id_banco_asociado = bm.id
        {where_clause}
        GROUP BY grupo_id, pc.Id_Transaccion
        ORDER BY MAX(pc.fecha_pago) DESC, MAX(pc.creado_en) DESC
        """
        
        job_config = bigquery.QueryJobConfig(query_parameters=parametros)
        
        # Ejecutar consulta con timeout extendido para exportación
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future_export = executor.submit(lambda: client.query(export_query, job_config=job_config).result())
            export_result = future_export.result(timeout=120)  # 2 minutos para exportación completa
        
        # Procesar todos los resultados
        pagos_exportar = []
        for row in export_result:
            # 🔥 FORMATEAR REFERENCIA DISPLAY IGUAL QUE EN LA CONSULTA PRINCIPAL
            referencia_display = row.get("referencia_pago_display", "")
            num_referencias = row.get("num_referencias", 1)
            es_grupo = row.get("es_grupo_transaccion", False)
            
            if es_grupo and num_referencias > 1:
                referencia_display = f"🔗 {referencia_display}"  # Emoji para indicar agrupación

            pago = {
                "referencia_pago": referencia_display,
                "referencia_pago_principal": row.get("referencia_pago_principal", ""),
                "num_referencias": num_referencias,
                "es_grupo_transaccion": es_grupo,
                "valor": float(row.get("valor", 0)) if row.get("valor") else 0.0,
                "fecha": str(row.get("fecha", "")),
                "creado_en": str(row.get("creado_en", "")),
                "hora_pago": str(row.get("hora_pago", "")),
                "entidad": str(row.get("entidad", "")),
                "estado_conciliacion": str(row.get("estado_conciliacion", "")),
                "tipo": str(row.get("tipo", "")),
                "imagen": str(row.get("imagen", "")),
                "novedades": str(row.get("novedades", "")),
                "num_guias": int(row.get("num_guias", 0)),
                "trackings_completos": str(row.get("trackings_completos", "")),
                "correo_conductor": str(row.get("correo_conductor", "")),
                "fecha_creacion": row.get("fecha_creacion").isoformat() if row.get("fecha_creacion") else None,
                "fecha_modificacion": row.get("fecha_modificacion").isoformat() if row.get("fecha_modificacion") else None,
                "carrier": str(row.get("carrier", "N/A")),
                "Id_Transaccion": row.get("Id_Transaccion", None),
                # 🔥 AGREGADO: Campos de banco en la respuesta
                "id_banco_asociado": row.get("id_banco_asociado", None),
                "valor_banco_asociado": float(row.get("valor_banco_asociado", 0)) if row.get("valor_banco_asociado") else None,
                "fecha_movimiento_banco": str(row.get("fecha_movimiento_banco", "")) if row.get("fecha_movimiento_banco") else None,
                "descripcion_banco": str(row.get("descripcion_banco", "")) if row.get("descripcion_banco") else None
            }
            pagos_exportar.append(pago)
        
        # Información de la exportación
        info_exportacion = {
            "total_registros_exportados": len(pagos_exportar),
            "filtros_aplicados": {
                "referencia": referencia,
                "carrier": carrier,
                "valor": valor,
                "estado": estado,
                "fecha_desde": fecha_desde,
                "fecha_hasta": fecha_hasta,
                "id_transaccion": id_transaccion
            },
            "fecha_exportacion": datetime.now().isoformat()
        }
        
        logger.info(f"📊 [EXPORTAR] Total registros exportados: {len(pagos_exportar)}")
        
        return {
            "pagos": pagos_exportar,
            "info_exportacion": info_exportacion,
            "status": "success"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error en exportación: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor en exportación: {str(e)}"
        )

# Endpoint para debugging - verificar referencias
@router.get("/debug/verificar-referencia/{referencia}")
def debug_verificar_referencia(referencia: str):
    """
    Endpoint de debugging para verificar si una referencia existe y en qué estados
    """
    try:
        client = get_bigquery_client()
        
        # Buscar la referencia en todos los estados
        query = f"""
        SELECT 
            referencia_pago,
            estado_conciliacion,
            COUNT(*) as total_guias,
            fecha_pago,
            correo as conductor,
            MAX(creado_en) as fecha_creacion
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
        WHERE referencia_pago LIKE @referencia_filtro
        GROUP BY referencia_pago, estado_conciliacion, fecha_pago, correo
        ORDER BY fecha_pago DESC
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia_filtro", "STRING", f"%{referencia}%")
            ]
        )
        
        results = client.query(query, job_config=job_config).result()
        
        resultados = []
        for row in results:
            resultado = {
                "referencia_pago": row.referencia_pago,
                "estado_conciliacion": row.estado_conciliacion,
                "total_guias": row.total_guias,
                "fecha_pago": str(row.fecha_pago),
                "conductor": row.conductor,
                "fecha_creacion": row.fecha_creacion.isoformat() if row.fecha_creacion else None
            }
            resultados.append(resultado)
        
        return {
            "referencia_buscada": referencia,
            "total_encontradas": len(resultados),
            "resultados": resultados,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"❌ Error en debug verificar referencia: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error verificando referencia: {str(e)}"
        )

@router.get("/estadisticas-pendientes-contabilidad")
def obtener_estadisticas_pendientes_contabilidad(
    referencia: Optional[str] = Query(None, description="Filtrar por referencia de pago"),
    estado: Optional[List[str]] = Query(None, description="Filtrar por uno o varios estados de conciliación"),
    fecha_desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    fecha_hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)"),
    tracking: Optional[str] = Query(None, description="Filtrar por tracking"),
    carrier: Optional[str] = Query(None, description="Filtrar por carrier"),
    cliente: Optional[str] = Query(None, description="Filtrar por cliente"),
    tipo: Optional[str] = Query(None, description="Filtrar por tipo"),
    id_transaccion: Optional[str] = Query(None, description="Filtrar por ID de transacción")
):
    """
    Obtiene estadísticas globales de pagos pendientes de contabilidad sin paginación
    """
    try:
        client = get_bigquery_client()

        FECHA_MINIMA = "2025-06-09"
        logger.info(f"🗓️ [ESTADÍSTICAS] Filtro automático aplicado: >= {FECHA_MINIMA}")

        condiciones = ["1=1"]
        parametros = []

        condiciones.append("pc.fecha_pago >= @fecha_minima_auto")
        parametros.append(
            bigquery.ScalarQueryParameter("fecha_minima_auto", "DATE", FECHA_MINIMA)
        )

        if referencia and referencia.strip():
            condiciones.append("referencia_pago LIKE @referencia_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("referencia_filtro", "STRING", f"%{referencia.strip()}%")
            )

        if tracking and tracking.strip():
            condiciones.append("pc.tracking LIKE @tracking_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("tracking_filtro", "STRING", f"%{tracking.strip()}%")
            )

        if carrier and carrier.strip():
            condiciones.append("(COALESCE(cp.Carrier, gl.carrier, 'N/A') LIKE @carrier_filtro)")
            parametros.append(
                bigquery.ScalarQueryParameter("carrier_filtro", "STRING", f"%{carrier.strip()}%")
            )

        if cliente and cliente.strip():
            condiciones.append("(COALESCE(cp.Cliente, gl.client, pc.correo) LIKE @cliente_filtro)")
            parametros.append(
                bigquery.ScalarQueryParameter("cliente_filtro", "STRING", f"%{cliente.strip()}%")
            )

        if tipo and tipo.strip():
            condiciones.append("pc.tipo LIKE @tipo_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("tipo_filtro", "STRING", f"%{tipo.strip()}%")
            )

        if fecha_desde:
            try:
                datetime.strptime(fecha_desde, "%Y-%m-%d")
                condiciones.append("pc.fecha_pago >= @fecha_desde")
                parametros.append(
                    bigquery.ScalarQueryParameter("fecha_desde", "DATE", fecha_desde)
                )
            except ValueError:
                pass

        if fecha_hasta:
            try:
                datetime.strptime(fecha_hasta, "%Y-%m-%d")
                condiciones.append("pc.fecha_pago <= @fecha_hasta")
                parametros.append(
                    bigquery.ScalarQueryParameter("fecha_hasta", "DATE", fecha_hasta)
                )
            except ValueError:
                pass

        if id_transaccion and id_transaccion.strip():
            try:
                id_trans_int = int(id_transaccion.strip())
                condiciones.append("pc.Id_Transaccion = @id_transaccion_filtro")
                parametros.append(
                    bigquery.ScalarQueryParameter("id_transaccion_filtro", "INTEGER", id_trans_int)
                )
            except ValueError:
                pass  # En estadísticas, ignoramos el error silenciosamente

        if estado and len(estado) > 0:
            placeholders = []
            for i, e in enumerate(estado):
                param_name = f"estado_{i}"
                placeholders.append(f"@{param_name}")
                parametros.append(
                    bigquery.ScalarQueryParameter(param_name, "STRING", e.strip().lower())
                )
            condiciones.append(f"LOWER(pc.estado_conciliacion) IN ({', '.join(placeholders)})")

        condiciones_sql = " AND ".join(condiciones)

        # Query para estadísticas (COUNT, SUM)
        estadisticas_query = f"""
        SELECT 
            COUNT(DISTINCT pc.referencia_pago) as total_registros,
            ROUND(SUM(CAST(pc.valor AS FLOAT64)), 2) as total_valor,
            ROUND(SUM(CASE 
                WHEN pc.estado_conciliacion IN ('pendiente_conciliacion', 'conciliado_automatico') 
                THEN COALESCE(CAST(cp.Valor AS FLOAT64), 0.0)
                ELSE COALESCE(CAST(gl.valor_guia AS FLOAT64), 0.0)
            END), 2) as total_valor_tn,
            ROUND(SUM(CAST(pc.valor AS FLOAT64)) - SUM(CASE 
                WHEN pc.estado_conciliacion IN ('pendiente_conciliacion', 'conciliado_automatico') 
                THEN COALESCE(CAST(cp.Valor AS FLOAT64), 0.0)
                ELSE COALESCE(CAST(gl.valor_guia AS FLOAT64), 0.0)
            END), 2) as total_saldo
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
        LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1` cp 
            ON pc.tracking = cp.tracking_number
        LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion` gl 
            ON pc.tracking = gl.tracking_number
        WHERE {condiciones_sql}
        """

        job_config = bigquery.QueryJobConfig(query_parameters=parametros)
        query_job = client.query(estadisticas_query, job_config=job_config)
        resultados = list(query_job.result())

        if resultados:
            estadisticas = resultados[0]
            return {
                "total_registros": estadisticas.total_registros or 0,
                "total_valor": estadisticas.total_valor or 0.0,
                "total_valor_tn": estadisticas.total_valor_tn or 0.0,
                "total_saldo": estadisticas.total_saldo or 0.0
            }
        else:
            return {
                "total_registros": 0,
                "total_valor": 0.0,
                "total_valor_tn": 0.0,
                "total_saldo": 0.0
            }

    except Exception as e:
        logger.error("❌ Error en /estadisticas-pendientes-contabilidad:\n%s", traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor: {str(e)}"
        )

@router.get("/valores-tn-reales")
def obtener_valores_tn_reales(
    trackings: str = Query(..., description="Lista de trackings separados por coma"),
    estado_conciliacion: str = Query(..., description="Estado de conciliación del pago")
):
    """
    Obtiene los valores reales de TN desde COD_pendientes o guias_liquidacion según el estado
    """
    try:
        client = get_bigquery_client()
        
        # Convertir string de trackings a lista
        lista_trackings = [t.strip() for t in trackings.split(',') if t.strip()]
        
        if not lista_trackings:
            raise HTTPException(status_code=400, detail="No se proporcionaron trackings válidos")
        
        # Crear placeholder para IN clause
        trackings_placeholder = "', '".join(lista_trackings)
        
        valores_tn = {}
        
        if estado_conciliacion == 'pendiente_conciliacion':
            # Buscar en COD_pendientes_v1
            query = f"""
            SELECT 
                tracking_number as tracking,
                Valor as valor_tn,
                Cliente as cliente,
                Carrier as carrier
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1`
            WHERE tracking_number IN ('{trackings_placeholder}')
            """
            
            logger.info(f"🔍 Buscando valores TN en COD_pendientes_v1 para trackings: {lista_trackings}")
            
        else:
            # Buscar en guias_liquidacion para estados procesados
            query = f"""
            SELECT 
                tracking_number as tracking,
                valor_guia as valor_tn,
                cliente,
                carrier
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion`
            WHERE tracking_number IN ('{trackings_placeholder}')
            """
            
            logger.info(f"🔍 Buscando valores TN en guias_liquidacion para trackings: {lista_trackings}")
        
        results = client.query(query).result()
        
        # Procesar resultados
        for row in results:
            valores_tn[row.tracking] = {
                "valor_tn": float(row.valor_tn) if row.valor_tn else 0.0,
                "cliente": row.cliente if hasattr(row, 'cliente') and row.cliente else "Cliente General",
                "carrier": row.carrier if hasattr(row, 'carrier') and row.carrier else "N/A",
                "fuente": "COD_pendientes_v1" if estado_conciliacion == 'pendiente_conciliacion' else "guias_liquidacion"
            }
        
        # Para trackings no encontrados, buscar en la otra tabla como fallback
        trackings_no_encontrados = [t for t in lista_trackings if t not in valores_tn]
        
        if trackings_no_encontrados:
            logger.info(f"🔄 Buscando trackings faltantes en tabla alternativa: {trackings_no_encontrados}")
            
            trackings_fallback_placeholder = "', '".join(trackings_no_encontrados)
            
            if estado_conciliacion == 'pendiente_conciliacion':
                # Buscar en guias_liquidacion como fallback
                query_fallback = f"""
                SELECT 
                    tracking_number as tracking,
                    valor_guia as valor_tn,
                    cliente,
                    carrier
                FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion`
                WHERE tracking_number IN ('{trackings_fallback_placeholder}')
                """
                fuente_fallback = "guias_liquidacion"
            else:
                # Buscar en COD_pendientes_v1 como fallback
                query_fallback = f"""
                SELECT 
                    tracking_number as tracking,
                    Valor as valor_tn,
                    Cliente as cliente,
                    Carrier as carrier
                FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1`
                WHERE tracking_number IN ('{trackings_fallback_placeholder}')
                """
                fuente_fallback = "COD_pendientes_v1"
            
            results_fallback = client.query(query_fallback).result()
            
            for row in results_fallback:
                if row.tracking not in valores_tn:  # Solo agregar si no existe
                    valores_tn[row.tracking] = {
                        "valor_tn": float(row.valor_tn) if row.valor_tn else 0.0,
                        "cliente": row.cliente if hasattr(row, 'cliente') and row.cliente else "Cliente General",
                        "carrier": row.carrier if hasattr(row, 'carrier') and row.carrier else "N/A",
                        "fuente": fuente_fallback + "_fallback"
                    }
        
        # Para trackings aún no encontrados, asignar valor 0
        for tracking in lista_trackings:
            if tracking not in valores_tn:
                valores_tn[tracking] = {
                    "valor_tn": 0.0,
                    "cliente": "Cliente General",
                    "carrier": "N/A",
                    "fuente": "no_encontrado"
                }
        
        logger.info(f"✅ Valores TN obtenidos: {len(valores_tn)} de {len(lista_trackings)} trackings")
        
        return {
            "valores_tn": valores_tn,
            "total_trackings": len(lista_trackings),
            "encontrados": len([v for v in valores_tn.values() if v["fuente"] != "no_encontrado"]),
            "estado_consultado": estado_conciliacion,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error obteniendo valores TN reales: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo valores TN: {str(e)}"
        )


# Endpoint para debugging - verificar datos de banco
@router.get("/debug/verificar-banco")
def debug_verificar_banco():
    """
    Endpoint de debugging para verificar los datos de banco asociado
    """
    try:
        client = get_bigquery_client()
        
        # Verificar registros con id_banco_asociado
        query_pagos_con_banco = f"""
        SELECT 
            referencia_pago,
            id_banco_asociado,
            valor_total_consignacion,
            fecha_pago,
            correo
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
        WHERE id_banco_asociado IS NOT NULL
        ORDER BY fecha_pago DESC
        LIMIT 10
        """
        
        # Verificar estructura de tabla banco_movimientos
        query_banco_estructura = f"""
        SELECT 
            id,
            valor_banco,
            fecha,
            descripcion
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.banco_movimientos`
        LIMIT 5
        """
        
        # Verificar JOIN real
        query_join_test = f"""
        SELECT 
            pc.referencia_pago,
            pc.id_banco_asociado,
            bm.id as banco_id,
            bm.valor_banco,
            bm.fecha as fecha_banco,
            bm.descripcion
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
        LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.banco_movimientos` bm 
            ON pc.id_banco_asociado = bm.id
        WHERE pc.id_banco_asociado IS NOT NULL
        ORDER BY pc.fecha_pago DESC
        LIMIT 10
        """
        
        results_pagos = list(client.query(query_pagos_con_banco).result())
        results_banco = list(client.query(query_banco_estructura).result())
        results_join = list(client.query(query_join_test).result())
        
        pagos_con_banco = []
        for row in results_pagos:
            pagos_con_banco.append({
                "referencia_pago": row.referencia_pago,
                "id_banco_asociado": row.id_banco_asociado,
                "valor_total_consignacion": float(row.valor_total_consignacion) if row.valor_total_consignacion else None,
                "fecha_pago": str(row.fecha_pago),
                "correo": row.correo
            })
        
        banco_estructura = []
        for row in results_banco:
            banco_estructura.append({
                "id": row.id,
                "valor_banco": float(row.valor_banco) if row.valor_banco else None,
                "fecha": str(row.fecha) if row.fecha else None,
                "descripcion": row.descripcion
            })
        
        join_results = []
        for row in results_join:
            join_results.append({
                "referencia_pago": row.referencia_pago,
                "id_banco_asociado": row.id_banco_asociado,
                "banco_id": row.banco_id,
                "valor_banco": float(row.valor_banco) if row.valor_banco else None,
                "fecha_banco": str(row.fecha_banco) if row.fecha_banco else None,
                "descripcion": row.descripcion
            })
        
        return {
            "pagos_con_banco_asociado": {
                "total": len(pagos_con_banco),
                "registros": pagos_con_banco
            },
            "estructura_banco_movimientos": {
                "total": len(banco_estructura),
                "registros": banco_estructura
            },
            "test_join": {
                "total": len(join_results),
                "registros": join_results
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"❌ Error en debug verificar banco: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error verificando datos de banco: {str(e)}"
        )
        
        return {
            "referencia_buscada": referencia,
            "total_encontradas": len(resultados),
            "resultados": resultados,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"❌ Error en debug verificar referencia: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error verificando referencia: {str(e)}"
        )
