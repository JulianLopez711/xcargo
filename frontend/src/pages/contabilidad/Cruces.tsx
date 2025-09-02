import React, { useState, useEffect } from "react";
import "../../styles/contabilidad/Cruces.css";

// 🎨 CSS para animaciones de carga
const spinKeyframes = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

// Inyectar estilos CSS al head si no existen
if (!document.querySelector('#pagination-spinner-styles')) {
  const style = document.createElement('style');
  style.id = 'pagination-spinner-styles';
  style.textContent = spinKeyframes;
  document.head.appendChild(style);
}




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
  referencia_pago: string;
  referencia_pago_original?: string;
  fecha_pago: string;
  valor_pago: number;
  diferencia_valor?: number;
  diferencia_dias?: number;
  trackings?: string;
  correo_conductor?: string;
  entidad_pago?: string;
  tipo?: string;
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
  id_transaccion?: string | number;
  // 🔥 CAMPOS ADICIONALES PARA CONCILIACIÓN MANUAL (del endpoint /pendientes-contabilidad)
  valor?: number;
  num_referencias?: number;
  es_grupo_transaccion?: boolean;
  Id_Transaccion?: number;
  entidad?: string;
  hora_pago?: string;
  estado_conciliacion?: string;
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
  total_movimientos_banco: number;
  conciliados_movimientos: number;
  pendientes_movimientos: number;
  total_valor_banco: number;
  total_pagosconductor:number;
  conciliados_pc: number;
  pendientes_pc: number;
  rechazados_pc: number;

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
    // 🔥 CAMPOS ADICIONALES PARA CONCILIACIÓN MANUAL
    referencia_pago_original?: string;
    valor_total_consignacion?: number;
    num_referencias?: number;
    es_grupo_transaccion?: boolean;
    id_transaccion?: string | number;
    entidad_original?: string;
    hora_pago?: string;
    estado_conciliacion?: string;
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
  const [transaccionesSeleccionadas, setTransaccionesSeleccionadas] = useState<string[]>([]);
  const [pendientesPorConciliar, setPendientesPorConciliar] = useState<ResultadoConciliacion[]>([]);
  const [mostrarPendientesManual, setMostrarPendientesManual] = useState(false);
  
  // 🔥 NUEVOS ESTADOS PARA PAGINACIÓN
  const [paginacionPendientes, setPaginacionPendientes] = useState({
    pagina_actual: 1,
    total_paginas: 1,
    total_registros: 0,
    registros_por_pagina: 50, // Reducido de 100 para mejor performance
    tiene_siguiente: false,
    tiene_anterior: false
  });
  const [cargandoPendientes, setCargandoPendientes] = useState(false);
  const [exportandoTablas, setExportandoTablas] = useState(false);
  const [reviertendoConciliaciones, setReviertendoConciliaciones] = useState(false);
  const [ejecutandoConsultas, setEjecutandoConsultas] = useState(false);
  const [error, setError] = useState<string>("");
  
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
  const [detallePagoSeleccionado, setDetallePagoSeleccionado] = useState<any>(null);
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
  // 🔥 NUEVO MODAL ESPECÍFICO PARA TABLA DE PENDIENTES (SIN useEffect PROBLEMÁTICO)
  const [modalPendientesConciliacion, setModalPendientesConciliacion] =
    useState<SeleccionTransaccionModal | null>(null);
    
  // 🖼️ ESTADO PARA CARRUSEL DE IMÁGENES
  const [carruselImagenes, setCarruselImagenes] = useState<{
    visible: boolean;
    imagenes: string[];
    indiceActual: number;
  }>({
    visible: false,
    imagenes: [],
    indiceActual: 0
  });
  
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

  //TEMPORAL: Concialiacion Manual

// 🔥 FUNCIÓN MEJORADA QUE CARGA TODOS LOS REGISTROS SIN LIMITACIONES
const cargarPendientesPorConciliar = async (pagina: number = 1, resetearDatos: boolean = false) => {
  try {
    setCargandoPendientes(true);
    
    // 🚀 QUITAR LIMITACIONES - CARGAR TODOS LOS REGISTROS
    // Usar un límite muy alto para obtener todos los registros de una vez
    const url = `https://api.x-cargo.co/pagos/pendientes-contabilidad?estado=pendiente_conciliacion&limit=10000&offset=0`;
    
    console.log(`🔍 Cargando TODOS los pendientes sin limitaciones:`, url);
    
    const res = await fetch(url);
    if (!res.ok) throw new Error("Error al obtener pendientes");
    
    const data = await res.json();
    console.log("🔍 Respuesta del endpoint pendientes-contabilidad (TODOS):", data);

    // Mapea los campos a los que espera la tabla
    const pendientes = (data.pagos || []).map((p: any) => ({
      referencia_pago: p.referencia_pago,
      referencia_pago_original: p.referencia_pago_original,
      fecha_pago: p.fecha || "",
      valor_pago: p.valor_total_consignacion || p.valor || 0,
      correo_conductor: p.correo_conductor || "",
      entidad_pago: p.entidad || "No especificada",
      tipo: p.tipo || "No especificado",
      ...p // conserva el resto por si lo necesitas
    }));

    console.log(`✅ TODOS LOS REGISTROS CARGADOS: ${pendientes.length} registros`);

    // 🔥 ORDENACIÓN GLOBAL DE TODOS LOS REGISTROS (DE MÁS VIEJO A MÁS NUEVO)
    const todosLosPendientesOrdenados = pendientes.sort((a: any, b: any) => {
      // 🔥 FUNCIÓN AUXILIAR PARA CONVERTIR FECHAS
      const convertirFecha = (fechaStr: string) => {
        if (!fechaStr) return new Date(0);
        
        // Si ya está en formato ISO (YYYY-MM-DD), usarla directamente
        if (fechaStr.includes('-') && fechaStr.length >= 10) {
          return new Date(fechaStr);
        }
        
        // Si está en formato DD/MM/YYYY, convertir
        if (fechaStr.includes('/')) {
          const partes = fechaStr.split('/');
          if (partes.length === 3) {
            const [dia, mes, año] = partes;
            return new Date(parseInt(año), parseInt(mes) - 1, parseInt(dia));
          }
        }
        
        // Fallback: intentar parsing directo
        return new Date(fechaStr);
      };
      
      const fechaA = convertirFecha(a.fecha_pago || a.fecha || '');
      const fechaB = convertirFecha(b.fecha_pago || b.fecha || '');
      
      return fechaA.getTime() - fechaB.getTime(); // Más viejo primero
    });

    console.log(`✅ Total registros después de ordenar: ${todosLosPendientesOrdenados.length}`);
    if (todosLosPendientesOrdenados.length > 0) {
      console.log(`📅 Primer registro: ${todosLosPendientesOrdenados[0].referencia_pago} - ${todosLosPendientesOrdenados[0].fecha_pago}`);
      console.log(`📅 Último registro: ${todosLosPendientesOrdenados[todosLosPendientesOrdenados.length - 1].referencia_pago} - ${todosLosPendientesOrdenados[todosLosPendientesOrdenados.length - 1].fecha_pago}`);
    }

    // 🔥 CONSERVAR TODOS LOS REGISTROS - NO ELIMINAR DUPLICADOS
    // Los pagos pueden tener la misma referencia pero diferentes valores y fechas
    console.log(`✅ Conservando todos los registros sin eliminar duplicados: ${todosLosPendientesOrdenados.length} registros`);

    // Actualizar el estado con todos los registros ordenados (sin filtrar duplicados)
    setPendientesPorConciliar(todosLosPendientesOrdenados);

    // Actualizar información de paginación con todos los datos
    const nuevaPaginacion = {
      pagina_actual: 1, // Siempre página 1 porque cargamos todo
      total_paginas: 1, // Solo una página porque tenemos todos los datos
      total_registros: todosLosPendientesOrdenados.length, // Total real
      registros_por_pagina: todosLosPendientesOrdenados.length, // Todos en una "página"
      tiene_siguiente: false, // No hay más páginas
      tiene_anterior: false // No hay páginas anteriores
    };
    
    setPaginacionPendientes(nuevaPaginacion);

    console.log(`✅ TODOS LOS REGISTROS CARGADOS Y LISTOS: ${todosLosPendientesOrdenados.length} registros`);
    console.log(`🎯 La paginación local manejará la visualización de ${todosLosPendientesOrdenados.length} registros`);
    
  } catch (error) {
    console.error("❌ Error al cargar pendientes:", error);
    setError("Error al cargar los pagos pendientes");
  } finally {
    setCargandoPendientes(false);
  }
};



// 🔥 FUNCIÓN PARA RECARGAR DESDE EL INICIO (CARGA AUTOMÁTICA COMPLETA)
const recargarPendientes = () => {
  console.log("🔄 Recargando todos los pendientes desde el inicio...");
  cargarPendientesPorConciliar(1, true);
};



// Nueva función para cargar detalles de pago usando Id_Transaccion o referencia_pago
const cargarDetallePago = async (
  referenciaPago: string | null,
  idTransaccion?: string | number | null,
  filtros?: {
    correo?: string;
    fecha_pago?: string;
    valor?: number;
    estado_conciliacion?: string;
    hora_pago?: string;
  }
) => {
  try {
    let url = `https://api.x-cargo.co/pagos/detalles-pago`;
    const params = new URLSearchParams();

    // Priorizar id_transaccion si está presente
    if (idTransaccion) {
      params.append('id_transaccion', idTransaccion.toString());
    } else if (referenciaPago) {
      params.append('referencia_pago', referenciaPago);
    }

    if (filtros) {
      if (filtros.correo) params.append('correo', filtros.correo);
      if (filtros.fecha_pago) params.append('fecha_pago', filtros.fecha_pago);
      if (filtros.valor !== undefined) params.append('valor', filtros.valor.toString());
      if (filtros.estado_conciliacion) params.append('estado_conciliacion', filtros.estado_conciliacion);
      if (filtros.hora_pago) params.append('hora_pago', filtros.hora_pago);
    }

    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    console.log("🔍 URL de petición con parámetros:", url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);
    const data = await response.json();
    console.log("🔍 Detalles del pago recibidos del endpoint:", data);
    setDetallePagoSeleccionado(data.detalles || null);
  } catch (err: any) {
    console.error("❌ Error cargando detalles del pago:", err);
    setDetallePagoSeleccionado(null);
  }
};

