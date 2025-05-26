from fastapi import APIRouter, HTTPException, Depends
from google.cloud import bigquery
from app.dependencies import get_current_user

router = APIRouter(prefix="/supervisor", tags=["Supervisor"])

PROJECT_ID = "datos-clientes-441216"
DATASET = "Conciliaciones"

bq_client = bigquery.Client()

def verificar_supervisor(user = Depends(get_current_user)):
    if user["rol"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    return user

@router.get("/dashboard/{empresa_carrier}")
async def get_dashboard_supervisor(empresa_carrier: str, user = Depends(verificar_supervisor)):
    try:
        # Por ahora devolver datos de ejemplo
        return {
            "stats": {
                "total_conductores": 15,
                "conductores_activos": 12,
                "pagos_pendientes": 8,
                "entregas_pendientes": 23,
                "total_monto_pendiente": 2450000
            },
            "conductores_recientes": [
                {"nombre": "Juan Pérez", "ultimo_pago": "2025-05-20", "estado": "activo", "pagos_pendientes": 2},
                {"nombre": "María González", "ultimo_pago": "2025-05-22", "estado": "activo", "pagos_pendientes": 1},
                {"nombre": "Carlos Rodríguez", "ultimo_pago": "2025-05-18", "estado": "inactivo", "pagos_pendientes": 3}
            ]
        }
    except Exception as e:
        print(f"Error en dashboard supervisor: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

@router.get("/conductores/{empresa_carrier}")
async def get_conductores_supervisor(empresa_carrier: str, user = Depends(verificar_supervisor)):
    # Datos de ejemplo
    return [
        {
            "id": "1",
            "nombre": "Juan Pérez González",
            "correo": "juan.perez@empresa.com",
            "telefono": "+57 300 123 4567",
            "cedula": "12345678",
            "vehiculo": "Chevrolet NPR",
            "placa": "ABC-123",
            "estado": "activo",
            "fecha_registro": "2024-03-15",
            "ultimo_pago": "2025-05-20",
            "pagos_pendientes": 2,
            "total_entregas": 45,
            "calificacion": 4.8
        }
    ]

@router.get("/pagos/{empresa_carrier}")
async def get_pagos_supervisor(empresa_carrier: str, user = Depends(verificar_supervisor)):
    # Datos de ejemplo
    return [
        {
            "id": "1",
            "conductor_nombre": "Juan Pérez",
            "conductor_id": "1",
            "guia_numero": "GU001234",
            "cliente": "Almacenes Éxito",
            "destino": "Bogotá - Suba",
            "monto": 85000,
            "fecha_entrega": "2025-05-20",
            "estado": "pendiente",
            "dias_pendiente": 5,
            "tipo_pago": "efectivo"
        }
    ]