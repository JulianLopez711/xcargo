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
  estado_conciliacion: string;
  referencia_pago: string;
  correo_conductor: string;
  entidad_pago: string;
  fecha_conciliacion?: string;
}

interface EstadisticasEntregas {
  total_entregas: number;
  valor_total: number;
  clientes: Record<string, { cantidad: number; valor: number }>;
}

interface ResumenLiquidacion {
  cliente: string;
  total_entregas: number;
  valor_total: number;
  entregas_conciliadas: number;
  porcentaje_conciliadas: number;
  valor_promedio_entrega: number;
}

export default function LiquidacionesClientes() {
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [estadisticas, setEstadisticas] = useState<EstadisticasEntregas | null>(null);
  const [resumenClientes, setResumenClientes] = useState<ResumenLiquidacion[]>([]);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [clienteFiltro, setClienteFiltro] = useState("");
  const [soloConciliadas, setSoloConciliadas] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const navigate = useNavigate();

  const cargarEntregas = async () => {
    setCargando(true);
    setMensaje("");
    
    try {
      const params = new URLSearchParams();
      if (clienteFiltro) params.append("cliente", clienteFiltro);
      if (fechaDesde) params.append("desde", fechaDesde);
      if (fechaHasta) params.append("hasta", fechaHasta);
      params.append("solo_conciliadas", soloConciliadas.toString());

      const res = await fetch(`https://api.x-cargo.co/entregas/entregas-consolidadas?${params.toString()}`);
      
      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      
      if (data.entregas && Array.isArray(data.entregas)) {
        setLiquidaciones(data.entregas);
        setEstadisticas(data.estadisticas);
        setMensaje(`✅ Cargadas ${data.entregas.length} entregas`);
      } else {
        throw new Error("Formato de respuesta inválido");
      }
    } catch (err: any) {
      console.error("Error al cargar entregas:", err);
      setMensaje(`❌ Error: ${err.message}`);
      setLiquidaciones([]);
      setEstadisticas(null);
    } finally {
      setCargando(false);
    }
  };

  const cargarResumenClientes = async () => {
    try {
      const res = await fetch("https://api.x-cargo.co/entregas/resumen-liquidaciones");
      if (res.ok) {
        const data = await res.json();
        setResumenClientes(data);
      }
    } catch (err) {
      console.error("Error cargando resumen de clientes:", err);
    }
  };

  useEffect(() => {
    cargarEntregas();
    cargarResumenClientes();
  }, []);

  useEffect(() => {
    if (fechaDesde || fechaHasta || clienteFiltro || !soloConciliadas) {
      cargarEntregas();
    }
  }, [fechaDesde, fechaHasta, clienteFiltro, soloConciliadas]);

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
      Estado: e.estado_conciliacion,
      "Ref. Pago": e.referencia_pago,
      Conductor: e.correo_conductor,
      "Entidad Pago": e.entidad_pago,
      "Fecha Conciliación": e.fecha_conciliacion || "N/A"
    }));

    const ws = XLSX.utils.json_to_sheet(hoja);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Liquidaciones");
    
    // Ajustar ancho de columnas
    const colWidths = [
      { wch: 15 }, // Tracking
      { wch: 12 }, // Fecha
      { wch: 15 }, // Tipo
      { wch: 10 }, // Cliente
      { wch: 12 }, // Valor
      { wch: 12 }, // Estado
      { wch: 20 }, // Ref. Pago
      { wch: 25 }, // Conductor
      { wch: 15 }, // Entidad Pago
      { wch: 15 }  // Fecha Conciliación
    ];
    ws['!cols'] = colWidths;

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
        cliente: clienteFiltro || "Múltiples clientes"
      },
    });
  };

  const total = datosFiltrados.reduce((sum, e) => sum + e.valor, 0);
  const clientesUnicos = Array.from(new Set(liquidaciones.map(e => e.cliente))).sort();

  return (
    <div className="entregas-page">
      <h2 className="entregas-title">Liquidaciones por Cliente</h2>

      {/* Estadísticas de resumen */}
      {resumenClientes.length > 0 && (
        <div className="resumen-clientes">
          <h3>📊 Resumen Ejecutivo</h3>
          <div className="resumen-grid">
            {resumenClientes.map((cliente) => (
              <div key={cliente.cliente} className="resumen-card">
                <h4>{cliente.cliente}</h4>
                <div className="resumen-stats">
                  <span>Entregas: {cliente.total_entregas}</span>
                  <span>Valor: ${cliente.valor_total.toLocaleString()}</span>
                  <span>Conciliadas: {cliente.porcentaje_conciliadas}%</span>
                  <span>Promedio: ${cliente.valor_promedio_entrega.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="entregas-filtros">
        <label>
          Cliente:
          <select value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)}>
            <option value="">Todos los clientes</option>
            {clientesUnicos.map(cliente => (
              <option key={cliente} value={cliente}>{cliente}</option>
            ))}
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

        <label className="checkbox-label">
          <input 
            type="checkbox" 
            checked={soloConciliadas} 
            onChange={(e) => setSoloConciliadas(e.target.checked)} 
          />
          Solo conciliadas
        </label>
        
        <button className="boton-accion" onClick={exportarExcel} disabled={cargando}>
          📥 Exportar Excel
        </button>
        
        <button className="boton-accion secondary" onClick={cargarEntregas} disabled={cargando}>
          🔄 Actualizar
        </button>
      </div>

      {/* Mensaje de estado */}
      {mensaje && (
        <div className={`mensaje-estado ${mensaje.includes('✅') ? 'success' : 'error'}`}>
          {mensaje}
        </div>
      )}

      {/* Estadísticas actuales */}
      {estadisticas && (
        <div className="estadisticas-actuales">
          <div className="stat-item">
            <span className="stat-label">Total entregas:</span>
            <span className="stat-value">{estadisticas.total_entregas}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Valor total:</span>
            <span className="stat-value">${estadisticas.valor_total.toLocaleString()}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Filtrado:</span>
            <span className="stat-value">{datosFiltrados.length} registros</span>
          </div>
        </div>
      )}

      <div className="entregas-total">
        <strong>Total filtrado:</strong> ${total.toLocaleString()}
        {datosFiltrados.length !== liquidaciones.length && (
          <span className="filtro-info">
            ({datosFiltrados.length} de {liquidaciones.length} registros)
          </span>
        )}
      </div>

      {datosFiltrados.length > 0 && (
        <button className="boton-accion primary" onClick={irAPago}>
          💸 Procesar Liquidación ({datosFiltrados.length} entregas)
        </button>
      )}

      {/* Tabla de entregas */}
      <div className="entregas-tabla-container">
        {cargando ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <span>Cargando entregas...</span>
          </div>
        ) : (
          <table className="entregas-tabla">
            <thead>
              <tr>
                <th>Tracking</th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Cliente</th>
                <th>Valor</th>
                <th>Estado</th>
                <th>Conductor</th>
                <th>Entidad</th>
                <th>Conciliación</th>
              </tr>
            </thead>
            <tbody>
              {datosFiltrados.length > 0 ? (
                datosFiltrados.map((e, idx) => (
                  <tr key={idx} className={`estado-${e.estado_conciliacion.toLowerCase().replace(' ', '-')}`}>
                    <td>
                      <span className="tracking-code">{e.tracking}</span>
                    </td>
                    <td>{new Date(e.fecha).toLocaleDateString()}</td>
                    <td>
                      <span className="tipo-badge">{e.tipo}</span>
                    </td>
                    <td>
                      <span className="cliente-badge">{e.cliente}</span>
                    </td>
                    <td className="valor-cell">${e.valor.toLocaleString()}</td>
                    <td>
                      <span className={`estado-badge ${e.estado_conciliacion.toLowerCase().replace(' ', '-')}`}>
                        {e.estado_conciliacion}
                      </span>
                    </td>
                    <td className="conductor-cell">
                      {e.correo_conductor.split('@')[0]}
                    </td>
                    <td>{e.entidad_pago}</td>
                    <td className="conciliacion-cell">
                      {e.fecha_conciliacion ? 
                        new Date(e.fecha_conciliacion).toLocaleDateString() : 
                        "Pendiente"
                      }
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="no-data">
                    {liquidaciones.length === 0 ? 
                      "No hay entregas disponibles." : 
                      "No hay entregas que coincidan con los filtros aplicados."
                    }
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}