import os
from dotenv import load_dotenv
from openai import OpenAI
import easyocr
from fastapi import UploadFile
from PIL import Image
import io

# Cargar variables de entorno
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Inicializar OCR
reader = easyocr.Reader(['es'], gpu=False)

async def extraer_datos_pago(file: UploadFile):
    contents = await file.read()
    image = Image.open(io.BytesIO(contents))

    # Ejecutar OCR
    resultado = reader.readtext(contents, detail=0, paragraph=True)
    texto_ocr = "\n".join(resultado)

    # La forma más segura: usar una cadena normal para la parte estática
    # y solo usar f-string para la parte dinámica
    prompt = f"""
Actúa como un sistema experto en extracción de datos financieros. Tu tarea es analizar el siguiente texto extraído por OCR de un comprobante de pago y extraer información clave en un formato estructurado.

Texto del comprobante:
\"\"\"{texto_ocr}\"\"\"

Extrae los siguientes campos y responde únicamente con un JSON válido:

{{
  "valor": "monto numérico con 2 decimales sin símbolos monetarios",
  "fecha_transaccion": "YYYY-MM-DD",
  "hora_transaccion": "HH:MM:SS",
  "entidad_financiera": "nombre de la entidad bancaria o aplicación",
  "entidad_financiera": "nombre de quien realizó el pago (por ejemplo Nequi, Daviplata, Bancolombia, etc.), no quien recibió el pago",
  "estado_transaccion": "exitoso/pendiente/rechazado",
  "numero_confirmacion": "número de aprobación/autorización si existe"
}}

Reglas:
- Si aparece “Escanea este QR con Nequi”, asume que Nequi es la entidad financiera.
- Si un campo no se encuentra, usa `null` como valor.
- Asegúrate que el JSON no tenga comentarios, explicaciones, ni texto adicional.
- Todas las fechas en formato ISO: YYYY-MM-DD.
- Todas las horas en formato 24h: HH:MM:SS.
- El valor monetario debe ser solo el número, sin símbolo de moneda.
"""


    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        respuesta = response.choices[0].message.content

        return {
            "texto_detectado": texto_ocr,
            "datos_extraidos": respuesta
        }
    except Exception as e:
        return {"error": str(e)}