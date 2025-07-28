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
    for key in form.keys():
        if key.startswith("comprobante_"):
            archivos.append(form[key])
    # Si no hay múltiples, usar el comprobante único (para compatibilidad)
    if not archivos and comprobante is not None:
        archivos = [comprobante]
    logger.info(f"Total comprobantes recibidos: {len(archivos)}")

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
            logger.info(f"Referencias de guías recibidas: {[g.get('referencia') for g in lista_guias]}")
            logger.info(f"Trackings de guías recibidas: {[g.get('tracking') for g in lista_guias]}")
            if not lista_guias:
                raise HTTPException(status_code=400, detail="Debe asociar al menos una guía")
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Formato de guías inválido (JSON requerido)")

        # PASO 5: Obtener información de clientes desde COD_pendientes_v1
        referencias_guias = [str(guia.get("referencia", "")).strip() for guia in lista_guias if guia.get("referencia")]
        
        if not referencias_guias:
            raise HTTPException(status_code=400, detail="No se encontraron referencias válidas en las guías")

        
        refs_str = "', '".join(referencias_guias)
        
        query_clientes = f"""
            SELECT tracking_number as referencia, cliente, valor_guia as valor
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1`
            WHERE tracking_number IN ('{refs_str}')
        """

        
        try:
            resultado_clientes = client.query(query_clientes).result()
            clientes_data = {
                row["referencia"]: {
                    "cliente": row["cliente"],  # 🔥 CORREGIDO: cambiado de "Cliente" a "cliente"
                    "valor": row["valor"]
                } for row in resultado_clientes
            }
            
        except Exception as e:
            
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
        bono_id_utilizado = None
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
                if "bono_id" in guia and guia["bono_id"]:
                    bono_id_utilizado = guia["bono_id"]

        valor_total_combinado = valor_pago + valor_bonos

        # Si el pago es solo con bono, modificar la referencia y procesar el bono
        referencia_pago_final = referencia
        if valor_pago == 0 and valor_bonos > 0 and bono_id_utilizado:
            referencia_pago_final = f"{referencia} (BONO)"
            # Obtener el bono original
            query_bono = f"""
            SELECT * FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.conductor_bonos`
            WHERE id = @bono_id
            LIMIT 1
            """
            job_config_bono = bigquery.QueryJobConfig(query_parameters=[
                bigquery.ScalarQueryParameter("bono_id", "STRING", bono_id_utilizado)
            ])
            bono_result = list(client.query(query_bono, job_config=job_config_bono).result())
            if bono_result:
                bono_original = bono_result[0]
                # Marcar bono original como usado
                update_bono = f"""
                UPDATE `{PROJECT_ID}.{DATASET_CONCILIACIONES}.conductor_bonos`
                SET estado_bono = 'usado', saldo_disponible = 0, fecha_ultimo_uso = CURRENT_DATE(), fecha_modificacion = CURRENT_TIMESTAMP()
                WHERE id = @bono_id
                """
                job_config_update = bigquery.QueryJobConfig(query_parameters=[
                    bigquery.ScalarQueryParameter("bono_id", "STRING", bono_id_utilizado)
                ])
                client.query(update_bono, job_config=job_config_update).result()
                # Si hay saldo restante, crear nuevo bono disponible
                saldo_restante = float(bono_original["saldo_disponible"]) - valor_bonos
                if saldo_restante > 0.01:
                    nuevo_bono_id = f"BONO_{uuid4()}"
                    descripcion = f"Saldo restante de bono original {bono_original['referencia_pago_origen']} tras uso completo."
                    insert_bono = f"""
                    INSERT INTO `{PROJECT_ID}.{DATASET_CONCILIACIONES}.conductor_bonos` (
                        id, tipo_bono, valor_bono, saldo_disponible, descripcion,
                        fecha_generacion, referencia_pago_origen, estado_bono, employee_id,
                        conductor_email, fecha_creacion, fecha_modificacion, 
                        creado_por, modificado_por, Id_Transaccion
                    ) VALUES (
                        @id, @tipo_bono, @valor_bono, @saldo_disponible, @descripcion,
                        CURRENT_DATE(), @referencia_pago_origen, 'activo', @employee_id,
                        @conductor_email, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(),
                        @creado_por, @modificado_por, @id_transaccion
                    )
                    """
                    job_config_insert = bigquery.QueryJobConfig(query_parameters=[
                        bigquery.ScalarQueryParameter("id", "STRING", nuevo_bono_id),
                        bigquery.ScalarQueryParameter("tipo_bono", "STRING", bono_original["tipo_bono"]),
                        bigquery.ScalarQueryParameter("valor_bono", "FLOAT64", saldo_restante),
                        bigquery.ScalarQueryParameter("saldo_disponible", "FLOAT64", saldo_restante),
                        bigquery.ScalarQueryParameter("descripcion", "STRING", descripcion),
                        bigquery.ScalarQueryParameter("referencia_pago_origen", "STRING", f"{bono_original['referencia_pago_origen']} (BONO)"),
                        bigquery.ScalarQueryParameter("employee_id", "INTEGER", bono_original["employee_id"]),
                        bigquery.ScalarQueryParameter("conductor_email", "STRING", bono_original["conductor_email"]),
                        bigquery.ScalarQueryParameter("creado_por", "STRING", correo),
                        bigquery.ScalarQueryParameter("modificado_por", "STRING", correo),
                        bigquery.ScalarQueryParameter("id_transaccion", "INTEGER", nuevo_id_transaccion),
                    ])
                    client.query(insert_bono, job_config=job_config_insert).result()

        # LOG DETALLADO para depuración de excedente
        logger.info("[DEBUG-EXCEDENTE] === INICIO CALCULO EXCEDENTE ===")
        logger.info(f"[DEBUG-EXCEDENTE] valor_pago: {valor_pago}")
        logger.info(f"[DEBUG-EXCEDENTE] valor_bonos: {valor_bonos}")
        logger.info(f"[DEBUG-EXCEDENTE] valor_total_combinado: {valor_total_combinado}")
        logger.info(f"[DEBUG-EXCEDENTE] lista_guias: {json.dumps(lista_guias, ensure_ascii=False)}")
        # El valor_total_guias se calcula más adelante, pero aquí ya tienes el input
        logger.info("[DEBUG-EXCEDENTE] === FIN LOG INPUT ===")

        # 🔎 FASE 2: Verificar conciliación automática con banco
        try:
            query_match = """
            SELECT id FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
            WHERE fecha = @fecha_pago
              AND ABS(valor_banco - @valor) <= 100
              AND estado_conciliacion = 'pendiente'
            LIMIT 1
            """
            job_config_match = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("fecha_pago", "DATE", fecha_pago),
                    bigquery.ScalarQueryParameter("valor", "FLOAT64", valor_total_combinado)
                ]
            )
            resultado_match = list(client.query(query_match, job_config=job_config_match).result())
            estado_conciliacion = "conciliado_automatico" if resultado_match else "pendiente_conciliacion"
            
        except Exception as e:
            
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
            # Obtener datos del cliente
            if referencia_value in clientes_data:
                cliente_clean = clientes_data[referencia_value]["cliente"] or "Sin Cliente"
                valor_individual = float(clientes_data[referencia_value]["valor"] or 0)
            else:
                cliente_clean = "Sin Cliente"
                valor_individual = float(guia.get("valor", 0))
            # Procesar tracking
            tracking_value = guia.get("tracking", "")
            if not tracking_value or str(tracking_value).lower() in ["null", "none", "", "undefined"]:
                tracking_clean = referencia_value
            else:
                tracking_clean = str(tracking_value).strip()
            # Asociar comprobante por índice (si hay suficientes, si no usar el primero)
            comprobante_url_asociado = comprobante_urls[i] if i < len(comprobante_urls) else (comprobante_urls[0] if comprobante_urls else None)
            fila = {
                "referencia": referencia_value,
                "valor": valor_individual,
                "fecha": fecha_pago,
                "entidad": entidad,
                "estado": "pagado",
                "tipo": tipo,
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
                "referencia_pago": referencia_pago_final,
                "valor_total_consignacion": valor_pago,
                "tracking": tracking_clean,
                "cliente": cliente_clean,
                "estado_conciliacion": estado_conciliacion,
                "Id_Transaccion": nuevo_id_transaccion,
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

            for fila in filas:
                merge_query = f"""
                MERGE `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion` AS gl
                USING (SELECT
                        @tracking AS tracking_number,
                        @employee_id AS employee_id,
                        @correo AS conductor_email,
                        @cliente AS cliente,
                        @valor AS valor_guia,
                        @fecha_pago AS fecha_entrega,
                        @referencia_pago AS pago_referencia,
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
                    pago_referencia = src.pago_referencia,
                    fecha_pago = src.fecha_pago,
                    valor_pagado = src.valor_pagado,
                    metodo_pago = src.metodo_pago,
                    estado_liquidacion = 'pagado',
                    fecha_modificacion = CURRENT_TIMESTAMP(),
                    modificado_por = src.modificado_por
                WHEN NOT MATCHED THEN
                  INSERT (
                    tracking_number, employee_id, conductor_email, cliente, valor_guia, fecha_entrega,
                    pago_referencia, fecha_pago, valor_pagado, metodo_pago, Id_Transaccion,
                    fecha_creacion, fecha_modificacion, creado_por, modificado_por, estado_liquidacion
                  ) VALUES (
                    src.tracking_number, src.employee_id, src.conductor_email, src.cliente, src.valor_guia, src.fecha_entrega,
                    src.pago_referencia, src.fecha_pago, src.valor_pagado, src.metodo_pago, src.Id_Transaccion,
                    src.fecha_creacion, src.fecha_modificacion, src.creado_por, src.modificado_por, 'pagado'
                  )
                """
                job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("tracking", "STRING", fila['tracking']),
                        bigquery.ScalarQueryParameter("employee_id", "INTEGER", obtener_employee_id_usuario(correo, client) or 0),
                        bigquery.ScalarQueryParameter("correo", "STRING", correo),
                        bigquery.ScalarQueryParameter("cliente", "STRING", fila['cliente']),
                        bigquery.ScalarQueryParameter("valor", "FLOAT64", fila['valor']),
                        bigquery.ScalarQueryParameter("fecha_pago", "DATE", fila['fecha_pago']),
                        bigquery.ScalarQueryParameter("referencia_pago", "STRING", fila['referencia_pago']),
                    bigquery.ScalarQueryParameter("tipo", "STRING", fila['tipo']),
                    bigquery.ScalarQueryParameter("id_transaccion", "INTEGER", nuevo_id_transaccion),
                    ]
                )
                client.query(merge_query, job_config=job_config).result()
            
        except Exception as e:
            pass

        # 🔥 FASE 1: Registrar bono por excedente si aplica
        bono_excedente_log = None
        try:
            # Calcular excedente con validación
            try:
                valor_total_guias = sum(float(g.get('valor', 0)) for g in lista_guias)
                excedente = round(valor_total_combinado - valor_total_guias, 2)
                logger.info(f"[BONO-EXCEDENTE] valor_total_combinado={valor_total_combinado} | valor_total_guias={valor_total_guias} | excedente={excedente}")
            except Exception as e:
                logger.error(f"[BONO-EXCEDENTE] Error calculando excedente: {e}")
                bono_excedente_log = {"error": str(e)}
                excedente = 0
            if excedente > 0:
                # Obtener y validar employee_id
                employee_id = obtener_employee_id_usuario(correo, client)
                if not employee_id:
                    await notificar_error_bono(correo, excedente, "No se encontró employee_id")
                    logger.warning(f"⚠️ No se pudo obtener el Employee ID para {correo}, no se registrará bono")
                    bono_excedente_log = {"error": "No se encontró employee_id", "correo": correo, "excedente": excedente}
                else:
                    timestamp_actual = datetime.now()
                    bono_id = f"BONO_EXCEDENTE_{timestamp_actual.strftime('%Y%m%d_%H%M%S')}_{employee_id}"
                    descripcion = f"Excedente generado automáticamente del pago ref: {referencia}. Valor total pagado: ${valor_total_combinado}, Valor guías: ${valor_total_guias}"
                    # LOG explícito antes de insertar el bono
                    logger.warning(f"[BONO BACKEND][PRE-INSERT] Insertando bono: id={bono_id} valor_bono={excedente} employee_id={employee_id} email={correo} tipo=excedente saldo_disponible={excedente} descripcion={descripcion} referencia_pago_origen={referencia}")
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
                    logger.warning(f"[BONO BACKEND][POST-INSERT] Bono insertado exitosamente (ID: {bono_id})")
                    bono_excedente_log = None
                    try:
                        # Calcular excedente con validación
                        try:
                            # ...existing code...
                            pass
                        except Exception as e:
                            pass
                        if 'excedente' in locals() and excedente > 0:
                            # ...existing code...
                            pass
                    except Exception as e:
                        logger.warning(f"⚠️ Continuando sin registrar bono de excedente: {e}")
                        bono_excedente_log = {"error": str(e)}
        except Exception as e:
            logger.warning(f"⚠️ Continuando sin registrar bono de excedente: {e}")
            bono_excedente_log = {"error": str(e)}

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
            "tipo_pago": "híbrido" if valor_bonos > 0 else "efectivo",
            "bono_excedente_log": bono_excedente_log
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

