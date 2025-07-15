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
  valor_total_consignacion?: number;
  valor_individual?: number;
  matches_posibles?: Array<{
    referencia_pago: string;
    fecha_pago: string;
    valor_pago: number;
    score: number;
    correo_conductor?: string;
    trackings?: string[];
  }>;
}

// Verificar que tu interfaz incluya:

// ✅ INTERFACE PARA ENDPOINT MEJORADO
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
    conciliados_exactos?: number; // Nuevo campo para conciliados exactos
    conciliados_aproximados?: number; // Nuevo campo para conciliados aproximados
    conciliados_manuales?: number; // Nuevo campo para conciliados manuales
    //fecha_inicial?: string;
    //fecha_final?: string;
  };
  resumen_por_estado: Array<{
    estado_conciliacion: string;
    cantidad: number;
    valor_total: number;
    //fecha_min?: string;
    //fecha_max?: string;
  }>;
  total_valor_banco: number;
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

// Nueva interfaz para seleccionar transacciones bancarias
interface TransaccionBancaria {
  id: string;
  fecha: string;
  valor_banco: number;
  cuenta: string;
  codigo?: string;
  cod_transaccion?: string;
  descripcion: string;
  tipo: string;
  estado_conciliacion: string;
  porcentaje_similitud?: number;
  nivel_match?: string;
  imagen?: string; // URL de la imagen del comprobante
}

interface SeleccionTransaccionModal {
  pago: {
    referencia: string;
    valor: number;
    fecha: string;
    correo: string;
    entidad: string;
    tipo?: string; // Tipo de pago desde la tabla pagos conductores
  };
  transacciones_disponibles: TransaccionBancaria[];
}

interface LoadingProgress {
  total: number;
  processed: number;
  percentage: number;
  message: string;
}


