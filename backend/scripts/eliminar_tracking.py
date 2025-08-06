import pandas as pd
from google.cloud import bigquery
import os
import sys
import bcrypt
import datetime
from dotenv import load_dotenv
from pathlib import Path

# Agregar el directorio backend al path para poder importar app
backend_dir = Path(__file__).parent.parent  # backend/
sys.path.insert(0, str(backend_dir))

from app.core.config import GOOGLE_CREDENTIALS_PATH

# Cargar variables desde .env
load_dotenv()

# Construir las rutas absolutas de las credenciales
credentials_datos_clientes = backend_dir / GOOGLE_CREDENTIALS_PATH
credentials_masters = backend_dir / "app/credentials/credencial-master.json"

# Verificar que ambos archivos de credenciales existen
if not credentials_datos_clientes.exists():
    print(f"❌ Error: El archivo de credenciales datos-clientes no existe: {credentials_datos_clientes}")
    exit(1)

if not credentials_masters.exists():
    print(f"❌ Error: El archivo de credenciales masters no existe: {credentials_masters}")
    exit(1)

print(f"✅ Credenciales datos-clientes: {credentials_datos_clientes}")
print(f"✅ Credenciales masters: {credentials_masters}")

# Función para crear cliente BigQuery específico por proyecto
def crear_cliente_bigquery(project_id):
    """Crea un cliente BigQuery usando las credenciales apropiadas para el proyecto"""
    if project_id == "descarga-masters":
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(credentials_masters)
        return bigquery.Client(project="descarga-masters")
    else:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(credentials_datos_clientes)
        return bigquery.Client(project="datos-clientes-441216")

def leer_trackings_excel(archivo_excel, columna='TRACKING/ GUIA', hoja=0):
    """
    Lee un archivo Excel y extrae los trackings de la columna especificada
    
    Args:
        archivo_excel: Ruta del archivo Excel
        columna: Nombre de la columna que contiene los trackings
        hoja: Nombre o índice de la hoja (0 para primera hoja)
    
    Returns:
        Lista de trackings únicos
    """
    try:
        # Leer el archivo Excel
        df = pd.read_excel(archivo_excel, sheet_name=hoja, dtype={columna: str})
        
        print(f"📊 Archivo leído exitosamente: {archivo_excel}")
        print(f"📋 Columnas disponibles: {list(df.columns)}")
        
        # Verificar si la columna existe
        if columna not in df.columns:
            print(f"❌ Error: La columna '{columna}' no existe en el archivo")
            print(f"💡 Columnas disponibles: {list(df.columns)}")
            return []
        
        # Obtener trackings únicos y eliminar valores vacíos
        trackings = df[columna].dropna().astype(str).str.strip()
        trackings_unicos = trackings[trackings != ''].unique().tolist()
        
        print(f"📦 Total de trackings encontrados: {len(trackings_unicos)}")
        return trackings_unicos
        
    except Exception as e:
        print(f"❌ Error al leer el archivo Excel: {e}")
        return []

