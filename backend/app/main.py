from fastapi import FastAPI
import logging
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routers import (
    guias, ocr, pagos, operador, asistente, 
    pagoCliente, contabilidad, auth, roles, 
    conciliacion, cruces, entregas, admin, supervisor, master, pagos_avanzados
)

app = FastAPI()
logging.basicConfig(level=logging.DEBUG)
app.mount("/static", StaticFiles(directory="comprobantes"), name="static")

# CORS configurado correctamente para producción y desarrollo
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://gestion.x-cargo.co",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "API XCargo backend funcionando"}

# Registrar rutas
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

