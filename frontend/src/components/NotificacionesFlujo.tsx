import React, { useState, useEffect } from 'react';
import { Bell, X, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

interface Notificacion {
  id: string;
  tipo: 'success' | 'warning' | 'error' | 'info';
  titulo: string;
  mensaje: string;
  timestamp: Date;
  leida: boolean;
}

export default function NotificacionesFlujo() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [mostrarPanel, setMostrarPanel] = useState(false);
  const [ultimaVerificacion, setUltimaVerificacion] = useState<Date>(new Date());

  const verificarCambiosEstado = async () => {
    try {
      const response = await fetch('/api/entregas/estado-flujo-resumen');
      const contentType = response.headers.get("content-type");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(`Respuesta no es JSON: ${text.slice(0, 100)}`);
      }
      const data = await response.json();
      
      // Lógica para detectar cambios importantes
      const nuevasNotificaciones: Notificacion[] = [];
      
      // Verificar entregas listas para liquidar
      const entregasListas = data.estados_flujo.find((e: any) => e.estado_flujo === 'LISTO_LIQUIDAR');
      if (entregasListas && entregasListas.cantidad > 0) {
        nuevasNotificaciones.push({
          id: `listas_${Date.now()}`,
          tipo: 'success',
          titulo: '✅ Entregas Listas para Liquidar',
          mensaje: `${entregasListas.cantidad} entregas por ${new Intl.NumberFormat('es-CO', {style: 'currency', currency: 'COP'}).format(entregasListas.valor_total)} están listas para liquidar`,
          timestamp: new Date(),
          leida: false
        });
      }
      
      // Verificar alertas críticas
      if (data.resumen.total_alertas > 0) {
        nuevasNotificaciones.push({
          id: `alertas_${Date.now()}`,
          tipo: 'warning',
          titulo: '⚠️ Atención Requerida',
          mensaje: `${data.resumen.total_alertas} situaciones requieren atención inmediata`,
          timestamp: new Date(),
          leida: false
        });
      }
      
      setNotificaciones(prev => [...nuevasNotificaciones, ...prev].slice(0, 10));
      setUltimaVerificacion(new Date());
    } catch (error) {
      console.error('Error verificando cambios de estado:', error);
    }
  };

  useEffect(() => {
    verificarCambiosEstado();
    const interval = setInterval(verificarCambiosEstado, 300000); // Cada 5 minutos
    return () => clearInterval(interval);
  }, []);

  const marcarComoLeida = (id: string) => {
    setNotificaciones(prev => 
      prev.map(n => n.id === id ? {...n, leida: true} : n)
    );
  };

  const eliminarNotificacion = (id: string) => {
    setNotificaciones(prev => prev.filter(n => n.id !== id));
  };

  const notificacionesNoLeidas = notificaciones.filter(n => !n.leida);

  const getIconoTipo = (tipo: Notificacion["tipo"]) => {
    switch (tipo) {
      case 'success': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'error': return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default: return <Clock className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <div className="relative">
      {/* Botón de notificaciones */}
      <button
        onClick={() => setMostrarPanel(!mostrarPanel)}
        className="relative p-2 text-gray-400 hover:text-gray-500 focus:outline-none"
      >
        <Bell className="h-6 w-6" />
        {notificacionesNoLeidas.length > 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {notificacionesNoLeidas.length}
          </span>
        )}
      </button>

      {/* Panel de notificaciones */}
      {mostrarPanel && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="p-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900">Notificaciones</h3>
              <button
                onClick={() => setMostrarPanel(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500">
              Última verificación: {ultimaVerificacion.toLocaleTimeString()}
            </p>
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {notificaciones.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No hay notificaciones
              </div>
            ) : (
              notificaciones.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 border-b border-gray-100 ${
                    !notif.leida ? 'bg-blue-50' : 'bg-white'
                  } hover:bg-gray-50`}
                >
                  <div className="flex items-start space-x-3">
                    {getIconoTipo(notif.tipo)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {notif.titulo}
                      </p>
                      <p className="text-sm text-gray-600">
                        {notif.mensaje}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {notif.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="flex space-x-1">
                      {!notif.leida && (
                        <button
                          onClick={() => marcarComoLeida(notif.id)}
                          className="text-blue-500 hover:text-blue-700 text-xs"
                        >
                          Marcar leída
                        </button>
                      )}
                      <button
                        onClick={() => eliminarNotificacion(notif.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}