from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel
from openai import OpenAI
from typing import Optional, List, Dict, Any
from google.cloud import bigquery
import os
import json
from app.dependencies import get_current_user

router = APIRouter(prefix="/asistente", tags=["Asistente"])

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def get_bigquery_client():
    """Obtiene el cliente de BigQuery"""
    return bigquery.Client()

class Mensaje(BaseModel):
    pregunta: str
    correo_usuario: str
    contexto_adicional: Optional[Dict[str, Any]] = None

class GuiaInfo(BaseModel):
    tracking: str
    conductor: str
    empresa: str
    valor: int  # Cambiado a int para coincidir con COD_pendientes_v1
    estado: Optional[str] = "pendiente"
    novedad: Optional[str] = None
    ciudad: Optional[str] = None
    departamento: Optional[str] = None
    carrier: Optional[str] = None
    fecha_estado: Optional[str] = None

def obtener_guias_usuario_real(correo_usuario: str, client: bigquery.Client) -> List[GuiaInfo]:
    """
    Obtiene las guías reales asignadas al usuario desde COD_pendientes_v1
    """
    try:
        # Query para obtener guías del usuario específico (más flexible)
        query = """
        SELECT 
            tracking_number,
            Empleado,
            Cliente,
            Ciudad,
            Departamento,
            Valor,
            Status_Big,
            Carrier,
            Status_Date
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1`
        WHERE LOWER(Empleado) LIKE LOWER(@correo_pattern)
        OR LOWER(Empleado) = LOWER(@correo_usuario)
        OR Empleado LIKE @nombre_pattern
        ORDER BY Status_Date DESC
        LIMIT 50
        """
        
        # Extraer nombre del email para búsqueda más amplia
        nombre_usuario = correo_usuario.split("@")[0].replace(".", " ")
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo_usuario", "STRING", correo_usuario),
                bigquery.ScalarQueryParameter("correo_pattern", "STRING", f"%{correo_usuario}%"),
                bigquery.ScalarQueryParameter("nombre_pattern", "STRING", f"%{nombre_usuario}%")
            ]
        )
        
        query_job = client.query(query, job_config=job_config)
        results = query_job.result()
        
        guias = []
        for row in results:
            # Determinar estado simplificado
            estado_simplificado = "entregado"
            if "360" in str(row.Status_Big) or "Entregado" in str(row.Status_Big):
                estado_simplificado = "entregado"
            elif "302" in str(row.Status_Big) or "301" in str(row.Status_Big):
                estado_simplificado = "pendiente"
            elif "PAGADO" in str(row.Status_Big).upper():
                estado_simplificado = "pagado"
            else:
                estado_simplificado = "pendiente"
            
            guia = GuiaInfo(
                tracking=str(row.tracking_number),
                conductor=str(row.Empleado) if row.Empleado else "Sin asignar",
                empresa=str(row.Cliente) if row.Cliente else "Sin cliente",
                valor=int(row.Valor) if row.Valor else 0,
                estado=estado_simplificado,
                novedad="",  # Podrías agregar lógica para novedades específicas
                ciudad=str(row.Ciudad) if row.Ciudad else "",
                departamento=str(row.Departamento) if row.Departamento else "",
                carrier=str(row.Carrier) if row.Carrier else "",
                fecha_estado=str(row.Status_Date) if row.Status_Date else ""
            )
            guias.append(guia)
        
        print(f"✅ Guías encontradas para {correo_usuario}: {len(guias)}")
        return guias
        
    except Exception as e:
        print(f"❌ Error obteniendo guías reales: {e}")
        return []

