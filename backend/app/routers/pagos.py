from fastapi import APIRouter, Form, UploadFile, File, HTTPException, Body, Query, Depends,status
from fastapi.responses import JSONResponse
from google.cloud import bigquery
from google.api_core import exceptions as gcp_exceptions
from typing import Optional, Dict, Any
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
        logger.error(f"Error inicializando cliente BigQuery: {e}")
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
        # Debug: verificar información del archivo
        logger.info(f"📁 Guardando archivo: {archivo.filename}")
        logger.info(f"📍 Ruta destino: {ruta_local}")
        logger.info(f"📊 Content type: {archivo.content_type}")
        
        # Crear directorio si no existe
        os.makedirs(COMPROBANTES_DIR, exist_ok=True)
        logger.info(f"📂 Directorio verificado: {COMPROBANTES_DIR}")
        
        # Leer contenido
        content = await archivo.read()
        logger.info(f"📋 Contenido leído: {len(content)} bytes")
        
        if len(content) == 0:
            logger.error("❌ El archivo está vacío")
            raise ValueError("Archivo vacío")
        
        # Guardar archivo
        with open(ruta_local, "wb") as f:
            bytes_written = f.write(content)
            logger.info(f"💾 Bytes escritos: {bytes_written}")
        
        # Verificar que se guardó correctamente
        if not os.path.exists(ruta_local):
            logger.error(f"❌ El archivo no se guardó: {ruta_local}")
            raise FileNotFoundError(f"No se pudo guardar: {ruta_local}")
        
        # Verificar tamaño y permisos
        file_stat = os.stat(ruta_local)
        logger.info(f"✅ Archivo guardado - Tamaño: {file_stat.st_size}, Permisos: {oct(file_stat.st_mode)}")
        
        # Establecer permisos correctos
        os.chmod(ruta_local, 0o644)
        
        # URL para acceso
        comprobante_url = f"https://api.x-cargo.co/static/{nombre_archivo}"
        logger.info(f"🔗 URL generada: {comprobante_url}")
        
        return comprobante_url
        
    except Exception as e:
        logger.error(f"❌ Error guardando comprobante: {e}")
        # Limpiar archivo si hay error
        if os.path.exists(ruta_local):
            try:
                os.remove(ruta_local)
                logger.info(f"🗑️ Archivo limpiado tras error: {ruta_local}")
            except:
                pass
        raise HTTPException(
            status_code=500,
            detail=f"Error guardando comprobante de pago: {str(e)}"
        )

