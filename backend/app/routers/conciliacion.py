from fastapi import APIRouter, UploadFile, File, HTTPException
from google.cloud import bigquery
from typing import List, Dict, Optional, Any
from pydantic import BaseModel
from datetime import datetime, date
import csv
import io
import logging
from decimal import Decimal
from collections import defaultdict

from ..utils.conciliacion_utils import (
    calcular_diferencia_valor,
    calcular_diferencia_fecha,
    determinar_estado_conciliacion,
    actualizar_metadata_conciliacion,
    validar_conciliacion_lista
)

# Configuración de logging
logger = logging.getLogger(__name__)

# Constantes
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
DATASET_CONCILIACIONES = "Conciliaciones"
PROJECT_ID = "datos-clientes-441216"

class EstadoError(Exception):
    """Error personalizado para estados inválidos"""
    pass

router = APIRouter(prefix="/conciliacion", tags=["Conciliacion"])

class MovimientoBanco:
    def __init__(self, fila_csv: str, numero_linea: int = 0):
        """
        MEJORADO: Parser más robusto con mejor manejo de errores y logging
        """
        self.numero_linea = numero_linea
        self.linea_original = fila_csv.strip()
        
        # Detectar el separador correcto
        if ';' in fila_csv:
            separador = ';'
        elif ',' in fila_csv:
            separador = ','
        elif '\t' in fila_csv:
            separador = '\t'
        else:
            raise ValueError(f"Línea {numero_linea}: No se detectó separador válido")
        
        # Parsear CSV con el separador detectado
        campos = fila_csv.split(separador)
        
        # MEJORADO: Logging detallado para debug
        print(f"  Línea {numero_linea}: {len(campos)} campos detectados")
        if len(campos) >= 5:  # Mínimo requerido
            print(f"    Campos: {[campo.strip()[:20] + '...' if len(campo.strip()) > 20 else campo.strip() for campo in campos[:6]]}...")
        
        if len(campos) < 6:  # REDUCIDO de 9 a 6 para ser más flexible
            raise ValueError(f"Línea {numero_linea}: Formato inválido - se esperaban al menos 6 campos, se encontraron {len(campos)}")
        
        # Asignar campos con manejo robusto
        try:
            self.cuenta = campos[0].strip() if len(campos) > 0 else ""
            self.codigo = campos[1].strip() if len(campos) > 1 else ""
            self.campo_vacio_1 = campos[2].strip() if len(campos) > 2 else ""
            self.fecha_raw = campos[3].strip() if len(campos) > 3 else ""
            self.campo_vacio_2 = campos[4].strip() if len(campos) > 4 else ""
            self.valor_raw = campos[5].strip() if len(campos) > 5 else ""
            self.cod_transaccion = campos[6].strip() if len(campos) > 6 else ""
            self.descripcion = campos[7].strip() if len(campos) > 7 else ""
            self.flag = campos[8].strip() if len(campos) > 8 else ""
        except Exception as e:
            raise ValueError(f"Línea {numero_linea}: Error asignando campos: {str(e)}")
        
        # MEJORADO: Procesamiento de fecha más flexible
        self.fecha = self._procesar_fecha(self.fecha_raw, numero_linea)
        
        # MEJORADO: Procesamiento de valor más robusto
        self.valor = self._procesar_valor(self.valor_raw, numero_linea)
        
        # Crear ID único con timestamp para evitar duplicados
        timestamp = int(datetime.utcnow().timestamp() * 1000000)
        self.id = f"BANCO_{self.fecha_raw}_{int(abs(self.valor))}_{timestamp % 1000000}"
        
        # Log del movimiento procesado exitosamente
        print(f"    ✅ Procesado: {self.fecha} | ${self.valor:,.0f} | {self.descripcion[:30]}")

    def _procesar_fecha(self, fecha_raw: str, numero_linea: int) -> datetime.date:
        """Procesa fecha con múltiples formatos posibles"""
        if not fecha_raw:
            raise ValueError(f"Línea {numero_linea}: Fecha vacía")
        
        # Intentar diferentes formatos de fecha
        formatos_fecha = [
            "%Y%m%d",        # 20250527
            "%d/%m/%Y",      # 27/05/2025
            "%d-%m-%Y",      # 27-05-2025
            "%Y-%m-%d",      # 2025-05-27
            "%d/%m/%y",      # 27/05/25
            "%d-%m-%y",      # 27-05-25
        ]
        
        for formato in formatos_fecha:
            try:
                return datetime.strptime(fecha_raw.strip(), formato).date()
            except ValueError:
                continue
        
        raise ValueError(f"Línea {numero_linea}: Formato de fecha no reconocido: '{fecha_raw}'")

    def _procesar_valor(self, valor_raw: str, numero_linea: int) -> float:
        """Procesa valor monetario con múltiples formatos posibles"""
        if not valor_raw:
            raise ValueError(f"Línea {numero_linea}: Valor vacío")
        
        try:
            # Limpiar el valor
            valor_limpio = valor_raw.strip()
            
            # Remover símbolos comunes
            valor_limpio = valor_limpio.replace("$", "").replace("€", "").replace("USD", "").replace("COP", "")
            valor_limpio = valor_limpio.replace(" ", "").replace("\t", "")
            
            # Manejar separadores decimales
            if "," in valor_limpio and "." in valor_limpio:
                # Formato: 1.234.567,89 o 1,234,567.89
                if valor_limpio.rfind(",") > valor_limpio.rfind("."):
                    # Formato europeo: 1.234.567,89
                    valor_limpio = valor_limpio.replace(".", "").replace(",", ".")
                else:
                    # Formato americano: 1,234,567.89
                    valor_limpio = valor_limpio.replace(",", "")
            elif "," in valor_limpio:
                # Si es un valor como "1,234" (sin decimales) asumimos que es separador de miles
                # Si es "1234,56" asumimos que es decimal
                partes = valor_limpio.split(",")
                if len(partes[1]) == 2 or len(partes[1]) == 3:
                    # Parece ser un decimal
                    valor_limpio = valor_limpio.replace(",", ".")
                else:
                    # Parece ser separador de miles
                    valor_limpio = valor_limpio.replace(",", "")
            
            # Convertir a float
            valor = float(valor_limpio)
            
            # Validación final
            if valor == 0:
                raise ValueError(f"Línea {numero_linea}: Valor cero no permitido")
            if abs(valor) > 1000000000:  # mil millones
                raise ValueError(f"Línea {numero_linea}: Valor sospechosamente alto: {valor}")
                
            return valor
            
        except ValueError as e:
            raise ValueError(f"Línea {numero_linea}: Formato de valor inválido '{valor_raw}': {str(e)}")
        except Exception as e:
            raise ValueError(f"Línea {numero_linea}: Error procesando valor '{valor_raw}': {str(e)}")

    def es_consignacion(self) -> bool:
        """Determina si el movimiento es una consignación basada en la descripción"""
        descripcion_upper = self.descripcion.upper()
        
        terminos_consignacion = [
            "CONSIGNACION", 
            "TRANSFERENCIA DESDE NEQUI", 
            "TRANSFERENCIA CTA SUC VIRTUAL"
        ]
    
        return any(termino in descripcion_upper for termino in terminos_consignacion)


# ========== FUNCIONES DE VALIDACIÓN MEJORADAS ==========