def obtener_estadisticas_usuario(correo_usuario: str, client: bigquery.Client) -> Dict[str, Any]:
    """
    Obtiene estadísticas específicas del usuario
    """
    try:
        query = """
        SELECT 
            COUNT(*) as total_guias,
            SUM(CASE 
                WHEN Status_Big NOT LIKE '%360%' AND Status_Big NOT LIKE '%Entregado%' 
                THEN Valor ELSE 0 
            END) as total_pendiente,
            COUNT(CASE 
                WHEN Status_Big LIKE '%rechazado%' OR Status_Big LIKE '%cancelado%' 
                THEN 1 
            END) as guias_rechazadas,
            SUM(CASE 
                WHEN Status_Big LIKE '%360%' OR Status_Big LIKE '%Entregado%' 
                THEN Valor ELSE 0 
            END) as total_entregado
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1`
        WHERE (LOWER(Empleado) LIKE LOWER(@correo_pattern) 
               OR LOWER(Empleado) = LOWER(@correo_usuario)
               OR Empleado LIKE @nombre_pattern)
        AND Valor > 0
        """
        
        # Extraer nombre del email para búsqueda más amplia
        nombre_usuario = correo_usuario.split("@")[0].replace(".", " ")
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo_usuario", "STRING", correo_usuario),
                bigquery.ScalarQueryParameter("correo_pattern", "STRING", f"%{correo_usuario}%"),
                bigquery.ScalarQueryParameter("nombre_pattern", "STRING", f"%{nombre_usuario}%")
            ]
        )
        
        query_job = client.query(query, job_config=job_config)
        results = query_job.result()
        
        for row in results:
            return {
                "total_guias": int(row.total_guias) if row.total_guias else 0,
                "total_pendiente": int(row.total_pendiente) if row.total_pendiente else 0,
                "guias_rechazadas": int(row.guias_rechazadas) if row.guias_rechazadas else 0,
                "total_entregado": int(row.total_entregado) if row.total_entregado else 0
            }
        
        return {"total_guias": 0, "total_pendiente": 0, "guias_rechazadas": 0, "total_entregado": 0}
        
    except Exception as e:
        print(f"❌ Error obteniendo estadísticas: {e}")
        return {"total_guias": 0, "total_pendiente": 0, "guias_rechazadas": 0, "total_entregado": 0}

