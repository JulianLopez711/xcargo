import os
from google.cloud import bigquery
from app.core.config import GOOGLE_CREDENTIALS_PATH

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_CREDENTIALS_PATH

client = bigquery.Client()

def obtener_pagos_pendientes():
    try:
        query = """
            SELECT
    tracking_number AS guia,
    Empleado AS conductor,
    carrier AS empresa,
    Valor AS valor,
    Status_Date AS fecha
    FROM
    `datos-clientes-441216.pickup_data.COD_Pendiente`
    WHERE
    Status_Date IS NOT NULL
    ORDER BY
    Status_Date DESC
    LIMIT 40
        """
        resultados = client.query(query).result()

        pagos = []
        for row in resultados:
                print(dict(row))  # Imprime cada fila
                pagos.append({
                    "guia": row.guia,
                    "conductor": row.conductor,
                    "empresa": row.empresa,
                    "valor": row.valor,
                    "fecha": str(row.fecha)
                })
        return pagos
    except Exception as e:
        print("❌ ERROR EN BIGQUERY:", e)
        return []
