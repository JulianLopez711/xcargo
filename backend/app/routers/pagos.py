from fastapi import APIRouter, Form, UploadFile, File, HTTPException, Body
from google.cloud import bigquery
from datetime import datetime
from uuid import uuid4
import pandas as pd
import os
import json

router = APIRouter(prefix="/pagos", tags=["Pagos"])

@router.post("/registrar-conductor")
async def registrar_pago_conductor(
    correo: str = Form(...),
    valor_pago: float = Form(...),
    fecha_pago: str = Form(...),
    hora_pago: str = Form(...),
    tipo: str = Form(...),
    entidad: str = Form(...),
    referencia: str = Form(...),
    comprobante: UploadFile = File(...),
    guias: str = Form(...)
):
    client = bigquery.Client()

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
          AND valor_pago_total = @valor
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
    except Exception:
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
    fecha_hora_registro = datetime.utcnow().isoformat()

    # Preparar filas para insertar
    filas = []
    for guia in lista_guias:
        filas.append({
            "correo": correo,
            "fecha_pago": fecha_pago,
            "hora_pago": hora_pago,
            "valor": valor_pago,
            "valor_pago_total": valor_pago,
            "entidad": entidad,
            "tipo": tipo,
            "referencia": guia["referencia"],
            "referencia_pago": referencia,
            "comprobante": comprobante_url,
            "estado": "pagado",
            "fecha_registro": fecha_hora_registro,
            "modificado_por": correo,
            "cliente": guia.get("cliente", "no_asignado")
        })

    # Insertar en pagosconductor
    try:
        tabla = "datos-clientes-441216.Conciliaciones.pagosconductor"
        df = pd.DataFrame(filas)
        df["fecha_pago"] = pd.to_datetime(df["fecha_pago"])
        df["hora_pago"] = df["hora_pago"].astype(str)
        df["valor"] = df["valor"].astype(float)
        df["valor_pago_total"] = df["valor_pago_total"].astype(float)
        df["fecha_registro"] = pd.to_datetime(df["fecha_registro"])

        client.load_table_from_dataframe(df, tabla).result()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al registrar el pago: {e}")

    # Actualizar estado de las guías a "en revisión"
    try:
        referencias_guias = [guia["referencia"] for guia in lista_guias]
        client.query(f"""
            UPDATE `datos-clientes-441216.Conciliaciones.COD_Pendiente`
            SET estado = 'en revisión'
            WHERE referencia IN UNNEST(@refs)
        """, job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ArrayQueryParameter("refs", "STRING", referencias_guias)
            ]
        )).result()
    except Exception as e:
        print("Error al actualizar estado de guías:", e)

    return {"mensaje": "✅ Pago registrado correctamente", "valor_total": valor_pago}



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
