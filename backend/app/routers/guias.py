from fastapi import APIRouter, Depends, HTTPException
from google.cloud import bigquery
from typing import List, Dict, Any
import os
from app.dependencies import get_current_user

router = APIRouter(prefix="/api/guias", tags=["Guías"])

def get_bigquery_client():
    """Obtiene el cliente de BigQuery"""
    return bigquery.Client()

def obtener_employee_id_usuario(correo: str, client: bigquery.Client) -> int:
    """
    Obtiene el Employee_id del usuario basado en su correo
    """
    try:
        query = """
        SELECT Employee_id
        FROM `datos-clientes-441216.Conciliaciones.usuarios_BIG`
        WHERE LOWER(Employee_Mail) = LOWER(@correo)
        LIMIT 1
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("correo", "STRING", correo)
            ]
        )
        
        result = client.query(query, job_config=job_config).result()
        rows = list(result)
        
        if rows:
            employee_id = rows[0]["Employee_id"]
            print(f"✅ Employee_id encontrado para {correo}: {employee_id}")
            return employee_id
        else:
            print(f"⚠️ No se encontró Employee_id para {correo}")
            return None
            
    except Exception as e:
        print(f"❌ Error obteniendo Employee_id: {e}")
        return None

@router.get("/pendientes")
async def obtener_guias_pendientes_conductor(
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """
    Obtiene las guías pendientes del conductor logueado específicamente
    """
    try:
        # Si es admin o rol superior, puede ver todas las guías
        if current_user["rol"] in ["admin", "master"]:
            query = """
            SELECT 
                tracking_number AS tracking,
                Empleado AS conductor,
                Cliente AS empresa,
                Valor AS valor,
                Status_Big as estado,
                '' as novedad,
                Employee_id,
                carrier_id,
                Carrier
            FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1`
            WHERE Valor > 0 AND Status_Big NOT LIKE '%Entregado%' AND Status_Big NOT LIKE '%360%'
            ORDER BY Status_Date DESC
            """
            
            query_job = client.query(query)
            results = query_job.result()
            
        else:
            # Para conductores: solo sus guías asignadas
            employee_id = obtener_employee_id_usuario(current_user["correo"], client)
            
            if not employee_id:
                print(f"❌ Conductor {current_user['correo']} no tiene Employee_id")
                return []
            
            query = """
            SELECT 
                tracking_number AS tracking,
                Empleado AS conductor,
                Cliente AS empresa,
                Valor AS valor,
                Status_Big as estado,
                '' as novedad,
                Employee_id,
                carrier_id,
                Carrier
            FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1`
            WHERE Valor > 0 
                AND Status_Big NOT LIKE '%Entregado%' 
                AND Status_Big NOT LIKE '%360%'
                AND Employee_id = @employee_id
            ORDER BY Status_Date DESC
            """
            
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id)
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
                "valor": int(row.valor),
                "estado": row.estado,
                "novedad": row.novedad or "",
                "employee_id": row.Employee_id,
                "carrier_id": row.carrier_id,
                "carrier": row.Carrier
            }
            guias_pendientes.append(guia)

        print(f"✅ Guías encontradas para {current_user['correo']}: {len(guias_pendientes)}")
        return guias_pendientes

    except Exception as e:
        print(f"Error al obtener guías pendientes: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener guías pendientes: {str(e)}")


@router.get("/pendientes/conductor/{correo_conductor}")
async def obtener_guias_pendientes_por_conductor(
    correo_conductor: str,
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """
    Obtiene las guías pendientes de un conductor específico
    Solo accesible por admin, supervisor o el mismo conductor
    """
    try:
        # Verificar permisos
        if current_user["correo"] != correo_conductor and current_user["rol"] not in ["admin", "supervisor", "master"]:
            raise HTTPException(status_code=403, detail="No autorizado para ver guías de otro conductor")
        
        employee_id = obtener_employee_id_usuario(correo_conductor, client)
        
        if not employee_id:
            print(f"❌ Conductor {correo_conductor} no tiene Employee_id")
            return []
        
        query = """
        SELECT 
            tracking_number AS tracking,
            Empleado AS conductor,
            Cliente AS empresa,
            Valor AS valor,
            Status_Big as estado,
            '' as novedad,
            Employee_id,
            carrier_id,
            Carrier
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1`
        WHERE Valor > 0 
            AND Status_Big NOT LIKE '%Entregado%' 
            AND Status_Big NOT LIKE '%360%'
            AND Employee_id = @employee_id
        ORDER BY Status_Date DESC
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id)
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
                "valor": int(row.valor),
                "estado": row.estado,
                "novedad": row.novedad or "",
                "employee_id": row.Employee_id,
                "carrier_id": row.carrier_id,
                "carrier": row.Carrier
            }
            guias_pendientes.append(guia)

        print(f"✅ Guías encontradas para conductor {correo_conductor}: {len(guias_pendientes)}")
        return guias_pendientes

    except Exception as e:
        print(f"Error al obtener guías pendientes del conductor: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener guías pendientes: {str(e)}")

@router.get("/mis-estadisticas")
async def obtener_estadisticas_conductor(
    client: bigquery.Client = Depends(get_bigquery_client),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Obtiene estadísticas específicas del conductor logueado
    """
    try:
        employee_id = obtener_employee_id_usuario(current_user["correo"], client)
        
        if not employee_id:
            return {
                "total_guias": 0,
                "pendientes": 0,
                "entregadas": 0,
                "valor_pendiente": 0,
                "valor_entregado": 0
            }
        
        query = """
        SELECT 
            COUNT(*) as total_guias,
            COUNT(CASE 
                WHEN Status_Big NOT LIKE '%360%' AND Status_Big NOT LIKE '%Entregado%' 
                THEN 1 
            END) as pendientes,
            COUNT(CASE 
                WHEN Status_Big LIKE '%360%' OR Status_Big LIKE '%Entregado%' 
                THEN 1 
            END) as entregadas,
            SUM(CASE 
                WHEN Status_Big NOT LIKE '%360%' AND Status_Big NOT LIKE '%Entregado%' 
                THEN Valor ELSE 0 
            END) as valor_pendiente,
            SUM(CASE 
                WHEN Status_Big LIKE '%360%' OR Status_Big LIKE '%Entregado%' 
                THEN Valor ELSE 0 
            END) as valor_entregado
        FROM `datos-clientes-441216.Conciliaciones.COD_pendientes_v1`
        WHERE Employee_id = @employee_id
            AND Valor > 0
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("employee_id", "INTEGER", employee_id)
            ]
        )
        
        result = client.query(query, job_config=job_config).result()
        rows = list(result)
        
        if rows:
            row = rows[0]
            return {
                "total_guias": int(row.total_guias) if row.total_guias else 0,
                "pendientes": int(row.pendientes) if row.pendientes else 0,
                "entregadas": int(row.entregadas) if row.entregadas else 0,
                "valor_pendiente": int(row.valor_pendiente) if row.valor_pendiente else 0,
                "valor_entregado": int(row.valor_entregado) if row.valor_entregado else 0
            }
        
        return {
            "total_guias": 0,
            "pendientes": 0,
            "entregadas": 0,
            "valor_pendiente": 0,
            "valor_entregado": 0
        }
        
    except Exception as e:
        print(f"Error obteniendo estadísticas del conductor: {e}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo estadísticas: {str(e)}")