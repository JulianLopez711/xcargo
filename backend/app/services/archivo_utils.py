import os
from datetime import datetime

async def guardar_comprobante_con_nombre(archivo, tracking: str) -> str:
    UPLOAD_DIR = "comprobantes"
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    extension = os.path.splitext(archivo.filename)[1]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    nombre_archivo = f"{timestamp}_{tracking}{extension}"

    ruta_archivo = os.path.join(UPLOAD_DIR, nombre_archivo)
    contenido = await archivo.read()

    with open(ruta_archivo, "wb") as f:
        f.write(contenido)

    return nombre_archivo
