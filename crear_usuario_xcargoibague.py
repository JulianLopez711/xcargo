#!/usr/bin/env python3
"""
Script para crear usuario completo: xcargoibague@gmail.com
Incluye tanto la entrada en 'usuarios' como en 'credenciales'
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from google.cloud import bigquery
import bcrypt
import datetime
import uuid

def setup_credentials():
    """Configurar credenciales de Google Cloud"""
    credentials_path = "backend/app/credentials/datos-clientes-441216-e0f1e3740f41.json"
    if os.path.exists(credentials_path):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path
        print(f"✅ Credenciales configuradas: {credentials_path}")
    else:
        print(f"⚠️ Archivo de credenciales no encontrado: {credentials_path}")

def crear_usuario_completo():
    """Crear usuario completo en ambas tablas"""
    
    # Datos del usuario
    correo = "xcargoibague@gmail.com"
    nombre = "XCargo Ibagué"
    telefono = "300-123-4567"
    empresa_carrier = "XCargo"
    password_temporal = "Xcargo123"
    rol = "conductor"
    
    try:
        setup_credentials()
        client = bigquery.Client()
        
        print(f"🔐 CREANDO USUARIO COMPLETO")
        print(f"📧 Correo: {correo}")
        print(f"👤 Nombre: {nombre}")
        print(f"🏷️ Rol: {rol}")
        print("=" * 50)
        
        # 1. Crear entrada en tabla usuarios
        print("\n1️⃣ Creando entrada en tabla 'usuarios'...")
        
        id_usuario = f"USR_{uuid.uuid4().hex[:8]}_{int(datetime.datetime.now().timestamp())}"
        
        usuario_data = [{
            "id_usuario": id_usuario,
            "nombre": nombre,
            "correo": correo,
            "telefono": telefono,
            "empresa_carrier": empresa_carrier,
            "creado_en": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "actualizado_en": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }]
        
        table_usuarios = "datos-clientes-441216.Conciliaciones.usuarios"
        errors = client.insert_rows_json(table_usuarios, usuario_data)
        
        if errors:
            print(f"❌ Error creando usuario: {errors}")
            return False
        
        print("✅ Usuario creado en tabla 'usuarios'")
        
        # 2. Crear credenciales
        print("\n2️⃣ Creando credenciales...")
        
        hashed_password = bcrypt.hashpw(password_temporal.encode(), bcrypt.gensalt()).decode()
        
        credenciales_data = [{
            "correo": correo,
            "hashed_password": hashed_password,
            "rol": rol,
            "clave_defecto": True,
            "creado_en": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "id_usuario": id_usuario,
            "empresa_carrier": empresa_carrier
        }]
        
        table_credenciales = "datos-clientes-441216.Conciliaciones.credenciales"
        errors = client.insert_rows_json(table_credenciales, credenciales_data)
        
        if errors:
            print(f"❌ Error creando credenciales: {errors}")
            return False
        
        print("✅ Credenciales creadas")
        
        print(f"\n🎉 ¡USUARIO CREADO EXITOSAMENTE!")
        print(f"📧 Correo: {correo}")
        print(f"🔐 Contraseña temporal: {password_temporal}")
        print(f"🏷️ Rol: {rol}")
        print(f"🆔 ID Usuario: {id_usuario}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def probar_recuperacion_clave():
    """Probar la recuperación de clave con el usuario creado"""
    import requests
    import json
    
    correo = "xcargoibague@gmail.com"
    url = "https://api.x-cargo.co/auth/solicitar-codigo"
    
    print(f"\n" + "="*50)
    print("🔍 PROBANDO RECUPERACIÓN DE CLAVE")
    print("="*50)
    
    try:
        response = requests.post(url, data={"correo": correo}, timeout=10)
        
        print(f"📈 Status Code: {response.status_code}")
        
        try:
            data = response.json()
            print(f"📝 Response:")
            print(json.dumps(data, indent=2, ensure_ascii=False))
        except:
            print(f"📝 Response text: {response.text}")
        
        if response.status_code == 200:
            print(f"\n✅ ¡PERFECTO! Recuperación de clave funciona")
            print(f"📩 Se envió código a: {correo}")
            print(f"⏱️ El código expira en 15 minutos")
            
            print(f"\n🔄 SIGUIENTE PASO - CAMBIO DE CLAVE:")
            print(f"Usa este endpoint para completar el cambio:")
            print(f"POST /auth/cambiar-clave")
            print(f"Body: {{")
            print(f'  "correo": "{correo}",')
            print(f'  "codigo": "CODIGO_DEL_EMAIL",')
            print(f'  "nueva_clave": "MiNuevaClaveSegura123"')
            print(f"}}")
            
        else:
            print(f"❌ Error: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error probando recuperación: {e}")

if __name__ == "__main__":
    print("🚀 SCRIPT PARA CREAR USUARIO Y PROBAR RECUPERACIÓN")
    print("=" * 60)
    
    # Crear usuario completo
    if crear_usuario_completo():
        # Probar recuperación de clave
        probar_recuperacion_clave()
    else:
        print("❌ No se pudo crear el usuario")