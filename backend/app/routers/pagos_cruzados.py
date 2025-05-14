from fastapi import APIRouter
from app.models.pago_guia import RegistroPago

router = APIRouter(prefix="/pagos-cruzados", tags=["Pagos Cruzados"])

@router.post("/registrar")
def registrar_pago_cruzado(data: RegistroPago):
    # Aquí va la lógica para guardar el pago y su relación con guías
    return {"mensaje": "Pago registrado correctamente", "guías": data.guias}
