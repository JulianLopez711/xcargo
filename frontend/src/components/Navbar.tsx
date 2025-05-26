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
import { supervisorRoutes } from "../routes/supervisorRoutes/supervisorRoutes"; // AGREGADO

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // ACTUALIZADO: Agregado supervisor
  const rutasPorRol: Record<string, { name: string; path: string; icon?: string }[]> = {
    admin: adminRoutes,
    contabilidad: contabilidadRoutes,
    conductor: conductorRoutes,
    operador: operadorRoutes,
    supervisor: supervisorRoutes, // AGREGADO
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setMenuAbierto(false);
    }
    if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
      setMobileMenuOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  // MEJORADO: Obtener rutas basadas en permisos si están disponibles
  const getRutasDisponibles = () => {
  // Filtra rutas según permisos específicos del usuario
  if (user.permisos && user.permisos.length > 0) {
    const rutasPorRolUsuario = rutasPorRol[user.role] || [];
    return rutasPorRolUsuario.filter(ruta => {
      if ('permission' in ruta) {
        return user.permisos!.some(permiso => permiso.id === ruta.permission);
      }
      return true;
    });
  }
  return rutasPorRol[user.role] || [];
};

  const rutas = getRutasDisponibles();

  const handleMobileNavigation = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  // MEJORADO: Función para obtener el nombre del rol más amigable
  const getNombreRol = (role: string) => {
    const nombres: Record<string, string> = {
      admin: "Administrador",
      contabilidad: "Contabilidad", 
      conductor: "Conductor",
      operador: "Operador",
      supervisor: "Supervisor" // AGREGADO
    };
    return nombres[role] || role;
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Logo */}
        <div className="navbar-logo" >
          <img src={logo} alt="Logo XCargo" />
        </div>

        {/* Desktop Navigation */}
        <div className="navbar-links">
          {rutas.map((ruta) => (
            <button
              key={ruta.path}
              className="navbar-link"
              onClick={() => navigate(ruta.path)}
              title={`Ir a ${ruta.name}`}
            >
              {/* Mostrar ícono si está disponible */}
              {'icon' in ruta && ruta.icon && (
                <span className="nav-icon">{ruta.icon}</span>
              )}
              {ruta.name}
            </button>
          ))}
        </div>

        {/* Mobile Menu Button */}
        <button 
          className="navbar-mobile-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Abrir menú"
        >
          <span className={`hamburger ${mobileMenuOpen ? 'open' : ''}`}>
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
                {user.empresa_carrier && (
                  <small>{user.empresa_carrier}</small>
                )}
              </div>
              <div className="dropdown-divider"></div>
              <button onClick={() => alert("Ir a perfil")} className="dropdown-item">
                <span>👤</span> Perfil
              </button>
              <button onClick={() => navigate("/cambiar-clave")} className="dropdown-item">
                <span>🔑</span> Cambiar contraseña
              </button>
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
        className={`navbar-mobile-menu ${mobileMenuOpen ? 'open' : ''}`}
        ref={mobileMenuRef}
      >
        <div className="mobile-menu-header">
          <div className="mobile-user-info">
            <div className="mobile-avatar">
              {user.email.charAt(0).toUpperCase()}
            </div>
            <div className="mobile-user-details">
              <span className="mobile-user-email">{user.email}</span>
              <span className="mobile-user-role">{getNombreRol(user.role)}</span>
              {user.empresa_carrier && (
                <span className="mobile-user-company">🏢 {user.empresa_carrier}</span>
              )}
            </div>
          </div>
        </div>
        
        <div className="mobile-menu-links">
          {rutas.map((ruta) => (
            <button
              key={ruta.path}
              className="mobile-menu-link"
              onClick={() => handleMobileNavigation(ruta.path)}
            >
              <div className="mobile-link-content">
                {'icon' in ruta && ruta.icon && (
                  <span className="mobile-nav-icon">{ruta.icon}</span>
                )}
                <span>{ruta.name}</span>
              </div>
              <span className="mobile-link-arrow">→</span>
            </button>
          ))}
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