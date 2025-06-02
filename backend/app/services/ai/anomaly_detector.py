"""
🔍 Anomaly Detector - Detector de Anomalías en Comprobantes
Detecta patrones sospechosos y errores comunes en datos de OCR
"""

from typing import Dict, List, Any, Optional
import re
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class AnomalyDetector:
    """
    Detector inteligente de anomalías en comprobantes de pago
    Identifica patrones sospechosos, errores de OCR y inconsistencias
    """
    
    def __init__(self):
        self.patrones_sospechosos = self._cargar_patrones_sospechosos()
        self.errores_ocr_comunes = self._cargar_errores_ocr()
        logger.info("🔍 AnomalyDetector inicializado")
    
    def _cargar_patrones_sospechosos(self) -> List[Dict[str, Any]]:
        """Carga patrones que pueden indicar actividad sospechosa"""
        return [
            {
                "nombre": "monto_redondo_exacto",
                "descripcion": "Montos exactamente redondos pueden ser sospechosos",
                "patron": lambda valor: self._es_monto_sospechosamente_redondo(valor),
                "severidad": "baja"
            },
            {
                "nombre": "referencia_muy_corta",
                "descripcion": "Referencias muy cortas pueden ser inválidas",
                "patron": lambda ref: len(str(ref)) < 4 if ref else False,
                "severidad": "media"
            },
            {
                "nombre": "hora_inusual",
                "descripcion": "Transacciones en horarios muy inusuales",
                "patron": lambda hora: self._es_hora_inusual(hora),
                "severidad": "baja"
            },
            {
                "nombre": "fecha_futura",
                "descripcion": "Fecha en el futuro",
                "patron": lambda fecha: self._es_fecha_futura(fecha),
                "severidad": "alta"
            }
        ]
    
    def _cargar_errores_ocr(self) -> List[Dict[str, Any]]:
        """Carga errores comunes de OCR"""
        return [
            {
                "nombre": "confusion_o_0",
                "descripcion": "Confusión entre O y 0",
                "patron": lambda texto: 'O' in str(texto) and str(texto).replace('O', '0').isdigit(),
                "correccion": lambda texto: str(texto).replace('O', '0')
            },
            {
                "nombre": "confusion_l_1",
                "descripcion": "Confusión entre l e I con 1",
                "patron": lambda texto: ('l' in str(texto) or 'I' in str(texto)) and len(str(texto)) > 3,
                "correccion": lambda texto: str(texto).replace('l', '1').replace('I', '1')
            },
            {
                "nombre": "espacios_en_numeros",
                "descripcion": "Espacios incorrectos en números",
                "patron": lambda texto: ' ' in str(texto) and any(c.isdigit() for c in str(texto)),
                "correccion": lambda texto: str(texto).replace(' ', '')
            }
        ]
    
    def detectar_anomalias(self, datos: Dict[str, Any]) -> Dict[str, Any]:
        """
        Detecta anomalías en los datos extraídos
        
        Args:
            datos: Datos del comprobante
            
        Returns:
            Dict con anomalías detectadas y alertas
        """
        try:
            anomalias = []
            alertas = []
            alertas_criticas = []
            errores_ocr = []
            
            # 1. Detectar patrones sospechosos
            for patron in self.patrones_sospechosos:
                resultado = self._evaluar_patron_sospechoso(patron, datos)
                if resultado:
                    anomalias.append(resultado["descripcion"])
                    if resultado["severidad"] == "alta":
                        alertas_criticas.append(resultado["descripcion"])
                    else:
                        alertas.append(resultado["descripcion"])
            
            # 2. Detectar errores de OCR
            for campo, valor in datos.items():
                if valor:
                    errores_campo = self._detectar_errores_ocr_campo(campo, valor)
                    errores_ocr.extend(errores_campo)
            
            # 3. Detectar inconsistencias entre campos
            inconsistencias = self._detectar_inconsistencias(datos)
            anomalias.extend(inconsistencias)
            
            # 4. Evaluar calidad general
            calidad_score = self._calcular_calidad_general(datos, anomalias, errores_ocr)
            
            return {
                "anomalias": anomalias,
                "alertas": alertas,
                "alertas_criticas": alertas_criticas,
                "errores_ocr": errores_ocr,
                "inconsistencias": inconsistencias,
                "total_anomalias": len(anomalias),
                "calidad_score": calidad_score,
                "tiene_problemas_criticos": len(alertas_criticas) > 0
            }
            
        except Exception as e:
            logger.error(f"Error detectando anomalías: {e}")
            return {
                "error": str(e),
                "anomalias": [],
                "alertas": ["Error en detección de anomalías"],
                "alertas_criticas": [],
                "total_anomalias": 0
            }
    
    def _evaluar_patron_sospechoso(self, patron: Dict, datos: Dict) -> Optional[Dict]:
        """Evalúa un patrón sospechoso específico"""
        try:
            # Determinar qué campo evaluar según el patrón
            if "monto" in patron["nombre"]:
                valor_evaluar = datos.get("valor")
            elif "referencia" in patron["nombre"]:
                valor_evaluar = datos.get("referencia")
            elif "hora" in patron["nombre"]:
                valor_evaluar = datos.get("hora")
            elif "fecha" in patron["nombre"]:
                valor_evaluar = datos.get("fecha")
            else:
                valor_evaluar = None
            
            if valor_evaluar and patron["patron"](valor_evaluar):
                return {
                    "nombre": patron["nombre"],
                    "descripcion": patron["descripcion"],
                    "severidad": patron["severidad"],
                    "valor_detectado": str(valor_evaluar)
                }
            
        except Exception as e:
            logger.error(f"Error evaluando patrón {patron.get('nombre', 'unknown')}: {e}")
        
        return None
    
    def _detectar_errores_ocr_campo(self, campo: str, valor: Any) -> List[str]:
        """Detecta errores de OCR en un campo específico"""
        errores = []
        valor_str = str(valor)
        
        for error in self.errores_ocr_comunes:
            try:
                if error["patron"](valor_str):
                    errores.append(f"Error OCR en {campo}: {error['descripcion']}")
            except Exception:
                continue
        
        return errores
    
    def _detectar_inconsistencias(self, datos: Dict[str, Any]) -> List[str]:
        """Detecta inconsistencias entre campos"""
        inconsistencias = []
        
        # Inconsistencia: referencia igual al valor
        valor = datos.get("valor", "")
        referencia = datos.get("referencia", "")
        
        if valor and referencia and str(valor).replace(",", "") == str(referencia):
            inconsistencias.append("Referencia idéntica al valor - posible error OCR")
        
        # Inconsistencia: fecha muy antigua
        fecha = datos.get("fecha", "")
        if fecha:
            try:
                fecha_obj = datetime.strptime(fecha, "%Y-%m-%d")
                hace_60_dias = datetime.now() - timedelta(days=60)
                if fecha_obj < hace_60_dias:
                    inconsistencias.append("Fecha muy antigua (>60 días)")
            except ValueError:
                inconsistencias.append("Formato de fecha inválido")
        
        return inconsistencias
    
    def _es_monto_sospechosamente_redondo(self, valor: Any) -> bool:
        """Detecta montos sospechosamente redondos"""
        try:
            monto = int(str(valor).replace(",", "").replace(".", ""))
            # Montos exactamente redondos en millones
            return monto % 1000000 == 0 and monto >= 5000000
        except (ValueError, TypeError):
            return False
    
    def _es_hora_inusual(self, hora: Any) -> bool:
        """Detecta horas inusuales para transacciones"""
        try:
            hora_obj = datetime.strptime(str(hora), "%H:%M").time()
            hora_num = hora_obj.hour
            # Entre 1AM y 5AM es inusual
            return 1 <= hora_num <= 5
        except (ValueError, TypeError):
            return False
    
    def _es_fecha_futura(self, fecha: Any) -> bool:
        """Detecta fechas en el futuro"""
        try:
            fecha_obj = datetime.strptime(str(fecha), "%Y-%m-%d")
            return fecha_obj.date() > datetime.now().date()
        except (ValueError, TypeError):
            return False
    
    def _calcular_calidad_general(self, datos: Dict, anomalias: List, errores_ocr: List) -> int:
        """Calcula un score de calidad general (0-100)"""
        score = 100
        
        # Penalizar por anomalías
        score -= len(anomalias) * 5
        
        # Penalizar por errores OCR
        score -= len(errores_ocr) * 10
        
        # Penalizar por campos faltantes importantes
        campos_importantes = ["valor", "fecha", "referencia"]
        campos_faltantes = sum(1 for campo in campos_importantes if not datos.get(campo))
        score -= campos_faltantes * 15
        
        return max(0, score)
    
    def obtener_estadisticas(self) -> Dict[str, Any]:
        """Obtiene estadísticas del detector"""
        return {
            "patrones_sospechosos": len(self.patrones_sospechosos),
            "errores_ocr_conocidos": len(self.errores_ocr_comunes),
            "version": "1.0.0"
        }
