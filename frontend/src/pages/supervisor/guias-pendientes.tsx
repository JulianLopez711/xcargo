import { useEffect, useState } from "react";
import { useAuth } from "../../context/authContext";
import "../../styles/supervisor/Pagos.css";
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
  const [guias, setGuias] = useState<Guia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtroConductor, setFiltroConductor] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit] = useState(50);

  useEffect(() => {
    cargarGuias();
  }, [page, filtroConductor]);

  const cargarGuias = async () => {
    try {
      setLoading(true);
      const token = user?.token || localStorage.getItem("token") || "";
      
      const response = await fetch(
        `https://api.x-cargo.co/supervisor/guias-pendientes?limit=${limit}&offset=${page * limit}${filtroConductor ? `&conductor=${filtroConductor}` : ''}`,
        {
          headers: {
            "Authorization": `Bearer ${token}`,
            "X-User-Email": user?.email || "",
            "X-User-Role": user?.role || "supervisor"
          }
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
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  if (loading && page === 0) {
    return (
      <div className="loading-container">
        <img src={LogoXcargo} alt="Cargando guías" className="loading-logo" />
      </div>
    );
  }

  return (
    <div className="guias-pendientes">
      <div className="page-header">
        <h1>Guías Pendientes</h1>
        <div className="header-info">
          <span className="total-badge">
            📦 Total: {total} guías
          </span>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      <div className="controls-section">
        <div className="filters">
          <input
            type="text"
            placeholder="Buscar por conductor..."
            value={filtroConductor}
            onChange={(e) => setFiltroConductor(e.target.value)}
            className="search-input"
          />
          <button 
            className="btn-secondary"
            onClick={cargarGuias}
          >
            🔄 Actualizar
          </button>
        </div>
      </div>

      <div className="guias-table">
        <div className="table-header">
          <div className="header-cell">Tracking</div>
          <div className="header-cell">Cliente</div>
          <div className="header-cell">Conductor</div>
          <div className="header-cell">Ciudad</div>
          <div className="header-cell">Valor</div>
          <div className="header-cell">Estado</div>
          <div className="header-cell">Última Actualización</div>
        </div>

        {guias.map((guia) => (
          <div key={guia.tracking_number} className="table-row">
            <div className="table-cell">
              <span className="tracking">{guia.tracking_number}</span>
            </div>
            <div className="table-cell">
              <span className="cliente">{guia.cliente}</span>
            </div>
            <div className="table-cell">
              <div className="conductor-info">
                <span className="conductor-nombre">{guia.conductor.nombre}</span>
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
              <span className={`estado-badge ${guia.estado.toLowerCase()}`}>
                {guia.estado}
              </span>
            </div>
            <div className="table-cell">
              <span className="fecha">
                {new Date(guia.fecha).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
      </div>

      {guias.length === 0 && !loading && (
        <div className="empty-state">
          <p>No se encontraron guías pendientes</p>
        </div>
      )}

      <div className="pagination">
        <button 
          disabled={page === 0} 
          onClick={() => setPage(p => p - 1)}
          className="btn-secondary"
        >
          ← Anterior
        </button>
        <span className="page-info">
          Página {page + 1} de {Math.ceil(total / limit)}
        </span>
        <button 
          disabled={guias.length < limit} 
          onClick={() => setPage(p => p + 1)}
          className="btn-secondary"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