@router.post("/registrar-conductor")
async def registrar_pago_conductor(
    correo: str = Form(..., description="Correo del conductor"),
    valor_pago_str: str = Form(..., description="Valor total del pago"),
    fecha_pago: str = Form(..., description="Fecha del pago (YYYY-MM-DD)"),
    hora_pago: str = Form(..., description="Hora del pago (HH:MM)"),
    tipo: str = Form(..., description="Tipo de pago (Transferencia, Nequi, etc.)"),
    entidad: str = Form(..., description="Entidad bancaria"),
    referencia: str = Form(..., description="Referencia única del pago"),
    comprobante: UploadFile = File(..., description="Imagen/PDF del comprobante"),
    guias: str = Form(..., description="JSON con las guías asociadas")
):
    """
    Registra un pago realizado por un conductor con validaciones robustas
    """
    client = get_bigquery_client()
    comprobante_url = None

    try:
        # PASO 1: Validaciones de entrada
        logger.info(f"Iniciando registro de pago para {correo}")
        
        # Validar y convertir valor
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
        logger.info(f"Validando referencia única: {referencia}")
        verificacion_ref = client.query("""
            SELECT COUNT(*) as total
            FROM `{project}.{dataset}.pagosconductor`
            WHERE referencia_pago = @referencia
        """.format(project=PROJECT_ID, dataset=DATASET_CONCILIACIONES), 
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia)
            ]
        )).result()

        if next(verificacion_ref)["total"] > 0:
            raise HTTPException(
                status_code=409,
                detail="Ya existe un pago registrado con esa referencia"
            )

        try:
            lista_guias = json.loads(guias)
            logger.info(f"Procesando {len(lista_guias)} guías")
            
            if not lista_guias:
                raise HTTPException(status_code=400, detail="Debe asociar al menos una guía")
                
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Formato de guías inválido (JSON requerido)")

        # PASO 5: Obtener información de clientes desde COD_pendientes_v1
        referencias_guias = [str(guia.get("referencia", "")).strip() for guia in lista_guias if guia.get("referencia")]
        
        if not referencias_guias:
            raise HTTPException(status_code=400, detail="No se encontraron referencias válidas en las guías")

        logger.info(f"Consultando información para {len(referencias_guias)} referencias")
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
                    "cliente": row["Cliente"], 
                    "valor": row["valor"]
                } for row in resultado_clientes
            }
            logger.info(f"Información obtenida para {len(clientes_data)} guías")
        except Exception as e:
            logger.warning(f"Error consultando COD_pendientes_v1: {e}")
            clientes_data = {}

        # PASO 6: Guardar comprobante
        logger.info("Guardando comprobante de pago")
        comprobante_url = await guardar_comprobante(comprobante)

        # PASO 7: Preparar datos para inserción
        logger.info("Preparando datos para inserción en BigQuery")
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
            logger.info(f"🧠 Estado de conciliación determinado: {estado_conciliacion}")
        except Exception as e:
            logger.warning(f"⚠️ No se pudo verificar conciliación automática: {e}")
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
                logger.warning(f"Guía {i+1} sin referencia válida, omitiendo")
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

            fila = {
                "referencia": referencia_value,
                "valor": valor_individual,
                "fecha": fecha_pago,
                "entidad": entidad,
                "estado": "pagado",
                "tipo": tipo,
                "comprobante": comprobante_url,
                "novedades": "",
                "creado_en": creado_en,
                "creado_por": correo,
                "modificado_en": None,
                "modificado_por": correo,
                "hora_pago": hora_pago,
                "correo": correo,
                "fecha_pago": fecha_pago,
                "id_string": None,
                "referencia_pago": referencia,
                "valor_total_consignacion": valor_pago,
                "tracking": tracking_clean,
                "cliente": cliente_clean,"estado_conciliacion": estado_conciliacion,

            }
            
            filas.append(fila)

        if not filas:
            raise HTTPException(status_code=400, detail="No se procesaron guías válidas")

        # PASO 8: Insertar en BigQuery
        logger.info(f"Insertando {len(filas)} registros en BigQuery")
        
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
            estado_conciliacion
        ) VALUES {', '.join(valores_sql)}
        """
        
        # Timeout para inserción
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(lambda: client.query(query).result())
            future.result(timeout=30)
        
        logger.info("✅ Datos insertados correctamente")

        # PASO 9: Actualizar estado en COD_pendientes_v1
        try:
            status_message = "PAGADO - Procesado por conductor"
            if valor_bonos > 0:
                status_message += f" (incluye ${valor_bonos} en bonos)"
                
            update_query = f"""
            UPDATE `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1`
            SET Status_Big = @status_message
            WHERE tracking_number IN ('{refs_str}')
            """
            
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("status_message", "STRING", status_message)
                ]
            )
            
            client.query(update_query, job_config=job_config).result()
            logger.info("✅ Status_Big actualizado en COD_pendientes_v1")
        except Exception as e:
            logger.warning(f"⚠️ Error actualizando Status_Big: {e}")

        # 🔥 FASE 1: Registrar bono por excedente si aplica
       # 🔥 FASE 1: Registrar bono por excedente si aplica
        try:
            valor_total_guias = sum(float(g.get('valor', 0)) for g in lista_guias)
            excedente = round(valor_total_combinado - valor_total_guias, 2)

            if excedente > 0:
                logger.info(f"💸 Excedente detectado: ${excedente} — se registrará como bono")

                employee_id = obtener_employee_id_usuario(correo, client)
                if not employee_id:
                    logger.warning(f"⚠️ No se pudo obtener el Employee ID para {correo}, no se registrará bono")
                else:
                    bono_id = f"BONO_EXCEDENTE_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{employee_id}"
                    insertar_bono_query = f"""
                    INSERT INTO `{PROJECT_ID}.{DATASET_CONCILIACIONES}.conductor_bonos` (
                        id, tipo_bono, valor_bono, saldo_disponible, descripcion,
                        fecha_generacion, referencia_pago_origen, estado_bono, employee_id
                    ) VALUES (
                        @id, 'excedente', @valor, @valor, @descripcion,
                        CURRENT_TIMESTAMP(), @referencia, 'activo', @employee_id
                    )
                    """
                    job_config = bigquery.QueryJobConfig(query_parameters=[
                        bigquery.ScalarQueryParameter("id", "STRING", bono_id),
                        bigquery.ScalarQueryParameter("valor", "FLOAT64", excedente),
                        bigquery.ScalarQueryParameter("descripcion", "STRING", "Excedente generado automáticamente"),
                        bigquery.ScalarQueryParameter("referencia", "STRING", referencia),
                        bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id),
                    ])
                    client.query(insertar_bono_query, job_config=job_config).result()
                    logger.info(f"✅ Bono de excedente registrado: {bono_id}")
        except Exception as e:
            logger.error(f"❌ ERROR GRAVE al registrar bono excedente: {e}")
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
        logger.error(f"❌ Error inesperado registrando pago híbrido: {str(e)}")
        logger.error(f"❌ Traceback: {traceback.format_exc()}")
        
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

# 🔥 MODIFICACIÓN: Actualizar aplicar-bonos para mejor integración
@router.post("/aplicar-bonos")
async def aplicar_bonos_conductor(
    datos_bonos: Dict[str, Any],
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    🆕 ACTUALIZADO: Aplica bonos del conductor con mejor manejo de estado
    """
    try:
        print(f"🎯 ===== APLICANDO BONOS =====")
        print(f"📧 Usuario: {current_user.get('correo')}")
        print(f"💰 Datos recibidos: {datos_bonos}")

        user_email = current_user.get("correo") or current_user.get("sub")
        if not user_email:
            raise HTTPException(status_code=401, detail="Usuario no autenticado")

        # Obtener employee_id del usuario
        employee_id = obtener_employee_id_usuario(user_email, client)
        if not employee_id:
            raise HTTPException(status_code=404, detail="Conductor no encontrado")

        bonos_utilizados = datos_bonos.get("bonos_utilizados", [])
        total_bonos = datos_bonos.get("total_bonos", 0)
        guias = datos_bonos.get("guias", [])

        if not bonos_utilizados:
            raise HTTPException(status_code=400, detail="No se especificaron bonos a utilizar")

        # Verificar que los bonos pertenecen al conductor y están disponibles
        bonos_ids = [bono["bono_id"] for bono in bonos_utilizados]
        query_verificar = """
        SELECT 
            id,
            saldo_disponible,
            tipo_bono,
            valor_bono
        FROM `datos-clientes-441216.Conciliaciones.conductor_bonos`
        WHERE id IN UNNEST(@bonos_ids)
            AND employee_id = @employee_id
            AND estado_bono = 'activo'
            AND saldo_disponible > 0
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ArrayQueryParameter("bonos_ids", "STRING", bonos_ids),
                bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id)
            ]
        )
        
        result = client.query(query_verificar, job_config=job_config).result()
        bonos_validos = {row.id: row for row in result}
        
        # Verificar que todos los bonos son válidos
        for bono_data in bonos_utilizados:
            bono_id = bono_data["bono_id"]
            valor_utilizado = bono_data["valor_utilizado"]
            
            if bono_id not in bonos_validos:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Bono {bono_id} no válido o no disponible"
                )
            
            bono_db = bonos_validos[bono_id]
            if valor_utilizado > bono_db.saldo_disponible:
                raise HTTPException(
                    status_code=400,
                    detail=f"Valor solicitado ({valor_utilizado}) mayor al saldo disponible ({bono_db.saldo_disponible}) para bono {bono_id}"
                )

        # Iniciar transacción para aplicar bonos
        timestamp_now = datetime.now()
        referencia_pago = f"BONOS_{timestamp_now.strftime('%Y%m%d_%H%M%S')}_{employee_id}"
        
        # 1. Crear registro de uso de bonos
        for bono_data in bonos_utilizados:
            bono_id = bono_data["bono_id"]
            valor_utilizado = bono_data["valor_utilizado"]
            
            # Registrar el uso del bono
            query_uso = """
            INSERT INTO `datos-clientes-441216.Conciliaciones.conductor_bonos_usos` (
                id,
                bono_id,
                employee_id,
                valor_utilizado,
                fecha_uso,
                referencia_pago,
                guias_aplicadas,
                estado_uso,
                creado_en
            ) VALUES (
                @uso_id,
                @bono_id,
                @employee_id,
                @valor_utilizado,
                @fecha_uso,
                @referencia_pago,
                @guias_aplicadas,
                'aplicado',
                @creado_en
            )
            """
            
            uso_id = f"USO_{timestamp_now.strftime('%Y%m%d_%H%M%S')}_{bono_id}"
            
            job_config_uso = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("uso_id", "STRING", uso_id),
                    bigquery.ScalarQueryParameter("bono_id", "STRING", bono_id),
                    bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id),
                    bigquery.ScalarQueryParameter("valor_utilizado", "FLOAT", float(valor_utilizado)),
                    bigquery.ScalarQueryParameter("fecha_uso", "TIMESTAMP", timestamp_now),
                    bigquery.ScalarQueryParameter("referencia_pago", "STRING", referencia_pago),
                    bigquery.ScalarQueryParameter("guias_aplicadas", "STRING", json.dumps(guias)),
                    bigquery.ScalarQueryParameter("creado_en", "TIMESTAMP", timestamp_now)
                ]
            )
            
            client.query(query_uso, job_config=job_config_uso).result()
            
            # 2. Actualizar saldo del bono
            query_actualizar = """
            UPDATE `datos-clientes-441216.Conciliaciones.conductor_bonos`
            SET 
                saldo_disponible = saldo_disponible - @valor_utilizado,
                estado_bono = CASE 
                    WHEN saldo_disponible - @valor_utilizado <= 0 THEN 'agotado'
                    ELSE estado_bono
                END,
                fecha_ultima_actualizacion = @timestamp_now
            WHERE id = @bono_id
                AND employee_id = @employee_id
            """
            
            job_config_actualizar = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("valor_utilizado", "FLOAT", float(valor_utilizado)),
                    bigquery.ScalarQueryParameter("bono_id", "STRING", bono_id),
                    bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id),
                    bigquery.ScalarQueryParameter("timestamp_now", "TIMESTAMP", timestamp_now)
                ]
            )
            
            client.query(query_actualizar, job_config=job_config_actualizar).result()

        print(f"✅ Bonos aplicados exitosamente")
        print(f"💰 Total aplicado: ${total_bonos}")
        print(f"📋 Bonos utilizados: {len(bonos_utilizados)}")
        
        return {
            "mensaje": "✅ Bonos aplicados exitosamente",
            "total_aplicado": total_bonos,
            "bonos_utilizados": len(bonos_utilizados),
            "referencia_pago": referencia_pago,
            "guias_afectadas": len(guias),
            "timestamp": timestamp_now.isoformat(),
            "puede_procesar_efectivo": True  # 🔥 Indicar que puede continuar con pagos en efectivo
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error aplicando bonos: {str(e)}")
        import traceback
        print(f"❌ Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error interno aplicando bonos: {str(e)}")

# 🔥 NUEVA RUTA: Consultar bonos disponibles por conductor
@router.get("/bonos-disponibles")
async def obtener_bonos_disponibles(
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
):
    """
    Obtiene los bonos disponibles para el conductor autenticado
    """
    try:
        user_email = current_user.get("correo") or current_user.get("sub")
        if not user_email:
            raise HTTPException(status_code=401, detail="Usuario no autenticado")

        employee_id = obtener_employee_id_usuario(user_email, client)
        if not employee_id:
            raise HTTPException(status_code=404, detail="Conductor no encontrado")

        query = """
        SELECT 
            id,
            tipo_bono,
            descripcion,
            valor_bono,
            saldo_disponible,
            fecha_expiracion,
            estado_bono,
            fecha_creacion
        FROM `datos-clientes-441216.Conciliaciones.conductor_bonos`
        WHERE employee_id = @employee_id
            AND estado_bono = 'activo'
            AND saldo_disponible > 0
            AND (fecha_expiracion IS NULL OR fecha_expiracion > CURRENT_DATE())
        ORDER BY fecha_creacion DESC
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
                "descripcion": row.descripcion or "",
                "valor_original": float(row.valor_bono),
                "saldo_disponible": float(row.saldo_disponible),
                "fecha_expiracion": str(row.fecha_expiracion) if row.fecha_expiracion else None,
                "estado": row.estado_bono,
                "fecha_creacion": row.fecha_creacion.isoformat() if row.fecha_creacion else None
            }
            bonos.append(bono)
            total_disponible += bono["saldo_disponible"]
        
        return {
            "disponible": total_disponible,
            "detalles": bonos,
            "total_bonos": len(bonos)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo bonos disponibles: {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo bonos disponibles")

@router.get("/historial")
async def historial_pagos(
    estado: Optional[str] = Query(None, description="Filtrar por estado"),
    desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)"),
    referencia: Optional[str] = Query(None, description="Buscar por referencia"),
    limite: int = Query(100, ge=1, le=500, description="Límite de resultados")
):
    """
    Obtiene el historial de pagos con filtros avanzados
    """
    client = get_bigquery_client()

    try:
        condiciones = []
        parametros = []

        # Construir filtros dinámicamente
        if estado:
            condiciones.append("estado = @estado")
            parametros.append(bigquery.ScalarQueryParameter("estado", "STRING", estado))

        if desde:
            condiciones.append("fecha_pago >= @desde")
            parametros.append(bigquery.ScalarQueryParameter("desde", "DATE", desde))

        if hasta:
            condiciones.append("fecha_pago <= @hasta")
            parametros.append(bigquery.ScalarQueryParameter("hasta", "DATE", hasta))

        if referencia:
            condiciones.append("referencia_pago LIKE @referencia")
            parametros.append(bigquery.ScalarQueryParameter("referencia", "STRING", f"%{referencia}%"))

        where_clause = "WHERE " + " AND ".join(condiciones) if condiciones else ""

        query = f"""
            SELECT
                referencia_pago,
                SUM(valor) AS valor,
                MAX(fecha_pago) AS fecha,
                MAX(entidad) AS entidad,
                MAX(estado) AS estado,
                MAX(tipo) AS tipo,
                MAX(comprobante) AS imagen,
                MAX(novedades) AS novedades,
                COUNT(*) AS num_guias,
                MAX(correo) AS correo_conductor,
                MAX(creado_en) AS fecha_creacion,
                MAX(modificado_en) AS fecha_modificacion,
                MAX(modificado_por) AS modificado_por
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
            {where_clause}
            GROUP BY referencia_pago
            ORDER BY MAX(fecha_pago) DESC, MAX(creado_en) DESC
            LIMIT {limite}
        """

        job_config = bigquery.QueryJobConfig(query_parameters=parametros)
        
        # Ejecutar con timeout
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(lambda: client.query(query, job_config=job_config).result())
            resultados = future.result(timeout=30)

        historial = []
        for row in resultados:
            historial.append({
                "referencia_pago": row["referencia_pago"],
                "valor": float(row["valor"]) if row["valor"] else 0.0,
                "fecha": str(row["fecha"]) if row["fecha"] else None,
                "entidad": row["entidad"] or "",
                "estado": row["estado"] or "desconocido",
                "tipo": row["tipo"] or "",
                "imagen": row["imagen"] or "",
                "novedades": row["novedades"] or "",
                "num_guias": int(row["num_guias"]) if row["num_guias"] else 0,
                "correo_conductor": row["correo_conductor"] or "",
                "fecha_creacion": row["fecha_creacion"].isoformat() if row["fecha_creacion"] else None,
                "fecha_modificacion": row["fecha_modificacion"].isoformat() if row["fecha_modificacion"] else None,
                "modificado_por": row["modificado_por"] or ""
            })

        return {
            "historial": historial,
            "total_registros": len(historial),
            "filtros_aplicados": {
                "estado": estado,
                "desde": desde,
                "hasta": hasta,
                "referencia": referencia,
                "limite": limite
            },
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Error obteniendo historial de pagos: {e}")
        raise HTTPException(
            status_code=500,
            detail="Error obteniendo historial de pagos"
        )

@router.get("/detalles-pago/{referencia_pago}")
async def obtener_detalles_pago(referencia_pago: str):
    """
    Obtiene los detalles completos de un pago específico incluyendo todas las guías
    """
    client = get_bigquery_client()
    
    try:
        query = """
            SELECT 
                tracking, 
                referencia, 
                valor,
                cliente,
                entidad,
                tipo,
                fecha_pago,
                hora_pago,
                estado,
                novedades,
                comprobante,
                creado_en,
                modificado_en,
                modificado_por
            FROM `{project}.{dataset}.pagosconductor`
            WHERE referencia_pago = @referencia_pago
            ORDER BY tracking
        """.format(project=PROJECT_ID, dataset=DATASET_CONCILIACIONES)
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia_pago", "STRING", referencia_pago)
            ]
        )
        
        resultado = client.query(query, job_config=job_config).result()
        detalles = []
        
        for row in resultado:
            tracking = row["tracking"] if row["tracking"] else row["referencia"]
            detalles.append({
                "tracking": tracking,
                "referencia": row["referencia"],
                "valor": float(row["valor"]) if row["valor"] else 0.0,
                "cliente": row["cliente"] or "Sin Cliente",
                "entidad": row["entidad"] or "",
                "tipo": row["tipo"] or "",
                "fecha_pago": str(row["fecha_pago"]) if row["fecha_pago"] else None,
                "hora_pago": row["hora_pago"] or "",
                "estado": row["estado"] or "",
                "novedades": row["novedades"] or "",
                "comprobante": row["comprobante"] or "",
                "creado_en": row["creado_en"].isoformat() if row["creado_en"] else None,
                "modificado_en": row["modificado_en"].isoformat() if row["modificado_en"] else None,
                "modificado_por": row["modificado_por"] or ""
            })
        
        if not detalles:
            raise HTTPException(status_code=404, detail="Pago no encontrado")
        
        # Calcular resumen
        valor_total = sum(d["valor"] for d in detalles)
        
        return {
            "referencia_pago": referencia_pago,
            "detalles": detalles,
            "resumen": {
                "total_guias": len(detalles),
                "valor_total": valor_total,
                "estado_general": detalles[0]["estado"] if detalles else "desconocido",
                "entidad": detalles[0]["entidad"] if detalles else "",
                "tipo": detalles[0]["tipo"] if detalles else "",
                "fecha_pago": detalles[0]["fecha_pago"] if detalles else None
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo detalles del pago {referencia_pago}: {e}")
        raise HTTPException(
            status_code=500, 
            detail="Error obteniendo detalles del pago"
        )

@router.get("/pagos-conductor")
async def obtener_pagos():
    """
    Obtiene la lista de pagos agrupados por referencia con información resumida
    """
    client = get_bigquery_client()
    
    try:
        # Primero verificar esquema de tabla
        schema_query = """
        SELECT column_name
        FROM `{project}.{dataset}.INFORMATION_SCHEMA.COLUMNS`
        WHERE table_name = 'pagosconductor'
        """.format(project=PROJECT_ID, dataset=DATASET_CONCILIACIONES)
        
        try:
            schema_result = client.query(schema_query).result()
            columnas_existentes = [row["column_name"] for row in schema_result]
            logger.info(f"Columnas disponibles en pagosconductor: {len(columnas_existentes)}")
        except Exception as e:
            logger.warning(f"No se pudo verificar esquema: {e}")
            columnas_existentes = []
        
        # Construir query dinámicamente
        if "valor_total_consignacion" in columnas_existentes:
            valor_query = "COALESCE(MAX(valor_total_consignacion), SUM(valor))"
        else:
            valor_query = "SUM(valor)"
            
        if "tracking" in columnas_existentes:
            tracking_query = "STRING_AGG(DISTINCT COALESCE(tracking, referencia), ', ' ORDER BY COALESCE(tracking, referencia) LIMIT 5)"
        else:
            tracking_query = "STRING_AGG(DISTINCT referencia, ', ' ORDER BY referencia LIMIT 5)"
        
        query = f"""
            SELECT 
                referencia_pago, 
                {valor_query} AS valor,
                MAX(fecha_pago) AS fecha, 
                MAX(COALESCE(entidad, 'Sin Entidad')) AS entidad,
                MAX(COALESCE(estado, 'pendiente')) AS estado, 
                MAX(COALESCE(tipo, 'Sin Tipo')) AS tipo,
                MAX(COALESCE(comprobante, '')) AS imagen,
                MAX(COALESCE(novedades, '')) AS novedades,
                COUNT(*) as num_guias,
                {tracking_query} as trackings_preview,
                MAX(correo) as correo_conductor,
                MAX(creado_en) as fecha_creacion,
                MAX(modificado_en) as fecha_modificacion
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
            WHERE referencia_pago IS NOT NULL 
                AND referencia_pago != ''
            GROUP BY referencia_pago
            ORDER BY MAX(fecha_pago) DESC, MAX(creado_en) DESC
            LIMIT 200
        """
        
        logger.info(f"Ejecutando query de pagos conductor")
        
        # Ejecutar con timeout
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(lambda: client.query(query).result())
            resultados = future.result(timeout=30)
        
        pagos = []
        for row in resultados:
            pago = {
                "referencia_pago": row.get("referencia_pago", ""),
                "valor": float(row.get("valor", 0)) if row.get("valor") else 0.0,
                "fecha": str(row.get("fecha", "")),
                "entidad": str(row.get("entidad", "")),
                "estado": str(row.get("estado", "")),
                "tipo": str(row.get("tipo", "")),
                "imagen": str(row.get("imagen", "")),
                "novedades": str(row.get("novedades", "")),
                "num_guias": int(row.get("num_guias", 0)),
                "trackings_preview": str(row.get("trackings_preview", "")),
                "correo_conductor": str(row.get("correo_conductor", "")),
                "fecha_creacion": row.get("fecha_creacion").isoformat() if row.get("fecha_creacion") else None,
                "fecha_modificacion": row.get("fecha_modificacion").isoformat() if row.get("fecha_modificacion") else None
            }
            
            # Limitar preview de trackings
            if pago["trackings_preview"]:
                trackings_list = pago["trackings_preview"].split(", ")
                if len(trackings_list) > 3:
                    pago["trackings_preview"] = ", ".join(trackings_list[:3]) + f" (+{len(trackings_list)-3} más)"
            
            pagos.append(pago)
        
        logger.info(f"✅ Obtenidos {len(pagos)} pagos")
        return pagos
        
    except Exception as e:
        logger.error(f"Error en pagos-conductor: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        
        # Fallback en caso de error
        return [{
            "referencia_pago": "ERROR_LOADING",
            "valor": 0.0,
            "fecha": "2025-01-01",
            "entidad": "Error",
            "estado": "error",
            "tipo": "Error",
            "imagen": "",
            "novedades": "Error cargando datos del servidor",
            "num_guias": 0,
            "trackings_preview": "Error",
            "correo_conductor": "",
            "fecha_creacion": None,
            "fecha_modificacion": None
        }]

@router.get("/estadisticas")
async def obtener_estadisticas_pagos():
    """
    Obtiene estadísticas generales de los pagos por estado, periodo, etc.
    """
    client = get_bigquery_client()
    
    try:
        query = """
        WITH estadisticas_base AS (
            SELECT 
                estado,
                COUNT(DISTINCT referencia_pago) as pagos_count,
                COUNT(*) as guias_count,
                SUM(valor) as valor_total,
                AVG(valor) as valor_promedio,
                MIN(fecha_pago) as fecha_min,
                MAX(fecha_pago) as fecha_max,
                COUNT(DISTINCT correo) as conductores_count
            FROM `{project}.{dataset}.pagosconductor`
            WHERE fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
            GROUP BY estado
        ),
        estadisticas_periodo AS (
            SELECT 
                EXTRACT(MONTH FROM fecha_pago) as mes,
                EXTRACT(YEAR FROM fecha_pago) as año,
                COUNT(DISTINCT referencia_pago) as pagos_mes,
                SUM(valor) as valor_mes
            FROM `{project}.{dataset}.pagosconductor`
            WHERE fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
            GROUP BY año, mes
            ORDER BY año DESC, mes DESC
            LIMIT 12
        )
        SELECT 
            'por_estado' as tipo,
            estado as categoria,
            pagos_count as cantidad,
            valor_total as valor,
            valor_promedio,
            conductores_count as conductores,
            CAST(fecha_min AS STRING) as fecha_min,
            CAST(fecha_max AS STRING) as fecha_max
        FROM estadisticas_base
        
        UNION ALL
        
        SELECT 
            'por_periodo' as tipo,
            CONCAT(año, '-', LPAD(CAST(mes AS STRING), 2, '0')) as categoria,
            pagos_mes as cantidad,
            valor_mes as valor,
            CASE WHEN pagos_mes > 0 THEN valor_mes / pagos_mes ELSE 0 END as valor_promedio,
            0 as conductores,
            '' as fecha_min,
            '' as fecha_max
        FROM estadisticas_periodo
        """.format(project=PROJECT_ID, dataset=DATASET_CONCILIACIONES)
        
        resultado = client.query(query).result()
        
        estadisticas = {
            "por_estado": [],
            "por_periodo": [],
            "resumen_general": {
                "total_pagos": 0,
                "total_valor": 0.0,
                "total_conductores": 0
            }
        }
        
        for row in resultado:
            item = {
                "categoria": row["categoria"],
                "cantidad": int(row["cantidad"]) if row["cantidad"] else 0,
                "valor": float(row["valor"]) if row["valor"] else 0.0,
                "valor_promedio": float(row["valor_promedio"]) if row["valor_promedio"] else 0.0,
                "conductores": int(row["conductores"]) if row["conductores"] else 0,
                "fecha_min": row["fecha_min"] if row["fecha_min"] else None,
                "fecha_max": row["fecha_max"] if row["fecha_max"] else None
            }
            
            if row["tipo"] == "por_estado":
                estadisticas["por_estado"].append(item)
                estadisticas["resumen_general"]["total_pagos"] += item["cantidad"]
                estadisticas["resumen_general"]["total_valor"] += item["valor"]
                estadisticas["resumen_general"]["total_conductores"] = max(
                    estadisticas["resumen_general"]["total_conductores"], 
                    item["conductores"]
                )
            else:
                estadisticas["por_periodo"].append(item)
        
        return estadisticas
        
    except Exception as e:
        logger.error(f"Error obteniendo estadísticas: {e}")
        raise HTTPException(
            status_code=500,
            detail="Error obteniendo estadísticas de pagos"
        )

@router.get("/health")
def health_check():
    """Endpoint para verificar que el módulo de pagos está funcionando"""
    try:
        client = get_bigquery_client()
        
        # Test simple de conectividad
        test_query = f"""
        SELECT COUNT(*) as total
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
        LIMIT 1
        """
        
        result = client.query(test_query).result()
        total = next(result)["total"]
        
        return {
            "status": "healthy",
            "module": "pagos",
            "bigquery": "connected",
            "total_records": total,
            "comprobantes_dir": os.path.exists(COMPROBANTES_DIR),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "module": "pagos", 
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@router.get("/test-upload")
def test_upload_directory():
    """Test para verificar que el directorio de comprobantes funciona"""
    try:
        # Verificar directorio
        if not os.path.exists(COMPROBANTES_DIR):
            os.makedirs(COMPROBANTES_DIR, exist_ok=True)
        
        # Test de escritura
        test_file = os.path.join(COMPROBANTES_DIR, "test.txt")
        with open(test_file, "w") as f:
            f.write("test")
        
        # Limpiar test
        os.remove(test_file)
        
        return {
            "status": "success",
            "directory": COMPROBANTES_DIR,
            "writable": True,
            "max_file_size_mb": MAX_FILE_SIZE // (1024*1024)
        }
        
    except Exception as e:
        return {
            "status": "error",
            "directory": COMPROBANTES_DIR,
            "writable": False,
            "error": str(e)
        }

@router.post("/aplicar-bonos")
async def aplicar_bonos_conductor(
    datos_bonos: Dict[str, Any],
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    🆕 NUEVO: Aplica bonos del conductor a guías específicas
    """
    try:
        print(f"🎯 ===== APLICANDO BONOS =====")
        print(f"📧 Usuario: {current_user.get('correo')}")
        print(f"💰 Datos recibidos: {datos_bonos}")

        user_email = current_user.get("correo") or current_user.get("sub")
        if not user_email:
            raise HTTPException(status_code=401, detail="Usuario no autenticado")

        # Obtener employee_id del usuario
        employee_id = obtener_employee_id_usuario(user_email, client)
        if not employee_id:
            raise HTTPException(status_code=404, detail="Conductor no encontrado")

        bonos_utilizados = datos_bonos.get("bonos_utilizados", [])
        total_bonos = datos_bonos.get("total_bonos", 0)
        guias = datos_bonos.get("guias", [])

        if not bonos_utilizados:
            raise HTTPException(status_code=400, detail="No se especificaron bonos a utilizar")

        # Verificar que los bonos pertenecen al conductor y están disponibles
        bonos_ids = [bono["bono_id"] for bono in bonos_utilizados]
        query_verificar = """
        SELECT 
            id,
            saldo_disponible,
            tipo_bono,
            valor_bono
        FROM `datos-clientes-441216.Conciliaciones.conductor_bonos`
        WHERE id IN UNNEST(@bonos_ids)
            AND employee_id = @employee_id
            AND estado_bono = 'activo'
            AND saldo_disponible > 0
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ArrayQueryParameter("bonos_ids", "STRING", bonos_ids),
                bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id)
            ]
        )
        
        result = client.query(query_verificar, job_config=job_config).result()
        bonos_validos = {row.id: row for row in result}
        
        # Verificar que todos los bonos son válidos
        for bono_data in bonos_utilizados:
            bono_id = bono_data["bono_id"]
            valor_utilizado = bono_data["valor_utilizado"]
            
            if bono_id not in bonos_validos:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Bono {bono_id} no válido o no disponible"
                )
            
            bono_db = bonos_validos[bono_id]
            if valor_utilizado > bono_db.saldo_disponible:
                raise HTTPException(
                    status_code=400,
                    detail=f"Valor solicitado ({valor_utilizado}) mayor al saldo disponible ({bono_db.saldo_disponible}) para bono {bono_id}"
                )

        # Iniciar transacción para aplicar bonos
        timestamp_now = datetime.now()
        
        # 1. Crear registro de uso de bonos
        for bono_data in bonos_utilizados:
            bono_id = bono_data["bono_id"]
            valor_utilizado = bono_data["valor_utilizado"]
            
            # Registrar el uso del bono
            query_uso = """
            INSERT INTO `datos-clientes-441216.Conciliaciones.conductor_bonos_usos` (
                id,
                bono_id,
                employee_id,
                valor_utilizado,
                fecha_uso,
                referencia_pago,
                guias_aplicadas,
                estado_uso,
                creado_en
            ) VALUES (
                @uso_id,
                @bono_id,
                @employee_id,
                @valor_utilizado,
                @fecha_uso,
                @referencia_pago,
                @guias_aplicadas,
                'aplicado',
                @creado_en
            )
            """
            
            uso_id = f"USO_BONO_{timestamp_now.strftime('%Y%m%d_%H%M%S')}_{bono_id}"
            referencia_pago = f"PAGO_BONOS_{timestamp_now.strftime('%Y%m%d_%H%M%S')}"
            
            job_config_uso = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("uso_id", "STRING", uso_id),
                    bigquery.ScalarQueryParameter("bono_id", "STRING", bono_id),
                    bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id),
                    bigquery.ScalarQueryParameter("valor_utilizado", "FLOAT", float(valor_utilizado)),
                    bigquery.ScalarQueryParameter("fecha_uso", "TIMESTAMP", timestamp_now),
                    bigquery.ScalarQueryParameter("referencia_pago", "STRING", referencia_pago),
                    bigquery.ScalarQueryParameter("guias_aplicadas", "STRING", json.dumps(guias)),
                    bigquery.ScalarQueryParameter("creado_en", "TIMESTAMP", timestamp_now)
                ]
            )
            
            client.query(query_uso, job_config=job_config_uso).result()
            
            # 2. Actualizar saldo del bono
            query_actualizar = """
            UPDATE `datos-clientes-441216.Conciliaciones.conductor_bonos`
            SET 
                saldo_disponible = saldo_disponible - @valor_utilizado,
                estado_bono = CASE 
                    WHEN saldo_disponible - @valor_utilizado <= 0 THEN 'agotado'
                    ELSE estado_bono
                END,
                fecha_ultima_actualizacion = @timestamp_now
            WHERE id = @bono_id
                AND employee_id = @employee_id
            """
            
            job_config_actualizar = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("valor_utilizado", "FLOAT", float(valor_utilizado)),
                    bigquery.ScalarQueryParameter("bono_id", "STRING", bono_id),
                    bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id),
                    bigquery.ScalarQueryParameter("timestamp_now", "TIMESTAMP", timestamp_now)
                ]
            )
            
            client.query(query_actualizar, job_config=job_config_actualizar).result()

        print(f"✅ Bonos aplicados exitosamente")
        print(f"💰 Total aplicado: ${total_bonos}")
        print(f"📋 Bonos utilizados: {len(bonos_utilizados)}")
        
        return {
            "mensaje": "Bonos aplicados exitosamente",
            "total_aplicado": total_bonos,
            "bonos_utilizados": len(bonos_utilizados),
            "referencia_pago": referencia_pago,
            "guias_afectadas": len(guias),
            "timestamp": timestamp_now.isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error aplicando bonos: {str(e)}")
        import traceback
        print(f"❌ Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error interno aplicando bonos: {str(e)}")

@router.get("/pendientes-contabilidad")
def obtener_pagos_pendientes_contabilidad(
    limit: int = Query(20, ge=1, le=100, description="Número de registros por página"),
    offset: int = Query(0, ge=0, description="Número de registros a omitir"),
    referencia: Optional[str] = Query(None, description="Filtrar por referencia de pago"),
    estado: Optional[str] = Query(None, description="Filtrar por estado de conciliación"),
    fecha_desde: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    fecha_hasta: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)")
):
    """
    Obtiene pagos pendientes de contabilidad con paginación y filtros avanzados
    """
    try:
        client = get_bigquery_client()
        
        # Construir condiciones de filtro dinámicamente
        condiciones = ["1=1"]  # Condición base para facilitar concatenación
        parametros = []
        
        # Filtro por referencia de pago
        if referencia and referencia.strip():
            condiciones.append("referencia_pago LIKE @referencia_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("referencia_filtro", "STRING", f"%{referencia.strip()}%")
            )
        
        # Filtro por estado (por defecto pendiente_conciliacion si no se especifica)
        if estado and estado.strip():
            condiciones.append("estado_conciliacion = @estado_filtro")
            parametros.append(
                bigquery.ScalarQueryParameter("estado_filtro", "STRING", estado.strip())
            )
        else:
            # Si no se especifica estado, mostrar solo pendientes por defecto
            condiciones.append("estado_conciliacion = 'pendiente_conciliacion'")
        
        # Filtro por fecha desde
        if fecha_desde:
            try:
                # Validar formato de fecha
                datetime.strptime(fecha_desde, "%Y-%m-%d")
                condiciones.append("fecha_pago >= @fecha_desde")
                parametros.append(
                    bigquery.ScalarQueryParameter("fecha_desde", "DATE", fecha_desde)
                )
            except ValueError:
                raise HTTPException(status_code=400, detail="Formato de fecha_desde inválido (YYYY-MM-DD)")
        
        # Filtro por fecha hasta
        if fecha_hasta:
            try:
                # Validar formato de fecha
                datetime.strptime(fecha_hasta, "%Y-%m-%d")
                condiciones.append("fecha_pago <= @fecha_hasta")
                parametros.append(
                    bigquery.ScalarQueryParameter("fecha_hasta", "DATE", fecha_hasta)
                )
            except ValueError:
                raise HTTPException(status_code=400, detail="Formato de fecha_hasta inválido (YYYY-MM-DD)")
        
        where_clause = "WHERE " + " AND ".join(condiciones)
        
        # Query para obtener el total de registros (para paginación)
        count_query = f"""
        SELECT COUNT(DISTINCT referencia_pago) as total
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
        {where_clause}
        """
        
        # Query principal con paginación
        main_query = f"""
        SELECT 
            referencia_pago,
            correo as correo_conductor,
            MAX(fecha_pago) AS fecha,
            COALESCE(MAX(valor_total_consignacion), SUM(valor)) AS valor,
            MAX(entidad) AS entidad,
            MAX(tipo) AS tipo,
            MAX(comprobante) AS imagen,
            COUNT(*) AS num_guias,
            STRING_AGG(DISTINCT COALESCE(tracking, referencia), ', ' ORDER BY COALESCE(tracking, referencia) LIMIT 5) AS trackings_preview,
            MAX(estado_conciliacion) as estado_conciliacion,
            MAX(novedades) as novedades,
            MAX(creado_en) as fecha_creacion,
            MAX(modificado_en) as fecha_modificacion
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
        {where_clause}
        GROUP BY referencia_pago, correo
        ORDER BY MAX(fecha_pago) DESC, MAX(creado_en) DESC
        LIMIT {limit}
        OFFSET {offset}
        """
        
        logger.info(f"Ejecutando consulta con filtros: referencia={referencia}, estado={estado}, desde={fecha_desde}, hasta={fecha_hasta}")
        logger.info(f"Paginación: limit={limit}, offset={offset}")
        
        # Configurar parámetros para las consultas
        job_config = bigquery.QueryJobConfig(query_parameters=parametros)
        
        # Ejecutar consulta de conteo
        with concurrent.futures.ThreadPoolExecutor() as executor:
            # Ejecutar ambas consultas en paralelo
            future_count = executor.submit(lambda: client.query(count_query, job_config=job_config).result())
            future_main = executor.submit(lambda: client.query(main_query, job_config=job_config).result())
            
            # Obtener resultados con timeout
            count_result = future_count.result(timeout=30)
            main_result = future_main.result(timeout=30)
        
        # Obtener total de registros
        total_registros = next(count_result)["total"]
        total_paginas = (total_registros + limit - 1) // limit  # Ceiling division
        pagina_actual = (offset // limit) + 1
        
        # Procesar resultados principales
        pagos = []
        for row in main_result:
            # Limpiar trackings_preview si es muy largo
            trackings_preview = row.get("trackings_preview", "")
            if trackings_preview:
                trackings_list = trackings_preview.split(", ")
                if len(trackings_list) > 3:
                    trackings_preview = ", ".join(trackings_list[:3]) + f" (+{len(trackings_list)-3} más)"
            
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
                "trackings_preview": trackings_preview,
                "correo_conductor": str(row.get("correo_conductor", "")),
                "fecha_creacion": row.get("fecha_creacion").isoformat() if row.get("fecha_creacion") else None,
                "fecha_modificacion": row.get("fecha_modificacion").isoformat() if row.get("fecha_modificacion") else None
            }
            pagos.append(pago)
        
        # Información de paginación
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
        
        # Información de filtros aplicados
        filtros_aplicados = {
            "referencia": referencia,
            "estado": estado,
            "fecha_desde": fecha_desde,
            "fecha_hasta": fecha_hasta
        }
        
        logger.info(f"✅ Consulta exitosa: {len(pagos)} pagos obtenidos de {total_registros} totales")
        
        # Retornar respuesta estructurada
        return {
            "pagos": pagos,
            "paginacion": paginacion_info,
            "filtros": filtros_aplicados,
            "timestamp": datetime.now().isoformat(),
            "status": "success"
        }
        
    except HTTPException:
        # Re-lanzar HTTPExceptions
        raise
    except Exception as e:
        logger.error(f"❌ Error obteniendo pagos pendientes: {str(e)}")
        logger.error(f"❌ Traceback: {traceback.format_exc()}")
        
        # En caso de error, retornar respuesta de fallback
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
                "status": "error",
                "timestamp": datetime.now().isoformat()
            }
        )
