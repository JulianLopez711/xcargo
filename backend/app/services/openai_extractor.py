from openai import OpenAI
from app.core.config import OPENAI_API_KEY

client = OpenAI(api_key=OPENAI_API_KEY)

def extraer_datos_con_chatgpt(texto_ocr: str) -> dict:
    prompt = f"""
Extrae los siguientes campos del texto escaneado de un comprobante de pago:

- valor (con símbolo $ si aplica)
- fecha (formato YYYY-MM-DD)
- tipo_pago (Nequi, Transferencia, Consignación)
- entidad (Nequi, Daviplata, Bancolombia, etc.)
- referencia (código único del pago)

Usa solo lo que aparece explícitamente. Si algo falta, deja el campo vacío.

Texto OCR:
\"\"\"{texto_ocr}\"\"\"
"""

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
        temperature=0
    )
    return eval(response.choices[0].message.content)
