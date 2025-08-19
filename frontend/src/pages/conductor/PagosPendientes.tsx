// ✅ VERSIÓN COMPLETA CORREGIDA - PagosPendientes.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContext";
import { useLoading } from "../../hooks/useLoading";
import LoadingContainer from "../../components/LoadingContainer";
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
  liquidacion_id?: string;
  fecha_entrega?: string;
  carrier?: string;
  ciudad?: string;
  departamento?: string;
  pago_referencia?: string;
}

const ITEMS_POR_PAGINA = 20;

// Mostrar el token apenas se carga el archivo
const rawToken = localStorage.getItem('token');
console.log('[PagosPendientes] Token en localStorage:', rawToken);
if (!rawToken) {
  console.warn('[PagosPendientes] No hay token en localStorage');
}

export default function PagosPendientes() {
  const { isLoading, withLoading } = useLoading(true);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string>("");
  const navigate = useNavigate();
  
  const { user, isLoading: authLoading, getToken } = useAuth();

  // Estados para bonos
  const [bonosDisponibles, setBonosDisponibles] = useState<number>(0);
  const [detallesBonos, setDetallesBonos] = useState<any[]>([]);
  const [mostrarDetallesBonos, setMostrarDetallesBonos] = useState(false);

  // ✅ FUNCIÓN UNIFICADA: Cargar todos los datos
  const cargarDatos = async () => {
    if (!user?.email) return;
    
    try {
      const token = getToken();
      if (typeof window !== 'undefined') {
        console.log('🔑 Token enviado:', token);
      }
      if (!token) {
        navigate('/login');
        return;
      }

      setError("");
      console.log('🔍 Cargando datos para:', user.email);

      const [bonosRes, guiasRes] = await withLoading(() => Promise.all([
        // Cargar bonos
        fetch("http://127.0.0.1:8000/pagos/bonos-disponibles", {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }).then(async res => {
          if (res.status === 401) {
            localStorage.removeItem('token');
            sessionStorage.removeItem('token');
            throw new Error('No autorizado');
          }
          if (!res.ok) throw new Error(`Error cargando bonos: ${res.status}`);
          return res.json();
        }),

        // Cargar guías pendientes
        fetch("http://127.0.0.1:8000/guias/pendientes", {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'usuario': user.email,
            'rol': user.role || ""
          }
        }).then(async res => {
          if (res.status === 401) {
            localStorage.removeItem('token');
            sessionStorage.removeItem('token');
            throw new Error('No autorizado');
          }
          if (!res.ok) throw new Error(`Error cargando guías: ${res.status}`);
          return res.json();
        })
      ]));

      // Procesar respuesta de bonos
      if (bonosRes.total_disponible !== undefined) {
        setBonosDisponibles(bonosRes.total_disponible);
        setDetallesBonos(bonosRes.bonos || []);
      }

      // Procesar respuesta de guías
      if (guiasRes.error) {
        throw new Error(guiasRes.error);
      }

      const guiasArray = guiasRes.guias || [];
      if (!Array.isArray(guiasArray)) {
        throw new Error('Formato de respuesta inválido del servidor');
      }

      // ✅ MAPEO CORRECTO DE DATOS
      const pagosFormateados = guiasArray.map((p: any, i: number) => ({
        id: i + 1,
        tracking: p.tracking || `GU${String(i + 1).padStart(6, '0')}`,
        conductor: p.conductor || user.nombre || "Conductor",
        empresa: p.empresa || "XCargo",
        valor: Number(p.valor) || 0,
        estado: p.estado || "pendiente",
        novedad: p.novedad,
        liquidacion_id: p.liquidacion_id,
        fecha_entrega: p.fecha_entrega,
        carrier: p.carrier,
        ciudad: p.ciudad,
        departamento: p.departamento,
        pago_referencia: p.pago_referencia
      }));

      setPagos(pagosFormateados);
      console.log('✅ Datos cargados correctamente:', pagosFormateados.length, 'guías');

    } catch (err) {
      console.error("❌ Error cargando datos:", err);
      const errorMessage = err instanceof Error ? err.message : "Error cargando los datos";
      
      if (errorMessage.includes('No autorizado')) {
        navigate('/login');
        return;
      }

      setError(errorMessage);
      setPagos([]);
    }
  };

  // Cargar datos cuando el usuario esté disponible
  useEffect(() => {
    cargarDatos();
    // Si es necesario, agregar dependencias como [user, authLoading] para controlar mejor cuándo recargar
  }, []);

  // Mostrar en cada render
  console.log('[PagosPendientes] Renderizando componente, token actual:', localStorage.getItem('token'));

  // ✅ FUNCIÓN DE DEBUG
  const verificarDatosConductor = async () => {
    try {
      const token = getToken();
      const res = await fetch("http://127.0.0.1:8000/guias/verificar-datos-conductor", {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      const data = await res.json();
      console.log('🔍 Verificación de datos del conductor:', data);
      
      if (data.error) {
        alert(`Error en verificación: ${data.error}`);
      } else {
        const stats = data.estadisticas_guias_liquidacion;
        alert(`Verificación exitosa:
        - Employee ID: ${data.employee_id}
        - Email: ${data.email_consultado}
        - Total guías: ${stats?.total_guias || 0}
        - Disponibles: ${stats?.disponibles || 0}
        - Valor disponible: $${stats?.valor_disponible?.toLocaleString() || 0}`);
      }
    } catch (error) {
      console.error('Error verificando datos:', error);
      alert('Error verificando datos del conductor');
    }
  };

  // ✅ FUNCIÓN DE SINCRONIZACIÓN (solo para admin)
  const sincronizarGuias = async () => {
    try {
      const token = getToken();
      const res = await fetch("http://127.0.0.1:8000/guias/sincronizar-guias-desde-cod", {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      const data = await res.json();
      console.log('🔄 Resultado de sincronización:', data);
      
      if (data.mensaje) {
        alert(`${data.mensaje}\nNuevas guías: ${data.nuevas_guias || 0}`);
        // Recargar datos después de sincronización
        window.location.reload();
      } else {
        alert(`Error: ${data.detail || 'Error desconocido'}`);
      }
    } catch (error) {
      console.error('Error sincronizando:', error);
      alert('Error en la sincronización');
    }
  };

  // Resto de funciones sin cambios
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

  // ✅ FUNCIÓN HANDLEPAGAR MEJORADA
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
        liquidacion_id: p.liquidacion_id || `LIQ_${p.tracking}`,
        estado_actual: p.estado,
        conductor: p.conductor,
        fecha_entrega: p.fecha_entrega,
        carrier: p.carrier,
        ciudad: p.ciudad,
        departamento: p.departamento
      }));

    console.log('💳 Iniciando flujo de pago con guías:', guiasSeleccionadas);

    navigate("/conductor/pago", {
      state: {
        guias: guiasSeleccionadas,
        total: totalSeleccionado,
        bonos: {
          disponible: bonosDisponibles,
          detalles: detallesBonos
        },
        conductor: {
          nombre: user?.nombre,
          email: user?.email
          // employee_id se obtendrá en el backend usando el email
        }
      },
    });
  };

  const handleRefresh = () => {
    withLoading(() => Promise.resolve());
    setError("");
    window.location.reload();
  };

  // Agregar función para manejar la recarga de guías rechazadas
  const volverACargarGuías = (referencia_pago: string) => {
    alert(`Funcionalidad para reintentar pago con referencia: ${referencia_pago} (por implementar)`);
    // Aquí puedes implementar la lógica real para recargar guías si aplica
  };

  // Mostrar loading
  if (authLoading || isLoading) {
    return (
      <LoadingContainer
        type="logo"
        isLoading={authLoading || isLoading}
        message="Cargando tus pagos pendientes..."
        customLogo={LogoXcargo}
        size="large"
      />
    );
  }

  // Mostrar error si existe
  if (error && pagos.length === 0) {
    return (
      <div className="pagos-pendientes">
        <div className="page-header">
          <h1 className="page-title">💰 Pagos Pendientes</h1>
          <p className="page-subtitle">Hola {user?.nombre}, gestiona tus pagos pendientes</p>
        </div>

        <div className="empty-state">
          <div className="empty-icon">⚠️</div>
          <h3>Error cargando datos</h3>
          <p>{error}</p>
          <div className="empty-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn-primary" onClick={handleRefresh}>
              🔄 Reintentar
            </button>
            {user?.role === 'admin' && (
              <button className="btn-secondary" onClick={sincronizarGuias}>
                🔄 Sincronizar Datos
              </button>
            )}
            <button className="btn-ghost" onClick={verificarDatosConductor}>
              🔍 Verificar Datos
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Sin guías disponibles
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
          <div className="empty-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn-primary" onClick={handleRefresh}>
              🔄 Actualizar
            </button>
            {user?.role === 'admin' && (
              <button className="btn-secondary" onClick={sincronizarGuias}>
                🔄 Sincronizar desde COD
              </button>
            )}
            <button className="btn-ghost" onClick={verificarDatosConductor}>
              🔍 Verificar Datos
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <LoadingContainer
      type="logo"
      isLoading={authLoading || isLoading}
      message="Cargando tus pagos pendientes..."
      customLogo={LogoXcargo}
      size="large"
    >
      <div className="pagos-pendientes">
        {/* Header mejorado */}
        <div className="page-header">
          <h1 className="page-title">💰 Pagos Pendientes</h1>
          <p className="page-subtitle">Hola {user?.nombre}, gestiona tus Pagos pendientes</p>
          <div className="header-actions" style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
            <button 
              className="btn-ghost refresh-btn" 
              onClick={handleRefresh}
              disabled={isLoading}
            >
              🔄 Actualizar
            </button>
            {user?.role === 'admin' && (
              <button 
                className="btn-ghost" 
                onClick={sincronizarGuias} 
                style={{ fontSize: '12px' }}
                disabled={isLoading}
              >
                🔄 Sync
              </button>
            )}
          </div>
        </div>

        {/* Mostrar advertencia si hay error pero hay datos */}
        {error && pagos.length > 0 && (
          <div className="warning-banner">
            <span>⚠️ {error}</span>
            <button 
              className="btn-ghost" 
              onClick={handleRefresh}
              disabled={isLoading}
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Información de bonos */}
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
              <span className="resumen-valor">${totalGlobal.toLocaleString()}</span>
            </div>
            <div className="resumen-info">
              <span className="resumen-label">Bono Disponible:</span>
              <span className="resumen-valor" style={{ 
                color: bonosDisponibles > 0 ? "#059669" : "#6b7280" 
              }}>
                ${bonosDisponibles.toLocaleString()}
              </span>
            </div>
            <div className="resumen-stats">
              <span>{pagos.length} guías</span>
              <span>•</span>
              <span>{seleccionados.length} seleccionadas</span>
              {bonosDisponibles > 0 && (
                <>
                  <span>•</span>
                  <span style={{ color: "#059669" }}>{detallesBonos.length} bonos</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Controles de tabla */}
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
                    {seleccionados.length} seleccionada{seleccionados.length !== 1 ? "s" : ""}
                  </span>
                  <span className="selection-total">${totalSeleccionado.toLocaleString()}</span>
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
                        ${typeof pago.valor === "number" ? pago.valor.toLocaleString() : "0"}
                      </span>
                    </td>
                    <td>
                      <span className={`estado-badge estado-${pago.estado || "disponible"}`}>
                        {pago.estado || "disponible"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {pago.ciudad && (
                          <small style={{ color: '#666', fontSize: '11px' }}>📍 {pago.ciudad}</small>
                        )}
                        {pago.carrier && (
                          <small style={{ color: '#666', fontSize: '11px' }}>🚚 {pago.carrier}</small>
                        )}
                        {pago.novedad && (
                          <span className={pago.novedad ? "novedad-text" : "novedad-empty"}>
                            {pago.novedad || "-"}
                          </span>
                        )}
                        {/* Mostrar alerta de rechazo si aplica */}
                        {pago.estado === "rechazado" && (
                          <div className="pago-rechazado-alerta">
                            <strong>❌ Este pago fue rechazado.</strong>
                            <p>Motivo: {pago.novedad || "Sin observación registrada."}</p>
                            <button
                              className="btn-reintentar-pago"
                              onClick={() => volverACargarGuías(pago.pago_referencia ?? "")}
                            >
                              🔄 Reintentar con nuevas guías
                            </button>
                          </div>
                        )}
                      </div>
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
                <span>Página {currentPage} de {totalPaginas}</span>
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

        {/* Botón flotante de pago */}
        {seleccionados.length > 0 && (
          <div className="floating-action">
            <div className="action-card">
              <div className="action-content">
                <div className="action-summary">
                  <span className="action-count">
                    {seleccionados.length} guía{seleccionados.length !== 1 ? "s" : ""} seleccionada{seleccionados.length !== 1 ? "s" : ""}
                  </span>
                  <span className="action-total">Total: ${Math.max(0, totalSeleccionado - bonosDisponibles).toLocaleString()}</span>
                </div>
                <button className="btn-primary action-button" onClick={handlePagar}>
                  💳 Procesar Pago
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LoadingContainer>
  );
}