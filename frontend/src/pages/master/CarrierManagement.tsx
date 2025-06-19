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
  estado_pago: "pendiente" | "pagado";
  pago_referencia?: string;
  fecha_liquidacion?: string;
}

interface CarrierResumen {
  carrier_id: number;
  nombre: string;
  total_guias: number;
  valor_total: number;
  guias_pendientes: number;
  guias_pagadas: number;
  valor_pendiente: number;
  valor_pagado: number;
  total_conductores: number;
  total_ciudades: number;
  conductores: string[];
  ciudades: string[];
}

interface ResumenGeneral {
  total_guias: number;
  valor_total: number;
  guias_pendientes: number;
  guias_pagadas: number;
  valor_pendiente: number;
  valor_pagado: number;
  porcentaje_pagado: number;
}

interface CarrierDataResponse {
  guias: GuiaCarrier[];
  resumen_general: ResumenGeneral;
  resumen_por_carrier: CarrierResumen[];
  paginacion: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
    count: number;
  };
  filtros_aplicados: any;
  fecha_consulta: string;
  total_carriers: number;
}

interface FiltrosState {
  carrier: string;
  estadoPago: string;
  fechaInicio: string;
  fechaFin: string;
}

export default function CarrierManagement() {
  const { user } = useAuth();
  const [data, setData] = useState<CarrierDataResponse | null>(null);
  const [filtros, setFiltros] = useState<FiltrosState>({
    carrier: "",
    estadoPago: "",
    fechaInicio: "",
    fechaFin: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vistaActual, setVistaActual] = useState<"resumen" | "detalle">(
    "detalle"
  );
  const mountedRef = useRef(true);

  const getHeaders = useCallback((): Record<string, string> => {
    if (!user) return {};
    return {
      Authorization: `Bearer ${user.token}`,
      "X-User-Email": user.email,
      "X-User-Role": user.role,
    };
  }, [user]);
  const cargarDatos = useCallback(
    async (page: number = currentPage) => {
      if (!user || !mountedRef.current) return;

      try {
        setLoading(true);
        setError(null);

        // Construir parámetros de consulta
        const params = new URLSearchParams();
        if (filtros.fechaInicio)
          params.append("fecha_inicio", filtros.fechaInicio);
        if (filtros.fechaFin) params.append("fecha_fin", filtros.fechaFin);
        if (filtros.carrier) params.append("carrier", filtros.carrier);
        if (filtros.estadoPago)
          params.append("estado_pago", filtros.estadoPago);

        // Agregar parámetros de paginación
        params.append("page", page.toString());
        params.append("page_size", pageSize.toString());

        const url = `https://api.x-cargo.co/master/carriers/guias${
          params.toString() ? "?" + params.toString() : ""
        }`;

        const response = await fetch(url, {
          headers: getHeaders(),
        });

        if (!response.ok) {
          throw new Error(`Error al cargar datos: ${response.statusText}`);
        }

        const responseData: CarrierDataResponse = await response.json();
        if (!mountedRef.current) return;

        setData(responseData);
      } catch (err) {
        console.error("Error al cargar datos:", err);
        if (mountedRef.current) {
          setError(
            err instanceof Error ? err.message : "Error al cargar los datos"
          );
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [user, getHeaders, filtros, currentPage, pageSize]
  );

  const exportarDatos = useCallback(
    async (formato: "csv" | "json" = "csv") => {
      if (!user) return;

      try {
        const params = new URLSearchParams();
        params.append("formato", formato);
        if (filtros.fechaInicio)
          params.append("fecha_inicio", filtros.fechaInicio);
        if (filtros.fechaFin) params.append("fecha_fin", filtros.fechaFin);
        if (filtros.carrier) params.append("carrier", filtros.carrier);
        if (filtros.estadoPago)
          params.append("estado_pago", filtros.estadoPago);

        const url = `https://api.x-cargo.co/master/carriers/export?${params.toString()}`;

        const response = await fetch(url, {
          headers: getHeaders(),
        });

        if (!response.ok) {
          throw new Error(`Error al exportar: ${response.statusText}`);
        }

        if (formato === "csv") {
          const blob = await response.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = downloadUrl;
          link.download = `carriers_guias_${
            new Date().toISOString().split("T")[0]
          }.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(downloadUrl);
        } else {
          const jsonData = await response.json();
          const blob = new Blob([JSON.stringify(jsonData, null, 2)], {
            type: "application/json",
          });
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = downloadUrl;
          link.download = `carriers_guias_${
            new Date().toISOString().split("T")[0]
          }.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(downloadUrl);
        }
      } catch (err) {
        console.error("Error al exportar:", err);
        setError(
          err instanceof Error ? err.message : "Error al exportar datos"
        );
      }
    },
    [user, getHeaders, filtros]
  );

  const handleFiltroChange = (
    e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setFiltros((prev) => ({
      ...prev,
      [name]: value,
    }));
  };
  const aplicarFiltros = () => {
    setCurrentPage(1); // Resetear a la primera página cuando se aplican filtros
    cargarDatos(1);
  };
  const limpiarFiltros = () => {
    setFiltros({
      carrier: "",
      estadoPago: "",
      fechaInicio: "",
      fechaFin: "",
    });
    setCurrentPage(1); // Resetear a la primera página
  };

  const irAPagina = (pagina: number) => {
    setCurrentPage(pagina);
    cargarDatos(pagina);
  };

  const paginaAnterior = () => {
    if (data?.paginacion.has_prev) {
      const nuevaPagina = currentPage - 1;
      setCurrentPage(nuevaPagina);
      cargarDatos(nuevaPagina);
    }
  };

  const paginaSiguiente = () => {
    if (data?.paginacion.has_next) {
      const nuevaPagina = currentPage + 1;
      setCurrentPage(nuevaPagina);
      cargarDatos(nuevaPagina);
    }
  };

  // useEffect para cargar datos cuando cambian filtros, página o tamaño de página
  useEffect(() => {
    cargarDatos(currentPage);
    return () => {
      mountedRef.current = false;
    };
  }, [currentPage, pageSize, filtros]);

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
      <div className="header-section">
        <h1>Gestión de Carriers - Guías Entregadas</h1>
        <p className="subtitle">
          Control de estado de pago de guías entregadas al cliente (Estado 360)
        </p>
      </div>

      <div className="filtros-section">
        <div className="filtros-grid">
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
            <label htmlFor="estadoPago">Estado de Pago:</label>
            <select
              id="estadoPago"
              name="estadoPago"
              value={filtros.estadoPago}
              onChange={handleFiltroChange}
            >
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="pagado">Pagado</option>
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
          </div>{" "}
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
          <div className="filtro-grupo">
            <label htmlFor="pageSize">Registros por página:</label>
            <select
              id="pageSize"
              value={pageSize}
              onChange={(e) => {
                const newSize = parseInt(e.target.value);
                setPageSize(newSize);
                setCurrentPage(1);
                cargarDatos(1);
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>

        <div className="filtros-acciones">
          <button
            onClick={aplicarFiltros}
            className="btn btn-primary"
            disabled={loading}
          >
            🔍 Aplicar Filtros
          </button>
          <button onClick={limpiarFiltros} className="btn btn-secondary">
            🧹 Limpiar
          </button>
          <button
            onClick={() => exportarDatos("csv")}
            className="btn btn-success"
            disabled={loading || !data}
          >
            📤 Exportar CSV
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingContainer
          message="Cargando información de carriers..."
          isLoading={true}
        />
      ) : error ? (
        <div className="mensaje error">{error}</div>
      ) : data ? (
        <>
          {/* Resumen General */}
          <div className="resumen-general">
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">📦</div>
                <div className="stat-content">
                  <h3>{data.resumen_general.total_guias.toLocaleString()}</h3>
                  <p>Total Guías</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">💰</div>
                <div className="stat-content">
                  <h3>${data.resumen_general.valor_total.toLocaleString()}</h3>
                  <p>Valor Total</p>
                </div>
              </div>

              <div className="stat-card pendiente">
                <div className="stat-icon">⏳</div>
                <div className="stat-content">
                  <h3>
                    {data.resumen_general.guias_pendientes.toLocaleString()}
                  </h3>
                  <p>Pendientes</p>
                  <small>
                    ${data.resumen_general.valor_pendiente.toLocaleString()}
                  </small>
                </div>
              </div>

              <div className="stat-card pagado">
                <div className="stat-icon">✅</div>
                <div className="stat-content">
                  <h3>{data.resumen_general.guias_pagadas.toLocaleString()}</h3>
                  <p>Pagadas</p>
                  <small>
                    ${data.resumen_general.valor_pagado.toLocaleString()}
                  </small>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">📊</div>
                <div className="stat-content">
                  <h3>{data.resumen_general.porcentaje_pagado.toFixed(1)}%</h3>
                  <p>% Pagado</p>
                </div>
              </div>
            </div>
          </div>

          {/* Controles de Vista */}
          <div className="vista-controles">
            <button
              onClick={() => setVistaActual("resumen")}
              className={`btn ${
                vistaActual === "resumen" ? "btn-primary" : "btn-secondary"
              }`}
            >
              📊 Vista Resumen
            </button>
            <button
              onClick={() => setVistaActual("detalle")}
              className={`btn ${
                vistaActual === "detalle" ? "btn-primary" : "btn-secondary"
              }`}
            >
              📋 Vista Detalle
            </button>
          </div>

          {vistaActual === "resumen" ? (
            /* Vista Resumen por Carrier */
            <div className="carriers-grid">
              {data.resumen_por_carrier.map((carrier) => (
                <div key={carrier.carrier_id} className="carrier-card">
                  <div className="carrier-header">
                    <h2>{carrier.nombre}</h2>
                    <div className="carrier-stats">
                      <div className="stat">
                        <span className="stat-label">Total Guías:</span>
                        <span className="stat-value">
                          {carrier.total_guias}
                        </span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Valor Total:</span>
                        <span className="stat-value">
                          ${carrier.valor_total.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="estados-grid">
                    <div className="estado-card pendiente">
                      <span className="estado-nombre">Pendientes</span>
                      <span className="estado-cantidad">
                        {carrier.guias_pendientes}
                      </span>
                      <span className="estado-valor">
                        ${carrier.valor_pendiente.toLocaleString()}
                      </span>
                    </div>
                    <div className="estado-card pagado">
                      <span className="estado-nombre">Pagadas</span>
                      <span className="estado-cantidad">
                        {carrier.guias_pagadas}
                      </span>
                      <span className="estado-valor">
                        ${carrier.valor_pagado.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="carrier-details">
                    <p>
                      <strong>Conductores:</strong> {carrier.total_conductores}
                    </p>
                    <p>
                      <strong>Ciudades:</strong> {carrier.total_ciudades}
                    </p>
                    <p>
                      <strong>Eficiencia Pago:</strong>{" "}
                      {(
                        (carrier.guias_pagadas / carrier.total_guias) *
                        100
                      ).toFixed(1)}
                      %
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Vista Detalle - Tabla de Guías */
            <div className="tabla-container">
              {" "}
              <div className="tabla-header">
                <h3>
                  Detalle de Guías
                  {data.paginacion && (
                    <span className="paginacion-header">
                      ({data.paginacion.total} total, página{" "}
                      {data.paginacion.page} de {data.paginacion.total_pages})
                    </span>
                  )}
                </h3>
              </div>
              <div className="tabla-scroll">
                <table className="guias-table">
                  <thead>
                    <tr>
                      <th>Tracking</th>
                      <th>Cliente</th>
                      <th>Carrier</th>
                      <th>Conductor</th>
                      <th>Ciudad</th>
                      <th>Valor</th>
                      <th>Fecha Entrega</th>
                      <th>Estado Pago</th>
                      <th>Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.guias.length === 0 ? (
                      <tr>
                        <td colSpan={9}>
                          No se encontraron guías con los filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      data.guias.map((guia) => (
                        <tr key={guia.tracking_number}>
                          <td className="tracking-cell">
                            {guia.tracking_number}
                          </td>
                          <td>{guia.Cliente}</td>
                          <td>{guia.Carrier}</td>
                          <td>{guia.Empleado}</td>
                          <td>{guia.Ciudad}</td>
                          <td className="valor-cell">
                            ${guia.Valor.toLocaleString()}
                          </td>
                          <td>
                            {new Date(guia.Status_Date).toLocaleDateString()}
                          </td>
                          <td>
                            <span
                              className={`estado-badge ${guia.estado_pago}`}
                            >
                              {guia.estado_pago === "pendiente"
                                ? "⏳ Pendiente"
                                : "✅ Pagado"}
                            </span>
                          </td>
                          <td className="referencia-cell">
                            {guia.pago_referencia || "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {/* Controles de Paginación */}
              {data.paginacion && (
                <div className="paginacion-container">
                  <div className="paginacion-info">
                    <span>
                      Mostrando {data.paginacion.count} de{" "}
                      {data.paginacion.total} registros (Página{" "}
                      {data.paginacion.page} de {data.paginacion.total_pages})
                    </span>
                  </div>

                  <div className="paginacion-controles">
                    <button
                      onClick={paginaAnterior}
                      disabled={!data.paginacion.has_prev}
                      className="btn btn-secondary"
                    >
                      ← Anterior
                    </button>

                    <div className="paginacion-numeros">
                      {(() => {
                        const startPage = Math.max(1, currentPage - 2);
                        const endPage = Math.min(
                          data.paginacion.total_pages,
                          startPage + 4
                        );
                        const pageButtons = [];
                        for (
                          let pageNum = startPage;
                          pageNum <= endPage;
                          pageNum++
                        ) {
                          pageButtons.push(
                            <button
                              key={pageNum}
                              onClick={() => irAPagina(pageNum)}
                              className={`btn ${
                                currentPage === pageNum
                                  ? "btn-primary"
                                  : "btn-secondary"
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        }
                        return pageButtons;
                      })()}
                    </div>

                    <button
                      onClick={paginaSiguiente}
                      disabled={!data.paginacion.has_next}
                      className="btn btn-secondary"
                    >
                      Siguiente →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
