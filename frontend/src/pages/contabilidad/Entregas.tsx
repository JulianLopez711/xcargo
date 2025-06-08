// frontend/src/pages/contabilidad/Entregas.tsx
import { useState, useEffect } from "react";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "../../components/LoadingSpinner";
import "../../styles/contabilidad/Entregas.css";

// ✅ INTERFACES CORREGIDAS Y SIMPLIFICADAS
interface EntregaConsolidada {
  tracking: string;
  fecha: string;
  tipo: string;
  cliente: string;
  valor: number;
  estado_conciliacion: string;
  referencia_pago: string;
  correo_conductor: string;
  entidad_pago: string;
  fecha_conciliacion?: string;
  
  // Campos de conciliación
  valor_banco_conciliado?: number;
  id_banco_asociado?: string;
  observaciones_conciliacion?: string;
  diferencia_valor?: number;
  integridad_ok?: boolean;
  listo_para_liquidar?: boolean;
  confianza_match?: number;
  calidad_conciliacion?: string;
}

interface EstadisticasEntregas {
  total_entregas: number;
  valor_total: number;
  clientes: Record<string, { cantidad: number; valor: number }>;
}

interface DashboardConciliacion {
  estados_flujo: Array<{
    estado_flujo: string;
    cantidad: number;
    valor_total: number;
    dias_promedio_proceso: number;
    casos_lentos: number;
    clientes_afectados: number;
  }>;
  eficiencia: {
    porcentaje_conciliado: number;
    cuello_botella_cantidad: number;
    dias_promedio_conciliacion: number;
  };
  alertas: {
    total_casos_lentos: number;
    porcentaje_casos_lentos: number;
  };
}

interface ResumenLiquidacion {
  cliente: string;
  total_entregas: number;
  valor_total: number;
  entregas_conciliadas: number;
  porcentaje_conciliadas: number;
  valor_promedio_entrega: number;
}

interface ValidacionIntegridad {
  cliente: string;
  validaciones: Array<{
    resultado: string;
    cantidad: number;
    valor_total: number;
    diferencia_promedio: number;
    descripcion: string;
  }>;
  resumen: {
    listas_liquidar: number;
    con_problemas: number;
    valor_listo: number;
    valor_bloqueado: number;
  };
  listo_para_procesar: boolean;
  recomendacion: string;
}

interface ApiResponse {
  entregas: EntregaConsolidada[];
  total_entregas: number;
  valor_total: number;
  estadisticas?: EstadisticasEntregas;
  clientes_agrupados?: Record<string, { cantidad: number; valor: number }>;
  estadisticas_calidad?: {
    exactas: number;
    aproximadas: number;
    manuales: number;
    sin_conciliar: number;
  };
  calidad_datos?: {
    porcentaje_calidad: number;
    confianza_promedio: number;
    alertas_criticas: number;
  };
  alertas_integridad?: Array<{
    referencia: string;
    tipo: string;
    severidad: string;
  }>;
  mensaje?: string;
}

