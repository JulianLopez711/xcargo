import { useLocation } from "react-router-dom";
import { useState } from "react";
import "../../styles/contabilidad/PagoEntregas.css";

type Entrega = {
  tracking: string;
  fecha: string;
  tipo: string;
  cliente: string;
  valor: number;
};

export default function PagoEntregas() {
  const location = useLocation();
  const { entregas, total }: { entregas: Entrega[]; total: number } = location.state || {
    entregas: [],
    total: 0,
  };

  const [comprobante, setComprobante] = useState<File | null>(null);

  const handleArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setComprobante(e.target.files[0]);
    }
  };

  const registrarPago = () => {
    if (!comprobante) {
      alert("Debes adjuntar un comprobante de pago.");
      return;
    }
    alert(`✅ Pago registrado por $${total.toLocaleString()} para ${entregas.length} entregas.`);
    // Aquí iría el POST al backend
  };

  return (
    <div className="pago-entregas-page">
      <h2>Registrar Pago de Entregas</h2>

      <div className="pago-total">
        <strong>Total a pagar:</strong> ${total.toLocaleString()}
      </div>

      <div className="lista-entregas">
        <h4>Entregas a pagar:</h4>
        <table className="tabla-entregas-pago">
          <thead>
            <tr>
              <th>Tracking</th>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Cliente</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {entregas.map((e, idx) => (
              <tr key={idx}>
                <td>{e.tracking}</td>
                <td>{e.fecha}</td>
                <td>{e.tipo}</td>
                <td>{e.cliente}</td>
                <td>${e.valor.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="adjuntar-comprobante">
        <label>Adjuntar comprobante de pago:</label>
        <input type="file" onChange={handleArchivo} accept="image/*,.pdf" />
      </div>

      <button className="boton-accion" onClick={registrarPago}>
        ✅ Registrar Pago
      </button>
    </div>
  );
}
