import os
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv

load_dotenv()

EMAIL = os.getenv("EMAIL_SENDER")
PASSWORD = os.getenv("EMAIL_PASSWORD")

# Mapea cliente -> correo
DESTINOS = {
    "Dropi": os.getenv("EMAIL_CLIENTE_DROPI"),
    "Dafiti": os.getenv("EMAIL_CLIENTE_DAFITI"),
    "Trady": os.getenv("EMAIL_CLIENTE_TRADY"),
}

def enviar_correo_pago(cliente: str, total: float, entregas: list, nombre_archivo: str, archivo_bytes: bytes):
    msg = EmailMessage()
    msg["Subject"] = f"Pago de entregas - {cliente}"
    msg["From"] = EMAIL
    msg["To"] = DESTINOS.get(cliente, EMAIL)  # fallback

    cuerpo = f"""\
Hola {cliente},

Se ha recibido el pago por un total de ${total:,.2f} correspondiente a {len(entregas)} entregas.

Adjuntamos el comprobante de pago.

Gracias,
Equipo Contabilidad
"""
    msg.set_content(cuerpo)

    # Adjuntar comprobante real
    msg.add_attachment(
        archivo_bytes,
        maintype="application",
        subtype="octet-stream",
        filename=nombre_archivo
    )

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(EMAIL, PASSWORD)
        smtp.send_message(msg)
