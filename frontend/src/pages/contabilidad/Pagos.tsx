import React, { useEffect, useState } from "react";
import { saveAs } from "file-saver";
import "../../styles/contabilidad/Pagos.css";


// Utilidad para obtener el token desde localStorage
function getToken(): string {
  return localStorage.getItem("token") || "";
}

interface Pago {
  referencia_pago: string;
  referencia_pago_principal?: string;  // 🔥 NUEVO
  num_referencias?: number;            // 🔥 NUEVO
  es_grupo_transaccion?: boolean;      // 🔥 NUEVO  
  valor: number;
  fecha: string;
  entidad: string;
  estado_conciliacion: string;
  tipo: string;
  imagen: string;
  novedades?: string;
  num_guias: number;
  trackings_preview: string;
  trackings_completos?: string; // Added this property
  correo_conductor: string;
  hora_pago?: string; // Added this property
  creado_en?: string;
  fecha_modificacion?: string;
  carrier?: string; // Agregado para mostrar el carrier
  Id_Transaccion?: number;
  id_banco_asociado?: string | null;
  valor_banco_asociado?: number | null;
  fecha_movimiento_banco?: string | null;
  descripcion_banco?: string | null;
  // 🔥 NUEVOS CAMPOS PARA MOVIMIENTOS BANCARIOS INDIVIDUALES
  ids_banco_asociado?: string | null;
  num_movimientos_banco?: number;
  movimientos_bancarios?: Array<{
    id: number;
    valor: number;
    fecha: string;
    raw?: string;
  }>;
  total_valor_movimientos_banco?: number;
}

interface DetalleTracking {
  tracking: string;
  referencia: string;
  valor: number;
  cliente: string;
  carrier: string;
  tipo: string;
  fecha_pago: string;
  hora_pago: string;
  estado: string;
  novedades: string;
  comprobante: string;
  valor_guia: number;
  valor_guia_cod?: number;
  valor_guia_gl?: number; 
  valor_total_consignacion_pc: number;

}

interface PaginacionInfo {
  total_registros: number;
  total_paginas: number;
  pagina_actual: number;
  registros_por_pagina: number;
  tiene_siguiente: boolean;
  tiene_anterior: boolean;
}

export default function PagosContabilidad() {
  // Dropdown de filtro de estado
  const [dropdownAbierto, setDropdownAbierto] = useState(false);

  const [pagos, setPagos] = useState<Pago[]>([]);
  const [paginaActual, setPaginaActual] = useState(1);
  const pagosPorPagina = 20;
  const [cargando, setCargando] = useState(false);
  const [filtroReferencia, setFiltroReferencia] = useState("");
  const [filtroValor, setFiltroValor] = useState("");
  // Estado para el valor formateado visualmente
  const [filtroValorFormateado, setFiltroValorFormateado] = useState("");
  const [filtroIdTransaccion, setFiltroIdTransaccion] = useState("");  // 🔥 NUEVO
  const [filtroCarrier, setFiltroCarrier] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const estadosDisponibles = [
    'pendiente_conciliacion',
    'conciliado_manual', 
    'conciliado_automatico',
    'rechazado'
  ];
  const [filtroEstados, setFiltroEstados] = useState<string[]>([...estadosDisponibles]);
  const [modalVisible, setModalVisible] = useState(false);
  const [novedad, setNovedad] = useState("");
  const [refPagoSeleccionada, setRefPagoSeleccionada] = useState("");
  
  // 🔥 NUEVO: Estado para transacciones bancarias
  const [transaccionesBancarias, setTransaccionesBancarias] = useState<{[key: string]: any[]}>({});
  const [cargandoTransacciones, setCargandoTransacciones] = useState<{[key: string]: boolean}>({});
  
  const [imagenSeleccionada, setImagenSeleccionada] = useState<string | null>(null);
  const [imagenesCarrusel, setImagenesCarrusel] = useState<string[]>([]);
  const [indiceImagenActual, setIndiceImagenActual] = useState(0);
  const [modalCarruselVisible, setModalCarruselVisible] = useState(false);

  const [pagoSeleccionadoCompleto, setPagoSeleccionadoCompleto] = useState<Pago | null>(null);

  const [detalleTracking, setDetalleTracking] = useState<DetalleTracking[] | null>(null);
  const [modalDetallesVisible, setModalDetallesVisible] = useState(false);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [paginacionInfo, setPaginacionInfo] = useState<PaginacionInfo>({
    total_registros: 0,
    total_paginas: 0,
    pagina_actual: 1,
    registros_por_pagina: 20,
    tiene_siguiente: false,
    tiene_anterior: false
  });

    // Funciones para el carrusel
  const siguienteImagen = () => {
    setIndiceImagenActual((prevIndice) => 
      (prevIndice + 1) % imagenesCarrusel.length
    );
  };

  const anteriorImagen = () => {
    setIndiceImagenActual((prevIndice) => 
      prevIndice === 0 ? imagenesCarrusel.length - 1 : prevIndice - 1
    );
  };

  const irAImagen = (indice: number) => {
    setIndiceImagenActual(indice);
  };

  const cerrarCarrusel = () => {
    setModalCarruselVisible(false);
    setImagenesCarrusel([]);
    setIndiceImagenActual(0);
  };

  const abrirModalRechazo = (pago: Pago) => {
  const refParaRechazo = pago.referencia_pago_principal || pago.referencia_pago;
  console.log("🖱️ Click en botón rechazar para:", refParaRechazo);
  setRefPagoSeleccionada(refParaRechazo);
  setPagoSeleccionadoCompleto(pago); // 🔥 NUEVO: Guardar el pago completo
  setModalVisible(true);
  
  };

  // Función para obtener pagos con paginación y filtros
  const obtenerPagos = async (pagina: number = paginaActual, aplicarFiltros: boolean = false) => {
    setCargando(true);
    const offset = (pagina - 1) * pagosPorPagina;
    
    try {
      // Construir parámetros de query
      const params = new URLSearchParams({
        limit: pagosPorPagina.toString(),
        offset: offset.toString()
      });

      // Aplicar filtros si están definidos o si ya se habían aplicado anteriormente
      if (aplicarFiltros || filtrosAplicados) {
        if(filtroCarrier.trim()){
          params.append('carrier',filtroCarrier.trim());
          }
        if (filtroValor.trim()) {
          params.append('valor', filtroValor.trim());
        }
         // 🔥 NUEVO FILTRO: ID TRANSACCIÓN
        if (filtroIdTransaccion.trim()) {
          const idNumerico = parseInt(filtroIdTransaccion.trim());
          if (!isNaN(idNumerico) && idNumerico > 0) {
            params.append('id_transaccion', idNumerico.toString());
          }
        }
        if (filtroReferencia.trim()) {
          params.append('referencia', filtroReferencia.trim());
        }
        if (fechaDesde) {
          const fechaFormateada = formatearFechaParaServidor(fechaDesde);
          if (fechaFormateada) {
            params.append('fecha_desde', fechaFormateada);
          }
        }
        if (fechaHasta) {
          const fechaFormateada = formatearFechaParaServidor(fechaHasta);
          if (fechaFormateada) {
            params.append('fecha_hasta', fechaFormateada);
          }
        }
        if (filtroEstados.length > 0) {
          filtroEstados.forEach(estado => {
            params.append('estado', estado);
          });
        }
      }

      console.log('🔍 Parámetros de búsqueda:', params.toString());
      console.log('📅 Fechas enviadas:', {
        fechaDesde: fechaDesde ? formatearFechaParaServidor(fechaDesde) : 'No especificada',
        fechaHasta: fechaHasta ? formatearFechaParaServidor(fechaHasta) : 'No especificada'
      });

      const response = await fetch(`https://api.x-cargo.co/pagos/pendientes-contabilidad?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('📊 Datos recibidos:', data);
      console.log(data)      
      // Si la respuesta incluye información de paginación
      if (data.pagos && data.paginacion) {
        console.log("📈 Actualizando con paginación:", data.pagos.length, "pagos");
        setPagos(data.pagos);
        setPaginacionInfo(data.paginacion);
      } else {
        // Fallback para el formato actual
        console.log("📈 Actualizando sin paginación:", Array.isArray(data) ? data.length : "datos no válidos");
        setPagos(Array.isArray(data) ? data : []);
        // Calcular paginación estimada
        const totalEstimado = data.length
        setPaginacionInfo({
          total_registros: totalEstimado,
          total_paginas: Math.ceil(totalEstimado / pagosPorPagina),
          pagina_actual: pagina,
          registros_por_pagina: pagosPorPagina,
          tiene_siguiente: data.length === pagosPorPagina,
          tiene_anterior: pagina > 1
        });
      }

    } catch (error) {
      console.error("❌ Error cargando pagos pendientes:", error);
      setPagos([]);
      setPaginacionInfo({
        total_registros: 0,
        total_paginas: 0,
        pagina_actual: 1,
        registros_por_pagina: 20,
        tiene_siguiente: false,
        tiene_anterior: false
      });
    } finally {
      setCargando(false);
    }
  };

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

  // Función para manejar Enter en los campos de filtro
  const manejarEnterFiltros = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && hayFiltrosActivos() && !cargando) {
      aplicarFiltros();
    }
  };

  // Función para detectar si hay filtros activos
  const hayFiltrosActivos = () => {
  return filtroCarrier.trim() !== "" ||
       filtroReferencia.trim() !== "" || 
       fechaDesde !== "" || 
       fechaHasta !== "" || 
       filtroEstados.length > 0 ||
       filtroValor.trim() !== "" ||
       filtroIdTransaccion.trim() !== "";
  };

  // Estado para controlar si se aplicaron filtros
  const [filtrosAplicados, setFiltrosAplicados] = useState(false);

  useEffect(() => {
    // Si es la primera carga (filtrosAplicados es false y página 1), buscar con todos los estados activos
    if (paginaActual === 1 && !filtrosAplicados) {
      obtenerPagos(1, true);
    } else {
      obtenerPagos(paginaActual, filtrosAplicados);
    }
  }, [paginaActual]);

  // Función para validar rango de fechas
  const validarRangoFechas = (): string | null => {
    if (fechaDesde && fechaHasta) {
      const desde = new Date(fechaDesde);
      const hasta = new Date(fechaHasta);
      
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

  // Función para aplicar filtros
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
    
    // Mensaje informativo para búsqueda por referencia
    if (filtroReferencia.trim() && filtroEstados.length === 0) {
      console.log("🔍 Búsqueda por referencia: se mostrarán todos los estados para esta referencia");
    }
    
    setPaginaActual(1); // Resetear a la primera página
    setFiltrosAplicados(true);
    obtenerPagos(1, true);
  };

  // Ya no necesitamos filtrar localmente porque se hace en el servidor
  // Usamos directamente los pagos recibidos del servidor
  const pagosFiltrados = pagos;

  const descargarCSV = () => {
    if (pagosFiltrados.length === 0) {
      alert("No hay datos para exportar");
      return;
    }

    const encabezado = "ID,Referencia_Pago,Valor_Total,Fecha,Entidad,Estado,Tipo,Num_Guias,Conductor,Fecha_Creacion,Movimientos_Bancarios_IDs,Num_Movimientos,Total_Movimientos_Banco,Novedades\n";
    const filas = pagosFiltrados
      .map((p: Pago, idx: number) => {
        // Procesar movimientos bancarios para CSV
        const movimientosIds = p.movimientos_bancarios?.map(m => m.id).join(';') || p.id_banco_asociado || '';
        const numMovimientos = p.num_movimientos_banco || (p.id_banco_asociado ? 1 : 0);
        const totalMovimientos = p.total_valor_movimientos_banco || p.valor_banco_asociado || 0;
        
        return `${idx + 1},"${p.referencia_pago}",${p.valor},"${p.fecha}","${p.entidad}","${p.estado_conciliacion}","${p.tipo}",${p.num_guias},"${p.correo_conductor}","${p.creado_en || ''}","${movimientosIds}",${numMovimientos},${totalMovimientos},"${(p.novedades || '').replace(/"/g, '""')}"`;
      })
      .join("\n");

    const blob = new Blob([encabezado + filas], {
      type: "text/csv;charset=utf-8;",
    });
    
    const fechaHoy = new Date().toISOString().split("T")[0];
    saveAs(blob, `pagos-consolidados-pagina-${paginaActual}-${fechaHoy}.csv`);
  };

