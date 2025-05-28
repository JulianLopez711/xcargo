import { useEffect, useState } from "react";
import "../../styles/contabilidad/CalendarioConciliacion.css";

interface DiaConciliacion {
  fecha: string; // "2025-05-05"
  soportes: number;
  banco: number;
  diferencia: number;
  guias: number;
  movimientos: number;
  avance: number; // en %
}

const diasSemana = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default function CalendarioConciliacion() {
  const [datos, setDatos] = useState<DiaConciliacion[]>([]);
  const [mesActual] = useState("2025-05"); // luego se puede hacer dinámico

  useEffect(() => {
  fetch(`http://localhost:8000contabilidad/conciliacion-mensual?mes=${mesActual}`)
    .then((res) => res.json())
    .then((data) => {
      if (Array.isArray(data)) {
        setDatos(data);
      } else {
        console.error("Respuesta inesperada:", data);
        setDatos([]); // evita que explote
      }
    })
    .catch((err) => {
      console.error("Error al cargar datos del calendario:", err);
      setDatos([]);
    });
}, [mesActual]);


  // Genera estructura de calendario
  const generarCalendario = () => {
    const diasDelMes = new Date(parseInt(mesActual.split("-")[0]), parseInt(mesActual.split("-")[1]), 0).getDate();
    const primerDia = new Date(`${mesActual}-01`).getDay(); // 0 (Dom) a 6 (Sáb)
    const offset = primerDia === 0 ? 6 : primerDia - 1;

    const calendario: (DiaConciliacion | null)[] = Array(offset).fill(null);

    for (let i = 1; i <= diasDelMes; i++) {
      const fecha = `${mesActual}-${i.toString().padStart(2, "0")}`;
      const diaData = datos.find((d) => d.fecha === fecha) || null;
      calendario.push(diaData);
    }

    return calendario;
  };

  const calendario = generarCalendario();

  return (
    <div className="calendario-container">
      <h2 className="titulo-calendario">Conciliación Bancaria - Mayo 2025</h2>
      <div className="calendario-grid">
        {diasSemana.map((d) => (
          <div key={d} className="encabezado-dia">{d}</div>
        ))}

        {calendario.map((dia, idx) => (
          <div key={idx} className={`celda-dia ${dia ? "lleno" : "vacio"}`}>
            {dia ? (
              <>
                <div className="fecha">{dia.fecha.split("-")[2]}</div>
                <div className="dato"><strong>S:</strong> ${dia.soportes.toLocaleString()}</div>
                <div className="dato"><strong>B:</strong> ${dia.banco.toLocaleString()}</div>
                <div className="dato"><strong>D:</strong> ${dia.diferencia.toLocaleString()}</div>
                <div className="dato"><strong>G:</strong> {dia.guias}</div>
                <div className="dato"><strong>M:</strong> {dia.movimientos}</div>
                <div className="dato avance">Avance: {dia.avance.toFixed(1)}%</div>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
