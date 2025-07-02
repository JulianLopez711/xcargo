import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContext";
import "../../styles/conductor/FormularioPagoConductor.css";
import LoadingSpinner from "../../components/LoadingSpinner";
import ValidadorPago from "../../components/ValidadorPago";

// Tipos de datos específicos para supervisor
type GuiaPago = { 
  referencia: string; 
  valor: number; 
  tracking?: string; 
  liquidacion_id?: string; 
  conductor?: string;
  cliente?: string;
  ciudad?: string;
  departamento?: string;
  carrier?: string;
  estado_actual?: string;
};

type DatosPago = {
  valor: string;
  fecha: string;
  hora: string;
  tipo: string;
  entidad: string;
  referencia: string;
};

type PagoCompleto = {
  datos: DatosPago;
  archivo: File;
};

type OCRResponse = {
  datos_extraidos?: {
    valor?: string;
    fecha?: string;
    hora?: string;
    entidad?: string;
    referencia?: string;
    tipo?: string;
  };
  validacion_ia?: {
    score_confianza: number;
    estado: string;
    accion_recomendada: string;
    errores_detectados?: string[];
    sugerencias?: string[];
  };
  estadisticas?: {
    tiempo_total: number;
    engine_ganador: string;
    calidad_imagen: number;
  };
  error?: boolean;
  mensaje?: string;
};

