import "../../styles/DashboardContabilidad.css";

export default function DashboardContabilidad() {
  return (
    <div className="dashboard-contabilidad">
      <h2>Panel de Control - Contabilidad</h2>
      <p>Bienvenido, aquí puedes ver un resumen de la actividad financiera reciente.</p>

      <div className="tarjetas-resumen">
        <div className="tarjeta tarjeta-verde">
          <h3>Pagos del día</h3>
          <p>$1.250.000</p>
        </div>

        <div className="tarjeta tarjeta-azul">
          <h3>Entregas realizadas</h3>
          <p>124 entregas</p>
        </div>

        <div className="tarjeta tarjeta-amarilla">
          <h3>Pagos pendientes</h3>
          <p>32 sin conciliar</p>
        </div>

        <div className="tarjeta tarjeta-roja">
          <h3>Saldo por conciliar</h3>
          <p>$530.000</p>
        </div>
      </div>

      <div className="ultimos-movimientos">
        <h3>Últimos pagos registrados</h3>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Conductor</th>
              <th>Valor</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>2025-05-11</td>
              <td>Juan Pérez</td>
              <td>$220.000</td>
              <td>Conciliado</td>
            </tr>
            <tr>
              <td>2025-05-11</td>
              <td>Pedro Gómez</td>
              <td>$180.000</td>
              <td>Pendiente</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
