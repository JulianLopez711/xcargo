from fastapi import APIRouter, UploadFile, File
from app.services.openai_extractor import extraer_datos_pago

router = APIRouter(prefix="/ocr", tags=["OCR"])

@router.post("/extraer")
async def extraer_pago(file: UploadFile = File(...)):
    return await extraer_datos_pago(file)

