// src/components/Navbar.tsx
import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/authContext";
import logo from "../assets/LogoXcargo.png";
import "../styles/Navbar.css";

import { adminRoutes } from "../routes/adminRoutes/adminRoutes";
import { contabilidadRoutes } from "../routes/contabilidadRoutes/contabilidadRoutes";
import { conductorRoutes } from "../routes/conductorRoutes/conductorRoutes";
import { operadorRoutes } from "../routes/operadorRoutes/operadorRoutes";



export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const rutasPorRol: Record<string, { name: string; path: string; icon?: string }[]> = {
    admin: adminRoutes,
    contabilidad: contabilidadRoutes,
    conductor: conductorRoutes,
    operador: operadorRoutes,

  };

  const handleClickOutside = (e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setMenuAbierto(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  const rutas = rutasPorRol[user.role] || [];

  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <img src={logo} alt="Logo XCargo" />
      </div>

      <div className="navbar-links">
        {rutas.map((ruta) => (
          <button
            key={ruta.path}
            className="navbar-link"
            onClick={() => navigate(ruta.path)}
          >
            {ruta.name}
          </button>
        ))}
      </div>

      <div className="navbar-user" ref={menuRef}>
        <span className="navbar-username" onClick={() => setMenuAbierto(!menuAbierto)}>
          {user.email}
        </span>

        {menuAbierto && (
          <div className="user-dropdown">
            <button onClick={() => alert("Ir a perfil")} className="dropdown-item">Perfil</button>
            <button onClick={() => navigate("/cambiar-clave")} className="dropdown-item">Cambiar contraseña</button>
            <button onClick={logout} className="dropdown-item logout">Cerrar sesión</button>
          </div>
        )}
      </div>
    </nav>
  );
}
