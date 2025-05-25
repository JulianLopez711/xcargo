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
  const codigo = localStorage.getItem("codigo_recuperacion");

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
      const res = await fetch("http://localhost:8000/auth/cambiar-clave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correo,
          nueva_clave: nueva,
          codigo: codigo || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error inesperado");

      setMensaje("Contraseña actualizada correctamente");
      localStorage.removeItem("correo_recuperacion");
      localStorage.removeItem("codigo_recuperacion");

      setTimeout(() => navigate("/"), 2000);
    } catch (err: any) {
      setError(err.message);
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