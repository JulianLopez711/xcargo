"""
🧠 AI OCR Validator - Motor Principal de Validación Inteligente
Fase 1: Validación Inteligente de Comprobantes de Pago

Funcionalidades:
- Validación de coherencia de datos extraídos
- Detección de anomalías automática
- Sistema de scoring de confianza
- Sugerencias de corrección automáticas
"""

from typing import Dict, List, Any, Tuple, Optional
from datetime import datetime, timedelta
import re
import json
import logging
from dataclasses import dataclass
from enum import Enum

# Importar nuestros módulos específicos
from .bank_patterns import BankPatternValidator
from .anomaly_detector import AnomalyDetector
from .confidence_scorer import ConfidenceScorer

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ValidationStatus(Enum):
    """Estados posibles de validación"""
    VALIDADO = "VALIDADO"
    REQUIERE_REVISION = "REQUIERE_REVISION"
    SOSPECHOSO = "SOSPECHOSO"
    ERROR_CRITICO = "ERROR_CRITICO"

class ActionRecommendation(Enum):
    """Acciones recomendadas basadas en validación"""
    AUTO_APROBAR = "AUTO_APROBAR"
    REVISION_MANUAL = "REVISION_MANUAL"
    BLOQUEAR_Y_REVISAR = "BLOQUEAR_Y_REVISAR"
    RECHAZAR_AUTOMATICO = "RECHAZAR_AUTOMATICO"

@dataclass
class ValidationResult:
    """Resultado completo de validación"""
    score_confianza: int  # 0-100
    estado: ValidationStatus
    accion_recomendada: ActionRecommendation
    validaciones: Dict[str, str]  # Resultado de cada validación
    errores_detectados: List[str]
    alertas: List[str]
    sugerencias_correccion: List[str]
    datos_corregidos: Optional[Dict[str, Any]] = None
    tiempo_procesamiento: float = 0.0

