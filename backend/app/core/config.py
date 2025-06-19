import os
from dotenv import load_dotenv
from pathlib import Path


current_dir = Path(__file__).parent  # backend/app/
project_root = current_dir.parent    # backend/

# 🔧 CORREGIR: Buscar .env en la carpeta backend/ (no en app/)
env_path = project_root / ".env"  # backend/.env

# Si no está en backend/, buscar en app/
if not env_path.exists():
    env_path = current_dir / ".env"  # backend/app/.env
    

# Cargar variables de entorno
if env_path.exists():
    load_dotenv(env_path)
    print("✅ Variables de entorno cargadas desde .env")
else:
    print("⚠️ Archivo .env no encontrado, usando variables del sistema")
    load_dotenv()  # Fallback a variables del sistema

# Variables de configuración
GOOGLE_CREDENTIALS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH", "app/credentials/datos-clientes-xxxx.json")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://127.0.0.1:8000")

# 🔍 Debug: Verificar qué se cargó
print(f"🔑 OPENAI_API_KEY: {'✅ Configurada' if OPENAI_API_KEY else '❌ No encontrada'}")
if OPENAI_API_KEY:
    print(f"   Primeros 10 caracteres: {OPENAI_API_KEY[:10]}...")
    print(f"   Longitud total: {len(OPENAI_API_KEY)} caracteres")
else:
    print("🚨 PROBLEMA: OPENAI_API_KEY no se pudo cargar")
    print("📋 Verifica que:")
    print("   1. El archivo backend/.env existe")
    print("   2. Contiene: OPENAI_API_KEY=sk-proj-...")
    print("   3. No hay espacios extra o caracteres raros")

print(f"🌐 FRONTEND_ORIGIN: {FRONTEND_ORIGIN}")
print(f"📄 GOOGLE_CREDENTIALS_PATH: {GOOGLE_CREDENTIALS_PATH}")

# También exportar las variables para fácil acceso
__all__ = ['GOOGLE_CREDENTIALS_PATH', 'OPENAI_API_KEY', 'FRONTEND_ORIGIN']