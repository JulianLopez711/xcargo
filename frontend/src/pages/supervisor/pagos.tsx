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
  }, [filtroConductor]); // Eliminada la dependencia paginaActual

  const cargarPagos = async () => {
    try {
      setLoading(true);
      const token = user?.token || localStorage.getItem("token") || "";
      
      const response = await fetch(`http://127.0.0.1:8000/supervisor/pagos-conductor`, {
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
          acc.monto_total += pago.valor;
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

  // Filtrar pagos por estado y conductor (frontend)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
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

      {/* Tabla de pagos */}
      <div className="pagos-table">
        <div className="table-header">
          <div className="header-cell">Referencia</div>
          <div className="header-cell">Conductor</div>
          <div className="header-cell">Valor</div>
          <div className="header-cell">Fecha</div>
          <div className="header-cell">Estado</div>
          <div className="header-cell">Guías</div>
          <div className="header-cell">Acciones</div>
        </div>

        {pagos.map((pago) => (
          <div key={pago.referencia_pago} className="table-row">
            <div className="table-cell">
              <span className="referencia">{pago.referencia_pago}</span>
            </div>
            <div className="table-cell">
              <span className="conductor">{pago.correo_conductor}</span>
            </div>
            <div className="table-cell">
              <span className="valor">{formatCurrency(pago.valor)}</span>
            </div>
            <div className="table-cell">
              <span className="fecha">{new Date(pago.fecha).toLocaleDateString()}</span>
            </div>
            <div className="table-cell">
              <span className={`estado-badge ${pago.estado_conciliacion.toLowerCase()}`}>
                {pago.estado_conciliacion || 'Pendiente'}
              </span>
            </div>
            <div className="table-cell">
              <span className="guias-count">{pago.num_guias} guías</span>
              <span className="guias-preview">{pago.trackings_preview}</span>
            </div>
            <div className="table-cell">
              <div className="acciones">
                {pago.imagen && (
                  <button 
                    className="btn-icon"
                    onClick={() => setModalImage(pago.imagen)}
                    title="Ver comprobante"
                  >
                    📄
                  </button>
                )}
                <button 
                  className="btn-icon"
                  onClick={() => alert(`Detalles de pago ${pago.referencia_pago}`)}
                  title="Ver detalles"
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

      {pagos.length === 0 && !loading && (
        <div className="empty-state">
          <p>No se encontraron pagos registrados</p>
        </div>
      )}
    </div>
  );
}



