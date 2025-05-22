from fastapi import APIRouter, Form, UploadFile, File, HTTPException, Body, Query, Request
from fastapi.responses import JSONResponse
from google.cloud import bigquery
from typing import Optional
from datetime import datetime
from uuid import uuid4
import pandas as pd
import os
import json
import traceback

router = APIRouter(prefix="/pagos", tags=["Pagos"])

@router.post("/registrar-conductor")
async def registrar_pago_conductor(
    correo: str = Form(...),
    valor_pago_str: str = Form(...),
    fecha_pago: str = Form(...),
    hora_pago: str = Form(...),
    tipo: str = Form(...),
    entidad: str = Form(...),
    referencia: str = Form(...),
    comprobante: UploadFile = File(...),
    guias: str = Form(...)
):
    client = bigquery.Client()

    # Validar conversión segura de valor
    try:
        valor_pago = float(valor_pago_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="El valor del pago no es válido.")

    # Validación 1: por referencia_pago única
    verificar = client.query("""
        SELECT COUNT(*) as total
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE referencia_pago = @ref
    """, job_config=bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("ref", "STRING", referencia)
        ]
    )).result()

    if next(verificar)["total"] > 0:
        raise HTTPException(
            status_code=400,
            detail="⚠️ Ya existe un pago registrado con esa referencia."
        )

    # Validación 2: mismo usuario + fecha/hora/valor
    verificar_duplicado = client.query("""
        SELECT COUNT(*) as total
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE correo = @correo
          AND fecha_pago = @fecha
          AND hora_pago = @hora
          AND valor_total_consignacion = @valor
    """, job_config=bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("correo", "STRING", correo),
            bigquery.ScalarQueryParameter("fecha", "DATE", fecha_pago),
            bigquery.ScalarQueryParameter("hora", "STRING", hora_pago),
            bigquery.ScalarQueryParameter("valor", "FLOAT64", valor_pago)
        ]
    )).result()

    if next(verificar_duplicado)["total"] > 0:
        raise HTTPException(
            status_code=400,
            detail="⚠️ Este pago ya fue registrado previamente (fecha, hora y valor idénticos)."
        )

    # Leer y validar guías asociadas
    try:
        lista_guias = json.loads(guias)
        print(f"🔍 Guías recibidas: {len(lista_guias)}")
        for i, guia in enumerate(lista_guias):
            print(f"🔍 Guía {i+1}: {guia}")
            if 'referencia' in guia:
                print(f"   - Referencia: '{guia['referencia']}' (length: {len(str(guia['referencia']))})")
    except Exception as e:
        print(f"❌ Error parsing guías: {e}")
        raise HTTPException(status_code=400, detail="Error al leer las guías")

    if not lista_guias:
        raise HTTPException(status_code=400, detail="Debe asociar al menos una guía")

    # Obtener información de clientes desde COD_Pendiente
    referencias_guias = [str(guia["referencia"]) for guia in lista_guias]
    refs_str = "', '".join(referencias_guias)
    
    query_clientes = f"""
        SELECT tracking_number as referencia, cliente, Valor as valor
        FROM `datos-clientes-441216.Conciliaciones.COD_Pendiente`
        WHERE tracking_number IN ('{refs_str}')
    """
    
    try:
        resultado_clientes = client.query(query_clientes).result()
        clientes_data = {row["referencia"]: {"cliente": row["cliente"], "valor": row["valor"]} for row in resultado_clientes}
        print(f"🔍 Datos de clientes obtenidos: {len(clientes_data)} registros")
    except Exception as e:
        print(f"❌ Error consultando clientes: {e}")
        clientes_data = {}

    # Guardar imagen del comprobante
    nombre_archivo = f"{uuid4()}_{comprobante.filename}"
    ruta_local = os.path.join("comprobantes", nombre_archivo)
    os.makedirs("comprobantes", exist_ok=True)

    with open(ruta_local, "wb") as f:
        f.write(await comprobante.read())

    comprobante_url = f"https://api.x-cargo.co/static/{nombre_archivo}"
    creado_en = datetime.utcnow()

    # Preparar filas para insertar en pagosconductor
    filas = []
    for i, guia in enumerate(lista_guias):
        print(f"🔧 Procesando guía {i+1}: {guia}")
        
        # Validar referencia
        referencia_value = str(guia["referencia"]).strip()
        print(f"   - Referencia procesada: '{referencia_value}' (length: {len(referencia_value)})")

        # Obtener cliente y valor desde COD_Pendiente
        if referencia_value in clientes_data:
            cliente_clean = clientes_data[referencia_value]["cliente"] or "Sin Cliente"
            valor_individual = float(clientes_data[referencia_value]["valor"]) if clientes_data[referencia_value]["valor"] else float(guia.get("valor", 0))
            print(f"   - Cliente desde COD_Pendiente: '{cliente_clean}'")
            print(f"   - Valor individual desde COD_Pendiente: {valor_individual}")
        else:
            cliente_clean = "Sin Cliente"
            valor_individual = float(guia.get("valor", 0))
            print(f"   - Cliente por defecto: '{cliente_clean}' (no encontrado en COD_Pendiente)")
        
        # Validar y limpiar tracking
        tracking_value = guia.get("tracking", "")
        if tracking_value and str(tracking_value).lower() not in ["null", "none", "", "undefined"]:
            tracking_clean = str(tracking_value).strip()
            print(f"   - Tracking limpio: '{tracking_clean}' (length: {len(tracking_clean)})")
        else:
            # Si no hay tracking, usar la referencia como tracking
            tracking_clean = referencia_value
            print(f"   - Tracking usando referencia: '{tracking_clean}'")

        fila = {
            "referencia": referencia_value,
            "valor": valor_individual,  # Valor individual del tracking
            "fecha": fecha_pago,
            "entidad": entidad,
            "estado": "pagado",
            "tipo": tipo,
            "comprobante": comprobante_url,
            "novedades": "",
            "creado_en": creado_en,
            "creado_por": correo,
            "modificado_en": None,
            "modificado_por": correo,
            "hora_pago": hora_pago,
            "correo": correo,
            "fecha_pago": fecha_pago,
            "id_string": None,
            "referencia_pago": referencia,  # Referencia de la consignación
            "valor_total_consignacion": valor_pago,  # Valor total de la consignación
            "tracking": tracking_clean,
            "cliente": cliente_clean  # Cliente desde COD_Pendiente
        }
        
        print(f"   ✅ Fila preparada: {fila}")
        filas.append(fila)

    try:
        tabla = "datos-clientes-441216.Conciliaciones.pagosconductor"
        
        print(f"🚀 Insertando {len(filas)} filas usando consulta SQL directa...")
        
        # Preparar los valores para la consulta SQL
        valores_sql = []
        for fila in filas:
            # Escapar strings y manejar valores None
            def escape_value(value, field_type='STRING'):
                if value is None:
                    return 'NULL'
                elif field_type == 'STRING':
                    # Escapar comillas simples duplicándolas
                    escaped = str(value).replace("'", "''")
                    return f"'{escaped}'"
                elif field_type in ['NUMERIC', 'FLOAT64']:
                    return str(value)
                elif field_type == 'DATE':
                    return f"'{value}'"
                elif field_type == 'TIMESTAMP':
                    if value is None:
                        return 'NULL'
                    return f"TIMESTAMP('{value}')"
                else:
                    return f"'{str(value)}'"
            
            valores_fila = f"""(
                {escape_value(fila['referencia'])},
                {escape_value(fila['valor'], 'NUMERIC')},
                {escape_value(fila['fecha'], 'DATE')},
                {escape_value(fila['entidad'])},
                {escape_value(fila['estado'])},
                {escape_value(fila['tipo'])},
                {escape_value(fila['comprobante'])},
                {escape_value(fila['novedades'])},
                {escape_value(fila['creado_en'], 'TIMESTAMP')},
                {escape_value(fila['creado_por'])},
                {escape_value(fila['modificado_en'], 'TIMESTAMP')},
                {escape_value(fila['modificado_por'])},
                {escape_value(fila['hora_pago'])},
                {escape_value(fila['correo'])},
                {escape_value(fila['fecha_pago'], 'DATE')},
                {escape_value(fila['id_string'])},
                {escape_value(fila['referencia_pago'])},
                {escape_value(fila['valor_total_consignacion'], 'NUMERIC')},
                {escape_value(fila['tracking'])},
                {escape_value(fila['cliente'])}
            )"""
            valores_sql.append(valores_fila)
        
        # Construir la consulta INSERT
        query = f"""
        INSERT INTO `{tabla}` (
            referencia, valor, fecha, entidad, estado, tipo, comprobante, 
            novedades, creado_en, creado_por, modificado_en, modificado_por,
            hora_pago, correo, fecha_pago, id_string, referencia_pago, 
            valor_total_consignacion, tracking, cliente
        ) VALUES {', '.join(valores_sql)}
        """
        
        print("🔍 Consulta SQL generada:")
        print(query[:500] + "..." if len(query) > 500 else query)
        
        # Ejecutar la consulta
        job = client.query(query)
        job.result()  # Esperar a que termine
        
        print("✅ Datos insertados correctamente usando SQL directo")
        
        # Actualizar StatusP a "pagado" en COD_Pendiente
        try:
            update_query = f"""
            UPDATE `datos-clientes-441216.Conciliaciones.COD_Pendiente`
            SET StatusP = 'pagado'
            WHERE tracking_number IN ('{refs_str}')
            """
            client.query(update_query).result()
            print("✅ StatusP actualizado a 'pagado' en COD_Pendiente")
        except Exception as e:
            print(f"⚠️ Error actualizando StatusP: {e}")
        
        return {"mensaje": "✅ Pago registrado correctamente", "valor_total": valor_pago}

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"❌ Error detallado: {str(e)}")
        print(f"❌ Tipo de error: {type(e)}")
        raise HTTPException(status_code=500, detail=f"Error al registrar el pago: {str(e)}")


