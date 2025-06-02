from fastapi import APIRouter, UploadFile, File, HTTPException
from google.cloud import bigquery
import csv
import io
import datetime
from typing import List, Dict, Optional
from pydantic import BaseModel
from decimal import Decimal

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
        
        # Crear ID único basado en los datos
        self.id = f"BANCO_{self.fecha_raw}_{int(self.valor)}_{abs(hash(fila_csv)) % 10000}"

@router.post("/cargar-banco-excel")
async def cargar_archivo_banco(file: UploadFile = File(...)):
    """Cargar archivo CSV/Excel del banco"""
    
    if not (file.filename.endswith((".csv", ".CSV"))):
        raise HTTPException(status_code=400, detail="El archivo debe ser CSV")

    # VALIDAR TAMAÑO DEL ARCHIVO
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413, 
            detail=f"Archivo demasiado grande. Máximo permitido: {MAX_FILE_SIZE // (1024*1024)}MB"
        )
    
    # MEJORAR MANEJO DE ENCODING
    try:
        # Intentar UTF-8 primero, luego latin-1 para archivos de bancos
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            decoded = content.decode("latin-1")
        except UnicodeDecodeError:
            try:
                decoded = content.decode("cp1252")  # Windows encoding común en bancos
            except UnicodeDecodeError:
                raise HTTPException(
                    status_code=400, 
                    detail="No se pudo decodificar el archivo. Verifique la codificación."
                )
    
    lineas = decoded.strip().split('\n')
    registros = []
    errores = []
    
    for i, linea in enumerate(lineas):
        linea = linea.strip()
        if not linea or len(linea) < 10:  # Línea vacía o muy corta
            continue
            
        try:
            mov = MovimientoBanco(linea)
            
            # Solo procesar consignaciones (filtrar por descripción)
            if "CONSIGNACION" in mov.descripcion.upper():
                registros.append({
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
                    "linea_original": linea
                })
        except Exception as e:
            errores.append(f"Línea {i+1}: {str(e)}")
            continue

    if not registros:
        error_msg = "No se encontraron consignaciones válidas."
        if errores:
            error_msg += f" Errores encontrados: {'; '.join(errores[:5])}"
        raise HTTPException(status_code=400, detail=error_msg)

    # MEJORAR MANEJO DE ERRORES DE BIGQUERY
    client = bigquery.Client()
    table_id = "datos-clientes-441216.Conciliaciones.banco_movimientos"
    
    try:
        # Usar consulta SQL para insertar (más confiable que insert_rows_json)
        valores_sql = []
        for reg in registros:
            # ESCAPAR COMILLAS CORRECTAMENTE
            descripcion_escaped = reg['descripcion'].replace("'", "''").replace('"', '""')
            linea_escaped = reg['linea_original'].replace("'", "''").replace('"', '""')
            
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
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error insertando en BigQuery: {str(e)}")

    resultado = {
        "mensaje": "Archivo del banco procesado correctamente",
        "total_lineas": len(lineas),
        "consignaciones_procesadas": len(registros),
        "errores_encontrados": len(errores),
        "fecha_procesamiento": datetime.datetime.utcnow().isoformat()
    }
    
    if errores and len(errores) <= 10:  # Solo mostrar primeros 10 errores
        resultado["detalle_errores"] = errores
    
    return resultado

@router.get("/conciliacion-automatica")
def ejecutar_conciliacion_automatica():
    """Ejecuta el proceso de conciliación automática inteligente"""
    
    client = bigquery.Client()
    
    # 1. Obtener movimientos del banco pendientes de conciliar
    query_banco = """
        SELECT * FROM `datos-clientes-441216.Conciliaciones.banco_movimientos`
        WHERE estado_conciliacion = 'pendiente'
        ORDER BY fecha DESC, valor_banco DESC
        LIMIT 1000
    """
    
    # 2. Obtener pagos de conductores agrupados
    query_pagos = """
        SELECT 
            referencia_pago,
            fecha_pago,
            SUM(valor) as valor_total,
            COUNT(*) as num_guias,
            MAX(tipo) as tipo_pago,
            MAX(entidad) as entidad,
            STRING_AGG(DISTINCT COALESCE(tracking, referencia), ', ' LIMIT 10) as trackings,
            MAX(estado) as estado,
            MAX(correo) as correo_conductor
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE estado IN ('pagado', 'aprobado')
          AND fecha_pago >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        GROUP BY referencia_pago, fecha_pago
        ORDER BY fecha_pago DESC
    """
    
    try:
        movimientos_banco = [dict(row) for row in client.query(query_banco).result()]
        pagos_conductores = [dict(row) for row in client.query(query_pagos).result()]
    except Exception as e:
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
    
    for mov_banco in movimientos_banco:
        resultado_match = encontrar_mejor_match(mov_banco, pagos_conductores)
        resultados_conciliacion.append(resultado_match)
        estadisticas[resultado_match["estado_match"]] += 1
    
    # Actualizar estado de conciliación en BigQuery para matches exactos
    actualizar_estados_conciliacion(client, resultados_conciliacion)
    
    return {
        "resumen": {
            "total_movimientos_banco": len(movimientos_banco),
            "total_pagos_conductores": len(pagos_conductores),
            **estadisticas
        },
        "resultados": resultados_conciliacion,
        "fecha_conciliacion": datetime.datetime.utcnow().isoformat()
    }