def analizar_archivo_detallado(decoded: str, filename: str) -> Dict:
    """Analiza el archivo línea por línea para diagnosticar problemas"""
    
    lineas = decoded.strip().split('\n')
    analisis = {
        "total_lineas": len(lineas),
        "lineas_vacias": 0,
        "lineas_muy_cortas": 0,
        "errores_parsing": [],
        "movimientos_validos": [],
        "separadores_detectados": defaultdict(int),
        "formatos_fecha_detectados": defaultdict(int),
        "tipos_transaccion": defaultdict(int)
    }
    
    print(f"\n📋 ANÁLISIS DETALLADO DE {filename}")
    print(f"Total de líneas: {len(lineas)}")
    
    for i, linea in enumerate(lineas):
        numero_linea = i + 1
        linea_limpia = linea.strip()
        
        # Contar líneas vacías
        if not linea_limpia:
            analisis["lineas_vacias"] += 1
            continue
        
        # Contar líneas muy cortas
        if len(linea_limpia) < 10:
            analisis["lineas_muy_cortas"] += 1
            print(f"  Línea {numero_linea}: Muy corta ({len(linea_limpia)} chars): '{linea_limpia}'")
            continue
        
        # Detectar separadores
        if ';' in linea_limpia:
            analisis["separadores_detectados"][';'] += 1
        if ',' in linea_limpia:
            analisis["separadores_detectados"][','] += 1
        if '\t' in linea_limpia:
            analisis["separadores_detectados"]['\t'] += 1
        
        # Intentar parsear el movimiento
        try:
            mov = MovimientoBanco(linea_limpia, numero_linea)
            analisis["movimientos_validos"].append(mov)
            
            # Estadísticas de tipos de transacción
            tipo = "CONSIGNACION" if mov.es_consignacion() else "OTRO"
            analisis["tipos_transaccion"][tipo] += 1
            
        except Exception as e:
            error_info = {
                "linea": numero_linea,
                "error": str(e),
                "contenido": linea_limpia[:100] + "..." if len(linea_limpia) > 100 else linea_limpia
            }
            analisis["errores_parsing"].append(error_info)
            print(f"  ❌ Línea {numero_linea}: {str(e)}")
    
    # Resumen del análisis
    print(f"\n📊 RESUMEN DEL ANÁLISIS:")
    print(f"  ✅ Movimientos válidos: {len(analisis['movimientos_validos'])}")
    print(f"  ❌ Errores de parsing: {len(analisis['errores_parsing'])}")
    print(f"  📝 Líneas vacías: {analisis['lineas_vacias']}")
    print(f"  📏 Líneas muy cortas: {analisis['lineas_muy_cortas']}")
    print(f"  🔗 Separadores detectados: {dict(analisis['separadores_detectadas'])}")
    print(f"  💰 Tipos de transacción: {dict(analisis['tipos_transaccion'])}")
    
    return analisis

# ========== ENDPOINT MEJORADO DE CARGA ==========

@router.post("/cargar-banco-excel")
async def cargar_archivo_banco_mejorado(file: UploadFile = File(...)):
    """VERSIÓN MEJORADA: Cargar archivo CSV del banco con análisis detallado"""
    
    if not (file.filename.endswith((".csv", ".CSV"))):
        raise HTTPException(status_code=400, detail="El archivo debe ser CSV")

    # VALIDAR TAMAÑO DEL ARCHIVO
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413, 
            detail=f"Archivo demasiado grande. Máximo permitido: {MAX_FILE_SIZE // (1024*1024)}MB"
        )
    
    # DECODIFICAR ARCHIVO con múltiples codificaciones
    encodings = ["utf-8-sig", "utf-8", "latin-1", "cp1252", "iso-8859-1"]
    decoded = None
    encoding_usado = None
    
    for encoding in encodings:
        try:
            decoded = content.decode(encoding)
            encoding_usado = encoding
            print(f"✅ Archivo decodificado con: {encoding}")
            break
        except UnicodeDecodeError:
            continue
    
    if decoded is None:
        raise HTTPException(status_code=400, detail="No se pudo decodificar el archivo con ninguna codificación")
    
    # ANÁLISIS DETALLADO DEL ARCHIVO
    analisis = analizar_archivo_detallado(decoded, file.filename)
    
    # Filtrar y normalizar movimientos válidos
    # Solo se conservan los que tienen un tipo reconocido (consignación, nequi, etc.)
    movimientos_normalizados = [
        mov for mov in analisis["movimientos_validos"] 
        if normalizar_tipo_banco(mov.descripcion) is not None
    ]

    # Mostrar resumen de las consignaciones encontradas
    print(f"\n💰 CONSIGNACIONES ENCONTRADAS: {len(movimientos_normalizados)}")
    # Mostrar las primeras 5 consignaciones como muestra
    for i, cons in enumerate(movimientos_normalizados[:5]):  
        print(f"  {i+1}. {cons.fecha} | ${cons.valor:,.0f} | {cons.descripcion[:40]}")
    
    # Indicar si hay más consignaciones no mostradas
    if len(movimientos_normalizados) > 5:
        print(f"  ... y {len(movimientos_normalizados) - 5} más")

    # Si no se encontraron movimientos válidos, proporcionar información detallada del error
    if not movimientos_normalizados:
        # Crear objeto con información de debug para ayudar a identificar el problema
        info_debug = {
            "mensaje": "No se encontraron consignaciones válidas",
            "analisis_detallado": {
                "total_movimientos_parseados": len(analisis["movimientos_validos"]),
                "tipos_encontrados": dict(analisis["tipos_transaccion"]),
                "errores_parsing": len(analisis["errores_parsing"]),
                "primeros_errores": analisis["errores_parsing"][:10],  # Mostrar primeros 10 errores
                "encoding_usado": encoding_usado
            }
        }
        raise HTTPException(status_code=400, detail=f"Debug info: {info_debug}")

    # Iniciar análisis de patrones y preparación para inserción en BD
    client = bigquery.Client()
    
    # Obtener lista única de fechas del archivo
    fechas_archivo = list(set(mov.fecha.isoformat() for mov in movimientos_normalizados))
    print(f"📅 Fechas en archivo: {fechas_archivo}")
    
    # Inicializar contenedores para resultados
    todos_movimientos_a_insertar = []
    reporte_completo = {"fechas_procesadas": {}}
    
    # Procesar cada fecha por separado para mejor organización y control
    for fecha_str in fechas_archivo:
        print(f"\n🔍 Analizando fecha: {fecha_str}")
        
        # Filtrar movimientos de la fecha actual
        movimientos_fecha = [mov for mov in movimientos_normalizados if mov.fecha.isoformat() == fecha_str]
        
        # Obtener patrones existentes de la BD para comparar
        patrones_existentes = analizar_patrones_existentes(client, fecha_str)
        
        # Analizar patrones del archivo actual
        patrones_nuevos = analizar_patrones_nuevos(movimientos_fecha)
        
        # Determinar qué insertar
        movimientos_insertar, reporte_fecha = determinar_movimientos_a_insertar(patrones_existentes, patrones_nuevos)
        
        todos_movimientos_a_insertar.extend(movimientos_insertar)
        reporte_completo["fechas_procesadas"][fecha_str] = reporte_fecha

    # INSERTAR EN BIGQUERY (código existente, sin cambios)
    if todos_movimientos_a_insertar:
        print(f"\n💾 Insertando {len(todos_movimientos_a_insertar)} movimientos nuevos...")
        
        registros_bd = []
        for mov in todos_movimientos_a_insertar:
            tipo_mov = normalizar_tipo_banco(mov.descripcion)
            registros_bd.append({
                "id": mov.id,
                "fecha": mov.fecha.isoformat(),
                "valor_banco": mov.valor,
                "cuenta": mov.cuenta,
                "codigo": mov.codigo,
                "cod_transaccion": mov.cod_transaccion,
                "descripcion": mov.descripcion,
                "tipo": tipo_mov if tipo_mov else "otro",  # <<--- AQUÍ
                "estado_conciliacion": "pendiente",
                "match_manual": False,
                "confianza_match": 0,
                "observaciones": "",
                "cargado_en": datetime.utcnow().isoformat(),
                "linea_original": mov.linea_original
            })

        
        try:
            table_id = "datos-clientes-441216.Conciliaciones.banco_movimientos"
            
            valores_sql = []
            for reg in registros_bd:
                descripcion_escaped = reg['descripcion'].replace("'", "''")
                linea_escaped = reg['linea_original'].replace("'", "''")
                
                valores_sql.append(f"""(
                    '{reg['id']}',
                    DATE('{reg['fecha']}'),
                    {reg['valor_banco']},
                    '{reg['cuenta']}',
                    '{reg['codigo']}',
                    '{reg['cod_transaccion']}',
                    '{descripcion_escaped}',
                    '{reg['tipo']}',
                    '{reg['estado_conciliacion']}',
                    {reg['match_manual']},
                    {reg['confianza_match']},
                    '{reg['observaciones']}',
                    TIMESTAMP('{reg['cargado_en']}'),
                    '{linea_escaped}'
                )""")
            
            query = f"""
            INSERT INTO `{table_id}` (
                id, fecha, valor_banco, cuenta, codigo, cod_transaccion, 
                descripcion, tipo, estado_conciliacion, match_manual, 
                confianza_match, observaciones, cargado_en, linea_original
            ) VALUES {', '.join(valores_sql)}
            """
            
            client.query(query).result()
            print("✅ Inserción completada en BigQuery")
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error insertando en BigQuery: {str(e)}")
    
    else:
        print("ℹ️ No hay movimientos nuevos para insertar")

    # GENERAR RESPUESTA MEJORADA
    resultado = {
        "mensaje": "Archivo procesado con análisis detallado",
        "encoding_usado": encoding_usado,
        "analisis_archivo": {
            "total_lineas": analisis["total_lineas"],
            "movimientos_parseados": len(analisis["movimientos_validos"]),
            "consignaciones_encontradas": len(movimientos_normalizados),
            "errores_parsing": len(analisis["errores_parsing"]),
            "tipos_transaccion": dict(analisis["tipos_transaccion"])
        },
        "movimientos_insertados": len(todos_movimientos_a_insertar),
        "reporte_detallado": reporte_completo,
        "fecha_procesamiento": datetime.utcnow().isoformat()  # FIX: Usar datetime.utcnow()
    }
    
    # Incluir errores si son pocos para debug
    if len(analisis["errores_parsing"]) <= 20:
        resultado["errores_detalladas"] = analisis["errores_parsing"]
    
    return resultado

