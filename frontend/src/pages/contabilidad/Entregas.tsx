import "../../styles/Entregas.css";

export default function Entregas() {
  return (
    <div className="entregas-page">
      <h2 className="entregas-title">Módulo de Entregas</h2>

      <div className="entregas-filtros">
        <label>
          Buscar guía:
          <input type="text" placeholder="Ej: 0012345" />
        </label>
      </div>

      <div className="entregas-tabla-container">
        <table className="entregas-tabla">
          <thead>
            <tr>
              <th>Guía</th>
              <th>Conductor</th>
              <th>Ciudad</th>
              <th>Fecha</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {/* Aquí irán los datos dinámicos */}
            <tr>
              <td colSpan={5} style={{ textAlign: "center", padding: "1rem" }}>
                No hay entregas registradas.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
