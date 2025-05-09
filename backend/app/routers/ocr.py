from fastapi import APIRouter, UploadFile, File
import shutil
import uuid
import os

from app.services.ocr_utils import leer_texto_ocr
from app.services.openai_extractor import extraer_datos_con_chatgpt

router = APIRouter(prefix="/api/ocr", tags=["OCR"])

@router.post("/comprobante")
async def procesar_comprobante(imagen: UploadFile = File(...)):
    temp_path = f"temp_{uuid.uuid4().hex}.jpg"

    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(imagen.file, buffer)

    try:
        texto = leer_texto_ocr(temp_path)
        datos = extraer_datos_con_chatgpt(texto)
        return datos
    finally:
        os.remove(temp_path)

