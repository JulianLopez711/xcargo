from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import guias, ocr, pagos, operador,pagoCliente




app = FastAPI()

# Middleware CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "API XCargo backend funcionando"}



app.include_router(guias.router)
app.include_router(ocr.router)
app.include_router(pagos.router)
app.include_router(operador.router)
app.include_router(pagoCliente.router, tags=["Pago Entregas"])