# ========== ENDPOINT DE DIAGNÓSTICO ==========

@router.post("/diagnosticar-archivo")
async def diagnosticar_archivo(file: UploadFile = File(...)):
    """Endpoint de diagnóstico que solo analiza el archivo sin procesar"""
    
    content = await file.read()
    
    # Intentar múltiples codificaciones
    for encoding in ["utf-8-sig", "utf-8", "latin-1", "cp1252"]:
        try:
            decoded = content.decode(encoding)
            print(f"✅ Decodificado con: {encoding}")
            break
        except UnicodeDecodeError:
            continue
    else:
        return {"error": "No se pudo decodificar el archivo"}
    
    # Analizar solo las primeras 20 líneas para diagnóstico rápido
    lineas = decoded.strip().split('\n')[:20]
    
    diagnostico = {
        "archivo": file.filename,
        "encoding": encoding,
        "total_lineas_muestra": len(lineas),
        "analisis_lineas": []
    }
    
    for i, linea in enumerate(lineas):
        linea_info = {
            "numero": i + 1,
            "longitud": len(linea),
            "contenido_muestra": linea[:100],
            "separadores": {
                "punto_coma": linea.count(';'),
                "coma": linea.count(','),
                "tab": linea.count('\t')
            }
        }
        
        # Intentar parsear
        try:
            if linea.strip() and len(linea.strip()) > 10:
                mov = MovimientoBanco(linea, i + 1)
                linea_info["parseado"] = True
                linea_info["es_consignacion"] = mov.es_consignacion()
                linea_info["fecha"] = str(mov.fecha)
                linea_info["valor"] = mov.valor
                linea_info["descripcion"] = mov.descripcion[:50]
            else:
                linea_info["parseado"] = False
                linea_info["razon"] = "Línea vacía o muy corta"
        except Exception as e:
            linea_info["parseado"] = False
            linea_info["error"] = str(e)
        
        diagnostico["analisis_lineas"].append(linea_info)
    
    return diagnostico

# ===== MANTENER FUNCIONES EXISTENTES SIN CAMBIOS =====
# (todas las demás funciones permanecen igual)

def normalizar_tipo_banco(descripcion: str) -> Optional[str]:
    desc = descripcion.lower()
    if "nequi" in desc:
        return "nequi"
    if "consignacion" in desc or "caj" in desc or "efectivo" in desc:
        return "consignacion"
    if ("transferencia" in desc or "interbanc" in desc or
        "suc virtual" in desc or "banca movil" in desc or
        "daviviend" in desc or "tnt express" in desc or
        "edwin" in desc or "dcd consultoria" in desc or
        "leidy cecilia l" in desc):
        return "transferencia"
    return None


def analizar_patrones_existentes(client: bigquery.Client, fecha: str) -> Dict[str, Dict[float, int]]:
    """Analiza patrones existentes en BD por fecha y tipo de transacción"""
    
    query = """
    SELECT 
        descripcion,
        valor_banco,
        COUNT(*) as cantidad
    FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
    WHERE DATE(fecha) = @fecha 
    GROUP BY descripcion, valor_banco
    ORDER BY descripcion, valor_banco
    """
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("fecha", "DATE", fecha)
        ]
    )
    
    resultados = client.query(query, job_config=job_config).result()
    
    # Organizar por tipo de descripción
    patrones = defaultdict(dict)
    for row in resultados:
        tipo_desc = row.descripcion.strip()
        valor = float(row.valor_banco)
        cantidad = int(row.cantidad)
        patrones[tipo_desc][valor] = cantidad
    
    print(f"📊 Patrones existentes para {fecha}:")
    for tipo, valores in patrones.items():
        print(f"  {tipo}: {len(valores)} valores únicos")
        for valor, cant in sorted(valores.items()):
            print(f"    ${valor:,.0f} → {cant} veces")
    
    return dict(patrones)

def analizar_patrones_nuevos(movimientos: List[MovimientoBanco]) -> Dict[str, Dict[float, List[MovimientoBanco]]]:
    """Analiza patrones en archivo nuevo, agrupados por tipo y valor"""
    
    patrones = defaultdict(lambda: defaultdict(list))
    
    for mov in movimientos:
        tipo_desc = mov.descripcion.strip()
        valor = mov.valor
        patrones[tipo_desc][valor].append(mov)
    
    print(f"📥 Patrones en archivo nuevo:")
    for tipo, valores in patrones.items():
        print(f"  {tipo}: {len(valores)} valores únicos")
        for valor, movs in sorted(valores.items()):
            print(f"    ${valor:,.0f} → {len(movs)} veces")
    
    return dict(patrones)

