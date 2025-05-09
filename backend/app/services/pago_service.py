from app.models.pago import PagoRequest

# Esto simula una "base de datos temporal"
pagos_registrados = []

def registrar_pago(pago: PagoRequest):
    pagos_registrados.append(pago)
    return {"msg": "Pago registrado exitosamente", "total_registrado": len(pagos_registrados)}
