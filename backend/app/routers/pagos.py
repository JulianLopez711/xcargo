from fastapi import APIRouter
from app.models.pago import PagoRequest
from app.services.pago_service import registrar_pago

router = APIRouter(prefix="/api/pagos", tags=["Pagos"])

@router.post("/registrar")
def registrar(pago: PagoRequest):
    return registrar_pago(pago)
