from pydantic import BaseModel
from typing import List, Optional

class PagoRequest(BaseModel):
    facturas: List[str]               # IDs de facturas o guías
    valor: int
    fecha: str                        # YYYY-MM-DD
    banco: str
    tipo: str                         # Nequi, Transferencia, Consignación
    referencia: str                   # Número único del pago
    operador: Optional[str] = None    # Opcional: quién sube el pago
