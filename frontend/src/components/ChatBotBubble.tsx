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
  total_entregado: number;
}

export default function ChatBotBubble() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [entrada, setEntrada] = useState("");
  const [cargando, setCargando] = useState(false);
  const [estadoUsuario, setEstadoUsuario] = useState<EstadoUsuario | null>(null);
  const [errorConexion, setErrorConexion] = useState(false);
  const location = useLocation();

  // Obtener token y usuario actual
  const getAuthInfo = () => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const token = localStorage.getItem("token");
      const email = user.email;

      if (!token || !email) {
        throw new Error("No hay sesión activa");
      }

      return { token, email };
    } catch (error) {
      console.error("❌ Error obteniendo información de autenticación:", error);
      return null;
    }
  };

  // Obtener información contextual de la página actual
  const obtenerContextoPagina = () => {
    const path = location.pathname;
    if (path.includes("/pagos")) return "Pagos Pendientes";
    if (path.includes("/pago")) return "Registro de Pago";
    if (path.includes("/dashboard")) return "Dashboard";
    if (path.includes("/contabilidad")) return "Dashboard Contabilidad";
    return "Página Principal";
  };

  // Generar mensaje de bienvenida contextual con datos reales
  const generarMensajeBienvenida = (estado: EstadoUsuario) => {
    let mensaje = `¡Hola! Soy XBot, tu asistente virtual en XCargo. 👋\n\n`;
    
    if (estado.total_guias > 0) {
      mensaje += `📊 **Tu resumen actual:**\n`;
      mensaje += `• ${estado.total_guias} guías asignadas\n`;
      
      if (estado.total_pendiente > 0) {
        mensaje += `• $${estado.total_pendiente.toLocaleString()} pendientes de pago\n`;
      }
      
      if (estado.total_entregado > 0) {
        mensaje += `• $${estado.total_entregado.toLocaleString()} en entregas completadas\n`;
      }
      
      if (estado.guias_rechazadas > 0) {
        mensaje += `• ⚠️ ${estado.guias_rechazadas} guías rechazadas que requieren atención\n`;
      }
      
      mensaje += `\n¿En qué puedo ayudarte hoy?`;
    } else {
      mensaje += `Actualmente no tienes guías asignadas en el sistema. ¿Hay algo más en lo que pueda ayudarte?`;
    }
    
    return mensaje;
  };

  // Cargar estado del usuario al abrir el chat
  useEffect(() => {
    if (abierto && !estadoUsuario && !errorConexion) {
      cargarEstadoUsuario();
    }
  }, [abierto]);

  const cargarEstadoUsuario = async () => {
    try {
      const auth = getAuthInfo();
      if (!auth) {
        throw new Error("No hay sesión activa");
      }

  

      const res = await fetch(
        `https://api.x-cargo.co/asistente/estado-usuario/${encodeURIComponent(auth.email)}`,
        {
          headers: {
            'Authorization': `Bearer ${auth.token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      

      if (!data.resumen) {
        throw new Error("Formato de respuesta inválido");
      }

      setEstadoUsuario(data.resumen);
      setErrorConexion(false);

      setMensajes([{
        tipo: "bot",
        texto: generarMensajeBienvenida(data.resumen),
        timestamp: new Date(),
      }]);

    } catch (error) {
      console.error("❌ Error cargando estado:", error);
      setErrorConexion(true);

      setMensajes([{
        tipo: "bot",
        texto: `¡Hola! Soy XBot, tu asistente virtual en XCargo. 👋\n\n${
          error instanceof Error && error.message === "No hay sesión activa"
            ? "Por favor inicia sesión para acceder a tu información personalizada."
            : "No puedo acceder a tus datos en este momento, pero puedo ayudarte con preguntas generales sobre el sistema."
        }`,
        timestamp: new Date(),
      }]);
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
    const preguntaOriginal = entrada;
    setEntrada("");
    setCargando(true);

    try {
      const auth = getAuthInfo();
      if (!auth) {
        throw new Error("No hay sesión activa");
      }

      const res = await fetch("https://api.x-cargo.co/asistente/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          pregunta: preguntaOriginal,
          correo_usuario: auth.email,
          contexto_adicional: {
            pagina_actual: obtenerContextoPagina(),
            timestamp: new Date().toISOString(),
          },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();

      if (data.error === true) {
        throw new Error(data.detalle || "Error desconocido del servidor");
      }

      const respuestaBot: Mensaje = {
        tipo: "bot",
        texto: data.respuesta,
        timestamp: new Date(),
      };

      setMensajes((prev) => [...prev, respuestaBot]);

      if (data.contexto) {
        setEstadoUsuario(data.contexto);
        setErrorConexion(false);
      }

    } catch (error) {
      console.error("❌ Error enviando mensaje:", error);
      
      setMensajes((prev) => [...prev, {
        tipo: "bot",
        texto: error instanceof Error ? error.message : "Error desconocido al procesar tu mensaje",
        timestamp: new Date(),
      }]);
      
    } finally {
      setCargando(false);
    }
  };

  const sugerirPregunta = (pregunta: string) => {
    setEntrada(pregunta);
  };

  // Preguntas sugeridas contextuales basadas en el estado del usuario
  const getPreguntasSugeridas = () => {
    const basicas = [
      "¿Cómo subo un comprobante?",
      "¿Cómo selecciono varias guías?",
      "Contacto de soporte"
    ];
    
    if (estadoUsuario) {
      const especificas = [];
      
      if (estadoUsuario.total_pendiente > 0) {
        especificas.push("¿Cuánto debo en total?");
      }
      
      if (estadoUsuario.guias_rechazadas > 0) {
        especificas.push("¿Por qué fueron rechazadas mis guías?");
      }
      
      if (estadoUsuario.total_guias > 5) {
        especificas.push("¿Cómo agrupo mis pagos?");
      }
      
      return [...especificas, ...basicas];
    }
    
    return basicas;
  };

  const formatearValor = (valor: number) => {
    return valor.toLocaleString('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

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
                    <div className="estado-linea">
                      📋 {estadoUsuario.total_guias} guías
                      {estadoUsuario.total_pendiente > 0 && (
                        <span className="pendiente">
                          • {formatearValor(estadoUsuario.total_pendiente)} pendientes
                        </span>
                      )}
                    </div>
                    {(estadoUsuario.guias_rechazadas > 0 || estadoUsuario.total_entregado > 0) && (
                      <div className="estado-linea">
                        {estadoUsuario.total_entregado > 0 && (
                          <span className="entregado">
                            ✅ {formatearValor(estadoUsuario.total_entregado)} entregadas
                          </span>
                        )}
                        {estadoUsuario.guias_rechazadas > 0 && (
                          <span className="rechazadas">
                            ❌ {estadoUsuario.guias_rechazadas} rechazadas
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {errorConexion && (
                  <div className="error-conexion">
                    ⚠️ Modo offline - Datos limitados
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
              {getPreguntasSugeridas().map((pregunta, idx) => (
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
              placeholder={errorConexion ? "Preguntas generales..." : "Escribe tu mensaje..."}
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
          {errorConexion && (
            <div className="offline-indicator">⚠️</div>
          )}
        </div>
      </div>
    </div>
  );
}