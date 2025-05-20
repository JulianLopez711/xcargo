from fastapi import APIRouter, UploadFile, File, HTTPException
from google.cloud import bigquery
import csv
import io
import datetime
from pydantic import BaseModel


router = APIRouter(prefix="/conciliacion", tags=["Conciliacion"])

@router.post("/cargar-banco")
async def cargar_csv_banco(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un CSV")

    content = await file.read()
    decoded = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(decoded))

    registros = []
    for row in reader:
        try:
            fecha = datetime.datetime.strptime(row["fecha"], "%Y-%m-%d").date().isoformat()
            valor = float(row["valor"].replace(",", ""))
            entidad = row["entidad"].strip()
            tipo = row.get("tipo", "").strip()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error en fila: {row} - {str(e)}")

        registros.append({
            "id": f"{row['fecha']}_{row['valor']}_{row['entidad']}",
            "fecha": fecha,
            "valor_banco": valor,
            "entidad": entidad,
            "tipo": tipo,
            "cargado_en": datetime.datetime.utcnow().isoformat()
        })

    if not registros:
        raise HTTPException(status_code=400, detail="El archivo CSV no contiene datos válidos")

    client = bigquery.Client()
    table_id = "datos-clientes-441216.Conciliaciones.banco_raw"

    errors = client.insert_rows_json(table_id, registros)
    if errors:
        raise HTTPException(status_code=500, detail=str(errors))

    return {"mensaje": "Archivo cargado correctamente", "filas": len(registros)}



class ValidacionManual(BaseModel):
    id: str

@router.post("/validar-manual")
def marcar_como_conciliado_manual(payload: ValidacionManual):
    client = bigquery.Client()

    query = f"""
    UPDATE `datos-clientes-441216.Conciliaciones.banco_raw`
    SET conciliado_manual = TRUE
    WHERE id = @id
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("id", "STRING", payload.id)
        ]
    )

    try:
        client.query(query, job_config=job_config).result()
        return {"mensaje": "Registro marcado como conciliado manual."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
