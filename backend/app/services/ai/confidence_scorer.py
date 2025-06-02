"""
📊 Confidence Scorer - Sistema de Scoring de Confianza para OCR
Calcula score de confianza (0-100) basado en múltiples factores

Factores considerados:
- Calidad de validaciones básicas
- Coherencia con patrones bancarios
- Ausencia de anomalías
- Calidad de imagen (si disponible)
- Coherencia entre datos
"""

from typing import Dict, List, Any, Optional
import logging
import math

logger = logging.getLogger(__name__)

class ConfidenceScorer:
    """
    🎯 Sistema inteligente de scoring de confianza
    
    Combina múltiples factores para generar un score 0-100:
    - 100: Perfecto, auto-aprobable
    - 80-99: Alta confianza, aprobación con supervisión mínima
    - 60-79: Confianza media, revisión recomendada
    - 40-59: Confianza baja, revisión obligatoria
    - 0-39: Muy baja confianza, probable rechazo
    """
    
    def __init__(self):
        self.pesos = self._cargar_pesos_scoring()
        self.bonificaciones = self._cargar_bonificaciones()
        self.penalizaciones = self._cargar_penalizaciones()
        logger.info("📊 ConfidenceScorer inicializado")
    
    def _cargar_pesos_scoring(self) -> Dict[str, float]:
        """Carga los pesos para cada factor del scoring"""
        return {
            # Validaciones básicas (40% del score)
            "validaciones_basicas": 0.40,
            
            # Validaciones específicas por entidad (25% del score)
            "validaciones_entidad": 0.25,
            
            # Ausencia de anomalías (20% del score)
            "ausencia_anomalias": 0.20,
            
            # Calidad de imagen y metadata (10% del score)
            "calidad_imagen": 0.10,
            
            # Coherencia general (5% del score)
            "coherencia_general": 0.05
        }
    
    def _cargar_bonificaciones(self) -> Dict[str, int]:
        """Carga bonificaciones que aumentan el score"""
        return {
            "monto_tipico_entidad": 5,           # Monto típico para la entidad
            "horario_normal": 3,                 # Horario normal de operación
            "referencia_formato_perfecto": 5,    # Referencia con formato perfecto
            "fecha_reciente": 3,                 # Fecha muy reciente
            "entidad_identificada_claramente": 5, # Entidad bancaria claramente identificada
            "datos_completos": 5,                # Todos los campos presentes
            "patron_conocido": 3                 # Patrón previamente validado
        }
    
    def _cargar_penalizaciones(self) -> Dict[str, int]:
        """Carga penalizaciones que reducen el score"""
        return {
            "anomalia_menor": 5,                 # Por cada anomalía menor
            "anomalia_mayor": 15,                # Por cada anomalía mayor
            "alerta_critica": 30,                # Por cada alerta crítica
            "validacion_fallida": 10,            # Por cada validación que falla
            "datos_incompletos": 8,              # Campos importantes faltantes
            "error_ocr_detectado": 12,           # Error de OCR identificado
            "incoherencia_datos": 20,            # Datos inconsistentes entre sí
            "patron_sospechoso": 25              # Patrón conocido como sospechoso
        }
    
    def calcular_score(
        self, 
        datos_extraidos: Dict[str, Any],
        validaciones_basicas: Dict[str, str],
        validaciones_entidad: Dict[str, str],
        anomalias: Dict[str, Any],
        imagen_metadata: Optional[Dict[str, Any]] = None
    ) -> int:
        """
        🎯 FUNCIÓN PRINCIPAL: Calcula score de confianza (0-100)
        
        Args:
            datos_extraidos: Datos del OCR
            validaciones_basicas: Resultado de validaciones básicas
            validaciones_entidad: Resultado de validaciones por entidad
            anomalias: Anomalías detectadas
            imagen_metadata: Metadatos de calidad de imagen
        
        Returns:
            int: Score de confianza (0-100)
        """
        try:
            logger.info("📊 Calculando score de confianza...")
            
            # Iniciar con score base
            score = 100
            
            # 1. Evaluar validaciones básicas (40% peso)
            score_validaciones_basicas = self._evaluar_validaciones_basicas(validaciones_basicas)
            
            # 2. Evaluar validaciones de entidad (25% peso)
            score_validaciones_entidad = self._evaluar_validaciones_entidad(validaciones_entidad)
            
            # 3. Evaluar ausencia de anomalías (20% peso)
            score_anomalias = self._evaluar_anomalias(anomalias)
            
            # 4. Evaluar calidad de imagen (10% peso)
            score_imagen = self._evaluar_calidad_imagen(imagen_metadata)
            
            # 5. Evaluar coherencia general (5% peso)
            score_coherencia = self._evaluar_coherencia_general(datos_extraidos)
            
            # Calcular score ponderado
            score_final = (
                score_validaciones_basicas * self.pesos["validaciones_basicas"] +
                score_validaciones_entidad * self.pesos["validaciones_entidad"] +
                score_anomalias * self.pesos["ausencia_anomalias"] +
                score_imagen * self.pesos["calidad_imagen"] +
                score_coherencia * self.pesos["coherencia_general"]
            )
            
            # 6. Aplicar bonificaciones
            bonificaciones_aplicadas = self._calcular_bonificaciones(datos_extraidos, validaciones_basicas, validaciones_entidad)
            
            # 7. Aplicar penalizaciones adicionales
            penalizaciones_aplicadas = self._calcular_penalizaciones_adicionales(anomalias, datos_extraidos)
            
            # Score final
            score_final = score_final + bonificaciones_aplicadas - penalizaciones_aplicadas
            
            # Asegurar que esté en rango 0-100
            score_final = max(0, min(100, int(score_final)))
            
            logger.info(f"📊 Score calculado: {score_final}")
            logger.info(f"  - Validaciones básicas: {score_validaciones_basicas:.1f}")
            logger.info(f"  - Validaciones entidad: {score_validaciones_entidad:.1f}")
            logger.info(f"  - Anomalías: {score_anomalias:.1f}")
            logger.info(f"  - Imagen: {score_imagen:.1f}")
            logger.info(f"  - Coherencia: {score_coherencia:.1f}")
            logger.info(f"  - Bonificaciones: +{bonificaciones_aplicadas}")
            logger.info(f"  - Penalizaciones: -{penalizaciones_aplicadas}")
            
            return score_final
            
        except Exception as e:
            logger.error(f"❌ Error calculando score: {str(e)}")
            return 0  # Score mínimo en caso de error
    
    def _evaluar_validaciones_basicas(self, validaciones: Dict[str, str]) -> float:
        """Evalúa las validaciones básicas y retorna score 0-100"""
        if not validaciones:
            return 0
        
        total_validaciones = len(validaciones)
        validaciones_exitosas = sum(1 for resultado in validaciones.values() if resultado.startswith("✅"))
        
        if total_validaciones == 0:
            return 0
        
        porcentaje_exito = (validaciones_exitosas / total_validaciones) * 100
        
        # Bonus por validaciones críticas
        campos_criticos = ["formato_monto", "formato_fecha", "entidad_presente"]
        criticos_exitosos = 0
        
        for campo in campos_criticos:
            if campo in validaciones and validaciones[campo].startswith("✅"):
                criticos_exitosos += 1
        
        bonus_criticos = (criticos_exitosos / len(campos_criticos)) * 10
        
        return min(100, porcentaje_exito + bonus_criticos)
    
    def _evaluar_validaciones_entidad(self, validaciones: Dict[str, str]) -> float:
        """Evalúa las validaciones específicas por entidad"""
        if not validaciones:
            return 50  # Score neutro si no hay validaciones específicas
        
        total_validaciones = len(validaciones)
        validaciones_exitosas = sum(1 for resultado in validaciones.values() if resultado.startswith("✅"))
        
        if total_validaciones == 0:
            return 50
        
        porcentaje_exito = (validaciones_exitosas / total_validaciones) * 100
        
        # Bonus por validaciones específicas importantes
        validaciones_importantes = ["referencia_formato", "monto_rango", "horario_operacion"]
        importantes_exitosas = 0
        
        for validacion in validaciones_importantes:
            if validacion in validaciones and validaciones[validacion].startswith("✅"):
                importantes_exitosas += 1
        
        if len(validaciones_importantes) > 0:
            bonus_importantes = (importantes_exitosas / len(validaciones_importantes)) * 15
        else:
            bonus_importantes = 0
        
        return min(100, porcentaje_exito + bonus_importantes)
    
    def _evaluar_anomalias(self, anomalias: Dict[str, Any]) -> float:
        """Evalúa la ausencia de anomalías (más anomalías = menor score)"""
        if not anomalias:
            return 100
        
        total_anomalias = anomalias.get("total_anomalias", 0)
        alertas_criticas = len(anomalias.get("alertas_criticas", []))
        alertas_normales = len(anomalias.get("alertas", []))
        
        # Score base
        score = 100
        
        # Penalizar por anomalías
        score -= total_anomalias * 8  # -8 puntos por anomalía
        score -= alertas_criticas * 25  # -25 puntos por alerta crítica
        score -= alertas_normales * 5   # -5 puntos por alerta normal
        
        # Bonus si no hay anomalías críticas
        if alertas_criticas == 0:
            score += 10
        
        return max(0, score)
    
    def _evaluar_calidad_imagen(self, imagen_metadata: Optional[Dict[str, Any]]) -> float:
        """Evalúa la calidad de imagen si está disponible"""
        if not imagen_metadata:
            return 75  # Score neutro si no hay metadata
        
        score = 100
        
        # Evaluar resolución
        width = imagen_metadata.get("width", 0)
        height = imagen_metadata.get("height", 0)
        
        if width > 0 and height > 0:
            pixels = width * height
            if pixels < 100000:  # Muy baja resolución
                score -= 20
            elif pixels < 500000:  # Baja resolución
                score -= 10
        
        # Evaluar tamaño de archivo (indica calidad)
        file_size = imagen_metadata.get("file_size", 0)
        if file_size > 0:
            if file_size < 50000:  # Muy comprimida
                score -= 15
            elif file_size < 100000:  # Algo comprimida
                score -= 5
        
        # Evaluar formato
        formato = imagen_metadata.get("format", "").lower()
        if formato in ["jpg", "jpeg"]:
            pass  # Formato estándar
        elif formato in ["png"]:
            score += 5  # Mejor calidad
        elif formato in ["webp"]:
            score -= 5  # Posible pérdida de calidad
        
        return max(0, min(100, score))
    
    def _evaluar_coherencia_general(self, datos: Dict[str, Any]) -> float:
        """Evalúa la coherencia general entre todos los datos"""
        score = 100
        
        # Verificar completitud de datos
        campos_importantes = ["valor", "fecha", "entidad", "referencia"]
        campos_presentes = sum(1 for campo in campos_importantes if datos.get(campo))
        
        completitud = (campos_presentes / len(campos_importantes)) * 100
        
        # Evaluar longitudes razonables
        valor = datos.get("valor", "")
        if valor and len(str(valor)) > 15:  # Valor muy largo
            score -= 10
        
        referencia = datos.get("referencia", "")
        if referencia and (len(referencia) < 4 or len(referencia) > 25):
            score -= 10
        
        # Combinar completitud con coherencia
        score_final = (completitud * 0.7) + (score * 0.3)
        
        return max(0, min(100, score_final))
    
    def _calcular_bonificaciones(
        self, 
        datos: Dict[str, Any], 
        validaciones_basicas: Dict[str, str],
        validaciones_entidad: Dict[str, str]
    ) -> int:
        """Calcula bonificaciones que aumentan el score"""
        bonificaciones = 0
        
        # 1. Datos completos
        campos_requeridos = ["valor", "fecha", "entidad", "referencia"]
        if all(datos.get(campo) for campo in campos_requeridos):
            bonificaciones += self.bonificaciones["datos_completos"]
        
        # 2. Entidad claramente identificada
        entidad = datos.get("entidad", "").lower()
        entidades_claras = ["bancolombia", "nequi", "pse", "daviplata"]
        if any(ent in entidad for ent in entidades_claras):
            bonificaciones += self.bonificaciones["entidad_identificada_claramente"]
        
        # 3. Monto típico para la entidad
        if self._es_monto_tipico_entidad(datos.get("valor", ""), entidad):
            bonificaciones += self.bonificaciones["monto_tipico_entidad"]
        
        # 4. Formato de referencia perfecto
        if "referencia_formato" in validaciones_entidad:
            if validaciones_entidad["referencia_formato"].startswith("✅"):
                bonificaciones += self.bonificaciones["referencia_formato_perfecto"]
        
        # 5. Horario normal de operación
        if "horario_operacion" in validaciones_entidad:
            if validaciones_entidad["horario_operacion"].startswith("✅"):
                bonificaciones += self.bonificaciones["horario_normal"]
        
        # 6. Fecha reciente
        if self._es_fecha_reciente(datos.get("fecha", "")):
            bonificaciones += self.bonificaciones["fecha_reciente"]
        
        return bonificaciones
    
    def _calcular_penalizaciones_adicionales(self, anomalias: Dict[str, Any], datos: Dict[str, Any]) -> int:
        """Calcula penalizaciones adicionales específicas"""
        penalizaciones = 0
        
        # 1. Penalizar por tipo de anomalías
        alertas_criticas = anomalias.get("alertas_criticas", [])
        for alerta in alertas_criticas:
            penalizaciones += self.penalizaciones["alerta_critica"]
        
        # 2. Penalizar errores de OCR específicos
        lista_anomalias = anomalias.get("anomalias", [])
        for anomalia in lista_anomalias:
            if "confusión" in anomalia.lower() or "error ocr" in anomalia.lower():
                penalizaciones += self.penalizaciones["error_ocr_detectado"]
            elif "incoherencia" in anomalia.lower() or "inconsistente" in anomalia.lower():
                penalizaciones += self.penalizaciones["incoherencia_datos"]
            elif "sospechoso" in anomalia.lower() or "prueba" in anomalia.lower():
                penalizaciones += self.penalizaciones["patron_sospechoso"]
        
        # 3. Penalizar datos incompletos críticos
        campos_criticos = ["valor", "referencia"]
        for campo in campos_criticos:
            if not datos.get(campo):
                penalizaciones += self.penalizaciones["datos_incompletos"]
        
        return penalizaciones
    
    def _es_monto_tipico_entidad(self, valor: str, entidad: str) -> bool:
        """Verifica si el monto es típico para la entidad"""
        if not valor or not entidad:
            return False
        
        try:
            monto = int(str(valor).replace(",", "").replace(".", "").replace("$", ""))
            
            # Rangos típicos por entidad
            rangos_tipicos = {
                "nequi": (5000, 500000),        # $5K - $500K
                "daviplata": (10000, 300000),   # $10K - $300K
                "bancolombia": (50000, 5000000), # $50K - $5M
                "pse": (100000, 10000000),      # $100K - $10M
            }
            
            for ent, (minimo, maximo) in rangos_tipicos.items():
                if ent in entidad and minimo <= monto <= maximo:
                    return True
            
        except (ValueError, TypeError):
            pass
        
        return False
    
    def _es_fecha_reciente(self, fecha: str) -> bool:
        """Verifica si la fecha es reciente (últimos 7 días)"""
        if not fecha:
            return False
        
        try:
            from datetime import datetime, timedelta
            fecha_obj = datetime.strptime(fecha, "%d/%m/%Y")
            hace_7_dias = datetime.now() - timedelta(days=7)
            
            return fecha_obj >= hace_7_dias
        except ValueError:
            return False
    
    def obtener_interpretacion_score(self, score: int) -> Dict[str, str]:
        """Obtiene interpretación textual del score"""
        if score >= 90:
            return {
                "nivel": "Excelente",
                "descripcion": "Datos perfectos, auto-aprobación recomendada",
                "accion": "AUTO_APROBAR",
                "color": "#22c55e",  # Verde
                "emoji": "✅"
            }
        elif score >= 80:
            return {
                "nivel": "Muy bueno",
                "descripcion": "Alta confianza, supervisión mínima",
                "accion": "APROBAR_CON_SUPERVISION",
                "color": "#3b82f6",  # Azul
                "emoji": "🔷"
            }
        elif score >= 60:
            return {
                "nivel": "Bueno",
                "descripcion": "Confianza media, revisión recomendada",
                "accion": "REVISION_RECOMENDADA",
                "color": "#f59e0b",  # Amarillo
                "emoji": "⚠️"
            }
        elif score >= 40:
            return {
                "nivel": "Regular",
                "descripcion": "Confianza baja, revisión obligatoria",
                "accion": "REVISION_OBLIGATORIA",
                "color": "#f97316",  # Naranja
                "emoji": "⚡"
            }
        else:
            return {
                "nivel": "Malo",
                "descripcion": "Muy baja confianza, probable rechazo",
                "accion": "RECHAZAR_O_CORREGIR",
                "color": "#ef4444",  # Rojo
                "emoji": "❌"
            }
    
    def generar_desglose_score(
        self, 
        datos_extraidos: Dict[str, Any],
        validaciones_basicas: Dict[str, str],
        validaciones_entidad: Dict[str, str],
        anomalias: Dict[str, Any],
        imagen_metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Genera un desglose detallado de cómo se calculó el score"""
        
        # Calcular componentes individuales
        score_validaciones_basicas = self._evaluar_validaciones_basicas(validaciones_basicas)
        score_validaciones_entidad = self._evaluar_validaciones_entidad(validaciones_entidad)
        score_anomalias = self._evaluar_anomalias(anomalias)
        score_imagen = self._evaluar_calidad_imagen(imagen_metadata)
        score_coherencia = self._evaluar_coherencia_general(datos_extraidos)
        
        bonificaciones = self._calcular_bonificaciones(datos_extraidos, validaciones_basicas, validaciones_entidad)
        penalizaciones = self._calcular_penalizaciones_adicionales(anomalias, datos_extraidos)
        
        # Score final
        score_ponderado = (
            score_validaciones_basicas * self.pesos["validaciones_basicas"] +
            score_validaciones_entidad * self.pesos["validaciones_entidad"] +
            score_anomalias * self.pesos["ausencia_anomalias"] +
            score_imagen * self.pesos["calidad_imagen"] +
            score_coherencia * self.pesos["coherencia_general"]
        )
        
        score_final = max(0, min(100, int(score_ponderado + bonificaciones - penalizaciones)))
        
        return {
            "score_final": score_final,
            "interpretacion": self.obtener_interpretacion_score(score_final),
            "componentes": {
                "validaciones_basicas": {
                    "score": round(score_validaciones_basicas, 1),
                    "peso": self.pesos["validaciones_basicas"],
                    "contribucion": round(score_validaciones_basicas * self.pesos["validaciones_basicas"], 1)
                },
                "validaciones_entidad": {
                    "score": round(score_validaciones_entidad, 1),
                    "peso": self.pesos["validaciones_entidad"],
                    "contribucion": round(score_validaciones_entidad * self.pesos["validaciones_entidad"], 1)
                },
                "ausencia_anomalias": {
                    "score": round(score_anomalias, 1),
                    "peso": self.pesos["ausencia_anomalias"],
                    "contribucion": round(score_anomalias * self.pesos["ausencia_anomalias"], 1)
                },
                "calidad_imagen": {
                    "score": round(score_imagen, 1),
                    "peso": self.pesos["calidad_imagen"],
                    "contribucion": round(score_imagen * self.pesos["calidad_imagen"], 1)
                },
                "coherencia_general": {
                    "score": round(score_coherencia, 1),
                    "peso": self.pesos["coherencia_general"],
                    "contribucion": round(score_coherencia * self.pesos["coherencia_general"], 1)
                }
            },
            "ajustes": {
                "bonificaciones": bonificaciones,
                "penalizaciones": penalizaciones,
                "score_base": round(score_ponderado, 1)
            },
            "factores_clave": self._identificar_factores_clave(
                score_validaciones_basicas, score_validaciones_entidad, 
                score_anomalias, bonificaciones, penalizaciones
            )
        }
    
    def _identificar_factores_clave(
        self, 
        score_basicas: float, 
        score_entidad: float, 
        score_anomalias: float,
        bonificaciones: int,
        penalizaciones: int
    ) -> List[str]:
        """Identifica los factores que más impactaron el score"""
        factores = []
        
        if score_basicas < 70:
            factores.append("❌ Validaciones básicas fallidas impactan negativamente")
        elif score_basicas > 90:
            factores.append("✅ Validaciones básicas excelentes")
        
        if score_entidad < 60:
            factores.append("❌ No coincide bien con patrones de la entidad")
        elif score_entidad > 85:
            factores.append("✅ Coincide perfectamente con patrones bancarios")
        
        if score_anomalias < 50:
            factores.append("🚨 Múltiples anomalías detectadas reducen confianza")
        elif score_anomalias > 90:
            factores.append("✅ Sin anomalías significativas")
        
        if bonificaciones > 10:
            factores.append(f"⭐ Bonificaciones aplicadas: +{bonificaciones} puntos")
        
        if penalizaciones > 15:
            factores.append(f"⚠️ Penalizaciones aplicadas: -{penalizaciones} puntos")
        
        return factores
    
    def comparar_con_historico(self, score_actual: int, historial_scores: List[int]) -> Dict[str, Any]:
        """Compara el score actual con el historial para detectar patrones"""
        if not historial_scores:
            return {"mensaje": "Sin historial para comparar"}
        
        promedio_historico = sum(historial_scores) / len(historial_scores)
        diferencia = score_actual - promedio_historico
        
        # Analizar tendencia
        if len(historial_scores) >= 3:
            ultimos_3 = historial_scores[-3:]
            tendencia_reciente = sum(ultimos_3) / 3
            
            if score_actual > tendencia_reciente + 10:
                tendencia = "mejorando"
            elif score_actual < tendencia_reciente - 10:
                tendencia = "empeorando"
            else:
                tendencia = "estable"
        else:
            tendencia = "insuficiente_data"
        
        return {
            "score_actual": score_actual,
            "promedio_historico": round(promedio_historico, 1),
            "diferencia": round(diferencia, 1),
            "tendencia": tendencia,
            "posicion_percentil": self._calcular_percentil(score_actual, historial_scores),
            "recomendacion": self._generar_recomendacion_historica(diferencia, tendencia)
        }
    
    def _calcular_percentil(self, score: int, historial: List[int]) -> int:
        """Calcula en qué percentil está el score actual"""
        scores_menores = sum(1 for s in historial if s < score)
        percentil = (scores_menores / len(historial)) * 100
        return int(percentil)
    
    def _generar_recomendacion_historica(self, diferencia: float, tendencia: str) -> str:
        """Genera recomendación basada en comparación histórica"""
        if diferencia > 15:
            return "Score significativamente mejor que el promedio histórico"
        elif diferencia < -15:
            return "Score significativamente peor que el promedio histórico - revisar calidad"
        elif tendencia == "mejorando":
            return "Tendencia positiva en calidad de comprobantes"
        elif tendencia == "empeorando":
            return "Tendencia negativa - considerar capacitación adicional"
        else:
            return "Score dentro del rango normal histórico"
    
    def obtener_estadisticas(self) -> Dict[str, Any]:
        """Obtiene estadísticas del sistema de scoring"""
        return {
            "version": "1.0.0",
            "pesos_configurados": self.pesos,
            "bonificaciones_disponibles": len(self.bonificaciones),
            "penalizaciones_disponibles": len(self.penalizaciones),
            "rangos_interpretacion": {
                "excelente": "90-100",
                "muy_bueno": "80-89",
                "bueno": "60-79",
                "regular": "40-59",
                "malo": "0-39"
            }
        }

# 🧪 Función de testing
def test_confidence_scorer():
    """Testing del sistema de scoring"""
    
    scorer = ConfidenceScorer()
    
    # Casos de prueba
    casos_prueba = [
        {
            "nombre": "Comprobante perfecto",
            "datos": {
                "valor": "250000",
                "fecha": "15/01/2025",
                "hora": "14:30",
                "entidad": "Bancolombia",
                "referencia": "1234567890"
            },
            "validaciones_basicas": {
                "formato_monto": "✅ Monto válido",
                "formato_fecha": "✅ Fecha válida",
                "formato_hora": "✅ Hora válida",
                "entidad_presente": "✅ Entidad identificada"
            },
            "validaciones_entidad": {
                "referencia_formato": "✅ Referencia válida según entidad",
                "monto_rango": "✅ Monto en rango válido",
                "horario_operacion": "✅ Hora dentro del horario de operación"
            },
            "anomalias": {
                "anomalias": [],
                "alertas": [],
                "alertas_criticas": [],
                "total_anomalias": 0
            }
        },
        {
            "nombre": "Comprobante con errores",
            "datos": {
                "valor": "25O000",  # Error OCR
                "fecha": "32/01/2025",  # Fecha inválida
                "entidad": "Bancolombia",
                "referencia": "123"  # Muy corta
            },
            "validaciones_basicas": {
                "formato_monto": "❌ Monto inválido: 25O000",
                "formato_fecha": "❌ Fecha inválida: 32/01/2025",
                "entidad_presente": "✅ Entidad identificada"
            },
            "validaciones_entidad": {
                "referencia_formato": "❌ Longitud inválida: 3 (esperado: 9-10)",
                "monto_rango": "❌ Monto no numérico"
            },
            "anomalias": {
                "anomalias": ["Error OCR detectado", "Fecha inválida", "Referencia muy corta"],
                "alertas": ["Error OCR: confusión O y 0"],
                "alertas_criticas": [],
                "total_anomalias": 3
            }
        }
    ]
    
    print("🧪 Testing Confidence Scorer...")
    
    for caso in casos_prueba:
        print(f"\n📋 {caso['nombre']}:")
        
        score = scorer.calcular_score(
            caso['datos'],
            caso['validaciones_basicas'],
            caso['validaciones_entidad'],
            caso['anomalias']
        )
        
        interpretacion = scorer.obtener_interpretacion_score(score)
        
        print(f"  Score: {score}/100")
        print(f"  Nivel: {interpretacion['nivel']}")
        print(f"  Acción: {interpretacion['accion']}")
        print(f"  {interpretacion['emoji']} {interpretacion['descripcion']}")

if __name__ == "__main__":
    test_confidence_scorer()