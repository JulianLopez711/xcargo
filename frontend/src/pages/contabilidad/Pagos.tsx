import "../../styles/Pagos.css";

export default function Pagos() {
  return (
    <div className="pagos-page">
      <h2 className="pagos-title">Módulo de Pagos</h2>

      <div className="pagos-filtros">
        <label>
          Buscar referencia:
          <input type="text" placeholder="Ej: REF123456" />
        </label>
      </div>

      <div className="pagos-tabla-container">
        <table className="pagos-tabla">
          <thead>
            <tr>
              <th>Referencia</th>
              <th>Valor</th>
              <th>Fecha</th>
              <th>Entidad</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {/* Datos dinámicos irán aquí */}
            <tr>
              <td colSpan={5} style={{ textAlign: "center", padding: "1rem" }}>
                No hay pagos registrados.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