def determinar_movimientos_a_insertar(
    patrones_existentes: Dict[str, Dict[float, int]], 
    patrones_nuevos: Dict[str, Dict[float, List[MovimientoBanco]]]
) -> List[MovimientoBanco]:
    """Determina qué movimientos insertar basado en comparación de patrones"""
    
    movimientos_a_insertar = []
    reporte_detallado = {
        "nuevos_insertados": [],
        "duplicados_skipped": [],
        "anomalias_detectadas": []
    }
    
    for tipo_desc, valores_nuevos in patrones_nuevos.items():
        valores_existentes = patrones_existentes.get(tipo_desc, {})
        
        print(f"\n🔍 Analizando: {tipo_desc}")
        
        for valor, movimientos_valor in valores_nuevos.items():
            cantidad_nueva = len(movimientos_valor)
            cantidad_existente = valores_existentes.get(valor, 0)
            
            if cantidad_nueva > cantidad_existente:
                cantidad_a_insertar = cantidad_nueva - cantidad_existente
                movimientos_nuevos = movimientos_valor[-cantidad_a_insertar:]
                movimientos_a_insertar.extend(movimientos_nuevos)
                
                print(f"  ✅ ${valor:,.0f}: Existían {cantidad_existente}, nuevas {cantidad_nueva}, insertar {cantidad_a_insertar}")
                reporte_detallado["nuevos_insertados"].append({
                    "tipo": tipo_desc,
                    "valor": valor,
                    "cantidad_insertada": cantidad_a_insertar
                })
                
            elif cantidad_nueva == cantidad_existente:
                print(f"  ⚠️ ${valor:,.0f}: Mismo patrón ({cantidad_existente}), SKIP duplicados")
                reporte_detallado["duplicados_skipped"].append({
                    "tipo": tipo_desc,
                    "valor": valor,
                    "cantidad_skipped": cantidad_nueva
                })
                
            else:
                print(f"  🤔 ${valor:,.0f}: ANOMALÍA - Archivo tiene {cantidad_nueva}, BD tiene {cantidad_existente}")
                reporte_detallado["anomalias_detectadas"].append({
                    "tipo": tipo_desc,
                    "valor": valor,
                    "cantidad_archivo": cantidad_nueva,
                    "cantidad_bd": cantidad_existente
                })
    
    return movimientos_a_insertar, reporte_detallado

def conciliar_pago_automaticamente(
    fecha_pago: str,
    tipo_pago: str, 
    id_pago: str
) -> Optional[str]:
    """
    Conciliación automática with mejor manejo de errores
    """
    try:
        client = bigquery.Client()
        
        # Validar parámetros
        if not all([fecha_pago, tipo_pago, id_pago]):
            print(f"❌ Parámetros inválidos: fecha={fecha_pago}, tipo={tipo_pago}, id={id_pago}")
            return None
            
        # 1. Validar pago y obtener datos completos        
        query_validar = """
        SELECT 
            pc.id_string,
            pc.referencia_pago,
            pc.estado_conciliacion,
            pc.fecha_pago,
            pc.hora_pago,
            pc.correo,
            pc.tracking,
            pc.cliente,
            pc.tipo,
            pc.entidad,
            COALESCE(pc.valor_total_consignacion, pc.valor) AS valor_pago,
            STRING_AGG(gl.pago_referencia, ',') as guias_relacionadas
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
        LEFT JOIN `datos-clientes-441216.Conciliaciones.guias_liquidacion` gl
            ON pc.referencia = gl.pago_referencia
        WHERE pc.id_string = @id_pago
          AND (pc.estado_conciliacion IS NULL 
               OR pc.estado_conciliacion = ''
               OR pc.estado_conciliacion = 'pendiente'
               OR pc.estado_conciliacion = 'pendiente_conciliacion'
               OR pc.estado_conciliacion = 'error'
               OR pc.estado_conciliacion = 'sin_match')
        GROUP BY 
            pc.id_string, pc.referencia_pago, pc.estado_conciliacion,
            pc.fecha_pago, pc.valor_total_consignacion, pc.valor, pc.tipo,
            pc.correo, pc.tracking, pc.cliente, pc.hora_pago, pc.entidad
        LIMIT 1
        """

        result_validar = list(client.query(
            query_validar,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("id_pago", "STRING", id_pago)
                ]
            )
        ).result())

        if not result_validar:
            print(f"❌ No se encontró el pago {id_pago} o ya está conciliado")
            return None

        pago = result_validar[0]
        valor_pago = float(pago["valor_pago"])
        referencia_pago = pago["referencia_pago"] or id_pago
        tracking = pago["tracking"]
        tipo_transaccion = pago["tipo"].lower()
        hora_pago = pago["hora_pago"]
        entidad = pago["entidad"].lower()

        # 2. Buscar movimientos bancarios coincidentes con criterios mejorados
        query_banco = """
        WITH MovimientosPosibles AS (
            SELECT 
                bm.id,
                bm.descripcion,
                bm.valor_banco,
                bm.fecha,
                CASE 
                    WHEN LOWER(bm.descripcion) LIKE '%' || @tracking || '%' THEN 100
                    WHEN ABS(bm.valor_banco - @valor) < 1 THEN 90
                    WHEN ABS(bm.valor_banco - @valor) <= 100 THEN 80
                    ELSE 0
                END as score_base,
                CASE
                    WHEN LOWER(bm.descripcion) LIKE '%nequi%' AND @tipo = 'nequi' THEN 20
                    WHEN LOWER(bm.descripcion) LIKE '%consignacion%' AND @tipo = 'consignacion' THEN 20
                    WHEN LOWER(bm.descripcion) LIKE '%transferencia%' AND @tipo = 'transferencia' THEN 20
                    ELSE 0
                END as score_tipo
            FROM `datos-clientes-441216.Conciliaciones.banco_movimientos` bm
            LEFT JOIN `datos-clientes-441216.Conciliaciones.pagosconductor` pc
                ON bm.referencia_pago_asociada = pc.referencia_pago
            WHERE bm.fecha = @fecha
              AND ABS(bm.valor_banco - @valor) <= 100
              AND bm.estado_conciliacion = 'pendiente'
              AND pc.referencia_pago IS NULL
        )
        SELECT 
            *,
            score_base + score_tipo as score_total
        FROM MovimientosPosibles
        WHERE score_base > 0
        ORDER BY score_total DESC, ABS(valor_banco - @valor), descripcion
        LIMIT 5
        """

        movimientos = list(client.query(
            query_banco,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("fecha", "DATE", fecha_pago),
                    bigquery.ScalarQueryParameter("valor", "FLOAT", valor_pago),
                    bigquery.ScalarQueryParameter("tracking", "STRING", tracking or ""),
                    bigquery.ScalarQueryParameter("tipo", "STRING", tipo_transaccion)
                ]
            )
        ).result())

        # 3. Procesar coincidencias
        for mov in movimientos:
            score_total = float(mov.score_total)
            es_match_exacto = score_total >= 90
            
            if es_match_exacto or score_total >= 80:
                # Actualizar movimiento banco
                query_update_banco = """
                UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
                SET 
                    estado_conciliacion = @estado,
                    referencia_pago_asociada = @referencia,
                    fecha_conciliacion = CURRENT_TIMESTAMP()
                WHERE id = @id_banco
                """
                
                client.query(
                    query_update_banco,
                    job_config=bigquery.QueryJobConfig(
                        query_parameters=[
                            bigquery.ScalarQueryParameter("estado", "STRING", 
                                "conciliado_exacto" if es_match_exacto else "conciliado_aproximado"),
                            bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago),
                            bigquery.ScalarQueryParameter("id_banco", "STRING", mov.id)
                        ]
                    )
                ).result()

                # Actualizar pago conductor
                query_update_pago = """
                UPDATE `datos-clientes-441216.Conciliaciones.pagosconductor`
                SET 
                    estado_conciliacion = @estado,
                    movimiento_banco_id = @id_banco,
                    fecha_conciliacion = CURRENT_TIMESTAMP(),
                    confianza_conciliacion = @confianza
                WHERE id_string = @id_pago
                """
                
                client.query(
                    query_update_pago,
                    job_config=bigquery.QueryJobConfig(
                        query_parameters=[
                            bigquery.ScalarQueryParameter("estado", "STRING", 
                                "conciliado_exacto" if es_match_exacto else "conciliado_aproximado"),
                            bigquery.ScalarQueryParameter("id_banco", "STRING", mov.id),
                            bigquery.ScalarQueryParameter("id_pago", "STRING", id_pago),
                            bigquery.ScalarQueryParameter("confianza", "FLOAT", score_total)
                        ]
                    )
                ).result()

                return f"{'EXACT' if es_match_exacto else 'APPROX'}_{referencia_pago}"

        print(f"❌ No match para pago {id_pago} | {fecha_pago} | ${valor_pago:,.0f}")
        return None
    except Exception as e:
        print(f"❌ Error en conciliación: {str(e)}")
        return None

