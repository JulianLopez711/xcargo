from datetime import datetime, date
from typing import Optional, Tuple, Dict, Any

def calcular_diferencia_valor(valor_pago: float, valor_banco: float) -> Tuple[float, float]:
    """
    Calcula la diferencia absoluta y el porcentaje entre dos valores monetarios
    """
    diferencia = abs(valor_pago - valor_banco)
    porcentaje = (diferencia / valor_pago * 100) if valor_pago > 0 else 100.0
    return diferencia, porcentaje

def calcular_diferencia_fecha(fecha_pago: date, fecha_banco: date) -> int:
    """
    Calcula la diferencia en días entre dos fechas
    """
    return abs((fecha_pago - fecha_banco).days)

def determinar_estado_conciliacion(
    diferencia_valor: float,
    diferencia_dias: int,
    tipo_pago: str,
    descripcion_banco: str
) -> Tuple[str, float]:
    """
    Determina el estado de conciliación basado en las diferencias y el tipo de pago
    """
    score = 0.0
    
    # Score por diferencia de valor
    if diferencia_valor < 1:
        score += 100
    elif diferencia_valor <= 100:
        score += 80 - (diferencia_valor / 100 * 20)

    # Score por diferencia de días
    if diferencia_dias == 0:
        score += 100
    elif diferencia_dias <= 3:
        score += 80 - (diferencia_dias * 10)

    # Score por tipo de pago
    tipo_pago = tipo_pago.lower()
    descripcion_banco = descripcion_banco.lower()
    
    if (
        ('nequi' in tipo_pago and 'nequi' in descripcion_banco) or
        ('consignacion' in tipo_pago and 'consignacion' in descripcion_banco) or
        ('transferencia' in tipo_pago and 'transferencia' in descripcion_banco)
    ):
        score += 20

    score = score / 2  # Normalizar a 100

    if score >= 90:
        return 'conciliado_exacto', score
    elif score >= 80:
        return 'conciliado_aproximado', score
    else:
        return 'pendiente_conciliacion', score

def actualizar_metadata_conciliacion(
    metadata: Dict[str, Any],
    conciliado_por: str,
    observaciones: Optional[str] = None
) -> Dict[str, Any]:
    """
    Actualiza la metadata de conciliación con información de trazabilidad
    """
    timestamp = datetime.utcnow()
    
    metadata.update({
        'conciliado_por': conciliado_por,
        'conciliado_en': timestamp,
        'modificado_por': conciliado_por,
        'modificado_en': timestamp
    })
    
    if observaciones:
        if metadata.get('observaciones'):
            metadata['observaciones'] += f" | {observaciones}"
        else:
            metadata['observaciones'] = observaciones
            
    return metadata

def validar_conciliacion_lista(pago: Dict[str, Any], banco: Dict[str, Any]) -> bool:
    """
    Valida si un par pago-movimiento bancario está listo para conciliar
    """
    # Verificar estado del pago
    if pago.get('estado') != 'aprobado':
        return False
        
    # Verificar que tenga id_banco_asociado válido
    if not banco or not banco.get('id'):
        return False
        
    # Verificar estado de conciliación
    estado = pago.get('estado_conciliacion', '').lower()
    estados_validos = {'conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual'}
    
    if estado not in estados_validos:
        return False
        
    return True
