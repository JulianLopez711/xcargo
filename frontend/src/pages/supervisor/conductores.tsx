// src/pages/supervisor/Conductores.tsx
import { useEffect, useState } from "react";
import { useAuth } from "../../context/authContext";
import "../../styles/supervisor/Conductores.css";

interface Conductor {
  id: string;
  nombre: string;
  correo: string;
  telefono: string;
  cedula: string;
  vehiculo: string;
  placa: string;
  estado: "activo" | "inactivo" | "suspendido";
  fecha_registro: string;
  ultimo_pago: string;
  pagos_pendientes: number;
  total_entregas: number;
  calificacion: number;
}

export default function ConductoresSupervisor() {
  const { user } = useAuth();
  const [conductores, setConductores] = useState<Conductor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<string>("todos");
  const [conductorSeleccionado, setConductorSeleccionado] = useState<Conductor | null>(null);

  useEffect(() => {
    cargarConductores();
  }, []);

  const cargarConductores = async () => {
    try {
      // TODO: Reemplazar con endpoint real
      const response = await fetch(`http://localhost:8000/supervisor/conductores/${user?.empresa_carrier}`);
      if (response.ok) {
        const data = await response.json();
        setConductores(data);
      } else {
        // Datos de ejemplo
        setConductores([
          {
            id: "1",
            nombre: "Juan Pérez González",
            correo: "juan.perez@empresa.com",
            telefono: "+57 300 123 4567",
            cedula: "12345678",
            vehiculo: "Chevrolet NPR",
            placa: "ABC-123",
            estado: "activo",
            fecha_registro: "2024-03-15",
            ultimo_pago: "2025-05-20",
            pagos_pendientes: 2,
            total_entregas: 45,
            calificacion: 4.8
          },
          {
            id: "2",
            nombre: "María González López",
            correo: "maria.gonzalez@empresa.com",
            telefono: "+57 301 234 5678",
            cedula: "23456789",
            vehiculo: "Isuzu NKR",
            placa: "DEF-456",
            estado: "activo",
            fecha_registro: "2024-02-10",
            ultimo_pago: "2025-05-22",
            pagos_pendientes: 1,
            total_entregas: 62,
            calificacion: 4.9
          },
          {
            id: "3",
            nombre: "Carlos Rodríguez Silva",
            correo: "carlos.rodriguez@empresa.com",
            telefono: "+57 302 345 6789",
            cedula: "34567890",
            vehiculo: "Hino 300",
            placa: "GHI-789",
            estado: "inactivo",
            fecha_registro: "2024-01-20",
            ultimo_pago: "2025-05-18",
            pagos_pendientes: 3,
            total_entregas: 28,
            calificacion: 4.2
          }
        ]);
      }
    } catch (error) {
      console.error("Error cargando conductores:", error);
    } finally {
      setLoading(false);
    }
  };

  const conductoresFiltrados = conductores.filter(conductor => {
    const coincideTexto = conductor.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
                         conductor.correo.toLowerCase().includes(filtro.toLowerCase()) ||
                         conductor.cedula.includes(filtro);
    
    const coincideEstado = estadoFiltro === "todos" || conductor.estado === estadoFiltro;
    
    return coincideTexto && coincideEstado;
  });

  const cambiarEstadoConductor = async (conductorId: string, nuevoEstado: string) => {
    try {
      // TODO: Implementar endpoint
      const response = await fetch(`http://localhost:8000/supervisor/conductor/${conductorId}/estado`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado })
      });

      if (response.ok) {
        setConductores(conductores.map(c => 
          c.id === conductorId ? { ...c, estado: nuevoEstado as any } : c
        ));
      }
    } catch (error) {
      console.error("Error cambiando estado:", error);
      alert("Error al cambiar el estado del conductor");
    }
  };

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case "activo": return "success";
      case "inactivo": return "warning";
      case "suspendido": return "danger";
      default: return "secondary";
    }
  };

  if (loading) {
    return <div className="loading">Cargando conductores...</div>;
  }

  return (
    <div className="conductores-supervisor">
      <div className="page-header">
        <h1>Gestión de Conductores</h1>
        <div className="empresa-info">
          <span className="empresa-badge">
            🏢 {user?.empresa_carrier || "Sin empresa asignada"}
          </span>
        </div>
      </div>

      {/* Filtros */}
      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="Buscar por nombre, correo o cédula..."
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="filter-buttons">
          <button 
            className={`filter-btn ${estadoFiltro === "todos" ? "active" : ""}`}
            onClick={() => setEstadoFiltro("todos")}
          >
            Todos ({conductores.length})
          </button>
          <button 
            className={`filter-btn ${estadoFiltro === "activo" ? "active" : ""}`}
            onClick={() => setEstadoFiltro("activo")}
          >
            Activos ({conductores.filter(c => c.estado === "activo").length})
          </button>
          <button 
            className={`filter-btn ${estadoFiltro === "inactivo" ? "active" : ""}`}
            onClick={() => setEstadoFiltro("inactivo")}
          >
            Inactivos ({conductores.filter(c => c.estado === "inactivo").length})
          </button>
        </div>
      </div>

      {/* Lista de conductores */}
      <div className="conductores-grid">
        {conductoresFiltrados.map((conductor) => (
          <div key={conductor.id} className="conductor-card">
            <div className="conductor-header">
              <div className="conductor-info">
                <h3>{conductor.nombre}</h3>
                <span className={`status-badge ${getEstadoColor(conductor.estado)}`}>
                  {conductor.estado}
                </span>
              </div>
              <div className="conductor-rating">
                <span className="rating">⭐ {conductor.calificacion}</span>
              </div>
            </div>

            <div className="conductor-details">
              <div className="detail-row">
                <span className="label">📧 Correo:</span>
                <span className="value">{conductor.correo}</span>
              </div>
              <div className="detail-row">
                <span className="label">📱 Teléfono:</span>
                <span className="value">{conductor.telefono}</span>
              </div>
              <div className="detail-row">
                <span className="label">🚛 Vehículo:</span>
                <span className="value">{conductor.vehiculo} - {conductor.placa}</span>
              </div>
              <div className="detail-row">
                <span className="label">📦 Entregas:</span>
                <span className="value">{conductor.total_entregas}</span>
              </div>
              <div className="detail-row">
                <span className="label">💰 Pendientes:</span>
                <span className="value pending">{conductor.pagos_pendientes} pagos</span>
              </div>
            </div>

            <div className="conductor-actions">
              <button 
                className="btn-secondary"
                onClick={() => setConductorSeleccionado(conductor)}
              >
                Ver Detalles
              </button>
              
              {conductor.estado === "activo" ? (
                <button 
                  className="btn-warning"
                  onClick={() => cambiarEstadoConductor(conductor.id, "inactivo")}
                >
                  Desactivar
                </button>
              ) : (
                <button 
                  className="btn-success"
                  onClick={() => cambiarEstadoConductor(conductor.id, "activo")}
                >
                  Activar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {conductoresFiltrados.length === 0 && (
        <div className="empty-state">
          <p>No se encontraron conductores con los filtros aplicados</p>
        </div>
      )}

      {/* Modal de detalles del conductor */}
      {conductorSeleccionado && (
        <div className="modal-overlay" onClick={() => setConductorSeleccionado(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Detalles del Conductor</h2>
              <button 
                className="close-btn"
                onClick={() => setConductorSeleccionado(null)}
              >
                ✕
              </button>
            </div>
            
            <div className="modal-body">
              <div className="conductor-profile">
                <h3>{conductorSeleccionado.nombre}</h3>
                <div className="profile-details">
                  <p><strong>Cédula:</strong> {conductorSeleccionado.cedula}</p>
                  <p><strong>Correo:</strong> {conductorSeleccionado.correo}</p>
                  <p><strong>Teléfono:</strong> {conductorSeleccionado.telefono}</p>
                  <p><strong>Vehículo:</strong> {conductorSeleccionado.vehiculo}</p>
                  <p><strong>Placa:</strong> {conductorSeleccionado.placa}</p>
                  <p><strong>Fecha de registro:</strong> {conductorSeleccionado.fecha_registro}</p>
                  <p><strong>Último pago:</strong> {conductorSeleccionado.ultimo_pago}</p>
                  <p><strong>Total entregas:</strong> {conductorSeleccionado.total_entregas}</p>
                  <p><strong>Calificación:</strong> ⭐ {conductorSeleccionado.calificacion}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}