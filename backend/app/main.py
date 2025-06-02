from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routers import (
    guias, ocr, pagos, operador, asistente, 
    pagoCliente, contabilidad, auth, roles, 
    conciliacion, cruces, entregas, admin,supervisor,master
)

app = FastAPI()

app.mount("/static", StaticFiles(directory="comprobantes"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://localhost:5173",
        "https://gestion.x-cargo.co",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "API XCargo backend funcionando"}

# Registrar todas las rutas
app.include_router(auth.router)           # /auth
app.include_router(admin.router)          # /admin - ¡FALTABA ESTE!
app.include_router(roles.router)          # /roles
app.include_router(guias.router)          # /api/guias
app.include_router(operador.router)       # /api/operador
app.include_router(ocr.router)            # /ocr
app.include_router(pagos.router)          # /pagos
app.include_router(pagoCliente.router)    # sin prefix definido
app.include_router(contabilidad.router)   # /contabilidad
app.include_router(conciliacion.router)   # /conciliacion
app.include_router(cruces.router)         # /cruces
app.include_router(entregas.router)       # /entregas
app.include_router(asistente.router)      # /asistente
app.include_router(supervisor.router)     # /supervisor
app.include_router(master.router)         # /master