class AIValidator:
    """
    🎯 Validador principal de OCR con IA
    
    Combina múltiples técnicas de validación:
    - Patrones específicos por entidad bancaria
    - Detección de anomalías contextuales
    - Scoring inteligente de confianza
    - Auto-corrección de errores comunes
    """
    
    def __init__(self):
        self.bank_validator = BankPatternValidator()
        self.anomaly_detector = AnomalyDetector()
        self.confidence_scorer = ConfidenceScorer()
        
        # Configuración de umbrales
        self.umbrales = {
            "auto_aprobar": 85,      # Score mínimo para auto-aprobación
            "revision_manual": 60,   # Score mínimo para revisión manual
            "sospechoso": 30,        # Score bajo → sospechoso
            "bloquear": 15           # Score crítico → bloquear
        }
        
        logger.info("🤖 AIValidator inicializado correctamente")
    
    def validar_comprobante(self, datos_extraidos: Dict[str, Any], imagen_metadata: Dict[str, Any] = None) -> ValidationResult:
        """
        🎯 FUNCIÓN PRINCIPAL: Valida comprobante completo con IA
        
        Args:
            datos_extraidos: Datos del OCR (valor, fecha, entidad, etc.)
            imagen_metadata: Metadatos de la imagen (calidad, tamaño, etc.)
        
        Returns:
            ValidationResult: Resultado completo de validación
        """
        inicio = datetime.now()
        
        try:
            logger.info(f"🔍 Iniciando validación IA para entidad: {datos_extraidos.get('entidad', 'Desconocida')}")
            
            # PASO 1: Validaciones básicas de formato
            validaciones_basicas = self._validar_formato_basico(datos_extraidos)
            
            # PASO 2: Validaciones específicas por entidad bancaria
            validaciones_entidad = self.bank_validator.validar_por_entidad(datos_extraidos)
            
            # PASO 3: Detección de anomalías
            anomalias = self.anomaly_detector.detectar_anomalias(datos_extraidos)
            
            # PASO 4: Calcular score de confianza
            score_confianza = self.confidence_scorer.calcular_score(
                datos_extraidos, 
                validaciones_basicas, 
                validaciones_entidad, 
                anomalias,
                imagen_metadata
            )
            
            # PASO 5: Auto-corrección de errores comunes
            datos_corregidos = self._auto_corregir_errores(datos_extraidos, anomalias)
            
            # PASO 6: Determinar estado y acción recomendada
            estado, accion = self._determinar_estado_y_accion(score_confianza, anomalias)
            
            # PASO 7: Consolidar resultado
            resultado = ValidationResult(
                score_confianza=score_confianza,
                estado=estado,
                accion_recomendada=accion,
                validaciones={**validaciones_basicas, **validaciones_entidad},
                errores_detectados=self._extraer_errores(validaciones_basicas, validaciones_entidad),
                alertas=anomalias.get("alertas", []),
                sugerencias_correccion=self._generar_sugerencias(datos_extraidos, anomalias),
                datos_corregidos=datos_corregidos,
                tiempo_procesamiento=(datetime.now() - inicio).total_seconds()
            )
            
            logger.info(f"✅ Validación completada - Score: {score_confianza}, Estado: {estado.value}")
            return resultado
            
        except Exception as e:
            logger.error(f"❌ Error en validación IA: {str(e)}")
            import traceback
            traceback.print_exc()
            
            # Resultado de error
            return ValidationResult(
                score_confianza=0,
                estado=ValidationStatus.ERROR_CRITICO,
                accion_recomendada=ActionRecommendation.REVISION_MANUAL,
                validaciones={"error": f"❌ Error interno: {str(e)}"},
                errores_detectados=[f"Error del sistema: {str(e)}"],
                alertas=["Error crítico en validación"],
                sugerencias_correccion=["Revisar manualmente el comprobante"],
                tiempo_procesamiento=(datetime.now() - inicio).total_seconds()
            )
    
    def _validar_formato_basico(self, datos: Dict[str, Any]) -> Dict[str, str]:
        """Validaciones básicas de formato para campos comunes"""
        validaciones = {}
        
        # Validar valor monetario
        if valor := datos.get("valor"):
            try:
                valor_num = float(str(valor).replace(',', ''))
                if 0 < valor_num <= 50000000:
                    validaciones["valor"] = "OK"
                else:
                    validaciones["valor"] = f"❌ Valor fuera de rango: {valor}"
            except:
                validaciones["valor"] = "❌ Formato de valor inválido"
        else:
            validaciones["valor"] = "❌ Valor no encontrado"

        # Validar fecha
        if fecha := datos.get("fecha"):
            try:
                datetime.strptime(fecha, "%Y-%m-%d")
                validaciones["fecha"] = "OK"
            except:
                validaciones["fecha"] = "❌ Formato de fecha inválido"
        else:
            validaciones["fecha"] = "❌ Fecha no encontrada"

        # Validar hora (más flexible)
        if hora := datos.get("hora"):
            try:
                # Aceptar formato HH:MM:SS o HH:MM
                if re.match(r"^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$", hora):
                    validaciones["hora"] = "OK"
                else:
                    validaciones["hora"] = "❌ Formato de hora inválido"
            except:
                validaciones["hora"] = "❌ Error validando hora"
        else:
            validaciones["hora"] = None  # Hora es opcional

        # Validar entidad
        if entidad := datos.get("entidad"):
            entidad = entidad.lower()
            if entidad in ["nequi", "bancolombia", "daviplata", "pse", "efecty"]:
                validaciones["entidad"] = "OK"
            else:
                validaciones["entidad"] = f"❌ Entidad no reconocida: {entidad}"
        else:
            validaciones["entidad"] = "❌ Entidad no encontrada"

        # Validar tipo de comprobante
        if tipo := datos.get("tipo_comprobante"):
            tipo = tipo.lower()
            if tipo in ["nequi", "transferencia", "consignacion"]:
                validaciones["tipo_comprobante"] = "OK"
            else:
                validaciones["tipo_comprobante"] = f"❌ Tipo no válido: {tipo}"
        else:
            validaciones["tipo_comprobante"] = "❌ Tipo no encontrado"

        # Validar referencia (más flexible)
        if ref := datos.get("referencia"):
            if len(ref) >= 6:  # Solo validamos longitud mínima
                validaciones["referencia"] = "OK"
            else:
                validaciones["referencia"] = "❌ Referencia muy corta"
        else:
            validaciones["referencia"] = "❌ Referencia no encontrada"

        return validaciones
    
    def _es_monto_valido(self, valor: str) -> bool:
        """Valida que el monto tenga formato correcto"""
        if not valor:
            return False
        
        # Remover caracteres comunes de formateo
        valor_limpio = str(valor).replace(",", "").replace(".", "").replace("$", "").strip()
        
        # Verificar que sea numérico
        if not valor_limpio.isdigit():
            return False
        
        # Verificar que esté en rango razonable
        valor_num = int(valor_limpio)
        return 0 <= valor_num <= 500000000  # Entre $1.000 y $500M
    
    def _es_fecha_valida(self, fecha: str) -> bool:
        """Valida formato y coherencia de fecha"""
        if not fecha:
            return False
        
        try:
            # Intentar múltiples formatos
            formatos = ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y"]
            
            fecha_obj = None
            for formato in formatos:
                try:
                    fecha_obj = datetime.strptime(fecha, formato)
                    break
                except ValueError:
                    continue
            
            if not fecha_obj:
                return False
            
            # Verificar que no sea futura
            if fecha_obj.date() > datetime.now().date():
                return False
            
            # Verificar que no sea muy antigua (más de 60 días)
            hace_60_dias = datetime.now() - timedelta(days=60)
            if fecha_obj < hace_60_dias:
                return False
            
            return True
            
        except Exception:
            return False
    
    def _es_hora_valida(self, hora: str) -> bool:
        """Valida formato de hora"""
        if not hora:
            return True  # Hora es opcional
        
        try:
            # Formato HH:MM
            datetime.strptime(hora, "%H:%M")
            return True
        except ValueError:
            try:
                # Formato H:MM
                datetime.strptime(hora, "%H:%M")
                return True
            except ValueError:
                return False
    
    def _es_referencia_valida(self, referencia: str) -> bool:
        """Valida que la referencia tenga formato básico"""
        if not referencia:
            return False
        
        # Mínimo 4 caracteres, máximo 50
        if not (4 <= len(referencia.strip()) <= 50):
            return False
        
        # No puede ser solo espacios o caracteres especiales
        if not re.search(r'[a-zA-Z0-9]', referencia):
            return False
        
        return True
    
    def _determinar_estado_y_accion(self, score: int, anomalias: Dict) -> Tuple[ValidationStatus, ActionRecommendation]:
        """Determina estado y acción basado en score y anomalías"""
        
        # Verificar alertas críticas
        alertas_criticas = anomalias.get("alertas_criticas", [])
        if alertas_criticas:
            return ValidationStatus.SOSPECHOSO, ActionRecommendation.BLOQUEAR_Y_REVISAR
        
        # Basado en score de confianza
        if score >= self.umbrales["auto_aprobar"]:
            return ValidationStatus.VALIDADO, ActionRecommendation.AUTO_APROBAR
        elif score >= self.umbrales["revision_manual"]:
            return ValidationStatus.REQUIERE_REVISION, ActionRecommendation.REVISION_MANUAL
        elif score >= self.umbrales["sospechoso"]:
            return ValidationStatus.SOSPECHOSO, ActionRecommendation.REVISION_MANUAL
        else:
            return ValidationStatus.SOSPECHOSO, ActionRecommendation.BLOQUEAR_Y_REVISAR
    
    def _extraer_errores(self, validaciones_basicas: Dict, validaciones_entidad: Dict) -> List[str]:
        """Extrae errores de las validaciones"""
        errores = []
        
        todas_validaciones = {**validaciones_basicas, **validaciones_entidad}
        
        for clave, resultado in todas_validaciones.items():
            if resultado.startswith("❌"):
                errores.append(resultado)
        
        return errores
    
    def _auto_corregir_errores(self, datos: Dict[str, Any], anomalias: Dict) -> Optional[Dict[str, Any]]:
        """Auto-corrección de errores comunes de OCR"""
        datos_corregidos = datos.copy()
        correcciones_aplicadas = False
        
        # 1. Corregir errores comunes en montos
        valor = datos.get("valor", "")
        if valor:
            valor_corregido = self._corregir_monto(valor)
            if valor_corregido != valor:
                datos_corregidos["valor"] = valor_corregido
                datos_corregidos["_correcciones"] = datos_corregidos.get("_correcciones", [])
                datos_corregidos["_correcciones"].append(f"Monto: '{valor}' → '{valor_corregido}'")
                correcciones_aplicadas = True
        
        # 2. Corregir errores comunes en fechas
        fecha = datos.get("fecha", "")
        if fecha:
            fecha_corregida = self._corregir_fecha(fecha)
            if fecha_corregida != fecha:
                datos_corregidos["fecha"] = fecha_corregida
                datos_corregidos["_correcciones"] = datos_corregidos.get("_correcciones", [])
                datos_corregidos["_correcciones"].append(f"Fecha: '{fecha}' → '{fecha_corregida}'")
                correcciones_aplicadas = True
        
        return datos_corregidos if correcciones_aplicadas else None
    
    def _corregir_monto(self, valor: str) -> str:
        """Corrige errores comunes en montos"""
        valor_limpio = str(valor)
        
        # Correcciones comunes de OCR
        correcciones = {
            "O": "0",  # O por 0
            "l": "1",  # l minúscula por 1
            "I": "1",  # I mayúscula por 1
            "S": "5",  # S por 5
            "o": "0",  # o minúscula por 0
        }
        
        for error, correccion in correcciones.items():
            valor_limpio = valor_limpio.replace(error, correccion)
        
        # Remover caracteres no numéricos excepto punto y coma para decimales
        valor_limpio = re.sub(r'[^\d,.]', '', valor_limpio)
        
        return valor_limpio
    
    def _corregir_fecha(self, fecha: str) -> str:
        """Corrige errores comunes en fechas"""
        fecha_limpia = str(fecha)
        
        # Correcciones comunes
        correcciones = {
            "O": "0",
            "l": "1",
            "I": "1",
        }
        
        for error, correccion in correcciones.items():
            fecha_limpia = fecha_limpia.replace(error, correccion)
        
        return fecha_limpia
    
    def _generar_sugerencias(self, datos: Dict[str, Any], anomalias: Dict) -> List[str]:
        """Genera sugerencias de corrección basadas en errores detectados"""
        sugerencias = []
        
        # Sugerencias basadas en anomalías detectadas
        for anomalia in anomalias.get("anomalias", []):
            if "monto" in anomalia.lower():
                sugerencias.append("Verificar que el monto esté completo y sea legible")
            elif "fecha" in anomalia.lower():
                sugerencias.append("Verificar formato de fecha (DD/MM/YYYY)")
            elif "referencia" in anomalia.lower():
                sugerencias.append("Asegurar que la referencia esté completa")
        
        # Sugerencias específicas por entidad
        entidad = datos.get("entidad", "").lower()
        if "nequi" in entidad and datos.get("valor"):
            try:
                valor_num = int(str(datos["valor"]).replace(",", "").replace(".", ""))
                if valor_num > 2000000:
                    sugerencias.append("Nequi tiene límite de $2.000.000 - verificar monto")
            except:
                pass
        
        # Sugerencia general si no hay específicas
        if not sugerencias:
            sugerencias.append("Verificar que todos los datos sean legibles en la imagen")
        
        return sugerencias
    
    def obtener_estadisticas(self) -> Dict[str, Any]:
        """Obtiene estadísticas del validador"""
        return {
            "version": "1.0.0",
            "modulos_activos": [
                "BankPatternValidator",
                "AnomalyDetector", 
                "ConfidenceScorer"
            ],
            "umbrales_configurados": self.umbrales,
            "estado": "activo"
        }

