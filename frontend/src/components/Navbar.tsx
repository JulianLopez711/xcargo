// src/components/Navbar.tsx
import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/authContext"; // Asegúrate de tener este contexto
import logo from "../assets/LogoXcargo.png";
import "../styles/Navbar.css";

import { adminRoutes } from "../routes/adminRoutes/adminRoutes";
import { contabilidadRoutes } from "../routes/contabilidadRoutes/contabilidadRoutes";
import { conductorRoutes } from "../routes/conductorRoutes/conductorRoutes";
import { clientRoutes } from "../routes/operadorRoutes/clientRoutes";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const rutasPorRol: Record<string, { name: string; path: string; icon?: string }[]> = {
    admin: adminRoutes,
    contabilidad: contabilidadRoutes,
    conductor: conductorRoutes,
    cliente: clientRoutes,
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
      <div className="navbar-logo" >
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

      <div className="navbar-user">
        <span className="navbar-username">{user.email}</span>
        <button className="logout-button" onClick={logout}>
          Cerrar sesión
        </button>
      </div>
    </nav>
  );
}
