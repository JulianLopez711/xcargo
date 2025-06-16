import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContext";
import * as XLSX from 'xlsx';
import "../../styles/contabilidad/Entregas.css";

interface EntregaConciliada {
  tracking: string;
  referencia_pago: string;
  cliente: string;
  valor: number;
  fecha: string;
  correo_conductor: string;
  entidad_pago: string;
  tipo: string;
  estado_conciliacion: string;
  valor_banco_conciliado: number;
  fecha_conciliacion: string;
  confianza_match: number;
  listo_para_liquidar: boolean;
  integridad_ok: boolean;
  calidad_conciliacion: string;
  observaciones_conciliacion?: string;
  diferencia_valor: number;
}

interface Filtros {
  cliente: string;
  desde: string;
  hasta: string;
  solo_conciliadas: boolean;
  calidad_minima: string;
}

interface EstadisticasConciliacion {
  total_entregas: number;
  valor_total: number;
  entregas_listas: number;
  valor_listo: number;
  porcentaje_calidad: number;
  confianza_promedio: number;
}

export default function EntregasConciliadas() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Estados principales
  const [entregas, setEntregas] = useState<EntregaConciliada[]>([]);
  const [entregasFiltradas, setEntregasFiltradas] = useState<EntregaConciliada[]>([]);
  const [estadisticas, setEstadisticas] = useState<EstadisticasConciliacion>({
    total_entregas: 0,
    valor_total: 0,
    entregas_listas: 0,
    valor_listo: 0,
    porcentaje_calidad: 0,
    confianza_promedio: 0
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filtros
  const [filtros, setFiltros] = useState<Filtros>({
    cliente: "",
    desde: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    hasta: new Date().toISOString().split('T')[0],
    solo_conciliadas: true,
    calidad_minima: ""
  });

  // Selección múltiple
  const [entregasSeleccionadas, setEntregasSeleccionadas] = useState<Set<string>>(new Set());
  const [seleccionarTodas, setSeleccionarTodas] = useState(false);

  // Opciones para filtros
  const [clientesDisponibles, setClientesDisponibles] = useState<string[]>([]);
  const [paginaActual, setPaginaActual] = useState(1);
  const registrosPorPagina = 50;

  // Headers para autenticación
  const headers = useMemo(() => {
    if (!user) return {};
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (user.token) headers["Authorization"] = `Bearer ${user.token}`;
    if (user.email) headers["X-User-Email"] = user.email;
    if (user.role) headers["X-User-Role"] = user.role;
    return headers;
  }, [user]);

  // Cargar datos de entregas conciliadas
  const cargarEntregas = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        solo_conciliadas: filtros.solo_conciliadas.toString(),
        ...(filtros.cliente && { cliente: filtros.cliente }),
        ...(filtros.desde && { desde: filtros.desde }),
        ...(filtros.hasta && { hasta: filtros.hasta })
      });

      const response = await fetch(
        `https://api.x-cargo.co/entregas/entregas-consolidadas?${params}`,
        { headers }
      );

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      setEntregas(data.entregas || []);
      
      // Calcular estadísticas
      const entregasListas = data.entregas?.filter((e: EntregaConciliada) => e.listo_para_liquidar) || [];
      setEstadisticas({
        total_entregas: data.total_entregas || 0,
        valor_total: data.valor_total || 0,
        entregas_listas: entregasListas.length,
        valor_listo: entregasListas.reduce((sum: number, e: EntregaConciliada) => sum + e.valor, 0),
        porcentaje_calidad: data.calidad_datos?.porcentaje_calidad || 0,
        confianza_promedio: data.calidad_datos?.confianza_promedio || 0
      });

      // Extraer clientes únicos
      const clientes = [...new Set(data.entregas?.map((e: EntregaConciliada) => e.cliente) || [])];
      setClientesDisponibles(clientes.sort());

    } catch (error: any) {
      console.error("Error cargando entregas:", error);
      setError(`Error cargando entregas: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [user, headers, filtros]);

  // Filtrar entregas según criterios locales
  useEffect(() => {
    let filtradas = [...entregas];

    // Filtro por calidad mínima
    if (filtros.calidad_minima) {
      const nivelCalidad = { 'Excelente': 3, 'Buena': 2, 'Regular': 1 };
      const nivelMinimo = nivelCalidad[filtros.calidad_minima as keyof typeof nivelCalidad] || 0;
      
      filtradas = filtradas.filter(e => {
        const nivelActual = nivelCalidad[e.calidad_conciliacion as keyof typeof nivelCalidad] || 0;
        return nivelActual >= nivelMinimo;
      });
    }

    setEntregasFiltradas(filtradas);
    setPaginaActual(1); // Reset página al filtrar
  }, [entregas, filtros.calidad_minima]);

  // Cargar datos al montar y cuando cambien los filtros de API
  useEffect(() => {
    cargarEntregas();
  }, [cargarEntregas]);

  // Manejar cambios en filtros
  const handleFiltroChange = (campo: keyof Filtros, valor: string | boolean) => {
    setFiltros(prev => ({ ...prev, [campo]: valor }));
  };

  // Selección de entregas
  const toggleSeleccion = (referencia: string) => {
    const nuevaSeleccion = new Set(entregasSeleccionadas);
    if (nuevaSeleccion.has(referencia)) {
      nuevaSeleccion.delete(referencia);
    } else {
      nuevaSeleccion.add(referencia);
    }
    setEntregasSeleccionadas(nuevaSeleccion);
  };

  const toggleSeleccionarTodas = () => {
    if (seleccionarTodas) {
      setEntregasSeleccionadas(new Set());
    } else {
      const todasLasReferencias = entregasPaginadas.map(e => e.referencia_pago);
      setEntregasSeleccionadas(new Set(todasLasReferencias));
    }
    setSeleccionarTodas(!seleccionarTodas);
  };

  // Paginación
  const totalPaginas = Math.ceil(entregasFiltradas.length / registrosPorPagina);
  const entregasPaginadas = entregasFiltradas.slice(
    (paginaActual - 1) * registrosPorPagina,
    paginaActual * registrosPorPagina
  );

  // Entregas seleccionadas para procesamiento
  const entregasParaPago = entregas.filter(e => entregasSeleccionadas.has(e.referencia_pago));
  const totalSeleccionado = entregasParaPago.reduce((sum, e) => sum + e.valor, 0);

  // Exportar a Excel
  const exportarExcel = () => {
    const datosExport = entregasFiltradas.map(e => ({
      'Tracking': e.tracking,
      'Referencia Pago': e.referencia_pago,
      'Cliente': e.cliente,
      'Valor': e.valor,
      'Fecha': e.fecha,
      'Estado Conciliación': e.estado_conciliacion,
      'Valor Banco': e.valor_banco_conciliado,
      'Entidad Pago': e.entidad_pago,
      'Confianza %': e.confianza_match,
      'Calidad': e.calidad_conciliacion,
      'Listo Liquidar': e.listo_para_liquidar ? 'Sí' : 'No',
      'Conductor': e.correo_conductor,
      'Diferencia Valor': e.diferencia_valor,
      'Observaciones': e.observaciones_conciliacion || ''
    }));

    const ws = XLSX.utils.json_to_sheet(datosExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Entregas Conciliadas");
    
    const fileName = `entregas_conciliadas_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // Proceder al pago
  const procederPago = () => {
    if (entregasSeleccionadas.size === 0) {
      alert("Selecciona al menos una entrega para procesar el pago");
      return;
    }

    // Convertir al formato esperado por PagoEntregas
    const entregasFormato = entregasParaPago.map(e => ({
      tracking: e.tracking,
      fecha: e.fecha,
      tipo: e.tipo,
      cliente: e.cliente,
      valor: e.valor,
      referencia: e.referencia_pago
    }));

    navigate('/contabilidad/pago-entregas', {
      state: {
        entregas: entregasFormato,
        total: totalSeleccionado
      }
    });
  };

  // Enviar correo de notificación
  const enviarCorreo = async () => {
    if (entregasSeleccionadas.size === 0) {
      alert("Selecciona al menos una entrega para enviar notificación");
      return;
    }

    setLoading(true);
    try {
      const cliente = entregasParaPago[0]?.cliente;
      
      const response = await fetch('https://api.x-cargo.co/enviar-notificacion-conciliacion/', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          entregas: entregasParaPago.map(e => e.referencia_pago),
          cliente: cliente,
          total_entregas: entregasSeleccionadas.size,
          valor_total: totalSeleccionado
        })
      });
      
      if (!response.ok) {
        throw new Error('Error enviando correo');
      }
      
      alert(`✅ Correo enviado exitosamente para ${entregasSeleccionadas.size} entregas del cliente ${cliente}`);
      
    } catch (error: any) {
      alert(`❌ Error enviando correo: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Formatear moneda
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Obtener clase CSS para estado de conciliación
  const getEstadoClass = (estado: string) => {
    const clases = {
      'Conciliado Exacto': 'estado-exacto',
      'Conciliado Aproximado': 'estado-aproximado',
      'Conciliado Manual': 'estado-manual',
      'Conciliado': 'estado-conciliado'
    };
    return clases[estado as keyof typeof clases] || 'estado-default';
  };

  const getCalidadClass = (calidad: string) => {
    const clases = {
      'Excelente': 'calidad-excelente',
      'Buena': 'calidad-buena',
      'Regular': 'calidad-regular'
    };
    return clases[calidad as keyof typeof clases] || 'calidad-default';
  };

  if (!user) {
    return (
      <div className="entregas-conciliadas">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Cargando información del usuario...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="entregas-conciliadas">
      {/* Header */}
      <div className="page-header">
        <div className="header-info">
          <h1>✅ Entregas Conciliadas</h1>
          <p>Gestiona las entregas que han sido conciliadas con movimientos bancarios</p>
        </div>
        <div className="header-actions">
          <button 
            className="btn-refresh"
            onClick={cargarEntregas}
            disabled={loading}
          >
            🔄 Actualizar
          </button>
          <button 
            className="btn-export"
            onClick={exportarExcel}
            disabled={loading || entregasFiltradas.length === 0}
          >
            📊 Exportar Excel
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {/* Estadísticas */}
      <div className="estadisticas-section">
        <div className="estadisticas-grid">
          <div className="estadistica-card">
            <div className="card-icon">📦</div>
            <div className="card-content">
              <h3>Total Conciliadas</h3>
              <div className="card-number">{estadisticas.total_entregas.toLocaleString()}</div>
              <div className="card-detail">{formatCurrency(estadisticas.valor_total)}</div>
            </div>
          </div>
          
          <div className="estadistica-card success">
            <div className="card-icon">✅</div>
            <div className="card-content">
              <h3>Listas para Liquidar</h3>
              <div className="card-number">{estadisticas.entregas_listas.toLocaleString()}</div>
              <div className="card-detail">{formatCurrency(estadisticas.valor_listo)}</div>
            </div>
          </div>
          
          <div className="estadistica-card info">
            <div className="card-icon">🎯</div>
            <div className="card-content">
              <h3>Calidad Promedio</h3>
              <div className="card-number">{estadisticas.porcentaje_calidad.toFixed(1)}%</div>
              <div className="card-detail">Confianza: {estadisticas.confianza_promedio.toFixed(1)}%</div>
            </div>
          </div>

          <div className="estadistica-card warning">
            <div className="card-icon">☑️</div>
            <div className="card-content">
              <h3>Seleccionadas</h3>
              <div className="card-number">{entregasSeleccionadas.size.toLocaleString()}</div>
              <div className="card-detail">{formatCurrency(totalSeleccionado)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="filtros-section">
        <h3>🔍 Filtros</h3>
        <div className="filtros-grid">
          <div className="filtro-grupo">
            <label>Cliente:</label>
            <select
              value={filtros.cliente}
              onChange={(e) => handleFiltroChange('cliente', e.target.value)}
            >
              <option value="">Todos los clientes</option>
              {clientesDisponibles.map(cliente => (
                <option key={cliente} value={cliente}>{cliente}</option>
              ))}
            </select>
          </div>

          <div className="filtro-grupo">
            <label>Desde:</label>
            <input
              type="date"
              value={filtros.desde}
              onChange={(e) => handleFiltroChange('desde', e.target.value)}
            />
          </div>

          <div className="filtro-grupo">
            <label>Hasta:</label>
            <input
              type="date"
              value={filtros.hasta}
              onChange={(e) => handleFiltroChange('hasta', e.target.value)}
            />
          </div>

          <div className="filtro-grupo">
            <label>Calidad Mínima:</label>
            <select
              value={filtros.calidad_minima}
              onChange={(e) => handleFiltroChange('calidad_minima', e.target.value)}
            >
              <option value="">Todas las calidades</option>
              <option value="Regular">Regular o mejor</option>
              <option value="Buena">Buena o mejor</option>
              <option value="Excelente">Solo excelente</option>
            </select>
          </div>

          <div className="filtro-grupo">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={filtros.solo_conciliadas}
                onChange={(e) => handleFiltroChange('solo_conciliadas', e.target.checked)}
              />
              Solo conciliadas
            </label>
          </div>
        </div>
      </div>

      {/* Acciones masivas */}
      {entregasSeleccionadas.size > 0 && (
        <div className="acciones-masivas">
          <div className="acciones-info">
            <span>{entregasSeleccionadas.size} entregas seleccionadas</span>
            <span className="total-seleccionado">{formatCurrency(totalSeleccionado)}</span>
          </div>
          <div className="acciones-botones">
            <button 
              className="btn-limpiar"
              onClick={() => setEntregasSeleccionadas(new Set())}
            >
              🗑️ Limpiar Selección
            </button>
            <button 
              className="btn-correo"
              onClick={enviarCorreo}
              disabled={loading}
            >
              📧 Enviar Correo
            </button>
            <button 
              className="btn-pagar"
              onClick={procederPago}
            >
              💰 Proceder al Pago
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="tabla-section">
        <div className="tabla-header">
          <h3>📋 Entregas ({entregasFiltradas.length.toLocaleString()} registros)</h3>
          <div className="tabla-info">
            Página {paginaActual} de {totalPaginas} • Mostrando {entregasPaginadas.length} de {entregasFiltradas.length}
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Cargando entregas conciliadas...</p>
          </div>
        ) : (
          <>
            <div className="tabla-container">
              <table className="tabla-entregas">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={seleccionarTodas}
                        onChange={toggleSeleccionarTodas}
                      />
                    </th>
                    <th>Tracking</th>
                    <th>Cliente</th>
                    <th>Valor</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Calidad</th>
                    <th>Confianza</th>
                    <th>Conductor</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {entregasPaginadas.map((entrega, index) => (
                    <tr 
                      key={`${entrega.referencia_pago}-${index}`}
                      className={entregasSeleccionadas.has(entrega.referencia_pago) ? 'selected' : ''}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={entregasSeleccionadas.has(entrega.referencia_pago)}
                          onChange={() => toggleSeleccion(entrega.referencia_pago)}
                        />
                      </td>
                      <td className="tracking-cell">
                        <div className="tracking-info">
                          <strong>{entrega.tracking}</strong>
                          <small>{entrega.referencia_pago}</small>
                        </div>
                      </td>
                      <td>{entrega.cliente}</td>
                      <td className="valor-cell">
                        <div className="valor-info">
                          <strong>{formatCurrency(entrega.valor)}</strong>
                          {entrega.valor_banco_conciliado && (
                            <small>Banco: {formatCurrency(entrega.valor_banco_conciliado)}</small>
                          )}
                          {entrega.diferencia_valor > 1000 && (
                            <small className="diferencia-alerta">
                              Dif: {formatCurrency(entrega.diferencia_valor)}
                            </small>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="fecha-info">
                          <strong>{new Date(entrega.fecha).toLocaleDateString()}</strong>
                          {entrega.fecha_conciliacion && (
                            <small>Conc: {new Date(entrega.fecha_conciliacion).toLocaleDateString()}</small>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="estado-container">
                          <span className={`estado-badge ${getEstadoClass(entrega.estado_conciliacion)}`}>
                            {entrega.estado_conciliacion}
                          </span>
                          {entrega.listo_para_liquidar && (
                            <span className="badge-listo">✅ Listo</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`calidad-badge ${getCalidadClass(entrega.calidad_conciliacion)}`}>
                          {entrega.calidad_conciliacion}
                        </span>
                      </td>
                      <td className="confianza-cell">
                        <div className="confianza-bar">
                          <div 
                            className="confianza-fill"
                            style={{ width: `${entrega.confianza_match}%` }}
                          ></div>
                          <span className="confianza-text">{entrega.confianza_match}%</span>
                        </div>
                      </td>
                      <td className="conductor-cell">
                        <small>{entrega.correo_conductor}</small>
                      </td>
                      <td className="acciones-cell">
                        <button 
                          className="btn-detalle"
                          onClick={() => console.log('Ver detalle:', entrega)}
                          title="Ver detalle"
                        >
                          👁️
                        </button>
                      </td>
                    </tr>
                  ))}
                  {entregasPaginadas.length === 0 && (
                    <tr>
                      <td colSpan={10} className="empty-state">
                        No hay entregas conciliadas con los filtros aplicados
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
                  onClick={() => setPaginaActual(prev => Math.max(1, prev - 1))}
                  disabled={paginaActual === 1 || loading}
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
                          onClick={() => setPaginaActual(pageNumber)}
                          disabled={loading}
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
                  onClick={() => setPaginaActual(prev => Math.min(totalPaginas, prev + 1))}
                  disabled={paginaActual === totalPaginas || loading}
                >
                  Siguiente →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="entregas-footer">
        <div className="footer-info">
          <div className="source-info">
            <strong>📊 Fuente:</strong> BigQuery - Entregas Conciliadas
          </div>
          <div className="update-info">
            <strong>🔄 Actualizado:</strong> {new Date().toLocaleString()}
          </div>
          <div className="user-info">
            <strong>👤 Usuario:</strong> {user?.email} ({user?.role})
          </div>
          <div className="status-info">
            <strong>🔗 Estado:</strong> Conectado
          </div>
        </div>
      </div>
    </div>
  );
}