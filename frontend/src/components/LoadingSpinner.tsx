// src/components/LoadingSpinner.tsx
import "../styles/LoadingSpinner.css";
import logoX from "../assets/LogoX.png";

interface LoadingSpinnerProps {
  message?: string;
  showLogo?: boolean;
  logoSrc?: string;
  logoSize?: 'small' | 'medium' | 'large' | number; // ✅ Nuevo prop para tamaño
}

export default function LoadingSpinner({ 
  message = "Cargando...", 
  showLogo = true,
  logoSrc = logoX,
  logoSize = 'medium' // ✅ Tamaño por defecto
}: LoadingSpinnerProps) {
  
  // ✅ Función para obtener el tamaño del logo
  const getLogoStyle = () => {
    if (typeof logoSize === 'number') {
      return { width: `${logoSize}px`, height: `${logoSize}px` };
    }
    
    const sizes = {
      small: { width: '30px', height: '30px' },
      medium: { width: '50px', height: '50px' },
      large: { width: '80px', height: '80px' }
    };
    
    return sizes[logoSize];
  };

  return (
    <div className="spinner-container">
      <div className="spinner-wrapper">
        <div className="spinner" />
        {showLogo && (
          <img 
            src={logoSrc} 
            alt="X-Cargo Logo" 
            className="spinner-logo"
            style={{
              ...getLogoStyle(),
              objectFit: 'contain',
              marginTop: '10px'
            }}
          />
        )}
      </div>
      <p className="spinner-text">{message}</p>
    </div>
  );
}