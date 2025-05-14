from fastapi import APIRouter
from app.services.bigquery_service import obtener_roles

router = APIRouter(prefix="/roles", tags=["Roles"])

@router.get("/")
def listar_roles():
    return obtener_roles()
