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
  valor_tracking: number;
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

  // Filtros aplicados (los que se usan para la API)
  const [filtrosAplicados, setFiltrosAplicados] = useState<Filtros>({
    cliente: "",
    desde: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    hasta: new Date().toISOString().split('T')[0],
    solo_conciliadas: true,
    calidad_minima: ""
  });

  // Selección múltiple
  const [entregasSeleccionadas, setEntregasSeleccionadas] = useState<Set<string>>(new Set());

  // Modal de detalles
  const [entregaDetalle, setEntregaDetalle] = useState<EntregaConciliada | null>(null);
  const [modalDetalleAbierto, setModalDetalleAbierto] = useState(false);

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
  const cargarEntregas = useCallback(async (filtrosParaAplicar = filtrosAplicados) => {
    if (!user) return;

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        solo_conciliadas: filtrosParaAplicar.solo_conciliadas.toString(),
        ...(filtrosParaAplicar.cliente && { cliente: filtrosParaAplicar.cliente }),
        ...(filtrosParaAplicar.desde && { desde: filtrosParaAplicar.desde }),
        ...(filtrosParaAplicar.hasta && { hasta: filtrosParaAplicar.hasta })
      });

      const response = await fetch(
        `https://api.x-cargo.co/entregas/entregas-consolidadas?${params}`,
        { headers }
      );

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Debug: Verificar algunos datos de ejemplo
      if (data.entregas && data.entregas.length > 0) {
        console.log("🔍 Ejemplo de datos recibidos:");
        console.table(data.entregas.slice(0, 3).map((e: EntregaConciliada) => ({
          tracking: e.tracking,
          valor_consignacion: e.valor,
          valor_tracking: e.valor_tracking,
          son_diferentes: e.valor !== e.valor_tracking,
          cliente: e.cliente
        })));
      }
      
      setEntregas(data.entregas || []);
      
      // Calcular estadísticas
      const entregasListas = data.entregas?.filter((e: EntregaConciliada) => e.listo_para_liquidar) || [];
      setEstadisticas({
        total_entregas: data.total_entregas || 0,
        valor_total: data.valor_total || 0,
        entregas_listas: entregasListas.length,
        valor_listo: entregasListas.reduce((sum: number, e: EntregaConciliada) => sum + (e.valor_tracking || e.valor), 0),
        porcentaje_calidad: data.calidad_datos?.porcentaje_calidad || 0,
        confianza_promedio: data.calidad_datos?.confianza_promedio || 0
      });

      // Extraer clientes únicos
      const clientes = [...new Set(data.entregas?.map((e: EntregaConciliada) => e.cliente) || [])];
      setClientesDisponibles(clientes.sort() as string[]);

    } catch (error: any) {
      console.error("Error cargando entregas:", error);
      setError(`Error cargando entregas: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [user, headers, filtrosAplicados]);

  // Aplicar filtros
  const aplicarFiltros = async () => {
    setFiltrosAplicados({ ...filtros });
    await cargarEntregas(filtros);
  };

  // Limpiar filtros
  const limpiarFiltros = () => {
    const filtrosVacios = {
      cliente: "",
      desde: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      hasta: new Date().toISOString().split('T')[0],
      solo_conciliadas: true,
      calidad_minima: ""
    };
    setFiltros(filtrosVacios);
    setFiltrosAplicados(filtrosVacios);
    cargarEntregas(filtrosVacios);
  };

  // Filtrar entregas según criterios locales
  useEffect(() => {
    let filtradas = [...entregas];

    // Filtro por calidad mínima
    if (filtrosAplicados.calidad_minima) {
      const nivelCalidad = { 'Excelente': 3, 'Buena': 2, 'Regular': 1 };
      const nivelMinimo = nivelCalidad[filtrosAplicados.calidad_minima as keyof typeof nivelCalidad] || 0;
      
      filtradas = filtradas.filter(e => {
        const nivelActual = nivelCalidad[e.calidad_conciliacion as keyof typeof nivelCalidad] || 0;
        return nivelActual >= nivelMinimo;
      });
    }

    setEntregasFiltradas(filtradas);
    setPaginaActual(1); // Reset página al filtrar
  }, [entregas, filtrosAplicados.calidad_minima]);

  // Cargar datos al montar y cuando cambien los filtros de API
  useEffect(() => {
    cargarEntregas();
  }, [cargarEntregas]);

  // Manejar cambios en filtros
  const handleFiltroChange = (campo: keyof Filtros, valor: string | boolean) => {
    setFiltros(prev => ({ ...prev, [campo]: valor }));
  };

  // Selección de entregas
  const toggleSeleccion = (tracking: string) => {
    const nuevaSeleccion = new Set(entregasSeleccionadas);
    if (nuevaSeleccion.has(tracking)) {
      nuevaSeleccion.delete(tracking);
    } else {
      nuevaSeleccion.add(tracking);
    }
    setEntregasSeleccionadas(nuevaSeleccion);
  };

  const toggleSeleccionarTodas = () => {
    if (todasSeleccionadas) {
      // Deseleccionar solo los de la página actual
      const nuevaSeleccion = new Set(entregasSeleccionadas);
      entregasPaginadas.forEach(e => nuevaSeleccion.delete(e.tracking));
      setEntregasSeleccionadas(nuevaSeleccion);
    } else {
      // Seleccionar todos los de la página actual
      const nuevaSeleccion = new Set(entregasSeleccionadas);
      entregasPaginadas.forEach(e => nuevaSeleccion.add(e.tracking));
      setEntregasSeleccionadas(nuevaSeleccion);
    }
  };

  // Paginación
  const totalPaginas = Math.ceil(entregasFiltradas.length / registrosPorPagina);
  const entregasPaginadas = entregasFiltradas.slice(
    (paginaActual - 1) * registrosPorPagina,
    paginaActual * registrosPorPagina
  );

  // Actualizar estado de "seleccionar todas" basado en la selección actual
  const todasSeleccionadas = entregasPaginadas.length > 0 && 
    entregasPaginadas.every(e => entregasSeleccionadas.has(e.tracking));

  // Entregas seleccionadas para procesamiento
  const entregasParaPago = entregas.filter(e => entregasSeleccionadas.has(e.tracking));
  const totalSeleccionado = entregasParaPago.reduce((sum, e) => sum + (e.valor_tracking || e.valor), 0);
  const exportarExcel = () => {
    const datosExport = entregasFiltradas.map(e => ({
      'Tracking': e.tracking,
      'Referencia Pago': e.referencia_pago,
      'Cliente': e.cliente,
      'Valor Tracking': e.valor_tracking || 0, // Valor real del tracking (desde guias_liquidacion o COD_pendientes)
      'Valor Consignación': e.valor_banco_conciliado, // Valor que consignó el conductor (desde pagosconductor)
      'Fecha': e.fecha,
      'Estado Conciliación': e.estado_conciliacion,
      'Tipo': e.tipo,
      'Conductor': e.correo_conductor,
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
      valor: e.valor_tracking || e.valor, // Usar valor del tracking
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

  // Función para mostrar detalles de entrega
  const mostrarDetalle = (entrega: EntregaConciliada) => {
    setEntregaDetalle(entrega);
    setModalDetalleAbierto(true);
  };

  // Función para cerrar modal
  const cerrarModal = () => {
    setModalDetalleAbierto(false);
    setEntregaDetalle(null);
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
            onClick={() => cargarEntregas()}
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

        {/* Botones de filtro */}
        <div className="filtros-acciones">
          <button 
            className="btn-aplicar-filtros"
            onClick={aplicarFiltros}
            disabled={loading}
          >
            🔍 Aplicar Filtros
          </button>
          <button 
            className="btn-limpiar-filtros"
            onClick={limpiarFiltros}
            disabled={loading}
          >
            🗑️ Limpiar Filtros
          </button>
          <div className="filtros-info">
            {JSON.stringify(filtros) !== JSON.stringify(filtrosAplicados) && (
              <span className="filtros-pendientes">
                ⚠️ Hay cambios sin aplicar
              </span>
            )}
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
                        checked={todasSeleccionadas}
                        onChange={toggleSeleccionarTodas}
                      />
                    </th>
                    <th>Tracking</th>
                    <th>Cliente</th>
                    <th>Valores</th>
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
                      key={`${entrega.tracking}-${index}`}
                      className={entregasSeleccionadas.has(entrega.tracking) ? 'selected' : ''}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={entregasSeleccionadas.has(entrega.tracking)}
                          onChange={() => toggleSeleccion(entrega.tracking)}
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
                          <div><strong>Consig:</strong> {formatCurrency(entrega.valor)}</div>
                          <div><small>Track: {formatCurrency(entrega.valor_tracking || entrega.valor)}</small></div>
                          {entrega.valor_banco_conciliado && (
                            <small>Banco: {formatCurrency(entrega.valor_banco_conciliado)}</small>
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
                          onClick={() => mostrarDetalle(entrega)}
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

      {/* Modal de Detalles */}
      {modalDetalleAbierto && entregaDetalle && (
        <div className="modal-overlay" onClick={cerrarModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📋 Detalle de Entrega</h2>
              <button className="modal-close" onClick={cerrarModal}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="detalle-grid">
                <div className="detalle-section">
                  <h3>🚚 Información Principal</h3>
                  <div className="detalle-info">
                    <div className="info-row">
                      <span className="label">Tracking:</span>
                      <span className="value"><strong>{entregaDetalle.tracking}</strong></span>
                    </div>
                    <div className="info-row">
                      <span className="label">Referencia Pago:</span>
                      <span className="value">{entregaDetalle.referencia_pago}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">Cliente:</span>
                      <span className="value">{entregaDetalle.cliente}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">Tipo:</span>
                      <span className="value">{entregaDetalle.tipo}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">Conductor:</span>
                      <span className="value">{entregaDetalle.correo_conductor}</span>
                    </div>
                  </div>
                </div>

                <div className="detalle-section">
                  <h3>💰 Información Financiera</h3>
                  <div className="detalle-info">
                    <div className="info-row">
                      <span className="label">Valor Tracking:</span>
                      <span className="value"><strong>{formatCurrency(entregaDetalle.valor_tracking || entregaDetalle.valor)}</strong></span>
                    </div>
                    <div className="info-row">
                      <span className="label">Valor Consignación:</span>
                      <span className="value">{formatCurrency(entregaDetalle.valor)}</span>
                    </div>
                    {entregaDetalle.valor_banco_conciliado && (
                      <div className="info-row">
                        <span className="label">Valor Banco:</span>
                        <span className="value">{formatCurrency(entregaDetalle.valor_banco_conciliado)}</span>
                      </div>
                    )}
                    <div className="info-row">
                      <span className="label">Diferencia:</span>
                      <span className={`value ${entregaDetalle.diferencia_valor === 0 ? 'success' : 'warning'}`}>
                        {formatCurrency(entregaDetalle.diferencia_valor)}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="label">Entidad Pago:</span>
                      <span className="value">{entregaDetalle.entidad_pago}</span>
                    </div>
                  </div>
                </div>

                <div className="detalle-section">
                  <h3>📅 Fechas</h3>
                  <div className="detalle-info">
                    <div className="info-row">
                      <span className="label">Fecha Entrega:</span>
                      <span className="value">{new Date(entregaDetalle.fecha).toLocaleDateString()}</span>
                    </div>
                    {entregaDetalle.fecha_conciliacion && (
                      <div className="info-row">
                        <span className="label">Fecha Conciliación:</span>
                        <span className="value">{new Date(entregaDetalle.fecha_conciliacion).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="detalle-section">
                  <h3>🎯 Estado y Calidad</h3>
                  <div className="detalle-info">
                    <div className="info-row">
                      <span className="label">Estado:</span>
                      <span className={`value badge ${getEstadoClass(entregaDetalle.estado_conciliacion)}`}>
                        {entregaDetalle.estado_conciliacion}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="label">Calidad:</span>
                      <span className={`value badge ${getCalidadClass(entregaDetalle.calidad_conciliacion)}`}>
                        {entregaDetalle.calidad_conciliacion}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="label">Confianza:</span>
                      <span className="value">
                        <div className="confianza-bar-modal">
                          <div 
                            className="confianza-fill"
                            style={{ width: `${entregaDetalle.confianza_match}%` }}
                          ></div>
                          <span className="confianza-text">{entregaDetalle.confianza_match}%</span>
                        </div>
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="label">Listo para Liquidar:</span>
                      <span className={`value ${entregaDetalle.listo_para_liquidar ? 'success' : 'warning'}`}>
                        {entregaDetalle.listo_para_liquidar ? '✅ Sí' : '❌ No'}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="label">Integridad:</span>
                      <span className={`value ${entregaDetalle.integridad_ok ? 'success' : 'warning'}`}>
                        {entregaDetalle.integridad_ok ? '✅ OK' : '❌ Revisar'}
                      </span>
                    </div>
                  </div>
                </div>

                {entregaDetalle.observaciones_conciliacion && (
                  <div className="detalle-section full-width">
                    <h3>📝 Observaciones</h3>
                    <div className="observaciones">
                      {entregaDetalle.observaciones_conciliacion}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn-secondary" onClick={cerrarModal}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}