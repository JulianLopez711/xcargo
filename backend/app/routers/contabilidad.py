from fastapi import APIRouter, HTTPException
from google.cloud import bigquery

router = APIRouter(prefix="/contabilidad", tags=["Contabilidad"])

@router.get("/resumen")
def obtener_resumen_contabilidad():
    client = bigquery.Client()

    query = """
        SELECT 
          cliente,
          estado,
          COUNT(*) AS guias,
          SUM(valor) AS valor,
          SUM(CASE WHEN estado = 'Pendiente' THEN valor ELSE 0 END) AS pendiente
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        GROUP BY cliente, estado
    """

    try:
        result = client.query(query).result()
        agrupado = {}

        for row in result:
            cliente = row["cliente"]
            if cliente not in agrupado:
                agrupado[cliente] = []
            agrupado[cliente].append({
                "estado": row["estado"],
                "guias": row["guias"],
                "valor": row["valor"],
                "pendiente": row["pendiente"]
            })

        resumen = [{"cliente": k, "datos": v} for k, v in agrupado.items()]
        return resumen

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
