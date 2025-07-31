import { useState, useEffect } from "react";
import { useAuth } from "../../context/authContext";
import "../../styles/admin/AdminDashboard.css";

interface Rol {
  id_rol: string;
  nombre_rol: string;
  descripcion: string;
  ruta_defecto: string;
}

interface NuevoUsuario {
  id_usuario: string;
  nombre: string;
  correo: string;
  telefono: string;
  rol: string;
  empresa_carrier: string;
}

interface SugerenciaUsuario {
  correo: string;
  nombre: string;
  empresa_carrier: string;
}

export default function FormCrearUsuario() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [roles, setRoles] = useState<Rol[]>([]);
  const [sugerencias, setSugerencias] = useState<SugerenciaUsuario[]>([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);

  const [usuario, setUsuario] = useState<NuevoUsuario>({
    id_usuario: '',
    nombre: "",
    correo: "",
    telefono: "",
    rol: "",
    empresa_carrier: ""
  });

  useEffect(() => {
    cargarRoles();
  }, []);

  const cargarRoles = async () => {
    try {
      console.log("🔍 Cargando roles - Usuario actual:", user);
      
      // Construir headers de autenticación como en Dashboard
      const headers: Record<string, string> = {};
      
      // Método 1: Token JWT (si existe)
      if (user?.token) {
        headers["Authorization"] = `Bearer ${user.token}`;
        console.log("🔐 Usando JWT para cargar roles");
      }
      
      // Método 2: Headers X-User (siempre agregar como backup)
      if (user?.email && user?.role) {
        headers["X-User-Email"] = user.email;
        headers["X-User-Role"] = user.role;
        console.log("📤 Headers enviados:", headers);
      } else {
        console.warn("⚠️ Faltan datos de usuario para headers");
      }

      const response = await fetch("http://127.0.0.1:8000/admin/roles", {
        headers: headers
      });

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Roles cargados:", data);
        setRoles(Array.isArray(data) ? data : []);
      } else {
        console.error("❌ Error HTTP al cargar roles:", response.status);
        
        // Si falla, usar roles por defecto
        console.log("🔄 Usando roles por defecto");
        setRoles([
          { id_rol: "admin", nombre_rol: "Administrador", descripcion: "Acceso completo", ruta_defecto: "/admin/dashboard" },
          { id_rol: "contabilidad", nombre_rol: "Contabilidad", descripcion: "Gestión financiera", ruta_defecto: "/contabilidad/dashboard" },
          { id_rol: "supervisor", nombre_rol: "Supervisor", descripcion: "Supervisión de operaciones", ruta_defecto: "/supervisor/dashboard" },
          { id_rol: "operador", nombre_rol: "Operador", descripcion: "Operaciones básicas", ruta_defecto: "/operador/dashboard" },
          { id_rol: "conductor", nombre_rol: "Conductor", descripcion: "Acceso para conductores", ruta_defecto: "/conductor/dashboard" }
        ]);
      }
    } catch (error) {
      console.error("❌ Error cargando roles:", error);
      
      // Usar roles por defecto en caso de error
      setRoles([
        { id_rol: "admin", nombre_rol: "Administrador", descripcion: "Acceso completo", ruta_defecto: "/admin/dashboard" },
        { id_rol: "contabilidad", nombre_rol: "Contabilidad", descripcion: "Gestión financiera", ruta_defecto: "/contabilidad/dashboard" },
        { id_rol: "supervisor", nombre_rol: "Supervisor", descripcion: "Supervisión de operaciones", ruta_defecto: "/supervisor/dashboard" },
        { id_rol: "operador", nombre_rol: "Operador", descripcion: "Operaciones básicas", ruta_defecto: "/operador/dashboard" },
        { id_rol: "conductor", nombre_rol: "Conductor", descripcion: "Acceso para conductores", ruta_defecto: "/conductor/dashboard" }
      ]);
    }
  };

  const mostrarMensaje = (texto: string, tipo: "success" | "error" = "success") => {
    setMessage(texto);
    setMessageType(tipo);
    setTimeout(() => setMessage(""), 5000);
  };

  const validarFormulario = (): boolean => {
    if (!usuario.nombre.trim()) {
      mostrarMensaje("El nombre es requerido", "error");
      return false;
    }

    if (!usuario.correo.trim()) {
      mostrarMensaje("El correo es requerido", "error");
      return false;
    }

    // Validar formato de correo
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(usuario.correo)) {
      mostrarMensaje("El formato del correo no es válido", "error");
      return false;
    }

    if (!usuario.telefono.trim()) {
      mostrarMensaje("El teléfono es requerido", "error");
      return false;
    }

    if (!usuario.rol) {
      mostrarMensaje("Selecciona un rol", "error");
      return false;
    }

    return true;
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validarFormulario()) {
      return;
    }

    setLoading(true);

    try {
      // Generar ID único para el usuario
      console.log("📤 Enviando datos de usuario:", {
        nombre: usuario.nombre,
        correo: usuario.correo,
        telefono: usuario.telefono,
        rol: usuario.rol,
        empresa_carrier: usuario.empresa_carrier
      });

      const formData = new FormData();
      formData.append("nombre", usuario.nombre.trim());
      formData.append("correo", usuario.correo.toLowerCase().trim());
      formData.append("telefono", usuario.telefono.trim());
      formData.append("rol", usuario.rol);
      formData.append("empresa_carrier", usuario.empresa_carrier.trim());

      // Construir headers de autenticación igual que en cargarRoles
      const headers: Record<string, string> = {};
      
      // Método 1: Token JWT (si existe)
      if (user?.token) {
        headers["Authorization"] = `Bearer ${user.token}`;
      }
      
      // Método 2: Headers X-User (siempre agregar como backup)
      if (user?.email && user?.role) {
        headers["X-User-Email"] = user.email;
        headers["X-User-Role"] = user.role;
      }

      console.log("📤 Headers enviados al crear usuario:", headers);

      const response = await fetch("http://127.0.0.1:8000/admin/crear-usuario", {
        method: "POST",
        headers: headers, // Solo headers de auth, NO Content-Type para FormData
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Usuario creado exitosamente:", data);
        
        mostrarMensaje(
          `✅ Usuario creado exitosamente. Contraseña temporal: 123456`,
          "success"
        );

        // Resetear formulario
        setUsuario({
          id_usuario: '',
          nombre: "",
          correo: "",
          telefono: "",
          rol: "",
          empresa_carrier: ""
        });

      } else {
        const errorData = await response.json();
        console.error("❌ Error del servidor:", errorData);
        throw new Error(errorData.detail || `Error HTTP ${response.status}`);
      }
    } catch (error) {
      console.error("❌ Error creando usuario:", error);
      mostrarMensaje(
        `❌ Error al crear usuario: ${error instanceof Error ? error.message : "Error desconocido"}`,
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof NuevoUsuario, value: string) => {
    setUsuario(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const sugerirEmpresaCarrier = (rol: string) => {
    switch (rol) {
      case "admin":
      case "contabilidad":
      case "supervisor":
      case "operador":
        return "X-Cargo";
      case "conductor":
        return ""; // Los conductores pueden tener diferentes carriers
      default:
        return "";
    }
  };

  const handleRolChange = (nuevoRol: string) => {
    handleInputChange("rol", nuevoRol);
    // Auto-sugerir empresa carrier basado en el rol
    const empresaSugerida = sugerirEmpresaCarrier(nuevoRol);
    if (empresaSugerida) {
      handleInputChange("empresa_carrier", empresaSugerida);
    }
  };

  // Función para buscar sugerencias
  const buscarSugerencias = async (query: string) => {
    if (!query || query.length < 3) {
      setSugerencias([]);
      setMostrarSugerencias(false);
      return;
    }

    try {
      const headers: Record<string, string> = {};
      if (user?.token) {
        headers["Authorization"] = `Bearer ${user.token}`;
      }
      if (user?.email && user?.role) {
        headers["X-User-Email"] = user.email;
        headers["X-User-Role"] = user.role;
      }

      const response = await fetch(`http://127.0.0.1:8000/admin/buscar-usuarios?q=${encodeURIComponent(query)}`, {
        headers
      });

      if (response.ok) {
        const data = await response.json();
        setSugerencias(data);
        setMostrarSugerencias(true);
      }
    } catch (error) {
      console.error("Error buscando sugerencias:", error);
      setSugerencias([]);
      setMostrarSugerencias(false);
    }
  };

  // Función para seleccionar una sugerencia
  const seleccionarSugerencia = (sugerencia: SugerenciaUsuario) => {
    setUsuario(prev => ({
      ...prev,
      correo: sugerencia.correo,
      nombre: sugerencia.nombre,
      empresa_carrier: sugerencia.empresa_carrier || prev.empresa_carrier
    }));
    setMostrarSugerencias(false);
  };

  // Manejar cambios en el campo de correo con debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (usuario.correo) {
        buscarSugerencias(usuario.correo);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [usuario.correo]);

  // Generar ID único para el usuario
  return (
    <div className="form-crear-usuario">
      <h2>Crear Nuevo Usuario</h2>

      {message && (
        <div className={`message ${messageType}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="usuario-form">
        <div className="form-group">
          <label htmlFor="correo">Correo electrónico:</label>
          <div className="input-sugerencias-container">
            <input
              type="email"
              id="correo"
              value={usuario.correo}
              onChange={(e) => {
                handleInputChange("correo", e.target.value);
                // El ID se generará al momento de crear el usuario
              }}
              required
            />
            {mostrarSugerencias && sugerencias.length > 0 && (
              <div className="sugerencias-dropdown">
                {sugerencias.map((sugerencia, index) => (
                  <div
                    key={index}
                    className="sugerencia-item"
                    onClick={() => seleccionarSugerencia(sugerencia)}
                  >
                    <div className="sugerencia-principal">
                      {sugerencia.correo}
                    </div>
                    <div className="sugerencia-secundaria">
                      {sugerencia.nombre} - {sugerencia.empresa_carrier || "Sin empresa"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="nombre">Nombre completo:</label>
          <input
            type="text"
            id="nombre"
            value={usuario.nombre}
            onChange={(e) => handleInputChange("nombre", e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="telefono">Teléfono:</label>
          <input
            type="tel"
            id="telefono"
            value={usuario.telefono}
            onChange={(e) => handleInputChange("telefono", e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="rol">Rol:</label>
          <select
            id="rol"
            value={usuario.rol}
            onChange={(e) => handleRolChange(e.target.value)}
            required
          >
            <option value="">Selecciona un rol</option>
            {roles.map((rol) => (
              <option key={rol.id_rol} value={rol.id_rol}>
                {rol.nombre_rol}
              </option>
            ))}
          </select>
        </div>

        {(usuario.rol === "conductor" || usuario.rol === "operador") && (
          <div className="form-group">
            <label htmlFor="empresa_carrier">Empresa/Carrier:</label>
            <input
              type="text"
              id="empresa_carrier"
              value={usuario.empresa_carrier}
              onChange={(e) => handleInputChange("empresa_carrier", e.target.value)}
            />
          </div>
        )}

        <button type="submit" disabled={loading}>
          {loading ? "Creando..." : "Crear Usuario"}
        </button>
      </form>
    </div>
  );
}