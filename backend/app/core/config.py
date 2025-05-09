import os
from dotenv import load_dotenv

# Carga las variables del archivo .env si existe
load_dotenv()

# Ruta del archivo de credenciales de Google Cloud
GOOGLE_CREDENTIALS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH", "app/credentials/datos-clientes-441216-e0f1e3740f41.json")

# Clave de API de OpenAI (segura)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# CORS
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
