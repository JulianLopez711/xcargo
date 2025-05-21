from fastapi import APIRouter
from google.cloud import bigquery

router = APIRouter(prefix="/cruces", tags=["Cruces"])


@router.get("/cruces")
def obtener_cruces():
    client = bigquery.Client()

    query = """
    WITH pagos AS (
      SELECT
        referencia_pago,
        SAFE_CAST(fecha_pago AS DATE) AS fecha,
        ROUND(SUM(valor), 2) AS total_pagado
      FROM `datos-clientes-441216.Conciliaciones.pagosconductor`
      WHERE estado != 'rechazado'
      GROUP BY referencia_pago, fecha
    ),
    banco AS (
      SELECT
        id,
        fecha,
        valor_banco,
        entidad
      FROM `datos-clientes-441216.Conciliaciones.banco_raw`
    ),
    cruces AS (
      SELECT
        b.fecha,
        b.valor_banco,
        b.entidad,
        p.referencia_pago,
        CASE
          WHEN ABS(b.valor_banco - p.total_pagado) < 100 THEN 'conciliado'
          WHEN p.referencia_pago IS NULL THEN 'pendiente'
          ELSE 'duda'
        END AS coincidencia
      FROM banco b
      LEFT JOIN pagos p
      ON b.valor_banco BETWEEN p.total_pagado - 100 AND p.total_pagado + 100
      AND b.fecha = p.fecha
    )
    SELECT * FROM cruces ORDER BY fecha DESC
    """

    resultados = client.query(query).result()
    return [dict(row) for row in resultados]
