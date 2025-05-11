import "../../styles/Pagos.css";
import { useEffect, useState } from "react";
import { saveAs } from "file-saver";

interface Pago {
  referencia: string;
  valor: number;
  fecha: string;
  entidad: string;
  estado: string;
  tipo: string;
  imagen: string;
}

export default function PagosContabilidad() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [filtroReferencia, setFiltroReferencia] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  useEffect(() => {
    // Aquí iría el fetch a tu backend
    setPagos([
      {
        referencia: "REF123",
        valor: 220000,
        fecha: "2025-05-11",
        entidad: "Nequi",
        estado: "Conciliado",
        tipo: "Transferencia",
        imagen: "/comprobantes/4.jpeg",
      },
      {
        referencia: "REF456",
        valor: 180000,
        fecha: "2025-05-10",
        entidad: "Bancolombia",
        estado: "Pendiente",
        tipo: "Consignación",
        imagen: "/comprobantes/5.jpeg",
      },
    ]);
  }, []);

  const pagosFiltrados = pagos.filter((p) => {
    const cumpleReferencia = p.referencia.toLowerCase().includes(filtroReferencia.toLowerCase());
    const cumpleDesde = !fechaDesde || p.fecha >= fechaDesde;
    const cumpleHasta = !fechaHasta || p.fecha <= fechaHasta;
    return cumpleReferencia && cumpleDesde && cumpleHasta;
  });

  const descargarCSV = () => {
    const encabezado = "Referencia,Valor,Fecha,Entidad,Estado,Tipo\n";
    const filas = pagosFiltrados
      .map(
        (p) =>
          `${p.referencia},${p.valor},${p.fecha},${p.entidad},${p.estado},${p.tipo}`
      )
      .join("\n");

    const blob = new Blob([encabezado + filas], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `pagos-consolidados-${new Date().toISOString().split("T")[0]}.csv`);
  };

  const verImagen = (src: string) => {
    window.open(src, "_blank");
  };

  return (
    <div className="pagos-page">
      <h2 className="pagos-title">Módulo de Pagos</h2>

      <div className="pagos-filtros">
        <label>
          Buscar referencia:
          <input
            type="text"
            placeholder="Ej: REF123"
            value={filtroReferencia}
            onChange={(e) => setFiltroReferencia(e.target.value)}
          />
        </label>
        <label>
          Desde:
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
          />
        </label>
        <label>
          Hasta:
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
          />
        </label>
        <button onClick={descargarCSV} className="boton-accion">📥 Descargar CSV</button>

      </div>

      <div className="pagos-tabla-container">
        <table className="pagos-tabla">
          <thead>
            <tr>
              <th>Referencia</th>
              <th>Valor</th>
              <th>Fecha</th>
              <th>Entidad</th>
              <th>Estado</th>
              <th>Tipo</th>
              <th>Comprobante</th>
            </tr>
          </thead>
          <tbody>
            {pagosFiltrados.length > 0 ? (
              pagosFiltrados.map((p, idx) => (
                <tr key={idx}>
                  <td>{p.referencia}</td>
                  <td>${p.valor.toLocaleString()}</td>
                  <td>{p.fecha}</td>
                  <td>{p.entidad}</td>
                  <td>{p.estado}</td>
                  <td>{p.tipo}</td>
                  <td>
  <button onClick={() => verImagen(p.imagen)} className="boton-secundario">👁 Ver</button>
</td>

                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "1rem" }}>
                  No hay pagos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
