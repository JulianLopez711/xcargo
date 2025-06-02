"""
🚨 Anomaly Detector - Detector de Anomalías Inteligente para OCR
Identifica patrones sospechosos y errores comunes en comprobantes de pago

Tipos de anomalías detectadas:
- Valores sospechosos (muy redondos, muy altos, etc.)
- Patrones temporales anómalos
- Inconsistencias entre datos
- Posibles manipulaciones de imagen
- Errores comunes de OCR
"""

import re
from typing import Dict, List, Any, Tuple
from datetime import datetime, timedelta
import logging
import statistics

logger = logging.getLogger(__name__)

class AnomalyDetector:
    """
    🎯 Detector inteligente de anomalías en comprobantes de pago
    
    Detecta:
    - Anomalías de valor (montos sospechosos)
    - Anomalías temporales (fechas/horas inusuales)
    - Anomalías de formato (errores OCR)
    - Anomalías de coherencia (datos inconsistentes)
    """
    
    def __init__(self):
        self.umbrales = self._cargar_umbrales_deteccion()
        self.patrones_sospechosos = self._cargar_patrones_sospechosos()
        self.historial_valores = []  # Para análisis estadístico
        logger.info("🔍 AnomalyDetector inicializado")
    
    def _cargar_umbrales_deteccion(self) -> Dict[str, Any]:
        """Carga umbrales para detección de anomalías"""
        return {
            "valor": {
                "muy_alto": 50000000,       # $50M+
                "muy_bajo": 500,            # <$500
                "exactamente_redondo": True, # 1000000, 2000000, etc.
                "demasiados_ceros": 6       # Más de 6 ceros seguidos
            },
            "temporal": {
                "hora_muy_temprana": "04:00",
                "hora_muy_tarde": "02:00",
                "fecha_muy_antigua": 60,    # Más de 60 días
                "fecha_futura": True
            },
            "referencia": {
                "muy_corta": 3,
                "muy_larga": 30,
                "caracteres_raros": r'[^a-zA-Z0-9\-]'
            },
            "repeticion": {
                "mismo_valor_seguido": 3,   # 3 veces el mismo valor
                "patron_repetitivo": True
            }
        }
    
    def _cargar_patrones_sospechosos(self) -> Dict[str, List[str]]:
        """Carga patrones conocidos como sospechosos"""
        return {
            "valores_test": [
                "111111", "222222", "333333", "123456", "654321",
                "1000000", "2000000", "5000000", "10000000"
            ],
            "referencias_test": [
                "123456", "test", "prueba", "xxx", "000000", "111111"
            ],
            "errores_ocr_comunes": [
                "O0O0O0",  # Confusión O y 0
                "lllll",   # l por 1
                "IIIII",   # I por 1
                "SSSSS"    # S por 5
            ],
            "palabras_sospechosas": [
                "test", "prueba", "fake", "falso", "simulado", "ejemplo"
            ]
        }
    
    def detectar_anomalias(self, datos: Dict[str, Any]) -> Dict[str, Any]:
        """
        🎯 FUNCIÓN PRINCIPAL: Detecta todas las anomalías en los datos
        
        Returns:
            Dict con anomalías encontradas, alertas y nivel de riesgo
        """
        anomalias = []
        alertas = []
        alertas_criticas = []
        
        try:
            # 1. Detectar anomalías de valor
            anomalias_valor = self._detectar_anomalias_valor(datos.get("valor", ""))
            anomalias.extend(anomalias_valor["anomalias"])
            alertas.extend(anomalias_valor["alertas"])
            alertas_criticas.extend(anomalias_valor["criticas"])
            
            # 2. Detectar anomalías temporales
            anomalias_temporal = self._detectar_anomalias_temporales(
                datos.get("fecha", ""), 
                datos.get("hora", "")
            )
            anomalias.extend(anomalias_temporal["anomalias"])
            alertas.extend(anomalias_temporal["alertas"])
            
            # 3. Detectar anomalías de referencia
            anomalias_referencia = self._detectar_anomalias_referencia(datos.get("referencia", ""))
            anomalias.extend(anomalias_referencia["anomalias"])
            alertas.extend(anomalias_referencia["alertas"])
            
            # 4. Detectar inconsistencias entre datos
            anomalias_coherencia = self._detectar_incoherencias(datos)
            anomalias.extend(anomalias_coherencia["anomalias"])
            alertas.extend(anomalias_coherencia["alertas"])
            alertas_criticas.extend(anomalias_coherencia["criticas"])
            
            # 5. Detectar errores comunes de OCR
            anomalias_ocr = self._detectar_errores_ocr(datos)
            anomalias.extend(anomalias_ocr["anomalias"])
            alertas.extend(anomalias_ocr["alertas"])
            
            # 6. Calcular nivel de riesgo
            nivel_riesgo = self._calcular_nivel_riesgo(anomalias, alertas_criticas)
            
            resultado = {
                "anomalias": anomalias,
                "alertas": alertas,
                "alertas_criticas": alertas_criticas,
                "nivel_riesgo": nivel_riesgo,
                "total_anomalias": len(anomalias),
                "score_anomalia": max(0, 100 - (len(anomalias) * 10) - (len(alertas_criticas) * 30))
            }
            
            logger.info(f"🔍 Análisis completado: {len(anomalias)} anomalías, riesgo: {nivel_riesgo}")
            return resultado
            
        except Exception as e:
            logger.error(f"❌ Error en detección de anomalías: {str(e)}")
            return {
                "anomalias": [f"Error en análisis: {str(e)}"],
                "alertas": ["Error del sistema"],
                "alertas_criticas": [],
                "nivel_riesgo": "medio",
                "total_anomalias": 1,
                "score_anomalia": 50
            }
    
    def _detectar_anomalias_valor(self, valor: str) -> Dict[str, List[str]]:
        """Detecta anomalías específicas en el valor/monto"""
        anomalias = []
        alertas = []
        criticas = []
        
        if not valor:
            return {"anomalias": ["Valor vacío"], "alertas": [], "criticas": []}
        
        try:
            # Limpiar valor
            valor_limpio = str(valor).replace(",", "").replace(".", "").replace("$", "").strip()
            
            # 1. Verificar si es numérico
            if not valor_limpio.isdigit():
                anomalias.append(f"Valor contiene caracteres no numéricos: {valor}")
                alertas.append("Valor con formato inválido")
            else:
                valor_num = int(valor_limpio)
                
                # 2. Valor extremadamente alto
                if valor_num > self.umbrales["valor"]["muy_alto"]:
                    anomalias.append(f"Valor extremadamente alto: ${valor_num:,}")
                    criticas.append("Valor sospechosamente alto")
                
                # 3. Valor extremadamente bajo
                elif valor_num < self.umbrales["valor"]["muy_bajo"]:
                    anomalias.append(f"Valor muy bajo: ${valor_num:,}")
                    alertas.append("Valor inusualmente bajo")
                
                # 4. Valor exactamente redondo (sospechoso)
                if self._es_valor_exactamente_redondo(valor_num):
                    anomalias.append(f"Valor sospechosamente redondo: ${valor_num:,}")
                    alertas.append("Valor redondo sospechoso")
                
                # 5. Demasiados ceros
                if str(valor_num).count('0') >= self.umbrales["valor"]["demasiados_ceros"]:
                    anomalias.append(f"Valor con muchos ceros: {valor_num}")
                    alertas.append("Patrón de ceros sospechoso")
                
                # 6. Valores de test conocidos
                if str(valor_num) in self.patrones_sospechosos["valores_test"]:
                    anomalias.append(f"Valor de prueba detectado: {valor_num}")
                    criticas.append("Posible comprobante de prueba")
        
        except Exception as e:
            anomalias.append(f"Error procesando valor: {str(e)}")
        
        return {"anomalias": anomalias, "alertas": alertas, "criticas": criticas}
    
    def _detectar_anomalias_temporales(self, fecha: str, hora: str) -> Dict[str, List[str]]:
        """Detecta anomalías en fecha y hora"""
        anomalias = []
        alertas = []
        
        # Analizar fecha
        if fecha:
            try:
                # Intentar parsear fecha
                fecha_obj = None
                formatos = ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"]
                
                for formato in formatos:
                    try:
                        fecha_obj = datetime.strptime(fecha, formato)
                        break
                    except ValueError:
                        continue
                
                if fecha_obj:
                    ahora = datetime.now()
                    
                    # Fecha futura
                    if fecha_obj.date() > ahora.date():
                        anomalias.append(f"Fecha futura detectada: {fecha}")
                        alertas.append("Fecha futura sospechosa")
                    
                    # Fecha muy antigua
                    dias_diferencia = (ahora - fecha_obj).days
                    if dias_diferencia > self.umbrales["temporal"]["fecha_muy_antigua"]:
                        anomalias.append(f"Fecha muy antigua: {fecha} ({dias_diferencia} días)")
                        alertas.append("Fecha inusualmente antigua")
                    
                    # Fin de semana vs día laboral (contexto)
                    dia_semana = fecha_obj.weekday()
                    if dia_semana >= 5:  # Sábado o domingo
                        anomalias.append(f"Transacción en fin de semana: {fecha}")
                else:
                    anomalias.append(f"Formato de fecha no reconocido: {fecha}")
                    
            except Exception as e:
                anomalias.append(f"Error procesando fecha: {str(e)}")
        
        # Analizar hora
        if hora:
            try:
                hora_obj = datetime.strptime(hora, "%H:%M").time()
                
                # Hora muy temprana
                hora_temprana = datetime.strptime(self.umbrales["temporal"]["hora_muy_temprana"], "%H:%M").time()
                if hora_obj < hora_temprana:
                    anomalias.append(f"Hora muy temprana: {hora}")
                    alertas.append("Transacción en hora inusual")
                
                # Hora muy tarde
                hora_tarde = datetime.strptime(self.umbrales["temporal"]["hora_muy_tarde"], "%H:%M").time()
                if hora_obj > hora_tarde:
                    anomalias.append(f"Hora muy tarde: {hora}")
                    alertas.append("Transacción en hora inusual")
                    
            except ValueError:
                anomalias.append(f"Formato de hora inválido: {hora}")
        
        return {"anomalias": anomalias, "alertas": alertas}
    
    def _detectar_anomalias_referencia(self, referencia: str) -> Dict[str, List[str]]:
        """Detecta anomalías en la referencia del pago"""
        anomalias = []
        alertas = []
        
        if not referencia:
            return {"anomalias": ["Referencia vacía"], "alertas": []}
        
        # 1. Longitud anómala
        if len(referencia) < self.umbrales["referencia"]["muy_corta"]:
            anomalias.append(f"Referencia muy corta: {referencia}")
            alertas.append("Referencia sospechosamente corta")
        elif len(referencia) > self.umbrales["referencia"]["muy_larga"]:
            anomalias.append(f"Referencia muy larga: {referencia}")
            alertas.append("Referencia inusualmente larga")
        
        # 2. Caracteres raros
        caracteres_raros = re.findall(self.umbrales["referencia"]["caracteres_raros"], referencia)
        if caracteres_raros:
            anomalias.append(f"Referencia con caracteres especiales: {referencia}")
            alertas.append("Caracteres inusuales en referencia")
        
        # 3. Referencias de test conocidas
        if referencia.lower() in [r.lower() for r in self.patrones_sospechosos["referencias_test"]]:
            anomalias.append(f"Referencia de prueba detectada: {referencia}")
            alertas.append("Posible referencia de test")
        
        # 4. Patrón repetitivo
        if self._tiene_patron_repetitivo(referencia):
            anomalias.append(f"Referencia con patrón repetitivo: {referencia}")
            alertas.append("Patrón sospechoso en referencia")
        
        return {"anomalias": anomalias, "alertas": alertas}
    
    def _detectar_incoherencias(self, datos: Dict[str, Any]) -> Dict[str, List[str]]:
        """Detecta inconsistencias entre diferentes campos de datos"""
        anomalias = []
        alertas = []
        criticas = []
        
        # 1. Incoherencia entre entidad y referencia
        entidad = datos.get("entidad", "").lower()
        referencia = datos.get("referencia", "")
        
        if "nequi" in entidad and referencia:
            # Nequi suele tener referencias alfanuméricas específicas
            if referencia.isdigit() and len(referencia) > 10:
                anomalias.append("Referencia numérica larga inusual para Nequi")
        
        elif "bancolombia" in entidad and referencia:
            # Bancolombia suele usar referencias numéricas
            if not referencia.isdigit():
                anomalias.append("Referencia no numérica inusual para Bancolombia")
        
        # 2. Incoherencia entre valor y entidad
        valor_str = datos.get("valor", "")
        if valor_str:
            try:
                valor_num = int(str(valor_str).replace(",", "").replace(".", "").replace("$", ""))
                
                if "nequi" in entidad and valor_num > 2000000:
                    criticas.append("Valor supera límite conocido de Nequi")
                    anomalias.append(f"Nequi: valor ${valor_num:,} supera límite típico")
                
                elif "daviplata" in entidad and valor_num > 3000000:
                    alertas.append("Valor alto para Daviplata")
                    anomalias.append(f"Daviplata: valor ${valor_num:,} inusualmente alto")
                    
            except (ValueError, TypeError):
                pass
        
        # 3. Incoherencia temporal
        fecha = datos.get("fecha", "")
        hora = datos.get("hora", "")
        
        if fecha and hora:
            try:
                fecha_obj = datetime.strptime(fecha, "%d/%m/%Y")
                hora_obj = datetime.strptime(hora, "%H:%M").time()
                
                # Transacciones de madrugada en días laborales (inusual)
                if fecha_obj.weekday() < 5 and (hora_obj < datetime.strptime("06:00", "%H:%M").time()):
                    anomalias.append("Transacción de madrugada en día laboral")
                    
            except ValueError:
                pass
        
        # 4. Verificar coherencia de descripción
        descripcion = datos.get("descripcion", "").lower()
        if descripcion:
            # Palabras sospechosas
            for palabra in self.patrones_sospechosos["palabras_sospechosas"]:
                if palabra in descripcion:
                    criticas.append(f"Palabra sospechosa en descripción: {palabra}")
                    anomalias.append(f"Descripción contiene: {palabra}")
        
        return {"anomalias": anomalias, "alertas": alertas, "criticas": criticas}
    
    def _detectar_errores_ocr(self, datos: Dict[str, Any]) -> Dict[str, List[str]]:
        """Detecta errores comunes de OCR en los datos"""
        anomalias = []
        alertas = []
        
        # Verificar todos los campos de texto
        campos_texto = ["valor", "referencia", "descripcion", "entidad"]
        
        for campo in campos_texto:
            texto = str(datos.get(campo, ""))
            if not texto:
                continue
            
            # 1. Confusión O y 0
            if "O" in texto and texto.count("O") > 2:
                if re.search(r'O+', texto):  # Múltiples O seguidas
                    anomalias.append(f"Posible confusión O/0 en {campo}: {texto}")
                    alertas.append("Error OCR: confusión O y 0")
            
            # 2. Confusión l (L minúscula) y 1
            if "l" in texto and re.search(r'l+', texto):
                anomalias.append(f"Posible confusión l/1 en {campo}: {texto}")
                alertas.append("Error OCR: confusión l y 1")
            
            # 3. Confusión I (i mayúscula) y 1
            if "I" in texto and re.search(r'I+', texto):
                anomalias.append(f"Posible confusión I/1 en {campo}: {texto}")
                alertas.append("Error OCR: confusión I y 1")
            
            # 4. Confusión S y 5
            if "S" in texto and campo == "valor":
                anomalias.append(f"Posible confusión S/5 en valor: {texto}")
                alertas.append("Error OCR: confusión S y 5")
            
            # 5. Caracteres mezclados (números y letras donde no debería)
            if campo == "valor":
                if re.search(r'[a-zA-Z]', texto.replace("$", "").replace(",", "")):
                    anomalias.append(f"Letras en campo numérico: {texto}")
                    alertas.append("Error OCR: letras en monto")
            
            # 6. Patrones de error conocidos
            for patron_error in self.patrones_sospechosos["errores_ocr_comunes"]:
                if patron_error in texto:
                    anomalias.append(f"Patrón de error OCR detectado: {patron_error}")
                    alertas.append("Patrón de error OCR conocido")
        
        return {"anomalias": anomalias, "alertas": alertas}
    
    def _es_valor_exactamente_redondo(self, valor: int) -> bool:
        """Verifica si un valor es sospechosamente redondo"""
        # Valores como 1000000, 2000000, 5000000 son sospechosos
        valor_str = str(valor)
        
        # Termina en muchos ceros
        if valor_str.endswith("000000"):  # 6 ceros
            return True
        
        # Es exactamente 1M, 2M, 5M, 10M, etc.
        millones_exactos = [1000000, 2000000, 5000000, 10000000, 20000000]
        if valor in millones_exactos:
            return True
        
        # Es múltiplo exacto de 100,000
        if valor >= 100000 and valor % 100000 == 0:
            return True
        
        return False
    
    def _tiene_patron_repetitivo(self, texto: str) -> bool:
        """Detecta si un texto tiene patrones repetitivos sospechosos"""
        # Patrones como "111111", "123123", "abcabc"
        
        # 1. Mismo carácter repetido
        for char in set(texto):
            if texto.count(char) > len(texto) * 0.7:  # Más del 70% el mismo carácter
                return True
        
        # 2. Secuencias repetitivas
        for i in range(2, len(texto) // 2 + 1):
            subcadena = texto[:i]
            if texto == subcadena * (len(texto) // i):
                return True
        
        return False
    
    def _calcular_nivel_riesgo(self, anomalias: List[str], alertas_criticas: List[str]) -> str:
        """Calcula el nivel de riesgo basado en anomalías detectadas"""
        
        if len(alertas_criticas) > 0:
            return "alto"
        elif len(anomalias) >= 5:
            return "alto"
        elif len(anomalias) >= 3:
            return "medio"
        elif len(anomalias) >= 1:
            return "bajo"
        else:
            return "muy_bajo"
    
    def analizar_tendencias(self, historial_datos: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analiza tendencias en el historial para detectar patrones anómalos
        """
        if len(historial_datos) < 3:
            return {"mensaje": "Historial insuficiente para análisis de tendencias"}
        
        # Analizar valores
        valores = []
        for datos in historial_datos:
            try:
                valor_str = str(datos.get("valor", "")).replace(",", "").replace(".", "").replace("$", "")
                if valor_str.isdigit():
                    valores.append(int(valor_str))
            except:
                continue
        
        if len(valores) < 2:
            return {"mensaje": "Valores insuficientes para análisis"}
        
        # Estadísticas
        promedio = statistics.mean(valores)
        mediana = statistics.median(valores)
        
        # Detectar outliers
        if len(valores) >= 3:
            desviacion = statistics.stdev(valores)
            outliers = []
            
            for valor in valores:
                if abs(valor - promedio) > 2 * desviacion:  # Más de 2 desviaciones estándar
                    outliers.append(valor)
            
            return {
                "promedio": promedio,
                "mediana": mediana,
                "desviacion_estandar": desviacion,
                "outliers": outliers,
                "nivel_variabilidad": "alta" if desviacion > promedio * 0.5 else "normal"
            }
        
        return {
            "promedio": promedio,
            "mediana": mediana,
            "total_valores": len(valores)
        }
    
    def obtener_recomendaciones(self, anomalias_detectadas: Dict[str, Any]) -> List[str]:
        """Genera recomendaciones basadas en las anomalías detectadas"""
        recomendaciones = []
        
        anomalias = anomalias_detectadas.get("anomalias", [])
        nivel_riesgo = anomalias_detectadas.get("nivel_riesgo", "bajo")
        
        # Recomendaciones por nivel de riesgo
        if nivel_riesgo == "alto":
            recomendaciones.append("🚨 BLOQUEAR: Múltiples anomalías críticas detectadas")
            recomendaciones.append("📞 Contactar al conductor para verificación")
            recomendaciones.append("🔍 Revisión manual obligatoria")
        
        elif nivel_riesgo == "medio":
            recomendaciones.append("⚠️ REVISAR: Anomalías detectadas requieren atención")
            recomendaciones.append("📸 Solicitar nueva foto si es necesario")
        
        elif nivel_riesgo == "bajo":
            recomendaciones.append("✅ PROCEDER: Anomalías menores detectadas")
            recomendaciones.append("👁️ Supervisión estándar recomendada")
        
        # Recomendaciones específicas por tipo de anomalía
        for anomalia in anomalias:
            if "confusión O/0" in anomalia:
                recomendaciones.append("🔧 Sugerir al conductor: Revisar que todos los ceros sean legibles")
            
            elif "valor extremadamente alto" in anomalia:
                recomendaciones.append("💰 Verificar monto con el conductor antes de aprobar")
            
            elif "fecha futura" in anomalia:
                recomendaciones.append("📅 Corregir fecha antes de procesar")
            
            elif "referencia de prueba" in anomalia:
                recomendaciones.append("🧪 BLOQUEAR: Posible comprobante de prueba")
        
        # Eliminar duplicados
        return list(set(recomendaciones))
    
    def generar_reporte_anomalias(self, anomalias_detectadas: Dict[str, Any]) -> str:
        """Genera un reporte legible de las anomalías detectadas"""
        
        anomalias = anomalias_detectadas.get("anomalias", [])
        alertas = anomalias_detectadas.get("alertas", [])
        criticas = anomalias_detectadas.get("alertas_criticas", [])
        nivel_riesgo = anomalias_detectadas.get("nivel_riesgo", "desconocido")
        
        reporte = f"🔍 REPORTE DE ANOMALÍAS\n"
        reporte += f"Nivel de riesgo: {nivel_riesgo.upper()}\n"
        reporte += f"Total anomalías: {len(anomalias)}\n\n"
        
        if criticas:
            reporte += "🚨 ALERTAS CRÍTICAS:\n"
            for critica in criticas:
                reporte += f"  • {critica}\n"
            reporte += "\n"
        
        if alertas:
            reporte += "⚠️ ALERTAS:\n"
            for alerta in alertas:
                reporte += f"  • {alerta}\n"
            reporte += "\n"
        
        if anomalias:
            reporte += "📋 ANOMALÍAS DETECTADAS:\n"
            for anomalia in anomalias:
                reporte += f"  • {anomalia}\n"
        
        return reporte
    
    def obtener_estadisticas(self) -> Dict[str, Any]:
        """Obtiene estadísticas del detector de anomalías"""
        return {
            "version": "1.0.0",
            "umbrales_configurados": len(self.umbrales),
            "patrones_sospechosos": {
                "valores_test": len(self.patrones_sospechosos["valores_test"]),
                "referencias_test": len(self.patrones_sospechosos["referencias_test"]),
                "errores_ocr": len(self.patrones_sospechosos["errores_ocr_comunes"])
            },
            "estado": "activo"
        }

# 🧪 Función de testing
def test_anomaly_detector():
    """Testing del detector de anomalías"""
    
    detector = AnomalyDetector()
    
    # Casos de prueba
    casos_prueba = [
        {
            "nombre": "Comprobante normal",
            "datos": {
                "valor": "250000",
                "fecha": "15/01/2025",
                "hora": "14:30",
                "entidad": "Bancolombia",
                "referencia": "1234567890"
            }
        },
        {
            "nombre": "Valor sospechosamente alto",
            "datos": {
                "valor": "100000000",  # $100M
                "fecha": "15/01/2025",
                "hora": "14:30",
                "entidad": "Nequi",  # Incoherente con Nequi
                "referencia": "1234567890"
            }
        },
        {
            "nombre": "Errores de OCR",
            "datos": {
                "valor": "25O0OO",  # O en lugar de 0
                "fecha": "32/01/2025",  # Fecha inválida
                "hora": "25:30",  # Hora inválida
                "entidad": "Bancolombia",
                "referencia": "test123"  # Referencia de test
            }
        },
        {
            "nombre": "Fecha futura y hora extraña",
            "datos": {
                "valor": "1000000",  # Valor redondo
                "fecha": "15/12/2025",  # Fecha futura
                "hora": "03:00",  # Hora muy temprana
                "entidad": "PSE",
                "referencia": "111111"  # Patrón repetitivo
            }
        }
    ]
    
    print("🧪 Testing Anomaly Detector...")
    
    for caso in casos_prueba:
        print(f"\n📋 {caso['nombre']}:")
        resultado = detector.detectar_anomalias(caso['datos'])
        
        print(f"  Nivel de riesgo: {resultado['nivel_riesgo']}")
        print(f"  Total anomalías: {resultado['total_anomalias']}")
        
        if resultado['alertas_criticas']:
            print("  🚨 Alertas críticas:")
            for critica in resultado['alertas_criticas']:
                print(f"    • {critica}")
        
        if resultado['anomalias']:
            print("  📋 Anomalías:")
            for anomalia in resultado['anomalias'][:3]:  # Mostrar solo las primeras 3
                print(f"    • {anomalia}")

if __name__ == "__main__":
    test_anomaly_detector()