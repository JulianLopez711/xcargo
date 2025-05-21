import { useState } from "react";
import "../styles/chat/ChatBotBubble.css";

export default function ChatBotBubble() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([
    { tipo: "bot", texto: "¡Hola! Soy tu asistente virtual. ¿En qué puedo ayudarte con tus pagos?" }
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
        correo_usuario: "conductor@xcargo.co" // luego lo puedes extraer del contexto o login
      }),
    });

    const data = await res.json();
    setMensajes((prev) => [...prev, { tipo: "bot", texto: data.respuesta }]);
  } catch (error) {
    setMensajes((prev) => [...prev, { tipo: "bot", texto: "Lo siento, hubo un error al procesar tu solicitud." }]);
  }
};


  return (
    <div className="chat-burbuja-container">
      {abierto && (
        <div className="chat-panel">
          <div className="chat-header">
            Asistente de Pagos
            <button onClick={() => setAbierto(false)}>✕</button>
          </div>
          <div className="chat-mensajes">
            {mensajes.map((msg, idx) => (
              <div key={idx} className={`mensaje ${msg.tipo}`}>
                {msg.texto}
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
