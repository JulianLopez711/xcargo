# SOLUCIÓN COMPLETA - conciliacion.py

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
    def __init__(self, fila_csv: str):
        # Parsear CSV con separador ; del banco
        campos = fila_csv.split(';')
        
        if len(campos) < 9:
            raise ValueError(f"Formato inválido: se esperaban 9 campos, se encontraron {len(campos)}")
        
        self.cuenta = campos[0].strip()
        self.codigo = campos[1].strip()
        self.campo_vacio_1 = campos[2].strip()
        self.fecha_raw = campos[3].strip()
        self.campo_vacio_2 = campos[4].strip()
        self.valor_raw = campos[5].strip()
        self.cod_transaccion = campos[6].strip()
        self.descripcion = campos[7].strip()
        self.flag = campos[8].strip()
        
        # Procesar fecha YYYYMMDD
        if len(self.fecha_raw) == 8:
            self.fecha = datetime.datetime.strptime(self.fecha_raw, "%Y%m%d").date()
        else:
            raise ValueError(f"Formato de fecha inválido: {self.fecha_raw}")
        
        # Procesar valor (remover espacios y convertir)
        try:
            self.valor = float(self.valor_raw.replace(" ", "").replace(",", "."))
        except:
            raise ValueError(f"Formato de valor inválido: {self.valor_raw}")
        
        # Crear ID único con timestamp para evitar duplicados
        timestamp = int(datetime.datetime.utcnow().timestamp() * 1000000)  # Microsegundos
        self.id = f"BANCO_{self.fecha_raw}_{int(self.valor)}_{timestamp % 1000000}"

# ========== FUNCIONES DE VALIDACIÓN POR PATRONES ==========

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
                # Hay más transacciones, insertar solo las nuevas
                cantidad_a_insertar = cantidad_nueva - cantidad_existente
                movimientos_nuevos = movimientos_valor[-cantidad_a_insertar:]  # Tomar las últimas
                movimientos_a_insertar.extend(movimientos_nuevos)
                
                print(f"  ✅ ${valor:,.0f}: Existían {cantidad_existente}, nuevas {cantidad_nueva}, insertar {cantidad_a_insertar}")
                reporte_detallado["nuevos_insertados"].append({
                    "tipo": tipo_desc,
                    "valor": valor,
                    "cantidad_insertada": cantidad_a_insertar
                })
                
            elif cantidad_nueva == cantidad_existente:
                # Mismo patrón, posible duplicado
                print(f"  ⚠️ ${valor:,.0f}: Mismo patrón ({cantidad_existente}), SKIP duplicados")
                reporte_detallado["duplicados_skipped"].append({
                    "tipo": tipo_desc,
                    "valor": valor,
                    "cantidad_skipped": cantidad_nueva
                })
                
            else:
                # Menos transacciones que antes - anomalía
                print(f"  🤔 ${valor:,.0f}: ANOMALÍA - Archivo tiene {cantidad_nueva}, BD tiene {cantidad_existente}")
                reporte_detallado["anomalias_detectadas"].append({
                    "tipo": tipo_desc,
                    "valor": valor,
                    "cantidad_archivo": cantidad_nueva,
                    "cantidad_bd": cantidad_existente
                })
    
    return movimientos_a_insertar, reporte_detallado

# ========== ENDPOINT MEJORADO DE CARGA ==========

