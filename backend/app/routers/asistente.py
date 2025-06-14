from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel
from openai import OpenAI
from typing import Optional, List, Dict, Any
from google.cloud import bigquery
from datetime import datetime
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
    con información detallada y segura
    """
    try:
        # Query mejorado para obtener información más completa
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
            Status_Date,
            COALESCE(observacion, '') as observacion
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1`
        WHERE (
            LOWER(Empleado) LIKE LOWER(@correo_pattern)
            OR LOWER(Empleado) = LOWER(@correo_usuario)
            OR Empleado LIKE @nombre_pattern
        )
        AND Status_Big IS NOT NULL
        ORDER BY Status_Date DESC
        LIMIT 50
        """
        
        # Extraer nombre del email para búsqueda más amplia pero segura
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
            # Determinar estado simplificado de forma más precisa
            estado_simplificado = "pendiente"  # default
            status = str(row.Status_Big).upper() if row.Status_Big else ""
            
            if "360" in status or "ENTREGADO" in status:
                estado_simplificado = "entregado"
            elif "PAGADO" in status or "CONCILIADO" in status:
                estado_simplificado = "pagado"
            elif "RECHAZADO" in status or "CANCELADO" in status:
                estado_simplificado = "rechazado"
            elif any(x in status for x in ["302", "301", "EN RUTA"]):
                estado_simplificado = "en_ruta"
            
            # Procesar novedad/observación si existe
            novedad = str(row.observacion) if row.observacion else None
            if novedad and len(novedad) > 100:
                novedad = novedad[:97] + "..."
            
            guia = GuiaInfo(
                tracking=str(row.tracking_number),
                conductor=str(row.Empleado) if row.Empleado else "Sin asignar",
                empresa=str(row.Cliente) if row.Cliente else "Sin cliente",
                valor=int(row.Valor) if row.Valor else 0,
                estado=estado_simplificado,
                novedad=novedad,
                ciudad=str(row.Ciudad) if row.Ciudad else None,
                departamento=str(row.Departamento) if row.Departamento else None,
                carrier=str(row.Carrier) if row.Carrier else None,
                fecha_estado=str(row.Status_Date) if row.Status_Date else None
            )
            guias.append(guia)
        
        print(f"✅ Guías encontradas para {correo_usuario}: {len(guias)}")
        return guias
        
    except Exception as e:
        print(f"❌ Error obteniendo guías reales: {str(e)}")
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
    """
    Construye un prompt detallado con la información específica del usuario
    """
    # Preparar información de guías
    guias_pendientes = [g for g in guias if g.estado in ["pendiente", "en_ruta"]]
    guias_entregadas = [g for g in guias if g.estado == "entregado"]
    guias_rechazadas = [g for g in guias if g.estado == "rechazado"]
    
    total_pendiente = sum(g.valor for g in guias_pendientes)
    total_entregado = sum(g.valor for g in guias_entregadas)
    
    # Construir sección de guías activas
    guias_texto = ""
    if guias:
        guias_texto = "GUÍAS ACTUALES DEL USUARIO:\n"
        
        # Primero mostrar guías pendientes
        if guias_pendientes:
            guias_texto += "\n🔄 GUÍAS PENDIENTES:\n"
            for guia in guias_pendientes:
                guias_texto += (
                    f"• {guia.tracking} | {guia.empresa} | ${guia.valor:,}"
                    f"{f' | {guia.ciudad}' if guia.ciudad else ''}"
                    f"{f' | {guia.novedad}' if guia.novedad else ''}\n"
                )
        
        # Luego guías rechazadas
        if guias_rechazadas:
            guias_texto += "\n❌ GUÍAS RECHAZADAS:\n"
            for guia in guias_rechazadas:
                guias_texto += (
                    f"• {guia.tracking} | {guia.empresa} | ${guia.valor:,}"
                    f"{f' | Motivo: {guia.novedad}' if guia.novedad else ''}\n"
                )
        
        guias_texto += f"\n📊 RESUMEN FINANCIERO:\n"
        guias_texto += f"• Total pendiente: ${total_pendiente:,}\n"
        guias_texto += f"• Total entregado: ${total_entregado:,}\n"
        guias_texto += f"• Guías rechazadas: {len(guias_rechazadas)}\n"
    else:
        guias_texto = (
            "🔍 El usuario no tiene guías asignadas actualmente.\n"
            "Si esto parece incorrecto, sugerir contactar a soporte técnico."
        )

    # Agregar contexto de la página actual
    contexto_pagina_texto = f"\nCONTEXTO ACTUAL: Usuario en '{contexto_pagina}'" if contexto_pagina else ""

    return f"""Eres XBot, el asistente virtual especializado de XCargo. Atiendes a {nombre_usuario} (rol: {rol}).

{guias_texto}
{contexto_pagina_texto}

INSTRUCCIONES ESPECÍFICAS:
1. SEGURIDAD DE DATOS:
   - Solo proporciona información de las guías listadas arriba
   - No inventes datos ni trackings
   - No reveles información sensible de otros usuarios

2. FORMATO DE RESPUESTAS:
   - Usa valores monetarios con formato: $1,234,567
   - Incluye trackings completos cuando sea relevante
   - Proporciona contexto temporal cuando sea necesario

3. PRIORIDADES:
   - Enfócate primero en guías pendientes y rechazadas
   - Sugiere acciones específicas para resolver problemas
   - Ofrece ayuda para gestionar pagos pendientes

4. CASOS ESPECIALES:
   - Si hay guías rechazadas, prioriza explicar motivos y soluciones
   - Si el valor pendiente es alto, sugiere agrupar pagos
   - Si no hay guías, ofrece información general del sistema

EJEMPLOS DE RESPUESTAS:

Para "¿Cuánto debo?":
"Según tus guías actuales, tienes $X pendientes de pago en Y guías. ¿Te gustaría procesar algún pago ahora?"

Para "Mis guías rechazadas":
"Tienes X guías rechazadas. La más reciente es [tracking] por [motivo]. ¿Necesitas ayuda para resolverlo?"

Para "Estado de un tracking":
"La guía [tracking] está [estado] por $[valor]. [Detalles adicionales si existen]"""


