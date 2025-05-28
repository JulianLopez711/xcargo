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
      console.log("Cargando resumen de contabilidad...");
      
      const response = await fetch("http://localhost:8000contabilidad/resumen");
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log("Datos recibidos:", data);
      
      if (Array.isArray(data)) {
        setResumen(data);
        calcularEstadisticas(data);
      } else {
        console.error("Formato de respuesta inválido:", data);
        setError("Formato de datos inválido recibido del servidor");
        setResumen([]);
      }
    } catch (err: any) {
      console.error("Error cargando resumen:", err);
      setError(`Error al cargar datos: ${err.message}`);
      setResumen([]);
    } finally {
      setCargando(false);
    }
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

  const obtenerColorEstado = (estado: string) => {
    const estadoLower = estado.toLowerCase();
    if (estadoLower.includes('pagado') || estadoLower.includes('aprobado')) {
      return 'estado-pagado';
    } else if (estadoLower.includes('pendiente')) {
      return 'estado-pendiente';
    } else if (estadoLower.includes('cancelado') || estadoLower.includes('rechazado')) {
      return 'estado-cancelado';
    }
    return 'estado-default';
  };

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

  if (error) {
    return (
      <div className="dashboard-contabilidad">
        <div className="dashboard-header">
          <h1 className="dashboard-title">📊 Panel de Control - Contabilidad</h1>
        </div>
        <div className="error-container">
          <div className="error-card">
            <h3>❌ Error al cargar datos</h3>
            <p>{error}</p>
            <button className="btn-reintentar" onClick={cargarResumen}>
              🔄 Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-contabilidad">
      {/* Header */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">📊 Panel de Control - Contabilidad</h1>
        <p className="dashboard-subtitle">
          Resumen financiero por cliente y estado de pagos
        </p>
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
        <button className="btn-actualizar" onClick={cargarResumen}>
          🔄 Actualizar Datos
        </button>
      </div>

      {/* Tablas por Cliente */}
      {resumen.length === 0 ? (
        <div className="no-data">
          <h3>📝 No hay datos disponibles</h3>
          <p>No se encontraron registros en el sistema.</p>
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
                      </tr>
                    </thead>
                    <tbody>
                      {cliente.datos.map((fila, idx) => (
                        <tr key={idx} className={obtenerColorEstado(fila.estado)}>
                          <td>
                            <span className={`estado-badge ${obtenerColorEstado(fila.estado)}`}>
                              {fila.estado}
                            </span>
                          </td>
                          <td className="numero">{fila.guias.toLocaleString()}</td>
                          <td className="numero">{formatearMoneda(fila.valor)}</td>
                          <td className="numero">
                            {fila.pendiente > 0 ? formatearMoneda(fila.pendiente) : '-'}
                          </td>
                        </tr>
                      ))}
                      <tr className="fila-total">
                        <td><strong>TOTAL</strong></td>
                        <td className="numero"><strong>{subtotal.guias.toLocaleString()}</strong></td>
                        <td className="numero"><strong>{formatearMoneda(subtotal.valor)}</strong></td>
                        <td className="numero">
                          <strong>
                            {subtotal.pendiente > 0 ? formatearMoneda(subtotal.pendiente) : '-'}
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
          </div>
        </div>
      </div>
    </div>
  );
}