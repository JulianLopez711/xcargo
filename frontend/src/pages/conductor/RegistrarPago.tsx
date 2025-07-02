import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import "../../styles/conductor/FormularioPagoConductor.css";
import LoadingSpinner from "../../components/LoadingSpinner";
import ValidadorPago from "../../components/ValidadorPago";

// Tipos de datos
type Bono = {
  id: string;
  tipo_bono: 'SOBRANTE_PAGO';
  valor_bono: number;
  saldo_disponible: number;
  referencia_pago_origen: string;
  fecha_generacion: string;
  estado_bono: 'ACTIVO' | 'AGOTADO' | 'VENCIDO' | 'CANCELADO';
  descripcion?: string;
};

type BonosState = {
  disponible: number;
  detalles: Bono[];
};

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

// 🔥 NUEVO: Tipo de modo de pago
type ModoPago = 'comprobante' | 'bono' | 'mixto';

export default function RegistrarPago() {
  const location = useLocation();
  const navigate = useNavigate();

  const { guias, total, bonos }: { 
    guias: GuiaPago[]; 
    total: number; 
    bonos?: { disponible: number; detalles: any[] } 
  } = location.state || {
    guias: [],
    total: 0,
    bonos: { disponible: 0, detalles: [] }
  };

  // 🔥 NUEVO: Estado para modo de pago seleccionado
  const [modoPago, setModoPago] = useState<ModoPago>('comprobante');
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
  });

  const [validacionPago, setValidacionPago] = useState<any>(null);

  // Estados para manejo de bonos
  const [bonosDisponibles, setBonosDisponibles] = useState<Bono[]>([]);
  const [saldoBonosTotal, setSaldoBonosTotal] = useState<number>(0);
  const [usarBonos, setUsarBonos] = useState<boolean>(false);
  const [bonoSeleccionado, setBonoSeleccionado] = useState<string | null>(null);

  // Calcular el monto de bonos a usar basado en el bono seleccionado
  const montoBonosUsar = usarBonos && bonoSeleccionado 
    ? bonosDisponibles.find(b => b.id === bonoSeleccionado)?.saldo_disponible || 0
    : 0;

  // Función unificada para calcular totales
  const calcularTotales = () => {
    const totalPagosEfectivo = pagosCargados.reduce((sum, p) => {
      const val = parseValorMonetario(p.datos.valor);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
    
    const totalBonos = usarBonos && bonoSeleccionado 
      ? bonosDisponibles.find(b => b.id === bonoSeleccionado)?.saldo_disponible || 0
      : 0;

    const totalCubierto = totalPagosEfectivo + totalBonos;
    const faltante = Math.max(0, total - totalCubierto);
    const sobrante = Math.max(0, totalCubierto - total);
    
    return {
      totalPagosEfectivo,
      totalBonos,
      totalCubierto,
      faltante,
      sobrante
    };
  };

  // Eliminar calcularTotalConBonos ya que está duplicado
  const totales = calcularTotales();

  // 🔥 NUEVA FUNCIÓN: Manejar cambio de modo de pago
  const handleModoPagoChange = (nuevoModo: ModoPago) => {
    setModoPago(nuevoModo);
    
    // Limpiar estados según el modo seleccionado
    if (nuevoModo === 'comprobante') {
      setUsarBonos(false);
      setBonoSeleccionado(null);
    } else if (nuevoModo === 'bono') {
      setUsarBonos(true);
      // Limpiar comprobantes si solo se van a usar bonos
      setPagosCargados([]);
      setArchivo(null);
      setDatosManuales({
        valor: "",
        fecha: "",
        hora: "",
        tipo: "",
        entidad: "",
        referencia: "",
      });
    } else if (nuevoModo === 'mixto') {
      setUsarBonos(true);
      // Mantener ambos formularios disponibles
    }
  };

  // 🔥 NUEVA FUNCIÓN: Validar si se puede procesar el pago
  const puedeProcessarPago = () => {
    const totales = calcularTotales();
    switch (modoPago) {
      case 'comprobante':
        return pagosCargados.length > 0 && totales.totalPagosEfectivo >= total;
      case 'bono':
        return usarBonos && totales.totalBonos >= total;
      case 'mixto':
        return (pagosCargados.length > 0 || (usarBonos && totales.totalBonos > 0)) && totales.totalCubierto >= total;
      default:
        return false;
    }
  };

  // Funciones auxiliares (mantener las existentes)
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

  // Mantener las funciones existentes para manejo de archivos y pagos
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
      const response = await fetch("https://api.x-cargo.co/ocr/extraer", {
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
  };  // 🔥 FUNCIÓN MEJORADA: Validación robusta de duplicados
  const validarDuplicado = (nuevosDatos: DatosPago): { esDuplicado: boolean; mensaje: string } => {
    const referencia = nuevosDatos.referencia.trim();
    const valor = parseValorMonetario(nuevosDatos.valor);
    const fecha = nuevosDatos.fecha.trim();
    
    // Buscar pagos con la misma referencia
    const pagosConMismaReferencia = pagosCargados.filter(
      (p) => p.datos.referencia.trim() === referencia
    );

    if (pagosConMismaReferencia.length === 0) {
      // No hay pagos con esta referencia, está bien
      return { esDuplicado: false, mensaje: "" };
    }

    // Si hay pagos con la misma referencia, validar valor + fecha para detectar duplicados exactos
    const duplicadoExacto = pagosConMismaReferencia.find((p) => {
      const valorExistente = parseValorMonetario(p.datos.valor);
      const fechaExistente = p.datos.fecha.trim();
      
      return valorExistente === valor && fechaExistente === fecha;
    });

    if (duplicadoExacto) {
      return { 
        esDuplicado: true, 
        mensaje: `❌ DUPLICADO DETECTADO\n\nYa existe un pago con exactamente los mismos datos:\n• Referencia: ${referencia}\n• Valor: $${valor.toLocaleString()}\n• Fecha: ${fecha}\n\nEste sí es un duplicado real y no se puede agregar.` 
      };
    }

    // Si tiene la misma referencia pero diferente valor o fecha, es posible que sea válido
    // Mostrar los detalles y pedir confirmación
    const pagoExistente = pagosConMismaReferencia[0];
    const valorExistente = parseValorMonetario(pagoExistente.datos.valor);
    const fechaExistente = pagoExistente.datos.fecha.trim();
    
    const continuar = window.confirm(
      `⚠️ ATENCIÓN: Referencia repetida pero con datos diferentes\n\n` +
      `PAGO YA REGISTRADO:\n` +
      `• Referencia: ${referencia}\n` +
      `• Valor: $${valorExistente.toLocaleString()}\n` +
      `• Fecha: ${fechaExistente}\n\n` +
      `PAGO QUE INTENTAS AGREGAR:\n` +
      `• Referencia: ${referencia}\n` +
      `• Valor: $${valor.toLocaleString()}\n` +
      `• Fecha: ${fecha}\n\n` +
      `¿Son realmente pagos diferentes con la misma referencia?\n` +
      `(Por ejemplo: abonos parciales, pagos fraccionados, etc.)\n\n` +
      `✅ CONTINUAR si son pagos válidos diferentes\n` +
      `❌ CANCELAR si es un error`
    );

    return { 
      esDuplicado: !continuar, 
      mensaje: continuar ? "" : "⚠️ Operación cancelada. Revisa los datos antes de intentar nuevamente." 
    };
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

    // 🔥 NUEVA VALIDACIÓN: Usar la función mejorada de duplicados
    const validacion = validarDuplicado(datosManuales);
    if (validacion.esDuplicado) {
      alert(validacion.mensaje);
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

  // Función de registro de pagos (mantener la existente)
  const registrarTodosLosPagos = async () => {
    const totales = calcularTotales();

    if (totales.faltante > 0) {
      if (usarBonos && bonoSeleccionado && bonoSeleccionado.length > 0) {
        const usar = confirm(`Faltan $${totales.faltante.toLocaleString()}. ¿Deseas aplicar tus bonos disponibles?`);
        if (usar) {
          const bonosData = {
            bonos_utilizados: Array.isArray(bonoSeleccionado) ? bonoSeleccionado.map((bonoId: any) => {
              const bono = bonos?.detalles.find(b => b.id === bonoId);
              return {
                bono_id: bonoId,
                valor_utilizado: bono?.saldo_disponible || 0
              };
            }) : [],
            total_bonos: montoBonosUsar,
            guias: guias.map(g => ({
              referencia: g.referencia,
              tracking: g.tracking || g.referencia,
              liquidacion_id: g.liquidacion_id
            }))
          };

          const responseBonos = await fetch("https://api.x-cargo.co/pagos/aplicar-bonos", {
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

          const resultBonos = await responseBonos.json();
          console.log("✅ Bonos aplicados exitosamente:", resultBonos.referencia_pago);
        } else {
          return;
        }
      } else {
        alert(`Faltan ${totales.faltante.toLocaleString()} para cubrir el total de las guías.`);
        return;
      }
    }

    setCargando(true);

    try {
      let referenciaBonos = null;
      if (usarBonos && bonoSeleccionado && bonoSeleccionado.length > 0) {
        console.log("🎯 Aplicando bonos...");
        
        const bonosData = {
          bonos_utilizados: Array.isArray(bonoSeleccionado) ? bonoSeleccionado.map((bonoId: string) => {
            const bono = bonos?.detalles.find(b => b.id === bonoId);
            return {
              bono_id: bonoId,
              valor_utilizado: bono?.saldo_disponible || 0
            };
          }) : [],
          total_bonos: montoBonosUsar,
          guias: guias.map(g => ({
            referencia: g.referencia,
            tracking: g.tracking || g.referencia,
            liquidacion_id: g.liquidacion_id
          }))
        };

        const responseBonos = await fetch("https://api.x-cargo.co/pagos/aplicar-bonos", {
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

        const resultBonos = await responseBonos.json();
        referenciaBonos = resultBonos.referencia_pago;
        console.log("✅ Bonos aplicados exitosamente:", referenciaBonos);
      }

      if (pagosCargados.length > 0) {
        console.log("💳 Registrando pagos en efectivo/transferencia...");
        
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

            const trackingStr = g.tracking ? String(g.tracking).trim() : "";
            if (trackingStr && 
                trackingStr.toLowerCase() !== "null" && 
                trackingStr.toLowerCase() !== "undefined" &&
                trackingStr !== "") {
              guiaObj.tracking = trackingStr;
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

          if (referenciaBonos && montoBonosUsar > 0) {
            formData.append("bonos_aplicados", montoBonosUsar.toString());
            formData.append("referencia_bonos", referenciaBonos);
          }

          const endpoint = (referenciaBonos && montoBonosUsar > 0) 
            ? "https://api.x-cargo.co/pagos/registrar-conductor-con-bonos"
            : "https://api.x-cargo.co/pagos/registrar-conductor";

          const response = await fetch(endpoint, {
            method: "POST",
            body: formData,
          });

          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.detail || "Error al registrar pago");
          }

          console.log("✅ Pago registrado:", result);
        }
      }

      if (pagosCargados.length === 0 && usarBonos && montoBonosUsar > 0) {
        console.log("🎯 Solo bonos aplicados - registro completado");
      }

      const mensajeExito = (() => {
        if (pagosCargados.length > 0 && usarBonos && montoBonosUsar > 0) {
          return `✅ Pago híbrido registrado: ${pagosCargados.length} comprobante(s) por ${totales.totalPagosEfectivo.toLocaleString()} + bonos por ${montoBonosUsar.toLocaleString()}.`;
        } else if (pagosCargados.length > 0) {
          return `✅ ${pagosCargados.length} pago(s) en efectivo registrado(s) por ${totales.totalPagosEfectivo.toLocaleString()}.`;
        } else if (usarBonos && montoBonosUsar > 0) {
          return `✅ Pago con bonos registrado: ${montoBonosUsar.toLocaleString()}.`;
        } else {
          return "✅ Procesamiento completado.";
        }
      })();

      alert(mensajeExito);
      navigate("/conductor/pagos");

    } catch (error: any) {
      console.error("❌ Error registrando pagos:", error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setCargando(false);
    }
  };

  // Mantener las funciones auxiliares existentes
  const getConfianzaColor = (score: number) => {
    if (score >= 85) return "#22c55e";
    if (score >= 70) return "#3b82f6";
    if (score >= 50) return "#f59e0b";
    return "#ef4444";
  };

  const toggleBono = (bonoId: string) => {
    const bonoAUsar = bonosDisponibles.find(b => b.id === bonoId);
    if (!bonoAUsar) return;

    if (bonoSeleccionado === bonoId) {
      setBonoSeleccionado(null);
      setUsarBonos(false);
    } else {
      setBonoSeleccionado(bonoId);
      setUsarBonos(true);
    }
  };

  // Función para manejar la selección de bonos
  const handleSeleccionBono = (bonoId: string) => {
    if (bonoSeleccionado === bonoId) {
      setBonoSeleccionado(null);
      setUsarBonos(false);
    } else {
      const bonoAUsar = bonosDisponibles.find(b => b.id === bonoId);
      if (bonoAUsar) {
        setBonoSeleccionado(bonoId);
        setUsarBonos(true);
      }
    }
  };

  // Función para registrar un pago con manejo de bonos
  const registrarPago = async () => {
    if (cargando) return;
    setCargando(true);

    try {
      const totales = calcularTotales();

      // Si hay faltante y no se están usando bonos disponibles
      if (totales.faltante > 0 && !usarBonos) {
        const usarBonosDisponibles = window.confirm(
          `Falta cubrir $${totales.faltante.toLocaleString()}. ` +
          `Tienes $${saldoBonosTotal.toLocaleString()} en bonos disponibles. ` +
          `¿Deseas usarlos?`
        );
        if (usarBonosDisponibles) {
          setUsarBonos(true);
          return;
        }
      }

      // Si el pago es insuficiente
      if (totales.faltante > 0) {
        alert(`El monto total pagado ($${totales.totalCubierto.toLocaleString()}) ` +
              `es menor al valor requerido ($${total.toLocaleString()})`);
        return;
      }

      // Preparar datos del pago
      const formData = new FormData();
      
      // Agregar archivos de comprobantes
      pagosCargados.forEach((pago, index) => {
        formData.append(`comprobantes`, pago.archivo);
        formData.append(`datos_pago_${index}`, JSON.stringify(pago.datos));
      });

      // Agregar información de bonos si se están usando
      if (usarBonos && bonoSeleccionado) {
        formData.append('bono_usado', bonoSeleccionado);
        const bonoAplicado = bonosDisponibles.find(b => b.id === bonoSeleccionado);
        if (bonoAplicado) {
          formData.append('valor_bono_usado', bonoAplicado.saldo_disponible.toString());
        }
      }

      // Agregar guías y totales
      formData.append('guias', JSON.stringify(guias));
      formData.append('total_efectivo', totales.totalPagosEfectivo.toString());
      formData.append('total_bonos', totales.totalBonos.toString());
      formData.append('sobrante', totales.sobrante.toString());

      // Enviar al backend
      const response = await fetch('https://api.x-cargo.co/pagos/registrar-conductor', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem("token") || ""}`
        }
      });

      if (!response.ok) {
        throw new Error('Error registrando el pago');
      }

      const result = await response.json();

      // Si se generó un nuevo bono por sobrante
      if (result.bono_generado) {
        alert(`¡Pago registrado exitosamente!\n\n` +
              `Se ha generado un bono por $${result.bono_generado.valor_bono.toLocaleString()} ` +
              `que podrás usar en tus próximos pagos.`);
      } else {
        alert('¡Pago registrado exitosamente!');
      }

      navigate('/conductor/pagos');

    } catch (error: any) {
      console.error('❌ Error registrando pago:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setCargando(false);
    }
  };

  // Cargar bonos disponibles al inicio
  useEffect(() => {
    const cargarBonos = async () => {
      try {
        const response = await fetch('https://api.x-cargo.co/pagos/bonos-disponibles', {
          headers: {
            'Authorization': `Bearer ${getToken()}`
          }
        });
        
        if (!response.ok) throw new Error('Error cargando bonos');
        
        const data = await response.json();
        setBonosDisponibles(data.bonos || []);
        setSaldoBonosTotal(data.total_disponible || 0);
      } catch (error) {
        console.error('Error cargando bonos:', error);
      }
    };

    cargarBonos();
  }, []);

  return (
    <div className="registrar-pago">
      <h1>Registrar Pago</h1>      {/* Resumen de guías */}
      <div className="tabla-guias">
        <h2>Guías a Pagar</h2>
        <table>
          <thead>
            <tr>
              <th>Referencia</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {guias.map((guia) => (
              <tr key={guia.referencia}>
                <td>{guia.referencia}</td>
                <td>${guia.valor.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total a Pagar:</strong></td>
              <td><strong>${total.toLocaleString()}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>      {/* Sección de Bonos Disponibles */}
      {saldoBonosTotal > 0 && (
        <div className="seccion-bonos">
          <h3>💰 Bonos Disponibles</h3>
          <div className="bonos-disponibles-pago">
            <div className="bonos-header-pago">
              <span>Saldo total en bonos: ${saldoBonosTotal.toLocaleString()}</span>
            </div>
            
            <div className="bonos-lista">
              {bonosDisponibles.map((bono) => (
                <div 
                  key={bono.id} 
                  className={`bono-checkbox ${bonoSeleccionado === bono.id ? 'seleccionado' : ''}`}
                  onClick={() => handleSeleccionBono(bono.id)}
                >
                  <input
                    type="radio"
                    name="bonoSeleccionado"
                    checked={bonoSeleccionado === bono.id}
                    onChange={() => handleSeleccionBono(bono.id)}
                  />
                  <div className="bono-info-seleccion">
                    <div className="bono-tipo-sel">
                      {bono.tipo_bono}
                    </div>
                    <div className="bono-valor-sel">
                      ${bono.saldo_disponible.toLocaleString()}
                    </div>
                    <div className="bono-desc-sel">
                      Generado: {new Date(bono.fecha_generacion).toLocaleDateString()}
                      {bono.descripcion && <span> - {bono.descripcion}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {bonoSeleccionado && (
              <div className="bonos-seleccionados-resumen">
                <strong>Bono Seleccionado: ${montoBonosUsar.toLocaleString()}</strong>
                {montoBonosUsar >= total ? (
                  <div style={{ color: '#059669', marginTop: '0.5rem' }}>
                    ✅ Cubre el total requerido
                  </div>
                ) : (
                  <div style={{ color: '#dc2626', marginTop: '0.5rem' }}>
                    ⚠️ Falta ${(total - montoBonosUsar).toLocaleString()}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}      {/* Resumen de Pago */}
      <div className="resumen-total-con-bonos">
        <h3>💳 Resumen de Pago</h3>
        {(() => {
          const totales = calcularTotales();
          return (
            <div className="resumen-desglose">
              <div className="linea-resumen">
                <span>Total Pagos en Efectivo:</span>
                <span>${totales.totalPagosEfectivo.toLocaleString()}</span>
              </div>
              {totales.totalBonos > 0 && (
                <div className="linea-resumen bonos-aplicados">
                  <span className="texto-bono">Total Bonos Aplicados:</span>
                  <span className="texto-bono">${totales.totalBonos.toLocaleString()}</span>
                </div>
              )}
              <hr className="divisor-resumen" />
              <div className="linea-resumen total-final">
                <span>Total Cubierto:</span>
                <span>${totales.totalCubierto.toLocaleString()}</span>
              </div>
              {totales.faltante > 0 && (
                <div className="linea-resumen faltante">
                  <span className="texto-faltante">Faltante:</span>
                  <span className="texto-faltante">${totales.faltante.toLocaleString()}</span>
                </div>
              )}
              {totales.sobrante > 0 && (
                <div className="linea-resumen exito">
                  <span className="texto-exito">Sobrante (se convertirá en bono):</span>
                  <span className="texto-exito">${totales.sobrante.toLocaleString()}</span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* 🔥 NUEVO: Selector de modo de pago */}
      <div className="modo-pago-selector" style={{ 
        margin: "2rem 0", 
        padding: "1.5rem", 
        backgroundColor: "#f8fafc", 
        borderRadius: "12px",
        border: "2px solid #e5e7eb"
      }}>
        <h3 style={{ margin: "0 0 1rem 0", color: "#1f2937" }}>💳 Selecciona el modo de pago</h3>
        
        <div className="opciones-pago" style={{ 
          display: "flex", 
          gap: "1rem", 
          flexWrap: "wrap",
          marginBottom: "1rem"
        }}>
          <label className="opcion-pago" style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "0.5rem",
            padding: "0.75rem 1rem",
            backgroundColor: modoPago === 'comprobante' ? "#3b82f6" : "#ffffff",
            color: modoPago === 'comprobante' ? "#ffffff" : "#374151",
            border: "2px solid #d1d5db",
            borderRadius: "8px",
            cursor: "pointer",
            transition: "all 0.2s ease",
            minWidth: "180px",
            justifyContent: "center"
          }}>
            <input
              type="radio"
              name="modoPago"
              value="comprobante"
              checked={modoPago === 'comprobante'}
              onChange={() => handleModoPagoChange('comprobante')}
              style={{ display: "none" }}
            />
            <span>📄 Solo Comprobante</span>
          </label>

          {bonos && bonos.disponible >= 0 && (
            <>
              <label className="opcion-pago" style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "0.5rem",
                padding: "0.75rem 1rem",
                backgroundColor: modoPago === 'bono' ? "#059669" : "#ffffff",
                color: modoPago === 'bono' ? "#ffffff" : "#374151",
                border: "2px solid #d1d5db",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                minWidth: "180px",
                justifyContent: "center"
              }}>
                <input
                  type="radio"
                  name="modoPago"
                  value="bono"
                  checked={modoPago === 'bono'}
                  onChange={() => handleModoPagoChange('bono')}
                  style={{ display: "none" }}
                />
                <span>💰 Solo Bonos</span>
              </label>

              <label className="opcion-pago" style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "0.5rem",
                padding: "0.75rem 1rem",
                backgroundColor: modoPago === 'mixto' ? "#7c3aed" : "#ffffff",
                color: modoPago === 'mixto' ? "#ffffff" : "#374151",
                border: "2px solid #d1d5db",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                minWidth: "180px",
                justifyContent: "center"
              }}>
                <input
                  type="radio"
                  name="modoPago"
                  value="mixto"
                  checked={modoPago === 'mixto'}
                  onChange={() => handleModoPagoChange('mixto')}
                  style={{ display: "none" }}
                />
                <span>🔄 Mixto (Bono + Comprobante)</span>
              </label>
            </>
          )}
        </div>

        {/* Descripción del modo seleccionado */}
        <div className="descripcion-modo" style={{ 
          padding: "1rem", 
          backgroundColor: "#ffffff", 
          borderRadius: "8px",
          fontSize: "0.9rem",
          color: "#6b7280"
        }}>
          {modoPago === 'comprobante' && (
            <p style={{ margin: 0 }}>
              📄 <strong>Solo Comprobante:</strong> Registra el pago completo con comprobantes de transferencia, consignación o Nequi.
            </p>
          )}
          {modoPago === 'bono' && (
            <p style={{ margin: 0 }}>
              💰 <strong>Solo Bonos:</strong> Utiliza únicamente tus bonos disponibles para cubrir el total de las guías.
            </p>
          )}
          {modoPago === 'mixto' && (
            <p style={{ margin: 0 }}>
              🔄 <strong>Pago Mixto:</strong> Combina bonos con comprobantes para cubrir el total. Ideal cuando tus bonos no cubren todo el monto.
            </p>
          )}
        </div>
      </div>

      {/* 🔥 SECCIÓN DE BONOS - Solo mostrar según el modo */}
      {(modoPago === 'bono' || modoPago === 'mixto') && bonos && bonos.disponible > 0 && (
        <div className="seccion-bonos">
          <h3>💰 Bonos Disponibles</h3>
          <div className="bonos-disponibles-pago">
            <div className="bonos-header-pago">
              <span>Total bonos disponibles: ${bonos.disponible.toLocaleString()}</span>
              {modoPago === 'bono' && (
                <div style={{ fontSize: "0.9rem", color: "#059669", marginTop: "0.5rem" }}>
                  ✅ Modo solo bonos activado
                </div>
              )}
            </div>
            
            <div className="bonos-seleccion">
              <h4>Selecciona los bonos a usar:</h4>
              {bonos.detalles.map((bono: any) => (
                <div key={bono.id} className="bono-seleccionable">
                  <label className="bono-checkbox">
                    <input
                      type="checkbox"
                      checked={bonoSeleccionado ? bonoSeleccionado.includes(bono.id) : false}
                      onChange={() => toggleBono(bono.id)}
                    />
                    <div className="bono-info-seleccion">
                      <span className="bono-tipo-sel">{bono.tipo}</span>
                      <span className="bono-valor-sel">${bono.saldo_disponible.toLocaleString()}</span>
                      <small className="bono-desc-sel">{bono.descripcion}</small>
                    </div>
                  </label>
                </div>
              ))}
              
              {bonoSeleccionado && bonoSeleccionado.length > 0 && (
                <div className="bonos-seleccionados-resumen">
                  <strong>Bonos seleccionados: ${montoBonosUsar.toLocaleString()}</strong>
                  {modoPago === 'bono' && montoBonosUsar < total && (
                    <div style={{ color: "#dc2626", fontSize: "0.9rem", marginTop: "0.5rem" }}>
                      ⚠️ Faltan ${(total - montoBonosUsar).toLocaleString()} para cubrir el total
                    </div>
                  )}
                  {modoPago === 'bono' && montoBonosUsar >= total && (
                    <div style={{ color: "#059669", fontSize: "0.9rem", marginTop: "0.5rem" }}>
                      ✅ Total cubierto con bonos
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}      {/* 🔥 MEJORADO: Lista de pagos cargados con validación de duplicados */}
      {pagosCargados.length > 0 && (
        <div className="pagos-cargados">
          <h3>📄 Comprobantes Cargados ({pagosCargados.length})</h3>
          
          {/* Alerta si hay referencias repetidas */}
          {(() => {
            const referenciasRepetidas = pagosCargados
              .map(p => p.datos.referencia.trim())
              .filter((ref, index, arr) => arr.indexOf(ref) !== index);
            
            if (referenciasRepetidas.length > 0) {
              const referenciasUnicas = [...new Set(referenciasRepetidas)];
              return (
                <div className="alerta-referencias-repetidas">
                  <span>
                    Se detectaron referencias repetidas: <strong>{referenciasUnicas.join(', ')}</strong>
                    <br />
                    Esto puede ser válido para pagos fraccionados o abonos parciales.
                  </span>
                </div>
              );
            }
            return null;
          })()}

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
            </thead>            <tbody>
              {pagosCargados.map((p, idx) => {
                // 🔥 NUEVO: Detectar si esta referencia se repite
                const referenciasIguales = pagosCargados.filter(pago => 
                  pago.datos.referencia.trim() === p.datos.referencia.trim()
                ).length;
                const esReferenciaRepetida = referenciasIguales > 1;
                
                return (
                  <tr key={idx} className={esReferenciaRepetida ? 'referencia-repetida' : ''}>
                    <td>${parseValorMonetario(p.datos.valor).toLocaleString("es-CO")}</td>
                    <td>{p.datos.fecha}</td>
                    <td>{p.datos.hora}</td>
                    <td>{p.datos.entidad}</td>
                    <td>
                      {p.datos.referencia}
                      {esReferenciaRepetida && (
                        <span 
                          className="indicador-repetida" 
                          title={`Esta referencia se repite ${referenciasIguales} veces en la lista`}
                          style={{
                            marginLeft: '8px',
                            backgroundColor: '#fbbf24',
                            color: '#92400e',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}
                        >
                          ⚠️ x{referenciasIguales}
                        </span>
                      )}
                    </td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 🔥 BOTÓN DE REGISTRO - Mejorado con validaciones por modo */}
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
            {cargando ? "Procesando..." : (() => {
              switch (modoPago) {
                case 'comprobante':
                  return `✅ Registrar pago con comprobante (${totales.totalPagosEfectivo.toLocaleString()})`;
                case 'bono':
                  return `✅ Registrar pago con bonos (${totales.totalBonos.toLocaleString()})`;
                case 'mixto':
                  return `✅ Registrar pago mixto (${totales.totalCubierto.toLocaleString()})`;
                default:
                  return  "✅ Registrar pago"
              }
            })()}
          </button>
        </div>
      )}

      {/* 🔥 FORMULARIO DE COMPROBANTE - Solo mostrar según el modo */}
      {(modoPago === 'comprobante' || modoPago === 'mixto') && (
        <div className="seccion-comprobante">
          <h3>📄 {modoPago === 'mixto' ? 'Comprobante adicional' : 'Comprobante de pago'}</h3>
          
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
      )}

      {/* 🔥 MENSAJE DE ESTADO SEGÚN EL MODO */}
      {!puedeProcessarPago() && (
        <div className="mensaje-estado" style={{
          margin: "2rem 0",
          padding: "1rem",
          backgroundColor: "#fef3c7",
          border: "1px solid #f59e0b",
          borderRadius: "8px",
          color: "#92400e"
        }}>
          {modoPago === 'comprobante' && (
            <p style={{ margin: 0 }}>
              📄 <strong>Faltan comprobantes:</strong> Necesitas agregar comprobantes que cubran ${total.toLocaleString()}.
            </p>
          )}
          {modoPago === 'bono' && (
            <p style={{ margin: 0 }}>
              💰 <strong>Selecciona bonos:</strong> Elige bonos que cubran al menos ${total.toLocaleString()}.
              {bonos && montoBonosUsar > 0 && montoBonosUsar < total && (
                <span style={{ display: "block", marginTop: "0.5rem" }}>
                  Tienes ${montoBonosUsar.toLocaleString()} seleccionados, faltan ${(total - montoBonosUsar).toLocaleString()}.
                </span>
              )}
            </p>
          )}
          {modoPago === 'mixto' && (
            <p style={{ margin: 0 }}>
              🔄 <strong>Completa el pago mixto:</strong> Combina bonos y comprobantes para cubrir ${total.toLocaleString()}.
              {totales.totalCubierto > 0 && (
                <span style={{ display: "block", marginTop: "0.5rem" }}>
                  Tienes ${totales.totalCubierto.toLocaleString()} cubiertos, faltan ${totales.faltante.toLocaleString()}.
                </span>
              )}
            </p>
          )}
        </div>
      )}      {/* Botones de acción */}
      <div className="acciones" style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '1rem',
        marginTop: '2rem'
      }}>
        <button 
          className="boton-secundario"
          onClick={() => navigate('/conductor/pagos')}
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

// Función placeholder - implementar según tu lógica de autenticación
function getToken(): string {
  return localStorage.getItem("token") || "";
}