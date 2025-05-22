import { useState, useEffect } from "react";
import "../../styles/contabilidad/Cruces.css";

interface ResultadoConciliacion {
  id_banco: string;
  fecha_banco: string;
  valor_banco: number;
  descripcion_banco: string;
  estado_match: "conciliado_exacto" | "conciliado_aproximado" | "multiple_match" | "diferencia_valor" | "diferencia_fecha" | "sin_match";
  confianza: number;
  referencia_pago?: string;
  fecha_pago?: string;
  valor_pago?: number;
  diferencia_valor?: number;
  diferencia_dias?: number;
  trackings?: string;
  correo_conductor?: string;
  entidad_pago?: string;
  num_guias?: number;
  observaciones?: string;
  num_matches_posibles?: number;
  matches_posibles?: Array<{
    referencia_pago: string;
    fecha_pago: string;
    valor_pago: number;
    score: number;
  }>;
}

interface ResumenConciliacion {
  resumen: {
    total_movimientos_banco: number;
    total_pagos_conductores: number;
    conciliado_exacto: number;
    conciliado_aproximado: number;
    multiple_match: number;
    diferencia_valor: number;
    diferencia_fecha: number;
    sin_match: number;
  };
  resultados: ResultadoConciliacion[];
  fecha_conciliacion: string;
}

interface EstadisticasGenerales {
  resumen_por_estado: Array<{
    estado_conciliacion: string;
    cantidad: number;
    valor_total: number;
    fecha_min: string;
    fecha_max: string;
  }>;
  totales: {
    movimientos: number;
    valor: number;
  };
}

