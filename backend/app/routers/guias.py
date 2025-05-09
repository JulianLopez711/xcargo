from fastapi import APIRouter
from app.services.bigquery_service import obtener_pagos_pendientes



router = APIRouter(prefix="/api/guias", tags=["Guías"])

@router.get("/pendientes")
def listar():
    return obtener_pagos_pendientes()
