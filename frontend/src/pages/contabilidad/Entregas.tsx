import "../../styles/contabilidad/Entregas.css";
import { useState, useEffect } from "react";
import { saveAs } from "file-saver";
import { useNavigate } from "react-router-dom";

interface Entrega {
  tracking: string;
  fecha: string;
  tipo: string; // tipo de consignación
  cliente: string;
  valor: number;
}

export default function EntregasContabilidad() {
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [clienteFiltro, setClienteFiltro] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [trackingFiltro, setTrackingFiltro] = useState("");

  useEffect(() => {
    setEntregas([
      {
        tracking: "TRK001",
        fecha: "2025-05-11",
        tipo: "Transferencia",
        cliente: "Dropi",
        valor: 150000,
      },
      {
        tracking: "TRK002",
        fecha: "2025-05-10",
        tipo: "Consignación",
        cliente: "Dafiti",
        valor: 200000,
      },
      {
        tracking: "TRK003",
        fecha: "2025-05-18",
        tipo: "Consignación",
        cliente: "Dafiti",
        valor: 25000,
      },
      {
        tracking: "TRK004",
        fecha: "2025-05-10",
        tipo: "Consignación",
        cliente: "Dafiti",
        valor: 207800,
      },
      {
        tracking: "TRK005",
        fecha: "2025-05-10",
        tipo: "Consignación",
        cliente: "Tridy",
        valor: 300000,
      },
    ]);
  }, []);

  const entregasFiltradas = entregas.filter((e) => {
    const coincideCliente = !clienteFiltro || e.cliente === clienteFiltro;
    const coincideFechaDesde = !fechaDesde || e.fecha >= fechaDesde;
    const coincideFechaHasta = !fechaHasta || e.fecha <= fechaHasta;
    const coincideTracking = e.tracking
      .toLowerCase()
      .includes(trackingFiltro.toLowerCase());
    return (
      coincideCliente &&
      coincideFechaDesde &&
      coincideFechaHasta &&
      coincideTracking
    );
  });

  const navigate = useNavigate();

  const irAPago = () => {
    if (entregasFiltradas.length === 0) {
      alert("No hay entregas filtradas para pagar.");
      return;
    }

    const total = entregasFiltradas.reduce((sum, e) => sum + e.valor, 0);
    navigate("/contabilidad/pago-entregas", {
      state: {
        entregas: entregasFiltradas,
        total,
      },
    });
  };

  const valorTotal = entregasFiltradas.reduce((total, e) => total + e.valor, 0);

  const descargarCSV = () => {
    const encabezado = "Tracking,Fecha,Tipo,Cliente,Valor\n";
    const filas = entregasFiltradas
      .map((e) => `${e.tracking},${e.fecha},${e.tipo},${e.cliente},${e.valor}`)
      .join("\n");

    const blob = new Blob([encabezado + filas], {
      type: "text/csv;charset=utf-8;",
    });
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
          <select
            value={clienteFiltro}
            onChange={(e) => setClienteFiltro(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="Dropi">Dropi</option>
            <option value="Dafiti">Dafiti</option>
            <option value="Tridy">Tridy</option>
          </select>
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

        <button className="boton-accion" onClick={descargarCSV}>
          📥 Exportar CSV
        </button>
      </div>

      <div className="entregas-total">
        <strong>Total entregas: </strong>${valorTotal.toLocaleString()}
      </div>
      {entregasFiltradas.length > 0 && (
        <button className="boton-accion" onClick={irAPago}>
          💸 Pagar total 
        </button>
      )}

      <div className="entregas-tabla-container">
        <table className="entregas-tabla">
          <thead>
            <tr>
              <th>Tracking</th>
              <th>Fecha</th>
              <th>Tipo de Consignación</th>
              <th>Cliente</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {entregasFiltradas.length > 0 ? (
              entregasFiltradas.map((e, idx) => (
                <tr key={idx}>
                  <td>{e.tracking}</td>
                  <td>{e.fecha}</td>
                  <td>{e.tipo}</td>
                  <td>{e.cliente}</td>
                  <td>${e.valor.toLocaleString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  style={{ textAlign: "center", padding: "1rem" }}
                >
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
