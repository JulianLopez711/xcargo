import React, { useState, useEffect } from 'react';
import { Search, Download, CreditCard, Filter } from 'lucide-react';

interface EntregaLista {
  tracking: string;
  referencia_pago: string;
  cliente: string;
  valor: number;
  fecha_pago: string;
  conductor: string;
  entidad: string;
  tipo: string;
  fecha_conciliacion: string;
  estado_conciliacion: string;
}

interface ClienteAgrupado {
  cantidad_entregas: number;
  valor_total: number;
  entregas: EntregaLista[];
}

interface ResponseEntregasListas {
  mensaje: string;
  total_entregas: number;
  valor_total: number;
  entregas: EntregaLista[];
  clientes_agrupados: Record<string, ClienteAgrupado>;
}

export default function EntregasListas() {
  const [datos, setDatos] = useState<ResponseEntregasListas | null>(null);
  const [loading, setLoading] = useState(true);
  const [clienteFiltro, setClienteFiltro] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState<string | null>(null);

  const cargarEntregasListas = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (clienteFiltro) params.append('cliente', clienteFiltro);
      if (fechaDesde) params.append('desde', fechaDesde);
      if (fechaHasta) params.append('hasta', fechaHasta);

      const response = await fetch(`/api/entregas/entregas-listas-liquidar?${params.toString()}`);
      const data = await response.json();
      setDatos(data);
    } catch (error) {
      console.error('Error cargando entregas listas:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarEntregasListas();
  }, [clienteFiltro, fechaDesde, fechaHasta]);

  const formatearMoneda = (valor: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(valor);
  };

  const formatearFecha = (fecha: string) => {
    return new Date(fecha).toLocaleDateString('es-CO');
  };

  const procesarLiquidacion = (cliente: string) => {
    if (!datos) return;
    
    const entregasCliente = datos.clientes_agrupados[cliente];
    if (!entregasCliente) return;

    // Aquí integrarías con tu sistema de pagos
    alert(`Procesando liquidación para ${cliente}:\n` +
          `Entregas: ${entregasCliente.cantidad_entregas}\n` +
          `Total: ${formatearMoneda(entregasCliente.valor_total)}`);
  };

  const exportarExcel = () => {
    if (!datos) return;
    
    // Implementar exportación a Excel
    const csvContent = [
      ['Cliente', 'Tracking', 'Valor', 'Fecha Pago', 'Conductor', 'Estado'],
      ...datos.entregas.map(e => [
        e.cliente,
        e.tracking,
        e.valor,
        e.fecha_pago,
        e.conductor,
        e.estado_conciliacion
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `entregas-listas-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">💰 Entregas Listas para Liquidar</h2>
          <p className="text-gray-600">
            {datos ? `${datos.total_entregas} entregas por ${formatearMoneda(datos.valor_total)}` : 'Cargando...'}
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={exportarExcel}
            disabled={!datos || datos.entregas.length === 0}
            className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </button>
          <button
            onClick={cargarEntregasListas}
            disabled={loading}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
          >
            <Search className="h-4 w-4 mr-2" />
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          <Filter className="h-5 w-5 inline mr-2" />
          Filtros
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cliente
            </label>
            <input
              type="text"
              value={clienteFiltro}
              onChange={(e) => setClienteFiltro(e.target.value)}
              placeholder="Filtrar por cliente..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fecha Desde
            </label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fecha Hasta
            </label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Vista por Cliente */}
      {datos && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Agrupado por Cliente</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(datos.clientes_agrupados).map(([cliente, info]) => (
                <div
                  key={cliente}
                  className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                >
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-medium text-gray-900">{cliente}</h4>
                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                      {info.cantidad_entregas} entregas
                    </span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-2xl font-bold text-green-600">
                      {formatearMoneda(info.valor_total)}
                    </p>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setClienteSeleccionado(cliente)}
                        className="flex-1 bg-gray-100 text-gray-700 px-3 py-2 rounded text-sm hover:bg-gray-200"
                      >
                        Ver Detalle
                      </button>
                      <button
                        onClick={() => procesarLiquidacion(cliente)}
                        className="flex-1 bg-green-500 text-white px-3 py-2 rounded text-sm hover:bg-green-600"
                      >
                        <CreditCard className="h-4 w-4 inline mr-1" />
                        Liquidar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Detalle del cliente seleccionado */}
      {clienteSeleccionado && datos && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">
              Detalle - {clienteSeleccionado}
            </h3>
            <button
              onClick={() => setClienteSeleccionado(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tracking
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha Pago
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Conductor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {datos.clientes_agrupados[clienteSeleccionado].entregas.map((entrega) => (
                  <tr key={entrega.tracking}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {entrega.tracking}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatearMoneda(entrega.valor)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatearFecha(entrega.fecha_pago)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {entrega.conductor}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                        {entrega.estado_conciliacion}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}