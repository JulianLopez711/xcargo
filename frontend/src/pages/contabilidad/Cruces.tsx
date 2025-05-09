import "../../styles/Cruces.css";

export default function Cruces() {
  return (
    <div className="cruces-page">
      <h2 className="cruces-title">Módulo de Cruces</h2>

      <div className="cruces-filtros">
        <label>
          Buscar:
          <input type="text" placeholder="Escribe una referencia, guía, etc." />
        </label>
      </div>

      <div className="cruces-tabla-container">
        <table className="cruces-tabla">
          <thead>
            <tr>
              <th>Referencia</th>
              <th>Conductor</th>
              <th>Valor</th>
              <th>Fecha</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {/* Aquí puedes renderizar los datos con map */}
            <tr>
              <td colSpan={5} style={{ textAlign: "center", padding: "1rem" }}>
                No hay datos cargados.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
