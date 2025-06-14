import React from 'react';
import LoadingSpinner from './LoadingSpinner';
import LogoXcargo from '../assets/LogoXcargo.png';

interface LoadingContainerProps {
  // Tipo de loading a mostrar
  type?: 'spinner' | 'logo' | 'minimal';
  // Mensaje a mostrar
  message?: string;
  // Tamaño del loading
  size?: 'small' | 'medium' | 'large' | 'fullscreen';
  // Si debe mostrarse como overlay
  overlay?: boolean;
  // Si debe ser transparente
  transparent?: boolean;
  // Si está activo
  isLoading: boolean;
  // Elementos hijos que se mostrarán cuando no esté cargando
  children?: React.ReactNode;
  // Si debe mostrar un logo personalizado
  customLogo?: string;
  // Estilos adicionales para el contenedor
  className?: string;
  // Si debe prevenir interacciones durante la carga
  preventInteraction?: boolean;
}

const LoadingContainer: React.FC<LoadingContainerProps> = ({
  type = 'spinner',
  message,
  size = 'medium',
  overlay = false,
  transparent = false,
  isLoading,
  children,
  customLogo,
  className = '',
  preventInteraction = true,
}) => {
  if (!isLoading && !overlay) {
    return <>{children}</>;
  }

  const renderLoader = () => {
    switch (type) {
      case 'logo':
        return (
          <div className="loading-logo-container">
            <img 
              src={customLogo || LogoXcargo} 
              alt="Cargando..." 
              className="loading-logo animated"
            />
            {message && <p className="loading-text">{message}</p>}
          </div>
        );
      case 'minimal':
        return (
          <div className="loading-minimal">
            <LoadingSpinner 
              size="small" 
              message={message} 
              transparent={true}
            />
          </div>
        );
      default:
        return (
          <LoadingSpinner
            size={size}
            message={message}
            overlay={overlay}
            transparent={transparent}
          />
        );
    }
  };

  const containerClassName = `
    loading-container
    ${className}
    ${preventInteraction ? 'loading-prevent-interaction' : ''}
    ${overlay ? 'loading-overlay' : ''}
  `.trim();

  return (
    <div className={containerClassName}>
      {children}
      {isLoading && renderLoader()}
    </div>
  );
};

export default LoadingContainer;
