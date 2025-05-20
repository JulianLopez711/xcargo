import { useState, useEffect } from "react";
import { saveAs } from "file-saver";

import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import "../../styles/contabilidad/Entregas.css";

interface Liquidacion {
  tracking: string;
  fecha: string;
  tipo: string;
  cliente: string;
  valor: number;
}

export default function LiquidacionesClientes() {
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [clienteFiltro, setClienteFiltro] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    fetch("https://api.x-cargo.co/pagos-cruzados/entregas-consolidadas")
      .then(res => res.json())
      .then(data => setLiquidaciones(data))
      .catch(err => {
        console.error("Error al cargar liquidaciones:", err);
        alert("Error al cargar datos desde el servidor.");
      });
  }, []);

  const datosFiltrados = liquidaciones.filter((e) => {
    const desde = !fechaDesde || e.fecha >= fechaDesde;
    const hasta = !fechaHasta || e.fecha <= fechaHasta;
    const cliente = !clienteFiltro || e.cliente === clienteFiltro;
    return desde && hasta && cliente;
  });

  const exportarExcel = () => {
    const hoja = datosFiltrados.map((e) => ({
      Tracking: e.tracking,
      Fecha: e.fecha,
      Tipo: e.tipo,
      Cliente: e.cliente,
      Valor: e.valor,
    }));

    const ws = XLSX.utils.json_to_sheet(hoja);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Liquidaciones");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(blob, `liquidaciones-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const irAPago = () => {
    if (datosFiltrados.length === 0) {
      alert("No hay registros filtrados para pagar.");
      return;
    }

    const total = datosFiltrados.reduce((sum, e) => sum + e.valor, 0);
    navigate("/contabilidad/pago-entregas", {
      state: {
        entregas: datosFiltrados,
        total,
      },
    });
  };

  const total = datosFiltrados.reduce((sum, e) => sum + e.valor, 0);

  return (
    <div className="entregas-page">
      <h2 className="entregas-title">Liquidaciones por Cliente</h2>

      <div className="entregas-filtros">
        <label>
          Cliente:
          <select value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)}>
            <option value="">Todos</option>
            <option value="Dropi">Dropi</option>
            <option value="Dafiti">Dafiti</option>
            <option value="Tridy">Tridy</option>
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
        <button className="boton-accion" onClick={exportarExcel}>
          📥 Exportar Excel
        </button>
      </div>

      <div className="entregas-total">
        <strong>Total filtrado:</strong> ${total.toLocaleString()}
      </div>

      {datosFiltrados.length > 0 && (
        <button className="boton-accion" onClick={irAPago}>
          💸 Pagar Liquidación
        </button>
      )}

      <div className="entregas-tabla-container">
        <table className="entregas-tabla">
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
            {datosFiltrados.map((e, idx) => (
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
    </div>
  );
}
