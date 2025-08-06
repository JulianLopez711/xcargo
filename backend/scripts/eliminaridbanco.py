import pandas as pd
from google.cloud import bigquery
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Agregar el directorio backend al path para poder importar app
backend_dir = Path(__file__).parent.parent  # backend/
sys.path.insert(0, str(backend_dir))

from app.core.config import GOOGLE_CREDENTIALS_PATH

# Cargar variables desde .env
load_dotenv()

# Construir la ruta absoluta de las credenciales
credentials_datos_clientes = backend_dir / GOOGLE_CREDENTIALS_PATH

# Verificar que el archivo de credenciales existe
if not credentials_datos_clientes.exists():
    print(f"❌ Error: El archivo de credenciales no existe: {credentials_datos_clientes}")
    exit(1)

print(f"✅ Credenciales: {credentials_datos_clientes}")

def crear_cliente_bigquery():
    """Crea un cliente BigQuery usando las credenciales de datos-clientes"""
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(credentials_datos_clientes)
    return bigquery.Client(project="datos-clientes-441216")

def consultar_banco_movimiento(client, id_banco):
    """
    Consulta un registro específico en la tabla banco_movimientos
    
    Args:
        client: Cliente BigQuery
        id_banco: ID del banco a consultar
    
    Returns:
        pandas.DataFrame: Resultado de la consulta
    """
    query = f"""
    SELECT *
    FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
    WHERE id = "{id_banco}"
    """
    
    try:
        print(f"🔍 Consultando ID: {id_banco}")
        result = client.query(query).to_dataframe()
        
        if len(result) > 0:
            print(f"✅ Encontrado: {len(result)} registro(s)")
            return result
        else:
            print(f"⚠️  No se encontraron registros para ID: {id_banco}")
            return pd.DataFrame()
            
    except Exception as e:
        print(f"❌ Error al consultar ID {id_banco}: {e}")
        return pd.DataFrame()

def eliminar_banco_movimiento(client, id_banco, confirmar=False):
    """
    Elimina un registro específico en la tabla banco_movimientos
    
    Args:
        client: Cliente BigQuery
        id_banco: ID del banco a eliminar
        confirmar: Si True, ejecuta la eliminación. Si False, solo muestra lo que se haría.
    
    Returns:
        bool: True si la operación fue exitosa
    """
    query = f"""
    DELETE FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
    WHERE id = "{id_banco}"
    """
    
    try:
        if not confirmar:
            print(f"🔄 SIMULACIÓN - Se eliminaría el registro con ID: {id_banco}")
            print(f"📝 Query: {query}")
            return True
        
        print(f"🗑️  Eliminando ID: {id_banco}")
        job = client.query(query)
        job.result()  # Esperar a que termine
        
        print(f"✅ Eliminado exitosamente: {id_banco}")
        return True
        
    except Exception as e:
        print(f"❌ Error al eliminar ID {id_banco}: {e}")
        return False

def procesar_lista_ids(ids_banco, accion="consultar", confirmar_eliminacion=False):
    """
    Procesa una lista de IDs de banco
    
    Args:
        ids_banco: Lista de IDs a procesar
        accion: "consultar" o "eliminar"
        confirmar_eliminacion: Solo aplica para eliminación. Si False, solo simula.
    """
    client = crear_cliente_bigquery()
    
    print(f"🚀 Iniciando procesamiento de {len(ids_banco)} IDs")
    print(f"📋 Acción: {accion}")
    
    if accion == "eliminar" and not confirmar_eliminacion:
        print("⚠️  MODO SIMULACIÓN - No se eliminarán registros realmente")
    
    resultados = []
    exitosos = 0
    errores = 0
    
    for i, id_banco in enumerate(ids_banco, 1):
        print(f"\n--- Procesando {i}/{len(ids_banco)} ---")
        
        if accion == "consultar":
            resultado = consultar_banco_movimiento(client, id_banco)
            if len(resultado) > 0:
                resultados.append(resultado)
                exitosos += 1
            else:
                errores += 1
                
        elif accion == "eliminar":
            # Primero consultar para verificar que existe
            resultado = consultar_banco_movimiento(client, id_banco)
            if len(resultado) > 0:
                # Si existe, proceder con eliminación
                if eliminar_banco_movimiento(client, id_banco, confirmar_eliminacion):
                    exitosos += 1
                else:
                    errores += 1
            else:
                print(f"⚠️  No se puede eliminar, el ID no existe: {id_banco}")
                errores += 1
    
    # Resumen final
    print(f"\n📊 RESUMEN FINAL")
    print(f"✅ Exitosos: {exitosos}")
    print(f"❌ Errores: {errores}")
    print(f"📝 Total procesados: {len(ids_banco)}")
    
    if accion == "consultar" and resultados:
        # Combinar todos los resultados
        df_final = pd.concat(resultados, ignore_index=True)
        print(f"📋 Total registros encontrados: {len(df_final)}")
        return df_final
    
    return None

