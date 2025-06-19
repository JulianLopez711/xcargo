import { useEffect, useState } from "react";
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
  // Estados para la selección de guías
  const [guiasSeleccionadas, setGuiasSeleccionadas] = useState<string[]>([]);
  
  // Estados para filtros temporales (antes de buscar)
  const [filtroTempConductor, setFiltroTempConductor] = useState("");
  const [filtroTempCliente, setFiltroTempCliente] = useState("");
  const [filtroTempTracking, setFiltroTempTracking] = useState("");
  const [filtroTempCiudad, setFiltroTempCiudad] = useState("");
  const [filtroTempFecha, setFiltroTempFecha] = useState("");

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
  ]);

  const cargarGuias = async () => {
    try {
      setLoading(true);
      const token = user?.token || localStorage.getItem("token") || "";

      const queryParams = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      });

      if (filtroConductor) queryParams.append("conductor", filtroConductor);
      if (filtroCliente) queryParams.append("cliente", filtroCliente);
      if (filtroTracking) queryParams.append("tracking", filtroTracking);
      if (filtroCiudad) queryParams.append("ciudad", filtroCiudad);
      if (filtroFecha) queryParams.append("fecha", filtroFecha);      const response = await fetch(
        `http://127.0.0.1:8000/supervisor/guias-pendientes?${queryParams.toString()}`,
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

  // Funciones para manejo de selección
  const toggleSeleccion = (tracking: string) => {
    setGuiasSeleccionadas((prev) =>
      prev.includes(tracking) ? prev.filter((t) => t !== tracking) : [...prev, tracking]
    );
  };

  const toggleTodos = () => {
    if (guiasSeleccionadas.length === guias.length) {
      setGuiasSeleccionadas([]);
    } else {
      setGuiasSeleccionadas(guias.map((g) => g.tracking_number));
    }
  };

  // Cálculos de totales
  const totalSeleccionado = guias
    .filter((g) => guiasSeleccionadas.includes(g.tracking_number))
    .reduce((acc, curr) => acc + curr.valor, 0);

  const totalGlobal = guias.reduce((acc, curr) => acc + curr.valor, 0);
  // Función para procesar pago
  const handlePagar = () => {
    if (guiasSeleccionadas.length === 0) {
      alert("Debes seleccionar al menos una guía para pagar.");
      return;
    }

    const guiasParaPago = guias
      .filter((g) => guiasSeleccionadas.includes(g.tracking_number))
      .map((g) => ({
        referencia: g.tracking_number,
        valor: g.valor,
        tracking: g.tracking_number,
        empresa: "XCargo",
        conductor: g.conductor.nombre,
        ciudad: g.ciudad,
        departamento: g.departamento,
        carrier: g.carrier,
        cliente: g.cliente,
        estado_actual: g.estado
      }));    console.log('💳 Iniciando flujo de pago con guías:', guiasParaPago);

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

  // Función para limpiar filtros
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

  return (    <div className="guias-pendientes">
      <div className="page-header">
        <h1>Guías Pendientes</h1>
        <div className="header-info">
          <span className="total-badge">📦 Total: {total} guías</span>
          <span className="valor-badge">💰 Valor Total: {formatCurrency(totalGlobal)}</span>
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
              🗑️ Limpiar
            </button>
            <button 
              className="btn-secondary" 
              onClick={cargarGuias}
              disabled={loading}
            >
              🔄 Actualizar
            </button>
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
      </div><div className="guias-table">
        <div className="table-header">
          <div className="header-cell checkbox-cell">
            <input
              type="checkbox"
              checked={
                guiasSeleccionadas.length === guias.length &&
                guias.length > 0
              }
              onChange={toggleTodos}
              title="Seleccionar/Deseleccionar todas"
            />
          </div>
          <div className="header-cell">Tracking</div>
          <div className="header-cell">Cliente</div>
          <div className="header-cell">Conductor</div>
          <div className="header-cell">Ciudad</div>
          <div className="header-cell">Valor</div>
          <div className="header-cell">Estado</div>
          <div className="header-cell">Última Actualización</div>
        </div>        {guias.map((guia) => (
          <div key={guia.tracking_number} className="table-row">
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
        >        Siguiente →
        </button>
      </div>

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
