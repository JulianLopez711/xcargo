from fastapi import APIRouter, Depends, HTTPException
from google.cloud import bigquery
from typing import List, Dict, Any
import os

router = APIRouter(prefix="/api/guias", tags=["Guías"])

def get_bigquery_client():
    """Obtiene el cliente de BigQuery"""
    return bigquery.Client()

@router.get("/pendientes")
async def obtener_guias_pendientes_conductor(
    client: bigquery.Client = Depends(get_bigquery_client)
) -> List[Dict[str, Any]]:
    """
    Obtiene las guías pendientes de pago para conductores desde BigQuery
    """
    try:
        # Query para obtener los COD pendientes
        query = """
        SELECT 
            tracking_number AS tracking,
            Empleado AS conductor,
            cliente AS empresa,
            Valor AS valor,
            'pendiente' as estado,
            '' as novedad
        FROM `datos-clientes-441216.Conciliaciones.COD_pendiente`
        WHERE Valor > 0
        ORDER BY tracking_number DESC
        """
        
        query_job = client.query(query)
        results = query_job.result()

        guias_pendientes = []
        for row in results:
            guia = {
                "tracking": row.tracking,
                "conductor": row.conductor,
                "empresa": row.empresa,
                "valor": float(row.valor),
                "estado": row.estado,
                "novedad": row.novedad or ""
            }
            guias_pendientes.append(guia)

        return guias_pendientes

    except Exception as e:
        print(f"Error al obtener guías pendientes: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener guías pendientes: {str(e)}")

@router.get("/pendientes/conductor/{correo_conductor}")
async def obtener_guias_pendientes_por_conductor(
    correo_conductor: str,
    client: bigquery.Client = Depends(get_bigquery_client)
) -> List[Dict[str, Any]]:
    """
    Obtiene las guías pendientes de un conductor específico
    """
    try:
        query = """
        SELECT 
            tracking_number AS tracking,
            Empleado AS conductor,
            cliente AS empresa,
            Valor AS valor,
            'pendiente' as estado,
            '' as novedad
        FROM `datos-clientes-441216.Conciliaciones.COD_pendiente`
        WHERE Valor > 0 
        AND LOWER(Empleado) = LOWER(@correo_conductor)
        ORDER BY tracking_number DESC
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo_conductor", "STRING", correo_conductor)
            ]
        )

        query_job = client.query(query, job_config=job_config)
        results = query_job.result()

        guias_pendientes = []
        for row in results:
            guia = {
                "tracking": row.tracking,
                "conductor": row.conductor,
                "empresa": row.empresa,
                "valor": float(row.valor),
                "estado": row.estado,
                "novedad": row.novedad or ""
            }
            guias_pendientes.append(guia)

        return guias_pendientes

    except Exception as e:
        print(f"Error al obtener guías pendientes del conductor: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener guías pendientes: {str(e)}")