@router.post("/aprobar-pago")
def aprobar_pago(data: dict = Body(...)):
    referencia_pago = data.get("referencia_pago")
    modificado_por = data.get("modificado_por")

    if not referencia_pago or not modificado_por:
        raise HTTPException(status_code=400, detail="Faltan datos obligatorios.")

    client = bigquery.Client()

    # 1. Actualizar estado del pago a aprobado
    try:
        client.query("""
            UPDATE `datos-clientes-441216.Conciliaciones.pagosconductor`
            SET estado = 'aprobado',
                modificado_por = @modificado_por
            WHERE referencia_pago = @referencia
        """, job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("modificado_por", "STRING", modificado_por),
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago)
            ]
        )).result()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar estado del pago: {e}")

    # 2. Obtener referencias de tracking asociadas
    try:
        resultado = client.query("""
            SELECT tracking
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            WHERE referencia_pago = @referencia
        """, job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago)
            ]
        )).result()

        referencias = [r["tracking"] for r in resultado if r["tracking"]]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al consultar guías asociadas: {e}")

    if not referencias:
        raise HTTPException(status_code=404, detail="No se encontraron guías asociadas al pago.")

    # 3. Actualizar guías a "liberado" en COD_Pendiente
    try:
        refs_str = "', '".join(referencias)
        client.query(f"""
            UPDATE `datos-clientes-441216.Conciliaciones.COD_Pendiente`
            SET StatusP = 'liberado'
            WHERE tracking_number IN ('{refs_str}')
        """).result()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar estado de guías: {e}")

    return {"mensaje": "✅ Pago aprobado y guías liberadas correctamente"}

