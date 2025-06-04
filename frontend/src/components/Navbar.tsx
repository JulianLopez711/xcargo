// ACTUALIZAR: frontend/src/components/Navbar.tsx
import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/authContext";
import logo from "../assets/LogoXBlanco.png";
import "../styles/Navbar.css";

import { adminRoutes } from "../routes/adminRoutes/adminRoutes";
import { contabilidadRoutes } from "../routes/contabilidadRoutes/contabilidadRoutes";
import { conductorRoutes } from "../routes/conductorRoutes/conductorRoutes";
import { operadorRoutes } from "../routes/operadorRoutes/operadorRoutes";
import { supervisorRoutes } from "../routes/supervisorRoutes/supervisorRoutes";
import { masterRoutes } from "../routes/masterRoutes/masterRoutes";


export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Rutas por rol
  const rutasPorRol: Record<
    string,
    { name: string; path: string; icon?: string; permission?: string }[]
  > = {
    admin: adminRoutes,
    contabilidad: contabilidadRoutes,
    conductor: conductorRoutes,
    operador: operadorRoutes,
    supervisor: supervisorRoutes,
    master: masterRoutes,
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setMenuAbierto(false);
    }
    if (
      mobileMenuRef.current &&
      !mobileMenuRef.current.contains(e.target as Node)
    ) {
      setMobileMenuOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  // CORREGIDO: Función para obtener rutas disponibles
  const getRutasDisponibles = () => {
    const rutasDelRol = rutasPorRol[user.role] || [];

    // Si no hay permisos definidos o están vacíos, mostrar todas las rutas del rol
    if (!user.permisos || user.permisos.length === 0) {
      return rutasDelRol;
    }

    // Si hay permisos, filtrar según los permisos del usuario
    const rutasFiltradas = rutasDelRol.filter((ruta) => {
      // Si la ruta no tiene propiedad 'permission', mostrarla
      if (!ruta.permission) {
        return true;
      }

      // Si la ruta tiene 'permission', verificar si el usuario tiene ese permiso
      const tienePermiso = user.permisos!.some(
        (permiso) =>
          permiso.id === ruta.permission || permiso.nombre === ruta.permission
      );

      return tienePermiso;
    });

    return rutasFiltradas;
  };

  const rutas = getRutasDisponibles();

  const handleMobileNavigation = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  // Función para obtener el nombre del rol más amigable
  const getNombreRol = (role: string) => {
    const nombres: Record<string, string> = {
      admin: "Administrador",
      contabilidad: "Contabilidad",
      conductor: "Conductor",
      operador: "Operador",
      supervisor: "Supervisor",
      master: "Master",
    };
    return nombres[role] || role;
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Logo */}
        <div className="navbar-logo">
          <img src={logo} alt="Logo XCargo" />
        </div>

        {/* Desktop Navigation Links - AGREGADO */}
        <div className="navbar-links">
          {rutas.map((ruta) => (
            <button
              key={ruta.path}
              className="navbar-link"
              onClick={() => navigate(ruta.path)}
            >
              {ruta.icon && <span className="nav-icon">{ruta.icon}</span>}
              <span>{ruta.name}</span>
            </button>
          ))}
        </div>

        {/* Mobile Menu Button */}
        <button
          className="navbar-mobile-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Abrir menú"
        >
          <span className={`hamburger ${mobileMenuOpen ? "open" : ""}`}>
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>
        {/* User Menu */}
        <div className="navbar-user" ref={menuRef}>
          <button
            className="navbar-username"
            onClick={() => setMenuAbierto(!menuAbierto)}
            aria-label="Menú de usuario"
          >
            <span className="user-avatar">
              {user.email.charAt(0).toUpperCase()}
            </span>
            <div className="user-info">
              <span className="user-email">{user.email}</span>
              <span className="user-role">{getNombreRol(user.role)}</span>
              {/* Mostrar empresa si está disponible */}
              {user.empresa_carrier && (
                <span className="user-company">🏢 {user.empresa_carrier}</span>
              )}
            </div>
            <span className="dropdown-arrow">▼</span>
          </button>

          {menuAbierto && (
            <div className="user-dropdown">
              <div className="dropdown-header">
                <strong>{getNombreRol(user.role)}</strong>
                {user.empresa_carrier && <small>{user.empresa_carrier}</small>}
              </div>
              <div className="dropdown-divider"></div>
              <button
                onClick={() => alert("Ir a perfil")}
                className="dropdown-item"
              >
                <span>👤</span> Perfil
              </button>
              <button
                onClick={() => navigate("/cambiar-clave")}
                className="dropdown-item"
              >
                <span>🔑</span> Cambiar contraseña
              </button>

              {/* DEBUG: Mostrar información de permisos */}
              <div className="dropdown-divider"></div>
              <div
                className="dropdown-item debug-info"
                style={{ fontSize: "12px", color: "#ffffff" }}
              >
                <div>Rol: {user.role}</div>
                <div>Rutas disponibles: {rutas.length}</div>
                {user.permisos && <div>Permisos: {user.permisos.length}</div>}
              </div>

              <div className="dropdown-divider"></div>
              <button onClick={logout} className="dropdown-item logout">
                <span>🚪</span> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      <div
        className={`navbar-mobile-menu ${mobileMenuOpen ? "open" : ""}`}
        ref={mobileMenuRef}
      >
        <div className="mobile-menu-header">
          <div className="mobile-user-info">
            <div className="mobile-avatar">
              {user.email.charAt(0).toUpperCase()}
            </div>
            <div className="mobile-user-details">
              <span className="mobile-user-email">{user.email}</span>
              <span className="mobile-user-role">
                {getNombreRol(user.role)}
              </span>
              {user.empresa_carrier && (
                <span className="mobile-user-company">
                  🏢 {user.empresa_carrier}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mobile-menu-links">
          {rutas.length === 0 ? (
            <div className="mobile-menu-empty">
              <p>No hay rutas disponibles</p>
              <small>Rol: {user.role}</small>
              <small>Permisos: {user.permisos?.length || 0}</small>
            </div>
          ) : (
            rutas.map((ruta) => (
              <button
                key={ruta.path}
                className="mobile-menu-link"
                onClick={() => handleMobileNavigation(ruta.path)}
              >
                <div className="mobile-link-content">
                  {ruta.icon && (
                    <span className="mobile-nav-icon">{ruta.icon}</span>
                  )}
                  <span>{ruta.name}</span>
                </div>
                <span className="mobile-link-arrow">→</span>
              </button>
            ))
          )}
        </div>

        <div className="mobile-menu-footer">
          <button
            onClick={() => {
              navigate("/cambiar-clave");
              setMobileMenuOpen(false);
            }}
            className="mobile-menu-action"
          >
            <span>🔑</span> Cambiar contraseña
          </button>
          <button
            onClick={() => {
              logout();
              setMobileMenuOpen(false);
            }}
            className="mobile-menu-action logout"
          >
            <span>🚪</span> Cerrar sesión
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="mobile-menu-overlay"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </nav>
  );
}
