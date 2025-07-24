import { useEffect, useState } from "react";
import { saveAs } from "file-saver";
import "../../styles/contabilidad/Pagos.css";

// Utilidad para obtener el token desde localStorage
function getToken(): string {
  return localStorage.getItem("token") || "";
}

interface Pago {
  referencia_pago: string;
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
  fecha_creacion?: string;
  fecha_modificacion?: string;
  carrier?: string; // Agregado para mostrar el carrier
  Id_Transaccion?: number; // Agregado para detalles correctos
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
  const [imagenSeleccionada, setImagenSeleccionada] = useState<string | null>(null);
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

      const response = await fetch(`http://127.0.0.1:8000/pagos/pendientes-contabilidad?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      // Mostrar Id_Transaccion en el log de cada pago
      if (Array.isArray(data.pagos)) {
        data.pagos.forEach((pago: { referencia_pago: string; Id_Transaccion?: number; num_guias: number; estado_conciliacion: string }, idx: number) => {
          console.log(`Pago[${idx}]: Ref=${pago.referencia_pago}, Id_Transaccion=${pago.Id_Transaccion}, Guías=${pago.num_guias}, Estado=${pago.estado_conciliacion}`);
        });
      }
      console.log('📊 Datos recibidos:', data);
      
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
        const totalEstimado = data.length === pagosPorPagina ? (pagina * pagosPorPagina) + 1 : (pagina - 1) * pagosPorPagina + data.length;
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
       filtroEstados.length > 0;
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

    const encabezado = "ID,Referencia_Pago,Valor_Total,Fecha,Entidad,Estado,Tipo,Num_Guias,Conductor,Fecha_Creacion\n";
    const filas = pagosFiltrados
      .map((p: Pago, idx: number) =>
        `${idx + 1},"${p.referencia_pago}",${p.valor},"${p.fecha}","${p.entidad}","${p.estado_conciliacion}","${p.tipo}",${p.num_guias},"${p.correo_conductor}","${p.fecha_creacion || ''}"`
      )
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
      // Construir parámetros de query con los mismos filtros actuales
      const params = new URLSearchParams();

      // Aplicar filtros si están definidos
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

      const response = await fetch(`http://127.0.0.1:8000/pagos/exportar-pendientes-contabilidad?${params.toString()}`, {
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

      // Crear CSV con todos los datos
      const encabezado = "ID,Referencia_Pago,Valor_Total,Fecha,Entidad,Estado,Tipo,Num_Guias,Conductor,Trackings_Completos,Hora_Pago,Novedades,Fecha_Creacion,Fecha_Modificacion\n";
      const filas = data.pagos
        .map((p: Pago, idx: number) =>
          `${idx + 1},"${p.referencia_pago}",${p.valor},"${p.fecha}","${p.entidad}","${getEstadoTexto(p.estado_conciliacion)}","${p.tipo}",${p.num_guias},"${p.correo_conductor}","${(p.trackings_completos || '').replace(/"/g, '""')}","${p.hora_pago || ''}","${(p.novedades || '').replace(/"/g, '""')}","${p.fecha_creacion || ''}","${p.fecha_modificacion || ''}"`
        )
        .join("\n");

      const blob = new Blob([encabezado + filas], {
        type: "text/csv;charset=utf-8;",
      });
      
      const fechaHoy = new Date().toISOString().split("T")[0];
      const nombreArchivo = `informe-completo-pagos-${data.info_exportacion.total_registros_exportados}-registros-${fechaHoy}.csv`;
      saveAs(blob, nombreArchivo);

      alert(`✅ Informe completo descargado exitosamente!\n\n📊 Total de registros: ${data.info_exportacion.total_registros_exportados}\n📅 Fecha de exportación: ${new Date(data.info_exportacion.fecha_exportacion).toLocaleString()}\n📁 Archivo: ${nombreArchivo}`);

    } catch (error) {
      console.error("❌ Error descargando informe completo:", error);
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";
      alert(`❌ Error al descargar el informe completo: ${errorMessage}`);
    } finally {
      setProcesando(null);
    }
  };

  const verImagen = (src: string) => {
    if (!src) {
      alert("No hay comprobante disponible");
      return;
    }
    setImagenSeleccionada(src);
  };

  const verDetallesPago = async (referenciaPago: string, idTransaccion?: number) => {
    try {
      let url = `http://127.0.0.1:8000/pagos/detalles-pago/${referenciaPago}`;
      if (idTransaccion !== undefined) {
        url += `?id_transaccion=${idTransaccion}`;
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setDetalleTracking(data.detalles || []);
      setModalDetallesVisible(true);
    } catch (err: any) {
      console.error("Error cargando detalles:", err);
      alert(`Error al cargar detalles del pago: ${err.message}`);
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
      
      console.log("📡 Enviando petición de rechazo:", {
        referencia_pago: refPagoSeleccionada,
        novedad,
        modificado_por: user.email,
      });

      const response = await fetch("http://127.0.0.1:8000/pagos/rechazar-pago", {
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
    }
  };

  const getEstadoTexto = (estado: string | undefined): string => {
    if (!estado) return "⏳ Sin estado";
    const textos: { [key: string]: string } = {
      'pendiente_conciliacion': '⏳ Pendiente conciliación',
      'conciliado_manual': '🔎 Conciliado manual',
      'conciliado_automatico': '🤖 Conciliado automático',
      'rechazado': '❌ Rechazado',
    };
    return textos[estado.toLowerCase()] || estado;
  };
  

  const limpiarFiltros = () => {
    setFiltroReferencia("");
    setFiltroCarrier("");
    setFechaDesde("");
    setFechaHasta("");
    setFiltroEstados([...estadosDisponibles]);
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
              📅 {new Date(fechaDesde).toLocaleDateString('es-ES')}
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
              📅 {new Date(fechaHasta).toLocaleDateString('es-ES')}
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
              <th>Carrier</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Comprobante</th>
              <th>Trackings</th>
              <th>Novedades</th>
              <th>Acción</th>
            </tr>
          </thead>

          <tbody>
            {pagosFiltrados.length > 0 ? (
              pagosFiltrados.map((p, idx) => (
                //console.log("📦 Pago:", p),
                <tr key={`${p.referencia_pago}-${p.fecha}-${idx}`}>
               
                  <td>{((paginaActual - 1) * pagosPorPagina) + idx + 1}</td>
                  <td>{p.referencia_pago}</td>
                  <td>${p.valor.toLocaleString()}</td>
                  <td>{p.num_guias}</td>
                  <td>{p.fecha}</td>
                  <td>{p.carrier || "N/A"}</td>
                  <td>{p.tipo}</td>
                  <td style={{
                    color: p.estado_conciliacion === "rechazado" ? "crimson" :
                           p.estado_conciliacion === "conciliado_manual" ? "green" : undefined
                  }}>
                    
                    {getEstadoTexto(p.estado_conciliacion)}
                  </td>
                  <td>
                    <button
                      onClick={() => verImagen(p.imagen)}
                      className="btn-ver"
                    >
                      👁 Ver
                    </button>
                  </td>
                  <td>
                    <button
                      onClick={() => verDetallesPago(p.referencia_pago, p.Id_Transaccion)}
                      className="btn-ver"
                      title={p.trackings_preview}
                    >
                      Detalles ({p.num_guias})
                    </button>
                  </td>
                  <td>
                    {p.novedades ? (
                      <span style={{ fontStyle: "italic", color: "#6b7280" }}>
                        {p.novedades}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <button
                     onClick={() => {
                      console.log("🖱️ Click en botón rechazar para:", p.referencia_pago);
                      setRefPagoSeleccionada(p.referencia_pago);
                      setModalVisible(true);
                    }}
                      className="boton-rechazar"
                      disabled={p.estado_conciliacion === "rechazado" || 
                               p.estado_conciliacion?.startsWith("conciliado") ||
                               procesando === p.referencia_pago}
                    >
                      {procesando === p.referencia_pago ? "⏳ Procesando..." : "Rechazar"}
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={12}
                  style={{ textAlign: "center", padding: "1rem" }}
                >
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

      {/* Resto de modales sin cambios */}
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
                      ${detalleTracking.reduce((sum, item) => sum + item.valor, 0).toLocaleString('es-ES')}
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
                            ${item.valor.toLocaleString('es-ES')}
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
                            <span className="tracking-detail-label">Valor Individual</span>
                            <span className="tracking-detail-value">${item.valor.toLocaleString('es-ES')}</span>
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

      {/* Modal de Rechazo */}
      {modalVisible && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>¿Por qué deseas rechazar este pago?</h3>
            <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1rem" }}>
              Referencia: <strong>{refPagoSeleccionada}</strong>
            </p>
            <textarea
              value={novedad}
              onChange={(e) => {
                console.log("📝 Escribiendo novedad:", e.target.value);
                setNovedad(e.target.value);
              }}
              rows={5}
              placeholder="Ej: El valor no coincide con las guías."
              style={{ width: "100%", marginBottom: "1rem" }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <button
                className="boton-secundario"
                onClick={() => {
                  console.log("❌ Cancelando rechazo");
                  setModalVisible(false);
                  setNovedad("");
                  setRefPagoSeleccionada("");
                }}
              >
                Cancelar
              </button>
              <button 
                className="boton-registrar" 
                onClick={() => {
                  console.log("✅ Intentando confirmar rechazo:", {
                    refPagoSeleccionada,
                    novedad: novedad.trim(),
                    novedadLength: novedad.trim().length,
                    procesando
                  });
                  confirmarRechazo();
                }} 
                disabled={procesando === refPagoSeleccionada || !novedad.trim()}
                style={{
                  backgroundColor: (!novedad.trim() || procesando === refPagoSeleccionada) ? "#6c757d" : undefined,
                  cursor: (!novedad.trim() || procesando === refPagoSeleccionada) ? "not-allowed" : "pointer"
                }}
              >
                {procesando === refPagoSeleccionada ? "⏳ Procesando..." : "Confirmar rechazo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}