@router.post("/rechazar-pago")
def rechazar_pago(data: dict = Body(...)):
    referencia_pago = data.get("referencia_pago")
    novedad = data.get("novedad", "").strip()
    modificado_por = data.get("modificado_por")

    if not referencia_pago or not novedad or not modificado_por:
        raise HTTPException(status_code=400, detail="Faltan datos obligatorios.")

    client = bigquery.Client()

    # 1. Marcar el pago como rechazado
    try:
        client.query("""
            UPDATE `datos-clientes-441216.Conciliaciones.pagosconductor`
            SET estado = 'rechazado',
                novedades = @novedad,
                modificado_por = @modificado_por
            WHERE referencia_pago = @referencia
        """, job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("novedad", "STRING", novedad),
                bigquery.ScalarQueryParameter("modificado_por", "STRING", modificado_por),
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago)
            ]
        )).result()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al rechazar el pago: {e}")

    # 2. Consultar guías asociadas
    try:
        resultado = client.query("""
            SELECT tracking
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            WHERE referencia_pago = @referencia
        """, job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago)
            ]
        )).result()

        referencias = [r["tracking"] for r in resultado if r["tracking"]]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al consultar guías asociadas: {e}")

    if not referencias:
        raise HTTPException(status_code=404, detail="No se encontraron guías para el pago.")

    # 3. Volver las guías a estado "pendiente"
    try:
        refs_str = "', '".join(referencias)
        client.query(f"""
            UPDATE `datos-clientes-441216.Conciliaciones.COD_Pendiente`
            SET StatusP = 'pendiente'
            WHERE tracking_number IN ('{refs_str}')
        """).result()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar guías a 'pendiente': {e}")

    return {"mensaje": "❌ Pago rechazado correctamente. Guías actualizadas."}

