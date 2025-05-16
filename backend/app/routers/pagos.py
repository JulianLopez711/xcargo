from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from google.cloud import bigquery
import datetime
from uuid import uuid4
import os

router = APIRouter(prefix="/pagos", tags=["Pagos"])

@router.post("/registrar-conductor")
async def registrar_pago_conductor(
    correo: str = Form(...),
    valor: float = Form(...),
    fecha_pago: str = Form(...),       # YYYY-MM-DD
    hora_pago: str = Form(...),        # HH:MM
    tipo: str = Form(...),
    entidad: str = Form(...),
    referencia: str = Form(...),
    comprobante: UploadFile = File(...)
):
    client = bigquery.Client()

    # 🔍 Validar duplicado por referencia
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

    # 🔍 Validar duplicado por fecha y hora exactas
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
        raise HTTPException(status_code=400, detail=f"❌ Ya existe un pago con la misma fecha y hora ({fecha_pago} {hora_pago}).")

    # 🗂 Guardar comprobante
    nombre_archivo = f"{uuid4()}_{comprobante.filename}"
    ruta_local = os.path.join("comprobantes", nombre_archivo)
    os.makedirs("comprobantes", exist_ok=True)

    with open(ruta_local, "wb") as f:
        f.write(await comprobante.read())

    comprobante_url = f"http://localhost:8000/static/{nombre_archivo}"

    # 📄 Registro para BigQuery
    table_id = "datos-clientes-441216.Conciliaciones.pagosconductor"
    nuevo_pago = [{
        "id_string": str(uuid4()),
        "correo": correo,
        "valor": valor,
        "fecha_pago": fecha_pago,
        "hora_pago": hora_pago,
        "tipo": tipo,
        "entidad": entidad,
        "referencia": referencia,
        "comprobante": comprobante_url,
        "fecha": fecha_pago,
        "estado": "registrado",
        "creado_por": correo,
        "modificado_por": correo,
        "novedades": "",
        "creado_en": datetime.datetime.utcnow().isoformat()
    }]

    # 💾 Insertar en BigQuery
    errors = client.insert_rows_json(table_id, nuevo_pago)

    if errors:
        print("❌ Errores de BigQuery:", errors)
        raise HTTPException(status_code=500, detail=errors)

    return {
        "mensaje": "✅ Pago registrado correctamente.",
        "comprobante_url": comprobante_url
    }

@router.get("/pagos-conductor")
def obtener_pagos_conductor():
    client = bigquery.Client()
    query = """
        SELECT referencia, valor, fecha_pago AS fecha, entidad, estado, tipo, comprobante AS imagen
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
    client.query(query, job_config=job_config).result()
    return {"mensaje": "Actualización exitosa"}
