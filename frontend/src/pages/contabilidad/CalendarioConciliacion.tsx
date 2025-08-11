import { useEffect, useState } from "react";
import "../../styles/contabilidad/CalendarioConciliacion.css";

interface DiaConciliacion {
  fecha: string; // "2025-05-05"
  plata_banco: number;
  soportes_conciliados: number;
  total_consignaciones_banco: number;
  diferencia: number;
  guias_totales?: number;
  plata_soportes: number;
  guias_pagadas?: number;
  avance: number; // en %
  soportes_mensuales: number;
  valor_soportes_mensuales?: number; // Nuevo campo independiente

  estado?: 'pendiente' | 'en_proceso' | 'completado' | 'con_diferencias';
}

const diasSemana = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const meses = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const API_URL = "http://127.0.0.1:8000"; // Cambia aquí si tu backend está en localhost

export default function CalendarioConciliacion() {
  const [datos, setDatos] = useState<DiaConciliacion[]>([]);
  const [totalesMensuales, setTotalesMensuales] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mesActual, setMesActual] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [diaSeleccionado, setDiaSeleccionado] = useState<DiaConciliacion | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Cargar datos del mes
  const cargarDatosMes = async (mes: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = `${API_URL}/contabilidad/conciliacion-mensual?mes=${mes}`;
      const token = localStorage.getItem("token") || "";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token && { "Authorization": `Bearer ${token}` })
      };
      const response = await fetch(url, {
        headers,
        method: 'GET',
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      // Espera estructura: { totales_mensuales, dias }
      if (data && Array.isArray(data.dias) && data.totales_mensuales) {
        // Procesar días para estado
        const datosConEstado = data.dias.map((dia: DiaConciliacion) => {
          let avanceCalculado = 0;
          if (dia.plata_banco > 0) {
            avanceCalculado = (dia.plata_soportes / dia.plata_banco) * 100;
          }
          const avanceFinal = Math.max(0, Math.min(100, avanceCalculado));
          return {
            ...dia,
            avance: avanceFinal,
            estado: determinarEstado({ ...dia, avance: avanceFinal })
          };
        });
        setDatos(datosConEstado);
        setTotalesMensuales(data.totales_mensuales);
      } else {
        setError("Los datos recibidos no tienen el formato esperado");
        setDatos([]);
        setTotalesMensuales(null);
      }
    } catch (err) {
      let mensajeError = "Error desconocido";
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        mensajeError = "No se pudo conectar con el servidor. Verifique que el backend esté ejecutándose en http://127.0.0.1:8000";
      } else if (err instanceof Error && err.name === 'AbortError') {
        mensajeError = "La consulta tardó demasiado tiempo (más de 30 segundos)";
      } else if (err instanceof Error) {
        mensajeError = err.message;
      }
      setError(mensajeError);
      setDatos([]);
      setTotalesMensuales(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Determinar estado del día basado en avance y diferencias
  const determinarEstado = (dia: DiaConciliacion): 'pendiente' | 'en_proceso' | 'completado' | 'con_diferencias' => {
    if (dia.avance === 0) return 'pendiente';
    if (Math.abs(dia.diferencia) > 500000 && dia.avance >= 50) return 'con_diferencias';
    if (dia.avance === 100 && Math.abs(dia.diferencia) <= 10000) return 'completado';
    return 'en_proceso';
  };

  useEffect(() => {
    cargarDatosMes(mesActual);
  }, [mesActual]);

  // Cambiar mes
  const cambiarMes = (direccion: 'anterior' | 'siguiente') => {
    const [año, mes] = mesActual.split('-').map(Number);
    let nuevoAño = año;
    let nuevoMes = mes;

    if (direccion === 'anterior') {
      nuevoMes--;
      if (nuevoMes < 1) {
        nuevoMes = 12;
        nuevoAño--;
      }
    } else {
      nuevoMes++;
      if (nuevoMes > 12) {
        nuevoMes = 1;
        nuevoAño++;
      }
    }

    setMesActual(`${nuevoAño}-${String(nuevoMes).padStart(2, '0')}`);
  };

  // Generar estructura de calendario
  const generarCalendario = () => {
    const [año, mes] = mesActual.split('-').map(Number);
    const diasDelMes = new Date(año, mes, 0).getDate();
    const primerDia = new Date(año, mes - 1, 1).getDay();
    const offset = primerDia === 0 ? 6 : primerDia - 1;

    const calendario: (DiaConciliacion | null)[] = Array(offset).fill(null);

    for (let i = 1; i <= diasDelMes; i++) {
      const fecha = `${mesActual}-${i.toString().padStart(2, "0")}`;
      const diaData = datos.find((d) => d.fecha === fecha) || null;
      calendario.push(diaData);
    }

    return calendario;
  };


  // Formatear moneda
  const formatearMoneda = (valor: number) => {
    return `$${Math.abs(valor).toLocaleString('es-CO')}`;
  };

  const calendario = generarCalendario();
  const [año, mes] = mesActual.split('-').map(Number);

  // Abrir modal con detalles del día
  const verDetallesDia = (dia: DiaConciliacion) => {
    setDiaSeleccionado(dia);
    setModalVisible(true);
  };

  // Navegación entre días en el modal
  const cambiarDiaDetalle = (direccion: 'anterior' | 'siguiente') => {
    if (!diaSeleccionado) return;
    // Buscar el índice del día actual en el array de datos
    const idxActual = datos.findIndex(d => d.fecha === diaSeleccionado.fecha);
    let nuevoIdx = idxActual;
    if (direccion === 'anterior') {
      nuevoIdx = idxActual > 0 ? idxActual - 1 : idxActual;
    } else {
      nuevoIdx = idxActual < datos.length - 1 ? idxActual + 1 : idxActual;
    }
    if (nuevoIdx !== idxActual && datos[nuevoIdx]) {
      setDiaSeleccionado(datos[nuevoIdx]);
    }
  };

  if (isLoading) {
    return (
      <div className="calendario-container">
        <div className="calendario-loading">
          <div className="spinner"></div>
          <p>Cargando datos de conciliación...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="calendario-container">
        <div className="calendario-error">
          <h3>Error al cargar datos</h3>
          <p>{error}</p>
          <button onClick={() => cargarDatosMes(mesActual)} className="btn-reintentar">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="calendario-container">
      {/* Header estilo reporte con fondo azul */}

      <div className="reporte-header">
        <div className="reporte-titulo">
          <h1>REPORTE CONCILIACIÓN BANCARIA CORTE {meses[mes - 1].toUpperCase()} {año}</h1>
          {totalesMensuales && (
            <div className="saldo-info">
              <div><strong>SALDO PENDIENTE POR CONCILIAR</strong></div>
              <div>{formatearMoneda(totalesMensuales.plata_banco - totalesMensuales.plata_soportes)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Panel de estadísticas estilo reporte */}

      <div className="estadisticas-reporte">
        <div className="estadisticas-panel">
          {totalesMensuales && (
            <>
              <div className="estadistica-item banco">
                <span className="estadistica-label">TOTAL GUIAS {meses[mes - 1].toUpperCase()} </span>
                <span className="estadistica-valor">{totalesMensuales.guias_totales?.toLocaleString()}</span>
              </div>
              <div className="estadistica-item guias">
                <span className="estadistica-label">GUIAS PAGADAS CONCILIADAS {meses[mes - 1].toUpperCase()}</span>
                <span className="estadistica-valor">{totalesMensuales.guias_pagadas?.toLocaleString()}</span>
              </div>
              <div className="estadistica-item movimientos">
                <span className="estadistica-label">AVANCE POR GUIAS {meses[mes - 1].toUpperCase()}</span>
                <span className="estadistica-valor">{totalesMensuales.guias_totales ? ((totalesMensuales.guias_pagadas / totalesMensuales.guias_totales) * 100).toFixed(1) : '0.0'}%</span>
              </div>
              <div className="estadistica-item avance">
                <span className="estadistica-label">TOTAL CONSIGNACIONES BANCO {meses[mes - 1].toUpperCase()}  </span>
                <span className="estadistica-valor">{totalesMensuales.total_consignaciones_banco?.toLocaleString()}</span>
              </div>
              <div className="estadistica-item avance">
                <span className="estadistica-label">CANTIDAD DE SOPORTES APROBADOS {meses[mes - 1].toUpperCase()}</span>
                <span className="estadistica-valor">{totalesMensuales.soportes_mensuales?.toLocaleString()}</span>
              </div>
              <div className="estadistica-item avance">
                <span className="estadistica-label">AVANCE CONSIGNACIONES BANCARIAS {meses[mes - 1].toUpperCase()}</span>
                <span className="estadistica-valor">{totalesMensuales.soportes_mensuales ? ((totalesMensuales.soportes_conciliados / totalesMensuales.total_consignaciones_banco) * 100).toFixed(1) : '0.0'}%</span>
              </div>
              <div className="estadistica-item avance">
                <span className="estadistica-label">VALOR TOTAL CONSIGNACIONES BANCO {meses[mes - 1].toUpperCase()}</span>
                <span className="estadistica-valor">{formatearMoneda(totalesMensuales.plata_banco)}</span>
              </div>
              <div className="estadistica-item avance">
                <span className="estadistica-label">VALOR TOTAL DE SOPORTES APROBADOS</span>
                <span className="estadistica-valor">{formatearMoneda(totalesMensuales.valor_soportes_mensuales)}</span>
              </div>
              <div className="estadistica-item avance">
                <span className="estadistica-label">AVANCE BANCARIO</span>
                <span className="estadistica-valor">{totalesMensuales.plata_banco ? ((totalesMensuales.valor_soportes_mensuales / totalesMensuales.plata_banco) * 100).toFixed(1) : '0.0'}%</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Header con navegación usando estilos existentes */}
      <div className="calendario-header">
        <div className="navegacion-mes">
          <button onClick={() => cambiarMes('anterior')} className="btn-navegacion">
            ◀
          </button>
          <h2 className="titulo-calendario">
            Conciliación Bancaria - {meses[mes - 1]} {año}
          </h2>
          <button onClick={() => cambiarMes('siguiente')} className="btn-navegacion">
            ▶
          </button>
        </div>
      </div>

      {/* Leyenda */}
      <div className="leyenda">
        <div className="leyenda-item">
          <div className="color-muestra pendiente"></div>
          <span>Pendiente</span>
        </div>
        <div className="leyenda-item">
          <div className="color-muestra en-proceso"></div>
          <span>En Proceso</span>
        </div>
        <div className="leyenda-item">
          <div className="color-muestra completado"></div>
          <span>Completado</span>
        </div>
        <div className="leyenda-item">
          <div className="color-muestra con-diferencias"></div>
          <span>Con Diferencias</span>
        </div>
      </div>

      {/* Calendario con celdas mejoradas */}
      <div className="calendario-grid">
        {diasSemana.map((d) => (
          <div key={d} className="encabezado-dia">{d}</div>
        ))}

        {calendario.map((dia, idx) => (
          <div 
            key={idx} 
            className={`celda-dia ${dia ? `lleno ${dia.estado}` : "vacio"}`}
            onClick={() => dia && verDetallesDia(dia)}
            style={{ cursor: dia ? 'pointer' : 'default' }}
          >
            {dia ? (
              <>
                <div className="dia-header">
                  <div className="fecha">{dia.fecha.split("-")[2]}</div>
                  {dia.avance === 100 && Math.abs(dia.diferencia) <= 10000 && (
                    <span className="check-completado">✓</span>
                  )}
                </div>

                <div className="celda-informacion">
                  <div className="info-soportes">
                    SOP: {formatearMoneda(dia.plata_soportes)}
                  </div>
                  <div className="info-banco">
                    BCO: {formatearMoneda(dia.plata_banco)}
                  </div>
                  <div className={`info-diferencia ${dia.diferencia >= 0 ? 'positiva' : 'negativa'}`}>
                   <strong>DIF: {formatearMoneda(dia.diferencia)}</strong> 
                  </div>
                  <div className="info-meta">
                    {dia.soportes_conciliados} sop | {dia.total_consignaciones_banco} mov
                  </div>
                </div>

                <div className="datos-resumen">
                  <div className="barra-avance">
                    <div 
                      className="barra-progreso" 
                      style={{ 
                        width: `${dia.avance}%`,
                        background: dia.estado === 'con_diferencias' ? 
                          'linear-gradient(90deg, #f59e0b, #d97706)' : // Amarillo/naranja para diferencias
                          dia.avance >= 80 ? 
                            'linear-gradient(90deg, #10b981, #059669)' : // Verde para avance alto (bueno)
                          dia.avance >= 50 ? 
                            'linear-gradient(90deg, #f59e0b, #d97706)' : // Amarillo para avance medio
                            'linear-gradient(90deg, #dc2626, #b91c1c)'   // Rojo para avance bajo (malo)
                      }}
                    ></div>
                  </div>
                  <div className="avance-texto">{dia.avance.toFixed(0)}%</div>
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>

      {/* Modal de detalles usando estilos existentes */}
      {modalVisible && diaSeleccionado && (
        <div className="modal-overlay" onClick={() => setModalVisible(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button onClick={() => cambiarDiaDetalle('anterior')} className="btn-navegacion-dia" style={{ fontSize: '1.5rem', marginRight: '1rem' }}>&lt;</button>
              <h3 style={{ flex: 1, textAlign: 'center', margin: 0 }}><strong>Conciliación del {new Date(diaSeleccionado.fecha + 'T00:00:00').toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}</strong></h3>
              <button onClick={() => cambiarDiaDetalle('siguiente')} className="btn-navegacion-dia" style={{ fontSize: '1.5rem', marginLeft: '1rem' }}>&gt;</button>
              <button  onClick={() => setModalVisible(false)} className="btn-cerrar" style={{ marginLeft: '1rem' }}>×</button>
            </div>
            <div className="modal-body">
              <div className="detalle-grid">
                <div className="detalle-item">
                  <span className="detalle-label">VALOR DIARIO DE SOPORTES CONCILIADOS</span>
                  <span className="detalle-valor">{formatearMoneda(diaSeleccionado.plata_soportes)}</span>
                </div>
                <div className="detalle-item">
                  <span className="detalle-label">VALOR EXTRACTO BANCARIO</span>
                  <span className="detalle-valor">{formatearMoneda(diaSeleccionado.plata_banco)}</span>
                </div>
                <div className="detalle-item">
                  <span className="detalle-label">DIFERENCIA</span>
                  <span className={`detalle-valor ${Math.abs(diaSeleccionado.diferencia) <= 10000 ? 'exito' : 'alerta'}`}>
                    {formatearMoneda(diaSeleccionado.diferencia)}
                  </span>
                </div>
                <div className="detalle-item">
                  <span className="detalle-label">TOTAL MOVIMIENTOS BANCARIOS DEL DÍA</span>
                  <span className="detalle-valor">{diaSeleccionado.total_consignaciones_banco.toLocaleString()}</span>
                </div>
                <div className="detalle-item">
                  <span className="detalle-label">AVANCE</span>
                  <span className="detalle-valor">{diaSeleccionado.avance.toFixed(1)}%</span>
                </div>
              </div>

              <div className="estado-badge">
                <span className={`badge ${diaSeleccionado.estado}`}>
                  {diaSeleccionado.estado === 'pendiente' && 'Pendiente'}
                  {diaSeleccionado.estado === 'en_proceso' && 'En Proceso'}
                  {diaSeleccionado.estado === 'completado' && 'Completado'}
                  {diaSeleccionado.estado === 'con_diferencias' && 'Con Diferencias'}
                </span>
              </div>

              {/* Información adicional basada en el estado */}
              {diaSeleccionado.estado === 'con_diferencias' && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fee2e2', borderRadius: '8px', borderLeft: '4px solid #dc2626' }}>
                  <strong>⚠️ Atención:</strong> Este día presenta diferencias significativas que requieren revisión.
                  <br />
                  <small>Diferencia: {formatearMoneda(diaSeleccionado.diferencia)} ({diaSeleccionado.diferencia >= 0 ? 'Favor empresa' : 'Favor banco'})</small>
                </div>
              )}

              {diaSeleccionado.estado === 'completado' && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#d1fae5', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                  <strong>✅ Conciliado:</strong> Este día está completamente conciliado.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}