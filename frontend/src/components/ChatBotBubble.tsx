import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import "../styles/chat/ChatBotBubble.css";
import xbotAvatar from "../assets/xbot-avatar.png";

interface Mensaje {
  tipo: "bot" | "usuario";
  texto: string;
  timestamp?: Date;
}

interface EstadoUsuario {
  total_guias: number;
  total_pendiente: number;
  guias_rechazadas: number;
}

export default function ChatBotBubble() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [entrada, setEntrada] = useState("");
  const [cargando, setCargando] = useState(false);
  const [estadoUsuario, setEstadoUsuario] = useState<EstadoUsuario | null>(null);
  const location = useLocation();

  // Obtener usuario actual (simulado - en producción desde contexto/localStorage)
  const usuarioActual = JSON.parse(localStorage.getItem("user") || "{}");
  const correoUsuario = usuarioActual.email || "conductor@xcargo.co";

  // Obtener información contextual de la página actual
  const obtenerContextoPagina = () => {
    const path = location.pathname;
    if (path.includes("/pagos")) return "Pagos Pendientes";
    if (path.includes("/pago")) return "Registro de Pago";
    if (path.includes("/dashboard")) return "Dashboard";
    return "Página Principal";
  };

  // Generar mensaje de bienvenida contextual
  const generarMensajeBienvenida = (estado: EstadoUsuario) => {
    let mensaje = `¡Hola! Soy XBot, tu asistente virtual en XCargo. 👋\n\n`;
    
    if (estado.total_guias > 0) {
      mensaje += `📊 **Tu resumen actual:**\n`;
      mensaje += `• ${estado.total_guias} guías asignadas\n`;
      mensaje += `• $${estado.total_pendiente.toLocaleString()} pendientes de pago\n`;
      
      if (estado.guias_rechazadas > 0) {
        mensaje += `• ⚠️ ${estado.guias_rechazadas} guías rechazadas que requieren atención\n`;
      }
      
      mensaje += `\n¿En qué puedo ayudarte hoy?`;
    } else {
      mensaje += `Actualmente no tienes guías asignadas. ¿Necesitas ayuda con algo del sistema?`;
    }
    
    return mensaje;
  };

  // Cargar estado del usuario al abrir el chat
  useEffect(() => {
    if (abierto && !estadoUsuario) {
      cargarEstadoUsuario();
    }
  }, [abierto]);

  const cargarEstadoUsuario = async () => {
    try {
      const res = await fetch(
        `http://localhost:8000asistente/estado-usuario/${correoUsuario}`
      );
      const data = await res.json();
      setEstadoUsuario(data.resumen);
      
      // Establecer mensaje de bienvenida personalizado
      setMensajes([
        {
          tipo: "bot",
          texto: generarMensajeBienvenida(data.resumen),
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      console.error("Error cargando estado:", error);
      setMensajes([
        {
          tipo: "bot",
          texto: "¡Hola! Soy XBot, tu asistente virtual en XCargo. ¿En qué puedo ayudarte?",
          timestamp: new Date(),
        },
      ]);
    }
  };

  const enviarMensaje = async () => {
    if (!entrada.trim() || cargando) return;

    const nuevoMensaje: Mensaje = {
      tipo: "usuario",
      texto: entrada,
      timestamp: new Date(),
    };
    
    setMensajes((prev) => [...prev, nuevoMensaje]);
    setEntrada("");
    setCargando(true);

    try {
      const res = await fetch("http://localhost:8000asistente/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pregunta: entrada,
          correo_usuario: correoUsuario,
          contexto_adicional: {
            pagina_actual: obtenerContextoPagina(),
            timestamp: new Date().toISOString(),
          },
        }),
      });

      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.respuesta);
      }

      const respuestaBot: Mensaje = {
        tipo: "bot",
        texto: data.respuesta,
        timestamp: new Date(),
      };
      
      setMensajes((prev) => [...prev, respuestaBot]);
      
      // Actualizar estado si viene en la respuesta
      if (data.contexto) {
        setEstadoUsuario(data.contexto);
      }
      
    } catch (error) {
      console.error("Error enviando mensaje:", error);
      setMensajes((prev) => [
        ...prev,
        {
          tipo: "bot",
          texto: "Lo siento, hubo un error al procesar tu solicitud. Intenta nuevamente o contacta a soporte técnico.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setCargando(false);
    }
  };

  const sugerirPregunta = (pregunta: string) => {
    setEntrada(pregunta);
  };

  const preguntasSugeridas = [
    "¿Cuánto debo en total?",
    "¿Cómo subo un comprobante?",
    "¿Por qué fue rechazada mi guía?",
    "¿Cómo selecciono varias guías?",
    "Contacto de soporte",
  ];

  return (
    <div className="chat-burbuja-container">
      {abierto && (
        <div className="chat-panel">
          <div className="chat-header">
            <div className="header-info">
              <img src={xbotAvatar} alt="XBot" className="header-avatar" />
              <div>
                <strong>XBot - Asistente Virtual</strong>
                {estadoUsuario && (
                  <div className="estado-usuario">
                    {estadoUsuario.total_guias} guías • ${estadoUsuario.total_pendiente.toLocaleString()} pendientes
                    {estadoUsuario.guias_rechazadas > 0 && (
                      <span className="guias-rechazadas">
                        • {estadoUsuario.guias_rechazadas} rechazadas
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <button onClick={() => setAbierto(false)} className="close-btn">
              ✕
            </button>
          </div>

          <div className="chat-mensajes">
            {mensajes.map((msg, idx) => (
              <div key={idx} className={`mensaje ${msg.tipo}`}>
                {msg.tipo === "bot" && (
                  <img src={xbotAvatar} alt="XBot" className="xbot-avatar" />
                )}
                <div className="mensaje-contenido">
                  <div className="mensaje-texto">
                    {msg.texto.split('\n').map((linea, i) => (
                      <div key={i}>
                        {linea.startsWith('•') ? (
                          <div className="lista-item">{linea}</div>
                        ) : linea.startsWith('**') && linea.endsWith('**') ? (
                          <strong>{linea.slice(2, -2)}</strong>
                        ) : (
                          linea
                        )}
                      </div>
                    ))}
                  </div>
                  {msg.timestamp && (
                    <div className="mensaje-timestamp">
                      {msg.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {cargando && (
              <div className="mensaje bot">
                <img src={xbotAvatar} alt="XBot" className="xbot-avatar" />
                <div className="mensaje-contenido">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {mensajes.length === 1 && (
            <div className="sugerencias">
              <div className="sugerencias-titulo">Preguntas frecuentes:</div>
              {preguntasSugeridas.map((pregunta, idx) => (
                <button
                  key={idx}
                  className="sugerencia-btn"
                  onClick={() => sugerirPregunta(pregunta)}
                >
                  {pregunta}
                </button>
              ))}
            </div>
          )}

          <div className="chat-input">
            <input
              type="text"
              placeholder="Escribe tu mensaje..."
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && enviarMensaje()}
              disabled={cargando}
              maxLength={500}
            />
            <button 
              onClick={enviarMensaje} 
              disabled={cargando || !entrada.trim()}
              className={cargando ? "sending" : ""}
            >
              {cargando ? "⏳" : "📤"}
            </button>
          </div>
        </div>
      )}

      <div className="chat-burbuja" onClick={() => setAbierto(true)}>
        <div className="burbuja-contenido">
          💬
          {estadoUsuario && estadoUsuario.guias_rechazadas > 0 && (
            <div className="notification-badge">{estadoUsuario.guias_rechazadas}</div>
          )}
        </div>
      </div>
    </div>
  );
}