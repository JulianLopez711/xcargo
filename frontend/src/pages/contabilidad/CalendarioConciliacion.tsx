import { useEffect, useState } from "react";
import "../../styles/contabilidad/CalendarioConciliacion.css";

interface DiaConciliacion {
  fecha: string; // "2025-05-05"
  soportes: number;
  banco: number;
  diferencia: number;
  guias: number;
  movimientos: number;
  avance: number; // en %
  estado?: 'pendiente' | 'en_proceso' | 'completado' | 'con_diferencias';
}

const diasSemana = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const meses = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

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
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`http://localhost:8000/contabilidad/conciliacion-mensual?mes=${mes}`);
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (Array.isArray(data)) {
        // Asignar estados basado en el avance y diferencias
        const datosConEstado = data.map((dia: DiaConciliacion) => ({
          ...dia,
          estado: determinarEstado(dia)
        }));
        setDatos(datosConEstado);
      } else {
        console.error("Respuesta inesperada:", data);
        setDatos([]);
      }
    } catch (err) {
      console.error("Error al cargar datos del calendario:", err);
      setError(err instanceof Error ? err.message : "Error desconocido");
      setDatos([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Determinar estado del día basado en avance y diferencias
  const determinarEstado = (dia: DiaConciliacion): 'pendiente' | 'en_proceso' | 'completado' | 'con_diferencias' => {
    if (dia.avance === 0) return 'pendiente';
    if (dia.diferencia !== 0 && dia.avance >= 80) return 'con_diferencias';
    if (dia.avance === 100) return 'completado';
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
    const totalDias = datos.length;
    const completados = datos.filter(d => d.estado === 'completado').length;
    const conDiferencias = datos.filter(d => d.estado === 'con_diferencias').length;
    const totalSoportes = datos.reduce((sum, d) => sum + d.soportes, 0);
    const totalBanco = datos.reduce((sum, d) => sum + d.banco, 0);
    const totalDiferencia = datos.reduce((sum, d) => sum + d.diferencia, 0);

    return {
      totalDias,
      completados,
      conDiferencias,
      totalSoportes,
      totalBanco,
      totalDiferencia,
      promedioAvance: totalDias > 0 ? datos.reduce((sum, d) => sum + d.avance, 0) / totalDias : 0
    };
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
      {/* Header con navegación y estadísticas */}
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

        {/* Panel de estadísticas */}
        <div className="estadisticas-panel">
          <div className="estadistica-item">
            <span className="estadistica-label">Días Completados</span>
            <span className="estadistica-valor">{estadisticas.completados}/{estadisticas.totalDias}</span>
          </div>
          <div className="estadistica-item">
            <span className="estadistica-label">Con Diferencias</span>
            <span className="estadistica-valor alerta">{estadisticas.conDiferencias}</span>
          </div>
          <div className="estadistica-item">
            <span className="estadistica-label">Avance Promedio</span>
            <span className="estadistica-valor">{estadisticas.promedioAvance.toFixed(1)}%</span>
          </div>
          <div className="estadistica-item">
            <span className="estadistica-label">Diferencia Total</span>
            <span className={`estadistica-valor ${estadisticas.totalDiferencia !== 0 ? 'alerta' : 'exito'}`}>
              ${estadisticas.totalDiferencia.toLocaleString()}
            </span>
          </div>
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

      {/* Calendario */}
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
                <div className="fecha">{dia.fecha.split("-")[2]}</div>
                <div className="datos-resumen">
                  <div className="dato-principal">
                    <span className="diferencia-valor">
                      {dia.diferencia === 0 ? '✓' : `$${Math.abs(dia.diferencia).toLocaleString()}`}
                    </span>
                  </div>
                  <div className="barra-avance">
                    <div 
                      className="barra-progreso" 
                      style={{ width: `${dia.avance}%` }}
                    ></div>
                  </div>
                  <div className="avance-texto">{dia.avance.toFixed(0)}%</div>
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>

      {/* Modal de detalles */}
      {modalVisible && diaSeleccionado && (
        <div className="modal-overlay" onClick={() => setModalVisible(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Conciliación del {new Date(diaSeleccionado.fecha).toLocaleDateString('es-ES', {
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
                  <span className="detalle-label">Soportes</span>
                  <span className="detalle-valor">${diaSeleccionado.soportes.toLocaleString()}</span>
                </div>
                <div className="detalle-item">
                  <span className="detalle-label">Banco</span>
                  <span className="detalle-valor">${diaSeleccionado.banco.toLocaleString()}</span>
                </div>
                <div className="detalle-item">
                  <span className="detalle-label">Diferencia</span>
                  <span className={`detalle-valor ${diaSeleccionado.diferencia === 0 ? 'exito' : 'alerta'}`}>
                    ${diaSeleccionado.diferencia.toLocaleString()}
                  </span>
                </div>
                <div className="detalle-item">
                  <span className="detalle-label">Guías</span>
                  <span className="detalle-valor">{diaSeleccionado.guias}</span>
                </div>
                <div className="detalle-item">
                  <span className="detalle-label">Movimientos</span>
                  <span className="detalle-valor">{diaSeleccionado.movimientos}</span>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}