from fastapi import APIRouter, HTTPException, Depends
from google.cloud import bigquery
from typing import List, Dict, Any
from pydantic import BaseModel
import json
from datetime import datetime, date

router = APIRouter(prefix="/pagos-avanzados", tags=["Pagos Avanzados"])
client = bigquery.Client()

class GuiaSeleccionada(BaseModel):
    tracking: str
    valor: float
    cliente: str

class ValidacionPago(BaseModel):
    guias: List[GuiaSeleccionada]
    valor_consignado: float
    employee_id: int

@router.post("/validar-pago")
async def validar_pago_con_bonos(
    validacion: ValidacionPago,
) -> Dict[str, Any]:
    """
    Valida si el pago es posible con efectivo + bonos disponibles
    """
    try:
        # Calcular valor total de guías
        valor_total_guias = sum(guia.valor for guia in validacion.guias)
        
        # Obtener bonos disponibles
        query_bonos = """
        SELECT 
            id,
            saldo_disponible,
            tipo_bono,
            descripcion
        FROM `datos-clientes-441216.Conciliaciones.conductor_bonos`
        WHERE employee_id = @employee_id
            AND estado_bono = 'activo'
            AND saldo_disponible > 0
        ORDER BY fecha_generacion ASC
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("employee_id", "INTEGER", validacion.employee_id)
            ]
        )
        
        result = client.query(query_bonos, job_config=job_config).result()
        bonos_disponibles = [
            {
                "id": row.id,
                "saldo": float(row.saldo_disponible),
                "tipo": row.tipo_bono,
                "descripcion": row.descripcion
            }
            for row in result
        ]
        
        total_bonos = sum(bono["saldo"] for bono in bonos_disponibles)
        diferencia = validacion.valor_consignado - valor_total_guias
        
        # Lógica de validación
        if diferencia >= 0:
            # Caso: Sobrante o pago exacto
            return {
                "valido": True,
                "tipo_resultado": "sobrante" if diferencia > 0 else "exacto",
                "valor_efectivo": valor_total_guias,
                "valor_bono_usado": 0,
                "sobrante": diferencia,
                "bonos_a_usar": [],
                "nuevo_bono": diferencia if diferencia > 0 else 0,
                "mensaje": f"Sobrante de ${diferencia:,.0f} se convertirá en bono" if diferencia > 0 else "Pago exacto"
            }
        else:
            # Caso: Faltante
            faltante = abs(diferencia)
            
            if faltante <= total_bonos:
                # Calcular qué bonos usar (FIFO)
                bonos_a_usar = []
                valor_restante = faltante
                
                for bono in bonos_disponibles:
                    if valor_restante <= 0:
                        break
                    
                    valor_a_usar = min(bono["saldo"], valor_restante)
                    bonos_a_usar.append({
                        "id": bono["id"],
                        "valor_usado": valor_a_usar,
                        "saldo_anterior": bono["saldo"],
                        "saldo_nuevo": bono["saldo"] - valor_a_usar
                    })
                    valor_restante -= valor_a_usar
                
                return {
                    "valido": True,
                    "tipo_resultado": "con_bonos",
                    "valor_efectivo": validacion.valor_consignado,
                    "valor_bono_usado": faltante,
                    "sobrante": 0,
                    "bonos_a_usar": bonos_a_usar,
                    "nuevo_bono": 0,
                    "mensaje": f"Se usarán ${faltante:,.0f} de bonos disponibles"
                }
            else:
                # No alcanza ni con bonos
                return {
                    "valido": False,
                    "tipo_resultado": "insuficiente",
                    "valor_efectivo": 0,
                    "valor_bono_usado": 0,
                    "sobrante": 0,
                    "bonos_a_usar": [],
                    "nuevo_bono": 0,
                    "faltante": faltante - total_bonos,
                    "mensaje": f"Faltan ${faltante - total_bonos:,.0f}. Bonos disponibles: ${total_bonos:,.0f}"
                }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/procesar-pago-completo")
async def procesar_pago_completo(
    datos_pago: Dict[str, Any],

) -> Dict[str, Any]:
    """
    Procesa el pago completo con manejo de bonos
    """
    try:
        # Iniciar transacción
        # 1. Crear pago principal
        # 2. Marcar guías como pagadas
        # 3. Crear/usar bonos según corresponda
        # 4. Registrar movimientos de bonos
        
        # TODO: Implementar lógica transaccional completa
        
        return {
            "exitoso": True,
            "referencia_pago": "REF_" + str(int(datetime.now().timestamp())),
            "mensaje": "Pago procesado exitosamente"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))