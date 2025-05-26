// frontend/src/pages/contabilidad/Entregas.tsx
import { useState, useEffect } from "react";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "../../components/LoadingSpinner";
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

      const res = await fetch(`http://localhost:8000/entregas/entregas-consolidadas?${params.toString()}`);
      
      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      
      if (data.entregas && Array.isArray(data.entregas)) {
        setLiquidaciones(data.entregas);
        setEstadisticas(data.estadisticas);
        setMensaje(`✅ Cargadas ${data.entregas.length} entregas exitosamente`);
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
      const res = await fetch("http://localhost:8000/entregas/resumen-liquidaciones");
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
    if (datosFiltrados.length === 0) {
      alert("No hay datos para exportar");
      return;
    }

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
    
    // Configurar anchos de columna
    const colWidths = [
      { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 10 }, { wch: 12 },
      { wch: 12 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 15 }
    ];
    ws['!cols'] = colWidths;

    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    const fecha = new Date().toISOString().split("T")[0];
    saveAs(blob, `liquidaciones-${fecha}.xlsx`);
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

  const formatearFecha = (fecha: string) => {
    return new Date(fecha).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  };

  const formatearMoneda = (valor: number) => {
    return valor.toLocaleString('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  const total = datosFiltrados.reduce((sum, e) => sum + e.valor, 0);
  const clientesUnicos = Array.from(new Set(liquidaciones.map(e => e.cliente))).sort();

  return (
    <div className="entregas-page">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">📦 Liquidaciones por Cliente</h1>
        <p className="page-subtitle">
          Gestión integral de entregas y liquidaciones por cliente
        </p>
      </div>

      {/* Resumen Ejecutivo */}
      {resumenClientes.length > 0 && (
        <div className="resumen-section">
          <h3 className="section-title">📊 Resumen Ejecutivo</h3>
          <div className="resumen-grid">
            {resumenClientes.map((cliente) => (
              <div key={cliente.cliente} className="resumen-card">
                <h4 className="cliente-name">{cliente.cliente}</h4>
                <div className="resumen-stats">
                  <div className="stat-row">
                    <span className="stat-label">Total entregas:</span>
                    <span className="stat-value">{cliente.total_entregas.toLocaleString()}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Valor total:</span>
                    <span className="stat-value">{formatearMoneda(cliente.valor_total)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Conciliadas:</span>
                    <span className="stat-value highlight">{cliente.porcentaje_conciliadas.toFixed(1)}%</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Promedio:</span>
                    <span className="stat-value">{formatearMoneda(cliente.valor_promedio_entrega)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="filtros-section">
        <h3 className="section-title">🔍 Filtros de Búsqueda</h3>
        <div className="filtros-grid">
          <div className="filtro-group">
            <label className="filtro-label">Cliente:</label>
            <select 
              className="filtro-select"
              value={clienteFiltro} 
              onChange={(e) => setClienteFiltro(e.target.value)}
            >
              <option value="">Todos los clientes</option>
              {clientesUnicos.map(cliente => (
                <option key={cliente} value={cliente}>{cliente}</option>
              ))}
            </select>
          </div>
          
          <div className="filtro-group">
            <label className="filtro-label">Fecha desde:</label>
            <input 
              type="date" 
              className="filtro-input"
              value={fechaDesde} 
              onChange={(e) => setFechaDesde(e.target.value)} 
            />
          </div>
          
          <div className="filtro-group">
            <label className="filtro-label">Fecha hasta:</label>
            <input 
              type="date" 
              className="filtro-input"
              value={fechaHasta} 
              onChange={(e) => setFechaHasta(e.target.value)} 
            />
          </div>

          <div className="filtro-group checkbox-group">
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                className="filtro-checkbox"
                checked={soloConciliadas} 
                onChange={(e) => setSoloConciliadas(e.target.checked)} 
              />
              Solo entregas conciliadas
            </label>
          </div>
        </div>
        
        <div className="filtros-actions">
          <button 
            className="boton-accion secondary" 
            onClick={cargarEntregas} 
            disabled={cargando}
          >
            {cargando ? "⏳" : "🔄"} {cargando ? "Cargando..." : "Actualizar"}
          </button>
          <button 
            className="boton-accion primary" 
            onClick={exportarExcel} 
            disabled={cargando || datosFiltrados.length === 0}
          >
            📥 Exportar Excel
          </button>
        </div>
      </div>

      {/* Mensaje de Estado */}
      {mensaje && (
        <div className={`mensaje-card ${mensaje.includes('✅') ? 'success' : 'error'}`}>
          <span className="mensaje-text">{mensaje}</span>
        </div>
      )}

      {/* Estadísticas Actuales */}
      {estadisticas && (
        <div className="estadisticas-card">
          <div className="estadisticas-grid">
            <div className="stat-item">
              <span className="stat-number">{estadisticas.total_entregas.toLocaleString()}</span>
              <span className="stat-label">Total entregas</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{formatearMoneda(estadisticas.valor_total)}</span>
              <span className="stat-label">Valor total</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{datosFiltrados.length.toLocaleString()}</span>
              <span className="stat-label">Registros filtrados</span>
            </div>
          </div>
        </div>
      )}

      {/* Total y Acciones */}
      <div className="total-section">
        <div className="total-content">
          <div className="total-info">
            <span className="total-label">Total filtrado:</span>
            <span className="total-value">{formatearMoneda(total)}</span>
            {datosFiltrados.length !== liquidaciones.length && (
              <span className="total-details">
                ({datosFiltrados.length.toLocaleString()} de {liquidaciones.length.toLocaleString()} registros)
              </span>
            )}
          </div>
          
          {datosFiltrados.length > 0 && (
            <button 
              className="boton-accion primary" 
              onClick={irAPago}
              style={{ fontSize: '1.1rem', padding: '1rem 2rem' }}
            >
              💸 Procesar Liquidación ({datosFiltrados.length} entregas)
            </button>
          )}
        </div>
      </div>

      {/* Tabla de Entregas */}
      <div className="entregas-tabla-container">
        {cargando ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <LoadingSpinner />
          </div>
        ) : datosFiltrados.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem', 
            color: '#6b7280',
            fontSize: '1.1rem'
          }}>
            {liquidaciones.length === 0 ? 
              "📋 No hay entregas disponibles en el sistema." : 
              "🔍 No hay entregas que coincidan con los filtros aplicados."
            }
          </div>
        ) : (
          <table className="entregas-tabla">
            <thead>
              <tr>
                <th style={{ width: '120px' }}>Tracking</th>
                <th style={{ width: '100px' }}>Fecha</th>
                <th style={{ width: '80px' }}>Tipo</th>
                <th style={{ width: '100px' }}>Cliente</th>
                <th style={{ width: '100px', textAlign: 'right' }}>Valor</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Estado</th>
                <th style={{ width: '120px' }}>Conductor</th>
                <th style={{ width: '100px' }}>Entidad</th>
                <th style={{ width: '110px' }}>Conciliación</th>
              </tr>
            </thead>
            <tbody>
              {datosFiltrados.map((entrega, idx) => (
                <tr key={`${entrega.tracking}-${idx}`}>
                  <td>
                    <span className="tracking-code">{entrega.tracking}</span>
                  </td>
                  <td>{formatearFecha(entrega.fecha)}</td>
                  <td>
                    <span className="tipo-badge">{entrega.tipo}</span>
                  </td>
                  <td>
                    <span className="cliente-badge">{entrega.cliente}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="valor-money">
                      {formatearMoneda(entrega.valor)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`estado-badge estado-${entrega.estado_conciliacion.toLowerCase().replace(/\s+/g, '-')}`}>
                      {entrega.estado_conciliacion}
                    </span>
                  </td>
                  <td>
                    <span 
                      className="conductor-name" 
                      title={entrega.correo_conductor}
                    >
                      {entrega.correo_conductor.split('@')[0]}
                    </span>
                  </td>
                  <td>
                    <span className="entidad-name">{entrega.entidad_pago}</span>
                  </td>
                  <td>
                    <span className="fecha-conciliacion">
                      {entrega.fecha_conciliacion ? 
                        formatearFecha(entrega.fecha_conciliacion) : 
                        <span className="pendiente">Pendiente</span>
                      }
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Información adicional */}
      {datosFiltrados.length > 0 && (
        <div style={{ 
          marginTop: '2rem', 
          padding: '1rem', 
          background: 'white', 
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          textAlign: 'center',
          color: '#6b7280',
          fontSize: '0.9rem'
        }}>
          💡 <strong>Tip:</strong> Usa los filtros para encontrar entregas específicas. 
          Puedes exportar los datos filtrados a Excel para análisis detallado.
        </div>
      )}
    </div>
  );
}