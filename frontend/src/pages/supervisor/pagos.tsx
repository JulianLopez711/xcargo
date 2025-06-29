// src/pages/supervisor/Pagos.tsx
import { useEffect, useState } from "react";
import { useAuth } from "../../context/authContext";
import "../../styles/supervisor/Pagos.css";
import "../../styles/supervisor/cargando.css";
import LogoXcargo from "../../../public/icons/Logo192.png";

const FECHA_INICIO = '2025-06-10';

interface EstadisticasPagos {
  total_pagos: number;
  monto_total: number;
  pagos_pendientes: number;
  pagos_aprobados: number;
}

interface Pago {
  referencia_pago: string;
  valor: number;
  valor_total_consignacion?: number;
  fecha: string;
  entidad: string;
  estado: string;
  tipo: string;
  imagen: string;
  novedades: string;
  num_guias: number;
  trackings_preview: string;
  correo_conductor: string;
  estado_conciliacion: string;
  nombre_conductor: string;
}

export default function PagosSupervisor() {
  const { user } = useAuth();
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [pagosFiltrados, setPagosFiltrados] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [filtroConductor, setFiltroConductor] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [estadisticas, setEstadisticas] = useState<EstadisticasPagos>({
    total_pagos: 0,
    monto_total: 0,
    pagos_pendientes: 0,
    pagos_aprobados: 0
  });
  const [modalImage, setModalImage] = useState<string | null>(null);

  useEffect(() => {
    cargarPagos();
  }, []);

  useEffect(() => {
    filtrarPagos();
  }, [pagos, filtroConductor, filtroEstado]);

  const cargarPagos = async () => {
    try {
      setLoading(true);
      const token = user?.token || localStorage.getItem("token") || "";
      
      const response = await fetch(`https://api.x-cargo.co/supervisor/pagos-conductor`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-User-Email": user?.email || "",
          "X-User-Role": user?.role || "supervisor"
        }
      });

      if (response.ok) {
        const data = await response.json();
        setPagos(data);
        
        // Calcular estadísticas
        const stats = data.reduce((acc: EstadisticasPagos, pago: Pago) => {
          acc.total_pagos++;
          acc.monto_total += pago.valor_total_consignacion || pago.valor;
          if (pago.estado_conciliacion.toLowerCase() === 'pendiente') {
            acc.pagos_pendientes++;
          }
          if (pago.estado_conciliacion.toLowerCase() === 'aprobado') {
            acc.pagos_aprobados++;
          }
          return acc;
        }, {
          total_pagos: 0,
          monto_total: 0,
          pagos_pendientes: 0,
          pagos_aprobados: 0
        });
        
        setEstadisticas(stats);
        setError("");
      } else {
        throw new Error(`Error HTTP ${response.status}`);
      }
    } catch (error) {
      console.error("Error cargando pagos:", error);
      setError("Error al cargar los pagos"); 
    } finally {
      setLoading(false);
    }
  };

  const filtrarPagos = () => {
    let pagosFiltrados = pagos;

    // Filtrar por conductor
    if (filtroConductor.trim()) {
      pagosFiltrados = pagosFiltrados.filter(pago =>
        (pago.nombre_conductor || pago.correo_conductor)
          .toLowerCase()
          .includes(filtroConductor.toLowerCase())
      );
    }

    // Filtrar por estado
    if (filtroEstado !== "todos") {
      pagosFiltrados = pagosFiltrados.filter(pago =>
        pago.estado_conciliacion.toLowerCase() === filtroEstado.toLowerCase()
      );
    }

    setPagosFiltrados(pagosFiltrados);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };


  if (loading) {
    return (
      <div className="loading-container">
        <img src={LogoXcargo} alt="Cargando dashboard" className="loading-logo" />
      </div>
    );
  }

  return (
    <div className="pagos-supervisor">
      <div className="page-header">
        <h1>Pagos de Conductores</h1>
        <div className="header-info">
          <div className="empresa-info">
            <span className="empresa-badge">
              🏢 {user?.empresa_carrier || "Sin empresa asignada"}
            </span>
            <span className="fecha-badge">
              📅 Datos desde: {new Date(FECHA_INICIO).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* Resumen de estadísticas */}
      <div className="pagos-summary">
        <div className="summary-card">
          <span className="summary-number">{estadisticas.total_pagos}</span>
          <span className="summary-label">Total Pagos</span>
        </div>
        <div className="summary-card">
          <span className="summary-number">{formatCurrency(estadisticas.monto_total)}</span>
          <span className="summary-label">Monto Total</span>
        </div>
        <div className="summary-card">
          <span className="summary-number">{estadisticas.pagos_pendientes}</span>
          <span className="summary-label">Pendientes</span>
        </div>
        <div className="summary-card">
          <span className="summary-number">{estadisticas.pagos_aprobados}</span>
          <span className="summary-label">Aprobados</span>
        </div>
      </div>

      {/* Filtros y controles */}
      <div className="controls-section">
        <div className="filters">
          <input
            type="text"
            placeholder="Buscar por conductor..."
            value={filtroConductor}
            onChange={(e) => setFiltroConductor(e.target.value)}
            className="search-input"
          />

          <select 
            value={filtroEstado} 
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="filter-select"
          >
            <option value="todos">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="aprobado">Aprobados</option>
            <option value="rechazado">Rechazados</option>
          </select>

          <button 
            className="btn-secondary"
            onClick={cargarPagos}
          >
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* Información de resultados */}
      {pagosFiltrados.length !== pagos.length && (
        <div className="pagos-info">
          Mostrando {pagosFiltrados.length} de {pagos.length} pagos
        </div>
      )}

      {/* Tabla de pagos */}
      <div className="pagos-table">
        <div 
          className="table-header"
          style={{
            display: 'grid',
            gridTemplateColumns: '300px 200px 120px 100px 120px 150px 140px',
            backgroundColor: '#f8fafc',
            borderBottom: '2px solid #e2e8f0'
          }}
        >
          <div className="header-cell" style={{ padding: '1rem 0.75rem', fontWeight: '600' }}>Referencia</div>
          <div className="header-cell" style={{ padding: '1rem 0.75rem', fontWeight: '600' }}>Conductor</div>
          <div className="header-cell" style={{ padding: '1rem 0.75rem', fontWeight: '600' }}>Valor</div>
          <div className="header-cell" style={{ padding: '1rem 0.75rem', fontWeight: '600' }}>Fecha</div>
          <div className="header-cell" style={{ padding: '1rem 0.75rem', fontWeight: '600' }}>Estado</div>
          <div className="header-cell" style={{ padding: '1rem 0.75rem', fontWeight: '600' }}>Guías</div>
          <div className="header-cell" style={{ padding: '1rem 0.75rem', fontWeight: '600' }}>Acciones</div>
        </div>
        
        {pagosFiltrados.map((pago) => (
          <div 
            key={pago.referencia_pago} 
            className="table-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '300px 200px 120px 100px 120px 150px 140px',
              borderBottom: '1px solid #f1f5f9'
            }}
          >
            <div 
              className="table-cell"
              style={{
                padding: '1rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                overflow: 'hidden',
                width: '300px'
              }}
            >
              <span 
                className="referencia" 
                title={pago.referencia_pago}
                style={{
                  fontFamily: 'Courier New, monospace',
                  fontWeight: '600',
                  color: '#1e293b',
                  background: '#f1f5f9',
                  padding: '0.375rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'block',
                  maxWidth: '280px'
                }}
              >
                {pago.referencia_pago}
              </span>
            </div>
            
            <div 
              className="table-cell"
              style={{
                padding: '1rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                overflow: 'hidden',
                width: '200px'
              }}
            >
              <span 
                className="conductor-nombre" 
                title={pago.nombre_conductor || pago.correo_conductor}
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '180px'
                }}
              >
                {pago.nombre_conductor || pago.correo_conductor}
              </span>
            </div>
            
            <div 
              className="table-cell"
              style={{
                padding: '1rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                width: '120px'
              }}
            >
              <span className="valor" style={{ fontWeight: '700', color: '#10b981' }}>
                {formatCurrency(pago.valor_total_consignacion || pago.valor)}
              </span>
            </div>
            
            <div 
              className="table-cell"
              style={{
                padding: '1rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                width: '100px'
              }}
            >
              <span className="fecha" style={{ fontSize: '0.85rem' }}>
                {new Date(pago.fecha).toLocaleDateString('es-CO')}
              </span>
            </div>
            
            <div 
              className="table-cell"
              style={{
                padding: '1rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                width: '120px'
              }}
            >
              <span 
                className={`estado-badge ${pago.estado_conciliacion.toLowerCase()}`}
                style={{
                  padding: '0.375rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  minWidth: '80px'
                }}
              >
                {pago.estado_conciliacion || 'Pendiente'}
              </span>
            </div>
            
            <div 
              className="table-cell"
              style={{
                padding: '1rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                width: '150px'
              }}
            >
              <div className="guias-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span className="guias-count" style={{ fontWeight: '600', fontSize: '0.8rem' }}>
                  {pago.num_guias} guías
                </span>
                {pago.trackings_preview && (
                  <span 
                    className="guias-preview" 
                    title={pago.trackings_preview}
                    style={{
                      fontSize: '0.75rem',
                      color: '#64748b',
                      background: '#f8fafc',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '130px'
                    }}
                  >
                    {truncateText(pago.trackings_preview, 12)}
                  </span>
                )}
              </div>
            </div>
            
            <div 
              className="table-cell"
              style={{
                padding: '1rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '140px'
              }}
            >
              <div className="acciones" style={{ display: 'flex', gap: '0.5rem' }}>
                {pago.imagen && (
                  <button 
                    className="btn-icon"
                    onClick={() => setModalImage(pago.imagen)}
                    title="Ver comprobante"
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      width: '36px',
                      height: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    📄
                  </button>
                )}
                <button 
                  className="btn-icon"
                  onClick={() => alert(`Detalles de pago ${pago.referencia_pago}`)}
                  title="Ver detalles"
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  🔍
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal para mostrar imagen */}
      {modalImage && (
        <div className="modal-overlay" onClick={() => setModalImage(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModalImage(null)}>×</button>
            <img src={modalImage} alt="Comprobante de pago" className="modal-image" />
          </div>
        </div>
      )}

      {pagosFiltrados.length === 0 && !loading && (
        <div className="empty-state">
          <p>
            {pagos.length === 0 
              ? "No se encontraron pagos registrados" 
              : "No se encontraron pagos con los filtros aplicados"
            }
          </p>
        </div>
      )}
    </div>
  );
}