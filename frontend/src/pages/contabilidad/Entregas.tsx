import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "../../context/authContext";
import "../../styles/admin/Entregas.css";

interface Entrega {
  tracking_number: string;
  conductor: string;
  conductor_email: string;
  carrier: string;
  carrier_id: number;
  cliente: string;
  ciudad: string;
  departamento: string;
  valor: number;
  fecha: string;
  estado: string;
  employee_id: number;
}

interface EstadisticasEntregas {
  total_entregas: number;
  entregas_pendientes: number;
  entregas_completadas: number;
  entregas_pagadas: number;
  valor_total: number;
  valor_pendiente: number;
  carriers_activos: number;
  conductores_activos: number;
}

export default function EntregasAdmin() {
  const { user } = useAuth();
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [estadisticas, setEstadisticas] = useState<EstadisticasEntregas>({
    total_entregas: 0,
    entregas_pendientes: 0,
    entregas_completadas: 0,
    entregas_pagadas: 0,
    valor_total: 0,
    valor_pendiente: 0,
    carriers_activos: 0,
    conductores_activos: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtros
  const [filtroCarrier, setFiltroCarrier] = useState("");
  const [filtroConductor, setFiltroConductor] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroCiudad, setFiltroCiudad] = useState("");

  // Paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const registrosPorPagina = 50;

  // Listas para filtros
  const [carriersDisponibles, setCarriersDisponibles] = useState<string[]>([]);
  const [conductoresDisponibles, setConductoresDisponibles] = useState<string[]>([]);
  const [ciudadesDisponibles, setCiudadesDisponibles] = useState<string[]>([]);
  const [estadosDisponibles, setEstadosDisponibles] = useState<string[]>([]);

  // Control de inicialización
  const [inicializado, setInicializado] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Headers comunes para todas las peticiones
  const getHeaders = useCallback(() => {
    if (!user) {
      console.warn("⚠️ Usuario no disponible para headers");
      return {};
    }

<<<<<<< HEAD
  // ✅ FUNCIÓN PARA CARGAR DASHBOARD DE CONCILIACIÓN (definida correctamente)
  const cargarDashboardConciliacion = async () => {
    try {
      const res = await fetch(
        "https://api.x-cargo.co/entregas/dashboard-conciliacion"
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setDashboardConciliacion(data[0]);
      } else {
        setDashboardConciliacion(null);
      }
    } catch (err) {
      setDashboardConciliacion(null);
      setDashboardError("Error al cargar el dashboard");
=======
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    // Agregar token si existe
    if (user.token) {
      headers["Authorization"] = `Bearer ${user.token}`;
>>>>>>> Pruebas
    }

    // Agregar headers personalizados
    if (user.email) {
      headers["X-User-Email"] = user.email;
    }
    if (user.role) {
      headers["X-User-Role"] = user.role;
    }

    console.log("📤 Headers construidos:", {
      hasAuth: !!headers["Authorization"],
      email: headers["X-User-Email"],
      role: headers["X-User-Role"]
    });

    return headers;
  }, [user]);

  // Función helper para hacer peticiones con manejo de errores
  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
    // Cancelar petición anterior si existe
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Crear nuevo AbortController
    abortControllerRef.current = new AbortController();
    
    const headers = getHeaders();
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
      signal: abortControllerRef.current.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error ${response.status} en ${url}:`, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    return response.json();
  }, [getHeaders]);

  // Función para probar conexión
  const probarConexion = useCallback(async () => {
    if (!user) return false;

    try {
<<<<<<< HEAD
      const params = new URLSearchParams();
      if (clienteFiltro) params.append("cliente", clienteFiltro);
      if (fechaDesde) params.append("desde", fechaDesde);
      if (fechaHasta) params.append("hasta", fechaHasta);
      params.append("solo_conciliadas", soloConciliadas.toString());

      const res = await fetch(
        `https://api.x-cargo.co/entregas/entregas-consolidadas?${params.toString()}`
      );

      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Respuesta no es JSON");
      }

      const data: ApiResponse = await res.json();

      if (data.entregas && Array.isArray(data.entregas)) {
        setLiquidaciones(data.entregas);

        // ✅ MOSTRAR ESTADÍSTICAS DE CALIDAD SI ESTÁN DISPONIBLES
        if (data.calidad_datos && data.estadisticas_calidad) {
          const calidad = data.calidad_datos;
          const stats = data.estadisticas_calidad;

          setMensaje(`✅ ${data.entregas.length} entregas cargadas
📊 Calidad: ${calidad.porcentaje_calidad.toFixed(
            1
          )}% | Confianza: ${calidad.confianza_promedio.toFixed(0)}%
🎯 Exactas: ${stats.exactas} | Aproximadas: ${stats.aproximadas} | Manuales: ${
            stats.manuales
          }
${
  calidad.alertas_criticas > 0
    ? `⚠️ ${calidad.alertas_criticas} alertas críticas`
    : "✅ Sin alertas críticas"
}`);
        } else {
          setMensaje(
            `✅ Cargadas ${data.entregas.length} entregas exitosamente`
          );
        }

        // ✅ ESTADÍSTICAS
        if (data.estadisticas) {
          setEstadisticas(data.estadisticas);
        } else {
          setEstadisticas({
            total_entregas: data.total_entregas,
            valor_total: data.valor_total,
            clientes: data.clientes_agrupados || {},
          });
        }

        // ✅ MOSTRAR ALERTAS DE INTEGRIDAD SI EXISTEN
        if (data.alertas_integridad && data.alertas_integridad.length > 0) {
          const alertasStr = data.alertas_integridad
            .slice(0, 3)
            .map((a: any) => `${a.referencia}: ${a.tipo} (${a.severidad})`)
            .join("\n");
          setMensaje(
            (prev) =>
              `${prev}\n\n⚠️ Alertas de integridad:\n${alertasStr}${
                data.alertas_integridad!.length > 3 ? "\n...y más" : ""
              }`
          );
        }
      } else {
        throw new Error("Formato de respuesta inválido");
      }
    } catch (err: any) {
      manejarError(err, "cargar entregas");
      setLiquidaciones([]);
      setEstadisticas(null);
    } finally {
      setCargando(false);
    }
  };

  // ✅ FUNCIÓN PARA CARGAR SOLO ENTREGAS LISTAS PARA LIQUIDAR
  const cargarEntregasListas = async () => {
    setCargando(true);
    setMensaje("");

    try {
      const params = new URLSearchParams();
      if (clienteFiltro) params.append("cliente", clienteFiltro);
      if (fechaDesde) params.append("desde", fechaDesde);
      if (fechaHasta) params.append("hasta", fechaHasta);
      params.append("incluir_aproximadas", "true");

      const res = await fetch(
        `https://api.x-cargo.co/entregas/entregas-listas-liquidar?${params.toString()}`
      );

      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Respuesta no es JSON");
      }

      const data: ApiResponse = await res.json();

      if (data.entregas && Array.isArray(data.entregas)) {
        setLiquidaciones(
          data.entregas.map((e: any) => ({
            ...e,
            estado_conciliacion: e.estado_conciliacion ?? "pendiente", // usa "pendiente" solo si es null/undefined
            integridad_ok: e.integridad_ok ?? true,
            listo_para_liquidar: e.listo_para_liquidar ?? false,
          }))
        );

        // ✅ MOSTRAR MENSAJE DEL BACKEND SI EXISTE
        if (data.mensaje) {
          setMensaje(data.mensaje);
        } else {
          setMensaje(
            `✅ ${data.entregas.length} entregas listas para liquidar`
          );
        }

        // ✅ ESTADÍSTICAS
        setEstadisticas({
          total_entregas: data.total_entregas,
          valor_total: data.valor_total,
          clientes: data.clientes_agrupados || {},
        });

        // ✅ MOSTRAR CALIDAD DE DATOS SI ESTÁ DISPONIBLE
        if (data.calidad_datos) {
          const calidad = data.calidad_datos;
          setMensaje(
            (prev) =>
              `${prev}\n📊 Calidad: ${calidad.porcentaje_calidad.toFixed(
                1
              )}% | Confianza: ${calidad.confianza_promedio.toFixed(0)}%`
          );
        }
      }
    } catch (err: any) {
      manejarError(err, "cargar entregas listas");
      setLiquidaciones([]);
    } finally {
      setCargando(false);
    }
  };

  // ✅ FUNCIÓN PARA CARGAR RESUMEN DE CLIENTES
  const cargarResumenClientes = async () => {
    try {
      const res = await fetch(
        "https://api.x-cargo.co/entregas/resumen-liquidaciones"
      );
      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Respuesta no es JSON");
      }

      const data = await res.json();
      setResumenClientes(data);
    } catch (err: any) {
      console.warn("Resumen de clientes no disponible:", err.message);
      // No mostrar error para resumen opcional
    }
  };

  // ✅ FUNCIÓN PARA VALIDAR INTEGRIDAD ANTES DE LIQUIDAR
  const validarIntegridadCliente = async (
    cliente: string
  ): Promise<boolean> => {
    try {
      const res = await fetch(
        `https://api.x-cargo.co/entregas/validar-integridad-liquidacion/${encodeURIComponent(
          cliente
        )}`
      );
      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Respuesta no es JSON");
      }

      const validacion: ValidacionIntegridad = await res.json();

      // Mostrar resultado de validación
      if (validacion.listo_para_procesar) {
        setMensaje(
          `✅ ${cliente}: ${
            validacion.resumen.listas_liquidar
          } entregas listas por ${formatearMoneda(
            validacion.resumen.valor_listo
          )}`
        );
        return true;
      } else {
        setMensaje(
          `⚠️ ${cliente}: ${validacion.resumen.con_problemas} entregas con problemas. ${validacion.recomendacion}`
        );
        return false;
      }
    } catch (err: any) {
      console.warn(`Error validando ${cliente}:`, err.message);
      // Si falla la validación, permitir continuar
=======
      console.log("🔍 Probando conexión al servidor...");
      const data = await fetchWithAuth(`https://api.x-cargo.co/admin/test-connection`);
      console.log("✅ Conexión exitosa:", data);
>>>>>>> Pruebas
      return true;
    } catch (error) {
      console.error("❌ Error en conexión:", error);
      return false;
    }
  }, [user, fetchWithAuth]);

  // Cargar entregas de forma más robusta
  const cargarEntregas = useCallback(async () => {
    if (!user || loading) {
      console.log("🔄 Evitando carga - usuario:", !!user, "loading:", loading);
      return;
    }

    try {
      setLoading(true);
      setError("");
      
      console.log("📦 Cargando entregas - Página:", paginaActual);
      
      // Construir parámetros de consulta
      const params = new URLSearchParams({
        page: paginaActual.toString(),
        limit: registrosPorPagina.toString()
      });

      if (filtroCarrier) params.append('carrier', filtroCarrier);
      if (filtroConductor) params.append('conductor', filtroConductor);
      if (filtroEstado) params.append('estado', filtroEstado);
      if (filtroCiudad) params.append('ciudad', filtroCiudad);

      const data = await fetchWithAuth(`https://api.x-cargo.co/admin/entregas?${params.toString()}`);
      
      setEntregas(data.entregas || []);
      setTotalRegistros(data.total || 0);
      setTotalPaginas(Math.ceil((data.total || 0) / registrosPorPagina));
      
      if (data.mensaje) {
        setError(`ℹ️ ${data.mensaje}`);
      }
      
      console.log("✅ Entregas cargadas:", data.entregas?.length || 0);
    } catch (error) {
      console.error("❌ Error cargando entregas:", error);
      setError(`Error al cargar entregas: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      
      // No agregar datos de ejemplo aquí, dejar que el backend los maneje
    } finally {
      setLoading(false);
    }
  }, [user, paginaActual, filtroCarrier, filtroConductor, filtroEstado, filtroCiudad, fetchWithAuth, loading]);

  // Cargar estadísticas
  const cargarEstadisticas = useCallback(async () => {
    if (!user) return;

    try {
      console.log("📊 Cargando estadísticas");
      const data = await fetchWithAuth(`https://api.x-cargo.co/admin/estadisticas-entregas`);
      setEstadisticas(data);
      console.log("✅ Estadísticas cargadas");
    } catch (error) {
      console.error("❌ Error cargando estadísticas:", error);
      // Mantener estadísticas en 0 si falla
    }
  }, [user, fetchWithAuth]);

  // Cargar filtros
  const cargarFiltros = useCallback(async () => {
    if (!user) return;

    try {
      console.log("🔍 Cargando filtros");
      const data = await fetchWithAuth(`https://api.x-cargo.co/admin/filtros-entregas`);
      
      setCarriersDisponibles(data.carriers || []);
      setConductoresDisponibles(data.conductores || []);
      setCiudadesDisponibles(data.ciudades || []);
      setEstadosDisponibles(data.estados || []);
      
      console.log("✅ Filtros cargados");
    } catch (error) {
      console.error("❌ Error cargando filtros:", error);
      // Mantener arrays vacíos si falla
    }
  }, [user, fetchWithAuth]);

  // Inicialización única cuando el componente se monta
  useEffect(() => {
    if (!user || inicializado) {
      return;
    }

    console.log("🚀 Inicializando componente para usuario:", user.email);
    
    const inicializarDatos = async () => {
      // Primero probar conexión
      const conexionOk = await probarConexion();
      
      if (conexionOk) {
        // Cargar datos en paralelo
        await Promise.all([
          cargarEstadisticas(),
          cargarFiltros()
        ]);
        
        // Luego cargar entregas
        await cargarEntregas();
      } else {
        setError("❌ No se pudo conectar con el servidor");
        setLoading(false);
      }
      
      setInicializado(true);
    };

    inicializarDatos();

    // Cleanup al desmontar
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [user]); // Solo depender de user

  // Efecto para cambios de página (solo si ya está inicializado)
  useEffect(() => {
    if (inicializado && paginaActual > 1) {
      console.log("📄 Cambio de página:", paginaActual);
      cargarEntregas();
    }
  }, [paginaActual, inicializado, cargarEntregas]);

  // Efecto para cambios de filtros con debounce
  useEffect(() => {
    if (!inicializado) return;

    console.log("🔍 Filtros cambiaron");
    
    // Resetear página si no estamos en la 1
    if (paginaActual !== 1) {
      setPaginaActual(1);
      return; // El efecto de página se encargará de cargar
    }

    // Debounce para evitar muchas llamadas
    const timeoutId = setTimeout(() => {
      cargarEntregas();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [filtroCarrier, filtroConductor, filtroEstado, filtroCiudad, inicializado, paginaActual, cargarEntregas]);

  const limpiarFiltros = () => {
    setFiltroCarrier("");
    setFiltroConductor("");
    setFiltroEstado("");
    setFiltroCiudad("");
    setPaginaActual(1);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getEstadoColor = (estado: string) => {
    switch (estado.toLowerCase()) {
      case 'entregado':
        return 'estado-entregado';
      case 'pendiente':
        return 'estado-pendiente';
      case 'en ruta':
        return 'estado-ruta';
      case 'pagado':
        return 'estado-pagado';
      case 'liberado':
        return 'estado-liberado';
      default:
        return 'estado-default';
    }
  };

  const cambiarPagina = (nuevaPagina: number) => {
    if (nuevaPagina >= 1 && nuevaPagina <= totalPaginas && nuevaPagina !== paginaActual) {
      console.log("📄 Cambiando a página:", nuevaPagina);
      setPaginaActual(nuevaPagina);
    }
  };

  const refrescarDatos = () => {
    console.log("🔄 Refrescando datos manualmente");
    setInicializado(false); // Forzar reinicialización
    
    // Limpiar estado
    setEntregas([]);
    setEstadisticas({
      total_entregas: 0,
      entregas_pendientes: 0,
      entregas_completadas: 0,
      entregas_pagadas: 0,
      valor_total: 0,
      valor_pendiente: 0,
      carriers_activos: 0,
      conductores_activos: 0
    });
    setError("");
    setLoading(true);
    
    // Reinicializar
    setTimeout(() => {
      setInicializado(false);
    }, 100);
  };

  const probarConexionManual = async () => {
    console.log("🔧 Probando conexión manual...");
    const resultado = await probarConexion();
    if (resultado) {
      alert("✅ Conexión exitosa con el servidor");
    } else {
      alert("❌ Error de conexión con el servidor");
    }
  };

  // Mostrar loading si no hay usuario
  if (!user) {
    return (
      <div className="entregas-admin">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Cargando información del usuario...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="entregas-admin">
      <div className="entregas-header">
        <div className="header-info">
          <h1>📦 Gestión de Entregas - Vista Global</h1>
          <p>Administra todas las entregas del sistema desde BigQuery</p>
        </div>
        <div className="header-actions">
          <button 
            className="btn-refresh"
            onClick={refrescarDatos}
            disabled={loading}
            title="Refrescar todos los datos"
          >
            🔄 Actualizar
          </button>
          <button 
            className="btn-test"
            onClick={probarConexionManual}
            disabled={loading}
            title="Probar conexión con el servidor"
          >
            🔧 Test Conexión
          </button>
        </div>
      </div>

      {error && (
        <div className={`error-banner ${error.includes('ℹ️') ? 'info' : 'error'}`}>
          {error}
        </div>
      )}

      {/* Estadísticas Globales */}
      <div className="estadisticas-section">
        <h2>📊 Estadísticas Globales</h2>
        <div className="estadisticas-grid">
          <div className="estadistica-card">
            <div className="card-icon">📦</div>
            <div className="card-content">
              <h3>Total Entregas</h3>
              <div className="card-number">{estadisticas.total_entregas.toLocaleString()}</div>
              <div className="card-detail">Todas las guías del sistema</div>
            </div>
          </div>
          
          <div className="estadistica-card warning">
            <div className="card-icon">⏳</div>
            <div className="card-content">
              <h3>Pendientes</h3>
              <div className="card-number">{estadisticas.entregas_pendientes.toLocaleString()}</div>
              <div className="card-detail">{formatCurrency(estadisticas.valor_pendiente)}</div>
            </div>
          </div>
          
          <div className="estadistica-card success">
            <div className="card-icon">✅</div>
            <div className="card-content">
              <h3>Completadas</h3>
              <div className="card-number">{estadisticas.entregas_completadas.toLocaleString()}</div>
              <div className="card-detail">{((estadisticas.entregas_completadas / Math.max(estadisticas.total_entregas, 1)) * 100).toFixed(1)}% del total</div>
            </div>
          </div>
          
          <div className="estadistica-card info">
            <div className="card-icon">💳</div>
            <div className="card-content">
              <h3>Pagadas</h3>
              <div className="card-number">{estadisticas.entregas_pagadas.toLocaleString()}</div>
              <div className="card-detail">Proceso completado</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros Simplificados */}
      <div className="filtros-section">
        <div className="filtros-header">
          <h3>🔍 Filtros</h3>
          <button 
            className="btn-limpiar"
            onClick={limpiarFiltros}
          >
            🗑️ Limpiar
          </button>
        </div>
        
        <div className="filtros-grid">
          <div className="filtro-group">
            <label>Carrier</label>
            <select 
              value={filtroCarrier} 
              onChange={(e) => setFiltroCarrier(e.target.value)}
              disabled={loading}
            >
              <option value="">Todos los carriers</option>
              {carriersDisponibles.map(carrier => (
                <option key={carrier} value={carrier}>{carrier}</option>
              ))}
            </select>
          </div>

          <div className="filtro-group">
            <label>Conductor</label>
            <select 
              value={filtroConductor} 
              onChange={(e) => setFiltroConductor(e.target.value)}
              disabled={loading}
            >
              <option value="">Todos los conductores</option>
              {conductoresDisponibles.map(conductor => (
                <option key={conductor} value={conductor}>{conductor}</option>
              ))}
            </select>
          </div>

          <div className="filtro-group">
            <label>Estado</label>
            <select 
              value={filtroEstado} 
              onChange={(e) => setFiltroEstado(e.target.value)}
              disabled={loading}
            >
              <option value="">Todos los estados</option>
              {estadosDisponibles.map(estado => (
                <option key={estado} value={estado}>{estado}</option>
              ))}
            </select>
          </div>

          <div className="filtro-group">
            <label>Ciudad</label>
            <select 
              value={filtroCiudad} 
              onChange={(e) => setFiltroCiudad(e.target.value)}
              disabled={loading}
            >
              <option value="">Todas las ciudades</option>
              {ciudadesDisponibles.map(ciudad => (
                <option key={ciudad} value={ciudad}>{ciudad}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabla de Entregas */}
      <div className="tabla-section">
        <div className="tabla-header">
          <h3>📋 Entregas ({totalRegistros.toLocaleString()} registros)</h3>
          <div className="tabla-info">
            Página {paginaActual} de {totalPaginas} • Mostrando {entregas.length} de {totalRegistros}
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Consultando entregas desde BigQuery...</p>
          </div>
        ) : (
          <>
            <div className="tabla-container">
              <table className="tabla-entregas">
                <thead>
                  <tr>
                    <th>Tracking</th>
                    <th>Conductor</th>
                    <th>Carrier</th>
                    <th>Cliente</th>
                    <th>Ciudad</th>
                    <th>Valor</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {entregas.length > 0 ? (
                    entregas.map((entrega, index) => (
                      <tr key={`${entrega.tracking_number}-${index}`}>
                        <td className="tracking-cell">
                          <div className="tracking-info">
                            <strong>{entrega.tracking_number}</strong>
                            <small>ID: {entrega.employee_id}</small>
                          </div>
                        </td>
                        <td className="conductor-cell">
                          <div className="conductor-info">
                            <strong>{entrega.conductor}</strong>
                            <small>{entrega.conductor_email}</small>
                          </div>
                        </td>
                        <td className="carrier-cell">
                          <div className="carrier-info">
                            <strong>{entrega.carrier}</strong>
                            <small>ID: {entrega.carrier_id}</small>
                          </div>
                        </td>
                        <td>{entrega.cliente}</td>
                        <td className="location-cell">
                          <div className="location-info">
                            <strong>{entrega.ciudad}</strong>
                            <small>{entrega.departamento}</small>
                          </div>
                        </td>
                        <td className="valor-cell">
                          <strong>{formatCurrency(entrega.valor)}</strong>
                        </td>
                        <td className="fecha-cell">
                          {new Date(entrega.fecha).toLocaleDateString('es-CO')}
                        </td>
                        <td>
                          <span className={`estado-badge ${getEstadoColor(entrega.estado)}`}>
                            {entrega.estado}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="empty-state">
                        {loading ? "Cargando datos..." : "No hay entregas disponibles"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPaginas > 1 && (
              <div className="paginacion">
                <button 
                  className="btn-paginacion"
                  onClick={() => cambiarPagina(paginaActual - 1)}
                  disabled={paginaActual === 1 || loading}
                >
                  ← Anterior
                </button>
                
                <div className="paginas-numeros">
                  {Array.from({ length: Math.min(5, totalPaginas) }, (_, index) => {
                    const startPage = Math.max(1, paginaActual - 2);
                    const pageNumber = startPage + index;
                    if (pageNumber <= totalPaginas) {
                      return (
                        <button
                          key={pageNumber}
                          className={`btn-pagina ${pageNumber === paginaActual ? 'active' : ''}`}
                          onClick={() => cambiarPagina(pageNumber)}
                          disabled={loading}
                        >
                          {pageNumber}
                        </button>
                      );
                    }
                    return null;
                  })}
                </div>
                
                <button 
                  className="btn-paginacion"
                  onClick={() => cambiarPagina(paginaActual + 1)}
                  disabled={paginaActual === totalPaginas || loading}
                >
                  Siguiente →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer con información técnica */}
      <div className="entregas-footer">
        <div className="footer-info">
          <div className="source-info">
            <strong>📊 Fuente:</strong> BigQuery COD_pendientes_v1 + usuarios_BIG
          </div>
          <div className="update-info">
            <strong>🔄 Actualizado:</strong> {new Date().toLocaleString()}
          </div>
          <div className="user-info">
            <strong>👤 Usuario:</strong> {user?.email} ({user?.role})
          </div>
          <div className="status-info">
            <strong>🔗 Estado:</strong> {inicializado ? "Conectado" : "Inicializando"}
          </div>
        </div>
      </div>
    </div>
  );
}