from fastapi import APIRouter, UploadFile, Form
from app.services.email_service import enviar_correo_pago
from fastapi import APIRouter, HTTPException, UploadFile, Form
from google.cloud import bigquery
from uuid import uuid4
from typing import List
from pydantic import BaseModel
from datetime import date
import os


router = APIRouter()
client = bigquery.Client()


class PagoCliente(BaseModel):
    cliente: str
    fecha_pago: date
    valor_total: float
    referencia_pago: str
    entidad: str
    entregas_pagadas: List[str]
    url_comprobante_pdf: str
    creado_por: str

@router.post("/pago-cliente/registrar")
def registrar_pago_cliente(pago: PagoCliente):
    try:
        id_pago = str(uuid4())

        insert_query = f"""
        INSERT INTO `datos-clientes-441216.Conciliaciones.pagos_cliente`
        (id, cliente, fecha_pago, valor_total, referencia_pago, entidad, url_comprobante_pdf, entregas_pagadas, creado_por)
        VALUES (
            @id, @cliente, @fecha_pago, @valor_total, @referencia_pago, @entidad, @url_comprobante_pdf, @entregas_pagadas, @creado_por
        )
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("id", "STRING", id_pago),
                bigquery.ScalarQueryParameter("cliente", "STRING", pago.cliente),
                bigquery.ScalarQueryParameter("fecha_pago", "DATE", pago.fecha_pago.isoformat()),
                bigquery.ScalarQueryParameter("valor_total", "FLOAT64", pago.valor_total),
                bigquery.ScalarQueryParameter("referencia_pago", "STRING", pago.referencia_pago),
                bigquery.ScalarQueryParameter("entidad", "STRING", pago.entidad),
                bigquery.ScalarQueryParameter("url_comprobante_pdf", "STRING", pago.url_comprobante_pdf),
                bigquery.ArrayQueryParameter("entregas_pagadas", "STRING", pago.entregas_pagadas),
                bigquery.ScalarQueryParameter("creado_por", "STRING", pago.creado_por),
            ]
        )

        client.query(insert_query, job_config=job_config).result()

        # Actualizar las entregas en guias_liquidacion
        for tracking in pago.entregas_pagadas:
            update_query = f"""
            UPDATE `datos-clientes-441216.Conciliaciones.guias_liquidacion`
            SET estado_liquidacion = 'pagado_cliente',
                fecha_modificacion = CURRENT_TIMESTAMP(),
                modificado_por = @usuario
            WHERE tracking_number = @tracking
            """
            update_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("usuario", "STRING", pago.creado_por),
                    bigquery.ScalarQueryParameter("tracking", "STRING", tracking)
                ]
            )
            client.query(update_query, job_config=update_config).result()

        return {"status": "ok", "mensaje": "Pago registrado y entregas actualizadas."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/enviar-confirmacion-email/")
async def enviar_confirmacion_email(
    cliente: str = Form(...),
    total: float = Form(...),
    entregas: str = Form(...),  # JSON como string
    comprobante: UploadFile = Form(...)
):
    entregas_lista = eval(entregas)  # o json.loads(entregas)
    contenido = await comprobante.read()
    enviar_correo_pago(cliente, total, entregas_lista, comprobante.filename, contenido)
    return {"message": "Correo enviado con comprobante"}