def construir_prompt_sistema(nombre_usuario: str, rol: str, guias: List[GuiaInfo], contexto_pagina: Optional[str] = None):
    # Preparar información de guías
    total_pendiente = sum(g.valor for g in guias if g.estado == "pendiente")
    total_entregado = sum(g.valor for g in guias if g.estado == "entregado")
    guias_rechazadas = [g for g in guias if g.estado == "rechazado"]
    
    guias_texto = ""
    if guias:
        guias_texto = "GUÍAS ACTUALES DEL USUARIO:\n"
        for guia in guias:
            if guia.estado == "pendiente":
                estado_emoji = "⏳"
            elif guia.estado == "entregado":
                estado_emoji = "✅"
            elif guia.estado == "rechazado":
                estado_emoji = "❌"
            else:
                estado_emoji = "📦"
                
            guias_texto += f"• {estado_emoji} {guia.tracking} | {guia.empresa} | ${guia.valor:,} | {guia.estado}"
            if guia.ciudad:
                guias_texto += f" | {guia.ciudad}, {guia.departamento}"
            guias_texto += "\n"
        
        guias_texto += f"\n📊 RESUMEN: {len(guias)} guías totales"
        guias_texto += f" | ${total_pendiente:,} pendientes de pago"
        guias_texto += f" | ${total_entregado:,} ya entregadas"
        if guias_rechazadas:
            guias_texto += f" | {len(guias_rechazadas)} rechazadas"
    else:
        guias_texto = (
            "Actualmente NO tienes guías pendientes de pago ni asignadas en el sistema.\n"
            "Si esperabas ver guías aquí y no aparecen, por favor verifica con soporte técnico."
        )
    
    contexto_pagina_texto = ""
    if contexto_pagina:
        contexto_pagina_texto = f"\nCONTEXTO: El usuario está en '{contexto_pagina}'"

    prompt = f"""
Eres XBot, el asistente virtual especializado de XCargo. Atiendes a {nombre_usuario} (rol: {rol}).

{guias_texto}
{contexto_pagina_texto}

CONOCIMIENTO DEL SISTEMA XCARGO - ACTUALIZADO COD_pendientes_v1:

## ESTADOS DE GUÍAS EN EL SISTEMA:
- **360 - Entregado al cliente**: Guía completada exitosamente
- **302 - En ruta de última milla**: En proceso de entrega
- **301 - Asignado a ruta de última milla**: Preparándose para entrega
- **PAGADO**: Conductor ya realizó el pago correspondiente

## FUNCIONALIDADES PARA CONDUCTORES:
1. **Pagos Pendientes**: Ver guías en estado 301/302 que requieren pago
2. **Proceso de Pago**: Subir comprobantes con extracción OCR automática
3. **Seguimiento**: Monitorear estado de pagos y guías
4. **Gestión**: Administrar múltiples guías por pago

## PROCESO DE PAGO DETALLADO:
**PASO 1 - VISUALIZAR:**
- Acceder a "Pagos Pendientes"
- Ver solo guías en estados 301/302 (pendientes de pago)
- Información: Tracking, Cliente, Valor, Estado actual

**PASO 2 - SELECCIONAR:**
- Marcar checkbox de guías a incluir en el pago
- Sistema calcula total automáticamente
- Puede agrupar varias guías en un solo pago

**PASO 3 - COMPROBANTE:**
- Subir imagen clara del comprobante (JPG/PNG/PDF, máx 5MB)
- OCR extrae: valor, fecha, hora, entidad bancaria, referencia
- Verificar y corregir datos si es necesario

**PASO 4 - VALIDACIÓN:**
- Sistema verifica referencia única (no duplicada)
- Confirma que el monto cubre las guías seleccionadas
- Valida formato de fecha y datos bancarios

**PASO 5 - CONFIRMACIÓN:**
- Guías cambian a estado "PAGADO"
- Se genera registro en sistema de pagos
- Conductor puede continuar con más pagos

## ERRORES COMUNES Y SOLUCIONES:
- **ERR_002**: Referencia duplicada → Usar comprobante diferente
- **ERR_004**: Monto insuficiente → Verificar valor del comprobante
- **ERR_005**: OCR no disponible → Llenar datos manualmente
- **Timeout**: Servidor ocupado → Esperar 2-3 minutos

## CONSEJOS PRÁCTICOS:
- Agrupar guías del mismo cliente para reducir comisiones
- Fotos nítidas y bien iluminadas mejoran precisión del OCR
- Siempre verificar datos extraídos automáticamente
- Guardar capturas de pantalla como respaldo

REGLAS DE COMUNICACIÓN:
✅ Usar solo información real de las guías del usuario
✅ Mencionar trackings específicos cuando sea relevante
✅ Dar pasos concretos y prácticos
✅ Referir a soporte para casos complejos
✅ Ser empático y profesional
❌ No inventar información inexistente
❌ No acceder a datos de otros usuarios
❌ No especular sobre estados sin confirmar

Responde de manera específica, útil y basada en los datos reales del usuario:
"""
    return prompt