@router.post("/cargar-banco-excel")
async def cargar_archivo_banco(file: UploadFile = File(...)):
    """Cargar archivo CSV del banco con validación de patrones inteligente"""
    
    if not (file.filename.endswith((".csv", ".CSV"))):
        raise HTTPException(status_code=400, detail="El archivo debe ser CSV")

    # VALIDAR TAMAÑO DEL ARCHIVO
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413, 
            detail=f"Archivo demasiado grande. Máximo permitido: {MAX_FILE_SIZE // (1024*1024)}MB"
        )
    
    # DECODIFICAR ARCHIVO
    try:
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            decoded = content.decode("latin-1")
        except UnicodeDecodeError:
            try:
                decoded = content.decode("cp1252")
            except UnicodeDecodeError:
                raise HTTPException(status_code=400, detail="No se pudo decodificar el archivo")
    
    # PARSEAR MOVIMIENTOS
    lineas = decoded.strip().split('\n')
    movimientos_parseados = []
    errores = []
    
    print(f"📄 Procesando archivo: {file.filename} ({len(lineas)} líneas)")
    
    for i, linea in enumerate(lineas):
        linea = linea.strip()
        if not linea or len(linea) < 10:
            continue
            
        try:
            mov = MovimientoBanco(linea)
            
            # Solo procesar consignaciones
            if "CONSIGNACION" in mov.descripcion.upper():
                movimientos_parseados.append(mov)
        except Exception as e:
            errores.append(f"Línea {i+1}: {str(e)}")
            continue

    if not movimientos_parseados:
        error_msg = "No se encontraron consignaciones válidas."
        if errores:
            error_msg += f" Errores: {'; '.join(errores[:5])}"
        raise HTTPException(status_code=400, detail=error_msg)

    print(f"✅ Parseadas {len(movimientos_parseados)} consignaciones")

    # ANÁLISIS DE PATRONES
    client = bigquery.Client()
    
    # Obtener fechas únicas del archivo
    fechas_archivo = list(set(mov.fecha.isoformat() for mov in movimientos_parseados))
    print(f"📅 Fechas en archivo: {fechas_archivo}")
    
    todos_movimientos_a_insertar = []
    reporte_completo = {"fechas_procesadas": {}}
    
    # Analizar cada fecha por separado
    for fecha_str in fechas_archivo:
        print(f"\n🔍 Analizando fecha: {fecha_str}")
        
        # Filtrar movimientos de esta fecha
        movimientos_fecha = [mov for mov in movimientos_parseados if mov.fecha.isoformat() == fecha_str]
        
        # Obtener patrones existentes de la BD
        patrones_existentes = analizar_patrones_existentes(client, fecha_str)
        
        # Analizar patrones del archivo
        patrones_nuevos = analizar_patrones_nuevos(movimientos_fecha)
        
        # Determinar qué insertar
        movimientos_insertar, reporte_fecha = determinar_movimientos_a_insertar(patrones_existentes, patrones_nuevos)
        
        todos_movimientos_a_insertar.extend(movimientos_insertar)
        reporte_completo["fechas_procesadas"][fecha_str] = reporte_fecha

    # INSERTAR EN BIGQUERY
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
                "linea_original": f"{mov.cuenta};{mov.codigo}; ;{mov.fecha_raw}; ;{mov.valor_raw};{mov.cod_transaccion}; {mov.descripcion};{mov.flag}"
            })
        
        # Insertar usando SQL
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

    # GENERAR RESPUESTA
    resultado = {
        "mensaje": "Archivo procesado con validación inteligente de patrones",
        "total_lineas_archivo": len(lineas),
        "consignaciones_parseadas": len(movimientos_parseados),
        "movimientos_insertados": len(todos_movimientos_a_insertar),
        "errores_encontrados": len(errores),
        "reporte_detallado": reporte_completo,
        "fecha_procesamiento": datetime.datetime.utcnow().isoformat()
    }
    
    if errores and len(errores) <= 10:
        resultado["detalle_errores"] = errores
    
    return resultado

# ========== CONCILIACIÓN CON REFERENCIAS ÚNICAS ==========

