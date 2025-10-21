#!/usr/bin/env python3
"""
Script de prueba para verificar el endpoint /auth/solicitar-codigo
"""

import requests
import json
from datetime import datetime

# Configuración
BASE_URL = "https://api.x-cargo.co"
LOCAL_URL = "http://localhost:8000"

def test_endpoint(base_url, correo_test="test@example.com"):
    """Prueba el endpoint de solicitar código"""
    url = f"{base_url}/auth/solicitar-codigo"
    
    print(f"\n🔍 Probando endpoint: {url}")
    print(f"📧 Correo de prueba: {correo_test}")
    print(f"⏰ Timestamp: {datetime.now().isoformat()}")
    
    try:
        # Preparar datos del request
        data = {
            "correo": correo_test
        }
        
        # Hacer request POST
        response = requests.post(url, data=data, timeout=10)
        
        print(f"\n📊 RESULTADOS:")
        print(f"   Status Code: {response.status_code}")
        print(f"   Headers: {dict(response.headers)}")
        
        try:
            response_json = response.json()
            print(f"   Response JSON: {json.dumps(response_json, indent=2)}")
        except:
            print(f"   Response Text: {response.text}")
        
        # Análisis del resultado
        if response.status_code == 200:
            print("✅ ÉXITO: Endpoint funcionando correctamente")
        elif response.status_code == 404:
            print("❌ ERROR 404: Endpoint no encontrado - revisar configuración del servidor")
        elif response.status_code == 422:
            print("⚠️ ERROR 422: Datos de entrada inválidos")
        else:
            print(f"⚠️ ERROR {response.status_code}: Respuesta inesperada")
            
        return response
        
    except requests.exceptions.ConnectionError:
        print("❌ ERROR: No se pudo conectar al servidor")
        print("   - Verificar que el servidor esté ejecutándose")
        print("   - Verificar la URL base")
        return None
    except requests.exceptions.Timeout:
        print("❌ ERROR: Timeout - el servidor no respondió a tiempo")
        return None
    except Exception as e:
        print(f"❌ ERROR inesperado: {str(e)}")
        return None

def test_root_endpoint(base_url):
    """Prueba el endpoint raíz para verificar conectividad básica"""
    url = f"{base_url}/"
    print(f"\n🏠 Probando endpoint raíz: {url}")
    
    try:
        response = requests.get(url, timeout=5)
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            print("✅ Servidor respondiendo correctamente")
            try:
                print(f"   Response: {response.json()}")
            except:
                print(f"   Response: {response.text}")
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Error conectando al servidor: {e}")
        return False

if __name__ == "__main__":
    print("🚀 INICIANDO PRUEBAS DEL ENDPOINT AUTH")
    
    # Probar primero conectividad básica
    print("\n" + "="*50)
    print("PASO 1: Verificar conectividad básica")
    print("="*50)
    
    server_online = test_root_endpoint(BASE_URL)
    
    if not server_online:
        print("\n⚠️ El servidor principal no responde, probando servidor local...")
        server_online = test_root_endpoint(LOCAL_URL)
        if server_online:
            BASE_URL = LOCAL_URL
            print(f"✅ Usando servidor local: {BASE_URL}")
    
    if not server_online:
        print("\n❌ No se pudo conectar a ningún servidor")
        exit(1)
    
    # Probar endpoint de solicitar código
    print("\n" + "="*50)
    print("PASO 2: Probar endpoint /auth/solicitar-codigo")
    print("="*50)
    
    # Correo que sabemos que no existe (para probar el flujo)
    test_endpoint(BASE_URL, "usuario.inexistente@test.com")
    
    # Si tienes un correo de prueba válido, úsalo aquí
    print("\n" + "-"*30)
    print("Probando con correo potencialmente válido...")
    test_endpoint(BASE_URL, "test@xcargo.co")
    
    print("\n🏁 PRUEBAS COMPLETADAS")
    print("\nINSTRUCCIONES PARA DEBUGGING:")
    print("1. Si obtienes 404: verificar que el servidor FastAPI esté ejecutándose")
    print("2. Si obtienes 422: el endpoint existe pero los datos son inválidos")
    print("3. Si obtienes 500: error interno del servidor - revisar logs")
    print("4. Si obtienes ConnectionError: verificar URL y que el servidor esté activo")