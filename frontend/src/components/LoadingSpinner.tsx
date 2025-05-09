// src/components/LoadingSpinner.tsx
import "../styles/LoadingSpinner.css";

export default function LoadingSpinner() {
  return (
    <div className="spinner-container">
      <div className="spinner" />
      <p>Cargando...</p>
    </div>
  );
}
