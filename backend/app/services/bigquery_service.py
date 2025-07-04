import os
from google.cloud import bigquery
from app.core.config import GOOGLE_CREDENTIALS_PATH

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_CREDENTIALS_PATH


def obtener_pagos_pendientes():
    """Obtiene los pagos pendientes para conductores"""
    client = bigquery.Client()
    
    query = """
        SELECT 
            tracking_number as tracking,
            Empleado as conductor,
            Cliente as empresa,
            Valor as valor,
            Status_Big as estado,
            '' as novedad
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1`
        WHERE Status_Big NOT LIKE '%Entregado%' 
AND Status_Big NOT LIKE '%360%' 
AND (Status_Big IS NULL OR Status_Big NOT LIKE '%PAGADO%')
        ORDER BY Status_Date DESC
    """
    
    try:
        resultados = client.query(query).result()
        return [dict(row) for row in resultados]
    except Exception as e:
        print(f"Error consultando pagos pendientes: {e}")
        return []

def obtener_roles():
    """Obtiene los roles disponibles"""
    client = bigquery.Client()
    
    query = """
        SELECT id_rol, nombre_rol, descripcion
        FROM `datos-clientes-441216.Conciliaciones.roles`
        ORDER BY nombre_rol
    """
    
    try:
        resultados = client.query(query).result()
        return [dict(row) for row in resultados]
    except Exception as e:
        print(f"Error consultando roles: {e}")
        return []