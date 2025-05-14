from pydantic import BaseModel
from typing import List

class GuiaAsignada(BaseModel):
    tracking: str
    cliente: str
    valor_asignado: float

class RegistroPago(BaseModel):
    referencia: str
    valor_total: float
    excedente: float
    fecha: str
    hora: str
    entidad: str
    tipo_pago: str
    guias: List[GuiaAsignada]