def encontrar_mejor_match_unico(mov_banco: Dict, pagos_disponibles: List[Dict]) -> Dict:
    """Encuentra el mejor match y retorna SOLO UNA referencia única"""
    
    if isinstance(mov_banco["fecha"], str):
        fecha_banco = datetime.datetime.fromisoformat(mov_banco["fecha"]).date()
    else:
        fecha_banco = mov_banco["fecha"]
    
    valor_banco = float(mov_banco["valor_banco"])
    
    matches_exactos = []
    matches_aproximados = []
    
    print(f"🔍 Buscando match ÚNICO para: ${valor_banco:,.0f} del {fecha_banco}")
    
    for pago in pagos_disponibles:
        try:
            if isinstance(pago["fecha_pago"], str):
                fecha_pago = datetime.datetime.fromisoformat(pago["fecha_pago"]).date()
            else:
                fecha_pago = pago["fecha_pago"]
            
            valor_pago = float(pago.get("valor_total", 0) or 0)
            
            if valor_banco == 0 or valor_pago == 0:
                continue
            
            diferencia_dias = abs((fecha_banco - fecha_pago).days)
            diferencia_valor = abs(valor_banco - valor_pago)
            
            match_info = {
                "pago": pago,
                "diferencia_dias": diferencia_dias,
                "diferencia_valor": diferencia_valor,
                "score": 0
            }
            
            # ✅ CRITERIOS MEJORADOS PARA SELECCIÓN ÚNICA
            
            # Criterio 1: Match perfecto (mismo día, mismo valor)
            if diferencia_dias == 0 and diferencia_valor == 0:
                match_info["score"] = 100
                matches_exactos.append(match_info)
                
            # Criterio 2: Mismo valor, fecha cercana (±3 días)
            elif diferencia_valor == 0 and diferencia_dias <= 3:
                match_info["score"] = 95 - (diferencia_dias * 2)
                matches_aproximados.append(match_info)
                
        except Exception as e:
            print(f"⚠️ Error procesando pago {pago.get('referencia_pago', 'N/A')}: {e}")
            continue
    
    # ✅ SELECCIÓN INTELIGENTE DEL MEJOR MATCH
    mejor_match = None
    
    if matches_exactos:
        # Ordenar por criterios de prioridad para desempate
        matches_exactos.sort(key=lambda x: (
            x["score"],                           # Mayor score
            -x["diferencia_dias"],                # Menor diferencia de días
            x["pago"]["referencia_pago"]          # Orden alfabético para consistencia
        ), reverse=True)
        
        mejor_match = matches_exactos[0]
        
        if len(matches_exactos) > 1:
            print(f"  🔸 Múltiples matches exactos, seleccionado: {mejor_match['pago']['referencia_pago']}")
            print(f"    Alternativas disponibles: {[m['pago']['referencia_pago'] for m in matches_exactos[1:]]}")
        else:
            print(f"  ✅ Match exacto único: {mejor_match['pago']['referencia_pago']}")
        
        return crear_resultado_match(mov_banco, mejor_match, "conciliado_exacto", mejor_match["score"])
    
    elif matches_aproximados:
        # Seleccionar el mejor aproximado
        matches_aproximados.sort(key=lambda x: (
            x["score"],
            -x["diferencia_dias"],
            x["pago"]["referencia_pago"]
        ), reverse=True)
        
        mejor_match = matches_aproximados[0]
        print(f"  🔸 Match aproximado seleccionado: {mejor_match['pago']['referencia_pago']} ({mejor_match['diferencia_dias']} días)")
        
        return crear_resultado_match(mov_banco, mejor_match, "conciliado_aproximado", mejor_match["score"])
    
    else:
        print(f"  ❌ Sin matches encontrados")
        return crear_resultado_sin_match(mov_banco)


def crear_resultado_match(mov_banco: Dict, match_info: Dict, estado: str, confianza: float) -> Dict:
    """Crea resultado de match exitoso"""
    pago = match_info["pago"]
    
    fecha_banco = mov_banco["fecha"]
    if isinstance(fecha_banco, str):
        fecha_banco_str = fecha_banco
    else:
        fecha_banco_str = fecha_banco.isoformat()
    
    fecha_pago = pago["fecha_pago"]
    if isinstance(fecha_pago, str):
        fecha_pago_str = fecha_pago
    else:
        fecha_pago_str = fecha_pago.isoformat()
    
    return {
        "id_banco": mov_banco["id"],
        "fecha_banco": fecha_banco_str,
        "valor_banco": mov_banco["valor_banco"],
        "descripcion_banco": mov_banco["descripcion"],
        "estado_match": estado,
        "confianza": round(confianza, 1),
        "referencia_pago": pago["referencia_pago"],
        "fecha_pago": fecha_pago_str,
        "valor_pago": pago["valor_total"],
        "diferencia_valor": match_info["diferencia_valor"],
        "diferencia_dias": match_info["diferencia_dias"],
        "trackings": pago.get("trackings", ""),
        "correo_conductor": pago.get("correo_conductor", ""),
        "entidad_pago": pago.get("entidad", ""),
        "num_guias": pago.get("num_guias", 0),
        "observaciones": generar_observaciones(match_info, estado)
    }

def crear_resultado_multiple_match(mov_banco: Dict, matches: List[Dict], estado: str) -> Dict:
    """Crea resultado cuando hay múltiples matches posibles"""
    
    fecha_banco = mov_banco["fecha"]
    if isinstance(fecha_banco, str):
        fecha_banco_str = fecha_banco
    else:
        fecha_banco_str = fecha_banco.isoformat()
    
    matches_posibles = []
    for m in matches[:5]:
        pago = m["pago"]
        fecha_pago = pago["fecha_pago"]
        if isinstance(fecha_pago, str):
            fecha_pago_str = fecha_pago
        else:
            fecha_pago_str = fecha_pago.isoformat()
            
        matches_posibles.append({
            "referencia_pago": pago["referencia_pago"],
            "fecha_pago": fecha_pago_str,
            "valor_pago": pago["valor_total"],
            "score": m["score"]
        })
    
    return {
        "id_banco": mov_banco["id"],
        "fecha_banco": fecha_banco_str,
        "valor_banco": mov_banco["valor_banco"],
        "descripcion_banco": mov_banco["descripcion"],
        "estado_match": estado,
        "confianza": 0,
        "num_matches_posibles": len(matches),
        "matches_posibles": matches_posibles,
        "observaciones": f"Se encontraron {len(matches)} posibles matches. Requiere revisión manual."
    }

