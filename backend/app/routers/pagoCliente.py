from fastapi import APIRouter, UploadFile, Form
from app.services.email_service import enviar_correo_pago

router = APIRouter()

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