def ejecutar_deletes_bigquery(trackings):
    """
    Ejecuta los DELETE en BigQuery para cada tracking usando las credenciales apropiadas
    
    Args:
        trackings: Lista de trackings a eliminar
    """
    try:
        print(f"🔗 Usando clientes BigQuery con credenciales específicas")
        
        # Contadores para seguimiento
        exitosos = 0
        errores = 0
        
        for i, tracking in enumerate(trackings, 1):
            print(f"\n🔄 Procesando tracking {i}/{len(trackings)}: {tracking}")
            
            # Definir las consultas DELETE con sus respectivos proyectos y clientes
            consultas_config = [
                {
                    "query": f"DELETE FROM `descarga-masters.Conciliacion.transferidos` WHERE tracking_number IN ('{tracking}')",
                    "tabla": "descarga-masters.Conciliacion.transferidos",
                    "project_id": "descarga-masters"
                },
                {
                    "query": f"DELETE FROM `datos-clientes-441216.Conciliaciones.guias_liquidacion` WHERE tracking_number = '{tracking}'",
                    "tabla": "datos-clientes-441216.Conciliaciones.guias_liquidacion",
                    "project_id": "datos-clientes-441216"
                },
                {
                    "query": f"DELETE FROM `datos-clientes-441216.Conciliaciones.pagosconductor` WHERE tracking = '{tracking}'",
                    "tabla": "datos-clientes-441216.Conciliaciones.pagosconductor", 
                    "project_id": "datos-clientes-441216"
                }
            ]
            
            tracking_exitoso = True
            
            # Ejecutar cada DELETE con el cliente apropiado
            for config in consultas_config:
                try:
                    # Crear cliente específico para este proyecto
                    client = crear_cliente_bigquery(config["project_id"])
                    
                    job = client.query(config["query"])
                    result = job.result()
                    
                    # Obtener número de filas eliminadas
                    rows_deleted = job.num_dml_affected_rows or 0
                    print(f"  ✅ {config['tabla']}: {rows_deleted} filas eliminadas")
                    
                except Exception as e:
                    print(f"  ❌ Error en {config['tabla']}: {e}")
                    tracking_exitoso = False
                    errores += 1
            
            if tracking_exitoso:
                exitosos += 1
        
        # Resumen final
        print(f"\n📊 RESUMEN:")
        print(f"✅ Trackings procesados exitosamente: {exitosos}")
        print(f"❌ Trackings con errores: {errores}")
        print(f"📈 Total procesados: {len(trackings)}")
        
    except Exception as e:
        print(f"❌ Error al ejecutar consultas en BigQuery: {e}")
        print("💡 Verifica la configuración de credenciales")

def main():
    """Función principal del script"""
    print("🚀 Iniciando script de eliminación de trackings")
    print("=" * 50)
    
    # Configuración - permitir archivo como argumento de línea de comandos
    if len(sys.argv) > 1:
        archivo_excel = sys.argv[1]
    else:
        archivo_excel = input("📁 Ingresa la ruta del archivo Excel: ").strip()
    
    # Verificar si el archivo existe
    if not os.path.exists(archivo_excel):
        print(f"❌ Error: El archivo '{archivo_excel}' no existe")
        return
    
    # Leer trackings del Excel
    print(f"\n📖 Leyendo archivo Excel...")
    trackings = leer_trackings_excel(archivo_excel)
    
    if not trackings:
        print("❌ No se encontraron trackings para procesar")
        return
    
    # Mostrar preview de trackings
    print(f"\n📋 Preview de trackings encontrados:")
    for i, tracking in enumerate(trackings[:5]):
        print(f"  {i+1}. {tracking}")
    if len(trackings) > 5:
        print(f"  ... y {len(trackings) - 5} más")
    
    # Confirmar antes de proceder - permitir modo automático con argumento --auto
    if len(sys.argv) > 2 and sys.argv[2] == "--auto":
        print(f"\n⚠️ Modo automático activado - eliminando {len(trackings)} trackings...")
        respuesta = 's'
    else:
        respuesta = input(f"\n⚠️ ¿Confirmas eliminar estos {len(trackings)} trackings? (s/n): ").lower()
    
    if respuesta != 's':
        print("❌ Operación cancelada por el usuario")
        return
    
    # Ejecutar eliminaciones
    print(f"\n🔥 Iniciando eliminación de trackings...")
    ejecutar_deletes_bigquery(trackings)
    
    print(f"\n🎉 Script completado - {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    # Verificar dependencias
    try:
        import pandas as pd
        from google.cloud import bigquery
        # La importación de config ya se hizo arriba
    except ImportError as e:
        print("❌ Error: Faltan dependencias requeridas")
        print("💡 Instala con: pip install pandas google-cloud-bigquery openpyxl")
        print("💡 Asegúrate de tener configurado app.core.config")
        exit(1)
    
    main()