export default function RegistrarPagoSupervisor() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { guias, total, supervisor }: { 
    guias: GuiaPago[]; 
    total: number; 
    supervisor?: { nombre: string; email: string; } 
  } = location.state || {
    guias: [],
    total: 0,
    supervisor: { nombre: user?.nombre || "", email: user?.email || "" }
  };

  // Estados principales (simplificado para supervisor)
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [pagosCargados, setPagosCargados] = useState<PagoCompleto[]>([]);
  const [validacionIA, setValidacionIA] = useState<any>(null);
  const [calidadOCR, setCalidadOCR] = useState<number>(0);
  
  const [datosManuales, setDatosManuales] = useState<DatosPago>({
    valor: "",
    fecha: "",
    hora: "",
    tipo: "",
    entidad: "",
    referencia: "",
  });  const [validacionPago, setValidacionPago] = useState<any>(null);

  // Funciones auxiliares
  const convertirFechaAISO = (fechaTexto: string): string => {
    if (!fechaTexto) return "";
    
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(fechaTexto)) {
        return fechaTexto;
      }
      
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(fechaTexto)) {
        const [dia, mes, año] = fechaTexto.split('/');
        return `${año}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
      }
      
      if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(fechaTexto)) {
        const [dia, mes, año] = fechaTexto.split('-');
        return `${año}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
      }
      
      const fecha = new Date(fechaTexto);
      if (!isNaN(fecha.getTime())) {
        return fecha.toISOString().split('T')[0];
      }
      
      console.warn(`⚠️ No se pudo convertir la fecha: ${fechaTexto}`);
      return "";
    } catch (error) {
      console.error(`❌ Error convirtiendo fecha ${fechaTexto}:`, error);
      return "";
    }
  };

  const normalizarHora = (horaTexto: string): string => {
    if (!horaTexto) return "";
    
    try {
      if (/^\d{1,2}:\d{2}$/.test(horaTexto)) {
        return horaTexto;
      }
      
      if (/^\d{1,2}:\d{2}:\d{2}$/.test(horaTexto)) {
        return horaTexto.slice(0, 5);
      }
      
      const ampmMatch = horaTexto.match(/(\d{1,2}):(\d{2})\s*(AM|PM|A\.M\.|P\.M\.)/i);
      if (ampmMatch) {
        let [, horas, minutos, periodo] = ampmMatch;
        let horasNum = parseInt(horas);
        
        if (periodo.toUpperCase().includes('P') && horasNum !== 12) {
          horasNum += 12;
        } else if (periodo.toUpperCase().includes('A') && horasNum === 12) {
          horasNum = 0;
        }
        
        return `${horasNum.toString().padStart(2, '0')}:${minutos}`;
      }
      
      return horaTexto;
    } catch (error) {
      console.error(`❌ Error normalizando hora ${horaTexto}:`, error);
      return horaTexto;
    }
  };

  const normalizarHoraParaEnvio = (hora: string): string => {
    if (!hora) return "00:00:00";
    
    if (/^\d{2}:\d{2}:\d{2}$/.test(hora)) {
      return hora;
    }
    
    if (/^\d{2}:\d{2}$/.test(hora)) {
      return `${hora}:00`;
    }
    
    if (/^\d{1}:\d{2}$/.test(hora)) {
      return `0${hora}:00`;
    }
    
    return `${hora.slice(0, 5)}:00`;
  };

  function parseValorMonetario(valor: string): number {
    const limpio = valor
      .replace(/[^0-9.,]/g, "")
      .replace(/\.(?=\d{3,})/g, "")
      .replace(",", ".");
    const num = parseFloat(limpio);
    return isNaN(num) ? 0 : num;
  }

  // Calcular totales (simplificado para supervisor - solo comprobantes)
  const calcularTotales = () => {
    const totalPagosEfectivo = pagosCargados.reduce((sum, p) => {
      const val = parseValorMonetario(p.datos.valor);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
    
    const faltante = Math.max(0, total - totalPagosEfectivo);
    const sobrante = Math.max(0, totalPagosEfectivo - total);
    
    return {
      totalPagosEfectivo,
      totalCubierto: totalPagosEfectivo,
      faltante,
      sobrante
    };
  };

  const totales = calcularTotales();

  // Validar si se puede procesar el pago (simplificado para supervisor)
  const puedeProcessarPago = () => {
    return pagosCargados.length > 0 && totales.totalPagosEfectivo >= total;
  };

  // Manejar archivo de comprobante
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setArchivo(file);
    setValidacionIA(null);
    setCalidadOCR(0);
    
    if (!file) return;

    setAnalizando(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://127.0.0.1:8000/ocr/extraer", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result: OCRResponse = await response.json();

      if (result.error) {
        alert(`❌ Error en OCR: ${result.mensaje || 'Error desconocido'}`);
        return;
      }

      const data = result.datos_extraidos;
      
      if (data && Object.keys(data).length > 0) {
        const datosLimpios = {
          valor: data.valor || "",
          fecha: convertirFechaAISO(data.fecha || ""),
          hora: normalizarHora(data.hora || ""),
          tipo: data.tipo || data.entidad || "",
          entidad: data.entidad || "",
          referencia: data.referencia || "",
        };

        setDatosManuales(datosLimpios);

        if (result.validacion_ia) {
          setValidacionIA(result.validacion_ia);
          
          const { score_confianza, errores_detectados } = result.validacion_ia;
          
          if (errores_detectados && Array.isArray(errores_detectados) && errores_detectados.length > 0) {
            console.warn("⚠️ Errores detectados:", errores_detectados);
            alert(`⚠️ OCR completado con advertencias:\n${errores_detectados.join('\n')}\n\nPor favor verifica los datos extraídos.`);
          } else if (score_confianza < 70) {
            console.warn(`⚠️ Confianza baja: ${score_confianza}%`);
            alert(`⚠️ Confianza baja (${score_confianza}%). Por favor verifica los datos.`);
          }
        }

        if (result.estadisticas?.calidad_imagen) {
          setCalidadOCR(result.estadisticas.calidad_imagen);
        }

      } else {
        console.warn("⚠️ No se extrajeron datos válidos del comprobante");
        alert("⚠️ No se pudieron extraer datos del comprobante.\n\nPuedes ingresar los datos manualmente.");
      }

    } catch (err: any) {
      console.error("❌ Error al extraer datos:", err);
      alert(`❌ Error al procesar el comprobante: ${err.message}\n\nPuedes ingresar los datos manualmente.`);
    } finally {
      setAnalizando(false);
    }
  };

  // Agregar pago individual
  const agregarPago = () => {
    const campos = Object.entries(datosManuales);
    for (const [key, val] of campos) {
      if (typeof val !== "string" || val.trim() === "") {
        alert(`El campo "${key}" es obligatorio`);
        return;
      }
    }

    if (!archivo) {
      alert("Debes adjuntar el comprobante de pago.");
      return;
    }

    const referencia = datosManuales.referencia.trim();
    const fechaHora = `${datosManuales.fecha.trim()} ${datosManuales.hora.trim()}`;

    const duplicado = pagosCargados.find(
      (p) =>
        p.datos.referencia === referencia ||
        `${p.datos.fecha} ${p.datos.hora}` === fechaHora
    );

    if (duplicado) {
      alert("Este comprobante ya fue cargado (referencia o fecha/hora duplicada).");
      return;
    }

    setPagosCargados((prev) => [...prev, { datos: datosManuales, archivo }]);
    setDatosManuales({
      valor: "",
      fecha: "",
      hora: "",
      tipo: "",
      entidad: "",
      referencia: "",
    });
    setArchivo(null);
    setValidacionIA(null);
    setCalidadOCR(0);
  };

  // Eliminar pago
  const eliminarPago = (referencia: string) => {
    setPagosCargados((prev) =>
      prev.filter((p) => p.datos.referencia !== referencia)
    );
  };

  // Función principal de registro - ADAPTADA PARA SUPERVISOR
  const registrarTodosLosPagos = async () => {
    const totales = calcularTotales();

    if (totales.faltante > 0) {
      alert(`Faltan ${totales.faltante.toLocaleString()} para cubrir el total de las guías.`);
      return;
    }

    setCargando(true);

    try {
      const token = user?.token || localStorage.getItem("token") || "";
      
      // 🔥 USAR ENDPOINT CORRECTO PARA PAGOS DE CONDUCTOR/SUPERVISOR
      for (const p of pagosCargados) {
        const formData = new FormData();

        // Parámetros requeridos por el endpoint /pagos/registrar-conductor
        formData.append("correo", supervisor?.email || user?.email || "");
        formData.append("valor_pago_str", parseValorMonetario(p.datos.valor).toString());
        formData.append("fecha_pago", p.datos.fecha);
        formData.append("hora_pago", normalizarHoraParaEnvio(p.datos.hora));
        formData.append("tipo", p.datos.tipo);
        formData.append("entidad", p.datos.entidad);
        formData.append("referencia", p.datos.referencia);
        formData.append("comprobante", p.archivo);

        // Guías en formato esperado por /pagos/registrar-conductor
        const guiasParaPago = guias.map((g) => ({
          referencia: String(g.referencia).trim(),
          tracking: g.tracking || g.referencia,
          valor: Number(g.valor),
          // Campos adicionales para compatibilidad
          conductor: g.conductor || "No especificado",
          cliente: g.cliente || "No especificado",
          ciudad: g.ciudad || "",
          departamento: g.departamento || "",
          carrier: g.carrier || "",
          estado_actual: g.estado_actual || "pendiente",
          liquidacion_id: g.liquidacion_id
        }));

        formData.append("guias", JSON.stringify(guiasParaPago));

        // 🔥 USAR ENDPOINT CORRECTO PARA PAGOS DE CONDUCTOR/SUPERVISOR
        const endpoint = "http://127.0.0.1:8000/pagos/registrar-conductor";

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        });

        const result = await response.json();
        if (!response.ok) {
          console.error("❌ Error response:", result);
          throw new Error(result.detail || result.message || `Error ${response.status}: ${response.statusText}`);
        }

        console.log("✅ Pago registrado exitosamente:", result);
      }

      const mensajeExito = `✅ Pago registrado exitosamente: ${pagosCargados.length} comprobante(s) por ${totales.totalPagosEfectivo.toLocaleString()}.`;

      alert(mensajeExito);
      navigate("/supervisor/guias-pendientes");

    } catch (error: any) {
      console.error("❌ Error registrando pago:", error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setCargando(false);
    }
  };

  // Funciones auxiliares para UI
  const getConfianzaColor = (score: number) => {
    if (score >= 85) return "#22c55e";
    if (score >= 70) return "#3b82f6";
    if (score >= 50) return "#f59e0b";
    return "#ef4444";
  };

  return (
    <div className="registrar-pago">
      <h1>🏢 Registrar Pago - Supervisor</h1>
      
      {/* Información del supervisor */}
      <div className="info-supervisor" style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        color: "white",
        padding: "1rem",
        borderRadius: "12px",
        marginBottom: "2rem"
      }}>
        <h3 style={{ margin: "0 0 0.5rem 0" }}>👤 Información del Supervisor</h3>
        <p style={{ margin: 0 }}><strong>Nombre:</strong> {supervisor?.nombre || user?.nombre}</p>
        <p style={{ margin: 0 }}><strong>Email:</strong> {supervisor?.email || user?.email}</p>
      </div>

      {/* Resumen de guías - ADAPTADO PARA SUPERVISOR */}
      <div className="tabla-guias">
        <h2>📦 Guías a Procesar</h2>
        <table>
          <thead>
            <tr>
              <th>Tracking</th>
              <th>Conductor</th>
              <th>Cliente</th>
              <th>Ciudad</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {guias.map((guia) => (
              <tr key={guia.referencia}>
                <td>{guia.tracking || guia.referencia}</td>
                <td>{guia.conductor || "No especificado"}</td>
                <td>{guia.cliente || "No especificado"}</td>
                <td>{guia.ciudad || "No especificado"}</td>
                <td>${guia.valor.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}><strong>Total a Procesar:</strong></td>
              <td><strong>${total.toLocaleString()}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Resumen de Pago */}
      <div className="resumen-total-con-bonos">
        <h3>💳 Resumen de Pago</h3>
        <div className="resumen-desglose">
          <div className="linea-resumen">
            <span>Total Pagos Registrados:</span>
            <span>${totales.totalPagosEfectivo.toLocaleString()}</span>
          </div>
          <hr className="divisor-resumen" />
          <div className="linea-resumen total-final">
            <span>Total a Cubrir:</span>
            <span>${total.toLocaleString()}</span>
          </div>
          {totales.faltante > 0 && (
            <div className="linea-resumen faltante">
              <span className="texto-faltante">Faltante:</span>
              <span className="texto-faltante">${totales.faltante.toLocaleString()}</span>
            </div>
          )}
          {totales.sobrante > 0 && (
            <div className="linea-resumen exito">
              <span className="texto-exito">Sobrante:</span>
              <span className="texto-exito">${totales.sobrante.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Lista de pagos cargados */}
      {pagosCargados.length > 0 && (
        <div className="pagos-cargados">
          <h3>💼 Comprobantes Cargados</h3>
          <table>
            <thead>
              <tr>
                <th>Valor</th>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Entidad</th>
                <th>Referencia</th>
                <th>Comprobante</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {pagosCargados.map((p, idx) => (
                <tr key={idx}>
                  <td>${parseValorMonetario(p.datos.valor).toLocaleString("es-CO")}</td>
                  <td>{p.datos.fecha}</td>
                  <td>{p.datos.hora}</td>
                  <td>{p.datos.entidad}</td>
                  <td>{p.datos.referencia}</td>
                  <td>
                    <a
                      href={URL.createObjectURL(p.archivo)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver
                    </a>
                  </td>
                  <td>
                    <button onClick={() => eliminarPago(p.datos.referencia)}>
                      🗑 Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Botón de registro principal */}
      {puedeProcessarPago() && (
        <div style={{ margin: "2rem 0", textAlign: "center" }}>
          <button
            className="boton-registrar"
            onClick={registrarTodosLosPagos}
            disabled={cargando}
            style={{
              backgroundColor: "#059669",
              color: "white",
              padding: "1rem 2rem",
              fontSize: "1.1rem",
              border: "none",
              borderRadius: "8px",
              cursor: cargando ? "not-allowed" : "pointer",
              opacity: cargando ? 0.6 : 1
            }}
          >
            {cargando ? "Procesando..." : `✅ Registrar Pago Supervisor ($${totales.totalPagosEfectivo.toLocaleString()})`}
          </button>
        </div>
      )}

      {/* Formulario de comprobante */}
      <div className="seccion-comprobante">
        <h3>📄 Comprobante de Pago</h3>
        
        <form className="formulario-pago" onSubmit={(e) => e.preventDefault()}>
          <div className="input-group">
            <label>Comprobante de pago</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              required
            />
          </div>

          {analizando && (
            <div style={{ margin: "1rem 0", color: "#2e7d32", fontWeight: "bold" }}>
              <LoadingSpinner size="small" />
              <span style={{ marginLeft: "0.5rem" }}>
                🤖 Analizando comprobante con IA...
              </span>
            </div>
          )}

          {/* Información de validación IA */}
          {validacionIA && (
            <div className="validacion-ia" style={{
              margin: "1rem 0",
              padding: "1rem",
              border: `2px solid ${getConfianzaColor(validacionIA.score_confianza)}`,
              borderRadius: "8px",
              backgroundColor: "#f8fafc"
            }}>
              <h4 style={{ margin: "0 0 0.5rem 0", color: getConfianzaColor(validacionIA.score_confianza) }}>
                🤖 Validación IA: {validacionIA.score_confianza}% de confianza
              </h4>
              
              {validacionIA.sugerencias && Array.isArray(validacionIA.sugerencias) && validacionIA.sugerencias.length > 0 && (
                <div style={{ marginTop: "0.5rem" }}>
                  <strong style={{ color: "#059669" }}>💡 Sugerencias:</strong>
                  <ul style={{ margin: "0.25rem 0", paddingLeft: "1.5rem", fontSize: "0.85rem" }}>
                    {validacionIA.sugerencias.map((sugerencia: string, idx: number) => (
                      <li key={idx} style={{ color: "#059669" }}>{sugerencia}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Mostrar calidad de imagen */}
          {calidadOCR > 0 && (
            <div style={{ 
              margin: "0.5rem 0", 
              fontSize: "0.9rem",
              color: calidadOCR > 70 ? "#059669" : "#dc2626"
            }}>
              📊 Calidad de imagen: {calidadOCR}%
              {calidadOCR < 70 && " - Considera tomar una foto más clara"}
            </div>
          )}

          <div className="datos-extraidos">
            {[
              ["valor", "Valor del pago", "$ 0.00"],
              ["fecha", "Fecha", ""],
              ["hora", "Hora", ""],
              ["entidad", "Entidad", ""],
              ["referencia", "Referencia", ""],
              ["tipo", "Tipo de pago", ""],
            ].map(([key, label, placeholder]) => (
              <div className="input-group" key={key}>
                <label>{label}</label>
                {key === "tipo" ? (
                  <select
                    value={datosManuales.tipo}
                    onChange={(e) =>
                      setDatosManuales((prev) => ({
                        ...prev,
                        tipo: e.target.value,
                      }))
                    }
                    required
                  >
                    <option value="">Seleccione...</option>
                    <option value="consignacion">Consignación</option>
                    <option value="Nequi">Nequi</option>
                    <option value="Transferencia">Transferencia</option>
                  </select>
                ) : (
                  <input
                    type={
                      key === "fecha" ? "date" : key === "hora" ? "time" : "text"
                    }
                    value={datosManuales[key as keyof DatosPago]}
                    onChange={(e) =>
                      setDatosManuales((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    placeholder={placeholder}
                    required
                  />
                )}
              </div>
            ))}
          </div>

          {/* Componente de validación */}
          {guias.length > 0 && (
            <ValidadorPago
              guiasSeleccionadas={guias}
              valorConsignado={parseValorMonetario(datosManuales.valor)}
              onValidacionChange={setValidacionPago}
            />
          )}

          {/* Botón para agregar pago individual */}
          <button
            type="button"
            className="boton-registrar"
            onClick={agregarPago}
            disabled={!validacionPago?.valido || analizando}
            style={{
              backgroundColor: validacionPago?.valido ? "#3b82f6" : "#6b7280",
              opacity: validacionPago?.valido && !analizando ? 1 : 0.6,
              margin: "1rem 0"
            }}
          >
            {validacionPago?.valido ? '✅ Agregar comprobante' : '❌ Comprobante inválido'}
          </button>
        </form>
      </div>

      {/* Mensaje de estado */}
      {!puedeProcessarPago() && (
        <div className="mensaje-estado" style={{
          margin: "2rem 0",
          padding: "1rem",
          backgroundColor: "#fef3c7",
          border: "1px solid #f59e0b",
          borderRadius: "8px",
          color: "#92400e"
        }}>
          <p style={{ margin: 0 }}>
            📄 <strong>Agregar comprobantes:</strong> Necesitas agregar comprobantes que cubran ${total.toLocaleString()}.
            {totales.totalPagosEfectivo > 0 && (
              <span style={{ display: "block", marginTop: "0.5rem" }}>
                Tienes ${totales.totalPagosEfectivo.toLocaleString()} registrados, faltan ${totales.faltante.toLocaleString()}.
              </span>
            )}
          </p>
        </div>
      )}

      {/* Botones de acción */}
      <div className="acciones" style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '1rem',
        marginTop: '2rem'
      }}>
        <button 
          className="boton-secundario"
          onClick={() => navigate('/supervisor/guias-pendientes')}
          disabled={cargando}
          style={{
            backgroundColor: '#6b7280',
            color: 'white',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            border: 'none',
            cursor: cargando ? 'not-allowed' : 'pointer',
            opacity: cargando ? 0.6 : 1
          }}
        >
          Cancelar
        </button>
      </div>

      {cargando && <LoadingSpinner size="medium" />}
    </div>
  );
}