const Cruces: React.FC = () => {
  // ✅ CONFIGURACIÓN DE API - Usar servidor local para desarrollo
  const API_BASE_URL = 'https://api.x-cargo.co';

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
  // Filtros de fecha y orden
  const [fechaInicio, setFechaInicio] = useState<string>("");
  const [fechaFin, setFechaFin] = useState<string>("");
  const [ordenFecha, setOrdenFecha] = useState<'asc' | 'desc'>("desc");
  const [modalDetalle, setModalDetalle] =
    useState<ResultadoConciliacion | null>(null);
  const [modalConciliacionManual, setModalConciliacionManual] =
    useState<ConciliacionManual | null>(null);
  const [modalSeleccionTransaccion, setModalSeleccionTransaccion] =
    useState<SeleccionTransaccionModal | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress>({
    total: 0,
    processed: 0,
    percentage: 0,
    message: "",
  });

    // Formatear moneda
  const formatearMoneda = (valor: number) => {
    return `$${Math.abs(valor).toLocaleString('es-CO')}`;
  };

  const verDetallesPago = async (referenciaPago: string) => {
    try {
      const response = await fetch(`https://api.x-cargo.co/pagos/detalles-pago/${referenciaPago}`);
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();

      const comprobante = data.detalles[0]?.comprobante;

      console.log("🧾 URL del comprobante:", comprobante);

      if (comprobante) {
          verImagen(comprobante);
        } else {
          alert("No se encontró ningún comprobante");
        }        

    } catch (err: any) {
      console.error("Error cargando detalles:", err);
      alert(`Error al cargar detalles del pago: ${err.message}`);
    }
  };


  const verImagen = (src: string) => {
    if (!src) {
      alert("No hay comprobante disponible");
      return;
    }
    setImagenSeleccionada(src);
  };
  


  const [logsProgreso, setLogsProgreso] = useState<string[]>([]);

  const [imagenSeleccionada, setImagenSeleccionada] = useState<string | null>(null);


    const [modalComprobante, setModalComprobante] = useState<{
    url: string;
    referencia: string;
  } | null>(null);
  const [cargandoComprobante, setCargandoComprobante] = useState(false);
  const [conciliandoTransaccion, setConciliandoTransaccion] = useState(false);

  // ✅ FUNCIÓN HELPER PARA CLASIFICAR SIMILITUD
  const getSimilitudClass = (porcentaje: number): string => {
    if (porcentaje >= 90) return 'excelente';
    if (porcentaje >= 75) return 'bueno';
    if (porcentaje >= 60) return 'regular';
    if (porcentaje >= 40) return 'bajo';
    return 'muy-bajo';
    
  };

  // ✅ FUNCIÓN HELPER PARA FORMATEAR FECHAS CORRECTAMENTE
  const formatearFecha = (fechaString: string): string => {
    try {
      // Si la fecha viene en formato ISO (YYYY-MM-DD), agregar la hora local para evitar problemas de zona horaria
      if (fechaString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Para fechas solo con fecha (sin hora), agregarle T12:00:00 para usar medio día local
        const fecha = new Date(fechaString + 'T12:00:00');
        const fechaFormateada = fecha.toLocaleDateString("es-CO");
        
        // 🔍 DEBUG: Log para diagnosticar problemas de fecha
        /* console.log(`📅 Formateo de fecha: ${fechaString} -> ${fechaFormateada}`, {
          original: fechaString,
          conHora: fechaString + 'T12:00:00',
          fechaObject: fecha,
          resultado: fechaFormateada
        });
        */
        return fechaFormateada;
      } else {
        // Para fechas con hora o en otros formatos
        const fecha = new Date(fechaString);
        const fechaFormateada = fecha.toLocaleDateString("es-CO");
        
        return fechaFormateada;
      }
    } catch (error) {
      console.error("❌ Error formateando fecha:", fechaString, error);
      return fechaString; // Devolver el string original si hay error
    }
  };

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  useEffect(() => {
    cargarEstadisticas();
  }, []);

  // ✅ FUNCIÓN CARGAR ESTADÍSTICAS IMPLEMENTADA
  const cargarEstadisticas = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/conciliacion/resumen-conciliacion`
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
        total_valor_banco: data.total_valor_banco || 0,
      };

      setEstadisticasGenerales(estadisticas);
    } catch (err: any) {
      console.error("Error cargando estadísticas:", err);
      setMensaje(`❌ Error: ${err.message}`);
    }
  };




<<<<<<< HEAD

  // ✅ NUEVA FUNCIÓN PARA CARGAR PAGOS PENDIENTES DE CONCILIAR
=======
      const data = await response.json();
      console.log("Datos de pagos pendientes:", data.total);
      setPagosPendientes(data.pagos || []);
    } catch (err: any) {
      console.error("Error cargando pagos pendientes:", err);
      setMensaje(`❌ Error al cargar pagos pendientes: ${err.message}`);
    }
  };
>>>>>>> origin/Oscar

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
        `${API_BASE_URL}/conciliacion/cargar-banco-excel`,
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

  // ✅ FUNCIÓN EJECUTAR CONCILIACIÓN CON PROGRESO EN TIEMPO REAL Y FALLBACK
  const ejecutarConciliacion = async () => {
    setProcesandoConciliacion(true);
    setLogsProgreso([]); // Limpiar logs anteriores
    updateProgress(0, 100, "Iniciando conciliación automática...");

    try {
      // Verificar si el navegador soporta EventSource
      if (typeof EventSource !== 'undefined') {
        
        await ejecutarConciliacionConProgreso();
      } else {
        console.warn("EventSource no soportado, usando método tradicional");
        await ejecutarConciliacionFallback();
      }
    } catch (err: any) {
      // Si el error es FALLBACK_NEEDED, usar fallback silenciosamente
      if (err.message === "FALLBACK_NEEDED") {
        
        try {
          await ejecutarConciliacionFallback();
        } catch (fallbackErr: any) {
          console.error("Error en fallback también:", fallbackErr);
          setMensaje("❌ Error ejecutando conciliación: " + fallbackErr.message);
          updateProgress(0, 100, "❌ Error en la conciliación");
        }
      } else {
        // Para otros errores, mostrar el mensaje
        console.error("Error en conciliación:", err);
        try {
          await ejecutarConciliacionFallback();
        } catch (fallbackErr: any) {
          console.error("Error en fallback también:", fallbackErr);
          setMensaje("❌ Error ejecutando conciliación: " + fallbackErr.message);
          updateProgress(0, 100, "❌ Error en la conciliación");
        }
      }
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



  // Función de conciliación con progreso usando EventSource
  const ejecutarConciliacionConProgreso = async () => {
    
    
    return new Promise<void>((resolve, reject) => {
      let eventSource: EventSource | null = null;
      let resolved = false;

      try {
        const url = `${API_BASE_URL}/conciliacion/conciliacion-automatica-mejorada`;
        
        
        eventSource = new EventSource(url);

        // Función helper para cerrar y limpiar
        const cleanup = () => {
          if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
            eventSource.close();
          }
        };

        // Un solo listener para todos los mensajes
        eventSource.onmessage = function(event) {
          if (resolved) return; // Evitar procesamiento múltiple

          try {
            const data = JSON.parse(event.data);
            
            
            // Agregar el mensaje a los logs de progreso para mostrar en la UI
            if (data.mensaje) {
              setLogsProgreso(prev => [...prev.slice(-19), `${new Date().toLocaleTimeString()}: ${data.mensaje}`]);
            }
            
            // Actualizar progreso según el tipo de evento
            switch (data.tipo) {
              case 'inicio':
                updateProgress(
                  data.porcentaje || 5,
                  100,
                  data.mensaje || "Iniciando conciliación..."
                );
                break;

              case 'fase':
                updateProgress(
                  data.porcentaje || 10,
                  100,
                  data.mensaje || "Procesando fase..."
                );
                break;

              case 'info':
                // Para eventos info, usar un porcentaje incremental si no se especifica
                const currentPercentage = data.porcentaje || 15;
                updateProgress(
                  currentPercentage,
                  100,
                  data.mensaje || "Procesando información..."
                );
                break;

              case 'progreso':
                updateProgress(
                  data.porcentaje || 25,
                  100,
                  data.mensaje || "Procesando..."
                );
                break;
                
              case 'exito':
                updateProgress(
                  data.porcentaje || 75,
                  100,
                  data.mensaje || "Operación exitosa..."
                );
                break;
                
              case 'completado':
                updateProgress(100, 100, data.mensaje || "Conciliación completada");
                
                
                
                // Si tiene resultado, procesarlo
                if (data.resultado) {
                  procesarResultadoConciliacion(data.resultado);
                }
                
                resolved = true;
                cleanup();
                resolve();
                break;
                
              case 'error':
                console.warn("Error en EventSource, cambiando a método fallback:", data.mensaje);
                resolved = true;
                cleanup();
                reject(new Error("FALLBACK_NEEDED"));
                break;

              default:
                
                // Para eventos no reconocidos, usar porcentaje incremental
                const defaultPercentage = data.porcentaje || 20;
                if (data.mensaje && !data.mensaje.includes('Error')) {
                  updateProgress(
                    defaultPercentage,
                    100,
                    data.mensaje
                  );
                }
                break;
            }
          } catch (parseError: any) {
            // Log más detallado del error para debugging
            console.warn("Error parseando evento EventSource:", {
              error: parseError,
              eventData: event.data,
              errorMessage: parseError?.message || "Error desconocido"
            });
            
            // Si el error contiene "Decimal", es el problema conocido
            if (event.data.includes('Decimal') || parseError?.message?.includes('Decimal')) {
              
            }
            
            if (!resolved) {
              resolved = true;
              cleanup();
              reject(new Error("FALLBACK_NEEDED"));
            }
          }
        };

        eventSource.onerror = function() {
          console.warn("Error de conexión EventSource, usando método fallback");
          if (!resolved) {
            resolved = true;
            cleanup();
            reject(new Error("FALLBACK_NEEDED"));
          }
        };

        eventSource.onopen = function() {
          
        };

        // Sin timeout fijo - EventSource se maneja naturalmente hasta completarse
        // Si hay problemas de red, el onerror activará el fallback automáticamente

      } catch (err) {
        console.error("Error inicializando EventSource:", err);
        if (!resolved) {
          resolved = true;
          reject(new Error("FALLBACK_NEEDED"));
        }
      }
    });
  };

  // Función de conciliación tradicional como fallback
  const ejecutarConciliacionFallback = async () => {
    updateProgress(25, 100, "Ejecutando conciliación ");

    const res = await fetch(
      `${API_BASE_URL}/conciliacion/conciliacion-automatica-fallback`
    );

    if (!res.ok) {
      throw new Error(await res.text());
    }

    updateProgress(75, 100, "Procesando resultados...");
    const data = await res.json();

    if (!data.resumen) {
      throw new Error("Datos de conciliación inválidos");
    }

    procesarResultadoConciliacion(data);
    updateProgress(100, 100, "Conciliación completada");
  };

  // Función para procesar el resultado de la conciliación
  const procesarResultadoConciliacion = (data: any) => {
    
    
    try {
      const dataConvertida: ResumenConciliacion = {
        resumen: {
          total_movimientos_banco: data.resumen.total_movimientos_banco ?? 0,
          total_pagos_conductores: data.resumen.total_pagos_iniciales ?? 0,
          conciliado_exacto: data.resumen.conciliado_exacto ?? 0,
          conciliado_aproximado: data.resumen.conciliado_aproximado ?? 0,
          multiple_match: 0,
          diferencia_valor: 0,
          diferencia_fecha: 0,
          sin_match: data.resumen.sin_match ?? 0,
        },
        resultados: data.resultados ?? [],
        fecha_conciliacion: data.fecha_conciliacion ?? "",
      };

     
      setResultadoConciliacion(dataConvertida);

      const totalConciliados = dataConvertida.resumen.conciliado_exacto + dataConvertida.resumen.conciliado_aproximado;
      const porcentajeConciliado = dataConvertida.resumen.total_movimientos_banco > 0
        ? Math.round((totalConciliados / dataConvertida.resumen.total_movimientos_banco) * 100)
        : 0;

      const mensajeResultado = `✅ Conciliación completada. ` +
        `Procesados: ${data.resumen.total_procesados ?? 0} movimientos. ` +
        `Conciliados: ${totalConciliados} (${porcentajeConciliado}%). ` +
        `Referencias únicas usadas: ${data.resumen.referencias_unicas_utilizadas ?? 0}.`;


      setMensaje(mensajeResultado);

      // Recargar estadísticas
      cargarEstadisticas();
      
    } catch (error) {
      console.error("❌ Error procesando resultado:", error);
      setMensaje("❌ Error procesando resultado de conciliación");
    }
  };

  // ✅ NUEVA FUNCIÓN PARA OBTENER TRANSACCIONES BANCARIAS DISPONIBLES
  const obtenerTransaccionesBancarias = async (referenciaPago: string) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/conciliacion/transacciones-bancarias-disponibles?referencia=${referenciaPago}`
      );

      if (!res.ok) {
        throw new Error("Error al obtener transacciones bancarias");
      }

      const data = await res.json();
      return data.transacciones || [];
    } catch (err: any) {
      console.error("Error obteniendo transacciones bancarias:", err);
      setMensaje("❌ Error al cargar transacciones bancarias: " + err.message);
      return [];
    }
  };

  // ✅ NUEVA FUNCIÓN PARA MOSTRAR MODAL DE SELECCIÓN DE TRANSACCIÓN
  const mostrarModalSeleccionTransaccion = async (pago: {
    referencia: string;
    valor: number;
    fecha: string;
    correo: string;
    entidad: string;
    tipo?: string; // Agregar el tipo de pago
  }) => {
   

    const transacciones = await obtenerTransaccionesBancarias(pago.referencia);
    
    if (transacciones.length === 0) {
      setMensaje("⚠️ No se encontraron transacciones bancarias disponibles para conciliar");
      return;
    }

    setModalSeleccionTransaccion({
      pago,
      transacciones_disponibles: transacciones,
    });
  };


  

  // ✅ NUEVA FUNCIÓN PARA MOSTRAR MODAL DE SELECCIÓN DE TRANSACCIONES BANCARIAS
  const mostrarModalSeleccionTransaccionBanco = async (resultado: ResultadoConciliacion) => {
    
    try {
      // Intentar usar el endpoint optimizado primero
      let transacciones = [];
      
      if (resultado.referencia_pago) {
        transacciones = await obtenerTransaccionesBancarias(resultado.referencia_pago);
      }
      
      // Si no hay referencia o no se encontraron transacciones, usar búsqueda por criterios
      if (transacciones.length === 0) {
        
        const fechaInicio = new Date(resultado.fecha_banco);
        fechaInicio.setDate(fechaInicio.getDate() - 7); // 7 días antes
        
        const fechaFin = new Date(resultado.fecha_banco);
        fechaFin.setDate(fechaFin.getDate() + 7); // 7 días después

        const params = new URLSearchParams({
          valor_min: (resultado.valor_banco * 0.9).toString(), // 10% de tolerancia
          valor_max: (resultado.valor_banco * 1.1).toString(),
          fecha_inicio: fechaInicio.toISOString().split('T')[0],
          fecha_fin: fechaFin.toISOString().split('T')[0],
          estado: 'pendiente' // Solo transacciones no conciliadas
        });

  
        
        const res = await fetch(
          `${API_BASE_URL}/conciliacion/obtener-movimientos-banco-disponibles?${params.toString()}`
        );

        if (res.ok) {
          const data = await res.json();
          transacciones = data.transacciones || [];
          
        } else {

        }
      }

      // Si aún no hay transacciones, intentar fallback
      if (transacciones.length === 0) {
        
        
        const fallbackRes = await fetch(
          `${API_BASE_URL}/conciliacion/pagos-pendientes-conciliar`
        );
        
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
         
          
          // Simular estructura de transacciones bancarias usando los pagos pendientes como base
          transacciones = fallbackData.pagos?.map((pago: any) => ({
            id: pago.referencia,
            fecha: pago.fecha_pago,
            valor_banco: pago.valor,
            cuenta: pago.entidad,
            descripcion: `Pago conductor - ${pago.correo}`,
            tipo: 'pago_conductor',
            estado_conciliacion: pago.conciliado ? 'conciliado' : 'pendiente',
            codigo: pago.referencia,
            cod_transaccion: pago.referencia_pago,
            porcentaje_similitud: 0,
            nivel_match: "⚫ Sin calcular"
          })).filter((t: any) => t.estado_conciliacion === 'pendiente') || [];
        }
      }

      
      
      setModalSeleccionTransaccion({
        pago: {
          referencia: resultado.referencia_pago || resultado.id_banco,
          valor: resultado.valor_banco,
          fecha: resultado.fecha_banco,
          correo: resultado.correo_conductor || "No disponible",
          entidad: resultado.entidad_pago || "Movimiento Bancario",
          tipo: resultado.entidad_pago || "Movimiento Bancario", // Usar entidad_pago como tipo
        },
        transacciones_disponibles: transacciones,
      });
      
      if (transacciones.length === 0) {
        setMensaje("⚠️ No se encontraron transacciones bancarias disponibles para conciliar");
      } else {
        
      }
      
    } catch (err: any) {
      console.error("💥 Error completo obteniendo transacciones bancarias:", err);
      
      // Mostrar modal temporal con mensaje de debug para que el usuario vea que está funcionando
      setModalSeleccionTransaccion({
        pago: {
          referencia: resultado.referencia_pago || resultado.id_banco,
          valor: resultado.valor_banco,
          fecha: resultado.fecha_banco,
          correo: resultado.correo_conductor || "No disponible",
          entidad: resultado.entidad_pago || "Movimiento Bancario",
          tipo: resultado.entidad_pago || "Movimiento Bancario", // Usar entidad_pago como tipo
        },
        transacciones_disponibles: [], // Lista vacía para mostrar el mensaje de error
      });
      
      setMensaje("❌ Error al cargar transacciones bancarias: " + err.message + " - Modal habilitado para debug");
    }
  };

  // ✅ FUNCIÓN PARA CONFIRMAR CONCILIACIÓN CON TRANSACCIÓN BANCARIA SELECCIONADA
  const confirmarConciliacionConTransaccionBancaria = async (
    idTransaccionBancaria: string,
    referenciaMovimientoOriginal: string
  ) => {
    // ✅ EVITAR MÚLTIPLES LLAMADAS SIMULTÁNEAS
    if (procesandoConciliacion || conciliandoTransaccion) {
      console.log("⚠️ Ya hay una conciliación en proceso, ignorando nueva solicitud");
      return;
    }
    
    try {
      // ✅ MARCAR COMO PROCESANDO CONCILIACIÓN ESPECÍFICA
      setConciliandoTransaccion(true);
      


      // ✅ MOSTRAR FEEDBACK INMEDIATO AL USUARIO
      setMensaje("🔄 Procesando conciliación manual...");

      const usuario = localStorage.getItem("correo") || "sistema@x-cargo.co";
      
      // ✅ CORRECCIÓN: Los parámetros correctos según el contexto
      // - idTransaccionBancaria: ID de la transacción bancaria seleccionada
      // - referenciaMovimientoOriginal: La referencia del movimiento que se quiere conciliar
      const requestBody = {
        id_banco: idTransaccionBancaria,
        referencia_pago: referenciaMovimientoOriginal,
        observaciones: "Conciliado manualmente - Transacción bancaria seleccionada por usuario",
        usuario,
        fecha_conciliacion: new Date().toISOString(),
      };



      const res = await fetch(
        `${API_BASE_URL}/conciliacion/marcar-conciliado-manual`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );


      if (!res.ok) {
        const errorText = await res.text();
        console.error("❌ Error del servidor:", errorText);
        let error;
        try {
          error = JSON.parse(errorText);
        } catch {
          error = { detail: errorText };
        }
        throw new Error(error.detail || "Error al conciliar transacción bancaria");
      }


      // ✅ 1. MOSTRAR MENSAJE DE ÉXITO CLARO Y PERSISTENTE PRIMERO
      const mensajeExito = `✅ ¡Conciliación exitosa! Transacción ${idTransaccionBancaria} conciliada con movimiento ${referenciaMovimientoOriginal}`;
      setMensaje(mensajeExito);
      
      // ✅ 2. CERRAR MODAL DESPUÉS DE MOSTRAR MENSAJE
      setModalSeleccionTransaccion(null);
      
      // ✅ 3. RECARGAR DATOS PARA REFLEJAR CAMBIOS INMEDIATAMENTE
      
      await cargarEstadisticas();
      
      // ✅ 4. REFRESCAR RESULTADOS DE CONCILIACIÓN SI EXISTEN
      if (resultadoConciliacion && resultadoConciliacion.resultados) {
        
        // Encontrar y actualizar el item conciliado en los resultados
        const nuevosResultados = resultadoConciliacion.resultados.map((item: ResultadoConciliacion) => {
          if (item.referencia_pago === referenciaMovimientoOriginal || item.id_banco === idTransaccionBancaria) {
            return {
              ...item,
              estado_match: 'conciliado_exacto' as const,
              observaciones: 'Conciliado manualmente'
            };
          }
          return item;
        });
        
        setResultadoConciliacion({
          ...resultadoConciliacion,
          resultados: nuevosResultados
        });
      }
      
      // ✅ 5. LIMPIAR MENSAJE DESPUÉS DE 8 SEGUNDOS CON REFERENCIA CORRECTA
      setTimeout(() => {
        setMensaje(prevMensaje => prevMensaje === mensajeExito ? "" : prevMensaje);
      }, 8000);
      
      
    } catch (err: any) {
      console.error("💥 Error completo en conciliación manual bancaria:", err);
      setMensaje(`❌ Error en conciliación: ${err.message}`);
      
      // Limpiar mensaje de error después de 10 segundos
      setTimeout(() => {
        setMensaje(prevMensaje => prevMensaje.includes("Error en conciliación") ? "" : prevMensaje);
      }, 10000);
    } finally {
      // ✅ SIEMPRE LIBERAR EL ESTADO DE PROCESAMIENTO
      setConciliandoTransaccion(false);
    }
  };

  const confirmarConciliacionManual = async (
    idBanco: string,
    referenciaPago: string
  ) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/conciliacion/marcar-conciliado-manual`,
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

  // Filtrado y ordenamiento visual por fecha y estado
  const resultadosFiltrados = (resultadoConciliacion?.resultados || [])
    .filter((r) => {
      const pasaFiltroEstado =
        filtroEstado === "todos" || r.estado_match === filtroEstado;
      const pasaBusqueda =
        busqueda === "" ||
        r.descripcion_banco.toLowerCase().includes(busqueda.toLowerCase()) ||
        (r.referencia_pago &&
          r.referencia_pago.toLowerCase().includes(busqueda.toLowerCase()));
      // Filtro por fecha visual (fecha_banco)
      let pasaFecha = true;
      if (fechaInicio) {
        pasaFecha = pasaFecha && r.fecha_banco >= fechaInicio;
      }
      if (fechaFin) {
        pasaFecha = pasaFecha && r.fecha_banco <= fechaFin;
      }
      return pasaFiltroEstado && pasaBusqueda && pasaFecha;
    })
    .sort((a, b) => {
      if (!a.fecha_banco || !b.fecha_banco) return 0;
      if (ordenFecha === "asc") {
        return a.fecha_banco.localeCompare(b.fecha_banco);
      } else {
        return b.fecha_banco.localeCompare(a.fecha_banco);
      }
    });

  // Función para actualizar el progreso con detalles mejorados
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

  const styleSheet = document.createElement("style");
  document.head.appendChild(styleSheet);

  return (
    <div className="cruces-container">
      <h2 className="titulo">Conciliación Bancaria Inteligente</h2>
      <h3 style={{ textAlign: "center" , marginBottom: "3rem", fontSize: "40px" }}><strong>Resumen General Movimientos Bancarios Totales</strong></h3>
      <div>
        <div className="estadisticas-panel">
          <div className="stat-card primary">
            <div className="stat-icon">📊</div>
             <span className="stat-label">TOTAL MOVIMIENTOS BANCARIOS  </span>
             <span className="stat-number">{estadisticasGenerales?.resumen_general?.total_movimientos?.toLocaleString() ?? 0}</span>
          </div>
          <div className="stat-card primary">
            <div className="stat-icon">💰</div>
             <span className="stat-label">VALOR TOTAL MOVIMIENTOS BANCARIOS </span>
             <span className="stat-number">{formatearMoneda(estadisticasGenerales?.total_valor_banco ?? 0)}</span>
          </div>
          <div className="stat-card primary">
            <div className="stat-icon">⏳</div>
             <span className="stat-label">MOVIMIENTOS PENDIENTES POR CONCILIAR </span>
             <span className="stat-number">{estadisticasGenerales?.resumen_general?.pendientes?.toLocaleString() ?? 0}</span>
          </div>
          <div className="stat-card primary">
            <div className="stat-icon">✅</div>
             <span className="stat-label">MOVIMIENTOS CONCILIADOS EXACTOS </span>
             <span className="stat-number">{estadisticasGenerales?.resumen_general?.conciliados_exactos?.toLocaleString() ?? 0}</span>
          </div>
          <div className="stat-card primary">
            <div className="stat-icon">🔸</div>
             <span className="stat-label">MOVIMIENTOS CONCILIADOS APROXIMADOS </span>
             <span className="stat-number">{estadisticasGenerales?.resumen_general?.conciliados_aproximados?.toLocaleString() ?? 0}</span>
          </div>
          <div className="stat-card primary">
            <div className="stat-icon">📄</div>
             <span className="stat-label">MOVIMIENTOS CONCILIADOS MANUALES </span>
             <span className="stat-number">{estadisticasGenerales?.resumen_general?.conciliados_manuales?.toLocaleString() ?? 0}</span>
          </div>



        </div>
      </div>






      {/* Estadísticas generales 
      {estadisticasGenerales && (
        <div className="estadisticas-panel">
         
            <div className="stat-card primary">
              <div className="stat-icon">📊</div>
              <div className="stat-content">
                <span className="stat-label">TOTAL MOVIMIENTOS </span>
                <span className="stat-number">
                  {estadisticasGenerales?.resumen_general?.total_movimientos?.toLocaleString() ?? 0}
                </span>
              </div>
            </div>
            
            <div className="stat-card success">
              <div className="stat-icon">💰</div>
              <div className="stat-content">
                <span className="stat-label">VALOR TOTAL</span>
                <span className="stat-number">
                  $
                  {estadisticasGenerales?.resumen_general?.valor_total?.toLocaleString("es-CO") ?? 0}
                </span>
              </div>
            </div>

            {estadisticasGenerales?.resumen_por_estado?.map((estado) => {
              const getEstadoIcon = (estado: string) => {
                switch (estado) {
                  case 'pendiente': return '⏳';
                  case 'conciliado_exacto': return '✅';
                  case 'conciliado_aproximado': return '🔸';
                  case 'sin_match': return '❌';
                  default: return '📄';
                }
              };

              const getEstadoClass = (estado: string) => {
                switch (estado) {
                  case 'pendiente': return 'warning';
                  case 'conciliado_exacto': return 'success';
                  case 'conciliado_aproximado': return 'info';
                  case 'sin_match': return 'danger';
                  default: return 'secondary';
                }
              };

              const getEstadoLabel = (estado: string) => {
                switch (estado) {
                  case 'pendiente': return 'PENDIENTE';
                  case 'conciliado_exacto': return 'CONCILIADO EXACTO';
                  case 'conciliado_aproximado': return 'CONCILIADO APROXIMADO';
                  case 'sin_match': return 'SIN MATCH';
                  default: return estado.replace('_', ' ').toUpperCase();
                }
              };

              return (
                <div key={estado.estado_conciliacion} className={`stat-card ${getEstadoClass(estado.estado_conciliacion)}`}>
                  <div className="stat-icon">{getEstadoIcon(estado.estado_conciliacion)}</div>
                  <div className="stat-content">
                    <span className="stat-label">{getEstadoLabel(estado.estado_conciliacion)}</span>
                    <span className="stat-number">{estado.cantidad}</span>
                    <span className="stat-sublabel">mov.</span>
                    <span className="stat-value">${estado.valor_total.toLocaleString("es-CO")}</span>
                  </div>
                </div>
              );
            })}
          
        </div>
      )} */}
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
              <div style={{ minWidth: "220px" }}>
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
                Estado:
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
              <label>
                Fecha desde:
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={e => setFechaInicio(e.target.value)}
                  style={{ marginLeft: 4 }}
                />
              </label>
              <label>
                hasta:
                <input
                  type="date"
                  value={fechaFin}
                  onChange={e => setFechaFin(e.target.value)}
                  style={{ marginLeft: 4 }}
                />
              </label>
              <label>
                Orden:
                <select
                  value={ordenFecha}
                  onChange={e => setOrdenFecha(e.target.value as 'asc' | 'desc')}
                  style={{ marginLeft: 4 }}
                >
                  <option value="desc">Más reciente primero</option>
                  <option value="asc">Más antiguo primero</option>
                </select>
              </label>
                <button
                  type="button"
                  style={{ marginLeft: 8, padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f3f4f6', cursor: 'pointer', fontSize: 14 }}
                  onClick={() => {
                    setFiltroEstado('todos');
                    setBusqueda("");
                    setFechaInicio("");
                    setFechaFin("");
                    setOrdenFecha('desc');
                  }}
                  aria-label="Limpiar filtros"
                >
                  Limpiar filtros
                </button>
            </div>
            <span className="contador-filtro">
              Mostrando {resultadosFiltrados.length} de {resultadoConciliacion?.resultados.length ?? 0}
            </span>
          </div>

          {/* Tabla de resultados */}
          <div className="tabla-conciliacion">
            <table>
              <thead>
                <tr>
                  <th>Fecha Banco</th>
                  <th>Valor consignacion</th>
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
                      {formatearFecha(resultado.fecha_banco)}
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
                        {resultado.valor_total_consignacion && (
                          <><p><strong>Valor consignación total:</strong> ${resultado.valor_total_consignacion?.toLocaleString("es-CO") ?? "No disponible"}</p><p><strong>Valor individual (guía):</strong> ${resultado.valor_individual?.toLocaleString("es-CO") ?? "No disponible"}</p></>
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
                            onClick={() => mostrarModalSeleccionTransaccionBanco(resultado)}
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
      ) : (
        <div style={{ textAlign: "center", padding: "1rem", color: "#666" }}>
          ⚠️ No hay resultados para mostrar. Verifica si los datos del banco
          coinciden con algún pago.
        </div>
      )}
      
      {/* Modal de Selección de Transacción Bancaria */}
      {modalSeleccionTransaccion && (
        <div
          className="modal-overlay"
          onClick={() => !conciliandoTransaccion && setModalSeleccionTransaccion(null)}
        >
          <div
            className="modal-content seleccion-transaccion"
            onClick={(e) => e.stopPropagation()}
            style={{ 
              opacity: conciliandoTransaccion ? 0.9 : 1,
              pointerEvents: conciliandoTransaccion ? 'none' : 'auto'
            }}
          >
            <h3>🏦 Seleccionar Transacción Bancaria para Conciliar</h3>
            
            {conciliandoTransaccion && (
              <div style={{
                background: '#fef3c7',
                border: '1px solid #f59e0b',
                borderRadius: '6px',
                padding: '0.75rem',
                marginBottom: '1rem',
                textAlign: 'center',
                color: '#92400e',
                fontWeight: '600'
              }}>
                ⏳ Procesando conciliación manual... Por favor espere.
              </div>
            )}

            <div className="detalle-grid">
              <div className="detalle-seccion">
                <h4> 🟢 Movimiento a Conciliar</h4>
                <div className="detalle-item">
                  <strong>ID Banco:</strong> {modalSeleccionTransaccion.pago.referencia}
                </div>
                <div className="detalle-item">
                  <strong>Fecha:</strong>{" "}
                  {formatearFecha(modalSeleccionTransaccion.pago.fecha)}
                </div>
                <div className="detalle-item">
                  <strong>Valor:</strong> $
                  {modalSeleccionTransaccion.pago.valor.toLocaleString("es-CO")}
                </div>
                <div className="detalle-item">
                  <strong>Tipo:</strong> {modalSeleccionTransaccion.pago.tipo}
                </div>
                {modalSeleccionTransaccion.pago.correo !== "No disponible" && (
                  <div className="detalle-item">
                    <strong>Conductor:</strong> {modalSeleccionTransaccion.pago.correo}
                  </div>
                )}
                {modalSeleccionTransaccion.pago.correo !== "No disponible" && (
                  <div className="detalle-item" >
                    <button onClick={() => verDetallesPago(modalSeleccionTransaccion.pago.referencia)}>
                      <strong>Comprobante:</strong>   
                      👁 Ver
                    </button>
                  </div>
                )}

                
                


              </div>

              <div className="detalle-seccion">
                <h4>🏦 Transacciones Bancarias Disponibles</h4>
                <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "12px" }}>
                  💡 Selecciona la transacción bancaria que corresponde al movimiento que deseas conciliar. 
                  Se muestran transacciones con valores similares (±10%) y fechas cercanas (±7 días).
                </p>
                <div className="transacciones-list">
                  {modalSeleccionTransaccion.transacciones_disponibles.length === 0 ? (
                    <div style={{ 
                      textAlign: "center", 
                      padding: "2rem", 
                      color: "#6b7280",
                      background: "#f9fafb",
                      borderRadius: "8px",
                      border: "1px dashed #d1d5db"
                    }}>
                      <p>❌ No se encontraron transacciones bancarias disponibles</p>
                      <p style={{ fontSize: "12px", marginTop: "8px" }}>
                        Intenta ajustar los criterios de búsqueda o verifica que existan movimientos bancarios sin conciliar.
                      </p>
                    </div>
                  ) : (
                    modalSeleccionTransaccion.transacciones_disponibles.map((transaccion, idx) => (
                    <div key={idx} className="transaccion-item">
                      <div className="transaccion-info">
                        <div>
                          <strong>ID Banco:</strong> {transaccion.id}
                        </div>
                        <div>
                          <strong>Fecha:</strong>{" "}
                          {formatearFecha(transaccion.fecha)}
                        </div>
                        <div>
                          <strong>Valor:</strong> $
                          {transaccion.valor_banco.toLocaleString("es-CO")}
                        </div>
                        <div>
                          <strong>Cuenta:</strong> {transaccion.cuenta}
                        </div>
                        <div>
                          <strong>Descripción:</strong> 
                          <span title={transaccion.descripcion}>
                            {transaccion.descripcion.length > 50 
                              ? transaccion.descripcion.substring(0, 50) + "..." 
                              : transaccion.descripcion}
                          </span>
                        </div>
                        <div>
                          <strong>Tipo:</strong> {transaccion.tipo}
                        </div>
                        {transaccion.codigo && (
                          <div>
                            <strong>Código:</strong> {transaccion.codigo}
                          </div>
                        )}
                        {transaccion.cod_transaccion && (
                          <div>
                            <strong>Cód. Transacción:</strong> {transaccion.cod_transaccion}
                          </div>
                        )}
                        <div>
                          <strong>Estado:</strong> 
                          <span className={`estado-badge ${transaccion.estado_conciliacion === 'pendiente' ? 'pending' : 'success'}`}>
                            {transaccion.estado_conciliacion === 'pendiente' ? '⏳ Pendiente' : '✅ Conciliado'}
                          </span>
                        </div>
                        {transaccion.porcentaje_similitud !== undefined && (
                          <div>
                            <strong>Similitud:</strong> 
                            <span className={`similitud-badge similitud-${getSimilitudClass(transaccion.porcentaje_similitud)}`}>
                              {transaccion.porcentaje_similitud}% {transaccion.nivel_match || ''}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {transaccion.estado_conciliacion === 'pendiente' && (
                        <button
                          className="btn-seleccionar"
                          disabled={conciliandoTransaccion}
                          onClick={() => {
                            confirmarConciliacionConTransaccionBancaria(
                              transaccion.id,
                              modalSeleccionTransaccion.pago.referencia
                            );
                          }}
                          style={{ 
                            opacity: conciliandoTransaccion ? 0.6 : 1,
                            cursor: conciliandoTransaccion ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {conciliandoTransaccion ? '⏳ Procesando...' : '✅ Seleccionar'}
                        </button>
                      )}
                    </div>
                  )))}
                </div>
              </div>
            </div>
            
            <div className="modal-acciones">
              <button
                className="btn-cerrar"
                disabled={conciliandoTransaccion}
                onClick={() => !conciliandoTransaccion && setModalSeleccionTransaccion(null)}
                style={{ 
                  opacity: conciliandoTransaccion ? 0.6 : 1,
                  cursor: conciliandoTransaccion ? 'not-allowed' : 'pointer'
                }}
              >
                {conciliandoTransaccion ? '⏳ Procesando...' : '✕ Cerrar'}
              </button>
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
                  {formatearFecha(modalDetalle.fecha_banco)}
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
                    {modalDetalle.fecha_pago && formatearFecha(modalDetalle.fecha_pago)}
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
                    // Cerrar el modal de detalle
                    setModalDetalle(null);
                    // Abrir el modal de selección de transacciones bancarias
                    mostrarModalSeleccionTransaccionBanco(modalDetalle);
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
      
      {/* Modal para mostrar comprobante de pago */}
      {modalComprobante && (
        <div className="modal-overlay" onClick={() => setModalComprobante(null)}>
          <div
            className="modal-content comprobante-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem',
              borderBottom: '1px solid #e5e7eb',
              background: '#f9fafb'
            }}>
              <h3 style={{ margin: 0, color: '#1f2937' }}>
                🧾 Comprobante de Pago - {modalComprobante.referencia}
              </h3>
              <button
                onClick={() => setModalComprobante(null)}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}
              >
                ✕
              </button>
            </div>
            
            <div style={{
              flex: 1,
              padding: '1rem',
              overflow: 'auto',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              {modalComprobante.url ? (
                <img
                  src={modalComprobante.url}
                  alt={`Comprobante ${modalComprobante.referencia}`}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const errorDiv = document.createElement('div');
                    errorDiv.innerHTML = `
                      <div style="text-align: center; padding: 2rem; color: #6b7280;">
                        <div style="font-size: 48px; margin-bottom: 1rem;">📷</div>
                        <p>❌ Error al cargar la imagen del comprobante</p>
                        <p style="font-size: 14px;">URL: ${modalComprobante.url}</p>
                      </div>
                    `;
                    target.parentNode?.appendChild(errorDiv);
                  }}
                />
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '2rem',
                  color: '#6b7280'
                }}>
                  <div style={{ fontSize: '48px', marginBottom: '1rem' }}>📄</div>
                  <p>⚠️ No hay comprobante disponible para esta referencia</p>
                </div>
              )}
            </div>
            
            <div style={{
              padding: '1rem',
              borderTop: '1px solid #e5e7eb',
              background: '#f9fafb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                💡 Tip: Haz clic fuera del modal o en la X para cerrar
              </div>
              {modalComprobante.url && (
                <a
                  href={modalComprobante.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: '#3b82f6',
                    color: 'white',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  🔗 Abrir en nueva pestaña
                </a>
              )}
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
              <span className="progress-spinner"></span>
              {loadingProgress.percentage}% - {loadingProgress.message || "Procesando archivo..."}
            </div>
          </div>
          {loadingProgress.processed > 0 && (
            <div className="progress-details">
              📄 Procesando archivo: {loadingProgress.processed} de {loadingProgress.total} líneas
            </div>
          )}
        </div>
      )}{" "}
      {procesandoConciliacion && (
        <div className="loading-container">
          <div className="loading-progress">
            <div
              className="progress-bar"
              style={{ width: `${loadingProgress.percentage}%` }}
            />
            <div className="progress-text">
              <span className="progress-spinner"></span>
              {loadingProgress.percentage}% - {loadingProgress.message || "Ejecutando conciliación..."}
            </div>
          </div>
          {loadingProgress.percentage > 0 && (
            <div className="progress-details">
              🔄 Conciliación automática en tiempo real - Procesando pagos y movimientos bancarios
            </div>
          )}
          {logsProgreso.length > 0 && (
            <div className="progress-logs">
              <div className="logs-header">📋 Log de Progreso:</div>
              <div className="logs-container">
                {logsProgreso.map((log, idx) => (
                  <div key={idx} className="log-item">{log}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Cruces;
