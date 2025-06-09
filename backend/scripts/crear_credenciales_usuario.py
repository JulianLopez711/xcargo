from google.cloud import bigquery
import os
import bcrypt
import datetime
from dotenv import load_dotenv

def verificar_credenciales_gcp():
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

def hash_clave(plain_password: str) -> str:
    """Hashea una contraseña usando bcrypt"""
    return bcrypt.hashpw(plain_password.encode(), bcrypt.gensalt()).decode()

def verificar_usuario_en_tabla_usuarios(client, correo):
    """Verifica que el usuario existe en la tabla usuarios"""
    query = """
        SELECT id_usuario, nombre, correo, telefono, empresa_carrier
        FROM `datos-clientes-441216.Conciliaciones.usuarios`
        WHERE correo = @correo
        LIMIT 1
    """
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("correo", "STRING", correo)
        ]
    )
    
    result = client.query(query, job_config=job_config).result()
    rows = list(result)
    
    if rows:
        usuario = dict(rows[0])
        print(f"✅ Usuario encontrado en tabla usuarios:")
        print(f"   📧 Correo: {usuario['correo']}")
        print(f"   👤 Nombre: {usuario['nombre']}")
        print(f"   🆔 ID: {usuario['id_usuario']}")
        print(f"   🏢 Empresa: {usuario['empresa_carrier']}")
        return usuario
    else:
        print(f"❌ Usuario {correo} NO encontrado en tabla usuarios")
        return None

def verificar_credenciales_existentes(client, correo):
    """Verifica si ya existen credenciales para este usuario"""
    query = """
        SELECT correo, rol, clave_defecto, creado_en
        FROM `datos-clientes-441216.Conciliaciones.credenciales`
        WHERE correo = @correo
        LIMIT 1
    """
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("correo", "STRING", correo)
        ]
    )
    
    result = client.query(query, job_config=job_config).result()
    rows = list(result)
    
    if rows:
        cred = dict(rows[0])
        print(f"⚠️  Ya existen credenciales para {correo}:")
        print(f"   🏷️  Rol: {cred['rol']}")
        print(f"   🔐 Clave por defecto: {cred['clave_defecto']}")
        print(f"   📅 Creado: {cred['creado_en']}")
        return True
    else:
        print(f"✅ No existen credenciales para {correo} - se pueden crear")
        return False

