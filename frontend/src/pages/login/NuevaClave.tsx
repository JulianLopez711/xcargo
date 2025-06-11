import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContext";
import "../../styles/login/NuevaClave.css";

export default function CambiarClave() {
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [mostrarNueva, setMostrarNueva] = useState(false);
  const [mostrarConfirmar, setMostrarConfirmar] = useState(false);
  const [fortaleza, setFortaleza] = useState(0);
  const navigate = useNavigate();
  const { user } = useAuth();
  const correo = localStorage.getItem("correo_recuperacion") || user?.email || "";

  // Validar fortaleza de contraseña
  useEffect(() => {
    let strength = 0;
    if (nueva.length >= 8) strength++;
    if (nueva.match(/[a-z]/) && nueva.match(/[A-Z]/)) strength++;
    if (nueva.match(/[0-9]/)) strength++;
    if (nueva.match(/[^a-zA-Z0-9]/)) strength++;
    setFortaleza(strength);
  }, [nueva]);

  const cambiar = async () => {
    setMensaje("");
    setError("");

    // Validaciones
    if (!nueva || !confirmar) {
      setError("Por favor completa todos los campos");
      return;
    }

    if (nueva.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    if (nueva !== confirmar) {
      setError("Las contraseñas no coinciden");
      return;
    }

    if (!correo) {
      setError("No se encontró el correo. Por favor reinicia el proceso.");
      navigate("/recuperar-clave");
      return;
    }

    setCargando(true);

    try {
      // 🔧 SOLUCIÓN: Obtener código del localStorage o del servidor
      let codigoFinal = null;
      const codigoStorage = localStorage.getItem("codigo_recuperacion");
      


      // Verificar si hay código válido en localStorage
      if (codigoStorage && codigoStorage !== 'null' && codigoStorage.trim() !== '') {
        codigoFinal = codigoStorage;

      } else {

        
        try {
          const debugResponse = await fetch("http://127.0.0.1:8000/auth/debug-codigos", {
            method: 'GET',
            headers: { 
              'Content-Type': 'application/json'
            }
          });
          
          if (!debugResponse.ok) {
            throw new Error('Error obteniendo códigos del servidor');
          }
          
          const debugData = await debugResponse.json();

          
          if (debugData.codigos_activos && debugData.codigos_activos[correo] && debugData.codigos_activos[correo].codigo) {
            codigoFinal = debugData.codigos_activos[correo].codigo;
          } else {
            throw new Error('No hay código activo en el servidor para este correo');
          }
        } catch (debugError) {
          console.error('❌ Error obteniendo código del servidor:', debugError);
          setError("No se encontró código activo. Por favor solicita un código nuevo desde 'Recuperar contraseña'.");
          setTimeout(() => navigate("/recuperar-clave"), 2000);
          return;
        }
      }

      // 🔧 SOLUCIÓN: Construir el body correctamente
      const requestBody = {
        correo: correo,
        nueva_clave: nueva,
        ...(codigoFinal && { codigo: codigoFinal }) // Solo incluir código si existe
      };



      // 🔧 SOLUCIÓN: Headers mejorados
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };

      // Agregar token si existe (para usuarios logueados)
      const authToken = localStorage.getItem('authToken');
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const res = await fetch("http://127.0.0.1:8000/auth/cambiar-clave", {
        method: "POST",
        headers: headers,
        body: JSON.stringify(requestBody),
      });



      // 🔧 SOLUCIÓN: Manejo robusto de respuesta
      let data;
      const responseText = await res.text();
      
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ Error parseando respuesta:', parseError);
        data = { detail: responseText || 'Respuesta inválida del servidor' };
      }


      if (!res.ok) {
        const errorMessage = data.detail || data.mensaje || `Error ${res.status}: ${res.statusText}`;
        throw new Error(errorMessage);
      }

      // 🔧 SOLUCIÓN: Mensaje de éxito y limpieza
      setMensaje(data.mensaje || "Contraseña actualizada correctamente");
      
      // Limpiar localStorage
      localStorage.removeItem("correo_recuperacion");
      localStorage.removeItem("codigo_recuperacion");

      // Redireccionar después de un breve delay
      setTimeout(() => {
        navigate("/");
      }, 2000);

    } catch (err: any) {
      console.error('❌ Error completo:', err);
      
      // 🔧 SOLUCIÓN: Manejo de errores específicos
      let errorMessage = 'Error inesperado al cambiar la contraseña';
      
      if (err.message) {
        if (err.message.includes('código')) {
          errorMessage = err.message;
        } else if (err.message.includes('contraseña')) {
          errorMessage = err.message;
        } else if (err.message.includes('correo')) {
          errorMessage = err.message;
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
      
      // Si es error relacionado con código, redirigir después de un tiempo
      if (errorMessage.includes('código') || errorMessage.includes('activo')) {
        setTimeout(() => {
          navigate("/recuperar-clave");
        }, 3000);
      }
      
    } finally {
      setCargando(false);
    }
  };

  const getFortalezaColor = () => {
    switch (fortaleza) {
      case 0:
      case 1: return "#ef4444";
      case 2: return "#f59e0b";
      case 3: return "#10b981";
      case 4: return "#059669";
      default: return "#e5e7eb";
    }
  };

  const getFortalezaTexto = () => {
    switch (fortaleza) {
      case 0:
      case 1: return "Débil";
      case 2: return "Regular";
      case 3: return "Fuerte";
      case 4: return "Muy fuerte";
      default: return "";
    }
  };

  return (
    <div className="nueva-clave-container">
      <div className="icon-container">
        <div className="icon-background">
          <span className="icon">🔑</span>
        </div>
      </div>

      <h2>Nueva contraseña</h2>
      <p>Crea una contraseña segura para tu cuenta</p>

      <div className="input-group">
        <label className="input-label">Nueva contraseña</label>
        <div className="password-input-container">
          <input
            type={mostrarNueva ? "text" : "password"}
            placeholder="Mínimo 8 caracteres"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            className="password-input"
            disabled={cargando}
          />
          <button
            type="button"
            className="toggle-password"
            onClick={() => setMostrarNueva(!mostrarNueva)}
            disabled={cargando}
          >
            {mostrarNueva ? "👁️‍🗨️" : "👁️"}
          </button>
        </div>
        
        {nueva && (
          <div className="password-strength">
            <div className="strength-bars">
              {[1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  className={`strength-bar ${fortaleza >= level ? 'active' : ''}`}
                  style={{ backgroundColor: fortaleza >= level ? getFortalezaColor() : '#e5e7eb' }}
                />
              ))}
            </div>
            <span className="strength-text" style={{ color: getFortalezaColor() }}>
              {getFortalezaTexto()}
            </span>
          </div>
        )}
      </div>

      <div className="input-group">
        <label className="input-label">Confirmar contraseña</label>
        <div className="password-input-container">
          <input
            type={mostrarConfirmar ? "text" : "password"}
            placeholder="Repite la contraseña"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            className="password-input"
            disabled={cargando}
          />
          <button
            type="button"
            className="toggle-password"
            onClick={() => setMostrarConfirmar(!mostrarConfirmar)}
            disabled={cargando}
          >
            {mostrarConfirmar ? "👁️‍🗨️" : "👁️"}
          </button>
        </div>
        {confirmar && nueva !== confirmar && (
          <p className="field-error">Las contraseñas no coinciden</p>
        )}
        {confirmar && nueva === confirmar && confirmar.length >= 8 && (
          <p className="field-success">✓ Las contraseñas coinciden</p>
        )}
      </div>

      <div className="password-requirements">
        <p className="requirements-title">La contraseña debe contener:</p>
        <ul>
          <li className={nueva.length >= 8 ? "met" : ""}>
            <span className="requirement-icon">{nueva.length >= 8 ? "✓" : "○"}</span>
            Al menos 8 caracteres
          </li>
          <li className={nueva.match(/[a-z]/) && nueva.match(/[A-Z]/) ? "met" : ""}>
            <span className="requirement-icon">
              {nueva.match(/[a-z]/) && nueva.match(/[A-Z]/) ? "✓" : "○"}
            </span>
            Mayúsculas y minúsculas
          </li>
          <li className={nueva.match(/[0-9]/) ? "met" : ""}>
            <span className="requirement-icon">{nueva.match(/[0-9]/) ? "✓" : "○"}</span>
            Al menos un número
          </li>
          <li className={nueva.match(/[^a-zA-Z0-9]/) ? "met" : ""}>
            <span className="requirement-icon">
              {nueva.match(/[^a-zA-Z0-9]/) ? "✓" : "○"}
            </span>
            Al menos un carácter especial
          </li>
        </ul>
      </div>

      <button 
        onClick={cambiar} 
        disabled={cargando || !nueva || !confirmar || nueva !== confirmar}
        className="actualizar-button"
      >
        {cargando ? (
          <>Actualizando<span className="loading"></span></>
        ) : (
          "Actualizar contraseña"
        )}
      </button>

      {mensaje && <p className="mensaje-exito">{mensaje}</p>}
      {error && <p className="mensaje-error">{error}</p>}
    </div>
  );
}