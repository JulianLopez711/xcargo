import "../styles/CustomAlert.css";



interface CustomAlertProps {
  tipo: "exito" | "error" | "info";
  mensaje: string;
  onClose: () => void;
}

export default function CustomAlert({ tipo, mensaje, onClose }: CustomAlertProps) {
  return (
    <div className={`custom-alert ${tipo}`}>
      <span className="mensaje">{mensaje}</span>
      <button className="cerrar" onClick={onClose}>✕</button>
    </div>
  );
}
