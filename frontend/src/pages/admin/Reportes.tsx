import "../../styles/admin/Reporte.css";

export default function Reportes() {
  return (
    <div className="reportes-page">
      <h2 className="reportes-title">Módulo de Reportes</h2>

      <div className="reportes-filtros">
        <label>
          Rango de fechas:
          <input type="date" />{" "}
          <span> a </span>
          <input type="date" />
        </label>

        <label>
          Empresa:
          <select>
            <option value="">Todas</option>
            <option value="Empresa A">Empresa A</option>
            <option value="Empresa B">Empresa B</option>
            <option value="Empresa C">Empresa C</option>
          </select>
        </label>
      </div>

      <div className="reportes-tabla-container">
        <table className="reportes-tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Entidad</th>
              <th>Valor</th>
              <th>Referencia</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5} style={{ textAlign: "center", padding: "1rem" }}>
                No hay reportes generados.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
