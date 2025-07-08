""" from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import io

router = APIRouter()

# Ruta al archivo JSON de credenciales de la cuenta de servicio
SERVICE_ACCOUNT_FILE = "backend/app/credentials/pro-icon-465219-s7-5b983e9568fa.json"
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

# Autenticación con Google Drive
creds = service_account.Credentials.from_service_account_file(
    SERVICE_ACCOUNT_FILE, scopes=SCOPES)
drive_service = build('drive', 'v3', credentials=creds)

# Nombre de la carpeta en Google Drive donde están los comprobantes
DRIVE_FOLDER_NAME = "comprobantes_xcargo"

# Obtener el ID de la carpeta una sola vez
def get_folder_id(folder_name):
    results = drive_service.files().list(
        q=f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields="files(id, name)"
    ).execute()
    items = results.get('files', [])
    if not items:
        raise Exception(f"Carpeta '{folder_name}' no encontrada en Google Drive")
    return items[0]['id']

FOLDER_ID = get_folder_id(DRIVE_FOLDER_NAME)

# Endpoint que simula servir el archivo como si estuviera en /static/
@router.get("/static/{file_name}")
def get_comprobante(file_name: str):
    query = f"'{FOLDER_ID}' in parents and name = '{file_name}' and trashed = false"
    results = drive_service.files().list(q=query, fields="files(id, name)").execute()
    items = results.get('files', [])

    if not items:
        raise HTTPException(status_code=404, detail="Archivo no encontrado en Google Drive")

    file_id = items[0]['id']
    request = drive_service.files().get_media(fileId=file_id)
    file_stream = io.BytesIO()
    downloader = MediaIoBaseDownload(file_stream, request)

    done = False
    while not done:
        status, done = downloader.next_chunk()

    file_stream.seek(0)
    return StreamingResponse(file_stream, media_type="image/jpeg")
 """