const descargarInformeCompleto = async () => {
  if (procesando) {
    alert("Ya hay una operación en curso, por favor espere");
    return;
  }

  const confirmacion = confirm(
    "¿Deseas descargar el informe completo con todos los registros que coincidan con los filtros actuales? Esto puede tomar varios minutos dependiendo de la cantidad de datos."
  );

  if (!confirmacion) return;

  setProcesando("descarga_completa");

  try {
    // 🔥 CONSTRUIR PARÁMETROS CON TODOS LOS FILTROS APLICADOS
    const params = new URLSearchParams();

    // Aplicar TODOS los filtros activos
    if (filtroReferencia.trim()) {
      params.append('referencia', filtroReferencia.trim());
    }
    
    // 🔥 AGREGAR FILTRO DE CARRIER
    if (filtroCarrier.trim()) {
      params.append('carrier', filtroCarrier.trim());
    }
    
    // 🔥 AGREGAR FILTRO DE VALOR
    if (filtroValor.trim()) {
      params.append('valor', filtroValor.trim());
    }
    
    // 🔥 AGREGAR FILTRO DE ID_TRANSACCION
    if (filtroIdTransaccion.trim()) {
      const idNumerico = parseInt(filtroIdTransaccion.trim());
      if (!isNaN(idNumerico) && idNumerico > 0) {
        params.append('id_transaccion', idNumerico.toString());
      }
    }
    
    if (fechaDesde) {
      const fechaFormateada = formatearFechaParaServidor(fechaDesde);
      if (fechaFormateada) {
        params.append('fecha_desde', fechaFormateada);
      }
    }
    
    if (fechaHasta) {
      const fechaFormateada = formatearFechaParaServidor(fechaHasta);
      if (fechaFormateada) {
        params.append('fecha_hasta', fechaFormateada);
      }
    }
    
    // 🔥 AGREGAR FILTROS DE ESTADO CORRECTAMENTE
    if (filtroEstados.length > 0) {
      filtroEstados.forEach(estado => {
        params.append('estado', estado);
      });
    }

    // 🔥 LOG PARA DEBUGGING
    console.log('🔍 Filtros aplicados para descarga completa:', {
      referencia: filtroReferencia,
      carrier: filtroCarrier,
      valor: filtroValor,
      id_transaccion: filtroIdTransaccion,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      estados: filtroEstados,
      params_string: params.toString()
    });

    const response = await fetch(`https://api.x-cargo.co/pagos/exportar-pendientes-contabilidad?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`
      }
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.pagos || data.pagos.length === 0) {
      alert("No se encontraron registros para exportar con los filtros aplicados");
      return;
    }

    // Crear CSV con todos los datos incluyendo las nuevas columnas de banco
    const encabezado = "ID,Referencia_Pago,Num_Referencias,Es_Grupo,Valor_Total,Fecha,Entidad,Estado,Tipo,Num_Guias,Conductor,Trackings_Completos,Hora_Pago,Novedades,Fecha_Creacion,Fecha_Modificacion,Carrier,Id_Transaccion,ID_Banco_Asociado,Valor_Banco_Asociado,Fecha_Movimiento_Banco,Descripcion_Banco\n";
    const filas = data.pagos
      .map((p: Pago, idx: number) =>
        `${idx + 1},"${p.referencia_pago}",${p.num_referencias || 1},"${p.es_grupo_transaccion ? 'Sí' : 'No'}",${p.valor},"${p.fecha}","${p.entidad}","${getEstadoTexto(p.estado_conciliacion)}","${p.tipo}",${p.num_guias},"${p.correo_conductor}","${(p.trackings_completos || '').replace(/"/g, '""')}","${p.hora_pago || ''}","${(p.novedades || '').replace(/"/g, '""')}","${p.creado_en || ''}","${p.fecha_modificacion || ''}","${p.carrier || 'N/A'}","${p.Id_Transaccion || ''}","${p.id_banco_asociado || ''}","${p.valor_banco_asociado || ''}","${p.fecha_movimiento_banco || ''}","${p.descripcion_banco || ''}"`
      )
      .join("\n");

    const blob = new Blob([encabezado + filas], {
      type: "text/csv;charset=utf-8;",
    });
    
    const fechaHoy = new Date().toISOString().split("T")[0];
    const nombreArchivo = `informe-completo-pagos-${data.info_exportacion.total_registros_exportados}-registros-${fechaHoy}.csv`;
    saveAs(blob, nombreArchivo);

    // 🔥 MENSAJE MEJORADO CON INFORMACIÓN DE FILTROS
    const filtrosAplicadosTexto = [];
    if (filtroReferencia.trim()) filtrosAplicadosTexto.push(`Referencia: ${filtroReferencia}`);
    if (filtroCarrier.trim()) filtrosAplicadosTexto.push(`Carrier: ${filtroCarrier}`);
    if (filtroValor.trim()) filtrosAplicadosTexto.push(`Valor: $${filtroValor}`);
    if (filtroIdTransaccion.trim()) filtrosAplicadosTexto.push(`ID Transacción: ${filtroIdTransaccion}`);
    if (fechaDesde) filtrosAplicadosTexto.push(`Desde: ${fechaDesde}`);
    if (fechaHasta) filtrosAplicadosTexto.push(`Hasta: ${fechaHasta}`);
    if (filtroEstados.length > 0 && filtroEstados.length < estadosDisponibles.length) {
      filtrosAplicadosTexto.push(`Estados: ${filtroEstados.join(', ')}`);
    }

    const mensajeFiltros = filtrosAplicadosTexto.length > 0 
      ? `\n🔍 Filtros aplicados:\n${filtrosAplicadosTexto.join('\n')}`
      : '\n🔍 Sin filtros específicos (todos los registros)';

    alert(`✅ Informe completo descargado exitosamente!\n\n📊 Total de registros: ${data.info_exportacion.total_registros_exportados}\n📅 Fecha de exportación: ${new Date(data.info_exportacion.fecha_exportacion).toLocaleString()}\n📁 Archivo: ${nombreArchivo}${mensajeFiltros}`);

  } catch (error) {
    console.error("❌ Error descargando informe completo:", error);
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    alert(`❌ Error al descargar el informe completo: ${errorMessage}`);
  } finally {
    setProcesando(null);
  }
};

