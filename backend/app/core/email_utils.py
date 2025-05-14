import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from dotenv import load_dotenv

load_dotenv()

EMAIL_ADDRESS = os.getenv("MAIL_USERNAME")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")

def enviar_codigo_verificacion(correo_destino: str, codigo: str, nombre_destinatario: str = None):
    """
    Envía un correo electrónico con un código de verificación para recuperación de contraseña.
    
    Args:
        correo_destino (str): Dirección de correo electrónico del destinatario
        codigo (str): Código de verificación a enviar
        nombre_destinatario (str, optional): Nombre del destinatario. Por defecto usa "Usuario"
    
    Returns:
        bool: True si el correo se envió correctamente, False en caso contrario
    """
    # Si no se proporciona un nombre, usar "Usuario"
    if nombre_destinatario is None:
        nombre_destinatario = "Usuario"
    
    asunto = "Código de recuperación de contraseña - XCARGO"
    
    # Agregar versión en texto plano para mayor compatibilidad
    cuerpo_texto = f"""
Hola {nombre_destinatario},

Has solicitado un código para recuperar tu contraseña en XCARGO.
Tu código de verificación es: {codigo}

Este código expirará en 30 minutos. Si no solicitaste este código, puedes ignorar este mensaje.

© 2025 XCARGO. Todos los derechos reservados.
Para cualquier consulta, contacta con nosotros en soporte@tuempresa.com
"""

    # Versión HTML mejorada para mayor compatibilidad con clientes de correo
    cuerpo_html = f"""
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Código de verificación</title>
  <style>
    body, html {{
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f8fafc;
      color: #333;
      line-height: 1.6;
    }}
    /* Definir colores principales como variables CSS */
    :root {{
      --primary-color: #10B981;
      --primary-dark: #059669;
      --bg-light: #f0fdf4;
      --text-dark: #1f2937;
      --text-light: #6b7280;
      --border-color: #e5e7eb;
    }}
    .container {{
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      padding: 30px 15px;
    }}
    .card {{
      background-color: #ffffff;
      border-radius: 12px;
      padding: 30px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.1);
      border-top: 5px solid #10B981;
    }}
    .logo {{
      text-align: center;
      margin-bottom: 25px;
    }}
    .logo img {{
      max-height: 60px;
    }}
    .greeting {{
      font-size: 18px;
      margin-bottom: 20px;
      color: #1f2937;
      font-weight: 500;
    }}
    .content {{
      margin-bottom: 25px;
    }}
    .codigo {{
      font-size: 28px;
      font-weight: bold;
      color: #10B981;
      text-align: center;
      margin: 25px 0;
      padding: 15px;
      background-color: #f0fdf4;
      border-radius: 8px;
      letter-spacing: 2px;
    }}
    .button {{
      display: block;
      text-align: center;
      margin: 30px auto;
    }}
    .button a {{
      background-color: #10B981;
      color: white !important;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
      display: inline-block;
    }}
    .footer {{
      font-size: 13px;
      text-align: center;
      color: #6b7280;
      margin-top: 35px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
    }}
    /* Solución para problemas de compatibilidad con Outlook */
    table {{
      border-collapse: separate;
    }}
    /* Asegurar que los enlaces sean visibles */
    a {{
      color: #10B981;
      text-decoration: underline;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">
        <!-- Reemplaza con la URL absoluta de tu logo -->
        <img src="https://i.imgur.com/DDpCIzQ.png" alt="XCARGO" style="max-height: 60px;">
      </div>
      
      <div class="greeting">
        ¡Hola {nombre_destinatario}!
      </div>
      
      <div class="content">
        Has solicitado un código para recuperar tu contraseña en XCARGO. Utiliza el siguiente código:
      </div>
      
      <div class="codigo">
        {codigo}
      </div>
      
      <div class="content">
        Este código expirará en 30 minutos. Si no solicitaste este código, puedes ignorar este mensaje.
      </div>

      <div class="footer">
        © 2025 XCARGO. Todos los derechos reservados.<br>
        Si tienes alguna pregunta, contáctanos en <a href="mailto:soporte@tuempresa.com" style="color: #10B981;">soporte@tuempresa.com</a>
      </div>
    </div>
  </div>
</body>
</html>
"""

    # Crear el mensaje
    mensaje = MIMEMultipart("alternative")
    mensaje["From"] = f"XCARGO <{EMAIL_ADDRESS}>"
    mensaje["To"] = correo_destino
    mensaje["Subject"] = asunto
    
    # Adjuntar versiones texto y HTML (primero texto, luego HTML)
    parte_texto = MIMEText(cuerpo_texto, "plain")
    parte_html = MIMEText(cuerpo_html, "html")
    
    mensaje.attach(parte_texto)
    mensaje.attach(parte_html)

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
            server.send_message(mensaje)
            print(f"Correo enviado exitosamente a {correo_destino}")
            return True
    except Exception as e:
        print(f"Error al enviar el correo a {correo_destino}: {e}")
        return False


