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

# Usuario
correo = "julian-cliente@x-cargo.co"
password_plana = "12345678"
rol = "cliente"

hashed_password = bcrypt.hashpw(password_plana.encode(), bcrypt.gensalt()).decode()

nuevo_usuario = [{
    "correo": correo,
    "hashed_password": hashed_password,
    "rol": rol,
    "clave_defecto": True,
    "creado_en": datetime.datetime.utcnow().isoformat(),
    "id_usuario": []  # si el campo lo permite, déjalo así
}]

table_id = "datos-clientes-441216.Conciliaciones.credenciales"

errors = client.insert_rows_json(table_id, nuevo_usuario)

if not errors:
    print("✅ Usuario creado correctamente.")
else:
    print("❌ Errores al insertar:", errors)
