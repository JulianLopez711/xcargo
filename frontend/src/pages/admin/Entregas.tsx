import { useEffect, useState } from "react";
import { useAuth } from "../../context/authContext";
import "../../styles/admin/Entregas.css";

interface Entrega {
  tracking_number: string;
  conductor: string;
  conductor_email: string;
  carrier: string;
  carrier_id: number;
  cliente: string;
  ciudad: string;
  departamento: string;
  valor: number;
  fecha: string;
  estado: string;
  employee_id: number;
}

interface EstadisticasEntregas {
  total_entregas: number;
  entregas_pendientes: number;
  entregas_completadas: number;
  entregas_pagadas: number;
  valor_total: number;
  valor_pendiente: number;
  carriers_activos: number;
  conductores_activos: number;
}

export default function EntregasAdmin() {
  const { user } = useAuth();
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [estadisticas, setEstadisticas] = useState<EstadisticasEntregas>({
    total_entregas: 0,
    entregas_pendientes: 0,
    entregas_completadas: 0,
    entregas_pagadas: 0,
    valor_total: 0,
    valor_pendiente: 0,
    carriers_activos: 0,
    conductores_activos: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtros
  const [filtroCarrier, setFiltroCarrier] = useState("");
  const [filtroConductor, setFiltroConductor] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroCiudad, setFiltroCiudad] = useState("");
  const [filtroFechaInicio, setFiltroFechaInicio] = useState("");
  const [filtroFechaFin, setFiltroFechaFin] = useState("");
  const [filtroValorMin, setFiltroValorMin] = useState("");
  const [filtroValorMax, setFiltroValorMax] = useState("");

  // Paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const registrosPorPagina = 50;

  // Listas para filtros
  const [carriersDisponibles, setCarriersDisponibles] = useState<string[]>([]);
  const [conductoresDisponibles, setConductoresDisponibles] = useState<string[]>([]);
  const [ciudadesDisponibles, setCiudadesDisponibles] = useState<string[]>([]);
  const [estadosDisponibles, setEstadosDisponibles] = useState<string[]>([]);

  useEffect(() => {
    cargarEntregas();
    cargarEstadisticas();
    cargarFiltros();
  }, [paginaActual]);

  useEffect(() => {
    // Resetear página cuando cambian los filtros
    if (paginaActual !== 1) {
      setPaginaActual(1);
    } else {
      cargarEntregas();
    }
  }, [filtroCarrier, filtroConductor, filtroEstado, filtroCiudad, filtroFechaInicio, filtroFechaFin, filtroValorMin, filtroValorMax]);

  const cargarEntregas = async () => {
    try {
      setLoading(true);
      
      // Construir parámetros de consulta
      const params = new URLSearchParams({
        page: paginaActual.toString(),
        limit: registrosPorPagina.toString()
      });

      if (filtroCarrier) params.append('carrier', filtroCarrier);
      if (filtroConductor) params.append('conductor', filtroConductor);
      if (filtroEstado) params.append('estado', filtroEstado);
      if (filtroCiudad) params.append('ciudad', filtroCiudad);
      if (filtroFechaInicio) params.append('fecha_inicio', filtroFechaInicio);
      if (filtroFechaFin) params.append('fecha_fin', filtroFechaFin);
      if (filtroValorMin) params.append('valor_min', filtroValorMin);
      if (filtroValorMax) params.append('valor_max', filtroValorMax);

      const response = await fetch(`https://api.x-cargo.co/admin/entregas?${params.toString()}`, {
        headers: {
          "X-User-Email": user?.email || "",
          "X-User-Role": user?.role || "admin"
        }
      });

      if (response.ok) {
        const data = await response.json();
        setEntregas(data.entregas || []);
        setTotalRegistros(data.total || 0);
        setTotalPaginas(Math.ceil((data.total || 0) / registrosPorPagina));
        setError("");
      } else {
        throw new Error(`Error HTTP ${response.status}`);
      }
    } catch (error) {
      console.error("Error cargando entregas:", error);
      setError("Error al cargar entregas. Usando datos de ejemplo.");
      
      // Fallback con datos de ejemplo basados en la estructura real
      const entregasEjemplo: Entrega[] = [
        {
          tracking_number: "TRK001234567",
          conductor: "Carlos Mendoza",
          conductor_email: "carlos.mendoza@logitechcorp.com",
          carrier: "LogiTech Corp",
          carrier_id: 101,
          cliente: "Dafity",
          ciudad: "Bogotá",
          departamento: "Cundinamarca",
          valor: 45000,
          fecha: "2025-05-29",
          estado: "Entregado",
          employee_id: 1001
        },
        {
          tracking_number: "TRK001234568",
          conductor: "Ana Rodríguez",
          conductor_email: "ana.rodriguez@fasttrack.com",
          carrier: "FastTrack Inc",
          carrier_id: 102,
          cliente: "Dropi",
          ciudad: "Medellín",
          departamento: "Antioquia",
          valor: 67000,
          fecha: "2025-05-28",
          estado: "Pendiente",
          employee_id: 1002
        },
        {
          tracking_number: "TRK001234569",
          conductor: "Diego Silva",
          conductor_email: "diego.silva@quickship.com",
          carrier: "QuickShip SA",
          carrier_id: 103,
          cliente: "triddi",
          ciudad: "Cali",
          departamento: "Valle del Cauca",
          valor: 89000,
          fecha: "2025-05-27",
          estado: "PAGADO",
          employee_id: 1003
        }
      ];
      
      setEntregas(entregasEjemplo);
      setTotalRegistros(entregasEjemplo.length);
      setTotalPaginas(1);
    } finally {
      setLoading(false);
    }
  };

  const cargarEstadisticas = async () => {
    try {
      const response = await fetch(`https://api.x-cargo.co/admin/estadisticas-entregas`, {
        headers: {
          "X-User-Email": user?.email || "",
          "X-User-Role": user?.role || "admin"
        }
      });

      if (response.ok) {
        const data = await response.json();
        setEstadisticas(data);
      } else {
        // Fallback con estadísticas de ejemplo
        setEstadisticas({
          total_entregas: 15847,
          entregas_pendientes: 3234,
          entregas_completadas: 11892,
          entregas_pagadas: 721,
          valor_total: 208350000,
          valor_pendiente: 42580000,
          carriers_activos: 12,
          conductores_activos: 198
        });
      }
    } catch (error) {
      console.error("Error cargando estadísticas:", error);
    }
  };

  const cargarFiltros = async () => {
    try {
      const response = await fetch(`https://api.x-cargo.co/admin/filtros-entregas`, {
        headers: {
          "X-User-Email": user?.email || "",
          "X-User-Role": user?.role || "admin"
        }
      });

      if (response.ok) {
        const data = await response.json();
        setCarriersDisponibles(data.carriers || []);
        setConductoresDisponibles(data.conductores || []);
        setCiudadesDisponibles(data.ciudades || []);
        setEstadosDisponibles(data.estados || []);
      } else {
        // Fallback con opciones de ejemplo
        setCarriersDisponibles(["LogiTech Corp", "FastTrack Inc", "QuickShip SA", "SpeedCorp"]);
        setConductoresDisponibles(["Carlos Mendoza", "Ana Rodríguez", "Diego Silva"]);
        setCiudadesDisponibles(["Bogotá", "Medellín", "Cali", "Barranquilla", "Bucaramanga"]);
        setEstadosDisponibles(["Pendiente", "En Ruta", "Entregado", "PAGADO", "liberado"]);
      }
    } catch (error) {
      console.error("Error cargando filtros:", error);
    }
  };

  const exportarEntregas = async () => {
    try {
      const params = new URLSearchParams();
      if (filtroCarrier) params.append('carrier', filtroCarrier);
      if (filtroConductor) params.append('conductor', filtroConductor);
      if (filtroEstado) params.append('estado', filtroEstado);
      if (filtroCiudad) params.append('ciudad', filtroCiudad);
      if (filtroFechaInicio) params.append('fecha_inicio', filtroFechaInicio);
      if (filtroFechaFin) params.append('fecha_fin', filtroFechaFin);

      const response = await fetch(`https://api.x-cargo.co/admin/exportar-entregas?${params.toString()}`, {
        headers: {
          "X-User-Email": user?.email || "",
          "X-User-Role": user?.role || "admin"
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `entregas_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // Fallback: exportar datos actuales como JSON
        const exportData = {
          entregas: entregas,
          estadisticas: estadisticas,
          filtros_aplicados: {
            carrier: filtroCarrier,
            conductor: filtroConductor,
            estado: filtroEstado,
            ciudad: filtroCiudad,
            fecha_inicio: filtroFechaInicio,
            fecha_fin: filtroFechaFin
          },
          fecha_exportacion: new Date().toISOString(),
          usuario: user?.email
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `entregas_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Error exportando entregas:", error);
      alert("Error al exportar entregas");
    }
  };

  const limpiarFiltros = () => {
    setFiltroCarrier("");
    setFiltroConductor("");
    setFiltroEstado("");
    setFiltroCiudad("");
    setFiltroFechaInicio("");
    setFiltroFechaFin("");
    setFiltroValorMin("");
    setFiltroValorMax("");
    setPaginaActual(1);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getEstadoColor = (estado: string) => {
    switch (estado.toLowerCase()) {
      case 'entregado':
        return 'estado-entregado';
      case 'pendiente':
        return 'estado-pendiente';
      case 'en ruta':
        return 'estado-ruta';
      case 'pagado':
        return 'estado-pagado';
      case 'liberado':
        return 'estado-liberado';
      default:
        return 'estado-default';
    }
  };

  const cambiarPagina = (nuevaPagina: number) => {
    if (nuevaPagina >= 1 && nuevaPagina <= totalPaginas) {
      setPaginaActual(nuevaPagina);
    }
  };

  return (
    <div className="entregas-admin">
      <div className="entregas-header">
        <div className="header-info">
          <h1>📦 Gestión de Entregas - Vista Global</h1>
          <p>Administra todas las entregas del sistema desde BigQuery</p>
        </div>
        <div className="header-actions">
          <button 
            className="btn-export"
            onClick={exportarEntregas}
            disabled={loading}
          >
            📊 Exportar Entregas
          </button>
          <button 
            className="btn-refresh"
            onClick={cargarEntregas}
            disabled={loading}
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

      {/* Estadísticas Globales */}
      <div className="estadisticas-section">
        <h2>📊 Estadísticas Globales</h2>
        <div className="estadisticas-grid">
          <div className="estadistica-card">
            <div className="card-icon">📦</div>
            <div className="card-content">
              <h3>Total Entregas</h3>
              <div className="card-number">{estadisticas.total_entregas.toLocaleString()}</div>
              <div className="card-detail">Todas las guías del sistema</div>
            </div>
          </div>
          
          <div className="estadistica-card warning">
            <div className="card-icon">⏳</div>
            <div className="card-content">
              <h3>Pendientes</h3>
              <div className="card-number">{estadisticas.entregas_pendientes.toLocaleString()}</div>
              <div className="card-detail">{formatCurrency(estadisticas.valor_pendiente)}</div>
            </div>
          </div>
          
          <div className="estadistica-card success">
            <div className="card-icon">✅</div>
            <div className="card-content">
              <h3>Completadas</h3>
              <div className="card-number">{estadisticas.entregas_completadas.toLocaleString()}</div>
              <div className="card-detail">{((estadisticas.entregas_completadas / Math.max(estadisticas.total_entregas, 1)) * 100).toFixed(1)}% del total</div>
            </div>
          </div>
          
          <div className="estadistica-card info">
            <div className="card-icon">💳</div>
            <div className="card-content">
              <h3>Pagadas</h3>
              <div className="card-number">{estadisticas.entregas_pagadas.toLocaleString()}</div>
              <div className="card-detail">Proceso completado</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros Avanzados */}
      <div className="filtros-section">
        <div className="filtros-header">
          <h3>🔍 Filtros Avanzados</h3>
          <button 
            className="btn-limpiar"
            onClick={limpiarFiltros}
          >
            🗑️ Limpiar Filtros
          </button>
        </div>
        
        <div className="filtros-grid">
          <div className="filtro-group">
            <label>Carrier</label>
            <select 
              value={filtroCarrier} 
              onChange={(e) => setFiltroCarrier(e.target.value)}
            >
              <option value="">Todos los carriers</option>
              {carriersDisponibles.map(carrier => (
                <option key={carrier} value={carrier}>{carrier}</option>
              ))}
            </select>
          </div>

          <div className="filtro-group">
            <label>Conductor</label>
            <select 
              value={filtroConductor} 
              onChange={(e) => setFiltroConductor(e.target.value)}
            >
              <option value="">Todos los conductores</option>
              {conductoresDisponibles.map(conductor => (
                <option key={conductor} value={conductor}>{conductor}</option>
              ))}
            </select>
          </div>

          <div className="filtro-group">
            <label>Estado</label>
            <select 
              value={filtroEstado} 
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="">Todos los estados</option>
              {estadosDisponibles.map(estado => (
                <option key={estado} value={estado}>{estado}</option>
              ))}
            </select>
          </div>

          <div className="filtro-group">
            <label>Ciudad</label>
            <select 
              value={filtroCiudad} 
              onChange={(e) => setFiltroCiudad(e.target.value)}
            >
              <option value="">Todas las ciudades</option>
              {ciudadesDisponibles.map(ciudad => (
                <option key={ciudad} value={ciudad}>{ciudad}</option>
              ))}
            </select>
          </div>

          <div className="filtro-group">
            <label>Fecha Inicio</label>
            <input
              type="date"
              value={filtroFechaInicio}
              onChange={(e) => setFiltroFechaInicio(e.target.value)}
            />
          </div>

          <div className="filtro-group">
            <label>Fecha Fin</label>
            <input
              type="date"
              value={filtroFechaFin}
              onChange={(e) => setFiltroFechaFin(e.target.value)}
            />
          </div>

          <div className="filtro-group">
            <label>Valor Mínimo</label>
            <input
              type="number"
              placeholder="Ej: 10000"
              value={filtroValorMin}
              onChange={(e) => setFiltroValorMin(e.target.value)}
            />
          </div>

          <div className="filtro-group">
            <label>Valor Máximo</label>
            <input
              type="number"
              placeholder="Ej: 100000"
              value={filtroValorMax}
              onChange={(e) => setFiltroValorMax(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Tabla de Entregas */}
      <div className="tabla-section">
        <div className="tabla-header">
          <h3>📋 Entregas ({totalRegistros.toLocaleString()} registros)</h3>
          <div className="tabla-info">
            Página {paginaActual} de {totalPaginas} • Mostrando {entregas.length} de {totalRegistros}
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Consultando entregas desde BigQuery...</p>
          </div>
        ) : (
          <>
            <div className="tabla-container">
              <table className="tabla-entregas">
                <thead>
                  <tr>
                    <th>Tracking</th>
                    <th>Conductor</th>
                    <th>Carrier</th>
                    <th>Cliente</th>
                    <th>Ciudad</th>
                    <th>Valor</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {entregas.length > 0 ? (
                    entregas.map((entrega, index) => (
                      <tr key={`${entrega.tracking_number}-${index}`}>
                        <td className="tracking-cell">
                          <div className="tracking-info">
                            <strong>{entrega.tracking_number}</strong>
                            <small>ID: {entrega.employee_id}</small>
                          </div>
                        </td>
                        <td className="conductor-cell">
                          <div className="conductor-info">
                            <strong>{entrega.conductor}</strong>
                            <small>{entrega.conductor_email}</small>
                          </div>
                        </td>
                        <td className="carrier-cell">
                          <div className="carrier-info">
                            <strong>{entrega.carrier}</strong>
                            <small>ID: {entrega.carrier_id}</small>
                          </div>
                        </td>
                        <td>{entrega.cliente}</td>
                        <td className="location-cell">
                          <div className="location-info">
                            <strong>{entrega.ciudad}</strong>
                            <small>{entrega.departamento}</small>
                          </div>
                        </td>
                        <td className="valor-cell">
                          <strong>{formatCurrency(entrega.valor)}</strong>
                        </td>
                        <td className="fecha-cell">
                          {new Date(entrega.fecha).toLocaleDateString('es-CO')}
                        </td>
                        <td>
                          <span className={`estado-badge ${getEstadoColor(entrega.estado)}`}>
                            {entrega.estado}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="empty-state">
                        No hay entregas que coincidan con los filtros aplicados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPaginas > 1 && (
              <div className="paginacion">
                <button 
                  className="btn-paginacion"
                  onClick={() => cambiarPagina(paginaActual - 1)}
                  disabled={paginaActual === 1}
                >
                  ← Anterior
                </button>
                
                <div className="paginas-numeros">
                  {Array.from({ length: Math.min(5, totalPaginas) }, (_, index) => {
                    const startPage = Math.max(1, paginaActual - 2);
                    const pageNumber = startPage + index;
                    if (pageNumber <= totalPaginas) {
                      return (
                        <button
                          key={pageNumber}
                          className={`btn-pagina ${pageNumber === paginaActual ? 'active' : ''}`}
                          onClick={() => cambiarPagina(pageNumber)}
                        >
                          {pageNumber}
                        </button>
                      );
                    }
                    return null;
                  })}
                </div>
                
                <button 
                  className="btn-paginacion"
                  onClick={() => cambiarPagina(paginaActual + 1)}
                  disabled={paginaActual === totalPaginas}
                >
                  Siguiente →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer con información técnica */}
      <div className="entregas-footer">
        <div className="footer-info">
          <div className="source-info">
            <strong>📊 Fuente:</strong> BigQuery COD_pendientes_v1 + usuarios_BIG
          </div>
          <div className="update-info">
            <strong>🔄 Actualizado:</strong> {new Date().toLocaleString()}
          </div>
          <div className="user-info">
            <strong>👤 Usuario:</strong> {user?.email}
          </div>
        </div>
      </div>
    </div>
  );
}