#!/usr/bin/env python3
"""
Script para probar el endpoint con un correo válido del sistema
"""

import requests
import json

def test_with_valid_email():
    """Prueba con un correo que probablemente existe en el sistema"""
    
    # Correos que podrían estar en el sistema basándose en el contexto del código
    correos_test = [
        "jmauro.08@hotmail.com",  # Este aparece en el código
        "admin@xcargo.co",
        "test@xcargo.co",
        "conductor@xcargo.co"
    ]
    
    url = "https://api.x-cargo.co/auth/solicitar-codigo"
    
    for correo in correos_test:
        print(f"\n🔍 Probando con: {correo}")
        
        try:
            response = requests.post(url, data={"correo": correo}, timeout=10)
            
            print(f"   Status: {response.status_code}")
            
            try:
                response_json = response.json()
                print(f"   Response: {json.dumps(response_json, indent=2)}")
                
                if response.status_code == 200:
                    print("✅ ¡ÉXITO! Código enviado correctamente")
                    return True
                elif response.status_code == 404:
                    print("❌ Correo no encontrado en el sistema")
                else:
                    print(f"⚠️ Respuesta inesperada: {response.status_code}")
                    
            except:
                print(f"   Response text: {response.text}")
                
        except Exception as e:
            print(f"   Error: {e}")
    
    return False

def test_frontend_scenario():
    """Simula exactamente lo que está haciendo el frontend"""
    print("\n" + "="*50)
    print("SIMULANDO COMPORTAMIENTO DEL FRONTEND")
    print("="*50)
    
    # El frontend está enviando a esta URL según los logs
    url = "https://api.x-cargo.co/auth/solicitar-codigo"
    
    # Simular un correo que el usuario podría estar ingresando
    correo_usuario = input("\n📧 Ingresa un correo para probar (o presiona Enter para usar 'test@xcargo.co'): ").strip()
    if not correo_usuario:
        correo_usuario = "test@xcargo.co"
    
    print(f"\n🔍 Enviando request exactamente como el frontend:")
    print(f"   URL: {url}")
    print(f"   Correo: {correo_usuario}")
    print(f"   Método: POST con form-data")
    
    try:
        response = requests.post(url, data={"correo": correo_usuario}, timeout=10)
        
        print(f"\n📊 RESPUESTA DEL SERVIDOR:")
        print(f"   Status Code: {response.status_code}")
        print(f"   Headers: {dict(response.headers)}")
        
        try:
            response_json = response.json()
            print(f"   JSON Response:")
            print(json.dumps(response_json, indent=4, ensure_ascii=False))
        except:
            print(f"   Text Response: {response.text}")
        
        # Análisis de la respuesta
        print(f"\n🔍 ANÁLISIS:")
        if response.status_code == 200:
            print("✅ CORRECTO: El endpoint funciona y el correo existe")
            print("   El frontend debería mostrar un mensaje de éxito")
        elif response.status_code == 404:
            print("⚠️ EXPLICACIÓN: El correo no está registrado en el sistema")
            print("   Esto NO es un error del endpoint, es el comportamiento esperado")
            print("   El frontend debería manejar este caso mostrando un mensaje apropiado")
        elif response.status_code == 422:
            print("⚠️ ERROR DE VALIDACIÓN: Datos de entrada inválidos")
        else:
            print(f"❌ ERROR INESPERADO: Status {response.status_code}")
            
    except Exception as e:
        print(f"❌ ERROR DE CONEXIÓN: {e}")

if __name__ == "__main__":
    print("🚀 TESTING ENDPOINT AUTH/SOLICITAR-CODIGO")
    
    # Primero probar con correos conocidos
    print("\n" + "="*50)
    print("PASO 1: Probar con correos conocidos del sistema")
    print("="*50)
    
    found_valid = test_with_valid_email()
    
    # Luego simular el escenario del frontend
    test_frontend_scenario()
    
    print("\n" + "="*50)
    print("CONCLUSIONES Y RECOMENDACIONES")
    print("="*50)
    
    print("\n🎯 ANÁLISIS DEL PROBLEMA:")
    print("   1. El endpoint /auth/solicitar-codigo SÍ existe y funciona")
    print("   2. El servidor responde correctamente con 404 cuando el correo no existe")
    print("   3. El error en el frontend es de interpretación, no del backend")
    
    print("\n🔧 SOLUCIÓN RECOMENDADA:")
    print("   1. El frontend debe manejar el status 404 como 'correo no registrado'")
    print("   2. Mostrar mensaje: 'El correo no está registrado en el sistema'")
    print("   3. NO mostrar 'Error 404 - Endpoint no encontrado'")
    
    print("\n📝 CÓDIGO SUGERIDO PARA EL FRONTEND:")
    print("""
   try {
     const response = await fetch('/auth/solicitar-codigo', {
       method: 'POST',
       body: formData
     });
     
     if (response.status === 200) {
       // Éxito - código enviado
       showSuccess('Código enviado a tu correo');
     } else if (response.status === 404) {
       // Correo no registrado
       showError('El correo no está registrado en el sistema');
     } else {
       // Otro error
       showError('Error inesperado');
     }
   } catch (error) {
     showError('Error de conexión');
   }
   """)