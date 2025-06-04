// src/pages/conductor/PagosPendientes.tsx - Actualizado para COD_pendientes_v1
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/conductor/PagosPendientes.css";
import LogoXcargo from "../../assets/LogoXBlanco.png";

interface Pago {
  id: number;
  tracking: string;
  conductor: string;
  empresa: string;
  valor: number; // Ahora es INTEGER en lugar de FLOAT
  estado?: string;
  novedad?: string;
}

const ITEMS_POR_PAGINA = 20;

export default function PagosPendientes() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate();

  useEffect(() => {
    const cargarPagos = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/guias/pendientes");
        const data = await res.json();

        const pagosConId = data.map((p: Omit<Pago, "id">, i: number) => ({
          id: i + 1,
          tracking: p.tracking,
          conductor: p.conductor,
          empresa: p.empresa,
          valor: Number(p.valor), // Asegurar que sea número
          estado: p.estado || "pendiente",
          novedad: p.novedad || "",
        }));

        setPagos(pagosConId);
      } catch (err) {
        console.error("Error cargando pagos:", err);
        // Datos de ejemplo para desarrollo (actualizados con valores enteros)
        setPagos([
          {
            id: 1,
            tracking: "GU001234",
            conductor: "Juan Pérez",
            empresa: "XCargo",
            valor: 85000,
            estado: "pendiente",
          },
          {
            id: 2,
            tracking: "GU001235",
            conductor: "Juan Pérez",
            empresa: "XCargo",
            valor: 120000,
            estado: "pendiente",
          },
          {
            id: 3,
            tracking: "GU001236",
            conductor: "Juan Pérez",
            empresa: "XCargo",
            valor: 95000,
            estado: "pendiente",
          },
          {
            id: 4,
            tracking: "GU001246",
            conductor: "Juan Pérez",
            empresa: "XCargo",
            valor: 95000,
            estado: "pendiente",
          },
          {
            id: 5,
            tracking: "GU001436",
            conductor: "Juan Pérez",
            empresa: "XCargo",
            valor: 195000,
            estado: "pendiente",
          },
          {
            id: 6,
            tracking: "GU001836",
            conductor: "Juan Pérez",
            empresa: "XCargo",
            valor: 75000,
            estado: "pendiente",
          },
          {
            id: 7,
            tracking: "GU001936",
            conductor: "Juan Pérez",
            empresa: "XCargo",
            valor: 58000,
            estado: "pendiente",
          },
          {
            id: 8,
            tracking: "GU001736",
            conductor: "Juan Pérez",
            empresa: "XCargo",
            valor: 86000,
            estado: "pendiente",
          },
          {
            id: 9,
            tracking: "GU001136",
            conductor: "Juan Pérez",
            empresa: "XCargo",
            valor: 80000,
            estado: "pendiente",
          },
          {
            id: 10,
            tracking: "GU003236",
            conductor: "Juan Pérez",
            empresa: "XCargo",
            valor: 105000,
            estado: "pendiente",
          },
          {
            id: 11,
            tracking: "GU003256",
            conductor: "Juan Pérez",
            empresa: "XCargo",
            valor: 1050000,
            estado: "pendiente",
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    cargarPagos();
  }, []);

  const totalPaginas = Math.ceil(pagos.length / ITEMS_POR_PAGINA);
  const paginatedPagos = pagos.slice(
    (currentPage - 1) * ITEMS_POR_PAGINA,
    currentPage * ITEMS_POR_PAGINA
  );

  const toggleSeleccion = (id: number) => {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleTodos = () => {
    if (seleccionados.length === paginatedPagos.length) {
      setSeleccionados([]);
    } else {
      setSeleccionados(paginatedPagos.map((p) => p.id));
    }
  };

  const totalSeleccionado = pagos
    .filter((p) => seleccionados.includes(p.id))
    .reduce((acc, curr) => acc + curr.valor, 0);

  const totalGlobal = pagos.reduce((acc, curr) => acc + curr.valor, 0);

  const handlePagar = () => {
    if (seleccionados.length === 0) {
      alert("Debes seleccionar al menos una guía para pagar.");
      return;
    }

    const guiasSeleccionadas = pagos
      .filter((p) => seleccionados.includes(p.id))
      .map((p) => ({
        referencia: p.tracking,
        valor: p.valor,
        tracking: p.tracking, // Añadir tracking explícitamente
        empresa: p.empresa, // Añadir empresa para mejor identificación
      }));

    navigate("/conductor/pago", {
      state: {
        guias: guiasSeleccionadas,
        total: totalSeleccionado,
      },
    });
  };

  // Función para manejar errores de carga de datos
  const handleRefresh = () => {
    setIsLoading(true);
    window.location.reload();
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <img src={LogoXcargo} alt="Cargando..." className="loading-logo" />
      </div>
    );
  }

  // Si no hay pagos, mostrar mensaje informativo
  if (pagos.length === 0) {
    return (
      <div className="pagos-pendientes">
        <div className="page-header">
          <h1 className="page-title">💰 Pagos Pendientes</h1>
          <p className="page-subtitle">Gestiona tus guías pendientes de pago</p>
        </div>

        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <h3>No hay guías pendientes</h3>
          <p>Actualmente no tienes guías pendientes de pago.</p>
          <button className="btn-primary" onClick={handleRefresh}>
            🔄 Actualizar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pagos-pendientes">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">💰 Pagos Pendientes</h1>
        <button
          className="btn-ghost refresh-btn"
          onClick={handleRefresh}
          style={{ marginLeft: "auto" }}
        >
          🔄 Actualizar
        </button>
      </div>

      {/* Resumen Total */}
      <div className="resumen-card">
        <div className="resumen-content">
          <div className="resumen-info">
            <span className="resumen-label">Total pendiente:</span>
            <span className="resumen-valor">
              ${totalGlobal.toLocaleString()}
            </span>
          </div>
          <div className="resumen-stats">
            <span>{pagos.length} guías</span>
            <span>•</span>
            <span>{seleccionados.length} seleccionadas</span>
          </div>
        </div>
      </div>

      {/* Controles */}
      <div className="table-controls">
        <div className="controls-row">
          <div className="controls-left">
            <button className="btn-ghost" onClick={toggleTodos}>
              {seleccionados.length === paginatedPagos.length
                ? "☑️ Deseleccionar todo"
                : "☐ Seleccionar todo"}
            </button>
          </div>

          <div className="controls-right">
            {seleccionados.length > 0 && (
              <div className="selection-summary">
                <span className="selection-count">
                  {seleccionados.length} seleccionada
                  {seleccionados.length !== 1 ? "s" : ""}
                </span>
                <span className="selection-total">
                  ${totalSeleccionado.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="table-card">
        <div className="table-container">
          <table className="pagos-table">
            <thead>
              <tr>
                <th style={{ width: "50px" }}>
                  <input
                    type="checkbox"
                    checked={
                      seleccionados.length === paginatedPagos.length &&
                      paginatedPagos.length > 0
                    }
                    onChange={toggleTodos}
                  />
                </th>
                <th>Tracking</th>
                <th>Conductor</th>
                <th>Empresa</th>
                <th>Valor</th>
                <th>Estado</th>
                <th>Novedad</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPagos.map((pago) => (
                <tr
                  key={pago.id}
                  className={seleccionados.includes(pago.id) ? "selected" : ""}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={seleccionados.includes(pago.id)}
                      onChange={() => toggleSeleccion(pago.id)}
                    />
                  </td>
                  <td>
                    <span className="tracking-code">{pago.tracking}</span>
                  </td>
                  <td>{pago.conductor}</td>
                  <td>{pago.empresa}</td>
                  <td>
                    <span className="valor-money">
                      $
                      {typeof pago.valor === "number"
                        ? pago.valor.toLocaleString()
                        : "0"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`estado-badge estado-${
                        pago.estado || "pendiente"
                      }`}
                    >
                      {pago.estado || "pendiente"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        pago.novedad ? "novedad-text" : "novedad-empty"
                      }
                    >
                      {pago.novedad || "-"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="pagination-card">
          <div className="pagination-controls">
            <button
              className="btn-secondary"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((prev) => prev - 1)}
            >
              ← Anterior
            </button>

            <div className="pagination-info">
              <span>
                Página {currentPage} de {totalPaginas}
              </span>
              <small>({pagos.length} total)</small>
            </div>

            <button
              className="btn-secondary"
              disabled={currentPage === totalPaginas}
              onClick={() => setCurrentPage((prev) => prev + 1)}
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* Botón de Pago Flotante */}
      {seleccionados.length > 0 && (
        <div className="floating-action">
          <div className="action-card">
            <div className="action-content">
              <div className="action-summary">
                <span className="action-count">
                  {seleccionados.length} guía
                  {seleccionados.length !== 1 ? "s" : ""} seleccionada
                  {seleccionados.length !== 1 ? "s" : ""}
                </span>
                <span className="action-total">
                  Total: ${totalSeleccionado.toLocaleString()}
                </span>
              </div>
              <button
                className="btn-primary action-button"
                onClick={handlePagar}
              >
                💳 Procesar Pago
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