def crear_resultado_sin_match(mov_banco: Dict) -> Dict:
    """Crea resultado cuando no hay matches"""
    
    fecha_banco = mov_banco["fecha"]
    if isinstance(fecha_banco, str):
        fecha_banco_str = fecha_banco
    else:
        fecha_banco_str = fecha_banco.isoformat()
    
    return {
        "id_banco": mov_banco["id"],
        "fecha_banco": fecha_banco_str,
        "valor_banco": mov_banco["valor_banco"],
        "descripcion_banco": mov_banco["descripcion"],
        "estado_match": "sin_match",
        "confianza": 0,
        "observaciones": "No se encontró ningún pago de conductor que coincida con este movimiento bancario."
    }

def generar_observaciones(match_info: Dict, estado: str) -> str:
    """Genera observaciones detalladas basadas en el tipo de match"""
    pago = match_info["pago"]
    
    if estado == "conciliado_exacto":
        return f"Match exacto con {pago['referencia_pago']} - fecha y valor_total_consignacion coinciden perfectamente"
    elif estado == "conciliado_aproximado":
        return f"Match aproximado con {pago['referencia_pago']} - diferencia de {match_info['diferencia_dias']} días y ${match_info['diferencia_valor']:,.0f}"
    elif estado == "diferencia_valor":
        return f"Match con diferencia de valor: ${match_info['diferencia_valor']:,.0f} entre banco y {pago['referencia_pago']}"
    elif estado == "diferencia_fecha":
        return f"Match con diferencia de fecha: {match_info['diferencia_dias']} días con {pago['referencia_pago']}"
    else:
        return "Requiere revisión manual"

def actualizar_estado_referencia_usada(client: bigquery.Client, id_banco: str, referencia_pago: str, estado: str):
    """Actualiza el estado del movimiento bancario después de un match exitoso"""
    
    query = """
    UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
    SET estado_conciliacion = @estado,
        referencia_pago_asignada = @referencia,
        fecha_conciliacion = CURRENT_TIMESTAMP()
    WHERE id = @id_banco
    """
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("estado", "STRING", estado),
            bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago),
            bigquery.ScalarQueryParameter("id_banco", "STRING", id_banco)
        ]
    )
    
    try:
        client.query(query, job_config=job_config).result()
        print(f"✅ Referencia {referencia_pago} asignada a movimiento {id_banco}")
    except Exception as e:
        print(f"⚠️ Error actualizando estado: {e}")

