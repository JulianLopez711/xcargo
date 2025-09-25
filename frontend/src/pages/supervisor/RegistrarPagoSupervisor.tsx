import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContext";
import "../../styles/conductor/FormularioPagoConductor.css";
import LoadingSpinner from "../../components/LoadingSpinner";
import ValidadorPago from "../../components/ValidadorPago";

// Tipos de pago válidos - SOLO estos valores pueden ser enviados al backend
const TIPOS_PAGO_VALIDOS = ["consignacion", "Nequi", "Transferencia"] as const;
type TipoPagoValido = typeof TIPOS_PAGO_VALIDOS[number];

// Función para validar si un tipo de pago es válido
const esTipoPagoValido = (tipo: string): tipo is TipoPagoValido => {
  return TIPOS_PAGO_VALIDOS.includes(tipo as TipoPagoValido);
};

// Función para sanitizar el tipo de pago antes del envío
const sanitizarTipoPago = (tipo: string): TipoPagoValido | "" => {
  const tipoLimpio = tipo.trim();
  return esTipoPagoValido(tipoLimpio) ? tipoLimpio : "";
};

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
    tipo_comprobante?: string;  // 🔥 AGREGAR CAMPO FALTANTE
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
  });
  
  // 🔒 Estado para controlar si el tipo fue detectado por OCR (no editable)
  const [tipoDetectadoPorOCR, setTipoDetectadoPorOCR] = useState<boolean>(false);
  
  const [validacionPago, setValidacionPago] = useState<any>(null);

  // 🔥 FIX: Función auxiliar para convertir valores a string de forma segura
  const toSafeString = (value: any): string => {
    return typeof value === 'string' ? value : String(value || '');
  };

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

  function parseValorMonetario(valor: string | number): number {
    // 🔥 FIX: Manejar tanto strings como números
    const valorStr = typeof valor === 'string' ? valor : String(valor || '0');
    
    const limpio = valorStr
      .replace(/[^0-9.,]/g, "")
      .replace(/\.(?=\d{3,})/g, "")
      .replace(",", ".");
    const num = parseFloat(limpio);
    return isNaN(num) ? 0 : num;
  }

  // Calcular totales (simplificado para supervisor - solo comprobantes)
  const calcularTotales = () => {
    const totalPagosEfectivo = pagosCargados.reduce((sum, p) => {
      // 🔥 FIX: Validar que p.datos.valor sea string antes de parsearlo
      const valorStr = typeof p.datos.valor === 'string' ? p.datos.valor : String(p.datos.valor || '0');
      const val = parseValorMonetario(valorStr);
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
    
    // 🔓 Reset del estado OCR cuando se cambia el archivo
    setTipoDetectadoPorOCR(false);
    
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
        // 🔥 EXTRACCIÓN MEJORADA DEL TIPO - Considerar múltiples campos
        const tipoExtraido = data.tipo || data.tipo_comprobante || data.entidad || "";
        const tipoSanitizado = sanitizarTipoPago(tipoExtraido);
        
        // 🔥 LOG PARA DEBUGGING
        console.log("🔍 Datos extraídos del OCR:", data);
        console.log("🎯 Tipo extraído:", tipoExtraido);
        console.log("✅ Tipo sanitizado:", tipoSanitizado);
        
        // 🔥 FIX: Asegurar que todos los valores sean strings
        const datosLimpios = {
          valor: String(data.valor || ""),
          fecha: convertirFechaAISO(String(data.fecha || "")),
          hora: normalizarHora(String(data.hora || "")),
          tipo: tipoSanitizado,
          entidad: String(data.entidad || ""),
          referencia: String(data.referencia || ""),
        };

        setDatosManuales(datosLimpios);
        
        // 🔒 Marcar el tipo como detectado por OCR si se encontró un tipo válido
        setTipoDetectadoPorOCR(tipoSanitizado !== "");

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

        // 🛡️ VERIFICACIÓN NEQUI - Si el tipo detectado es Nequi, verificar referencia
        if (tipoSanitizado.toLowerCase().includes("nequi") && datosLimpios.referencia.trim() !== "") {
          console.log("🛡️ Iniciando verificación Nequi para referencia:", datosLimpios.referencia);
          
          try {
            const verificacionData = new FormData();
            verificacionData.append("referencia", datosLimpios.referencia);
            verificacionData.append("tipo", tipoSanitizado);
            
            const verificacionResponse = await fetch("http://127.0.0.1:8000/pagos/verificar-referencia-nequi", {
              method: "POST",
              body: verificacionData,
            });
            
            if (verificacionResponse.ok) {
              const verificacionResult = await verificacionResponse.json();
              console.log("🔍 Resultado verificación Nequi:", verificacionResult);
              
              if (!verificacionResult.permitir_registro) {
                // Crear modal superpuesto que bloquee el formulario
                const modalOverlay = document.createElement('div');
                modalOverlay.style.cssText = `
                  position: fixed;
                  top: 0;
                  left: 0;
                  width: 100%;
                  height: 100%;
                  background-color: rgba(0, 0, 0, 0.6);
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  z-index: 10000;
                  backdrop-filter: blur(2px);
                `;
                
                const modalContent = document.createElement('div');
                modalContent.style.cssText = `
                  background-color: white;
                  padding: 2rem;
                  border-radius: 12px;
                  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                  max-width: 500px;
                  width: 90%;
                  text-align: center;
                  animation: modalAppear 0.3s ease-out;
                `;
                
                // Agregar animación CSS
                const style = document.createElement('style');
                style.textContent = `
                  @keyframes modalAppear {
                    from { opacity: 0; transform: scale(0.8); }
                    to { opacity: 1; transform: scale(1); }
                  }
                  @keyframes fadeOut {
                    from { opacity: 1; transform: scale(1); }
                    to { opacity: 0; transform: scale(0.9); }
                  }
                `;
                document.head.appendChild(style);
                
                modalContent.innerHTML = `
                  <div style="color: #dc2626; font-size: 3rem; margin-bottom: 1rem;">❌</div>
                  <div style="color: #991b1b; font-size: 1.5rem; font-weight: bold; margin-bottom: 1rem;">
                    REFERENCIA NEQUI DUPLICADA
                  </div>
                  <div style="color: #374151; font-size: 1.1rem; margin-bottom: 1.5rem; line-height: 1.5;">
                    La referencia <strong style="color: #dc2626;">${datosLimpios.referencia}</strong> ya existe en el sistema.
                    <br><br>
                    Este pago no se puede registrar.
                  </div>
                  <button id="cerrarModal" style="
                    background-color: #dc2626;
                    color: white;
                    border: none;
                    padding: 0.75rem 2rem;
                    border-radius: 8px;
                    font-size: 1rem;
                    font-weight: bold;
                    cursor: pointer;
                    transition: background-color 0.2s;
                  ">
                    Entendido
                  </button>
                `;
                
                modalOverlay.appendChild(modalContent);
                document.body.appendChild(modalOverlay);
                
                // Manejar cierre del modal
                const botonCerrar = modalContent.querySelector('#cerrarModal');
                const cerrarModal = () => {
                  if (document.body.contains(modalOverlay)) {
                    modalOverlay.style.animation = 'fadeOut 0.3s ease-out';
                    setTimeout(() => {
                      if (document.body.contains(modalOverlay)) {
                        document.body.removeChild(modalOverlay);
                      }
                      if (document.head.contains(style)) {
                        document.head.removeChild(style);
                      }
                    }, 300);
                  }
                };
                
                botonCerrar?.addEventListener('click', cerrarModal);
                
                // Cerrar con Escape
                const handleEscape = (event: KeyboardEvent) => {
                  if (event.key === 'Escape') {
                    cerrarModal();
                    document.removeEventListener('keydown', handleEscape);
                  }
                };
                document.addEventListener('keydown', handleEscape);
                
                // Hover effect para el botón
                botonCerrar?.addEventListener('mouseenter', () => {
                  (botonCerrar as HTMLElement).style.backgroundColor = '#b91c1c';
                });
                botonCerrar?.addEventListener('mouseleave', () => {
                  (botonCerrar as HTMLElement).style.backgroundColor = '#dc2626';
                });
                
                // Limpiar datos para evitar registro accidental
                setDatosManuales({
                  valor: "",
                  fecha: "",
                  hora: "",
                  tipo: "",
                  entidad: "",
                  referencia: "",
                });
                setArchivo(null);
                return;
              } else {
                console.log("✅ Verificación Nequi exitosa - pago permitido");
              }
            } else {
              console.warn("⚠️ Error en verificación Nequi, permitiendo continuar:", verificacionResponse.status);
            }
          } catch (verificacionError: any) {
            console.warn("⚠️ Error en verificación Nequi:", verificacionError);
            // Continuar normal si falla la verificación
          }
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
    // Validar campos obligatorios
    const campos = Object.entries(datosManuales);
    for (const [key, val] of campos) {
      // 🔥 FIX: Convertir val a string antes de usar .trim()
      const valStr = toSafeString(val);
      if (valStr.trim() === "") {
        if (key === "tipo") {
          alert("❌ Debes seleccionar un tipo de pago válido");
          return;
        }
        alert(`❌ El campo "${key}" es obligatorio`);
        return;
      }
    }

    // Validación ESTRICTA del tipo de pago - solo permitir valores del dropdown
    const tipoSanitizado = sanitizarTipoPago(datosManuales.tipo);
    if (!tipoSanitizado) {
      alert(`❌ Tipo de pago inválido. Solo se permiten: ${TIPOS_PAGO_VALIDOS.join(', ')}`);
      return;
    }

    if (!archivo) {
      alert("❌ Debes adjuntar el comprobante de pago.");
      return;
    }

    const referencia = toSafeString(datosManuales.referencia).trim();
    const fechaHora = `${toSafeString(datosManuales.fecha).trim()} ${toSafeString(datosManuales.hora).trim()}`;

    const duplicado = pagosCargados.find(
      (p) =>
        p.datos.referencia === referencia ||
        `${p.datos.fecha} ${p.datos.hora}` === fechaHora
    );

    if (duplicado) {
      alert("❌ Este comprobante ya fue cargado (referencia o fecha/hora duplicada).");
      return;
    }

    // Asegurarse de usar el tipo sanitizado al agregar el pago
    const pagoSeguro = {
      datos: {
        ...datosManuales,
        tipo: tipoSanitizado // Garantizar que solo se almacene un tipo válido
      },
      archivo
    };

    setPagosCargados((prev) => [...prev, pagoSeguro]);
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

  // Función de registro de pagos (unificada para enviar todos los comprobantes y guías en un solo request)
  const registrarTodosLosPagos = async () => {
    const totales = calcularTotales();
    
    if (totales.faltante > 0) {
      alert(`❌ Faltan $${totales.faltante.toLocaleString()} para cubrir el total de las guías.`);
      return;
    }

    // VALIDACIÓN CRÍTICA: Verificar que todos los tipos de pago sean válidos
    const tiposInvalidos = pagosCargados.filter(pago => !esTipoPagoValido(pago.datos.tipo));
    if (tiposInvalidos.length > 0) {
      alert(`❌ Error crítico: Se detectaron tipos de pago inválidos. Solo se permiten: ${TIPOS_PAGO_VALIDOS.join(', ')}`);
      console.error("🚨 Tipos inválidos detectados:", tiposInvalidos.map(p => p.datos.tipo));
      return;
    }
    
    setCargando(true);
    
    try {
      const usuario = JSON.parse(localStorage.getItem("user")!);
      const correo = usuario.email;
      const token = user?.token || localStorage.getItem("token") || "";
      const formData = new FormData();

      // 🔥 NUEVA LÓGICA: Adjuntar todos los comprobantes CON SUS TIPOS INDEPENDIENTES
      pagosCargados.forEach((pago, idx) => {
        formData.append(`comprobante_${idx}`, pago.archivo);
        // 🎯 ENVIAR EL TIPO ESPECÍFICO DE CADA COMPROBANTE
        formData.append(`tipo_comprobante_${idx}`, sanitizarTipoPago(pago.datos.tipo));
      });

      // Para compatibilidad, también enviar el primer comprobante como 'comprobante'
      if (pagosCargados[0]) {
        formData.append("comprobante", pagosCargados[0].archivo);
      }

      // 🔥 LÓGICA MEJORADA: Cada guía mantiene relación con su comprobante específico
      let guiasConPagos: any[] = [];
      pagosCargados.forEach((pago, pagoIndex) => {
        guias.forEach((guia) => {
          guiasConPagos.push({
            ...guia,
            ...pago.datos,
            tipo: sanitizarTipoPago(pago.datos.tipo), // SANITIZAR TIPO ANTES DE ENVIAR
            indice_comprobante: pagoIndex // 🎯 RELACIONAR CON EL ÍNDICE DEL COMPROBANTE
          });
        });
      });

      // Sanitizar el tipo principal que se envía como campo independiente
      const tipoPrincipalSanitizado = sanitizarTipoPago(pagosCargados[0]?.datos.tipo || "");
      
      // VALIDACIÓN FINAL: No permitir envío si el tipo no es válido
      if (!tipoPrincipalSanitizado) {
        alert(`❌ Error de validación: Tipo de pago inválido. Solo se permiten: ${TIPOS_PAGO_VALIDOS.join(', ')}`);
        return;
      }

      formData.append("correo", correo);
      formData.append("valor_pago_str", totales.totalPagosEfectivo.toString());
      formData.append("fecha_pago", pagosCargados[0]?.datos.fecha || "");
      formData.append("hora_pago", normalizarHoraParaEnvio(pagosCargados[0]?.datos.hora || ""));
      formData.append("tipo", tipoPrincipalSanitizado); // TIPO SANITIZADO Y VALIDADO
      formData.append("entidad", pagosCargados[0]?.datos.entidad || "");
      formData.append("referencia", pagosCargados[0]?.datos.referencia || "");
      formData.append("guias", JSON.stringify(guiasConPagos));

      // 🔥 LOG DETALLADO DE TIPOS INDEPENDIENTES POR COMPROBANTE
      console.log("==== ENVÍO DE PAGO SUPERVISOR ====");
      console.log("🔒 ANÁLISIS DE TIPOS POR COMPROBANTE:");
      pagosCargados.forEach((pago, idx) => {
        console.log(`   📄 COMPROBANTE ${idx}:`);
        console.log(`      - Tipo original: "${pago.datos.tipo}"`);
        console.log(`      - Tipo sanitizado: "${sanitizarTipoPago(pago.datos.tipo)}"`);
        console.log(`      - Referencia: "${pago.datos.referencia}"`);
        console.log(`      - Valor: "${pago.datos.valor}"`);
      });
      console.log("   - Tipos válidos permitidos:", TIPOS_PAGO_VALIDOS);
      console.log("   - Tipo principal (primer comprobante):", tipoPrincipalSanitizado);
      
      // LOG: Mostrar el contenido del FormData antes de enviar
      console.log("\n📤 CONTENIDO FORMDATA:");
      for (let pair of formData.entries()) {
        if (pair[0] === "tipo") {
          console.log(`🎯 ${pair[0]}: "${pair[1]}" ← TIPO PRINCIPAL (primer comprobante)`);
        } else if (pair[0].startsWith("tipo_comprobante_")) {
          console.log(`🎯 ${pair[0]}: "${pair[1]}" ← TIPO ESPECÍFICO DE ESTE COMPROBANTE`);
        } else if (pair[0] === "guias") {
          try {
            const guiasLog = JSON.parse(pair[1] as string);
            console.log("📦 guias: Array con", guiasLog.length, "elementos");
            console.log("   - Referencias:", guiasLog.map((g: any) => g.referencia));
            console.log("   - Trackings:", guiasLog.map((g: any) => g.tracking));
            console.log("   - Tipos en guías:", guiasLog.map((g: any) => g.tipo));
            console.log("   - Índices de comprobantes:", guiasLog.map((g: any) => g.indice_comprobante));
          } catch (e) {
            console.log("❌ No se pudo parsear guias para log");
          }
        } else if (pair[1] instanceof File) {
          console.log(`📎 ${pair[0]}: [Archivo] ${(pair[1] as File).name}`);
        } else {
          console.log(`📝 ${pair[0]}: "${pair[1]}"`);
        }
      }

      // Enviar al backend
      const response = await fetch("http://127.0.0.1:8000/pagos/registrar-conductor", {
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

      const mensajeExito = `✅ Pago registrado exitosamente: ${pagosCargados.length} comprobante(s) por $${totales.totalPagosEfectivo.toLocaleString()}.`;
      
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

      {/* Formulario de comprobante - Solo mostrar si falta dinero por cubrir */}
      {totales.faltante > 0 && (
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
                <label>
                  {label}
                  {key === "tipo" && tipoDetectadoPorOCR && (
                    <span 
                      style={{ 
                        marginLeft: "8px", 
                        fontSize: "12px", 
                        color: "#10b981", 
                        fontWeight: "bold",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px"
                      }}
                      title="Tipo detectado automáticamente por OCR"
                    >
                      🤖 Auto-detectado
                    </span>
                  )}
                </label>
                {key === "tipo" ? (
                  <select
                    value={datosManuales.tipo}
                    onChange={(e) => {
                      // Solo procesar cambios si NO fue detectado por OCR
                      if (!tipoDetectadoPorOCR) {
                        const valorSeleccionado = e.target.value;
                        // Solo permitir valores válidos o string vacío
                        const tipoValidado = valorSeleccionado === "" ? "" : sanitizarTipoPago(valorSeleccionado);
                        setDatosManuales((prev) => ({
                          ...prev,
                          tipo: tipoValidado,
                        }));
                      }
                    }}
                    required
                    disabled={tipoDetectadoPorOCR} // 🔒 No editable si fue detectado por OCR
                    style={{
                      borderColor: datosManuales.tipo && !esTipoPagoValido(datosManuales.tipo) ? "#ef4444" : "",
                      backgroundColor: tipoDetectadoPorOCR ? "#f3f4f6" : "",
                      cursor: tipoDetectadoPorOCR ? "not-allowed" : "pointer",
                      opacity: tipoDetectadoPorOCR ? 0.7 : 1
                    }}
                    title={tipoDetectadoPorOCR ? "🤖 Tipo detectado automáticamente por OCR" : "Seleccione el tipo de pago"}
                  >
                    <option value="">Seleccione tipo de pago...</option>
                    {TIPOS_PAGO_VALIDOS.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {tipo === "consignacion" ? "Consignación" : tipo}
                      </option>
                    ))}
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
                    readOnly={(key === "valor" && toSafeString(datosManuales.valor).trim() !== "") || (key === "fecha" && toSafeString(datosManuales.fecha).trim() !== "")}
                    style={(key === "valor" && toSafeString(datosManuales.valor).trim() !== "") || (key === "fecha" && toSafeString(datosManuales.fecha).trim() !== "") ? {
                      backgroundColor: "#f3f4f6",
                      cursor: "not-allowed",
                      opacity: 0.7
                    } : {}}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Componente de validación */}
          {guias.length > 0 && toSafeString(datosManuales.valor).trim() !== "" && (
            <ValidadorPago
              guiasSeleccionadas={guias}
              valorConsignado={parseValorMonetario(toSafeString(datosManuales.valor))}
              onValidacionChange={setValidacionPago}
            />
          )}

          {/* Botón para agregar pago individual - CON VALIDACIÓN ESTRICTA */}
          <button
            type="button"
            className="boton-registrar"
            onClick={agregarPago}
            disabled={
              !validacionPago?.valido || 
              analizando || 
              !esTipoPagoValido(toSafeString(datosManuales.tipo).trim())
            }
            style={{
              backgroundColor: (
                validacionPago?.valido && 
                esTipoPagoValido(toSafeString(datosManuales.tipo).trim())
              ) ? "#3b82f6" : "#6b7280",
              opacity: (
                validacionPago?.valido && 
                !analizando && 
                esTipoPagoValido(toSafeString(datosManuales.tipo).trim())
              ) ? 1 : 0.6,
              margin: "1rem 0"
            }}
          >
            {!toSafeString(datosManuales.tipo).trim() ? 
              '❌ Selecciona tipo de pago válido' : 
              !esTipoPagoValido(toSafeString(datosManuales.tipo).trim()) ?
              `❌ Solo se permiten: ${TIPOS_PAGO_VALIDOS.join(', ')}` :
              !validacionPago?.valido ? 
              '❌ Comprobante inválido' : 
              '✅ Agregar comprobante'}
          </button>
        </form>
      </div>
      )}

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