@router.get("/conciliacion-automatica-mejorada")
async def conciliacion_automatica_mejorada():
    """
    Endpoint de conciliación automática mejorada
    """
    client = bigquery.Client()
    try:
        # 1. Obtener pagos pendientes de conciliar
        query_pagos = """
        SELECT 
            id_string,
            referencia,
            CAST(fecha_pago AS STRING) as fecha_pago,
            COALESCE(tipo, '') as tipo,
            COALESCE(valor_total_consignacion, valor) as valor_pago,
            tracking,
            entidad,
            estado_conciliacion
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE estado_conciliacion = 'pendiente_conciliacion'
        AND fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        """
        
        pagos = list(client.query(query_pagos).result())
        
        total_procesados = 0
        conciliados_exactos = 0
        conciliados_aproximados = 0
        referencias_usadas = set()
        resultados = []

        print(f"\n🔄 Procesando {len(pagos)} pagos pendientes...")

        # 2. Para cada pago, intentar conciliar
        for pago in pagos:
            # Usar referencia si existe, si no usar id_string
            id_pago = pago.referencia if pago.referencia else pago.id_string
            
            # Buscar movimientos bancarios correspondientes
            query_banco = """
            SELECT 
                id,
                descripcion,
                valor_banco,
                fecha,
                CASE 
                    WHEN LOWER(descripcion) LIKE '%' || @tracking || '%' THEN 100
                    WHEN ABS(valor_banco - @valor) < 1 THEN 90
                    WHEN ABS(valor_banco - @valor) <= 100 THEN 80
                    ELSE 0
                END as score_base,
                CASE
                    WHEN LOWER(descripcion) LIKE '%nequi%' AND LOWER(@tipo) = 'nequi' THEN 20
                    WHEN LOWER(descripcion) LIKE '%consignacion%' AND LOWER(@tipo) = 'consignacion' THEN 20
                    WHEN LOWER(descripcion) LIKE '%transferencia%' AND LOWER(@tipo) = 'transferencia' THEN 20
                    ELSE 0
                END as score_tipo
            FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
            WHERE fecha = @fecha
              AND ABS(valor_banco - @valor) <= 100
              AND estado_conciliacion = 'pendiente'
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("fecha", "DATE", pago.fecha_pago),
                    bigquery.ScalarQueryParameter("valor", "FLOAT", float(pago.valor_pago)),
                    bigquery.ScalarQueryParameter("tracking", "STRING", pago.tracking or ""),
                    bigquery.ScalarQueryParameter("tipo", "STRING", pago.tipo.lower())
                ]
            )

            movimientos = list(client.query(query_banco, job_config=job_config).result())
            
            total_procesados += 1
            
            # Procesar el mejor match si existe
            if movimientos:
                movimiento = max(movimientos, key=lambda m: m.score_base + m.score_tipo)
                score_total = movimiento.score_base + movimiento.score_tipo
                es_match_exacto = score_total >= 90

                if es_match_exacto or score_total >= 80:
                    # Actualizar movimiento banco
                    query_update_banco = """
                    UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
                    SET 
                        estado_conciliacion = @estado,
                        referencia_pago_asociada = @referencia,
                        conciliado_en = CURRENT_TIMESTAMP(),
                        conciliado_por = 'sistema',                        confianza_match = CAST(@confianza AS NUMERIC),
                        match_manual = FALSE
                    WHERE id = @id_banco
                    """
                    
                    client.query(
                        query_update_banco,
                        job_config=bigquery.QueryJobConfig(
                            query_parameters=[
                                bigquery.ScalarQueryParameter("estado", "STRING", 
                                    "conciliado_exacto" if es_match_exacto else "conciliado_aproximado"),
                                bigquery.ScalarQueryParameter("referencia", "STRING", id_pago),
                                bigquery.ScalarQueryParameter("id_banco", "STRING", movimiento.id),
                                bigquery.ScalarQueryParameter("confianza", "FLOAT", score_total)
                            ]
                        )
                    ).result()

                    # Actualizar pago conductor
                    query_update_pago = """
                    UPDATE `datos-clientes-441216.Conciliaciones.pagosconductor`
                    SET 
                        estado_conciliacion = @estado,
                        id_banco_asociado = @id_banco,
                        fecha_conciliacion = CURRENT_DATE(),
                        modificado_en = CURRENT_TIMESTAMP(),
                        modificado_por = 'sistema',
                        confianza_conciliacion = CAST(@confianza AS NUMERIC),
                        observaciones_conciliacion = CONCAT('Conciliación automática con score: ', CAST(@confianza as STRING)),
                        conciliado = TRUE
                    WHERE id_string = @id_string
                    """
                    
                    client.query(
                        query_update_pago,
                        job_config=bigquery.QueryJobConfig(
                            query_parameters=[
                                bigquery.ScalarQueryParameter("estado", "STRING", 
                                    "conciliado_exacto" if es_match_exacto else "conciliado_aproximado"),
                                bigquery.ScalarQueryParameter("id_banco", "STRING", movimiento.id),
                                bigquery.ScalarQueryParameter("id_string", "STRING", pago.id_string),
                                bigquery.ScalarQueryParameter("confianza", "FLOAT", score_total)
                            ]
                        )
                    ).result()

                    if es_match_exacto:
                        conciliados_exactos += 1
                    else:
                        conciliados_aproximados += 1

                    referencias_usadas.add(id_pago)

            # Imprimir progreso cada 10 pagos
            if total_procesados % 10 == 0:
                print(f"✓ Procesados: {total_procesados}/{len(pagos)} | Conciliados: {conciliados_exactos + conciliados_aproximados}")

        # 3. Obtener el resumen final
        print(f"\n✅ Conciliación completada:")
        print(f"   - Total procesados: {total_procesados}")
        print(f"   - Conciliados exactos: {conciliados_exactos}")
        print(f"   - Conciliados aproximados: {conciliados_aproximados}")
        
        return {
            "resumen": {
                "total_movimientos_banco": total_procesados,
                "total_pagos_iniciales": len(pagos),
                "total_procesados": total_procesados,
                "referencias_unicas_utilizadas": len(referencias_usadas),
                "conciliado_exacto": conciliados_exactos,
                "conciliado_aproximado": conciliados_aproximados,
                "sin_match": total_procesados - (conciliados_exactos + conciliados_aproximados)
            },
            "resultados": resultados,
            "referencias_usadas": list(referencias_usadas),
            "fecha_conciliacion": datetime.utcnow().isoformat()
        }

    except Exception as e:
        print(f"❌ Error en conciliación automática: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error en conciliación automática: {str(e)}"
        )

# ========== NUEVO ENDPOINT PARA MARCAR CONCILIADO MANUAL ==========

class EstadoConciliacion(str):
    PENDIENTE = "pendiente"
    CONCILIADO_EXACTO = "conciliado_exacto"
    CONCILIADO_APROXIMADO = "conciliado_aproximado"
    CONCILIADO_MANUAL = "conciliado_manual"
    RECHAZADO = "rechazado"
    ERROR = "error"

    @classmethod
    def es_estado_final(cls, estado: str) -> bool:
        """Verifica si un estado es final (no se puede modificar)"""
        return estado.lower() in {
            cls.CONCILIADO_EXACTO,
            cls.CONCILIADO_APROXIMADO,
            cls.CONCILIADO_MANUAL,
            cls.RECHAZADO
        }

class PagoConciliacion(BaseModel):
    """Modelo para el pago a conciliar"""
    referencia_pago: str
    valor: float
    fecha_pago: date
    tipo: str
    estado_actual: str
    id_banco_asociado: Optional[str]
    conciliado_por: Optional[str]
    conciliado_en: Optional[datetime]
    observaciones: Optional[str]

    def validar_cambio_estado(self, nuevo_estado: str) -> bool:
        """Valida si se puede cambiar al nuevo estado"""
        if EstadoConciliacion.es_estado_final(self.estado_actual):
            return False
        return True

class ConciliacionManual(BaseModel):
    referencia_pago: str
    id_banco: str
    usuario: str
    observaciones: Optional[str] = "Conciliado manualmente"

    def validar(self) -> bool:
        """Valida que los datos de conciliación manual sean correctos"""
        return (
            self.estado in {
                EstadoConciliacion.CONCILIADO_MANUAL,
                EstadoConciliacion.RECHAZADO
            }
            and bool(self.usuario_id)
        )

@router.post("/liquidar-cliente")
async def liquidar_entregas(cliente: str, usuario_id: str):
    """
    Actualiza estado de guías a 'liquidado' por cliente, validando integridad
    """
    client = bigquery.Client()
    
    try:
        # 1. Verificar que todas las entregas estén conciliadas
        query_verificacion = f"""
        WITH Pendientes AS (
            SELECT 
                COUNT(*) as total_entregas,
                COUNTIF(bm.estado_conciliacion IN 
                    ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual')
                ) as entregas_conciliadas
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
            LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.banco_movimientos` bm
                ON bm.referencia_pago_asociada = pc.referencia_pago
            WHERE pc.cliente = @cliente
            AND pc.estado = 'aprobado'
            AND pc.fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
        )
        SELECT * FROM Pendientes
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("cliente", "STRING", cliente)
            ]
        )
        
        result = list(client.query(query_verificacion, job_config=job_config).result())[0]
        
        if result.total_entregas == 0:
            raise HTTPException(
                status_code=404,
                detail=f"No se encontraron entregas para el cliente {cliente}"
            )
            
        if result.entregas_conciliadas < result.total_entregas:
            pendientes = result.total_entregas - result.entregas_conciliadas
            raise HTTPException(
                status_code=400,
                detail=f"Hay {pendientes} entregas sin conciliar para el cliente {cliente}"
            )
            
        # 2. Actualizar estado en guias_liquidacion
        # Segunda actualización: también marcar los pagos como liquidados
        query_liquidar_pagos = f"""
        UPDATE `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
        SET 
            estado = 'liquidado',
            modificado_en = CURRENT_TIMESTAMP(),
            modificado_por = @usuario_id
        WHERE pc.referencia_pago IN (
            SELECT DISTINCT pc.referencia_pago
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
            JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.banco_movimientos` bm
            ON bm.referencia_pago_asociada = pc.referencia_pago
            WHERE pc.cliente = @cliente
            AND pc.estado = 'aprobado'
            AND bm.estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual')
        )
        """

        job_config_liquidar = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("cliente", "STRING", cliente),
                bigquery.ScalarQueryParameter("usuario_id", "STRING", usuario_id)
            ]
        )

        update_pagos_job = client.query(query_liquidar_pagos, job_config=job_config_liquidar)
        update_pagos_job.result()

        
        # 3. Obtener resumen de la operación
        query_resumen = f"""
        SELECT COUNT(*) as guias_liquidadas, SUM(valor) as valor_total
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion`
        WHERE cliente = @cliente
        AND estado = 'liquidado'
        AND DATE(liquidado_en) = CURRENT_DATE()
        """
        
        resumen = list(client.query(query_resumen, job_config=job_config).result())[0]
        
        return {
            "status": "success",
            "mensaje": f"Liquidación completada para {cliente}",
            "guias_liquidadas": resumen.guias_liquidadas,
            "valor_total": float(resumen.valor_total),
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error liquidando entregas para {cliente}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error interno liquidando entregas: {str(e)}"
        )

# ========== NUEVO ENDPOINT PARA RECHAZAR PAGOS ==========

@router.post("/rechazar-pago/{referencia}")
async def rechazar_pago(
    referencia: str,
    usuario_id: str,
    motivo: str
):
    """
    Rechaza un pago, limpia id_banco_asociado y registra novedad
    """
    client = bigquery.Client()
    timestamp = datetime.utcnow()
    
    try:
        # 1. Verificar estado actual
        query_verificar = f"""
        SELECT estado_conciliacion, id_banco_asociado
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
        WHERE referencia_pago = @referencia
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia)
            ]
        )
        
        resultado = list(client.query(query_verificar, job_config=job_config).result())
        
        if not resultado:
            raise HTTPException(
                status_code=404,
                detail=f"No se encontró el pago con referencia {referencia}"
            )
            
        pago = resultado[0]
        
        if EstadoConciliacion.es_estado_final(pago.estado_conciliacion):
            raise HTTPException(
                status_code=400,
                detail=f"No se puede rechazar un pago en estado {pago.estado_conciliacion}"
            )
            
        # 2. Actualizar estado y metadata
        query_rechazar = f"""
        UPDATE `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
        SET 
            estado_conciliacion = @estado,
            id_banco_asociado = NULL,
            modificado_en = @timestamp,
            modificado_por = @usuario,
            novedades = CASE
                WHEN novedades IS NULL OR novedades = ''
                THEN @novedad
                ELSE CONCAT(novedades, ' | ', @novedad)
            END
        WHERE referencia_pago = @referencia
        """
        
        novedad = f"RECHAZO ({timestamp.strftime('%Y-%m-%d %H:%M:%S')}): {motivo} - Por: {usuario_id}"
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia),
                bigquery.ScalarQueryParameter("estado", "STRING", EstadoConciliacion.RECHAZADO),
                bigquery.ScalarQueryParameter("timestamp", "TIMESTAMP", timestamp),
                bigquery.ScalarQueryParameter("usuario", "STRING", usuario_id),
                bigquery.ScalarQueryParameter("novedad", "STRING", novedad)
            ]
        )
        
        update_job = client.query(query_rechazar, job_config=job_config)
        update_job.result()
        
        # 3. Si había id_banco_asociado, actualizar movimiento bancario
        if pago.id_banco_asociado:
            query_banco = f"""
            UPDATE `{PROJECT_ID}.{DATASET_CONCILIACIONES}.banco_movimientos`
            SET 
                estado_conciliacion = 'pendiente',
                referencia_pago_asociada = NULL,
                modificado_en = @timestamp,
                modificado_por = @usuario
            WHERE id = @id_banco
            """
            
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("id_banco", "STRING", pago.id_banco_asociado),
                    bigquery.ScalarQueryParameter("timestamp", "TIMESTAMP", timestamp),
                    bigquery.ScalarQueryParameter("usuario", "STRING", usuario_id)
                ]
            )
            
            banco_job = client.query(query_banco, job_config=job_config)
            banco_job.result()
        
        return {
            "status": "success",
            "mensaje": f"Pago {referencia} rechazado correctamente",
            "usuario": usuario_id,
            "timestamp": timestamp.isoformat(),
            "motivo": motivo
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rechazando pago {referencia}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error interno rechazando pago: {str(e)}"
        )

