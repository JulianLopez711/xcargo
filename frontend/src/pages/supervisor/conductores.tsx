// src/pages/supervisor/Conductores.tsx
import { useEffect, useState } from "react";
import { useAuth } from "../../context/authContext";
import "../../styles/supervisor/Conductores.css";
import "../../styles/supervisor/cargando.css";
import LogoXcargo from "../../../public/icons/Logo192.png";

interface Conductor {
  id: string;
  nombre: string;
  correo: string;
  telefono: string;
  cedula: string;
  empresa: string;
  estado: "activo" | "inactivo" | "suspendido";
  fecha_registro: string;
  ultima_actividad: string;
  entregas_pendientes: number;
  total_entregas: number;
  valor_pendiente: number;
}

const FECHA_INICIO = '2025-06-09';

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
      // Agregar token JWT en la cabecera Authorization
      const token = user?.token || localStorage.getItem("token") || "";
      const response = await fetch(`http://127.0.0.1:8000/supervisor/conductores`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          // Puedes mantener los headers personalizados si el backend los requiere:
          "X-User-Email": user?.email || "",
          "X-User-Role": user?.role || "supervisor"
        }
      });
        if (response.ok) {
        const data = await response.json();
        console.log(`✅ Conductores cargados: ${data.length} registros desde ${FECHA_INICIO}`, {
          fecha_configurada: FECHA_INICIO,
          total_conductores: data.length,
          conductores_activos: data.filter((c: any) => c.estado === 'activo').length,
          total_entregas: data.reduce((sum: number, c: any) => sum + (c.total_entregas || 0), 0),
          entregas_pendientes: data.reduce((sum: number, c: any) => sum + (c.entregas_pendientes || 0), 0)
        });
        
        // Mapear datos reales al formato esperado por el frontend
        const conductoresMapeados = data.map((conductor: any) => ({
          id: conductor.id,
          nombre: conductor.nombre,
          correo: conductor.correo,
          telefono: conductor.telefono || "Sin teléfono",
          cedula: conductor.id, // Usando ID como cédula temporalmente
          empresa: conductor.empresa || "Sin empresa asignada",
          estado: conductor.estado === "activo" ? "activo" : "inactivo",
          fecha_registro: conductor.fecha_registro || "2024-01-01",
          ultima_actividad: conductor.ultima_actividad || "Sin actividad",
          entregas_pendientes: conductor.entregas_pendientes || 0,
          total_entregas: conductor.total_entregas || 0,
          valor_pendiente: conductor.valor_pendiente || 0
        }));
        
        setConductores(conductoresMapeados);
      } else {
        throw new Error("Error al cargar conductores");
      }
    } catch (error) {
      console.error("Error cargando conductores:", error);
      // Mantener datos de ejemplo en caso de error con los nuevos campos
      setConductores([
        {
          id: "1",
          nombre: "Juan Pérez González",
          correo: "juan.perez@empresa.com",
          telefono: "+57 300 123 4567",
          cedula: "12345678",
          empresa: "Transportes XCargo",
          estado: "activo",
          fecha_registro: "2024-03-15",
          ultima_actividad: "2025-06-20",
          entregas_pendientes: 2,
          total_entregas: 45,
          valor_pendiente: 150000
        }
      ]);
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
      const token = user?.token || localStorage.getItem("token") || "";
      const response = await fetch(`http://127.0.0.1:8000/supervisor/conductor/${conductorId}/estado`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
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
  return (
    <div className="loading-container">
      <img src={LogoXcargo} alt="Cargando dashboard" className="loading-logo" />
    </div>
  );
}


  return (
    <div className="conductores-supervisor">      <div className="page-header">
        <h1>Gestión de Conductores</h1>
        <div className="empresa-info">
          <span className="empresa-badge">
            🏢 {user?.empresa_carrier || "Sin empresa asignada"}
          </span>
          <span className="fecha-badge">
            📅 Datos desde: {new Date(FECHA_INICIO).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Banner informativo */}
      <div className="info-banner">
        <div className="banner-content">
          <span className="banner-icon">ℹ️</span>
          <div className="banner-text">
            <strong>Información de conductores actualizada</strong>
            <p>Mostrando datos de conductores y actividad desde el {new Date(FECHA_INICIO).toLocaleDateString()}. 
            Los valores y estados reflejan la actividad real registrada en el sistema.</p>
          </div>
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
          <div key={conductor.id} className="conductor-card">            <div className="conductor-header">
              <div className="conductor-info">
                <h3>{conductor.nombre}</h3>
                <span className={`status-badge ${getEstadoColor(conductor.estado)}`}>
                  {conductor.estado}
                </span>
              </div>
              <div className="conductor-rating">
                <span className="empresa">🏢 {conductor.empresa}</span>
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
                <span className="label">🏢 Empresa:</span>
                <span className="value">{conductor.empresa}</span>
              </div>
              <div className="detail-row">
                <span className="label">📦 Entregas:</span>
                <span className="value">{conductor.total_entregas}</span>
              </div>
              <div className="detail-row">
                <span className="label">💰 Pendientes:</span>
                <span className="value pending">{conductor.entregas_pendientes} entregas (${conductor.valor_pendiente?.toLocaleString()})</span>
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
                  <p><strong>ID:</strong> {conductorSeleccionado.cedula}</p>
                  <p><strong>Correo:</strong> {conductorSeleccionado.correo}</p>
                  <p><strong>Teléfono:</strong> {conductorSeleccionado.telefono}</p>
                  <p><strong>Empresa:</strong> {conductorSeleccionado.empresa}</p>
                  <p><strong>Estado:</strong> {conductorSeleccionado.estado}</p>
                  <p><strong>Fecha de registro:</strong> {conductorSeleccionado.fecha_registro}</p>
                  <p><strong>Última actividad:</strong> {conductorSeleccionado.ultima_actividad}</p>
                  <p><strong>Total entregas:</strong> {conductorSeleccionado.total_entregas}</p>
                  <p><strong>Entregas pendientes:</strong> {conductorSeleccionado.entregas_pendientes}</p>
                  <p><strong>Valor pendiente:</strong> ${conductorSeleccionado.valor_pendiente?.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}