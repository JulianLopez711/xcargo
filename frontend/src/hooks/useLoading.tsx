// src/hooks/useLoadingEnhancer.tsx
import { useEffect, useRef } from 'react';
import Lottie from 'lottie-react';
import animationData from '../assets/animations/Animation - 1749523266862.json';

export const useLoadingEnhancer = (containerRef: React.RefObject<HTMLElement>) => {
  const lottieInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const spinner = container.querySelector('.loading-spinner');
    
    if (!spinner) return;

    // Crear contenedor para Lottie
    const lottieContainer = document.createElement('div');
    lottieContainer.className = 'lottie-animation';
    lottieContainer.style.cssText = `
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      z-index: 2;
    `;

    // Renderizar Lottie como componente React
    lottieContainer.className = 'lottie-animation';
    spinner.appendChild(lottieContainer);
    spinner.classList.add('lottie-loaded');

    // Montar el componente Lottie en el contenedor usando React portal
    import('react-dom/client').then(ReactDOMClient => {
      lottieInstanceRef.current = ReactDOMClient.createRoot(lottieContainer);
      lottieInstanceRef.current.render(
        <Lottie
          animationData={animationData}
          loop
          autoplay
          style={{ width: '100%', height: '100%' }}
        />
      );
    });

    // Cleanup
    return () => {
      if (lottieInstanceRef.current) {
        lottieInstanceRef.current.destroy();
        lottieInstanceRef.current = null;
      }
      if (lottieContainer.parentNode) {
        lottieContainer.parentNode.removeChild(lottieContainer);
      }
      spinner.classList.remove('lottie-loaded');
    };
  }, [containerRef]);

  return {
    // Métodos para controlar la animación si es necesario
    play: () => lottieInstanceRef.current?.play(),
    pause: () => lottieInstanceRef.current?.pause(),
    stop: () => lottieInstanceRef.current?.stop(),
    setSpeed: (speed: number) => lottieInstanceRef.current?.setSpeed(speed)
  };
};

// Hook para componentes con loading condicional
export const useConditionalLoading = (isLoading: boolean, message: string = "Cargando...") => {
  const containerRef = useRef<HTMLDivElement>(null);
  useLoadingEnhancer(containerRef);

  const LoadingComponent = () => {
    if (!isLoading) return null;

    return (
      <div ref={containerRef} className="loading-container">
        <div className="loading-spinner"></div>
        <p className="loading-text">{message}</p>
      </div>
    );
  };

  return { LoadingComponent, containerRef };
};