// Adaptar para usar id_transaccion si está disponible
// Cuando se abre el modal de selección, cargar detalles y mapearlos al modal
// 🔥 CONDICIONADO PARA EVITAR PETICIONES AUTOMÁTICAS INNECESARIAS
useEffect(() => {
  // ✅ SOLO EJECUTAR SI EL MODAL TIENE TRANSACCIONES CARGADAS
  // Esto evita peticiones automáticas cuando se usa mostrarModalSeleccionTransaccionBancoSinPeticion
  if (modalSeleccionTransaccion?.pago && modalSeleccionTransaccion.transacciones_disponibles.length > 0) {
    const filtros = {
      correo: modalSeleccionTransaccion.pago.correo !== "No disponible" ? modalSeleccionTransaccion.pago.correo : undefined,
      fecha_pago: modalSeleccionTransaccion.pago.fecha ? modalSeleccionTransaccion.pago.fecha.split('T')[0] : undefined,
      valor: modalSeleccionTransaccion.pago.valor
    };
    const idTransaccion = (modalSeleccionTransaccion.pago as any).id_transaccion || (modalSeleccionTransaccion.pago as any).Id_Transaccion || null;
    
    console.log("🔍 useEffect ejecutándose para modal con transacciones:", {
      referencia: modalSeleccionTransaccion.pago.referencia,
      transacciones_count: modalSeleccionTransaccion.transacciones_disponibles.length,
      id_transaccion: idTransaccion
    });
    
    // Llamar y mapear los detalles al modal
    cargarDetallePago(modalSeleccionTransaccion.pago.referencia || null, idTransaccion, filtros).then(() => {
      // Esperar a que setDetallePagoSeleccionado se actualice
      setTimeout(() => {
        if (Array.isArray(detallePagoSeleccionado) && detallePagoSeleccionado.length > 0) {
          const detalle = detallePagoSeleccionado[0];
          setModalSeleccionTransaccion((prev) => prev && {
            ...prev,
            pago: {
              referencia: detalle.referencia_pago || detalle.referencia || "",
              valor: detalle.valor || detalle.valor_total_consignacion_pc || 0,
              fecha: detalle.fecha_pago || "",
              correo: detalle.correo || "",
              entidad: detalle.cliente || "",
              tipo: detalle.tipo || "",
              comprobante: detalle.comprobante || "",
            }
          });
        }
      }, 300);
    });
  } else if (modalSeleccionTransaccion?.pago) {
    console.log("🚫 useEffect omitido - Modal sin transacciones cargadas:", {
      referencia: modalSeleccionTransaccion.pago.referencia,
      transacciones_count: modalSeleccionTransaccion.transacciones_disponibles.length
    });
  }
}, [modalSeleccionTransaccion]);


const verDetallesPago = async (referenciaPago: string, filtros?: {
  correo?: string;
  fecha_pago?: string;
  valor?: number;
  estado_conciliacion?: string;
}) => {
  try {
    // Construir la URL base
    let url = `https://api.x-cargo.co/pagos/detalles-pago-cruces/${referenciaPago}`;
    
    // Construir parámetros de consulta si se proporcionan filtros
    const params = new URLSearchParams();
    
    if (filtros) {
      if (filtros.correo) params.append('correo', filtros.correo);
      if (filtros.fecha_pago) params.append('fecha_pago', filtros.fecha_pago);
      if (filtros.valor !== undefined) params.append('valor', filtros.valor.toString());
      if (filtros.estado_conciliacion) params.append('estado_conciliacion', filtros.estado_conciliacion);
    }
    
    // Agregar parámetros a la URL si existen
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const comprobante = data.pago?.comprobante;

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

// 🔥 NUEVA FUNCIÓN PARA CARGAR COMPROBANTE DESDE MODAL DE PENDIENTES
const verComprobantePendiente = async (pago: any) => {
  try {
    // Construir la referencia para la URL
    const referencia = pago.referencia_pago_original || pago.referencia;
    
    if (!referencia) {
      alert("No se encontró referencia de pago");
      return;
    }

    // Construir URL base del endpoint /pagos/imagenes-pago
    let url = `https://api.x-cargo.co/pagos/imagenes-pago/${referencia}`;
    
    // Construir parámetros de consulta
    const params = new URLSearchParams();
    
    if (pago.correo && pago.correo !== "No disponible") {
      params.append('correo', pago.correo);
    }
    
    if (pago.fecha) {
      const fechaPago = pago.fecha.split('T')[0]; // Formato YYYY-MM-DD
      params.append('fecha_pago', fechaPago);
    }
    
    if (pago.valor_total_consignacion || pago.valor) {
      const valor = pago.valor_total_consignacion || pago.valor;
      params.append('valor', valor.toString());
    }
    
    // 🔥 USAR ID_TRANSACCION SI ESTÁ DISPONIBLE
    if (pago.id_transaccion) {
      params.append('id_transaccion', pago.id_transaccion.toString());
    }
    
    // Agregar parámetros a la URL
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    console.log("🔍 URL del comprobante pendiente:", url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log("🧾 Respuesta del endpoint imagenes-pago:", data);
    
    // Buscar todas las imágenes en la respuesta
    if (data.imagenes && Array.isArray(data.imagenes) && data.imagenes.length > 0) {
      console.log(`✅ Encontradas ${data.imagenes.length} imágenes, mostrando en carrusel...`);
      
      // Abrir carrusel de imágenes
      setCarruselImagenes({
        visible: true,
        imagenes: data.imagenes,
        indiceActual: 0
      });
    } else {
      console.warn("⚠️ No se encontraron imágenes en la respuesta:", data);
      alert("No se encontró comprobante para este pago");
    }
    
  } catch (err: any) {
    console.error("❌ Error cargando comprobante pendiente:", err);
    alert(`Error al cargar comprobante: ${err.message}`);
  }
};

// 🖼️ FUNCIONES PARA CONTROLAR EL CARRUSEL
const siguienteImagen = () => {
  setCarruselImagenes(prev => ({
    ...prev,
    indiceActual: (prev.indiceActual + 1) % prev.imagenes.length
  }));
};

const anteriorImagen = () => {
  setCarruselImagenes(prev => ({
    ...prev,
    indiceActual: prev.indiceActual === 0 ? prev.imagenes.length - 1 : prev.indiceActual - 1
  }));
};

const cerrarCarrusel = () => {
  setCarruselImagenes({
    visible: false,
    imagenes: [],
    indiceActual: 0
  });
};

// 🔄 FUNCIÓN PARA LIMPIAR SELECCIÓN DE TRANSACCIONES
const limpiarSeleccionTransacciones = () => {
  setTransaccionesSeleccionadas([]);
  console.log('🗑️ Selección de transacciones bancarias limpiada');
};

// 🚪 FUNCIÓN PARA CERRAR MODAL DE PENDIENTES Y CARRUSEL
const cerrarModalPendientes = () => {
  if (!conciliandoTransaccion) {
    setModalPendientesConciliacion(null);
    // También cerrar el carrusel si está abierto
    if (carruselImagenes.visible) {
      cerrarCarrusel();
    }
    console.log('🚪 Modal de pendientes y carrusel cerrados');
  }
};

// 📄 FUNCIONES DE NAVEGACIÓN DE PÁGINAS
const irAPagina = (nuevaPagina: number) => {
  if (nuevaPagina >= 1 && nuevaPagina <= paginacionManual.totalPaginas) {
    setPaginacionManual(prev => ({
      ...prev,
      paginaActual: nuevaPagina
    }));
    console.log(`📄 Navegando a página ${nuevaPagina}`);
  }
};

const paginaAnterior = () => {
  irAPagina(paginacionManual.paginaActual - 1);
};

const paginaSiguiente = () => {
  irAPagina(paginacionManual.paginaActual + 1);
};

  const verImagen = (src: string) => {
    if (!src) {
      alert("No hay comprobante disponible");
      return;
    }
    setImagenSeleccionada(src);
  };
  
const toggleSeleccionTransaccion = (idTransaccion: string) => {
  // Determinar cuál modal está activo
  const modalActivo = modalSeleccionTransaccion || modalPendientesConciliacion;
  if (!modalActivo) return;
  
  const numReferenciasAgrupadas = modalActivo.pago.num_referencias || 1;
  
  setTransaccionesSeleccionadas(prev => {
    if (prev.includes(idTransaccion)) {
      // Si ya está seleccionada, removerla
      return prev.filter(id => id !== idTransaccion);
    } else {
      // Verificar si ya se alcanzó el límite de selecciones
      if (prev.length >= numReferenciasAgrupadas) {
        alert(`⚠️ Solo puedes seleccionar ${numReferenciasAgrupadas} transacción(es) bancaria(s) para ${numReferenciasAgrupadas} referencia(s) agrupada(s).`);
        return prev; // No agregar más
      }
      // Si no está seleccionada y no se ha alcanzado el límite, agregarla
      return [...prev, idTransaccion];
    }
  });
};


// Función para seleccionar todas las transacciones disponibles
const seleccionarTodasTransacciones = () => {
  // Determinar cuál modal está activo
  const modalActivo = modalSeleccionTransaccion || modalPendientesConciliacion;
  if (!modalActivo) return;
  
  const numReferenciasAgrupadas = modalActivo.pago.num_referencias || 1;
  
  const todasDisponibles = modalActivo.transacciones_disponibles
    .filter(t => t.estado_conciliacion === 'pendiente')
    .map(t => t.id)
    .slice(0, numReferenciasAgrupadas); // Limitar al número de referencias agrupadas
  
  setTransaccionesSeleccionadas(todasDisponibles);
  
  // Mostrar mensaje informativo si hay más transacciones disponibles que el límite
  const totalDisponibles = modalActivo.transacciones_disponibles
    .filter(t => t.estado_conciliacion === 'pendiente').length;
  
  if (totalDisponibles > numReferenciasAgrupadas) {
    alert(`ℹ️ Se seleccionaron las primeras ${numReferenciasAgrupadas} transacciones. Solo puedes seleccionar ${numReferenciasAgrupadas} para ${numReferenciasAgrupadas} referencia(s) agrupada(s).`);
  }
};

// Función para limpiar todas las selecciones
const limpiarSelecciones = () => {
  setTransaccionesSeleccionadas([]);
};




  const [logsProgreso, setLogsProgreso] = useState<string[]>([]);

  const [imagenSeleccionada, setImagenSeleccionada] = useState<string | null>(null);


    const [modalComprobante, setModalComprobante] = useState<{
    url: string;
    referencia: string;
  } | null>(null);
  
  const [conciliandoTransaccion, setConciliandoTransaccion] = useState(false);
  const [cargandoTransaccionesBanco, setCargandoTransaccionesBanco] = useState(false);

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



      // Procesar los datos con validación
      const estadisticas = {
        
        total_movimientos_banco: data.total_movimientos_banco,
        conciliados_movimientos: data.conciliados_movimientos,
        pendientes_movimientos: data.pendientes_movimientos,
        total_valor_banco: data.total_valor_banco,
        total_pagosconductor: data.total_pagosconductor,
        conciliados_pc: data.conciliados_pc,
        pendientes_pc: data.pendientes_pc,
        rechazados_pc: data.rechazados_pc

      };

      setEstadisticasGenerales(estadisticas);
    } catch (err: any) {
      console.error("Error cargando estadísticas:", err);
      setMensaje(`❌ Error: ${err.message}`);
    }
  };

  // 📤 FUNCIÓN PARA EXPORTAR TODAS LAS TABLAS
  const exportarTablas = async () => {
    try {
      setExportandoTablas(true);
      setMensaje("🔄 Iniciando exportación de tablas...");
      
      const response = await fetch(
        `${API_BASE_URL}/conciliacion/exportar-tablas`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error del servidor: ${errorText}`);
      }

      const data = await response.json();
      
      // Mostrar resultado detallado
      if (data.estadisticas.exportaciones_exitosas > 0) {
        setMensaje(
          `✅ Exportación completada: ${data.estadisticas.exportaciones_exitosas}/${data.estadisticas.total_tablas} tablas exportadas exitosamente`
        );
        
        // Mostrar archivos exportados
        console.log("📄 Archivos exportados:", data.archivos_exportados);
        
        // Limpiar mensaje después de 8 segundos
        setTimeout(() => {
          setMensaje("");
        }, 8000);
      } else {
        setMensaje("⚠️ No se pudieron exportar las tablas");
      }
      
    } catch (err: any) {
      console.error("❌ Error exportando tablas:", err);
      setMensaje(`❌ Error en exportación: ${err.message}`);
      
      // Limpiar mensaje de error después de 6 segundos
      setTimeout(() => {
        setMensaje("");
      }, 6000);
    } finally {
      setExportandoTablas(false);
    }
  };

  // 🔄 FUNCIÓN PARA REVERTIR CONCILIACIONES AUTOMÁTICAS - SIMPLIFICADA
  const revertirConciliacionesAutomaticas = async () => {
    try {
      setReviertendoConciliaciones(true);
      console.log("🔄 Iniciando reversión de conciliaciones automáticas...");
      
      const response = await fetch(
        `${API_BASE_URL}/conciliacion/revertir-conciliaciones-automaticas`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Error del servidor:", errorText);
        return;
      }

      const data = await response.json();
      console.log("✅ Respuesta del endpoint revertir-conciliaciones-automaticas:", data);
      
      // Recargar estadísticas sin mostrar mensajes complicados
      cargarEstadisticas();
      
    } catch (err: any) {
      console.error("❌ Error ejecutando reversión:", err);
    } finally {
      setReviertendoConciliaciones(false);
    }
  };

  // 📊 FUNCIÓN PARA EJECUTAR CONSULTAS - GENÉRICA
  const ejecutarConsultas = async () => {
    try {
      setEjecutandoConsultas(true);
      setMensaje("🔄 Ejecutando consulta...");
      
      const response = await fetch(
        `${API_BASE_URL}/conciliacion/consultas`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error del servidor: ${errorText}`);
      }

      const data = await response.json();
      
      // Mostrar resultado genérico de éxito
      console.log("✅ Respuesta completa del endpoint:", data);
      
      // Mensaje genérico de éxito
      setMensaje(
        `✅ Consulta ejecutada exitosamente!\n` +
        `� Operación completada correctamente\n` +
        `⏰ Timestamp: ${data.timestamp || new Date().toISOString()}`
      );
      
      // Limpiar mensaje después de 8 segundos
      setTimeout(() => {
        setMensaje("");
      }, 8000);
      
    } catch (err: any) {
      console.error("❌ Error ejecutando consultas:", err);
      setMensaje(`❌ Error en consulta: ${err.message}`);
      
      // Limpiar mensaje de error después de 8 segundos
      setTimeout(() => {
        setMensaje("");
      }, 8000);
    } finally {
      setEjecutandoConsultas(false);
    }
  };

