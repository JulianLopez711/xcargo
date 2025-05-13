import React, { useState, useEffect } from "react";
import "../../styles/Login.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContext";
import LogoXcargo from "../../assets/LogoXcargo.png";

const XCargoLogin: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const navigate = useNavigate();

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();

  if (!selectedRole) {
    alert("Selecciona un rol");
    return;
  }

  // Mapear los roles a los permitidos por el sistema
  const rolMapeo: Record<string, string> = {
    administrador: "admin",
    contabilidad: "contabilidad",
    conductor: "conductor",
    cliente: "cliente",
    operador: "cliente", // si estás unificando cliente/operador
  };

  const rolSistema = rolMapeo[selectedRole.toLowerCase()];
  if (!rolSistema) {
    alert("Rol no válido");
    return;
  }

  login({ email, role: rolSistema });
  setIsSubmitted(true);
};



  useEffect(() => {
    if (isSubmitted && selectedRole) {
      const rutasPorRol: Record<string, string> = {
        administrador: "/admin/dashboard",
        contabilidad: "/contabilidad/dashboard",
        conductor: "/conductor/pagos",
        cliente: "/operador/dashboard",
        operador: "/operador/dashboard",
      };

      navigate(rutasPorRol[selectedRole] || "/");
    }
  }, [isSubmitted, selectedRole, navigate]);

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="logo-container">
          <div className="logo-background">
            <div className="logo">
              <img src={LogoXcargo} alt="XCargo Logo" width="100" height="30" />
            </div>
          </div>
        </div>

        <p className="welcome-text">Ingresa con tu cuenta para continuar</p>

        <form onSubmit={handleSubmit} autoComplete="on">
          {/* Email */}
          <div className="input-group">
            <label className="input-label">
              {/* SVG ICON */}
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" stroke="#10B981" strokeWidth="2" />
                <path d="M22 6L12 13 2 6" stroke="#10B981" strokeWidth="2" />
              </svg>
              <span>Correo electrónico</span>
            </label>
            <input
              type="email"
              name="email"
              autoComplete="email"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@x-cargo.co.com"
              required
            />
          </div>

          {/* Password */}
          <div className="input-group">
            <label className="input-label">
              {/* SVG ICON */}
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M19 11H5V21H19V11Z" stroke="#10B981" strokeWidth="2" />
                <path d="M17 7V9C17 10.1 16.1 11 15 11H9C7.9 11 7 10.1 7 9V7" stroke="#10B981" strokeWidth="2" />
                <path d="M12 14V18" stroke="#10B981" strokeWidth="2" />
              </svg>
              <span>Contraseña</span>
            </label>
            <div className="password-container">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Ocultar" : "Ver"}
              </button>
            </div>
          </div>

          {/* Roles */}
          <div className="input-group">
            <p className="role-label">Selecciona tu rol</p>
            <div className="role-grid">
              {["Operador", "conductor", "contabilidad", "administrador"].map((rol) => (
                <button
                  key={rol}
                  type="button"
                  className={`role-button ${selectedRole === rol ? "active" : ""}`}
                  onClick={() => setSelectedRole(rol)}
                >
                  <span>{rol.charAt(0).toUpperCase() + rol.slice(1)}</span>
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="submit-button">
            Iniciar sesión
          </button>
        </form>

        <div className="footer">© 2025 XCargo. Todos los derechos reservados.</div>
      </div>
    </div>
  );
};

export default XCargoLogin;