# 🎯 Función de conveniencia para uso directo
def validar_comprobante_ia(datos_extraidos: Dict[str, Any], imagen_metadata: Dict[str, Any] = None) -> ValidationResult:
    """
    Función de conveniencia para validar un comprobante
    
    Usage:
        resultado = validar_comprobante_ia({
            "valor": "500000",
            "fecha": "15/01/2025",
            "entidad": "Bancolombia",
            "referencia": "1234567890"
        })
    """
    validator = AIValidator()
    return validator.validar_comprobante(datos_extraidos, imagen_metadata)

# 🧪 Función de testing
def test_validator():
    """Función para testing básico del validador"""
    
    # Caso de prueba 1: Datos válidos
    datos_validos = {
        "valor": "500000",
        "fecha": "15/01/2025",
        "hora": "14:30",
        "entidad": "Bancolombia",
        "referencia": "1234567890"
    }
    
    # Caso de prueba 2: Datos con errores
    datos_con_errores = {
        "valor": "50000O",  # Error OCR
        "fecha": "32/01/2025",  # Fecha inválida
        "entidad": "Bancolombia",
        "referencia": "123"  # Referencia muy corta
    }
    
    validator = AIValidator()
    
    print("🧪 Testing validador IA...")
    
    print("\n1. Datos válidos:")
    resultado1 = validator.validar_comprobante(datos_validos)
    print(f"Score: {resultado1.score_confianza}, Estado: {resultado1.estado.value}")
    
    print("\n2. Datos con errores:")
    resultado2 = validator.validar_comprobante(datos_con_errores)
    print(f"Score: {resultado2.score_confianza}, Estado: {resultado2.estado.value}")
    print(f"Errores: {resultado2.errores_detectados}")
    
    return resultado1, resultado2

if __name__ == "__main__":
    # Ejecutar test si se llama directamente
    test_validator()