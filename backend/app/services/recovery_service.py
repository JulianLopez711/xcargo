import random
import string
from datetime import datetime, timedelta

codigos_temporales = {}

def generar_codigo():
    return ''.join(random.choices(string.digits, k=6))

def guardar_codigo(correo: str, codigo: str):
    codigos_temporales[correo] = {
        "codigo": codigo,
        "expira": datetime.utcnow() + timedelta(minutes=10)
    }

def verificar_codigo(correo: str, codigo: str) -> bool:
    entrada = codigos_temporales.get(correo)
    if not entrada:
        return False
    if entrada["codigo"] != codigo:
        return False
    if datetime.utcnow() > entrada["expira"]:
        del codigos_temporales[correo]
        return False
    return True
