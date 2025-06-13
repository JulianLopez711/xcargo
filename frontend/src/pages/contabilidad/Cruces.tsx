import React, { useState, useEffect } from 'react';
import "../../styles/contabilidad/Cruces.css";

interface ResultadoConciliacion {
  id_banco: string;
  fecha_banco: string;
  valor_banco: number;
  descripcion_banco: string;
  estado_match:
    | "conciliado_exacto"
    | "conciliado_aproximado"
    | "multiple_match"
    | "diferencia_valor"
    | "diferencia_fecha"
    | "sin_match";
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

// ✅ INTERFACE PARA ENDPOINT MEJORADO
interface ResumenConciliacionMejorado {
  resumen: {
    total_movimientos_banco: number;
    total_pagos_iniciales: number;           
    total_procesados: number;                
    referencias_unicas_utilizadas: number;   
    conciliado_exacto: number;
    conciliado_aproximado: number;
    sin_match: number;                      
  };
  resultados: ResultadoConciliacion[];
  referencias_usadas: string[];              
  fecha_conciliacion: string;
}

// ✅ INTERFACE PARA COMPATIBILIDAD CON EL FRONTEND
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
  resumen_general: {
    total_movimientos: number;
    conciliados: number;
    pendientes: number;
    valor_total: number;
    fecha_inicial?: string;
    fecha_final?: string;
  };
  resumen_por_estado: Array<{
    estado_conciliacion: string;
    cantidad: number;
    valor_total: number;
    fecha_min?: string;
    fecha_max?: string;
  }>;
}

