from pydantic import BaseModel, EmailStr

class SolicitarCodigo(BaseModel):
    correo: EmailStr

class VerificarCodigo(BaseModel):
    correo: EmailStr
    codigo: str

class CambiarClave(BaseModel):
    correo: EmailStr
    nueva_clave: str
    codigo: str
