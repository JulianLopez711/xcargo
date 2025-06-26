import React, { useState, useEffect } from "react";
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
    correo_conductor?: string;
    trackings?: string[];
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

// Nueva interfaz para el modal de conciliación manual
interface ConciliacionManual {
  movimiento_banco: {
    id: string;
    fecha: string;
    valor: number;
    descripcion: string;
  };
  sugerencias: Array<{
    referencia: string;
    fecha: string;
    valor: number;
    conductor: string;
    score: number;
  }>;
}

interface LoadingProgress {
  total: number;
  processed: number;
  percentage: number;
  message: string;
}

const Cruces: React.FC = () => {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [procesandoConciliacion, setProcesandoConciliacion] = useState(false);
  const [resultadoConciliacion, setResultadoConciliacion] =
    useState<ResumenConciliacion | null>(null);
  const [estadisticasGenerales, setEstadisticasGenerales] =
    useState<EstadisticasGenerales | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [modalDetalle, setModalDetalle] =
    useState<ResultadoConciliacion | null>(null);
  const [modalConciliacionManual, setModalConciliacionManual] =
    useState<ConciliacionManual | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress>({
    total: 0,
    processed: 0,
    percentage: 0,
    message: "",
  });

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  useEffect(() => {
    cargarEstadisticas();
  }, []);

  // ✅ FUNCIÓN CARGAR ESTADÍSTICAS IMPLEMENTADA
  const cargarEstadisticas = async () => {
    try {
      const response = await fetch(
        "https://api.x-cargo.co/conciliacion/resumen-conciliacion"
      );
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
          valor_total: 0,
        },
        resumen_por_estado: data.resumen_por_estado || [],
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
        setMensaje(
          `❌ El archivo es demasiado grande. Máximo permitido: ${
            MAX_FILE_SIZE / (1024 * 1024)
          }MB`
        );
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
    updateProgress(0, 100, "Iniciando carga del archivo...");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

      const res = await fetch(
        "https://api.x-cargo.co/conciliacion/cargar-banco-excel",
        {
          method: "POST",
          body: formData,
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText);
      }

      const result = await res.json();

      if (result.movimientos_insertados > 0) {
        updateProgress(
          100,
          100,
          `✅ ${result.movimientos_insertados} movimientos procesados`
        );
      } else {
        updateProgress(100, 100, "⚠️ No se encontraron movimientos nuevos");
      }

      setArchivo(null);
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      cargarEstadisticas();
    } catch (err: any) {
      console.error("Error en upload:", err);
      let errorMessage = "Error desconocido";
      // ... manejo de errores existente ...
      setMensaje("❌ " + errorMessage);
      updateProgress(0, 100, "❌ Error en la carga");
    } finally {
      setTimeout(() => {
        setSubiendo(false);
        setLoadingProgress({
          total: 0,
          processed: 0,
          percentage: 0,
          message: "",
        });
      }, 2000);
    }
  };

  // ✅ FUNCIÓN EJECUTAR CONCILIACIÓN CORREGIDA
  const ejecutarConciliacion = async () => {
    setProcesandoConciliacion(true);
    updateProgress(0, 100, "Iniciando conciliación automática...");

    try {
      const res = await fetch(
        "https://api.x-cargo.co/conciliacion/conciliacion-automatica-mejorada"
      );

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data: ResumenConciliacionMejorado = await res.json();

      if (!data.resumen) {
        throw new Error("Datos de conciliación inválidos");
      }

      const totalProcesados = data.resumen.total_procesados || 0;
      const totalMovimientos = data.resumen.total_movimientos_banco || 0;

      updateProgress(
        totalProcesados,
        totalMovimientos,
        `Conciliados: ${
          data.resumen.conciliado_exacto + data.resumen.conciliado_aproximado
        }`
      );

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
          sin_match: resumen.sin_match ?? 0,
        },
        resultados: data.resultados ?? [],
        fecha_conciliacion: data.fecha_conciliacion ?? "",
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
          `Referencias únicas usadas: ${
            resumen.referencias_unicas_utilizadas ?? 0
          }.`
      );

      cargarEstadisticas();
    } catch (err: any) {
      console.error("Error en conciliación:", err);
      setMensaje("❌ Error ejecutando conciliación: " + err.message);
      updateProgress(0, 100, "❌ Error en la conciliación");
    } finally {
      setTimeout(() => {
        setProcesandoConciliacion(false);
        setLoadingProgress({
          total: 0,
          processed: 0,
          percentage: 0,
          message: "",
        });
      }, 2000);
    }
  };

  // ✅ FUNCIÓN MARCAR CONCILIADO MANUAL IMPLEMENTADA
  const marcarConciliadoManual = async (
    idBanco: string,
    referenciaPago?: string
  ) => {
    try {
      const usuario = localStorage.getItem("correo") || "sistema@x-cargo.co";
      const res = await fetch(
        "https://api.x-cargo.co/conciliacion/marcar-conciliado-manual",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id_banco: idBanco,
            referencia_pago: referenciaPago,
            observaciones: "Conciliado manualmente por usuario",
            usuario,
          }),
        }
      );

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

  const confirmarConciliacionManual = async (
    idBanco: string,
    referenciaPago: string
  ) => {
    try {
      const res = await fetch(
        "https://api.x-cargo.co/conciliacion/marcar-conciliado-manual",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id_banco: idBanco,
            referencia_pago: referenciaPago,
            observaciones: "Conciliado manualmente por usuario",
          }),
        }
      );

      if (res.ok) {
        setMensaje("✅ Conciliación manual realizada exitosamente");
        cargarEstadisticas(); // Recargar datos
        setModalConciliacionManual(null);
      } else {
        setMensaje("❌ Error al realizar conciliación manual");
      }
    } catch (err) {
      setMensaje(`❌ Error: ${err}`);
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

  const resultadosFiltrados =
    resultadoConciliacion?.resultados.filter((r) => {
      const pasaFiltroEstado =
        filtroEstado === "todos" || r.estado_match === filtroEstado;
      const pasaBusqueda =
        busqueda === "" ||
        r.descripcion_banco.toLowerCase().includes(busqueda.toLowerCase()) ||
        (r.referencia_pago &&
          r.referencia_pago.toLowerCase().includes(busqueda.toLowerCase()));
      return pasaFiltroEstado && pasaBusqueda;
    }) || [];

  // Función para actualizar el progreso
  const updateProgress = (
    processed: number,
    total: number,
    message: string = ""
  ) => {
    const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
    setLoadingProgress({
      total,
      processed,
      percentage,
      message,
    });
  };

  const styles = `
    .loading-container {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: rgba(255, 255, 255, 0.9);
      padding: 1rem;
      z-index: 1000;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .loading-progress {
      max-width: 600px;
      margin: 0 auto;
      background: #f3f4f6;
      border-radius: 8px;
      overflow: hidden;
      position: relative;
      height: 24px;
    }

    .progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6 0%, #2563eb 100%);
      transition: width 0.3s ease;
    }

    .progress-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #1f2937;
      font-size: 0.875rem;
      font-weight: 500;
      white-space: nowrap;
      text-shadow: 0 0 2px rgba(255,255,255,0.8);
    }
  `;

  const styleSheet = document.createElement("style");
  styleSheet.innerHTML = styles;
  document.head.appendChild(styleSheet);

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
              <p>
                {estadisticasGenerales?.resumen_general?.total_movimientos ?? 0}
              </p>
            </div>
            <div className="stat-card">
              <h4>Valor Total</h4>
              <p>
                $
                {estadisticasGenerales?.resumen_general?.valor_total?.toLocaleString() ??
                  0}
              </p>
            </div>
            {estadisticasGenerales?.resumen_por_estado?.map((estado) => (
              <div key={estado.estado_conciliacion} className="stat-card">
                <h4>
                  {estado.estado_conciliacion.replace("_", " ").toUpperCase()}
                </h4>
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
                <span className="file-size">
                  ({(archivo.size / (1024 * 1024)).toFixed(2)}MB)
                </span>
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
        <button
            className="boton-conciliar-manual"
            /* onClick={() => ejecutarConciliacion(true)} */
            disabled={procesandoConciliacion}
          >
            🛠 Ver Pagos No Conciliados (Manual)
          </button>

        {mensaje && (
          <div
            className={`mensaje-estado ${
              mensaje.includes("✅")
                ? "success"
                : mensaje.includes("📤") ||
                  mensaje.includes("📄") ||
                  mensaje.includes("🔍") ||
                  mensaje.includes("ℹ️")
                ? "info"
                : "error"
            }`}
            style={{
              whiteSpace: "pre-line", // Para mostrar saltos de línea en problemas
              maxHeight: "120px",
              overflowY: "auto",
            }}
          >
            {mensaje}
          </div>
        )}
      </div>
      {resultadosFiltrados.length > 0 ? (
        <div>
          <h3>📊 Resultados de Conciliación</h3>

          {/* Resumen de resultados */}
          <div className="resumen-resultados">
            <div className="resumen-grid">
              <div className="resumen-item success">
                <span className="numero">
                  {resultadoConciliacion?.resumen?.conciliado_exacto ?? 0}
                </span>
                <span className="etiqueta">Exactos</span>
              </div>
              <div className="resumen-item info">
                <span className="numero">
                  {resultadoConciliacion?.resumen?.conciliado_aproximado ?? 0}
                </span>
                <span className="etiqueta">Aproximados</span>
              </div>
              <div className="resumen-item warning">
                <span className="numero">
                  {resultadoConciliacion?.resumen?.multiple_match ?? 0}
                </span>
                <span className="etiqueta">Múltiples</span>
              </div>
              <div className="resumen-item error">
                <span className="numero">
                  {resultadoConciliacion?.resumen?.diferencia_valor ?? 0}
                </span>
                <span className="etiqueta">Dif. Valor</span>
              </div>
              <div className="resumen-item error">
                <span className="numero">
                  {resultadoConciliacion?.resumen?.diferencia_fecha ?? 0}
                </span>
                <span className="etiqueta">Dif. Fecha</span>
              </div>
              <div className="resumen-item neutral">
                <span className="numero">
                  {resultadoConciliacion?.resumen?.sin_match ?? 0}
                </span>
                <span className="etiqueta">Sin Match</span>
              </div>
            </div>
          </div>

          {/* Filtros y búsqueda */}
          <div className="filtros-conciliacion">
            <div
              style={{
                display: "flex",
                gap: "1rem",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: "300px" }}>
                <input
                  type="text"
                  placeholder="Buscar por descripción o referencia..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontSize: "14px",
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
                  <option value="conciliado_aproximado">
                    Conciliado Aproximado
                  </option>
                  <option value="multiple_match">Múltiples Matches</option>
                  <option value="diferencia_valor">Diferencia Valor</option>
                  <option value="diferencia_fecha">Diferencia Fecha</option>
                  <option value="sin_match">Sin Match</option>
                </select>
              </label>
            </div>
            <span className="contador-filtro">
              Mostrando {resultadosFiltrados.length} de{" "}
              {resultadoConciliacion?.resultados.length ?? 0}
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
                      borderLeft: `4px solid ${getEstadoColor(
                        resultado.estado_match
                      )}`,
                    }}
                  >
                    <td>
                      {new Date(resultado.fecha_banco).toLocaleDateString(
                        "es-CO"
                      )}
                    </td>
                    <td>${resultado.valor_banco.toLocaleString("es-CO")}</td>
                    <td>
                      <span
                        className="estado-badge"
                        style={{
                          backgroundColor: getEstadoColor(
                            resultado.estado_match
                          ),
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
                      {resultado.diferencia_valor &&
                        resultado.diferencia_valor > 0 && (
                          <div className="diferencia">
                            💰 $
                            {resultado.diferencia_valor.toLocaleString("es-CO")}
                          </div>
                        )}
                      {resultado.diferencia_dias &&
                        resultado.diferencia_dias > 0 && (
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
                            onClick={() => {
                              if (
                                resultado.matches_posibles &&
                                resultado.matches_posibles.length > 0
                              ) {
                                setModalConciliacionManual({
                                  movimiento_banco: {
                                    id: resultado.id_banco,
                                    fecha: resultado.fecha_banco,
                                    valor: resultado.valor_banco,
                                    descripcion: resultado.descripcion_banco,
                                  },
                                  sugerencias: resultado.matches_posibles.map(
                                    (m) => ({
                                      referencia: m.referencia_pago,
                                      fecha: m.fecha_pago,
                                      valor: m.valor_pago,
                                      conductor: m.correo_conductor || "",
                                      score: m.score,
                                    })
                                  ),
                                });
                              } else {
                                marcarConciliadoManual(
                                  resultado.id_banco,
                                  resultado.referencia_pago
                                );
                              }
                            }}
                          >
                            ✅ Conciliar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>{" "}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "1rem", color: "#666" }}>
          ⚠️ No hay resultados para mostrar. Verifica si los datos del banco
          coinciden con algún pago.
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
                  {new Date(modalDetalle.fecha_banco).toLocaleDateString(
                    "es-CO"
                  )}
                </div>
                <div className="detalle-item">
                  <strong>Valor:</strong> $
                  {modalDetalle.valor_banco.toLocaleString("es-CO")}
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
                      new Date(modalDetalle.fecha_pago).toLocaleDateString(
                        "es-CO"
                      )}
                  </div>
                  <div className="detalle-item">
                    <strong>Valor:</strong> $
                    {modalDetalle.valor_pago?.toLocaleString("es-CO")}
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
                            {new Date(match.fecha_pago).toLocaleDateString(
                              "es-CO"
                            )}
                          </div>
                          <div>
                            <strong>Valor:</strong> $
                            {match.valor_pago.toLocaleString("es-CO")}
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
                {modalDetalle.diferencia_valor &&
                  modalDetalle.diferencia_valor > 0 && (
                    <div className="detalle-item">
                      <strong>Diferencia en Valor:</strong> $
                      {modalDetalle.diferencia_valor.toLocaleString("es-CO")}
                    </div>
                  )}
                {modalDetalle.diferencia_dias &&
                  modalDetalle.diferencia_dias > 0 && (
                    <div className="detalle-item">
                      <strong>Diferencia en Días:</strong>{" "}
                      {modalDetalle.diferencia_dias} día(s)
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
      {/* Modal de conciliación manual */}
      {modalConciliacionManual && (
        <div
          className="modal-overlay"
          onClick={() => setModalConciliacionManual(null)}
        >
          <div
            className="modal-content conciliacion-manual"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Conciliación Manual</h3>

            <div className="detalle-grid">
              <div className="detalle-seccion">
                <h4>📊 Datos del Movimiento</h4>
                <div className="detalle-item">
                  <strong>Fecha:</strong>{" "}
                  {new Date(
                    modalConciliacionManual.movimiento_banco.fecha
                  ).toLocaleDateString("es-CO")}
                </div>
                <div className="detalle-item">
                  <strong>Valor:</strong> $
                  {modalConciliacionManual.movimiento_banco.valor.toLocaleString(
                    "es-CO"
                  )}
                </div>
                <div className="detalle-item">
                  <strong>Descripción:</strong>{" "}
                  {modalConciliacionManual.movimiento_banco.descripcion}
                </div>
                <div className="detalle-item">
                  <strong>ID:</strong>{" "}
                  {modalConciliacionManual.movimiento_banco.id}
                </div>
              </div>

              {modalConciliacionManual.sugerencias &&
                modalConciliacionManual.sugerencias.length > 0 && (
                  <div className="detalle-seccion">
                    <h4>🔍 Sugerencias de Conciliación</h4>
                    <div className="sugerencias-list">
                      {modalConciliacionManual.sugerencias.map(
                        (sugerencia, idx) => (
                          <div key={idx} className="sugerencia-item">
                            <div>
                              <strong>Ref:</strong> {sugerencia.referencia}
                            </div>
                            <div>
                              <strong>Fecha:</strong>{" "}
                              {new Date(sugerencia.fecha).toLocaleDateString(
                                "es-CO"
                              )}
                            </div>
                            <div>
                              <strong>Valor:</strong> $
                              {sugerencia.valor.toLocaleString("es-CO")}
                            </div>
                            <div>
                              <strong>Conductor:</strong> {sugerencia.conductor}
                            </div>
                            <div>
                              <strong>Score:</strong>{" "}
                              {sugerencia.score.toFixed(1)}
                            </div>
                            <button
                              className="btn-seleccionar"
                              onClick={() =>
                                confirmarConciliacionManual(
                                  modalConciliacionManual.movimiento_banco.id,
                                  sugerencia.referencia
                                )
                              }
                            >
                              ✅ Seleccionar
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
            </div>
            <div className="modal-acciones">
              <button
                className="btn-cerrar"
                onClick={() => setModalConciliacionManual(null)}
              >
                ✕ Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {subiendo && (
        <div className="loading-container">
          <div className="loading-progress">
            <div
              className="progress-bar"
              style={{ width: `${loadingProgress.percentage}%` }}
            />
            <div className="progress-text">
              {loadingProgress.message || "Procesando..."}
              {loadingProgress.total > 0 && (
                <span>
                  {" "}
                  ({loadingProgress.processed}/{loadingProgress.total} -{" "}
                  {loadingProgress.percentage}%)
                </span>
              )}
            </div>
          </div>
        </div>
      )}{" "}
      {procesandoConciliacion && (
        <div className="loading-container">
          <div className="loading-progress">
            <div className="progress-track">
              <div
                className="progress-bar"
                style={{ width: `${loadingProgress.percentage}%` }}
              />
            </div>
            <div className="progress-text">
              {loadingProgress.message || "Conciliando..."}
              {loadingProgress.percentage > 0 && (
                <span> ({loadingProgress.percentage}%)</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cruces;
