import { useState, useEffect } from "react";
import "../../styles/contabilidad/Cruces.css";

interface Cruce {
  id: string;
  fecha: string;
  valor_banco: number;
  tipo: string;
  coincidencia: "conciliado" | "pendiente" | "duda" | "conciliado_manual";
  tracking?: string;
}

export default function Cruces() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [cruces, setCruces] = useState<Cruce[]>([]);
  const [cargandoCruces, setCargandoCruces] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setArchivo(file);
    setMensaje("");
  };

  const handleUpload = async () => {
    if (!archivo) {
      setMensaje("Debes seleccionar un archivo CSV.");
      return;
    }

    const formData = new FormData();
    formData.append("file", archivo);
    setSubiendo(true);
    setMensaje("");

    try {
      const res = await fetch("https://api.x-cargo.co/conciliacion/cargar-banco", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || "Error al subir archivo");

      setMensaje("✅ Archivo cargado correctamente.");
      setArchivo(null);
      fetchCruces();
    } catch (err: any) {
      console.error(err);
      setMensaje("❌ Error: " + err.message);
    } finally {
      setSubiendo(false);
    }
  };

  const fetchCruces = async () => {
    setCargandoCruces(true);
    try {
      const res = await fetch("https://api.x-cargo.co/cruces/cruces");
      if (!res.ok) throw new Error("Error al cargar los cruces");
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Respuesta inesperada del servidor");
      setCruces(data);
    } catch (err) {
      console.error("Error cargando cruces:", err);
      setMensaje("❌ Error cargando los cruces");
    } finally {
      setCargandoCruces(false);
    }
  };

  const marcarComoConciliado = async (id: string) => {
    try {
      const res = await fetch("https://api.x-cargo.co/conciliacion/validar-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al validar manualmente");

      alert("✅ Marcado como conciliado manual.");
      fetchCruces();
    } catch (err: any) {
      alert("❌ " + err.message);
    }
  };

  useEffect(() => {
    fetchCruces();
  }, []);

  return (
    <div className="cruces-container">
      <h2 className="titulo">Conciliación de Pagos</h2>

      <div className="carga-csv">
        <label>
          Cargar archivo del banco (CSV):
          <input type="file" accept=".csv" onChange={handleFileChange} />
        </label>
        <button className="boton-accion" onClick={handleUpload} disabled={subiendo}>
          {subiendo ? "Subiendo..." : "Subir CSV"}
        </button>
        {mensaje && <p className="mensaje-estado">{mensaje}</p>}
      </div>

      <div className="tabla-cruces">
        <h3>Resultado del Cruce</h3>
        {cargandoCruces ? (
          <p>Cargando datos...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Valor del banco</th>
                <th>Tipo</th>
                <th>Tracking</th>
                <th>Estado de cruce</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {cruces.map((c, idx) => (
                <tr key={idx} className={"estado-" + c.coincidencia}>
                  <td>{c.fecha}</td>
                  <td>${c.valor_banco.toLocaleString()}</td>
                  <td>{c.tipo}</td>
                  <td>{c.tracking || "-"}</td>
                  <td>{c.coincidencia}</td>
                  <td>
                    {(c.coincidencia === "pendiente" || c.coincidencia === "duda") && (
                      <button onClick={() => marcarComoConciliado(c.id)} className="boton-marcar">
                        Marcar como conciliado
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}