import "../../styles/DashboardContabilidad.css";

export default function DashboardContabilidad() {
  const resumen = [
    {
      cliente: "Dropi",
      datos: [
        { estado: "Pendiente", guias: 10, valor: 450000, pendiente: 450000 },
        { estado: "Cancelada", guias: 5, valor: 200000, pendiente: 0 },
      ],
    },
    {
      cliente: "Dafiti",
      datos: [
        { estado: "Pendiente", guias: 7, valor: 300000, pendiente: 150000 },
        { estado: "Cancelada", guias: 8, valor: 380000, pendiente: 0 },
      ],
    },
    {
      cliente: "Tridy",
      datos: [
        { estado: "Pendiente", guias: 6, valor: 220000, pendiente: 220000 },
        { estado: "Cancelada", guias: 4, valor: 150000, pendiente: 0 },
      ],
    },
  ];

  const calcularSubtotal = (datos: any[]) =>
    datos.reduce(
      (acc, d) => {
        acc.guias += d.guias;
        acc.valor += d.valor;
        acc.pendiente += d.pendiente;
        return acc;
      },
      { guias: 0, valor: 0, pendiente: 0 }
    );

  const totales = resumen.flatMap((r) => r.datos).reduce(
    (acc, d) => {
      acc.guias += d.guias;
      acc.valor += d.valor;
      acc.pendiente += d.pendiente;
      return acc;
    },
    { guias: 0, valor: 0, pendiente: 0 }
  );

  return (
    <div className="dashboard-contabilidad">
      <h2 className="dashboard-title">Panel de Control - Contabilidad</h2>
      <p className="dashboard-subtitle">Resumen por cliente y totales</p>

      <div className="tablas-fila">
        {resumen.map((cliente) => {
          const subtotal = calcularSubtotal(cliente.datos);
          return (
            <div className="tabla-cliente mini" key={cliente.cliente}>
              <h3 className="cliente-titulo">{cliente.cliente}</h3>
              <table>
                <thead>
                  <tr>
                    <th>Estado</th>
                    <th>Guías</th>
                    <th>Valor</th>
                    <th>Pendiente</th>
                  </tr>
                </thead>
                <tbody>
                  {cliente.datos.map((fila, idx) => (
                    <tr key={idx}>
                      <td>{fila.estado}</td>
                      <td>{fila.guias}</td>
                      <td>${fila.valor.toLocaleString()}</td>
                      <td>${fila.pendiente.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="fila-total">
                    <td><strong>Total</strong></td>
                    <td><strong>{subtotal.guias}</strong></td>
                    <td><strong>${subtotal.valor.toLocaleString()}</strong></td>
                    <td><strong>${subtotal.pendiente.toLocaleString()}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      <div className="tabla-cliente total-general">
        <h3 className="cliente-titulo">Totales Generales</h3>
        <table>
          <thead>
            <tr>
              <th>Guías</th>
              <th>Valor</th>
              <th>Pendiente</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{totales.guias}</td>
              <td>${totales.valor.toLocaleString()}</td>
              <td>${totales.pendiente.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
