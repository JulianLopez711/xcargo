import { useEffect, useState } from "react";
import "../../styles/contabilidad/CalendarioConciliacion.css";

interface DiaConciliacion {
  fecha: string; // "2025-05-05"
  soportes: number;
  banco: number;
  diferencia: number;
  guias: number;
  guias_totales?: number;
  movimientos: number;
  movimientos_soportes?: number; 
  cantidad_soportes?: number; // Nuevos campos
  avance: number; // en %
  estado?: 'pendiente' | 'en_proceso' | 'completado' | 'con_diferencias';
  guias_pagadas?: number; // Nuevos campos
  plata_comprobantes?: number; // Nuevos campos
  plata_banco?: number; // Nuevo campo para plata del banco
}

const diasSemana = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const meses = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const API_URL = "https://api.x-cargo.co"; // Cambia aquí si tu backend está en localhost

export default function CalendarioConciliacion() {
  const [datos, setDatos] = useState<DiaConciliacion[]>([]);
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
    console.log(`🔄 Iniciando carga de datos para mes: ${mes}`);
    setIsLoading(true);
    setError(null);
    
    try {
      const url = `${API_URL}/contabilidad/conciliacion-mensual?mes=${mes}`;
      console.log(`📡 Llamando a: ${url}`);
      
      const token = localStorage.getItem("token") || "";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token && { "Authorization": `Bearer ${token}` })
      };
      
      console.log("📋 Headers:", headers);
      
      const response = await fetch(url, {
        headers,
        method: 'GET',
        // Agregar timeout
        signal: AbortSignal.timeout(30000) // 30 segundos
      });
      
      console.log(`📊 Respuesta recibida:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(data.plata_banco);
      console.log("📦 Datos recibidos:", data);
      console.log("📈 Tipo de datos:", typeof data, "Es array:", Array.isArray(data));
      
      if (Array.isArray(data)) {
        const datosConEstado = data.map((dia: DiaConciliacion) => {
          // Calcular avance correcto: (soportes / banco) * 100
          let avanceCalculado = 0;
          if (dia.banco > 0) {
            avanceCalculado = (dia.soportes / dia.banco) * 100;
          }
          
          // Debug: comparar avance del backend vs calculado
          if (Math.abs(dia.avance - avanceCalculado) > 1) {
            console.warn(`⚠️ Diferencia en avance para ${dia.fecha}:`, {
              avanceBackend: dia.avance,
              avanceCalculado: avanceCalculado.toFixed(1),
              soportes: dia.soportes,
              banco: dia.banco,
              diferencia: dia.diferencia
            });
          }
          
          // Usar el avance calculado correctamente
          const avanceFinal = Math.max(0, Math.min(100, avanceCalculado));
          
          return {
            ...dia,
            avance: avanceFinal,
            estado: determinarEstado({
              ...dia,
              avance: avanceFinal
            })
          };
        });
        console.log(`✅ ${datosConEstado.length} días procesados correctamente`);
        setDatos(datosConEstado);
      } else {
        console.error("❌ Respuesta inesperada - no es array:", data);
        setError("Los datos recibidos no tienen el formato esperado");
        setDatos([]);
      }
    } catch (err) {
      console.error("❌ Error completo:", err);
      
      let mensajeError = "Error desconocido";
      
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        mensajeError = "No se pudo conectar con el servidor. Verifique que el backend esté ejecutándose en https://api.x-cargo.co";
      } else if (err instanceof Error && err.name === 'AbortError') {
        mensajeError = "La consulta tardó demasiado tiempo (más de 30 segundos)";
      } else if (err instanceof Error) {
        mensajeError = err.message;
      }
      
      console.error("💬 Mensaje de error para el usuario:", mensajeError);
      setError(mensajeError);
      setDatos([]);
    } finally {
      console.log("🏁 Finalizando carga de datos");
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

  // Obtener estadísticas del mes
  const obtenerEstadisticas = () => {
    const diasConMovimientos = datos.filter(d => d.movimientos > 0);
    const totalDias = diasConMovimientos.length;
    const completados = datos.filter(d => d.estado === 'completado').length;
    const conDiferencias = datos.filter(d => d.estado === 'con_diferencias').length;
    const totalSoportes = datos.reduce((sum, d) => sum + d.soportes, 0);
    const cantidadSoportes = datos.reduce((sum, d) => sum + (d.cantidad_soportes ?? 0), 0);
    const movimientos_soportes = datos.reduce((sum, d) => sum + (d.movimientos_soportes ?? 0), 0);
    const cantidadGuias = datos.reduce((sum, d) => sum + (d.guias_totales ?? 0), 0);
    const totalBanco = datos.reduce((sum, d) => sum + d.banco, 0);
    const plataBanco = datos.reduce((sum, d) => sum + (d.plata_banco ?? 0), 0);
    const totalDiferencia = datos.reduce((sum, d) => sum + d.diferencia, 0);
    const guiasPagadas = datos.reduce((sum, d) => sum + d.guias, 0);
    const totalMovimientos = datos.reduce((sum, d) => sum + d.movimientos, 0);
    const guias_pagadas = datos.reduce((sum, d) => sum + (d.guias_pagadas ?? 0), 0);
    const plata_comprobantes = datos.reduce((sum, d) => sum + (d.plata_comprobantes ?? 0), 0);
    
    // Calcular recaudo pendiente de conciliación (estados pendiente y en_proceso)
    const recaudoPendienteConciliacion = datos
      .filter(d => d.estado === 'pendiente' || d.estado === 'en_proceso')
      .reduce((sum, d) => sum + d.banco, 0);

    return {
      totalDias,
      completados,
      conDiferencias,
      totalSoportes,
      totalBanco,
      plataBanco,
      totalDiferencia,
      totalMovimientos,
      plata_comprobantes: plata_comprobantes,
      cantidad_soportes: cantidadSoportes,
      movimientos_soportes: movimientos_soportes,
      guiasPagadas: guiasPagadas,
      cantidad_guias: cantidadGuias,
      guias_pagadas: guias_pagadas,
      recaudoPendienteConciliacion,
      promedioAvance: totalDias > 0 ? diasConMovimientos.reduce((sum, d) => sum + d.avance, 0) / totalDias : 0
    };
  };


  
  // Formatear moneda
  const formatearMoneda = (valor: number) => {
    return `$${Math.abs(valor).toLocaleString('es-CO')}`;
  };

  const calendario = generarCalendario();
  const estadisticas = obtenerEstadisticas();
  const [año, mes] = mesActual.split('-').map(Number);

  // Abrir modal con detalles del día
  const verDetallesDia = (dia: DiaConciliacion) => {
    setDiaSeleccionado(dia);
    setModalVisible(true);
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
          {
          <div className="saldo-info">
            <div><strong>SALDO PENDIENTE POR CONCILIAR</strong></div>
            <div>{formatearMoneda(estadisticas.totalBanco - estadisticas.plata_comprobantes)}</div>
          </div>
          }
        </div>
      </div>

      {/* Panel de estadísticas estilo reporte */}
      <div className="estadisticas-reporte">
        <div className="estadisticas-panel">
          <div className="estadistica-item banco">
            <span className="estadistica-label">TOTAL GUIAS {meses[mes - 1].toUpperCase()} </span>
            <span className="estadistica-valor">{estadisticas.cantidad_guias.toLocaleString()}</span>
          </div>
          <div className="estadistica-item guias">
            <span className="estadistica-label">GUIAS PAGADAS CONCILIADAS {meses[mes - 1].toUpperCase()}</span>
            <span className="estadistica-valor">{estadisticas.guias_pagadas.toLocaleString()}</span>
          </div>
          <div className="estadistica-item movimientos">
            <span className="estadistica-label">AVANCE POR GUIAS {meses[mes - 1].toUpperCase()}</span>
            <span className="estadistica-valor">{(estadisticas.guias_pagadas/estadisticas.cantidad_guias * 100).toFixed(1)}%</span>
          </div>
          <div className="estadistica-item avance">
            <span className="estadistica-label">TOTAL CONSIGNACIONES BANCO {meses[mes - 1].toUpperCase()}  </span>
            <span className="estadistica-valor">{estadisticas.totalMovimientos.toLocaleString()}</span>
          </div>
          <div className="estadistica-item avance">
            <span className="estadistica-label">CANTIDAD DE SOPORTES APROBADOS {meses[mes - 1].toUpperCase()}</span>
            <span className="estadistica-valor">{estadisticas.cantidad_soportes.toLocaleString()}</span>
          </div>
          <div className="estadistica-item avance">
            <span className="estadistica-label">AVANCE CONSIGNACIONES BANCARIAS {meses[mes - 1].toUpperCase()}</span>
            <span className="estadistica-valor">{( estadisticas.cantidad_soportes / estadisticas.totalMovimientos * 100).toFixed(1)}%</span>
          </div>

          <div className="estadistica-item avance">
            <span className="estadistica-label">VALOR TOTAL CONSIGNACIONES BANCO {meses[mes - 1].toUpperCase()}</span>
            <span className="estadistica-valor">{formatearMoneda(estadisticas.totalBanco)}</span>
          </div>
          <div className="estadistica-item avance">
            <span className="estadistica-label">VALOR TOTAL DE SOPORTES APROBADOS</span>
            <span className="estadistica-valor">{formatearMoneda(estadisticas.totalSoportes)}</span>
          </div>
          <div className="estadistica-item avance">
            <span className="estadistica-label">AVANCE BANCARIO</span>
            <span className="estadistica-valor">{(estadisticas.plata_comprobantes / estadisticas.totalBanco * 100).toFixed(1)}%</span>
          </div>
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
                    SOP: {formatearMoneda(dia.soportes)}
                  </div>
                  <div className="info-banco">
                    BCO: {formatearMoneda(dia.banco)}
                  </div>
                  <div className={`info-diferencia ${dia.diferencia >= 0 ? 'positiva' : 'negativa'}`}>
                   <strong>DIF: {formatearMoneda(dia.diferencia)}</strong> 
                  </div>
                  <div className="info-meta">
                    {dia.cantidad_soportes} sop | {dia.movimientos} mov
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
            <div className="modal-header">
              <h3>Conciliación del {new Date(diaSeleccionado.fecha + 'T00:00:00').toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}</h3>
              <button onClick={() => setModalVisible(false)} className="btn-cerrar">×</button>
            </div>
            
            <div className="modal-body">
              <div className="detalle-grid">
                <div className="detalle-item">
                  <span className="detalle-label">Valor Soportes</span>
                  <span className="detalle-valor">{formatearMoneda(diaSeleccionado.soportes)}</span>
                </div>
                <div className="detalle-item">
                  <span className="detalle-label">Extracto Banco</span>
                  <span className="detalle-valor">{formatearMoneda(diaSeleccionado.banco)}</span>
                </div>
                <div className="detalle-item">
                  <span className="detalle-label">Diferencia</span>
                  <span className={`detalle-valor ${Math.abs(diaSeleccionado.diferencia) <= 10000 ? 'exito' : 'alerta'}`}>
                    {formatearMoneda(diaSeleccionado.diferencia)}
                  </span>
                </div>
                <div className="detalle-item">
                  <span className="detalle-label">Cantidad Guías</span>
                  <span className="detalle-valor">{diaSeleccionado.guias.toLocaleString()}</span>
                </div>
                <div className="detalle-item">
                  <span className="detalle-label">Movimientos Bancarios</span>
                  <span className="detalle-valor">{diaSeleccionado.movimientos.toLocaleString()}</span>
                </div>
                <div className="detalle-item">
                  <span className="detalle-label">Avance</span>
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