import { useState, useEffect, useCallback } from "react";
import { debounce } from "lodash";
import LoadingSpinner from "../LoadingSpinner";
import { useAuth } from "../../context/authContext";

interface Usuario {
  correo: string;
  nombre?: string;
  rol?: string;
}

interface Rol {
  id_rol: string;
  nombre_rol: string;
  descripcion?: string;
  ruta_defecto: string;
}

export default function FormCambiarRol() {
  const [correo, setCorreo] = useState("");
  const [nuevoRol, setNuevoRol] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [sugerencias, setSugerencias] = useState<Usuario[]>([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);  const [cargando, setCargando] = useState(false);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);
  const { user } = useAuth();

  // Obtener headers de autorización
  const getHeaders = () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    
    // Método 1: Token JWT (si existe)
    if (user?.token) {
      headers["Authorization"] = `Bearer ${user.token}`;
      console.log("🔐 Usando JWT para autenticación");
    }
    
    // Método 2: Headers X-User (siempre agregar como backup)
    if (user?.email && user?.role) {
      headers["X-User-Email"] = user.email;
      headers["X-User-Role"] = user.role;
      console.log("📤 Headers enviados:", headers);
    } else {
      console.warn("⚠️ Faltan datos de usuario para headers");
    }
    
    return headers;
  };
  // Cargar roles disponibles al montar el componente
  useEffect(() => {
    const cargarRoles = async () => {
      try {
        // Verificar que el usuario esté autenticado
        if (!user?.email || !user?.role) {
          throw new Error("Usuario no autenticado");
        }

        console.log("🔍 Cargando roles - Usuario actual:", user);
        
        const res = await fetch("http://127.0.0.1:8000/admin/roles", {
          headers: getHeaders(),
        });
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.detail || "Error al cargar roles");
        }
        
        const data = await res.json();
        console.log("✅ Roles cargados:", data);
        setRoles(data);
      } catch (err: any) {
        console.error("❌ Error cargando roles:", err);
        setError(
          err.message === "Usuario no autenticado"
            ? "Debes iniciar sesión para acceder a esta funcionalidad"
            : "No se pudieron cargar los roles. Verifica que tengas los permisos necesarios."
        );
      }
    };
    cargarRoles();
  }, [user]);
  // Función para buscar sugerencias de usuario
  const buscarSugerencias = useCallback(
    debounce(async (query: string) => {
      if (query.length < 2) {
        setSugerencias([]);
        return;
      }
      try {
        const res = await fetch(`http://127.0.0.1:8000/admin/buscar-usuarios?q=${query}`, {
          headers: getHeaders(),
        });
        if (!res.ok) throw new Error("Error al buscar usuarios");
        const data = await res.json();
        setSugerencias(data);
      } catch (err) {
        console.error("Error buscando usuarios:", err);
        setSugerencias([]);
      }
    }, 300),
    []
  );

  // Obtener detalles del usuario al seleccionar uno
  const obtenerDetallesUsuario = async (correoUsuario: string) => {
    try {
      setCargando(true);
      //Decodificar el correo
      const correoDecodificado = decodeURIComponent(correoUsuario);
      const res = await fetch(`http://127.0.0.1:8000/admin/obtener-usuario/${correoDecodificado}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error("Usuario no encontrado");
      const data = await res.json();
      setUsuarioActual(data);
      setNuevoRol(""); // Resetear el rol seleccionado
    } catch (err: any) {
      setError(err.message);
      setUsuarioActual(null);
    } finally {
      setCargando(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value;
    setCorreo(valor);
    setUsuarioActual(null);
    if (valor) {
      buscarSugerencias(valor);
      setMostrarSugerencias(true);
    } else {
      setSugerencias([]);
      setMostrarSugerencias(false);
    }
  };

  const seleccionarUsuario = (usuario: Usuario) => {
    setCorreo(usuario.correo);
    setSugerencias([]);
    setMostrarSugerencias(false);
    obtenerDetallesUsuario(usuario.correo);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje("");
    setError("");
    setCargando(true);

    try {
      const res = await fetch("http://127.0.0.1:8000/admin/cambiar-rol", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          correo,
          nuevo_rol: nuevoRol,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al cambiar rol");
      setMensaje("Rol actualizado exitosamente");
      // Decodificar el correo antes de pasarlo a obtenerDetallesUsuario
      await obtenerDetallesUsuario(correo); // Actualizar detalles del usuario
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <form className="form-admin" onSubmit={handleSubmit}>
      <h2>Cambiar Rol de Usuario</h2>
      {mensaje && <p className="success-msg">{mensaje}</p>}
      {error && <p className="error-msg">{error}</p>}

      <div className="form-group">
        <label>Correo del usuario:</label>
        <div className="input-with-suggestions">
          <input
            type="email"
            value={correo}
            onChange={handleInputChange}
            onFocus={() => correo && setMostrarSugerencias(true)}
            placeholder="Ingresa el correo del usuario"
            required
          />
          {mostrarSugerencias && sugerencias.length > 0 && (
            <ul className="suggestions-list">
              {sugerencias.map((usuario) => (
                <li
                  key={usuario.correo}
                  onClick={() => seleccionarUsuario(usuario)}
                >
                  <strong>{usuario.correo}</strong>
                  {usuario.nombre && <span> - {usuario.nombre}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {usuarioActual && (
        <div className="user-details">
          <p><strong>Usuario actual:</strong> {usuarioActual.nombre || usuarioActual.correo}</p>
          <p><strong>Rol actual:</strong> {usuarioActual.rol}</p>
        </div>
      )}

      <div className="form-group">
        <label>Nuevo rol:</label>
        <select 
          value={nuevoRol} 
          onChange={(e) => setNuevoRol(e.target.value)} 
          required
        >
          <option value="">-- Selecciona un nuevo rol --</option>          {roles.map((rol) => (
            <option key={rol.id_rol} value={rol.id_rol}>
              {rol.nombre_rol || rol.id_rol}
            </option>
          ))}
        </select>
      </div>

      <button 
        type="submit" 
        disabled={cargando || !correo || !nuevoRol || nuevoRol === usuarioActual?.rol}
      >
        {cargando ? <LoadingSpinner /> : "Actualizar Rol"}
      </button>
    </form>
  );
}
