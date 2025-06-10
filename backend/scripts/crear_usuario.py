from google.cloud import bigquery
import os
import bcrypt
import datetime
import uuid
from dotenv import load_dotenv

def verificar_credenciales():
    """Verifica que las credenciales de Google Cloud estén configuradas correctamente"""
    # Primero intenta cargar desde .env
    load_dotenv()
    GOOGLE_CREDENTIALS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH")
    
    # Si no existe en .env, usa la ruta que mencionaste
    if not GOOGLE_CREDENTIALS_PATH:
        GOOGLE_CREDENTIALS_PATH = "backend/app/credentials/datos-clientes-441216-e0f1e3740f41.json"
        print("⚠️  No se encontró GOOGLE_CREDENTIALS_PATH en .env, usando ruta por defecto")
    
    # Si la ruta relativa no funciona, intenta la ruta completa
    if not os.path.exists(GOOGLE_CREDENTIALS_PATH):
        # Obtener directorio actual del script
        script_dir = os.path.dirname(os.path.abspath(__file__))
        # Construir ruta relativa desde el script
        GOOGLE_CREDENTIALS_PATH = os.path.join(script_dir, "..", "app", "credentials", "datos-clientes-441216-e0f1e3740f41.json")
        GOOGLE_CREDENTIALS_PATH = os.path.normpath(GOOGLE_CREDENTIALS_PATH)
    
    if not os.path.exists(GOOGLE_CREDENTIALS_PATH):
        raise RuntimeError(f"❌ El archivo de credenciales no existe en: {GOOGLE_CREDENTIALS_PATH}")
    
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_CREDENTIALS_PATH
    print(f"✅ Credenciales configuradas: {GOOGLE_CREDENTIALS_PATH}")
    
    return GOOGLE_CREDENTIALS_PATH

def obtener_estructura_tabla(client, table_id):
    """Obtiene y muestra la estructura de la tabla"""
    try:
        table = client.get_table(table_id)
        print(f"\n📋 Estructura de la tabla {table_id}:")
        print("-" * 50)
        
        for field in table.schema:
            mode = f" ({field.mode})" if field.mode != "NULLABLE" else ""
            print(f"  {field.name}: {field.field_type}{mode}")
        
        return table.schema
    except Exception as e:
        print(f"❌ Error al obtener estructura de tabla: {e}")
        return None

def crear_usuario_en_tabla_usuarios():
    """Crea un nuevo usuario en la tabla usuarios"""
    try:
        # Verificar credenciales
        verificar_credenciales()
        
        # Cliente BigQuery
        client = bigquery.Client()
        print("✅ Cliente BigQuery inicializado correctamente")
        
        # ID de la tabla de usuarios
        table_id = "datos-clientes-441216.Conciliaciones.usuarios"
        
        # Obtener estructura de la tabla primero
        schema = obtener_estructura_tabla(client, table_id)
        if not schema:
            return
        
        # Datos del nuevo usuario
        print("\n👤 Configurando nuevo usuario...")
        
        # Datos básicos del usuario
        correo = "camilo.basto@x-cargo.co"
        nombre = "Camilo Basto"
        telefono = "+57 300 123 4567"  # Agrega el teléfono real
        empresa_carrier = "X-Cargo"
        
        # Generar ID único
        user_id = str(uuid.uuid4())
        
        # Preparar datos del usuario (solo campos que existen en la tabla)
        nuevo_usuario = [{
            "id_usuario": user_id,
            "nombre": nombre,
            "correo": correo,
            "telefono": telefono,
            "creado_en": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "actualizado_en": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "empresa_carrier": empresa_carrier
        }]
        
        print(f"📤 Insertando usuario en tabla usuarios:")
        print(f"   📧 Correo: {correo}")
        print(f"   👤 Nombre: {nombre}")
        print(f"   📱 Teléfono: {telefono}")
        print(f"   🏢 Empresa: {empresa_carrier}")
        print(f"   🆔 ID: {user_id}")
        
        # Insertar en BigQuery
        errors = client.insert_rows_json(table_id, nuevo_usuario)
        
        if not errors:
            print("\n✅ Usuario creado correctamente en la tabla usuarios")
            print(f"   📧 Correo: {correo}")
            print(f"   👤 Nombre: {nombre}")
            print(f"   📱 Teléfono: {telefono}")
            print(f"   🏢 Empresa: {empresa_carrier}")
            print(f"   🆔 ID: {user_id}")
        else:
            print("\n❌ Errores al insertar:")
            for error in errors:
                print(f"   - {error}")
                
    except Exception as e:
        print(f"❌ Error: {e}")
        print("\n🔧 Posibles soluciones:")
        print("1. Verifica que el archivo .env existe y contiene GOOGLE_CREDENTIALS_PATH")
        print("2. Verifica que el archivo de credenciales JSON existe en la ruta especificada")
        print("3. Verifica que tienes permisos para acceder a BigQuery")
        print("4. Verifica que la tabla 'usuarios' existe en el dataset 'Conciliaciones'")
        print("5. Ajusta los campos del usuario según la estructura real de tu tabla")

def consultar_usuarios_existentes():
    """Consulta usuarios existentes para verificar"""
    try:
        verificar_credenciales()
        client = bigquery.Client()
        
        query = """
        SELECT 
            id_usuario,
            correo,
            nombre,
            telefono,
            empresa_carrier,
            creado_en
        FROM `datos-clientes-441216.Conciliaciones.usuarios`
        ORDER BY creado_en DESC
        LIMIT 5
        """
        
        print("\n📊 Últimos 5 usuarios en la tabla:")
        print("-" * 60)
        
        results = client.query(query)
        
        for row in results:
            print(f"ID: {row.id_usuario}")
            print(f"Correo: {row.correo}")
            print(f"Nombre: {row.nombre}")
            print(f"Teléfono: {row.telefono}")
            print(f"Empresa: {row.empresa_carrier if row.empresa_carrier else 'N/A'}")
            print(f"Creado: {row.creado_en}")
            print("-" * 30)
            
    except Exception as e:
        print(f"❌ Error al consultar usuarios: {e}")

if __name__ == "__main__":
    print("🚀 Script para crear usuario en tabla 'usuarios'")
    print("=" * 50)
    
    # Opción 1: Ver estructura de tabla y usuarios existentes
    print("\n1️⃣  Consultando información de la tabla...")
    consultar_usuarios_existentes()
    
    # Opción 2: Crear nuevo usuario
    print("\n2️⃣  Creando nuevo usuario...")
    crear_usuario_en_tabla_usuarios()
    
    # Opción 3: Verificar que se creó correctamente
    print("\n3️⃣  Verificando creación...")
    consultar_usuarios_existentes()