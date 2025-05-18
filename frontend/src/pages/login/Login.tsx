import React, { useState, useEffect } from "react";
import "../../styles/login/Login.css";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRole) {
      alert("Selecciona un rol");
      return;
    }

    try {
      const res = await fetch("https://api.x-cargo.co/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo: email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.detail || "Error al iniciar sesión");
        return;
      }

      const rolMapeo: Record<string, string> = {
        administrador: "admin",
        contabilidad: "contabilidad",
        conductor: "conductor",
        operador: "cliente",
      };

      const rolEsperado = rolMapeo[selectedRole.toLowerCase()];
      const rolDesdeBackend = data.rol?.toLowerCase();
      console.log("Rol esperado:", rolEsperado);
      console.log("Rol desde backend:", rolDesdeBackend);

      if (rolEsperado !== rolDesdeBackend) {
        alert("Rol incorrecto. Verifica tu selección.");
        return;
      }

      if (data.clave_defecto) {
        localStorage.setItem("correo_recuperacion", data.correo);
        alert("Debes cambiar tu contraseña antes de continuar.");

        // Autenticar para que ProtectedRoute permita la navegación
        login({ email: data.correo, role: data.rol });

        // Cancelar redirección por rol
        setIsSubmitted(false);
        setSelectedRole(null);

        navigate("/cambiar-clave");
        return;
      }

      // Guardar usuario en contexto
      login({ email: data.correo, role: data.rol });

      setIsSubmitted(true);
    } catch (error) {
      alert("No se pudo conectar con el servidor.");
      console.error(error);
    }
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
              <img src={LogoXcargo} alt="XCargo Logo" width="150" height="30" />
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
                <path
                  d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"
                  stroke="#10B981"
                  strokeWidth="2"
                />
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
              placeholder="tucorreo@x-cargo.co"
              required
            />
          </div>

          {/* Password */}
          <div className="input-group">
            <label className="input-label">
              {/* SVG ICON */}
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M19 11H5V21H19V11Z" stroke="#10B981" strokeWidth="2" />
                <path
                  d="M17 7V9C17 10.1 16.1 11 15 11H9C7.9 11 7 10.1 7 9V7"
                  stroke="#10B981"
                  strokeWidth="2"
                />
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
              {["Operador", "conductor", "contabilidad", "administrador"].map(
                (rol) => (
                  <button
                    key={rol}
                    type="button"
                    className={`role-button ${
                      selectedRole === rol ? "active" : ""
                    }`}
                    onClick={() => setSelectedRole(rol)}
                  >
                    <span>{rol.charAt(0).toUpperCase() + rol.slice(1)}</span>
                  </button>
                )
              )}
            </div>
          </div>

          <button type="submit" className="submit-button">
            Iniciar sesión
          </button>
        </form>
        <div className="forgot-password">
          <button
            type="button"
            className="forgot-password-link"
            onClick={() => navigate("/cambiar-clave")}
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>

        <div className="footer">
          © 2025 XCargo. Todos los derechos reservados.
        </div>
      </div>
    </div>
  );
};

export default XCargoLogin;
