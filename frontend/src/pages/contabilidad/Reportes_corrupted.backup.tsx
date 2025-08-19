import { useEffect, useState } from "react";
import { saveAs } from "file-saver";
import "../../styles/contabilidad/Reportes.css";

// Utilidad para obtener el token desde localStorage
function getToken(): string {
  return localStorage.getItem("token") || "";
}

interface ReporteItem {
  referencia_pago: string;
  tracking: string;
  fecha: string;
  valor_individual: number; // Valor de este tracking específico
  valor_total_pago: number; // Valor total del pago completo
  tipo: string;
  soporte: string;
  cliente: string;
  carrier: string;
  valor_tn: number; // Valor individual de este TN
  saldo_individual: number; // Saldo acumulativo intercalado
  saldo_total_pago: number; // Saldo final total del pago
  estado_conciliacion: string;
  entidad: string;
  num_guias_total: number; // Total de guías en el pago
  correo_conductor: string;
  hora_pago?: string;
  fecha_creacion?: string;
  fecha_modificacion?: string;
  Id_Transaccion?: number;
  es_primer_tracking: boolean; // Para mostrar información agrupada solo en la primera fila
}

interface FiltrosReporte {
  tracking: string;
  referencia: string;
  desde: string;
  hasta: string;
  tipo: string;
  cliente: string;
  carrier: string;
  estado: string[];
  id_transaccion: string;
}

interface EstadisticasReporte {
  total_registros: number;
  total_valor: number;
  total_valor_tn: number;
  total_saldo: number;
  valor_promedio: number;
}

interface PaginacionInfo {
  total_registros: number;
  total_paginas: number;
  pagina_actual: number;
  registros_por_pagina: number;
  tiene_siguiente: boolean;
  tiene_anterior: boolean;
}