@router.get("/conciliacion-automatica-mejorada")
def ejecutar_conciliacion_automatica():
    """Ejecuta el proceso de conciliación automática inteligente - VERSIÓN ORIGINAL"""
    
    try:
        client = bigquery.Client()
        
        # 1. Obtener movimientos del banco pendientes de conciliar
        query_banco = """
            SELECT * FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
            WHERE estado_conciliacion = 'pendiente'
            ORDER BY fecha DESC, valor_banco DESC
            LIMIT 1000
        """
        
        # 2. ✅ QUERY TEMPORAL SIN REFERENCIA_PAGO_ASOCIADA (para compatibilidad)
        query_pagos = """
            SELECT 
                pc.referencia_pago,
                pc.fecha_pago,
                pc.valor_total_consignacion as valor_total,
                COUNT(*) as num_guias,
                MAX(pc.tipo) as tipo_pago,
                MAX(pc.entidad) as entidad,
                STRING_AGG(DISTINCT COALESCE(pc.tracking, pc.referencia), ', ' LIMIT 10) as trackings,
                MAX(pc.estado) as estado,
                MAX(pc.correo) as correo_conductor
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
            WHERE pc.estado IN ('pagado', 'aprobado')
              AND pc.fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
              AND pc.valor_total_consignacion IS NOT NULL  
              AND pc.valor_total_consignacion > 0
            GROUP BY pc.referencia_pago, pc.fecha_pago, pc.valor_total_consignacion
            ORDER BY pc.fecha_pago DESC
        """
        
        print("🔄 Consultando datos...")
        movimientos_banco = [dict(row) for row in client.query(query_banco).result()]
        pagos_disponibles = [dict(row) for row in client.query(query_pagos).result()]
        
        print(f"📊 Datos obtenidos:")
        print(f"  - {len(movimientos_banco)} movimientos bancarios pendientes")
        print(f"  - {len(pagos_disponibles)} pagos disponibles para conciliar")
        
    except Exception as e:
        print(f"❌ Error consultando datos: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error consultando datos: {str(e)}")
    
    resultados_conciliacion = []
    estadisticas = {
        "conciliado_exacto": 0,
        "conciliado_aproximado": 0,
        "multiple_match": 0,
        "diferencia_valor": 0,
        "diferencia_fecha": 0,
        "sin_match": 0
    }
    
    errores_procesamiento = []
    referencias_usadas = set()  # Control local de referencias usadas
    
    print(f"\n🤖 Iniciando conciliación automática...")
    
    for i, mov_banco in enumerate(movimientos_banco):
        try:
            if i < 5:  # Debug para los primeros 5
                print(f"\n🔍 Procesando movimiento {i+1}/{len(movimientos_banco)}")
                print(f"  Banco: ${mov_banco.get('valor_banco'):,.0f} del {mov_banco.get('fecha')}")
            
            # Filtrar pagos disponibles (excluir ya usados en esta sesión)
            pagos_disponibles_filtrados = [
                pago for pago in pagos_disponibles 
                if pago['referencia_pago'] not in referencias_usadas
            ]
            
            if i < 5:
                print(f"  Pagos disponibles: {len(pagos_disponibles_filtrados)}")
            
            # Encontrar mejor match
            resultado_match = encontrar_mejor_match_unico(mov_banco, pagos_disponibles_filtrados)
            resultados_conciliacion.append(resultado_match)
            estadisticas[resultado_match["estado_match"]] += 1
            
            # ✅ MARCAR REFERENCIA COMO USADA si hay match exitoso
            if resultado_match.get("referencia_pago") and resultado_match["estado_match"] in [
                "conciliado_exacto", "conciliado_aproximado", "diferencia_valor", "diferencia_fecha"
            ]:
                referencia_usada = resultado_match["referencia_pago"]
                referencias_usadas.add(referencia_usada)
                
                # ✅ ACTUALIZACIÓN TEMPORAL SIN REFERENCIA_PAGO_ASOCIADA
                actualizar_estado_simple(client, mov_banco["id"], resultado_match["estado_match"])
                
                if i < 5:
                    print(f"  ✅ Referencia {referencia_usada} marcada como usada")
            
        except Exception as e:
            error_info = {
                "movimiento_id": mov_banco.get("id", f"movimiento_{i}"),
                "error": str(e),
                "fecha": str(mov_banco.get("fecha", "N/A")),
                "valor": str(mov_banco.get("valor_banco", "N/A"))
            }
            errores_procesamiento.append(error_info)
            print(f"❌ Error procesando movimiento {i}: {e}")
            continue
    
    print(f"\n🎉 Conciliación completada!")
    print(f"  - Procesados: {len(resultados_conciliacion)}")
    print(f"  - Referencias usadas: {len(referencias_usadas)}")
    print(f"  - Errores: {len(errores_procesamiento)}")
    
    respuesta = {
        "resumen": {
            "total_movimientos_banco": len(movimientos_banco),
            "total_pagos_conductores": len(pagos_disponibles),
            "total_procesados": len(resultados_conciliacion),
            "total_errores": len(errores_procesamiento),
            "referencias_utilizadas": len(referencias_usadas),
            **estadisticas
        },
        "resultados": resultados_conciliacion,
        "referencias_usadas": list(referencias_usadas),
        "errores_procesamiento": errores_procesamiento if errores_procesamiento else None,
        "fecha_conciliacion": datetime.datetime.utcnow().isoformat()
    }
    
    return respuesta

def actualizar_estado_con_referencia(client: bigquery.Client, id_banco: str, estado: str, referencia_pago: str):
    """Actualiza el estado del movimiento bancario con la referencia correcta"""
    
    query = """
    UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
    SET estado_conciliacion = @estado,
        referencia_pago_asociada = @referencia,    -- ✅ CAMPO CORRECTO
        conciliado_en = CURRENT_TIMESTAMP(),        -- ✅ CAMPO CORRECTO
        conciliado_por = 'automatico',              -- ✅ CAMPO CORRECTO
        confianza_match = 100,
        observaciones = CONCAT(COALESCE(observaciones, ''), ' - Conciliado automáticamente')
    WHERE id = @id_banco
    """
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("estado", "STRING", estado),
            bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago),
            bigquery.ScalarQueryParameter("id_banco", "STRING", id_banco)
        ]
    )
    
    try:
        client.query(query, job_config=job_config).result()
        print(f"✅ Referencia {referencia_pago} asociada a movimiento {id_banco}")
    except Exception as e:
        print(f"⚠️ Error actualizando estado: {e}")