# ========== NUEVO ENDPOINT DE DIAGNÓSTICO AVANZADO ==========

@router.get("/diagnostico-avanzado")
async def diagnostico_avanzado():
    """
    Endpoint mejorado de diagnóstico que analiza la integridad del sistema de conciliación
    """
    client = bigquery.Client()
    
    try:
        diagnostico = {
            "pagos": {},
            "banco": {},
            "guias": {},
            "integridad": {},
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # 1. Análisis de pagos
        query_pagos = f"""
        WITH EstadosPago AS (
            SELECT 
                COUNT(*) as total,
                COUNTIF(estado_conciliacion IN (
                    'conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual'
                )) as conciliados,
                COUNTIF(estado_conciliacion = 'rechazado') as rechazados,
                COUNTIF(estado_conciliacion IN ('pendiente', 'pendiente_conciliacion')) as pendientes,
                COUNTIF(estado_conciliacion = 'error') as errores,
                MIN(fecha_pago) as fecha_min,
                MAX(fecha_pago) as fecha_max,
                SUM(COALESCE(valor_total_consignacion, valor)) as valor_total
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
            WHERE fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
        )
        SELECT * FROM EstadosPago
        """
        
        pagos = list(client.query(query_pagos).result())[0]
        
        diagnostico["pagos"] = {
            "total": pagos.total,
            "conciliados": pagos.conciliados,
            "rechazados": pagos.rechazados,
            "pendientes": pagos.pendientes,
            "errores": pagos.errores,
            "fecha_min": pagos.fecha_min.isoformat() if pagos.fecha_min else None,
            "fecha_max": pagos.fecha_max.isoformat() if pagos.fecha_max else None,
            "valor_total": float(pagos.valor_total)
        }
        
        # 2. Análisis de movimientos bancarios
        query_banco = f"""
        SELECT 
            COUNT(*) as total,
            COUNTIF(estado_conciliacion IN (
                'conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual'
            )) as conciliados,
            COUNTIF(estado_conciliacion = 'pendiente') as pendientes,
            COUNTIF(referencia_pago_asociada IS NOT NULL) as con_referencia,
            MIN(fecha) as fecha_min,
            MAX(fecha) as fecha_max,
            SUM(valor_banco) as valor_total
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.banco_movimientos`
        WHERE fecha >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
        """
        
        banco = list(client.query(query_banco).result())[0]
        
        diagnostico["banco"] = {
            "total": banco.total,
            "conciliados": banco.conciliados,
            "pendientes": banco.pendientes,
            "con_referencia": banco.con_referencia,
            "fecha_min": banco.fecha_min.isoformat() if banco.fecha_min else None,
            "fecha_max": banco.fecha_max.isoformat() if banco.fecha_max else None,
            "valor_total": float(banco.valor_total)
        }
        
        # 3. Análisis de guías
        query_guias = f"""
        SELECT 
            COUNT(*) as total,
            COUNTIF(estado = 'liquidado') as liquidadas,
            COUNTIF(estado = 'conciliado') as conciliadas,
            COUNTIF(estado = 'pendiente') as pendientes,
            MIN(fecha_pago) as fecha_min,
            MAX(fecha_pago) as fecha_max,
            SUM(valor) as valor_total
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion`
        WHERE fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
        """
        
        guias = list(client.query(query_guias).result())[0]
        
        diagnostico["guias"] = {
            "total": guias.total,
            "liquidadas": guias.liquidadas,
            "conciliadas": guias.conciliadas,
            "pendientes": guias.pendientes,
            "fecha_min": guias.fecha_min.isoformat() if guias.fecha_min else None,
            "fecha_max": guias.fecha_max.isoformat() if guias.fecha_max else None,
            "valor_total": float(guias.valor_total)
        }
        
        # 4. Validación de integridad
        query_integridad = f"""
        WITH Inconsistencias AS (
            SELECT 
                -- Referencias inválidas
                COUNTIF(pc.id_banco_asociado IS NOT NULL 
                       AND pc.id_banco_asociado NOT IN (
                           SELECT id FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.banco_movimientos`
                       )) as refs_invalidas,
               
                -- Estados inconsistentes
                COUNTIF(pc.estado_conciliacion IN (
                    'conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual'
                ) AND pc.id_banco_asociado IS NULL) as estados_inconsistentes,
                
                -- Valores inconsistentes
                COUNTIF(ABS(COALESCE(pc.valor_total_consignacion, pc.valor) - bm.valor_banco) > 100
                       AND pc.estado_conciliacion IN (
                           'conciliado_exacto', 'conciliado_aproximado'
                       )) as valores_inconsistentes
               
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor` pc
            LEFT JOIN `{PROJECT_ID}.{DATASET_CONCILIACIONES}.banco_movimientos` bm
                ON bm.id = pc.id_banco_asociado
            WHERE pc.fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
        )
        SELECT * FROM Inconsistencias
        """
        
        integridad = list(client.query(query_integridad).result())[0]
        
        diagnostico["integridad"] = {
            "referencias_invalidas": integridad.refs_invalidas,
            "estados_inconsistentes": integridad.estados_inconsistentes,
            "valores_inconsistentes": integridad.valores_inconsistentes,
            "estado_general": "OK" if all(v == 0 for v in [
                integridad.refs_invalidas,
                integridad.estados_inconsistentes,
                integridad.valores_inconsistentes
            ]) else "ERROR"
        }
        
        return diagnostico
        
    except Exception as e:
        logger.error(f"Error en diagnóstico avanzado: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error ejecutando diagnóstico: {str(e)}"
        )


@router.post("/conciliar-manual")
async def conciliar_pago_manual(data: ConciliacionManual):
    """
    Concilia un pago manualmente desde Cruces
    """
    client = bigquery.Client()

    try:
        # Verifica que el pago exista
        query_check = """
        SELECT referencia FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE referencia_pago = @referencia
        LIMIT 1
        """
        job_config_check = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", data.referencia_pago)
            ]
        )
        rows = list(client.query(query_check, job_config=job_config_check).result())
        if not rows:
            raise HTTPException(status_code=404, detail="Pago no encontrado")

        # Actualiza pagosconductor
        query_pago = """
        UPDATE `datos-clientes-441216.Conciliaciones.pagosconductor`
        SET 
            estado_conciliacion = 'conciliado_manual',
            confianza_conciliacion = 100,
            id_banco_asociado = @id_banco,
            modificado_en = CURRENT_TIMESTAMP(),
            modificado_por = @usuario,
            conciliado = TRUE,
            conciliado_por = @usuario,
            fecha_conciliacion = CURRENT_DATE()
        WHERE referencia_pago = @referencia
        """
        job_config_pago = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("id_banco", "STRING", data.id_banco),
                bigquery.ScalarQueryParameter("referencia", "STRING", data.referencia_pago),
                bigquery.ScalarQueryParameter("usuario", "STRING", data.usuario)
            ]
        )
        client.query(query_pago, job_config=job_config_pago).result()

        # Actualiza banco_movimientos
        query_banco = """
        UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
        SET 
            estado_conciliacion = 'conciliado_manual',
            confianza_match = 100,
            referencia_pago_asociada = @referencia,
            observaciones = @observaciones,
            conciliado_por = @usuario,
            conciliado_en = CURRENT_TIMESTAMP()
        WHERE id = @id_banco
        """
        job_config_banco = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("id_banco", "STRING", data.id_banco),
                bigquery.ScalarQueryParameter("referencia", "STRING", data.referencia_pago),
                bigquery.ScalarQueryParameter("observaciones", "STRING", data.observaciones or ""),
                bigquery.ScalarQueryParameter("usuario", "STRING", data.usuario)
            ]
        )
        client.query(query_banco, job_config=job_config_banco).result()

        return {
            "mensaje": "Pago conciliado manualmente",
            "referencia": data.referencia_pago,
            "banco": data.id_banco
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en conciliación manual: {str(e)}")


@router.get("/resumen-conciliacion")
def obtener_resumen_conciliacion():
    """
    Endpoint para obtener resumen de conciliación que requiere Cruces.tsx
    """
    client = bigquery.Client()
    
    try:
        # 1. Resumen general
        query_general = """
        SELECT 
            COUNT(*) as total_movimientos,
            COUNTIF(estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual')) as conciliados,
            COUNTIF(estado_conciliacion = 'pendiente') as pendientes,
            SUM(valor_banco) as valor_total,
            MIN(fecha) as fecha_inicial,
            MAX(fecha) as fecha_final
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE fecha >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
        """
        
        resultado_general = list(client.query(query_general).result())[0]
        
        # 2. Resumen por estado
        query_estados = """
        SELECT 
            estado_conciliacion,
            COUNT(*) as cantidad,
            SUM(valor_banco) as valor_total,
            MIN(fecha) as fecha_min,
            MAX(fecha) as fecha_max
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE fecha >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
        GROUP BY estado_conciliacion
        ORDER BY cantidad DESC
        """
        
        estados = []
        for row in client.query(query_estados).result():
            estados.append({
                "estado_conciliacion": row["estado_conciliacion"],
                "cantidad": int(row["cantidad"]),
                "valor_total": float(row["valor_total"]) if row["valor_total"] else 0,
                "fecha_min": row["fecha_min"].isoformat() if row["fecha_min"] else None,
                "fecha_max": row["fecha_max"].isoformat() if row["fecha_max"] else None
            })
        
        return {
            "resumen_general": {
                "total_movimientos": int(resultado_general["total_movimientos"]),
                "conciliados": int(resultado_general["conciliados"]),
                "pendientes": int(resultado_general["pendientes"]),
                "valor_total": float(resultado_general["valor_total"]) if resultado_general["valor_total"] else 0,
                "fecha_inicial": resultado_general["fecha_inicial"].isoformat() if resultado_general["fecha_inicial"] else None,
                "fecha_final": resultado_general["fecha_final"].isoformat() if resultado_general["fecha_final"] else None
            },
            "resumen_por_estado": estados,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo resumen de conciliación: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo resumen: {str(e)}"
        )
        
@router.post("/marcar-conciliado-manual")
def marcar_conciliado_manual(data: dict):
    """
    Endpoint para marcar una conciliación como manual desde Cruces.tsx
    """
    id_banco = data.get("id_banco")
    referencia_pago = data.get("referencia_pago")
    observaciones = data.get("observaciones", "Conciliado manualmente")
    usuario = data.get("usuario", "sistema")
    
    if not id_banco:
        raise HTTPException(status_code=400, detail="id_banco es requerido")
    
    client = bigquery.Client()
    timestamp = datetime.utcnow()
    
    try:
        # Si no hay referencia_pago, buscar el mejor match posible
        if not referencia_pago:
            # Buscar movimiento bancario
            query_banco = """
            SELECT fecha, valor_banco 
            FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
            WHERE id = @id_banco
            LIMIT 1
            """
            
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("id_banco", "STRING", id_banco)
                ]
            )
            
            banco_result = list(client.query(query_banco, job_config=job_config).result())
            
            if not banco_result:
                raise HTTPException(status_code=404, detail="Movimiento bancario no encontrado")
            
            banco = banco_result[0]
            
            # Buscar mejor match en pagos
            query_mejor_match = """
            SELECT referencia_pago
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            WHERE fecha_pago = @fecha
            AND ABS(COALESCE(valor_total_consignacion, CAST(valor AS FLOAT64), 0) - @valor) <= 1000
            AND estado IN ('aprobado', 'pagado')
            ORDER BY ABS(COALESCE(valor_total_consignacion, CAST(valor AS FLOAT64), 0) - @valor)
            LIMIT 1
            """
            
            job_config_match = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("fecha", "DATE", banco["fecha"]),
                    bigquery.ScalarQueryParameter("valor", "FLOAT", float(banco["valor_banco"]))
                ]
            )
            
            match_result = list(client.query(query_mejor_match, job_config=job_config_match).result())
            
            if match_result:
                referencia_pago = match_result[0]["referencia_pago"]
        
        # Actualizar movimiento bancario
        query_update_banco = """
        UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
        SET 
            estado_conciliacion = 'conciliado_manual',
            referencia_pago_asociada = @referencia,
            observaciones = @observaciones,
            conciliado_por = @usuario,
            conciliado_en = @timestamp,
            confianza_match = 100,
            match_manual = TRUE
        WHERE id = @id_banco
        """
        
        job_config_banco = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("id_banco", "STRING", id_banco),
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago),
                bigquery.ScalarQueryParameter("observaciones", "STRING", observaciones),
                bigquery.ScalarQueryParameter("usuario", "STRING", usuario),
                bigquery.ScalarQueryParameter("timestamp", "TIMESTAMP", timestamp)
            ]
        )
        
        client.query(query_update_banco, job_config=job_config_banco).result()
        
        # Si hay referencia de pago, actualizar también el pago
        if referencia_pago:
            query_update_pago = """
            UPDATE `datos-clientes-441216.Conciliaciones.pagosconductor`
            SET 
                estado_conciliacion = 'conciliado_manual',
                id_banco_asociado = @id_banco,
                fecha_conciliacion = CURRENT_DATE(),
                modificado_en = @timestamp,
                modificado_por = @usuario,
                confianza_conciliacion = 100,
                observaciones_conciliacion = @observaciones,
                conciliado = TRUE
            WHERE referencia_pago = @referencia
            """
            
            job_config_pago = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("id_banco", "STRING", id_banco),
                    bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago),
                    bigquery.ScalarQueryParameter("observaciones", "STRING", observaciones),
                    bigquery.ScalarQueryParameter("usuario", "STRING", usuario),
                    bigquery.ScalarQueryParameter("timestamp", "TIMESTAMP", timestamp)
                ]
            )
            
            client.query(query_update_pago, job_config=job_config_pago).result()
        
        return {
            "mensaje": "Conciliación manual completada exitosamente",
            "id_banco": id_banco,
            "referencia_pago": referencia_pago,
            "usuario": usuario,
            "timestamp": timestamp.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en conciliación manual: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error en conciliación manual: {str(e)}"
        )
        