def generar_respuesta_fallback(pregunta: str, guias: List[GuiaInfo], estadisticas: Dict[str, Any]) -> str:
    """
    Genera respuestas básicas cuando OpenAI no está disponible
    """
    pregunta_lower = pregunta.lower()
    
    if "hola" in pregunta_lower or "buenos" in pregunta_lower:
        return f"¡Hola! Soy XBot, tu asistente de XCargo. Tienes {estadisticas.get('total_guias', 0)} guías asignadas y ${estadisticas.get('total_pendiente', 0):,} pendientes de pago. ¿En qué puedo ayudarte?"
    
    elif "cuánto debo" in pregunta_lower or "total" in pregunta_lower:
        return f"Actualmente tienes ${estadisticas.get('total_pendiente', 0):,} pendientes de pago en {len([g for g in guias if g.estado == 'pendiente'])} guías."
    
    elif "comprobante" in pregunta_lower or "subir" in pregunta_lower:
        return """Para subir un comprobante:
1. Ve a 'Pagos Pendientes'
2. Selecciona las guías a pagar
3. Haz clic en 'Procesar Pago'
4. Sube la imagen del comprobante (JPG, PNG o PDF)
5. Verifica los datos extraídos automáticamente
6. Confirma el registro del pago"""
    
    elif "seleccionar" in pregunta_lower or "varias guías" in pregunta_lower:
        return """Para seleccionar varias guías:
1. En la tabla de Pagos Pendientes, marca los checkbox de las guías que quieres pagar
2. Puedes usar 'Seleccionar todo' para marcar todas las guías de la página
3. El total se actualiza automáticamente
4. Haz clic en 'Procesar Pago' cuando tengas todas seleccionadas"""
    
    elif "rechazada" in pregunta_lower or "rechazado" in pregunta_lower:
        rechazadas = estadisticas.get('guias_rechazadas', 0)
        if rechazadas > 0:
            return f"Tienes {rechazadas} guías rechazadas. Revisa la columna 'Novedad' en la tabla para ver el motivo del rechazo y corrige el problema antes de intentar nuevamente."
        else:
            return "No tienes guías rechazadas actualmente."
    
    elif "contacto" in pregunta_lower or "soporte" in pregunta_lower:
        return """📞 **Contacto XCargo:**
• Email: soporte@xcargo.co
• WhatsApp: +57 300 123 4567
• Horario: Lunes a Viernes 8AM-6PM
• Emergencias: 24/7"""
    
    else:
        if estadisticas.get('total_guias', 0) == 0:
            return (
                "Actualmente no tienes guías pendientes ni asignadas en el sistema.\n"
                "Si esperabas ver guías y no aparecen, contacta a soporte técnico."
            )
        else:
            return f"Entiendo tu consulta sobre '{pregunta}'. Actualmente tengo acceso limitado, pero puedo ayudarte con: consultar tus totales pendientes, proceso de subir comprobantes, selección de guías, y información de contacto. ¿Te interesa alguno de estos temas?"

def generar_respuesta_contextual(pregunta: str, guias: List[GuiaInfo], estadisticas: Dict[str, Any]) -> str:
    """
    Genera respuestas contextuales basadas en el estado real de las guías
    """
    pregunta_lower = pregunta.lower()
    
    if "cuánto debo" in pregunta_lower or "total" in pregunta_lower or "pendiente" in pregunta_lower:
        total = estadisticas.get("total_pendiente", 0)
        return f"Según tus guías actuales, tienes ${total:,} pendientes de pago. "
    
    elif "rechazada" in pregunta_lower or "rechazado" in pregunta_lower:
        rechazadas = estadisticas.get("guias_rechazadas", 0)
        if rechazadas > 0:
            return f"Tienes {rechazadas} guías rechazadas que requieren atención. "
        else:
            return "No tienes guías rechazadas actualmente. "
    
    elif "tracking" in pregunta_lower or "guías" in pregunta_lower:
        trackings = [g.tracking for g in guias[:5]]  # Primeros 5
        if trackings:
            return f"Algunos de tus trackings son: {', '.join(trackings)}. "
    
    elif "entregada" in pregunta_lower or "completada" in pregunta_lower:
        total_entregado = estadisticas.get("total_entregado", 0)
        return f"Has completado entregas por un valor de ${total_entregado:,}. "
    
    return ""

