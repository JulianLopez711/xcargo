// src/pages/conductor/PagosPendientes.tsx
import { useState } from "react";
import "../../styles/PagosPendientes.css";

const pagosMock = [
  { id: 1, referencia: "REF001", valor: 22000 },
  { id: 2, referencia: "REF002", valor: 18000 },
  { id: 3, referencia: "REF003", valor: 25000 },
];

export default function PagosPendientes() {
  const [seleccionados, setSeleccionados] = useState<number[]>([]);

  const togglePago = (id: number) => {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const total = pagosMock
    .filter((p) => seleccionados.includes(p.id))
    .reduce((acc, curr) => acc + curr.valor, 0);

  const handlePagar = () => {
    if (seleccionados.length === 0) return alert("Selecciona al menos un pago.");
    alert(`Pagando ${seleccionados.length} pagos por $${total.toLocaleString()}`);
    // Aquí podrías enviar `seleccionados` al backend
  };

  return (
    <div className="pagos-pendientes">
      <h1>Pagos Pendientes</h1>
      <div className="pagos-lista">
        {pagosMock.map((pago) => (
          <div key={pago.id} className="pago-item">
            <label>
              <input
                type="checkbox"
                checked={seleccionados.includes(pago.id)}
                onChange={() => togglePago(pago.id)}
              />
              <span className="referencia">{pago.referencia}</span>
              <span className="valor">${pago.valor.toLocaleString()}</span>
            </label>
          </div>
        ))}
      </div>

      <div className="pago-total">
        Total a pagar: <strong>${total.toLocaleString()}</strong>
      </div>

      <button className="boton-pagar" onClick={handlePagar}>
        Pagar
      </button>
    </div>
  );
}