// ✅ NUEVA FUNCIÓN PARA CARGAR PAGOS PENDIENTES DE CONCILIAR

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
      console.log("🔍 Datos de conciliación recibidos:", data.resultados);
      
      // 🔥 PROCESAR DATOS PERO NO MOSTRAR LA TABLA DE RESULTADOS
      const totalConciliados = (data.resumen?.conciliado_exacto ?? 0) + (data.resumen?.conciliado_aproximado ?? 0);
      const totalProcesados = data.resumen?.total_procesados ?? 0;
      const sinMatch = data.resumen?.sin_match ?? 0;
      
      const porcentajeConciliado = totalProcesados > 0
        ? Math.round((totalConciliados / totalProcesados) * 100)
        : 0;

      const mensajeResultado = `✅ Conciliación completada. ` +
        `Procesados: ${totalProcesados} movimientos. ` +
        `Conciliados: ${totalConciliados} (${porcentajeConciliado}%). ` +
        `Sin match: ${sinMatch}.`;

      console.log("📊 Resumen de conciliación:", {
        totalProcesados,
        totalConciliados,
        sinMatch,
        porcentajeConciliado
      });

      setMensaje(mensajeResultado);

      // 🔥 RECARGAR ESTADÍSTICAS PRIMERO
      cargarEstadisticas();
      
      // 🔥 DESPUÉS DE LA CONCILIACIÓN, ABRIR AUTOMÁTICAMENTE LA TABLA DE CONCILIACIÓN MANUAL
      setTimeout(() => {
        console.log("🔄 Abriendo automáticamente tabla de conciliación manual para continuar el flujo...");
        setMostrarPendientesManual(true);
        
        // Cargar pendientes automáticamente si no están cargados
        if (pendientesPorConciliar.length === 0) {
          cargarPendientesPorConciliar(1, true);
        }
        
        // Limpiar mensaje después de mostrar la tabla
        setTimeout(() => {
          setMensaje("");
        }, 5000);
      }, 1500); // Pequeña pausa para que se vean las estadísticas actualizadas
      
    } catch (error) {
      console.error("❌ Error procesando resultado:", error);
      setMensaje("❌ Error procesando resultado de conciliación");
    }
  };

  // ✅ NUEVA FUNCIÓN PARA OBTENER TRANSACCIONES BANCARIAS DISPONIBLES
  // ✅ FUNCIÓN MEJORADA PARA OBTENER TRANSACCIONES BANCARIAS CON FILTROS OPCIONALES
const obtenerTransaccionesBancarias = async (
  referenciaPago: string, 
  fechaPago?: string, 
  valor?: number
) => {
  try {
    // ✅ Construir URL con parámetros opcionales
    const params = new URLSearchParams();
    params.append('referencia', referenciaPago);
    
    if (fechaPago) {
      params.append('fecha_pago', fechaPago);
    }
    
    if (valor !== undefined) {
      params.append('valor', valor.toString());
    }

    const url = `${API_BASE_URL}/conciliacion/transacciones-bancarias-disponibles?${params.toString()}`;
    
    console.log(`🔍 Obteniendo transacciones bancarias con URL: ${url}`);
    
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error("Error al obtener transacciones bancarias");
    }

    const data = await res.json();
    console.log(`✅ Transacciones bancarias obtenidas:`, data);
    
    return data.transacciones || [];
  } catch (err: any) {
    console.error("Error obteniendo transacciones bancarias:", err);
    setMensaje("❌ Error al cargar transacciones bancarias: " + err.message);
    return [];
  }
};

const mostrarModalSeleccionTransaccionBanco = async (resultado: ResultadoConciliacion, esConciliacionManual: boolean = false) => {
  try {
    // ✅ VALIDACIÓN INICIAL - Verificar que resultado tenga los campos necesarios
    if (!resultado) {
      console.error("❌ Resultado es null o undefined");
      setMensaje("❌ Error: Datos incompletos para mostrar transacciones bancarias");
      return;
    }

    // Intentar usar el endpoint optimizado primero CON FILTROS OPCIONALES
    let transacciones = [];
    
    // 🔥 USAR referencia_pago_original COMO PRIORIDAD, fallback a referencia_pago
    const referenciaParaBuscar = resultado.referencia_pago_original || resultado.referencia_pago;
    
    if (referenciaParaBuscar) {
      // ✅ PREPARAR FILTROS OPCIONALES
      const fechaPagoParam = resultado.fecha_pago ? resultado.fecha_pago.split('T')[0] : undefined;
      const valorPagoParam = resultado.valor_pago;
      
      console.log(`🔍 Buscando transacciones bancarias para:`, {
        referencia_original: resultado.referencia_pago_original,
        referencia_display: resultado.referencia_pago,
        referencia_usada: referenciaParaBuscar,
        fecha: fechaPagoParam,
        valor: valorPagoParam,
        esConciliacionManual
      });
      
      // ✅ LLAMAR CON PARÁMETROS OPCIONALES usando referencia_pago_original
      transacciones = await obtenerTransaccionesBancarias(
        referenciaParaBuscar,
        fechaPagoParam,
        valorPagoParam
      );
    }
    
    // Si no hay referencia o no se encontraron transacciones, usar búsqueda por criterios (FALLBACK)
    if (transacciones.length === 0) {
      console.log("🔄 No se encontraron transacciones con endpoint optimizado, usando fallback...");
      
      // ✅ VALIDACIÓN SEGURA para fechas
      const fechaExacta = resultado.fecha_pago && resultado.fecha_pago !== null 
        ? resultado.fecha_pago.split('T')[0] 
        : new Date().toISOString().split('T')[0];

      const params = new URLSearchParams({
        valor_min: resultado.valor_pago.toString(),
        valor_max: resultado.valor_pago.toString(),
        fecha_inicio: fechaExacta,
        fecha_fin: fechaExacta,
        estado: 'pendiente' // Solo transacciones no conciliadas
      });

      const res = await fetch(
        `${API_BASE_URL}/conciliacion/obtener-movimientos-banco-disponibles?${params.toString()}`
      );

      if (res.ok) {
        const data = await res.json();
        transacciones = data.transacciones || [];
        console.log(`✅ Transacciones obtenidas con fallback: ${transacciones.length}`);
      } else {
        console.error("❌ Error en endpoint fallback:", res.statusText);
      }
    }
    
    setModalSeleccionTransaccion({
      pago: {
        referencia: referenciaParaBuscar || resultado.id_banco || "Sin referencia",
        valor: resultado.valor_pago || 0,
        fecha: resultado.fecha_pago || new Date().toISOString(),
        correo: resultado.correo_conductor || "No disponible",
        entidad: resultado.entidad_pago || "No especificada",
        tipo: resultado.tipo || "No especificado",
        // 🔥 DATOS ESPECÍFICOS PARA CONCILIACIÓN MANUAL
        ...(esConciliacionManual && {
          // Usar datos del endpoint /pendientes-contabilidad
          referencia_pago_original: resultado.referencia_pago_original,
          valor_total_consignacion: resultado.valor_total_consignacion || resultado.valor_pago || resultado.valor,
          num_referencias: resultado.num_referencias,
          es_grupo_transaccion: resultado.es_grupo_transaccion,
          id_transaccion: resultado.Id_Transaccion || resultado.id_transaccion,
          entidad_original: resultado.entidad,
          hora_pago: resultado.hora_pago,
          estado_conciliacion: resultado.estado_conciliacion
        })
      },
      transacciones_disponibles: transacciones,
    });
    
    if (transacciones.length === 0) {
      setMensaje("⚠️ No se encontraron transacciones bancarias disponibles para conciliar");
    } else {
      console.log(`✅ Modal configurado con ${transacciones.length} transacciones disponibles`);
    }
    
  } catch (err: any) {
    console.error("💥 Error completo obteniendo transacciones bancarias:", err);
    
    // ✅ MOSTRAR MODAL AUNQUE HAYA ERROR para que el usuario pueda ver la información disponible
    const referenciaParaMostrar = resultado?.referencia_pago_original || resultado?.referencia_pago || resultado?.id_banco || "Sin referencia";
    
    setModalSeleccionTransaccion({
      pago: {
        referencia: referenciaParaMostrar,
        valor: resultado?.valor_pago || 0,
        fecha: resultado?.fecha_pago || new Date().toISOString(),
        correo: resultado?.correo_conductor || "No disponible",
        entidad: resultado?.entidad_pago || "No especificada",
        tipo: resultado?.tipo || "No especificado",
        // 🔥 INCLUIR DATOS PARA CONCILIACIÓN MANUAL INCLUSO EN ERROR
        ...(esConciliacionManual && {
          referencia_pago_original: resultado?.referencia_pago_original,
          valor_total_consignacion: resultado?.valor_total_consignacion || resultado?.valor_pago || resultado?.valor,
          num_referencias: resultado?.num_referencias,
          es_grupo_transaccion: resultado?.es_grupo_transaccion,
          id_transaccion: resultado?.Id_Transaccion || resultado?.id_transaccion,
          entidad_original: resultado?.entidad,
          hora_pago: resultado?.hora_pago,
          estado_conciliacion: resultado?.estado_conciliacion
        })
      },
      transacciones_disponibles: [], // Lista vacía para mostrar el mensaje de error
    });
    
    setMensaje(`❌ Error al cargar transacciones bancarias: ${err.message}`);
  }
};

