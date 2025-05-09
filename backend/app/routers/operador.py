from fastapi import APIRouter
from app.services.bigquery_utils import obtener_guias_pendientes

router = APIRouter(prefix="/api/operador", tags=["Operador"])

@router.get("/guias-pendientes")
def guias_pendientes():
    return obtener_guias_pendientes()
