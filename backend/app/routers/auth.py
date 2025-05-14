from fastapi import APIRouter, HTTPException
from app.schemas.auth import SolicitarCodigo, VerificarCodigo, CambiarClave
from app.core.email_utils import enviar_codigo_verificacion
from app.services.recovery_service import generar_codigo, guardar_codigo, verificar_codigo
from app.models.user import get_user, update_password

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/solicitar-codigo")
async def solicitar_codigo(data: SolicitarCodigo):
    user = get_user(data.correo)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    codigo = generar_codigo()
    guardar_codigo(data.correo, codigo)

    enviado = enviar_codigo_verificacion(data.correo, codigo)
    if not enviado:
        raise HTTPException(status_code=500, detail="No se pudo enviar el correo")

    return {"msg": "Código enviado exitosamente"}

@router.post("/verificar-codigo")
def verificar(data: VerificarCodigo):
    if not verificar_codigo(data.correo, data.codigo):
        raise HTTPException(status_code=400, detail="Código inválido o expirado")
    return {"msg": "Código válido"}

@router.post("/cambiar-clave")
def cambiar(data: CambiarClave):
    if not verificar_codigo(data.correo, data.codigo):
        raise HTTPException(status_code=400, detail="Código inválido o expirado")
    
    actualizado = update_password(data.correo, data.nueva_clave)
    if not actualizado:
        raise HTTPException(status_code=404, detail="No se pudo actualizar la contraseña")
    
    return {"msg": "Contraseña actualizada correctamente"}
