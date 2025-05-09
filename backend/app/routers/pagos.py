from fastapi import APIRouter
from app.services.bigquery_service import obtener_pagos_pendientes

router = APIRouter(prefix="/pagos", tags=["Pagos"])

@router.get("/pendientes")
def listar_pagos_pendientes():
    return obtener_pagos_pendientes()
