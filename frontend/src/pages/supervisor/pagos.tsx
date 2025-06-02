// src/pages/supervisor/Pagos.tsx
import { useEffect, useState } from "react";
import { useAuth } from "../../context/authContext";
import "../../styles/supervisor/Pagos.css";

interface GuiaPendiente {
  tracking_number: string;
  cliente: string;
  ciudad: string;
  departamento: string;
  valor: number;
  fecha: string;
  estado: string;
  carrier: string;
  conductor: {
    nombre: string;
    email: string;
    telefono: string;
  };
}

interface ResumenPagos {
  guias: GuiaPendiente[];
  total: number;
  pagina_actual: number;
  total_paginas: number;
  carriers_supervisados: number[];
}

export default function PagosSupervisor() {
  const { user } = useAuth();
  const [guias, setGuias] = useState<GuiaPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [filtroConductor, setFiltroConductor] = useState("");
  const [selectedGuias, setSelectedGuias] = useState<string[]>([]);
  const [paginaActual, setPaginaActual] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [totalGuias, setTotalGuias] = useState(0);
  const guiasPorPagina = 20;

  useEffect(() => {
    cargarGuiasPendientes();
  }, [paginaActual, filtroConductor]);

  const cargarGuiasPendientes = async () => {
    try {
      setLoading(true);
      const offset = (paginaActual - 1) * guiasPorPagina;
      
      const params = new URLSearchParams({
        limit: guiasPorPagina.toString(),
        offset: offset.toString()
      });
      
      if (filtroConductor.trim()) {
        params.append('conductor', filtroConductor.trim());
      }

      const response = await fetch(`http://localhost:8000/supervisor/guias-pendientes?${params}`, {
        headers: {
          "X-User-Email": user?.email || "",
          "X-User-Role": user?.role || "supervisor"
        }
      });

      if (response.ok) {
        const data: ResumenPagos = await response.json();
        
        setGuias(data.guias || []);
        setTotalGuias(data.total || 0);
        setTotalPaginas(data.total_paginas || 1);
        setError("");
      } else {
        throw new Error(`Error HTTP ${response.status}`);
      }
    } catch (error) {
      console.error("Error cargando guías pendientes:", error);
      setError("Error al cargar las guías pendientes. Usando datos de ejemplo.");
      
      // Datos de ejemplo como fallback
      setGuias([
        {
          tracking_number: "GU001234",
          cliente: "DROPI - XCargo",
          ciudad: "Bogotá",
          departamento: "Cundinamarca",
          valor: 85000,
          fecha: "2025-05-20",
          estado: "302 - En ruta de última milla",
          carrier: "Operación Tyc",
          conductor: {
            nombre: "Juan Pérez",
            email: "juan.perez@empresa.com",
            telefono: "+57 300 123 4567"
          }
        }
      ]);
      setTotalGuias(1);
      setTotalPaginas(1);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar guías por estado (frontend)
  const guiasFiltradas = guias.filter(guia => {
    if (filtroEstado === "todos") return true;
    if (filtroEstado === "en_ruta") return guia.estado.includes("302") || guia.estado.includes("ruta");
    if (filtroEstado === "asignado") return guia.estado.includes("301") || guia.estado.includes("asignado");
    if (filtroEstado === "pendiente") return guia.estado.toLowerCase().includes("pendiente");
    return true;
  });

  const toggleSeleccionGuia = (trackingNumber: string) => {
    if (selectedGuias.includes(trackingNumber)) {
      setSelectedGuias(selectedGuias.filter(id => id !== trackingNumber));
    } else {
      setSelectedGuias([...selectedGuias, trackingNumber]);
    }
  };

  const seleccionarTodas = () => {
    if (selectedGuias.length === guiasFiltradas.length) {
      setSelectedGuias([]);
    } else {
      setSelectedGuias(guiasFiltradas.map(g => g.tracking_number));
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getEstadoColor = (estado: string) => {
    if (estado.includes("302") || estado.includes("ruta")) return "warning";
    if (estado.includes("301") || estado.includes("asignado")) return "info";
    if (estado.includes("360") || estado.includes("entregado")) return "success";
    if (estado.toLowerCase().includes("pendiente")) return "danger";
    return "secondary";
  };

  const getEstadoTexto = (estado: string) => {
    if (estado.includes("302")) return "En ruta";
    if (estado.includes("301")) return "Asignado";
    if (estado.includes("360")) return "Entregado";
    return estado;
  };

  const getPrioridadDias = (fecha: string) => {
    const fechaGuia = new Date(fecha);
    const hoy = new Date();
    const diferencia = Math.floor((hoy.getTime() - fechaGuia.getTime()) / (1000 * 60 * 60 * 24));
    return diferencia;
  };

  const getPrioridadColor = (dias: number) => {
    if (dias >= 10) return "high";
    if (dias >= 5) return "medium";
    return "low";
  };

  const totalMontoFiltrado = guiasFiltradas.reduce((sum, g) => sum + g.valor, 0);
  const totalMontoSeleccionado = guias
    .filter(g => selectedGuias.includes(g.tracking_number))
    .reduce((sum, g) => sum + g.valor, 0);

  // Estadísticas por estado
  const estadisticas = {
    en_ruta: guias.filter(g => g.estado.includes("302")).length,
    asignado: guias.filter(g => g.estado.includes("301")).length,
    otros: guias.filter(g => !g.estado.includes("302") && !g.estado.includes("301")).length
  };

  if (loading) {
    return <div className="loading">Cargando guías pendientes...</div>;
  }

  return (
    <div className="pagos-supervisor">
      <div className="page-header">
        <h1>Guías Pendientes - Supervisor</h1>
        <div className="header-info">
          <div className="empresa-info">
            <span className="empresa-badge">
              🏢 {user?.empresa_carrier || "Sin empresa asignada"}
            </span>
          </div>
          <div className="total-pendiente">
            <strong>Total: {formatCurrency(totalMontoFiltrado)}</strong>
            <span className="guias-count">({guiasFiltradas.length} guías)</span>
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
          <span className="summary-number">{estadisticas.en_ruta}</span>
          <span className="summary-label">En Ruta</span>
        </div>
        <div className="summary-card">
          <span className="summary-number">{estadisticas.asignado}</span>
          <span className="summary-label">Asignadas</span>
        </div>
        <div className="summary-card">
          <span className="summary-number">{estadisticas.otros}</span>
          <span className="summary-label">Otros Estados</span>
        </div>
        <div className="summary-card">
          <span className="summary-number">{totalGuias}</span>
          <span className="summary-label">Total General</span>
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
            <option value="en_ruta">En ruta (302)</option>
            <option value="asignado">Asignadas (301)</option>
            <option value="pendiente">Pendientes</option>
          </select>

          <button 
            className="btn-secondary"
            onClick={cargarGuiasPendientes}
          >
            🔄 Actualizar
          </button>
        </div>

        {selectedGuias.length > 0 && (
          <div className="batch-actions">
            <span>{selectedGuias.length} guías seleccionadas</span>
            <span className="monto-seleccionado">
              {formatCurrency(totalMontoSeleccionado)}
            </span>
            <button 
              className="btn-primary"
              onClick={() => alert(`Funcionalidad pendiente: procesar ${selectedGuias.length} guías seleccionadas`)}
            >
              Procesar Seleccionadas
            </button>
            <button 
              className="btn-secondary"
              onClick={() => setSelectedGuias([])}
            >
              Limpiar Selección
            </button>
          </div>
        )}
      </div>

      {/* Tabla de guías */}
      <div className="guias-table">
        <div className="table-header">
          <div className="header-cell checkbox-cell">
            <input
              type="checkbox"
              onChange={seleccionarTodas}
              checked={selectedGuias.length === guiasFiltradas.length && guiasFiltradas.length > 0}
            />
          </div>
          <div className="header-cell">Tracking</div>
          <div className="header-cell">Conductor</div>
          <div className="header-cell">Cliente</div>
          <div className="header-cell">Destino</div>
          <div className="header-cell">Valor</div>
          <div className="header-cell">Estado</div>
          <div className="header-cell">Días</div>
          <div className="header-cell">Contacto</div>
        </div>

        {guiasFiltradas.map((guia) => {
          const diasPendiente = getPrioridadDias(guia.fecha);
          
          return (
            <div key={guia.tracking_number} className="table-row">
              <div className="table-cell checkbox-cell">
                <input
                  type="checkbox"
                  checked={selectedGuias.includes(guia.tracking_number)}
                  onChange={() => toggleSeleccionGuia(guia.tracking_number)}
                />
              </div>
              <div className="table-cell">
                <span className="tracking-number">{guia.tracking_number}</span>
              </div>
              <div className="table-cell">
                <div className="conductor-info">
                  <span className="conductor-name">{guia.conductor.nombre}</span>
                </div>
              </div>
              <div className="table-cell">
                <span className="cliente-name">{guia.cliente}</span>
              </div>
              <div className="table-cell">
                <div className="destino-info">
                  <span className="ciudad">{guia.ciudad}</span>
                  <span className="departamento">{guia.departamento}</span>
                </div>
              </div>
              <div className="table-cell">
                <span className="valor">{formatCurrency(guia.valor)}</span>
              </div>
              <div className="table-cell">
                <span className={`status-badge ${getEstadoColor(guia.estado)}`}>
                  {getEstadoTexto(guia.estado)}
                </span>
              </div>
              <div className="table-cell">
                <span className={`dias-badge ${getPrioridadColor(diasPendiente)}`}>
                  {diasPendiente} días
                </span>
              </div>
              <div className="table-cell">
                <div className="contacto-actions">
                  {guia.conductor.telefono && (
                    <a 
                      href={`tel:${guia.conductor.telefono}`}
                      className="btn-small btn-phone"
                      title="Llamar"
                    >
                      📞
                    </a>
                  )}
                  {guia.conductor.email && (
                    <a 
                      href={`mailto:${guia.conductor.email}`}
                      className="btn-small btn-email"
                      title="Enviar email"
                    >
                      ✉️
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {guiasFiltradas.length === 0 && !loading && (
        <div className="empty-state">
          <p>No se encontraron guías pendientes con los filtros aplicados</p>
          <button 
            className="btn-primary"
            onClick={cargarGuiasPendientes}
          >
            🔄 Recargar
          </button>
        </div>
      )}

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="pagination">
          <button 
            className="btn-secondary"
            disabled={paginaActual === 1}
            onClick={() => setPaginaActual(paginaActual - 1)}
          >
            ← Anterior
          </button>
          
          <span className="pagination-info">
            Página {paginaActual} de {totalPaginas}
          </span>
          
          <button 
            className="btn-secondary"
            disabled={paginaActual === totalPaginas}
            onClick={() => setPaginaActual(paginaActual + 1)}
          >
            Siguiente →
          </button>
        </div>
      )}

      {/* Estadísticas del pie */}
      <div className="stats-footer">
        <div className="stat-item">
          <span className="stat-label">Mostrando:</span>
          <span className="stat-value">{guiasFiltradas.length} de {totalGuias} guías</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Valor total visible:</span>
          <span className="stat-value">{formatCurrency(totalMontoFiltrado)}</span>
        </div>
        {selectedGuias.length > 0 && (
          <div className="stat-item highlight">
            <span className="stat-label">Seleccionadas:</span>
            <span className="stat-value">
              {selectedGuias.length} guías • {formatCurrency(totalMontoSeleccionado)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}