def generar_respuesta_contextual(pregunta: str, guias: List[GuiaInfo], estadisticas: Dict[str, Any]) -> str:
    """
    Genera respuestas contextuales precisas basadas en los datos reales del usuario
    """
    pregunta_lower = pregunta.lower()
    respuesta = ""
    
    # Buscar trackings específicos mencionados
    trackings_mencionados = None
    for guia in guias:
        if guia.tracking.lower() in pregunta_lower:
            trackings_mencionados = guia
            break
    
    # Responder sobre tracking específico
    if trackings_mencionados:
        estado_emoji = "⏳" if trackings_mencionados.estado == "pendiente" else "✅"
        respuesta = f"Sobre la guía {trackings_mencionados.tracking}: {estado_emoji}\n"
        respuesta += f"• Estado: {trackings_mencionados.estado}\n"
        respuesta += f"• Valor: ${trackings_mencionados.valor:,}\n"
        if trackings_mencionados.ciudad:
            respuesta += f"• Ubicación: {trackings_mencionados.ciudad}, {trackings_mencionados.departamento}\n"
        if trackings_mencionados.novedad:
            respuesta += f"• Novedad: {trackings_mencionados.novedad}\n"
        return respuesta
    
    # Consultas sobre valores pendientes
    if any(x in pregunta_lower for x in ["cuánto debo", "valor pendiente", "total pendiente"]):
        pendientes = [g for g in guias if g.estado == "pendiente"]
        if pendientes:
            total = sum(g.valor for g in pendientes)
            respuesta = f"Tienes ${total:,} pendientes de pago en {len(pendientes)} guías. "
            if len(pendientes) > 1:
                respuesta += "Puedes agruparlas para hacer un solo pago. "
        else:
            respuesta = "¡Buenas noticias! No tienes pagos pendientes en este momento. "
    
    # Consultas sobre guías rechazadas
    elif any(x in pregunta_lower for x in ["rechazada", "rechazado", "rechazo"]):
        rechazadas = [g for g in guias if g.estado == "rechazado"]
        if rechazadas:
            respuesta = f"Tienes {len(rechazadas)} guías rechazadas:\n"
            for g in rechazadas[:3]:  # Mostrar máximo 3 ejemplos
                respuesta += f"• {g.tracking}: {g.novedad if g.novedad else 'Sin motivo especificado'}\n"
            if len(rechazadas) > 3:
                respuesta += f"...y {len(rechazadas) - 3} más. "
        else:
            respuesta = "No tienes guías rechazadas en este momento. "
    
    # Consultas sobre guías entregadas
    elif "entregada" in pregunta_lower or "completada" in pregunta_lower:
        entregadas = [g for g in guias if g.estado == "entregado"]
        if entregadas:
            total = sum(g.valor for g in entregadas)
            respuesta = f"Has completado entregas por ${total:,} en {len(entregadas)} guías. "
        else:
            respuesta = "Aún no tienes guías marcadas como entregadas. "
    
    # Consultas sobre todas las guías
    elif "mis guías" in pregunta_lower or "guías asignadas" in pregunta_lower:
        if guias:
            estados = {}
            for g in guias:
                estados[g.estado] = estados.get(g.estado, 0) + 1
            
            respuesta = f"Tienes {len(guias)} guías en total:\n"
            for estado, cantidad in estados.items():
                emoji = "⏳" if estado == "pendiente" else "✅" if estado == "entregado" else "❌" if estado == "rechazado" else "📦"
                respuesta += f"• {emoji} {cantidad} {estado}\n"
        else:
            respuesta = "No tienes guías asignadas en este momento. "
    
    return respuesta

