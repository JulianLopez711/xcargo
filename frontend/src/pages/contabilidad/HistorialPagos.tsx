import { useEffect, useState } from "react";
import { saveAs } from "file-saver";
import "../../styles/contabilidad/HistorialPagos.css";

interface PagoHistorial {
  creado_por: any;
  referencia_pago: string;
  valor: number | undefined;
  fecha: string;
  entidad: string;
  estado: string;
  tipo: string;
  imagen?: string;
  novedades?: string;
  num_guias: number;
  correo_conductor: string;
  fecha_creacion?: string;
  fecha_modificacion?: string;
  modificado_por?: string;
  tracking?: string;
  fecha_registro?: string;
  carrier?: string; // Nombre del carrier
}

interface FiltrosHistorial {
  estado: string;
  desde: string;
  hasta: string;
  referencia: string;
  conductor: string;
  entidad: string;
  tracking?: string;
}

interface EstadisticasHistorial {
  total_pagos: number;
  total_valor: number;
  por_estado: { [estado: string]: number };
  por_entidad: { [entidad: string]: number };
  conductor_mas_activo: string;
  valor_promedio: number;
}

export default function HistorialPagos() {
  const [pagos, setPagos] = useState<PagoHistorial[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string>("");
  const [estadisticas, setEstadisticas] = useState<EstadisticasHistorial | null>(null);
  const [imagenSeleccionada, setImagenSeleccionada] = useState<string | null>(null);
  const [paginaActual, setPaginaActual] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [limite] = useState(0); // 0 = TODOS los registros sin límite
  
  const [filtros, setFiltros] = useState<FiltrosHistorial>({
    estado: "",
    desde: "",
    hasta: "",
    referencia: "",
    conductor: "",
    entidad: "",
    tracking: ""
  });

  const obtenerHistorial = async (pagina = 1, nuevosFiltros?: FiltrosHistorial) => {
    setCargando(true);
    setError("");
    
    const filtrosAUsar = nuevosFiltros || filtros;
    try {
      // Construir parámetros de consulta
      const params = new URLSearchParams();
      if (filtrosAUsar.estado) params.append("estado", filtrosAUsar.estado);
      if (filtrosAUsar.desde) params.append("desde", filtrosAUsar.desde);
      if (filtrosAUsar.hasta) params.append("hasta", filtrosAUsar.hasta);
      if (filtrosAUsar.referencia) params.append("referencia", filtrosAUsar.referencia);
      // No enviar entidad ni tracking como filtro a la API, se filtra visualmente
      params.append("limite", limite.toString());

      const url = `https://api.x-cargo.co/pagos/historial?${params.toString()}`;
      

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      
      if (data && data.historial && Array.isArray(data.historial)) {
          
        let historialFiltrado = filtrarPorConductorYEntidad(data.historial, filtrosAUsar);
        // Filtro visual por tracking si aplica
        if (filtrosAUsar.tracking && filtrosAUsar.tracking.trim() !== "") {
          const trackingFiltro = filtrosAUsar.tracking.trim().toLowerCase();
          historialFiltrado = historialFiltrado.filter(pago =>
            (pago.tracking || "").toLowerCase().includes(trackingFiltro)
          );
        }
   
        setPagos(historialFiltrado);
        calcularEstadisticas(historialFiltrado);
        
        // Con límite = 0, no hay paginación - mostramos todos los registros
        if (limite === 0) {
          setTotalPaginas(1);
          setPaginaActual(1);

        } else {
          // Paginación simulada en frontend (para límites > 0)
          const totalRegistros = historialFiltrado.length;
          setTotalPaginas(Math.ceil(totalRegistros / limite));
          setPaginaActual(pagina);

        }
      } else {
        console.error(`❌ [HISTORIAL] Datos inválidos:`, data);
        setPagos([]);
        setEstadisticas(null);
        setError("No se recibieron datos válidos del servidor");
      }

    } catch (err: any) {
      console.error("❌ [HISTORIAL] Error completo:", err);
      
      let mensajeError = "Error desconocido";
      
      if (err instanceof TypeError && err.message.includes('fetch')) {
        mensajeError = "No se pudo conectar al servidor";
      } else if (err.name === 'AbortError') {
        mensajeError = "La consulta tardó demasiado tiempo";
      } else {
        mensajeError = err.message;
      }
      
      console.error(`💬 [HISTORIAL] Mensaje de error para el usuario:`, mensajeError);
      setError(`Error al cargar historial: ${mensajeError}`);
      setPagos([]);
      setEstadisticas(null);
    } finally {

      setCargando(false);
    }
  };

  const filtrarPorConductorYEntidad = (historial: PagoHistorial[], filtrosActivos: FiltrosHistorial): PagoHistorial[] => {
    return historial.filter(pago => {
      const cumpleConductor = !filtrosActivos.conductor || 
        pago.correo_conductor.toLowerCase().includes(filtrosActivos.conductor.toLowerCase());
      const cumpleEntidad = !filtrosActivos.entidad || 
        pago.entidad.toLowerCase().includes(filtrosActivos.entidad.toLowerCase());
      
      return cumpleConductor && cumpleEntidad;
    });
  };

  const calcularEstadisticas = (historial: PagoHistorial[]) => {
    if (historial.length === 0) {
      setEstadisticas(null);
      return;
    }

    const totalValor = historial.reduce((sum, pago) => sum + (pago.valor || 0), 0);
    const valorPromedio = totalValor / historial.length;

    // Estadísticas por estado
    const porEstado: { [estado: string]: number } = {};
    historial.forEach(pago => {
      porEstado[pago.estado] = (porEstado[pago.estado] || 0) + 1;
    });

    // Estadísticas por entidad
    const porEntidad: { [entidad: string]: number } = {};
    historial.forEach(pago => {
      porEntidad[pago.entidad] = (porEntidad[pago.entidad] || 0) + 1;
    });

    // Conductor más activo
    const conductorCount: { [conductor: string]: number } = {};
    historial.forEach(pago => {
      conductorCount[pago.correo_conductor] = (conductorCount[pago.correo_conductor] || 0) + 1;
    });
    
    const conductorMasActivo = Object.entries(conductorCount)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || "N/A";

    setEstadisticas({
      total_pagos: historial.length,
      total_valor: totalValor,
      por_estado: porEstado,
      por_entidad: porEntidad,
      conductor_mas_activo: conductorMasActivo,
      valor_promedio: valorPromedio
    });
  };

  useEffect(() => {
    obtenerHistorial();
  }, []);

  const aplicarFiltros = () => {
    setPaginaActual(1);
    obtenerHistorial(1, filtros);
  };

  const limpiarFiltros = () => {
    const filtrosVacios: FiltrosHistorial = {
      estado: "",
      desde: "",
      hasta: "",
      referencia: "",
      conductor: "",
      entidad: "",
      tracking: ""
    };
    setFiltros(filtrosVacios);
    obtenerHistorial(1, filtrosVacios);
  };

  const exportarHistorial = () => {
    if (pagos.length === 0) {
      alert("No hay datos para exportar");
      return;
    }

    const encabezado = "Referencia,Valor,Fecha,Estado,Entidad,Tipo,Conductor,Guias,Novedades,Fecha_Creacion,Modificado_Por\n";
    const filas = pagos.map(pago => 
      `"${pago.referencia_pago}",${pago.valor},"${pago.fecha}","${pago.estado}","${pago.entidad}","${pago.tipo}","${pago.correo_conductor}",${pago.num_guias},"${pago.novedades || ''}","${pago.fecha_creacion || ''}","${pago.modificado_por || ''}"`
    ).join("\n");

    const blob = new Blob([encabezado + filas], {
      type: "text/csv;charset=utf-8;",
    });
    
    const fechaHoy = new Date().toISOString().split("T")[0];
    saveAs(blob, `historial-pagos-${fechaHoy}.csv`);
  };

  const verImagen = (src: string) => {
    if (!src) {
      alert("No hay comprobante disponible");
      return;
    }
    setImagenSeleccionada(src);
  };
  const getEstadoColor = (estado: string): string => {
    // Validar que estado existe y es string
    if (!estado || typeof estado !== 'string') {
      return '#6b7280'; // Color gris por defecto
    }
    
    const colores: { [key: string]: string } = {
      'pagado': '#3b82f6',
      'aprobado': '#22c55e',
      'rechazado': '#ef4444',
      'pendiente': '#f59e0b',
    };
    return colores[estado.toLowerCase()] || '#6b7280';
  };
  const getEstadoTexto = (estado: string): string => {
    // Validar que estado existe y es string
    if (!estado || typeof estado !== 'string') {
      return '❓ Sin estado';
    }
    
    const textos: { [key: string]: string } = {
      'pagado': '💳 Pagado',
      'aprobado': '✅ Aprobado',
      'rechazado': '❌ Rechazado',
      'pendiente': '⏳ Pendiente',
    };
    return textos[estado.toLowerCase()] || estado;
  };
  const formatearMoneda = (valor: number | undefined | null): string => {
    const valorNumerico = Number(valor) || 0;
    return valorNumerico.toLocaleString('es-ES', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  // Obtener estados únicos para el filtro
  const estadosUnicos = Array.from(new Set(
    pagos
      .map(p => p.estado)
      .filter(estado => estado !== null && estado !== undefined && estado !== '')
  )).sort();
  // Mantener entidadesUnicas por si se quiere volver a mostrar el filtro
  const entidadesUnicas = Array.from(new Set(
    pagos
      .map(p => p.entidad)
      .filter(entidad => entidad !== null && entidad !== undefined && entidad !== '')
  )).sort();

  // Paginación de datos - solo aplicar si hay límite
  const pagosPaginados = limite > 0 
    ? (() => {
        const inicio = (paginaActual - 1) * limite;
        return pagos.slice(inicio, inicio + limite);
      })()
    : pagos; // Si límite = 0, mostrar todos los pagos

  // Calcular inicio para mostrar en la tabla
  const inicio = limite > 0 ? (paginaActual - 1) * limite : 0;

  return (
    <div className="historial-pagos">
      {/* Header */}
      <div className="historial-header">
        <h2 className="historial-title">📊 Historial de Pagos</h2>
        <p className="historial-subtitle">
          Consulta y analiza el histórico completo de pagos de conductores
        </p>
      </div>

      {/* Estadísticas */}
      {estadisticas && (
        <div className="estadisticas-historial">
          <div className="stat-card">
            <div className="stat-icon blue">📋</div>
            <div className="stat-content">
              <div className="stat-number">{estadisticas.total_pagos}</div>
              <div className="stat-label">Total Pagos</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon green">💰</div>
            <div className="stat-content">
              <div className="stat-number">{formatearMoneda(estadisticas.total_valor)}</div>
              <div className="stat-label">Valor Total</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon yellow">📈</div>
            <div className="stat-content">
              <div className="stat-number">{formatearMoneda(estadisticas.valor_promedio)}</div>
              <div className="stat-label">Promedio por Pago</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon purple">👤</div>
            <div className="stat-content">
              <div className="stat-number">{estadisticas.conductor_mas_activo.split('@')[0]}</div>
              <div className="stat-label">Conductor Más Activo</div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="filtros-historial">
        <h3 className="filtros-titulo">🔍 Filtros de Búsqueda</h3>
        <div className="filtros-grid">
          <div className="filtro-grupo">
            <label>Estado:</label>
            <select 
              value={filtros.estado} 
              onChange={(e) => setFiltros({...filtros, estado: e.target.value})}
            >
              <option value="">Todos los estados</option>
              {estadosUnicos.map(estado => (
                <option key={estado} value={estado}>
                  {getEstadoTexto(estado)}
                </option>
              ))}
            </select>
          </div>
          {/* Filtro de entidad oculto, dejarlo en el DOM pero con display:none por si se quiere volver a mostrar */}
          <div className="filtro-grupo" style={{display:'none'}}>
            <label>Entidad:</label>
            <select 
              value={filtros.entidad} 
              onChange={(e) => setFiltros({...filtros, entidad: e.target.value})}
            >
              <option value="">Todas las entidades</option>
              {entidadesUnicas.map(entidad => (
                <option key={entidad} value={entidad}>{entidad}</option>
              ))}
            </select>
          </div>
          <div className="filtro-grupo">
            <label>Fecha desde:</label>
            <input
              type="date"
              value={filtros.desde}
              onChange={(e) => setFiltros({...filtros, desde: e.target.value})}
            />
          </div>
          <div className="filtro-grupo">
            <label>Fecha hasta:</label>
            <input
              type="date"
              value={filtros.hasta}
              onChange={(e) => setFiltros({...filtros, hasta: e.target.value})}
            />
          </div>
          <div className="filtro-grupo">
            <label>Referencia:</label>
            <input
              type="text"
              placeholder="REF123..."
              value={filtros.referencia}
              onChange={(e) => setFiltros({...filtros, referencia: e.target.value})}
            />
          </div>
          <div className="filtro-grupo">
            <label>TN:</label>
            <input
              type="text"
              placeholder="Buscar tracking..."
              value={filtros.tracking || ""}
              onChange={e => setFiltros({...filtros, tracking: e.target.value})}
            />
          </div>
        </div>
        
        <div className="filtros-acciones">
          <button onClick={aplicarFiltros} className="btn-aplicar" disabled={cargando}>
            {cargando ? '⏳ Buscando...' : '🔍 Buscar'}
          </button>
          <button onClick={limpiarFiltros} className="btn-limpiar">
            🗑️ Limpiar
          </button>
          <button onClick={exportarHistorial} className="btn-exportar" disabled={pagos.length === 0}>
            📥 Exportar ({pagos.length})
          </button>
        </div>
      </div>

      {/* Mensajes de estado */}
      {error && (
        <div className="error-message">
          ⚠️ {error}
          <button onClick={() => obtenerHistorial()} className="btn-reintentar">
            🔄 Reintentar
          </button>
        </div>
      )}

      {/* Tabla de historial */}
      <div className="historial-tabla-container">
        {cargando ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Cargando historial de pagos...</p>
          </div>
        ) : pagosPaginados.length === 0 ? (
          <div className="no-data">
            <h3>📋 No se encontraron pagos</h3>
            <p>
              {pagos.length === 0 
                ? "No hay pagos en el historial o los filtros no coinciden con ningún registro."
                : "Ajusta los filtros para encontrar los pagos que buscas."
              }
            </p>
          </div>
        ) : (
          <>
            <table className="historial-tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Referencia</th>
                  <th>Valor</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  {/* Columna entidad oculta */}
                  <th style={{display:'none'}}>Entidad</th>
                  <th>Tipo</th>
                  <th>Guías</th>
                  <th>TN</th>
                  <th>Comprobante</th>
                  <th>Carrier</th>
                </tr>
              </thead>
              <tbody>
                {pagosPaginados.map((pago, idx) => (
                  <tr key={`${pago.referencia_pago}-${pago.fecha}-${pago.correo_conductor}-${idx}`} className={`fila-${pago.estado.toLowerCase()}`}>
                    <td>{inicio + idx + 1}</td>
                    <td className="referencia-cell">
                      <span className="referencia-text">{pago.referencia_pago}</span>
                      {pago.fecha_creacion && (
                        <small className="fecha-creacion">
                          Creado: {new Date(pago.fecha_creacion).toLocaleDateString('es-ES')}
                        </small>
                      )}
                    </td>
                    <td className="valor-cell">
                      <span className="valor-principal">
                        {formatearMoneda(pago.valor)}
                      </span>
                    </td>
                    <td>{new Date(pago.fecha).toLocaleDateString('es-ES')}</td>
                    <td className="estado-cell">
                      <span 
                        className="estado-badge"
                        style={{ 
                          backgroundColor: getEstadoColor(pago.estado) + '20',
                          color: getEstadoColor(pago.estado),
                          border: `1px solid ${getEstadoColor(pago.estado)}40`
                        }}
                      >
                        {getEstadoTexto(pago.estado)}
                      </span>
                    </td>
                    {/* Columna entidad oculta */}
                    <td className="entidad-cell" style={{display:'none'}}>
                      <span className="entidad-badge">{pago.entidad}</span>
                    </td>
                    <td className="tipo-cell">
                      <span className="tipo-badge">{pago.tipo}</span>
                    </td>
                    <td className="guias-cell">
                      <span className="numero-guias">{pago.num_guias}</span>
                      {pago.num_guias > 1 && <small>guías</small>}
                    </td>
                    {/* Nueva columna TN (tracking) */}
                    <td className="tracking-cell">
                      {pago.tracking ? (
                        <span title={pago.tracking}>{pago.tracking}</span>
                      ) : (
                        <span className="sin-tracking">-</span>
                      )}
                    </td>
                    <td className="comprobante-cell">
                      <button
                        onClick={() => pago.imagen && verImagen(pago.imagen)}
                        className="btn-ver-comprobante"
                        disabled={!pago.imagen}
                      >
                        {pago.imagen ? '👁️ Ver' : '❌ Sin comprobante'}
                      </button>
                    </td>
                    <td className="carrier-cell">
                      {pago.carrier ? (
                        <span className="carrier-text" title={pago.carrier}>
                          {pago.carrier}
                        </span>
                      ) : (
                        <span className="sin-carrier">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Paginación */}
            {totalPaginas > 1 && (
              <div className="paginacion">
                <button 
                  onClick={() => setPaginaActual(Math.max(1, paginaActual - 1))}
                  disabled={paginaActual === 1}
                  className="btn-paginacion"
                >
                  ← Anterior
                </button>
                
                <span className="info-paginacion">
                  Página {paginaActual} de {totalPaginas} 
                  ({inicio + 1}-{Math.min(inicio + limite, pagos.length)} de {pagos.length})
                </span>
                
                <button 
                  onClick={() => setPaginaActual(Math.min(totalPaginas, paginaActual + 1))}
                  disabled={paginaActual === totalPaginas}
                  className="btn-paginacion"
                >
                  Siguiente →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de Imagen */}
      {imagenSeleccionada && (
        <div className="modal-overlay" onClick={() => setImagenSeleccionada(null)}>
          <div className="modal-content modal-imagen" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🖼️ Comprobante de Pago</h3>
              <button
                onClick={() => setImagenSeleccionada(null)}
                className="btn-cerrar-modal"
              >
                ✕
              </button>
            </div>
            <div className="modal-body imagen-container">
              <img 
                src={imagenSeleccionada} 
                alt="Comprobante de pago" 
                className="comprobante-imagen"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/placeholder-comprobante.png';
                }}
              />
            </div>
            <div className="modal-footer">
              <a 
                href={imagenSeleccionada} 
                target="_blank" 
                rel="noopener noreferrer"
                className="btn-descargar"
              >
                📥 Descargar
              </a>
              <button onClick={() => setImagenSeleccionada(null)} className="btn-cerrar">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}