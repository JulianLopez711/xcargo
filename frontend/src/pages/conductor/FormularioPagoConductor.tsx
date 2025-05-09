import { useState } from "react";
import "../../styles/FormularioPagoConductor.css";

interface Factura {
  id: string;
  consecutivo: string;
  conductor: string;
  valor: number;
  empresa: string;
}

export default function FormularioPagoConductor() {
  const facturas = JSON.parse(sessionStorage.getItem("facturasSeleccionadas") || "[]") as Factura[];

  if (!facturas.length) {
    return <div className="error">No hay facturas seleccionadas. Regresa al listado.</div>;
  }

  const total = facturas.reduce((acc, f) => acc + f.valor, 0);

  const [imagen, setImagen] = useState<File | null>(null);
  const [modoManual, setModoManual] = useState(false);
  const [manual, setManual] = useState({
    valor: total,
    fecha: "",
    banco: "",
    tipo: "",
    referencia: "",
  });

  const handleArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setImagen(e.target.files[0]);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setManual({ ...manual, [e.target.name]: e.target.value });
  };

  const procesarComprobante = async () => {
    if (!imagen) {
      alert("No hay imagen cargada.");
      return;
    }

    const formData = new FormData();
    formData.append("imagen", imagen);

    try {
      const res = await fetch("http://127.0.0.1:8000/api/ocr/comprobante", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.valor || data.fecha || data.entidad || data.tipo_pago || data.referencia) {
        setManual({
          valor: parseInt(data.valor.replace(/\D/g, "")) || 0,
          fecha: data.fecha || "",
          banco: data.entidad || "",
          tipo: data.tipo_pago || "",
          referencia: data.referencia || "",
        });
        setModoManual(true);
        alert("✅ Datos extraídos del comprobante.");
      } else {
        alert("❌ No se pudieron extraer los datos.");
      }
    } catch (error) {
      console.error("Error al procesar imagen:", error);
      alert("Error al procesar la imagen con OCR.");
    }
  };

  const enviar = () => {
    if (!imagen && !modoManual) {
      alert("Debes subir una imagen o activar el modo manual.");
      return;
    }

    const payload = {
      facturas: facturas.map(f => f.id),
      soporte: modoManual ? manual : "imagen",
      archivo: imagen,
    };

    console.log("Payload listo para enviar:", payload);
    alert("Pago preparado. Aquí conectas con backend.");
  };

  return (
    <div className="formulario-pago-conductor">
      <h2>Registrar Pago</h2>

      <div className="info-facturas">
        <p><strong>Facturas:</strong> {facturas.map(f => f.consecutivo).join(", ")}</p>
        <p><strong>Total:</strong> ${total.toLocaleString()}</p>
      </div>

      <div className="opciones-pago">
        <label>
          <input
            type="checkbox"
            checked={modoManual}
            onChange={() => setModoManual(!modoManual)}
          />
          Ingresar datos manualmente
        </label>
      </div>

      {modoManual ? (
        <div className="form-manual">
          <label>Valor:</label>
          <input type="number" name="valor" value={manual.valor} onChange={handleInput} />

          <label>Fecha:</label>
          <input type="date" name="fecha" value={manual.fecha} onChange={handleInput} />

          <label>Banco:</label>
          <input type="text" name="banco" value={manual.banco} onChange={handleInput} />

          <label>Tipo:</label>
          <select name="tipo" value={manual.tipo} onChange={handleInput}>
            <option value="">Seleccione</option>
            <option value="Nequi">Nequi</option>
            <option value="Transferencia">Transferencia</option>
            <option value="Consignación">Consignación</option>
          </select>

          <label>Referencia:</label>
          <input type="text" name="referencia" value={manual.referencia} onChange={handleInput} />
        </div>
      ) : (
        <div className="form-imagen">
          <label>Subir soporte de pago:</label>
          <input type="file" accept="image/*" onChange={handleArchivo} />

          <button onClick={procesarComprobante} className="btn-ocr">
            Detectar datos automáticamente
          </button>
        </div>
      )}

      <button className="btn-confirmar" onClick={enviar}>
        Confirmar y Enviar
      </button>
    </div>
  );
}
