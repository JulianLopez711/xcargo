import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "../../components/LoadingSpinner";
import "../../styles/PagosPendientes.css";

interface Pago {
  id: number;
  guia: string;
  conductor: string;
  empresa: string;
  valor: number;
}

// ... imports
export default function PagosPendientes() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate();
  const itemsPorPagina = 20;

  useEffect(() => {
    fetch("http://localhost:8000/api/operador/guias-pendientes")
      .then((res) => res.json())
      .then((data) => {
        const pagosConId = data.map((p: Omit<Pago, "id">, i: number) => ({ id: i + 1, ...p }));
        setPagos(pagosConId);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Error cargando pagos:", err);
        setIsLoading(false);
      });
  }, []);

  if (isLoading) return <LoadingSpinner />;

  const totalPaginas = Math.ceil(pagos.length / itemsPorPagina);
  const paginatedPagos = pagos.slice(
    (currentPage - 1) * itemsPorPagina,
    currentPage * itemsPorPagina
  );

  const toggleSeleccion = (id: number) => {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const totalSeleccionado = pagos
    .filter((p) => seleccionados.includes(p.id))
    .reduce((acc, curr) => acc + curr.valor, 0);

  const totalGlobal = pagos.reduce((acc, curr) => acc + curr.valor, 0);

  const handlePagar = () => {
    if (seleccionados.length === 0) {
      alert("Debes seleccionar al menos una guía para pagar.");
      return;
    }

    const guiasSeleccionadas = pagos
      .filter((p) => seleccionados.includes(p.id))
      .map((p) => ({ referencia: p.guia, valor: p.valor }));

    navigate("/conductor/pago", {
      state: { guias: guiasSeleccionadas, total: totalSeleccionado },
    });
  };

  return (
    <div className="pagos-pendientes">
      <h1>Pagos Pendientes</h1>
      <div className="resumen-cabecera">
        <p className="resumen-total con-fondo">
          Total pendiente: <strong className="valor-total">${totalGlobal.toLocaleString()}</strong>
        </p>
        <p className="bono-favor">
          Bono a favor: <strong className="bono-valor">$0</strong>
        </p>
      </div>

      <div className="tabla-pagos">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Guía</th>
              <th>Conductor</th>
              <th>Empresa</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {paginatedPagos.map((pago) => (
              <tr key={pago.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={seleccionados.includes(pago.id)}
                    onChange={() => toggleSeleccion(pago.id)}
                  />
                </td>
                <td>{pago.guia}</td>
                <td>{pago.conductor}</td>
                <td>{pago.empresa}</td>
                <td>${pago.valor.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="paginacion">
        <button
          disabled={currentPage === 1}
          onClick={() => setCurrentPage((prev) => prev - 1)}
        >
          ← Anterior
        </button>
        <span>Página {currentPage} de {totalPaginas}</span>
        <button
          disabled={currentPage === totalPaginas}
          onClick={() => setCurrentPage((prev) => prev + 1)}
        >
          Siguiente →
        </button>
      </div>

      <div className="resumen-seleccion">
        Total seleccionado: <strong>${totalSeleccionado.toLocaleString()}</strong>
      </div>

      <button className="boton-pagar" onClick={handlePagar}>
        Pagar
      </button>
    </div>
  );
}
