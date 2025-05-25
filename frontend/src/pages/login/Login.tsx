// ACTUALIZAR: frontend/src/pages/login/Login.tsx
import React, { useState, useEffect } from "react";
import "../../styles/login/Login.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContext";
import LogoXcargo from "../../assets/LogoXBlanco.png";

const XCargoLogin: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Por favor completa todos los campos");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("https://api.x-cargo.co/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo: email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Error al iniciar sesión");
      }

      if (data.clave_defecto) {
        localStorage.setItem("correo_recuperacion", data.correo);
        login({ email: data.correo, role: data.rol });
        navigate("/cambiar-clave");
        return;
      }

      // Guardar usuario en contexto
     login({ email: data.correo, role: data.rol });
// Redirección directa usando la ruta del backend
if (data.ruta_defecto) {
  navigate(data.ruta_defecto);
} else {
  // Fallback si no hay ruta definida
  const rutasPorRol: Record<string, string> = {
    admin: "/admin/dashboard",
    contabilidad: "/contabilidad/dashboard",
    conductor: "/conductor/pagos", 
    operador: "/operador/dashboard",
  };
  navigate(rutasPorRol[data.rol] || "/");
}

    } catch (error: any) {
      setError(error.message || "Error de conexión. Contacta al administrador.");
    } finally {
      setIsLoading(false);
    }
  };

  const roles = [
    { key: "operador", label: "Operador", icon: "📦" },
    { key: "conductor", label: "Conductor", icon: "🚛" },
    { key: "contabilidad", label: "Contabilidad", icon: "📊" },
    { key: "administrador", label: "Administrador", icon: "⚙️" }
  ];

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Logo Section */}
        <div className="logo-section">
          <div className="logo-container">
            <img src={LogoXcargo} alt="XCargo Logo" className="logo-image" />
          </div>
        </div>
        {error && (
          <div className="error-message" role="alert">
            <span className="error-icon">⚠️</span>
            <span className="error-text">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form" noValidate>
          {/* Email Field */}
          <div className="form-group">
            <label htmlFor="email" className="form-label">
              <svg className="label-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                />
                <path d="M22 6L12 13 2 6" stroke="currentColor" strokeWidth="2" />
              </svg>
              Correo electrónico
            </label>
            <div className="input-wrapper">
              <input
                id="email"
                type="email"
                name="email"
                autoComplete="email"
                className={`form-input ${error && !email ? 'error' : ''}`}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError("");
                }}
                placeholder="tu-correo@x-cargo.co"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="form-group">
            <label htmlFor="password" className="form-label">
              <svg className="label-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M19 11H5V21H19V11Z" stroke="currentColor" strokeWidth="2" fill="none" />
                <path
                  d="M17 7V9C17 10.1 16.1 11 15 11H9C7.9 11 7 10.1 7 9V7"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path d="M12 14V18" stroke="currentColor" strokeWidth="2" />
              </svg>
              Contraseña
            </label>
            <div className="input-wrapper password-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                className={`form-input ${error && !password ? 'error' : ''}`}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="••••••••"
                required
                disabled={isLoading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? "👁️‍🗨️" : "👁️"}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button 
            type="submit" 
            className="submit-button"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="loading-spinner"></span>
                Iniciando sesión...
              </>
            ) : (
              <>
                <span>Iniciar sesión</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </>
            )}
          </button>
        </form>

        {/* Footer Actions */}
        <div className="form-footer">
          <button
            type="button"
            className="forgot-password-link"
            onClick={() => navigate("/recuperar-clave")}
            disabled={isLoading}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            ¿Olvidaste tu contraseña?
          </button>
        </div>

        {/* Copyright */}
        <div className="copyright">
          <span>© 2025 XCargo. Todos los derechos reservados.</span>
        </div>
      </div>
    </div>
  );
};

export default XCargoLogin;