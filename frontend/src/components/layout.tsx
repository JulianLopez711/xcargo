// src/components/Layout.tsx
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import { useLoading } from "../context/loadingContext";
import LoadingSpinner from "./LoadingSpinner";
import ChatBotBubble from "../components/ChatBotBubble";
import InstallPWAButton from "../components/InstallPWAButton";
import NotificacionesFlujo from '../components/NotificacionesFlujo';

import { useEffect, useState } from "react";

export default function Layout() {
  const { isLoading } = useLoading();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="layout">
      <InstallPWAButton />
      <Navbar />

      <main className="main-content" role="main">
        <div className="container-fluid">
          {isLoading ? (
            <div className="loading-container">
              <LoadingSpinner />
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </main>
      
      {/* Chat Bot solo en desktop o cuando sea necesario */}
      {!isMobile && <ChatBotBubble />}
    </div>
  );
}