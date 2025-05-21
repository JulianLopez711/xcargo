from fastapi import APIRouter, Form, UploadFile, File, HTTPException
from google.cloud import bigquery
from datetime import datetime
from uuid import uuid4
import os

router = APIRouter(prefix="/pagos", tags=["Pagos"])

@router.post("/registrar-conductor")
async def registrar_pago_conductor(
    correo: str = Form(...),
    valor_pago: float = Form(...),
    fecha_pago: str = Form(...),       # YYYY-MM-DD
    hora_pago: str = Form(...),        # HH:MM
    tipo: str = Form(...),
    entidad: str = Form(...),
    referencia: str = Form(...),
    comprobante: UploadFile = File(...),
    guias: str = Form(...)             # JSON string con guías asociadas
):
    import json

    try:
        lista_guias = json.loads(guias)
    except Exception:
        raise HTTPException(status_code=400, detail="Error al leer las guías")

    if not lista_guias:
        raise HTTPException(status_code=400, detail="Debe asociar al menos una guía")

    nombre_archivo = f"{uuid4()}_{comprobante.filename}"
    ruta_local = os.path.join("comprobantes", nombre_archivo)
    os.makedirs("comprobantes", exist_ok=True)

    with open(ruta_local, "wb") as f:
        f.write(await comprobante.read())

    comprobante_url = f"https://api.x-cargo.co/static/{nombre_archivo}"
    fecha_hora_registro = datetime.utcnow().isoformat()
    client = bigquery.Client()

    filas = []
    valor_por_guia = valor_pago / len(lista_guias)

    for guia in lista_guias:
        filas.append({
            "correo": correo,
            "fecha_pago": fecha_pago,
            "hora_pago": hora_pago,
            "valor": valor_por_guia,
            "entidad": entidad,
            "tipo": tipo,
            "referencia": guia["referencia"],  # de la guía
            "referencia_pago": referencia,     # única por pago
            "comprobante": comprobante_url,
            "estado": "pendiente",
            "fecha_registro": fecha_hora_registro,
            "modificado_por": correo,
            "cliente": guia.get("cliente", "no_asignado")
        })

    try:
        tabla = "datos-clientes-441216.Conciliaciones.pagosconductor"
        client.insert_rows_json(tabla, filas)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al registrar el pago: {e}")

    try:
        referencias_guias = [guia["referencia"] for guia in lista_guias]
        client.query(f"""
            UPDATE `datos-clientes-441216.Conciliaciones..COD_Pendiente`
            SET estado = 'registrado'
            WHERE referencia IN UNNEST(@refs)
        """, job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ArrayQueryParameter("refs", "STRING", referencias_guias)
            ]
        )).result()
    except Exception as e:
        print("Error al actualizar estado de guías:", e)

    return {"mensaje": "Pago registrado correctamente", "valor_total": valor_pago}

@router.get("/pagos-conductor")
def obtener_pagos():
    client = bigquery.Client()
    query = """
        SELECT referencia_pago, MAX(referencia) AS referencia, MAX(valor) AS valor,
               MAX(fecha_pago) AS fecha, MAX(entidad) AS entidad, 
               MAX(estado) AS estado, MAX(tipo) AS tipo,
               MAX(comprobante) AS imagen, MAX(novedades) AS novedades
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        GROUP BY referencia_pago
        ORDER BY fecha DESC
    """
    resultados = client.query(query).result()
    return [dict(row) for row in resultados]

@router.get("/detalles/{referencia_pago}")
def obtener_detalles_pago(referencia_pago: str):
    client = bigquery.Client()
    query = f"""
        SELECT referencia
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE referencia_pago = @ref
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("ref", "STRING", referencia_pago)
        ]
    )
    resultados = client.query(query, job_config=job_config).result()
    return [row["referencia"] for row in resultados]
