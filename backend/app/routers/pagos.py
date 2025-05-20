from fastapi import Body
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from google.cloud import bigquery
import datetime
from uuid import uuid4
import os
import json

router = APIRouter(prefix="/pagos", tags=["Pagos"])

@router.post("/registrar-conductor")
async def registrar_pago_conductor(
    correo: str = Form(...),
    fecha_pago: str = Form(...),
    hora_pago: str = Form(...),
    tipo: str = Form(...),
    entidad: str = Form(...),
    referencia: str = Form(...),
    guias: str = Form(...),  
    comprobante: UploadFile = File(...)
):
    client = bigquery.Client()

    # 🔍 Validación por referencia duplicada
    query_ref = """
        SELECT referencia
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE referencia = @ref
        LIMIT 1
    """
    job_config_ref = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("ref", "STRING", referencia)]
    )
    resultado_ref = client.query(query_ref, job_config=job_config_ref).result()
    if any(resultado_ref):
        raise HTTPException(status_code=400, detail=f"❌ La referencia {referencia} ya fue registrada.")

    # 🔍 Validación por fecha + hora exacta
    query_fecha_hora = """
        SELECT referencia
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE fecha_pago = @fecha AND hora_pago = @hora
        LIMIT 1
    """
    job_config_fecha_hora = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("fecha", "STRING", fecha_pago),
            bigquery.ScalarQueryParameter("hora", "STRING", hora_pago),
        ]
    )
    resultado_fecha_hora = client.query(query_fecha_hora, job_config=job_config_fecha_hora).result()
    if any(resultado_fecha_hora):
        raise HTTPException(status_code=400, detail=f"❌ Ya existe un pago con la misma fecha y hora.")

    # 📁 Guardar comprobante en carpeta local
    nombre_archivo = f"{uuid4()}_{comprobante.filename}"
    ruta_local = os.path.join("comprobantes", nombre_archivo)
    os.makedirs("comprobantes", exist_ok=True)
    with open(ruta_local, "wb") as f:
        f.write(await comprobante.read())

    comprobante_url = f"https://api.x-cargo.co/static/{nombre_archivo}"

    # 🆔 Generar referencia común para este grupo de pagos
    referencia_pago = f"PAGO-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"

    # 🧾 Procesar guías individuales
    lista_guias = json.loads(guias)
    table_id = "datos-clientes-441216.Conciliaciones.pagosconductor"

    filas = []
    for guia in lista_guias:
        filas.append({
            "id_string": str(uuid4()),
            "correo": correo,
            "valor": guia["valor"],
            "fecha_pago": fecha_pago,
            "hora_pago": hora_pago,
            "tipo": tipo,
            "entidad": entidad,
            "referencia": referencia,
            "tracking": guia["referencia"],
            "referencia_pago": referencia_pago,
            "comprobante": comprobante_url,
            "fecha": fecha_pago,
            "estado": "registrado",
            "creado_por": correo,
            "modificado_por": correo,
            "novedades": "",
            "creado_en": datetime.datetime.utcnow().isoformat()
        })

    # 💾 Insertar en BigQuery
    errors = client.insert_rows_json(table_id, filas)
    if errors:
        raise HTTPException(status_code=500, detail=errors)
    
    # ✅ Actualizar estado de las guías a "Pagado"
    tracking_numbers = [guia["referencia"] for guia in lista_guias]

    update_query = """
        UPDATE `datos-clientes-441216.Conciliaciones.COD_pendiente`
        SET StatusP = 'Pagado'
        WHERE tracking_number IN UNNEST(@ids)
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("ids", "STRING", tracking_numbers)
        ]
    )

    client.query(update_query, job_config=job_config).result()


    return {
        "mensaje": "✅ Pago registrado correctamente.",
        "referencia_pago": referencia_pago,
        "comprobante_url": comprobante_url
    }

# ============================================

@router.get("/pagos-conductor")
def obtener_pagos_conductor():
    client = bigquery.Client()
    query = """
        SELECT referencia, valor, fecha_pago AS fecha, entidad, estado, tipo, comprobante AS imagen,referencia_pago
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        ORDER BY fecha DESC
    """
    result = client.query(query).result()
    pagos = [dict(row) for row in result]
    return pagos

@router.post("/actualizar-estado-cod")
async def actualizar_estado_cod(tracking_numbers: list[str]):
    query = """
        UPDATE `datos-clientes-441216.Conciliaciones.COD_pendiente`
        SET StatusP = 'Pagado'
        WHERE tracking_number IN UNNEST(@ids)
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("ids", "STRING", tracking_numbers)
        ]
    )
    client = bigquery.Client()
    client.query(query, job_config=job_config).result()
    return {"mensaje": "Actualización exitosa"}



@router.post("/rechazar-pago")
async def rechazar_pago_conductor(
    referencia_pago: str = Body(...),
    novedad: str = Body(...),
    modificado_por: str = Body(...)
):
    client = bigquery.Client()

    # ✅ 1. Obtener los trackings asociados a la referencia de pago
    query_trackings = """
        SELECT tracking
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE referencia_pago = @ref
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("ref", "STRING", referencia_pago)
        ]
    )
    result = client.query(query_trackings, job_config=job_config).result()
    trackings = [row["tracking"] for row in result]

    if not trackings:
        raise HTTPException(status_code=404, detail="No se encontraron pagos con esa referencia.")

    # ✅ 2. Actualizar estado en pagosconductor
    query_update_pagos = """
        UPDATE `datos-clientes-441216.Conciliaciones.pagosconductor`
        SET estado = 'rechazado',
            novedades = @novedad,
            modificado_por = @contador
        WHERE referencia_pago = @ref
    """
    job_config_update = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("novedad", "STRING", novedad),
            bigquery.ScalarQueryParameter("contador", "STRING", modificado_por),
            bigquery.ScalarQueryParameter("ref", "STRING", referencia_pago),
        ]
    )
    client.query(query_update_pagos, job_config=job_config_update).result()

    # ✅ 3. Volver guías a estado "Pendiente"
    query_cod = """
        UPDATE `datos-clientes-441216.Conciliaciones.COD_pendiente`
        SET StatusP = 'Pendiente'
        WHERE tracking_number IN UNNEST(@trackings)
    """
    job_config_cod = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("trackings", "STRING", trackings)
        ]
    )
    client.query(query_cod, job_config=job_config_cod).result()

    return {
        "mensaje": "❌ Pago rechazado correctamente.",
        "referencia_pago": referencia_pago,
        "novedad": novedad,
        "trackings_afectados": trackings
    }