@router.post("/chat")
async def responder_pregunta(
    mensaje: Mensaje,
    bigquery_client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
):
    try:
        # Obtener información real del usuario desde el JWT
        rol = current_user.get("rol", "conductor")
        correo_usuario = current_user.get("correo") or current_user.get("sub") or mensaje.correo_usuario
        nombre_usuario = correo_usuario.split("@")[0].replace(".", " ").title()

        # Solo permitir que el usuario consulte sus propias guías si es conductor
        if rol == "conductor" and correo_usuario != mensaje.correo_usuario:
            raise HTTPException(status_code=403, detail="No autorizado para consultar información de otros usuarios")

        # Obtener guías reales del usuario según el rol
        if rol == "conductor":
            guias = obtener_guias_usuario_real(correo_usuario, bigquery_client)
            estadisticas = obtener_estadisticas_usuario(correo_usuario, bigquery_client)
        else:
            # Para otros roles, podrías implementar lógica adicional aquí
            guias = []
            estadisticas = {}

        print(f"🔍 Chat - Usuario: {correo_usuario} (rol: {rol})")
        print(f"📊 Guías encontradas: {len(guias)}")
        print(f"💰 Total pendiente: ${estadisticas.get('total_pendiente', 0):,}")

        # Obtener contexto de página
        contexto_pagina = mensaje.contexto_adicional.get("pagina_actual") if mensaje.contexto_adicional else None

        # Construir prompt del sistema con datos reales y rol
        prompt_sistema = construir_prompt_sistema(nombre_usuario, rol, guias, contexto_pagina)

        # Generar contexto adicional específico
        contexto_adicional = generar_respuesta_contextual(mensaje.pregunta, guias, estadisticas)

        # Preparar pregunta con contexto
        pregunta_con_contexto = contexto_adicional + mensaje.pregunta if contexto_adicional else mensaje.pregunta

        # Verificar si OpenAI está disponible
        if not os.getenv("OPENAI_API_KEY"):
            print("⚠️ OpenAI API Key no configurada, usando respuesta de fallback")
            respuesta_texto = generar_respuesta_fallback(mensaje.pregunta, guias, estadisticas)
        else:
            try:
                respuesta_llm = client.chat.completions.create(
                    model="gpt-4",
                    messages=[
                        {"role": "system", "content": prompt_sistema},
                        {"role": "user", "content": pregunta_con_contexto}
                    ],
                    temperature=0.7,
                    max_tokens=600,
                    presence_penalty=0.1,
                    frequency_penalty=0.1
                )
                respuesta_texto = respuesta_llm.choices[0].message.content
            except Exception as openai_error:
                print(f"⚠️ Error con OpenAI: {openai_error}")
                respuesta_texto = generar_respuesta_fallback(mensaje.pregunta, guias, estadisticas)

        # Agregar información de contacto si es necesario
        if "soporte" in mensaje.pregunta.lower() or "contacto" in mensaje.pregunta.lower():
            respuesta_texto += "\n\n📞 **Contacto XCargo:**\n• Email: soporte@xcargo.co\n• WhatsApp: +57 300 123 4567\n• Horario: Lunes a Viernes 8AM-6PM\n• Emergencias: 24/7"

        return {
            "respuesta": respuesta_texto,
            "contexto": estadisticas,
            "error": False
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error en asistente: {e}")
        import traceback
        traceback.print_exc()
        return {
            "respuesta": "Lo siento, experimenté un problema técnico. Por favor, intenta nuevamente o contacta a soporte técnico (soporte@xcargo.co).",
            "error": True
        }

@router.get("/estado-usuario/{correo}")
async def obtener_estado_usuario(
    correo: str,
    bigquery_client: bigquery.Client = Depends(get_bigquery_client)
):
    """
    Endpoint para obtener estado actual real del usuario
    """
    try:
        print(f"🔍 Obteniendo estado para: {correo}")
        
        guias = obtener_guias_usuario_real(correo, bigquery_client)
        estadisticas = obtener_estadisticas_usuario(correo, bigquery_client)
        
        print(f"📊 Estado calculado: {estadisticas}")
        
        return {
            "guias": [guia.dict() for guia in guias],
            "resumen": estadisticas
        }
        
    except Exception as e:
        print(f"❌ Error obteniendo estado usuario: {e}")
        import traceback
        traceback.print_exc()
        
        raise HTTPException(
            status_code=500, 
            detail=f"Error obteniendo estado del usuario: {str(e)}"
        )