import { useLocation } from "react-router-dom";
import { useState } from "react";
import "../../styles/RegistrarPago.css";

const tipoPagoOpciones = ["Nequi", "Transferencia", "Consignación"];
type GuiaPago = { referencia: string; valor: number };

export default function RegistrarPago() {
  const location = useLocation();
  const { guias, total }: { guias: GuiaPago[]; total: number } = location.state || {
    guias: [],
    total: 0,
  };

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setArchivo(file);

    if (file && !manual) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("http://localhost:8000/ocr/extraer", {
          method: "POST",
          body: formData,
        });

        const result = await response.json();
        if (result?.datos_extraidos) {
          const data = JSON.parse(result.datos_extraidos);
          setDatosManuales({
            valor: data.valor || "",
            fecha: data.fecha_transaccion || "",
            hora: data.hora_transaccion || "",
            tipo_pago: data.entidad_financiera || "",
            entidad: data.entidad_financiera || "",
            referencia: data.referencia_pago || "",
          });
        }
      } catch (err) {
        console.error("Error al extraer datos:", err);
        alert("No se pudo leer el comprobante. Intenta ingresarlos manualmente.");
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const campos = Object.entries(datosManuales);
    for (const [key, val] of campos) {
      if (!val.trim()) {
        alert(`El campo "${key}" es obligatorio`);
        return;
      }
    }

    const valorNumerico = parseFloat(datosManuales.valor.replace(/[^\d.-]/g, ""));
    if (isNaN(valorNumerico)) {
      alert("El valor ingresado no es válido.");
      return;
    }

    if (valorNumerico !== total) {
      alert(
        `El valor ingresado ($${valorNumerico.toLocaleString()}) debe ser igual al total de las guías: $${total.toLocaleString()}`
      );
      return;
    }

    console.log("Pago registrado:", datosManuales, archivo);
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
            {guias.map((g: GuiaPago, idx: number) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{g.referencia}</td>
                <td>${g.valor.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="total-pago">
          Total: <strong>${total.toLocaleString()}</strong>
        </p>
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
            {/* Campos manuales */}
            {[
              ["valor", "Valor del pago", "$ 0.00"],
              ["fecha", "Fecha", ""],
              ["hora", "Hora", ""],
              ["entidad", "Entidad", ""],
              ["referencia", "Referencia", ""],
            ].map(([key, label, placeholder]) => (
              <div className="input-group" key={key}>
                <label>{label}</label>
                <input
                  type={key === "fecha" ? "date" : key === "hora" ? "time" : "text"}
                  value={datosManuales[key as keyof typeof datosManuales]}
                  onChange={(e) =>
                    setDatosManuales({ ...datosManuales, [key]: e.target.value })
                  }
                  placeholder={placeholder}
                  required
                />
              </div>
            ))}

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
          </>
        ) : (
          <div className="input-group">
            <label>Comprobante de pago</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
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
