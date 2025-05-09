import os
from google.cloud import bigquery
from app.core.config import GOOGLE_CREDENTIALS_PATH

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_CREDENTIALS_PATH
client = bigquery.Client()

def obtener_guias_pendientes():
    query = """
        SELECT
            tracking_number,
            Ciudad,
            Departamento,
            Valor,
            Status_Date AS fecha,
            carrier AS empresa,
            Empleado AS conductor,
            Empleado_id AS conductor_id
        FROM `datos-clientes-441216.pickup_data.COD_Pendiente`
        WHERE Ruta = 360
    """
    return [dict(row) for row in client.query(query).result()]
