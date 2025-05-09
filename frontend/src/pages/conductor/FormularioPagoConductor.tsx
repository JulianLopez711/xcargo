// src/pages/conductor/RegistrarPago.tsx
import { useLocation } from "react-router-dom";
import { useState } from "react";
import "../../styles/FormularioPagoConductor.css";

export default function RegistrarPago() {
  const location = useLocation();
  const { guias, total } = location.state || { guias: [], total: 0 };

  const [archivo, setArchivo] = useState<File | null>(null);
  const [manual, setManual] = useState(false);
  const [datosManuales, setDatosManuales] = useState({
    valor: "",
    fecha: "",
    referencia: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!manual && !archivo) {
      alert("Por favor, sube un comprobante de pago o activa el modo manual.");
      return;
    }

    if (manual) {
      console.log("Datos manuales:", datosManuales);
    } else {
      console.log("Archivo:", archivo);
    }

    console.log("Guias pagadas:", guias);
    alert("Pago registrado");
  };

  return (
    <div className="registrar-pago">
      <h1>Registrar Pago</h1>

      <div className="detalle-pago">
        <p><strong>Guías:</strong> {guias.join(", ")}</p>
        <p><strong>Total:</strong> ${total.toLocaleString()}</p>
      </div>

      <form onSubmit={handleSubmit} className="formulario-pago">
        <div className="input-group">
          <label>
            <input
              type="checkbox"
              checked={manual}
              onChange={() => setManual(!manual)}
            />
            Cargar información manualmente
          </label>
        </div>

        {manual ? (
          <>
            <div className="input-group">
              <label>Valor del pago</label>
              <input
                type="number"
                value={datosManuales.valor}
                onChange={(e) => setDatosManuales({ ...datosManuales, valor: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label>Fecha</label>
              <input
                type="date"
                value={datosManuales.fecha}
                onChange={(e) => setDatosManuales({ ...datosManuales, fecha: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label>Referencia</label>
              <input
                type="text"
                value={datosManuales.referencia}
                onChange={(e) => setDatosManuales({ ...datosManuales, referencia: e.target.value })}
                required
              />
            </div>
          </>
        ) : (
          <div className="input-group">
            <label>Comprobante de pago</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setArchivo(e.target.files?.[0] || null)}
              required
            />
          </div>
        )}

        <button type="submit" className="boton-registrar">
          Registrar pago
        </button>
      </form>
    </div>
  );
}
