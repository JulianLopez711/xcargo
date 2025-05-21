import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import { useLoading } from "../context/loadingContext";
import LoadingSpinner from "./LoadingSpinner";
import ChatBotBubble from "../components/ChatBotBubble";

export default function Layout() {
  const { isLoading } = useLoading();

  return (
    <div className="layout">
      <Navbar />
      <div className="main-content">
        {isLoading ? <LoadingSpinner /> : <Outlet />}
      </div>
      
      {/* Burbuja de chat flotante, visible siempre */}
      <ChatBotBubble />
    </div>
  );
}
