import "../../styles/Entregas.css";
import { useState, useEffect } from "react";
import { saveAs } from "file-saver";

interface Entrega {
  tracking: string;
  conductor: string;
  ciudad: string;
  fecha: string;
  estado: string;
  cliente: string;
  carrier: string;
}

export default function EntregasContabilidad() {
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [clienteFiltro, setClienteFiltro] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [trackingFiltro, setTrackingFiltro] = useState("");

  useEffect(() => {
    // Aquí iría tu fetch real
    setEntregas([
      {
        tracking: "TRK001",
        conductor: "Juan Pérez",
        ciudad: "Bogotá",
        fecha: "2025-05-11",
        estado: "Entregado",
        cliente: "Dropi",
        carrier: "Servientrega",
      },
      {
        tracking: "TRK002",
        conductor: "Laura Gómez",
        ciudad: "Medellín",
        fecha: "2025-05-10",
        estado: "En tránsito",
        cliente: "Dafiti",
        carrier: "Coordinadora",
      },
    ]);
  }, []);

  const entregasFiltradas = entregas.filter((e) => {
    const coincideCliente = !clienteFiltro || e.cliente === clienteFiltro;
    const coincideFechaDesde = !fechaDesde || e.fecha >= fechaDesde;
    const coincideFechaHasta = !fechaHasta || e.fecha <= fechaHasta;
    const coincideTracking = e.tracking.toLowerCase().includes(trackingFiltro.toLowerCase());
    return coincideCliente && coincideFechaDesde && coincideFechaHasta && coincideTracking;
  });

  const descargarCSV = () => {
    const encabezado = "Tracking,Conductor,Ciudad,Fecha,Estado,Cliente,Carrier\n";
    const filas = entregasFiltradas
      .map(
        (e) =>
          `${e.tracking},${e.conductor},${e.ciudad},${e.fecha},${e.estado},${e.cliente},${e.carrier}`
      )
      .join("\n");

    const blob = new Blob([encabezado + filas], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `entregas-${new Date().toISOString().split("T")[0]}.csv`);
  };

  return (
    <div className="entregas-page">
      <h2 className="entregas-title">Módulo de Entregas</h2>

      <div className="entregas-filtros">
        <label>
          Tracking:
          <input
            type="text"
            placeholder="Ej: TRK123"
            value={trackingFiltro}
            onChange={(e) => setTrackingFiltro(e.target.value)}
          />
        </label>

        <label>
          Cliente:
          <select value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)}>
            <option value="">Todos</option>
            <option value="Dropi">Dropi</option>
            <option value="Dafiti">Dafiti</option>
            <option value="Trady">Trady</option>
          </select>
        </label>

        <label>
          Desde:
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
        </label>

        <label>
          Hasta:
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
        </label>

        <button className="boton-accion" onClick={descargarCSV}>📥 Exportar CSV</button>
      </div>

      <div className="entregas-tabla-container">
        <table className="entregas-tabla">
          <thead>
            <tr>
              <th>Tracking</th>
              <th>Conductor</th>
              <th>Ciudad</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Cliente</th>
              <th>Carrier</th>
            </tr>
          </thead>
          <tbody>
            {entregasFiltradas.length > 0 ? (
              entregasFiltradas.map((e, idx) => (
                <tr key={idx}>
                  <td>{e.tracking}</td>
                  <td>{e.conductor}</td>
                  <td>{e.ciudad}</td>
                  <td>{e.fecha}</td>
                  <td>{e.estado}</td>
                  <td>{e.cliente}</td>
                  <td>{e.carrier}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "1rem" }}>
                  No hay entregas registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
