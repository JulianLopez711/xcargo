#!/usr/bin/env python3
"""
Script para probar con el correo del script: vivian.cardenas@x-cargo.co
"""

import requests
import json

def test_correo_conocido():
    """Prueba con el correo que sabemos que existe en el script"""
    
    correo = "vivian.cardenas@x-cargo.co"
    url = "https://api.x-cargo.co/auth/solicitar-codigo"
    
    print(f"🔐 PROBANDO CON CORREO DEL SCRIPT")
    print(f"📧 Correo: {correo}")
    print("=" * 50)
    
    try:
        response = requests.post(url, data={"correo": correo}, timeout=10)
        
        print(f"📈 Status Code: {response.status_code}")
        
        try:
            data = response.json()
            print(f"📝 Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
        except:
            print(f"📝 Response text: {response.text}")
        
        if response.status_code == 200:
            print("\n✅ ¡ÉXITO! El correo está registrado y el código fue enviado")
            print("📩 Deberías recibir un email con el código de 6 dígitos")
            print("⏱️  El código expira en 15 minutos")
            return True
        elif response.status_code == 404:
            print(f"\n❌ El correo {correo} tampoco está registrado")
            return False
        else:
            print(f"\n⚠️ Respuesta inesperada: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def crear_usuario_para_prueba():
    """Información sobre cómo crear un usuario para prueba"""
    print(f"\n" + "="*50)
    print("📝 CÓMO CREAR UN USUARIO PARA PRUEBA")
    print("="*50)
    
    print("""
🔧 OPCIÓN 1: Ejecutar el script de creación
   cd backend/scripts
   python crear_credenciales_usuario.py
   
🔧 OPCIÓN 2: Modificar el script para tu correo
   1. Abrir: backend/scripts/crear_credenciales_usuario.py
   2. Cambiar línea 248: correo = "tu-correo@ejemplo.com"
   3. Ejecutar el script
   
🔧 OPCIÓN 3: Crear manualmente via API
   POST /admin/crear-usuario
   Body: {
     "nombre": "Tu Nombre",
     "correo": "xcargoibague@gmail.com", 
     "telefono": "123456789",
     "rol": "conductor",
     "empresa_carrier": "XCargo"
   }
""")

if __name__ == "__main__":
    print("🚀 PRUEBA CON CORREO CONOCIDO")
    
    # Probar con correo del script
    resultado = test_correo_conocido()
    
    if not resultado:
        crear_usuario_para_prueba()
        
        print(f"\n🎯 RECOMENDACIÓN:")
        print("1. Crear usuario con xcargoibague@gmail.com usando el script")
        print("2. Luego probar la recuperación de clave")
        
        # Mostrar cómo modificar el script
        print(f"\n📝 PARA CREAR EL USUARIO xcargoibague@gmail.com:")
        print("Modifica estas líneas en crear_credenciales_usuario.py:")
        print('   correo = "xcargoibague@gmail.com"')
        print('   password_temporal = "Xcargo123"') 
        print('   rol = "conductor"  # o el rol que necesites')
    else:
        print(f"\n🎉 ¡Perfecto! El endpoint funciona correctamente")
        print("Ahora puedes probar el flujo completo de cambio de clave")