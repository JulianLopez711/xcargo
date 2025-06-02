import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../../styles/contabilidad/PagoEntregas.css";

interface Entrega {
  tracking: string;
  fecha: string;
  tipo: string;
  cliente: string;
  valor: number;
  referencia?: string;
}

interface FormularioPago {
  valor_pago: string;
  fecha_pago: string;
  hora_pago: string;
  tipo: string;
  entidad: string;
  referencia: string;
  comprobante: File | null;
}

interface EstadoProceso {
  paso: 'formulario' | 'procesando' | 'completado' | 'error';
  mensaje: string;
  progreso: number;
}

export default function PagoEntregas() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Obtener datos desde la navegación o usar valores por defecto
  const { entregas = [], total = 0 }: { entregas: Entrega[]; total: number } = 
    location.state || { entregas: [], total: 0 };

  const [formulario, setFormulario] = useState<FormularioPago>({
    valor_pago: total.toString(),
    fecha_pago: new Date().toISOString().split('T')[0],
    hora_pago: new Date().toTimeString().slice(0, 5),
    tipo: 'Transferencia',
    entidad: '',
    referencia: `PAY_${Date.now()}`,
    comprobante: null
  });

  // Estados específicos para mejor type safety
  type PasoEstado = 'formulario' | 'procesando' | 'completado' | 'error';

  const [estado, setEstado] = useState<EstadoProceso>({
    paso: 'formulario' as PasoEstado,
    mensaje: '',
    progreso: 0
  });

  const [errores, setErrores] = useState<{[key: string]: string}>({});
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);

  // Verificar si llegamos con datos válidos
  useEffect(() => {
    if (entregas.length === 0) {
      setEstado({
        paso: 'error' as PasoEstado,
        mensaje: 'No se encontraron entregas para procesar',
        progreso: 0
      });
    }
  }, [entregas]);

  const validarFormulario = (): boolean => {
    const nuevosErrores: {[key: string]: string} = {};

    // Validar valor
    const valorNum = parseFloat(formulario.valor_pago.replace(/[,$]/g, ''));
    if (isNaN(valorNum) || valorNum <= 0) {
      nuevosErrores.valor_pago = 'El valor debe ser mayor a cero';
    }

    // Validar fecha
    const fechaPago = new Date(formulario.fecha_pago);
    const hoy = new Date();
    if (fechaPago > hoy) {
      nuevosErrores.fecha_pago = 'La fecha no puede ser futura';
    }

    // Validar hora
    if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(formulario.hora_pago)) {
      nuevosErrores.hora_pago = 'Formato de hora inválido (HH:MM)';
    }

    // Validar campos requeridos
    if (!formulario.entidad.trim()) {
      nuevosErrores.entidad = 'La entidad bancaria es requerida';
    }

    if (!formulario.referencia.trim()) {
      nuevosErrores.referencia = 'La referencia es requerida';
    }

    if (!formulario.comprobante) {
      nuevosErrores.comprobante = 'El comprobante es requerido';
    } else {
      // Validar archivo
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (formulario.comprobante.size > maxSize) {
        nuevosErrores.comprobante = 'El archivo es demasiado grande (máximo 10MB)';
      }

      const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (!tiposPermitidos.includes(formulario.comprobante.type)) {
        nuevosErrores.comprobante = 'Tipo de archivo no permitido (JPG, PNG, WEBP, PDF)';
      }
    }

    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0] || null;
    setFormulario(prev => ({ ...prev, comprobante: archivo }));
    
    // Limpiar error de comprobante si se selecciona un archivo
    if (archivo && errores.comprobante) {
      setErrores(prev => ({ ...prev, comprobante: '' }));
    }
  };

  const handleInputChange = (campo: keyof FormularioPago, valor: string) => {
    setFormulario(prev => ({ ...prev, [campo]: valor }));
    
    // Limpiar error del campo al modificarlo
    if (errores[campo]) {
      setErrores(prev => ({ ...prev, [campo]: '' }));
    }
  };

  const registrarPago = async () => {
    if (!validarFormulario()) {
      return;
    }

    setEstado({
      paso: 'procesando' as PasoEstado,
      mensaje: 'Validando datos y preparando el pago...',
      progreso: 10
    });

    try {
      // Preparar FormData
      const formData = new FormData();
      
      // Obtener correo del usuario
      const usuario = JSON.parse(localStorage.getItem("user") || '{"email":"conductor@sistema.com"}');
      
      formData.append("correo", usuario.email);
      formData.append("valor_pago_str", formulario.valor_pago);
      formData.append("fecha_pago", formulario.fecha_pago);
      formData.append("hora_pago", formulario.hora_pago);
      formData.append("tipo", formulario.tipo);
      formData.append("entidad", formulario.entidad);
      formData.append("referencia", formulario.referencia);
      formData.append("comprobante", formulario.comprobante!);
      
      // Preparar guías en formato JSON
      const guiasData = entregas.map(entrega => ({
        referencia: entrega.referencia || entrega.tracking,
        tracking: entrega.tracking,
        valor: entrega.valor,
        cliente: entrega.cliente
      }));
      
      formData.append("guias", JSON.stringify(guiasData));

      setEstado({
        paso: 'procesando' as PasoEstado,
        mensaje: 'Enviando pago al servidor...',
        progreso: 50
      });

      // Enviar al servidor
      const response = await fetch("http://localhost:8000/pagos/registrar-conductor", {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(60000) // 60 segundos timeout
      });

      setEstado({
        paso: 'procesando' as PasoEstado,
        mensaje: 'Procesando respuesta del servidor...',
        progreso: 80
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Error ${response.status}: ${response.statusText}`);
      }

      const resultado = await response.json();

      setEstado({
        paso: 'completado' as PasoEstado,
        mensaje: `✅ Pago registrado exitosamente. Referencia: ${formulario.referencia}`,
        progreso: 100
      });

      // Preguntar si desea enviar correo de confirmación
      setTimeout(() => {
        const deseaEnviar = window.confirm(
          `Pago registrado correctamente por ${new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP'
          }).format(parseFloat(formulario.valor_pago))} para ${entregas.length} entregas.\n\n¿Deseas enviar confirmación al cliente por correo?`
        );
        
        if (deseaEnviar) {
          enviarCorreoConfirmacion();
        }
      }, 1000);

    } catch (error: any) {
      console.error("Error registrando pago:", error);
      
      let mensajeError = "Error desconocido";
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        mensajeError = "No se pudo conectar al servidor";
      } else if (error.name === 'AbortError') {
        mensajeError = "La operación tardó demasiado tiempo";
      } else {
        mensajeError = error.message;
      }

      setEstado({
        paso: 'error' as PasoEstado,
        mensaje: `❌ Error al registrar el pago: ${mensajeError}`,
        progreso: 0
      });
    }
  };

  const enviarCorreoConfirmacion = async () => {
    if (!formulario.comprobante) {
      alert("No hay comprobante para enviar");
      return;
    }

    setEnviandoCorreo(true);
    
    try {
      const cliente = entregas[0]?.cliente || "Sin cliente";
      const formData = new FormData();
      
      formData.append("cliente", cliente);
      formData.append("total", formulario.valor_pago);
      formData.append("entregas", JSON.stringify(entregas));
      formData.append("comprobante", formulario.comprobante);

      const response = await fetch("http://localhost:8000/enviar-confirmacion-email/", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        alert("📧 Correo de confirmación enviado exitosamente");
      } else {
        throw new Error("Error en el servidor al enviar correo");
      }
    } catch (error: any) {
      console.error("Error enviando correo:", error);
      alert(`❌ Error al enviar correo: ${error.message}`);
    } finally {
      setEnviandoCorreo(false);
    }
  };

  const volverAtras = () => {
    navigate(-1);
  };

  const reiniciarFormulario = () => {
    setEstado({
      paso: 'formulario' as PasoEstado,
      mensaje: '',
      progreso: 0
    });
    setErrores({});
  };

  const formatearMoneda = (valor: number): string => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(valor);
  };

  // Render de estados especiales
  if (estado.paso === 'error' && entregas.length === 0) {
    return (
      <div className="pago-entregas-page error-state">
        <div className="error-container">
          <h2>❌ Error</h2>
          <p>{estado.mensaje}</p>
          <button onClick={volverAtras} className="btn-volver">
            ← Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pago-entregas-page">
      {/* Header */}
      <div className="page-header">
        <button onClick={volverAtras} className="btn-volver">
          ← Volver
        </button>
        <h2 className="page-title">💰 Registrar Pago de Entregas</h2>
        <p className="page-subtitle">
          Registra el comprobante de pago para las entregas seleccionadas
        </p>
      </div>

      {/* Progreso */}
      {estado.paso === 'procesando' && (
        <div className="progreso-container">
          <div className="progreso-bar">
            <div 
              className="progreso-fill" 
              style={{ width: `${estado.progreso}%` }}
            ></div>
          </div>
          <p className="progreso-texto">{estado.mensaje}</p>
        </div>
      )}

      {/* Estado completado */}
      {estado.paso === 'completado' && (
        <div className="completado-container">
          <div className="completado-card">
            <h3>✅ Pago Registrado Exitosamente</h3>
            <p>{estado.mensaje}</p>
            <div className="completado-acciones">
              <button onClick={volverAtras} className="btn-principal">
                🏠 Ir al Dashboard
              </button>
              <button onClick={reiniciarFormulario} className="btn-secundario">
                📝 Registrar Otro Pago
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Estado de error */}
      {estado.paso === 'error' && entregas.length > 0 && (
        <div className="error-container">
          <h3>❌ Error al Procesar el Pago</h3>
          <p>{estado.mensaje}</p>
          <div className="error-acciones">
            <button onClick={reiniciarFormulario} className="btn-reintentar">
              🔄 Reintentar
            </button>
            <button onClick={volverAtras} className="btn-cancelar">
              ← Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Formulario principal */}
      {estado.paso === 'formulario' && (
        <>
          {/* Resumen de entregas */}
          <div className="resumen-entregas">
            <h3 className="resumen-titulo">📦 Entregas a Pagar</h3>
            
            <div className="resumen-stats">
              <div className="stat-item">
                <span className="stat-numero">{entregas.length}</span>
                <span className="stat-label">Entregas</span>
              </div>
              <div className="stat-item">
                <span className="stat-numero">{formatearMoneda(total)}</span>
                <span className="stat-label">Total</span>
              </div>
              <div className="stat-item">
                <span className="stat-numero">{entregas[0]?.cliente || 'Varios'}</span>
                <span className="stat-label">Cliente</span>
              </div>
            </div>

            <div className="entregas-detalle">
              <table className="tabla-entregas">
                <thead>
                  <tr>
                    <th>Tracking</th>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Cliente</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {entregas.slice(0, 5).map((entrega, idx) => (
                    <tr key={idx}>
                      <td className="tracking-cell">{entrega.tracking}</td>
                      <td>{new Date(entrega.fecha).toLocaleDateString('es-ES')}</td>
                      <td>{entrega.tipo}</td>
                      <td>{entrega.cliente}</td>
                      <td className="valor-cell">{formatearMoneda(entrega.valor)}</td>
                    </tr>
                  ))}
                  {entregas.length > 5 && (
                    <tr className="mas-entregas">
                      <td colSpan={5}>
                        ... y {entregas.length - 5} entregas más
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Formulario de pago */}
          <div className="formulario-pago">
            <h3 className="formulario-titulo">💳 Información del Pago</h3>
            
            <div className="formulario-grid">
              <div className="campo-grupo">
                <label className="campo-label">
                  💰 Valor Total del Pago <span className="requerido">*</span>
                </label>
                <input
                  type="text"
                  value={formulario.valor_pago}
                  onChange={(e) => handleInputChange('valor_pago', e.target.value)}
                  placeholder="$0"
                  className={`campo-input ${errores.valor_pago ? 'error' : ''}`}
                />
                {errores.valor_pago && (
                  <span className="campo-error">{errores.valor_pago}</span>
                )}
              </div>

              <div className="campo-grupo">
                <label className="campo-label">
                  📅 Fecha del Pago <span className="requerido">*</span>
                </label>
                <input
                  type="date"
                  value={formulario.fecha_pago}
                  onChange={(e) => handleInputChange('fecha_pago', e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className={`campo-input ${errores.fecha_pago ? 'error' : ''}`}
                />
                {errores.fecha_pago && (
                  <span className="campo-error">{errores.fecha_pago}</span>
                )}
              </div>

              <div className="campo-grupo">
                <label className="campo-label">
                  🕐 Hora del Pago <span className="requerido">*</span>
                </label>
                <input
                  type="time"
                  value={formulario.hora_pago}
                  onChange={(e) => handleInputChange('hora_pago', e.target.value)}
                  className={`campo-input ${errores.hora_pago ? 'error' : ''}`}
                />
                {errores.hora_pago && (
                  <span className="campo-error">{errores.hora_pago}</span>
                )}
              </div>

              <div className="campo-grupo">
                <label className="campo-label">
                  💳 Tipo de Pago <span className="requerido">*</span>
                </label>
                <select
                  value={formulario.tipo}
                  onChange={(e) => handleInputChange('tipo', e.target.value)}
                  className="campo-input"
                >
                  <option value="Transferencia">Transferencia Bancaria</option>
                  <option value="Nequi">Nequi</option>
                  <option value="Daviplata">Daviplata</option>
                  <option value="Bancolombia">Bancolombia (App)</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              <div className="campo-grupo">
                <label className="campo-label">
                  🏦 Entidad Bancaria <span className="requerido">*</span>
                </label>
                <input
                  type="text"
                  value={formulario.entidad}
                  onChange={(e) => handleInputChange('entidad', e.target.value)}
                  placeholder="Ej: Bancolombia, Nequi, Davivienda..."
                  className={`campo-input ${errores.entidad ? 'error' : ''}`}
                />
                {errores.entidad && (
                  <span className="campo-error">{errores.entidad}</span>
                )}
              </div>

              <div className="campo-grupo">
                <label className="campo-label">
                  📝 Referencia del Pago <span className="requerido">*</span>
                </label>
                <input
                  type="text"
                  value={formulario.referencia}
                  onChange={(e) => handleInputChange('referencia', e.target.value)}
                  placeholder="Referencia única del pago"
                  className={`campo-input ${errores.referencia ? 'error' : ''}`}
                />
                {errores.referencia && (
                  <span className="campo-error">{errores.referencia}</span>
                )}
              </div>
            </div>

            {/* Subida de comprobante */}
            <div className="comprobante-seccion">
              <label className="campo-label">
                📎 Comprobante de Pago <span className="requerido">*</span>
              </label>
              <p className="campo-ayuda">
                Sube una imagen (JPG, PNG, WEBP) o PDF del comprobante. Máximo 10MB.
              </p>
              
              <div className="upload-area">
                <input
                  type="file"
                  id="comprobante"
                  onChange={handleFileChange}
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  className="upload-input"
                />
                <label htmlFor="comprobante" className="upload-label">
                  {formulario.comprobante ? (
                    <div className="archivo-seleccionado">
                      <span className="archivo-icono">📄</span>
                      <span className="archivo-nombre">{formulario.comprobante.name}</span>
                      <span className="archivo-tamaño">
                        ({(formulario.comprobante.size / (1024 * 1024)).toFixed(2)}MB)
                      </span>
                    </div>
                  ) : (
                    <div className="upload-placeholder">
                      <span className="upload-icono">📎</span>
                      <span>Haz clic para seleccionar el comprobante</span>
                    </div>
                  )}
                </label>
              </div>
              
              {errores.comprobante && (
                <span className="campo-error">{errores.comprobante}</span>
              )}
            </div>

            {/* Acciones */}
            <div className="formulario-acciones">
              <button 
                onClick={volverAtras} 
                className="btn-cancelar"
                disabled={estado.paso === 'procesando'}
              >
                ← Cancelar
              </button>
              <button 
                onClick={registrarPago} 
                className="btn-registrar"
                disabled={estado.paso === 'procesando'}
              >
                {estado.paso === 'procesando' ? '⏳ Procesando...' : '✅ Registrar Pago'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Indicador de envío de correo */}
      {enviandoCorreo && (
        <div className="correo-overlay">
          <div className="correo-modal">
            <div className="loading-spinner"></div>
            <p>📧 Enviando correo de confirmación...</p>
          </div>
        </div>
      )}
    </div>
  );
}