@router.get("/detalles-pago/{referencia_pago}")
def obtener_detalles_pago(
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

        # Si id_transaccion es None, traer solo las guías de esa referencia que no tienen Id_Transaccion (faltantes)
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
              AND pc.Id_Transaccion IS NULL
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

@router.get("/pendientes-contabilidad")
def obtener_pagos_pendientes_contabilidad(
    limit: int = Query(20, ge=1, le=100, description="Número de registros por página"),
    offset: int = Query(0, ge=0, description="Número de registros a omitir"),
    referencia: Optional[str] = Query(None, description="Filtrar por referencia de pago"),
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
            estados_limpios = [e.strip() for e in estado if e and e.strip()]
            if len(estados_limpios) == 1:
                condiciones.append("estado_conciliacion = @estado_filtro")
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
                condiciones.append(f"estado_conciliacion IN ({', '.join(in_params)})")
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

        where_clause = "WHERE " + " AND ".join(condiciones)

        logger.info(f"🔍 Filtros aplicados - Referencia: {referencia}, Estado: {estado}, Fecha desde: {fecha_desde}, Fecha hasta: {fecha_hasta}")
        logger.info(f"📋 Condiciones SQL: {condiciones}")
        logger.info(f"🔧 WHERE clause: {where_clause}")

        count_query = f"""
            SELECT COUNT(DISTINCT pc.referencia_pago) as total
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
            {where_clause}
            """


        main_query = f"""
        SELECT 
            pc.referencia_pago,
            pc.correo as correo_conductor,
            MAX(pc.fecha_pago) AS fecha,
            COALESCE(MAX(pc.valor_total_consignacion), SUM(pc.valor)) AS valor,
            MAX(pc.entidad) AS entidad,
            MAX(pc.tipo) AS tipo,
            MAX(pc.comprobante) AS imagen,
            COUNT(*) AS num_guias,
            STRING_AGG(DISTINCT SAFE_CAST(pc.tracking AS STRING), ', ' ORDER BY pc.tracking LIMIT 5) AS trackings_preview,
            MAX(pc.estado_conciliacion) as estado_conciliacion,
            MAX(pc.novedades) as novedades,
            MAX(pc.creado_en) as fecha_creacion,
            MAX(pc.modificado_en) as fecha_modificacion,
            MAX(COALESCE(cod.Carrier, gl.carrier, 'N/A')) as carrier,
            MAX(pc.Id_Transaccion) as Id_Transaccion
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
        LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1` cod 
            ON pc.tracking = cod.tracking_number
        LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion` gl 
            ON pc.tracking = gl.tracking_number
        {where_clause}
        GROUP BY pc.referencia_pago, pc.correo
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

            pagos.append({
                "referencia_pago": row.get("referencia_pago", ""),
                "valor": float(row.get("valor", 0)) if row.get("valor") else 0.0,
                "fecha": str(row.get("fecha", "")),
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
    novedad = payload.get("novedad")
    modificado_por = payload.get("modificado_por")

    if not referencia_pago or not novedad or not modificado_por:
        raise HTTPException(
            status_code=400,
            detail="Faltan campos requeridos (referencia_pago, novedad, modificado_por)"
        )

    # Validar que la novedad no esté vacía
    if not novedad.strip():
        raise HTTPException(
            status_code=400,
            detail="La observación de rechazo no puede estar vacía"
        )

    try:
        client = get_bigquery_client()
        
        # Verificar que el pago existe y puede ser rechazado
        verificacion_query = """
        SELECT COUNT(*) as total, MAX(estado_conciliacion) as estado_actual
        FROM `{project}.{dataset}.pagosconductor`
        WHERE referencia_pago = @referencia
        """.format(project=PROJECT_ID, dataset=DATASET_CONCILIACIONES)
        
        job_config_verificacion = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago)
            ]
        )
        
        resultado_verificacion = client.query(verificacion_query, job_config=job_config_verificacion).result()
        fila_verificacion = next(resultado_verificacion)
        
        if fila_verificacion["total"] == 0:
            raise HTTPException(
                status_code=404,
                detail=f"No se encontró el pago con referencia {referencia_pago}"
            )
        
        estado_actual = fila_verificacion["estado_actual"]
        if estado_actual in ["rechazado", "conciliado_manual", "conciliado_automatico"]:
            raise HTTPException(
                status_code=400,
                detail=f"El pago no puede ser rechazado (estado actual: {estado_actual})"
            )
        
        timestamp_actual = datetime.now()
        
        # Actualizar el estado del pago
        query_rechazar = """
        UPDATE `{project}.{dataset}.pagosconductor`
        SET estado_conciliacion = 'rechazado',
            novedades = CONCAT('RECHAZADO: ', @novedad, ' | Por: ', @modificado_por, ' el ', FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', @timestamp_modificacion)),
            modificado_por = @modificado_por,
            modificado_en = @timestamp_modificacion
        WHERE referencia_pago = @referencia_pago
        """.format(project=PROJECT_ID, dataset=DATASET_CONCILIACIONES)

        job_config_rechazar = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia_pago", "STRING", referencia_pago),
                bigquery.ScalarQueryParameter("novedad", "STRING", novedad.strip()),
                bigquery.ScalarQueryParameter("modificado_por", "STRING", modificado_por),
                bigquery.ScalarQueryParameter("timestamp_modificacion", "TIMESTAMP", timestamp_actual),
            ]
        )

        # Ejecutar la actualización
        job = client.query(query_rechazar, job_config=job_config_rechazar)
        job.result()  # Esperar a que termine

        # Contar cuántas guías fueron afectadas
        conteo_query = """
        SELECT COUNT(*) as total_guias
        FROM `{project}.{dataset}.pagosconductor`
        WHERE referencia_pago = @referencia
        """.format(project=PROJECT_ID, dataset=DATASET_CONCILIACIONES)
        
        job_config_conteo = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago)
            ]
        )
        
        resultado_conteo = client.query(conteo_query, job_config=job_config_conteo).result()
        total_guias = next(resultado_conteo)["total_guias"]

        

        return {
            "mensaje": f"Pago con referencia {referencia_pago} rechazado exitosamente",
            "referencia_pago": referencia_pago,
            "novedad": novedad,
            "total_guias": total_guias,
            "modificado_por": modificado_por,
            "timestamp": timestamp_actual.isoformat(),
            "nuevo_estado": "rechazado"
        }

    except HTTPException:
        # Re-lanzar HTTPExceptions
        raise
    except Exception as e:
        
        raise HTTPException(
            status_code=500, 
            detail=f"Error interno del servidor: {str(e)}"
        )

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
    estado: Optional[str] = Query(None, description="Filtrar por estado de conciliación"),
    fecha_desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    fecha_hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)")
):
    """
    Exporta TODOS los pagos pendientes de contabilidad que coincidan con los filtros (sin paginación)
    ✅ VALIDADO: Incluye filtro automático desde el 9 de junio de 2025
    """
    try:
        client = get_bigquery_client()
        
        # 🗓️ FILTRO AUTOMÁTICO: Aplicar fecha mínima como en pagos pendientes
        FECHA_MINIMA = "2025-06-09"
        print(f"🗓️ [DIAGNÓSTICO EXPORTAR] Filtro automático aplicado: >= {FECHA_MINIMA}")
        
        # Construir condiciones de filtro dinámicamente (igual que en la consulta paginada)
        condiciones = ["1=1"]
        parametros = []
        
        # ✅ AGREGAR FILTRO AUTOMÁTICO DE FECHA MÍNIMA
        condiciones.append("pc.fecha_pago >= @fecha_minima_auto")
        parametros.append(
            bigquery.ScalarQueryParameter("fecha_minima_auto", "DATE", FECHA_MINIMA)
        )
        
        # Filtro por referencia de pago
        if referencia and referencia.strip():
            condiciones.append("pc.referencia_pago LIKE @referencia_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("referencia_filtro", "STRING", f"%{referencia.strip()}%")
            )
        
        # Filtro por estado
        if estado and estado.strip():
            condiciones.append("pc.estado_conciliacion = @estado_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("estado_filtro", "STRING", estado.strip())
            )
        else:
            # Solo filtrar por pendiente_conciliacion si NO se está buscando por referencia específica
            # Si se busca por referencia, mostrar todos los estados para esa referencia
            if not (referencia and referencia.strip()):
                condiciones.append("pc.estado_conciliacion = 'pendiente_conciliacion'")
            # Si hay referencia pero no estado, mostrar esa referencia en cualquier estado
            # Si hay referencia pero no estado, mostrar esa referencia en cualquier estado
        
        # Filtro por fecha desde
        if fecha_desde:
            try:
                datetime.strptime(fecha_desde, "%Y-%m-%d")
                condiciones.append("pc.fecha_pago >= @fecha_desde")
                parametros.append(
                    bigquery.ScalarQueryParameter("fecha_desde", "DATE", fecha_desde)
                )
            except ValueError:
                raise HTTPException(status_code=400, detail="Formato de fecha_desde inválido (YYYY-MM-DD)")
        
        # Filtro por fecha hasta
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
        
        # Query para exportar TODOS los registros (sin LIMIT ni OFFSET)
        export_query = f"""
        SELECT 
            pc.referencia_pago,
            pc.correo as correo_conductor,
            MAX(pc.fecha_pago) AS fecha,
            COALESCE(MAX(pc.valor_total_consignacion), SUM(pc.valor)) AS valor,
            MAX(pc.entidad) AS entidad,
            MAX(pc.tipo) AS tipo,
            MAX(pc.comprobante) AS imagen,
            COUNT(*) AS num_guias,
            STRING_AGG(DISTINCT COALESCE(pc.tracking, pc.referencia), ', ' ORDER BY COALESCE(pc.tracking, pc.referencia)) AS trackings_completos,
            MAX(pc.estado_conciliacion) as estado_conciliacion,
            MAX(pc.novedades) as novedades,
            MAX(pc.creado_en) as fecha_creacion,
            MAX(pc.modificado_en) as fecha_modificacion,
            MAX(pc.hora_pago) as hora_pago
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
        {where_clause}
        GROUP BY pc.referencia_pago, pc.correo
        ORDER BY MAX(pc.fecha_pago) DESC, MAX(pc.creado_en) DESC
        """
        
        
        
        # Configurar parámetros y ejecutar consulta
        job_config = bigquery.QueryJobConfig(query_parameters=parametros)
        
        # Ejecutar consulta con timeout extendido para exportación
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future_export = executor.submit(lambda: client.query(export_query, job_config=job_config).result())
            export_result = future_export.result(timeout=120)  # 2 minutos para exportación completa
        
        # Procesar todos los resultados
        pagos_exportar = []
        for row in export_result:
            pago = {
                "referencia_pago": row.get("referencia_pago", ""),
                "valor": float(row.get("valor", 0)) if row.get("valor") else 0.0,
                "fecha": str(row.get("fecha", "")),
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
                "hora_pago": str(row.get("hora_pago", ""))
            }
            pagos_exportar.append(pago)
        
        # Información de la exportación
        info_exportacion = {
            "total_registros_exportados": len(pagos_exportar),
            "filtros_aplicados": {
                "referencia": referencia,
                "estado": estado,
                "fecha_desde": fecha_desde,
                "fecha_hasta": fecha_hasta
            },
            "fecha_exportacion": datetime.now().isoformat()
        }
        
    
        
        return {
            "pagos": pagos_exportar,
            "info_exportacion": info_exportacion,
            "status": "success"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        
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
