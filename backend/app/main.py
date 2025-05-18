from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import guias, ocr, pagos, operador, pagoCliente, auth, pagos_cruzados, roles
from fastapi.staticfiles import StaticFiles

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

app.include_router(pagos_cruzados.router)
app.include_router(guias.router)
app.include_router(ocr.router)
app.include_router(pagos.router)
app.include_router(operador.router)
app.include_router(pagoCliente.router)
app.include_router(roles.router)
app.include_router(auth.router)
