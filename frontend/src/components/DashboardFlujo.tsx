import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Clock, DollarSign, Users, RefreshCw } from 'lucide-react';

interface EstadoFlujo {
  estado_flujo: string;
  cantidad: number;
  valor_total: number;
  conductores_involucrados: number;
  alertas_aprobacion_lenta: number;
  alertas_conciliacion_lenta: number;
}

interface ResumenFlujo {
  estados_flujo: EstadoFlujo[];
  resumen: {
    total_pagos: number;
    valor_total_sistema: number;
    total_alertas: number;
  };
  eficiencia: {
    porcentaje_listo_liquidar: number;
    valor_listo_liquidar: number;
    cuellos_botella: number;
  };
}

export default function DashboardFlujo() {
  const [datos, setDatos] = useState<ResumenFlujo | null>(null);
  const [loading, setLoading] = useState(true);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/entregas/estado-flujo-resumen');
      const data = await response.json();
      setDatos(data);
      setUltimaActualizacion(new Date());
    } catch (error) {
      console.error('Error cargando estado del flujo:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
    // Actualizar cada 2 minutos
    const interval = setInterval(cargarDatos, 120000);
    return () => clearInterval(interval);
  }, []);

  const getEstadoColor = (estado: string) => {
    const colores = {
      'LISTO_LIQUIDAR': 'bg-green-100 border-green-500 text-green-800',
      'PENDIENTE_APROBACION': 'bg-yellow-100 border-yellow-500 text-yellow-800',
      'PENDIENTE_CONCILIACION': 'bg-blue-100 border-blue-500 text-blue-800',
      'RECHAZADO': 'bg-red-100 border-red-500 text-red-800',
      'LIQUIDADO': 'bg-gray-100 border-gray-500 text-gray-800'
    };
    return colores[estado as keyof typeof colores] || 'bg-gray-100 border-gray-500 text-gray-800';
  };

  const getEstadoTexto = (estado: string) => {
    const textos = {
      'LISTO_LIQUIDAR': '✅ Listo para Liquidar',
      'PENDIENTE_APROBACION': '⏳ Pendiente Aprobación',
      'PENDIENTE_CONCILIACION': '🔄 Pendiente Conciliación',
      'RECHAZADO': '❌ Rechazado',
      'LIQUIDADO': '💰 Liquidado'
    };
    return textos[estado as keyof typeof textos] || estado;
  };

  const formatearMoneda = (valor: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(valor);
  };

  if (loading && !datos) {
    return (
      <div className="p-8 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">Cargando estado del flujo...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con actualización */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">📊 Estado del Flujo</h2>
          <p className="text-gray-600">Dashboard en tiempo real del sistema de pagos</p>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={cargarDatos}
            disabled={loading}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
          {ultimaActualizacion && (
            <span className="text-sm text-gray-500">
              Última actualización: {ultimaActualizacion.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Métricas principales */}
      {datos && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <DollarSign className="h-8 w-8 text-green-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Listo para Liquidar</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatearMoneda(datos.eficiencia.valor_listo_liquidar)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-blue-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Pagos</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {datos.resumen.total_pagos.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <CheckCircle className="h-8 w-8 text-green-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">% Listo Liquidar</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {datos.eficiencia.porcentaje_listo_liquidar.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <AlertTriangle className={`h-8 w-8 ${datos.resumen.total_alertas > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Alertas</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {datos.resumen.total_alertas}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Estados del flujo */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Distribución por Estado</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {datos.estados_flujo.map((estado) => (
                  <div
                    key={estado.estado_flujo}
                    className={`border-l-4 rounded-lg p-4 ${getEstadoColor(estado.estado_flujo)}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">{getEstadoTexto(estado.estado_flujo)}</h4>
                        <p className="text-2xl font-bold mt-2">{estado.cantidad}</p>
                        <p className="text-sm opacity-75">
                          {formatearMoneda(estado.valor_total)}
                        </p>
                      </div>
                      <div className="text-right text-sm opacity-75">
                        <p>{estado.conductores_involucrados} conductores</p>
                        {(estado.alertas_aprobacion_lenta + estado.alertas_conciliacion_lenta) > 0 && (
                          <p className="text-red-600 font-medium">
                            {estado.alertas_aprobacion_lenta + estado.alertas_conciliacion_lenta} alertas
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Alertas críticas */}
          {datos.resumen.total_alertas > 0 && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-lg">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <h3 className="ml-2 text-lg font-medium text-red-800">
                  Atención Requerida
                </h3>
              </div>
              <p className="mt-2 text-red-700">
                Hay {datos.resumen.total_alertas} situaciones que requieren atención inmediata.
                Revisa los pagos pendientes de aprobación por más de 48h y conciliaciones demoradas.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