// 🔥 NUEVA FUNCIÓN ESPECÍFICA PARA TABLA DE PENDIENTES - USA MODAL SEPARADO
const mostrarModalPendientesConciliacion = (resultado: ResultadoConciliacion) => {
  try {
    // ✅ VALIDACIÓN INICIAL
    if (!resultado) {
      console.error("❌ Resultado es null o undefined");
      setMensaje("❌ Error: Datos incompletos para mostrar modal de conciliación");
      return;
    }

    // 🔥 USAR referencia_pago_original COMO PRIORIDAD
    const referenciaParaMostrar = resultado.referencia_pago_original || resultado.referencia_pago;
    
    console.log(`🔍 Abriendo modal de pendientes para:`, {
      referencia_original: resultado.referencia_pago_original,
      referencia_display: resultado.referencia_pago,
      referencia_usada: referenciaParaMostrar,
      fecha: resultado.fecha_pago,
      valor: resultado.valor_pago,
      Id_Transaccion: resultado.Id_Transaccion || resultado.id_transaccion
    });
    
    // ✅ USAR EL MODAL ESPECÍFICO PARA PENDIENTES (NO AFECTA AL useEffect)
    setModalPendientesConciliacion({
      pago: {
        referencia: referenciaParaMostrar || "Sin referencia",
        valor: resultado.valor_pago || 0,
        fecha: resultado.fecha_pago || new Date().toISOString(),
        correo: resultado.correo_conductor || "No disponible",
        entidad: resultado.entidad_pago || "No especificada",
        tipo: resultado.tipo || "No especificado",
        // 🔥 DATOS ESPECÍFICOS PARA CONCILIACIÓN MANUAL DE PENDIENTES
        referencia_pago_original: resultado.referencia_pago_original,
        valor_total_consignacion: resultado.valor_total_consignacion || resultado.valor_pago || resultado.valor,
        num_referencias: resultado.num_referencias,
        es_grupo_transaccion: resultado.es_grupo_transaccion,
        id_transaccion: resultado.Id_Transaccion || resultado.id_transaccion,
        entidad_original: resultado.entidad,
        hora_pago: resultado.hora_pago,
        estado_conciliacion: resultado.estado_conciliacion
      },
      transacciones_disponibles: [], // ✅ VACÍO INICIALMENTE
    });
    
    console.log(`✅ Modal de pendientes abierto para referencia: ${referenciaParaMostrar}`);
    
  } catch (err: any) {
    console.error("💥 Error abriendo modal de pendientes:", err);
    setMensaje(`❌ Error al abrir modal de conciliación: ${err.message}`);
  }
};

// 🔥 FUNCIÓN PARA CARGAR TRANSACCIONES BANCARIAS BAJO DEMANDA
const cargarTransaccionesBancariasModal = async () => {
  if (!modalSeleccionTransaccion) {
    console.error("❌ No hay modal abierto para cargar transacciones");
    return;
  }

  try {
    setCargandoTransaccionesBanco(true);
    
    const pago = modalSeleccionTransaccion.pago;
    // 🔥 USAR referencia_pago_original COMO PRIORIDAD, fallback a referencia
    const referenciaParaBuscar = pago.referencia_pago_original || pago.referencia;
    
    console.log(`🔍 Cargando transacciones bancarias para:`, {
      referencia_original: pago.referencia_pago_original,
      referencia_display: pago.referencia,
      referencia_usada: referenciaParaBuscar,
      fecha: pago.fecha,
      valor: pago.valor
    });
    
    let transacciones = [];
    
    if (referenciaParaBuscar) {
      // ✅ PREPARAR FILTROS OPCIONALES
      const fechaPagoParam = pago.fecha ? pago.fecha.split('T')[0] : undefined;
      const valorPagoParam = pago.valor_total_consignacion || pago.valor;
      
      // ✅ LLAMAR CON PARÁMETROS OPCIONALES
      transacciones = await obtenerTransaccionesBancarias(
        referenciaParaBuscar,
        fechaPagoParam,
        valorPagoParam
      );
    }
    
    // Si no se encontraron transacciones, usar búsqueda por criterios (FALLBACK)
    if (transacciones.length === 0) {
      console.log("🔄 No se encontraron transacciones con endpoint optimizado, usando fallback...");
      
      // ✅ VALIDACIÓN SEGURA para fechas
      const fechaExacta = pago.fecha && pago.fecha !== null 
        ? pago.fecha.split('T')[0] 
        : new Date().toISOString().split('T')[0];

      const params = new URLSearchParams({
        valor_min: (pago.valor_total_consignacion || pago.valor).toString(),
        valor_max: (pago.valor_total_consignacion || pago.valor).toString(),
        fecha_inicio: fechaExacta,
        fecha_fin: fechaExacta,
        estado: 'pendiente' // Solo transacciones no conciliadas
      });

      const res = await fetch(
        `${API_BASE_URL}/conciliacion/obtener-movimientos-banco-disponibles?${params.toString()}`
      );

      if (res.ok) {
        const data = await res.json();
        transacciones = data.transacciones || [];
        console.log(`✅ Transacciones obtenidas con fallback: ${transacciones.length}`);
      } else {
        console.error("❌ Error en endpoint fallback:", res.statusText);
      }
    }
    
    // ✅ ACTUALIZAR EL MODAL CON LAS TRANSACCIONES CARGADAS
    setModalSeleccionTransaccion(prev => prev && {
      ...prev,
      transacciones_disponibles: transacciones
    });
    
    if (transacciones.length === 0) {
      setMensaje("⚠️ No se encontraron transacciones bancarias disponibles para conciliar");
    } else {
      console.log(`✅ Transacciones cargadas: ${transacciones.length} disponibles`);
      setMensaje(`✅ Se cargaron ${transacciones.length} transacciones bancarias disponibles`);
      // Limpiar el mensaje después de unos segundos
      setTimeout(() => {
        setMensaje(prevMensaje => 
          prevMensaje.includes("Se cargaron") ? "" : prevMensaje
        );
      }, 3000);
    }
    
  } catch (err: any) {
    console.error("💥 Error cargando transacciones bancarias:", err);
    setMensaje(`❌ Error al cargar transacciones bancarias: ${err.message}`);
  } finally {
    setCargandoTransaccionesBanco(false);
  }
};

