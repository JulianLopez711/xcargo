import { useEffect, useState } from "react";
import "../../styles/DashboardContabilidad.css";

interface GuiaResumen {
  estado: string;
  guias: number;
  valor: number;
  pendiente: number;
}

interface ClienteResumen {
  cliente: string;
  datos: GuiaResumen[];
}

export default function DashboardContabilidad() {
  const [resumen, setResumen] = useState<ClienteResumen[]>([]);

  useEffect(() => {
    fetch("https://api.x-cargo.co/contabilidad/resumen")
      .then((res) => res.json())
      .then((data) => setResumen(data))
      .catch((err) => console.error("Error cargando resumen:", err));
  }, []);

  const calcularSubtotal = (datos: GuiaResumen[]) =>
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
