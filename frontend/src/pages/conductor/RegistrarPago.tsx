import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import "../../styles/conductor/FormularioPagoConductor.css";
import LoadingSpinner from "../../components/LoadingSpinner";
// Agregar import para el validador si existe
import ValidadorPago from "../../components/ValidadorPago"; // Descomenta si tienes el componente

// Tipos de datos
type GuiaPago = { 
  referencia: string; 
  valor: number; 
  tracking?: string; 
  liquidacion_id?: string; 
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

// 🔥 NUEVO: Tipo para respuesta del OCR mejorado
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

export default function RegistrarPago() {
  const location = useLocation();
  const navigate = useNavigate();

  // 2.2 - Modificar la obtención de datos del location.state
  const { guias, total, bonos }: { 
    guias: GuiaPago[]; 
    total: number; 
    bonos?: { disponible: number; detalles: any[] } 
  } = location.state || {
    guias: [],
    total: 0,
    bonos: { disponible: 0, detalles: [] }
  };

  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [pagosCargados, setPagosCargados] = useState<PagoCompleto[]>([]);
  
  // 🔥 NUEVO: Estado para mostrar información de validación IA
  const [validacionIA, setValidacionIA] = useState<any>(null);
  const [calidadOCR, setCalidadOCR] = useState<number>(0);
  
  const [datosManuales, setDatosManuales] = useState<DatosPago>({
    valor: "",
    fecha: "",
    hora: "",
    tipo: "",
    entidad: "",
    referencia: "",
  });

  // Agregar validación en tiempo real
  const [validacionPago, setValidacionPago] = useState<any>(null);

  // 🔥 NUEVA: Función para convertir fechas
  const convertirFechaAISO = (fechaTexto: string): string => {
    if (!fechaTexto) return "";
    
    try {
      // Si ya está en formato ISO (YYYY-MM-DD), devolverla tal como está
      if (/^\d{4}-\d{2}-\d{2}$/.test(fechaTexto)) {
        return fechaTexto;
      }
      
      // Formato DD/MM/YYYY
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(fechaTexto)) {
        const [dia, mes, año] = fechaTexto.split('/');
        return `${año}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
      }
      
      // Formato DD-MM-YYYY
      if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(fechaTexto)) {
        const [dia, mes, año] = fechaTexto.split('-');
        return `${año}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
      }
      
      // Intentar parsear otras variantes
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

  // 🔥 NUEVA: Función para normalizar hora
  const normalizarHora = (horaTexto: string): string => {
    if (!horaTexto) return "";
    
    try {
      // Si ya está en formato HH:MM, agregamos segundos si falta
      if (/^\d{1,2}:\d{2}$/.test(horaTexto)) {
        return horaTexto; // El input type="time" espera HH:MM
      }
      
      // Si tiene segundos, removerlos para el input
      if (/^\d{1,2}:\d{2}:\d{2}$/.test(horaTexto)) {
        return horaTexto.slice(0, 5);
      }
      
      // Si tiene formato AM/PM, convertir a 24h
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
  if (!hora) return "00:00:00";  // ✅ Agregar segundos
  
  // Si ya tiene formato HH:MM:SS, devolverla tal como está
  if (/^\d{2}:\d{2}:\d{2}$/.test(hora)) {
    return hora;
  }
  
  // Si tiene formato HH:MM, agregar segundos
  if (/^\d{2}:\d{2}$/.test(hora)) {
    return `${hora}:00`;  // ✅ Agregar :00
  }
  
  // Si tiene un solo dígito en horas, agregar cero y segundos
  if (/^\d{1}:\d{2}$/.test(hora)) {
    return `0${hora}:00`;  // ✅ Agregar 0 al inicio y :00 al final
  }
  
  // Fallback
  return `${hora.slice(0, 5)}:00`;  // ✅ Asegurar formato HH:MM:SS
};

  function parseValorMonetario(valor: string): number {
    const limpio = valor
      .replace(/[^0-9.,]/g, "")
      .replace(/\.(?=\d{3,})/g, "")
      .replace(",", ".");
    const num = parseFloat(limpio);
    return isNaN(num) ? 0 : num;
  }

  const totalAcumulado = pagosCargados.reduce((sum, p) => {
    const val = parseValorMonetario(p.datos.valor);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  // 🔥 CORREGIDO: Handle file change con manejo seguro de errores
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
      const response = await fetch("http://localhost:8000/ocr/extraer", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result: OCRResponse = await response.json();

      // 🔥 NUEVO: Manejar la nueva estructura de respuesta
      if (result.error) {
        alert(`❌ Error en OCR: ${result.mensaje || 'Error desconocido'}`);
        return;
      }

      const data = result.datos_extraidos;
      
      if (data && Object.keys(data).length > 0) {
        // 🔥 CORREGIDO: Mapear campos con conversión segura
        const datosLimpios = {
          valor: data.valor || "",
          fecha: convertirFechaAISO(data.fecha || ""),
          hora: normalizarHora(data.hora || ""),
          tipo: data.tipo || data.entidad || "",
          entidad: data.entidad || "",
          referencia: data.referencia || "",
        };

        setDatosManuales(datosLimpios);

        // 🔥 CORREGIDO: Validación IA con verificación segura
        if (result.validacion_ia) {
          setValidacionIA(result.validacion_ia);
          
          const { score_confianza, errores_detectados } = result.validacion_ia;
          
          // 🔥 FIX: Verificación segura del array
          if (errores_detectados && Array.isArray(errores_detectados) && errores_detectados.length > 0) {
            console.warn("⚠️ Errores detectados:", errores_detectados);
            alert(`⚠️ OCR completado con advertencias:\n${errores_detectados.join('\n')}\n\nPor favor verifica los datos extraídos.`);
          } else if (score_confianza < 70) {
            console.warn(`⚠️ Confianza baja: ${score_confianza}%`);
            alert(`⚠️ Confianza baja (${score_confianza}%). Por favor verifica los datos.`);
          } else {
            // Mostrar éxito solo si se extrajeron datos útiles
            const camposExtraidos = Object.values(datosLimpios).filter(v => v && v.trim()).length;
            if (camposExtraidos >= 3) {
            }
          }
        }

        // Calidad de imagen
        if (result.estadisticas?.calidad_imagen) {
          setCalidadOCR(result.estadisticas.calidad_imagen);
        }

      } else {
        console.warn("⚠️ No se extrajeron datos válidos del comprobante");
        alert("⚠️ No se pudieron extraer datos del comprobante.\n\nPosibles causas:\n- Imagen poco clara\n- Formato no reconocido\n- Texto no legible\n\nPuedes ingresar los datos manualmente.");
      }

    } catch (err: any) {
      console.error("❌ Error al extraer datos:", err);
      alert(`❌ Error al procesar el comprobante: ${err.message}\n\nPuedes ingresar los datos manualmente.`);
    } finally {
      setAnalizando(false);
    }
  };

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
      alert(
        "Este comprobante ya fue cargado (referencia o fecha/hora duplicada)."
      );
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

  const eliminarPago = (referencia: string) => {
    setPagosCargados((prev) =>
      prev.filter((p) => p.datos.referencia !== referencia)
    );
  };

  // 🔧 FUNCIÓN CORREGIDA: registrarTodosLosPagos
  const registrarTodosLosPagos = async () => {
    const totales = calcularTotalConBonos();

    if (totales.faltante > 0) {
      alert(`Faltan $${totales.faltante.toLocaleString()} para cubrir el total de las guías.`);
      return;
    }

    setCargando(true);

    try {
      // Registrar bonos utilizados primero (si los hay)
      if (usarBonos && bonosSeleccionados.length > 0) {
        const bonosData = {
          bonos_utilizados: bonosSeleccionados.map(bonoId => {
            const bono = bonos?.detalles.find(b => b.id === bonoId);
            return {
              bono_id: bonoId,
              valor_utilizado: bono?.saldo_disponible || 0
            };
          }),
          total_bonos: montoBonosUsar,
          guias: guias.map(g => ({
            referencia: g.referencia,
            tracking: g.tracking || g.referencia,
            liquidacion_id: g.liquidacion_id
          }))
        };

        const responseBonos = await fetch("http://localhost:8000/pagos/aplicar-bonos", {
          method: "POST",
          headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(bonosData)
        });

        if (!responseBonos.ok) {
          const errorBonos = await responseBonos.json();
          throw new Error(`Error aplicando bonos: ${errorBonos.detail}`);
        }
      }

      // Luego registrar pagos en efectivo/transferencia (código existente)
      for (const p of pagosCargados) {
        const formData = new FormData();
        const usuario = JSON.parse(localStorage.getItem("user")!);
        const correo = usuario.email;

        const guiasConCliente = guias.map((g) => {
          const guiaObj: any = {
            referencia: String(g.referencia).trim(),
            valor: Number(g.valor),
            cliente: "por_definir",
          };

          if (g.liquidacion_id) {
            guiaObj.liquidacion_id = g.liquidacion_id;
          }

          if (g.tracking) {
            const trackingStr = String(g.tracking).trim();
            if (trackingStr && 
                trackingStr.toLowerCase() !== "null" && 
                trackingStr.toLowerCase() !== "undefined" &&
                trackingStr !== "") {
              guiaObj.tracking = trackingStr;
            } else {
              guiaObj.tracking = g.referencia;
            }
          } else {
            guiaObj.tracking = g.referencia;
          }

          return guiaObj;
        });

        formData.append("correo", correo);
        formData.append("valor_pago_str", parseValorMonetario(p.datos.valor).toString());
        formData.append("fecha_pago", p.datos.fecha);
        formData.append("hora_pago", normalizarHoraParaEnvio(p.datos.hora));
        formData.append("tipo", p.datos.tipo);
        formData.append("entidad", p.datos.entidad);
        formData.append("referencia", p.datos.referencia);
        formData.append("guias", JSON.stringify(guiasConCliente));
        formData.append("comprobante", p.archivo);

        // Agregar información de bonos si se usaron
        if (usarBonos && montoBonosUsar > 0) {
          formData.append("bonos_aplicados", montoBonosUsar.toString());
        }

        const response = await fetch("http://localhost:8000/pagos/registrar-conductor", {
          method: "POST",
          body: formData,
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.detail || "Error al registrar pago");
        }
      }

      alert("✅ Pagos registrados correctamente" + 
            (usarBonos && montoBonosUsar > 0 ? ` (incluye $${montoBonosUsar.toLocaleString()} en bonos)` : "") + ".");
      navigate("/conductor/pagos");

    } catch (error: any) {
      console.error("Error registrando pagos:", error);
      alert("❌ Error: " + error.message);
    } finally {
      setCargando(false);
    }
  };

  // 🔥 NUEVO: Función para obtener el color del indicador de confianza
  const getConfianzaColor = (score: number) => {
    if (score >= 85) return "#22c55e"; // Verde
    if (score >= 70) return "#3b82f6"; // Azul
    if (score >= 50) return "#f59e0b"; // Amarillo
    return "#ef4444"; // Rojo
  };

  // 2.3 - Agregar estados para manejo de bonos
  const [usarBonos, setUsarBonos] = useState(false);
  const [montoBonosUsar, setMontoBonosUsar] = useState(0);
  const [bonosSeleccionados, setBonosSeleccionados] = useState<string[]>([]);

  // 2.4 - Función para calcular total después de aplicar bonos
  const calcularTotalConBonos = () => {
    const totalPagos = totalAcumulado;
    const totalBonos = montoBonosUsar;
    const totalFinal = totalPagos + totalBonos;
    return {
      totalPagos,
      totalBonos,
      totalFinal,
      faltante: Math.max(0, total - totalFinal)
    };
  };

  // 2.5 - Función para manejar selección de bonos
  const toggleBono = (bonoId: string, valorBono: number) => {
    setBonosSeleccionados(prev => {
      let nuevosSeleccionados;
      if (prev.includes(bonoId)) {
        nuevosSeleccionados = prev.filter(id => id !== bonoId);
        setMontoBonosUsar(prevMonto => prevMonto - valorBono);
      } else {
        nuevosSeleccionados = [...prev, bonoId];
        setMontoBonosUsar(prevMonto => prevMonto + valorBono);
      }
      return nuevosSeleccionados;
    });
  };

  return (
    <div className="registrar-pago">
      <h1>Registrar Pago</h1>

      <div className="tabla-guias">
        <h2>Guías seleccionadas</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Referencia</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {guias.map((g: GuiaPago, idx: number) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{g.referencia}</td>
                <td>${g.valor.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="resumen-pago">
          <div className="linea">
            <span>Total guías:</span>
            <strong>${total.toLocaleString()}</strong>
          </div>
        </div>
      </div>

      {/* 2.6 - Componente para mostrar y usar bonos */}
      {bonos && bonos.disponible > 0 && (
        <div className="seccion-bonos">
          <h3>💰 Bonos Disponibles</h3>
          <div className="bonos-disponibles-pago">
            <div className="bonos-header-pago">
              <span>Total bonos disponibles: ${bonos.disponible.toLocaleString()}</span>
              <label className="usar-bonos-toggle">
                <input
                  type="checkbox"
                  checked={usarBonos}
                  onChange={(e) => {
                    setUsarBonos(e.target.checked);
                    if (!e.target.checked) {
                      setBonosSeleccionados([]);
                      setMontoBonosUsar(0);
                    }
                  }}
                />
                Usar bonos para este pago
              </label>
            </div>
            {usarBonos && (
              <div className="bonos-seleccion">
                <h4>Selecciona los bonos a usar:</h4>
                {bonos.detalles.map((bono: any) => (
                  <div key={bono.id} className="bono-seleccionable">
                    <label className="bono-checkbox">
                      <input
                        type="checkbox"
                        checked={bonosSeleccionados.includes(bono.id)}
                        onChange={() => toggleBono(bono.id, bono.saldo_disponible)}
                      />
                      <div className="bono-info-seleccion">
                        <span className="bono-tipo-sel">{bono.tipo}</span>
                        <span className="bono-valor-sel">${bono.saldo_disponible.toLocaleString()}</span>
                        <small className="bono-desc-sel">{bono.descripcion}</small>
                      </div>
                    </label>
                  </div>
                ))}
                {bonosSeleccionados.length > 0 && (
                  <div className="bonos-seleccionados-resumen">
                    <strong>Bonos seleccionados: ${montoBonosUsar.toLocaleString()}</strong>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {pagosCargados.length > 0 && (
        <div className="pagos-cargados">
          <h3>Pagos cargados</h3>
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
                  <td>
                    $
                    {parseValorMonetario(p.datos.valor).toLocaleString("es-CO")}
                  </td>
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

          <div className="resumen-acumulado">
            <p>
              <strong>Total acumulado:</strong> $
              {totalAcumulado.toLocaleString("es-CO")}
            </p>
            {totalAcumulado < total ? (
              <p style={{ color: "crimson" }}>
                Faltan ${(total - totalAcumulado).toLocaleString("es-CO")}
              </p>
            ) : (
              <p style={{ color: "green" }}>
                ✅ Listo. Excedente: $
                {(totalAcumulado - total).toLocaleString("es-CO")}
              </p>
            )}
          </div>

          {totalAcumulado >= total && (
            <button
              className="boton-registrar"
              onClick={registrarTodosLosPagos}
              disabled={cargando}
            >
              ✅ Registrar todos los pagos
            </button>
          )}
        </div>
      )}

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
          <div
            style={{ margin: "1rem 0", color: "#2e7d32", fontWeight: "bold" }}
          >
            <LoadingSpinner logoSize="small" />
            <span style={{ marginLeft: "0.5rem" }}>
              🤖 Analizando comprobante con IA...
            </span>
          </div>
        )}

        {/* 🔥 NUEVO: Mostrar información de validación IA */}
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
            <p style={{ margin: "0.25rem 0", fontSize: "0.9rem" }}>
              <strong>Estado:</strong> {validacionIA.estado}
            </p>
            {validacionIA.errores_detectados && Array.isArray(validacionIA.errores_detectados) && validacionIA.errores_detectados.length > 0 && (
              <div style={{ marginTop: "0.5rem" }}>
                <strong style={{ color: "#dc2626" }}>⚠️ Errores detectados:</strong>
                <ul style={{ margin: "0.25rem 0", paddingLeft: "1.5rem", fontSize: "0.85rem" }}>
                  {validacionIA.errores_detectados.map((error: string, idx: number) => (
                    <li key={idx} style={{ color: "#dc2626" }}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
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

        {/* 🔥 NUEVO: Mostrar calidad de imagen */}
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

        {/* Mostrar botón solo si es válido */}
        <button
          type="button"
          className="boton-registrar"
          onClick={agregarPago}
          disabled={!validacionPago?.valido || analizando}
        >
          {validacionPago?.valido ? '✅ Agregar pago válido' : '❌ Pago inválido'}
        </button>
      </form>

      {cargando && <LoadingSpinner logoSize="medium" />}
    </div>
  );
}

function getToken() {
  throw new Error("Function not implemented.");
}
