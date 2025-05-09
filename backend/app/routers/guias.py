from fastapi import APIRouter
from app.services.bigquery_utils import obtener_guias_pendientes

router = APIRouter(prefix="/api/guias", tags=["Guías"])

@router.get("/pendientes")
def listar():
    return obtener_guias_pendientes()
