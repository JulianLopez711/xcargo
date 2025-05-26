// src/pages/supervisor/Dashboard.tsx
import { useEffect, useState } from "react";
import { useAuth } from "../../context/authContext";
import "../../styles/supervisor/Dashboard.css";

interface Stats {
  total_conductores: number;
  conductores_activos: number;
  pagos_pendientes: number;
  entregas_pendientes: number;
  total_monto_pendiente: number;
}

interface ConductorReciente {
  nombre: string;
  ultimo_pago: string;
  estado: "activo" | "inactivo";
  pagos_pendientes: number;
}

export default function DashboardSupervisor() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    total_conductores: 0,
    conductores_activos: 0,
    pagos_pendientes: 0,
    entregas_pendientes: 0,
    total_monto_pendiente: 0
  });
  const [conductoresRecientes, setConductoresRecientes] = useState<ConductorReciente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarDashboard();
  }, []);

  const cargarDashboard = async () => {
  try {
    // ✅ CORREGIDO - Verificar que user y empresa_carrier existen
    if (!user?.empresa_carrier) {
      console.warn("Usuario sin empresa asignada");
      return;
    }

    const response = await fetch(`https://api.x-cargo.co/supervisor/dashboard/${user.empresa_carrier}`);
    if (response.ok) {
      const data = await response.json();
      setStats(data.stats);
      setConductoresRecientes(data.conductores_recientes);
    } else {
      throw new Error("Error al cargar dashboard");
    }
  } catch (error) {
    console.error("Error cargando dashboard:", error);
    // Fallback a datos de ejemplo
    setStats({
      total_conductores: 15,
      conductores_activos: 12,
      pagos_pendientes: 8,
      entregas_pendientes: 23,
      total_monto_pendiente: 2450000
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

  if (loading) {
    return <div className="loading">Cargando dashboard...</div>;
  }

  return (
    <div className="supervisor-dashboard">
      <div className="dashboard-header">
        <h1>Dashboard Supervisor</h1>
        <div className="empresa-info">
          <span className="empresa-badge">
            🏢 {user?.empresa_carrier || "Sin empresa asignada"}
          </span>
        </div>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <h3>Conductores</h3>
            <div className="stat-number">{stats.total_conductores}</div>
            <div className="stat-detail">
              {stats.conductores_activos} activos
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <h3>Pagos Pendientes</h3>
            <div className="stat-number">{stats.pagos_pendientes}</div>
            <div className="stat-detail">
              {formatCurrency(stats.total_monto_pendiente)}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-content">
            <h3>Entregas Pendientes</h3>
            <div className="stat-number">{stats.entregas_pendientes}</div>
            <div className="stat-detail">En proceso</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>Eficiencia</h3>
            <div className="stat-number">
              {Math.round((stats.conductores_activos / stats.total_conductores) * 100)}%
            </div>
            <div className="stat-detail">Conductores activos</div>
          </div>
        </div>
      </div>

      {/* Actividad reciente */}
      <div className="dashboard-content">
        <div className="recent-activity">
          <h2>Conductores Recientes</h2>
          <div className="activity-list">
            {conductoresRecientes.map((conductor, index) => (
              <div key={index} className="activity-item">
                <div className="conductor-info">
                  <div className="conductor-name">{conductor.nombre}</div>
                  <div className="conductor-detail">
                    Último pago: {conductor.ultimo_pago}
                  </div>
                </div>
                <div className="conductor-status">
                  <span className={`status-badge ${conductor.estado}`}>
                    {conductor.estado}
                  </span>
                  {conductor.pagos_pendientes > 0 && (
                    <span className="pending-count">
                      {conductor.pagos_pendientes} pendientes
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="quick-actions">
          <h2>Acciones Rápidas</h2>
          <div className="actions-grid">
            <button className="action-btn primary">
              <span className="action-icon">👥</span>
              <span>Ver Todos los Conductores</span>
            </button>
            <button className="action-btn secondary">
              <span className="action-icon">💰</span>
              <span>Gestionar Pagos</span>
            </button>
            <button className="action-btn tertiary">
              <span className="action-icon">📊</span>
              <span>Generar Reporte</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}