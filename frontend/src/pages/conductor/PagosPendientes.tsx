import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContext";
import CountUp from "react-countup";
import "../../styles/PagosPendientes.css";

interface Factura {
  id: string;
  consecutivo: string;
  conductor: string;
  valor: number;
  empresa: string;
}

export default function PagosPendientes() {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [paginaActual, setPaginaActual] = useState(1);
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);
  const { rol, nombre } = useAuth();
  const navigate = useNavigate();

  const facturasPorPagina = 15;
  const totalPaginas = Math.ceil(facturas.length / facturasPorPagina);
  const inicio = (paginaActual - 1) * facturasPorPagina;
  const fin = inicio + facturasPorPagina;
  const facturasPaginadas = facturas.slice(inicio, fin);

  const totalPendiente = facturas.reduce((acc, f) => acc + f.valor, 0);
  const totalSeleccionado = facturas
    .filter(f => seleccionadas.includes(f.id))
    .reduce((acc, f) => acc + f.valor, 0);

  useEffect(() => {
    const fetchFacturas = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8000/api/guias/pendientes");
        const data = await res.json();

        const formato = data.map((g: any, index: number) => ({
          id: g.tracking_number,
          consecutivo: `${g.tracking_number.slice(-4)} - ${g.Status_Date || "?"}`,
          conductor: g.conductor || "Sin nombre",
          valor: g.Valor || 0,
          empresa: g.empresa || g.carrier || "Desconocida",
        }));

        setFacturas(formato);
      } catch (err) {
        console.error("Error al cargar facturas:", err);
      }
    };

    fetchFacturas();
  }, []);

  const toggleSeleccion = (id: string) => {
    setSeleccionadas(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const enviarAPago = () => {
    if (!rol || rol !== "conductor") {
      navigate("/");
      return;
    }

    const seleccionadasInfo = facturas.filter(f => seleccionadas.includes(f.id));
    sessionStorage.setItem("facturasSeleccionadas", JSON.stringify(seleccionadasInfo));
    navigate("/conductor/formulario-pago");
  };

  return (
    <div className="pagos-pendientes">
      <h2>Facturas Pendientes</h2>

      <div className="resumen-pendiente">
        <div className="card-resumen">
          <h3>Saldo Total Pendiente</h3>
          <p>
            <CountUp end={totalPendiente} prefix="$" separator="," duration={2} />
          </p>
        </div>
      </div>

      <table className="tabla-facturas">
        <thead>
          <tr>
            <th></th>
            <th>Consecutivo</th>
            <th>Conductor</th>
            <th>Valor</th>
            <th>Empresa</th>
          </tr>
        </thead>
        <tbody>
          {facturasPaginadas.map(f => (
            <tr key={f.id}>
              <td>
                <input
                  type="checkbox"
                  checked={seleccionadas.includes(f.id)}
                  onChange={() => toggleSeleccion(f.id)}
                />
              </td>
              <td>{f.consecutivo}</td>
              <td>{f.conductor}</td>
              <td>${f.valor.toLocaleString()}</td>
              <td>{f.empresa}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="paginacion">
        {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(num => (
          <button
            key={num}
            onClick={() => setPaginaActual(num)}
            className={paginaActual === num ? "activo" : ""}
          >
            {num}
          </button>
        ))}
      </div>

      <div className="resumen-seleccion">
        <p>
          Total seleccionado: <strong>${totalSeleccionado.toLocaleString()}</strong>
        </p>
        <button onClick={enviarAPago} disabled={seleccionadas.length === 0}>
          Realizar Pago
        </button>
      </div>
    </div>
  );
}
