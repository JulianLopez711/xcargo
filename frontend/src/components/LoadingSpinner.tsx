// src/components/common/LoadingSpinner.tsx
import React from 'react';
import Lottie from 'lottie-react';
import animationData from '../assets/animations/Animation - 1749523266862.json';
import '../styles/LoadingSpinner.css';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'small' | 'medium' | 'large' | 'fullscreen';
  overlay?: boolean;
  transparent?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = "Cargando...",
  size = 'medium',
  overlay = false,
  transparent = false
}) => {
  const getSizeClass = () => {
    switch (size) {
      case 'small': return 'loading-small';
      case 'medium': return 'loading-medium';
      case 'large': return 'loading-large';
      case 'fullscreen': return 'loading-fullscreen';
      default: return 'loading-medium';
    }
  };

  const containerClass = `
    loading-spinner-container 
    ${getSizeClass()} 
    ${overlay ? 'loading-overlay' : ''} 
    ${transparent ? 'loading-transparent' : ''}
  `.trim();

  return (
    <div className={containerClass}>
      <div className="loading-content">
        <div className="lottie-animation">
          <Lottie 
            animationData={animationData}
            loop={true}
            autoplay={true}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
        {message && (
          <div className="loading-message">
            <span className="loading-text">{message}</span>
            <div className="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadingSpinner;