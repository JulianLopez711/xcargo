from fastapi import APIRouter, HTTPException
from google.cloud import bigquery

router = APIRouter(prefix="/contabilidad", tags=["Contabilidad"])

@router.get("/resumen")
def obtener_resumen_contabilidad():
    client = bigquery.Client()

    try:
        # Pagos realizados (Canceladas)
        query_canceladas = """
            SELECT 
              cliente,
              estado,
              COUNT(*) AS guias,
              SUM(valor) AS valor,
              0 AS pendiente
            FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
            GROUP BY cliente, estado
        """

        # Pendientes desde COD_Pendiente
        query_pendientes = """
            SELECT 
              cliente,
              'Pendiente' AS estado,
              COUNT(*) AS guias,
              SUM(valor) AS valor,
              SUM(valor) AS pendiente
            FROM `datos-clientes-441216.pickup_data.COD_Pendiente`
            GROUP BY cliente
        """

        canceladas_rows = client.query(query_canceladas).result()
        pendientes_rows = client.query(query_pendientes).result()

        agrupado = {}

        for row in canceladas_rows:
            cliente = row["cliente"].capitalize()
            if cliente not in agrupado:
                agrupado[cliente] = []
            agrupado[cliente].append({
                "estado": row["estado"],
                "guias": row["guias"],
                "valor": row["valor"],
                "pendiente": row["pendiente"]
            })

        for row in pendientes_rows:
            cliente = row["cliente"].capitalize()
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
