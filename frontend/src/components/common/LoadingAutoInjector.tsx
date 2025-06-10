// src/components/common/LoadingAutoInjector.tsx
import { useEffect } from 'react';
import Lottie from 'lottie-react';
import animationData from '../assets/animations/Animation-1749523266862.json';

const LoadingAutoInjector = () => {
  useEffect(() => {
    const injectLottieIntoSpinners = () => {
      // Buscar todos los .loading-spinner que NO tengan ya Lottie
      const spinners = document.querySelectorAll('.loading-spinner:not(.lottie-injected)');
      
      spinners.forEach((spinner) => {
        // Marcar como procesado para evitar duplicados
        spinner.classList.add('lottie-injected');
        
        // Limpiar contenido existente
        spinner.innerHTML = '';
        
        // Crear contenedor para Lottie
        const lottieContainer = document.createElement('div');
        lottieContainer.style.cssText = `
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
        `;
        
        // Insertar en el DOM primero
        spinner.appendChild(lottieContainer);
        
        // Crear la animación Lottie
        try {
          const lottieInstance = Lottie.loadAnimation({
            container: lottieContainer,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: animationData,
          });
          
          console.log('✅ Lottie inyectado en spinner');
          
          // Guardar referencia para cleanup si es necesario
          (spinner as any).__lottieInstance = lottieInstance;
          
        } catch (error) {
          console.warn('⚠️ Error cargando Lottie, usando fallback CSS:', error);
          // Si falla Lottie, mostrar spinner CSS de respaldo
          lottieContainer.innerHTML = `
            <div style="
              width: 40px;
              height: 40px;
              border: 3px solid #e5e7eb;
              border-top: 3px solid #3b82f6;
              border-radius: 50%;
              animation: spin 1s linear infinite;
            "></div>
          `;
        }
      });
    };

    // Ejecutar inmediatamente
    injectLottieIntoSpinners();

    // Observar cambios en el DOM para nuevos spinners
    const observer = new MutationObserver((mutations) => {
      let shouldInject = false;
      
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            
            // Verificar si es un loading-spinner o contiene alguno
            if (element.classList?.contains('loading-spinner') || 
                element.querySelector?.('.loading-spinner')) {
              shouldInject = true;
            }
          }
        });
      });
      
      if (shouldInject) {
        // Pequeño delay para asegurar que el DOM esté listo
        setTimeout(injectLottieIntoSpinners, 10);
      }
    });

    // Observar todo el documento
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Cleanup
    return () => {
      observer.disconnect();
      
      // Limpiar instancias de Lottie si es necesario
      const injectedSpinners = document.querySelectorAll('.loading-spinner.lottie-injected');
      injectedSpinners.forEach((spinner) => {
        const lottieInstance = (spinner as any).__lottieInstance;
        if (lottieInstance) {
          lottieInstance.destroy();
        }
      });
    };
  }, []);

  // Este componente no renderiza nada visible
  return null;
};

export default LoadingAutoInjector;