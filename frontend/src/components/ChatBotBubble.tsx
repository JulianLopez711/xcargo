import { useState } from "react";
import "../styles/chat/ChatBotBubble.css";
import xbotAvatar from "../assets/xbot-avatar.png.png";

export default function ChatBotBubble() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([
    {
      tipo: "bot",
      texto:
        "Hola, soy XBot, tu asistente virtual en XCargo. ¿En qué puedo ayudarte hoy?",
    },
  ]);
  const [entrada, setEntrada] = useState("");

  const enviarMensaje = async () => {
    if (!entrada.trim()) return;

    const nuevoMensaje = { tipo: "usuario", texto: entrada };
    setMensajes((prev) => [...prev, nuevoMensaje]);
    setEntrada("");

    try {
      const res = await fetch("https://api.x-cargo.co/asistente/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pregunta: entrada,
          correo_usuario: "conductor@xcargo.co", // o dinámico según contexto
        }),
      });

      const data = await res.json();
      setMensajes((prev) => [...prev, { tipo: "bot", texto: data.respuesta }]);
    } catch (error) {
      setMensajes((prev) => [
        ...prev,
        {
          tipo: "bot",
          texto: "Lo siento, hubo un error al procesar tu solicitud.",
        },
      ]);
    }
  };

  return (
    <div className="chat-burbuja-container">
      {abierto && (
        <div className="chat-panel">
          <div className="chat-header">
            XBot - Asistente Virtual
            <button onClick={() => setAbierto(false)}>✕</button>
          </div>
          <div className="chat-mensajes">
            {mensajes.map((msg, idx) => (
              <div key={idx} className={`mensaje ${msg.tipo}`}>
                {msg.tipo === "bot" && (
                  <img src={xbotAvatar} alt="XBot" className="xbot-avatar" />
                )}
                <span>{msg.texto}</span>
              </div>
            ))}
          </div>
          <div className="chat-input">
            <input
              type="text"
              placeholder="Escribe tu mensaje..."
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enviarMensaje()}
            />
            <button onClick={enviarMensaje}>Enviar</button>
          </div>
        </div>
      )}

      <div className="chat-burbuja" onClick={() => setAbierto(true)}>
        💬
      </div>
    </div>
  );
}