const verImagen = async (src: string, referenciaPago?: string, correo?: string, valor?: number, fecha?: string, idTransaccion?: number) => {
  if (!src) {
    alert("No hay comprobante disponible");
    return;
  }

  // 🔥 LÓGICA MEJORADA: Priorizar Id_Transaccion para búsqueda agrupada
  if (referenciaPago && (idTransaccion || correo || valor || fecha)) {
    try {
      // Construir URL con parámetros de filtro
      const params = new URLSearchParams();
      if (correo) params.append('correo', correo);
      if (valor !== undefined) params.append('valor', valor.toString());
      if (fecha) params.append('fecha_pago', fecha);
      
      // 🔥 CLAVE: Agregar Id_Transaccion si existe
      if (idTransaccion) {
        params.append('id_transaccion', idTransaccion.toString());
        console.log(`🔍 Buscando imágenes por Id_Transaccion: ${idTransaccion}`);
      }
      
      const url = `https://api.x-cargo.co/pagos/imagenes-pago/${referenciaPago}${params.toString() ? '?' + params.toString() : ''}`;
      console.log(`📡 URL de búsqueda: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`📸 Respuesta del servidor:`, data);
        
        if (data.imagenes && data.imagenes.length > 1) {
          // Múltiples imágenes - usar carrusel
          console.log(`🎠 Mostrando carrusel con ${data.imagenes.length} imágenes`);
          setImagenesCarrusel(data.imagenes);
          setIndiceImagenActual(0);
          setModalCarruselVisible(true);
          return;
        } else if (data.imagenes && data.imagenes.length === 1) {
          // Una sola imagen
          console.log(`🖼️ Mostrando imagen individual`);
          setImagenSeleccionada(data.imagenes[0]);
          return;
        }
      } else {
        console.warn(`⚠️ Error en respuesta: ${response.status} - ${response.statusText}`);
      }
    } catch (error) {
      console.warn("No se pudieron cargar múltiples imágenes, mostrando imagen individual:", error);
    }
  }

  // Imagen individual (comportamiento original)
  console.log(`🖼️ Fallback: Mostrando imagen individual`);
  setImagenSeleccionada(src);
};


const verDetallesPago = async ({
  referencia_pago,
  correo,
  fecha_pago,
  valor,
  id_transaccion
}: {
  referencia_pago: string;
  correo?: string;
  fecha_pago?: string;
  valor?: number;
  id_transaccion?: number;
}) => {
  try {
    let url = "";
    // Si el pago tiene id_transaccion, solo enviar ese parámetro
    if (id_transaccion !== undefined && id_transaccion !== null) {
      url = `https://api.x-cargo.co/pagos/detalles-pago?id_transaccion=${id_transaccion}`;
    } else {
      const params = new URLSearchParams();
      if (correo) params.append("correo", correo);
      if (fecha_pago) params.append("fecha_pago", fecha_pago);
      if (valor !== undefined) params.append("valor", valor.toString());
      url = `https://api.x-cargo.co/pagos/detalles-pago/${referencia_pago}?${params.toString()}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("🟢 Datos recibidos en verDetallesPago:", data);
    setDetalleTracking(data.detalles || []);
    setModalDetallesVisible(true);

  } catch (err: any) {
    console.error("Error cargando detalles:", err);
    alert(`Error al cargar detalles del pago: ${err.message}`);
  }
};

const verDetallesGuias = async ({
  referencia_pago,
  id_transaccion,
  fecha_pago,
  valor_pagado
}: {
  referencia_pago?: string;
  id_transaccion?: number;
  fecha_pago?: string;
  valor_pagado?: number;
}) => {
  try {
    const params = new URLSearchParams();
    if (referencia_pago) params.append("referencia_pago", referencia_pago);
    if (id_transaccion) params.append("id_transaccion", id_transaccion.toString());
    if (fecha_pago) params.append("fecha_pago", fecha_pago);           // ← Añade esto
    if (valor_pagado !== undefined) params.append("valor_pagado", valor_pagado.toString()); // ← Añade esto

    const response = await fetch(
      `https://api.x-cargo.co/pagos/detalles-guias?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${getToken()}` }
      }
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }


    const data = await response.json();
    // Mapea los datos recibidos al formato esperado por el modal
    const detalles = (data.guias || []).map((g: any) => ({
      tracking: g.tracking,
      referencia: g.pago_referencia,
      valor: g.valor_pagado ?? g.valor_guia,
      cliente: g.cliente,
      carrier: g.carrier,
      tipo: g.metodo_pago,
      fecha_pago: g.fecha_pago,
      hora_pago: "",
      estado: g.estado_liquidacion,
      novedades: "",
      comprobante: "",
      valor_guia: g.valor_guia,
      valor_cod: g.valor_cod,
      valor_total_consignacion_pc: g.valor_total_consignacion_pc,
      valor_guia_gl: g.valor_guia_gl,      // <-- Nuevo
      valor_guia_cod: g.valor_guia_cod     // <-- Nuevo

    }));
    setDetalleTracking(detalles);
    setModalDetallesVisible(true);

  } catch (err: any) {
    console.error("Error cargando detalles de guías:", err);
    alert(`Error al cargar detalles de guías: ${err.message}`);
  }
};

