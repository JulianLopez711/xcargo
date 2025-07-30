import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import "../../styles/conductor/FormularioPagoConductor.css";
import LoadingSpinner from "../../components/LoadingSpinner";
import ValidadorPago from "../../components/ValidadorPago";

// Tipos de datos
type Bono = {
  id: string;
  tipo_bono: "SOBRANTE_PAGO";
  valor_bono: number;
  saldo_disponible: number;
  referencia_pago_origen: string;
  fecha_generacion: string;
  estado_bono: "ACTIVO" | "AGOTADO" | "VENCIDO" | "CANCELADO";
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
  cliente?: string;
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
type ModoPago = "comprobante" | "bono" | "mixto";

const usuario = JSON.parse(localStorage.getItem("user")!);

export default function RegistrarPago() {
  const location = useLocation();
  const navigate = useNavigate();

  const {
    guias,
    total,
    bonos,
  }: {
    guias: GuiaPago[];
    total: number;
    bonos?: { disponible: number; detalles: any[] };
  } = location.state || {
    guias: [],
    total: 0,
    bonos: { disponible: 0, detalles: [] },
  };

  // 🔥 NUEVO: Estado para modo de pago seleccionado
  const [modoPago, setModoPago] = useState<ModoPago>("comprobante");
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
  // El bono seleccionado siempre será el primero disponible
  const [bonoSeleccionado, setBonoSeleccionado] = useState<string | null>(null);
  const [usarBonos, setUsarBonos] = useState<boolean>(true);

  // Seleccionar bono automáticamente al cargar
  useEffect(() => {
    if (bonosDisponibles.length > 0) {
      setBonoSeleccionado(bonosDisponibles[0].id);
      setUsarBonos(true);
    }
  }, [bonosDisponibles]);

  // Calcular el monto de bonos a usar basado en el bono seleccionado
  const montoBonosUsar =
    usarBonos && bonoSeleccionado
      ? bonosDisponibles.find((b) => b.id === bonoSeleccionado)
          ?.saldo_disponible || 0
      : 0;

  // Función unificada para calcular totales
  const calcularTotales = () => {
    const totalPagosEfectivo = pagosCargados.reduce((sum, p) => {
      const val = parseValorMonetario(p.datos.valor);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);

    const totalBonos =
      usarBonos && bonoSeleccionado
        ? bonosDisponibles.find((b) => b.id === bonoSeleccionado)
            ?.saldo_disponible || 0
        : 0;

    const totalCubierto = totalPagosEfectivo + totalBonos;
    const faltante = Math.max(0, total - totalCubierto);
    const sobrante = Math.max(0, totalCubierto - total);

    return {
      totalPagosEfectivo,
      totalBonos,
      totalCubierto,
      faltante,
      sobrante,
    };
  };

  // Logs mejorados para depuración de usuario y totales
  const totales = calcularTotales();
  console.log("[DEBUG][usuario]", usuario);
  console.log(
    "[DEBUG][bonosDisponibles]",
    bonosDisponibles,
    "length:",
    bonosDisponibles.length
  );
  console.log("[DEBUG][totales]", JSON.stringify(totales, null, 2));
  console.log("[DEBUG][totales.sobrante]", totales.sobrante);
  if (totales.sobrante && totales.sobrante > 0) {
    console.log(
      "[BONO/EXCEDENTE DETECTADO] Se generará bono con sobrante:",
      totales.sobrante
    );
  } else {
    console.log(
      "[SIN BONO/EXCEDENTE] No se generará bono. Sobrante:",
      totales.sobrante
    );
  }

  // Eliminar calcularTotalConBonos ya que está duplicado
  // (declaración de 'totales' ya está arriba para logs)

  // 🔥 NUEVA FUNCIÓN: Manejar cambio de modo de pago
  const handleModoPagoChange = async (nuevoModo: ModoPago) => {
    setModoPago(nuevoModo);
    if (nuevoModo === "comprobante") {
      setUsarBonos(false);
      setBonoSeleccionado(null);
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
      // El comprobante automático se generará en un useEffect
  } else if (nuevoModo === "mixto") {
      setUsarBonos(true);
      // Mantener ambos formularios disponibles
    }
  };

  // useEffect para comprobante automático de bono (debe ir antes del return)
  useEffect(() => {
    if (modoPago === 'bono' && bonoSeleccionado) {
      const bono = bonosDisponibles.find(b => b.id === bonoSeleccionado);
      if (bono) {
        const fechaBono = bono.fecha_generacion.split("T")[0] || "";
        const horaBono = bono.fecha_generacion.split("T")[1]?.slice(0,5) || "00:00";
        const datosBono: DatosPago = {
          valor: bono.saldo_disponible.toString(),
          fecha: fechaBono,
          hora: horaBono,
          tipo: "consignacion",
          entidad: "Bono",
          referencia: `${bono.referencia_pago_origen || bono.id}-Bono`,
        };
        const archivoBono = new File([`Bono generado: ${bono.id}`], `bono_${bono.id}.txt`, { type: "text/plain" });
        // Solo setear si no existe ya el comprobante de bono
        if (
          pagosCargados.length === 0 ||
          pagosCargados[0]?.datos?.referencia !== datosBono.referencia
        ) {
          setPagosCargados([{ datos: datosBono, archivo: archivoBono }]);
        }
      }
    } else if (modoPago !== 'bono') {
      // Solo limpiar si NO estamos en bono
      if (pagosCargados.length === 1 && pagosCargados[0]?.datos?.entidad === 'Bono') {
        setPagosCargados([]);
      }
    }
  }, [bonoSeleccionado, modoPago, bonosDisponibles]);

  // 🔥 NUEVA FUNCIÓN: Validar si se puede procesar el pago
  const puedeProcessarPago = () => {
    const totales = calcularTotales();
    if (modoPago === 'bono') {
      // Mostrar botón si hay bono seleccionado y saldo > 0
      return bonoSeleccionado && usarBonos && montoBonosUsar > 0;
    } else if (modoPago === 'mixto') {
      // Mostrar botón si hay bono seleccionado o comprobante cargado
      return (pagosCargados.length > 0) || (usarBonos && bonoSeleccionado && montoBonosUsar > 0);
    } else {
      // Solo comprobantes: solo si cubre el total
      return pagosCargados.length > 0 && totales.totalPagosEfectivo >= total;
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
        const [dia, mes, año] = fechaTexto.split("/");
        return `${año}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
      }

      if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(fechaTexto)) {
        const [dia, mes, año] = fechaTexto.split("-");
        return `${año}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
      }

      const fecha = new Date(fechaTexto);
      if (!isNaN(fecha.getTime())) {
        return fecha.toISOString().split("T")[0];
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

      const ampmMatch = horaTexto.match(
        /(\d{1,2}):(\d{2})\s*(AM|PM|A\.M\.|P\.M\.)/i
      );
      if (ampmMatch) {
        let [, horas, minutos, periodo] = ampmMatch;
        let horasNum = parseInt(horas);

        if (periodo.toUpperCase().includes("P") && horasNum !== 12) {
          horasNum += 12;
        } else if (periodo.toUpperCase().includes("A") && horasNum === 12) {
          horasNum = 0;
        }

        return `${horasNum.toString().padStart(2, "0")}:${minutos}`;
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
        alert(`❌ Error en OCR: ${result.mensaje || "Error desconocido"}`);
        return;
      }

      const data = result.datos_extraidos;

      if (data && Object.keys(data).length > 0) {
        const datosLimpios = {
          valor: data.valor || "",
          fecha: convertirFechaAISO(data.fecha || ""),
          hora: normalizarHora(data.hora || ""),
          tipo: data.tipo || "",
          entidad: data.entidad || "",
          referencia: data.referencia || "",
        };

        setDatosManuales(datosLimpios);

        if (result.validacion_ia) {
          setValidacionIA(result.validacion_ia);

          const { score_confianza, errores_detectados } = result.validacion_ia;

          if (
            errores_detectados &&
            Array.isArray(errores_detectados) &&
            errores_detectados.length > 0
          ) {
            console.warn("⚠️ Errores detectados:", errores_detectados);
            alert(
              `⚠️ OCR completado con advertencias:\n${errores_detectados.join(
                "\n"
              )}\n\nPor favor verifica los datos extraídos.`
            );
          } else if (score_confianza < 70) {
            console.warn(`⚠️ Confianza baja: ${score_confianza}%`);
            alert(
              `⚠️ Confianza baja (${score_confianza}%). Por favor verifica los datos.`
            );
          }
        }

        if (result.estadisticas?.calidad_imagen) {
          setCalidadOCR(result.estadisticas.calidad_imagen);
        }
      } else {
        console.warn("⚠️ No se extrajeron datos válidos del comprobante");
        alert(
          "⚠️ No se pudieron extraer datos del comprobante.\n\nPuedes ingresar los datos manualmente."
        );
      }
    } catch (err: any) {
      console.error("❌ Error al extraer datos:", err);
      alert(
        `❌ Error al procesar el comprobante: ${err.message}\n\nPuedes ingresar los datos manualmente.`
      );
    } finally {
      setAnalizando(false);
    }
  }; // 🔥 FUNCIÓN MEJORADA: Validación robusta de duplicados
  const validarDuplicado = (
    nuevosDatos: DatosPago
  ): { esDuplicado: boolean; mensaje: string } => {
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
        mensaje: `❌ DUPLICADO DETECTADO\n\nYa existe un pago con exactamente los mismos datos:\n• Referencia: ${referencia}\n• Valor: $${valor.toLocaleString()}\n• Fecha: ${fecha}\n\nEste sí es un duplicado real y no se puede agregar.`,
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
      mensaje: continuar
        ? ""
        : "⚠️ Operación cancelada. Revisa los datos antes de intentar nuevamente.",
    };
  };

  const agregarPago = () => {
    const campos = Object.entries(datosManuales);
    for (const [key, val] of campos) {
      if (!datosManuales.tipo) {
        alert("Por favor seleccione un tipo de pago válido.");
        return;
      }
      if (typeof val !== "string" || val.trim() === "") {
        alert(`El campo "${key}" es obligatorio`);

        return;
      }
    }

    if (!archivo) {
      alert("Debes adjuntar el comprobante de pago.");
      return;
    }

    // Validar duplicado exacto (misma referencia y mismos datos)
    const yaExiste = pagosCargados.some(
      (p) =>
        p.datos.referencia.trim() === datosManuales.referencia.trim() &&
        p.datos.valor === datosManuales.valor &&
        p.datos.fecha === datosManuales.fecha &&
        p.datos.hora === datosManuales.hora &&
        p.datos.entidad === datosManuales.entidad &&
        p.datos.tipo === datosManuales.tipo
    );
    if (yaExiste) {
      alert("Ya has agregado un pago con exactamente los mismos datos.");
      return;
    }

    // 🔥 NUEVA VALIDACIÓN: Usar la función mejorada de duplicados (permite referencias repetidas si los datos son distintos)
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

  // Función de registro de pagos (unificada para enviar todos los comprobantes y guías en un solo request)
  const registrarTodosLosPagos = async () => {
    const totales = calcularTotales();
    if (totales.faltante > 0) {
      alert(
        `Faltan $${totales.faltante.toLocaleString()} para cubrir el total de las guías.`
      );
      return;
    }
    // LOG DETALLADO: Mostrar todos los valores relevantes antes de enviar
    console.log("==== LOG DETALLADO DE ENVÍO DE PAGO ====");
    console.log("total (suma guías):", total);
    console.log("totales:", totales);
    console.log("usarBonos:", usarBonos);
    console.log("bonoSeleccionado:", bonoSeleccionado);
    console.log("pagosCargados:", pagosCargados);
    console.log("guias:", guias);
    // === LOG: Si hay sobrante (bono) ===
    if (totales.sobrante > 0) {
      console.log("[BONO] Sobrante detectado para bono:", {
        valor_bono: totales.sobrante,
        empleado: usuario?.email,
        fecha: new Date().toISOString(),
        descripcion: "bono a favor",
      });
    } else {
      console.log(
        "[BONO] No hay sobrante detectado en submit. Valor sobrante:",
        totales.sobrante
      );
    }
    // Fin log detallado
    setCargando(true);
    try {
      const usuario = JSON.parse(localStorage.getItem("user")!);
      const correo = usuario.email;
      const formData = new FormData();
      // Adjuntar todos los comprobantes
      pagosCargados.forEach((pago, idx) => {
        formData.append(`comprobante_${idx}`, pago.archivo);
      });
      // Para compatibilidad, también enviar el primer comprobante como 'comprobante'
      if (pagosCargados[0]) {
        formData.append("comprobante", pagosCargados[0].archivo);
      }

      // Enviar todas las guías seleccionadas tal cual, sin duplicar por comprobante
      formData.append("guias", JSON.stringify(guias));

      // LOG: Mostrar el array de guías que se va a enviar
      console.log("[REGISTRO PAGO] Guías a enviar:", guias);
      // LOG: Mostrar el contenido del FormData antes de enviar
      console.log("==== ENVÍO DE PAGO (FormData) ====");
      for (let pair of formData.entries()) {
        if (pair[1] instanceof File) {
          console.log(pair[0], `[Archivo]`, (pair[1] as File).name);
        } else {
          try {
            // Si es JSON, intenta parsear para mostrar bonito
            const parsed = JSON.parse(pair[1] as string);
            console.log(pair[0], JSON.stringify(parsed, null, 2));
          } catch {
            console.log(pair[0], pair[1]);
          }
        }
      }

      formData.append("correo", correo);
      formData.append("valor_pago_str", totales.totalPagosEfectivo.toString());
      formData.append("fecha_pago", pagosCargados[0]?.datos.fecha || "");
      formData.append("hora_pago", pagosCargados[0]?.datos.hora || "");
      formData.append("tipo", pagosCargados[0]?.datos.tipo || "");
      formData.append("entidad", pagosCargados[0]?.datos.entidad || "");
      formData.append("referencia", pagosCargados[0]?.datos.referencia || "");
      // Si hay bonos, adjuntar info de bonos
      if (usarBonos && bonoSeleccionado && montoBonosUsar > 0) {
        formData.append("bonos_aplicados", montoBonosUsar.toString());
        formData.append(
          "bonos_utilizados",
          JSON.stringify(
            Array.isArray(bonoSeleccionado)
              ? bonoSeleccionado
              : [bonoSeleccionado]
          )
        );
      }

      // LOG: Mostrar el contenido del FormData antes de enviar
      console.log("==== ENVÍO DE PAGO ====");
      for (let pair of formData.entries()) {
        if (pair[0] === "guias") {
          try {
            const guiasLog = JSON.parse(pair[1] as string);
            console.log(
              "Referencias de guías cargadas:",
              guiasLog.map((g: any) => g.referencia || g.tracking)
            );
            console.log(
              "Trackings de guías cargadas:",
              guiasLog.map((g: any) => g.tracking)
            );
          } catch (e) {
            console.log("No se pudo parsear guias para log");
          }
        } else if (pair[1] instanceof File) {
          console.log(pair[0], "[Archivo]", (pair[1] as File).name);
        } else {
          console.log(pair[0], pair[1]);
        }
      }
      // Enviar al backend
      const response = await fetch(
        "http://127.0.0.1:8000/pagos/registrar-conductor",
        {
          method: "POST",
          body: formData,
          headers: {
            Authorization: `Bearer ${getToken()}`,
          },
        }
      );
      const result = await response.json();
      console.log("[BONO][RESPUESTA BACKEND]", result);
      if (!response.ok) {
        alert(result.detail || "Error al registrar pago");
        throw new Error(result.detail || "Error al registrar pago");
      }
      let msg = result.mensaje || "Pago registrado correctamente";
      if (result.bono_excedente_log) {
        msg +=
          `\n\n[LOG BONO EXCEDENTE]\n` +
          JSON.stringify(result.bono_excedente_log, null, 2);
        console.log("[BONO][LOG EXCEDENTE]", result.bono_excedente_log);
      }
      alert(msg);
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
    const bonoAUsar = bonosDisponibles.find((b) => b.id === bonoId);
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
      const bonoAUsar = bonosDisponibles.find((b) => b.id === bonoId);
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
        alert(
          `El monto total pagado ($${totales.totalCubierto.toLocaleString()}) ` +
            `es menor al valor requerido ($${total.toLocaleString()})`
        );
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
        formData.append("bono_usado", bonoSeleccionado);
        const bonoAplicado = bonosDisponibles.find(
          (b) => b.id === bonoSeleccionado
        );
        if (bonoAplicado) {
          formData.append(
            "valor_bono_usado",
            bonoAplicado.saldo_disponible.toString()
          );
        }
      }

      // Agregar guías y totales
      formData.append("guias", JSON.stringify(guias));
      formData.append("total_efectivo", totales.totalPagosEfectivo.toString());
      formData.append("total_bonos", totales.totalBonos.toString());
      formData.append("sobrante", totales.sobrante.toString());

      // Enviar al backend
      const response = await fetch(
        "http://127.0.0.1:8000/pagos/registrar-conductor",
        {
          method: "POST",
          body: formData,
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Error registrando el pago");
      }

      const result = await response.json();

      // Si se generó un nuevo bono por sobrante
      if (result.bono_generado) {
        alert(
          `¡Pago registrado exitosamente!\n\n` +
            `Se ha generado un bono por $${result.bono_generado.valor_bono.toLocaleString()} ` +
            `que podrás usar en tus próximos pagos.`
        );
      } else {
        alert("¡Pago registrado exitosamente!");
      }

      navigate("/conductor/pagos");
    } catch (error: any) {
      console.error("❌ Error registrando pago:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setCargando(false);
    }
  };

  // Cargar bonos disponibles al inicio
  useEffect(() => {
    const cargarBonos = async () => {
      try {
        const response = await fetch(
          "http://127.0.0.1:8000/pagos/bonos-disponibles",
          {
            headers: {
              Authorization: `Bearer ${getToken()}`,
            },
          }
        );

        if (!response.ok) throw new Error("Error cargando bonos");

        const data = await response.json();
        setBonosDisponibles(data.bonos || []);
        console.log("Bonos disponibles:", data.bonos);
        setSaldoBonosTotal(data.total_disponible || 0);
      } catch (error) {
        console.error("Error cargando bonos:", error);
      }
    };

    cargarBonos();
  }, []);

  return (
    <div className="registrar-pago">
      <h1 style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: "45px" }}> Registrar Pago </span>
        <span className="tabla-guias" style={{ fontSize: "25px" }}>
          Saldo disponible: ${saldoBonosTotal.toLocaleString()}
        </span>
      </h1>
      <div className="tabla-guias">
        <h2>
          <span style={{ fontSize: 20 }}>
            <strong>Guías a Pagar</strong>
          </span>
        </h2>
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
              <td>
                <strong>Total a Pagar:</strong>
              </td>
              <td>
                <strong>${total.toLocaleString()}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>{" "}
  {/* ...se eliminó la sección de Bonos Disponibles, el uso de bonos es automático... */}
      {/* Resumen de Pago */}
      <div className="resumen-total-con-bonos">
        <h3>💳 Resumen de Pago</h3>
        {(() => {
          const totales = calcularTotales();
          return (
            <div className="resumen-desglose">
              <div className="linea-resumen">
                <span>
                  <strong style={{ fontSize: 20 }}>Total guias:</strong>
                </span>
                <span className="text-red font-bold" style={{ fontSize: 20 }}>
                  ${total.toLocaleString()}
                </span>
              </div>
              {/* Mostrar saldo disponible solo si hay saldoBonosTotal > 0 */}
              {saldoBonosTotal > 0 && (
                <div className="linea-resumen">
                  <span>
                    <strong style={{ fontSize: 20 }}>Saldo disponible:</strong>
                  </span>
                  <span style={{ color: "#059669", fontWeight: "bold", fontSize: 20 }}>
                    -${saldoBonosTotal.toLocaleString()}
                  </span>
                </div>
              )}
              {totales.totalBonos != totales.faltante && (
                <div className="linea-resumen">
                  <span style={{ fontSize: 20 }}>
                    <strong>Total comprobantes cargados:</strong>
                  </span>
                  <span
                    style={{ color: "green", fontWeight: "bold", fontSize: 20 }}
                  >
                    ${totales.totalPagosEfectivo.toLocaleString()}
                  </span>
                </div>
              )}
              {/* Mostrar total a pagar debajo de comprobantes cargados, restando comprobantes cargados y saldo disponible */}
              <div className="linea-resumen">
                <span>
                  <strong style={{ fontSize: 20 }}>Total a pagar:</strong>
                </span>
                <span style={{ color: "#3b82f6", fontWeight: "bold", fontSize: 20 }}>
                  {(() => {
                    const totalRestante = total - saldoBonosTotal - totales.totalPagosEfectivo;
                    return (totalRestante > 0 ? totalRestante : 0).toLocaleString();
                  })()}
                </span>
              </div>
              <hr className="divisor-resumen" />
              {totales.totalCubierto >= total && (
                <div className="linea-resumen total-final">
                  <span style={{ fontSize: 20 }}>
                    <strong> ✅ Total Cubierto:</strong>
                  </span>
                  <span style={{ fontSize: 20 }}>
                    <strong>${totales.totalCubierto.toLocaleString()}</strong>
                  </span>
                </div>
              )}
              {totales.faltante > 0 && (
                <div className="linea-resumen faltante">
                  <span className="texto-faltante" style={{ fontSize: 20 }}>
                    <strong>❌ Faltante:</strong>
                  </span>
                  <span className="texto-faltante" style={{ fontSize: 20 }}>
                    <strong>${totales.faltante.toLocaleString()}</strong>
                  </span>
                </div>
              )}
              {totales.sobrante > 0 && (
                <div className="linea-resumen exito">
                  <span className="texto-exito" style={{ fontSize: 20 }}>
                    <strong> ✅ Existe excedente:</strong>
                  </span>
                  <span className="texto-exito" style={{ fontSize: 20 }}>
                    <strong> Se actualizará el saldo disponible</strong>
                  </span>
                  <span className="texto-exito" style={{ fontSize: 20 }}>
                    <strong> + ${totales.sobrante.toLocaleString()} </strong>
                  </span>
                </div>
              )}
            </div>
          );
        })()}
      </div>
      {totales.faltante != 0 && (
        <div
          className="mensaje-estado"
          style={{
            margin: "2rem 0",
            padding: "1rem",
            backgroundColor: "#fef3c7",
            border: "1px solid rgb(235, 153, 0)", // 🔧 corregido!
            borderRadius: "8px",
            color: "#92400e",
          }}
        >
          <p style={{ margin: 0 }}>
            <strong style={{ fontSize: 19 }}>
              {" "}
              ❗ Total no cubierto ❗ Necesitas agregar comprobantes que cubran
              ${totales.faltante.toLocaleString()}
            </strong>
          </p>
        </div>
      )}
  {/* 🔥 Selector de modo de pago oculto, lógica automática */}
  {/* Se eliminó completamente la sección visual de Bonos Disponibles (caja amarilla) y cualquier renderizado de selección de bonos */}

      {/* Lista de pagos cargados o comprobante de bono en modo bono */}
      {(pagosCargados.length > 0 || saldoBonosTotal > 0) && (
        <div className="pagos-cargados">
          <h3>📄 Comprobantes Cargados ({pagosCargados.length + (saldoBonosTotal > 0 ? 1 : 0)})</h3>
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
              {/* Mostrar comprobantes cargados normalmente */}
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
                  <td></td>
                </tr>
              ))}
              {/* Si hay saldoBonosTotal, mostrar el bono como comprobante */}
              {saldoBonosTotal > 0 && bonosDisponibles.length > 0 && (() => {
                const bono = bonosDisponibles[0];
                if (!bono) return null;
                // Buscar el comprobante original del que surgió el bono, pero solo entre los comprobantes que no sean el propio bono
                let pagoOriginal = null;
                if (bono.referencia_pago_origen && pagosCargados.length > 0) {
                  pagoOriginal = pagosCargados.find(
                    (p) =>
                      p.datos.referencia === bono.referencia_pago_origen &&
                      // No tomar el propio bono como origen
                      (!p.datos.referencia.includes('(BONO)'))
                  );
                }
                // Si no se encuentra en pagos cargados, buscar en localStorage (caso solo bono)
                if (!pagoOriginal && bono.referencia_pago_origen) {
                  const pagosPrevios = JSON.parse(localStorage.getItem('pagos_previos') || '[]');
                  pagoOriginal = pagosPrevios.find(
                    (p) => p.datos && p.datos.referencia === bono.referencia_pago_origen
                  );
                }
                const valorBono = bono.saldo_disponible.toLocaleString("es-CO");
                const fecha = pagoOriginal && pagoOriginal.datos ? pagoOriginal.datos.fecha : (bono.fecha_generacion.split("T")[0] || "");
                const hora = pagoOriginal && pagoOriginal.datos ? pagoOriginal.datos.hora : (bono.fecha_generacion.split("T")[1]?.slice(0,5) || "00:00");
                const entidad = pagoOriginal && pagoOriginal.datos ? pagoOriginal.datos.entidad : "Bono";
                const referenciaBono = `${bono.referencia_pago_origen || bono.id} (BONO)`;
                const archivoBono = pagoOriginal && pagoOriginal.archivo ? pagoOriginal.archivo : new File([`Bono generado: ${bono.id}`], `bono_${bono.id}.txt`, { type: "text/plain" });
                return (
                  <tr key="bono-row">
                    <td>${valorBono}</td>
                    <td>{fecha}</td>
                    <td>{hora}</td>
                    <td>{entidad}</td>
                    <td>{referenciaBono}</td>
                    <td>
                      <a
                        href={URL.createObjectURL(archivoBono)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Ver
                      </a>
                    </td>
                    <td></td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}
      {/* 🔥 BOTÓN DE REGISTRO - Solo para comprobantes */}
  {(totales.totalCubierto >= total) && (
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
              opacity: cargando ? 0.6 : 1,
            }}
          >
            {(() => {
              if (cargando) return "Procesando...";
              if (saldoBonosTotal > 0 && totales.totalPagosEfectivo > 0) {
                return `✅ Registrar pago híbrido (incluye bono) (${(totales.totalPagosEfectivo + saldoBonosTotal).toLocaleString()})`;
              } else if (saldoBonosTotal > 0 && totales.totalPagosEfectivo === 0) {
                return `✅ Registrar pago solo bono (${saldoBonosTotal.toLocaleString()})`;
              } else {
                return `✅ Registrar pago solo comprobantes (${totales.totalPagosEfectivo.toLocaleString()})`;
              }
            })()}
          </button>
        </div>
      )}

      {/* 🔥 BOTÓN NUEVO - Solo para bono o mixto */}
      {(modoPago === 'bono' || modoPago === 'mixto') && puedeProcessarPago() && (
        <div style={{ margin: "2rem 0", textAlign: "center" }}>
          <button
            className="boton-registrar"
            onClick={registrarTodosLosPagos}
            disabled={cargando}
            style={{
              backgroundColor: modoPago === 'bono' ? "#059669" : "#7c3aed",
              color: "white",
              padding: "1rem 2rem",
              fontSize: "1.1rem",
              border: "none",
              borderRadius: "8px",
              cursor: cargando ? "not-allowed" : "pointer",
              opacity: cargando ? 0.6 : 1,
            }}
          >
            {cargando
              ? "Procesando..."
              : modoPago === 'bono'
                ? `💰 Registrar pago solo con bonos (${totales.totalBonos.toLocaleString()})`
                : `🔄 Registrar pago mixto (Bonos + Comprobante) (${totales.totalCubierto.toLocaleString()})`}
          </button>
        </div>
      )}
      {/* 🔥 FORMULARIO DE COMPROBANTE - Solo mostrar según el modo */}
      {totales.faltante != 0 && (
        <div className="seccion-comprobante">
          <form
            className="formulario-pago"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="input-group">
              <h3>📄Cargar comprobante de pago</h3>
              <label style={{ fontSize: "18px" }}>
                <strong>Comprobante de pago</strong>
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileChange}
                required
              />
            </div>

            {analizando && (
              <div
                style={{
                  margin: "1rem 0",
                  color: "#2e7d32",
                  fontWeight: "bold",
                }}
              >
                <LoadingSpinner size="small" />
                <span style={{ marginLeft: "0.5rem" }}>
                  🤖 Analizando comprobante con IA...
                </span>
              </div>
            )}

            {/* Información de validación IA */}
            {validacionIA && (
              <div
                className="validacion-ia"
                style={{
                  margin: "1rem 0",
                  padding: "1rem",
                  border: `2px solid ${getConfianzaColor(
                    validacionIA.score_confianza
                  )}`,
                  borderRadius: "8px",
                  backgroundColor: "#f8fafc",
                }}
              >
                <h4
                  style={{
                    margin: "0 0 0.5rem 0",
                    color: getConfianzaColor(validacionIA.score_confianza),
                  }}
                >
                  🤖 Validación IA: {validacionIA.score_confianza}% de confianza
                </h4>

                {validacionIA.sugerencias &&
                  Array.isArray(validacionIA.sugerencias) &&
                  validacionIA.sugerencias.length > 0 && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <strong style={{ color: "#059669" }}>
                        💡 Sugerencias:
                      </strong>
                      <ul
                        style={{
                          margin: "0.25rem 0",
                          paddingLeft: "1.5rem",
                          fontSize: "0.85rem",
                        }}
                      >
                        {validacionIA.sugerencias.map(
                          (sugerencia: string, idx: number) => (
                            <li key={idx} style={{ color: "#059669" }}>
                              {sugerencia}
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  )}
              </div>
            )}

            {/* Mostrar calidad de imagen */}
            {calidadOCR > 0 && (
              <div
                style={{
                  margin: "0.5rem 0",
                  fontSize: "0.9rem",
                  color: calidadOCR > 70 ? "#059669" : "#dc2626",
                }}
              >
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
                        key === "fecha"
                          ? "date"
                          : key === "hora"
                          ? "time"
                          : "text"
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
                      readOnly={key === "valor" && datosManuales.valor !== ""}
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
                margin: "1rem 0",
              }}
            >
              {validacionPago?.valido
                ? "✅ Agregar comprobante"
                : "❌ Comprobante inválido"}
            </button>
          </form>
        </div>
      )}
      {/* 🔥 MENSAJE DE ESTADO SEGÚN EL MODO */}
      {/*}
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
      )} */}
      {/* Botones de acción */}
      <div
        className="acciones"
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "1rem",
          marginTop: "2rem",
        }}
      >
        <button
          className="boton-secundario"
          onClick={() => navigate("/conductor/pagos")}
          disabled={cargando}
          style={{
            backgroundColor: "#6b7280",
            color: "white",
            padding: "0.75rem 1.5rem",
            borderRadius: "0.5rem",
            border: "none",
            cursor: cargando ? "not-allowed" : "pointer",
            opacity: cargando ? 0.6 : 1,
          }}
        >
          Cancelar
        </button>
      </div>
      {cargando && <LoadingSpinner size="medium" />}
    </div>
  );
}
{
  /* Función placeholder - implementar según tu lógica de autenticación */
}

function getToken(): string {
  return localStorage.getItem("token") || "";
}
