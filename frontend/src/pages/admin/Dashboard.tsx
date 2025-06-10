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

interface ResumenPagos {
  total_pagos: number;
  pagos_pendientes: number;
  pagos_conciliados: number;
  pagos_rechazados: number;
  valor_total: number;
  valor_pendiente: number;
  valor_conciliado: number;
  valor_rechazado: number;
}

interface UsuarioMaster {
  nombre: string;
  rol: string;
  acceso_completo: boolean;
}

export default function DashboardAdmin() {
  const { user } = useAuth();

  const [resumenPagos, setResumenPagos] = useState<ResumenPagos | null>(null); // ← MOVIDO AQUÍ

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
  const [, setTopSupervisores] = useState<Supervisor[]>([]);
  const [analisisCiudades, setAnalisisCiudades] = useState<CiudadAnalisis[]>([]);
  const [, setTendenciasMensuales] = useState<TendenciaMensual[]>([]);
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
    setError("");
    
    console.log("🔍 DIAGNÓSTICO COMPLETO - Usuario actual:", user);
    
    // Verificar que tenemos los datos necesarios
    if (!user) {
      throw new Error("Usuario no autenticado");
    }
    
    if (!user.email || !user.role) {
      throw new Error("Datos de usuario incompletos - falta email o role");
    }
    
    // Construir headers de autenticación - AMBOS MÉTODOS
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    // Método 1: Token JWT (si existe)
    if (user.token) {
      headers["Authorization"] = `Bearer ${user.token}`;
      console.log("🔐 Agregando Authorization header con JWT");
    }
    
    // Método 2: Headers X-User (SIEMPRE agregar como backup)
    headers["X-User-Email"] = user.email;
    headers["X-User-Role"] = user.role;
    
    console.log("📤 Headers que se enviarán:", {
      "Authorization": headers.Authorization ? `Bearer ${headers.Authorization.substring(7, 27)}...` : "NO_PRESENTE",
      "X-User-Email": headers["X-User-Email"],
      "X-User-Role": headers["X-User-Role"]
    });
    
    // Hacer la petición
    console.log("🌐 Haciendo petición a /master/dashboard...");
    const response = await fetch(`https://api.x-cargo.co/master/dashboard`, {
      method: 'GET',
      headers: headers
    });

    console.log("📥 Respuesta recibida:", {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (response.ok) {
      const data = await response.json();
      console.log("✅ Datos recibidos exitosamente");
      
      // Actualizar estados con datos reales
      setStatsGlobales(data.stats_globales || {});
      setRankingCarriers(data.ranking_carriers || []);
      setTopSupervisores(data.top_supervisores || []);
      setAnalisisCiudades(data.analisis_ciudades || []);
      setTendenciasMensuales(data.tendencias_mensuales || []);
      setAlertas(data.alertas || []);
      setUsuarioMaster(data.usuario_master || null);
      setPeriodoAnalisis(data.periodo_analisis || "");
      setFechaActualizacion(data.fecha_actualizacion || "");
      
    } else {
      // Manejar errores específicos
      let errorMessage = `Error HTTP ${response.status}: ${response.statusText}`;
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
        console.error("❌ Error detallado del servidor:", errorData);
      } catch (e) {
        console.error("❌ No se pudo parsear respuesta de error");
      }
      
      throw new Error(errorMessage);
    }

    // Cargar resumen de pagos con manejo robusto de errores
    console.log("📊 Intentando cargar resumen de pagos...");
    try {
      const pagosResp = await fetch("https://api.x-cargo.co/admin/dashboard-pagos", {
        headers: headers
      });
      
      console.log("📥 Respuesta de pagos:", {
        status: pagosResp.status,
        statusText: pagosResp.statusText,
        ok: pagosResp.ok
      });
      
      if (pagosResp.ok) {
        const pagosData = await pagosResp.json();
        console.log("✅ Resumen de pagos cargado:", pagosData);
        setResumenPagos(pagosData);
        
        // Si hay mensaje de información, mostrarlo
        if (pagosData.mensaje) {
          console.log(`ℹ️ Info de pagos: ${pagosData.mensaje}`);
        }
        
      } else {
        // Error en el endpoint de pagos
        console.warn("⚠️ Error en endpoint de pagos:", pagosResp.status);
        
        try {
          const errorData = await pagosResp.json();
          console.warn("   Detalle del error:", errorData);
          
          // Si el backend devuelve datos de fallback, usarlos
          if (errorData.total_pagos !== undefined) {
            setResumenPagos(errorData);
            console.log("✅ Usando datos de fallback de pagos");
          } else {
            // Usar datos por defecto locales
            setResumenPagos(getDefaultPagosData());
            console.log("⚠️ Usando datos por defecto locales para pagos");
          }
        } catch (e) {
          // Error parseando respuesta de error
          setResumenPagos(getDefaultPagosData());
          console.warn("⚠️ Error parseando respuesta de pagos, usando datos por defecto");
        }
      }
      
    } catch (error) {
      // Error de red o conexión al endpoint de pagos
      console.error("❌ Error de conexión al cargar pagos:", error);
      setResumenPagos(getDefaultPagosData());
      console.log("⚠️ Usando datos por defecto debido a error de conexión");
    }

  } catch (error) {
    console.error("❌ ERROR EN CARGAR DASHBOARD:", error);
    
    // Mostrar error real al usuario, sin datos simulados
    const errorMessage = error instanceof Error ? error.message : "Error desconocido al cargar dashboard";
    setError(errorMessage);
    
    // Limpiar estados en caso de error
    setStatsGlobales({
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
    setRankingCarriers([]);
    setTopSupervisores([]);
    setAnalisisCiudades([]);
    setTendenciasMensuales([]);
    setAlertas([]);
    
  } finally {
    setLoading(false);
  }
};

  const exportarDatos = async (formato: string = "json") => {
    try {
      const response = await fetch(`https://api.x-cargo.co/master/export/data?formato=${formato}`, {
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

      {/* Tarjetas de Resumen de Pagos */}
      {resumenPagos && (
        <div className="stats-section">
          <h2>💳 Resumen de Pagos</h2>
          <div className="dashboard-cards">
            <div className="dashboard-card info">
              <div className="card-icon">💳</div>
              <div className="card-content">
                <h3>Total Pagos</h3>
                <div className="card-number">{resumenPagos.total_pagos}</div>
                <div className="card-detail">{formatCurrency(resumenPagos.valor_total)} total</div>
              </div>
            </div>
            <div className="dashboard-card warning">
              <div className="card-icon">⏳</div>
              <div className="card-content">
                <h3>Pendientes</h3>
                <div className="card-number">{resumenPagos.pagos_pendientes}</div>
                <div className="card-detail">{formatCurrency(resumenPagos.valor_pendiente)}</div>
              </div>
            </div>
            <div className="dashboard-card success">
              <div className="card-icon">✅</div>
              <div className="card-content">
                <h3>Conciliados</h3>
                <div className="card-number">{resumenPagos.pagos_conciliados}</div>
                <div className="card-detail">{formatCurrency(resumenPagos.valor_conciliado)}</div>
              </div>
            </div>
            <div className="dashboard-card danger">
              <div className="card-icon">❌</div>
              <div className="card-content">
                <h3>Rechazados</h3>
                <div className="card-number">{resumenPagos.pagos_rechazados}</div>
                <div className="card-detail">{formatCurrency(resumenPagos.valor_rechazado)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

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

// Función auxiliar para datos por defecto de pagos
const getDefaultPagosData = () => ({
  total_pagos: 0,
  pagos_pendientes: 0,
  pagos_conciliados: 0,
  pagos_rechazados: 0,
  valor_total: 0,
  valor_pendiente: 0,
  valor_conciliado: 0,
  valor_rechazado: 0
});