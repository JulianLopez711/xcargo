from typing import List
from google.cloud import bigquery
from app.core.config import GOOGLE_CREDENTIALS_PATH
import os

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_CREDENTIALS_PATH
client = bigquery.Client()

def agrupar_guias_por_referencia_y_fecha(guias: List[dict]) -> dict:
    agrupadas = {}

    for g in guias:
        clave = (g['referencia'], g['fecha'])  # agrupación por referencia + fecha
        if clave not in agrupadas:
            agrupadas[clave] = {
                "referencia": g['referencia'],
                "fecha": g['fecha'],
                "total": 0,
                "guias": []
            }
        agrupadas[clave]["guias"].append(g)
        agrupadas[clave]["total"] += g["valor"]

    return list(agrupadas.values())
