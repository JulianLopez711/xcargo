#!/usr/bin/env python3
"""
Script para probar recuperación de clave con xcargoibague@gmail.com
"""

import requests
import json
from datetime import datetime

def test_recuperacion_clave(correo):
    """Prueba completa del flujo de recuperación de clave"""
    
    print(f"🔐 PROBANDO RECUPERACIÓN DE CLAVE")
    print(f"📧 Correo: {correo}")
    print(f"⏰ Timestamp: {datetime.now().isoformat()}")
    print("=" * 60)
    
    # URL del endpoint
    url = "https://api.x-cargo.co/auth/solicitar-codigo"
    
    try:
        # Hacer el request
        response = requests.post(url, data={"correo": correo}, timeout=15)
        
        print(f"\n📊 RESPUESTA DEL SERVIDOR:")
        print(f"   🌐 URL: {url}")
        print(f"   📧 Correo enviado: {correo}")
        print(f"   📈 Status Code: {response.status_code}")
        print(f"   🕒 Tiempo de respuesta: {response.elapsed.total_seconds():.2f}s")
        
        # Headers importantes
        print(f"\n📋 HEADERS RELEVANTES:")
        for header in ['content-type', 'server', 'cache-control']:
            if header in response.headers:
                print(f"   {header}: {response.headers[header]}")
        
        # Respuesta JSON
        try:
            response_json = response.json()
            print(f"\n📝 RESPUESTA JSON:")
            print(json.dumps(response_json, indent=4, ensure_ascii=False))
        except:
            print(f"\n📝 RESPUESTA TEXT:")
            print(f"   {response.text}")
        
        # Análisis detallado
        print(f"\n🔍 ANÁLISIS:")
        if response.status_code == 200:
            print("✅ ÉXITO: Código de recuperación enviado")
            print("   📩 Revisa el correo electrónico para obtener el código")
            print("   ⏱️  El código expira en 15 minutos")
            return True
            
        elif response.status_code == 404:
            print("❌ CORREO NO REGISTRADO")
            print("   📧 El correo no está en el sistema")
            print("   💡 Soluciones posibles:")
            print("      - Verificar que el correo esté bien escrito")
            print("      - Contactar al administrador para registrarlo")
            print("      - Usar un correo diferente que sí esté registrado")
            return False
            
        elif response.status_code == 422:
            print("❌ DATOS INVÁLIDOS")
            print("   📝 El formato del correo o datos enviados son incorrectos")
            return False
            
        elif response.status_code == 500:
            print("❌ ERROR DEL SERVIDOR")
            print("   🔧 Problema interno del backend")
            print("   📞 Contactar al equipo técnico")
            return False
            
        else:
            print(f"⚠️ RESPUESTA INESPERADA: {response.status_code}")
            print("   🔍 Revisar logs del servidor")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ ERROR DE CONEXIÓN")
        print("   🌐 No se pudo conectar al servidor")
        print("   💡 Verificar:")
        print("      - Conexión a internet")
        print("      - Estado del servidor")
        print("      - URL correcta")
        return False
        
    except requests.exceptions.Timeout:
        print("❌ TIMEOUT")
        print("   ⏱️  El servidor tardó demasiado en responder")
        print("   🔄 Intentar nuevamente")
        return False
        
    except Exception as e:
        print(f"❌ ERROR INESPERADO: {str(e)}")
        return False

def test_cambio_clave_demo():
    """Demuestra cómo sería el siguiente paso (cambio de clave)"""
    print(f"\n" + "="*60)
    print("📖 SIGUIENTE PASO: CAMBIO DE CLAVE")
    print("="*60)
    
    print("""
🔄 FLUJO COMPLETO DE RECUPERACIÓN:

1️⃣  SOLICITAR CÓDIGO (lo que acabamos de probar)
   POST /auth/solicitar-codigo
   Body: { "correo": "usuario@example.com" }
   
2️⃣  CAMBIAR CLAVE (siguiente paso)
   POST /auth/cambiar-clave
   Body: { 
     "correo": "usuario@example.com",
     "codigo": "123456",
     "nueva_clave": "MiNuevaClaveSegura123"
   }

📧 PROCESO PARA EL USUARIO:
   1. Usuario ingresa su correo
   2. Sistema envía código por email (si el correo existe)
   3. Usuario recibe email con código de 6 dígitos
   4. Usuario ingresa código + nueva contraseña
   5. Sistema actualiza la contraseña

⏱️  LIMITACIONES:
   - Código expira en 15 minutos
   - Un código por correo a la vez
   - Solo funciona con correos registrados en el sistema
""")

if __name__ == "__main__":
    # Correo a probar
    correo_test = "xcargoibague@gmail.com"
    
    print("🚀 INICIANDO PRUEBA DE RECUPERACIÓN DE CLAVE")
    print("=" * 60)
    
    # Probar el endpoint
    resultado = test_recuperacion_clave(correo_test)
    
    # Mostrar información adicional
    test_cambio_clave_demo()
    
    # Resumen final
    print(f"\n" + "="*60)
    print("📋 RESUMEN")
    print("="*60)
    
    if resultado:
        print(f"✅ El endpoint funciona correctamente con {correo_test}")
        print("📩 Si el correo está registrado, deberías recibir un email")
        print("🔄 Usa el código recibido para el siguiente paso")
    else:
        print(f"❌ Problemas detectados con {correo_test}")
        print("🔍 Revisar análisis anterior para soluciones")
    
    print(f"\n💡 CORREOS ALTERNATIVOS PARA PROBAR:")
    print(f"   - vivian.cardenas@x-cargo.co (visto en el script)")
    print(f"   - Cualquier correo registrado en el sistema")
    
    print(f"\n🎯 SIGUIENTE ACCIÓN RECOMENDADA:")
    if resultado:
        print("   1. Revisar el email para obtener el código")
        print("   2. Probar el endpoint /auth/cambiar-clave")
    else:
        print("   1. Verificar que el correo esté registrado en el sistema")
        print("   2. Contactar al administrador si es necesario")
        print("   3. Probar con un correo que sepas que existe")