// src/components/admin/PagosTable.tsx
import "../../styles/admin/PagosTable.css";

const samplePagos = [
  { id: 1, fecha: "2025-05-01", referencia: "ABC123", valor: 22000, estado: "Conciliado" },
  { id: 2, fecha: "2025-05-02", referencia: "XYZ456", valor: 18000, estado: "Pendiente" },
  { id: 3, fecha: "2025-05-03", referencia: "LMN789", valor: 25000, estado: "Conciliado" },
];

export default function PagosTable() {
  return (
    <div className="pagos-table-container">
      <table className="pagos-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Fecha</th>
            <th>Referencia</th>
            <th>Valor</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {samplePagos.map((pago) => (
            <tr key={pago.id}>
              <td>{pago.id}</td>
              <td>{pago.fecha}</td>
              <td>{pago.referencia}</td>
              <td>${pago.valor.toLocaleString()}</td>
              <td className={pago.estado === "Conciliado" ? "estado-conciliado" : "estado-pendiente"}>
                {pago.estado}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