// 🔥 FUNCIÓN ESPECÍFICA PARA CARGAR TRANSACCIONES EN MODAL DE PENDIENTES
const cargarTransaccionesPendientes = async () => {
  if (!modalPendientesConciliacion) {
    console.error("❌ No hay modal de pendientes abierto");
    return;
  }

  try {
    setCargandoTransaccionesBanco(true);
    
    const pago = modalPendientesConciliacion.pago;
    const referenciaParaBuscar = pago.referencia_pago_original || pago.referencia;
    
    console.log(`🔍 Cargando transacciones para pendientes:`, {
      referencia_original: pago.referencia_pago_original,
      referencia_display: pago.referencia,
      referencia_usada: referenciaParaBuscar,
      fecha: pago.fecha,
      valor: pago.valor,
      Id_Transaccion: pago.id_transaccion
    });
    
    let transacciones = [];
    
    if (referenciaParaBuscar) {
      // ✅ PREPARAR FILTROS OPCIONALES
      const fechaPagoParam = pago.fecha ? pago.fecha.split('T')[0] : undefined;
      const valorPagoParam = pago.valor_total_consignacion || pago.valor;
      
      // ✅ SOLO BUSCAR TRANSACCIONES BANCARIAS - NO DETALLES DE PAGO
      transacciones = await obtenerTransaccionesBancarias(
        referenciaParaBuscar,
        fechaPagoParam,
        valorPagoParam
      );
    }
    
    // Si no se encontraron, usar fallback
    if (transacciones.length === 0) {
      console.log("🔄 Usando búsqueda por criterios...");
      
      const fechaExacta = pago.fecha ? pago.fecha.split('T')[0] : new Date().toISOString().split('T')[0];
      const params = new URLSearchParams({
        valor_min: (pago.valor_total_consignacion || pago.valor).toString(),
        valor_max: (pago.valor_total_consignacion || pago.valor).toString(),
        fecha_inicio: fechaExacta,
        fecha_fin: fechaExacta,
        estado: 'pendiente'
      });

      const res = await fetch(`${API_BASE_URL}/conciliacion/obtener-movimientos-banco-disponibles?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        transacciones = data.transacciones || [];
      }
    }
    
    // ✅ ACTUALIZAR SOLO EL MODAL DE PENDIENTES
    setModalPendientesConciliacion(prev => prev && {
      ...prev,
      transacciones_disponibles: transacciones
    });
    
    if (transacciones.length === 0) {
      setMensaje("⚠️ No se encontraron transacciones bancarias disponibles");
    } else {
      console.log(`✅ ${transacciones.length} transacciones cargadas para pendientes`);
      setMensaje(`✅ Se cargaron ${transacciones.length} transacciones bancarias`);
      setTimeout(() => setMensaje(""), 3000);
    }
    
  } catch (err: any) {
    console.error("💥 Error cargando transacciones pendientes:", err);
    setMensaje(`❌ Error: ${err.message}`);
  } finally {
    setCargandoTransaccionesBanco(false);
  }
};

  // ✅ FUNCIÓN PARA CONFIRMAR CONCILIACIÓN CON TRANSACCIÓN BANCARIA SELECCIONADA
const confirmarConciliacionConTransaccionesBancarias = async () => {
  // 🔥 VERIFICAR AMBOS MODALES: modalSeleccionTransaccion O modalPendientesConciliacion
  const modalActivo = modalSeleccionTransaccion || modalPendientesConciliacion;
  
  console.log("🔍 DEBUG Conciliación:", {
    modalSeleccionTransaccion: !!modalSeleccionTransaccion,
    modalPendientesConciliacion: !!modalPendientesConciliacion,
    modalActivo: !!modalActivo,
    transaccionesSeleccionadas: transaccionesSeleccionadas,
    cantidadSeleccionadas: transaccionesSeleccionadas.length
  });
  
  if (!modalActivo || transaccionesSeleccionadas.length === 0) {
    console.error("❌ Error validación:", {
      modalActivo: !!modalActivo,
      transaccionesSeleccionadas: transaccionesSeleccionadas.length
    });
    alert("⚠️ Debes seleccionar al menos una transacción bancaria");
    return;
  }

  if (procesandoConciliacion || conciliandoTransaccion) {
    console.log("⚠️ Ya hay una conciliación en proceso, ignorando nueva solicitud");
    return;
  }

  try {
    setConciliandoTransaccion(true);
    
    const usuario = localStorage.getItem("correo") || "sistema@x-cargo.co";
    const referenciaMovimiento = modalActivo.pago.referencia;
    
    // Obtener información de las transacciones seleccionadas
    const transaccionesInfo = modalActivo.transacciones_disponibles
      .filter(t => transaccionesSeleccionadas.includes(t.id));
    
    const valorTotalSeleccionado = transaccionesInfo.reduce((sum, t) => sum + t.valor_banco, 0);
    
    setMensaje(`🔄 Procesando conciliación de ${transaccionesSeleccionadas.length} transacciones...`);

    // 🔥 NUEVO: Enviar todas las transacciones en una sola llamada al backend
    const requestBody = {
      ids_banco: transaccionesSeleccionadas, // Array de IDs de transacciones bancarias
      referencia_pago: referenciaMovimiento,
      observaciones: `Conciliación manual múltiple - ${transaccionesSeleccionadas.length} transacciones por valor total: $${valorTotalSeleccionado.toLocaleString()}`,
      usuario,
      fecha_conciliacion: new Date().toISOString(),
    };

    console.log("🚀 Enviando conciliación múltiple:", requestBody);

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
      console.error(`❌ Error en conciliación múltiple:`, errorText);
      throw new Error(`Error en conciliación: ${errorText}`);
    }

    const resultado = await res.json();
    console.log("✅ Resultado de conciliación múltiple:", resultado);

    // Mensaje de éxito detallado
    const mensajeExito = `✅ ¡Conciliación múltiple exitosa! 
${transaccionesSeleccionadas.length} transacciones conciliadas
Valor total: $${valorTotalSeleccionado.toLocaleString()}
Referencia: ${referenciaMovimiento}`;
    
    setMensaje(mensajeExito);
    
    // Limpiar selecciones y cerrar modal
    setTransaccionesSeleccionadas([]);
    
    // 🔥 CERRAR EL MODAL CORRECTO SEGÚN CUÁL ESTÉ ACTIVO
    if (modalSeleccionTransaccion) {
      setModalSeleccionTransaccion(null);
    }
    if (modalPendientesConciliacion) {
      setModalPendientesConciliacion(null);
    }
    
    // Recargar datos
    await cargarEstadisticas();
    
    // Actualizar resultados de conciliación si existen
    if (resultadoConciliacion && resultadoConciliacion.resultados) {
      const nuevosResultados = resultadoConciliacion.resultados.map((item: ResultadoConciliacion) => {
        if (item.referencia_pago === referenciaMovimiento) {
          return {
            ...item,
            estado_match: 'conciliado_exacto' as const,
            observaciones: `Conciliado manualmente - ${transaccionesSeleccionadas.length} transacciones`
          };
        }
        return item;
      });
      
      setResultadoConciliacion({
        ...resultadoConciliacion,
        resultados: nuevosResultados
      });
    }
    
    setTimeout(() => {
      setMensaje(prevMensaje => prevMensaje === mensajeExito ? "" : prevMensaje);
    }, 10000);
    
  } catch (err: any) {
    console.error("💥 Error en conciliación múltiple:", err);
    setMensaje(`❌ Error en conciliación múltiple: ${err.message}`);
    
    setTimeout(() => {
      setMensaje(prevMensaje => prevMensaje.includes("Error en conciliación múltiple") ? "" : prevMensaje);
    }, 10000);
  } finally {
    setConciliandoTransaccion(false);
  }
};

useEffect(() => {
  if (modalSeleccionTransaccion) {
    setTransaccionesSeleccionadas([]);
  }
}, [modalSeleccionTransaccion]);

// 🔥 LIMPIAR SELECCIONES CUANDO SE ABRE EL MODAL DE PENDIENTES
useEffect(() => {
  if (modalPendientesConciliacion) {
    setTransaccionesSeleccionadas([]);
  }
}, [modalPendientesConciliacion]);

  // 🚪 CERRAR CARRUSEL CUANDO SE CIERRA EL MODAL DE PENDIENTES
  useEffect(() => {
    if (!modalPendientesConciliacion && carruselImagenes.visible) {
      console.log('🚪 Modal cerrado, cerrando carrusel automáticamente');
      cerrarCarrusel();
    }
  }, [modalPendientesConciliacion, carruselImagenes.visible]);

  // 📄 ESTADO PARA PAGINACIÓN MANUAL
  const [paginacionManual, setPaginacionManual] = useState({
    paginaActual: 1,
    registrosPorPagina: 30,
    totalPaginas: 1
  });

  // 📊 CALCULAR REGISTROS A MOSTRAR SEGÚN PAGINACIÓN
  const registrosPaginados = React.useMemo(() => {
    const inicio = (paginacionManual.paginaActual - 1) * paginacionManual.registrosPorPagina;
    const fin = inicio + paginacionManual.registrosPorPagina;
    return pendientesPorConciliar.slice(inicio, fin);
  }, [pendientesPorConciliar, paginacionManual.paginaActual, paginacionManual.registrosPorPagina]);

  // 🔄 ACTUALIZAR TOTAL DE PÁGINAS CUANDO CAMBIAN LOS REGISTROS
  useEffect(() => {
    const totalPaginas = Math.ceil(pendientesPorConciliar.length / paginacionManual.registrosPorPagina);
    setPaginacionManual(prev => ({
      ...prev,
      totalPaginas: totalPaginas,
      paginaActual: Math.min(prev.paginaActual, totalPaginas || 1)
    }));
  }, [pendientesPorConciliar.length, paginacionManual.registrosPorPagina]);
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
      sin_match: "#ffffffff",
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
        pasaFecha = pasaFecha && r.fecha_pago >= fechaInicio;
      }
      if (fechaFin) {
        pasaFecha = pasaFecha && r.fecha_pago <= fechaFin;
      }
      return pasaFiltroEstado && pasaBusqueda && pasaFecha;
    })
    .sort((a, b) => {
      if (!a.fecha_pago || !b.fecha_pago) return 0;
      if (ordenFecha === "asc") {
        return a.fecha_pago.localeCompare(b.fecha_pago);
      } else {
        return b.fecha_pago.localeCompare(a.fecha_pago);
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
             <span className="stat-number">{estadisticasGenerales?.total_movimientos_banco?.toLocaleString() ?? 0}</span>
          </div>
          <div className="stat-card primary">
            <div className="stat-icon">🔸</div>
             <span className="stat-label">MOVIMIENTOS BANCARIOS CONCILIADOS</span>
             <span className="stat-number">{estadisticasGenerales?.conciliados_movimientos?.toLocaleString() ?? 0}</span>
          </div>
           <div className="stat-card primary">
            <div className="stat-icon">⏳</div>
             <span className="stat-label">MOVIMIENTOS BANCARIOS PENDIENTES </span>
             <span className="stat-number">{estadisticasGenerales?.pendientes_movimientos?.toLocaleString() ?? 0}</span>
          </div>
          <div className="stat-card primary">
            <div className="stat-icon">📊</div>
             <span className="stat-label">TOTAL DE PAGOS CONDUCTOR </span>
             <span className="stat-number">{estadisticasGenerales?.total_pagosconductor?.toLocaleString() ?? 0}</span>
          </div>
          
          <div className="stat-card primary">
            <div className="stat-icon">🔸</div>
             <span className="stat-label">SOPORTES CONCILIADOS </span>
             <span className="stat-number">{estadisticasGenerales?.conciliados_pc?.toLocaleString() ?? 0}</span>
          </div>
          <div className="stat-card primary">
            <div className="stat-icon">⏳</div>
             <span className="stat-label">SOPORTES PENDIENTES POR CONCILIAR </span>
             <span className="stat-number">{estadisticasGenerales?.pendientes_pc?.toLocaleString() ?? 0}</span>
          </div>
          <div className="stat-card primary">
            <div className="stat-icon">❌</div>
             <span className="stat-label">SOPORTES RECHAZADOS</span>
             <span className="stat-number">{estadisticasGenerales?.rechazados_pc?.toLocaleString() ?? 0}</span>
          </div>
          <div className="stat-card primary">
            <div className="stat-icon">💰</div>
             <span className="stat-label">VALOR TOTAL MOVIMIENTOS BANCARIOS </span>
             <span className="stat-number">{formatearMoneda(estadisticasGenerales?.total_valor_banco ?? 0)}</span>
          </div>
        </div>
      </div>

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

        <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginTop: "1rem" }}>
          <button
            className="boton-conciliar boton-animado"
            style={{ minWidth: 180, fontWeight: 600, fontSize: 15, padding: '0.7em 1.5em', borderRadius: 10, transition: 'transform 0.1s, box-shadow 0.1s' }}
            onClick={ejecutarConciliacion}
            disabled={procesandoConciliacion}
          >
            {procesandoConciliacion
              ? "🔄 Procesando..."
              : "🤖 Ejecutar Conciliación Automática"}
          </button>
          <button
            className="boton-conciliar boton-animado"
            style={{ background: "#f59e0b", color: "#fff", minWidth: 180, fontWeight: 600, fontSize: 15, padding: '0.7em 1.5em', borderRadius: 10, transition: 'transform 0.1s, box-shadow 0.1s' }}
            onClick={() => {
              setMostrarPendientesManual(true);
              recargarPendientes(); // 🔥 USAR NUEVA FUNCIÓN
            }}
            disabled={procesandoConciliacion}
          >
            📝 Conciliación Manual
          </button>
          
          {/* BOTONES COMENTADOS PARA VERSIÓN LIVE 
          <button
            className="boton-conciliar boton-animado"
            style={{ background: "#10b981", color: "#fff", minWidth: 180, fontWeight: 600, fontSize: 15, padding: '0.7em 1.5em', borderRadius: 10, transition: 'transform 0.1s, box-shadow 0.1s' }}
            onClick={exportarTablas}
            disabled={exportandoTablas || procesandoConciliacion}
          >
            {exportandoTablas
              ? "📤 Exportando..."
              : "📊 Exportar Tablas"}
          </button>
          <button
            className="boton-conciliar boton-animado"
            style={{ background: "#8b5cf6", color: "#fff", minWidth: 180, fontWeight: 600, fontSize: 15, padding: '0.7em 1.5em', borderRadius: 10, transition: 'transform 0.1s, box-shadow 0.1s' }}
            onClick={revertirConciliacionesAutomaticas}
            disabled={reviertendoConciliaciones || procesandoConciliacion}
          >
            {reviertendoConciliaciones
              ? "🔄 Revirtiendo..."
              : "🔄"}
          </button>
          <button
            className="boton-conciliar boton-animado"
            style={{ background: "#3b82f6", color: "#fff", minWidth: 180, fontWeight: 600, fontSize: 15, padding: '0.7em 1.5em', borderRadius: 10, transition: 'transform 0.1s, box-shadow 0.1s' }}
            onClick={ejecutarConsultas}
            disabled={ejecutandoConsultas || procesandoConciliacion}
          >
            {ejecutandoConsultas
              ? "🔄 Consultando..."
              : "👁‍🗨"}
          </button>
          FIN BOTONES COMENTADOS */}
        </div>
        <style>{`
          .boton-animado:hover:not(:disabled), .boton-animado:focus:not(:disabled) {
            transform: scale(1.04);
            box-shadow: 0 2px 12px 0 #0002;
            filter: brightness(1.08);
          }
        `}</style>

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
    
        
          {mostrarPendientesManual && (
            <div style={{ position: 'relative', marginTop: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <h3 style={{ margin: 0 }}>⏳ Pendientes por Conciliar</h3>
                  {/* 🔥 INFORMACIÓN DE PAGINACIÓN CON ESTADO DE CARGA */}
                  <div style={{ fontSize: '14px', color: '#6b7280', background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px' }}>
                    {cargandoPendientes ? (
                      <>⏳ Cargando registros... {pendientesPorConciliar.length} de {paginacionPendientes.total_registros || '?'}</>
                    ) : (
                      <>📊 {pendientesPorConciliar.length} de {paginacionPendientes.total_registros} registros (ordenados: más viejo → más nuevo)</>
                    )}
                    {paginacionPendientes.total_paginas > 1 && !cargandoPendientes && (
                      <span> | {paginacionPendientes.total_paginas} páginas procesadas</span>
                    )}
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {/* 🔥 BOTÓN RECARGAR */}
                  <button
                    className="boton-conciliar boton-animado"
                    style={{ 
                      background: '#3b82f6', 
                      color: '#fff', 
                      minWidth: 120, 
                      fontWeight: 600, 
                      fontSize: 13, 
                      padding: '0.5em 1em', 
                      borderRadius: 6,
                      opacity: cargandoPendientes ? 0.6 : 1,
                      cursor: cargandoPendientes ? 'not-allowed' : 'pointer'
                    }}
                    onClick={recargarPendientes}
                    disabled={cargandoPendientes}
                  >
                    {cargandoPendientes ? '🔄 Cargando...' : '🔄 Recargar'}
                  </button>
                  
                  <button
                    className="boton-conciliar boton-animado"
                    style={{ background: '#e11d48', color: '#fff', minWidth: 120, fontWeight: 600, fontSize: 13, padding: '0.5em 1em', borderRadius: 6 }}
                    onClick={() => setMostrarPendientesManual(false)}
                  >
                    ✕ Cerrar
                  </button>
                </div>
              </div>
              
              {cargandoPendientes && pendientesPorConciliar.length === 0 && (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '2rem', 
                  background: '#f9fafb', 
                  borderRadius: '8px', 
                  border: '1px solid #e5e7eb',
                  marginBottom: '1rem'
                }}>
                  <div style={{ fontSize: '24px', marginBottom: '0.5rem' }}>⏳</div>
                  <div>Cargando pendientes por conciliar...</div>
                </div>
              )}

              {pendientesPorConciliar.length > 0 && (
                <>
                  <div className="tabla-conciliacion">
                    <table>
                      <thead>
                        <tr>
                          <th>
                            Fecha del Pago 
                            <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'normal' }}>
                              <br />(Más viejo → Más nuevo)
                            </span>
                          </th>
                          <th>Ref. Pago</th>
                          <th>Valor del Pago</th>
                          <th>Conductor</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registrosPaginados.map((pendiente, idx) => (
                          <tr key={`${pendiente.referencia_pago}-${idx}`}>
                            <td>{formatearFecha(pendiente.fecha_pago)}</td>
                            <td>
                              <div style={{ fontSize: '13px' }}>
                                {pendiente.referencia_pago}
                                {pendiente.num_referencias && pendiente.num_referencias > 1 && (
                                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                                    🔗 {pendiente.num_referencias} referencias agrupadas
                                  </div>
                                )}
                              </div>
                            </td>
                            <td>${pendiente.valor_pago.toLocaleString("es-CO")}</td>
                            <td>
                              <div style={{ fontSize: '14px' }}>
                                {pendiente.correo_conductor}
                              </div>
                            </td>
                            <td>
                              <button
                                className="btn-conciliar-manual"
                                onClick={() => mostrarModalPendientesConciliacion(pendiente)}
                                style={{ fontSize: '13px', padding: '6px 12px' }}
                              >
                                ✅ Conciliar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* 🔥 CONTROLES DE PAGINACIÓN */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginTop: '1rem',
                    padding: '1rem',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <div style={{ fontSize: '14px', color: '#6b7280' }}>
                      Mostrando {pendientesPorConciliar.length} de {paginacionPendientes.total_registros} registros totales
                    </div>
                    
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {/* 🔥 INDICADOR DE CARGA AUTOMÁTICA */}
                      {cargandoPendientes && (
                        <div style={{
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontWeight: '500',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          ⏳ Cargando automáticamente... 
                          {paginacionPendientes.total_registros > 0 && (
                            <span>({paginacionPendientes.total_registros - pendientesPorConciliar.length} restantes)</span>
                          )}
                        </div>
                      )}
                      
                      {/* 🔥 PAGINACIÓN COMPACTA */}
                      {pendientesPorConciliar.length > paginacionManual.registrosPorPagina && (
                        <div style={{
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          gap: '6px',
                          marginTop: '16px',
                          padding: '12px',
                          backgroundColor: '#d1fae5',
                          borderRadius: '8px'
                        }}>
                          {/* Botón Anterior */}
                          <button
                            onClick={paginaAnterior}
                            disabled={paginacionManual.paginaActual === 1}
                            style={{
                              background: paginacionManual.paginaActual === 1 ? '#f3f4f6' : '#6b7280',
                              color: paginacionManual.paginaActual === 1 ? '#9ca3af' : 'white',
                              border: 'none',
                              padding: '6px 12px',
                              borderRadius: '5px',
                              cursor: paginacionManual.paginaActual === 1 ? 'not-allowed' : 'pointer',
                              fontSize: '13px',
                              fontWeight: '500'
                            }}
                          >
                            ← Anterior
                          </button>

                          {/* Números de página */}
                          {Array.from({ length: Math.min(5, paginacionManual.totalPaginas) }, (_, i) => {
                            let numeroPage;
                            if (paginacionManual.totalPaginas <= 5) {
                              numeroPage = i + 1;
                            } else {
                              const current = paginacionManual.paginaActual;
                              const total = paginacionManual.totalPaginas;
                              
                              if (current <= 3) {
                                numeroPage = i + 1;
                              } else if (current >= total - 2) {
                                numeroPage = total - 4 + i;
                              } else {
                                numeroPage = current - 2 + i;
                              }
                            }
                            
                            const esActual = numeroPage === paginacionManual.paginaActual;
                            
                            return (
                              <button
                                key={numeroPage}
                                onClick={() => irAPagina(numeroPage)}
                                style={{
                                  background: esActual ? '#3b82f6' : 'white',
                                  color: esActual ? 'white' : '#64748b',
                                  border: '1px solid #d1d5db',
                                  padding: '6px 10px',
                                  borderRadius: '5px',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  fontWeight: esActual ? '600' : '500',
                                  minWidth: '32px'
                                }}
                              >
                                {numeroPage}
                              </button>
                            );
                          })}

                          {/* Botón Siguiente */}
                          <button
                            onClick={paginaSiguiente}
                            disabled={paginacionManual.paginaActual === paginacionManual.totalPaginas}
                            style={{
                              background: paginacionManual.paginaActual === paginacionManual.totalPaginas ? '#f3f4f6' : '#6b7280',
                              color: paginacionManual.paginaActual === paginacionManual.totalPaginas ? '#9ca3af' : 'white',
                              border: 'none',
                              padding: '6px 12px',
                              borderRadius: '5px',
                              cursor: paginacionManual.paginaActual === paginacionManual.totalPaginas ? 'not-allowed' : 'pointer',
                              fontSize: '13px',
                              fontWeight: '500'
                            }}
                          >
                            Siguiente →
                          </button>
                          
                          {/* Información de página */}
                          <span style={{
                            marginLeft: '12px',
                            fontSize: '13px',
                            color: '#6b7280',
                            fontWeight: '500'
                          }}>
                            📄 {paginacionManual.paginaActual} de {paginacionManual.totalPaginas}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
              
              {!cargandoPendientes && pendientesPorConciliar.length === 0 && (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '2rem', 
                  background: '#f9fafb', 
                  borderRadius: '8px', 
                  border: '1px solid #e5e7eb' 
                }}>
                  <div style={{ fontSize: '48px', marginBottom: '1rem' }}>📋</div>
                  <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '0.5rem' }}>
                    No hay pagos pendientes por conciliar
                  </div>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>
                    Todos los pagos están conciliados o no hay datos disponibles
                  </div>
                </div>
              )}
            </div>
          )}


      {resultadosFiltrados.length > 0 ? (
        <div>
          <h3>📊 Resultados de Conciliación</h3>

 
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
                  <th>Fecha del Pago</th>
                  <th>Ref. Pago</th>
                  <th>Valor del Pago</th>
                  <th>Estado</th>
                  <th>Confianza</th>
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
                    {/*Fecha*/}
                    <td>
                      {formatearFecha(resultado.fecha_pago)}
                    </td>
                    {/*Referencia de Pago*/}
                    <td>
                      {resultado.referencia_pago || "-"}
                    </td>
                    {/*Valor*/}
                    <td>
                      ${resultado.valor_pago.toLocaleString("es-CO")}</td>
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
                            onClick={() => {
                              // Si el resultado tiene id_transaccion úsalo, si no referencia_pago
                              const idTransaccion = (resultado as any).id_transaccion || (resultado as any).Id_Transaccion || null;
                              mostrarModalSeleccionTransaccionBanco({ ...resultado, id_transaccion: idTransaccion });
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
            </table>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "1rem", color: "#666" }}>
          ⚠️ No hay resultados para mostrar. Verifica si los datos del banco
          coinciden con algún pago.
        </div>
      )}
      
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
        pointerEvents: conciliandoTransaccion ? 'none' : 'auto',
        maxWidth: '95vw',
        width: '1200px',
        maxHeight: '90vh'
      }}
    >
      <h3>🏦 Seleccionar Transacciones Bancarias para Conciliar</h3>
      
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

      <div className="detalle-grid" style={{ gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
        <div className="detalle-seccion">
          <h4>🟢 Movimiento a Conciliar</h4>
          <div className="detalle-item">
            <strong>Referencia de Pago:</strong> 
            {modalSeleccionTransaccion.pago.referencia_pago_original && 
             modalSeleccionTransaccion.pago.referencia_pago_original !== modalSeleccionTransaccion.pago.referencia
              ? `🔗 ${modalSeleccionTransaccion.pago.referencia_pago_original}, ${modalSeleccionTransaccion.pago.referencia}`
              : `🔗 ${modalSeleccionTransaccion.pago.referencia}`
            }
          </div>
          
          <div className="detalle-item">
            <strong>Fecha:</strong>{" "}
            {modalSeleccionTransaccion.pago.fecha ? formatearFecha(modalSeleccionTransaccion.pago.fecha) : "No disponible"}
          </div>
          
          <div className="detalle-item">
            <strong>Valor del pago:</strong> 
            ${(modalSeleccionTransaccion.pago.valor_total_consignacion || modalSeleccionTransaccion.pago.valor)?.toLocaleString("es-CO") || "0"}
          </div>
          
          {modalSeleccionTransaccion.pago.valor && 
           modalSeleccionTransaccion.pago.valor_total_consignacion && 
           modalSeleccionTransaccion.pago.valor_total_consignacion !== modalSeleccionTransaccion.pago.valor && (
            <div className="detalle-item">
              <strong>Valor Individual:</strong> 
              ${modalSeleccionTransaccion.pago.valor?.toLocaleString("es-CO")}
            </div>
          )}
          
          {modalSeleccionTransaccion.pago.num_referencias && modalSeleccionTransaccion.pago.num_referencias > 1 && (
            <div className="detalle-item">
              <strong>Referencias agrupadas:</strong> {modalSeleccionTransaccion.pago.num_referencias}
            </div>
          )}
          
          <div className="detalle-item">
            <strong>Correo Conductor:</strong> 
            {modalSeleccionTransaccion.pago.correo || "No disponible"}
          </div>
          <div className="detalle-item">
            <button onClick={() => verDetallesPago(
              modalSeleccionTransaccion.pago.referencia,
              {
                correo: modalSeleccionTransaccion.pago.correo !== "No disponible" ? modalSeleccionTransaccion.pago.correo : undefined,
                fecha_pago: modalSeleccionTransaccion.pago.fecha ? modalSeleccionTransaccion.pago.fecha.split('T')[0] : undefined,
                valor: modalSeleccionTransaccion.pago.valor,
                estado_conciliacion: undefined
              }
            )}>
              <strong>Comprobante:</strong> 👁 Ver
            </button>
          </div>
          
          {/* 🔥 PANEL DE SELECCIÓN MÚLTIPLE */}
          {modalSeleccionTransaccion.transacciones_disponibles.length > 0 && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              background: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0'
            }}>
              <h5 style={{ margin: '0 0 0.5rem 0', color: '#1e40af' }}>📊 Resumen de Selección</h5>
              <div style={{ fontSize: '14px', marginBottom: '0.5rem' }}>
                <strong>Seleccionadas:</strong> {transaccionesSeleccionadas.length} transacciones
              </div>
              {transaccionesSeleccionadas.length > 0 && (
                <div style={{ fontSize: '14px', marginBottom: '0.5rem' }}>
                  <strong>Valor total:</strong> $
                  {modalSeleccionTransaccion.transacciones_disponibles
                    .filter(t => transaccionesSeleccionadas.includes(t.id))
                    .reduce((sum, t) => sum + t.valor_banco, 0)
                    .toLocaleString("es-CO")}
                </div>
              )}
              
              {/* Indicador de límite de selección */}
              <div style={{ 
                marginTop: '0.5rem', 
                padding: '6px 10px', 
                background: '#f0f9ff', 
                border: '1px solid #3b82f6', 
                borderRadius: '4px',
                fontSize: '12px',
                color: '#1e40af'
              }}>
                📊 Selecciona máximo {modalSeleccionTransaccion.pago.num_referencias || 1} transacción(es) 
                para {modalSeleccionTransaccion.pago.num_referencias || 1} referencia(s) agrupada(s)
                <br />
                <span style={{ color: '#059669', fontWeight: 'bold' }}>
                  {transaccionesSeleccionadas.length}/{modalSeleccionTransaccion.pago.num_referencias || 1} seleccionada(s)
                </span>
              </div>
              
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button
                  onClick={seleccionarTodasTransacciones}
                  disabled={conciliandoTransaccion}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  ✅ Máximo ({modalSeleccionTransaccion.pago.num_referencias || 1})
                </button>
                <button
                  onClick={limpiarSelecciones}
                  disabled={conciliandoTransaccion}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  🗑️ Limpiar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="detalle-seccion">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4>🏦 Transacciones Bancarias Disponibles</h4>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              {modalSeleccionTransaccion.transacciones_disponibles.length > 0 
                ? `✅ ${modalSeleccionTransaccion.transacciones_disponibles.length} transacciones cargadas`
                : '💡 Carga transacciones para conciliar'
              }
            </div>
          </div>
          
          <div className="transacciones-list" style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {modalSeleccionTransaccion.transacciones_disponibles.length === 0 ? (
              <div style={{ 
                textAlign: "center", 
                padding: "2rem", 
                color: "#6b7280",
                background: "#f9fafb",
                borderRadius: "8px",
                border: "1px dashed #d1d5db"
              }}>
                <p>💡 Transacciones bancarias no cargadas</p>
                <p style={{ fontSize: "12px", marginTop: "8px", marginBottom: "16px" }}>
                  Haz clic en el botón para cargar las transacciones bancarias disponibles para conciliar.
                </p>
                <button
                  onClick={cargarTransaccionesBancariasModal}
                  disabled={cargandoTransaccionesBanco}
                  style={{
                    background: cargandoTransaccionesBanco ? '#6b7280' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '6px',
                    cursor: cargandoTransaccionesBanco ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    fontSize: '14px'
                  }}
                >
                  {cargandoTransaccionesBanco 
                    ? '⏳ Cargando...' 
                    : '🔍 Cargar Transacciones Bancarias'}
                </button>
              </div>
            ) : (
              modalSeleccionTransaccion.transacciones_disponibles.map((transaccion, idx) => {
                const estaSeleccionada = transaccionesSeleccionadas.includes(transaccion.id);
                const estaPendiente = transaccion.estado_conciliacion === 'pendiente';
                
                return (
                  <div 
                    key={idx} 
                    className="transaccion-item"
                    style={{
                      border: estaSeleccionada ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                      background: estaSeleccionada ? '#eff6ff' : estaPendiente ? '#ffffff' : '#f9fafb',
                      borderRadius: '8px',
                      padding: '1rem',
                      marginBottom: '0.75rem',
                      transition: 'all 0.2s ease',
                      opacity: estaPendiente ? 1 : 0.7,
                      position: 'relative'
                    }}
                  >
                    {/* Checkbox de selección */}
                    {estaPendiente && (
                      <div style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px'
                      }}>
                        <input
                          type="checkbox"
                          checked={estaSeleccionada}
                          onChange={() => toggleSeleccionTransaccion(transaccion.id)}
                          disabled={conciliandoTransaccion}
                          style={{
                            width: '18px',
                            height: '18px',
                            cursor: 'pointer'
                          }}
                        />
                      </div>
                    )}
                    
                    <div className="transaccion-info" style={{ paddingRight: '2rem' }}>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                        gap: '0.5rem',
                        fontSize: '14px'
                      }}>
                        <div>
                          <strong>ID Banco:</strong> 
                          <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 4px', borderRadius: '3px', marginLeft: '4px' }}>
                            {transaccion.id}
                          </span>
                        </div>
                        <div>
                          <strong>Fecha:</strong> {formatearFecha(transaccion.fecha)}
                        </div>
                        <div>
                          <strong>Valor:</strong> 
                          <span style={{ 
                            fontWeight: 'bold', 
                            color: '#059669', 
                            fontSize: '15px',
                            marginLeft: '4px'
                          }}>
                            ${transaccion.valor_banco.toLocaleString("es-CO")}
                          </span>
                        </div>
                        <div>
                          <strong>Cuenta:</strong> {transaccion.cuenta}
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <strong>Descripción:</strong> 
                          <span title={transaccion.descripcion} style={{ marginLeft: '4px' }}>
                            {transaccion.descripcion.length > 80 
                              ? transaccion.descripcion.substring(0, 80) + "..." 
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
                          <span className={`estado-badge ${estaPendiente ? 'pending' : 'success'}`} style={{ marginLeft: '4px' }}>
                            {estaPendiente ? '⏳ Pendiente' : '✅ Conciliado'}
                          </span>
                        </div>
                        {transaccion.porcentaje_similitud !== undefined && (
                          <div>
                            <strong>Similitud:</strong> 
                            <span className={`similitud-badge similitud-${getSimilitudClass(transaccion.porcentaje_similitud)}`} style={{ marginLeft: '4px' }}>
                              {transaccion.porcentaje_similitud}% {transaccion.nivel_match || ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Indicador visual de selección */}
                    {estaSeleccionada && (
                      <div style={{
                        position: 'absolute',
                        bottom: '8px',
                        right: '8px',
                        background: '#3b82f6',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 'bold'
                      }}>
                        ✓ SELECCIONADA
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      
      <div className="modal-acciones" style={{ 
        borderTop: '1px solid #e5e7eb',
        paddingTop: '1rem',
        marginTop: '1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ fontSize: '14px', color: '#6b7280' }}>
          {transaccionesSeleccionadas.length > 0 && (
            <span>
              💡 {transaccionesSeleccionadas.length} transacción(es) seleccionada(s) para conciliar
            </span>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem' }}>
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
          
          {transaccionesSeleccionadas.length > 0 && (
            <button
              onClick={confirmarConciliacionConTransaccionesBancarias}
              disabled={conciliandoTransaccion || transaccionesSeleccionadas.length === 0}
              style={{
                background: conciliandoTransaccion ? '#6b7280' : '#059669',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                cursor: conciliandoTransaccion ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '14px'
              }}
            >
              {conciliandoTransaccion 
                ? '⏳ Procesando...' 
                : `✅ Conciliar ${transaccionesSeleccionadas.length} Transacción${transaccionesSeleccionadas.length > 1 ? 'es' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
)}

{/* 🔥 MODAL ESPECÍFICO PARA PENDIENTES - SIN useEffect PROBLEMÁTICO */}
{modalPendientesConciliacion && (
  <div
    className="modal-overlay"
    onClick={cerrarModalPendientes}
  >
    <div
      className="modal-content seleccion-transaccion"
      onClick={(e) => e.stopPropagation()}
      style={{ 
        opacity: conciliandoTransaccion ? 0.9 : 1,
        pointerEvents: conciliandoTransaccion ? 'none' : 'auto',
        maxWidth: '95vw',
        width: '1200px',
        maxHeight: '90vh'
      }}
    >
      <h3>🏦 Conciliar Pago Pendiente</h3>
      
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

      <div className="detalle-grid" style={{ gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
        <div className="detalle-seccion">
          <h4>🟢 Pago Pendiente por Conciliar</h4>
          <div className="detalle-item">
            <strong>Referencia de Pago:</strong> 
            {(() => {
              const pago = modalPendientesConciliacion.pago;
              
              // Si hay referencia original diferente, mostrar ambas separadas por coma
              if (pago.referencia_pago_original && 
                  pago.referencia_pago_original !== pago.referencia) {
                return (
                  <span style={{
                    fontFamily: 'monospace',
                    backgroundColor: '#f1f5f9',
                    padding: '2px 4px',
                    borderRadius: '3px'
                  }}>
                    🔗 {pago.referencia_pago_original}, {pago.referencia}
                  </span>
                );
              } else {
                // Solo mostrar la referencia principal
                return (
                  <span style={{
                    fontFamily: 'monospace',
                    backgroundColor: '#f1f5f9',
                    padding: '2px 4px',
                    borderRadius: '3px'
                  }}>
                    🔗 {pago.referencia}
                  </span>
                );
              }
            })()}
          </div>
          
          <div className="detalle-item">
            <strong>Fecha:</strong>{" "}
            {modalPendientesConciliacion.pago.fecha ? formatearFecha(modalPendientesConciliacion.pago.fecha) : "No disponible"}
          </div>
          
          <div className="detalle-item">
            <strong>Valor del pago:</strong> 
            ${(modalPendientesConciliacion.pago.valor_total_consignacion || modalPendientesConciliacion.pago.valor)?.toLocaleString("es-CO") || "0"}
          </div>
          
          {modalPendientesConciliacion.pago.valor && 
           modalPendientesConciliacion.pago.valor_total_consignacion && 
           modalPendientesConciliacion.pago.valor_total_consignacion !== modalPendientesConciliacion.pago.valor && (
            <div className="detalle-item">
              <strong>Valor Individual:</strong> 
              ${modalPendientesConciliacion.pago.valor?.toLocaleString("es-CO")}
            </div>
          )}
          
          {modalPendientesConciliacion.pago.num_referencias && modalPendientesConciliacion.pago.num_referencias > 1 && (
            <div className="detalle-item">
              <strong>Referencias agrupadas:</strong> {modalPendientesConciliacion.pago.num_referencias}
            </div>
          )}
          
          <div className="detalle-item">
            <strong>Correo Conductor:</strong> 
            {modalPendientesConciliacion.pago.correo || "No disponible"}
          </div>

          {modalPendientesConciliacion.pago.id_transaccion && (
            <div className="detalle-item">
              <strong>ID Transacción:</strong> 
              <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 4px', borderRadius: '3px' }}>
                {modalPendientesConciliacion.pago.id_transaccion}
              </span>
            </div>
          )}

          {/* 🔥 BOTÓN VER COMPROBANTE PARA PENDIENTES */}
          <div className="detalle-item">
            <button 
              onClick={() => verComprobantePendiente(modalPendientesConciliacion.pago)}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              👁 Ver Comprobante
            </button>
          </div>
        </div>

        <div className="detalle-seccion">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4>🏦 Transacciones Bancarias Disponibles</h4>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              {modalPendientesConciliacion.transacciones_disponibles.length > 0 
                ? `✅ ${modalPendientesConciliacion.transacciones_disponibles.length} transacciones cargadas`
                : '💡 Carga transacciones para conciliar'
              }
            </div>
          </div>
          
          <div className="transacciones-list" style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {modalPendientesConciliacion.transacciones_disponibles.length === 0 ? (
              <div style={{ 
                textAlign: "center", 
                padding: "2rem", 
                color: "#6b7280",
                background: "#f9fafb",
                borderRadius: "8px",
                border: "1px dashed #d1d5db"
              }}>
                <p>💡 Transacciones bancarias no cargadas</p>
                <p style={{ fontSize: "12px", marginTop: "8px", marginBottom: "16px" }}>
                  Haz clic en el botón para cargar las transacciones bancarias disponibles.
                </p>
                <button
                  onClick={cargarTransaccionesPendientes}
                  disabled={cargandoTransaccionesBanco}
                  style={{
                    background: cargandoTransaccionesBanco ? '#6b7280' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '6px',
                    cursor: cargandoTransaccionesBanco ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    fontSize: '14px'
                  }}
                >
                  {cargandoTransaccionesBanco 
                    ? '⏳ Cargando...' 
                    : '🔍 Cargar Transacciones Bancarias'}
                </button>
              </div>
            ) : (
              modalPendientesConciliacion.transacciones_disponibles.map((transaccion, idx) => {
                const estaSeleccionada = transaccionesSeleccionadas.includes(transaccion.id);
                const estaPendiente = transaccion.estado_conciliacion === 'pendiente';
                
                return (
                  <div 
                    key={idx} 
                    className="transaccion-item"
                    onClick={() => estaPendiente && !conciliandoTransaccion && toggleSeleccionTransaccion(transaccion.id)}
                    style={{
                      border: estaSeleccionada ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                      background: estaSeleccionada ? '#eff6ff' : estaPendiente ? '#ffffff' : '#f9fafb',
                      borderRadius: '8px',
                      padding: '1rem',
                      marginBottom: '0.75rem',
                      transition: 'all 0.2s ease',
                      opacity: estaPendiente ? 1 : 0.7,
                      position: 'relative',
                      cursor: estaPendiente && !conciliandoTransaccion ? 'pointer' : 'default',
                      boxShadow: estaSeleccionada ? '0 2px 8px rgba(59, 130, 246, 0.2)' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (estaPendiente && !conciliandoTransaccion) {
                        e.currentTarget.style.backgroundColor = estaSeleccionada 
                          ? '#dbeafe' 
                          : '#f8fafc';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (estaPendiente && !conciliandoTransaccion) {
                        e.currentTarget.style.backgroundColor = estaSeleccionada 
                          ? '#eff6ff' 
                          : '#ffffff';
                      }
                    }}
                  >
                    {/* Indicador visual de selección */}
                    {estaPendiente && (
                      <div style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: estaSeleccionada ? '#3b82f6' : 'transparent',
                        border: estaSeleccionada ? '2px solid #3b82f6' : '2px solid #cbd5e1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        pointerEvents: 'none'
                      }}>
                        {estaSeleccionada && '✓'}
                      </div>
                    )}
                    
                    <div className="transaccion-info" style={{ paddingRight: '2rem' }}>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                        gap: '0.5rem',
                        fontSize: '14px'
                      }}>
                        <div>
                          <strong>ID Banco:</strong> 
                          <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 4px', borderRadius: '3px', marginLeft: '4px' }}>
                            {transaccion.id}
                          </span>
                        </div>
                        <div>
                          <strong>Fecha:</strong> {formatearFecha(transaccion.fecha)}
                        </div>
                        <div>
                          <strong>Valor:</strong> 
                          <span style={{ 
                            fontWeight: 'bold', 
                            color: '#059669', 
                            fontSize: '15px',
                            marginLeft: '4px'
                          }}>
                            ${transaccion.valor_banco.toLocaleString("es-CO")}
                          </span>
                        </div>
                        <div>
                          <strong>Cuenta:</strong> {transaccion.cuenta}
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <strong>Descripción:</strong> 
                          <span title={transaccion.descripcion} style={{ marginLeft: '4px' }}>
                            {transaccion.descripcion.length > 80 
                              ? transaccion.descripcion.substring(0, 80) + "..." 
                              : transaccion.descripcion}
                          </span>
                        </div>
                        <div>
                          <strong>Estado:</strong> 
                          <span className={`estado-badge ${estaPendiente ? 'pending' : 'success'}`} style={{ marginLeft: '4px' }}>
                            {estaPendiente ? '⏳ Pendiente' : '✅ Conciliado'}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Indicador visual de selección */}
                    {estaSeleccionada && (
                      <div style={{
                        position: 'absolute',
                        bottom: '8px',
                        right: '8px',
                        background: '#3b82f6',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 'bold'
                      }}>
                        ✓ SELECCIONADA
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      
      <div className="modal-acciones" style={{ 
        borderTop: '1px solid #e5e7eb',
        paddingTop: '1rem',
        marginTop: '1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ fontSize: '14px', color: '#6b7280' }}>
          {transaccionesSeleccionadas.length > 0 && (
            <span>
              💡 {transaccionesSeleccionadas.length} transacción(es) seleccionada(s) para conciliar
            </span>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className="btn-cerrar"
            disabled={conciliandoTransaccion}
            onClick={cerrarModalPendientes}
            style={{ 
              opacity: conciliandoTransaccion ? 0.6 : 1,
              cursor: conciliandoTransaccion ? 'not-allowed' : 'pointer'
            }}
          >
            {conciliandoTransaccion ? '⏳ Procesando...' : '✕ Cerrar'}
          </button>

          {/* 🔄 BOTÓN PARA LIMPIAR SELECCIÓN */}
          {transaccionesSeleccionadas.length > 0 && (
            <button
              onClick={limpiarSeleccionTransacciones}
              disabled={conciliandoTransaccion}
              style={{
                background: conciliandoTransaccion ? '#6b7280' : '#f59e0b',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                cursor: conciliandoTransaccion ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '14px',
                opacity: conciliandoTransaccion ? 0.6 : 1,
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onMouseEnter={(e) => {
                if (!conciliandoTransaccion) {
                  e.currentTarget.style.backgroundColor = '#d97706';
                }
              }}
              onMouseLeave={(e) => {
                if (!conciliandoTransaccion) {
                  e.currentTarget.style.backgroundColor = '#f59e0b';
                }
              }}
            >
              🗑️ Limpiar Selección
            </button>
          )}
          
          {transaccionesSeleccionadas.length > 0 && (
            <button
              onClick={confirmarConciliacionConTransaccionesBancarias}
              disabled={conciliandoTransaccion || transaccionesSeleccionadas.length === 0}
              style={{
                background: conciliandoTransaccion ? '#6b7280' : '#059669',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                cursor: conciliandoTransaccion ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '14px'
              }}
            >
              {conciliandoTransaccion 
                ? '⏳ Procesando...' 
                : `✅ Conciliar ${transaccionesSeleccionadas.length} Transacción${transaccionesSeleccionadas.length > 1 ? 'es' : ''}`}
            </button>
          )}
        </div>
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

      {/* 🖼️ CARRUSEL DE IMÁGENES FLOTANTE */}
      {carruselImagenes.visible && (
        <div 
          style={{
            position: 'fixed',
            top: '50%',
            right: '20px',
            transform: 'translateY(-50%)',
            width: '500px',
            height: '700px',
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            border: '2px solid #e2e8f0',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Header del carrusel */}
          <div style={{
            padding: '16px',
            backgroundColor: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0
          }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
              📄 Comprobantes ({carruselImagenes.indiceActual + 1}/{carruselImagenes.imagenes.length})
            </h3>
            <button
              onClick={cerrarCarrusel}
              style={{
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ✕ Cerrar
            </button>
          </div>

          {/* Contenedor de la imagen */}
          <div style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f1f5f9',
            padding: '20px',
            minHeight: '0'
          }}>
            <img
              src={carruselImagenes.imagenes[carruselImagenes.indiceActual]}
              alt={`Comprobante ${carruselImagenes.indiceActual + 1}`}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
              onError={(e) => {
                console.error('Error cargando imagen:', e);
                (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NzI4NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkVycm9yIGNhcmdhbmRvIGltYWdlbjwvdGV4dD48L3N2Zz4=';
              }}
            />

            {/* Botones de navegación */}
            {carruselImagenes.imagenes.length > 1 && (
              <>
                <button
                  onClick={anteriorImagen}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    cursor: 'pointer',
                    fontSize: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ←
                </button>
                <button
                  onClick={siguienteImagen}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    cursor: 'pointer',
                    fontSize: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  →
                </button>
              </>
            )}
          </div>

          {/* Footer con indicadores */}
          {carruselImagenes.imagenes.length > 1 && (
            <div style={{
              padding: '12px',
              backgroundColor: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'center',
              gap: '8px'
            }}>
              {carruselImagenes.imagenes.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCarruselImagenes(prev => ({ ...prev, indiceActual: index }))}
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: index === carruselImagenes.indiceActual ? '#3b82f6' : '#cbd5e1',
                    cursor: 'pointer'
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Cruces;