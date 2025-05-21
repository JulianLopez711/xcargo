from fastapi import APIRouter, HTTPException
from google.cloud import bigquery
from datetime import datetime

router = APIRouter(prefix="/cruces", tags=["Cruces"])

@router.get("/cruces")
def obtener_cruces():
    client = bigquery.Client()

    # Consulta los pagos del banco cargados recientemente
    query_banco = """
        SELECT id, fecha, valor_banco, tipo, cargado_en
        FROM `datos-clientes-441216.Conciliaciones.banco_raw`
        WHERE conciliado_manual IS NULL OR conciliado_manual = FALSE
    """
    banco_rows = client.query(query_banco).result()
    banco_data = [dict(row) for row in banco_rows]

    if not banco_data:
        return []

    # Consulta los pagos realizados por conductores
    query_pagos = """
        SELECT fecha_pago AS fecha, valor, tipo, referencia, tracking
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
    """
    pagos_rows = client.query(query_pagos).result()
    pagos_data = [dict(row) for row in pagos_rows]

    resultados = []
    for banco in banco_data:
        coincidencias = [
            pago for pago in pagos_data
            if str(pago["fecha"]) == str(banco["fecha"])
            and pago["valor"] == banco["valor_banco"]
            and pago["tipo"].lower() == banco["tipo"].lower()
        ]

        if len(coincidencias) == 1:
            coincidencia = "conciliado"
            tracking = coincidencias[0].get("tracking")
        elif len(coincidencias) > 1:
            coincidencia = "duda"
            tracking = None
        else:
            coincidencia = "pendiente"
            tracking = None

        resultados.append({
            "id": banco["id"],
            "fecha": banco["fecha"],
            "valor_banco": banco["valor_banco"],
            "tipo": banco["tipo"],
            "coincidencia": coincidencia,
            "tracking": tracking
        })

    return resultados
