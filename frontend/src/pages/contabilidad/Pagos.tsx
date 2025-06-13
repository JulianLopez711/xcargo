import { useEffect, useState } from "react";
import { saveAs } from "file-saver";
import "../../styles/contabilidad/Pagos.css";

// Utilidad para obtener el token desde localStorage
function getToken(): string {
  return localStorage.getItem("token") || "";
}

interface Pago {
  referencia_pago: string;
  valor: number;
  fecha: string;
  entidad: string;
  estado_conciliacion: string;
  tipo: string;
  imagen: string;
  novedades?: string;
  num_guias: number;
  trackings_preview: string;
  correo_conductor: string;
  fecha_creacion?: string;
  fecha_modificacion?: string;
}

interface DetalleTracking {
  tracking: string;
  referencia: string;
  valor: number;
  cliente: string;
  carrier: string;
  tipo: string;
  fecha_pago: string;
  hora_pago: string;
  estado: string;
  novedades: string;
  comprobante: string;
}

interface PaginacionInfo {
  total_registros: number;
  total_paginas: number;
  pagina_actual: number;
  registros_por_pagina: number;
  tiene_siguiente: boolean;
  tiene_anterior: boolean;
}

export default function PagosContabilidad() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [paginaActual, setPaginaActual] = useState(1);
  const pagosPorPagina = 20;
  const [cargando, setCargando] = useState(false);
  const [filtroReferencia, setFiltroReferencia] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [novedad, setNovedad] = useState("");
  const [refPagoSeleccionada, setRefPagoSeleccionada] = useState("");
  const [imagenSeleccionada, setImagenSeleccionada] = useState<string | null>(null);
  const [detalleTracking, setDetalleTracking] = useState<DetalleTracking[] | null>(null);
  const [modalDetallesVisible, setModalDetallesVisible] = useState(false);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [paginacionInfo, setPaginacionInfo] = useState<PaginacionInfo>({
    total_registros: 0,
    total_paginas: 0,
    pagina_actual: 1,
    registros_por_pagina: 20,
    tiene_siguiente: false,
    tiene_anterior: false
  });

  // Función para obtener pagos con paginación y filtros
  const obtenerPagos = async (pagina: number = paginaActual, aplicarFiltros: boolean = false) => {
    setCargando(true);
    const offset = (pagina - 1) * pagosPorPagina;
    
    try {
      // Construir parámetros de query
      const params = new URLSearchParams({
        limit: pagosPorPagina.toString(),
        offset: offset.toString()
      });

      // Aplicar filtros si están definidos
      if (aplicarFiltros) {
        if (filtroReferencia.trim()) {
          params.append('referencia', filtroReferencia.trim());
        }
        if (fechaDesde) {
          params.append('fecha_desde', fechaDesde);
        }
        if (fechaHasta) {
          params.append('fecha_hasta', fechaHasta);
        }
        if (filtroEstado) {
          params.append('estado', filtroEstado);
        }
      }

      const response = await fetch(`https://api.x-cargo.co/pagos/pendientes-contabilidad?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Si la respuesta incluye información de paginación
      if (data.pagos && data.paginacion) {
        setPagos(data.pagos);
        setPaginacionInfo(data.paginacion);
      } else {
        // Fallback para el formato actual
        setPagos(Array.isArray(data) ? data : []);
        // Calcular paginación estimada
        const totalEstimado = data.length === pagosPorPagina ? (pagina * pagosPorPagina) + 1 : (pagina - 1) * pagosPorPagina + data.length;
        setPaginacionInfo({
          total_registros: totalEstimado,
          total_paginas: Math.ceil(totalEstimado / pagosPorPagina),
          pagina_actual: pagina,
          registros_por_pagina: pagosPorPagina,
          tiene_siguiente: data.length === pagosPorPagina,
          tiene_anterior: pagina > 1
        });
      }

    } catch (error) {
      console.error("❌ Error cargando pagos pendientes:", error);
      setPagos([]);
      setPaginacionInfo({
        total_registros: 0,
        total_paginas: 0,
        pagina_actual: 1,
        registros_por_pagina: 20,
        tiene_siguiente: false,
        tiene_anterior: false
      });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    obtenerPagos(paginaActual);
  }, [paginaActual]);

  // Función para aplicar filtros
  const aplicarFiltros = () => {
    setPaginaActual(1); // Resetear a la primera página
    obtenerPagos(1, true);
  };

  // Función para filtrar pagos localmente (para compatibilidad)
  const pagosFiltrados = pagos.filter((p) => {
    const cumpleReferencia = p.referencia_pago.toLowerCase().includes(filtroReferencia.toLowerCase());
    const cumpleDesde = !fechaDesde || p.fecha >= fechaDesde;
    const cumpleHasta = !fechaHasta || p.fecha <= fechaHasta;
    const cumpleEstado = !filtroEstado || p.estado_conciliacion === filtroEstado;
    return cumpleReferencia && cumpleDesde && cumpleHasta && cumpleEstado;
  });

  const descargarCSV = () => {
    if (pagosFiltrados.length === 0) {
      alert("No hay datos para exportar");
      return;
    }

    const encabezado = "ID,Referencia_Pago,Valor_Total,Fecha,Entidad,Estado,Tipo,Num_Guias,Conductor,Fecha_Creacion\n";
    const filas = pagosFiltrados
      .map((p, idx) =>
        `${idx + 1},"${p.referencia_pago}",${p.valor},"${p.fecha}","${p.entidad}","${p.estado_conciliacion}","${p.tipo}",${p.num_guias},"${p.correo_conductor}","${p.fecha_creacion || ''}"`
      )
      .join("\n");

    const blob = new Blob([encabezado + filas], {
      type: "text/csv;charset=utf-8;",
    });
    
    const fechaHoy = new Date().toISOString().split("T")[0];
    saveAs(blob, `pagos-consolidados-${fechaHoy}.csv`);
  };

  const verImagen = (src: string) => {
    if (!src) {
      alert("No hay comprobante disponible");
      return;
    }
    setImagenSeleccionada(src);
  };

  const verDetallesPago = async (referenciaPago: string) => {
    try {
      const response = await fetch(`https://api.x-cargo.co/pagos/detalles-pago/${referenciaPago}`);
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setDetalleTracking(data.detalles || []);
      setModalDetallesVisible(true);
    } catch (err: any) {
      console.error("Error cargando detalles:", err);
      alert(`Error al cargar detalles del pago: ${err.message}`);
    }
  };

  const aprobarPago = async (referenciaPago: string) => {
    if (procesando) return;
    
    const confirmacion = window.confirm(`¿Está seguro de aprobar el pago ${referenciaPago}?`);
    if (!confirmacion) return;

    setProcesando(referenciaPago);

    try {
      const user = JSON.parse(localStorage.getItem("user") || '{"email":"usuario@sistema.com"}');
      
      const response = await fetch("https://api.x-cargo.co/pagos/aprobar-pago", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referencia_pago: referenciaPago,
          modificado_por: user.email,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Error desconocido");
      }

      const result = await response.json();
      
      alert(`✅ Pago aprobado correctamente. ${result.total_guias || 0} guías liberadas.`);
      await obtenerPagos(paginaActual);
      
    } catch (error: any) {
      console.error("Error aprobando pago:", error);
      alert(`❌ Error al aprobar el pago: ${error.message}`);
    } finally {
      setProcesando(null);
    }
  };

  const confirmarRechazo = async () => {
    if (!novedad.trim()) {
      alert("Debe escribir una observación para rechazar el pago");
      return;
    }

    if (procesando) return;
    setProcesando(refPagoSeleccionada);

    try {
      const user = JSON.parse(localStorage.getItem("user") || '{"email":"usuario@sistema.com"}');
      
      const response = await fetch("https://api.x-cargo.co/pagos/rechazar-pago", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referencia_pago: refPagoSeleccionada,
          novedad,
          modificado_por: user.email,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Error desconocido");
      }

      alert(`❌ Pago rechazado correctamente. Razón: ${novedad}`);
      
      setModalVisible(false);
      setNovedad("");
      setRefPagoSeleccionada("");
      
      await obtenerPagos(paginaActual);
      
    } catch (error: any) {
      console.error("Error rechazando pago:", error);
      alert(`❌ Error al rechazar el pago: ${error.message}`);
    } finally {
      setProcesando(null);
    }
  };

  const getEstadoTexto = (estado: string | undefined): string => {
    if (!estado) return "⏳ Sin estado";
    const textos: { [key: string]: string } = {
      'pendiente_conciliacion': '⏳ Pendiente conciliación',
      'conciliado_manual': '🔎 Conciliado manual',
      'conciliado_automatico': '🤖 Conciliado automático',
      'rechazado': '❌ Rechazado',
    };
    return textos[estado.toLowerCase()] || estado;
  };

  const limpiarFiltros = () => {
    setFiltroReferencia("");
    setFechaDesde("");
    setFechaHasta("");
    setFiltroEstado("");
    setPaginaActual(1);
    obtenerPagos(1, false);
  };

  const estadosUnicos = Array.from(new Set(pagos.map(p => p.estado_conciliacion))).sort();

  // Funciones de paginación
  const irAPagina = (pagina: number) => {
    if (pagina >= 1 && pagina <= paginacionInfo.total_paginas) {
      setPaginaActual(pagina);
    }
  };

  const paginaAnterior = () => {
    if (paginacionInfo.tiene_anterior) {
      irAPagina(paginaActual - 1);
    }
  };

  const paginaSiguiente = () => {
    if (paginacionInfo.tiene_siguiente) {
      irAPagina(paginaActual + 1);
    }
  };

  // Generar números de página para mostrar
  const generarNumerosPagina = () => {
    const numeros = [];
    const totalPaginas = paginacionInfo.total_paginas;
    const actual = paginaActual;
    
    // Mostrar máximo 5 números de página
    let inicio = Math.max(1, actual - 2);
    let fin = Math.min(totalPaginas, inicio + 4);
    
    // Ajustar el inicio si estamos cerca del final
    if (fin - inicio < 4) {
      inicio = Math.max(1, fin - 4);
    }
    
    for (let i = inicio; i <= fin; i++) {
      numeros.push(i);
    }
    
    return numeros;
  };

  return (
    <div className="pagos-page">
      <h2 className="pagos-title">Módulo de Pagos - Contabilidad</h2>

      {/* Información de paginación */}
      <div className="pagos-info" style={{ marginBottom: "1rem", padding: "0.5rem", backgroundColor: "#f8f9fa", borderRadius: "4px" }}>
        <span style={{ fontSize: "0.9rem", color: "#6c757d" }}>
          Mostrando {pagosFiltrados.length} de {paginacionInfo.total_registros} registros 
          (Página {paginaActual} de {paginacionInfo.total_paginas})
        </span>
      </div>

      <div className="pagos-filtros">
        <label>
          Buscar referencia:
          <input
            type="text"
            placeholder="Ej: REF123"
            value={filtroReferencia}
            onChange={(e) => setFiltroReferencia(e.target.value)}
          />
        </label>
        <label>
          Estado:
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            {estadosUnicos.map((estado, idx) => (
              <option key={estado || idx} value={estado}>
                {getEstadoTexto(estado)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Desde:
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
          />
        </label>
        <label>
          Hasta:
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
          />
        </label>
        <button onClick={aplicarFiltros} className="boton-accion" disabled={cargando}>
          🔍 Buscar
        </button>
        <button onClick={limpiarFiltros} className="boton-accion" disabled={cargando}>
          🗑️ Limpiar
        </button>
        <button onClick={descargarCSV} className="boton-accion">
          📥 Descargar Informe
        </button>
      </div>

      {cargando && (
        <div style={{ textAlign: "center", padding: "2rem", color: "#666" }}>
          <div>⏳ Cargando pagos...</div>
        </div>
      )}

      <div className="pagos-tabla-container">
        <table className="pagos-tabla">
          <thead>
            <tr>
              <th>ID</th>
              <th>Ref. Pago</th>
              <th>Valor Total</th>
              <th>Guías</th>
              <th>Fecha</th>
              <th>Carrier</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Comprobante</th>
              <th>Trackings</th>
              <th>Novedades</th>
              <th>Acción</th>
            </tr>
          </thead>

          <tbody>
            {pagosFiltrados.length > 0 ? (
              pagosFiltrados.map((p, idx) => (
                <tr key={idx}>
                  <td>{((paginaActual - 1) * pagosPorPagina) + idx + 1}</td>
                  <td>{p.referencia_pago}</td>
                  <td>${p.valor.toLocaleString()}</td>
                  <td>{p.num_guias}</td>
                  <td>{p.fecha}</td>
                  <td>{p.entidad}</td>
                  <td>{p.tipo}</td>
                  <td style={{
                    color: p.estado_conciliacion === "rechazado" ? "crimson" :
                           p.estado_conciliacion === "conciliado_manual" ? "green" : undefined
                  }}>
                    {getEstadoTexto(p.estado_conciliacion)}
                  </td>
                  <td>
                    <button
                      onClick={() => verImagen(p.imagen)}
                      className="btn-ver"
                    >
                      👁 Ver
                    </button>
                  </td>
                  <td>
                    <button
                      onClick={() => verDetallesPago(p.referencia_pago)}
                      className="btn-ver"
                      title={p.trackings_preview}
                    >
                      Detalles ({p.num_guias})
                    </button>
                  </td>
                  <td>
                    {p.novedades ? (
                      <span style={{ fontStyle: "italic", color: "#6b7280" }}>
                        {p.novedades}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <button
                      onClick={() => aprobarPago(p.referencia_pago)}
                      className="boton-aprobar"
                      disabled={p.estado_conciliacion === "aprobado" || procesando === p.referencia_pago}
                    >
                      {procesando === p.referencia_pago ? "Procesando..." : 
                       p.estado_conciliacion === "aprobado" ? "Aprobado" : "Aprobar"}
                    </button>
                    <button
                      onClick={() => {
                        setRefPagoSeleccionada(p.referencia_pago);
                        setModalVisible(true);
                      }}
                      className="boton-rechazar"
                      disabled={p.estado_conciliacion === "rechazado" || 
                               p.estado_conciliacion?.startsWith("conciliado") ||
                               procesando === p.referencia_pago}
                    >
                      Rechazar
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={12}
                  style={{ textAlign: "center", padding: "1rem" }}
                >
                  {cargando ? "Cargando..." : "No hay pagos registrados."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Controles de Paginación */}
      {paginacionInfo.total_paginas > 1 && (
        <div className="paginacion-controles" style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "0.5rem",
          margin: "1rem 0",
          padding: "1rem"
        }}>
          <button
            onClick={paginaAnterior}
            disabled={!paginacionInfo.tiene_anterior || cargando}
            className="boton-paginacion"
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid #ddd",
              backgroundColor: paginacionInfo.tiene_anterior ? "#fff" : "#f5f5f5",
              cursor: paginacionInfo.tiene_anterior ? "pointer" : "not-allowed",
              borderRadius: "4px"
            }}
          >
            ← Anterior
          </button>

          {generarNumerosPagina().map(numero => (
            <button
              key={numero}
              onClick={() => irAPagina(numero)}
              disabled={cargando}
              className={`boton-pagina ${numero === paginaActual ? 'activo' : ''}`}
              style={{
                padding: "0.5rem 0.75rem",
                border: "1px solid #ddd",
                backgroundColor: numero === paginaActual ? "#007bff" : "#fff",
                color: numero === paginaActual ? "#fff" : "#333",
                cursor: "pointer",
                borderRadius: "4px",
                minWidth: "40px"
              }}
            >
              {numero}
            </button>
          ))}

          <button
            onClick={paginaSiguiente}
            disabled={!paginacionInfo.tiene_siguiente || cargando}
            className="boton-paginacion"
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid #ddd",
              backgroundColor: paginacionInfo.tiene_siguiente ? "#fff" : "#f5f5f5",
              cursor: paginacionInfo.tiene_siguiente ? "pointer" : "not-allowed",
              borderRadius: "4px"
            }}
          >
            Siguiente →
          </button>
        </div>
      )}

      {/* Resto de modales sin cambios */}
      {modalDetallesVisible && detalleTracking && (
        <div className="modal-detalles-overlay" onClick={() => setModalDetallesVisible(false)}>
          <div className="modal-detalles-content" onClick={(e) => e.stopPropagation()}>
            
            {/* Header del Modal */}
            <div className="modal-detalles-header">
              <h2 className="modal-detalles-title">
                Detalles del Pago
              </h2>
              <p className="modal-detalles-subtitle">
                Referencia: {detalleTracking[0]?.referencia || 'N/A'}
              </p>
              <button 
                className="modal-cerrar-btn"
                onClick={() => setModalDetallesVisible(false)}
                title="Cerrar"
              >
                ×
              </button>
            </div>

            {/* Cuerpo del Modal */}
            <div className="modal-detalles-body">
              
              {/* Información del Pago */}
              <div className="pago-info-card">
                <div className="pago-info-grid">
                  <div className="pago-info-item">
                    <span className="pago-info-label">Referencia</span>
                    <span className="pago-info-value">{detalleTracking[0]?.referencia || 'N/A'}</span>
                  </div>
                  
                  <div className="pago-info-item">
                    <span className="pago-info-label">Total</span>
                    <span className="pago-info-value">
                      ${detalleTracking.reduce((sum, item) => sum + item.valor, 0).toLocaleString('es-ES')}
                    </span>
                  </div>
                  
                  <div className="pago-info-item">
                    <span className="pago-info-label">Cantidad de Guías</span>
                    <span className="pago-info-value">{detalleTracking.length}</span>
                  </div>
                </div>
              </div>

              {/* Lista de Trackings */}
              {detalleTracking && detalleTracking.length > 0 && (
                <div>
                  <h3 className="trackings-section-title">
                    Guías Incluidas
                    <span className="trackings-count">
                      {detalleTracking.length}
                    </span>
                  </h3>
                  
                  <div className="trackings-lista">
                    {detalleTracking.map((item: DetalleTracking, index: number) => (
                      <div key={index} className="tracking-item">
                        
                        <div className="tracking-header">
                          <div className="tracking-numero">
                            #{item.tracking}
                          </div>
                          <div className="tracking-valor">
                            ${item.valor.toLocaleString('es-ES')}
                          </div>
                        </div>
                        
                        <div className="tracking-detalles">
                          <div className="tracking-detail-item">
                            <span className="tracking-detail-label">Referencia</span>
                            <span className="tracking-detail-value">{item.referencia}</span>
                          </div>
                          
                          <div className="tracking-detail-item">
                            <span className="tracking-detail-label">Número de Guía</span>
                            <span className="tracking-detail-value">{item.tracking}</span>
                          </div>
                          
                          <div className="tracking-detail-item">
                            <span className="tracking-detail-label">Valor Individual</span>
                            <span className="tracking-detail-value">${item.valor.toLocaleString('es-ES')}</span>
                          </div>
                        </div>
                        
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Mensaje si no hay trackings */}
              {(!detalleTracking || detalleTracking.length === 0) && (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '2rem', 
                  color: '#64748b',
                  fontStyle: 'italic'
                }}>
                  No se encontraron guías asociadas a este pago.
                </div>
              )}
              
            </div>
          </div>
        </div>
      )}

      {/* Modal de Imagen */}
      {imagenSeleccionada && (
        <div
          className="modal-overlay"
          onClick={() => setImagenSeleccionada(null)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={imagenSeleccionada} alt="Vista previa" />
            <button
              onClick={() => setImagenSeleccionada(null)}
              className="cerrar-modal"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Modal de Rechazo */}
      {modalVisible && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>¿Por qué deseas rechazar este pago?</h3>
            <textarea
              value={novedad}
              onChange={(e) => setNovedad(e.target.value)}
              rows={5}
              placeholder="Ej: El valor no coincide con las guías."
              style={{ width: "100%", marginBottom: "1rem" }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <button
                className="boton-secundario"
                onClick={() => {
                  setModalVisible(false);
                  setNovedad("");
                  setRefPagoSeleccionada("");
                }}
              >
                Cancelar
              </button>
              <button className="boton-registrar" onClick={confirmarRechazo} disabled={procesando === refPagoSeleccionada}>
                {procesando === refPagoSeleccionada ? "Procesando..." : "Confirmar rechazo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}