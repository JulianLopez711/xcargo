// src/components/admin/CrucesTable.tsx
import "../../styles/Cruces.css";

const sampleCruces = [
  {
    id: 1,
    referencia: "MI8158035",
    valorPagado: 22000,
    valorReferencias: 22000,
    estado: "Conciliado",
  },
  {
    id: 2,
    referencia: "CR9347921",
    valorPagado: 18000,
    valorReferencias: 17500,
    estado: "Diferencia",
  },
];

export default function CrucesTable() {
  return (
    <div className="cruces-table-container">
      <table className="cruces-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Referencia</th>
            <th>Valor Pagado</th>
            <th>Valor de Referencias</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {sampleCruces.map((cruce) => (
            <tr key={cruce.id}>
              <td>{cruce.id}</td>
              <td>{cruce.referencia}</td>
              <td>${cruce.valorPagado.toLocaleString()}</td>
              <td>${cruce.valorReferencias.toLocaleString()}</td>
              <td className={cruce.estado === "Conciliado" ? "estado-conciliado" : "estado-error"}>
                {cruce.estado}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
