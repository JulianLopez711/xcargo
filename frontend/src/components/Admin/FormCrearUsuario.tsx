import { useState, useEffect } from "react";

interface Rol {
  id_rol: string;
  nombre_rol: string;
  descripcion: string;
}

export default function FormCrearUsuario() {
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [telefono, setTelefono] = useState("");
  const [rol, setRol] = useState("");
  const [empresaCarrier, setEmpresaCarrier] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [roles, setRoles] = useState<Rol[]>([]);
  const [loading, setLoading] = useState(false);

  // Cargar roles disponibles
  useEffect(() => {
    const cargarRoles = async () => {
      try {
        const response = await fetch("http://localhost:8000/admin/roles-con-permisos");
        if (response.ok) {
          const data = await response.json();
          setRoles(data);
        } else {
          console.error("Error cargando roles");
        }
      } catch (error) {
        console.error("Error:", error);
      }
    };

    cargarRoles();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje("");
    setError("");
    setLoading(true);

    const formData = new FormData();
    formData.append("nombre", nombre);
    formData.append("correo", correo);
    formData.append("telefono", telefono);
    formData.append("rol", rol);
    
    // Agregar empresa si se especificó
    if (empresaCarrier) {
      formData.append("empresa_carrier", empresaCarrier);
    }

    try {
      const res = await fetch("http://localhost:8000/admin/crear-usuario", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al crear usuario");
      
      setMensaje(`${data.mensaje} - Clave por defecto: 123456`);
      // Limpiar formulario
      setNombre("");
      setCorreo("");
      setTelefono("");
      setRol("");
      setEmpresaCarrier("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const empresasDisponibles = [
    "XCARGO_PRINCIPAL",
    "LOGISTICA_NORTE",
    "TRANSPORTE_SUR", 
    "CARRIER_EXPRESS",
    "MOVIL_CARGO"
  ];

  return (
    <div className="form-container">
      <form className="form-admin" onSubmit={handleSubmit}>
        <h2>Crear Nuevo Usuario</h2>
        
        {mensaje && (
          <div className="success-msg">
            <span className="msg-icon">✅</span>
            <span>{mensaje}</span>
          </div>
        )}
        
        {error && (
          <div className="error-msg">
            <span className="msg-icon">❌</span>
            <span>{error}</span>
          </div>
        )}

        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="nombre">Nombre completo *</label>
            <input 
              id="nombre"
              type="text" 
              value={nombre} 
              onChange={(e) => setNombre(e.target.value)} 
              placeholder="Ej: Juan Pérez González"
              required 
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="correo">Correo electrónico *</label>
            <input 
              id="correo"
              type="email" 
              value={correo} 
              onChange={(e) => setCorreo(e.target.value)} 
              placeholder="juan.perez@x-cargo.co"
              required 
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="telefono">Teléfono *</label>
            <input 
              id="telefono"
              type="text" 
              value={telefono} 
              onChange={(e) => setTelefono(e.target.value)} 
              placeholder="+57 300 123 4567"
              required 
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="rol">Rol *</label>
            <select 
              id="rol"
              value={rol} 
              onChange={(e) => setRol(e.target.value)} 
              required
              disabled={loading}
            >
              <option value="">-- Selecciona un rol --</option>
              {roles.map((r) => (
                <option key={r.id_rol} value={r.id_rol}>
                  {r.nombre_rol}
                  {r.descripcion && ` - ${r.descripcion}`}
                </option>
              ))}
            </select>
            <small className="form-help">
              Los roles y permisos se pueden configurar en la sección "Roles y Permisos"
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="empresa">Empresa/Carrier</label>
            <select 
              id="empresa"
              value={empresaCarrier} 
              onChange={(e) => setEmpresaCarrier(e.target.value)}
              disabled={loading}
            >
              <option value="">-- Selecciona empresa (opcional) --</option>
              {empresasDisponibles.map((empresa) => (
                <option key={empresa} value={empresa}>
                  {empresa.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <small className="form-help">
              Solo necesario para roles de Supervisor o Conductor
            </small>
          </div>
        </div>

        <div className="form-actions">
          <button 
            type="submit" 
            className="btn-primary"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="loading-spinner"></span>
                Creando usuario...
              </>
            ) : (
              <>
                <span>✨ Crear Usuario</span>
              </>
            )}
          </button>
        </div>

        <div className="form-info">
          <div className="info-card">
            <h4>📋 Información importante:</h4>
            <ul>
              <li>• La clave por defecto será <strong>123456</strong></li>
              <li>• El usuario deberá cambiar la clave en su primer acceso</li>
              <li>• Los permisos dependen del rol asignado</li>
              <li>• Para roles de Supervisor, asignar empresa/carrier</li>
            </ul>
          </div>
        </div>
      </form>
    </div>
  );
}