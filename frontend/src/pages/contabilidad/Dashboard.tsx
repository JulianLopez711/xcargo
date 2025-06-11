import { useEffect, useState } from "react";
import "../../styles/contabilidad/DashboardContabilidad.css";

interface GuiaResumen {
  estado: string;
  guias: number;
  valor: number;
  pendiente: number;
}

interface ClienteResumen {
  cliente: string;
  datos: GuiaResumen[];
}

interface EstadisticasGenerales {
  totalGuias: number;
  totalValor: number;
  totalPendiente: number;
  totalClientes: number;
}

interface ApiError {
  message: string;
  status?: number;
}

export default function DashboardContabilidad() {
  const [resumen, setResumen] = useState<ClienteResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string>("");
  const [estadisticas, setEstadisticas] = useState<EstadisticasGenerales>({
    totalGuias: 0,
    totalValor: 0,
    totalPendiente: 0,
    totalClientes: 0
  });

  const cargarResumen = async () => {
    setCargando(true);
    setError("");
    
    try {
      const response = await fetch("http://127.0.0.1:8000/contabilidad/resumen", {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Timeout de 30 segundos
        signal: AbortSignal.timeout(30000)
      });
      
      if (!response.ok) {
        throw new ApiError(`HTTP ${response.status}: ${response.statusText}`, response.status);
      }
      
      const data = await response.json();

      if (Array.isArray(data)) {
        setResumen(data);
        calcularEstadisticas(data);
        setError(""); // Limpiar error previo
      } else {
        console.error("Formato de respuesta inválido:", data);
        setError("Formato de datos inválido recibido del servidor");
        setResumen([]);
        mostrarDatosEjemplo();
      }
    } catch (err: unknown) {
      console.error("Error cargando resumen:", err);
      
      let mensajeError = "Error desconocido";
      
      if (err instanceof TypeError && err.message.includes('fetch')) {
        mensajeError = "No se pudo conectar al servidor. Verifique su conexión.";
      } else if (err instanceof Error) {
        if (err.name === 'AbortError') {
          mensajeError = "La consulta tardó demasiado tiempo. Intente nuevamente.";
        } else if (err.message.includes('HTTP 500')) {
          mensajeError = "Error interno del servidor. Contacte al administrador.";
        } else {
          mensajeError = err.message;
        }
      }
      
      setError(mensajeError);
      mostrarDatosEjemplo();
    } finally {
      setCargando(false);
    }
  };

  // Función separada para datos de ejemplo (solo en desarrollo)
  const mostrarDatosEjemplo = () => {
    const datosEjemplo: ClienteResumen[] = [
      {
        cliente: "DROPI - XCargo",
        datos: [
          { estado: "360 - Entregado al cliente", guias: 150, valor: 12500000, pendiente: 0 },
          { estado: "302 - En ruta de última milla", guias: 25, valor: 2100000, pendiente: 2100000 },
          { estado: "301 - Asignado a ruta de última milla", guias: 10, valor: 850000, pendiente: 850000 }
        ]
      },
      {
        cliente: "Cliente Ejemplo 2",
        datos: [
          { estado: "360 - Entregado al cliente", guias: 80, valor: 6400000, pendiente: 0 },
          { estado: "302 - En ruta de última milla", guias: 15, valor: 1200000, pendiente: 1200000 }
        ]
      }
    ];
    
    console.warn("Usando datos de ejemplo debido al error");
    setResumen(datosEjemplo);
    calcularEstadisticas(datosEjemplo);
  };

  const calcularEstadisticas = (data: ClienteResumen[]) => {
    const stats = data.reduce((acc, cliente) => {
      const subtotal = calcularSubtotal(cliente.datos);
      acc.totalGuias += subtotal.guias;
      acc.totalValor += subtotal.valor;
      acc.totalPendiente += subtotal.pendiente;
      return acc;
    }, {
      totalGuias: 0,
      totalValor: 0,
      totalPendiente: 0,
      totalClientes: data.length
    });
    
    setEstadisticas(stats);
  };

  useEffect(() => {
    cargarResumen();
  }, []);

  const calcularSubtotal = (datos: GuiaResumen[]) =>
    datos.reduce(
      (acc, d) => {
        acc.guias += d.guias;
        acc.valor += d.valor;
        acc.pendiente += d.pendiente;
        return acc;
      },
      { guias: 0, valor: 0, pendiente: 0 }
    );

  const formatearMoneda = (valor: number) => {
    return valor.toLocaleString('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  const obtenerColorEstado = (estado: string): string => {
    const estadoLower = estado.toLowerCase();
    
    if (estadoLower.includes('360') || estadoLower.includes('entregado')) {
      return 'estado-entregado';
    } else if (estadoLower.includes('302') || estadoLower.includes('301') || 
               estadoLower.includes('ruta') || estadoLower.includes('asignado')) {
      return 'estado-en-proceso';
    } else if (estadoLower.includes('pagado') || estadoLower.includes('aprobado')) {
      return 'estado-pagado';
    } else if (estadoLower.includes('pendiente')) {
      return 'estado-pendiente';
    } else if (estadoLower.includes('cancelado') || estadoLower.includes('rechazado')) {
      return 'estado-cancelado';
    }
    
    return 'estado-default';
  };

  const obtenerIconoEstado = (estado: string): string => {
    const estadoLower = estado.toLowerCase();
    
    if (estadoLower.includes('360') || estadoLower.includes('entregado')) {
      return '✅';
    } else if (estadoLower.includes('302') || estadoLower.includes('ruta')) {
      return '🚚';
    } else if (estadoLower.includes('301') || estadoLower.includes('asignado')) {
      return '📋';
    } else if (estadoLower.includes('pagado')) {
      return '💰';
    } else if (estadoLower.includes('pendiente')) {
      return '⏳';
    } else if (estadoLower.includes('cancelado')) {
      return '❌';
    }
    
    return '📦';
  };

  // Estados de carga
  if (cargando) {
    return (
      <div className="dashboard-contabilidad">
        <div className="dashboard-header">
          <h1 className="dashboard-title">📊 Panel de Control - Contabilidad</h1>
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Cargando resumen contable...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-contabilidad">
      {/* Header Principal */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">📊 Panel de Control - Contabilidad</h1>
        <p className="dashboard-subtitle">
          Resumen financiero por cliente y estado de pagos
        </p>
        {error && (
          <div className="error-banner">
            ⚠️ {error}
            {resumen.length > 0 && " - Mostrando datos de ejemplo"}
          </div>
        )}
      </div>

      {/* Estadísticas Generales */}
      <div className="estadisticas-generales">
        <div className="stat-card">
          <div className="stat-icon blue">📋</div>
          <div className="stat-content">
            <div className="stat-number">{estadisticas.totalGuias.toLocaleString()}</div>
            <div className="stat-label">Total Guías</div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon green">💰</div>
          <div className="stat-content">
            <div className="stat-number">{formatearMoneda(estadisticas.totalValor)}</div>
            <div className="stat-label">Valor Total</div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon yellow">⏳</div>
          <div className="stat-content">
            <div className="stat-number">{formatearMoneda(estadisticas.totalPendiente)}</div>
            <div className="stat-label">Total Pendiente</div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon purple">👥</div>
          <div className="stat-content">
            <div className="stat-number">{estadisticas.totalClientes}</div>
            <div className="stat-label">Clientes Activos</div>
          </div>
        </div>
      </div>

      {/* Controles */}
      <div className="dashboard-controls">
        <button 
          className="btn-actualizar" 
          onClick={cargarResumen}
          disabled={cargando}
          aria-label="Actualizar datos del dashboard"
        >
          {cargando ? '⏳ Actualizando...' : '🔄 Actualizar Datos'}
        </button>
        <div className="dashboard-info">
          <small>
            📊 Última actualización: {new Date().toLocaleString('es-CO')}
          </small>
        </div>
      </div>

      {/* Contenido Principal */}
      {resumen.length === 0 ? (
        <div className="no-data">
          <h3>📝 No hay datos disponibles</h3>
          <p>No se encontraron registros en el sistema.</p>
          <button 
            className="btn-actualizar" 
            onClick={cargarResumen}
            disabled={cargando}
          >
            🔄 Intentar nuevamente
          </button>
        </div>
      ) : (
        <div className="tablas-container">
          {resumen.map((cliente) => {
            const subtotal = calcularSubtotal(cliente.datos);
            return (
              <div className="tabla-cliente" key={cliente.cliente}>
                <div className="cliente-header">
                  <h3 className="cliente-nombre">👤 {cliente.cliente}</h3>
                  <div className="cliente-resumen">
                    <span className="resumen-item">
                      📋 {subtotal.guias} guías
                    </span>
                    <span className="resumen-item">
                      💰 {formatearMoneda(subtotal.valor)}
                    </span>
                    {subtotal.pendiente > 0 && (
                      <span className="resumen-item pendiente">
                        ⏳ {formatearMoneda(subtotal.pendiente)}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="tabla-container">
                  <table className="tabla-datos">
                    <thead>
                      <tr>
                        <th>Estado</th>
                        <th>Guías</th>
                        <th>Valor</th>
                        <th>Pendiente</th>
                        <th>% Completado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cliente.datos.map((fila, idx) => {
                        const porcentajeCompletado = fila.valor > 0 
                          ? Math.round(((fila.valor - fila.pendiente) / fila.valor) * 100)
                          : 0;
                        
                        return (
                          <tr key={idx} className={obtenerColorEstado(fila.estado)}>
                            <td>
                              <span className={`estado-badge ${obtenerColorEstado(fila.estado)}`}>
                                {obtenerIconoEstado(fila.estado)} {fila.estado}
                              </span>
                            </td>
                            <td className="numero">{fila.guias.toLocaleString()}</td>
                            <td className="numero">{formatearMoneda(fila.valor)}</td>
                            <td className="numero">
                              {fila.pendiente > 0 ? formatearMoneda(fila.pendiente) : '-'}
                            </td>
                            <td className="numero">
                              <div className="progress-container">
                                <div className="progress-bar">
                                  <div 
                                    className="progress-fill" 
                                    style={{ width: `${porcentajeCompletado}%` }}
                                  ></div>
                                </div>
                                <span className="progress-text">{porcentajeCompletado}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="fila-total">
                        <td><strong>TOTAL</strong></td>
                        <td className="numero"><strong>{subtotal.guias.toLocaleString()}</strong></td>
                        <td className="numero"><strong>{formatearMoneda(subtotal.valor)}</strong></td>
                        <td className="numero">
                          <strong>
                            {subtotal.pendiente > 0 ? formatearMoneda(subtotal.pendiente) : '-'}
                          </strong>
                        </td>
                        <td className="numero">
                          <strong>
                            {subtotal.valor > 0 
                              ? Math.round(((subtotal.valor - subtotal.pendiente) / subtotal.valor) * 100)
                              : 0}%
                          </strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Totales Generales */}
      <div className="totales-generales">
        <div className="totales-card">
          <h3 className="totales-titulo">📊 Resumen General</h3>
          <div className="totales-grid">
            <div className="total-item">
              <div className="total-numero">{estadisticas.totalGuias.toLocaleString()}</div>
              <div className="total-label">Total Guías</div>
            </div>
            <div className="total-item">
              <div className="total-numero">{formatearMoneda(estadisticas.totalValor)}</div>
              <div className="total-label">Valor Total</div>
            </div>
            <div className="total-item">
              <div className="total-numero">{formatearMoneda(estadisticas.totalPendiente)}</div>
              <div className="total-label">Total Pendiente</div>
            </div>
            <div className="total-item">
              <div className="total-numero">
                {estadisticas.totalValor > 0 
                  ? Math.round(((estadisticas.totalValor - estadisticas.totalPendiente) / estadisticas.totalValor) * 100)
                  : 0}%
              </div>
              <div className="total-label">Completado</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Clase de error personalizada
class ApiError extends Error {
  status?: number;
  
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}