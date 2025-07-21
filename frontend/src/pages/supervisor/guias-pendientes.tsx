import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContext";
import "../../styles/supervisor/GuiasPendientes.css";
import "../../styles/supervisor/cargando.css";
import LogoXcargo from "../../../public/icons/Logo192.png";

interface Guia {
  tracking_number: string;
  cliente: string;
  ciudad: string;
  departamento: string;
  valor: number;
  fecha: string;
  estado: string;
  carrier: string;
  conductor: {
    nombre: string;
    email: string;
    telefono: string;
  };
}

export default function GuiasPendientes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const [guias, setGuias] = useState<Guia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtroConductor, setFiltroConductor] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit] = useState(50);
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroTracking, setFiltroTracking] = useState("");
  const [filtroCiudad, setFiltroCiudad] = useState("");
  const [filtroFecha, setFiltroFecha] = useState("");
  
  // 🆕 NUEVO: Estado para controlar modo de visualización
  const [mostrarTodo, setMostrarTodo] = useState(false);
  const [cargandoTodo, setCargandoTodo] = useState(false);

  // Estados para la selección de guías - MEJORADO para persistir entre páginas
  const [guiasSeleccionadas, setGuiasSeleccionadas] = useState<string[]>([]);
  const [guiasSeleccionadasData, setGuiasSeleccionadasData] = useState<Map<string, Guia>>(new Map());
  
  // Estados para filtros temporales (antes de buscar)
  const [filtroTempConductor, setFiltroTempConductor] = useState("");
  const [filtroTempCliente, setFiltroTempCliente] = useState("");
  const [filtroTempTracking, setFiltroTempTracking] = useState("");
  const [filtroTempCiudad, setFiltroTempCiudad] = useState("");
  const [filtroTempFecha, setFiltroTempFecha] = useState("");

  // Efecto para manejar el estado indeterminate del checkbox principal
  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      const uniqueTrackings = [...new Set(guias.map(guia => guia.tracking_number))];
      const someSelected = uniqueTrackings.some(tracking => guiasSeleccionadas.includes(tracking));
      const allSelected = uniqueTrackings.length > 0 && uniqueTrackings.every(tracking => guiasSeleccionadas.includes(tracking));
      
      selectAllCheckboxRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [guias, guiasSeleccionadas]);

  // Solo cargar guías cuando cambie la página o se ejecute búsqueda manual
  useEffect(() => {
    cargarGuias();
  }, [
    page,
    filtroConductor,
    filtroCliente,
    filtroTracking,
    filtroCiudad,
    filtroFecha,
    mostrarTodo, // 🆕 Agregar mostrarTodo a las dependencias
  ]);

  const cargarGuias = async () => {
    try {
      setLoading(true);
      const token = user?.token || localStorage.getItem("token") || "";

      const queryParams = new URLSearchParams({
        estado_liquidacion: "pendiente", // 🔥 FILTRO POR DEFECTO: Solo mostrar guías pendientes de pago
      });

      // 🔧 MEJORADO: Configurar límite y offset según el modo
      if (mostrarTodo) {
        queryParams.append("limit", "10000"); // Límite alto para "mostrar todo"
        queryParams.append("offset", "0");
      } else {
        queryParams.append("limit", limit.toString());
        queryParams.append("offset", (page * limit).toString());
      }

      if (filtroConductor) queryParams.append("conductor", filtroConductor);
      if (filtroCliente) queryParams.append("cliente", filtroCliente);
      if (filtroTracking) queryParams.append("tracking", filtroTracking);
      if (filtroCiudad) queryParams.append("ciudad", filtroCiudad);
      if (filtroFecha) queryParams.append("fecha", filtroFecha);      const response = await fetch(
        `https://api.x-cargo.co/supervisor/guias-pendientes?${queryParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-User-Email": user?.email || "",
            "X-User-Role": user?.role || "supervisor",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        
        // 🔍 Detectar y alertar sobre tracking numbers duplicados
        const trackingNumbers = data.guias.map((g: Guia) => g.tracking_number);
        const duplicados = trackingNumbers.filter((tracking: string, index: number) => 
          trackingNumbers.indexOf(tracking) !== index
        );
        
        if (duplicados.length > 0) {
          console.warn("⚠️ Tracking numbers duplicados detectados:", [...new Set(duplicados)]);
          // Opcional: mostrar alerta al usuario
          // alert(`⚠️ Se detectaron tracking numbers duplicados: ${[...new Set(duplicados)].join(', ')}`);
        }
        
        setGuias(data.guias);
        setTotal(data.total);
        setError("");
      } else {
        throw new Error(`Error HTTP ${response.status}`);
      }
    } catch (error) {
      console.error("Error cargando guías:", error);
      setError("Error al cargar las guías");
    } finally {
      setLoading(false);
    }
  };
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // 🆕 NUEVA FUNCIÓN: Alternar entre vista paginada y completa
  const toggleMostrarTodo = async () => {
    if (mostrarTodo) {
      // Volver a vista paginada
      setMostrarTodo(false);
      setPage(0);
    } else {
      // Cambiar a vista completa
      setCargandoTodo(true);
      setMostrarTodo(true);
      setPage(0);
    }
    
    // El useEffect se encargará de recargar los datos
  };

  // 🔧 MEJORADO: Reset al cambiar a vista paginada
  const resetearVista = () => {
    setMostrarTodo(false);
    setPage(0);
    limpiarFiltros();
  };

  // Efecto para manejar el loading del modo "mostrar todo"
  useEffect(() => {
    if (cargandoTodo && !loading) {
      setCargandoTodo(false);
    }
  }, [loading, cargandoTodo]);

  // Funciones para manejo de selección - MEJORADAS para persistir entre páginas y manejar duplicados
  const toggleSeleccion = (tracking: string) => {
    // Buscar la primera ocurrencia de la guía con este tracking
    const guia = guias.find(g => g.tracking_number === tracking);
    if (!guia) {
      console.warn(`⚠️ No se encontró guía con tracking: ${tracking}`);
      return;
    }

    setGuiasSeleccionadas((prev) => {
      const newSelected = prev.includes(tracking) 
        ? prev.filter((t) => t !== tracking) 
        : [...prev, tracking];
      
      // Actualizar el mapa de datos de guías seleccionadas
      setGuiasSeleccionadasData((prevData) => {
        const newData = new Map(prevData);
        if (newSelected.includes(tracking)) {
          newData.set(tracking, guia);
        } else {
          newData.delete(tracking);
        }
        return newData;
      });
      
      return newSelected;
    });
  };

  const toggleTodos = () => {
    // Obtener tracking numbers únicos de la página actual
    const currentPageTrackings = [...new Set(guias.map(g => g.tracking_number))];
    
    // Verificar si todas las guías únicas de la página actual están seleccionadas
    const allCurrentSelected = currentPageTrackings.every(tracking => 
      guiasSeleccionadas.includes(tracking)
    );

    if (allCurrentSelected) {
      // Deseleccionar todas las guías de la página actual
      setGuiasSeleccionadas(prev => 
        prev.filter(tracking => !currentPageTrackings.includes(tracking))
      );
      setGuiasSeleccionadasData(prevData => {
        const newData = new Map(prevData);
        currentPageTrackings.forEach(tracking => newData.delete(tracking));
        return newData;
      });
    } else {
      // Seleccionar todas las guías únicas de la página actual
      const newSelections = currentPageTrackings.filter(tracking => 
        !guiasSeleccionadas.includes(tracking)
      );
      
      setGuiasSeleccionadas(prev => [...prev, ...newSelections]);
      setGuiasSeleccionadasData(prevData => {
        const newData = new Map(prevData);
        // Solo agregar la primera ocurrencia de cada tracking único
        const uniqueGuias = new Map<string, Guia>();
        guias.forEach(guia => {
          if (!uniqueGuias.has(guia.tracking_number)) {
            uniqueGuias.set(guia.tracking_number, guia);
          }
        });
        
        uniqueGuias.forEach((guia, tracking) => {
          if (!prevData.has(tracking)) {
            newData.set(tracking, guia);
          }
        });
        return newData;
      });
    }
  };

  // Limpiar selecciones al cambiar filtros (opcional - puede ser que quieras mantenerlas)
  const limpiarSelecciones = () => {
    setGuiasSeleccionadas([]);
    setGuiasSeleccionadasData(new Map());
  };
  // Cálculos de totales - ACTUALIZADOS para usar datos persistentes
  const totalSeleccionado = Array.from(guiasSeleccionadasData.values())
    .reduce((acc, guia) => acc + guia.valor, 0);

  const totalGlobal = guias.reduce((acc, curr) => acc + curr.valor, 0);  // Función para procesar pago - ACTUALIZADA para usar datos persistentes
  const handlePagar = () => {
    if (guiasSeleccionadas.length === 0) {
      alert("Debes seleccionar al menos una guía para pagar.");
      return;
    }

    // Usar los datos persistentes de las guías seleccionadas
    const guiasParaPago = Array.from(guiasSeleccionadasData.values())
      .map((guia) => ({
        referencia: guia.tracking_number,
        valor: guia.valor,
        tracking: guia.tracking_number,
        empresa: "XCargo",
        conductor: guia.conductor.nombre,
        ciudad: guia.ciudad,
        departamento: guia.departamento,
        carrier: guia.carrier,
        cliente: guia.cliente,
        estado_actual: guia.estado
      }));

    console.log('💳 Iniciando flujo de pago con guías:', guiasParaPago);

    navigate("/supervisor/registrar-pago", {
      state: {
        guias: guiasParaPago,
        total: totalSeleccionado,
        supervisor: {
          nombre: user?.nombre,
          email: user?.email
        }
      },
    });
  };

  // Función para ejecutar búsqueda manual
  const ejecutarBusqueda = () => {
    setFiltroConductor(filtroTempConductor);
    setFiltroCliente(filtroTempCliente);
    setFiltroTracking(filtroTempTracking);
    setFiltroCiudad(filtroTempCiudad);
    setFiltroFecha(filtroTempFecha);
    setPage(0); // Resetear a primera página
  };
  // Función para limpiar filtros - ACTUALIZADA con opción de limpiar selecciones
  const limpiarFiltros = () => {
    setFiltroTempConductor("");
    setFiltroTempCliente("");
    setFiltroTempTracking("");
    setFiltroTempCiudad("");
    setFiltroTempFecha("");
    setFiltroConductor("");
    setFiltroCliente("");
    setFiltroTracking("");
    setFiltroCiudad("");
    setFiltroFecha("");
    setPage(0);
    // Opcional: descomentar si quieres limpiar selecciones al limpiar filtros
    // limpiarSelecciones();
  };

  // Función para manejar Enter en los inputs
  const manejarEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      ejecutarBusqueda();
    }
  };

  if (loading && page === 0) {
    return (
      <div className="loading-container">
        <img src={LogoXcargo} alt="Cargando guías" className="loading-logo" />
      </div>
    );
  }

  return (    <div className="guias-pendientes">      <div className="page-header">
        <h1>Guías Pendientes</h1>
        <div className="header-info">
          <span className="total-badge">
            📦 Total: {total} guías
            {mostrarTodo && guias.length < total && (
              <span className="warning-text"> (Mostrando {guias.length})</span>
            )}
          </span>
          <span className="valor-badge">💰 Valor Total: {formatCurrency(totalGlobal)}</span>
          {guiasSeleccionadas.length > 0 && (
            <span className="selected-badge">
              ✅ {guiasSeleccionadas.length} seleccionadas ({formatCurrency(totalSeleccionado)})
            </span>
          )}
        </div>
      </div>

      {error && <div className="error-banner">⚠️ {error}</div>}

      {/* Resumen de selección */}
      {guiasSeleccionadas.length > 0 && (
        <div className="resumen-card">
          <div className="resumen-content">
            <div className="resumen-info">
              <span className="resumen-label">Seleccionadas:</span>
              <span className="resumen-valor">{guiasSeleccionadas.length} guías</span>
            </div>
            <div className="resumen-info">
              <span className="resumen-label">Total seleccionado:</span>
              <span className="resumen-valor">{formatCurrency(totalSeleccionado)}</span>
            </div>
            <button className="btn-primary" onClick={handlePagar}>
              💳 Procesar Pago
            </button>
          </div>
        </div>
      )}      <div className="controls-section">
        <div className="filters">
          <input
            type="text"
            placeholder="🔍 Buscar conductor..."
            value={filtroTempConductor}
            onChange={(e) => setFiltroTempConductor(e.target.value)}
            onKeyDown={manejarEnter}
            className="search-input"
          />
          <input
            type="text"
            placeholder="🏢 Buscar cliente..."
            value={filtroTempCliente}
            onChange={(e) => setFiltroTempCliente(e.target.value)}
            onKeyDown={manejarEnter}
            className="search-input"
          />
          <input
            type="text"
            placeholder="📦 Número de tracking..."
            value={filtroTempTracking}
            onChange={(e) => setFiltroTempTracking(e.target.value)}
            onKeyDown={manejarEnter}
            className="search-input"
          />
          <input
            type="text"
            placeholder="🏙️ Ciudad..."
            value={filtroTempCiudad}
            onChange={(e) => setFiltroTempCiudad(e.target.value)}
            onKeyDown={manejarEnter}
            className="search-input"
          />
          <input
            type="date"
            value={filtroTempFecha}
            onChange={(e) => setFiltroTempFecha(e.target.value)}
            onKeyDown={manejarEnter}
            className="search-input"
            title="Filtrar por fecha"
          />          <div className="filters-buttons">
            <button 
              className="btn-primary" 
              onClick={ejecutarBusqueda}
              disabled={loading}
            >
              {loading ? "🔄 Buscando..." : "🔍 Buscar"}
            </button>
            <button 
              className="btn-secondary" 
              onClick={limpiarFiltros}
              disabled={loading}
            >
              🗑️ Limpiar Filtros
            </button>
            {guiasSeleccionadas.length > 0 && (
              <button 
                className="btn-warning" 
                onClick={limpiarSelecciones}
                disabled={loading}
                title="Limpiar todas las selecciones"
              >
                ❌ Limpiar Selecciones ({guiasSeleccionadas.length})
              </button>
            )}
            <button 
              className="btn-secondary" 
              onClick={cargarGuias}
              disabled={loading}
            >
              🔄 Actualizar
            </button>
            
            {/* 🆕 NUEVO: Botón para alternar vista */}
            <button 
              className={`btn-${mostrarTodo ? 'warning' : 'info'}`}
              onClick={toggleMostrarTodo}
              disabled={loading || cargandoTodo}
              title={mostrarTodo ? "Volver a vista paginada" : "Mostrar todas las guías"}
            >
              {cargandoTodo ? "🔄 Cargando..." : mostrarTodo ? "📄 Vista Paginada" : "📋 Listar Todo"}
            </button>
            
            {mostrarTodo && (
              <button 
                className="btn-secondary" 
                onClick={resetearVista}
                disabled={loading}
                title="Resetear vista y filtros"
              >
                🔄 Reset Vista
              </button>
            )}
          </div>
        </div>
        
        {/* Mostrar filtros activos */}
        {(filtroConductor || filtroCliente || filtroTracking || filtroCiudad || filtroFecha) && (
          <div className="active-filters">
            <span className="filters-label">Filtros activos:</span>
            {filtroConductor && (
              <span className="filter-tag">
                Conductor: {filtroConductor}
                <button onClick={() => {setFiltroConductor(""); setFiltroTempConductor("");}}>×</button>
              </span>
            )}
            {filtroCliente && (
              <span className="filter-tag">
                Cliente: {filtroCliente}
                <button onClick={() => {setFiltroCliente(""); setFiltroTempCliente("");}}>×</button>
              </span>
            )}
            {filtroTracking && (
              <span className="filter-tag">
                Tracking: {filtroTracking}
                <button onClick={() => {setFiltroTracking(""); setFiltroTempTracking("");}}>×</button>
              </span>
            )}
            {filtroCiudad && (
              <span className="filter-tag">
                Ciudad: {filtroCiudad}
                <button onClick={() => {setFiltroCiudad(""); setFiltroTempCiudad("");}}>×</button>
              </span>
            )}
            {filtroFecha && (
              <span className="filter-tag">
                Fecha: {filtroFecha}
                <button onClick={() => {setFiltroFecha(""); setFiltroTempFecha("");}}>×</button>
              </span>
            )}
          </div>
        )}
        
        {/* 🆕 NUEVO: Indicador de modo de vista */}
        <div className="view-mode-indicator">
          <span className={`mode-badge ${mostrarTodo ? 'mode-all' : 'mode-paginated'}`}>
            {mostrarTodo ? "📋 Vista Completa" : "📄 Vista Paginada"}
          </span>
          {mostrarTodo && total > 5000 && (
            <span className="performance-warning">
              ⚠️ Muchas guías pueden afectar el rendimiento
            </span>
          )}
        </div>
      </div><div className="guias-table">
        <div className="table-header">          <div className="header-cell checkbox-cell">
            <input
              ref={selectAllCheckboxRef}
              type="checkbox"
              checked={
                guias.length > 0 && 
                [...new Set(guias.map(guia => guia.tracking_number))].every(tracking => 
                  guiasSeleccionadas.includes(tracking)
                )
              }
              onChange={toggleTodos}
              title="Seleccionar/Deseleccionar todas las guías únicas de esta página"
            />
          </div>
          <div className="header-cell">Tracking</div>
          <div className="header-cell">Cliente</div>
          <div className="header-cell">Conductor</div>
          <div className="header-cell">Ciudad</div>
          <div className="header-cell">Valor</div>
          <div className="header-cell">Estado</div>
          <div className="header-cell">Última Actualización</div>
        </div>        {guias.map((guia, index) => (
          <div key={`${guia.tracking_number}-${index}-${page}`} className="table-row">
            <div className="table-cell checkbox-cell">
              <input
                type="checkbox"
                checked={guiasSeleccionadas.includes(guia.tracking_number)}
                onChange={() => toggleSeleccion(guia.tracking_number)}
              />
            </div>
            <div className="table-cell">
              <span className="tracking">{guia.tracking_number}</span>
            </div>
            <div className="table-cell">
              <span className="cliente">{guia.cliente}</span>
            </div>
            <div className="table-cell">
              <div className="conductor-info">
                <span className="conductor-nombre">
                  {guia.conductor.nombre}
                </span>
                <span className="conductor-email">{guia.conductor.email}</span>
              </div>
            </div>
            <div className="table-cell">
              <div className="ubicacion">
                <span className="ciudad">{guia.ciudad}</span>
                <span className="departamento">{guia.departamento}</span>
              </div>
            </div>
            <div className="table-cell">
              <span className="valor">{formatCurrency(guia.valor)}</span>
            </div>
            <div className="table-cell">
              <span className={`estado-badge ${guia.estado.toLowerCase().replace(' ', '_')}`}>
                {guia.estado}
              </span>
            </div>
            <div className="table-cell">
              <span className="fecha">
                {new Date(guia.fecha).toLocaleDateString('es-CO', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}
              </span>
            </div>
          </div>
        ))}
      </div>      {guias.length === 0 && !loading && (
        <div className="empty-state">
          <p>📦 No se encontraron guías pendientes con los filtros aplicados</p>
        </div>
      )}

      {/* 🔧 MEJORADO: Paginación solo en vista paginada */}
      {!mostrarTodo && (
        <div className="pagination">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="btn-secondary"
          >
            ← Anterior
          </button>
          <span className="page-info">
            Página {page + 1} de {Math.ceil(total / limit)}
          </span>
          <button
            disabled={guias.length < limit}
            onClick={() => setPage((p) => p + 1)}
            className="btn-secondary"
          >
            Siguiente →
          </button>
        </div>
      )}

      {/* 🆕 NUEVO: Información de resultados en vista completa */}
      {mostrarTodo && (
        <div className="results-info">
          <div className="info-card">
            <span className="info-text">
              📋 Mostrando {guias.length} de {total} guías totales
            </span>
            {guias.length >= 10000 && (
              <span className="limit-warning">
                ⚠️ Límite de 10,000 guías alcanzado. Usa filtros para ver más resultados específicos.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Botón flotante de pago */}
      {guiasSeleccionadas.length > 0 && (
        <div className="floating-action">
          <div className="action-card">
            <div className="action-content">
              <div className="action-summary">
                <span className="action-count">
                  {guiasSeleccionadas.length} guía{guiasSeleccionadas.length !== 1 ? "s" : ""} seleccionada{guiasSeleccionadas.length !== 1 ? "s" : ""}
                </span>
                <span className="action-total">Total: {formatCurrency(totalSeleccionado)}</span>
              </div>
              <button className="btn-primary action-button" onClick={handlePagar}>
                💳 Procesar Pago
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
