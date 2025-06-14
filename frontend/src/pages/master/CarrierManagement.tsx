import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "../../context/authContext";
import LoadingContainer from "../../components/LoadingContainer";
import "../../styles/admin/CarrierManagement.css";

interface GuiaCarrier {
  tracking_number: string;
  Cliente: string;
  Ciudad: string;
  Departamento: string;
  Valor: number;
  Status_Date: string;
  Status_Big: string;
  Carrier: string;
  carrier_id: number;
  Empleado: string;
  Employee_id: number;
}

interface CarrierResumen {
  carrier_id: number;
  nombre: string;
  totalGuias: number;
  valorTotal: number;
  guiasPorEstado: {
    [key: string]: number;
  };
  guias: GuiaCarrier[];
}

interface FiltrosState {
  carrier: string;
  estado: string;
  fechaInicio: string;
  fechaFin: string;
}

export default function CarrierManagement() {
  const { user } = useAuth();
  const [carriers, setCarriers] = useState<CarrierResumen[]>([]);
  const [guias, setGuias] = useState<GuiaCarrier[]>([]);
  const [filtros, setFiltros] = useState<FiltrosState>({
    carrier: "",
    estado: "",
    fechaInicio: "",
    fechaFin: ""
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const getHeaders = useCallback((): Record<string, string> => {
    if (!user) return {};
    return {
      Authorization: `Bearer ${user.token}`,
      "X-User-Email": user.email,
      "X-User-Role": user.role
    };
  }, [user]);

  const cargarDatos = useCallback(async () => {
    if (!user || !mountedRef.current) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch("https://api.x-cargo.co/admin/carriers/guias", {
        headers: getHeaders()
      });

      if (!response.ok) {
        throw new Error(`Error al cargar datos: \${response.statusText}`);
      }

      const data: GuiaCarrier[] = await response.json();
      
      if (!mountedRef.current) return;

      setGuias(data);
      
      // Procesar datos para obtener resumen por carrier
      const resumenPorCarrier = data.reduce((acc: { [key: string]: CarrierResumen }, guia) => {
        if (!acc[guia.Carrier]) {
          acc[guia.Carrier] = {
            carrier_id: guia.carrier_id,
            nombre: guia.Carrier,
            totalGuias: 0,
            valorTotal: 0,
            guiasPorEstado: {},
            guias: []
          };
        }

        acc[guia.Carrier].totalGuias += 1;
        acc[guia.Carrier].valorTotal += guia.Valor;
        acc[guia.Carrier].guiasPorEstado[guia.Status_Big] = 
          (acc[guia.Carrier].guiasPorEstado[guia.Status_Big] || 0) + 1;
        acc[guia.Carrier].guias.push(guia);

        return acc;
      }, {});

      setCarriers(Object.values(resumenPorCarrier));
    } catch (err) {
      console.error("Error al cargar datos:", err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Error al cargar los datos");
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [user, getHeaders]);

  const aplicarFiltros = useCallback(() => {
    if (!guias.length) return;

    let guiasFiltradas = [...guias];

    if (filtros.carrier) {
      guiasFiltradas = guiasFiltradas.filter(g => 
        g.Carrier.toLowerCase().includes(filtros.carrier.toLowerCase())
      );
    }

    if (filtros.estado) {
      guiasFiltradas = guiasFiltradas.filter(g => 
        g.Status_Big.toLowerCase() === filtros.estado.toLowerCase()
      );
    }

    if (filtros.fechaInicio) {
      guiasFiltradas = guiasFiltradas.filter(g => 
        new Date(g.Status_Date) >= new Date(filtros.fechaInicio)
      );
    }

    if (filtros.fechaFin) {
      guiasFiltradas = guiasFiltradas.filter(g => 
        new Date(g.Status_Date) <= new Date(filtros.fechaFin)
      );
    }

    const resumenFiltrado = guiasFiltradas.reduce((acc: { [key: string]: CarrierResumen }, guia) => {
      if (!acc[guia.Carrier]) {
        acc[guia.Carrier] = {
          carrier_id: guia.carrier_id,
          nombre: guia.Carrier,
          totalGuias: 0,
          valorTotal: 0,
          guiasPorEstado: {},
          guias: []
        };
      }

      acc[guia.Carrier].totalGuias += 1;
      acc[guia.Carrier].valorTotal += guia.Valor;
      acc[guia.Carrier].guiasPorEstado[guia.Status_Big] = 
        (acc[guia.Carrier].guiasPorEstado[guia.Status_Big] || 0) + 1;
      acc[guia.Carrier].guias.push(guia);

      return acc;
    }, {});

    setCarriers(Object.values(resumenFiltrado));
  }, [guias, filtros]);

  const handleFiltroChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const { name, value } = e.target;
    setFiltros(prev => ({
      ...prev,
      [name]: value
    }));
  };

  useEffect(() => {
    cargarDatos();
    return () => {
      mountedRef.current = false;
    };
  }, [cargarDatos]);

  useEffect(() => {
    aplicarFiltros();
  }, [aplicarFiltros, filtros]);

  if (!user) {
    return (
      <div className="carrier-management-container">
        <div className="mensaje error">
          Por favor inicie sesión para acceder a esta página
        </div>
      </div>
    );
  }

  return (
    <div className="carrier-management-container">
      <h1>Gestión de Carriers</h1>
      
      <div className="filtros-section">
        <div className="filtro-grupo">
          <label htmlFor="carrier">Carrier:</label>
          <input
            type="text"
            id="carrier"
            name="carrier"
            value={filtros.carrier}
            onChange={handleFiltroChange}
            placeholder="Buscar carrier..."
          />
        </div>

        <div className="filtro-grupo">
          <label htmlFor="estado">Estado:</label>
          <select
            id="estado"
            name="estado"
            value={filtros.estado}
            onChange={handleFiltroChange}
          >
            <option value="">Todos los estados</option>
            <option value="ENTREGADO">Entregado</option>
            <option value="EN_RUTA">En Ruta</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="NOVEDAD">Novedad</option>
          </select>
        </div>

        <div className="filtro-grupo">
          <label htmlFor="fechaInicio">Desde:</label>
          <input
            type="date"
            id="fechaInicio"
            name="fechaInicio"
            value={filtros.fechaInicio}
            onChange={handleFiltroChange}
          />
        </div>

        <div className="filtro-grupo">
          <label htmlFor="fechaFin">Hasta:</label>
          <input
            type="date"
            id="fechaFin"
            name="fechaFin"
            value={filtros.fechaFin}
            onChange={handleFiltroChange}
          />
        </div>
      </div>      {loading ? (
        <LoadingContainer message="Cargando información de carriers..." isLoading={false} />
      ) : error ? (
        <div className="mensaje error">{error}</div>
      ) : (
        <div className="carriers-grid">
          {carriers.map(carrier => (
            <div key={carrier.carrier_id} className="carrier-card">
              <div className="carrier-header">
                <h2>{carrier.nombre}</h2>
                <div className="carrier-stats">
                  <div className="stat">
                    <span className="stat-label">Total Guías:</span>
                    <span className="stat-value">{carrier.totalGuias}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Valor Total:</span>
                    <span className="stat-value">
                      ${carrier.valorTotal.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="estados-grid">
                {Object.entries(carrier.guiasPorEstado).map(([estado, cantidad]) => (
                  <div key={estado} className={`estado-card ${estado.toLowerCase()}`}>
                    <span className="estado-nombre">{estado}</span>
                    <span className="estado-cantidad">{cantidad}</span>
                  </div>
                ))}
              </div>

              <div className="guias-table-container">
                <table className="guias-table">
                  <thead>
                    <tr>
                      <th>Tracking</th>
                      <th>Cliente</th>
                      <th>Ciudad</th>
                      <th>Valor</th>
                      <th>Estado</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carrier.guias.map(guia => (
                      <tr key={guia.tracking_number}>
                        <td>{guia.tracking_number}</td>
                        <td>{guia.Cliente}</td>
                        <td>{guia.Ciudad}</td>
                        <td>${guia.Valor.toLocaleString()}</td>
                        <td>
                          <span className={`estado-tag ${guia.Status_Big.toLowerCase()}`}>
                            {guia.Status_Big}
                          </span>
                        </td>
                        <td>{new Date(guia.Status_Date).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
