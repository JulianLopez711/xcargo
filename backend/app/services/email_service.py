import os
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv
from io import BytesIO
from openpyxl import Workbook
from datetime import datetime
import locale

# Establecer el locale para nombres de meses en español
try:
    locale.setlocale(locale.LC_TIME, "es_CO.UTF-8")
except locale.Error:
    locale.setlocale(locale.LC_TIME, "es_ES.UTF-8")  # Fallback si es necesario

load_dotenv()

EMAIL = os.getenv("EMAIL_SENDER")
PASSWORD = os.getenv("EMAIL_PASSWORD")

DESTINOS = {
    "Dropi": os.getenv("EMAIL_CLIENTE_DROPI"),
    "Dafiti": os.getenv("EMAIL_CLIENTE_DAFITI"),
    "Trady": os.getenv("EMAIL_CLIENTE_TRADY"),
}

def generar_excel_entregas(entregas: list) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Entregas"

    # Encabezados
    ws.append(["Tracking", "Fecha", "Tipo", "Cliente", "Valor"])

    for entrega in entregas:
        ws.append([
            entrega["tracking"],
            entrega["fecha"],
            entrega["tipo"],
            entrega["cliente"],
            entrega["valor"]
        ])

    archivo_virtual = BytesIO()
    wb.save(archivo_virtual)
    archivo_virtual.seek(0)
    return archivo_virtual.read()

def enviar_correo_pago(cliente: str, total: float, entregas: list, nombre_archivo: str, archivo_bytes: bytes):
    msg = EmailMessage()
    fecha_actual = datetime.now().strftime("%d de %B")
    msg["Subject"] = f"Reporte {fecha_actual}"
    msg["From"] = EMAIL
    msg["To"] = DESTINOS.get(cliente, EMAIL)

    cuerpo = f"""\
    Buenos días, estimados,
    Adjunto el reporte correspondiente al recaudo por concepto de Cash on Delivery del periodo comprendido entre el {fecha_actual}.
    Se incluyen en este envío los soportes correspondientes y la relación en Excel con el detalle de lo recaudado.
    """
    msg.set_content(cuerpo)

    # Adjuntar comprobante
    msg.add_attachment(
        archivo_bytes,
        maintype="application",
        subtype="octet-stream",
        filename=nombre_archivo
    )

    # Adjuntar Excel
    excel_bytes = generar_excel_entregas(entregas)
    msg.add_attachment(
        excel_bytes,
        maintype="application",
        subtype="vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="entregas.xlsx"
    )

    # Enviar correo
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(EMAIL, PASSWORD)
        smtp.send_message(msg)
