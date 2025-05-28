import { useEffect, useState } from "react";
import "../styles/InstallPWAButton.css";

export default function InstallPWAButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);

      // Ocultar después de 8 segundos
      const timeout = setTimeout(() => {
        setVisible(false);
      }, 8000);

      return () => clearTimeout(timeout);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      console.log("✅ App instalada");
    }
    setDeferredPrompt(null);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <button className="instalar-pwa-btn" onClick={handleInstall}>
      📲 Instalar XCargo App
    </button>
  );
}
    