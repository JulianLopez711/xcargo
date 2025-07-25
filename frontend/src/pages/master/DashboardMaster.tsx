// src/pages/master/Dashboard.tsx
import { useEffect, useState } from "react";
import { useAuth } from "../../context/authContext";
import "../../styles/master/Dashboard.css";

interface StatsGlobales {
  total_guias: number;
  total_conductores_registrados: number;
  total_conductores_activos: number;
  total_carriers_registrados: number;
  total_carriers_activos: number;
  guias_pendientes: number;
  guias_entregadas: number;
  guias_pagadas: number;
  valor_pendiente: number;
  valor_entregado: number;
  valor_pagado: number;
  promedio_valor_guia: number;
  eficiencia_global: number;
}

interface CarrierRanking {
  carrier_id: number;
  carrier_nombre: string;
  total_conductores: number;
  total_guias: number;
  guias_pendientes: number;
  guias_entregadas: number;
  valor_pendiente: number;
  valor_entregado: number;
  promedio_valor_guia: number;
  ciudades_principales: string;
  ultima_actividad: string;
  eficiencia: number;
}

interface Supervisor {
  nombre: string;
  email: string;
  empresa_carrier: string;
  carriers_asignados: number;
  rol: string;
}

interface CiudadAnalisis {
  ciudad: string;
  total_guias: number;
  conductores_activos: number;
  carriers_activos: number;
  valor_pendiente: number;
  guias_pendientes: number;
  eficiencia: number;
}

interface TendenciaMensual {
  mes: string;
  total_guias: number;
  conductores_activos: number;
  carriers_activos: number;
  valor_total: number;
  guias_entregadas: number;
  eficiencia_mensual: number;
}

interface Alerta {
  tipo: string;
  mensaje: string;
  prioridad: string;
}

interface UsuarioMaster {
  nombre: string;
  rol: string;
  acceso_completo: boolean;
}

