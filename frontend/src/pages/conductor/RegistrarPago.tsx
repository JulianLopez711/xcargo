// src/pages/conductor/RegistrarPago.tsx
import { useLocation } from "react-router-dom";
import { useState } from "react";
import "../../styles/RegistrarPago.css";

const tipoPagoOpciones = ["Nequi", "Transferencia", "Consignación"];
type GuiaPago = { referencia: string; valor: number };


export default function RegistrarPago() {
  const location = useLocation();
  const { guias, total }: { guias: GuiaPago[]; total: number } = location.state || { guias: [], total: 0 };
  const [archivo, setArchivo] = useState<File | null>(null);
  const [manual, setManual] = useState(false);
  const [datosManuales, setDatosManuales] = useState({
    valor: "",
    fecha: "",
    hora: "",
    tipo_pago: "",
    entidad: "",
    referencia: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (manual) {
      const campos = Object.entries(datosManuales);
      for (const [key, val] of campos) {
        if (!val.trim()) {
          alert(`El campo "${key}" es obligatorio`);
          return;
        }
      }
      console.log("Datos manuales:", datosManuales);
    } else {
      if (!archivo) {
        alert("Debes subir un comprobante de pago.");
        return;
      }
      console.log("Archivo cargado:", archivo.name);
    }

    console.log("Guías:", guias);
    alert("Pago registrado correctamente.");
  };

  return (
    <div className="registrar-pago">
      <h1>Registrar Pago</h1>

      <div className="tabla-guias">
        <h2>Guías seleccionadas</h2>
        <table>
  <thead>
    <tr>
      <th>#</th>
      <th>Referencia</th>
      <th>Valor</th>
    </tr>
  </thead>
  <tbody>
    {guias.map((g: { referencia: string; valor: number }, idx: number) => (
      <tr key={idx}>
        <td>{idx + 1}</td>
        <td>{g.referencia}</td>
        <td>
  {g.valor !== undefined ? `$${g.valor.toLocaleString()}` : "Valor no disponible"}
</td>

      </tr>
    ))}
  </tbody>
</table>

        <p className="total-pago">Total: <strong>${total.toLocaleString()}</strong></p>
      </div>

      <form onSubmit={handleSubmit} className="formulario-pago">
        <div className="input-group">
          <label>
            <input
              type="checkbox"
              checked={manual}
              onChange={() => setManual(!manual)}
            />
            Ingresar datos manualmente
          </label>
        </div>

        {manual ? (
          <>
            <div className="input-group">
              <label>Valor del pago</label>
              <input
                type="text"
                value={datosManuales.valor}
                onChange={(e) =>
                  setDatosManuales({ ...datosManuales, valor: e.target.value })
                }
                placeholder="$ 0.00"
                required
              />
            </div>
            <div className="input-group">
              <label>Fecha</label>
              <input
                type="date"
                value={datosManuales.fecha}
                onChange={(e) =>
                  setDatosManuales({ ...datosManuales, fecha: e.target.value })
                }
                required
              />
            </div>
            <div className="input-group">
              <label>Hora</label>
              <input
                type="time"
                value={datosManuales.hora}
                onChange={(e) =>
                  setDatosManuales({ ...datosManuales, hora: e.target.value })
                }
                required
              />
            </div>
            <div className="input-group">
              <label>Tipo de pago</label>
              <select
                value={datosManuales.tipo_pago}
                onChange={(e) =>
                  setDatosManuales({ ...datosManuales, tipo_pago: e.target.value })
                }
                required
              >
                <option value="">Seleccionar</option>
                {tipoPagoOpciones.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>Entidad</label>
              <input
                type="text"
                value={datosManuales.entidad}
                onChange={(e) =>
                  setDatosManuales({ ...datosManuales, entidad: e.target.value })
                }
                required
              />
            </div>
            <div className="input-group">
              <label>Referencia</label>
              <input
                type="text"
                value={datosManuales.referencia}
                onChange={(e) =>
                  setDatosManuales({ ...datosManuales, referencia: e.target.value })
                }
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
