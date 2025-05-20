from fastapi import APIRouter
from google.cloud import bigquery

router = APIRouter(prefix="/pagos-cruzados", tags=["Pagos Cruzados"])

@router.get("/entregas-consolidadas")
def obtener_entregas_consolidadas():
    client = bigquery.Client()
    query = """
        SELECT tracking, fecha_pago AS fecha, tipo, entidad AS cliente, valor
        FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
        WHERE estado = 'conciliado' AND referencia_pago IS NOT NULL
    """
    result = client.query(query).result()
    return [dict(row) for row in result]
