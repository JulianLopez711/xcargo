// ✅ VERSIÓN COMPLETA CORREGIDA - PagosPendientes.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContext";
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

export default function PagosPendientes() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string>("");
  const navigate = useNavigate();
  
  const { user, isLoading: authLoading, getToken } = useAuth();

  // Estados para bonos
  const [bonosDisponibles, setBonosDisponibles] = useState<number>(0);
  const [detallesBonos, setDetallesBonos] = useState<any[]>([]);
  const [mostrarDetallesBonos, setMostrarDetallesBonos] = useState(false);

  // ✅ FUNCIÓN MEJORADA: Cargar bonos
  useEffect(() => {
    const cargarBonos = async () => {
      try {
        const token = getToken();
        if (!token) return;

        const response = await fetch("https://api.x-cargo.co/guias/bonos-disponibles", {
          headers: {
            'Authorization': `Bearer ${token}`,
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

    if (user && !authLoading) {
      cargarBonos();
    }
  }, [user, authLoading, getToken]);

  // ✅ FUNCIÓN PRINCIPAL CORREGIDA: Cargar guías pendientes
  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      navigate('/login');
      return;
    }

    const cargarPagos = async () => {
      try {
        setIsLoading(true);
        setError("");

        const token = getToken() || localStorage.getItem('token');
        if (!token) {
          navigate('/login');
          return;
        }
        
        console.log('🔍 Cargando guías pendientes para:', user?.email);
        
        const res = await fetch("https://api.x-cargo.co/guias/pendientes", {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'usuario': user?.email || "",
            'rol': user?.role || "",
          },
        });

        if (res.status === 401) {
          localStorage.removeItem('token');
          sessionStorage.removeItem('token');
          navigate('/login');
          return;
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();
        console.log('📊 Respuesta del backend:', data);

        // ✅ MANEJO DE ERRORES DEL BACKEND
        if (data.error) {
          console.error('❌ Error del backend:', data.error);
          setError(data.error);
          
          if (data.error.includes('Employee_id no encontrado')) {
            setError('No se encontró información del conductor. Contacta al administrador.');
          } else if (data.error.includes('Usuario no autenticado')) {
            navigate('/login');
            return;
          }
          
          setPagos([]);
          return;
        }

        // ✅ VALIDACIÓN DE RESPUESTA
        const guiasArray = data.guias || [];
        if (!Array.isArray(guiasArray)) {
          console.error('❌ Formato de respuesta inválido:', data);
          throw new Error('Formato de respuesta inválido del servidor');
        }

        // ✅ MAPEO CORRECTO DE DATOS
        const pagosConId = guiasArray.map((p: any, i: number) => ({
          id: i + 1,
          tracking: p.tracking || `GU${String(i + 1).padStart(6, '0')}`,
          conductor: p.conductor || user?.nombre || "Conductor",
          empresa: p.empresa || "XCargo",
          valor: Number(p.valor) || 0,
          estado: p.estado || "disponible",
          novedad: p.novedad || "",
          liquidacion_id: p.liquidacion_id || `LIQ_${p.tracking}`,
          // Campos adicionales
          fecha_entrega: p.fecha_entrega,
          carrier: p.carrier,
          ciudad: p.ciudad,
          departamento: p.departamento,
          pago_referencia: p.pago_referencia
        }));

        console.log(`✅ ${pagosConId.length} guías cargadas correctamente`);
        setPagos(pagosConId);

      } catch (err: any) {
        console.error("❌ Error cargando pagos:", err);
        
        // ✅ MANEJO DETALLADO DE ERRORES
        let errorMessage = "Error desconocido";
        
        if (err.message?.includes('Employee_id no encontrado')) {
          errorMessage = "No se encontró información del conductor. Contacta al administrador.";
        } else if (err.message?.includes('network') || err.message?.includes('fetch')) {
          errorMessage = "Error de conexión. Verifica tu internet e intenta nuevamente.";
        } else if (err.message?.includes('HTTP 500')) {
          errorMessage = "Error del servidor. Intenta nuevamente en unos minutos.";
        } else {
          errorMessage = err.message || "Error cargando las guías";
        }
        
        setError(errorMessage);
        
        // Solo mostrar datos de prueba en desarrollo
        // @ts-ignore
        if (typeof process !== "undefined" && process.env && process.env.NODE_ENV === 'development') {
          console.log('📝 Usando datos de prueba en desarrollo...');
          setPagos([
            {
              id: 1,
              tracking: "GU001234",
              conductor: user?.nombre || "Conductor",
              empresa: "XCargo",
              valor: 85000,
              estado: "disponible",
              novedad: "Datos de prueba",
              liquidacion_id: "LIQ_GU001234"
            },
            {
              id: 2,
              tracking: "GU001235",
              conductor: user?.nombre || "Conductor",
              empresa: "XCargo",
              valor: 120000,
              estado: "disponible",
              novedad: "Datos de prueba",
              liquidacion_id: "LIQ_GU001235"
            },
          ]);
        } else {
          setPagos([]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    cargarPagos();
  }, [authLoading, user, navigate, getToken]);

  // ✅ FUNCIÓN DE DEBUG
  const verificarDatosConductor = async () => {
    try {
      const token = getToken();
      const res = await fetch("https://api.x-cargo.co/guias/verificar-datos-conductor", {
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
      const res = await fetch("https://api.x-cargo.co/guias/sincronizar-guias-desde-cod", {
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
    setIsLoading(true);
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
      <div className="loading-container">
        <img src={LogoXcargo} alt="Cargando..." className="loading-logo" />
        <p>{authLoading ? 'Verificando autenticación...' : 'Cargando guías...'}</p>
      </div>
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
    <div className="pagos-pendientes">
      {/* Header mejorado */}
      <div className="page-header">
        <h1 className="page-title">💰 Pagos Pendientes</h1>
        <p className="page-subtitle">Hola {user?.nombre}, gestiona tus Pagos pendientes</p>
        <div className="header-actions" style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
          <button className="btn-ghost refresh-btn" onClick={handleRefresh}>
            🔄 Actualizar
          </button>
          {user?.role === 'admin' && (
            <button className="btn-ghost" onClick={sincronizarGuias} style={{ fontSize: '12px' }}>
              🔄 Sync
            </button>
          )}
          
        </div>
      </div>

      {/* Mostrar advertencia si hay error pero hay datos */}
      {error && pagos.length > 0 && (
        <div className="warning-banner" style={{ 
          background: '#fff3cd', 
          border: '1px solid #ffeaa7', 
          borderRadius: '8px', 
          padding: '12px', 
          margin: '16px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>⚠️ {error}</span>
          <button className="btn-ghost" onClick={handleRefresh}>Reintentar</button>
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
          <div className="resumen-stats">
            <span>{pagos.length} guías</span>
            <span>•</span>
            <span>{seleccionados.length} seleccionadas</span>
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
                <span className="action-total">Total: ${totalSeleccionado.toLocaleString()}</span>
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