def main():
    """Función principal - Ejemplos de uso"""
    
    # Ejemplo 1: Consultar un solo ID
    print("=== EJEMPLO 1: Consultar un ID específico ===")
    client = crear_cliente_bigquery()
    resultado = consultar_banco_movimiento(client, "BANCO_20250701_99_179649")
    
    if len(resultado) > 0:
        print("Datos encontrados:")
        print(resultado.to_string())
    
    # Ejemplo 2: Lista de IDs para consultar
    print("\n=== EJEMPLO 2: Consultar múltiples IDs ===")
    ids_para_consultar = [
        "BANCO_20250701_99_179649",
        "BANCO_20250702_99_179650",  # Ejemplo - puede que no exista
        "BANCO_20250703_99_179651"   # Ejemplo - puede que no exista
    ]
    
    df_resultados = procesar_lista_ids(ids_para_consultar, accion="consultar")
    
    # Ejemplo 3: Eliminar IDs (modo simulación)
    print("\n=== EJEMPLO 3: Eliminar IDs (SIMULACIÓN) ===")
    ids_para_eliminar = [
        "BANCO_20250701_99_179649"
    ]
    
    procesar_lista_ids(ids_para_eliminar, accion="eliminar", confirmar_eliminacion=False)
    
    # Descomenta la siguiente línea para realizar eliminación real (¡CUIDADO!)
    # procesar_lista_ids(ids_para_eliminar, accion="eliminar", confirmar_eliminacion=True)

def examinar_tabla():
    """
    Examina la estructura de la tabla banco_movimientos
    """
    client = crear_cliente_bigquery()
    
    query = """
    SELECT column_name, data_type, is_nullable
    FROM `datos-clientes-441216.Conciliaciones.INFORMATION_SCHEMA.COLUMNS`
    WHERE table_name = 'banco_movimientos'
    ORDER BY ordinal_position
    """
    
    try:
        print("🔍 Examinando estructura de la tabla banco_movimientos...")
        result = client.query(query).to_dataframe()
        
        if len(result) > 0:
            print("📋 Estructura de la tabla:")
            print(result.to_string())
            return result
        else:
            print("⚠️  No se pudo obtener la estructura de la tabla")
            return pd.DataFrame()
            
    except Exception as e:
        print(f"❌ Error al examinar tabla: {e}")
        return pd.DataFrame()

def consultar_patron_ids(patron_fecha="20250701", limite=10):
    """
    Busca IDs que coincidan con un patrón específico
    
    Args:
        patron_fecha: Patrón de fecha en formato YYYYMMDD
        limite: Número máximo de resultados
    """
    client = crear_cliente_bigquery()
    
    # Consulta básica solo con id para evitar errores de campos inexistentes
    query = f"""
    SELECT *
    FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
    WHERE id LIKE "BANCO_{patron_fecha}%"
    ORDER BY id
    LIMIT {limite}
    """
    
    try:
        print(f"🔍 Buscando IDs con patrón: BANCO_{patron_fecha}%")
        result = client.query(query).to_dataframe()
        
        if len(result) > 0:
            print(f"✅ Encontrados {len(result)} registros:")
            print(result.to_string())
            return result
        else:
            print(f"⚠️  No se encontraron registros con el patrón: BANCO_{patron_fecha}%")
            return pd.DataFrame()
            
    except Exception as e:
        print(f"❌ Error al buscar patrón: {e}")
        return pd.DataFrame()

