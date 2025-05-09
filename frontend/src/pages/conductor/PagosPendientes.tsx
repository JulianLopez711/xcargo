// src/pages/conductor/PagosPendientes.tsx
import { useState,useEffect } from "react";
import LoadingSpinner from "../../components/LoadingSpinner";
import { useNavigate } from "react-router-dom";
import "../../styles/PagosPendientes.css";

const pagosMock = [
  { id: 1, guia: "G001", conductor: "Juan Pérez", empresa: "XCargo", valor: 22000 },
  { id: 2, guia: "G002", conductor: "Juan Pérez", empresa: "XCargo", valor: 18000 },
  { id: 3, guia: "G003", conductor: "Juan Pérez", empresa: "XCargo", valor: 25000 },
];

export default function PagosPendientes() {
  const [isLoading, setIsLoading] = useState(true);
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsLoading(false); // Simular carga
    }, 1000);
    return () => clearTimeout(timeout);
  }, []);

  if (isLoading) return <LoadingSpinner />;

  const toggleSeleccion = (id: number) => {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };
  

  const totalSeleccionado = pagosMock
    .filter((p) => seleccionados.includes(p.id))
    .reduce((acc, curr) => acc + curr.valor, 0);

  const totalGlobal = pagosMock.reduce((acc, curr) => acc + curr.valor, 0);

  const handlePagar = () => {
    if (seleccionados.length === 0) {
      alert("Debes seleccionar al menos una guía para pagar.");
      return;
    }

    const guiasSeleccionadas = pagosMock
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
    Bono a favor: <strong className="bono-valor">$10.000</strong>
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
            {pagosMock.map((pago) => (
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

      <div className="resumen-seleccion">
        Total seleccionado: <strong>${totalSeleccionado.toLocaleString()}</strong>
      </div>

      <button className="boton-pagar" onClick={handlePagar}>
        Pagar
      </button>
    </div>
  );
}
