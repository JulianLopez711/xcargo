from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Simulación temporal de usuarios
fake_users = {
    "jmauro.08@hotmail.com": {
        "password": pwd_context.hash("1234"),
        "clave_defecto": True
    }
}

def get_user(correo: str):
    return fake_users.get(correo)

def update_password(correo: str, nueva_clave: str):
    if correo in fake_users:
        fake_users[correo]["password"] = pwd_context.hash(nueva_clave)
        fake_users[correo]["clave_defecto"] = False
        return True
    return False
