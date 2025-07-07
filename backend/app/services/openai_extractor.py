import os
import json
import io
import re
import traceback
import logging
from typing import Dict, Any, Optional, List, Tuple
from dotenv import load_dotenv
from openai import OpenAI
from fastapi import UploadFile
from PIL import Image, ImageEnhance, ImageFilter
import cv2
import numpy as np
import pytesseract
import easyocr
from datetime import datetime

# Importar el validador IA
try:
    from app.services.ai.ai_ocr_validator import validar_comprobante_ia
except ImportError:
    def validar_comprobante_ia(datos, metadata=None):
        """Fallback cuando AI validator no está disponible"""
        return type('MockResult', (), {
            'score_confianza': 75,
            'estado': type('MockStatus', (), {'value': 'REQUIERE_REVISION'})(),
            'accion_recomendada': type('MockAction', (), {'value': 'REVISION_MANUAL'})(),
            'errores_detectados': [],
            'alertas': [],
            'sugerencias_correccion': [],
            'datos_corregidos': None,
            'validaciones': {}
        })()
# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Cargar variables de entorno
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Inicializar OCR engines
reader = easyocr.Reader(['es'], gpu=False)

class EnhancedOCRExtractor:
    """
    🎯 Extractor OCR mejorado con múltiples engines y validación IA
    """
    
    def __init__(self):
        """Inicializar el extractor con configuración por defecto"""
        self.engines_disponibles = ["openai", "easyocr", "tesseract"]
        self.umbrales_calidad = {
            "resolucion_minima": 300,  # pixels
            "tamaño_archivo_minimo": 10000,  # bytes
            "contraste_minimo": 0.3
        }
        logger.info("🤖 EnhancedOCRExtractor inicializado")
    
    async def extraer_datos_pago_inteligente(
        self, 
        file: UploadFile,
        usar_validacion_ia: bool = True,
        engines_preferidos: List[str] = None
    ) -> Dict[str, Any]:
        """
        🎯 FUNCIÓN PRINCIPAL: Extracción inteligente con múltiples engines
        
        Args:
            file: Archivo de imagen subido
            usar_validacion_ia: Si aplicar validación IA automática
            engines_preferidos: Lista de engines a usar en orden de preferencia
            
        Returns:
            Dict con datos extraídos, validación IA y metadata completa
        """
        inicio_proceso = datetime.now()
        resultado_validacion = None
        contents = None

        try:
            # 1. Preparar imagen
            contents = await file.read()
            imagen_metadata = await self._analizar_calidad_imagen(contents, file)
            
            # 2. Preprocesar imagen si es necesario
            imagen_mejorada = self._mejorar_imagen_si_necesario(contents, imagen_metadata)
            
            # 3. Extracción con múltiples engines
            engines_a_usar = engines_preferidos or ["openai", "easyocr"]
            resultados_engines = await self._extraer_con_multiples_engines(
                imagen_mejorada, 
                engines_a_usar, 
                imagen_metadata
            )
            
            # 4. Fusionar y validar resultados
            datos_fusionados = self._fusionar_resultados_engines(resultados_engines)
            datos_finales = self._validar_datos_sin_errores(datos_fusionados)
            
            # 5. Validación IA si está habilitada
            if usar_validacion_ia:
                try:
                    resultado_validacion = validar_comprobante_ia(datos_finales)
                except Exception as e:
                    logger.error(f"Error en validación IA: {str(e)}")
                    resultado_validacion = None
            
            # 6. Preparar respuesta
            tiempo_total = (datetime.now() - inicio_proceso).total_seconds()
            
            respuesta_final = {
                "datos_extraidos": datos_finales,
                "resultados_engines": {
                    engine: resultado["datos"] 
                    for engine, resultado in resultados_engines.items()
                } if resultados_engines else {},
                "validacion_ia": self._formatear_validacion_ia(resultado_validacion) if resultado_validacion else None,
                "imagen_metadata": imagen_metadata,
                "imagen_mejorada": imagen_mejorada != contents,
                "estadisticas": {
                    "tiempo_total": tiempo_total,
                    "engines_utilizados": list(resultados_engines.keys()) if resultados_engines else [],
                    "engine_ganador": self._determinar_engine_ganador(resultados_engines),
                    "calidad_imagen": imagen_metadata.get("calidad_score", 0),
                },
                "texto_detectado": resultados_engines.get("easyocr", {}).get("texto_completo", ""),
                "timestamp": inicio_proceso.isoformat()
            }
            
            logger.info(f"✅ Extracción completada - Tiempo: {tiempo_total:.2f}s, "
                       f"Engine ganador: {respuesta_final['estadisticas']['engine_ganador']}")
            
            return respuesta_final
            
        except Exception as e:
            logger.error(f"❌ Error en extracción inteligente: {str(e)}")
            logger.error(traceback.format_exc())
            
            # Intentar extraer datos de emergencia
            fallback_data = None
            if contents:
                try:
                    fallback_data = await self._extraer_fallback(file)
                except Exception as fallback_error:
                    logger.error(f"Error en extracción fallback: {str(fallback_error)}")
            
            return {
                "error": True,
                "mensaje": "Error en extracción OCR",
                "detalle": str(e),
                "timestamp": datetime.now().isoformat(),
                "fallback_data": fallback_data
            }
    
    async def _analizar_calidad_imagen(self, contents: bytes, file: UploadFile) -> Dict[str, Any]:
        """Analiza la calidad de la imagen para optimizar el OCR"""
        try:
            # Información básica del archivo
            image = Image.open(io.BytesIO(contents))
            width, height = image.size
            
            # Convertir a numpy para análisis avanzado
            image_cv = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
            
            # Calcular métricas de calidad
            calidad_score = 100
            problemas = []
            
            # 1. Resolución
            pixels_total = width * height
            if pixels_total < 100000:  # Menos de 100K pixels
                calidad_score -= 30
                problemas.append("Resolución muy baja")
            elif pixels_total < 500000:  # Menos de 500K pixels
                calidad_score -= 15
                problemas.append("Resolución baja")
            
            # 2. Tamaño de archivo (indica compresión)
            file_size = len(contents)
            if file_size < 50000:  # Menos de 50KB
                calidad_score -= 20
                problemas.append("Imagen muy comprimida")
            
            # 3. Análisis de contraste y claridad
            if image_cv is not None:
                gray = cv2.cvtColor(image_cv, cv2.COLOR_BGR2GRAY)
                
                # Contraste (desviación estándar)
                contraste = np.std(gray)
                if contraste < 30:
                    calidad_score -= 25
                    problemas.append("Contraste muy bajo")
                elif contraste < 50:
                    calidad_score -= 10
                    problemas.append("Contraste bajo")
                
                # Claridad (varianza del Laplaciano)
                claridad = cv2.Laplacian(gray, cv2.CV_64F).var()
                if claridad < 100:
                    calidad_score -= 25
                    problemas.append("Imagen borrosa")
                elif claridad < 200:
                    calidad_score -= 10
                    problemas.append("Imagen algo borrosa")
            
            # 4. Formato de archivo
            formato = image.format.lower() if image.format else "unknown"
            if formato == "jpeg" and file_size < 100000:
                calidad_score -= 10
                problemas.append("JPEG muy comprimido")
            
            calidad_score = max(0, calidad_score)
            
            return {
                "width": width,
                "height": height,
                "file_size": file_size,
                "format": formato,
                "calidad_score": calidad_score,
                "problemas_calidad": problemas,
                "contraste": contraste if 'contraste' in locals() else None,
                "claridad": claridad if 'claridad' in locals() else None,
                "necesita_mejora": calidad_score < 70
            }
            
        except Exception as e:
            logger.error(f"Error analizando calidad de imagen: {e}")
            return {
                "width": 0,
                "height": 0,
                "file_size": len(contents),
                "format": "unknown",
                "calidad_score": 50,
                "problemas_calidad": ["Error analizando imagen"],
                "necesita_mejora": True
            }
    
    def _mejorar_imagen_si_necesario(self, contents: bytes, metadata: Dict[str, Any]) -> bytes:
        """Mejora la imagen si la calidad es baja"""
        if not metadata.get("necesita_mejora", False):
            return contents
        
        try:
            logger.info("🔧 Mejorando calidad de imagen...")
            
            image = Image.open(io.BytesIO(contents))
            
            # Convertir a escala de grises si ayuda
            if image.mode != 'L':
                image = image.convert('L')
            
            # Mejorar contraste
            enhancer = ImageEnhance.Contrast(image)
            image = enhancer.enhance(1.5)
            
            # Mejorar nitidez
            enhancer = ImageEnhance.Sharpness(image)
            image = enhancer.enhance(1.3)
            
            # Aplicar filtro de desenfoque para reducir ruido
            image = image.filter(ImageFilter.MedianFilter(size=3))
            
            # Guardar imagen mejorada
            output = io.BytesIO()
            image.save(output, format='PNG', optimize=True)
            output.seek(0)
            
            logger.info("✅ Imagen mejorada exitosamente")
            return output.read()
            
        except Exception as e:
            logger.error(f"Error mejorando imagen: {e}")
            return contents
    
    async def _extraer_con_multiples_engines(
        self, 
        contents: bytes, 
        engines: List[str],
        metadata: Dict[str, Any]
    ) -> Dict[str, Dict[str, Any]]:
        """Extrae datos usando múltiples engines de OCR"""
        resultados = {}
        
        for engine in engines:
            try:
                logger.info(f"🔍 Ejecutando OCR con {engine}...")
                
                if engine == "openai":
                    resultado = await self._extraer_con_openai(contents)
                elif engine == "easyocr":
                    resultado = await self._extraer_con_easyocr(contents)
                elif engine == "tesseract":
                    resultado = await self._extraer_con_tesseract(contents)
                else:
                    logger.warning(f"Engine desconocido: {engine}")
                    continue
                
                resultados[engine] = resultado
                logger.info(f"✅ {engine} completado")
                
            except Exception as e:
                logger.error(f"❌ Error con {engine}: {e}")
                resultados[engine] = {
                    "error": str(e),
                    "datos": {},
                    "confianza": 0
                }
        
        return resultados
    
    async def _extraer_con_openai(self, contents: bytes) -> Dict[str, Any]:
        """Extracción usando OpenAI Vision API"""
        try:
            # Convertir imagen a base64
            import base64
            image_base64 = base64.b64encode(contents).decode('utf-8')
            
            # Prompt mejorado para OpenAI
            prompt = """
                    Eres un experto en análisis y extracción de datos de comprobantes de pago colombianos. 
                    Tu tarea es analizar cuidadosamente la imagen y extraer SOLO los datos financieros más relevantes, 
                    siguiendo estrictamente las reglas de validación que se describen a continuación.

                    Extrae EXCLUSIVAMENTE los siguientes campos en formato JSON:

                    {
                    "valor": "solo números, sin símbolos ni comas (ej: 586600, 156000)",
                    "fecha": "formato YYYY-MM-DD si encuentras fecha",
                    "hora": "formato HH:MM:SS en notación 24h si encuentras hora (convierte de a. m. / p. m. si es necesario)",
                    "entidad": "nombre exacto de la entidad emisora del comprobante (ej: Nequi, Bancolombia, Daviplata, etc.)",
                    "referencia": "número de referencia/autorización/recibo más relevante y completo",
                    "estado": "estado de la transacción si está visible; si no se encuentra, usar null",
                    "descripcion": "concepto o tipo de movimiento si está presente (por ejemplo: DEPOSITO, TRANSFERENCIA, PAGO, RECARGA, etc.)",
                    "tipo_comprobante": "nequi, transferencia o consignacion — según las reglas a continuación"
                    }

                    REGLAS PARA tipo_comprobante:
                    - Solo acepta estos valores exactos: "nequi", "transferencia", "consignacion".
                    - Si el comprobante es de la app Nequi (por diseño, logo, colores rosados, QR, o menciones explícitas), entonces tipo_comprobante = "nequi".
                    - Si aparece la palabra "Redeban" o términos como "consignación", "depósito", "recibo", "corresponsal", "taquilla", o parece un recibo físico en papel térmico, entonces tipo_comprobante = "consignacion".
                    - Si es una transferencia digital (por app bancaria como Bancolombia, Daviplata, entre cuentas o PSE) y no aplica lo anterior, entonces tipo_comprobante = "transferencia".
                    - No adivines. Aplica las reglas exactamente como están.

                    REGLAS PARA CAMPO "referencia":
                    - Usa campos explícitos como "No. de comprobante", "RRN", "REFERENCIA", "AUTORIZACIÓN", "APRO", etc.
                    - Si hay varios, elige el más largo o más relevante.
                    - Si no existe ninguno, usa null.

                    REGLAS ADICIONALES:
                    - Si no encuentras un campo, usa null (sin comillas).
                    - El JSON debe estar completo, limpio y sintácticamente válido.
                    - No incluyas texto adicional, solo el JSON.
                    - Corrige automáticamente formatos como "$ 156.000" → "156000"
                    - Convierte fechas y horas a los formatos requeridos.
                    """



            response = client.chat.completions.create(
                model="gpt-4o",  # Usar GPT-4 con visión
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_base64}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=500,
                temperature=0.1  # Baja temperatura para mayor precisión
            )
            
            respuesta = response.choices[0].message.content.strip()
            
            # Limpiar respuesta (remover markdown si existe)
            if respuesta.startswith("```"):
                respuesta = respuesta.split("```")[1]
                if respuesta.startswith("json"):
                    respuesta = respuesta[4:]
            
            datos = json.loads(respuesta)
            
            return {
                "datos": datos,
                "confianza": 90,  # OpenAI tiende a ser muy preciso
                "texto_completo": respuesta,
                "engine": "openai"
            }
            
        except json.JSONDecodeError as e:
            logger.error(f"OpenAI retornó JSON inválido: {respuesta}")
            return {
                "error": f"JSON inválido: {str(e)}",
                "datos": {},
                "confianza": 0,
                "respuesta_cruda": respuesta if 'respuesta' in locals() else ""
            }
        except Exception as e:
            logger.error(f"Error con OpenAI: {e}")
            return {
                "error": str(e),
                "datos": {},
                "confianza": 0
            }
    
    async def _extraer_con_easyocr(self, contents: bytes) -> Dict[str, Any]:
        """Extracción usando EasyOCR"""
        try:
            # EasyOCR con configuración optimizada
            resultados = reader.readtext(contents, detail=0, paragraph=True)
            texto_completo = "\n".join(resultados)
            
            # Extraer datos usando regex y patrones
            datos_extraidos = self._extraer_datos_con_patrones(texto_completo)
            
            return {
                "datos": datos_extraidos,
                "confianza": 75,  # EasyOCR es bastante confiable
                "texto_completo": texto_completo,
                "engine": "easyocr"
            }
            
        except Exception as e:
            logger.error(f"Error con EasyOCR: {e}")
            return {
                "error": str(e),
                "datos": {},
                "confianza": 0
            }
    
    async def _extraer_con_tesseract(self, contents: bytes) -> Dict[str, Any]:
        """Extracción usando Tesseract (backup)"""
        try:
            # Convertir a imagen PIL
            image = Image.open(io.BytesIO(contents))
            
            # Tesseract con configuración para español
            config = '--oem 3 --psm 6 -l spa'
            texto_completo = pytesseract.image_to_string(image, config=config)
            
            # Extraer datos usando patrones
            datos_extraidos = self._extraer_datos_con_patrones(texto_completo)
            
            return {
                "datos": datos_extraidos,
                "confianza": 60,  # Tesseract es menos confiable
                "texto_completo": texto_completo,
                "engine": "tesseract"
            }
            
        except Exception as e:
            logger.error(f"Error con Tesseract: {e}")
            return {
                "error": str(e),
                "datos": {},
                "confianza": 0
            }
    
    def _extraer_datos_con_patrones(self, texto: str) -> Dict[str, Any]:
        """Extrae datos usando regex y patrones de texto"""
        datos = {}
        texto_lower = texto.lower()
        
        # Patrones para extraer valor
        patrones_valor = [
            r'\$\s*([0-9,.]+)',  # $150,000
            r'valor.*?([0-9,.]+)',  # valor: 150,000
            r'total.*?([0-9,.]+)',  # total: 150,000
            r'monto.*?([0-9,.]+)',  # monto: 150,000
            r'([0-9]{1,3}(?:,?[0-9]{3})*(?:\.[0-9]{2})?)'  # números con formato
        ]
        
        for patron in patrones_valor:
            match = re.search(patron, texto, re.IGNORECASE)
            if match:
                valor = match.group(1).replace(',', '').replace('.', '')
                if valor.isdigit() and int(valor) > 1000:  # Valor razonable
                    datos["valor"] = valor
                    break
        
        # Patrones para fecha
        patrones_fecha = [
            r'(\d{1,2}[/-]\d{1,2}[/-]\d{4})',  # DD/MM/YYYY o DD-MM-YYYY
            r'(\d{4}[/-]\d{1,2}[/-]\d{1,2})',  # YYYY-MM-DD
        ]
        
        for patron in patrones_fecha:
            match = re.search(patron, texto)
            if match:
                fecha = match.group(1)
                # Convertir a formato estándar si es necesario
                if '/' in fecha:
                    partes = fecha.split('/')
                    if len(partes[2]) == 4:  # DD/MM/YYYY
                        datos["fecha"] = f"{partes[2]}-{partes[1].zfill(2)}-{partes[0].zfill(2)}"
                    else:  # YYYY/MM/DD
                        datos["fecha"] = fecha.replace('/', '-')
                else:
                    datos["fecha"] = fecha
                break
        
        # Patrones para hora
        patron_hora = r'(\d{1,2}:\d{2}(?::\d{2})?)'
        match = re.search(patron_hora, texto)
        if match:
            hora = match.group(1)
            if len(hora.split(':')) == 2:  # HH:MM
                hora += ":00"  # Agregar segundos
            datos["hora"] = hora
        
        # Detectar entidad bancaria
        entidades = {
            "nequi": ["nequi"],
            "bancolombia": ["bancolombia", "banco colombia"],
            "pse": ["pse", "pagos seguros"],
            "daviplata": ["daviplata", "davivienda"],
            "banco_bogota": ["banco de bogota", "banco bogota"],
            "bbva": ["bbva"],
            "efecty": ["efecty"]
        }
        
        for entidad, variaciones in entidades.items():
            for variacion in variaciones:
                if variacion in texto_lower:
                    datos["entidad"] = entidad
                    break
            if "entidad" in datos:
                break
        
        # Patrones para referencia
        patrones_referencia = [
            r'referencia.*?([A-Z0-9]{6,})',
            r'autorizaci[oó]n.*?([A-Z0-9]{6,})',
            r'c[oó]digo.*?([A-Z0-9]{6,})',
            r'([A-Z0-9]{8,15})'  # Secuencia alfanumérica larga
        ]
        
        for patron in patrones_referencia:
            match = re.search(patron, texto, re.IGNORECASE)
            if match:
                ref = match.group(1)
                # Verificar que no sea el valor
                if ref != datos.get("valor"):
                    datos["referencia"] = ref
                    break
        
        return datos
    
    def _fusionar_resultados_engines(self, resultados: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        """Fusiona resultados de múltiples engines eligiendo los mejores campos y validando"""
        datos_fusionados = {}
        
        # Ordenar engines por confianza
        engines_ordenados = sorted(
            resultados.items(),
            key=lambda x: x[1].get("confianza", 0),
            reverse=True
        )
        
        # Campos importantes con sus pesos
        campos = ["valor", "fecha", "hora", "entidad", "referencia"]
        
        # Tomar el mejor valor para cada campo
        for campo in campos:
            for engine, resultado in engines_ordenados:
                datos = resultado.get("datos", {})
                if campo in datos and datos[campo]:
                    datos_fusionados[campo] = datos[campo]
                    break
          # Validar todos los datos extraídos
        datos_validados = self._validar_datos_sin_errores(datos_fusionados)
        
        # Registrar diferencias de normalización
        campos_normalizados = [
            campo for campo in campos 
            if campo in datos_fusionados 
            and campo in datos_validados 
            and datos_fusionados[campo] != datos_validados[campo]
        ]

        # Detectar campos inválidos
        campos_invalidos = [
            campo for campo in campos
            if campo in datos_fusionados and not self._es_valor_razonable(campo, datos_fusionados[campo])
        ]
        
        if campos_normalizados:
            logger.info("ℹ️ Campos normalizados:")
            for campo in campos_normalizados:
                logger.info(f"  - {campo}: {datos_fusionados[campo]} → {datos_validados[campo]}")
        
        if campos_invalidos:
            logger.warning(f"❌ Campos inválidos encontrados: {campos_invalidos}")
        
        return datos_validados
    
    def _es_valor_razonable(self, campo: str, valor: Any) -> bool:
        """Valida que un valor extraído sea razonable"""
        if not valor:
            return False
        
        valor_str = str(valor).strip()
        
        if campo == "valor":
            # Verificar que sea numérico y en rango razonable
            valor_limpio = valor_str.replace(',', '').replace('.', '')
            if not valor_limpio.isdigit():
                return False
            valor_num = int(valor_limpio)
            return 1000 <= valor_num <= 500000000  # Entre $1K y $500M
        
        elif campo == "fecha":
            # Verificar formato de fecha básico
            return bool(re.match(r'\d{4}-\d{1,2}-\d{1,2}', valor_str))
        
        elif campo == "hora":
            # Verificar formato de hora básico
            return bool(re.match(r'\d{1,2}:\d{2}(:\d{2})?', valor_str))
        
        elif campo == "referencia":
            # Verificar longitud mínima
            return len(valor_str) >= 4
        
        return True
    
    def _determinar_engine_ganador(self, resultados: Dict[str, Dict[str, Any]]) -> str:
        """Determina qué engine tuvo el mejor resultado"""
        mejor_engine = "ninguno"
        mejor_score = 0
        
        for engine, resultado in resultados.items():
            if "error" in resultado:
                continue
            
            # Calcular score basado en confianza y campos extraídos
            confianza = resultado.get("confianza", 0)
            datos = resultado.get("datos", {})
            campos_extraidos = len([v for v in datos.values() if v and v != "null"])
            
            score = confianza + (campos_extraidos * 5)
            
            if score > mejor_score:
                mejor_score = score
                mejor_engine = engine
        
        return mejor_engine
    
    def _requiere_mejora_imagen(self, metadata: Dict[str, Any]) -> bool:
        """Determina si la imagen requiere mejoras para futuras extracciones"""
        calidad = metadata.get("calidad_score", 100)
        return calidad < 70
    
    def _validar_datos_sin_errores(self, datos: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validación más flexible de los datos extraídos
        """
        datos_validados = datos.copy()
        mensajes_info = []

        # Validar hora
        if 'hora' in datos and datos['hora']:
            hora = datos['hora'].strip()
            if re.match(r'\d{1,2}:\d{2}(:\d{2})?', hora):
                if ':' in hora and len(hora.split(':')) == 2:
                    hora = f"{hora}:00"
                datos_validados['hora'] = hora
                if hora != datos['hora']:
                    mensajes_info.append(f"🕒 Hora normalizada: {datos['hora']} → {hora}")

        # Validar referencia
        if 'referencia' in datos and datos['referencia']:
            ref = str(datos['referencia']).strip().upper()
            if re.match(r'[A-Z0-9]{5,}', ref):
                datos_validados['referencia'] = ref
                if ref != datos['referencia']:
                    mensajes_info.append(f"📝 Referencia normalizada: {datos['referencia']} → {ref}")

        # Registrar mensajes informativos
        if mensajes_info:
            logger.info("ℹ️ Información de normalización:")
            for msg in mensajes_info:
                logger.info(f"  {msg}")

        return datos_validados
    
    def _formatear_validacion_ia(self, resultado_validacion: Any) -> Optional[Dict[str, Any]]:
        """
        Formatea el resultado de validación IA para la respuesta
        """
        if not resultado_validacion:
            return None
            
        try:
            return {
                "score_confianza": getattr(resultado_validacion, 'score_confianza', 0),
                "estado": getattr(getattr(resultado_validacion, 'estado', None), 'value', 'DESCONOCIDO'),
                "accion_recomendada": getattr(getattr(resultado_validacion, 'accion_recomendada', None), 'value', 'REVISION_MANUAL'),
                "errores_detectados": getattr(resultado_validacion, 'errores_detectados', []),
                "alertas": getattr(resultado_validacion, 'alertas', []),
                "sugerencias": getattr(resultado_validacion, 'sugerencias_correccion', []),
                "datos_corregidos": bool(getattr(resultado_validacion, 'datos_corregidos', None)),
                "validaciones": getattr(resultado_validacion, 'validaciones', {})
            }
        except Exception as e:
            logger.error(f"Error formateando validación IA: {e}")
            return None

    async def _extraer_fallback(self, file: UploadFile) -> Optional[Dict[str, Any]]:
        """
        Extracción de emergencia usando solo EasyOCR
        """
        try:
            # Leer el archivo
            contents = await file.read()
            
            # Convertir el contenido del archivo a una imagen numpy
            nparr = np.frombuffer(contents, np.uint8)
            if len(nparr) == 0:
                raise ValueError("Archivo de imagen vacío")
                
            # Decodificar la imagen
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if image is None:
                raise ValueError("No se pudo decodificar la imagen")

            # Convertir a escala de grises
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Usar EasyOCR para extraer texto
            reader = easyocr.Reader(['es'], gpu=False)
            result = reader.readtext(gray)
            
            # Extraer texto completo
            texto_completo = " ".join([text[1] for text in result])
            
            # Usar patrones para extraer datos básicos
            datos = self._extraer_datos_con_patrones(texto_completo)
            
            return {
                "datos": datos,
                "texto_completo": texto_completo,
                "confianza": 50,
                "engine": "fallback"
            }
            
        except Exception as e:
            logger.error(f"Error en extracción fallback: {str(e)}")
            return None

# Crear la instancia global del extractor
enhanced_extractor = None

def init_extractor():
    """Inicializar la instancia global del extractor"""
    global enhanced_extractor
    if enhanced_extractor is None:
        try:
            logger.info("🚀 Inicializando EnhancedOCRExtractor...")
            enhanced_extractor = EnhancedOCRExtractor()
            logger.info("✅ EnhancedOCRExtractor inicializado correctamente")
            return enhanced_extractor
        except Exception as e:
            logger.error(f"❌ Error inicializando EnhancedOCRExtractor: {e}")
            raise

# Inicializar el extractor cuando se importa el módulo
enhanced_extractor = init_extractor()