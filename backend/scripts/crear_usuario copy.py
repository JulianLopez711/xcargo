from google.cloud import bigquery
import os
import bcrypt
import datetime
from dotenv import load_dotenv
from app.core.config import GOOGLE_CREDENTIALS_PATH

# Cargar variables desde .env
load_dotenv()
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_CREDENTIALS_PATH

# Cliente BigQuery
client = bigquery.Client()

# Datos del nuevo rol
id_rol = "1"
nombre_rol = "operador"
descripcion = "Encargado de la administración del sistema"

# Crear entrada de rol
nuevo_rol = [{
    "id_rol": id_rol,  # Asegúrate que este campo sea coherente con la tabla
    "nombre_rol": nombre_rol,
    "descripcion": descripcion
}]

# Tabla destino en BigQuery
table_id = "datos-clientes-441216.Conciliaciones.roles"

# Insertar en la tabla
errors = client.insert_rows_json(table_id, nuevo_rol)

if not errors:
    print("✅ Rol insertado correctamente.")
else:
    print("❌ Errores al insertar el rol:", errors)
