// src/components/Admin/CardResumen.tsx
interface CardResumenProps {
  titulo: string;
  valor: number | string;
  icono?: React.ReactNode;
}

export default function CardResumen({ titulo, valor, icono }: CardResumenProps) {
  return (
    <div className="card-resumen">
      <div className="card-icono">{icono}</div>
      <div>
        <h4>{titulo}</h4>
        <p>{valor}</p>
      </div>
    </div>
  );
}
