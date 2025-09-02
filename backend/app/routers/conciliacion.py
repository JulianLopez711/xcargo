from fastapi import APIRouter, Form, UploadFile, File, HTTPException, Body, Query, Depends,status
from fastapi.responses import StreamingResponse
from google.cloud import bigquery
from typing import List, Dict, Optional, Any, AsyncGenerator
from pydantic import BaseModel
from datetime import datetime, date, timedelta
import logging
import json
import asyncio

from decimal import Decimal
from collections import defaultdict
import json
import asyncio
import logging
import os
import csv
import io
import logging
import json
import asyncio

def get_bigquery_client() -> bigquery.Client:
    """Obtiene cliente de BigQuery con manejo de errores"""
    try:
        return bigquery.Client(project=PROJECT_ID)
    except Exception as e:
        
        raise HTTPException(
            status_code=500, 
            detail="Error de configuración de base de datos"
        )

def convertir_decimales_a_float(obj):
    """Convierte recursivamente todos los objetos Decimal a float para serialización JSON"""
    if isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, dict):
        return {k: convertir_decimales_a_float(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convertir_decimales_a_float(item) for item in obj]
    else:
        return obj

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
    print(f"  🔗 Separadores detectados: {dict(analisis['separadores_detectados'])}")
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
                    fecha_conciliacion = CURRENT_DATE()
                WHERE id = @id_banco
                """
                
                client.query(
                    query_update_banco,
                    job_config=bigquery.QueryJobConfig(
                        query_parameters=[
                            bigquery.ScalarQueryParameter("estado", "STRING", 
                                "conciliado_automatico" if es_match_exacto else "conciliado_aproximado"),
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
                    fecha_conciliacion = CURRENT_DATE(),
                    confianza_conciliacion = @confianza
                WHERE id_string = @id_pago
                """
                
                client.query(
                    query_update_pago,
                    job_config=bigquery.QueryJobConfig(
                        query_parameters=[
                            bigquery.ScalarQueryParameter("estado", "STRING", 
                                "conciliado_automatico" if es_match_exacto else "conciliado_aproximado"),
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
    Conciliación automática mejorada:
    - Agrupa pagos por Id_Transaccion o referencia individual (solo estado 'pendiente_conciliacion')
    - Movimientos bancarios solo estado 'pendiente', 'Pendiente', 'PENDIENTE'
    - Si es pago agrupado (Id_Transaccion no nulo y varias referencias distintas): SIN MATCH directo
    - Si es individual (Id_Transaccion nulo o solo una referencia): busca match exacto valor y fecha
    - Si match: actualiza ambos lados, si Id_Transaccion no nulo agrega 'referencia_pago;Id_Transaccion' en banco
    - Devuelve todos los pagos pendientes con resultado de la operación
    """
    async def generar_progreso() -> AsyncGenerator[str, None]:
        try:
            client = get_bigquery_client()
            # 1. Obtener pagos pendientes agrupados
            FECHA_MINIMA = "2025-06-09"
            query_pagos = f"""
                SELECT 
                    CASE 
                        WHEN pc.Id_Transaccion IS NOT NULL THEN CAST(pc.Id_Transaccion AS STRING)
                        ELSE pc.referencia_pago
                    END as grupo_pago,
                    ARRAY_AGG(STRUCT(
                        pc.referencia_pago AS referencia_pago,
                        pc.referencia AS referencia,
                        pc.valor AS valor,
                        pc.valor_total_consignacion AS valor_total_consignacion,
                        pc.fecha_pago AS fecha_pago,
                        pc.id_string AS id_string,
                        pc.Id_Transaccion AS Id_Transaccion
                    )) AS pagos
                FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
                WHERE pc.fecha_pago >= @fecha_minima_auto
                  AND pc.estado_conciliacion = 'pendiente_conciliacion'
                  AND pc.referencia_pago IS NOT NULL
                GROUP BY grupo_pago
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("fecha_minima_auto", "DATE", FECHA_MINIMA)
                ]
            )
            pagos_rows = list(client.query(query_pagos, job_config=job_config).result())
            pagos_por_grupo = {}
            for row in pagos_rows:
                pagos_por_grupo[row.grupo_pago] = row.pagos

            yield f"data: {json.dumps({'tipo': 'info', 'mensaje': f'📊 {sum(len(p) for p in pagos_por_grupo.values())} pagos en {len(pagos_por_grupo)} grupos', 'porcentaje': 20})}\n\n"
            await asyncio.sleep(0.1)

            # 2. Obtener movimientos bancarios pendientes CON VALIDACIÓN DE VALOR EXTRAÍDO
            query_banco = """
                SELECT 
                    id, 
                    fecha, 
                    valor_banco, 
                    tipo, 
                    descripcion,
                    -- 🔥 EXTRAER VALOR REAL DEL ID (después del segundo '_')
                    CASE 
                        WHEN REGEXP_CONTAINS(id, r'^BANCO_\d{8}_\d+_\d+$') THEN
                            CAST(REGEXP_EXTRACT(id, r'^BANCO_\d{8}_(\d+)_\d+$') AS FLOAT64)
                        ELSE valor_banco
                    END as valor_real_extraido
                FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
                WHERE LOWER(estado_conciliacion) IN ('pendiente', 'pendiente_conciliacion')
                   OR estado_conciliacion IN ('PENDIENTE', 'Pendiente', 'pendiente')
            """
            banco_rows = list(client.query(query_banco).result())

            yield f"data: {json.dumps({'tipo': 'info', 'mensaje': f'💳 {len(banco_rows)} movimientos bancarios pendientes', 'porcentaje': 40})}\n\n"
            await asyncio.sleep(0.1)

            resultados = []
            procesadas = 0
            total_grupos = len(pagos_por_grupo)

            for grupo, pagos in pagos_por_grupo.items():
                procesadas += 1
                porcentaje_actual = 40 + int((procesadas / total_grupos) * 50)
                # Determinar si es agrupado (Id_Transaccion no nulo y varias referencias distintas)
                ids_transaccion = set([p["Id_Transaccion"] for p in pagos if p["Id_Transaccion"] is not None])
                referencias = set([p["referencia"] for p in pagos])
                es_agrupado = False
                id_transaccion = pagos[0]["Id_Transaccion"] if pagos[0]["Id_Transaccion"] is not None else None
                if id_transaccion is not None and len(referencias) > 1:
                    es_agrupado = True

                # Tomar valores para mostrar
                valor_total = float(pagos[0]["valor_total_consignacion"]) if ("valor_total_consignacion" in pagos[0] and pagos[0]["valor_total_consignacion"] is not None) else float(pagos[0]["valor"])
                fecha_pago = pagos[0]["fecha_pago"]
                referencia_pago = pagos[0]["referencia_pago"]

                resultado_operacion = {
                    "grupo_pago": grupo,
                    "referencias": list(referencias),
                    "Id_Transaccion": id_transaccion,
                    "valor_total": valor_total,
                    "fecha_pago": str(fecha_pago),
                    "pagos": [dict(p) for p in pagos],
                    "operacion": "",
                    "match": None,
                    "mensaje": "",
                }

                if es_agrupado:
                    # Caso agrupado: SIN MATCH directo
                    resultado_operacion["operacion"] = "sin_match_agrupado"
                    resultado_operacion["mensaje"] = "Pago agrupado (varias referencias), no se concilia automáticamente"
                    yield f"data: {json.dumps({'tipo': 'info', 'mensaje': f'❌ SIN MATCH AGRUPADO: {grupo}', 'porcentaje': porcentaje_actual})}\n\n"
                else:
                    # Caso individual: buscar match exacto en banco usando VALOR EXTRAÍDO DEL ID
                    match = None
                    for mov in banco_rows:
                        valor_banco_real = float(mov.valor_real_extraido) if mov.valor_real_extraido else float(mov.valor_banco)
                        
                        # 🔥 VALIDACIÓN MEJORADA: Comparar con valor extraído del ID
                        if valor_banco_real == valor_total and str(mov.fecha) == str(fecha_pago):
                            # ✅ VALIDACIÓN ADICIONAL: Verificar coherencia entre valor_banco y valor extraído
                            diferencia_valores = abs(float(mov.valor_banco) - valor_banco_real)
                            
                            # Si hay diferencia significativa, loguear para diagnóstico
                            if diferencia_valores > 1000:  # Diferencia mayor a $1,000
                                logger.warning(f"⚠️ DISCREPANCIA en {mov.id}: valor_banco=${mov.valor_banco}, valor_extraído=${valor_banco_real}")
                                yield f"data: {json.dumps({'tipo': 'warning', 'mensaje': f'⚠️ Discrepancia detectada en {mov.id}', 'porcentaje': porcentaje_actual})}\n\n"
                                # Continuar con la siguiente iteración si hay discrepancia grande
                                continue
                            
                            match = mov
                            break
                    
                    if match:
                        # 🔥 ACTUALIZACIÓN MEJORADA: Usar criterios específicos según el tipo de pago
                        
                        if id_transaccion is not None:
                            # ✅ PAGO CON Id_Transaccion: Actualizar SOLO por Id_Transaccion específico
                            update_pagos_query = f"""
                                UPDATE `datos-clientes-441216.Conciliaciones.pagosconductor`
                                SET estado_conciliacion = 'conciliado_automatico',
                                    fecha_conciliacion = CURRENT_DATE(),
                                    id_banco_asociado = '{match.id}',
                                    confianza_conciliacion = 100
                                WHERE Id_Transaccion = {id_transaccion}
                                  AND estado_conciliacion = 'pendiente_conciliacion'
                            """
                            ref_banco = f"{referencia_pago};{id_transaccion}"
                            logger.info(f"🔗 Actualizando por Id_Transaccion: {id_transaccion}")
                        else:
                            # ✅ PAGO SIN Id_Transaccion: Usar criterios específicos (referencia + fecha + valor)
                            valor_pago = pagos[0]["valor_total_consignacion"] if pagos[0]["valor_total_consignacion"] else pagos[0]["valor"]
                            update_pagos_query = f"""
                                UPDATE `datos-clientes-441216.Conciliaciones.pagosconductor`
                                SET estado_conciliacion = 'conciliado_automatico',
                                    fecha_conciliacion = CURRENT_DATE(),
                                    id_banco_asociado = '{match.id}',
                                    confianza_conciliacion = 100
                                WHERE referencia_pago = '{referencia_pago}'
                                  AND fecha_pago = '{fecha_pago}'
                                  AND COALESCE(valor_total_consignacion, valor) = {valor_pago}
                                  AND Id_Transaccion IS NULL
                                  AND estado_conciliacion = 'pendiente_conciliacion'
                            """
                            ref_banco = referencia_pago
                            logger.info(f"📄 Actualizando pago individual: {referencia_pago} | {fecha_pago} | ${valor_pago}")
                        
                        client.query(update_pagos_query).result()
                        
                        # Actualizar banco_movimientos
                        update_banco_query = f"""
                            UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
                            SET estado_conciliacion = 'conciliado_automatico',
                                referencia_pago_asociada = '{ref_banco}',
                                confianza_match = 100,
                                conciliado_en = CURRENT_TIMESTAMP()
                            WHERE id = '{match.id}'
                        """
                        client.query(update_banco_query).result()
                        resultado_operacion["operacion"] = "conciliado_automatico"
                        resultado_operacion["match"] = {
                            "id_banco": match.id,
                            "valor_banco": float(match.valor_banco),
                            "valor_real_extraido": float(match.valor_real_extraido) if match.valor_real_extraido else float(match.valor_banco),
                            "fecha_banco": str(match.fecha),
                            "tipo": match.tipo,
                            "descripcion": match.descripcion,
                            "discrepancia_detectada": abs(float(match.valor_banco) - float(match.valor_real_extraido)) > 1000 if match.valor_real_extraido else False
                        }
                        resultado_operacion["mensaje"] = "Conciliado automáticamente con validación de valor extraído"
                        
                        # 🔥 LOG DETALLADO PARA DIAGNÓSTICO
                        valor_usado = float(match.valor_real_extraido) if match.valor_real_extraido else float(match.valor_banco)
                        logger.info(f"✅ CONCILIADO: {grupo} | Pago=${valor_total:,.0f} | Banco=${valor_usado:,.0f} | ID={match.id}")
                        
                        yield f"data: {json.dumps({'tipo': 'exito', 'mensaje': f'✅ CONCILIADO: {grupo} - Pago:${valor_total:,.0f} ↔ Banco:${valor_usado:,.0f}', 'porcentaje': porcentaje_actual})}\n\n"
                    else:
                        resultado_operacion["operacion"] = "sin_match"
                        
                        # 🔥 DIAGNÓSTICO DETALLADO: Mostrar por qué no hubo match
                        matches_por_valor = [mov for mov in banco_rows if float(mov.valor_real_extraido or mov.valor_banco) == valor_total]
                        matches_por_fecha = [mov for mov in banco_rows if str(mov.fecha) == str(fecha_pago)]
                        
                        if matches_por_valor and not matches_por_fecha:
                            resultado_operacion["mensaje"] = f"Valor coincide (${valor_total:,.0f}) pero no la fecha ({fecha_pago})"
                        elif matches_por_fecha and not matches_por_valor:
                            resultado_operacion["mensaje"] = f"Fecha coincide ({fecha_pago}) pero no el valor (${valor_total:,.0f})"
                        elif not matches_por_valor and not matches_por_fecha:
                            resultado_operacion["mensaje"] = f"No hay coincidencias de valor ni fecha"
                        else:
                            resultado_operacion["mensaje"] = "No se encontró match exacto en banco"
                        
                        # Log para diagnóstico
                        logger.info(f"❌ SIN MATCH: {grupo} | Pago=${valor_total:,.0f} en {fecha_pago} | Matches valor:{len(matches_por_valor)} fecha:{len(matches_por_fecha)}")
                        
                        mensaje_sin_match = resultado_operacion["mensaje"]
                        yield f"data: {json.dumps({'tipo': 'info', 'mensaje': f'❌ SIN MATCH: {grupo} - {mensaje_sin_match}', 'porcentaje': porcentaje_actual})}\n\n"

                resultados.append(resultado_operacion)

            # Finalización
            yield f"data: {json.dumps({'tipo': 'fase', 'mensaje': '🏁 Finalizando conciliación y generando reporte...', 'porcentaje': 100})}\n\n"
            await asyncio.sleep(0.1)

            # Devuelve todos los pagos pendientes con resultado de la operación
            yield f"data: {json.dumps({'tipo': 'completado', 'pagos_resultado': resultados, 'timestamp': datetime.now().isoformat()})}\n\n"

        except Exception as e:
            error_msg = f"💥 Error crítico en conciliación: {str(e)}"
            yield f"data: {json.dumps({'tipo': 'error', 'mensaje': error_msg, 'porcentaje': 0})}\n\n"

    return StreamingResponse(
        generar_progreso(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*"
        }
    )

@router.get("/conciliacion-automatica-fallback")
async def conciliacion_automatica_fallback():
    """
    Endpoint de conciliación automática tradicional como fallback
    """
    client = bigquery.Client()
    margen_error = 100

    try:
        print("🚀 Iniciando conciliación automática (fallback)...")

        # 1. Obtener pagos pendientes
        query_pagos = """
            SELECT referencia_pago, valor, fecha_pago, id_string
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            WHERE estado_conciliacion = 'pendiente_conciliacion'
              AND referencia_pago IS NOT NULL
        """
        pagos_rows = list(client.query(query_pagos).result())
        
        # Agrupar por referencia_pago
        pagos_por_referencia = defaultdict(list)
        for row in pagos_rows:
            pagos_por_referencia[row.referencia_pago].append(row)

        # 2. Obtener movimientos bancarios
        query_banco = """
            SELECT id, fecha, valor_banco, tipo
            FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
            WHERE estado_conciliacion = 'pendiente'
        """
        banco_rows = list(client.query(query_banco).result())

        # 3. Procesar conciliaciones
        resultados = []
        referencias_usadas = set()
        resumen = {
            "total_movimientos_banco": len(banco_rows),
            "total_pagos_conductores": len(pagos_rows),
            "total_procesados": 0,
            "conciliado_automatico": 0,
            "conciliado_aproximado": 0,
            "sin_match": 0,
        }

        for referencia, pagos in pagos_por_referencia.items():
            valor_total = sum(pago.valor for pago in pagos)
            fecha_pago = pagos[0].fecha_pago

            # Buscar match exacto
            match = next((
                movimiento for movimiento in banco_rows
                if abs(movimiento.valor_banco - valor_total) <= margen_error
                and str(movimiento.fecha) == str(fecha_pago)
            ), None)

            if match:
                # ✅ Conciliado exitosamente
                resumen["conciliado_automatico"] += 1
                referencias_usadas.add(referencia)

                resultados.append({
                    "referencia_pago": referencia,
                    "valor_banco": match.valor_banco,
                    "fecha_banco": str(match.fecha),
                    "estado_match": "conciliado_automatico",
                    "confianza": 100,
                    "observaciones": f"Match exacto por referencia {referencia}",
                    "diferencia_valor": abs(match.valor_banco - valor_total),
                    "diferencia_dias": 0,
                    "id_banco": match.id,
                    "valor_pago": valor_total,
                    "fecha_pago": str(fecha_pago),
                    "num_matches_posibles": 1,
                })

                # Marcar conciliado en base de datos
                try:
                    update_query = f"""
                        UPDATE `datos-clientes-441216.Conciliaciones.pagosconductor`
                        SET estado_conciliacion = 'conciliado_automatico',
                            fecha_conciliacion = CURRENT_DATE(),
                            id_banco_asociado = '{match.id}',
                            confianza_conciliacion = 100
                        WHERE referencia_pago = '{referencia}'
                    """
                    client.query(update_query).result()

                    update_mov = f"""
                        UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
                        SET estado_conciliacion = 'conciliado_automatico',
                            referencia_pago_asociada = '{referencia}',
                            confianza_match = 100,
                            conciliado_en = CURRENT_TIMESTAMP()
                        WHERE id = '{match.id}'
                    """
                    client.query(update_mov).result()
                    
                except Exception as e:
                    print(f"Error actualizando BD para {referencia}: {str(e)}")
                    
            else:
                # ❌ Sin match
                resumen["sin_match"] += 1
                resultados.append({
                    "referencia_pago": referencia,
                    "valor_banco": valor_total,
                    "fecha_banco": str(fecha_pago),
                    "estado_match": "sin_match",
                    "confianza": 0,
                    "observaciones": f"No se encontró match para la referencia {referencia}",
                    "diferencia_valor": None,
                    "diferencia_dias": None,
                    "id_banco": None,
                    "valor_pago": valor_total,
                    "fecha_pago": str(fecha_pago),
                    "num_matches_posibles": 0,
                })

            resumen["total_procesados"] += 1

        return {
            "resumen": resumen,
            "resultados": resultados,
            "referencias_usadas": list(referencias_usadas),
            "fecha_conciliacion": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Error en conciliación fallback: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error en conciliación: {str(e)}"
        )

class EstadoConciliacion(str):
    PENDIENTE = "pendiente"
    conciliado_automatico = "conciliado_automatico"
    CONCILIADO_APROXIMADO = "conciliado_aproximado"
    CONCILIADO_MANUAL = "conciliado_manual"
    RECHAZADO = "rechazado"
    ERROR = "error"

    @classmethod
    def es_estado_final(cls, estado: str) -> bool:
        """Verifica si un estado es final (no se puede modificar)"""
        return estado.lower() in {
            cls.conciliado_automatico,
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

class EstadoConciliacion(str):
    PENDIENTE = "pendiente"
    conciliado_automatico = "conciliado_automatico"
    CONCILIADO_APROXIMADO = "conciliado_aproximado"
    CONCILIADO_MANUAL = "conciliado_manual"
    RECHAZADO = "rechazado"
    ERROR = "error"

    @classmethod
    def es_estado_final(cls, estado: str) -> bool:
        """Verifica si un estado es final (no se puede modificar)"""
        return estado.lower() in {
            cls.conciliado_automatico,
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
                    ('conciliado_automatico', 'conciliado_aproximado', 'conciliado_manual')
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
            AND bm.estado_conciliacion IN ('conciliado_automatico', 'conciliado_aproximado', 'conciliado_manual')
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
                    'conciliado_automatico', 'conciliado_aproximado', 'conciliado_manual'
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
                'conciliado_automatico', 'conciliado_aproximado', 'conciliado_manual'
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
                    'conciliado_automatico', 'conciliado_aproximado', 'conciliado_manual'
                ) AND pc.id_banco_asociado IS NULL) as estados_inconsistentes,
                
                -- Valores inconsistentes
                COUNTIF(ABS(COALESCE(pc.valor_total_consignacion, pc.valor) - bm.valor_banco) > 100
                       AND pc.estado_conciliacion IN (
                           'conciliado_automatico', 'conciliado_aproximado'
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


@router.post("/exportar-tablas")
async def exportar_tablas_csv():
    """
    Endpoint dedicado para exportar todas las tablas de conciliación a archivos CSV
    """
    client = bigquery.Client()
    import os
    import csv
    import io
    
    def export_table_to_csv(query, filename):
        """Exporta una tabla de BigQuery a archivo CSV"""
        try:
            rows = list(client.query(query).result())
            if not rows:
                logger.warning(f"No se encontraron datos para exportar en {filename}")
                return ""
            
            fieldnames = rows[0].keys()
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=fieldnames)
            writer.writeheader()
            
            for row in rows:
                writer.writerow({k: str(v) if v is not None else "" for k, v in row.items()})
            
            csv_content = output.getvalue()
            
            # Crear directorio de exportaciones
            export_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "exportaciones")
            export_dir = os.path.abspath(export_dir)
            os.makedirs(export_dir, exist_ok=True)
            
            # Escribir archivo CSV
            ruta_csv = os.path.join(export_dir, filename)
            with open(ruta_csv, "w", encoding="utf-8", newline='') as f:
                f.write(csv_content)
            
            logger.info(f"✅ Tabla exportada exitosamente: {filename} ({len(rows)} registros)")
            return ruta_csv
            
        except Exception as e:
            logger.error(f"❌ Error exportando {filename}: {str(e)}")
            return None
    
    try:
        logger.info("🚀 Iniciando exportación de tablas...")
        archivos_exportados = []
        errores_exportacion = []
        
        # Definir tablas a exportar
        tablas_exportar = [
            {
                "query": "SELECT * FROM `datos-clientes-441216.Conciliaciones.pagosconductor`",
                "filename": "pagosconductor.csv",
                "descripcion": "Pagos de conductores"
            },
            {
                "query": "SELECT * FROM `datos-clientes-441216.Conciliaciones.guias_liquidacion`",
                "filename": "guias_liquidacion.csv",
                "descripcion": "Guías de liquidación"
            },
            {
                "query": "SELECT * FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1`",
                "filename": "COD_pendientes_v1.csv",
                "descripcion": "COD pendientes"
            },
            {
                "query": "SELECT * FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`",
                "filename": "banco_movimientos.csv",
                "descripcion": "Movimientos bancarios"
            }
        ]
        
        # Exportar cada tabla
        for tabla in tablas_exportar:
            logger.info(f"📄 Exportando: {tabla['descripcion']}...")
            ruta_archivo = export_table_to_csv(tabla["query"], tabla["filename"])
            
            if ruta_archivo:
                archivos_exportados.append({
                    "archivo": tabla["filename"],
                    "ruta": ruta_archivo,
                    "descripcion": tabla["descripcion"],
                    "status": "exitoso"
                })
            else:
                errores_exportacion.append({
                    "archivo": tabla["filename"],
                    "descripcion": tabla["descripcion"],
                    "error": "Error en exportación"
                })
        
        # Generar estadísticas de exportación
        total_tablas = len(tablas_exportar)
        exitosos = len(archivos_exportados)
        errores = len(errores_exportacion)
        
        resultado = {
            "mensaje": f"Exportación completada: {exitosos}/{total_tablas} tablas exportadas",
            "timestamp": datetime.utcnow().isoformat(),
            "estadisticas": {
                "total_tablas": total_tablas,
                "exportaciones_exitosas": exitosos,
                "exportaciones_fallidas": errores,
                "porcentaje_exito": round((exitosos / total_tablas) * 100, 2) if total_tablas > 0 else 0
            },
            "archivos_exportados": archivos_exportados,
            "errores": errores_exportacion,
            "directorio_exportacion": os.path.join(os.path.dirname(__file__), "..", "..", "..", "exportaciones")
        }
        
        if errores > 0:
            logger.warning(f"⚠️ Exportación completada con {errores} errores")
        else:
            logger.info("✅ Todas las tablas exportadas exitosamente")
        
        return resultado
        
    except Exception as e:
        logger.error(f"💥 Error crítico en exportación de tablas: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error crítico en exportación: {str(e)}"
        )

@router.post("/exportar-tabla-individual")
async def exportar_tabla_individual(
    tabla: str = Body(..., description="Nombre de la tabla a exportar"),
    filtros: Optional[Dict] = Body(None, description="Filtros opcionales para la consulta")
):
    """
    Endpoint para exportar una tabla específica con filtros opcionales
    
    Tablas disponibles:
    - pagosconductor
    - guias_liquidacion  
    - COD_pendientes_v1
    - banco_movimientos
    """
    client = bigquery.Client()
    
    # Mapeo de tablas permitidas
    tablas_permitidas = {
        "pagosconductor": {
            "tabla_completa": "datos-clientes-441216.Conciliaciones.pagosconductor",
            "descripcion": "Pagos de conductores"
        },
        "guias_liquidacion": {
            "tabla_completa": "datos-clientes-441216.Conciliaciones.guias_liquidacion",
            "descripcion": "Guías de liquidación"
        },
        "COD_pendientes_v1": {
            "tabla_completa": "datos-clientes-441216.Conciliaciones.COD_pendientes_v1",
            "descripcion": "COD pendientes"
        },
        "banco_movimientos": {
            "tabla_completa": "datos-clientes-441216.Conciliaciones.banco_movimientos",
            "descripcion": "Movimientos bancarios"
        }
    }
    
    if tabla not in tablas_permitidas:
        raise HTTPException(
            status_code=400,
            detail=f"Tabla '{tabla}' no permitida. Tablas disponibles: {list(tablas_permitidas.keys())}"
        )
    
    try:
        tabla_info = tablas_permitidas[tabla]
        
        # Construir consulta base
        query = f"SELECT * FROM `{tabla_info['tabla_completa']}`"
        
        # Agregar filtros si se proporcionan
        parametros = []
        if filtros:
            condiciones = []
            
            # Procesar filtros comunes
            if "fecha_inicio" in filtros and filtros["fecha_inicio"]:
                if tabla == "pagosconductor":
                    condiciones.append("fecha_pago >= @fecha_inicio")
                elif tabla == "banco_movimientos":
                    condiciones.append("fecha >= @fecha_inicio")
                elif tabla == "guias_liquidacion":
                    condiciones.append("fecha_pago >= @fecha_inicio")
                parametros.append(bigquery.ScalarQueryParameter("fecha_inicio", "DATE", filtros["fecha_inicio"]))
            
            if "fecha_fin" in filtros and filtros["fecha_fin"]:
                if tabla == "pagosconductor":
                    condiciones.append("fecha_pago <= @fecha_fin")
                elif tabla == "banco_movimientos":
                    condiciones.append("fecha <= @fecha_fin")
                elif tabla == "guias_liquidacion":
                    condiciones.append("fecha_pago <= @fecha_fin")
                parametros.append(bigquery.ScalarQueryParameter("fecha_fin", "DATE", filtros["fecha_fin"]))
            
            if "estado" in filtros and filtros["estado"]:
                if tabla in ["pagosconductor", "banco_movimientos"]:
                    condiciones.append("estado_conciliacion = @estado")
                    parametros.append(bigquery.ScalarQueryParameter("estado", "STRING", filtros["estado"]))
            
            if condiciones:
                query += " WHERE " + " AND ".join(condiciones)
        
        # Agregar límite por seguridad
        query += " LIMIT 50000"
        
        logger.info(f"🔍 Exportando tabla '{tabla}' con consulta: {query}")
        
        # Ejecutar consulta
        job_config = bigquery.QueryJobConfig(query_parameters=parametros) if parametros else None
        rows = list(client.query(query, job_config=job_config).result())
        
        if not rows:
            return {
                "mensaje": f"No se encontraron datos para la tabla '{tabla}' con los filtros especificados",
                "tabla": tabla,
                "registros": 0,
                "timestamp": datetime.utcnow().isoformat()
            }
        
        # Crear archivo CSV
        fieldnames = rows[0].keys()
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        
        for row in rows:
            writer.writerow({k: str(v) if v is not None else "" for k, v in row.items()})
        
        csv_content = output.getvalue()
        
        # Crear directorio y archivo
        export_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "exportaciones")
        export_dir = os.path.abspath(export_dir)
        os.makedirs(export_dir, exist_ok=True)
        
        timestamp_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"{tabla}_{timestamp_str}.csv"
        ruta_csv = os.path.join(export_dir, filename)
        
        with open(ruta_csv, "w", encoding="utf-8", newline='') as f:
            f.write(csv_content)
        
        logger.info(f"✅ Tabla '{tabla}' exportada exitosamente: {filename} ({len(rows)} registros)")
        
        return {
            "mensaje": f"Tabla '{tabla}' exportada exitosamente",
            "tabla": tabla,
            "descripcion": tabla_info["descripcion"],
            "archivo": filename,
            "ruta": ruta_csv,
            "registros": len(rows),
            "filtros_aplicados": filtros or {},
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"❌ Error exportando tabla '{tabla}': {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error exportando tabla '{tabla}': {str(e)}"
        )

@router.get("/resumen-conciliacion")
def obtener_resumen_conciliacion():
    """
    Endpoint para obtener resumen de conciliación que requiere Cruces.tsx
    """
    client = bigquery.Client()
    
    try:
        # ...existing code for resumen...
        query_mov_banco = """
        SELECT 
            COUNT(*) as total_movimientos_banco,
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        """
        query_conciliados_banco = """
        SELECT
            COUNT(*) as conciliados_movimientos
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE estado_conciliacion IN ('conciliado_automatico','conciliado_automatico','conciliado_manual')
        """        
        query_pendientes_banco = """
        SELECT 
            COUNT(*) as pendientes_movimientos
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE estado_conciliacion IN ('pendiente','pendiente_conciliacion','PENDIENTE')
        """
        query_total_valor = """
        SELECT
           ROUND(SUM(valor_banco), 2) AS total_valor_banco
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        """
        total_pagosconductor = """
        SELECT 
            COUNT(*) AS total_pagosconductor
        FROM (
            SELECT referencia_pago, correo
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            WHERE estado_conciliacion IS NOT NULL
            GROUP BY referencia_pago, correo
        )
        """
        conciliados_pc = """
        SELECT 
            COUNT(*) AS conciliados_pc
        FROM ( 
            SELECT referencia_pago, correo
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            WHERE estado_conciliacion IN ('conciliado_manual', 'conciliado_automatico')
            GROUP BY referencia_pago, correo
        )
        """
        pendientes_pc = """
        SELECT COUNT(*) AS pendientes_pc
        FROM (
            SELECT referencia_pago, correo
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            WHERE estado_conciliacion = 'pendiente_conciliacion' 
            GROUP BY referencia_pago, correo
        )
        """
        rechazados_pc = """
        SELECT 
            COUNT(*) AS rechazados_pc
        FROM (
            SELECT referencia_pago, correo
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            WHERE estado_conciliacion IN ('rechazado','Rechazado')
            GROUP BY referencia_pago, correo
        )
        """

        #1
        res_mov_banco = list(client.query(query_mov_banco).result())[0]
        #2
        res_conciliados_banco = list(client.query(query_conciliados_banco).result())[0]
        #3
        res_pendientes_banco = list(client.query(query_pendientes_banco).result())[0]
        #4
        res_total_valor = list(client.query(query_total_valor).result())[0]
        #5
        res_total_pagosconductor = list(client.query(total_pagosconductor).result())[0]
        #6
        res_conciliados_pc = list(client.query(conciliados_pc).result())[0]
        #7
        pendientes_pc = list(client.query(pendientes_pc).result())[0]
        #8
        res_rechazados_pc = list(client.query(rechazados_pc).result())[0]

        return {
            "total_movimientos_banco": int(res_mov_banco["total_movimientos_banco"]) if res_mov_banco["total_movimientos_banco"] else 0,
            "conciliados_movimientos": int(res_conciliados_banco["conciliados_movimientos"]) if res_conciliados_banco["conciliados_movimientos"] else 0,
            "pendientes_movimientos": int(res_pendientes_banco["pendientes_movimientos"]) if res_pendientes_banco["pendientes_movimientos"] else 0,
            "total_valor_banco": int(res_total_valor["total_valor_banco"]) if res_total_valor["total_valor_banco"] else 0.0,
            "total_pagosconductor": int(res_total_pagosconductor["total_pagosconductor"]) if res_total_pagosconductor["total_pagosconductor"] else 0,
            "conciliados_pc": int(res_conciliados_pc["conciliados_pc"]) if res_conciliados_pc["conciliados_pc"] else 0,
            "pendientes_pc": int(pendientes_pc["pendientes_pc"]) if pendientes_pc["pendientes_pc"] else 0,
            "rechazados_pc": int(res_rechazados_pc["rechazados_pc"]) if res_rechazados_pc["rechazados_pc"] else 0,
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
    🔥 MEJORADO: Maneja pagos agrupados con múltiples transacciones bancarias
    """
    id_banco = data.get("id_banco")
    referencia_pago = data.get("referencia_pago")
    observaciones = data.get("observaciones", "Conciliado manualmente")
    usuario = data.get("usuario", "sistema")
    
    # 🔥 NUEVO: Soporte para múltiples transacciones bancarias
    ids_banco = data.get("ids_banco", [])  # Lista de IDs de transacciones bancarias
    if id_banco and id_banco not in ids_banco:
        ids_banco.append(id_banco)
    
    if not ids_banco:
        raise HTTPException(status_code=400, detail="Al menos un id_banco es requerido")
    
    client = bigquery.Client()
    timestamp = datetime.utcnow()
    
    try:
        logger.info(f"🔗 INICIANDO CONCILIACIÓN MANUAL - IDs banco: {ids_banco}, Referencia: {referencia_pago}")
        
        # 1. Obtener información de las transacciones bancarias seleccionadas
        query_transacciones_info = """
        SELECT id, fecha, valor_banco, descripcion, estado_conciliacion
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE id IN UNNEST(@ids_banco)
        """
        
        job_config_info = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ArrayQueryParameter("ids_banco", "STRING", ids_banco)
            ]
        )
        
        transacciones_banco = list(client.query(query_transacciones_info, job_config=job_config_info).result())
        
        if not transacciones_banco:
            raise HTTPException(status_code=404, detail="No se encontraron transacciones bancarias")
        
        logger.info(f"💳 Transacciones bancarias encontradas: {len(transacciones_banco)}")
        for trans in transacciones_banco:
            logger.info(f"   - ID: {trans['id']}, Valor: ${trans['valor_banco']:,.0f}, Fecha: {trans['fecha']}")

        # 2. Si no hay referencia_pago, buscar el mejor match por valor y fecha
        if not referencia_pago and len(transacciones_banco) == 1:
            banco = transacciones_banco[0]
            
            query_mejor_match = """
            SELECT referencia_pago
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            WHERE fecha_pago = @fecha
            AND ABS(COALESCE(valor_total_consignacion, CAST(valor AS FLOAT64), 0) - @valor) <= 1000
            AND estado_conciliacion IN ('pendiente_conciliacion', 'pendiente')
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

        # 3. 🔥 VERIFICAR SI ES UN GRUPO DE PAGOS (múltiples referencias con misma referencia_pago)
        es_grupo = False
        pagos_del_grupo = []
        
        if referencia_pago:
            query_verificar_grupo = """
            SELECT 
                Id_Transaccion,
                referencia_pago,
                valor,
                COALESCE(valor_total_consignacion, CAST(valor AS FLOAT64)) as valor_pago,
                fecha_pago,
                estado_conciliacion
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            WHERE referencia_pago = @referencia
            ORDER BY valor DESC
            """
            
            job_config_grupo = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago)
                ]
            )
            
            pagos_del_grupo = list(client.query(query_verificar_grupo, job_config=job_config_grupo).result())
            
            # Es un grupo si hay múltiples transacciones bancarias O múltiples pagos con la misma referencia
            es_grupo = len(transacciones_banco) > 1 or len(pagos_del_grupo) > 1
            
            logger.info(f"🔍 VERIFICACIÓN DE GRUPO:")
            logger.info(f"   - ¿Es grupo?: {es_grupo}")
            logger.info(f"   - Transacciones banco: {len(transacciones_banco)}")
            logger.info(f"   - Pagos encontrados: {len(pagos_del_grupo)}")
            
            if es_grupo:
                id_transaccion = pagos_del_grupo[0]["Id_Transaccion"] if pagos_del_grupo else None
                logger.info(f"   - ID_Transaccion del grupo: {id_transaccion}")

        # 4. 🔥 PROCESAR CONCILIACIÓN SEGÚN EL TIPO
        if es_grupo and len(transacciones_banco) > 1:
            # 🔥 CASO: MÚLTIPLES TRANSACCIONES BANCARIAS CON PAGOS AGRUPADOS
            logger.info("🔗 PROCESANDO GRUPO CON MÚLTIPLES TRANSACCIONES")
            
            # Ordenar transacciones por valor (mayor a menor)
            transacciones_ordenadas = sorted(transacciones_banco, key=lambda x: x["valor_banco"], reverse=True)
            
            # Obtener todos los pagos del grupo por su valor individual
            valores_pagos = []
            for pago in pagos_del_grupo:
                valor_individual = float(pago["valor"]) if pago["valor"] else 0
                if valor_individual > 0:
                    valores_pagos.append({
                        "valor": valor_individual,
                        "pago_data": pago
                    })
            
            logger.info(f"💰 Valores de pagos individuales: {[v['valor'] for v in valores_pagos]}")
            
            # Conciliar cada transacción bancaria con su pago correspondiente por valor
            conciliaciones_exitosas = 0
            errores_conciliacion = []
            
            for trans_banco in transacciones_ordenadas:
                valor_banco = float(trans_banco["valor_banco"])
                
                # Buscar pago con valor exacto o más cercano
                pago_match = None
                diferencia_minima = float('inf')
                
                for valor_pago_info in valores_pagos:
                    diferencia = abs(valor_pago_info["valor"] - valor_banco)
                    if diferencia < diferencia_minima:
                        diferencia_minima = diferencia
                        pago_match = valor_pago_info
                
                if pago_match and diferencia_minima <= 1000:  # Tolerancia de $1000
                    logger.info(f"✅ MATCH ENCONTRADO: Banco ${valor_banco:,.0f} -> Pago ${pago_match['valor']:,.0f} (diff: ${diferencia_minima:,.0f})")
                    
                    try:
                        # Actualizar transacción bancaria
                        query_update_banco = """
                        UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
                        SET 
                            estado_conciliacion = 'conciliado_manual',
                            referencia_pago_asociada = @referencia,
                            observaciones = @observaciones,
                            conciliado_por = @usuario,
                            conciliado_en = @timestamp,
                            confianza_match = 100
                        WHERE id = @id_banco
                        """
                        
                        job_config_banco_individual = bigquery.QueryJobConfig(
                            query_parameters=[
                                bigquery.ScalarQueryParameter("id_banco", "STRING", trans_banco["id"]),
                                bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago),
                                bigquery.ScalarQueryParameter("observaciones", "STRING", f"{observaciones} - Grupo: ${valor_banco:,.0f}"),
                                bigquery.ScalarQueryParameter("usuario", "STRING", usuario),
                                bigquery.ScalarQueryParameter("timestamp", "TIMESTAMP", timestamp)
                            ]
                        )
                        
                        client.query(query_update_banco, job_config=job_config_banco_individual).result()
                        
                        # Actualizar pago específico por valor
                        query_update_pago_especifico = """
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
                        AND CAST(valor AS FLOAT64) = @valor_pago
                        """
                        
                        job_config_pago_especifico = bigquery.QueryJobConfig(
                            query_parameters=[
                                bigquery.ScalarQueryParameter("id_banco", "STRING", trans_banco["id"]),
                                bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago),
                                bigquery.ScalarQueryParameter("valor_pago", "FLOAT", pago_match["valor"]),
                                bigquery.ScalarQueryParameter("observaciones", "STRING", f"{observaciones} - Valor: ${pago_match['valor']:,.0f}"),
                                bigquery.ScalarQueryParameter("usuario", "STRING", usuario),
                                bigquery.ScalarQueryParameter("timestamp", "TIMESTAMP", timestamp)
                            ]
                        )
                        
                        client.query(query_update_pago_especifico, job_config=job_config_pago_especifico).result()
                        
                        conciliaciones_exitosas += 1
                        logger.info(f"✅ Conciliación exitosa: {trans_banco['id']} <-> ${pago_match['valor']:,.0f}")
                        
                        # Remover el pago ya usado
                        valores_pagos.remove(pago_match)
                        
                    except Exception as e:
                        error_msg = f"Error conciliando {trans_banco['id']}: {str(e)}"
                        errores_conciliacion.append(error_msg)
                        logger.error(error_msg)
                        
                else:
                    error_msg = f"No se encontró match para transacción ${valor_banco:,.0f}"
                    errores_conciliacion.append(error_msg)
                    logger.warning(error_msg)
            
            if errores_conciliacion:
                logger.warning(f"⚠️ Errores en conciliación: {errores_conciliacion}")
            
            return {
                "mensaje": f"Conciliación manual de grupo completada",
                "tipo": "grupo_multiple",
                "conciliaciones_exitosas": conciliaciones_exitosas,
                "total_transacciones": len(transacciones_banco),
                "errores": errores_conciliacion,
                "referencia_pago": referencia_pago,
                "usuario": usuario,
                "timestamp": timestamp.isoformat()
            }
            
        else:
            # 🔄 CASO: CONCILIACIÓN SIMPLE (UNA TRANSACCIÓN)
            logger.info("📄 PROCESANDO CONCILIACIÓN SIMPLE")
            
            trans_banco = transacciones_banco[0]
            
            # Actualizar movimiento bancario
            query_update_banco = """
            UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
            SET 
                estado_conciliacion = 'conciliado_manual',
                referencia_pago_asociada = @referencia,
                observaciones = @observaciones,
                conciliado_por = @usuario,
                conciliado_en = @timestamp,
                confianza_match = 100
            WHERE id = @id_banco
            """
            
            job_config_banco = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("id_banco", "STRING", trans_banco["id"]),
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
                        bigquery.ScalarQueryParameter("id_banco", "STRING", trans_banco["id"]),
                        bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago),
                        bigquery.ScalarQueryParameter("observaciones", "STRING", observaciones),
                        bigquery.ScalarQueryParameter("usuario", "STRING", usuario),
                        bigquery.ScalarQueryParameter("timestamp", "TIMESTAMP", timestamp)
                    ]
                )
                
                client.query(query_update_pago, job_config=job_config_pago).result()
            
            return {
                "mensaje": "Conciliación manual completada exitosamente",
                "tipo": "simple",
                "id_banco": trans_banco["id"],
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


@router.get("/diagnostico-conciliacion")
async def diagnostico_conciliacion():
    """
    Diagnóstica por qué no se están encontrando matches en la conciliación
    """
    client = bigquery.Client()
    
    try:
        # 1. Analizar pagos pendientes (muestra los primeros 10)
        query_pagos_muestra = """
        SELECT 
            referencia_pago,
            valor,
            fecha_pago,
            estado_conciliacion,
            id_string
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE estado_conciliacion = 'pendiente_conciliacion'
          AND referencia_pago IS NOT NULL
        ORDER BY fecha_pago DESC
        LIMIT 10
        """
        
        pagos_muestra = []
        for row in client.query(query_pagos_muestra).result():
            pagos_muestra.append({
                "referencia": row["referencia_pago"],
                "valor": float(row["valor"]),
                "fecha": row["fecha_pago"].isoformat(),
                "estado": row["estado_conciliacion"]
            })

        # 2. Analizar movimientos bancarios pendientes (muestra los primeros 10)
        query_banco_muestra = """
        SELECT 
            id,
            fecha,
            valor_banco,
            estado_conciliacion,
            descripcion
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE estado_conciliacion = 'pendiente'
        ORDER BY fecha DESC
        LIMIT 10
        """
        
        banco_muestra = []
        for row in client.query(query_banco_muestra).result():
            banco_muestra.append({
                "id": row["id"],
                "fecha": row["fecha"].isoformat(),
                "valor": float(row["valor_banco"]),
                "estado": row["estado_conciliacion"],
                "descripcion": row["descripcion"][:50] + "..." if len(row["descripcion"]) > 50 else row["descripcion"]
            })

        # 3. Buscar posibles matches entre las muestras
        posibles_matches = []
        for pago in pagos_muestra[:5]:  # Solo los primeros 5 para no sobrecargar
            for banco in banco_muestra[:5]:
                diferencia_valor = abs(banco["valor"] - pago["valor"])
                diferencia_fecha = abs((datetime.fromisoformat(banco["fecha"]) - datetime.fromisoformat(pago["fecha"])).days)
                
                if diferencia_valor <= 100 and diferencia_fecha <= 1:
                    posibles_matches.append({
                        "pago_ref": pago["referencia"],
                        "pago_valor": pago["valor"],
                        "pago_fecha": pago["fecha"],
                        "banco_id": banco["id"],
                        "banco_valor": banco["valor"],
                        "banco_fecha": banco["fecha"],
                        "diferencia_valor": diferencia_valor,
                        "diferencia_fecha": diferencia_fecha,
                        "es_match_exacto": diferencia_valor <= 100 and diferencia_fecha == 0
                    })

        # 4. Estadísticas generales
        query_stats = """
        SELECT 
            'pagos' as tabla,
            COUNT(*) as total,
            COUNTIF(estado_conciliacion = 'pendiente_conciliacion') as pendientes,
            MIN(fecha_pago) as fecha_min,
            MAX(fecha_pago) as fecha_max,
            AVG(CAST(valor AS FLOAT64)) as valor_promedio
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE referencia_pago IS NOT NULL
        
        UNION ALL
        
        SELECT 
            'banco' as tabla,
            COUNT(*) as total,
            COUNTIF(estado_conciliacion = 'pendiente') as pendientes,
            MIN(fecha) as fecha_min,
            MAX(fecha) as fecha_max,
            AVG(valor_banco) as valor_promedio
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        """
        
        stats = []
        for row in client.query(query_stats).result():
            stats.append({
                "tabla": row["tabla"],
                "total": int(row["total"]),
                "pendientes": int(row["pendientes"]),
                "fecha_min": row["fecha_min"].isoformat() if row["fecha_min"] else None,
                "fecha_max": row["fecha_max"].isoformat() if row["fecha_max"] else None,
                "valor_promedio": round(float(row["valor_promedio"]), 2) if row["valor_promedio"] else 0
            })

        return {
            "resumen_estadisticas": stats,
            "muestra_pagos_pendientes": pagos_muestra,
            "muestra_banco_pendientes": banco_muestra,
            "posibles_matches_encontrados": posibles_matches,
            "total_posibles_matches": len(posibles_matches),
            "diagnóstico": {
                "hay_datos_pagos": len(pagos_muestra) > 0,
                "hay_datos_banco": len(banco_muestra) > 0,
                "hay_posibles_matches": len(posibles_matches) > 0,
                "problema_probable": "Sin datos en una tabla" if len(pagos_muestra) == 0 or len(banco_muestra) == 0 
                                 else "Diferencias en fechas/valores" if len(posibles_matches) == 0 
                                 else "Todo parece correcto, revisar lógica de conciliación"
            },
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error en diagnóstico: {str(e)}"
        )
        
@router.get("/obtener-movimientos-banco-disponibles")
async def obtener_movimientos_banco_disponibles(
    valor_min: float,
    valor_max: float,
    fecha_inicio: str,
    fecha_fin: str,
    estado: str = "pendiente"
):
    """
    Endpoint para obtener movimientos bancarios disponibles para conciliación manual
    """
    client = bigquery.Client()
    
    try:
        # Validar rangos de valor para evitar consultas demasiado amplias
        if valor_max / valor_min > 10:  # Si el rango es mayor a 10x, es demasiado amplio
            raise HTTPException(
                status_code=400, 
                detail="Rango de valor demasiado amplio. La diferencia no debe ser mayor a 10x"
            )
        
        query = """
        SELECT 
            id,
            fecha,
            valor_banco,
            cuenta,
            codigo,
            cod_transaccion,
            descripcion,
            tipo,
            estado_conciliacion
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE DATE(fecha) BETWEEN @fecha_inicio AND @fecha_fin
        AND valor_banco BETWEEN @valor_min AND @valor_max
        AND estado_conciliacion = @estado
        ORDER BY ABS(valor_banco - (@valor_min + @valor_max) / 2), fecha DESC
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("fecha_inicio", "DATE", fecha_inicio),
                bigquery.ScalarQueryParameter("fecha_fin", "DATE", fecha_fin),
                bigquery.ScalarQueryParameter("valor_min", "FLOAT", valor_min),
                bigquery.ScalarQueryParameter("valor_max", "FLOAT", valor_max),
                bigquery.ScalarQueryParameter("estado", "STRING", estado)
            ]
        )
        
        resultados = []
        for row in client.query(query, job_config=job_config).result():
            resultados.append({
                "id": row["id"],
                "fecha": row["fecha"].isoformat(),
                "valor_banco": float(row["valor_banco"]),
                "cuenta": row["cuenta"],
                "codigo": row["codigo"],
                "cod_transaccion": row["cod_transaccion"],
                "descripcion": row["descripcion"],
                "tipo": row["tipo"],
                "estado_conciliacion": row["estado_conciliacion"]
            })
        
        return {
            "transacciones": resultados,
            "total": len(resultados),
            "criterios": {
                "valor_min": valor_min,
                "valor_max": valor_max,
                "fecha_inicio": fecha_inicio,
                "fecha_fin": fecha_fin,
                "estado": estado
            }
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo movimientos bancarios: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo movimientos: {str(e)}"
        )

@router.get("/pagos-pendientes-conciliar")
async def obtener_pagos_pendientes_conciliar():
    """
    Endpoint para obtener pagos pendientes de conciliar
    """
    client = bigquery.Client()
    
    try:
    
        query = """
        SELECT 
            referencia_pago as referencia,
            COALESCE(valor_total_consignacion, CAST(valor AS FLOAT64)) as valor,
            fecha as fecha,
            entidad,
            estado,
            tipo,
            correo,
            fecha_pago,
            tracking,
            cliente,
            COALESCE(conciliado, FALSE) as conciliado
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE (estado_conciliacion IS NULL 
               OR estado_conciliacion = '' 
               OR estado_conciliacion = 'pendiente'
               OR estado_conciliacion = 'pendiente_conciliacion')
        ORDER BY fecha_pago DESC
        """
        
        resultados = []
        for row in client.query(query).result():
            resultados.append({
                "referencia": row["referencia"],
                "valor": float(row["valor"]) if row["valor"] else 0,
                "fecha": row["fecha"].isoformat() if row["fecha"] else None,
                "entidad": row["entidad"] or "",
                "estado": row["estado"] or "",
                "correo": row["correo"] or "",
                "fecha_pago": row["fecha_pago"].isoformat() if row["fecha_pago"] else None,
                "tracking": row["tracking"] or "",
                "cliente": row["cliente"] or "",
                "conciliado": bool(row["conciliado"])
            })
        
        return {
            "pagos": resultados,
            "total": len(resultados)
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo pagos pendientes: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo pagos pendientes: {str(e)}"
        )




@router.get("/transacciones-bancarias-disponibles")
async def obtener_transacciones_bancarias_disponibles(
    referencia: str,
    fecha_pago: Optional[str] = Query(None, description="Fecha del pago en formato YYYY-MM-DD"),
    valor: Optional[float] = Query(None, description="Valor del pago para filtrar")
    ):
    """
    Endpoint para obtener transacciones bancarias disponibles para una referencia específica
    ✅ NUEVO: Si tiene Id_Transaccion, busca transacciones para todos los valores del grupo y en rango de fechas
    """
    client = bigquery.Client()
    try:
        # Primero verificar si el pago tiene Id_Transaccion
        query_verificar_grupo = """
        SELECT 
            Id_Transaccion,
            COALESCE(valor_total_consignacion, CAST(valor AS FLOAT64)) as valor_pago,
            fecha_pago,
            entidad,
            tipo
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE referencia_pago = @referencia
        LIMIT 1
        """
        
        job_config_verificar = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia)
            ]
        )
        
        pago_result = list(client.query(query_verificar_grupo, job_config=job_config_verificar).result())
        
        if not pago_result:
            return {"transacciones": [], "mensaje": "Pago no encontrado"}
        
        pago_principal = pago_result[0]
        id_transaccion = pago_principal["Id_Transaccion"]
        fecha_pago_busqueda = fecha_pago if fecha_pago else pago_principal["fecha_pago"]
        entidad_pago = (pago_principal["entidad"] or "").lower()
        tipo_pago = (pago_principal["tipo"] or "").lower()
        
        # Variables para almacenar criterios de búsqueda
        valores_a_buscar = []
        es_grupo = False
        
        if id_transaccion is not None:
            # 🔥 ES UN GRUPO: Obtener todas las referencias y sus valores individuales
            es_grupo = True
            query_grupo = """
            SELECT 
                referencia_pago,
                valor as valor_individual,
                COALESCE(valor_total_consignacion, CAST(valor AS FLOAT64)) as valor_total,
                fecha_pago
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            WHERE Id_Transaccion = @id_transaccion
            ORDER BY referencia_pago
            """
            
            job_config_grupo = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("id_transaccion", "INT64", id_transaccion)
                ]
            )
            
            pagos_grupo = list(client.query(query_grupo, job_config=job_config_grupo).result())
            
            # Extraer valores únicos del grupo
            valores_unicos = set()
            for pago in pagos_grupo:
                valor_individual = float(pago["valor_individual"]) if pago["valor_individual"] else 0
                if valor_individual > 0:
                    valores_unicos.add(valor_individual)
            
            valores_a_buscar = list(valores_unicos)
            
            logger.info(f"🔗 GRUPO DETECTADO - Id_Transaccion: {id_transaccion}")
            logger.info(f"📊 Referencias en grupo: {[p['referencia_pago'] for p in pagos_grupo]}")
            logger.info(f"💰 Valores individuales únicos a buscar: {valores_a_buscar}")
            
        else:
            # 📄 ES INDIVIDUAL: Usar el valor del pago único
            valor_pago = valor if valor else float(pago_principal["valor_pago"]) if pago_principal["valor_pago"] else 0
            if valor_pago > 0:
                valores_a_buscar = [valor_pago]
            
            logger.info(f"📄 PAGO INDIVIDUAL - Referencia: {referencia}")
            logger.info(f"💰 Valor a buscar: {valor_pago}")

        # Validaciones
        if not fecha_pago_busqueda:
            return {"transacciones": [], "mensaje": "El pago no tiene fecha registrada"}
        if not valores_a_buscar:
            return {"transacciones": [], "mensaje": "No se encontraron valores válidos para buscar"}

        # Convertir fecha si es string
        if isinstance(fecha_pago_busqueda, str):
            fecha_pago_busqueda = datetime.strptime(fecha_pago_busqueda, "%Y-%m-%d").date()

        # Definir rango de fechas si es grupo
        if es_grupo:
            rango_dias = 3  # Puedes ajustar el rango aquí
            fecha_inicio = fecha_pago_busqueda - timedelta(days=rango_dias)
            fecha_fin = fecha_pago_busqueda + timedelta(days=rango_dias)
        else:
            fecha_inicio = fecha_fin = fecha_pago_busqueda

        # 🔥 BUSCAR TRANSACCIONES BANCARIAS PARA CADA VALOR
        transacciones_encontradas = []
        
        for valor_buscar in valores_a_buscar:
            logger.info(f"🔍 Buscando transacciones para valor: ${valor_buscar:,.0f}")
            
            query_transacciones = """
            SELECT 
                id,
                fecha,
                valor_banco,
                cuenta,
                codigo,
                cod_transaccion,
                descripcion,
                tipo,
                estado_conciliacion
            FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
            WHERE fecha BETWEEN @fecha_inicio AND @fecha_fin
            AND valor_banco = @valor_buscar
            AND (
                (estado_conciliacion = 'pendiente' OR estado_conciliacion IS NULL)
            )
            AND (referencia_pago_asociada IS NULL OR referencia_pago_asociada = '')
            ORDER BY fecha DESC
            """
            
            job_config_transacciones = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("fecha_inicio", "DATE", fecha_inicio),
                    bigquery.ScalarQueryParameter("fecha_fin", "DATE", fecha_fin),
                    bigquery.ScalarQueryParameter("valor_buscar", "FLOAT", valor_buscar)
                ]
            )
            
            transacciones = list(client.query(query_transacciones, job_config=job_config_transacciones).result())
            
            logger.info(f"💳 Encontradas {len(transacciones)} transacciones para ${valor_buscar:,.0f}")
            
            # Procesar cada transacción encontrada
            for transaccion in transacciones:
                valor_transaccion = float(transaccion["valor_banco"])
                
                porcentaje_similitud = calcular_porcentaje_similitud(
                    pago_fecha=fecha_pago_busqueda,
                    pago_valor=valor_buscar,
                    pago_entidad=entidad_pago,
                    pago_tipo=tipo_pago,
                    banco_fecha=transaccion["fecha"],
                    banco_valor=valor_transaccion,
                    banco_cuenta=transaccion["cuenta"] or "",
                    banco_tipo=transaccion["tipo"] or "",
                    banco_descripcion=transaccion["descripcion"] or ""
                )
                
                transacciones_encontradas.append({
                    "id": transaccion["id"],
                    "fecha": transaccion["fecha"].isoformat(),
                    "valor_banco": valor_transaccion,
                    "cuenta": transaccion["cuenta"],
                    "codigo": transaccion["codigo"],
                    "cod_transaccion": transaccion["cod_transaccion"],
                    "descripcion": transaccion["descripcion"],
                    "tipo": transaccion["tipo"],
                    "estado_conciliacion": transaccion["estado_conciliacion"],
                    "porcentaje_similitud": porcentaje_similitud,
                    "nivel_match": get_nivel_match(porcentaje_similitud),
                    "valor_buscado": valor_buscar,  # 🔥 NUEVO: Indica qué valor se buscaba
                    "es_del_grupo": es_grupo  # 🔥 NUEVO: Indica si viene de un grupo
                })
        
        # Ordenar por porcentaje de similitud
        transacciones_encontradas.sort(key=lambda x: x["porcentaje_similitud"], reverse=True)
        
        # 🔥 INFORMACIÓN DETALLADA DEL RESULTADO
        resumen_busqueda = {
            "es_grupo": es_grupo,
            "id_transaccion": id_transaccion,
            "valores_buscados": valores_a_buscar,
            "total_valores_unicos": len(valores_a_buscar),
            "total_transacciones_encontradas": len(transacciones_encontradas)
        }
        
        if es_grupo:
            # Agrupar resultados por valor para mejor visualización
            transacciones_por_valor = {}
            for trans in transacciones_encontradas:
                valor_key = trans["valor_buscado"]
                if valor_key not in transacciones_por_valor:
                    transacciones_por_valor[valor_key] = []
                transacciones_por_valor[valor_key].append(trans)
            
            resumen_busqueda["transacciones_por_valor"] = {
                str(valor): len(transacciones) 
                for valor, transacciones in transacciones_por_valor.items()
            }
        
        logger.info(f"✅ BÚSQUEDA COMPLETADA - Total encontradas: {len(transacciones_encontradas)}")
        
        return {
            "transacciones": transacciones_encontradas,
            "total": len(transacciones_encontradas),
            "pago_referencia": referencia,
            "resumen_busqueda": resumen_busqueda,
            "criterios_busqueda": {
                "fecha_inicio": fecha_inicio.isoformat(),
                "fecha_fin": fecha_fin.isoformat(),
                "entidad_pago": entidad_pago,
                "tipo_pago": tipo_pago,
                "parametros_opcionales_usados": {
                    "fecha_pago": fecha_pago is not None,
                    "valor": valor is not None
                }
            }
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo transacciones bancarias disponibles: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo transacciones: {str(e)}"
        )



def calcular_porcentaje_similitud(
    pago_fecha, pago_valor: float, pago_entidad: str, pago_tipo: str,
    banco_fecha, banco_valor: float, banco_cuenta: str, banco_tipo: str, banco_descripcion: str
) -> float:
    """
    Calcula el porcentaje de similitud entre un pago y una transacción bancaria
    basado en fecha (40%), valor (40%) y tipo/entidad (20%)
    """
    try:
        # 1. SIMILITUD DE FECHA (40% del peso total)
        diferencia_dias = abs((banco_fecha - pago_fecha).days)
        if diferencia_dias == 0:
            similitud_fecha = 1.0
        elif diferencia_dias <= 1:
            similitud_fecha = 0.9
        elif diferencia_dias <= 3:
            similitud_fecha = 0.7
        elif diferencia_dias <= 7:
            similitud_fecha = 0.5
        elif diferencia_dias <= 15:
            similitud_fecha = 0.2
        else:
            similitud_fecha = 0.0
        
        # 2. SIMILITUD DE VALOR (40% del peso total) - MÁS ESTRICTA
        diferencia_valor = abs(banco_valor - pago_valor)
        porcentaje_diferencia = diferencia_valor / max(pago_valor, banco_valor) if max(pago_valor, banco_valor) > 0 else 1
        
        # Rangos más estrictos según el monto
        if pago_valor <= 50000:  # Pagos pequeños: tolerancia del 20%
            if porcentaje_diferencia == 0:
                similitud_valor = 1.0
            elif porcentaje_diferencia <= 0.005:  # 0.5% diferencia
                similitud_valor = 0.95
            elif porcentaje_diferencia <= 0.02:   # 2% diferencia
                similitud_valor = 0.8
            elif porcentaje_diferencia <= 0.05:   # 5% diferencia
                similitud_valor = 0.6
            elif porcentaje_diferencia <= 0.1:    # 10% diferencia
                similitud_valor = 0.3
            elif porcentaje_diferencia <= 0.2:    # 20% diferencia
                similitud_valor = 0.1
            else:
                similitud_valor = 0.0
        elif pago_valor <= 200000:  # Pagos medianos: tolerancia del 10%
            if porcentaje_diferencia == 0:
                similitud_valor = 1.0
            elif porcentaje_diferencia <= 0.002:  # 0.2% diferencia
                similitud_valor = 0.95
            elif porcentaje_diferencia <= 0.01:   # 1% diferencia
                similitud_valor = 0.8
            elif porcentaje_diferencia <= 0.03:   # 3% diferencia
                similitud_valor = 0.6
            elif porcentaje_diferencia <= 0.05:   # 5% diferencia
                similitud_valor = 0.3
            elif porcentaje_diferencia <= 0.1:    # 10% diferencia
                similitud_valor = 0.1
            else:
                similitud_valor = 0.0
        else:  # Pagos grandes: tolerancia del 5%
            if porcentaje_diferencia == 0:
                similitud_valor = 1.0
            elif porcentaje_diferencia <= 0.001:  # 0.1% diferencia
                similitud_valor = 0.95
            elif porcentaje_diferencia <= 0.005:  # 0.5% diferencia
                similitud_valor = 0.8
            elif porcentaje_diferencia <= 0.01:   # 1% diferencia
                similitud_valor = 0.6
            elif porcentaje_diferencia <= 0.02:   # 2% diferencia
                similitud_valor = 0.3
            elif porcentaje_diferencia <= 0.05:   # 5% diferencia
                similitud_valor = 0.1
            else:
                similitud_valor = 0.0
        
        # 3. SIMILITUD DE TIPO/ENTIDAD (20% del peso total)
        similitud_tipo = 0.0
        
        # Comparar entidad del pago con cuenta bancaria y descripción
        banco_cuenta_lower = banco_cuenta.lower()
        banco_descripcion_lower = banco_descripcion.lower()
        banco_tipo_lower = banco_tipo.lower()
        
        # Mapeo de entidades comunes
        entidades_mapeo = {
            'nequi': ['nequi', 'bancolombia'],
            'bancolombia': ['bancolombia', 'banco colombia', 'bcolombia'],
            'daviplata': ['daviplata', 'davivienda'],
            'banco de bogota': ['bogota', 'banco bogota'],
            'banco popular': ['popular'],
            'banco caja social': ['caja social', 'bcsc'],
        }
        
        # Buscar coincidencias
        if pago_entidad:
            # Coincidencia exacta
            if (pago_entidad in banco_cuenta_lower or 
                pago_entidad in banco_descripcion_lower or
                pago_entidad in banco_tipo_lower):
                similitud_tipo = 1.0
            else:
                # Buscar en mapeos
                for entidad_key, variantes in entidades_mapeo.items():
                    if pago_entidad in entidad_key or entidad_key in pago_entidad:
                        for variante in variantes:
                            if (variante in banco_cuenta_lower or 
                                variante in banco_descripcion_lower or
                                variante in banco_tipo_lower):
                                similitud_tipo = 0.8
                                break
                        if similitud_tipo > 0:
                            break
        
        # Si no hay coincidencia de entidad, dar puntuación base por tipo
        if similitud_tipo == 0.0:
            if ('pago' in banco_descripcion_lower or 
                'transferencia' in banco_descripcion_lower or
                'consignacion' in banco_descripcion_lower):
                similitud_tipo = 0.3
        
        # Agrega esto antes del cálculo final
        if porcentaje_diferencia > 0.5:
            return 0.0  # Diferencia extrema, no es un match válido
        
        # CÁLCULO FINAL CON PESOS
        porcentaje_final = (
            similitud_fecha * 0.4 +      # 40% peso fecha
            similitud_valor * 0.4 +      # 40% peso valor  
            similitud_tipo * 0.2         # 20% peso tipo/entidad
        ) * 100
        
        return round(porcentaje_final, 1)
        
    except Exception as e:
        logger.error(f"Error calculando similitud: {str(e)}")
        return 0.0


def get_nivel_match(porcentaje: float) -> str:
    """Determina el nivel de match basado en el porcentaje - UMBRALES MÁS ESTRICTOS"""
    if porcentaje >= 95:
        return "🟢 Excelente"
    elif porcentaje >= 85:
        return "🟡 Bueno"
    elif porcentaje >= 70:
        return "🟠 Regular"
    elif porcentaje >= 50:
        return "🔴 Bajo"
    else:
        return "⚫ Muy Bajo"


# ========== ENDPOINT PARA REVERTIR CONCILIACIONES AUTOMÁTICAS ==========



@router.post("/revertir-conciliaciones-automaticas")
async def revertir_conciliaciones_automaticas():
    """
    Revierte las conciliaciones automáticas realizadas el 2025-09-02.
    
    - Busca registros con fecha_conciliacion = '2025-09-02' en pagosconductor (estado 'conciliado_automatico')
    - Busca registros con conciliado_en = '2025-09-02' en banco_movimientos (estado 'conciliado_automatico' o 'conciliado_exacto')
    - Revierte el estado a 'pendiente_conciliacion' y 'pendiente' respectivamente
    - Limpia los campos relacionados con la conciliación
    - Exporta registros afectados a CSV antes de actualizar
    """
    try:
        import os
        import csv
        
        client = get_bigquery_client()
        
        # Fecha específica para buscar conciliaciones del 2025-09-02
        fecha_objetivo = "2025-09-02"
        usuario_id = "sistema"
        
        logger.info(f"🔄 Iniciando reversión de conciliaciones del {fecha_objetivo}")
        
        # 1. Consultar y exportar registros de pagosconductor que serán afectados
        query_pagos_afectados = f"""
            SELECT *
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
            WHERE estado_conciliacion = 'conciliado_automatico'
              AND DATE(fecha_conciliacion) = @fecha_objetivo
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("fecha_objetivo", "DATE", fecha_objetivo)
            ]
        )
        
        registros_pagos = list(client.query(query_pagos_afectados, job_config=job_config).result())
        
        logger.info(f"📊 Registros encontrados en pagosconductor: {len(registros_pagos)}")
        
        # 2. Consultar y exportar registros de banco_movimientos que serán afectados
        query_banco_afectados = f"""
            SELECT *
            FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.banco_movimientos`
            WHERE estado_conciliacion IN ('conciliado_automatico', 'conciliado_exacto')
              AND DATE(conciliado_en) = @fecha_objetivo
        """
        
        registros_banco = list(client.query(query_banco_afectados, job_config=job_config).result())
        
        logger.info(f"📊 Registros encontrados en banco_movimientos: {len(registros_banco)}")
        
        if len(registros_pagos) == 0 and len(registros_banco) == 0:
            return {
                "status": "info",
                "mensaje": f"No se encontraron conciliaciones para revertir del {fecha_objetivo}",
                "pagos_afectados": 0,
                "movimientos_afectados": 0,
                "fecha_objetivo": fecha_objetivo,
                "ejecutado_por": usuario_id,
                "timestamp": datetime.utcnow().isoformat()
            }
        
        # 3. 📄 EXPORTAR REGISTROS A CSV ANTES DE LA REVERSIÓN
        timestamp_export = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        archivos_exportados = []
        
        # Crear directorio de exportaciones si no existe
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        export_dir = os.path.join(project_root, "exportaciones")
        os.makedirs(export_dir, exist_ok=True)
        
        logger.info(f"📁 Directorio de exportación: {export_dir}")
        
        # Exportar registros de pagosconductor
        if registros_pagos:
            filename_pagos = f"reversion_pagosconductor_{fecha_objetivo.replace('-', '')}_{timestamp_export}.csv"
            filepath_pagos = os.path.join(export_dir, filename_pagos)
            
            fieldnames = list(registros_pagos[0].keys()) if registros_pagos else []
            
            with open(filepath_pagos, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                
                for registro in registros_pagos:
                    # Convertir valores especiales para CSV
                    row_data = {}
                    for key, value in registro.items():
                        if value is None:
                            row_data[key] = ""
                        elif isinstance(value, (datetime, date)):
                            row_data[key] = str(value)
                        else:
                            row_data[key] = value
                    writer.writerow(row_data)
            
            archivos_exportados.append({
                "tabla": "pagosconductor",
                "archivo": filename_pagos,
                "ruta": filepath_pagos,
                "registros": len(registros_pagos)
            })
            logger.info(f"✅ Exportados {len(registros_pagos)} registros de pagosconductor a: {filename_pagos}")
        
        # Exportar registros de banco_movimientos
        if registros_banco:
            filename_banco = f"reversion_banco_movimientos_{fecha_objetivo.replace('-', '')}_{timestamp_export}.csv"
            filepath_banco = os.path.join(export_dir, filename_banco)
            
            fieldnames = list(registros_banco[0].keys()) if registros_banco else []
            
            with open(filepath_banco, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                
                for registro in registros_banco:
                    # Convertir valores especiales para CSV
                    row_data = {}
                    for key, value in registro.items():
                        if value is None:
                            row_data[key] = ""
                        elif isinstance(value, (datetime, date)):
                            row_data[key] = str(value)
                        else:
                            row_data[key] = value
                    writer.writerow(row_data)
            
            archivos_exportados.append({
                "tabla": "banco_movimientos",
                "archivo": filename_banco,
                "ruta": filepath_banco,
                "registros": len(registros_banco)
            })
            logger.info(f"✅ Exportados {len(registros_banco)} registros de banco_movimientos a: {filename_banco}")
        
        # 4. Actualizar tabla pagosconductor
        logger.info("🔄 Actualizando registros en pagosconductor...")
        query_update_pagos = f"""
            UPDATE `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
            SET 
                estado_conciliacion = 'pendiente_conciliacion',
                conciliado = NULL,
                fecha_conciliacion = NULL,
                id_banco_asociado = NULL,
                confianza_conciliacion = NULL,
                observaciones_conciliacion = NULL
            WHERE estado_conciliacion = 'conciliado_automatico'
              AND DATE(fecha_conciliacion) = @fecha_objetivo
        """
        
        job_update_pagos = client.query(query_update_pagos, job_config=job_config)
        result_pagos = job_update_pagos.result()
        pagos_actualizados = job_update_pagos.num_dml_affected_rows
        
        logger.info(f"✅ Pagos conductor actualizados: {pagos_actualizados}")
        
        # 5. Actualizar tabla banco_movimientos
        logger.info("🔄 Actualizando registros en banco_movimientos...")
        query_update_banco = f"""
            UPDATE `{PROJECT_ID}.{DATASET_CONCILIACIONES}.banco_movimientos`
            SET 
                estado_conciliacion = 'pendiente',
                confianza_match = NULL,
                observaciones = NULL,
                conciliado_en = NULL,
                conciliado_por = NULL,
                referencia_pago_asociada = NULL,
                match_manual = NULL
            WHERE estado_conciliacion IN ('conciliado_automatico', 'conciliado_exacto')
              AND DATE(conciliado_en) = @fecha_objetivo
        """
        
        job_update_banco = client.query(query_update_banco, job_config=job_config)
        result_banco = job_update_banco.result()
        movimientos_actualizados = job_update_banco.num_dml_affected_rows
        
        logger.info(f"✅ Movimientos bancarios actualizados: {movimientos_actualizados}")
        
        # 6. Generar reporte final
        total_revertidos = pagos_actualizados + movimientos_actualizados
        
        mensaje_resultado = (
            f"✅ Reversión completada exitosamente\n"
            f"📅 Fecha objetivo: {fecha_objetivo}\n"
            f"👤 Ejecutado por: {usuario_id}\n"
            f"📊 Resultados:\n"
            f"  - Pagos conductor revertidos: {pagos_actualizados}\n"
            f"  - Movimientos bancarios revertidos: {movimientos_actualizados}\n"
            f"  - Total registros revertidos: {total_revertidos}\n"
            f"� Archivos CSV exportados: {len(archivos_exportados)}\n"
            f"�🔄 Los registros han vuelto a estado pendiente para nueva conciliación"
        )
        
        logger.info(mensaje_resultado)
        
        return {
            "status": "success",
            "mensaje": f"Reversión de conciliaciones del {fecha_objetivo} completada exitosamente",
            "detalle": {
                "fecha_objetivo": fecha_objetivo,
                "pagos_revertidos": pagos_actualizados,
                "movimientos_revertidos": movimientos_actualizados,
                "total_revertidos": total_revertidos,
                "registros_encontrados": {
                    "pagosconductor": len(registros_pagos),
                    "banco_movimientos": len(registros_banco)
                }
            },
            "archivos_exportados": archivos_exportados,
            "directorio_exportacion": export_dir,
            "ejecutado_por": usuario_id,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error revirtiendo conciliaciones del {fecha_objetivo}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error interno revirtiendo conciliaciones del {fecha_objetivo}: {str(e)}"
        )


@router.get("/consultas")
async def consultas():
    try:
        import csv
        import os
        
        client = get_bigquery_client()
        
        logger.info("Iniciando eliminación de registros por tracking number específico")
        
        # Lista específica de tracking numbers a eliminar
        tracking_numbers = [
            "4894664786128080"
        ]
        
        logger.info(f"🎯 Tracking numbers objetivo para eliminación: {tracking_numbers}")
        
        # 1. Verificar registros en pagosconductor que serán eliminados (TODAS LAS COLUMNAS)
        query_verificar_pagos = f"""
        SELECT *
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
        WHERE tracking IN UNNEST(@tracking_numbers)
        """
        
        job_config_verificar = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ArrayQueryParameter("tracking_numbers", "STRING", tracking_numbers)
            ]
        )
        
        registros_pagos = list(client.query(query_verificar_pagos, job_config=job_config_verificar).result())
        
        logger.info(f"📋 Registros encontrados en pagosconductor: {len(registros_pagos)}")
        for registro in registros_pagos:
            logger.info(f"  - Tracking: {registro['tracking']}, Referencia: {registro['referencia_pago']}, Correo: {registro['correo']}")
        
        # 2. Verificar registros en guias_liquidacion que serán eliminados (TODAS LAS COLUMNAS)
        query_verificar_liquidacion = f"""
        SELECT *
        FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion`
        WHERE tracking_number IN UNNEST(@tracking_numbers)
        """
        
        registros_liquidacion = list(client.query(query_verificar_liquidacion, job_config=job_config_verificar).result())
        
        logger.info(f"📋 Registros encontrados en guias_liquidacion: {len(registros_liquidacion)}")
        for registro in registros_liquidacion:
            logger.info(f"  - Tracking: {registro['tracking_number']}, Conductor: {registro['conductor_email']}, Estado: {registro['estado_liquidacion']}")
        
        if len(registros_pagos) == 0 and len(registros_liquidacion) == 0:
            logger.warning("⚠️ No se encontraron registros para eliminar con los tracking numbers especificados")
            return {
                "mensaje": "No se encontraron registros para eliminar con los tracking numbers especificados",
                "tracking_numbers_buscados": tracking_numbers,
                "registros_pagos_encontrados": 0,
                "registros_liquidacion_encontrados": 0,
                "timestamp": datetime.utcnow().isoformat()
            }
        
        # 📄 EXPORTAR REGISTROS COMO CSV ANTES DE ELIMINAR
        timestamp_export = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        archivos_exportados = []
        
        # Crear directorio de exportaciones si no existe (ruta relativa al proyecto)
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        export_dir = os.path.join(project_root, "exportaciones")
        os.makedirs(export_dir, exist_ok=True)
        
        logger.info(f"📁 Directorio de exportación: {export_dir}")
        
        # Exportar registros de pagosconductor
        if registros_pagos:
            filename_pagos = f"registros_eliminados_pagosconductor_{timestamp_export}.csv"
            filepath_pagos = os.path.join(export_dir, filename_pagos)
            
            # Obtener todas las columnas dinámicamente del primer registro
            if len(registros_pagos) > 0:
                fieldnames = list(registros_pagos[0].keys())
                
                with open(filepath_pagos, 'w', newline='', encoding='utf-8') as csvfile:
                    writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                    writer.writeheader()
                    
                    for registro in registros_pagos:
                        # Convertir el registro a diccionario y manejar valores nulos/fechas
                        row_data = {}
                        for field in fieldnames:
                            valor = registro[field]
                            if valor is None:
                                row_data[field] = ''
                            elif hasattr(valor, 'isoformat'):  # Es una fecha/datetime
                                row_data[field] = valor.isoformat()
                            else:
                                row_data[field] = str(valor)
                        writer.writerow(row_data)
            
            archivos_exportados.append({
                "tabla": "pagosconductor",
                "archivo": filename_pagos,
                "ruta": filepath_pagos,
                "registros": len(registros_pagos),
                "columnas_exportadas": len(fieldnames) if registros_pagos else 0
            })
            logger.info(f"✅ Exportados {len(registros_pagos)} registros de pagosconductor con {len(fieldnames)} columnas a: {filename_pagos}")
        
        # Exportar registros de guias_liquidacion
        if registros_liquidacion:
            filename_liquidacion = f"registros_eliminados_guias_liquidacion_{timestamp_export}.csv"
            filepath_liquidacion = os.path.join(export_dir, filename_liquidacion)
            
            # Obtener todas las columnas dinámicamente del primer registro
            if len(registros_liquidacion) > 0:
                fieldnames = list(registros_liquidacion[0].keys())
                
                with open(filepath_liquidacion, 'w', newline='', encoding='utf-8') as csvfile:
                    writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                    writer.writeheader()
                    
                    for registro in registros_liquidacion:
                        # Convertir el registro a diccionario y manejar valores nulos/fechas
                        row_data = {}
                        for field in fieldnames:
                            valor = registro[field]
                            if valor is None:
                                row_data[field] = ''
                            elif hasattr(valor, 'isoformat'):  # Es una fecha/datetime
                                row_data[field] = valor.isoformat()
                            else:
                                row_data[field] = str(valor)
                        writer.writerow(row_data)
            
            archivos_exportados.append({
                "tabla": "guias_liquidacion",
                "archivo": filename_liquidacion,
                "ruta": filepath_liquidacion,
                "registros": len(registros_liquidacion),
                "columnas_exportadas": len(fieldnames) if registros_liquidacion else 0
            })
            logger.info(f"✅ Exportados {len(registros_liquidacion)} registros de guias_liquidacion con {len(fieldnames)} columnas a: {filename_liquidacion}")
        
        logger.info(f"📁 Archivos CSV exportados exitosamente en: {export_dir}")
        
        # 3. Eliminar registros de pagosconductor
        logger.info("🗑️ Eliminando registros de pagosconductor...")
        query_delete_pagos = f"""
        DELETE FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.pagosconductor`
        WHERE tracking IN UNNEST(@tracking_numbers)
        """
        
        delete_job_pagos = client.query(query_delete_pagos, job_config=job_config_verificar)
        delete_job_pagos.result()  # Esperar a que termine
        registros_pagos_eliminados = delete_job_pagos.num_dml_affected_rows
        
        logger.info(f"✅ Registros eliminados de pagosconductor: {registros_pagos_eliminados}")
        
        # 4. Eliminar registros de guias_liquidacion
        logger.info("🗑️ Eliminando registros de guias_liquidacion...")
        query_delete_liquidacion = f"""
        DELETE FROM `{PROJECT_ID}.{DATASET_CONCILIACIONES}.guias_liquidacion`
        WHERE tracking_number IN UNNEST(@tracking_numbers)
        """
        
        delete_job_liquidacion = client.query(query_delete_liquidacion, job_config=job_config_verificar)
        delete_job_liquidacion.result()  # Esperar a que termine
        registros_liquidacion_eliminados = delete_job_liquidacion.num_dml_affected_rows
        
        logger.info(f"✅ Registros eliminados de guias_liquidacion: {registros_liquidacion_eliminados}")
        
        # 5. Generar reporte final
        total_eliminados = registros_pagos_eliminados + registros_liquidacion_eliminados
        
        mensaje_resultado = (
            f"✅ Eliminación completada exitosamente\n"
            f"🎯 Tracking numbers procesados: {len(tracking_numbers)}\n"
            f"📊 Resultados:\n"
            f"  - pagosconductor eliminados: {registros_pagos_eliminados}\n"
            f"  - guias_liquidacion eliminados: {registros_liquidacion_eliminados}\n"
            f"  - Total registros eliminados: {total_eliminados}\n"
            f"📁 Archivos CSV exportados: {len(archivos_exportados)}"
        )
        
        logger.info(mensaje_resultado)
        
        return {
            "mensaje": f"Eliminación completada exitosamente. {total_eliminados} registros eliminados",
            "operacion": "DELETE por tracking numbers específicos con exportación CSV",
            "tracking_numbers_objetivo": tracking_numbers,
            "registros_pagos_encontrados": len(registros_pagos),
            "registros_liquidacion_encontrados": len(registros_liquidacion),
            "registros_pagos_eliminados": registros_pagos_eliminados,
            "registros_liquidacion_eliminados": registros_liquidacion_eliminados,
            "total_eliminados": total_eliminados,
            "archivos_exportados": archivos_exportados,
            "directorio_exportacion": export_dir,
            "tablas_afectadas": {
                "pagosconductor": {
                    "campo_filtro": "tracking",
                    "registros_eliminados": registros_pagos_eliminados
                },
                "guias_liquidacion": {
                    "campo_filtro": "tracking_number", 
                    "registros_eliminados": registros_liquidacion_eliminados
                }
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"❌ Error ejecutando actualización específica: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error ejecutando actualización específica: {str(e)}"
        )