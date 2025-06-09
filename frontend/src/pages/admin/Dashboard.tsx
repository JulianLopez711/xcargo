// src/pages/admin/Dashboard.tsx
import { useEffect, useState } from "react";
import { useAuth } from "../../context/authContext";
import "../../styles/admin/Dashboard.css";

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

export default function DashboardAdmin() {
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
      const response = await fetch(`http://localhost:8000/master/dashboard`, {
        headers: {
          "X-User-Email": user?.email || "",
          "X-User-Role": user?.role || "admin"
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
      
      // Fallback básico para mostrar algo mientras se implementa el backend
      setStatsGlobales({
        total_guias: 15847,
        total_conductores_registrados: 247,
        total_conductores_activos: 198,
        total_carriers_registrados: 15,
        total_carriers_activos: 12,
        guias_pendientes: 3234,
        guias_entregadas: 11892,
        guias_pagadas: 721,
        valor_pendiente: 42580000,
        valor_entregado: 156780000,
        valor_pagado: 8950000,
        promedio_valor_guia: 95000,
        eficiencia_global: 87.3
      });
      
      setRankingCarriers([
        {
          carrier_id: 101,
          carrier_nombre: "LogiTech Corp",
          total_conductores: 35,
          total_guias: 2847,
          guias_pendientes: 423,
          guias_entregadas: 2234,
          valor_pendiente: 5680000,
          valor_entregado: 18340000,
          promedio_valor_guia: 95000,
          ciudades_principales: "Bogotá, Medellín, Cali",
          ultima_actividad: "2025-05-29",
          eficiencia: 92.1
        },
        {
          carrier_id: 102,
          carrier_nombre: "FastTrack Inc",
          total_conductores: 28,
          total_guias: 2156,
          guias_pendientes: 312,
          guias_entregadas: 1687,
          valor_pendiente: 4320000,
          valor_entregado: 14560000,
          promedio_valor_guia: 87000,
          ciudades_principales: "Barranquilla, Cartagena",
          ultima_actividad: "2025-05-29",
          eficiencia: 88.7
        }
      ]);
      
      setAnalisisCiudades([
        { ciudad: "Bogotá", total_guias: 4567, conductores_activos: 67, carriers_activos: 8, valor_pendiente: 15900000, guias_pendientes: 567, eficiencia: 91.2 },
        { ciudad: "Medellín", total_guias: 3234, conductores_activos: 45, carriers_activos: 6, valor_pendiente: 8900000, guias_pendientes: 423, eficiencia: 89.8 }
      ]);
      
      setPeriodoAnalisis("Demo - Datos de ejemplo");
      setFechaActualizacion(new Date().toISOString());
    } finally {
      setLoading(false);
    }
  };

  const exportarDatos = async (formato: string = "json") => {
    try {
      const response = await fetch(`http://localhost:8000/master/export/data?formato=${formato}`, {
        headers: {
          "X-User-Email": user?.email || "",
          "X-User-Role": user?.role || "admin"
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
      } else {
        // Fallback: exportar datos actuales
        const exportData = {
          stats_globales: statsGlobales,
          ranking_carriers: rankingCarriers,
          analisis_ciudades: analisisCiudades,
          fecha_exportacion: new Date().toISOString(),
          usuario: user?.email
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
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
      <div className="dashboard-admin">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Consultando datos globales de BigQuery...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-admin">
      <div className="dashboard-header">
        <div className="header-info">
          <h1>🎯 Dashboard Master - Vista Global</h1>
          <div className="user-info">
            <span className="user-badge master">
              👑 {usuarioMaster?.nombre || user?.email || "Master"} • {usuarioMaster?.rol || user?.role || "admin"}
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
          ⚠️ {error}
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
        <div className="dashboard-cards">
          <div className="dashboard-card primary">
            <div className="card-icon">📦</div>
            <div className="card-content">
              <h3>Guías Totales</h3>
              <div className="card-number">{statsGlobales.total_guias.toLocaleString()}</div>
              <div className="card-detail">
                {statsGlobales.guias_pendientes.toLocaleString()} pendientes • {statsGlobales.guias_entregadas.toLocaleString()} entregadas
              </div>
            </div>
          </div>

          <div className="dashboard-card success">
            <div className="card-icon">👥</div>
            <div className="card-content">
              <h3>Conductores</h3>
              <div className="card-number">{statsGlobales.total_conductores_registrados}</div>
              <div className="card-detail">
                {statsGlobales.total_conductores_activos} activos ({((statsGlobales.total_conductores_activos / Math.max(statsGlobales.total_conductores_registrados, 1)) * 100).toFixed(1)}%)
              </div>
            </div>
          </div>

          <div className="dashboard-card warning">
            <div className="card-icon">💰</div>
            <div className="card-content">
              <h3>Valor Pendiente</h3>
              <div className="card-number">{formatCurrency(statsGlobales.valor_pendiente)}</div>
              <div className="card-detail">
                Promedio: {formatCurrency(statsGlobales.promedio_valor_guia)}
              </div>
            </div>
          </div>

          <div className="dashboard-card info">
            <div className="card-icon">🏢</div>
            <div className="card-content">
              <h3>Carriers</h3>
              <div className="card-number">{statsGlobales.total_carriers_registrados}</div>
              <div className="card-detail">
                {statsGlobales.total_carriers_activos} activos • {statsGlobales.eficiencia_global}% eficiencia
              </div>
            </div>
          </div>

          <div className="dashboard-card secondary">
            <div className="card-icon">✅</div>
            <div className="card-content">
              <h3>Valor Entregado</h3>
              <div className="card-number">{formatCurrency(statsGlobales.valor_entregado)}</div>
              <div className="card-detail">
                {statsGlobales.guias_entregadas.toLocaleString()} entregas exitosas
              </div>
            </div>
          </div>

          <div className="dashboard-card purple">
            <div className="card-icon">💳</div>
            <div className="card-content">
              <h3>Valor Pagado</h3>
              <div className="card-number">{formatCurrency(statsGlobales.valor_pagado)}</div>
              <div className="card-detail">
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
        {/* Top Ciudades */}
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

        {/* Acciones rápidas */}
        <div className="content-section">
          <h3>⚡ Acciones Rápidas Master</h3>
          <div className="actions-grid">
            <button 
              className="action-btn primary"
              onClick={() => window.location.href = '/admin/usuarios'}
            >
              <span className="action-icon">👥</span>
              <span>Gestionar Usuarios</span>
            </button>
            <button 
              className="action-btn secondary"
              onClick={() => window.location.href = '/admin/roles-permisos'}
            >
              <span className="action-icon">🔐</span>
              <span>Roles y Permisos</span>
            </button>
            <button 
              className="action-btn tertiary"
              onClick={() => window.location.href = '/admin/entregas'}
            >
              <span className="action-icon">📦</span>
              <span>Ver Entregas</span>
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