@router.get("/historial")
def historial_pagos(
    estado: Optional[str] = Query(None),
    desde: Optional[str] = Query(None),
    hasta: Optional[str] = Query(None),
    referencia: Optional[str] = Query(None)
):
    client = bigquery.Client()

    condiciones = []
    parametros = []

    if estado:
        condiciones.append("estado = @estado")
        parametros.append(bigquery.ScalarQueryParameter("estado", "STRING", estado))

    if desde:
        condiciones.append("fecha_pago >= @desde")
        parametros.append(bigquery.ScalarQueryParameter("desde", "DATE", desde))

    if hasta:
        condiciones.append("fecha_pago <= @hasta")
        parametros.append(bigquery.ScalarQueryParameter("hasta", "DATE", hasta))

    if referencia:
        condiciones.append("referencia_pago LIKE @referencia")
        parametros.append(bigquery.ScalarQueryParameter("referencia", "STRING", f"%{referencia}%"))

    where_clause = "WHERE " + " AND ".join(condiciones) if condiciones else ""

    query = f"""
        SELECT
            referencia_pago,
            SUM(valor) AS valor,
            MAX(fecha_pago) AS fecha,
            MAX(entidad) AS entidad,
            MAX(estado) AS estado,
            MAX(tipo) AS tipo,
            MAX(comprobante) AS imagen,
            MAX(novedades) AS novedades
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        {where_clause}
        GROUP BY referencia_pago
        ORDER BY fecha DESC
    """

    job_config = bigquery.QueryJobConfig(query_parameters=parametros)
    resultados = client.query(query, job_config=job_config).result()

    return [dict(row) for row in resultados]

@router.get("/health")
def health_check():
    """Endpoint para verificar que el servidor está funcionando"""
    try:
        client = bigquery.Client()
        # Query simple para verificar conectividad
        test_query = "SELECT 1 as test"
        result = client.query(test_query).result()
        
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "bigquery": "connected"
        }
    except Exception as e:
        return {
            "status": "error",
            "timestamp": datetime.utcnow().isoformat(),
            "error": str(e)
        }

@router.get("/test-table")
def test_table_access():
    """Endpoint para verificar acceso a la tabla pagosconductor"""
    try:
        client = bigquery.Client()
        
        # Verificar si la tabla existe
        query = """
        SELECT COUNT(*) as total
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        LIMIT 1
        """
        
        result = client.query(query).result()
        total = next(result)["total"]
        
        return {
            "status": "success",
            "table_exists": True,
            "total_records": total,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "table_exists": False,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }
