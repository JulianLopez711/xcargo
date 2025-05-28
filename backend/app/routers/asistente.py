from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from openai import OpenAI
from typing import Optional, List, Dict, Any
import os
import json

router = APIRouter(prefix="/asistente", tags=["Asistente"])

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

class Mensaje(BaseModel):
    pregunta: str
    correo_usuario: str
    contexto_adicional: Optional[Dict[str, Any]] = None

class GuiaInfo(BaseModel):
    tracking: str
    conductor: str
    empresa: str
    valor: float
    estado: Optional[str] = "pendiente"
    novedad: Optional[str] = None

def obtener_guias_usuario(correo_usuario: str) -> List[GuiaInfo]:
    """
    Obtiene las guías asignadas al usuario desde la API
    En producción, esto haría una llamada real a la base de datos
    """
    # Simulación - en producción conectar con la BD real
    try:
        # Aquí iría la llamada real a: fetch(f"http://localhost:8000api/operador/guias-pendientes?conductor={correo_usuario}")
        guias_simuladas = [
            GuiaInfo(tracking="G123456", conductor="Juan Pérez", empresa="Empresa ABC", valor=150000, estado="pendiente"),
            GuiaInfo(tracking="G789012", conductor="Juan Pérez", empresa="Empresa XYZ", valor=85000, estado="rechazado", novedad="Valor incorrecto"),
            GuiaInfo(tracking="G345678", conductor="Juan Pérez", empresa="Empresa DEF", valor=220000, estado="pendiente")
        ]
        return guias_simuladas
    except Exception as e:
        return []

def construir_prompt_sistema(nombre_usuario: str, rol: str, guias: List[GuiaInfo], contexto_pagina: Optional[str] = None):
    # Preparar información de guías
    total_pendiente = sum(g.valor for g in guias if g.estado == "pendiente")
    guias_rechazadas = [g for g in guias if g.estado == "rechazado"]
    
    guias_texto = ""
    if guias:
        guias_texto = "GUÍAS ACTUALES DEL USUARIO:\n"
        for guia in guias:
            estado_emoji = "⏳" if guia.estado == "pendiente" else "❌" if guia.estado == "rechazado" else "✅"
            guias_texto += f"• {estado_emoji} Tracking: {guia.tracking} | Empresa: {guia.empresa} | Valor: ${guia.valor:,} | Estado: {guia.estado}"
            if guia.novedad:
                guias_texto += f" | Novedad: {guia.novedad}"
            guias_texto += "\n"
        
        guias_texto += f"\nRESUMEN: {len(guias)} guías totales | ${total_pendiente:,} pendientes de pago"
        if guias_rechazadas:
            guias_texto += f" | {len(guias_rechazadas)} guías rechazadas que requieren atención"
    
    contexto_pagina_texto = ""
    if contexto_pagina:
        contexto_pagina_texto = f"\nCONTEXTO: El usuario está actualmente en la página '{contexto_pagina}'"

    prompt = f"""
Eres XBot, el asistente virtual especializado de XCargo. Te comunicas con {nombre_usuario} (rol: {rol}).

{guias_texto}
{contexto_pagina_texto}

CONOCIMIENTO DEL SISTEMA XCARGO:

## FUNCIONALIDADES PRINCIPALES PARA CONDUCTORES:
1. **Pagos Pendientes**: Ver lista de guías por tracking pendientes de pago
2. **Selección Múltiple**: Marcar varias guías para pago conjunto 
3. **Registro de Pagos**: Subir comprobantes con extracción automática (OCR)
4. **Validación**: Sistema verifica referencias únicas y montos correctos

## PROCESO PASO A PASO:
**VISUALIZAR PAGOS:**
- Acceder a "Pagos Pendientes" desde dashboard
- Ver tabla con: Tracking, Conductor, Empresa, Valor, Estado, Novedad
- 20 guías por página con paginación
- Total pendiente mostrado en la parte superior

**SELECCIONAR GUÍAS:**
- Marcar checkbox de guías a pagar
- Total seleccionado se actualiza automáticamente
- Selecciones se mantienen al cambiar de página
- Botón "Pagar" para proceder

**REGISTRAR PAGOS:**
- Sistema muestra resumen de guías seleccionadas
- Subir comprobante (JPG, PNG, PDF - máx 5MB)
- OCR extrae automáticamente: valor, fecha, hora, entidad, referencia
- Verificar y corregir datos extraídos
- Tipo de pago: Consignación, Nequi, Transferencia
- "Agregar pago" valida referencia única
- Repetir para múltiples pagos si es necesario

**FINALIZAR:**
- Total acumulado debe cubrir valor de guías
- "Registrar todos los pagos" procesa todo
- Confirmación y redirección a lista actualizada

## ESTADOS DE GUÍAS:
- **Pendiente**: Lista para pago (fila normal)
- **Rechazado**: Pago anterior rechazado (fila roja, revisar novedad)
- **Con novedad**: Observaciones especiales en rojo cursiva

## ERRORES COMUNES:
- ERR_002: Referencia duplicada (comprobante ya usado)
- ERR_004: Monto insuficiente (verificar totales)
- ERR_005: OCR no disponible (completar manualmente)
- Timeout: Esperar 2-3 minutos antes de actualizar

## MEJORES PRÁCTICAS:
- Agrupar guías similares para reducir comisiones
- Imágenes claras y bien iluminadas para OCR
- Verificar siempre datos extraídos automáticamente
- Mantener respaldos de comprobantes

REGLAS DE COMUNICACIÓN:
✅ Responder solo sobre funciones del rol del usuario
✅ Usar información real de las guías del usuario
✅ Dar pasos específicos y prácticos
✅ Mencionar números de tracking cuando sea relevante
✅ Sugerir contactar soporte si no puedes ayudar
❌ No inventar información que no tienes
❌ No dar información de otros usuarios
❌ No especular sobre estados sin confirmar

Responde de manera práctica, empática y específica a la consulta del usuario:
"""
    return prompt

