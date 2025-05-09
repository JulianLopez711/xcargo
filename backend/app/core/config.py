import os
from dotenv import load_dotenv

load_dotenv()

GOOGLE_CREDENTIALS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH", "app/credentials/datos-clientes-xxxx.json")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
