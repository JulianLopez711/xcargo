from fastapi import APIRouter, Form
from pydantic import BaseModel
from openai import OpenAI
import os

router = APIRouter(prefix="/asistente", tags=["Asistente"])

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

class Mensaje(BaseModel):
    pregunta: str
    correo_usuario: str  # para futuras consultas por usuario si aplica

@router.post("/chat")
async def responder_pregunta(mensaje: Mensaje):
    pregunta = mensaje.pregunta.lower()

    # Ejemplo de consulta simulada (lógica real puede consultar BigQuery u otra DB)
    if "referencia" in pregunta and "mi8158035" in pregunta:
        return {"respuesta": "Sí, el pago con referencia MI8158035 fue recibido el 15 de mayo y está pendiente de validación."}

    # Si no se encuentra coincidencia directa, se consulta a ChatGPT
    respuesta_llm = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": "Eres un asistente virtual que responde preguntas sobre pagos y guías de transporte."},
            {"role": "user", "content": pregunta}
        ]
    )

    texto_respuesta = respuesta_llm.choices[0].message.content
    return {"respuesta": texto_respuesta}
