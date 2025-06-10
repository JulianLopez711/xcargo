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
  nombre: string;
  correo: string;
  telefono: string;
  rol: string;
  empresa_carrier: string;
}

export default function FormCrearUsuario() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [roles, setRoles] = useState<Rol[]>([]);

  const [usuario, setUsuario] = useState<NuevoUsuario>({
    nombre: "",
    correo: "",
    telefono: "",
    rol: "",
    empresa_carrier: ""
  });

  useEffect(() => {
<<<<<<< HEAD
    const cargarRoles = async () => {
      try {
        // ✅ CORRECCIÓN: Usar headers correctos
        const response = await fetch("https://api.x-cargo.co/admin/roles-con-permisos", {
          headers: {
            "X-User-Email": user?.email || "",
            "X-User-Role": user?.role || "admin"
          },
        });

        if (response.ok) {
          const data = await response.json();

          setRoles(Array.isArray(data) ? data : []); // ← VALIDAR ARRAY
        } else {
          console.error("❌ Error cargando roles:", response.status);
          setRoles([]); // ← FALLBACK
        }
      } catch (error) {
        console.error("❌ Error en fetch de roles:", error);
        setRoles([]); // ← FALLBACK
      }
    };

=======
>>>>>>> Pruebas
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

      const response = await fetch("https://api.x-cargo.co/admin/roles", {
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
<<<<<<< HEAD
      // ✅ CORRECCIÓN: Agregar headers de autenticación
      const res = await fetch("https://api.x-cargo.co/admin/crear-usuario", {
        method: "POST",
        headers: {
          "X-User-Email": user?.email || "",
          "X-User-Role": user?.role || "admin"
        },
        body: formData,
=======
      console.log("📤 Enviando datos de usuario:", {
        nombre: usuario.nombre,
        correo: usuario.correo,
        telefono: usuario.telefono,
        rol: usuario.rol,
        empresa_carrier: usuario.empresa_carrier
>>>>>>> Pruebas
      });

      const formData = new FormData();
      formData.append("nombre", usuario.nombre.trim());
      formData.append("correo", usuario.correo.toLowerCase().trim());
      formData.append("telefono", usuario.telefono.trim());
      formData.append("rol", usuario.rol);
      formData.append("empresa_carrier", usuario.empresa_carrier.trim());

      // Construir headers de autenticación igual que en cargarRoles
      const headers: Record<string, string> = {};
      
<<<<<<< HEAD
      setMensaje(`${data.mensaje} - Clave por defecto: Xcargo123`);
      // Limpiar formulario
      setNombre("");
      setCorreo("");
      setTelefono("");
      setRol("");
      setEmpresaCarrier("");
    } catch (err: any) {
      setError(err.message);
=======
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

      const response = await fetch("https://api.x-cargo.co/admin/crear-usuario", {
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
>>>>>>> Pruebas
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

  return (
    <div className="form-crear-usuario">
      <div className="form-header">
        <h2>👤 Crear Nuevo Usuario</h2>
        <p>Registra un nuevo usuario en el sistema XCargo</p>
      </div>

      {message && (
        <div className={`message ${messageType}`}>
          <span className="message-icon">
            {messageType === "success" ? "✅" : "❌"}
          </span>
          <span className="message-text">{message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="usuario-form">
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="nombre">
              <span className="label-icon">👤</span>
              Nombre Completo *
            </label>
            <input
              type="text"
              id="nombre"
              value={usuario.nombre}
              onChange={(e) => handleInputChange("nombre", e.target.value)}
              placeholder="Ej: Juan Carlos Pérez"
              required
              disabled={loading}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="correo">
              <span className="label-icon">📧</span>
              Correo Electrónico *
            </label>
            <input
              type="email"
              id="correo"
              value={usuario.correo}
              onChange={(e) => handleInputChange("correo", e.target.value)}
              placeholder="Ej: juan.perez@x-cargo.co"
              required
              disabled={loading}
              className="form-input"
            />
            <small className="form-hint">
              Se enviará la contraseña temporal a este correo
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="telefono">
              <span className="label-icon">📱</span>
              Teléfono *
            </label>
            <input
              type="tel"
              id="telefono"
              value={usuario.telefono}
              onChange={(e) => handleInputChange("telefono", e.target.value)}
              placeholder="Ej: +57 300 123 4567"
              required
              disabled={loading}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="rol">
              <span className="label-icon">🏷️</span>
              Rol en el Sistema *
            </label>
            <select
              id="rol"
              value={usuario.rol}
              onChange={(e) => handleRolChange(e.target.value)}
              required
              disabled={loading}
              className="form-select"
            >
              <option value="">Seleccionar rol...</option>
              {roles.map((rol) => (
                <option key={rol.id_rol} value={rol.id_rol}>
                  {rol.nombre_rol} - {rol.descripcion}
                </option>
              ))}
            </select>
            {usuario.rol && (
              <small className="form-hint">
                Ruta por defecto: {roles.find(r => r.id_rol === usuario.rol)?.ruta_defecto || "No definida"}
              </small>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="empresa_carrier">
              <span className="label-icon">🏢</span>
              Empresa/Carrier
            </label>
            <input
              type="text"
              id="empresa_carrier"
              value={usuario.empresa_carrier}
              onChange={(e) => handleInputChange("empresa_carrier", e.target.value)}
              placeholder="Ej: X-Cargo, LogiTech Corp"
              disabled={loading}
              className="form-input"
            />
            <small className="form-hint">
              Para usuarios administrativos usar "X-Cargo". Para conductores, especificar el carrier asignado.
            </small>
          </div>
        </div>

        <div className="form-preview">
          <h3>👀 Vista Previa</h3>
          <div className="preview-content">
            <div className="preview-item">
              <strong>Nombre:</strong> {usuario.nombre || "Sin especificar"}
            </div>
            <div className="preview-item">
              <strong>Correo:</strong> {usuario.correo || "Sin especificar"}
            </div>
            <div className="preview-item">
              <strong>Teléfono:</strong> {usuario.telefono || "Sin especificar"}
            </div>
            <div className="preview-item">
              <strong>Rol:</strong> {
                usuario.rol 
                  ? roles.find(r => r.id_rol === usuario.rol)?.nombre_rol || usuario.rol
                  : "Sin especificar"
              }
            </div>
            <div className="preview-item">
              <strong>Empresa:</strong> {usuario.empresa_carrier || "Sin especificar"}
            </div>
            <div className="preview-item">
              <strong>Contraseña inicial:</strong> <code>123456</code> (debe cambiarla en el primer login)
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            onClick={() => setUsuario({
              nombre: "",
              correo: "",
              telefono: "",
              rol: "",
              empresa_carrier: ""
            })}
            disabled={loading}
            className="btn-secondary"
          >
            🗑️ Limpiar Formulario
          </button>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
          >
            {loading ? (
              <>
                <span className="loading-spinner"></span>
                Creando Usuario...
              </>
            ) : (
              <>
                ✨ Crear Usuario
              </>
            )}
          </button>
        </div>
<<<<<<< HEAD

        <div className="form-info">
          <div className="info-card">
            <h4>📋 Información importante:</h4>
            <ul>
              <li>• La clave por defecto será <strong>Xcargo123</strong></li>
              <li>• El usuario deberá cambiar la clave en su primer acceso</li>
              <li>• Los permisos dependen del rol asignado</li>
              <li>• Para roles de Supervisor, asignar empresa/carrier</li>
            </ul>
          </div>
        </div>
=======
>>>>>>> Pruebas
      </form>

      <div className="form-info">
        <h3>ℹ️ Información Importante</h3>
        <ul>
          <li>El usuario recibirá una contraseña temporal: <strong>Xcargo123</strong></li>
          <li>Debe cambiar la contraseña en el primer login</li>
          <li>Los permisos dependen del rol asignado</li>
          <li>Para conductores, asegúrate de que existan en la tabla usuarios_BIG</li>
          <li>El correo debe ser único en el sistema</li>
        </ul>
      </div>
    </div>
  );
}