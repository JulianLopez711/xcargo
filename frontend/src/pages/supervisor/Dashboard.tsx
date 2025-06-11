// src/pages/supervisor/Dashboard.tsx
import { useEffect, useState } from "react";
import { useAuth } from "../../context/authContext";
import "../../styles/supervisor/Dashboard.css";
import "../../styles/supervisor/cargando.css";
import LogoXcargo from "../../../public/icons/Logo192.png";

interface Carrier {
  id: number;
  nombre: string;
}

interface Stats {
  total_conductores_registrados: number;
  conductores_activos: number;
  total_guias: number;
  guias_pendientes: number;
  guias_entregadas: number;
  monto_pendiente: number;
  monto_entregado: number;
  promedio_valor_guia: number;
  eficiencia_general: number;
}

interface ConductorDestacado {
  nombre: string;
  email: string;
  telefono: string;
  guias_totales: number;
  guias_pendientes: number;
  guias_entregadas: number;
  valor_pendiente: number;
  ultima_actividad: string;
  ciudades_principales: string;
  estado: string;
  eficiencia: number;
}

interface Alerta {
  tipo: string;
  mensaje: string;
  prioridad: string;
}

export default function DashboardSupervisor() {
  const { user } = useAuth();
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [stats, setStats] = useState<Stats>({
    total_conductores_registrados: 0,
    conductores_activos: 0,
    total_guias: 0,
    guias_pendientes: 0,
    guias_entregadas: 0,
    monto_pendiente: 0,
    monto_entregado: 0,
    promedio_valor_guia: 0,
    eficiencia_general: 0
  });
  const [conductoresDestacados, setConductoresDestacados] = useState<ConductorDestacado[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    cargarDashboard();
  }, []);

  const cargarDashboard = async () => {
    try {
      // Usa el token JWT para autenticar la petición
      const token = user?.token || localStorage.getItem("token") || "";
      const response = await fetch(`http://127.0.0.1:8000/supervisor/dashboard`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          // Puedes mantener los headers personalizados si tu backend los requiere:
          "X-User-Email": user?.email || "",
          "X-User-Role": user?.role || "supervisor"
        }
      });

      if (response.ok) {
        const data = await response.json();

        
        setCarriers(data.carriers || []);
        setStats(data.stats || {});
        setConductoresDestacados(data.conductores_destacados || []);
        setAlertas(data.alertas || []);
        setError("");
      } else {
        throw new Error(`Error HTTP ${response.status}`);
      }
    } catch (error) {
      console.error("Error cargando dashboard:", error);
      setError("Error al cargar el dashboard. Usando datos de ejemplo.");
      
      // Fallback a datos de ejemplo
      setStats({
        total_conductores_registrados: 15,
        conductores_activos: 12,
        total_guias: 156,
        guias_pendientes: 23,
        guias_entregadas: 133,
        monto_pendiente: 2450000,
        monto_entregado: 15680000,
        promedio_valor_guia: 105000,
        eficiencia_general: 85.3
      });
    } finally {
      setLoading(false);
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
      case "activo_hoy": return "success";
      case "con_pendientes": return "warning";
      case "activo": return "info";
      case "inactivo": return "secondary";
      default: return "secondary";
    }
  };

  const getEstadoTexto = (estado: string) => {
    switch (estado) {
      case "activo_hoy": return "Activo hoy";
      case "con_pendientes": return "Con pendientes";
      case "activo": return "Activo";
      case "inactivo": return "Inactivo";
      default: return estado;
    }
  };

  const getAlertaColor = (tipo: string) => {
    switch (tipo) {
      case "warning": return "alert-warning";
      case "info": return "alert-info";
      case "error": return "alert-error";
      default: return "alert-info";
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
    <div className="supervisor-dashboard">
      <div className="dashboard-header">
        <h1>Dashboard Supervisor</h1>
        <div className="empresa-info">
          {carriers.length > 0 ? (
            <div className="carriers-list">
              {carriers.map((carrier, index) => (
                <span key={carrier.id} className="empresa-badge">
                  🏢 {carrier.nombre}
                </span>
              ))}
            </div>
          ) : (
            <span className="empresa-badge">
              🏢 {user?.empresa_carrier || "Sin empresa asignada"}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* Alertas importantes */}
      {alertas.length > 0 && (
        <div className="alertas-container">
          {alertas.map((alerta, index) => (
            <div key={index} className={`alerta ${getAlertaColor(alerta.tipo)}`}>
              <strong>{alerta.prioridad === 'alta' ? '🚨' : 'ℹ️'}</strong>
              {alerta.mensaje}
            </div>
          ))}
        </div>
      )}

      {/* Tarjetas de estadísticas */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <h3>Conductores</h3>
            <div className="stat-number">{stats.total_conductores_registrados}</div>
            <div className="stat-detail">
              {stats.conductores_activos} activos
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-content">
            <h3>Guías Totales</h3>
            <div className="stat-number">{stats.total_guias}</div>
            <div className="stat-detail">
              {stats.guias_pendientes} pendientes
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <h3>Monto Pendiente</h3>
            <div className="stat-number">{formatCurrency(stats.monto_pendiente)}</div>
            <div className="stat-detail">
              {formatCurrency(stats.promedio_valor_guia)} promedio
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>Eficiencia</h3>
            <div className="stat-number">{stats.eficiencia_general}%</div>
            <div className="stat-detail">
              {stats.guias_entregadas} entregadas
            </div>
          </div>
        </div>
      </div>

      {/* Contenido del dashboard */}
      <div className="dashboard-content">
        <div className="recent-activity">
          <h2>Conductores Destacados</h2>
          <div className="activity-list">
            {conductoresDestacados.length > 0 ? (
              conductoresDestacados.map((conductor, index) => (
                <div key={index} className="activity-item">
                  <div className="conductor-info">
                    <div className="conductor-name">{conductor.nombre}</div>
                    <div className="conductor-detail">
                      {conductor.guias_totales} guías • {conductor.ciudades_principales}
                    </div>
                    <div className="conductor-stats">
                      <span>📈 {conductor.eficiencia}% eficiencia</span>
                      {conductor.valor_pendiente > 0 && (
                        <span>💰 {formatCurrency(conductor.valor_pendiente)} pendiente</span>
                      )}
                    </div>
                  </div>
                  <div className="conductor-status">
                    <span className={`status-badge ${getEstadoColor(conductor.estado)}`}>
                      {getEstadoTexto(conductor.estado)}
                    </span>
                    {conductor.guias_pendientes > 0 && (
                      <span className="pending-count">
                        {conductor.guias_pendientes} pendientes
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>No hay conductores con actividad reciente</p>
              </div>
            )}
          </div>
        </div>

        <div className="quick-actions">
          <h2>Acciones Rápidas</h2>
          <div className="actions-grid">
            <button 
              className="action-btn primary"
              onClick={() => window.location.href = '/supervisor/conductores'}
            >
              <span className="action-icon">👥</span>
              <span>Ver Todos los Conductores</span>
            </button>
            <button 
              className="action-btn secondary"
              onClick={() => window.location.href = '/supervisor/guias-pendientes'}
            >
              <span className="action-icon">📦</span>
              <span>Guías Pendientes</span>
            </button>
            <button 
              className="action-btn tertiary"
              onClick={() => window.location.href = '/supervisor/resumen-carrier'}
            >
              <span className="action-icon">📊</span>
              <span>Resumen del Carrier</span>
            </button>
            <button 
              className="action-btn info"
              onClick={cargarDashboard}
            >
              <span className="action-icon">🔄</span>
              <span>Actualizar Datos</span>
            </button>
          </div>
        </div>
      </div>

      {/* Información adicional */}
      <div className="dashboard-footer">
        <div className="info-cards">
          <div className="info-card">
            <h4>💡 Recomendaciones</h4>
            <ul>
              {stats.eficiencia_general < 80 && (
                <li>Revisar conductores con baja eficiencia</li>
              )}
              {stats.guias_pendientes > 20 && (
                <li>Priorizar seguimiento a guías pendientes</li>
              )}
              {stats.conductores_activos < stats.total_conductores_registrados * 0.8 && (
                <li>Activar conductores inactivos</li>
              )}
            </ul>
          </div>
          
          <div className="info-card">
            <h4>📈 Métricas Clave</h4>
            <div className="metrics-list">
              <div className="metric-item">
                <span>Valor promedio por guía:</span>
                <strong>{formatCurrency(stats.promedio_valor_guia)}</strong>
              </div>
              <div className="metric-item">
                <span>Total entregado:</span>
                <strong>{formatCurrency(stats.monto_entregado)}</strong>
              </div>
              <div className="metric-item">
                <span>Ratio pendientes:</span>
                <strong>{((stats.guias_pendientes / Math.max(stats.total_guias, 1)) * 100).toFixed(1)}%</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}