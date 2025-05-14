from fastapi import APIRouter, Form, File, UploadFile
from typing import List

from app.services.bigquery_service import (
    obtener_pagos_pendientes,
    registrar_relacion_pago_guias,
    obtener_relaciones_temporales
)


router = APIRouter(prefix="/pagos", tags=["Pagos"])

@router.get("/agrupados")
def pagos_agrupados():
    pagos = obtener_pagos_pendientes()
    return agrupar_guias_por_referencia_y_fecha(pagos)


@router.post("/registrar-consolidado")
async def registrar_pago_consolidado(
    referencia: str = Form(...),
    valor: float = Form(...),
    fecha: str = Form(...),
    hora: str = Form(...),
    tipo_pago: str = Form(...),
    entidad: str = Form(...),
    guias: List[str] = Form(...),
    comprobante: UploadFile = Form(...)
):
    # Lógica para renombrar y guardar archivo + registrar en BigQuery
    return guardar_pago(
        referencia=referencia,
        valor=valor,
        fecha=fecha,
        hora=hora,
        tipo_pago=tipo_pago,
        entidad=entidad,
        guias=guias,
        comprobante=comprobante
    )
