// src/components/LoadingSpinner.tsx
import "../styles/LoadingSpinner.css";

interface LoadingSpinnerProps {
  message?: string;
  showLogo?: boolean;
  logoSrc?: string;
}

export default function LoadingSpinner({ 
  message = "Cargando...", 
  showLogo = true,
  logoSrc = "../assets/LogoX.png" // Cambia por la ruta de tu logo
}: LoadingSpinnerProps) {
  return (
    <div className="spinner-container">
      <div className="spinner-wrapper">
        <div className="spinner" />
        {showLogo && (
          <img 
            src={logoSrc} 
            alt="Logo" 
            className="spinner-logo"
          />
        )}
      </div>
      <p className="spinner-text">{message}</p>
    </div>
  );
}