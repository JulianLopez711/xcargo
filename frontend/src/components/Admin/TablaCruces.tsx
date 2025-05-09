// src/components/contabilidad/TablaCruces.tsx
import { useEffect, useState } from "react";
import "../../styles/Cruces.css";

interface Cruce {
  id: number;
  operador: string;
  referencia: string;
  valorDetectado: number;
  valorAsignado: number;
  fecha: string;
  estado: "conciliado" | "incompleto";
}

export default function TablaCruces() {
  const [cruces, setCruces] = useState<Cruce[]>([]);

  useEffect(() => {
    // Simulación, reemplazar por fetch real
    setCruces([
      {
        id: 1,
        operador: "Valentina",
        referencia: "MI8158035",
        valorDetectado: 22000,
        valorAsignado: 22000,
        fecha: "2025-05-05",
        estado: "conciliado",
      },
      {
        id: 2,
        operador: "Carlos",
        referencia: "NE992033",
        valorDetectado: 50000,
        valorAsignado: 42000,
        fecha: "2025-05-04",
        estado: "incompleto",
      },
    ]);
  }, []);

  return (
    <div className="tabla-cruces">
      <h3>Historial de Cruces</h3>
      <table>
        <thead>
          <tr>
            <th>Operador</th>
            <th>Referencia</th>
            <th>Valor Detectado</th>
            <th>Valor Asignado</th>
            <th>Fecha</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {cruces.map((c) => (
            <tr key={c.id}>
              <td>{c.operador}</td>
              <td>{c.referencia}</td>
              <td>${c.valorDetectado.toLocaleString()}</td>
              <td>${c.valorAsignado.toLocaleString()}</td>
              <td>{c.fecha}</td>
              <td className={c.estado === "conciliado" ? "estado-ok" : "estado-error"}>
                {c.estado === "conciliado" ? "Conciliado" : "Incompleto"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
