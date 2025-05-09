import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/authContext";
import logo from "../assets/LogoXcargo.png";
import "../styles/Navbar.css";

import { adminRoutes } from "../routes/adminRoutes/adminRoutes";
import { conductorRoutes } from "../routes/conductorRoutes/conductorRoutes";
import { contabilidadRoutes } from "../routes/contabilidadRoutes/contabilidadRoutes";
import { clientRoutes } from "../routes/clientRoutes/clientRoutes"

export default function Navbar() {
  const { rol, nombre, logout } = useAuth();
  const navigate = useNavigate();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const rutasPorRol: Record<string, { name: string; path: string }[]> = {
    admin: adminRoutes,
    conductor: conductorRoutes,
    contabilidad: contabilidadRoutes,
    operador: clientRoutes,
  };

  const rutas = rutasPorRol[rol] || [];

  useEffect(() => {
    const manejarClicFuera = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuAbierto(false);
      }
    };
    document.addEventListener("mousedown", manejarClicFuera);
    return () => document.removeEventListener("mousedown", manejarClicFuera);
  }, []);

  return (
    <nav className="navbar">
      <div className="navbar-logo" onClick={() => navigate("/")}>
        <img src={logo} alt="Logo Xcargo" />
        <span>XCARGO</span>
      </div>

      <div className="navbar-toggle" onClick={() => setMenuAbierto(!menuAbierto)}>
        ☰
      </div>

      <div className={`navbar-menu ${menuAbierto ? "abierto" : ""}`} ref={menuRef}>
        {rutas.map((ruta, i) => (
          <a key={i} onClick={() => navigate(ruta.path)}>
            {ruta.name}
          </a>
        ))}
        <span className="navbar-usuario">👤 {nombre}</span>
        <a onClick={logout}>Cerrar sesión</a>
      </div>
    </nav>
  );
}
