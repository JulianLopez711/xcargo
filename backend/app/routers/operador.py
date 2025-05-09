from fastapi import APIRouter
from ..services.bigquery_service import obtener_pagos_pendientes

router = APIRouter(prefix="/api/operador", tags=["Operador"])

@router.get("/guias-pendientes")
def guias_pendientes():
    return obtener_pagos_pendientes()
