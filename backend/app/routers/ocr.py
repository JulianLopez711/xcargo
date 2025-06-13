"""
🔧 ARCHIVO OCR.PY COMPLETAMENTE CORREGIDO
Sin errores de sintaxis y con API key funcionando
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
import logging
from app.services.openai_extractor import enhanced_extractor

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 🎯 CREAR EL ROUTER
router = APIRouter(prefix="/ocr", tags=["OCR"])

# 🎯 ENDPOINTS DEL ROUTER
@router.post("/extraer")
async def extraer_pago_con_ia(file: UploadFile = File(...)):
    """
    Endpoint principal para extracción OCR con IA usando el extractor mejorado
    """
    try:
        resultado = await enhanced_extractor.extraer_datos_pago_inteligente(file)
        
        logger.info(f"✅ Extracción exitosa: {resultado.get('datos_extraidos', {})}")
        return JSONResponse(content=resultado)
        
    except Exception as e:
        logger.error(f"❌ Error en extracción OCR: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "error": True,
                "mensaje": "Error procesando comprobante de pago",
                "detalle": str(e)
            }
        )

@router.get("/health")
async def health_check():
    """
    Endpoint de health check para verificar el estado del servicio OCR
    """
    return {
        "status": "healthy",
        "engines_disponibles": enhanced_extractor.get_engines_status(),
        "timestamp": datetime.now().isoformat()
    }