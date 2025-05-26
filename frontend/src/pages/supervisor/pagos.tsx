// src/pages/supervisor/Pagos.tsx
import { useEffect, useState } from "react";
import { useAuth } from "../../context/authContext";
import "../../styles/supervisor/Pagos.css";

interface PagoPendiente {
  id: string;
  conductor_nombre: string;
  conductor_id: string;
  guia_numero: string;
  cliente: string;
  destino: string;
  monto: number;
  fecha_entrega: string;
  estado: "pendiente" | "en_revision" | "aprobado" | "pagado";
  dias_pendiente: number;
  tipo_pago: "efectivo" | "transferencia" | "consignacion";
  observaciones?: string;
}

export default function PagosSupervisor() {
  const { user } = useAuth();
  const [pagos, setPagos] = useState<PagoPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [filtroConductor, setFiltroConductor] = useState("");
  const [selectedPagos, setSelectedPagos] = useState<string[]>([]);

  useEffect(() => {
    cargarPagos();
  }, []);

  const cargarPagos = async () => {
    try {
      // TODO: Reemplazar con endpoint real
      const response = await fetch(`http://localhost:8000/supervisor/pagos/${user?.empresa_carrier}`);
      if (response.ok) {
        const data = await response.json();
        setPagos(data);
      } else {
        // Datos de ejemplo
        setPagos([
          {
            id: "1",
            conductor_nombre: "Juan Pérez",
            conductor_id: "1",
            guia_numero: "GU001234",
            cliente: "Almacenes Éxito",
            destino: "Bogotá - Suba",
            monto: 85000,
            fecha_entrega: "2025-05-20",
            estado: "pendiente",
            dias_pendiente: 5,
            tipo_pago: "efectivo"
          },
          {
            id: "2",
            conductor_nombre: "María González",
            conductor_id: "2",
            guia_numero: "GU001235",
            cliente: "Carrefour",
            destino: "Medellín - Envigado",
            monto: 120000,
            fecha_entrega: "2025-05-22",
            estado: "en_revision",
            dias_pendiente: 3,
            tipo_pago: "transferencia"
          },
          {
            id: "3",
            conductor_nombre: "Carlos Rodríguez",
            conductor_id: "3",
            guia_numero: "GU001236",
            cliente: "Jumbo",
            destino: "Cali - Norte",
            monto: 95000,
            fecha_entrega: "2025-05-18",
            estado: "pendiente",
            dias_pendiente: 7,
            tipo_pago: "efectivo"
          },
          {
            id: "4",
            conductor_nombre: "Juan Pérez",
            conductor_id: "1",
            guia_numero: "GU001237",
            cliente: "Falabella",
            destino: "Barranquilla - Centro",
            monto: 110000,
            fecha_entrega: "2025-05-19",
            estado: "aprobado",
            dias_pendiente: 6,
            tipo_pago: "consignacion"
          }
        ]);
      }
    } catch (error) {
      console.error("Error cargando pagos:", error);
    } finally {
      setLoading(false);
    }
  };

  const pagosFiltrados = pagos.filter(pago => {
    const coincideEstado = filtroEstado === "todos" || pago.estado === filtroEstado;
    const coincideConductor = pago.conductor_nombre.toLowerCase().includes(filtroConductor.toLowerCase());
    return coincideEstado && coincideConductor;
  });

  const cambiarEstadoPago = async (pagoId: string, nuevoEstado: string) => {
    try {
      // TODO: Implementar endpoint
      const response = await fetch(`http://localhost:8000/supervisor/pago/${pagoId}/estado`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado })
      });

      if (response.ok) {
        setPagos(pagos.map(p => 
          p.id === pagoId ? { ...p, estado: nuevoEstado as any } : p
        ));
      }
    } catch (error) {
      console.error("Error cambiando estado:", error);
      alert("Error al cambiar el estado del pago");
    }
  };

  const aprobarPagosSeleccionados = async () => {
    try {
      for (const pagoId of selectedPagos) {
        await cambiarEstadoPago(pagoId, "aprobado");
      }
      setSelectedPagos([]);
      alert(`${selectedPagos.length} pagos aprobados exitosamente`);
    } catch (error) {
      console.error("Error aprobando pagos:", error);
      alert("Error al aprobar los pagos seleccionados");
    }
  };

  const toggleSeleccionPago = (pagoId: string) => {
    if (selectedPagos.includes(pagoId)) {
      setSelectedPagos(selectedPagos.filter(id => id !== pagoId));
    } else {
      setSelectedPagos([...selectedPagos, pagoId]);
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
    switch (estado) {
      case "pendiente": return "warning";
      case "en_revision": return "info";
      case "aprobado": return "success";
      case "pagado": return "secondary";
      default: return "secondary";
    }
  };

  const getPrioridadColor = (dias: number) => {
    if (dias >= 10) return "high";
    if (dias >= 5) return "medium";
    return "low";
  };

  const totalMontoPendiente = pagosFiltrados
    .filter(p => p.estado === "pendiente" || p.estado === "en_revision")
    .reduce((sum, p) => sum + p.monto, 0);

  if (loading) {
    return <div className="loading">Cargando pagos...</div>;
  }

  return (
    <div className="pagos-supervisor">
      <div className="page-header">
        <h1>Gestión de Pagos</h1>
        <div className="header-info">
          <div className="empresa-info">
            <span className="empresa-badge">
              🏢 {user?.empresa_carrier || "Sin empresa asignada"}
            </span>
          </div>
          <div className="total-pendiente">
            <strong>Total Pendiente: {formatCurrency(totalMontoPendiente)}</strong>
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="pagos-summary">
        <div className="summary-card">
          <span className="summary-number">{pagos.filter(p => p.estado === "pendiente").length}</span>
          <span className="summary-label">Pendientes</span>
        </div>
        <div className="summary-card">
          <span className="summary-number">{pagos.filter(p => p.estado === "en_revision").length}</span>
          <span className="summary-label">En Revisión</span>
        </div>
        <div className="summary-card">
          <span className="summary-number">{pagos.filter(p => p.estado === "aprobado").length}</span>
          <span className="summary-label">Aprobados</span>
        </div>
        <div className="summary-card">
          <span className="summary-number">{Math.round(pagos.reduce((sum, p) => sum + p.dias_pendiente, 0) / pagos.length)}</span>
          <span className="summary-label">Días Promedio</span>
        </div>
      </div>

      {/* Filtros y acciones */}
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
            <option value="en_revision">En Revisión</option>
            <option value="aprobado">Aprobados</option>
            <option value="pagado">Pagados</option>
          </select>
        </div>

        {selectedPagos.length > 0 && (
          <div className="batch-actions">
            <span>{selectedPagos.length} pagos seleccionados</span>
            <button 
              className="btn-primary"
              onClick={aprobarPagosSeleccionados}
            >
              Aprobar Seleccionados
            </button>
          </div>
        )}
      </div>

      {/* Lista de pagos */}
      <div className="pagos-table">
        <div className="table-header">
          <div className="header-cell checkbox-cell">
            <input
              type="checkbox"
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedPagos(pagosFiltrados.map(p => p.id));
                } else {
                  setSelectedPagos([]);
                }
              }}
              checked={selectedPagos.length === pagosFiltrados.length && pagosFiltrados.length > 0}
            />
          </div>
          <div className="header-cell">Conductor</div>
          <div className="header-cell">Guía</div>
          <div className="header-cell">Cliente</div>
          <div className="header-cell">Destino</div>
          <div className="header-cell">Monto</div>
          <div className="header-cell">Estado</div>
          <div className="header-cell">Días</div>
          <div className="header-cell">Acciones</div>
        </div>

        {pagosFiltrados.map((pago) => (
          <div key={pago.id} className="table-row">
            <div className="table-cell checkbox-cell">
              <input
                type="checkbox"
                checked={selectedPagos.includes(pago.id)}
                onChange={() => toggleSeleccionPago(pago.id)}
              />
            </div>
            <div className="table-cell">
              <div className="conductor-info">
                <span className="conductor-name">{pago.conductor_nombre}</span>
              </div>
            </div>
            <div className="table-cell">
              <span className="guia-number">{pago.guia_numero}</span>
            </div>
            <div className="table-cell">
              <span className="cliente-name">{pago.cliente}</span>
            </div>
            <div className="table-cell">
              <span className="destino">{pago.destino}</span>
            </div>
            <div className="table-cell">
              <span className="monto">{formatCurrency(pago.monto)}</span>
            </div>
            <div className="table-cell">
              <span className={`status-badge ${getEstadoColor(pago.estado)}`}>
                {pago.estado.replace('_', ' ')}
              </span>
            </div>
            <div className="table-cell">
              <span className={`dias-badge ${getPrioridadColor(pago.dias_pendiente)}`}>
                {pago.dias_pendiente} días
              </span>
            </div>
            <div className="table-cell">
              <div className="action-buttons">
                {pago.estado === "pendiente" && (
                  <button
                    className="btn-small btn-info"
                    onClick={() => cambiarEstadoPago(pago.id, "en_revision")}
                  >
                    Revisar
                  </button>
                )}
                {pago.estado === "en_revision" && (
                  <button
                    className="btn-small btn-success"
                    onClick={() => cambiarEstadoPago(pago.id, "aprobado")}
                  >
                    Aprobar
                  </button>
                )}
                {pago.estado === "aprobado" && (
                  <button
                    className="btn-small btn-secondary"
                    onClick={() => cambiarEstadoPago(pago.id, "pagado")}
                  >
                    Marcar Pagado
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {pagosFiltrados.length === 0 && (
        <div className="empty-state">
          <p>No se encontraron pagos con los filtros aplicados</p>
        </div>
      )}

      {/* Estadísticas adicionales */}
      <div className="stats-footer">
        <div className="stat-item">
          <span className="stat-label">Total mostrado:</span>
          <span className="stat-value">{pagosFiltrados.length} pagos</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Monto total:</span>
          <span className="stat-value">{formatCurrency(pagosFiltrados.reduce((sum, p) => sum + p.monto, 0))}</span>
        </div>
      </div>
    </div>
  );
}