@router.get("/estado-usuario/{correo}")
async def obtener_estado_usuario(
    correo: str,
    bigquery_client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
):
    """
    Endpoint para obtener estado actual real del usuario
    """
    try:
        # Validación más robusta de los datos del usuario
        user_correo = current_user.get("correo")
        user_rol = current_user.get("rol")
        
        if not user_correo or not user_rol:
            raise HTTPException(
                status_code=401,
                detail="Token inválido: falta información del usuario"
            )
        
        # Normalizar correos para comparación
        correo = correo.lower().strip()
        user_correo = user_correo.lower().strip()
        
        # Verificar autorización
        is_admin = user_rol.lower() == "admin"
        is_own_data = user_correo == correo
        
        if not (is_admin or is_own_data):
            raise HTTPException(
                status_code=403,
                detail=f"No autorizado para acceder a esta información. Solo puedes ver tus propios datos."
            )
            
        print(f"🔍 Usuario {user_correo} ({user_rol}) accediendo a datos de: {correo}")
        
        # Obtener guías y estadísticas
        guias = obtener_guias_usuario_real(correo, bigquery_client)
        estadisticas = obtener_estadisticas_usuario(correo, bigquery_client)
        
        print(f"📊 Estado calculado para {correo}: {estadisticas}")
        
        return {
            "guias": [guia.dict() for guia in guias],
            "resumen": estadisticas,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException as he:
        print(f"⚠️ Error de autorización: {he.detail}")
        raise he
    except Exception as e:
        print(f"❌ Error obteniendo estado usuario: {e}")
        import traceback
        traceback.print_exc()
        
        raise HTTPException(
            status_code=500, 
            detail=f"Error obteniendo estado del usuario: {str(e)}"
        )

@router.post("/chat")
async def procesar_chat(
    mensaje: Mensaje,
    bigquery_client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
):
    """
    Endpoint para procesar mensajes del chat
    """
    try:
        # Validar autorización
        user_correo = current_user.get("correo", "").lower().strip()
        mensaje_correo = mensaje.correo_usuario.lower().strip()
        
        if not user_correo:
            raise HTTPException(
                status_code=401,
                detail="Token inválido: falta información del usuario"
            )
        
        if user_correo != mensaje_correo and current_user.get("rol") != "admin":
            raise HTTPException(
                status_code=403,
                detail="No autorizado para acceder a esta información"
            )
        
        # Obtener datos actuales del usuario
        guias = obtener_guias_usuario_real(mensaje_correo, bigquery_client)
        estadisticas = obtener_estadisticas_usuario(mensaje_correo, bigquery_client)
        
        # Construir el prompt del sistema con el contexto actual
        prompt_sistema = construir_prompt_sistema(
            nombre_usuario=mensaje_correo.split("@")[0],
            rol=current_user.get("rol", "usuario"),
            guias=guias,
            contexto_pagina=mensaje.contexto_adicional.get("pagina_actual") if mensaje.contexto_adicional else None
        )
        
        # Enviar mensaje a OpenAI con el contexto
        completion = client.chat.completions.create(
            model="gpt-4-0125-preview",  # Usar el modelo más reciente
            messages=[
                {"role": "system", "content": prompt_sistema},
                {"role": "user", "content": mensaje.pregunta}
            ],
            temperature=0.7,
            max_tokens=800
        )
        
        # Obtener y validar la respuesta
        respuesta = completion.choices[0].message.content
        if not respuesta:
            raise ValueError("OpenAI devolvió una respuesta vacía")
            
        print(f"✅ Respuesta generada para {mensaje_correo}")
        
        # Devolver respuesta con contexto actualizado
        return {
            "respuesta": respuesta,
            "error": False,
            "contexto": estadisticas
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"❌ Error procesando mensaje: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return {
            "respuesta": "Lo siento, tuve un problema procesando tu mensaje. Por favor, intenta de nuevo.",
            "error": True,
            "detalle": str(e)
        }