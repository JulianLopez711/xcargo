"""
🏦 Bank Pattern Validator - Validador de Patrones Bancarios
Valida datos según patrones específicos de cada entidad bancaria colombiana
"""

from typing import Dict, List, Any, Optional
import re
import logging
from datetime import datetime, time

logger = logging.getLogger(__name__)

class BankPatternValidator:
    """
    Validador de patrones específicos por entidad bancaria
    Conoce las reglas y limitaciones de cada banco/app de pago
    """
    
    def __init__(self):
        self.patrones_entidades = self._cargar_patrones_entidades()
        self.limitaciones_entidades = self._cargar_limitaciones()
        logger.info("🏦 BankPatternValidator inicializado")
    
    def _cargar_patrones_entidades(self) -> Dict[str, Dict[str, Any]]:
        """Carga patrones específicos por entidad bancaria"""
        return {
            "nequi": {
                "referencia_formato": r"^[A-Z0-9]{6,15}$",
                "monto_maximo": 2000000,  # $2M límite Nequi
                "monto_minimo": 1,
                "horario_operacion": (0, 24),  # 24h para mayor flexibilidad
                "formatos_aceptados": ["transferencia", "pago", "nequi"]
            },
            "bancolombia": {
                "referencia_formato": r"^[A-Z0-9]{6,20}$",  # Más flexible
                "monto_maximo": 10000000,  # $10M
                "monto_minimo": 1000,
                "horario_operacion": (0, 24),  # 24/7
                "formatos_aceptados": ["transferencia", "pse", "consignacion"]
            },
            "daviplata": {
                "referencia_formato": r"^[A-Z0-9]{6,15}$",
                "monto_maximo": 1000000,  # Actualizado a $1M
                "monto_minimo": 1000,
                "horario_operacion": (0, 24),  # 24h para mayor flexibilidad
                "formatos_aceptados": ["transferencia", "pago", "daviplata"]
            },
            "pse": {
                "referencia_formato": r"^[A-Z0-9]{6,20}$",  # Más flexible
                "monto_maximo": 50000000,  # $50M
                "monto_minimo": 10000,
                "horario_operacion": (0, 24),  # 24/7
                "formatos_aceptados": ["pse"]
            }
        }
    
    def _cargar_limitaciones(self) -> Dict[str, List[str]]:
        """Carga limitaciones conocidas por entidad"""
        return {
            "nequi": [
                "No disponible 12AM-6AM los lunes",
                "Límite diario $2.000.000", 
                "Mantenimiento domingos 1AM-3AM"
            ],
            "daviplata": [
                "Límite diario $300.000",
                "No disponible después 11PM",
                "Requiere clave adicional >$100K"
            ]
        }
    
    def validar_por_entidad(self, datos: Dict[str, Any]) -> Dict[str, str]:
        """Valida datos según patrones específicos de la entidad"""
        entidad = str(datos.get("entidad", "")).lower()
        validaciones = {}
        
        # Buscar entidad en patrones conocidos
        entidad_encontrada = None
        for nombre_entidad in self.patrones_entidades.keys():
            if nombre_entidad in entidad:
                entidad_encontrada = nombre_entidad
                break
        
        if not entidad_encontrada:
            validaciones["entidad_reconocida"] = "⚠️ Entidad no reconocida en patrones"
            return validaciones
        
        patrones = self.patrones_entidades[entidad_encontrada]
        validaciones["entidad_reconocida"] = f"✅ Entidad reconocida: {entidad_encontrada}"
        
        # Validar formato de referencia
        referencia = datos.get("referencia", "")
        if referencia:
            patron_ref = patrones.get("referencia_formato", "")
            if patron_ref and re.match(patron_ref, referencia):
                validaciones["referencia_formato"] = "✅ Formato de referencia válido"
            else:
                validaciones["referencia_formato"] = f"❌ Formato inválido: esperado {patron_ref}"
        
        # Validar rango de monto
        valor = datos.get("valor", "")
        if valor:
            try:
                monto = int(str(valor).replace(",", "").replace(".", ""))
                monto_min = patrones.get("monto_minimo", 0)
                monto_max = patrones.get("monto_maximo", float('inf'))
                
                if monto_min <= monto <= monto_max:
                    validaciones["monto_rango"] = "✅ Monto en rango válido"
                else:
                    validaciones["monto_rango"] = f"❌ Monto fuera de rango: ${monto_min:,} - ${monto_max:,}"
            except (ValueError, TypeError):
                validaciones["monto_rango"] = "❌ Monto no numérico"
        
        return validaciones
    
    def obtener_estadisticas(self) -> Dict[str, Any]:
        """Obtiene estadísticas del validador"""
        return {
            "entidades_soportadas": list(self.patrones_entidades.keys()),
            "total_patrones": len(self.patrones_entidades),
            "version": "1.0.0"
        }
