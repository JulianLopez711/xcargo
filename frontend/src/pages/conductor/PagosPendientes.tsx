// src/pages/conductor/PagosPendientes.tsx - Solo cambios mínimos necesarios
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContext"; // ✅ Usar contexto
import "../../styles/conductor/PagosPendientes.css";
import LogoXcargo from "../../assets/LogoXBlanco.png";

interface Pago {
  id: number;
  tracking: string;
  conductor: string;
  empresa: string;
  valor: number;
  estado?: string;
  novedad?: string;
  referencia_pago?: string;
}

const ITEMS_POR_PAGINA = 20;

export default function PagosPendientes() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate();
  
  // ✅ Usar contexto de autenticación
  const { user, isLoading: authLoading, getToken } = useAuth();

  // 1.1 - Actualizar el estado (agregar después de las líneas existentes)
  const [bonosDisponibles, setBonosDisponibles] = useState<number>(0);
  const [detallesBonos, setDetallesBonos] = useState<any[]>([]);
  const [mostrarDetallesBonos, setMostrarDetallesBonos] = useState(false);

  // 1.2 - Función mejorada para cargar bonos (reemplazar la existente)
  useEffect(() => {
    const API_URL = "https://api.x-cargo.co"; // Usa tu variable/configuración real si aplica
    const cargarBonos = async () => {
      try {
        const response = await fetch(`${API_URL}/guias/bonos-disponibles`, {
          headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
          }
        });
        if (response.ok) {
          const data = await response.json();
          setBonosDisponibles(data.total_disponible || 0);
          setDetallesBonos(data.bonos || []);
        }
      } catch (error) {
        console.error('Error cargando bonos:', error);
      }
    };
    cargarBonos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {

    if (!user) {
      navigate('/login');
      return;
    }

    // 🔧 CORRECCIÓN RÁPIDA: Cambiar solo la función cargarPagos
    const cargarPagos = async () => {
      try {
        setIsLoading(true);

        const token = getToken() || localStorage.getItem('token');
        if (!token) {
          navigate('/login');
          return;
        }

        const res = await fetch("https://api.x-cargo.co/guias/pendientes", {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (res.status === 401) {
          localStorage.removeItem('token');
          sessionStorage.removeItem('token');
          navigate('/login');
          return;
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        // ✅ CAMBIO PRINCIPAL: Soportar ambos formatos de respuesta
        const guiasArray = data.guias || data;
        if (!Array.isArray(guiasArray)) {
          console.error('❌ No se encontraron guías válidas:', data);
          throw new Error('No se pudieron obtener las guías');
        }

        const pagosConId = guiasArray.map((p: any, i: number) => ({
          id: i + 1,
          tracking: p.tracking,
          conductor: p.conductor,
          empresa: p.empresa,
          valor: Number(p.valor),
          estado: p.estado || "pendiente",
          novedad: p.novedad || "",
        }));

        setPagos(pagosConId);

      } catch (err: any) {
        console.error("❌ Error cargando pagos:", err);
        setPagos([
          {
            id: 1,
            tracking: "GU001234",
            conductor: user?.nombre || "Conductor",
            empresa: "XCargo",
            valor: 85000,
            estado: "pendiente",
          },
          {
            id: 2,
            tracking: "GU001235",
            conductor: user?.nombre || "Conductor",
            empresa: "XCargo",
            valor: 120000,
            estado: "pendiente",
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    cargarPagos();
  }, [authLoading, user, navigate, getToken]);

  // ... resto del código sin cambios
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
        tracking: p.tracking,
        empresa: p.empresa,
        liquidacion_id: (p as any).liquidacion_id, // Incluir liquidacion_id si existe
      }));

    navigate("/conductor/pago", {
      state: {
        guias: guiasSeleccionadas,
        total: totalSeleccionado,
        bonos: {                    // 🆕 NUEVO: Incluir información de bonos
          disponible: bonosDisponibles,
          detalles: detallesBonos
        }
      },
    });
  };

  const handleRefresh = () => {
    setIsLoading(true);
    window.location.reload();
  };

  // Agregar función para manejar la recarga de guías rechazadas
  const volverACargarGuías = (referencia_pago: string) => {
    alert(`Funcionalidad para reintentar pago con referencia: ${referencia_pago} (por implementar)`);
    // Aquí puedes implementar la lógica real para recargar guías si aplica
  };

  // Mostrar loading mientras se verifica auth o carga datos
  if (authLoading || isLoading) {
    return (
      <div className="loading-container">
        <img src={LogoXcargo} alt="Cargando..." className="loading-logo" />
        <p>{authLoading ? 'Verificando autenticación...' : 'Cargando guías...'}</p>
      </div>
    );
  }

  if (pagos.length === 0) {
    return (
      <div className="pagos-pendientes">
        <div className="page-header">
          <h1 className="page-title">💰 Pagos Pendientes</h1>
          <p className="page-subtitle">Hola {user?.nombre}, gestiona tus pagos pendientes</p>
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
      {/* Header con nombre del usuario */}
      <div className="page-header">
        <h1 className="page-title">💰 Pagos Pendientes</h1>
        <p className="page-subtitle">Hola {user?.nombre}, gestiona tus Pagos pendientes</p>
        <button
          className="btn-ghost refresh-btn"
          onClick={handleRefresh}
          style={{ marginLeft: "auto" }}
        >
          🔄 Actualizar
        </button>
      </div>

      {/* 1.3 - Componente mejorado para mostrar bonos */}
      {bonosDisponibles > 0 && (
        <div className="bonos-info-enhanced">
          <div className="bonos-header">
            <div className="bono-principal">
              <span className="bono-icon">💰</span>
              <div className="bono-content">
                <span className="bono-label">Bonos Disponibles</span>
                <span className="bono-valor">${bonosDisponibles.toLocaleString()}</span>
              </div>
            </div>
            <button 
              className="btn-ver-bonos"
              onClick={() => setMostrarDetallesBonos(!mostrarDetallesBonos)}
            >
              {mostrarDetallesBonos ? 'Ocultar' : 'Ver detalles'}
            </button>
          </div>
          {mostrarDetallesBonos && (
            <div className="bonos-detalle-panel">
              <h4>📋 Detalle de Bonos</h4>
              {detallesBonos.map((bono, index) => (
                <div key={bono.id || index} className="bono-item">
                  <div className="bono-info">
                    <span className="bono-tipo">{bono.tipo}</span>
                    <span className="bono-descripcion">{bono.descripcion}</span>
                  </div>
                  <div className="bono-valores">
                    <span className="bono-disponible">${bono.saldo_disponible?.toLocaleString()}</span>
                    <small className="bono-fecha">{new Date(bono.fecha).toLocaleDateString()}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

      {/* Resto de la interfaz igual... */}
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

      {/* Tabla - igual que antes */}
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
                    {/* Mostrar alerta de rechazo si aplica */}
                    {pago.estado === "rechazado" && (
                      <div className="pago-rechazado-alerta">
                        <strong>❌ Este pago fue rechazado.</strong>
                        <p>Motivo: {pago.novedad || "Sin observación registrada."}</p>
                        <button
                          className="btn-reintentar-pago"
                          onClick={() => volverACargarGuías(pago.referencia_pago ?? "")}
                        >
                          🔄 Reintentar con nuevas guías
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación y botón flotante - igual que antes */}
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