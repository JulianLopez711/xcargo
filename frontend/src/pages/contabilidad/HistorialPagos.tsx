import { useEffect, useState } from "react";
import { saveAs } from "file-saver";
import "../../styles/contabilidad/HistorialPagos.css";

interface PagoHistorial {
  referencia: string;
  referencia_pago: string;
  valor: number | undefined;
  valor_total_consignacion: number | undefined;
  fecha: string;
  estado_conciliacion: string;
  tipo: string;
  entidad: string;
  cantidad_tracking: number;
  tracking: string;
  comprobante: string;
  cliente: string;
  id_transaccion: string;
}

interface FiltrosHistorial {
  estado: string;
  referencia: string;
  referencia_pago: string;
  tracking: string;
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
  const [paginaActual, setPaginaActual] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [limite] = useState(0); // 0 = TODOS los registros sin límite
  
  const [filtros, setFiltros] = useState<FiltrosHistorial>({
    estado: "",
    referencia: "",
    referencia_pago: "",
    tracking: ""
  });

  const obtenerHistorial = async (pagina = 1, nuevosFiltros?: FiltrosHistorial) => {
    setCargando(true);
    setError("");
    
    const filtrosAUsar = nuevosFiltros || filtros;
    try {
      const url = `https://api.x-cargo.co/pagos/historial-2`;

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
        let historialFiltrado = data.historial.map((pago: any) => ({
          ...pago,
          estado_conciliacion: pago.estado_conciliacion || pago.estado // fallback para compatibilidad
        }));

        // Filtro visual por estado si aplica
        if (filtrosAUsar.estado && filtrosAUsar.estado.trim() !== "") {
          historialFiltrado = historialFiltrado.filter((pago: PagoHistorial) =>
            pago.estado_conciliacion === filtrosAUsar.estado
          );
        }

        // Filtro visual por referencia si aplica
        if (filtrosAUsar.referencia && filtrosAUsar.referencia.trim() !== "") {
          const referenciaFiltro = filtrosAUsar.referencia.trim().toLowerCase();
          historialFiltrado = historialFiltrado.filter((pago: PagoHistorial) =>
            (pago.referencia || "").toLowerCase().includes(referenciaFiltro)
          );
        }

        // Filtro visual por referencia_pago si aplica
        if (filtrosAUsar.referencia_pago && filtrosAUsar.referencia_pago.trim() !== "") {
          const referenciaPagoFiltro = filtrosAUsar.referencia_pago.trim().toLowerCase();
          historialFiltrado = historialFiltrado.filter((pago: PagoHistorial) =>
            (pago.referencia_pago || "").toLowerCase().includes(referenciaPagoFiltro)
          );
        }

        // Filtro visual por tracking si aplica
        if (filtrosAUsar.tracking && filtrosAUsar.tracking.trim() !== "") {
          const trackingFiltro = filtrosAUsar.tracking.trim().toLowerCase();
          historialFiltrado = historialFiltrado.filter((pago: PagoHistorial) =>
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

  const calcularEstadisticas = (historial: PagoHistorial[]) => {
    if (historial.length === 0) {
      setEstadisticas(null);
      return;
    }

    // Aplicar lógica de valor: usar valor_total_consignacion si valor es 0
    const totalValor = historial.reduce((sum, pago) => {
      const valorFinal = (pago.valor === 0 || !pago.valor) ? (pago.valor_total_consignacion || 0) : pago.valor;
      return sum + valorFinal;
    }, 0);
    const valorPromedio = totalValor / historial.length;

    // Estadísticas por estado
    const porEstado: { [estado: string]: number } = {};
    historial.forEach(pago => {
      porEstado[pago.estado_conciliacion] = (porEstado[pago.estado_conciliacion] || 0) + 1;
    });

    // Estadísticas por tipo
    const porEntidad: { [entidad: string]: number } = {};
    historial.forEach(pago => {
      if (pago.tipo) {
        porEntidad[pago.tipo] = (porEntidad[pago.tipo] || 0) + 1;
      }
    });
    
    setEstadisticas({
      total_pagos: historial.length,
      total_valor: totalValor,
      por_estado: porEstado,
      por_entidad: porEntidad,
      conductor_mas_activo: "N/A",
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
      referencia: "",
      referencia_pago: "",
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

    const encabezado = "Referencia,Referencia_Pago,Valor,Fecha,Estado,Entidad,Tipo,Conductor,Guias,TN,Comprobante,Carrier,ID_Transaccion\n";
    const filas = pagosPaginados.map(pago => {
      const valorFinal = (pago.valor === 0 || !pago.valor) ? (pago.valor_total_consignacion || 0) : pago.valor;
      return `"${pago.referencia}","${pago.referencia_pago || ''}",${valorFinal},"${pago.fecha || ''}","${pago.estado_conciliacion}","${pago.entidad || ''}","${pago.tipo}","${pago.cliente}",${pago.cantidad_tracking},"${pago.tracking}","${pago.comprobante}","N/A","${pago.id_transaccion}"`;
    }).join("\n");

    const blob = new Blob([encabezado + filas], {
      type: "text/csv;charset=utf-8;",
    });
    
    const fechaHoy = new Date().toISOString().split("T")[0];
    saveAs(blob, `historial-pagos-${fechaHoy}.csv`);
  };

  // Función para obtener el valor final aplicando la lógica solicitada
  const obtenerValorFinal = (pago: PagoHistorial): number => {
    return (pago.valor === 0 || !pago.valor) ? (pago.valor_total_consignacion || 0) : pago.valor;
  };

  // Mostrar cada TN (tracking) en su propia fila
  const pagosExpandido = pagos.flatMap(pago => {
    if (pago.tracking && pago.tracking.includes(',')) {
      // Si tracking es una lista separada por coma
      return pago.tracking.split(',').map(trk => ({ ...pago, tracking: trk.trim() }));
    }
    return [pago];
  });

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
      .map(p => p.estado_conciliacion)
      .filter(estado => estado !== null && estado !== undefined && estado !== '')
  )).sort();

  // Paginación de datos - solo aplicar si hay límite
  const pagosPaginados = limite > 0 
    ? (() => {
        const inicio = (paginaActual - 1) * limite;
        return pagosExpandido.slice(inicio, inicio + limite);
      })()
    : pagosExpandido; // Si límite = 0, mostrar todos los pagos

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
            <div className="stat-icon purple">�</div>
            <div className="stat-content">
              <div className="stat-number">Simplificado</div>
              <div className="stat-label">Datos Básicos</div>
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
            <label>Ref. Pago:</label>
            <input
              type="text"
              placeholder="PAGO123..."
              value={filtros.referencia_pago}
              onChange={(e) => setFiltros({...filtros, referencia_pago: e.target.value})}
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
      <div
        className="historial-tabla-container"
        style={{
          overflowX: 'auto',
          overflowY: 'auto',
          width: '100%',
          maxHeight: '60vh',
          minHeight: '200px',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
        }}
      >
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
            <table className="historial-tabla" style={{minWidth: '1500px'}}>
              <thead>
                <tr>
                  <th style={{position:'sticky', top:0, background:'#fff', zIndex:2}}>Referencia</th>
                  <th style={{position:'sticky', top:0, background:'#fff', zIndex:2}}>Ref. Pago</th>
                  <th style={{position:'sticky', top:0, background:'#fff', zIndex:2}}>Valor</th>
                  <th style={{position:'sticky', top:0, background:'#fff', zIndex:2}}>Fecha</th>
                  <th style={{position:'sticky', top:0, background:'#fff', zIndex:2}}>Estado</th>
                  <th style={{position:'sticky', top:0, background:'#fff', zIndex:2}}>Entidad</th>
                  <th style={{position:'sticky', top:0, background:'#fff', zIndex:2}}>Tipo</th>
                  <th style={{position:'sticky', top:0, background:'#fff', zIndex:2}}>Conductor</th>
                  <th style={{position:'sticky', top:0, background:'#fff', zIndex:2}}>Guías</th>
                  <th style={{position:'sticky', top:0, background:'#fff', zIndex:2}}>TN</th>
                  <th style={{position:'sticky', top:0, background:'#fff', zIndex:2}}>Comprobante</th>
                  <th style={{position:'sticky', top:0, background:'#fff', zIndex:2}}>Carrier</th>
                </tr>
              </thead>
              <tbody>
                {pagosPaginados.map((pago, idx) => {
                  const valorFinal = obtenerValorFinal(pago);
                  return (
                    <tr key={`${pago.referencia}-${pago.tracking}-${idx}`} className={`fila-${pago.estado_conciliacion?.toLowerCase()}`}>
                      <td className="referencia-cell">
                        <span className="referencia-text">{pago.referencia}</span>
                      </td>
                      <td className="referencia-pago-cell">
                        <span className="referencia-pago-text">{pago.referencia_pago || '-'}</span>
                      </td>
                      <td className="valor-cell">
                        <span className="valor-principal">
                          {formatearMoneda(valorFinal)}
                        </span>
                      </td>
                      <td className="fecha-cell">
                        <span className="fecha-text">
                          {pago.fecha ? new Date(pago.fecha).toLocaleDateString('es-CO') : '-'}
                        </span>
                      </td>
                      <td className="estado-cell">
                        <span 
                          className="estado-badge"
                          style={{ 
                            backgroundColor: getEstadoColor(pago.estado_conciliacion) + '20',
                            color: getEstadoColor(pago.estado_conciliacion),
                            border: `1px solid ${getEstadoColor(pago.estado_conciliacion)}40`
                          }}
                        >
                          {getEstadoTexto(pago.estado_conciliacion)}
                        </span>
                      </td>
                      <td className="entidad-cell">
                        <span className="entidad-text">{pago.entidad || '-'}</span>
                      </td>
                      <td className="tipo-cell">
                        <span className="tipo-text">{pago.tipo || '-'}</span>
                      </td>
                      <td className="conductor-cell">
                        <span className="conductor-text">{pago.cliente || '-'}</span>
                      </td>
                      <td className="guias-cell">
                        <span className="guias-count">
                          {pago.cantidad_tracking || 0}
                        </span>
                      </td>
                      <td className="tracking-cell">
                        {pago.tracking ? (
                          <span title={pago.tracking}>{pago.tracking}</span>
                        ) : (
                          <span className="sin-tracking">-</span>
                        )}
                      </td>
                      <td className="comprobante-cell">
                        {pago.comprobante ? (
                          <a 
                            href={pago.comprobante} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="comprobante-link"
                          >
                            📎 Ver
                          </a>
                        ) : (
                          <span className="sin-comprobante">-</span>
                        )}
                      </td>
                      <td className="carrier-cell">
                        <span className="carrier-text">N/A</span>
                      </td>
                    </tr>
                  );
                })}
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
    </div>
  );
}