export default function DashboardMaster() {
  const { user } = useAuth();
  const [statsGlobales, setStatsGlobales] = useState<StatsGlobales>({
    total_guias: 0,
    total_conductores_registrados: 0,
    total_conductores_activos: 0,
    total_carriers_registrados: 0,
    total_carriers_activos: 0,
    guias_pendientes: 0,
    guias_entregadas: 0,
    guias_pagadas: 0,
    valor_pendiente: 0,
    valor_entregado: 0,
    valor_pagado: 0,
    promedio_valor_guia: 0,
    eficiencia_global: 0
  });
  const [rankingCarriers, setRankingCarriers] = useState<CarrierRanking[]>([]);
  const [topSupervisores, setTopSupervisores] = useState<Supervisor[]>([]);
  const [analisisCiudades, setAnalisisCiudades] = useState<CiudadAnalisis[]>([]);
  const [tendenciasMensuales, setTendenciasMensuales] = useState<TendenciaMensual[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [usuarioMaster, setUsuarioMaster] = useState<UsuarioMaster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [periodoAnalisis, setPeriodoAnalisis] = useState<string>("");
  const [fechaActualizacion, setFechaActualizacion] = useState<string>("");

  useEffect(() => {
    cargarDashboardMaster();
  }, []);

  const cargarDashboardMaster = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://127.0.0.1:8000/master/dashboard`, {
        headers: {
          "X-User-Email": user?.email || "",
          "X-User-Role": user?.role || "master"
        }
      });

      if (response.ok) {
        const data = await response.json();

        
        setStatsGlobales(data.stats_globales || {});
        setRankingCarriers(data.ranking_carriers || []);
        setTopSupervisores(data.top_supervisores || []);
        setAnalisisCiudades(data.analisis_ciudades || []);
        setTendenciasMensuales(data.tendencias_mensuales || []);
        setAlertas(data.alertas || []);
        setUsuarioMaster(data.usuario_master || null);
        setPeriodoAnalisis(data.periodo_analisis || "");
        setFechaActualizacion(data.fecha_actualizacion || "");
        setError("");
      } else if (response.status === 403) {
        throw new Error("No autorizado - Solo admin y master tienen acceso");
      } else {
        throw new Error(`Error HTTP ${response.status}`);
      }
    } catch (error) {
      console.error("Error cargando dashboard master:", error);
      setError(error instanceof Error ? error.message : "Error al cargar el dashboard master");
      
      // Sin fallback - el master debe tener datos reales
    } finally {
      setLoading(false);
    }
  };

  const exportarDatos = async (formato: string = "json") => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/master/export/data?formato=${formato}`, {
        headers: {
          "X-User-Email": user?.email || "",
          "X-User-Role": user?.role || "master"
        }
      });

      if (response.ok) {
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dashboard_master_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Error exportando datos:", error);
      alert("Error al exportar los datos");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getEficienciaColor = (eficiencia: number) => {
    if (eficiencia >= 90) return "success";
    if (eficiencia >= 80) return "warning";
    if (eficiencia >= 70) return "info";
    return "danger";
  };

  const getAlertaColor = (tipo: string) => {
    switch (tipo) {
      case "critical": return "alert-critical";
      case "warning": return "alert-warning";
      case "info": return "alert-info";
      default: return "alert-info";
    }
  };

  const getPrioridadIcon = (prioridad: string) => {
    switch (prioridad) {
      case "alta": return "🚨";
      case "media": return "⚠️";
      case "baja": return "ℹ️";
      default: return "ℹ️";
    }
  };

  if (loading) {
    return (
      <div className="master-dashboard">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Consultando datos globales de BigQuery...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="master-dashboard">
      <div className="dashboard-header">
        <div className="header-info">
          <h1>🎯 Dashboard Master - Vista Global</h1>
          <div className="user-info">
            <span className="user-badge master">
              👑 {usuarioMaster?.nombre || "Master"} • {usuarioMaster?.rol || "master"}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <button 
            className="action-btn export-btn"
            onClick={() => exportarDatos("json")}
          >
            📊 Exportar Reporte
          </button>
          <button 
            className="action-btn refresh-btn"
            onClick={cargarDashboardMaster}
          >
            🔄 Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          ❌ {error}
        </div>
      )}

      {/* Información del período */}
      <div className="period-info">
        <div className="period-badge">
          📅 {periodoAnalisis} • Actualizado: {new Date(fechaActualizacion).toLocaleString()}
        </div>
      </div>

      {/* Alertas críticas */}
      {alertas.length > 0 && (
        <div className="alertas-container">
          <h3>🚨 Alertas del Sistema</h3>
          {alertas.map((alerta, index) => (
            <div key={index} className={`alerta ${getAlertaColor(alerta.tipo)}`}>
              <span className="alert-icon">{getPrioridadIcon(alerta.prioridad)}</span>
              <span className="alert-message">{alerta.mensaje}</span>
              <span className="alert-priority">{alerta.prioridad.toUpperCase()}</span>
            </div>
          ))}
        </div>
      )}

      {/* KPIs Globales */}
      <div className="stats-section">
        <h2>📊 Métricas Globales del Sistema</h2>
        <div className="stats-grid">
          <div className="stat-card primary">
            <div className="stat-icon">📦</div>
            <div className="stat-content">
              <h3>Guías Totales</h3>
              <div className="stat-number">{statsGlobales.total_guias.toLocaleString()}</div>
              <div className="stat-detail">
                {statsGlobales.guias_pendientes.toLocaleString()} pendientes • {statsGlobales.guias_entregadas.toLocaleString()} entregadas
              </div>
            </div>
          </div>

          <div className="stat-card success">
            <div className="stat-icon">👥</div>
            <div className="stat-content">
              <h3>Conductores</h3>
              <div className="stat-number">{statsGlobales.total_conductores_registrados}</div>
              <div className="stat-detail">
                {statsGlobales.total_conductores_activos} activos ({((statsGlobales.total_conductores_activos / Math.max(statsGlobales.total_conductores_registrados, 1)) * 100).toFixed(1)}%)
              </div>
            </div>
          </div>

          <div className="stat-card warning">
            <div className="stat-icon">💰</div>
            <div className="stat-content">
              <h3>Valor Pendiente</h3>
              <div className="stat-number">{formatCurrency(statsGlobales.valor_pendiente)}</div>
              <div className="stat-detail">
                Promedio: {formatCurrency(statsGlobales.promedio_valor_guia)}
              </div>
            </div>
          </div>

          <div className="stat-card info">
            <div className="stat-icon">🏢</div>
            <div className="stat-content">
              <h3>Carriers</h3>
              <div className="stat-number">{statsGlobales.total_carriers_registrados}</div>
              <div className="stat-detail">
                {statsGlobales.total_carriers_activos} activos • {statsGlobales.eficiencia_global}% eficiencia
              </div>
            </div>
          </div>

          <div className="stat-card secondary">
            <div className="stat-icon">✅</div>
            <div className="stat-content">
              <h3>Valor Entregado</h3>
              <div className="stat-number">{formatCurrency(statsGlobales.valor_entregado)}</div>
              <div className="stat-detail">
                {statsGlobales.guias_entregadas.toLocaleString()} entregas exitosas
              </div>
            </div>
          </div>

          <div className="stat-card purple">
            <div className="stat-icon">💳</div>
            <div className="stat-content">
              <h3>Valor Pagado</h3>
              <div className="stat-number">{formatCurrency(statsGlobales.valor_pagado)}</div>
              <div className="stat-detail">
                {statsGlobales.guias_pagadas.toLocaleString()} guías pagadas
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ranking de Carriers */}
      <div className="ranking-section">
        <h2>🏆 Ranking de Carriers - Análisis Comparativo</h2>
        <div className="ranking-table-container">
          <table className="ranking-table">
            <thead>
              <tr>
                <th>Pos</th>
                <th>Carrier</th>
                <th>Conductores</th>
                <th>Guías</th>
                <th>Pendientes</th>
                <th>Valor Pendiente</th>
                <th>Eficiencia</th>
                <th>Ciudades</th>
                <th>Última Actividad</th>
              </tr>
            </thead>
            <tbody>
              {rankingCarriers.map((carrier, index) => (
                <tr key={carrier.carrier_id} className={index < 3 ? 'top-carrier' : ''}>
                  <td>
                    <div className="position-cell">
                      {index === 0 && <span className="medal gold">🥇</span>}
                      {index === 1 && <span className="medal silver">🥈</span>}
                      {index === 2 && <span className="medal bronze">🥉</span>}
                      <span className="position-number">#{index + 1}</span>
                    </div>
                  </td>
                  <td>
                    <div className="carrier-info">
                      <div className="carrier-name">{carrier.carrier_nombre}</div>
                      <div className="carrier-id">ID: {carrier.carrier_id}</div>
                    </div>
                  </td>
                  <td>{carrier.total_conductores}</td>
                  <td>{carrier.total_guias.toLocaleString()}</td>
                  <td>
                    <span className="pending-badge">
                      {carrier.guias_pendientes}
                    </span>
                  </td>
                  <td>{formatCurrency(carrier.valor_pendiente)}</td>
                  <td>
                    <span className={`efficiency-badge ${getEficienciaColor(carrier.eficiencia)}`}>
                      {carrier.eficiencia}%
                    </span>
                  </td>
                  <td className="cities-cell">
                    {carrier.ciudades_principales.split(', ').slice(0, 2).join(', ')}
                    {carrier.ciudades_principales.split(', ').length > 2 && '...'}
                  </td>
                  <td className="date-cell">
                    {new Date(carrier.ultima_actividad).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dashboard contenido en grid */}
      <div className="dashboard-content">
        {/* Supervisores */}
        <div className="content-section">
          <h3>👨‍💼 Supervisores del Sistema</h3>
          <div className="supervisores-list">
            {topSupervisores.length > 0 ? (
              topSupervisores.map((supervisor, index) => (
                <div key={index} className="supervisor-item">
                  <div className="supervisor-info">
                    <div className="supervisor-name">{supervisor.nombre}</div>
                    <div className="supervisor-email">{supervisor.email}</div>
                    <div className="supervisor-carriers">
                      🏢 {supervisor.carriers_asignados} carriers asignados
                    </div>
                  </div>
                  <div className="supervisor-role">
                    <span className={`role-badge ${supervisor.rol}`}>
                      {supervisor.rol.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>No hay supervisores registrados</p>
              </div>
            )}
          </div>
        </div>

        {/* Análisis por Ciudades */}
        <div className="content-section">
          <h3>🏙️ Top Ciudades</h3>
          <div className="ciudades-list">
            {analisisCiudades.slice(0, 6).map((ciudad, index) => (
              <div key={index} className="ciudad-item">
                <div className="ciudad-info">
                  <div className="ciudad-name">{ciudad.ciudad}</div>
                  <div className="ciudad-stats">
                    📦 {ciudad.total_guias.toLocaleString()} guías • 
                    👥 {ciudad.conductores_activos} conductores
                  </div>
                  <div className="ciudad-pendientes">
                    ⏳ {formatCurrency(ciudad.valor_pendiente)} pendiente
                  </div>
                </div>
                <div className="ciudad-efficiency">
                  <span className={`efficiency-badge ${getEficienciaColor(ciudad.eficiencia)}`}>
                    {ciudad.eficiencia}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tendencias Mensuales */}
      <div className="trends-section">
        <h2>📈 Tendencias Mensuales</h2>
        <div className="trends-grid">
          {tendenciasMensuales.map((tendencia, index) => (
            <div key={index} className="trend-card">
              <div className="trend-header">
                <h4>{tendencia.mes}</h4>
                <span className={`trend-efficiency ${getEficienciaColor(tendencia.eficiencia_mensual)}`}>
                  {tendencia.eficiencia_mensual}%
                </span>
              </div>
              <div className="trend-stats">
                <div className="trend-stat">
                  <span className="trend-label">Guías:</span>
                  <span className="trend-value">{tendencia.total_guias.toLocaleString()}</span>
                </div>
                <div className="trend-stat">
                  <span className="trend-label">Conductores:</span>
                  <span className="trend-value">{tendencia.conductores_activos}</span>
                </div>
                <div className="trend-stat">
                  <span className="trend-label">Valor:</span>
                  <span className="trend-value">{formatCurrency(tendencia.valor_total)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="quick-actions-section">
        <h2>⚡ Acciones Rápidas Master</h2>
        <div className="actions-grid">
          <button 
            className="action-btn primary"
            onClick={() => window.location.href = '/master/carriers'}
          >
            <span className="action-icon">🏢</span>
            <span>Gestionar Carriers</span>
          </button>
          <button 
            className="action-btn secondary"
            onClick={() => window.location.href = '/master/supervisores'}
          >
            <span className="action-icon">👨‍💼</span>
            <span>Gestionar Supervisores</span>
          </button>
          <button 
            className="action-btn tertiary"
            onClick={() => window.location.href = '/master/reportes'}
          >
            <span className="action-icon">📊</span>
            <span>Reportes Avanzados</span>
          </button>
          <button 
            className="action-btn info"
            onClick={() => exportarDatos("json")}
          >
            <span className="action-icon">📥</span>
            <span>Exportar Todo</span>
          </button>
        </div>
      </div>

      {/* Footer con información técnica */}
      <div className="dashboard-footer">
        <div className="footer-info">
          <div className="source-info">
            <strong>📊 Fuente de Datos:</strong> BigQuery - datos-clientes-441216.Conciliaciones
          </div>
          <div className="tables-info">
            <strong>🗄️ Tablas:</strong> COD_pendientes_v1 • usuarios_BIG • pagosconductor • usuarios
          </div>
          <div className="update-info">
            <strong>🔄 Última actualización:</strong> {new Date(fechaActualizacion).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}