from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import logging

from app.routers import (
    guias, ocr, pagos, operador, asistente,
    pagoCliente, contabilidad, auth, roles,
    conciliacion, cruces, entregas, admin, 
    supervisor, master, pagos_avanzados
)

app = FastAPI()
logging.basicConfig(level=logging.DEBUG)

# ==========================
# Servir archivos estáticos (comprobantes)
# ==========================
app.mount("/static", StaticFiles(directory="comprobantes"), name="static")

# ==========================
# Middleware CORS (incluye móvil, PWA, www, desarrollo)
# ==========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://gestion.x-cargo.co",
        "https://www.gestion.x-cargo.co",
        "http://localhost",
        "http://localhost:5173",
        "capacitor://localhost",
        "ionic://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================
# Middleware para evitar caché en móviles
# ==========================
@app.middleware("http")
async def add_cache_control_header(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response

# ==========================
# Ruta raíz
# ==========================
@app.get("/")
def root():
    return {"message": "API XCargo backend funcionando"}

# ==========================
# Registrar todas las rutas
# ==========================
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(roles.router)
app.include_router(guias.router)
app.include_router(operador.router)
app.include_router(ocr.router)
app.include_router(pagos.router)
app.include_router(pagoCliente.router)
app.include_router(contabilidad.router)
app.include_router(conciliacion.router)
app.include_router(cruces.router)
app.include_router(entregas.router)
app.include_router(asistente.router)
app.include_router(supervisor.router)
app.include_router(master.router)
app.include_router(pagos_avanzados.router)
