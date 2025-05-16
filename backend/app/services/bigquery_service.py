import os
from google.cloud import bigquery
from app.core.config import GOOGLE_CREDENTIALS_PATH

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_CREDENTIALS_PATH

client = bigquery.Client()

def obtener_pagos_pendientes():
    try:
        query = """
            SELECT 
                tracking_number AS tracking,
                Empleado AS conductor,
                carrier AS empresa,
                Valor,
                Status_Date AS fecha
            FROM `datos-clientes-441216.Conciliaciones.COD_pendiente`
            WHERE StatusP = 'Pendiente'
        """

        resultados = client.query(query).result()

        pagos = []
        for row in resultados:
            pagos.append({
                "tracking": row.tracking,
                "conductor": row.conductor,
                "empresa": row.empresa,
                "valor": row.Valor,
                "fecha": str(row.fecha)
            })
        return pagos
    except Exception as e:
        print("❌ ERROR EN BIGQUERY:", e)
        return []


# Simulación de base de datos temporal para relaciones de prueba
db_relaciones_temporal = []

def registrar_relacion_pago_guias(referencia: str, guias: list):
    try:
        relacion = {
            "referencia": referencia,
            "guias": guias,
        }
        db_relaciones_temporal.append(relacion)
        print(f"✅ Relación registrada en prueba: {relacion}")
        return {"mensaje": "Relación guardada en memoria temporal"}
    except Exception as e:
        print("❌ Error al registrar relación:", e)
        return {"error": str(e)}

def obtener_relaciones_temporales():
    return db_relaciones_temporal

def obtener_roles():
    return [
        {"id_rol": "1", "nombre_rol": "Administrador", "descripcion": "Control total del sistema"},
        {"id_rol": "2", "nombre_rol": "Conductor", "descripcion": "Registra pagos y entregas"},
        {"id_rol": "3", "nombre_rol": "Contabilidad", "descripcion": "Conciliación y reportes"},
        {"id_rol": "4", "nombre_rol": "Operador", "descripcion": "Carga entregas y pagos"},
        {"id_rol": "5", "nombre_rol": "Director", "descripcion": "Vista general de datos"},
    ]