def crear_credenciales_para_usuario(correo, password_plana, rol):
    """Crea credenciales para un usuario existente en la tabla usuarios"""
    try:
        # Verificar credenciales de GCP
        verificar_credenciales_gcp()
        
        # Cliente BigQuery
        client = bigquery.Client()
        print("✅ Cliente BigQuery inicializado correctamente")
        
        print(f"\n👤 Procesando usuario: {correo}")
        print("=" * 50)
        
        # 1. Verificar que el usuario existe en tabla usuarios
        usuario = verificar_usuario_en_tabla_usuarios(client, correo)
        if not usuario:
            print("❌ No se puede crear credenciales para un usuario que no existe en la tabla usuarios")
            return False
        
        # 2. Verificar si ya tiene credenciales
        if verificar_credenciales_existentes(client, correo):
            respuesta = input("\n¿Quieres actualizar las credenciales existentes? (s/n): ")
            if respuesta.lower() not in ['s', 'si', 'sí', 'y', 'yes']:
                print("❌ Operación cancelada")
                return False
            else:
                # Actualizar credenciales existentes
                return actualizar_credenciales_existentes(client, correo, password_plana, rol, usuario)
        
        # 3. Crear nuevas credenciales
        print(f"\n📝 Creando credenciales:")
        print(f"   📧 Correo: {correo}")
        print(f"   🏷️  Rol: {rol}")
        print(f"   🔐 Contraseña: {'*' * len(password_plana)}")
        
        # Hashear la contraseña
        hashed_password = hash_clave(password_plana)
        
        # Preparar datos de credenciales
        credenciales = [{
            "correo": correo,
            "hashed_password": hashed_password,
            "rol": rol,
            "clave_defecto": True,  # Marcar como clave por defecto para que la cambie
            "creado_en": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "id_usuario": usuario["id_usuario"],
            "empresa_carrier": usuario.get("empresa_carrier", "")
        }]
        
        # Insertar en BigQuery
        table_id = "datos-clientes-441216.Conciliaciones.credenciales"
        errors = client.insert_rows_json(table_id, credenciales)
        
        if not errors:
            print("\n✅ Credenciales creadas exitosamente")
            print(f"   📧 Correo: {correo}")
            print(f"   🏷️  Rol: {rol}")
            print(f"   🔐 Contraseña temporal: {password_plana}")
            print(f"   ⚠️  El usuario debe cambiar la contraseña en el primer login")
            return True
        else:
            print("\n❌ Errores al crear credenciales:")
            for error in errors:
                print(f"   - {error}")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def actualizar_credenciales_existentes(client, correo, password_plana, rol, usuario):
    """Actualiza credenciales existentes"""
    try:
        # Hashear la nueva contraseña
        hashed_password = hash_clave(password_plana)
        
        query_update = """
            UPDATE `datos-clientes-441216.Conciliaciones.credenciales`
            SET 
                hashed_password = @password,
                rol = @rol,
                clave_defecto = TRUE,
                actualizado_en = CURRENT_TIMESTAMP(),
                id_usuario = @id_usuario,
                empresa_carrier = @empresa_carrier
            WHERE correo = @correo
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo", "STRING", correo),
                bigquery.ScalarQueryParameter("password", "STRING", hashed_password),
                bigquery.ScalarQueryParameter("rol", "STRING", rol),
                bigquery.ScalarQueryParameter("id_usuario", "STRING", usuario["id_usuario"]),
                bigquery.ScalarQueryParameter("empresa_carrier", "STRING", usuario.get("empresa_carrier", ""))
            ]
        )
        
        result = client.query(query_update, job_config=job_config).result()
        
        print("\n✅ Credenciales actualizadas exitosamente")
        print(f"   📧 Correo: {correo}")
        print(f"   🏷️  Nuevo rol: {rol}")
        print(f"   🔐 Nueva contraseña: {password_plana}")
        return True
        
    except Exception as e:
        print(f"❌ Error actualizando credenciales: {e}")
        return False

def consultar_credenciales_existentes():
    """Consulta todas las credenciales existentes"""
    try:
        verificar_credenciales_gcp()
        client = bigquery.Client()
        
        query = """
        SELECT 
            correo,
            rol,
            clave_defecto,
            empresa_carrier,
            creado_en
        FROM `datos-clientes-441216.Conciliaciones.credenciales`
        ORDER BY creado_en DESC
        LIMIT 10
        """
        
        print("\n📊 Últimas 10 credenciales:")
        print("-" * 80)
        
        results = client.query(query)
        
        for row in results:
            print(f"📧 {row.correo}")
            print(f"   🏷️  Rol: {row.rol}")
            print(f"   🔐 Clave defecto: {'Sí' if row.clave_defecto else 'No'}")
            print(f"   🏢 Empresa: {row.empresa_carrier or 'N/A'}")
            print(f"   📅 Creado: {row.creado_en}")
            print("-" * 40)
            
    except Exception as e:
        print(f"❌ Error consultando credenciales: {e}")

if __name__ == "__main__":
    print("🔐 Script para crear credenciales de usuario")
    print("=" * 50)
    
    # Datos del usuario para crear credenciales
    correo = "camilo.basto@x-cargo.co"
    password_temporal = "Xcargo123"  # Contraseña temporal que debe cambiar
    rol = "contabilidad"  # Rol según tu sistema
    
    print("\n1️⃣  Consultando credenciales existentes...")
    consultar_credenciales_existentes()
    
    print("\n2️⃣  Creando credenciales para el usuario...")
    exito = crear_credenciales_para_usuario(correo, password_temporal, rol)
    
    if exito:
        print("\n3️⃣  Verificando credenciales creadas...")
        consultar_credenciales_existentes()
        
        print(f"\n🎉 ¡Listo! El usuario puede hacer login con:")
        print(f"   📧 Usuario: {correo}")
        print(f"   🔐 Contraseña: {password_temporal}")
        print(f"   ⚠️  Debe cambiar la contraseña en el primer login")
    else:
        print("\n❌ No se pudieron crear las credenciales")