export default function CrucesInteligentes() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [procesandoConciliacion, setProcesandoConciliacion] = useState(false);
  const [resultadoConciliacion, setResultadoConciliacion] = useState<ResumenConciliacion | null>(null);
  const [estadisticasGenerales, setEstadisticasGenerales] = useState<EstadisticasGenerales | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [modalDetalle, setModalDetalle] = useState<ResultadoConciliacion | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setArchivo(file);
    setMensaje("");
  };

  const handleUpload = async () => {
    if (!archivo) {
      setMensaje("Debes seleccionar un archivo CSV del banco.");
      return;
    }

    const formData = new FormData();
    formData.append("file", archivo);
    setSubiendo(true);
    setMensaje("");

    try {
      const res = await fetch("https://api.x-cargo.co/conciliacion/cargar-banco-excel", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || "Error al subir archivo");

      setMensaje(`✅ ${result.mensaje}. Procesadas: ${result.consignaciones_procesadas} consignaciones.`);
      setArchivo(null);
      cargarEstadisticas();
    } catch (err: any) {
      console.error(err);
      setMensaje("❌ Error: " + err.message);
    } finally {
      setSubiendo(false);
    }
  };

  const ejecutarConciliacion = async () => {
    setProcesandoConciliacion(true);
    setMensaje("");

    try {
      const res = await fetch("https://api.x-cargo.co/conciliacion/conciliacion-automatica");
      if (!res.ok) throw new Error("Error al ejecutar conciliación");
      
      const data: ResumenConciliacion = await res.json();
      setResultadoConciliacion(data);
      setMensaje(`✅ Conciliación completada. Procesados: ${data.resumen.total_movimientos_banco} movimientos.`);
      cargarEstadisticas();
    } catch (err: any) {
      console.error("Error en conciliación:", err);
      setMensaje("❌ Error ejecutando conciliación: " + err.message);
    } finally {
      setProcesandoConciliacion(false);
    }
  };

  const cargarEstadisticas = async () => {
    try {
      const res = await fetch("https://api.x-cargo.co/conciliacion/resumen-conciliacion");
      if (res.ok) {
        const data: EstadisticasGenerales = await res.json();
        setEstadisticasGenerales(data);
      }
    } catch (err) {
      console.error("Error cargando estadísticas:", err);
    }
  };

  const marcarConciliadoManual = async (idBanco: string, referenciaPago?: string) => {
    try {
      const observaciones = prompt("Observaciones (opcional):") || "Conciliado manualmente";
      
      const res = await fetch("https://api.x-cargo.co/conciliacion/marcar-conciliado-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_banco: idBanco,
          referencia_pago: referenciaPago || "",
          observaciones
        }),
      });

      if (!res.ok) throw new Error("Error al marcar como conciliado");

      alert("✅ Marcado como conciliado manual.");
      ejecutarConciliacion(); // Refrescar datos
    } catch (err: any) {
      alert("❌ " + err.message);
    }
  };

  const getEstadoColor = (estado: string) => {
    const colores = {
      conciliado_exacto: "#22c55e",     // Verde
      conciliado_aproximado: "#3b82f6", // Azul
      multiple_match: "#f59e0b",        // Amarillo
      diferencia_valor: "#ef4444",      // Rojo
      diferencia_fecha: "#f97316",      // Naranja
      sin_match: "#6b7280"              // Gris
    };
    return colores[estado as keyof typeof colores] || "#6b7280";
  };

  const getEstadoTexto = (estado: string) => {
    const textos = {
      conciliado_exacto: "✅ Conciliado Exacto",
      conciliado_aproximado: "🔸 Conciliado Aproximado",
      multiple_match: "⚠️ Múltiples Matches",
      diferencia_valor: "💰 Diferencia en Valor",
      diferencia_fecha: "📅 Diferencia en Fecha",
      sin_match: "❌ Sin Match"
    };
    return textos[estado as keyof typeof textos] || estado;
  };

  const resultadosFiltrados = resultadoConciliacion?.resultados.filter(r => 
    filtroEstado === "todos" || r.estado_match === filtroEstado
  ) || [];

  useEffect(() => {
    cargarEstadisticas();
  }, []);

  return (
    <div className="cruces-container">
      <h2 className="titulo">Conciliación Bancaria Inteligente</h2>

      {/* Estadísticas generales */}
      {estadisticasGenerales && (
        <div className="estadisticas-panel">
          <h3>Resumen General</h3>
          <div className="estadisticas-grid">
            <div className="stat-card">
              <h4>Total Movimientos</h4>
              <p>{estadisticasGenerales.totales.movimientos.toLocaleString()}</p>
            </div>
            <div className="stat-card">
              <h4>Valor Total</h4>
              <p>${estadisticasGenerales.totales.valor.toLocaleString()}</p>
            </div>
            {estadisticasGenerales.resumen_por_estado.map(estado => (
              <div key={estado.estado_conciliacion} className="stat-card">
                <h4>{estado.estado_conciliacion.replace('_', ' ').toUpperCase()}</h4>
                <p>{estado.cantidad} mov.</p>
                <small>${estado.valor_total.toLocaleString()}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Carga de archivo */}
      <div className="carga-csv">
        <h3>📁 Cargar Archivo del Banco</h3>
        <div className="upload-section">
          <label>
            Seleccionar archivo CSV del banco:
            <input 
              type="file" 
              accept=".csv,.CSV" 
              onChange={handleFileChange} 
            />
          </label>
          <button 
            className="boton-accion" 
            onClick={handleUpload} 
            disabled={subiendo}
          >
            {subiendo ? "Subiendo..." : "Subir Archivo"}
          </button>
        </div>
        
        <button 
          className="boton-conciliar" 
          onClick={ejecutarConciliacion} 
          disabled={procesandoConciliacion}
        >
          {procesandoConciliacion ? "🔄 Procesando..." : "🤖 Ejecutar Conciliación Automática"}
        </button>
        
        {mensaje && (
          <div className={`mensaje-estado ${mensaje.includes('✅') ? 'success' : 'error'}`}>
            {mensaje}
          </div>
        )}
      </div>

      {/* Resultados de conciliación */}
      {resultadoConciliacion && (
        <div className="resultados-conciliacion">
          <h3>📊 Resultados de Conciliación</h3>
          
          {/* Resumen de resultados */}
          <div className="resumen-resultados">
            <div className="resumen-grid">
              <div className="resumen-item success">
                <span className="numero">{resultadoConciliacion.resumen.conciliado_exacto}</span>
                <span className="etiqueta">Exactos</span>
              </div>
              <div className="resumen-item info">
                <span className="numero">{resultadoConciliacion.resumen.conciliado_aproximado}</span>
                <span className="etiqueta">Aproximados</span>
              </div>
              <div className="resumen-item warning">
                <span className="numero">{resultadoConciliacion.resumen.multiple_match}</span>
                <span className="etiqueta">Múltiples</span>
              </div>
              <div className="resumen-item error">
                <span className="numero">{resultadoConciliacion.resumen.diferencia_valor}</span>
                <span className="etiqueta">Dif. Valor</span>
              </div>
              <div className="resumen-item error">
                <span className="numero">{resultadoConciliacion.resumen.diferencia_fecha}</span>
                <span className="etiqueta">Dif. Fecha</span>
              </div>
              <div className="resumen-item neutral">
                <span className="numero">{resultadoConciliacion.resumen.sin_match}</span>
                <span className="etiqueta">Sin Match</span>
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="filtros-conciliacion">
            <label>
              Filtrar por estado:
              <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="conciliado_exacto">Conciliado Exacto</option>
                <option value="conciliado_aproximado">Conciliado Aproximado</option>
                <option value="multiple_match">Múltiples Matches</option>
                <option value="diferencia_valor">Diferencia Valor</option>
                <option value="diferencia_fecha">Diferencia Fecha</option>
                <option value="sin_match">Sin Match</option>
              </select>
            </label>
            <span className="contador-filtro">
              Mostrando {resultadosFiltrados.length} de {resultadoConciliacion.resultados.length}
            </span>
          </div>

          {/* Tabla de resultados */}
          <div className="tabla-conciliacion">
            <table>
              <thead>
                <tr>
                  <th>Fecha Banco</th>
                  <th>Valor Banco</th>
                  <th>Estado</th>
                  <th>Confianza</th>
                  <th>Ref. Pago</th>
                  <th>Diferencias</th>
                  <th>Observaciones</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {resultadosFiltrados.map((resultado, idx) => (
                  <tr key={idx} style={{ borderLeft: `4px solid ${getEstadoColor(resultado.estado_match)}` }}>
                    <td>{new Date(resultado.fecha_banco).toLocaleDateString()}</td>
                    <td>${resultado.valor_banco.toLocaleString()}</td>
                    <td>
                      <span 
                        className="estado-badge" 
                        style={{ backgroundColor: getEstadoColor(resultado.estado_match) }}
                      >
                        {getEstadoTexto(resultado.estado_match)}
                      </span>
                    </td>
                    <td>
                      {resultado.confianza > 0 && (
                        <div className="confianza-bar">
                          <div 
                            className="confianza-fill" 
                            style={{ 
                              width: `${resultado.confianza}%`,
                              backgroundColor: resultado.confianza >= 80 ? '#22c55e' : 
                                             resultado.confianza >= 60 ? '#f59e0b' : '#ef4444'
                            }}
                          ></div>
                          <span>{resultado.confianza}%</span>
                        </div>
                      )}
                    </td>
                    <td>{resultado.referencia_pago || "-"}</td>
                    <td>
                      {resultado.diferencia_valor && resultado.diferencia_valor > 0 && (
                        <div className="diferencia">
                          💰 ${resultado.diferencia_valor.toLocaleString()}
                        </div>
                      )}
                      {resultado.diferencia_dias && resultado.diferencia_dias > 0 && (
                        <div className="diferencia">
                          📅 {resultado.diferencia_dias} día(s)
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="observaciones">
                        {resultado.observaciones}
                        {resultado.num_matches_posibles && (
                          <span className="matches-posibles">
                            ({resultado.num_matches_posibles} matches posibles)
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="acciones">
                        <button 
                          className="btn-detalle" 
                          onClick={() => setModalDetalle(resultado)}
                        >
                          👁 Ver
                        </button>
                        
                        {(resultado.estado_match === "sin_match" || 
                          resultado.estado_match === "multiple_match" ||
                          resultado.estado_match === "diferencia_valor" ||
                          resultado.estado_match === "diferencia_fecha") && (
                          <button 
                            className="btn-conciliar-manual" 
                            onClick={() => marcarConciliadoManual(resultado.id_banco, resultado.referencia_pago)}
                          >
                            ✅ Conciliar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de detalle */}
      {modalDetalle && (
        <div className="modal-overlay" onClick={() => setModalDetalle(null)}>
          <div className="modal-content detalle-conciliacion" onClick={(e) => e.stopPropagation()}>
            <h3>Detalle de Conciliación</h3>
            
            <div className="detalle-grid">
              <div className="detalle-seccion">
                <h4>📊 Datos del Banco</h4>
                <div className="detalle-item">
                  <strong>Fecha:</strong> {new Date(modalDetalle.fecha_banco).toLocaleDateString()}
                </div>
                <div className="detalle-item">
                  <strong>Valor:</strong> ${modalDetalle.valor_banco.toLocaleString()}
                </div>
                <div className="detalle-item">
                  <strong>Descripción:</strong> {modalDetalle.descripcion_banco}
                </div>
                <div className="detalle-item">
                  <strong>ID:</strong> {modalDetalle.id_banco}
                </div>
              </div>

              {modalDetalle.referencia_pago && (
                <div className="detalle-seccion">
                  <h4>💳 Datos del Pago</h4>
                  <div className="detalle-item">
                    <strong>Referencia:</strong> {modalDetalle.referencia_pago}
                  </div>
                  <div className="detalle-item">
                    <strong>Fecha:</strong> {modalDetalle.fecha_pago && new Date(modalDetalle.fecha_pago).toLocaleDateString()}
                  </div>
                  <div className="detalle-item">
                    <strong>Valor:</strong> ${modalDetalle.valor_pago?.toLocaleString()}
                  </div>
                  <div className="detalle-item">
                    <strong>Entidad:</strong> {modalDetalle.entidad_pago}
                  </div>
                  <div className="detalle-item">
                    <strong>Conductor:</strong> {modalDetalle.correo_conductor}
                  </div>
                  <div className="detalle-item">
                    <strong>Guías:</strong> {modalDetalle.num_guias}
                  </div>
                  <div className="detalle-item">
                    <strong>Trackings:</strong> 
                    <div className="trackings-list">
                      {modalDetalle.trackings?.split(', ').map((tracking, idx) => (
                        <span key={idx} className="tracking-item">{tracking}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {modalDetalle.matches_posibles && modalDetalle.matches_posibles.length > 0 && (
                <div className="detalle-seccion">
                  <h4>🔍 Matches Posibles</h4>
                  <div className="matches-list">
                    {modalDetalle.matches_posibles.map((match, idx) => (
                      <div key={idx} className="match-item">
                        <div><strong>Ref:</strong> {match.referencia_pago}</div>
                        <div><strong>Fecha:</strong> {new Date(match.fecha_pago).toLocaleDateString()}</div>
                        <div><strong>Valor:</strong> ${match.valor_pago.toLocaleString()}</div>
                        <div><strong>Score:</strong> {match.score.toFixed(1)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="detalle-seccion">
                <h4>📋 Análisis</h4>
                <div className="detalle-item">
                  <strong>Estado:</strong> 
                  <span style={{ color: getEstadoColor(modalDetalle.estado_match) }}>
                    {getEstadoTexto(modalDetalle.estado_match)}
                  </span>
                </div>
                <div className="detalle-item">
                  <strong>Confianza:</strong> {modalDetalle.confianza}%
                </div>
                <div className="detalle-item">
                  <strong>Observaciones:</strong> {modalDetalle.observaciones}
                </div>
              </div>
            </div>

            <div className="modal-acciones">
              {(modalDetalle.estado_match === "sin_match" || 
                modalDetalle.estado_match === "multiple_match" ||
                modalDetalle.estado_match === "diferencia_valor" ||
                modalDetalle.estado_match === "diferencia_fecha") && (
                <button 
                  className="btn-conciliar-manual"
                  onClick={() => {
                    marcarConciliadoManual(modalDetalle.id_banco, modalDetalle.referencia_pago);
                    setModalDetalle(null);
                  }}
                >
                  ✅ Conciliar Manualmente
                </button>
              )}
              <button 
                className="btn-cerrar" 
                onClick={() => setModalDetalle(null)}
              >
                ✕ Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      
    </div>
  );
}