def actualizar_estado_simple(client: bigquery.Client, id_banco: str, estado: str):
    """Actualización temporal sin campo referencia_pago_asociada"""
    
    query = """
    UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
    SET estado_conciliacion = @estado,
        confianza_match = 100,
        observaciones = CONCAT(COALESCE(observaciones, ''), ' - Conciliado automáticamente')
    WHERE id = @id_banco
    """
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("estado", "STRING", estado),
            bigquery.ScalarQueryParameter("id_banco", "STRING", id_banco)
        ]
    )
    
    try:
        client.query(query, job_config=job_config).result()
    except Exception as e:
        print(f"⚠️ Error actualizando estado: {e}")

@router.get("/validar-datos-conciliacion")
def validar_datos_conciliacion():
    """Valida que los datos estén correctos para la conciliación"""
    
    client = bigquery.Client()
    
    query_validacion = """
    WITH validacion AS (
        SELECT 
            'pagos_sin_valor_total_consignacion' as problema,
            COUNT(*) as cantidad,
            STRING_AGG(referencia_pago, ', ' LIMIT 5) as ejemplos
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE estado IN ('pagado', 'aprobado')
        AND (valor_total_consignacion IS NULL OR valor_total_consignacion = 0)
        
        UNION ALL
        
        SELECT 
            'movimientos_banco_sin_valor' as problema,
            COUNT(*) as cantidad,
            STRING_AGG(id, ', ' LIMIT 5) as ejemplos
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE estado_conciliacion = 'pendiente'
        AND (valor_banco IS NULL OR valor_banco = 0)
        
        UNION ALL
        
        SELECT 
            'referencias_duplicadas_en_conciliacion' as problema,
            COUNT(*) as cantidad,
            STRING_AGG(referencia_pago_asociada, ', ' LIMIT 5) as ejemplos  -- ✅ CAMPO CORRECTO
        FROM (
            SELECT referencia_pago_asociada, COUNT(*) as cnt
            FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
            WHERE referencia_pago_asociada IS NOT NULL  -- ✅ CAMPO CORRECTO
            GROUP BY referencia_pago_asociada
            HAVING COUNT(*) > 1
        )
        
        UNION ALL
        
        SELECT 
            'movimientos_pendientes' as problema,
            COUNT(*) as cantidad,
            CAST(SUM(valor_banco) AS STRING) as ejemplos
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE estado_conciliacion = 'pendiente'
        
        UNION ALL
        
        SELECT 
            'pagos_disponibles_para_conciliar' as problema,
            COUNT(*) as cantidad,
            CAST(SUM(valor_total_consignacion) AS STRING) as ejemplos
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor` pc
        WHERE pc.estado IN ('pagado', 'aprobado')
        AND pc.valor_total_consignacion IS NOT NULL  
        AND pc.valor_total_consignacion > 0
        AND NOT EXISTS (
            SELECT 1 FROM `datos-clientes-441216.Conciliaciones.banco_movimientos` bm 
            WHERE bm.referencia_pago_asociada = pc.referencia_pago   -- ✅ CAMPO CORRECTO
        )
    )
    SELECT * FROM validacion WHERE cantidad > 0 OR problema IN ('movimientos_pendientes', 'pagos_disponibles_para_conciliar')
    """
    
    try:
        resultados = [dict(row) for row in client.query(query_validacion).result()]
        
        print("📊 Validación de datos:")
        for resultado in resultados:
            if resultado['problema'] in ['movimientos_pendientes', 'pagos_disponibles_para_conciliar']:
                print(f"  ✅ {resultado['problema']}: {resultado['cantidad']} (${float(resultado['ejemplos']):,.0f})")
            elif resultado['cantidad'] > 0:
                print(f"  ⚠️ {resultado['problema']}: {resultado['cantidad']} casos")
                print(f"    Ejemplos: {resultado['ejemplos']}")
        
        return {
            "estado": "validacion_completada",
            "resultados": resultados,
            "fecha_validacion": datetime.datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en validación: {str(e)}")

@router.post("/marcar-conciliado-manual")
def marcar_conciliado_manual(data: dict):
    """Marca un movimiento como conciliado manualmente"""
    id_banco = data.get("id_banco")
    referencia_pago = data.get("referencia_pago", "")
    observaciones = data.get("observaciones", "Conciliado manualmente")
    
    if not id_banco:
        raise HTTPException(status_code=400, detail="ID del banco requerido")
    
    client = bigquery.Client()
    
    # ✅ VERIFICAR QUE LA REFERENCIA NO ESTÉ YA USADA (CON CAMPO CORRECTO)
    if referencia_pago:
        query_verificar = """
        SELECT COUNT(*) as count
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE referencia_pago_asociada = @referencia  -- ✅ CAMPO CORRECTO
        AND estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual')
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago)
            ]
        )
        
        resultado = list(client.query(query_verificar, job_config=job_config).result())[0]
        if resultado.count > 0:
            raise HTTPException(
                status_code=400, 
                detail=f"La referencia {referencia_pago} ya está asociada a otro movimiento"
            )
    
    # ✅ ACTUALIZAR CON CAMPOS CORRECTOS
    query = """
    UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
    SET estado_conciliacion = 'conciliado_manual',
        match_manual = TRUE,
        confianza_match = 100,
        observaciones = @observaciones,
        referencia_pago_asociada = @referencia,     -- ✅ CAMPO CORRECTO
        conciliado_en = CURRENT_TIMESTAMP(),        -- ✅ CAMPO CORRECTO
        conciliado_por = 'manual'                   -- ✅ AGREGAR QUIEN CONCILIÓ
    WHERE id = @id_banco
    """
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("id_banco", "STRING", id_banco),
            bigquery.ScalarQueryParameter("observaciones", "STRING", observaciones),
            bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago)
        ]
    )
    
    try:
        client.query(query, job_config=job_config).result()
        return {"mensaje": f"Movimiento marcado como conciliado manual con referencia {referencia_pago}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get("/resumen-conciliacion")
def obtener_resumen_conciliacion():
    """Obtiene resumen del estado de la conciliación"""
    
    client = bigquery.Client()
    
    query = """
    SELECT 
        estado_conciliacion,
        COUNT(*) as cantidad,
        SUM(valor_banco) as valor_total,
        MIN(fecha) as fecha_min,
        MAX(fecha) as fecha_max
    FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
    GROUP BY estado_conciliacion
    ORDER BY cantidad DESC
    """
    
    resultados = [dict(row) for row in client.query(query).result()]
    
    # Calcular totales
    total_movimientos = sum(r["cantidad"] for r in resultados)
    total_valor = sum(r["valor_total"] for r in resultados)
    
    return {
        "resumen_por_estado": resultados,
        "totales": {
            "movimientos": total_movimientos,
            "valor": total_valor
        },
        "fecha_consulta": datetime.datetime.utcnow().isoformat()
    }

@router.get("/referencias-usadas")
def obtener_referencias_usadas():
    """Obtiene listado de referencias ya conciliadas"""
    
    client = bigquery.Client()
    
    query = """
    SELECT 
        referencia_pago_asociada,    -- ✅ CAMPO CORRECTO
        estado_conciliacion,
        conciliado_en,               -- ✅ CAMPO CORRECTO
        conciliado_por,              -- ✅ CAMPO CORRECTO
        valor_banco,
        observaciones
    FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
    WHERE referencia_pago_asociada IS NOT NULL  -- ✅ CAMPO CORRECTO
    ORDER BY conciliado_en DESC      -- ✅ CAMPO CORRECTO
    LIMIT 100
    """
    
    resultados = [dict(row) for row in client.query(query).result()]
    
    return {
        "referencias_usadas": resultados,
        "total": len(resultados),
        "fecha_consulta": datetime.datetime.utcnow().isoformat()
    }

@router.post("/liberar-referencia")
def liberar_referencia(data: dict):
    """Libera una referencia para que pueda ser reutilizada"""
    id_banco = data.get("id_banco")
    
    if not id_banco:
        raise HTTPException(status_code=400, detail="ID del banco requerido")
    
    client = bigquery.Client()
    
    query = """
    UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
    SET estado_conciliacion = 'pendiente',
        match_manual = FALSE,
        confianza_match = 0,
        observaciones = 'Referencia liberada para re-conciliación',
        referencia_pago_asociada = NULL,    -- ✅ CAMPO CORRECTO
        conciliado_en = NULL,               -- ✅ CAMPO CORRECTO
        conciliado_por = NULL               -- ✅ CAMPO CORRECTO
    WHERE id = @id_banco
    """
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("id_banco", "STRING", id_banco)
        ]
    )
    
    try:
        client.query(query, job_config=job_config).result()
        return {"mensaje": "Referencia liberada exitosamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# ========== ENDPOINT DE REPORTE DETALLADO ==========

@router.get("/reporte-conciliacion/{fecha}")
def generar_reporte_conciliacion(fecha: str):
    """Genera reporte detallado de conciliación para una fecha específica"""
    
    client = bigquery.Client()
    
    query = """
    WITH movimientos_fecha AS (
        SELECT *
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE DATE(fecha) = @fecha
    ),
    pagos_fecha AS (
        SELECT *
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE DATE(fecha_pago) = @fecha
        AND estado IN ('pagado', 'aprobado')
    )
    SELECT 
        'movimientos_banco' as tipo,
        COUNT(*) as cantidad,
        SUM(valor_banco) as valor_total
    FROM movimientos_fecha
    
    UNION ALL
    
    SELECT 
        'pagos_conductores' as tipo,
        COUNT(*) as cantidad,
        SUM(valor_total_consignacion) as valor_total
    FROM pagos_fecha
    
    UNION ALL
    
    SELECT 
        'conciliados' as tipo,
        COUNT(*) as cantidad,
        SUM(valor_banco) as valor_total
    FROM movimientos_fecha
    WHERE estado_conciliacion IN ('conciliado_exacto', 'conciliado_aproximado', 'conciliado_manual')
    
    UNION ALL
    
    SELECT 
        'pendientes' as tipo,
        COUNT(*) as cantidad,
        SUM(valor_banco) as valor_total
    FROM movimientos_fecha
    WHERE estado_conciliacion = 'pendiente'
    """
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("fecha", "DATE", fecha)
        ]
    )
    
    try:
        resultados = [dict(row) for row in client.query(query, job_config=job_config).result()]
        
        reporte = {
            "fecha": fecha,
            "estadisticas": {row["tipo"]: {"cantidad": row["cantidad"], "valor": row["valor_total"]} for row in resultados},
            "fecha_generacion": datetime.datetime.utcnow().isoformat()
        }
        
        # Calcular porcentajes de conciliación
        movimientos = reporte["estadisticas"].get("movimientos_banco", {}).get("cantidad", 0)
        conciliados = reporte["estadisticas"].get("conciliados", {}).get("cantidad", 0)
        
        if movimientos > 0:
            reporte["porcentaje_conciliacion"] = round((conciliados / movimientos) * 100, 2)
        else:
            reporte["porcentaje_conciliacion"] = 0
        
        return reporte
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando reporte: {str(e)}")


@router.get("/estado-referencias")
def obtener_estado_referencias():
    """Muestra el estado actual de referencias y matches disponibles"""
    
    client = bigquery.Client()
    
    query_analisis = """
    WITH movimientos_pendientes AS (
        SELECT fecha, valor_banco, COUNT(*) as cantidad_movimientos
        FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE estado_conciliacion = 'pendiente'
        GROUP BY fecha, valor_banco
        ORDER BY fecha DESC, valor_banco DESC
    ),
    pagos_disponibles AS (
        SELECT fecha_pago, valor_total_consignacion, COUNT(*) as cantidad_pagos
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE estado IN ('pagado', 'aprobado')
        AND valor_total_consignacion IS NOT NULL  
        AND valor_total_consignacion > 0
        GROUP BY fecha_pago, valor_total_consignacion
        ORDER BY fecha_pago DESC, valor_total_consignacion DESC
    )
    SELECT 
        'movimientos_pendientes' as tipo,
        fecha as fecha_dato,
        valor_banco as valor,
        cantidad_movimientos as cantidad
    FROM movimientos_pendientes
    
    UNION ALL
    
    SELECT 
        'pagos_disponibles' as tipo,
        fecha_pago as fecha_dato,
        valor_total_consignacion as valor,
        cantidad_pagos as cantidad
    FROM pagos_disponibles
    
    ORDER BY fecha_dato DESC, valor DESC
    """
    
    resultados = [dict(row) for row in client.query(query_analisis).result()]
    
    # Organizar por tipo
    movimientos = [r for r in resultados if r['tipo'] == 'movimientos_pendientes']
    pagos = [r for r in resultados if r['tipo'] == 'pagos_disponibles']
    
    return {
        "movimientos_pendientes": movimientos,
        "pagos_disponibles": pagos,
        "resumen": {
            "total_movimientos_pendientes": sum(m['cantidad'] for m in movimientos),
            "total_pagos_disponibles": sum(p['cantidad'] for p in pagos)
        },
        "fecha_consulta": datetime.datetime.utcnow().isoformat()
    }