def encontrar_mejor_match(mov_banco: Dict, pagos_conductores: List[Dict]) -> Dict:
    """Encuentra el mejor match usando algoritmo inteligente"""
    
    fecha_banco = datetime.datetime.fromisoformat(mov_banco["fecha"]).date()
    valor_banco = float(mov_banco["valor_banco"])
    
    # Buscar matches con diferentes criterios
    matches_exactos = []
    matches_aproximados = []
    matches_con_diferencias = []
    
    for pago in pagos_conductores:
        try:
            fecha_pago = datetime.datetime.fromisoformat(pago["fecha_pago"]).date()
            valor_pago = float(pago["valor_total"])
            
            diferencia_dias = abs((fecha_banco - fecha_pago).days)
            diferencia_valor = abs(valor_banco - valor_pago)
            diferencia_porcentual = (diferencia_valor / valor_banco * 100) if valor_banco > 0 else 100
            
            match_info = {
                "pago": pago,
                "diferencia_dias": diferencia_dias,
                "diferencia_valor": diferencia_valor,
                "diferencia_porcentual": diferencia_porcentual,
                "score": 0
            }
            
            # Criterio 1: Match exacto (mismo día, mismo valor)
            if diferencia_dias == 0 and diferencia_valor == 0:
                match_info["score"] = 100
                matches_exactos.append(match_info)
            
            # Criterio 2: Match por valor exacto, fecha cercana (±3 días)
            elif diferencia_valor == 0 and diferencia_dias <= 3:
                match_info["score"] = 90 - (diferencia_dias * 5)
                matches_aproximados.append(match_info)
            
            # Criterio 3: Match por fecha exacta, diferencia de valor pequeña (<5%)
            elif diferencia_dias == 0 and diferencia_porcentual < 5:
                match_info["score"] = 85 - diferencia_porcentual
                matches_aproximados.append(match_info)
            
            # Criterio 4: Diferencias menores (fecha ±2 días, valor ±10%)
            elif diferencia_dias <= 2 and diferencia_porcentual < 10:
                match_info["score"] = 70 - (diferencia_dias * 5) - diferencia_porcentual
                matches_con_diferencias.append(match_info)
            
            # Criterio 5: Diferencias moderadas (fecha ±5 días, valor ±20%)
            elif diferencia_dias <= 5 and diferencia_porcentual < 20:
                match_info["score"] = 50 - (diferencia_dias * 2) - diferencia_porcentual
                matches_con_diferencias.append(match_info)
                
        except Exception as e:
            continue
    
    # Determinar el mejor resultado
    if matches_exactos:
        if len(matches_exactos) == 1:
            match = matches_exactos[0]
            return crear_resultado_match(mov_banco, match, "conciliado_exacto", match["score"])
        else:
            # Múltiples matches exactos - requiere revisión manual
            return crear_resultado_multiple_match(mov_banco, matches_exactos, "multiple_match")
    
    elif matches_aproximados:
        best_match = max(matches_aproximados, key=lambda x: x["score"])
        if len([m for m in matches_aproximados if m["score"] == best_match["score"]]) == 1:
            return crear_resultado_match(mov_banco, best_match, "conciliado_aproximado", best_match["score"])
        else:
            return crear_resultado_multiple_match(mov_banco, matches_aproximados, "multiple_match")
    
    elif matches_con_diferencias:
        best_match = max(matches_con_diferencias, key=lambda x: x["score"])
        estado = "diferencia_valor" if best_match["diferencia_valor"] > 0 else "diferencia_fecha"
        return crear_resultado_match(mov_banco, best_match, estado, best_match["score"])
    
    else:
        return crear_resultado_sin_match(mov_banco)

