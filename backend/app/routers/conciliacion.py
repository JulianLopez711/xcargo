from fastapi import APIRouter, UploadFile, File, HTTPException
from google.cloud import bigquery
import csv
import io
import datetime
from typing import List, Dict, Optional, Any
from pydantic import BaseModel
from decimal import Decimal
from collections import defaultdict

router = APIRouter(prefix="/conciliacion", tags=["Conciliacion"])

# Aumentar límite a 50MB
MAX_FILE_SIZE = 50 * 1024 * 1024

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
        timestamp = int(datetime.datetime.utcnow().timestamp() * 1000000)
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
                return datetime.datetime.strptime(fecha_raw, formato).date()
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
                # Solo comas - puede ser decimal o separador de miles
                partes = valor_limpio.split(",")
                if len(partes) == 2 and len(partes[1]) <= 2:
                    # Decimal: 1234,56
                    valor_limpio = valor_limpio.replace(",", ".")
                else:
                    # Separador de miles: 1,234,567
                    valor_limpio = valor_limpio.replace(",", "")
            
            # Convertir a float
            return float(valor_limpio)
            
        except Exception as e:
            raise ValueError(f"Línea {numero_linea}: Formato de valor inválido '{valor_raw}': {str(e)}")

    def es_consignacion(self) -> bool:
        """Determina si el movimiento es una consignación"""
        descripcion_upper = self.descripcion.upper()
        terminos_consignacion = [
            "CONSIGNACION", "CONSIG", "DEPOSITO", "DEP", 
            "ABONO", "CREDITO", "INGRESO", "TRANSFERENCIA RECIBIDA",
            "TRF RECIBIDA", "PAGO", "RECAUDO"
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

@router.post("/cargar-banco-excel-mejorado")
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
    
    # Filtrar solo consignaciones
    consignaciones = [mov for mov in analisis["movimientos_validos"] if mov.es_consignacion()]
    
    print(f"\n💰 CONSIGNACIONES ENCONTRADAS: {len(consignaciones)}")
    for i, cons in enumerate(consignaciones[:5]):  # Mostrar primeras 5
        print(f"  {i+1}. {cons.fecha} | ${cons.valor:,.0f} | {cons.descripcion[:40]}")
    
    if len(consignaciones) > 5:
        print(f"  ... y {len(consignaciones) - 5} más")

    if not consignaciones:
        # Proporcionar información detallada sobre por qué no se encontraron consignaciones
        info_debug = {
            "mensaje": "No se encontraron consignaciones válidas",
            "analisis_detallado": {
                "total_movimientos_parseados": len(analisis["movimientos_validos"]),
                "tipos_encontrados": dict(analisis["tipos_transaccion"]),
                "errores_parsing": len(analisis["errores_parsing"]),
                "primeros_errores": analisis["errores_parsing"][:10],
                "encoding_usado": encoding_usado
            }
        }
        raise HTTPException(status_code=400, detail=f"Debug info: {info_debug}")

    # ANÁLISIS DE PATRONES (código existente)
    client = bigquery.Client()
    
    fechas_archivo = list(set(mov.fecha.isoformat() for mov in consignaciones))
    print(f"📅 Fechas en archivo: {fechas_archivo}")
    
    todos_movimientos_a_insertar = []
    reporte_completo = {"fechas_procesadas": {}}
    
    # Analizar cada fecha por separado
    for fecha_str in fechas_archivo:
        print(f"\n🔍 Analizando fecha: {fecha_str}")
        
        movimientos_fecha = [mov for mov in consignaciones if mov.fecha.isoformat() == fecha_str]
        
        # Obtener patrones existentes de la BD
        patrones_existentes = analizar_patrones_existentes(client, fecha_str)
        
        # Analizar patrones del archivo
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
            registros_bd.append({
                "id": mov.id,
                "fecha": mov.fecha.isoformat(),
                "valor_banco": mov.valor,
                "cuenta": mov.cuenta,
                "codigo": mov.codigo,
                "cod_transaccion": mov.cod_transaccion,
                "descripcion": mov.descripcion,
                "tipo": "CONSIGNACION",
                "estado_conciliacion": "pendiente",
                "match_manual": False,
                "confianza_match": 0,
                "observaciones": "",
                "cargado_en": datetime.datetime.utcnow().isoformat(),
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
            "consignaciones_encontradas": len(consignaciones),
            "errores_parsing": len(analisis["errores_parsing"]),
            "tipos_transaccion": dict(analisis["tipos_transaccion"])
        },
        "movimientos_insertados": len(todos_movimientos_a_insertar),
        "reporte_detallado": reporte_completo,
        "fecha_procesamiento": datetime.datetime.utcnow().isoformat()
    }
    
    # Incluir errores si son pocos para debug
    if len(analisis["errores_parsing"]) <= 20:
        resultado["errores_detallados"] = analisis["errores_parsing"]
    
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

def conciliar_pago_automaticamente(referencia: str, valor: float, entidad: str) -> bool:
    """
    Busca coincidencias automáticas de un pago en banco_movimientos por referencia, valor y entidad.
    """
    client = bigquery.Client()
    query = """
    SELECT COUNT(*) as coincidencias
    FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
    WHERE referencia = @referencia
      AND ABS(valor_banco - @valor) < 500
      AND LOWER(cuenta) = LOWER(@entidad)
    LIMIT 1
    """
    result = client.query(query, job_config=bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("referencia", "STRING", referencia),
            bigquery.ScalarQueryParameter("valor", "FLOAT", valor),
            bigquery.ScalarQueryParameter("entidad", "STRING", entidad),
        ]
    )).result()

    row = list(result)[0]
    return row["coincidencias"] > 0