const Cruces: React.FC = () => {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [procesandoConciliacion, setProcesandoConciliacion] = useState(false);
  const [resultadoConciliacion, setResultadoConciliacion] = useState<ResumenConciliacion | null>(null);
  const [estadisticasGenerales, setEstadisticasGenerales] = useState<EstadisticasGenerales | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [modalDetalle, setModalDetalle] = useState<ResultadoConciliacion | null>(null);

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  useEffect(() => {
    cargarEstadisticas();
  }, []);

  // ✅ FUNCIÓN CARGAR ESTADÍSTICAS IMPLEMENTADA
  const cargarEstadisticas = async () => {
  try {
    const response = await fetch("http://localhost:8000/conciliacion/resumen-conciliacion");
    if (!response.ok) {
      throw new Error("Error al obtener estadísticas");
    }
    
    const data = await response.json();
    
    // Validar que data tenga la estructura esperada
    if (!data || !data.resumen_por_estado) {
      throw new Error("Respuesta inválida del servidor");
    }

    // Procesar los datos con validación
    const estadisticas = {
      resumen_general: data.resumen_general || {
        total_movimientos: 0,
        conciliados: 0,
        pendientes: 0,
        valor_total: 0
      },
      resumen_por_estado: data.resumen_por_estado || []
    };

    setEstadisticasGenerales(estadisticas);
    
  } catch (err: any) {
    console.error("Error cargando estadísticas:", err);
    setMensaje(`❌ Error: ${err.message}`);
  }
};



  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;

    if (file) {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setMensaje("❌ Solo se permiten archivos CSV");
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setMensaje(`❌ El archivo es demasiado grande. Máximo permitido: ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
        return;
      }

      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      setMensaje(`📄 Archivo seleccionado: ${file.name} (${sizeMB}MB)`);
    }

    setArchivo(file);
  };

  const handleUpload = async () => {
    if (!archivo) {
      setMensaje("Debes seleccionar un archivo CSV del banco.");
      return;
    }

    const formData = new FormData();
    formData.append("file", archivo);
    setSubiendo(true);
    setMensaje("📤 Subiendo archivo...");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

      const res = await fetch("https://api.x-cargo.co/conciliacion/cargar-banco-excel", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        let errorMsg = "Error desconocido";
        try {
          const errorData = await res.json();
          errorMsg = errorData.detail || errorData.message || `Error ${res.status}`;
        } catch {
          switch (res.status) {
            case 413: errorMsg = "El archivo es demasiado grande para el servidor"; break;
            case 400: errorMsg = "Formato de archivo inválido"; break;
            case 500: errorMsg = "Error interno del servidor"; break;
            default: errorMsg = `Error HTTP ${res.status}`;
          }
        }
        throw new Error(errorMsg);
      }

      const result = await res.json();
      
      // ✅ MENSAJE MEJORADO CON DETALLES DE CARGA
      if (result.movimientos_insertados > 0) {
        setMensaje(`✅ ${result.mensaje}. Insertados: ${result.movimientos_insertados} movimientos nuevos.`);
      } else {
        setMensaje(`ℹ️ ${result.mensaje}. No se insertaron registros nuevos (posibles duplicados detectados).`);
      }
      
      setArchivo(null);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      cargarEstadisticas();
    } catch (err: any) {
      console.error("Error en upload:", err);
      let errorMessage = "Error desconocido";

      if (err.name === "AbortError") {
        errorMessage = "La subida fue cancelada por timeout (5 minutos)";
      } else if (err.message.includes("CORS")) {
        errorMessage = "Error de configuración del servidor (CORS). Contacta al administrador.";
      } else if (err.message.includes("Failed to fetch")) {
        errorMessage = "No se pudo conectar al servidor. Verifica tu conexión.";
      } else {
        errorMessage = err.message;
      }

      setMensaje("❌ " + errorMessage);
    } finally {
      setSubiendo(false);
    }
  };

  // ✅ FUNCIÓN EJECUTAR CONCILIACIÓN CORREGIDA
 const ejecutarConciliacion = async () => {
  setProcesandoConciliacion(true);
  setMensaje("");

  try {
    const res = await fetch("https://api.x-cargo.co/conciliacion/conciliacion-automatica-mejorada");

    if (!res.ok) throw new Error("Error al ejecutar conciliación");

    const data: ResumenConciliacionMejorado = await res.json();

    if (!data.resumen) throw new Error("La respuesta no contiene resumen de conciliación");

    // ✅ CONVERTIR A FORMATO ESPERADO POR EL FRONTEND
    const resumen = data.resumen;

    const dataConvertida: ResumenConciliacion = {
      resumen: {
        total_movimientos_banco: resumen.total_movimientos_banco ?? 0,
        total_pagos_conductores: resumen.total_pagos_iniciales ?? 0,
        conciliado_exacto: resumen.conciliado_exacto ?? 0,
        conciliado_aproximado: resumen.conciliado_aproximado ?? 0,
        multiple_match: 0,
        diferencia_valor: 0,
        diferencia_fecha: 0,
        sin_match: resumen.sin_match ?? 0
      },
      resultados: data.resultados ?? [],
      fecha_conciliacion: data.fecha_conciliacion ?? ""
    };

    setResultadoConciliacion(dataConvertida);

    // ✅ MENSAJE MEJORADO CON DATOS DEL ENDPOINT NUEVO
    const totalConciliados =
      (resumen.conciliado_exacto ?? 0) + (resumen.conciliado_aproximado ?? 0);
    const porcentajeConciliado =
      (resumen.total_movimientos_banco ?? 0) > 0
        ? Math.round(
            (totalConciliados / resumen.total_movimientos_banco!) * 100
          )
        : 0;

    setMensaje(
      `✅ Conciliación completada. ` +
        `Procesados: ${resumen.total_procesados ?? 0} movimientos. ` +
        `Conciliados: ${totalConciliados} (${porcentajeConciliado}%). ` +
        `Referencias únicas usadas: ${resumen.referencias_unicas_utilizadas ?? 0}.`
    );

    cargarEstadisticas();
  } catch (err: any) {
    console.error("Error en conciliación:", err);
    setMensaje("❌ Error ejecutando conciliación: " + err.message);
  } finally {
    setProcesandoConciliacion(false);
  }
};


  // ✅ FUNCIÓN MARCAR CONCILIADO MANUAL IMPLEMENTADA
  const marcarConciliadoManual = async (idBanco: string, referenciaPago?: string) => {
    try {
      const observaciones = prompt("Observaciones (opcional):") || "Conciliado manualmente";

      const res = await fetch("https://api.x-cargo.co/conciliacion/marcar-conciliado-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_banco: idBanco,
          referencia_pago: referenciaPago || "",
          observaciones,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || "Error al conciliar");
      }

      setMensaje("✅ Conciliación manual completada");
      
      // Recargar datos
      await cargarEstadisticas();
      await ejecutarConciliacion(); // Actualizar resultados completos
      
    } catch (err: any) {
      setMensaje("❌ Error: " + err.message);
      console.error("Error en conciliación manual:", err);
    }
  };

  const getEstadoColor = (estado: string) => {
    const colores = {
      conciliado_exacto: "#22c55e",
      conciliado_aproximado: "#3b82f6",
      multiple_match: "#f59e0b",
      diferencia_valor: "#ef4444",
      diferencia_fecha: "#f97316",
      sin_match: "#6b7280",
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
      sin_match: "❌ Sin Match",
    };
    return textos[estado as keyof typeof textos] || estado;
  };

  const resultadosFiltrados = resultadoConciliacion?.resultados.filter((r) => {
    const pasaFiltroEstado = filtroEstado === "todos" || r.estado_match === filtroEstado;
    const pasaBusqueda = busqueda === "" || 
      r.descripcion_banco.toLowerCase().includes(busqueda.toLowerCase()) ||
      (r.referencia_pago && r.referencia_pago.toLowerCase().includes(busqueda.toLowerCase()));
    return pasaFiltroEstado && pasaBusqueda;
  }) || [];

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
              <p>{estadisticasGenerales?.resumen_general?.total_movimientos ?? 0}</p>
            </div>
            <div className="stat-card">
              <h4>Valor Total</h4>
              <p>${estadisticasGenerales?.resumen_general?.valor_total?.toLocaleString() ?? 0}</p>
            </div>
            {estadisticasGenerales?.resumen_por_estado?.map((estado) => (
              <div key={estado.estado_conciliacion} className="stat-card">
                <h4>{estado.estado_conciliacion.replace("_", " ").toUpperCase()}</h4>
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
          <div className="file-input-wrapper">
            <label>
              Seleccionar archivo CSV del banco:
              <input
                type="file"
                accept=".csv,.CSV"
                onChange={handleFileChange}
                disabled={subiendo}
              />
            </label>
            {archivo && (
              <div className="file-info">
                <span className="file-name">📄 {archivo.name}</span>
                <span className="file-size">({(archivo.size / (1024 * 1024)).toFixed(2)}MB)</span>
              </div>
            )}
          </div>

          <button
            className="boton-accion"
            onClick={handleUpload}
            disabled={subiendo || !archivo}
          >
            {subiendo ? (
              <span>
                <span className="spinner">🔄</span> Subiendo...
              </span>
            ) : (
              "Subir Archivo"
            )}
          </button>
        </div>

        <button
          className="boton-conciliar"
          onClick={ejecutarConciliacion}
          disabled={procesandoConciliacion}
        >
          {procesandoConciliacion
            ? "🔄 Procesando..."
            : "🤖 Ejecutar Conciliación Automática"}
        </button>
        {mensaje && (
          <div
            className={`mensaje-estado ${
              mensaje.includes("✅")
                ? "success"
                : mensaje.includes("📤") || mensaje.includes("📄") || mensaje.includes("🔍") || mensaje.includes("ℹ️")
                ? "info"
                : "error"
            }`}
            style={{
              whiteSpace: 'pre-line', // Para mostrar saltos de línea en problemas
              maxHeight: '120px',
              overflowY: 'auto'
            }}
          >
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
                <span className="numero">{resultadoConciliacion?.resumen?.conciliado_exacto ?? 0}</span>
                <span className="etiqueta">Exactos</span>
              </div>
              <div className="resumen-item info">
                <span className="numero">{resultadoConciliacion?.resumen?.conciliado_aproximado ?? 0}</span>
                <span className="etiqueta">Aproximados</span>
              </div>
              <div className="resumen-item warning">
                <span className="numero">{resultadoConciliacion?.resumen?.multiple_match ?? 0}</span>
                <span className="etiqueta">Múltiples</span>
              </div>
              <div className="resumen-item error">
                <span className="numero">{resultadoConciliacion?.resumen?.diferencia_valor ?? 0}</span>
                <span className="etiqueta">Dif. Valor</span>
              </div>
              <div className="resumen-item error">
                <span className="numero">{resultadoConciliacion?.resumen?.diferencia_fecha ?? 0}</span>
                <span className="etiqueta">Dif. Fecha</span>
              </div>
              <div className="resumen-item neutral">
                <span className="numero">{resultadoConciliacion?.resumen?.sin_match ?? 0}</span>
                <span className="etiqueta">Sin Match</span>
              </div>
            </div>
          </div>

          {/* Filtros y búsqueda */}
          <div className="filtros-conciliacion">
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ minWidth: '300px' }}>
                <input
                  type="text"
                  placeholder="Buscar por descripción o referencia..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>
              <label>
                Filtrar por estado:
                <select
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                >
                  <option value="todos">Todos</option>
                  <option value="conciliado_exacto">Conciliado Exacto</option>
                  <option value="conciliado_aproximado">Conciliado Aproximado</option>
                  <option value="multiple_match">Múltiples Matches</option>
                  <option value="diferencia_valor">Diferencia Valor</option>
                  <option value="diferencia_fecha">Diferencia Fecha</option>
                  <option value="sin_match">Sin Match</option>
                </select>
              </label>
            </div>
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
                  <tr
                    key={idx}
                    style={{
                      borderLeft: `4px solid ${getEstadoColor(resultado.estado_match)}`,
                    }}
                  >
                    <td>{new Date(resultado.fecha_banco).toLocaleDateString('es-CO')}</td>
                    <td>${resultado.valor_banco.toLocaleString('es-CO')}</td>
                    <td>
                      <span
                        className="estado-badge"
                        style={{
                          backgroundColor: getEstadoColor(resultado.estado_match),
                        }}
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
                              backgroundColor:
                                resultado.confianza >= 80
                                  ? "#22c55e"
                                  : resultado.confianza >= 60
                                  ? "#f59e0b"
                                  : "#ef4444",
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
                          💰 ${resultado.diferencia_valor.toLocaleString('es-CO')}
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
                            onClick={() =>
                              marcarConciliadoManual(
                                resultado.id_banco,
                                resultado.referencia_pago
                              )
                            }
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
          <div
            className="modal-content detalle-conciliacion"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Detalle de Conciliación</h3>

            <div className="detalle-grid">
              <div className="detalle-seccion">
                <h4>📊 Datos del Banco</h4>
                <div className="detalle-item">
                  <strong>Fecha:</strong>{" "}
                  {new Date(modalDetalle.fecha_banco).toLocaleDateString('es-CO')}
                </div>
                <div className="detalle-item">
                  <strong>Valor:</strong> $
                  {modalDetalle.valor_banco.toLocaleString('es-CO')}
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
                    <strong>Fecha:</strong>{" "}
                    {modalDetalle.fecha_pago &&
                      new Date(modalDetalle.fecha_pago).toLocaleDateString('es-CO')}
                  </div>
                  <div className="detalle-item">
                    <strong>Valor:</strong> $
                    {modalDetalle.valor_pago?.toLocaleString('es-CO')}
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
                      {modalDetalle.trackings
                        ?.split(", ")
                        .map((tracking, idx) => (
                          <span key={idx} className="tracking-item">
                            {tracking}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {modalDetalle.matches_posibles &&
                modalDetalle.matches_posibles.length > 0 && (
                  <div className="detalle-seccion">
                    <h4>🔍 Matches Posibles</h4>
                    <div className="matches-list">
                      {modalDetalle.matches_posibles.map((match, idx) => (
                        <div key={idx} className="match-item">
                          <div>
                            <strong>Ref:</strong> {match.referencia_pago}
                          </div>
                          <div>
                            <strong>Fecha:</strong>{" "}
                            {new Date(match.fecha_pago).toLocaleDateString('es-CO')}
                          </div>
                          <div>
                            <strong>Valor:</strong> $
                            {match.valor_pago.toLocaleString('es-CO')}
                          </div>
                          <div>
                            <strong>Score:</strong> {match.score.toFixed(1)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              <div className="detalle-seccion">
                <h4>📋 Análisis</h4>
                <div className="detalle-item">
                  <strong>Estado:</strong>
                  <span
                    style={{ color: getEstadoColor(modalDetalle.estado_match) }}
                  >
                    {getEstadoTexto(modalDetalle.estado_match)}
                  </span>
                </div>
                <div className="detalle-item">
                  <strong>Confianza:</strong> {modalDetalle.confianza}%
                </div>
                {modalDetalle.diferencia_valor && modalDetalle.diferencia_valor > 0 && (
                  <div className="detalle-item">
                    <strong>Diferencia en Valor:</strong> $
                    {modalDetalle.diferencia_valor.toLocaleString('es-CO')}
                  </div>
                )}
                {modalDetalle.diferencia_dias && modalDetalle.diferencia_dias > 0 && (
                  <div className="detalle-item">
                    <strong>Diferencia en Días:</strong> {modalDetalle.diferencia_dias} día(s)
                  </div>
                )}
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
                    marcarConciliadoManual(
                      modalDetalle.id_banco,
                      modalDetalle.referencia_pago
                    );
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
};

export default Cruces;