const confirmarRechazo = async () => {
  console.log("🔄 Iniciando proceso de rechazo...", {
    refPagoSeleccionada,
    novedad: novedad.trim(),
    procesando
  });

  if (!novedad.trim()) {
    alert("Debe escribir una observación para rechazar el pago");
    return;
  }

  if (procesando) return;
  setProcesando(refPagoSeleccionada);

  try {
    const user = JSON.parse(localStorage.getItem("user") || '{"email":"usuario@sistema.com"}');
    
    // 🔥 BUSCAR EL PAGO SELECCIONADO PARA OBTENER SU Id_Transaccion
    const pagoSeleccionado = pagos.find(p => 
      (p.referencia_pago_principal || p.referencia_pago) === refPagoSeleccionada
    );
    
    // 🔥 CONSTRUIR PAYLOAD CON Id_Transaccion SI EXISTE
    const payload: any = {
      novedad,
      modificado_por: user.email,
    };
    
    // Priorizar Id_Transaccion si existe, sino usar referencia_pago
    if (pagoSeleccionado?.Id_Transaccion) {
      payload.id_transaccion = pagoSeleccionado.Id_Transaccion;
      console.log("📡 Enviando petición de rechazo por Id_Transaccion:", {
        id_transaccion: pagoSeleccionado.Id_Transaccion,
        novedad,
        modificado_por: user.email,
      });
    } else {
      payload.referencia_pago = refPagoSeleccionada;
      console.log("📡 Enviando petición de rechazo por referencia_pago:", {
        referencia_pago: refPagoSeleccionada,
        novedad,
        modificado_por: user.email,
      });
<<<<<<< HEAD

      const response = await fetch("https://api.x-cargo.co/pagos/rechazar-pago", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          referencia_pago: refPagoSeleccionada,
          novedad,
          modificado_por: user.email,
        }),
      });

      console.log("📊 Estado de la respuesta:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Error desconocido");
      }

      const resultado = await response.json();
      console.log("✅ Respuesta del servidor:", resultado);

      alert(`❌ Pago rechazado correctamente. Razón: ${novedad}`);
      
      setModalVisible(false);
      setNovedad("");
      setRefPagoSeleccionada("");
      
      // Mantener los filtros aplicados después de rechazar
      await obtenerPagos(paginaActual, filtrosAplicados);
      
    } catch (error: any) {
      console.error("Error rechazando pago:", error);
      alert(`❌ Error al rechazar el pago: ${error.message}`);
    } finally {
      setProcesando(null);
=======
>>>>>>> origin/Oscar
    }

    const response = await fetch("http://127.0.0.1:8000/pagos/rechazar-pago", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getToken()}`
      },
      body: JSON.stringify(payload),
    });

    console.log("📊 Estado de la respuesta:", {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Error desconocido");
    }

    const resultado = await response.json();
    console.log("✅ Respuesta del servidor:", resultado);

    // 🔥 MENSAJE MEJORADO PARA MOSTRAR SI FUE POR GRUPO O INDIVIDUAL
    const mensajeExito = pagoSeleccionado?.Id_Transaccion
      ? `❌ Grupo de pagos rechazado correctamente (ID: ${pagoSeleccionado.Id_Transaccion}). Razón: ${novedad}`
      : `❌ Pago rechazado correctamente. Razón: ${novedad}`;
    
    alert(mensajeExito);
    
    setModalVisible(false);
    setNovedad("");
    setRefPagoSeleccionada("");
    
    // Mantener los filtros aplicados después de rechazar
    await obtenerPagos(paginaActual, filtrosAplicados);
    
  } catch (error: any) {
    console.error("Error rechazando pago:", error);
    alert(`❌ Error al rechazar el pago: ${error.message}`);
  } finally {
    setProcesando(null);
  }
};

  const getEstadoTexto = (estado: string | undefined): string => {
    if (!estado) return "⏳ Sin estado";
    const textos: { [key: string]: string } = {
      'pendiente_conciliacion': '⏳ Pendiente conciliación',
      'conciliado_manual': '🔎 Conciliado manual',
      'conciliado_automatico': '🤖 Conciliado automático',
      'rechazado': '❌ Rechazado'
      
    };
    return textos[estado.toLowerCase()] || estado;
  };

function parseFechaLocal(fechaStr: string) {
  const [year, month, day] = fechaStr.split('-').map(Number);
  return new Date(year, month - 1, day);
  }
  

  const limpiarFiltros = () => {
    setFiltroReferencia("");
    setFiltroCarrier("");
    setFiltroIdTransaccion("");
    setFechaDesde("");
    setFechaHasta("");
    setFiltroEstados([...estadosDisponibles]);
    setFiltroValor("");
    setPaginaActual(1);
    setFiltrosAplicados(false);
    obtenerPagos(1, false);
  };

  // Para obtener estados únicos, necesitamos hacer una consulta específica o usar todos los estados conocidos
  // ...existing code...

  // Funciones de paginación
  const irAPagina = (pagina: number) => {
    if (pagina >= 1 && pagina <= paginacionInfo.total_paginas) {
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

  // 🔥 NUEVA FUNCIÓN PARA OBTENER TRANSACCIONES BANCARIAS ASOCIADAS
  const obtenerTransaccionesBancarias = async (referenciaPago: string, idTransaccion?: number) => {
    const key = idTransaccion ? `tx_${idTransaccion}` : referenciaPago;
    
    // Si ya tenemos las transacciones cargadas, no volver a cargar
    if (transaccionesBancarias[key]) {
      return transaccionesBancarias[key];
    }
    
    setCargandoTransacciones(prev => ({ ...prev, [key]: true }));
    
    try {
      const params = new URLSearchParams();
      params.append('referencia', referenciaPago);
      
      const url = `http://127.0.0.1:8000/conciliacion/transacciones-bancarias-disponibles?${params.toString()}`;
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const transacciones = data.transacciones || [];
      
      // Guardar en el estado
      setTransaccionesBancarias(prev => ({ ...prev, [key]: transacciones }));
      
      return transacciones;
    } catch (error) {
      console.error('Error obteniendo transacciones bancarias:', error);
      return [];
    } finally {
      setCargandoTransacciones(prev => ({ ...prev, [key]: false }));
    }
  };

  // 🔥 FUNCIÓN PARA MANEJAR CLIC EN TRANSACCIONES BANCARIAS
  const toggleTransaccionesBancarias = async (referenciaPago: string, idTransaccion?: number) => {
    const key = idTransaccion ? `tx_${idTransaccion}` : referenciaPago;
    
    if (transaccionesBancarias[key]) {
      // Si ya están cargadas, las ocultamos
      setTransaccionesBancarias(prev => {
        const newState = { ...prev };
        delete newState[key];
        return newState;
      });
    } else {
      // Si no están cargadas, las cargamos
      await obtenerTransaccionesBancarias(referenciaPago, idTransaccion);
    }
  };

  function limpiarValorMoneda(valor: string) {
    return valor.replace(/[^\d.]/g, "").replace(/(\..*)\./g, '$1');
  }

  function formatearComoMoneda(valor: string) {
    if (!valor) return "";
    const partes = valor.split(".");
    let entero = partes[0].replace(/^0+(?!$)/, "");
    let decimal = partes[1] || "";
    entero = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return decimal ? `${entero}.${decimal}` : entero;
  }

  function manejarCambioValor(e: React.ChangeEvent<HTMLInputElement>) {
    const valorLimpio = limpiarValorMoneda(e.target.value);
    setFiltroValor(valorLimpio);
    setFiltroValorFormateado(formatearComoMoneda(valorLimpio));
  }

  useEffect(() => {
    if (filtroValor === "") {
      setFiltroValorFormateado("");
    }
  }, [filtroValor]);

  return (
    <div className="pagos-page">
      <h2 className="pagos-title">Módulo de Pagos - Contabilidad</h2>

      {/* Información de paginación */}
      <div className="pagos-info" style={{ marginBottom: "1rem", padding: "0.5rem", backgroundColor: "#f8f9fa", borderRadius: "4px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.9rem", color: "#6c757d" }}>
            Mostrando {pagosFiltrados.length} de {paginacionInfo.total_registros} registros 
            (Página {paginaActual} de {paginacionInfo.total_paginas})
          </span>
          {(filtrosAplicados && hayFiltrosActivos()) && (
            <span style={{ 
              fontSize: "0.8rem", 
              color: "#007bff", 
              backgroundColor: "#e3f2fd", 
              padding: "0.2rem 0.5rem", 
              borderRadius: "12px",
              fontWeight: "500"
            }}>
              🔍 Filtros activos
            </span>
          )}
        </div>
      </div>

      <div className="pagos-filtros">
        <label>
          Buscar referencia:
          <input
            type="text"
            placeholder="Ej: REF123"
            value={filtroReferencia}
            onChange={(e) => setFiltroReferencia(e.target.value)}
            onKeyDown={manejarEnterFiltros}
          />
        </label>
        <label>
          Buscar valor:
          <input
            type="text"
            placeholder="Ej: 10"
            value={filtroValorFormateado}
            onChange={manejarCambioValor}
            onKeyDown={manejarEnterFiltros}
            inputMode="decimal"
            autoComplete="off"
          />
        </label>
        {/* 🔥 NUEVO FILTRO: ID TRANSACCIÓN */}
        <label>
          ID Transacción:
          <input
            type="number"
            placeholder="Ej: 2693"
            value={filtroIdTransaccion}
            onChange={(e) => {
              const valor = e.target.value;
              // Solo permitir números positivos
              if (valor === "" || (parseInt(valor) > 0 && !isNaN(parseInt(valor)))) {
                setFiltroIdTransaccion(valor);
              }
            }}
            onKeyDown={manejarEnterFiltros}
            min="1"
            style={{
              backgroundColor: filtroIdTransaccion.trim() ? "#e3f2fd" : undefined,
              borderColor: filtroIdTransaccion.trim() ? "#2196f3" : undefined
            }}
          />
          {filtroIdTransaccion.trim() && (
            <small style={{ color: "#2196f3", fontSize: "0.8rem", display: "block" }}>
              🔍 Buscando ID: {filtroIdTransaccion}
            </small>
          )}
        </label>

        <label>
          Buscar Carrier:
          <input
            type="text"
            placeholder="Ej: John Doe"
            value={filtroCarrier}
            onChange={(e) => setFiltroCarrier(e.target.value)}
            onKeyDown={manejarEnterFiltros}
          />
        </label> 
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
            <span><span style={{color:'#333', fontWeight:400}}>{filtroEstados.length === estadosDisponibles.length ? 'Todos' : filtroEstados.map(getEstadoTexto).join(', ') || 'Ninguno'}</span></span>
            <span style={{fontSize:'1.2em', color:'#1976d2'}}>{dropdownAbierto ? '▲' : '▼'}</span>
          </button>
          {dropdownAbierto && (
            <div
              style={{
                position: 'absolute',
                top: '110%',
                left: 0,
                zIndex: 10,
                background: '#fff',
                border: '1px solid #b6d4fa',
                borderRadius: 8,
                boxShadow: '0 2px 8px #b6d4fa55',
                padding: '0.7rem 1rem',
                minWidth: 210,
                minHeight: 10,
                marginTop: 2
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {estadosDisponibles.map((estado) => (
                  <label
                    key={estado}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontWeight: 500,
                      background: filtroEstados.includes(estado) ? '#e3f2fd' : 'transparent',
                      borderRadius: 5,
                      padding: '0.18rem 0.5rem',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                      border: filtroEstados.includes(estado) ? '1px solid #90caf9' : '1px solid transparent',
                      boxShadow: filtroEstados.includes(estado) ? '0 1px 2px #b6d4fa33' : 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filtroEstados.includes(estado)}
                      onChange={e => {
                        if (e.target.checked) {
                          setFiltroEstados(prev => [...prev, estado]);
                        } else {
                          setFiltroEstados(prev => prev.filter(est => est !== estado));
                        }
                      }}
                      style={{ accentColor: '#1976d2', width: 16, height: 16, marginRight: 2 }}
                    />
                    <span style={{ fontSize: '0.98rem', color: '#222', userSelect: 'none' }}>{getEstadoTexto(estado)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <label>
          Desde:
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            onKeyDown={manejarEnterFiltros}
            title="Formato: YYYY-MM-DD"
          />
          {fechaDesde && (
            <small style={{ color: "#666", fontSize: "0.8rem", display: "block" }}>
              📅 {parseFechaLocal(fechaDesde).toLocaleDateString()}
            </small>
          )}
        </label>
        <label>
          Hasta:
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            onKeyDown={manejarEnterFiltros}
            title="Formato: YYYY-MM-DD"
          />
          {fechaHasta && (
            <small style={{ color: "#666", fontSize: "0.8rem", display: "block" }}>
              📅{parseFechaLocal(fechaHasta).toLocaleDateString()}
            </small>
          )}
        </label>
        <button 
          onClick={aplicarFiltros} 
          className="boton-accion" 
          disabled={cargando || !hayFiltrosActivos()}
          style={{
            backgroundColor: !hayFiltrosActivos() ? "#6c757d" : undefined,
            cursor: !hayFiltrosActivos() ? "not-allowed" : "pointer"
          }}
        >
          🔍 Buscar
        </button>
        <button 
          onClick={limpiarFiltros} 
          className="boton-accion" 
          disabled={cargando}
          style={{
            backgroundColor: filtrosAplicados ? "#dc3545" : undefined,
            color: filtrosAplicados ? "white" : undefined
          }}
        >
          {filtrosAplicados ? "🗑️ Limpiar Filtros" : "🗑️ Limpiar"}
        </button>
        <button onClick={descargarCSV} className="boton-accion">
          📥 Descargar Página
        </button>
        <button 
          onClick={descargarInformeCompleto} 
          className="boton-accion"
          disabled={procesando === "descarga_completa"}
          style={{
            backgroundColor: procesando === "descarga_completa" ? "#6c757d" : "#28a745",
            color: "white",
            position: "relative"
          }}
        >
          {procesando === "descarga_completa" ? "⏳ Descargando..." : "📊 Descargar Informe Completo"}
        </button>
      </div>

      {cargando && (
        <div style={{ textAlign: "center", padding: "2rem", color: "#666" }}>
          <div>⏳ Cargando pagos...</div>
        </div>
      )}

      <div className="pagos-tabla-container">
        <table className="pagos-tabla">
          <thead>
            <tr>
              <th>ID</th>
              <th>Ref. Pago</th>
              <th>Valor Total</th>
              <th>Guías</th>
              <th>Fecha</th>
              <th>Fecha Creación</th>
              <th>Carrier</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Comprobante</th>
              <th>Trackings</th>
              <th>Movimientos Bancarios</th>
              <th>Novedades</th>
              <th>Acción</th>
            </tr>
          </thead>


          <tbody>
            {pagosFiltrados.length > 0 ? (
              pagosFiltrados.map((p, idx) => (
                <React.Fragment key={`${p.referencia_pago}-${p.fecha}-${idx}`}>
                  <tr>
                  <td>{((paginaActual - 1) * pagosPorPagina) + idx + 1}</td>
                  
                   {/* 🔥 COLUMNA DE REFERENCIA SIMPLIFICADA */}
                  <td style={{ 
                    fontSize: p.es_grupo_transaccion ? '0.9rem' : '1rem',
                    fontWeight: p.es_grupo_transaccion ? 'bold' : 'normal'
                  }}>
                    {p.es_grupo_transaccion && (
                      <div style={{ 
                        fontSize: '0.7rem', 
                        color: '#007bff', 
                        marginBottom: '2px',
                        fontWeight: 'normal'
                      }}>
                        
                      </div>
                    )}
                    <div title={p.es_grupo_transaccion ? p.referencia_pago : undefined}>
                      {p.es_grupo_transaccion && p.referencia_pago && p.referencia_pago.length > 40 
                        ? `${p.referencia_pago.substring(0, 40)}...` 
                        : p.referencia_pago}
                    </div>
                    {p.Id_Transaccion && (
                      <div style={{ 
                        fontSize: '0.7rem', 
                        color: '#6c757d', 
                        marginTop: '2px' 
                      }}>
                        ID: {p.Id_Transaccion}
                      </div>
                    )}
                  </td>
                  
                  <td>${p.valor.toLocaleString()}</td>
                  
                  {/* 🔥 MEJORAR COLUMNA DE GUÍAS */}
                  <td>
                    {p.num_guias}
                    {p.es_grupo_transaccion && (
                      <div style={{ fontSize: '0.7rem', color: '#28a745' }}>
                        (agrupadas)
                      </div>
                    )}
                  </td>
                  
                  <td>{p.fecha}</td>
                  <td>{p.creado_en}</td>
                  <td>{p.carrier || "N/A"}</td>
                  <td>{p.tipo}</td>
                  <td style={{
                    color: p.estado_conciliacion === "rechazado" ? "crimson" :
                          p.estado_conciliacion === "Rechazado" ? "crimson" :
                          p.estado_conciliacion === "conciliado_manual" ? "green" : undefined
                  }}>
                    {getEstadoTexto(p.estado_conciliacion)}
                  </td>
                  
                  {/* 🔥 MEJORAR BOTÓN DE COMPROBANTE */}
                  {/* 🔥 MEJORAR BOTÓN DE COMPROBANTE */}
                  <td>
                    <button
                      onClick={() => verImagen(
                        p.imagen, 
                        p.referencia_pago_principal || p.referencia_pago, // Usar principal para búsqueda
                        p.correo_conductor, 
                        p.valor, 
                        p.fecha,
                        p.Id_Transaccion  // 🔥 AGREGAR ID_TRANSACCION
                      )}
                      className="btn-ver"
                      title={p.es_grupo_transaccion 
                        ? `Ver comprobantes del grupo (${p.num_referencias} referencias)` 
                        : "Ver comprobante"}
                    >
                      👁 Ver
                      {p.es_grupo_transaccion && (
                        <span style={{fontSize: '0.8em', color: '#ffffffff', marginLeft: '4px'}}>
                          ({p.num_referencias})
                        </span>
                      )}
                    </button>
                  </td>
                  
                  <td>

                  <button
                    onClick={() => verDetallesPago({
                      referencia_pago: p.referencia_pago_principal || p.referencia_pago,
                      correo: p.correo_conductor,
                      fecha_pago: p.fecha,
                      valor: p.valor,
                      id_transaccion: p.Id_Transaccion
                    })}
                    className="btn-ver"
                    title={p.trackings_preview}
                  >
                    Detalles ({p.num_guias})
                    {p.es_grupo_transaccion && (
                      <span style={{fontSize: '0.7em', color: '#ffffffff', display: 'block'}}>
                        Grupo
                      </span>
                    )}
                  </button>
                  </td>
                  {/* 🔥 CELDA MEJORADA PARA MOVIMIENTOS BANCARIOS INDIVIDUALES */}
                  <td style={{ padding: "6px", fontSize: "0.85rem" }}>
                    {p.movimientos_bancarios && p.movimientos_bancarios.length > 0 ? (
                      <div style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                        maxWidth: "200px"
                      }}>
                        {/* Encabezado con total de movimientos */}
                        <div style={{
                          fontSize: "0.7rem",
                          fontWeight: "600",
                          color: "#495057",
                          marginBottom: "4px",
                          textAlign: "center"
                        }}>
                          🏦 {p.num_movimientos_banco || 0} Movimiento{(p.num_movimientos_banco || 0) > 1 ? 's' : ''} Bancario{(p.num_movimientos_banco || 0) > 1 ? 's' : ''}
                        </div>
                        
                        {/* Lista de movimientos individuales */}
                        <div style={{
                          maxHeight: "120px",
                          overflowY: "auto",
                          display: "flex",
                          flexDirection: "column",
                          gap: "3px"
                        }}>
                          {p.movimientos_bancarios.map((movimiento, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                padding: "6px 8px",
                                borderRadius: "6px",
                                fontSize: "0.7rem",
                                fontWeight: "500",
                                backgroundColor: "#d4edda",
                                color: "#155724",
                                border: "1px solid #c3e6cb",
                                gap: "2px"
                              }}
                            >
                              {/* ID del movimiento */}
                              <div style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                fontSize: "0.65rem"
                              }}>
                                <span style={{ fontWeight: "600" }}>ID: {movimiento.id}</span>
                                <span style={{ color: "#6c757d" }}>{movimiento.fecha}</span>
                              </div>
                              
                              {/* Valor del movimiento */}
                              <div style={{
                                fontSize: "0.7rem",
                                color: "#155724",
                                fontWeight: "600",
                                textAlign: "center"
                              }}>
                                💰 ${movimiento.valor?.toLocaleString() || 'N/A'}
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Total de todos los movimientos */}
                        {p.total_valor_movimientos_banco && (p.num_movimientos_banco || 0) > 1 && (
                          <div style={{
                            marginTop: "4px",
                            padding: "4px 8px",
                            backgroundColor: "#cce5ff",
                            border: "1px solid #99d1ff",
                            borderRadius: "6px",
                            fontSize: "0.7rem",
                            fontWeight: "600",
                            color: "#0056b3",
                            textAlign: "center"
                          }}>
                            💰 Total: ${p.total_valor_movimientos_banco.toLocaleString()}
                          </div>
                        )}
                      </div>
                    ) : p.id_banco_asociado ? (
                      // Fallback para formato anterior
                      <div style={{
                        display: "inline-flex",
                        flexDirection: "column",
                        alignItems: "center",
                        padding: "8px 12px",
                        borderRadius: "12px",
                        fontSize: "0.75rem",
                        fontWeight: "500",
                        backgroundColor: "#d4edda",
                        color: "#155724",
                        border: "1px solid #c3e6cb",
                        minWidth: "120px",
                        gap: "2px"
                      }}>
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "0.75rem"
                        }}>
                          🏦 {p.id_banco_asociado}
                        </div>
                        
                        {p.valor_banco_asociado && (
                          <div style={{
                            fontSize: "0.7rem",
                            color: "#155724",
                            fontWeight: "600",
                            display: "flex",
                            alignItems: "center",
                            gap: "2px"
                          }}>
                            💰 ${p.valor_banco_asociado.toLocaleString()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "6px 12px",
                        borderRadius: "12px",
                        fontSize: "0.75rem",
                        fontWeight: "500",
                        backgroundColor: "#f8f9fa",
                        color: "#6c757d",
                        border: "1px solid #e9ecef"
                      }}>
                        - Sin ID -
                      </span>
                    )}
                  </td>
                  
                  {/* 🔥 MEJORAR BOTÓN DE RECHAZO */}
                  <td>
                    {!(p.estado_conciliacion === "rechazado" ||
                        p.estado_conciliacion === "Rechazado" ||
                        p.estado_conciliacion === "conciliado_manual" ||
                        p.estado_conciliacion === "conciliado_automatico") && (
                  <button
                    onClick={() => abrirModalRechazo(p)} // 🔥 CAMBIO: Usar nueva función
                    className="boton-rechazar"
                    disabled={procesando === (p.referencia_pago_principal || p.referencia_pago)}
                    title={p.es_grupo_transaccion 
                      ? `Rechazar grupo de ${p.num_referencias} referencias` 
                      : "Rechazar pago"}
                  >
                    {procesando === (p.referencia_pago_principal || p.referencia_pago) 
                      ? "⏳ Procesando..." 
                      : p.es_grupo_transaccion ? "Rechazar Grupo" : "Rechazar"}
                  </button>
                    )}
                  </td>
                </tr>
                
                {/* Fila adicional para mostrar transacciones bancarias */}
                {p.es_grupo_transaccion && p.Id_Transaccion && transaccionesBancarias[String(p.Id_Transaccion)] && (
                  <tr style={{ backgroundColor: "#f8f9fa" }}>
                    <td colSpan={13} style={{ padding: "12px" }}>
                      <div style={{
                        backgroundColor: "white",
                        border: "1px solid #dee2e6",
                        borderRadius: "8px",
                        padding: "12px"
                      }}>
                        <h4 style={{
                          margin: "0 0 8px 0",
                          fontSize: "0.9rem",
                          color: "#495057",
                          fontWeight: "600"
                        }}>
                          🏦 Transacciones Bancarias Asociadas ({transaccionesBancarias[String(p.Id_Transaccion)].length})
                        </h4>
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                          gap: "8px",
                          maxHeight: "200px",
                          overflowY: "auto"
                        }}>
                          {transaccionesBancarias[String(p.Id_Transaccion)].map((transaccion: any, index: number) => (
                            <div
                              key={index}
                              style={{
                                border: "1px solid #e9ecef",
                                borderRadius: "6px",
                                padding: "8px 10px",
                                backgroundColor: "#f8f9fa",
                                fontSize: "0.8rem"
                              }}
                            >
                              <div style={{ fontWeight: "600", color: "#495057", marginBottom: "4px" }}>
                                ID: {transaccion.id_banco}
                              </div>
                              <div style={{ color: "#6c757d", marginBottom: "2px" }}>
                                💰 ${transaccion.valor?.toLocaleString() || 'N/A'}
                              </div>
                              <div style={{ color: "#6c757d", marginBottom: "2px" }}>
                                📅 {transaccion.fecha || 'N/A'}
                              </div>
                              {transaccion.descripcion && (
                                <div style={{ 
                                  color: "#6c757d", 
                                  fontSize: "0.75rem",
                                  fontStyle: "italic",
                                  marginTop: "4px",
                                  maxWidth: "100%",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap"
                                }}>
                                  {transaccion.descripcion}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))
            ) : (
              <tr>
                <td colSpan={13} style={{ textAlign: "center", padding: "1rem" }}>
                  {cargando ? "Cargando..." : "No hay pagos registrados."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Controles de Paginación */}
      {paginacionInfo.total_paginas > 1 && (
        <div className="paginacion-controles" style={{
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
            className="boton-paginacion"
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
            className="boton-paginacion"
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

      

{modalDetallesVisible && detalleTracking && (
  <div className="modal-detalles-overlay" onClick={() => setModalDetallesVisible(false)}>
    <div className="modal-detalles-content" onClick={(e) => e.stopPropagation()}>

      {/* Header del Modal */}
      <div className="modal-detalles-header">
        <h2 className="modal-detalles-title">
          Detalles del Pago
        </h2>
        <p className="modal-detalles-subtitle">
          Referencia: {detalleTracking[0]?.referencia || 'N/A'}
        </p>
        <button 
          className="modal-cerrar-btn"
          onClick={() => setModalDetallesVisible(false)}
          title="Cerrar"
        >
          ×
        </button>
      </div>

      {/* Cuerpo del Modal */}
      <div className="modal-detalles-body">
        {/* Información del Pago */}
        <div className="pago-info-card">
          <div className="pago-info-grid">
            <div className="pago-info-item">
              <span className="pago-info-label">Referencia</span>
              <span className="pago-info-value">{detalleTracking[0]?.referencia || 'N/A'}</span>
            </div>
            <div className="pago-info-item">
              <span className="pago-info-label">Total</span>
              <span className="pago-info-value">
                {
                  (() => {
                    // Sumar el menor valor distinto de cero de cada guía
                    const total = detalleTracking.reduce((sum, item) => {
                      const valores = [
                        item.valor_guia ?? 0,
                        item.valor_guia_cod ?? 0,
                        item.valor_total_consignacion_pc ?? 0,
                        item.valor ?? 0,
                        item.valor_guia_gl ?? 0,
                        item.valor_guia_cod ?? 0
                      ].filter(v => v > 0);
                      const menor = valores.length > 0 ? Math.min(...valores) : 0;
                      return sum + menor;
                    }, 0);
                    return `$${total.toLocaleString('es-ES')}`;
                  })()
                }
              </span>
            </div>
            <div className="pago-info-item">
              <span className="pago-info-label">Cantidad de Guías</span>
              <span className="pago-info-value">{detalleTracking.length}</span>
            </div>
          </div>
        </div>

        {/* Lista de Trackings */}
        {detalleTracking && detalleTracking.length > 0 && (
          <div>
            <h3 className="trackings-section-title">
              Guías Incluidas
              <span className="trackings-count">
                {detalleTracking.length}
              </span>
            </h3>
            <div className="trackings-lista">
              {detalleTracking.map((item: DetalleTracking, index: number) => (
                <div key={index} className="tracking-item">
                  <div className="tracking-header">
                    <div className="tracking-numero">
                      #{item.tracking}
                    </div>
                    <div className="tracking-valor">
                      {
                        (() => {
                          // Mostrar el menor valor distinto de cero
                          const valores = [
                            item.valor_guia ?? 0,
                            item.valor_guia_cod ?? 0,
                            item.valor_total_consignacion_pc ?? 0,
                            item.valor ?? 0,
                            item.valor_guia_gl ?? 0,
                            item.valor_guia_cod ?? 0
                          ].filter(v => v > 0);
                          if (valores.length === 0) return "$0";
                          const menor = Math.min(...valores);
                          return `$${menor.toLocaleString('es-ES')}`;
                        })()
                      }
                    </div>
                  </div>
                  <div className="tracking-detalles">
                    <div className="tracking-detail-item">
                      <span className="tracking-detail-label">Referencia</span>
                      <span className="tracking-detail-value">{item.referencia}</span>
                    </div>
                    <div className="tracking-detail-item">
                      <span className="tracking-detail-label">Número de Guía</span>
                      <span className="tracking-detail-value">{item.tracking}</span>
                    </div>
                    <div className="tracking-detail-item">
                      <span className="pago-info-label">Total</span>
                      <span className="pago-info-value">
                        {
                          (() => {
                            // Mostrar el menor valor distinto de cero
                            const valores = [
                              item.valor_guia ?? 0,
                              item.valor_guia_cod ?? 0,
                              item.valor_total_consignacion_pc ?? 0,
                              item.valor ?? 0,
                              item.valor_guia_gl ?? 0,
                              item.valor_guia_cod ?? 0
                            ].filter(v => v > 0);
                            if (valores.length === 0) return "$0";
                            const menor = Math.min(...valores);
                            return `$${menor.toLocaleString('es-ES')}`;
                          })()
                        }
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mensaje si no hay trackings */}
        {(!detalleTracking || detalleTracking.length === 0) && (
          <div style={{ 
            textAlign: 'center', 
            padding: '2rem', 
            color: '#64748b',
            fontStyle: 'italic'
          }}>
            No se encontraron guías asociadas a este pago.
          </div>
        )}
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
      {/* Modal de Carrusel de Imágenes */}

           {/* Modal de Carrusel de Imágenes - AGREGAR AQUÍ */}
      {modalCarruselVisible && imagenesCarrusel.length > 0 && (
        <div className="modal-overlay" onClick={cerrarCarrusel}>
          <div className="modal-carrusel-content" onClick={(e) => e.stopPropagation()}>
            
            {/* Header del carrusel */}
            <div className="carrusel-header">
              <h3>Comprobantes de Pago</h3>
              <span className="carrusel-contador">
                {indiceImagenActual + 1} de {imagenesCarrusel.length}
              </span>
              <button
                onClick={cerrarCarrusel}
                className="cerrar-modal"
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '15px',
                  background: 'rgba(0,0,0,0.5)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '30px',
                  height: '30px',
                  cursor: 'pointer',
                  fontSize: '18px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Imagen principal */}
            <div className="carrusel-imagen-container">
              <img 
                src={imagenesCarrusel[indiceImagenActual]} 
                alt={`Comprobante ${indiceImagenActual + 1}`}
                style={{
                  maxWidth: '90vw',
                  maxHeight: '70vh',
                  objectFit: 'contain'
                }}
              />
            </div>

            {/* Controles de navegación */}
            {imagenesCarrusel.length > 1 && (
              <>
                {/* Botones anterior/siguiente */}
                <button
                  onClick={anteriorImagen}
                  className="carrusel-btn carrusel-btn-anterior"
                  style={{
                    position: 'absolute',
                    left: '20px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '50px',
                    height: '50px',
                    cursor: 'pointer',
                    fontSize: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ←
                </button>

                <button
                  onClick={siguienteImagen}
                  className="carrusel-btn carrusel-btn-siguiente"
                  style={{
                    position: 'absolute',
                    right: '20px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '50px',
                    height: '50px',
                    cursor: 'pointer',
                    fontSize: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  →
                </button>

                {/* Indicadores de posición */}
                <div className="carrusel-indicadores" style={{
                  position: 'absolute',
                  bottom: '20px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  gap: '8px'
                }}>
                  {imagenesCarrusel.map((_, indice) => (
                    <button
                      key={indice}
                      onClick={() => irAImagen(indice)}
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        border: 'none',
                        background: indice === indiceImagenActual ? '#007bff' : 'rgba(255,255,255,0.5)',
                        cursor: 'pointer',
                        transition: 'background 0.3s'
                      }}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Información adicional */}
            <div className="carrusel-info" style={{
              position: 'absolute',
              bottom: '60px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.7)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '14px'
            }}>
              Comprobante {indiceImagenActual + 1} de {imagenesCarrusel.length}
            </div>
          </div>
        </div>
      )}


      {/* Modal de Rechazo */}
      {modalVisible && pagoSeleccionadoCompleto && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "600px", width: "90%" }}>
            <h3>¿Por qué deseas rechazar este pago?</h3>
            
            {/* 🔥 INFORMACIÓN COMPLETA DEL PAGO/GRUPO */}
            <div style={{ 
              backgroundColor: "#f8f9fa", 
              padding: "1rem", 
              borderRadius: "8px", 
              marginBottom: "1rem",
              border: "1px solid #e9ecef"
            }}>
              {/* Mostrar si es grupo o individual */}
              {pagoSeleccionadoCompleto.es_grupo_transaccion ? (
                <div>
                  <div style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "8px", 
                    marginBottom: "8px",
                    fontSize: "0.9rem",
                    fontWeight: "600",
                    color: "#007bff"
                  }}>
                    🔗 Grupo de Pagos
                    <span style={{ 
                      backgroundColor: "#e3f2fd", 
                      padding: "2px 8px", 
                      borderRadius: "12px",
                      fontSize: "0.8rem"
                    }}>
                      {pagoSeleccionadoCompleto.num_referencias} referencias
                    </span>
                  </div>
                  
                  {/* ID Transacción */}
                  {pagoSeleccionadoCompleto.Id_Transaccion && (
                    <div style={{ marginBottom: "8px", fontSize: "0.9rem" }}>
                      <strong>ID Transacción:</strong> {pagoSeleccionadoCompleto.Id_Transaccion}
                    </div>
                  )}
                  
                  {/* Referencias agrupadas */}
                  <div style={{ marginBottom: "8px" }}>
                    <strong>Referencias incluidas:</strong>
                    <div style={{ 
                      backgroundColor: "#fff", 
                      padding: "8px", 
                      borderRadius: "4px", 
                      marginTop: "4px",
                      maxHeight: "120px",
                      overflowY: "auto",
                      fontSize: "0.85rem",
                      border: "1px solid #dee2e6"
                    }}>
                      {pagoSeleccionadoCompleto.referencia_pago
                        .split(', ')
                        .map((ref, idx) => (
                          <div key={idx} style={{ 
                            padding: "2px 0",
                            borderBottom: idx < pagoSeleccionadoCompleto.referencia_pago.split(', ').length - 1 ? "1px solid #f0f0f0" : "none"
                          }}>
                            • {ref.trim()}
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ 
                    fontSize: "0.9rem", 
                    fontWeight: "600", 
                    color: "#28a745",
                    marginBottom: "8px"
                  }}>
                    📄 Pago Individual
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    <strong>Referencia:</strong> {pagoSeleccionadoCompleto.referencia_pago}
                  </div>
                </div>
              )}
              
              {/* Información común */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.85rem" }}>
                <div>
                  <strong>Valor Total:</strong> ${pagoSeleccionadoCompleto.valor.toLocaleString()}
                </div>
                <div>
                  <strong>Guías:</strong> {pagoSeleccionadoCompleto.num_guias}
                </div>
                <div>
                  <strong>Conductor:</strong> {pagoSeleccionadoCompleto.correo_conductor}
                </div>
                <div>
                  <strong>Fecha:</strong> {pagoSeleccionadoCompleto.fecha}
                </div>
              </div>
            </div>

            {/* 🔥 ADVERTENCIA PARA GRUPOS */}
            {pagoSeleccionadoCompleto.es_grupo_transaccion && (
              <div style={{
                backgroundColor: "#fff3cd",
                border: "1px solid #ffeaa7",
                borderRadius: "6px",
                padding: "12px",
                marginBottom: "1rem",
                fontSize: "0.9rem"
              }}>
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "8px", 
                  fontWeight: "600",
                  color: "#856404",
                  marginBottom: "4px"
                }}>
                  ⚠️ Atención
                </div>
                <div style={{ color: "#856404" }}>
                  Al rechazar este grupo, se rechazarán <strong>todas las {pagoSeleccionadoCompleto.num_referencias} referencias</strong> incluidas en la transacción.
                </div>
              </div>
            )}
            
            <textarea
              value={novedad}
              onChange={(e) => {
                console.log("📝 Escribiendo novedad:", e.target.value);
                setNovedad(e.target.value);
              }}
              rows={4}
              placeholder={pagoSeleccionadoCompleto.es_grupo_transaccion 
                ? "Ej: Los valores no coinciden con las guías del grupo."
                : "Ej: El valor no coincide con las guías."
              }
              style={{ 
                width: "100%", 
                marginBottom: "1rem",
                fontSize: "0.9rem",
                padding: "0.75rem"
              }}
            />
            
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
            }}>
              <button
                className="boton-secundario"
                onClick={() => {
                  console.log("❌ Cancelando rechazo");
                  setModalVisible(false);
                  setNovedad("");
                  setRefPagoSeleccionada("");
                  setPagoSeleccionadoCompleto(null); // 🔥 LIMPIAR
                }}
              >
                Cancelar
              </button>
              <button 
                className="boton-registrar" 
                onClick={() => {
                  console.log("✅ Intentando confirmar rechazo:", {
                    refPagoSeleccionada,
                    esGrupo: pagoSeleccionadoCompleto.es_grupo_transaccion,
                    numReferencias: pagoSeleccionadoCompleto.num_referencias,
                    novedad: novedad.trim(),
                    procesando
                  });
                  confirmarRechazo();
                }} 
                disabled={procesando === refPagoSeleccionada || !novedad.trim()}
                style={{
                  backgroundColor: (!novedad.trim() || procesando === refPagoSeleccionada) ? "#6c757d" : 
                                pagoSeleccionadoCompleto.es_grupo_transaccion ? "#dc3545" : "#007bff",
                  cursor: (!novedad.trim() || procesando === refPagoSeleccionada) ? "not-allowed" : "pointer"
                }}
              >
                {procesando === refPagoSeleccionada ? "⏳ Procesando..." : 
                pagoSeleccionadoCompleto.es_grupo_transaccion ? 
                `Rechazar Grupo (${pagoSeleccionadoCompleto.num_referencias})` : 
                "Confirmar rechazo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}