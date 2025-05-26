import { useLocation } from "react-router-dom";
import { useState } from "react";
import "../../styles/contabilidad/PagoEntregas.css";
import LoadingSpinner from "../../components/LoadingSpinner";

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
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);

  const handleArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setComprobante(e.target.files[0]);
    }
  };

  const registrarPago = async () => {
    if (!comprobante) {
      alert("Debes adjuntar un comprobante de pago.");
      return;
    }

    alert(`✅ Pago registrado por $${total.toLocaleString()} para ${entregas.length} entregas.`);

    const deseaEnviar = window.confirm("¿Deseas enviar confirmación al cliente por correo?");
    if (deseaEnviar) {
      await enviarCorreo();
    }
  };

  const enviarCorreo = async () => {
    if (!comprobante) {
      alert("Adjunta el comprobante primero.");
      return;
    }

    const cliente = entregas[0]?.cliente || "Sin cliente";

    const formData = new FormData();
    formData.append("cliente", cliente);
    formData.append("total", total.toString());
    formData.append("entregas", JSON.stringify(entregas));
    formData.append("comprobante", comprobante);

    setEnviandoCorreo(true);
    try {
      const res = await fetch("http://localhost:8000/enviar-confirmacion-email/", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        alert("📧 Correo enviado con comprobante.");
      } else {
        alert("❌ Error al enviar el correo.");
      }
    } catch (error) {
      alert("❌ Error de red al enviar el correo.");
    } finally {
      setEnviandoCorreo(false);
    }
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

      {enviandoCorreo && <LoadingSpinner />}
    </div>
  );
}
