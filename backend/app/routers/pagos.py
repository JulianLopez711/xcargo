from fastapi import APIRouter, Form, UploadFile, File, HTTPException, Body, Query, Depends
from fastapi.responses import JSONResponse
from google.cloud import bigquery
from google.api_core import exceptions as gcp_exceptions
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from uuid import uuid4
import pandas as pd
import os
import json
import traceback
import logging
import asyncio
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
        # Guardar archivo
        content = await archivo.read()
        with open(ruta_local, "wb") as f:
            f.write(content)
        
        # URL para acceso
        comprobante_url = f"http://localhost:8000/static/{nombre_archivo}"
        logger.info(f"Comprobante guardado: {nombre_archivo}")
        
        return comprobante_url
        
    except Exception as e:
        logger.error(f"Error guardando comprobante: {e}")
        # Limpiar archivo si hay error
        if os.path.exists(ruta_local):
            os.remove(ruta_local)
        raise HTTPException(
            status_code=500,
            detail="Error guardando comprobante de pago"
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

        # PASO 3: Validar duplicados por conductor
        logger.info(f"Validando duplicados para {correo}")
        verificacion_dup = client.query("""
            SELECT COUNT(*) as total
            FROM `{project}.{dataset}.pagosconductor`
            WHERE correo = @correo
              AND fecha_pago = @fecha
              AND hora_pago = @hora
              AND valor_total_consignacion = @valor
        """.format(project=PROJECT_ID, dataset=DATASET_CONCILIACIONES),
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo", "STRING", correo),
                bigquery.ScalarQueryParameter("fecha", "DATE", fecha_pago),
                bigquery.ScalarQueryParameter("hora", "STRING", hora_pago),
                bigquery.ScalarQueryParameter("valor", "FLOAT64", valor_pago)
            ]
        )).result()

        if next(verificacion_dup)["total"] > 0:
            raise HTTPException(
                status_code=409,
                detail="Este pago ya fue registrado previamente"
            )

        # PASO 4: Procesar guías
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
            SELECT tracking_number as referencia, Cliente, Valor as valor
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
                "cliente": cliente_clean
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
                {escape_value(fila['cliente'])}
            )"""
            valores_sql.append(valores_fila)
        
        # Ejecutar inserción
        tabla = f"{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor"
        query = f"""
        INSERT INTO `{tabla}` (
            referencia, valor, fecha, entidad, estado, tipo, comprobante, 
            novedades, creado_en, creado_por, modificado_en, modificado_por,
            hora_pago, correo, fecha_pago, id_string, referencia_pago, 
            valor_total_consignacion, tracking, cliente
        ) VALUES {', '.join(valores_sql)}
        """
        
        # Timeout para inserción
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(lambda: client.query(query).result())
            future.result(timeout=30)
        
        logger.info("✅ Datos insertados correctamente")

        # PASO 9: Actualizar estado en COD_pendientes_v1
        try:
            update_query = f"""
            UPDATE `{PROJECT_ID}.{DATASET_CONCILIACIONES}.COD_pendientes_v1`
            SET Status_Big = 'PAGADO - Procesado por conductor'
            WHERE tracking_number IN ('{refs_str}')
            """
            client.query(update_query).result()
            logger.info("✅ Status_Big actualizado en COD_pendientes_v1")
        except Exception as e:
            logger.warning(f"⚠️ Error actualizando Status_Big: {e}")
        
        return {
            "mensaje": "✅ Pago registrado correctamente",
            "valor_total": valor_pago,
            "guias_procesadas": len(filas),
            "referencia_pago": referencia,
            "comprobante_url": comprobante_url
        }

    except HTTPException:
        # Re-lanzar HTTPExceptions tal como están
        raise
    except Exception as e:
        logger.error(f"❌ Error inesperado registrando pago: {str(e)}")
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
            detail="Error interno del servidor procesando el pago"
        )

def conciliar_pago_automaticamente(referencia: str, valor: float, entidad: str) -> bool:
    client = get_bigquery_client()
    query = """
    SELECT COUNT(*) as coincidencias
    FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
    WHERE referencia_pago_asociada = @referencia
      AND ABS(valor_banco - @valor) < 500
      AND LOWER(cuenta) = LOWER(@entidad)
    LIMIT 1
    """
    result = client.query(query, job_config=bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("referencia", "STRING", referencia),
            bigquery.ScalarQueryParameter("valor", "FLOAT", valor),
            bigquery.ScalarQueryParameter("entidad", "STRING", entidad),
        ]
    )).result()
    row = list(result)[0]
    return row["coincidencias"] > 0


class AprobacionPagoRequest(BaseModel):
    referencia_pago: str
    modificado_por: str

@router.post("/aprobar-pago")
def aprobar_pago(data: AprobacionPagoRequest):
    referencia = data.referencia_pago
    modificado_por = data.modificado_por

    client = get_bigquery_client()

    # 1. Consultar el pago
    consulta_pago = client.query(
        """
        SELECT referencia_pago, valor, entidad, fecha
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE referencia_pago = @referencia
        LIMIT 1
        """,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia)
            ]
        )
    )
    pago = list(consulta_pago.result())[0]

    # 2. Marcar como aprobado
    client.query(
        """
        UPDATE `datos-clientes-441216.Conciliaciones.pagosconductor`
        SET estado = 'aprobado',
            modificado_por = @modificado_por,
            modificado_en = CURRENT_TIMESTAMP()
        WHERE referencia_pago = @referencia
        """,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia),
                bigquery.ScalarQueryParameter("modificado_por", "STRING", modificado_por),
            ]
        )
    ).result()

    # 3. Conciliación automática
    coincidencia = conciliar_pago_automaticamente(
        referencia=pago.referencia_pago,
        valor=pago.valor,
        entidad=pago.entidad
    )

    if coincidencia:
        # 3.1 Marcar como conciliado
        client.query(
            """
            UPDATE `datos-clientes-441216.Conciliaciones.pagosconductor`
            SET estado = 'conciliado'
            WHERE referencia_pago = @referencia
            """,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[bigquery.ScalarQueryParameter("referencia", "STRING", referencia)]
            )
        ).result()

        # 3.2 Insertar en resultados_conciliacion
        client.query(
            """
            INSERT INTO `datos-clientes-441216.Conciliaciones.resultados_conciliacion`
            (referencia_pago, valor, entidad, fecha_conciliacion, metodo, resultado)
            VALUES (@referencia, @valor, @entidad, CURRENT_DATE(), 'automatica', 'match')
            """,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("referencia", "STRING", pago.referencia_pago),
                    bigquery.ScalarQueryParameter("valor", "FLOAT", pago.valor),
                    bigquery.ScalarQueryParameter("entidad", "STRING", pago.entidad),
                ]
            )
        ).result()

        # 3.3 Marcar guías como liquidadas
        client.query(
            """
            UPDATE `datos-clientes-441216.Conciliaciones.guias_liquidacion`
            SET estado_liquidacion = 'liquidado',
                fecha_modificacion = CURRENT_TIMESTAMP()
            WHERE pago_referencia = @referencia
            """,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[bigquery.ScalarQueryParameter("referencia", "STRING", referencia)]
            )
        ).result()

    return {
        "status": "aprobado",
        "referencia": referencia,
        "conciliado": coincidencia,
        "mensaje": "Pago aprobado y procesado correctamente" + (" con conciliación automática." if coincidencia else ".")
    }

class RechazoPagoRequest(BaseModel):
    referencia_pago: str
    novedad: str
    modificado_por: str

@router.post("/rechazar-pago")
def rechazar_pago(data: RechazoPagoRequest):
    referencia = data.referencia_pago
    novedad = data.novedad
    modificado_por = data.modificado_por

    client = get_bigquery_client()

    # 1. Actualizar estado del pago a rechazado
    client.query(
        """
        UPDATE `datos-clientes-441216.Conciliaciones.pagosconductor`
        SET estado = 'rechazado',
            novedades = @novedad,
            modificado_por = @modificado_por,
            fecha_modificacion = CURRENT_TIMESTAMP()
        WHERE referencia_pago = @referencia
        """,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia),
                bigquery.ScalarQueryParameter("novedad", "STRING", novedad),
                bigquery.ScalarQueryParameter("modificado_por", "STRING", modificado_por)
            ]
        )
    ).result()

    # 2. Eliminar de guias_liquidacion por referencia
    client.query(
        """
        DELETE FROM `datos-clientes-441216.Conciliaciones.guias_liquidacion`
        WHERE pago_referencia = @referencia
        """,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia)
            ]
        )
    ).result()

    return {
        "status": "rechazado",
        "referencia": referencia,
        "mensaje": "Pago rechazado y guías restauradas"
    }

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

        # 3. Registrar pago con bonos en tabla de pagos
        query_pago_bono = """
        INSERT INTO `datos-clientes-441216.Conciliaciones.pagos_conductores` (
            id,
            correo_conductor,
            employee_id,
            valor_pago,
            fecha_pago,
            hora_pago,
            tipo_pago,
            entidad_pago,
            referencia_pago,
            guias_pagadas,
            estado_pago,
            fecha_registro,
            metodo_pago,
            observaciones
        ) VALUES (
            @pago_id,
            @correo_conductor,
            @employee_id,
            @valor_pago,
            @fecha_pago,
            @hora_pago,
            'bono',
            'Sistema de Bonos XCargo',
            @referencia_pago,
            @guias_pagadas,
            'aprobado',
            @fecha_registro,
            'bonos',
            @observaciones
        )
        """
        
        pago_id = f"PAGO_BONO_{timestamp_now.strftime('%Y%m%d_%H%M%S')}_{employee_id}"
        referencia_pago = f"BONOS_{timestamp_now.strftime('%Y%m%d_%H%M%S')}"
        
        job_config_pago = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("pago_id", "STRING", pago_id),
                bigquery.ScalarQueryParameter("correo_conductor", "STRING", user_email),
                bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id),
                bigquery.ScalarQueryParameter("valor_pago", "FLOAT", float(total_bonos)),
                bigquery.ScalarQueryParameter("fecha_pago", "DATE", timestamp_now.date()),
                bigquery.ScalarQueryParameter("hora_pago", "TIME", timestamp_now.time()),
                bigquery.ScalarQueryParameter("referencia_pago", "STRING", referencia_pago),
                bigquery.ScalarQueryParameter("guias_pagadas", "STRING", json.dumps(guias)),
                bigquery.ScalarQueryParameter("fecha_registro", "TIMESTAMP", timestamp_now),
                bigquery.ScalarQueryParameter("observaciones", "STRING", f"Pago con bonos - {len(bonos_utilizados)} bonos utilizados")
            ]
        )
        
        client.query(query_pago_bono, job_config=job_config_pago).result()

        # 4. Actualizar estado de guías en liquidación (si aplica)
        if guias:
            for guia in guias:
                if guia.get("liquidacion_id"):
                    query_actualizar_guia = """
                    UPDATE `datos-clientes-441216.Conciliaciones.guias_liquidacion`
                    SET 
                        estado_liquidacion = 'procesando',
                        fecha_ultima_actualizacion = @timestamp_now,
                        observaciones = CONCAT(
                            COALESCE(observaciones, ''), 
                            ' | Pago parcial con bonos: ', 
                            CAST(@valor_bonos AS STRING)
                        )
                    WHERE id = @liquidacion_id
                        AND employee_id = @employee_id
                    """
                    
                    job_config_guia = bigquery.QueryJobConfig(
                        query_parameters=[
                            bigquery.ScalarQueryParameter("liquidacion_id", "STRING", guia["liquidacion_id"]),
                            bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id),
                            bigquery.ScalarQueryParameter("valor_bonos", "FLOAT", float(total_bonos)),
                            bigquery.ScalarQueryParameter("timestamp_now", "TIMESTAMP", timestamp_now)
                        ]
                    )
                    
                    client.query(query_actualizar_guia, job_config=job_config_guia).result()

        print(f"✅ Bonos aplicados exitosamente")
        print(f"💰 Total aplicado: ${total_bonos}")
        print(f"📋 Bonos utilizados: {len(bonos_utilizados)}")
        
        return {
            "mensaje": "Bonos aplicados exitosamente",
            "total_aplicado": total_bonos,
            "bonos_utilizados": len(bonos_utilizados),
            "referencia_pago": referencia_pago,
            "pago_id": pago_id,
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