def crear_resultado_match(mov_banco: Dict, match_info: Dict, estado: str, confianza: float) -> Dict:
    """Crea resultado de match exitoso"""
    pago = match_info["pago"]
    
    return {
        "id_banco": mov_banco["id"],
        "fecha_banco": mov_banco["fecha"],
        "valor_banco": mov_banco["valor_banco"],
        "descripcion_banco": mov_banco["descripcion"],
        "estado_match": estado,
        "confianza": round(confianza, 1),
        "referencia_pago": pago["referencia_pago"],
        "fecha_pago": pago["fecha_pago"],
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
    return {
        "id_banco": mov_banco["id"],
        "fecha_banco": mov_banco["fecha"],
        "valor_banco": mov_banco["valor_banco"],
        "descripcion_banco": mov_banco["descripcion"],
        "estado_match": estado,
        "confianza": 0,
        "num_matches_posibles": len(matches),
        "matches_posibles": [
            {
                "referencia_pago": m["pago"]["referencia_pago"],
                "fecha_pago": m["pago"]["fecha_pago"],
                "valor_pago": m["pago"]["valor_total"],
                "score": m["score"]
            } for m in matches[:5]  # Solo los primeros 5
        ],
        "observaciones": f"Se encontraron {len(matches)} posibles matches. Requiere revisión manual."
    }

def crear_resultado_sin_match(mov_banco: Dict) -> Dict:
    """Crea resultado cuando no hay matches"""
    return {
        "id_banco": mov_banco["id"],
        "fecha_banco": mov_banco["fecha"],
        "valor_banco": mov_banco["valor_banco"],
        "descripcion_banco": mov_banco["descripcion"],
        "estado_match": "sin_match",
        "confianza": 0,
        "observaciones": "No se encontró ningún pago de conductor que coincida con este movimiento bancario."
    }

def generar_observaciones(match_info: Dict, estado: str) -> str:
    """Genera observaciones automáticas basadas en el tipo de match"""
    obs = []
    
    if match_info["diferencia_dias"] > 0:
        obs.append(f"Diferencia de {match_info['diferencia_dias']} día(s) entre fechas")
    
    if match_info["diferencia_valor"] > 0:
        obs.append(f"Diferencia de ${match_info['diferencia_valor']:,.0f} en valores")
    
    pago = match_info["pago"]
    if pago.get("num_guias", 0) > 1:
        obs.append(f"Pago agrupa {pago['num_guias']} guías")
    
    if estado == "conciliado_exacto":
        obs.append("Match perfecto: misma fecha y mismo valor")
    elif estado == "conciliado_aproximado":
        obs.append("Match aproximado con alta confianza")
    
    return "; ".join(obs) if obs else "Match encontrado"

def actualizar_estados_conciliacion(client, resultados: List[Dict]):
    """
    VERSIÓN MEJORADA: Actualiza TANTO banco_movimientos COMO pagosconductor
    🎯 BENEFICIO: Pagos automáticamente listos para liquidar
    """
    
    ids_conciliados = []
    referencias_conciliadas = []
    
    # Recopilar IDs y referencias exitosas
    for resultado in resultados:
        if resultado["estado_match"] in ["conciliado_exacto", "conciliado_aproximado"]:
            ids_conciliados.append(resultado["id_banco"])
            if resultado.get("referencia_pago"):
                referencias_conciliadas.append(resultado["referencia_pago"])
    
    if not ids_conciliados:
        print("ℹ️  No hay movimientos para conciliar")
        return {"banco_actualizados": 0, "pagos_actualizados": 0}
    
    print(f"🔄 Conciliando {len(ids_conciliados)} movimientos bancarios y {len(referencias_conciliadas)} pagos...")
    
    # 1. Actualizar banco_movimientos (CÓDIGO EXISTENTE MEJORADO)
    banco_actualizados = 0
    try:
        for i in range(0, len(ids_conciliados), 100):
            lote = ids_conciliados[i:i+100]
            ids_str = "', '".join(lote)
            
            query_banco = f"""
            UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
            SET estado_conciliacion = 'conciliado_automatico',
                confianza_match = 90
            WHERE id IN ('{ids_str}')
            """
            
            client.query(query_banco).result()
            banco_actualizados += len(lote)
            print(f"✅ Banco: Actualizados {len(lote)} movimientos (total: {banco_actualizados})")
            
    except Exception as e:
        print(f"❌ Error actualizando banco_movimientos: {e}")
    
    # 2. 🔥 NUEVO: Actualizar pagosconductor (CONECTAR EL FLUJO)
    pagos_actualizados = 0
    try:
        if referencias_conciliadas:
            for i in range(0, len(referencias_conciliadas), 100):
                lote_refs = referencias_conciliadas[i:i+100]
                refs_str = "', '".join(lote_refs)
                
                # ✅ ESTA ES LA CONEXIÓN CLAVE DEL FLUJO
                query_pagos = f"""
                UPDATE `datos-clientes-441216.Conciliaciones.pagosconductor`
                SET 
                    conciliado = TRUE,
                    fecha_conciliacion = CURRENT_DATE(),
                    estado_conciliacion = 'conciliado_automatico'
                WHERE referencia_pago IN ('{refs_str}')
                AND estado = 'aprobado'  -- Solo pagos ya aprobados
                AND (conciliado IS NULL OR conciliado = FALSE)  -- Evitar duplicados
                """
                
                result = client.query(query_pagos).result()
                pagos_actualizados += len(lote_refs)
                print(f"✅ Pagos: Marcados {len(lote_refs)} como conciliados (total: {pagos_actualizados})")
                
    except Exception as e:
        print(f"❌ Error actualizando pagosconductor: {e}")
    
    # 3. 🔥 NUEVO: Log de auditoría automática
    try:
        audit_id = f"CONCILIACION_AUTO_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        audit_query = """
        INSERT INTO `datos-clientes-441216.Conciliaciones.auditoria_conciliacion` (
            id, fecha_accion, tipo_accion, usuario, observaciones
        ) VALUES (
            @audit_id,
            CURRENT_TIMESTAMP(),
            'conciliacion_automatica_completa',
            'sistema_automatico',
            @observaciones
        )
        """
        
        observaciones = f"Conciliación automática: {banco_actualizados} mov. banco, {pagos_actualizados} pagos conductor"
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("audit_id", "STRING", audit_id),
                bigquery.ScalarQueryParameter("observaciones", "STRING", observaciones)
            ]
        )
        
        client.query(audit_query, job_config=job_config).result()
        print(f"📝 Auditoría registrada: {audit_id}")
        
    except Exception as e:
        print(f"⚠️  Error en auditoría: {e}")
    
    # Resultado final
    resultado_final = {
        "banco_actualizados": banco_actualizados,
        "pagos_actualizados": pagos_actualizados,
        "mensaje": f"🎉 FLUJO CONECTADO: {banco_actualizados} banco + {pagos_actualizados} pagos listos"
    }
    
    print(f"\n🎯 RESULTADO: {resultado_final['mensaje']}")
    return resultado_final

# 4. 🔥 NUEVO: Función para validar integridad del flujo
def validar_integridad_flujo(client):
    """Valida que el flujo de estados sea consistente"""
    
    query_validacion = """
    WITH inconsistencias AS (
        -- Pagos aprobados pero no conciliados después de 7 días
        SELECT 
            'pagos_aprobados_sin_conciliar' as tipo_inconsistencia,
            COUNT(*) as cantidad,
            STRING_AGG(referencia_pago, ', ' LIMIT 10) as ejemplos
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE estado = 'aprobado' 
        AND (conciliado IS NULL OR conciliado = FALSE)
        AND fecha_pago <= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        
        UNION ALL
        
        -- Guías en estado inconsistente
        SELECT 
            'guias_estado_inconsistente' as tipo_inconsistencia,
            COUNT(*) as cantidad,
            STRING_AGG(tracking_number, ', ' LIMIT 10) as ejemplos
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1` cod
        LEFT JOIN `datos-clientes-441216.Conciliaciones.pagosconductor` pc
        ON cod.tracking_number = pc.tracking
        WHERE cod.Status_Big = 'liberado' 
        AND (pc.conciliado IS NULL OR pc.conciliado = FALSE)
    )
    SELECT * FROM inconsistencias WHERE cantidad > 0
    """
    
    try:
        resultados = client.query(query_validacion).result()
        inconsistencias = [dict(row) for row in resultados]
        
        if inconsistencias:
            print("⚠️ INCONSISTENCIAS DETECTADAS:")
            for inc in inconsistencias:
                print(f"  - {inc['tipo_inconsistencia']}: {inc['cantidad']} casos")
                print(f"    Ejemplos: {inc['ejemplos']}")
        else:
            print("✅ No se detectaron inconsistencias en el flujo")
            
        return inconsistencias
        
    except Exception as e:
        print(f"❌ Error validando integridad: {e}")
        return []

@router.post("/marcar-conciliado-manual")
def marcar_conciliado_manual(data: dict):
    """Marca un movimiento como conciliado manualmente"""
    id_banco = data.get("id_banco")
    referencia_pago = data.get("referencia_pago", "")
    observaciones = data.get("observaciones", "Conciliado manualmente")
    
    if not id_banco:
        raise HTTPException(status_code=400, detail="ID del banco requerido")
    
    client = bigquery.Client()
    
    query = """
    UPDATE `datos-clientes-441216.Conciliaciones.banco_movimientos`
    SET estado_conciliacion = 'conciliado_manual',
        match_manual = TRUE,
        confianza_match = 100,
        observaciones = @observaciones
    WHERE id = @id_banco
    """
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("id_banco", "STRING", id_banco),
            bigquery.ScalarQueryParameter("observaciones", "STRING", observaciones)
        ]
    )
    
    try:
        client.query(query, job_config=job_config).result()
        return {"mensaje": "Movimiento marcado como conciliado manual"}
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