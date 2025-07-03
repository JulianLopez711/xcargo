import { useState, useEffect } from "react";
import "../../styles/PagosPendientes.css";

interface Guia {
  tracking_number: string;
  Ciudad: string;
  Departamento: string;
  Valor: number;
  fecha: string;
  empresa: string;
  conductor: string;
}

export default function GuiasPendientes() {
  const [guias, setGuias] = useState<Guia[]>([]);
  const [filtro, setFiltro] = useState("");
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);

  useEffect(() => {
    fetch("https://api.x-cargo.co/api/operador/guias-pendientes")
      .then(res => res.json())
      .then(data => setGuias(data))
      .catch(err => console.error("Error al cargar guías:", err));
  }, []);

  const filtradas = guias.filter(g =>
    g.conductor.toLowerCase().includes(filtro.toLowerCase()) ||
    g.empresa.toLowerCase().includes(filtro.toLowerCase()) ||
    g.tracking_number.includes(filtro)
  );

  const toggleGuia = (id: string) => {
    setSeleccionadas(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const totalSeleccionado = filtradas
    .filter(g => seleccionadas.includes(g.tracking_number))
    .reduce((acc, g) => acc + g.Valor, 0);

  const iniciarConciliacion = () => {
    alert(`Iniciando conciliación para ${seleccionadas.length} guías por $${totalSeleccionado.toLocaleString()}`);
    // Aquí iría una navegación o backend request
  };

  return (
    <div className="pagos-pendientes">
      <h2>Guías Pendientes por Conciliar</h2>

      <input
        type="text"
        placeholder="Filtrar por guía, empresa o conductor"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        className="filtro-input"
      />

      <table className="tabla-pagos">
        <thead>
          <tr>
            <th></th>
            <th>Guía</th>
            <th>Fecha</th>
            <th>Valor</th>
            <th>Conductor</th>
            <th>Empresa</th>
          </tr>
        </thead>
        <tbody>
          {filtradas.map((g, i) => (
            <tr key={i}>
              <td>
                <input
                  type="checkbox"
                  checked={seleccionadas.includes(g.tracking_number)}
                  onChange={() => toggleGuia(g.tracking_number)}
                />
              </td>
              <td>{g.tracking_number}</td>
              <td>{g.fecha}</td>
              <td>${g.Valor.toLocaleString()}</td>
              <td>{g.conductor}</td>
              <td>{g.empresa}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="resumen-pago">
        <p>
          Total seleccionado: <strong>${totalSeleccionado.toLocaleString()}</strong>
        </p>
        <button onClick={iniciarConciliacion} disabled={seleccionadas.length === 0}>
          Iniciar Conciliación
        </button>
      </div>
    </div>
  );
}
