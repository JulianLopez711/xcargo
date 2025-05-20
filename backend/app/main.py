from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routers import guias, ocr, pagos, operador, pagoCliente, auth, pagos_cruzados, roles, conciliacion, cruces

app = FastAPI()

app.mount("/static", StaticFiles(directory="comprobantes"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
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
app.include_router(guias.router)
app.include_router(ocr.router)
app.include_router(pagos.router)
app.include_router(operador.router)
app.include_router(pagoCliente.router)
app.include_router(roles.router)
app.include_router(auth.router)
app.include_router(conciliacion.router)
app.include_router(cruces.router)
app.include_router(pagos_cruzados.router)