def generar_respuesta_contextual(pregunta: str, guias: List[GuiaInfo]) -> str:
    """
    Genera respuestas contextuales basadas en el estado real de las guías
    """
    pregunta_lower = pregunta.lower()
    
    # Detectar tipo de consulta y generar contexto adicional
    if "cuánto debo" in pregunta_lower or "total" in pregunta_lower:
        total = sum(g.valor for g in guias if g.estado == "pendiente")
        return f"Según tus guías actuales, tienes ${total:,} pendientes de pago. "
    
    elif "rechazada" in pregunta_lower or "rechazado" in pregunta_lower:
        rechazadas = [g for g in guias if g.estado == "rechazado"]
        if rechazadas:
            info = "Tienes guías rechazadas: "
            for g in rechazadas:
                info += f"Tracking {g.tracking} (${g.valor:,}) - Motivo: {g.novedad or 'No especificado'}. "
            return info
    
    elif "tracking" in pregunta_lower:
        trackings = [g.tracking for g in guias]
        return f"Tus trackings actuales son: {', '.join(trackings)}. "
    
    return ""

@router.post("/chat")
async def responder_pregunta(mensaje: Mensaje):
    try:
        # Obtener información real del usuario (simulado por ahora)
        # En producción, extraer de JWT o sesión
        nombre_usuario = "Juan Pérez"  # Extraer del token/sesión
        rol = "conductor"
        
        # Obtener guías reales del usuario
        guias = obtener_guias_usuario(mensaje.correo_usuario)
        
        # Obtener contexto de página si está disponible
        contexto_pagina = mensaje.contexto_adicional.get("pagina_actual") if mensaje.contexto_adicional else None
        
        # Construir prompt del sistema
        prompt_sistema = construir_prompt_sistema(nombre_usuario, rol, guias, contexto_pagina)
        
        # Generar contexto adicional específico
        contexto_adicional = generar_respuesta_contextual(mensaje.pregunta, guias)
        
        # Preparar pregunta del usuario con contexto
        pregunta_con_contexto = contexto_adicional + mensaje.pregunta if contexto_adicional else mensaje.pregunta
        
        # Llamada a OpenAI
        respuesta_llm = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": prompt_sistema},
                {"role": "user", "content": pregunta_con_contexto}
            ],
            temperature=0.7,
            max_tokens=500,
            presence_penalty=0.1,
            frequency_penalty=0.1
        )

        respuesta_texto = respuesta_llm.choices[0].message.content
        
        # Agregar información de contacto si es necesario
        if "soporte" in mensaje.pregunta.lower() or "contacto" in mensaje.pregunta.lower():
            respuesta_texto += "\n\n📞 **Contacto Xcargo:**\n• Email: soporte@xcargo.co\n• Horario: Lunes a Viernes 8AM-6PM\n• Emergencias: 24/7"
        
        return {
            "respuesta": respuesta_texto,
            "contexto": {
                "total_guias": len(guias),
                "total_pendiente": sum(g.valor for g in guias if g.estado == "pendiente"),
                "guias_rechazadas": len([g for g in guias if g.estado == "rechazado"])
            }
        }
        
    except Exception as e:
        print(f"Error en asistente: {e}")
        return {
            "respuesta": "Lo siento, experimenté un problema técnico. Por favor, intenta nuevamente o contacta a soporte técnico.",
            "error": True
        }

@router.get("/estado-usuario/{correo}")
async def obtener_estado_usuario(correo: str):
    """
    Endpoint para obtener estado actual del usuario sin hacer pregunta
    """
    try:
        guias = obtener_guias_usuario(correo)
        return {
            "guias": [guia.dict() for guia in guias],
            "resumen": {
                "total_guias": len(guias),
                "total_pendiente": sum(g.valor for g in guias if g.estado == "pendiente"),
                "guias_rechazadas": len([g for g in guias if g.estado == "rechazado"])
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo estado: {e}")