def obtener_detalles_pago(referencia_pago: str):
    """Obtiene los trackings asociados a un pago específico"""
    client = bigquery.Client()
    
    try:
        query = """
            SELECT tracking, referencia, valor
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            WHERE referencia_pago = @referencia_pago
            ORDER BY tracking
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia_pago", "STRING", referencia_pago)
            ]
        )
        
        resultado = client.query(query, job_config=job_config).result()
        trackings = []
        
        for row in resultado:
            tracking = row["tracking"] if row["tracking"] else row["referencia"]
            trackings.append({
                "tracking": tracking,
                "referencia": row["referencia"],
                "valor": float(row["valor"])
            })
        
        return trackings
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener detalles del pago: {str(e)}")

@router.get("/pagos-conductor")
def obtener_pagos():
    client = bigquery.Client()
    
    try:
        # Primero verificar qué columnas existen en la tabla
        schema_query = """
        SELECT column_name
        FROM `datos-clientes-441216.Conciliaciones.INFORMATION_SCHEMA.COLUMNS`
        WHERE table_name = 'pagosconductor'
        """
        
        schema_result = client.query(schema_query).result()
        columnas_existentes = [row["column_name"] for row in schema_result]
        
        print(f"Columnas existentes: {columnas_existentes}")
        
        # Construir query dinámicamente basado en columnas existentes
        if "valor_total_consignacion" in columnas_existentes:
            valor_query = "COALESCE(MAX(valor_total_consignacion), SUM(valor))"
        else:
            valor_query = "SUM(valor)"
            
        if "tracking" in columnas_existentes:
            tracking_query = "STRING_AGG(DISTINCT COALESCE(tracking, referencia), ', ' ORDER BY COALESCE(tracking, referencia))"
        else:
            tracking_query = "STRING_AGG(DISTINCT referencia, ', ' ORDER BY referencia)"
        
        query = f"""
            SELECT 
                referencia_pago, 
                {valor_query} AS valor,
                MAX(fecha_pago) AS fecha, 
                MAX(COALESCE(entidad, 'Sin Entidad')) AS entidad,
                MAX(COALESCE(estado, 'pendiente')) AS estado, 
                MAX(COALESCE(tipo, 'Sin Tipo')) AS tipo,
                MAX(COALESCE(comprobante, '')) AS imagen,
                MAX(COALESCE(novedades, '')) AS novedades,
                COUNT(*) as num_guias,
                {tracking_query} as trackings_preview
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            WHERE referencia_pago IS NOT NULL 
              AND referencia_pago != ''
            GROUP BY referencia_pago
            ORDER BY MAX(fecha_pago) DESC
            LIMIT 100
        """
        
        print(f"Query generado: {query}")
        
        resultados = client.query(query).result()
        
        pagos = []
        for row in resultados:
            pago = {
                "referencia_pago": row.get("referencia_pago", ""),
                "valor": float(row.get("valor", 0)) if row.get("valor") else 0.0,
                "fecha": str(row.get("fecha", "")),
                "entidad": str(row.get("entidad", "")),
                "estado": str(row.get("estado", "")),
                "tipo": str(row.get("tipo", "")),
                "imagen": str(row.get("imagen", "")),
                "novedades": str(row.get("novedades", "")),
                "num_guias": int(row.get("num_guias", 0)),
                "trackings_preview": str(row.get("trackings_preview", ""))
            }
            
            # Limitar preview de trackings a los primeros 3
            if pago["trackings_preview"]:
                trackings_list = pago["trackings_preview"].split(", ")
                if len(trackings_list) > 3:
                    pago["trackings_preview"] = ", ".join(trackings_list[:3]) + f" (+{len(trackings_list)-3} más)"
            
            pagos.append(pago)
        
        print(f"Pagos obtenidos: {len(pagos)}")
        return pagos
        
    except Exception as e:
        print(f"Error en pagos-conductor: {e}")
        import traceback
        traceback.print_exc()
        
        # Fallback - devolver datos básicos si todo falla
        return [
            {
                "referencia_pago": "ERROR_LOADING",
                "valor": 0.0,
                "fecha": "2025-01-01",
                "entidad": "Error",
                "estado": "error",
                "tipo": "Error",
                "imagen": "",
                "novedades": "Error cargando datos",
                "num_guias": 0,
                "trackings_preview": "Error"
            }
        ]