export default function LiquidacionesClientes() {
  const [liquidaciones, setLiquidaciones] = useState<EntregaConsolidada[]>([]);
  const [estadisticas, setEstadisticas] = useState<EstadisticasEntregas | null>(null);
  const [resumenClientes, setResumenClientes] = useState<ResumenLiquidacion[]>([]);
  const [dashboardConciliacion, setDashboardConciliacion] = useState<any>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [clienteFiltro, setClienteFiltro] = useState("");
  const [soloConciliadas, setSoloConciliadas] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const navigate = useNavigate();

  // ✅ FUNCIÓN PARA MANEJAR ERRORES DE MANERA ROBUSTA
  const manejarError = (error: any, contexto: string) => {
    console.error(`Error en ${contexto}:`, error);
    
    if (error.message?.includes('404')) {
      setMensaje(`❌ Endpoint no encontrado en ${contexto}. Verificar configuración del backend.`);
    } else if (error.message?.includes('Respuesta no es JSON')) {
      setMensaje(`❌ El servidor devolvió HTML en lugar de JSON. Verificar que el backend esté ejecutándose correctamente.`);
    } else {
      setMensaje(`❌ Error en ${contexto}: ${error.message}`);
    }
  };

  // ✅ FUNCIÓN PARA CARGAR DASHBOARD DE CONCILIACIÓN (definida correctamente)
  const cargarDashboardConciliacion = async () => {
    try {
      const res = await fetch("http://192.168.0.38:8000/entregas/dashboard-conciliacion");
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setDashboardConciliacion(data[0]);
      } else {
        setDashboardConciliacion(null);
      }
    } catch (err) {
      setDashboardConciliacion(null);
      setDashboardError("Error al cargar el dashboard");
    }
  };

  // ✅ FUNCIÓN PRINCIPAL PARA CARGAR ENTREGAS (CORREGIDA)
  const cargarEntregas = async () => {
    setCargando(true);
    setMensaje("");
    
    try {
      const params = new URLSearchParams();
      if (clienteFiltro) params.append("cliente", clienteFiltro);
      if (fechaDesde) params.append("desde", fechaDesde);
      if (fechaHasta) params.append("hasta", fechaHasta);
      params.append("solo_conciliadas", soloConciliadas.toString());

      const res = await fetch(`http://192.168.0.38:8000/entregas/entregas-consolidadas?${params.toString()}`);
      
      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Respuesta no es JSON");
      }
      
      const data: ApiResponse = await res.json();
      
      if (data.entregas && Array.isArray(data.entregas)) {
        setLiquidaciones(data.entregas);
        
        // ✅ MOSTRAR ESTADÍSTICAS DE CALIDAD SI ESTÁN DISPONIBLES
        if (data.calidad_datos && data.estadisticas_calidad) {
          const calidad = data.calidad_datos;
          const stats = data.estadisticas_calidad;
          
          setMensaje(`✅ ${data.entregas.length} entregas cargadas
📊 Calidad: ${calidad.porcentaje_calidad.toFixed(1)}% | Confianza: ${calidad.confianza_promedio.toFixed(0)}%
🎯 Exactas: ${stats.exactas} | Aproximadas: ${stats.aproximadas} | Manuales: ${stats.manuales}
${calidad.alertas_criticas > 0 ? `⚠️ ${calidad.alertas_criticas} alertas críticas` : '✅ Sin alertas críticas'}`);
        } else {
          setMensaje(`✅ Cargadas ${data.entregas.length} entregas exitosamente`);
        }
        
        // ✅ ESTADÍSTICAS
        if (data.estadisticas) {
          setEstadisticas(data.estadisticas);
        } else {
          setEstadisticas({
            total_entregas: data.total_entregas,
            valor_total: data.valor_total,
            clientes: data.clientes_agrupados || {}
          });
        }
        
        // ✅ MOSTRAR ALERTAS DE INTEGRIDAD SI EXISTEN
        if (data.alertas_integridad && data.alertas_integridad.length > 0) {
          const alertasStr = data.alertas_integridad.slice(0, 3).map((a: any) => 
            `${a.referencia}: ${a.tipo} (${a.severidad})`
          ).join('\n');
          setMensaje(prev => `${prev}\n\n⚠️ Alertas de integridad:\n${alertasStr}${data.alertas_integridad!.length > 3 ? '\n...y más' : ''}`);
        }
      } else {
        throw new Error("Formato de respuesta inválido");
      }
    } catch (err: any) {
      manejarError(err, "cargar entregas");
      setLiquidaciones([]);
      setEstadisticas(null);
    } finally {
      setCargando(false);
    }
  };

  // ✅ FUNCIÓN PARA CARGAR SOLO ENTREGAS LISTAS PARA LIQUIDAR
  const cargarEntregasListas = async () => {
    setCargando(true);
    setMensaje("");
    
    try {
      const params = new URLSearchParams();
      if (clienteFiltro) params.append("cliente", clienteFiltro);
      if (fechaDesde) params.append("desde", fechaDesde);
      if (fechaHasta) params.append("hasta", fechaHasta);
      params.append("incluir_aproximadas", "true");

      const res = await fetch(`http://192.168.0.38:8000/entregas/entregas-listas-liquidar?${params.toString()}`);
      
      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Respuesta no es JSON");
      }
      
      const data: ApiResponse = await res.json();
      
      if (data.entregas && Array.isArray(data.entregas)) {
        setLiquidaciones(data.entregas.map((e: any) => ({
          ...e,
          estado_conciliacion: e.estado_conciliacion || "Conciliado"
        })));
        
        // ✅ MOSTRAR MENSAJE DEL BACKEND SI EXISTE
        if (data.mensaje) {
          setMensaje(data.mensaje);
        } else {
          setMensaje(`✅ ${data.entregas.length} entregas listas para liquidar`);
        }
        
        // ✅ ESTADÍSTICAS
        setEstadisticas({
          total_entregas: data.total_entregas,
          valor_total: data.valor_total,
          clientes: data.clientes_agrupados || {}
        });
        
        // ✅ MOSTRAR CALIDAD DE DATOS SI ESTÁ DISPONIBLE
        if (data.calidad_datos) {
          const calidad = data.calidad_datos;
          setMensaje(prev => `${prev}\n📊 Calidad: ${calidad.porcentaje_calidad.toFixed(1)}% | Confianza: ${calidad.confianza_promedio.toFixed(0)}%`);
        }
      }
    } catch (err: any) {
      manejarError(err, "cargar entregas listas");
      setLiquidaciones([]);
    } finally {
      setCargando(false);
    }
  };

  // ✅ FUNCIÓN PARA CARGAR RESUMEN DE CLIENTES
  const cargarResumenClientes = async () => {
    try {
      const res = await fetch("http://192.168.0.38:8000/entregas/resumen-liquidaciones");
      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Respuesta no es JSON");
      }
      
      const data = await res.json();
      setResumenClientes(data);
    } catch (err: any) {
      console.warn("Resumen de clientes no disponible:", err.message);
      // No mostrar error para resumen opcional
    }
  };

  // ✅ FUNCIÓN PARA VALIDAR INTEGRIDAD ANTES DE LIQUIDAR
  const validarIntegridadCliente = async (cliente: string): Promise<boolean> => {
    try {
      const res = await fetch(`http://192.168.0.38:8000/entregas/validar-integridad-liquidacion/${encodeURIComponent(cliente)}`);
      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Respuesta no es JSON");
      }
      
      const validacion: ValidacionIntegridad = await res.json();
      
      // Mostrar resultado de validación
      if (validacion.listo_para_procesar) {
        setMensaje(`✅ ${cliente}: ${validacion.resumen.listas_liquidar} entregas listas por ${formatearMoneda(validacion.resumen.valor_listo)}`);
        return true;
      } else {
        setMensaje(`⚠️ ${cliente}: ${validacion.resumen.con_problemas} entregas con problemas. ${validacion.recomendacion}`);
        return false;
      }
    } catch (err: any) {
      console.warn(`Error validando ${cliente}:`, err.message);
      // Si falla la validación, permitir continuar
      return true;
    }
  };

  // ✅ CARGAR DATOS AL MONTAR EL COMPONENTE
  useEffect(() => {
    cargarEntregas();
    cargarResumenClientes();
    cargarDashboardConciliacion();
  }, []);

  // ✅ RECARGAR CUANDO CAMBIEN LOS FILTROS
  useEffect(() => {
    if (fechaDesde || fechaHasta || clienteFiltro || !soloConciliadas) {
      cargarEntregas();
    }
  }, [fechaDesde, fechaHasta, clienteFiltro, soloConciliadas]);

  // ✅ DATOS FILTRADOS (LADO CLIENTE)
  const datosFiltrados = liquidaciones.filter((e) => {
    const desde = !fechaDesde || e.fecha >= fechaDesde;
    const hasta = !fechaHasta || e.fecha <= fechaHasta;
    const cliente = !clienteFiltro || e.cliente === clienteFiltro;
    return desde && hasta && cliente;
  });

  // ✅ FUNCIÓN PARA IR A PAGO CON VALIDACIÓN
  const irAPagoConValidacion = async () => {
    if (datosFiltrados.length === 0) {
      alert("No hay registros filtrados para pagar.");
      return;
    }

    setCargando(true);
    
    try {
      // ✅ VALIDAR INTEGRIDAD SI ES UN CLIENTE ESPECÍFICO
      if (clienteFiltro) {
        const esValido = await validarIntegridadCliente(clienteFiltro);
        if (!esValido) {
          setCargando(false);
          return;
        }
      }
      
      // ✅ FILTRAR SOLO ENTREGAS REALMENTE LISTAS
      const entregasListas = datosFiltrados.filter((e: EntregaConsolidada) => 
        e.listo_para_liquidar !== false && 
        e.integridad_ok !== false &&
        (e.estado_conciliacion.includes("Conciliado") || e.estado_conciliacion.includes("conciliado"))
      );
      
      if (entregasListas.length === 0) {
        alert("No hay entregas conciliadas y listas para liquidar en la selección actual.");
        setCargando(false);
        return;
      }
      
      if (entregasListas.length !== datosFiltrados.length) {
        const diferencia = datosFiltrados.length - entregasListas.length;
        const confirmar = window.confirm(
          `Se encontraron ${diferencia} entregas que no están completamente listas para liquidar. 
          ¿Proceder solo con las ${entregasListas.length} entregas válidas?`
        );
        
        if (!confirmar) {
          setCargando(false);
          return;
        }
      }

      const total = entregasListas.reduce((sum, e) => sum + e.valor, 0);
      navigate("/contabilidad/pago-entregas", {
        state: {
          entregas: entregasListas,
          total,
          cliente: clienteFiltro || "Múltiples clientes",
          metadatos: {
            total_filtradas: datosFiltrados.length,
            total_procesables: entregasListas.length,
            fecha_consulta: new Date().toISOString(),
            validacion_integridad: true
          }
        },
      });
      
    } catch (err) {
      manejarError(err, "validación de entregas");
    } finally {
      setCargando(false);
    }
  };

  // ✅ EXPORTAR A EXCEL
  const exportarExcel = () => {
    if (datosFiltrados.length === 0) {
      alert("No hay datos para exportar");
      return;
    }

    const hoja = datosFiltrados.map((e) => ({
      Tracking: e.tracking,
      Fecha: e.fecha,
      Tipo: e.tipo,
      Cliente: e.cliente,
      Valor: e.valor,
      Estado: e.estado_conciliacion,
      "Ref. Pago": e.referencia_pago,
      Conductor: e.correo_conductor,
      "Entidad Pago": e.entidad_pago,
      "Fecha Conciliación": e.fecha_conciliacion || "N/A",
      "Valor Banco": e.valor_banco_conciliado || "N/A",
      "Diferencia": e.diferencia_valor || 0,
      "Calidad": e.calidad_conciliacion || "N/A"
    }));

    const ws = XLSX.utils.json_to_sheet(hoja);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Liquidaciones");
    
    // Configurar anchos de columna
    const colWidths = [
      { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 10 }, { wch: 12 },
      { wch: 12 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 15 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }
    ];
    ws['!cols'] = colWidths;

    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    const fecha = new Date().toISOString().split("T")[0];
    saveAs(blob, `liquidaciones-${fecha}.xlsx`);
  };

  // ✅ FUNCIONES DE UTILIDAD
  const formatearFecha = (fecha: string) => {
    return new Date(fecha).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  };

  const formatearMoneda = (valor: number) => {
    return valor.toLocaleString('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  // ✅ FUNCIÓN PARA OBTENER COLOR DE ESTADO
  const getEstadoColor = (estado: string, integridad_ok?: boolean): string => {
    if (integridad_ok === false) {
      return '#f59e0b'; // Amarillo/naranja para advertencia
    }
    
    const colores: { [key: string]: string } = {
      'Conciliado Exacto': '#22c55e',
      'Conciliado Aproximado': '#3b82f6',
      'Conciliado Manual': '#8b5cf6',
      'Aprobado (Pendiente Conciliación)': '#f59e0b',
      'Pagado (Pendiente Aprobación)': '#ef4444',
      'Pendiente': '#6b7280',
    };
    return colores[estado] || '#6b7280';
  };

  // ✅ FUNCIÓN PARA OBTENER ICONO DE ESTADO
  const getEstadoIcono = (estado: string, calidad?: string): string => {
    const iconos: { [key: string]: string } = {
      'Conciliado Exacto': '✅',
      'Conciliado Aproximado': '🔸',
      'Conciliado Manual': '👤',
      'Aprobado (Pendiente Conciliación)': '⏳',
      'Pagado (Pendiente Aprobación)': '📋',
      'Pendiente': '❓',
    };
    
    const icono_base = iconos[estado] || '❓';
    
    if (calidad === 'Excelente') return icono_base + '🌟';
    if (calidad === 'Requiere Revisión') return icono_base + '⚠️';
    
    return icono_base;
  };

  // ✅ COMPONENTE PARA MOSTRAR DETALLES DE CONCILIACIÓN
  const DetallesConciliacion = ({ entrega }: { entrega: EntregaConsolidada }) => {
    const [mostrarDetalles, setMostrarDetalles] = useState(false);
    
    if (!entrega.valor_banco_conciliado) return null;
    
    return (
      <div className="detalles-conciliacion">
        <button 
          className="btn-detalles"
          onClick={() => setMostrarDetalles(!mostrarDetalles)}
          style={{
            background: 'none',
            border: 'none',
            color: '#3b82f6',
            cursor: 'pointer',
            fontSize: '0.8rem'
          }}
        >
          {mostrarDetalles ? '🔽' : '▶️'} Detalles
        </button>
        
        {mostrarDetalles && (
          <div className="detalle-expandido" style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            padding: '0.5rem',
            marginTop: '0.25rem',
            fontSize: '0.75rem'
          }}>
            <div><strong>Banco:</strong> ${entrega.valor_banco_conciliado?.toLocaleString()}</div>
            <div><strong>ID Banco:</strong> {entrega.id_banco_asociado}</div>
            {entrega.diferencia_valor && entrega.diferencia_valor > 1 && (
              <div style={{ color: '#ef4444' }}>
                <strong>Diferencia:</strong> ${entrega.diferencia_valor.toLocaleString()}
              </div>
            )}
            {entrega.confianza_match && (
              <div><strong>Confianza:</strong> {entrega.confianza_match}%</div>
            )}
            {entrega.observaciones_conciliacion && (
              <div><strong>Observaciones:</strong> {entrega.observaciones_conciliacion}</div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ✅ COMPONENTE DASHBOARD DE CONCILIACIÓN
  const DashboardConciliacionComponent = () => {
    const dashboardData = dashboardConciliacion;
    if (!dashboardData || !dashboardData.porcentaje_conciliado) {
      return <div>No hay datos de conciliación disponibles.</div>;
    }

    return (
      <div className="dashboard-conciliacion" style={{
        background: 'white',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        border: '1px solid #e5e7eb'
      }}>
        <h3 className="section-title">📊 Estado del Flujo de Conciliación</h3>
        
        {/* Métricas Principales */}
        <div className="metricas-principales" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div className="metrica-card" style={{
            background: '#f0f9ff',
            border: '1px solid #0ea5e9',
            borderRadius: '8px',
            padding: '1rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#0ea5e9' }}>
              {dashboardConciliacion.eficiencia.porcentaje_conciliado.toFixed(1)}%
            </div>
            <div style={{ fontSize: '0.9rem', color: '#64748b' }}>Conciliación</div>
          </div>
          
          <div className="metrica-card" style={{
            background: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '8px',
            padding: '1rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>
              {dashboardConciliacion.eficiencia.cuello_botella_cantidad}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#64748b' }}>Cuello de Botella</div>
          </div>
          
          <div className="metrica-card" style={{
            background: '#ecfdf5',
            border: '1px solid #22c55e',
            borderRadius: '8px',
            padding: '1rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#22c55e' }}>
              {dashboardConciliacion.eficiencia.dias_promedio_conciliacion.toFixed(1)}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#64748b' }}>Días Promedio</div>
          </div>
          
          {dashboardConciliacion.alertas.total_casos_lentos > 0 && (
            <div className="metrica-card" style={{
              background: '#fef2f2',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              padding: '1rem',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ef4444' }}>
                {dashboardConciliacion.alertas.total_casos_lentos}
              </div>
              <div style={{ fontSize: '0.9rem', color: '#64748b' }}>Casos Lentos</div>
            </div>
          )}
        </div>

        {/* Estados del Flujo */}
        <div className="estados-flujo" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1rem'
        }}>
          {dashboardConciliacion.estados_flujo.map((estado: {
            estado_flujo: string;
            cantidad: number;
            valor_total: number;
            dias_promedio_proceso: number;
            casos_lentos: number;
            clientes_afectados: number;
          }) => (
            <div key={estado.estado_flujo} style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '1rem'
            }}>
              <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                {estado.estado_flujo.replace(/_/g, ' ')}
              </div>
              <div style={{ color: '#64748b', fontSize: '0.9rem' }}>
                {estado.cantidad} entregas • ${estado.valor_total.toLocaleString()}
              </div>
              {estado.casos_lentos > 0 && (
                <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  ⚠️ {estado.casos_lentos} casos lentos
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ✅ CALCULAR TOTALES
  const total = datosFiltrados.reduce((sum, e) => sum + e.valor, 0);
  const clientesUnicos = Array.from(new Set(liquidaciones.map(e => e.cliente))).sort();

  return (
    <div className="entregas-page">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">📦 Liquidaciones por Cliente</h1>
        <p className="page-subtitle">
          Gestión integral de entregas y liquidaciones por cliente
        </p>
      </div>

      {/* Dashboard de Conciliación */}
      <DashboardConciliacionComponent />

      {/* Resumen Ejecutivo */}
      {resumenClientes.length > 0 && (
        <div className="resumen-section">
          <h3 className="section-title">📊 Resumen Ejecutivo</h3>
          <div className="resumen-grid">
            {resumenClientes.map((cliente) => (
              <div key={cliente.cliente} className="resumen-card">
                <h4 className="cliente-name">{cliente.cliente}</h4>
                <div className="resumen-stats">
                  <div className="stat-row">
                    <span className="stat-label">Total entregas:</span>
                    <span className="stat-value">{cliente.total_entregas.toLocaleString()}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Valor total:</span>
                    <span className="stat-value">{formatearMoneda(cliente.valor_total)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Conciliadas:</span>
                    <span className="stat-value highlight">{cliente.porcentaje_conciliadas.toFixed(1)}%</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Promedio:</span>
                    <span className="stat-value">{formatearMoneda(cliente.valor_promedio_entrega)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="filtros-section">
        <h3 className="section-title">🔍 Filtros de Búsqueda</h3>
        <div className="filtros-grid">
          <div className="filtro-group">
            <label className="filtro-label">Cliente:</label>
            <select 
              className="filtro-select"
              value={clienteFiltro} 
              onChange={(e) => setClienteFiltro(e.target.value)}
            >
              <option value="">Todos los clientes</option>
              {clientesUnicos.map(cliente => (
                <option key={cliente} value={cliente}>{cliente}</option>
              ))}
            </select>
          </div>
          
          <div className="filtro-group">
            <label className="filtro-label">Fecha desde:</label>
            <input 
              type="date" 
              className="filtro-input"
              value={fechaDesde} 
              onChange={(e) => setFechaDesde(e.target.value)} 
            />
          </div>

          <div className="filtro-group">
            <label className="filtro-label">Fecha hasta:</label>
            <input 
              type="date" 
              className="filtro-input"
              value={fechaHasta} 
              onChange={(e) => setFechaHasta(e.target.value)} 
            />
          </div>

          <div className="filtro-group">
            <label className="filtro-checkbox">
              <input 
                type="checkbox" 
                checked={soloConciliadas}
                onChange={(e) => setSoloConciliadas(e.target.checked)}
              />
              Solo entregas conciliadas
            </label>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="filtros-acciones">
          <button 
            className="btn btn-primary"
            onClick={cargarEntregas}
            disabled={cargando}
          >
            {cargando ? "Cargando..." : "🔄 Actualizar"}
          </button>

          <button 
            className="btn btn-secondary"
            onClick={cargarEntregasListas}
            disabled={cargando}
          >
            ✅ Solo Listas para Liquidar
          </button>

          <button 
            className="btn btn-success"
            onClick={irAPagoConValidacion}
            disabled={cargando || datosFiltrados.length === 0}
          >
            💰 Proceder al Pago
          </button>

          <button 
            className="btn btn-outline"
            onClick={exportarExcel}
            disabled={datosFiltrados.length === 0}
          >
            📊 Exportar Excel
          </button>
        </div>
      </div>

      {/* Mensajes */}
      {mensaje && (
        <div className={`mensaje ${mensaje.includes('❌') ? 'error' : 'info'}`}>
          <pre>{mensaje}</pre>
        </div>
      )}

      {/* Loading Spinner */}
      {cargando && <LoadingSpinner />}

      {/* Estadísticas Resumen */}
      {estadisticas && (
        <div className="estadisticas-section">
          <h3 className="section-title">📈 Estadísticas</h3>
          <div className="estadisticas-grid">
            <div className="stat-card">
              <div className="stat-number">{estadisticas.total_entregas}</div>
              <div className="stat-label">Total Entregas</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{formatearMoneda(estadisticas.valor_total)}</div>
              <div className="stat-label">Valor Total</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{Object.keys(estadisticas.clientes).length}</div>
              <div className="stat-label">Clientes</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{datosFiltrados.length}</div>
              <div className="stat-label">Filtradas</div>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de Entregas */}
      <div className="tabla-section">
        <h3 className="section-title">
          📋 Entregas 
          {datosFiltrados.length > 0 && (
            <span className="count-badge">({datosFiltrados.length})</span>
          )}
        </h3>

        {datosFiltrados.length === 0 ? (
          <div className="empty-state">
            <p>No hay entregas que coincidan con los filtros seleccionados.</p>
            <button className="btn btn-primary" onClick={cargarEntregas}>
              🔄 Recargar datos
            </button>
          </div>
        ) : (
          <div className="tabla-container">
            <table className="entregas-table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Tracking</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Valor</th>
                  <th>Tipo</th>
                  <th>Conductor</th>
                  <th>Conciliación</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {datosFiltrados.map((entrega, index) => (
                  <tr key={entrega.referencia_pago || index} 
                      className={entrega.listo_para_liquidar ? 'row-ready' : 'row-pending'}>
                    
                    {/* Estado */}
                    <td>
                      <div className="estado-badge" 
                           style={{ 
                             backgroundColor: getEstadoColor(entrega.estado_conciliacion, entrega.integridad_ok),
                             color: 'white',
                             padding: '0.25rem 0.5rem',
                             borderRadius: '4px',
                             fontSize: '0.75rem',
                             textAlign: 'center'
                           }}>
                        {getEstadoIcono(entrega.estado_conciliacion, entrega.calidad_conciliacion)}
                        <div style={{ fontSize: '0.7rem', marginTop: '0.125rem' }}>
                          {entrega.estado_conciliacion}
                        </div>
                      </div>
                    </td>

                    {/* Tracking */}
                    <td className="tracking-cell">
                      <div className="tracking-main">{entrega.tracking}</div>
                      <div className="tracking-ref">{entrega.referencia_pago}</div>
                    </td>

                    {/* Fecha */}
                    <td>
                      <div className="fecha-main">{formatearFecha(entrega.fecha)}</div>
                      {entrega.fecha_conciliacion && (
                        <div className="fecha-conciliacion">
                          Conc: {formatearFecha(entrega.fecha_conciliacion)}
                        </div>
                      )}
                    </td>

                    {/* Cliente */}
                    <td className="cliente-cell">
                      <strong>{entrega.cliente}</strong>
                    </td>

                    {/* Valor */}
                    <td className="valor-cell">
                      <div className="valor-main">{formatearMoneda(entrega.valor)}</div>
                      {entrega.valor_banco_conciliado && entrega.valor_banco_conciliado !== entrega.valor && (
                        <div className="valor-banco">
                          Banco: {formatearMoneda(entrega.valor_banco_conciliado)}
                        </div>
                      )}
                      {entrega.diferencia_valor && entrega.diferencia_valor > 1 && (
                        <div className="diferencia-valor" style={{ color: '#ef4444', fontSize: '0.75rem' }}>
                          Dif: ${entrega.diferencia_valor.toLocaleString()}
                        </div>
                      )}
                    </td>

                    {/* Tipo */}
                    <td>{entrega.tipo}</td>

                    {/* Conductor */}
                    <td className="conductor-cell">
                      <div className="conductor-email">{entrega.correo_conductor}</div>
                      <div className="entidad-pago">{entrega.entidad_pago}</div>
                    </td>

                    {/* Información de Conciliación */}
                    <td className="conciliacion-cell">
                      {entrega.confianza_match && entrega.confianza_match > 0 && (
                        <div className="confianza-badge" 
                             style={{
                               backgroundColor: entrega.confianza_match >= 95 ? '#22c55e' : 
                                               entrega.confianza_match >= 80 ? '#3b82f6' : '#f59e0b',
                               color: 'white',
                               padding: '0.125rem 0.25rem',
                               borderRadius: '4px',
                               fontSize: '0.7rem',
                               display: 'inline-block'
                             }}>
                          {entrega.confianza_match}%
                        </div>
                      )}
                      
                      {entrega.calidad_conciliacion && (
                        <div className="calidad-text" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                          {entrega.calidad_conciliacion}
                        </div>
                      )}
                      
                      {entrega.id_banco_asociado && entrega.id_banco_asociado !== 'N/A' && (
                        <div className="id-banco" style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          ID: {entrega.id_banco_asociado}
                        </div>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="acciones-cell">
                      <DetallesConciliacion entrega={entrega} />
                      
                      {entrega.listo_para_liquidar && (
                        <div className="ready-badge" style={{
                          backgroundColor: '#22c55e',
                          color: 'white',
                          padding: '0.125rem 0.25rem',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          marginTop: '0.25rem',
                          textAlign: 'center'
                        }}>
                          ✅ Listo
                        </div>
                      )}
                      
                      {entrega.integridad_ok === false && (
                        <div className="warning-badge" style={{
                          backgroundColor: '#f59e0b',
                          color: 'white',
                          padding: '0.125rem 0.25rem',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          marginTop: '0.25rem',
                          textAlign: 'center'
                        }}>
                          ⚠️ Revisar
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer con Totales */}
      {datosFiltrados.length > 0 && (
        <div className="footer-totales">
          <div className="totales-info">
            <strong>Total Filtrado: {formatearMoneda(total)}</strong>
            <span className="separator">|</span>
            <span>Entregas: {datosFiltrados.length}</span>
            <span className="separator">|</span>
            <span>Clientes: {new Set(datosFiltrados.map(e => e.cliente)).size}</span>
            {clienteFiltro && (
              <>
                <span className="separator">|</span>
                <span>Cliente: {clienteFiltro}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}