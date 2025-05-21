from fastapi import APIRouter, HTTPException,Query
from google.cloud import bigquery
from datetime import datetime


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
            cliente = (row["cliente"] or "Desconocido").capitalize()
            if cliente not in agrupado:
                agrupado[cliente] = []
            agrupado[cliente].append({
                "estado": row["estado"],
                "guias": row["guias"],
                "valor": row["valor"],
                "pendiente": row["pendiente"]
            })

        for row in pendientes_rows:
            cliente = (row["cliente"] or "Desconocido").capitalize()
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


@router.get("/conciliacion-mensual")
def conciliacion_mensual(mes: str = Query(..., pattern=r"^\d{4}-\d{2}$")):
    """
    Devuelve resumen diario del mes (formato 'YYYY-MM') para el calendario de conciliación.
    """
    try:
        año, mes_num = mes.split("-")
        fecha_inicio = f"{mes}-01"
        fecha_fin = f"{mes}-31"  # safe por ser filtro por mes

        client = bigquery.Client()

        query = f"""
            SELECT 
              fecha,
              SUM(valor_soportes) AS soportes,
              SUM(valor_banco) AS banco,
              SUM(diferencia) AS diferencia,
              SUM(guias) AS guias,
              SUM(movimientos) AS movimientos,
              AVG(avance) AS avance
            FROM `datos-clientes-441216.Conciliaciones.conciliacion_diaria`
            WHERE fecha BETWEEN '{fecha_inicio}' AND '{fecha_fin}'
            GROUP BY fecha
            ORDER BY fecha
        """

        resultados = client.query(query).result()

        datos = []
        for row in resultados:
            datos.append({
                "fecha": row["fecha"].strftime("%Y-%m-%d"),
                "soportes": int(row["soportes"]),
                "banco": int(row["banco"]),
                "diferencia": int(row["diferencia"]),
                "guias": int(row["guias"]),
                "movimientos": int(row["movimientos"]),
                "avance": round(row["avance"], 2)
            })

        return datos

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))