@router.post("/pagos/aprobar-pago")
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

        logger.info(f"✅ Pago {referencia} aprobado por {modificado_por}. {total_guias} guías liberadas.")

        return {
            "mensaje": "Pago aprobado y conciliado manualmente",
            "referencia_pago": referencia,
            "total_guias": total_guias,
            "modificado_por": modificado_por,
            "timestamp": timestamp_actual.isoformat(),
            "nuevo_estado": "conciliado_manual"
        }

    except Exception as e:
        logger.error(f"❌ Error aprobando pago {referencia}: {str(e)}")
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

        logger.info(f"❌ Pago {referencia_pago} rechazado por {modificado_por}. Razón: {novedad}")

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
        logger.error(f"❌ Error rechazando pago {referencia_pago}: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error interno del servidor: {str(e)}"
        )
        
        
@router.post("/pagos/rechazar-pago")
def rechazar_pago(payload: dict):
    referencia_pago = payload.get("referencia_pago")
    novedad = payload.get("novedad")
    modificado_por = payload.get("modificado_por")



    if not referencia_pago or not novedad or not modificado_por:
        raise HTTPException(
            status_code=400,
            detail="Faltan campos requeridos (referencia_pago, novedad, modificado_por)"
        )

    try:
        client = bigquery.Client()
        fecha_actual = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        query = """
        UPDATE `datos-clientes-441216.Conciliaciones.pagosconductor`
        SET estado_conciliacion = 'rechazado',
            novedades = @novedad,
            modificado_por = @modificado_por,
            modificado_en = CURRENT_TIMESTAMP()
        WHERE referencia_pago = @referencia_pago
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia_pago", "STRING", referencia_pago),
                bigquery.ScalarQueryParameter("novedad", "STRING", novedad),
                bigquery.ScalarQueryParameter("modificado_por", "STRING", modificado_por),
            ]
        )

        job = client.query(query, job_config=job_config)
        job.result()  # esperar a que finalice

        return {
            "mensaje": f"Pago con referencia {referencia_pago} rechazado exitosamente",
            "novedad": novedad
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
