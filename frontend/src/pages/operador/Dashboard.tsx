import "../../styles/cliente/DashboardOperador.css";

export default function DashboardOperador() {
  return (
    <div className="dashboard-operador">
      <h2>Panel del Operador</h2>
      <p className="bienvenida">
        Bienvenido, aquí puedes visualizar tus estadísticas generales.
      </p>

      <div className="tarjetas-resumen">
        <div className="tarjeta">
          <h3>Guías Entregadas</h3>
          <p>120</p>
        </div>
        <div className="tarjeta">
          <h3>Pagos Realizados</h3>
          <p>$5,200,000</p>
        </div>
        <div className="tarjeta">
          <h3>Saldo Pendiente</h3>
          <p className="pendiente">$320,000</p>
        </div>
        <div className="tarjeta">
          <h3>Último Pago</h3>
          <p>2025-05-10</p>
        </div>
      </div>
    </div>
  );
}