export default function ReportesContabilidad() {
  const [reportes, setReportes] = useState<ReporteItem[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string>("");
  const [estadisticas, setEstadisticas] = useState<EstadisticasReporte | null>(null);
  const [estadisticasGlobales, setEstadisticasGlobales] = useState<EstadisticasReporte | null>(null);
  const [paginaActual, setPaginaActual] = useState(1);
  const [registrosPorPagina] = useState(50);
  const [dropdownAbierto, setDropdownAbierto] = useState(false);
  
  const [filtros, setFiltros] = useState<FiltrosReporte>({
    tracking: "",
    referencia: "",
    desde: "",
    hasta: "",
    tipo: "",
    cliente: "",
    carrier: "",
    estado: ['pendiente_conciliacion', 'conciliado_manual', 'conciliado_automatico', 'rechazado'],
    id_transaccion: ""
  });

  const [paginacionInfo, setPaginacionInfo] = useState<PaginacionInfo>({
    total_registros: 0,
    total_paginas: 0,
    pagina_actual: 1,
    registros_por_pagina: 50,
    tiene_siguiente: false,
    tiene_anterior: false
  });

  const [filtrosAplicados, setFiltrosAplicados] = useState(false);

  const estadosDisponibles = [
    'pendiente_conciliacion',
    'conciliado_manual', 
    'conciliado_automatico',
    'rechazado'
  ];

  // Función para formatear fecha para el servidor
  const formatearFechaParaServidor = (fecha: string): string => {
    if (!fecha) return "";
    
    // Si ya está en formato YYYY-MM-DD, mantenerlo
    const formatoISO = /^\d{4}-\d{2}-\d{2}$/;
    if (formatoISO.test(fecha)) {
      return fecha;
    }
    
    // Si está en otro formato, convertir a YYYY-MM-DD
    const fechaObj = new Date(fecha);
    if (isNaN(fechaObj.getTime())) {
      console.warn('⚠️ Fecha inválida:', fecha);
      return "";
    }
    
    return fechaObj.toISOString().split('T')[0];
  };

  // Cargar estadísticas globales sin paginación
  const cargarEstadisticasGlobales = async (aplicarFiltrosForzado: boolean = false) => {
    try {
      console.log('🔍 Cargando estadísticas globales...');
      
      // Usar la MISMA lógica que cargarReportes para construir parámetros
      const params = new URLSearchParams();
      
      // Si aplicamos filtros o hay filtros activos, incluirlos
      if (aplicarFiltrosForzado || filtrosAplicados) {
        if (filtros.referencia.trim()) {
          params.append('referencia', filtros.referencia);
        }
        if (filtros.tracking.trim()) {
          params.append('tracking', filtros.tracking);
        }
        if (filtros.carrier.trim()) {
          params.append('carrier', filtros.carrier);
        }
        if (filtros.cliente.trim()) {
          params.append('cliente', filtros.cliente);
        }
        if (filtros.tipo.trim()) {
          params.append('tipo', filtros.tipo);
        }
        if (filtros.id_transaccion.trim()) {
          params.append('id_transaccion', filtros.id_transaccion);
        }
        if (filtros.desde) {
          const fechaFormateada = formatearFechaParaServidor(filtros.desde);
          if (fechaFormateada) {
            params.append('fecha_desde', fechaFormateada);
          }
        }
        if (filtros.hasta) {
          const fechaFormateada = formatearFechaParaServidor(filtros.hasta);
          if (fechaFormateada) {
            params.append('fecha_hasta', fechaFormateada);
          }
        }
        if (filtros.estado.length > 0) {
          filtros.estado.forEach(estado => {
            params.append('estado', estado);
          });
        }
      } else {
        // Primera carga: usar todos los estados como en cargarReportes
        estadosDisponibles.forEach(estado => {
          params.append('estado', estado);
        });
      }
      
      console.log('📊 Parámetros globales (endpoint estadísticas):', params.toString());

      const response = await fetch(`http://127.0.0.1:8000/pagos/estadisticas-pendientes-contabilidad?${params}`, {
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const estadisticas = await response.json();
      console.log('📊 Estadísticas globales recibidas:', estadisticas);
      
      // El endpoint devuelve estadísticas directamente
      setEstadisticasGlobales(estadisticas);
      
    } catch (error) {
      console.error('Error cargando estadísticas globales:', error);
      setEstadisticasGlobales(null);
    }
  };

  // Cargar reportes desde la API de pagos y obtener detalles de trackings
  const cargarReportes = async (pagina: number = paginaActual, aplicarFiltros: boolean = false) => {
    setCargando(true);
    setError("");
    
    try {
      const offset = (pagina - 1) * registrosPorPagina;
      
      // Construir parámetros de query
      const params = new URLSearchParams({
        limit: registrosPorPagina.toString(),
        offset: offset.toString()
      });

      // Aplicar filtros si están definidos o si ya se habían aplicado anteriormente
      if (aplicarFiltros || filtrosAplicados) {
        if (filtros.referencia.trim()) {
          params.append('referencia', filtros.referencia.trim());
        }
        if (filtros.tracking.trim()) {
          params.append('tracking', filtros.tracking.trim());
        }
        if (filtros.carrier.trim()) {
          params.append('carrier', filtros.carrier.trim());
        }
        if (filtros.cliente.trim()) {
          params.append('cliente', filtros.cliente.trim());
        }
        if (filtros.tipo.trim()) {
          params.append('tipo', filtros.tipo.trim());
        }
        if (filtros.id_transaccion.trim()) {
          params.append('id_transaccion', filtros.id_transaccion.trim());
        }
        if (filtros.desde) {
          const fechaFormateada = formatearFechaParaServidor(filtros.desde);
          if (fechaFormateada) {
            params.append('fecha_desde', fechaFormateada);
          }
        }
        if (filtros.hasta) {
          const fechaFormateada = formatearFechaParaServidor(filtros.hasta);
          if (fechaFormateada) {
            params.append('fecha_hasta', fechaFormateada);
          }
        }
        if (filtros.estado.length > 0) {
          filtros.estado.forEach(estado => {
            params.append('estado', estado);
          });
        }
      }

      console.log('🔍 Parámetros de búsqueda reportes:', params.toString());

      const response = await fetch(`http://127.0.0.1:8000/pagos/pendientes-contabilidad?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('📊 Datos de reportes recibidos:', data);
      
      // Procesar datos para obtener detalles de cada tracking
      let reportesProcesados: ReporteItem[] = [];
      
      if (data.pagos && Array.isArray(data.pagos)) {
        // Para cada pago, obtener sus detalles de trackings
        const promesasDetalles = data.pagos.map(async (pago: any) => {
          try {
            // Obtener detalles del pago para conseguir los trackings individuales
            let urlDetalles = `http://127.0.0.1:8000/pagos/detalles-pago/${pago.referencia_pago}`;
            if (pago.Id_Transaccion !== undefined && pago.Id_Transaccion !== null) {
              urlDetalles += `?id_transaccion=${pago.Id_Transaccion}`;
            }
            
            const responseDetalles = await fetch(urlDetalles, {
              headers: {
                Authorization: `Bearer ${getToken()}`
              }
            });

            if (!responseDetalles.ok) {
              console.warn(`No se pudieron obtener detalles para ${pago.referencia_pago}`);
              return [];
            }

            const dataDetalles = await responseDetalles.json();
            const detalles = dataDetalles.detalles || [];

            // Obtener valores reales de TN desde la base de datos
            let valoresTNReales: any = {};
            if (detalles.length > 0) {
              try {
                const trackingsString = detalles.map((d: any) => d.tracking || d.referencia).join(',');
                const urlValoresTN = `http://127.0.0.1:8000/pagos/valores-tn-reales?trackings=${encodeURIComponent(trackingsString)}&estado_conciliacion=${encodeURIComponent(pago.estado_conciliacion || 'pendiente_conciliacion')}`;
                
                const responseValoresTN = await fetch(urlValoresTN, {
                  headers: {
                    Authorization: `Bearer ${getToken()}`
                  }
                });

                if (responseValoresTN.ok) {
                  const dataValoresTN = await responseValoresTN.json();
                  valoresTNReales = dataValoresTN.valores_tn || {};
                  console.log(`💰 Valores TN obtenidos para ${pago.referencia_pago}:`, valoresTNReales);
                } else {
                  console.warn(`No se pudieron obtener valores TN para ${pago.referencia_pago}`);
                }
              } catch (error) {
                console.error(`Error obteniendo valores TN para ${pago.referencia_pago}:`, error);
              }
            }

            // Convertir cada detalle a ReporteItem
            return detalles.map((detalle: any, index: number) => {
              const tracking = detalle.tracking || detalle.referencia || `TN-${index + 1}`;
              const valorTNInfo = valoresTNReales[tracking] || {};
              const valorTNReal = valorTNInfo.valor_tn || 0;
              const clienteReal = valorTNInfo.cliente || detalle.cliente || pago.cliente || 'Cliente General';
              const carrierReal = valorTNInfo.carrier || detalle.carrier || pago.carrier || pago.correo_conductor || 'N/A';
              
              console.log(`📊 TN: ${tracking} - Valor: ${valorTNReal} - Cliente: ${clienteReal} - Carrier: ${carrierReal} - Fuente: ${valorTNInfo.fuente || 'detalle'}`);
              
              return {
                referencia_pago: pago.referencia_pago,
                tracking: tracking,
                fecha: pago.fecha || pago.fecha_pago || '',
                valor_individual: detalle.valor || 0,
                valor_total_pago: pago.valor || 0,
                tipo: pago.tipo || 'N/A',
                soporte: pago.referencia_pago || '',
                cliente: clienteReal,
                carrier: carrierReal,
                valor_tn: valorTNReal, // Valor real desde la BD
                saldo_individual: 0, // Se calculará después
                saldo_total_pago: 0, // Se calculará después
                estado_conciliacion: pago.estado_conciliacion || '',
                entidad: pago.entidad || '',
                num_guias_total: pago.num_guias || 0,
                correo_conductor: pago.correo_conductor || '',
                hora_pago: pago.hora_pago,
                fecha_creacion: pago.fecha_creacion,
                fecha_modificacion: pago.fecha_modificacion,
                Id_Transaccion: pago.Id_Transaccion,
                es_primer_tracking: index === 0 // Marcar el primer tracking de cada grupo
              };
            });

          } catch (error) {
            console.error(`Error obteniendo detalles para ${pago.referencia_pago}:`, error);
            // Fallback: crear un item básico si no se pueden obtener detalles
            return [{
              referencia_pago: pago.referencia_pago,
              tracking: pago.trackings_preview || pago.referencia_pago || '',
              fecha: pago.fecha || pago.fecha_pago || '',
              valor_individual: pago.valor || 0,
              valor_total_pago: pago.valor || 0,
              tipo: pago.tipo || 'N/A',
              soporte: pago.referencia_pago || '',
              cliente: 'Cliente General',
              carrier: pago.carrier || pago.correo_conductor || 'N/A',
              valor_tn: pago.valor || 0,
              saldo_individual: 0,
              saldo_total_pago: 0,
              estado_conciliacion: pago.estado_conciliacion || '',
              entidad: pago.entidad || '',
              num_guias_total: pago.num_guias || 0,
              correo_conductor: pago.correo_conductor || '',
              hora_pago: pago.hora_pago,
              fecha_creacion: pago.fecha_creacion,
              fecha_modificacion: pago.fecha_modificacion,
              Id_Transaccion: pago.Id_Transaccion,
              es_primer_tracking: true
            }];
          }
        });

        // Esperar a que se resuelvan todas las promesas y aplanar el resultado
        const resultados = await Promise.all(promesasDetalles);
        reportesProcesados = resultados.flat();

        // Agrupar por Id_Transaccion y ordenar por cliente dentro de cada grupo
        const pagosPorTransaccion = new Map<number, ReporteItem[]>();
        reportesProcesados.forEach(item => {
          const idTransaccion = item.Id_Transaccion || 0;
          if (!pagosPorTransaccion.has(idTransaccion)) {
            pagosPorTransaccion.set(idTransaccion, []);
          }
          pagosPorTransaccion.get(idTransaccion)!.push(item);
        });

        // Ordenar por cliente dentro de cada Id_Transaccion y calcular saldos
        const reportesFinales: ReporteItem[] = [];
        pagosPorTransaccion.forEach((items) => {
          // Ordenar los items por cliente alfabéticamente dentro de esta transacción
          items.sort((a, b) => (a.cliente || '').localeCompare(b.cliente || ''));
          
          const valorTotalPago = items[0]?.valor_total_pago || 0;
          let saldoAcumulativo = valorTotalPago; // Empezamos con el valor total del pago
          
          // Calcular saldo final total (para mostrar en la columna SALDO)
          const totalValorTN = items.reduce((sum, item) => sum + item.valor_tn, 0);
          const saldoFinalTotal = valorTotalPago - totalValorTN;

          items.forEach((item, index) => {
            // Restar el valor TN actual del saldo acumulativo
            saldoAcumulativo = saldoAcumulativo - item.valor_tn;
            
            item.saldo_individual = saldoAcumulativo; // Saldo intercalado acumulativo
            item.saldo_total_pago = saldoFinalTotal; // Saldo final total
            
            console.log(`🧮 ID: ${item.Id_Transaccion} - Cliente: ${item.cliente} - TN ${index + 1}: ${item.tracking} - Valor TN: ${item.valor_tn} - Saldo Acumulativo: ${saldoAcumulativo}`);
          });
          
          // Agregar todos los items de esta transacción al resultado final
          reportesFinales.push(...items);
        });
        
        // Usar los reportes ordenados por cliente dentro de cada transacción
        reportesProcesados = reportesFinales;
      }
      
      setReportes(reportesProcesados);
      
      // Actualizar información de paginación
      if (data.paginacion) {
        setPaginacionInfo(data.paginacion);
      } else {
        // Calcular paginación estimada basada en número de pagos originales, no trackings
        const numPagosOriginales = data.pagos?.length || 0;
        const totalEstimado = numPagosOriginales === registrosPorPagina ? 
          (pagina * registrosPorPagina) + 1 : 
          (pagina - 1) * registrosPorPagina + numPagosOriginales;
        setPaginacionInfo({
          total_registros: totalEstimado,
          total_paginas: Math.ceil(totalEstimado / registrosPorPagina),
          pagina_actual: pagina,
          registros_por_pagina: registrosPorPagina,
          tiene_siguiente: numPagosOriginales === registrosPorPagina,
          tiene_anterior: pagina > 1
        });
      }
      
      // Calcular estadísticas generales
      const stats: EstadisticasReporte = {
        total_registros: reportesProcesados.length,
        total_valor: reportesProcesados.reduce((sum, r) => sum + r.valor_individual, 0),
        total_valor_tn: reportesProcesados.reduce((sum, r) => sum + r.valor_tn, 0),
        total_saldo: reportesProcesados.reduce((sum, r) => sum + r.saldo_individual, 0),
        valor_promedio: reportesProcesados.length > 0 
          ? reportesProcesados.reduce((sum, r) => sum + r.valor_individual, 0) / reportesProcesados.length 
          : 0
      };
      
      setEstadisticas(stats);
      
    } catch (error) {
      console.error("Error cargando reportes:", error);
      setError("Error al cargar los reportes. Intente nuevamente.");
      setReportes([]);
      setPaginacionInfo({
        total_registros: 0,
        total_paginas: 0,
        pagina_actual: 1,
        registros_por_pagina: 50,
        tiene_siguiente: false,
        tiene_anterior: false
      });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    // Si es la primera carga (filtrosAplicados es false y página 1), buscar con todos los estados activos
    if (paginaActual === 1 && !filtrosAplicados) {
      cargarReportes(1, true);
      cargarEstadisticasGlobales(true); // Cargar estadísticas globales siempre
    } else {
      cargarReportes(paginaActual, filtrosAplicados);
      // Si hay filtros aplicados, mantener las estadísticas globales actualizadas
      if (filtrosAplicados) {
        cargarEstadisticasGlobales(true);
      }
    }
  }, [paginaActual]);

  // Función para detectar si hay filtros activos
  const hayFiltrosActivos = () => {
    return filtros.tracking.trim() !== "" ||
           filtros.referencia.trim() !== "" ||
           filtros.carrier.trim() !== "" || 
           filtros.desde !== "" ||
           filtros.hasta !== "" ||
           filtros.estado.length > 0;
  };

  // Función para validar rango de fechas
  const validarRangoFechas = (): string | null => {
    if (filtros.desde && filtros.hasta) {
      const desde = new Date(filtros.desde);
      const hasta = new Date(filtros.hasta);
      
      if (desde > hasta) {
        return "La fecha 'Desde' no puede ser mayor que la fecha 'Hasta'";
      }
      
      // Validar que no sea más de 1 año de diferencia
      const unAño = 365 * 24 * 60 * 60 * 1000;
      if (hasta.getTime() - desde.getTime() > unAño) {
        return "El rango de fechas no puede ser mayor a 1 año";
      }
    }
    return null;
  };

  const aplicarFiltros = () => {
    if (!hayFiltrosActivos()) {
      alert("Debe especificar al menos un filtro para realizar la búsqueda");
      return;
    }
    
    // Validar rango de fechas
    const errorFechas = validarRangoFechas();
    if (errorFechas) {
      alert(`❌ Error en las fechas: ${errorFechas}`);
      return;
    }
    
    setPaginaActual(1); // Resetear a la primera página
    setFiltrosAplicados(true);
    cargarReportes(1, true);
    cargarEstadisticasGlobales(true); // Cargar estadísticas de todos los datos
  };

  const limpiarFiltros = () => {
    setFiltros({
      tracking: "",
      referencia: "",
      desde: "",
      hasta: "",
      tipo: "",
      cliente: "",
      carrier: "",
      estado: [...estadosDisponibles],
      id_transaccion: ""
    });
    setPaginaActual(1);
    setFiltrosAplicados(false);
    setEstadisticasGlobales(null); // Limpiar estadísticas globales
    cargarReportes(1, false);
    // Recargar estadísticas globales después de limpiar filtros
    setTimeout(() => cargarEstadisticasGlobales(false), 100);
  };

  const exportarReportes = async () => {
    try {
      // Usar estadísticas globales para mostrar el número total que se va a exportar
      const totalRegistros = estadisticasGlobales?.total_registros || reportes.length || 0;
      
      if (totalRegistros === 0) {
        alert("No hay datos para exportar");
        return;
      }

      // Confirmar la exportación mostrando el número total
      const confirmacion = confirm(`¿Desea exportar ${totalRegistros.toLocaleString()} registros${filtrosAplicados ? ' filtrados' : ''}?`);
      if (!confirmacion) return;

      // Construir parámetros igual que en cargarReportes pero para exportar
      const params = new URLSearchParams();
      
      if (filtrosAplicados) {
        if (filtros.referencia.trim()) {
          params.append('referencia', filtros.referencia);
        }
        if (filtros.tracking.trim()) {
          params.append('tracking', filtros.tracking);
        }
        if (filtros.carrier.trim()) {
          params.append('carrier', filtros.carrier);
        }
        if (filtros.cliente.trim()) {
          params.append('cliente', filtros.cliente);
        }
        if (filtros.tipo.trim()) {
          params.append('tipo', filtros.tipo);
        }
        if (filtros.id_transaccion.trim()) {
          params.append('id_transaccion', filtros.id_transaccion);
        }
        if (filtros.desde) {
          const fechaFormateada = formatearFechaParaServidor(filtros.desde);
          if (fechaFormateada) {
            params.append('fecha_desde', fechaFormateada);
          }
        }
        if (filtros.hasta) {
          const fechaFormateada = formatearFechaParaServidor(filtros.hasta);
          if (fechaFormateada) {
            params.append('fecha_hasta', fechaFormateada);
          }
        }
        if (filtros.estado.length > 0) {
          filtros.estado.forEach(estado => {
            params.append('estado', estado);
          });
        }
      } else {
        // Si no hay filtros aplicados, usar todos los estados por defecto para exportar todo
        estadosDisponibles.forEach(estado => {
          params.append('estado', estado);
        });
      }

      // Llamar al endpoint de exportar que obtiene TODOS los datos
      const response = await fetch(`http://127.0.0.1:8000/pagos/exportar-pendientes-contabilidad?${params}`, {
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('📊 Datos de exportación recibidos:', data.pagos?.length || 0, 'pagos');

      if (!data.pagos || data.pagos.length === 0) {
        alert("No se encontraron datos para exportar");
        return;
      }

      // Procesar todos los datos para exportación EN LOTES para evitar saturar el navegador
      console.log(`🔄 Procesando ${data.pagos.length} pagos en lotes de 5...`);
      
      const BATCH_SIZE = 5; // Procesar solo 5 pagos a la vez (más conservador)
      const TIMEOUT_MS = 10000; // Timeout de 10 segundos por petición
      const todosLosReportes: any[] = [];
      
      // Función helper para hacer fetch con timeout
      const fetchWithTimeout = async (url: string, options: any, timeoutMs: number) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        try {
          const response = await fetch(url, {
            ...options,
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          return response;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      };
      
      for (let i = 0; i < data.pagos.length; i += BATCH_SIZE) {
        const lote = data.pagos.slice(i, i + BATCH_SIZE);
        const loteNumero = Math.floor(i/BATCH_SIZE) + 1;
        const totalLotes = Math.ceil(data.pagos.length/BATCH_SIZE);
        
        console.log(`🔄 Procesando lote ${loteNumero}/${totalLotes} (${lote.length} pagos) - ${i + 1} a ${Math.min(i + BATCH_SIZE, data.pagos.length)}`);
        
        const promesasLote = lote.map(async (pago: any, indexInLote: number) => {
          const globalIndex = i + indexInLote + 1;
          try {
            console.log(`📄 [${globalIndex}/${data.pagos.length}] Procesando: ${pago.referencia_pago}`);
            
            let urlDetalles = `http://127.0.0.1:8000/pagos/detalles-pago/${pago.referencia_pago}`;
            if (pago.Id_Transaccion !== undefined && pago.Id_Transaccion !== null) {
              urlDetalles += `?id_transaccion=${pago.Id_Transaccion}`;
            }
            
            const responseDetalles = await fetchWithTimeout(urlDetalles, {
              headers: { Authorization: `Bearer ${getToken()}` }
            }, TIMEOUT_MS);

            if (!responseDetalles.ok) {
              console.warn(`⚠️ [${globalIndex}] Error HTTP ${responseDetalles.status} para ${pago.referencia_pago} - SALTANDO`);
              return [];
            }

            const dataDetalles = await responseDetalles.json();
            const detalles = dataDetalles.detalles || [];
            console.log(`📋 [${globalIndex}] Detalles obtenidos: ${detalles.length} items para ${pago.referencia_pago}`);

            // Simplificar: crear registros directamente sin llamar a valores-tn-reales por ahora
            return detalles.map((detalle: any, index: number) => {
              const tracking = detalle.tracking || detalle.referencia || `TN-${index + 1}`;
              const valorIndividual = detalle.valor || 0;
              const valorTotalPago = pago.valor || 0;
              
              return {
                tracking,
                fecha: pago.fecha,
                valor_individual: valorIndividual,
                valor_total_pago: valorTotalPago,
                tipo: pago.tipo || 'N/A',
                soporte: pago.imagen || 'N/A',
                cliente: detalle.cliente || 'Cliente General',
                carrier: detalle.carrier || 'N/A',
                valor_tn: 0, // Simplificado por ahora
                saldo_individual: valorIndividual,
                saldo_total_pago: valorTotalPago,
                estado_conciliacion: pago.estado_conciliacion,
                referencia_pago: pago.referencia_pago,
                Id_Transaccion: pago.Id_Transaccion
              };
            });
          } catch (error: any) {
            if (error.name === 'AbortError') {
              console.error(`⏰ [${globalIndex}] Timeout para ${pago.referencia_pago} - SALTANDO`);
            } else {
              console.error(`❌ [${globalIndex}] Error procesando ${pago.referencia_pago}:`, error.message, '- SALTANDO');
            }
            return [];
          }
          });

          if (!responseDetalles.ok) {
            console.warn(`⚠️ Error en detalles para ${pago.referencia_pago}: ${responseDetalles.status}`);
            return [];
          }

          const dataDetalles = await responseDetalles.json();
          const detalles = dataDetalles.detalles || [];
          console.log(`📋 Detalles obtenidos para ${pago.referencia_pago}: ${detalles.length} items`);

          // Obtener valores reales de TN
          let valoresTNReales: any = {};
          if (detalles.length > 0) {
            try {
              const trackingsString = detalles.map((d: any) => d.tracking || d.referencia).join(',');
              const urlValoresTN = `http://127.0.0.1:8000/pagos/valores-tn-reales?trackings=${encodeURIComponent(trackingsString)}&estado_conciliacion=${encodeURIComponent(pago.estado_conciliacion || 'pendiente_conciliacion')}`;
              
              console.log(`🔢 URL valores TN: ${urlValoresTN}`);
              const responseValoresTN = await fetch(urlValoresTN, {
                headers: { Authorization: `Bearer ${getToken()}` }
              });

              if (responseValoresTN.ok) {
                const dataValoresTN = await responseValoresTN.json();
                valoresTNReales = dataValoresTN.valores_tn || {};
                console.log(`💰 Valores TN obtenidos para ${pago.referencia_pago}: ${Object.keys(valoresTNReales).length} trackings`);
              } else {
                console.warn(`⚠️ Error en valores TN para ${pago.referencia_pago}: ${responseValoresTN.status}`);
              }
            } catch (error) {
              console.error(`❌ Error obteniendo valores TN para exportación:`, error);
            }
          }

          return detalles.map((detalle: any, index: number) => {
            const tracking = detalle.tracking || detalle.referencia || `TN-${index + 1}`;
            const valorTNInfo = valoresTNReales[tracking] || {};
            const valorTNReal = valorTNInfo.valor_tn || 0;
            const valorIndividual = detalle.valor || 0;
            const valorTotalPago = pago.valor || 0;
            const saldoIndividual = valorIndividual - valorTNReal;
            const saldoTotalPago = valorTotalPago - valorTNReal;
            
            return {
              tracking,
              fecha: pago.fecha,
              valor_individual: valorIndividual,
              valor_total_pago: valorTotalPago,
              tipo: pago.tipo || 'N/A',
              soporte: pago.imagen || 'N/A',
              cliente: valorTNInfo.cliente || detalle.cliente || 'Cliente General',
              carrier: valorTNInfo.carrier || detalle.carrier || 'N/A',
              valor_tn: valorTNReal,
              saldo_individual: saldoIndividual,
              saldo_total_pago: saldoTotalPago,
              estado_conciliacion: pago.estado_conciliacion,
              referencia_pago: pago.referencia_pago,
              Id_Transaccion: pago.Id_Transaccion
            };
          });
        } catch (error) {
          console.error(`❌ Error procesando pago para exportación:`, pago.referencia_pago, error);
          return [];
        }
      });

        const resultadosLote = (await Promise.all(promesasLote)).flat();
        todosLosReportes.push(...resultadosLote);
        
        // Pequeña pausa entre lotes para no saturar
        if (i + BATCH_SIZE < data.pagos.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log('✅ Procesamiento completado. Total de registros procesados:', todosLosReportes.length);

      if (todosLosReportes.length === 0) {
        console.error('❌ No se pudieron procesar los datos para exportar');
        alert("No se pudieron procesar los datos para exportar. Revise la consola para más detalles.");
        return;
      }

      // Generar CSV con todos los datos
      console.log('📝 Generando CSV con', todosLosReportes.length, 'registros...');
      const csvContent = [
        "TRACKING,FECHA,VALOR_INDIVIDUAL,VALOR_TOTAL_PAGO,TIPO,SOPORTE,CLIENTE,CARRIER,VALOR_TN,SALDO_INDIVIDUAL,SALDO_TOTAL_PAGO,ESTADO,REFERENCIA_PAGO,ID_TRANSACCION",
        ...todosLosReportes.map(r => 
          `"${r.tracking}","${r.fecha}",${r.valor_individual},${r.valor_total_pago},"${r.tipo}","${r.soporte}","${r.cliente}","${r.carrier}",${r.valor_tn},${r.saldo_individual},${r.saldo_total_pago},"${r.estado_conciliacion}","${r.referencia_pago}",${r.Id_Transaccion || ''}`
        )
      ].join("\n");
      
      console.log('💾 Creando blob y descargando archivo...');
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
      const fechaHoy = new Date().toISOString().split('T')[0];
      const nombreArchivo = filtrosAplicados 
        ? `reportes_filtrados_${fechaHoy}.csv`
        : `reportes_completos_${fechaHoy}.csv`;
      
      console.log('📁 Nombre de archivo:', nombreArchivo);
      
      // Método alternativo para asegurar la descarga
      try {
        // Intentar con file-saver primero
        saveAs(blob, nombreArchivo);
        console.log('✅ Descarga iniciada con file-saver');
      } catch (error) {
        console.warn('⚠️ file-saver falló, usando método nativo:', error);
        
        // Método nativo como respaldo
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nombreArchivo;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        console.log('✅ Descarga iniciada con método nativo');
      }
      
      console.log('🎉 Exportación completada exitosamente');
      alert(`✅ Exportación completada: ${todosLosReportes.length.toLocaleString()} registros exportados`);

    } catch (error) {
      console.error('❌ Error crítico en exportación:', error);
      alert('Error al exportar los datos. Por favor, revise la consola y inténtelo de nuevo.');
    }
  };

  // FUNCIÓN DE EXPORTACIÓN SIMPLIFICADA
  const exportarReportesSimple = async () => {
    try {
      console.log('🚀 Iniciando exportación simplificada...');
      
      // Llamar al endpoint de exportación
      const url = 'http://127.0.0.1:8000/pagos/exportar-pendientes-contabilidad?estado=pendiente_conciliacion';
      console.log('📡 URL:', url);
      
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const data = await response.json();
      console.log('📊 Datos recibidos:', data.pagos?.length || 0, 'pagos');

      if (!data.pagos || data.pagos.length === 0) {
        alert("No hay datos para exportar");
        return;
      }

      // Crear CSV simple con los datos básicos
      const csvContent = [
        "REFERENCIA_PAGO,FECHA,VALOR,TIPO,ESTADO,ID_TRANSACCION",
        ...data.pagos.map((pago: any) => 
          `"${pago.referencia_pago}","${pago.fecha}",${pago.valor || 0},"${pago.tipo || 'N/A'}","${pago.estado_conciliacion}","${pago.Id_Transaccion || ''}"`
        )
      ].join("\n");
      
      // Crear descarga
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
      const fechaHoy = new Date().toISOString().split('T')[0];
      const nombreArchivo = `reportes_${fechaHoy}.csv`;
      
      // Descarga nativa
      const url2 = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url2;
      link.download = nombreArchivo;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url2);
      
      alert(`✅ Exportados ${data.pagos.length} registros como ${nombreArchivo}`);

    } catch (error) {
      console.error('❌ Error:', error);
      alert('Error al exportar. Revise la consola.');
    }
  };

  const formatearMoneda = (valor: number) => {
    return valor.toLocaleString('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  const getEstadoTexto = (estado: string | undefined): string => {
    if (!estado) return "⏳ Sin estado";
    const textos: { [key: string]: string } = {
      'pendiente_conciliacion': '⏳ Pendiente',
      'conciliado_manual': '🔎 Manual',
      'conciliado_automatico': '🤖 Automático',
      'rechazado': '❌ Rechazado',
    };
    return textos[estado.toLowerCase()] || estado;
  };

  // Función para manejar Enter en los campos de filtro
  const manejarEnterFiltros = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && hayFiltrosActivos() && !cargando) {
      aplicarFiltros();
    }
  };

  // Paginación
  const totalPaginas = paginacionInfo.total_paginas;
  const inicio = (paginaActual - 1) * registrosPorPagina;
  const fin = inicio + registrosPorPagina;

  // Funciones de paginación
  const irAPagina = (pagina: number) => {
    if (pagina >= 1 && pagina <= totalPaginas) {
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

  // Función para renderizar estadísticas
  const renderizarEstadisticas = () => {
    if (!(estadisticasGlobales || estadisticas)) return null;
    
    // Debug: Mostrar qué estadísticas se están usando
    console.log('🎯 Renderizando estadísticas:', {
      globales: estadisticasGlobales ? 'SÍ' : 'NO',
      pagina: estadisticas ? 'SÍ' : 'NO',
      usando: estadisticasGlobales ? 'GLOBALES' : 'PÁGINA'
    });
    
    return (
      <div className="estadisticas-reportes">
        {estadisticasGlobales && (
          <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#e8f5e8', borderRadius: '8px', border: '1px solid #4caf50' }}>
            <h4 style={{ margin: '0 0 5px 0', color: '#2e7d32', fontSize: '1rem', fontWeight: '600' }}>
              🌍 Totales Globales
            </h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#388e3c' }}>
              Estos totales incluyen todos los registros que coinciden con los filtros aplicados.
            </p>
          </div>
        )}
        <div className="stats-grid-reportes">
          <div className="stat-card">
            <div className="stat-icon blue">📋</div>
            <div className="stat-content">
              <div className="stat-number">{(estadisticasGlobales || estadisticas)!.total_registros.toLocaleString()}</div>
              <div className="stat-label">Total Registros</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon green">💰</div>
            <div className="stat-content">
              <div className="stat-number">{formatearMoneda((estadisticasGlobales || estadisticas)!.total_valor)}</div>
              <div className="stat-label">Valor Total</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon yellow">🚚</div>
            <div className="stat-content">
              <div className="stat-number">{formatearMoneda((estadisticasGlobales || estadisticas)!.total_valor_tn)}</div>
              <div className="stat-label">Total Valor TN</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon purple">💳</div>
            <div className="stat-content">
              <div className="stat-number">{formatearMoneda((estadisticasGlobales || estadisticas)!.total_saldo)}</div>
              <div className="stat-label">Saldo Total</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="reportes-contabilidad">
      {/* Header */}
      <div className="reportes-header">
        <h1 className="reportes-title">📊 Reportes</h1>
        <p className="reportes-subtitle">
          Sistema de reportes basado en datos de pagos
        </p>
      </div>

      {/* Información de paginación */}
      <div className="pagos-info" style={{ marginBottom: "1rem", padding: "0.5rem", backgroundColor: "#f8f9fa", borderRadius: "4px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.9rem", color: "#6c757d" }}>
            Mostrando {inicio + 1} - {Math.min(fin, paginacionInfo.total_registros)} de {paginacionInfo.total_registros} registros 
            (Página {paginaActual} de {totalPaginas})
          </span>
          {(filtrosAplicados && hayFiltrosActivos()) && (
            <span style={{ 
              fontSize: "0.85rem", 
              color: "#28a745", 
              fontWeight: "600",
              backgroundColor: "#d4edda",
              padding: "2px 8px",
              borderRadius: "12px",
              border: "1px solid #c3e6cb"
            }}>
              🔍 Filtros aplicados
            </span>
          )}
        </div>
      </div>

      {/* Estadísticas */}
      {renderizarEstadisticas()}

      {/* Filtros */}
      <div className="filtros-reportes">
        <h3 className="filtros-titulo">🔍 Filtros de Búsqueda</h3>
        
        <div className="filtros-grid">
          <div className="filtro-grupo">
            <label>Tracking:</label>
            <input
              type="text"
              placeholder="TN123456789..."
              value={filtros.tracking}
              onChange={(e) => setFiltros({...filtros, tracking: e.target.value})}
              onKeyDown={manejarEnterFiltros}
            />
          </div>

          <div className="filtro-grupo">
            <label>Referencia:</label>
            <input
              type="text"
              placeholder="REF123..."
              value={filtros.referencia}
              onChange={(e) => setFiltros({...filtros, referencia: e.target.value})}
              onKeyDown={manejarEnterFiltros}
            />
          </div>
          
          <div className="filtro-grupo">
            <label>Fecha desde:</label>
            <input
              type="date"
              value={filtros.desde}
              onChange={(e) => setFiltros({...filtros, desde: e.target.value})}
              onKeyDown={manejarEnterFiltros}
            />
          </div>
          
          <div className="filtro-grupo">
            <label>Fecha hasta:</label>
            <input
              type="date"
              value={filtros.hasta}
              onChange={(e) => setFiltros({...filtros, hasta: e.target.value})}
              onKeyDown={manejarEnterFiltros}
            />
          </div>
          
          <div className="filtro-grupo">
            <label>Carrier:</label>
            <input
              type="text"
              placeholder="Buscar carrier..."
              value={filtros.carrier}
              onChange={(e) => setFiltros({...filtros, carrier: e.target.value})}
              onKeyDown={manejarEnterFiltros}
            />
          </div>

          <div className="filtro-grupo">
            <label>ID Transacción:</label>
            <input
              type="text"
              placeholder="ID123..."
              value={filtros.id_transaccion}
              onChange={(e) => setFiltros({...filtros, id_transaccion: e.target.value})}
              onKeyDown={manejarEnterFiltros}
            />
          </div>

          <div style={{ minWidth: '180px', position: 'relative' }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600, color: "#1976d2" }}>
              Estado:
            </label>
            <button
              type="button"
              style={{
                width: '100%',
                background: '#f4f8fb',
                border: '1px solid #b6d4fa',
                borderRadius: 8,
                padding: '0.6rem 1rem',
                fontWeight: 600,
                color: '#1976d2',
                fontSize: '1rem',
                textAlign: 'left',
                cursor: 'pointer',
                boxShadow: '0 1px 4px 0 #e3eaf3',
                marginBottom: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8
              }}
              onClick={() => setDropdownAbierto((prev) => !prev)}
            >
              {filtros.estado.length === estadosDisponibles.length ? "Todos los estados" : `${filtros.estado.length} seleccionados`}
              <span style={{ fontSize: '0.8rem' }}>{dropdownAbierto ? '▲' : '▼'}</span>
            </button>
            {dropdownAbierto && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: 'white',
                border: '1px solid #b6d4fa',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 1000,
                maxHeight: '200px',
                overflowY: 'auto'
              }}>
                {estadosDisponibles.map((estado) => (
                  <label
                    key={estado}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.5rem 1rem',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f0f0f0',
                      fontSize: '0.9rem',
                      backgroundColor: filtros.estado.includes(estado) ? '#e3f2fd' : 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      if (!filtros.estado.includes(estado)) {
                        e.currentTarget.style.backgroundColor = '#f5f5f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = filtros.estado.includes(estado) ? '#e3f2fd' : 'transparent';
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filtros.estado.includes(estado)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFiltros({...filtros, estado: [...filtros.estado, estado]});
                        } else {
                          setFiltros({...filtros, estado: filtros.estado.filter(e => e !== estado)});
                        }
                      }}
                      style={{ marginRight: '0.5rem' }}
                    />
                    {getEstadoTexto(estado)}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="filtros-acciones">
          <button 
            onClick={aplicarFiltros} 
            className="btn-aplicar" 
            disabled={cargando || !hayFiltrosActivos()}
            style={{
              backgroundColor: !hayFiltrosActivos() ? "#6c757d" : undefined,
              cursor: !hayFiltrosActivos() ? "not-allowed" : "pointer"
            }}
          >
            {cargando ? '⏳ Buscando...' : '🔍 Buscar'}
          </button>
          <button 
            onClick={limpiarFiltros} 
            className="btn-limpiar"
            disabled={cargando}
            style={{
              backgroundColor: filtrosAplicados ? "#dc3545" : undefined,
              color: filtrosAplicados ? "white" : undefined
            }}
          >
            {filtrosAplicados ? "🗑️ Limpiar Filtros" : "🗑️ Limpiar"}
          </button>
          <button 
            onClick={exportarReportesSimple} 
            className="btn-exportar" 
            disabled={(estadisticasGlobales?.total_registros || reportes.length) === 0}
          >
            📥 Exportar ({(estadisticasGlobales?.total_registros || reportes.length).toLocaleString()})
          </button>
        </div>
      </div>

      {/* Mensajes de estado */}
      {error && (
        <div className="error-message">
          ⚠️ {error}
          <button onClick={() => cargarReportes(paginaActual, filtrosAplicados)} className="btn-reintentar">
            🔄 Reintentar
          </button>
        </div>
      )}

      {/* Tabla de reportes */}
      <div className="reportes-tabla-container">
        {cargando ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Cargando reportes...</p>
          </div>
        ) : reportes.length === 0 ? (
          <div className="no-data">
            <h3>📋 No se encontraron reportes</h3>
            <p>
              No hay datos disponibles con los filtros aplicados.
              Ajusta los filtros para encontrar los datos que buscas.
            </p>
          </div>
        ) : (
          <>
            <table className="reportes-tabla">
              <thead>
                <tr>
                  <th>ID TRANSACCIÓN</th>
                  <th>TRACKING</th>
                  <th>FECHA</th>
                  <th>VALOR TN</th>
                  <th>VALOR TOTAL PAGO</th>
                  <th>TIPO</th>
                  <th>SOPORTE</th>
                  <th>CLIENTE</th>
                  <th>CARRIER</th>
                  <th>SALDO TN</th>
                  <th>SALDO TOTAL</th>
                  <th>ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {reportes.map((reporte, idx) => (
                  <tr key={`${reporte.referencia_pago}-${reporte.tracking}-${idx}`}>
                    <td className="id-transaccion-cell">
                      {reporte.es_primer_tracking ? (
                        <span className="id-transaccion-badge">
                          {reporte.Id_Transaccion || 'N/A'}
                        </span>
                      ) : (
                        <span className="id-transaccion-continuacion">⋮</span>
                      )}
                    </td>
                    <td className="tracking-cell">
                      <span className="tracking-text">{reporte.tracking}</span>
                    </td>
                    <td className="fecha-cell">
                      {new Date(reporte.fecha).toLocaleDateString('es-ES')}
                    </td>
                    <td className="valor-cell">
                      <span className="valor-principal">
                        {formatearMoneda(reporte.valor_tn)}
                      </span>
                    </td>
                    <td className="valor-total-cell">
                      {reporte.es_primer_tracking ? (
                        <span className="valor-total">
                          {formatearMoneda(reporte.valor_total_pago)}
                        </span>
                      ) : (
                        <span className="valor-continuacion">⋮</span>
                      )}
                    </td>
                    <td className="tipo-cell">
                      <span className="tipo-badge">{reporte.tipo}</span>
                    </td>
                    <td className="soporte-cell">
                      {reporte.soporte}
                    </td>
                    <td className="cliente-cell">
                      {reporte.cliente}
                    </td>
                    <td className="carrier-cell">
                      <span className="carrier-badge">{reporte.carrier}</span>
                    </td>
                    <td className="saldo-individual-cell">
                      <span className="saldo-individual">
                        {formatearMoneda(reporte.saldo_individual)}
                      </span>
                    </td>
                    <td className="saldo-total-cell">
                      {reporte.es_primer_tracking ? (
                        <span className="saldo-total">
                          {formatearMoneda(reporte.saldo_total_pago)}
                        </span>
                      ) : (
                        <span className="saldo-continuacion">⋮</span>
                      )}
                    </td>
                    <td className="estado-cell">
                      <span className="estado-badge">{getEstadoTexto(reporte.estado_conciliacion)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Paginación */}
            {totalPaginas > 1 && (
              <div className="paginacion" style={{
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
                  className="btn-paginacion"
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
                  className="btn-paginacion"
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
          </>
        )}
      </div>
    </div>
  );
}