def leer_ids_desde_archivo(archivo_txt):
    """
    Lee IDs desde un archivo de texto
    Formatos soportados:
    - Una línea por ID: BANCO_20250701_896_177777
    - Con comillas y comas: 'BANCO_20250701_896_177777',
    - Con comillas dobles: "BANCO_20250701_896_177777"
    
    Args:
        archivo_txt: Ruta del archivo .txt
    
    Returns:
        list: Lista de IDs limpia
    """
    if not os.path.exists(archivo_txt):
        print(f"❌ Error: El archivo no existe: {archivo_txt}")
        return []
    
    ids_encontrados = []
    
    try:
        with open(archivo_txt, 'r', encoding='utf-8') as file:
            contenido = file.read()
        
        print(f"📄 Leyendo archivo: {archivo_txt}")
        print(f"📝 Contenido del archivo:")
        print("-" * 50)
        print(contenido[:500] + "..." if len(contenido) > 500 else contenido)
        print("-" * 50)
        
        # Limpiar el contenido y extraer IDs
        lines = contenido.split('\n')
        
        for line in lines:
            line = line.strip()
            if not line:  # Saltar líneas vacías
                continue
                
            # Remover comillas simples, dobles y comas
            line_clean = line.replace("'", "").replace('"', "").replace(",", "").strip()
            
            # Verificar que parece un ID válido
            if line_clean.startswith("BANCO_") and len(line_clean) > 10:
                ids_encontrados.append(line_clean)
        
        print(f"✅ IDs extraídos del archivo: {len(ids_encontrados)}")
        
        if ids_encontrados:
            print("📋 Lista de IDs encontrados:")
            for i, id_banco in enumerate(ids_encontrados[:10], 1):  # Mostrar solo los primeros 10
                print(f"   {i:2d}. {id_banco}")
            
            if len(ids_encontrados) > 10:
                print(f"   ... y {len(ids_encontrados) - 10} IDs más")
        
        return ids_encontrados
        
    except Exception as e:
        print(f"❌ Error al leer archivo: {e}")
        return []

def procesar_archivo_eliminacion(archivo_txt, confirmar=False):
    """
    Lee un archivo .txt con IDs y los procesa para eliminación
    
    Args:
        archivo_txt: Ruta del archivo .txt con los IDs
        confirmar: True para eliminar realmente, False para simulación
    """
    print("🗂️  PROCESAMIENTO DE ARCHIVO PARA ELIMINACIÓN")
    print("=" * 60)
    
    # Leer IDs del archivo
    ids_lista = leer_ids_desde_archivo(archivo_txt)
    
    if not ids_lista:
        print("❌ No se encontraron IDs válidos en el archivo")
        return
    
    print(f"\n🎯 Se procesarán {len(ids_lista)} IDs")
    
    if not confirmar:
        print("⚠️  MODO SIMULACIÓN - No se eliminarán registros realmente")
        print("💡 Para eliminación real, usar confirmar=True")
    else:
        print("🚨 MODO ELIMINACIÓN REAL - Los registros serán eliminados permanentemente")
        
        # Confirmación adicional para eliminación real
        respuesta = input("\n¿Estás seguro de eliminar estos registros? (escriba 'SI ELIMINAR' para confirmar): ")
        if respuesta != "SI ELIMINAR":
            print("❌ Operación cancelada por el usuario")
            return
    
    print("\n" + "=" * 60)
    
    # Procesar la lista de IDs
    procesar_lista_ids(ids_lista, accion="eliminar", confirmar_eliminacion=confirmar)

if __name__ == "__main__":
    import sys
    
    # Verificar si se pasó un archivo como argumento
    if len(sys.argv) > 1:
        archivo_txt = sys.argv[1]
        confirmar_real = len(sys.argv) > 2 and sys.argv[2].lower() == "confirmar"
        
        print("🚀 MODO PROCESAMIENTO DE ARCHIVO")
        print("=" * 50)
        procesar_archivo_eliminacion(archivo_txt, confirmar=confirmar_real)
    else:
        try:
            # Ejemplos normales
            print("=== EXAMINANDO ESTRUCTURA DE LA TABLA ===")
            examinar_tabla()
            
            # Ejecutar ejemplos
            main()
            
            # Ejemplo adicional: Buscar por patrón
            print("\n=== EJEMPLO 4: Buscar por patrón de fecha ===")
            consultar_patron_ids("20250701", 5)
            
            # Ejemplo de uso con archivo
            print("\n=== EJEMPLO 5: Procesamiento desde archivo ===")
            print("💡 INSTRUCCIONES DE USO:")
            print("Para procesar un archivo .txt con IDs:")
            print("   python eliminaridbanco.py mi_archivo.txt")
            print("Para eliminación real:")
            print("   python eliminaridbanco.py mi_archivo.txt confirmar")
            print("\nFormato del archivo .txt:")
            print("   'BANCO_20250701_896_177777',")
            print("   'BANCO_20250701_89_176430',")
            print("   'BANCO_20250701_89_175836',")
            print("   o simplemente:")
            print("   BANCO_20250701_896_177777")
            print("   BANCO_20250701_89_176430")
            print("   BANCO_20250701_89_175836")
            
        except KeyboardInterrupt:
            print("\n⚠️  Operación cancelada por el usuario")
        except Exception as e:
            print(f"❌ Error general: {e}")
            import traceback
            traceback.print_exc()
