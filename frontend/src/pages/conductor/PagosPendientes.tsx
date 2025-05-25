// EJEMPLO: frontend/src/pages/conductor/PagosPendientes.tsx ACTUALIZADO

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Table } from "../../components/ui";
import LoadingSpinner from "../../components/LoadingSpinner";
import "../../styles/conductor/PagosPendientes.css";

interface Pago {
  id: number;
  tracking: string;
  conductor: string;
  empresa: string;
  valor: number;
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

  // Configuración de columnas para la tabla
  const columns = [
    { key: 'checkbox', header: '', width: '50px', align: 'center' as const },
    { key: 'tracking', header: 'Tracking', width: '150px' },
    { key: 'conductor', header: 'Conductor', width: '120px' },
    { key: 'empresa', header: 'Empresa', width: '120px' },
    { key: 'valor', header: 'Valor', width: '100px', align: 'right' as const },
    { key: 'estado', header: 'Estado', width: '100px', align: 'center' as const },
    { key: 'novedad', header: 'Novedad', width: '200px' },
  ];

  useEffect(() => {
    const cargarPagos = async () => {
      try {
        const res = await fetch("https://api.x-cargo.co/api/guias/pendientes");
        const data = await res.json();
        const pagosConId = data.map((p: Omit<Pago, "id">, i: number) => ({
          id: i + 1,
          ...p,
        }));
        setPagos(pagosConId);
      } catch (err) {
        console.error("Error cargando pagos:", err);
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
      setSeleccionados(paginatedPagos.map(p => p.id));
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
      .map((p) => ({ referencia: p.tracking, valor: p.valor }));

    navigate("/conductor/pago", {
      state: {
        guias: guiasSeleccionadas,
        total: totalSeleccionado,
      },
    });
  };

  // Preparar datos para la tabla
  const tableData = paginatedPagos.map((pago) => ({
    id: pago.id,
    checkbox: (
      <input
        type="checkbox"
        checked={seleccionados.includes(pago.id)}
        onChange={() => toggleSeleccion(pago.id)}
        className="checkbox-custom"
        aria-label={`Seleccionar guía ${pago.tracking}`}
      />
    ),
    tracking: <span className="tracking-code">{pago.tracking}</span>,
    conductor: pago.conductor,
    empresa: pago.empresa,
    valor: (
      <span className="valor-money">
        ${pago.valor.toLocaleString()}
      </span>
    ),
    estado: (
      <span className={`estado-badge estado-${pago.estado || 'pendiente'}`}>
        {pago.estado || 'pendiente'}
      </span>
    ),
    novedad: (
      <span className={pago.novedad ? "novedad-text" : "novedad-empty"}>
        {pago.novedad || "-"}
      </span>
    ),
  }));

  if (isLoading) {
    return (
      <div className="loading-container">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="pagos-pendientes">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">💰 Pagos Pendientes</h1>
        <p className="page-subtitle">
          Gestiona tus guías pendientes de pago
        </p>
      </div>

      {/* Resumen Total */}
      <Card className="resumen-card" padding="md">
        <div className="resumen-content">
          <div className="resumen-info">
            <span className="resumen-label">Total pendiente:</span>
            <span className="resumen-valor">${totalGlobal.toLocaleString()}</span>
          </div>
          <div className="resumen-stats">
            <span>{pagos.length} guías</span>
            <span>•</span>
            <span>{seleccionados.length} seleccionadas</span>
          </div>
        </div>
      </Card>

      {/* Controles de Tabla */}
      <Card className="table-controls" padding="sm">
        <div className="controls-row">
          <div className="controls-left">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTodos}
              icon={seleccionados.length === paginatedPagos.length ? "☑️" : "☐"}
            >
              {seleccionados.length === paginatedPagos.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
            </Button>
          </div>
          
          <div className="controls-right">
            {seleccionados.length > 0 && (
              <div className="selection-summary">
                <span className="selection-count">
                  {seleccionados.length} seleccionada{seleccionados.length !== 1 ? 's' : ''}
                </span>
                <span className="selection-total">
                  ${totalSeleccionado.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Tabla */}
      <Card padding="sm">
        <Table
          columns={columns}
          data={tableData}
          loading={isLoading}
          emptyMessage="No hay pagos pendientes"
          responsive={true}
        />
      </Card>

      {/* Paginación */}
      {totalPaginas > 1 && (
        <Card className="pagination-card" padding="sm">
          <div className="pagination-controls">
            <Button
              variant="secondary"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
              icon="←"
            >
              Anterior
            </Button>
            
            <div className="pagination-info">
              <span>Página {currentPage} de {totalPaginas}</span>
              <small>({pagos.length} total)</small>
            </div>
            
            <Button
              variant="secondary"
              size="sm"
              disabled={currentPage === totalPaginas}
              onClick={() => setCurrentPage(prev => prev + 1)}
            >
              Siguiente
              <span>→</span>
            </Button>
          </div>
        </Card>
      )}

      {/* Botón de Pago */}
      {seleccionados.length > 0 && (
        <div className="floating-action">
          <Card className="action-card" padding="md">
            <div className="action-content">
              <div className="action-summary">
                <span className="action-count">
                  {seleccionados.length} guía{seleccionados.length !== 1 ? 's' : ''} seleccionada{seleccionados.length !== 1 ? 's' : ''}
                </span>
                <span className="action-total">
                  Total: ${totalSeleccionado.toLocaleString()}
                </span>
              </div>
              <Button
                variant="primary"
                size="lg"
                onClick={handlePagar}
                icon="💳"
                className="action-button"
              >
                Procesar Pago
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}