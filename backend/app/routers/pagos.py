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
          AND valor = @valor
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
            if 'tracking' in guia:
                print(f"   - Tracking: '{guia['tracking']}' (length: {len(str(guia['tracking'])) if guia['tracking'] else 0})")
    except Exception as e:
        print(f"❌ Error parsing guías: {e}")
        raise HTTPException(status_code=400, detail="Error al leer las guías")

    if not lista_guias:
        raise HTTPException(status_code=400, detail="Debe asociar al menos una guía")

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
        
        # Validar y limpiar tracking
        tracking_value = guia.get("tracking", "")
        if tracking_value and tracking_value.lower() not in ["null", "none", ""]:
            # Solo incluir si es un string válido, no un UUID malformado
            tracking_clean = str(tracking_value).strip()
            print(f"   - Tracking limpio: '{tracking_clean}' (length: {len(tracking_clean)})")
        else:
            tracking_clean = ""
            print(f"   - Tracking vacío o null")
        
        # Validar y limpiar cliente
        cliente_value = guia.get("cliente", "no_asignado")
        if cliente_value and cliente_value.lower() not in ["null", "none", ""]:
            cliente_clean = str(cliente_value).strip()
            print(f"   - Cliente limpio: '{cliente_clean}'")
        else:
            cliente_clean = "no_asignado"
            print(f"   - Cliente por defecto: '{cliente_clean}'")

        # Validar referencia - mantener como string simple
        referencia_value = str(guia["referencia"]).strip()
        print(f"   - Referencia procesada: '{referencia_value}' (length: {len(referencia_value)})")

        fila = {
            "referencia": referencia_value,
            "valor": float(guia.get("valor", valor_pago)),
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
            "id_string": None,  # Campo nullable
            "referencia_pago": referencia,
            "tracking": tracking_clean,
            "cliente": cliente_clean
        }
        
        print(f"   ✅ Fila preparada: {fila}")
        filas.append(fila)

    try:
        tabla = "datos-clientes-441216.Conciliaciones.pagosconductor"
        df = pd.DataFrame(filas)

        # Conversiones de tipos según el esquema de BigQuery
        df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce").dt.date
        df["fecha_pago"] = pd.to_datetime(df["fecha_pago"], errors="coerce").dt.date
        df["creado_en"] = pd.to_datetime(df["creado_en"], errors="coerce")
        
        # Convertir hora_pago como STRING simple
        df["hora_pago"] = df["hora_pago"].astype(str)
        df["hora_pago"] = df["hora_pago"].apply(lambda x: x if x not in ['None', 'nan', ''] else None)
        
        # Convertir valor a numérico simple (evitar Decimal por problemas con PyArrow)
        df["valor"] = pd.to_numeric(df["valor"], errors="coerce")
        
        # Forzar campos string requeridos
        required_strings = ["referencia", "entidad", "estado", "tipo", "comprobante", 
                          "novedades", "creado_por", "modificado_por"]
        for col in required_strings:
            df[col] = df[col].astype(str)
            # Asegurar que no sean None o vacíos para campos requeridos
            df[col] = df[col].replace(['None', 'nan', ''], 'N/A')
        
        # Campos string opcionales
        optional_strings = ["correo", "referencia_pago", "tracking", "cliente", "id_string"]
        for col in optional_strings:
            if col in df.columns:
                df[col] = df[col].astype(str)
                df[col] = df[col].replace(['None', 'nan', ''], None)
        
        # Agregar id_string si no existe (aunque sea nullable)
        if "id_string" not in df.columns:
            df["id_string"] = None

        print("📊 Tipos de columnas:")
        print(df.dtypes)
        print("🔍 Primeras filas:")
        print(df.head())

        if df["valor"].isnull().any():
            raise HTTPException(status_code=400, detail="Valor inválido en al menos una guía.")

        # Definir esquema exacto según BigQuery (modificado para compatibilidad)
        schema = [
            bigquery.SchemaField("referencia", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("valor", "NUMERIC", mode="REQUIRED"),
            bigquery.SchemaField("fecha", "DATE", mode="REQUIRED"),
            bigquery.SchemaField("entidad", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("estado", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("tipo", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("comprobante", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("novedades", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("creado_en", "TIMESTAMP", mode="NULLABLE"),
            bigquery.SchemaField("creado_por", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("modificado_en", "TIMESTAMP", mode="NULLABLE"),
            bigquery.SchemaField("modificado_por", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("hora_pago", "STRING", mode="NULLABLE"),  # Cambiar a STRING temporalmente
            bigquery.SchemaField("correo", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("fecha_pago", "DATE", mode="NULLABLE"),
            bigquery.SchemaField("id_string", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("referencia_pago", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("tracking", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("cliente", "STRING", mode="NULLABLE")
        ]

        # Insertar con esquema específico
        job_config = bigquery.LoadJobConfig(
            schema=schema,
            write_disposition="WRITE_APPEND",
            schema_update_options=[bigquery.SchemaUpdateOption.ALLOW_FIELD_ADDITION]
        )
        
        print("🚀 Insertando datos en BigQuery con esquema explícito...")
        client.load_table_from_dataframe(df, tabla, job_config=job_config).result()
        print("✅ Datos insertados correctamente")

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
            SELECT referencia
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            WHERE referencia_pago = @referencia
        """, job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago)
            ]
        )).result()

        referencias = [r["referencia"] for r in resultado]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al consultar guías asociadas: {e}")

    if not referencias:
        raise HTTPException(status_code=404, detail="No se encontraron guías asociadas al pago.")

    # 3. Actualizar guías a "liberado"
    try:
        client.query("""
            UPDATE `datos-clientes-441216.Conciliaciones.COD_Pendiente`
            SET estado = 'liberado'
            WHERE referencia IN UNNEST(@refs)
        """, job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ArrayQueryParameter("refs", "STRING", referencias)
            ]
        )).result()
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
            SELECT referencia
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            WHERE referencia_pago = @referencia
        """, job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("referencia", "STRING", referencia_pago)
            ]
        )).result()

        referencias = [r["referencia"] for r in resultado]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al consultar guías asociadas: {e}")

    if not referencias:
        raise HTTPException(status_code=404, detail="No se encontraron guías para el pago.")

    # 3. Volver las guías a estado "pendiente"
    try:
        client.query("""
            UPDATE `datos-clientes-441216.Conciliaciones.COD_Pendiente`
            SET estado = 'pendiente'
            WHERE referencia IN UNNEST(@refs)
        """, job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ArrayQueryParameter("refs", "STRING", referencias)
            ]
        )).result()
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

@router.get("/pagos-conductor")
def obtener_pagos():
    client = bigquery.Client()
    query = """
        SELECT referencia_pago, 
               SUM(valor) AS valor,
               MAX(fecha_pago) AS fecha, 
               MAX(entidad) AS entidad,
               MAX(estado) AS estado, 
               MAX(tipo) AS tipo,
               MAX(comprobante) AS imagen,
               MAX(novedades) AS novedades,
               MAX(referencia) AS referencia
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        GROUP BY referencia_pago
        ORDER BY fecha DESC
    """
    resultados = client.query(query).result()
    return [dict(row) for row in resultados]