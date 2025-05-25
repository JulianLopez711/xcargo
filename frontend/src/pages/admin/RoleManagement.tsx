import { useEffect, useState } from "react";
import "../../styles/admin/RoleManagement.css";

interface Permiso {
  id_permiso: string;
  nombre: string;
  descripcion: string;
  modulo: string;
  ruta: string;
}

interface Rol {
  id_rol: string;
  nombre_rol: string;
  descripcion: string;
  ruta_defecto: string;
  permisos: Array<{
    id_permiso: string;
    permiso_nombre: string;
    modulo: string;
  }>;
}

interface NuevoRol {
  id_rol: string;
  nombre_rol: string;
  descripcion: string;
  ruta_defecto: string;
  permisos_seleccionados: string[];
}

interface NuevoPermiso {
  id_permiso: string;
  nombre: string;
  descripcion: string;
  modulo: string;
  ruta: string;
}

export default function RoleManagement() {
  const [activeTab, setActiveTab] = useState("gestionar");
  const [roles, setRoles] = useState<Rol[]>([]);
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Estados para crear rol
  const [nuevoRol, setNuevoRol] = useState<NuevoRol>({
    id_rol: "",
    nombre_rol: "",
    descripcion: "",
    ruta_defecto: "",
    permisos_seleccionados: []
  });

  // Estados para crear permiso
  const [nuevoPermiso, setNuevoPermiso] = useState<NuevoPermiso>({
    id_permiso: "",
    nombre: "",
    descripcion: "",
    modulo: "",
    ruta: ""
  });

  // Cargar datos iniciales
  useEffect(() => {
    cargarRoles();
    cargarPermisos();
  }, []);

  const cargarRoles = async () => {
    try {
      const response = await fetch("http://localhost:8000/admin/roles-con-permisos");
      const data = await response.json();
      setRoles(data);
    } catch (error) {
      console.error("Error cargando roles:", error);
      mostrarMensaje("Error al cargar roles", "error");
    }
  };

  const cargarPermisos = async () => {
    try {
      const response = await fetch("http://localhost:8000/admin/permisos");
      const data = await response.json();
      setPermisos(data);
    } catch (error) {
      console.error("Error cargando permisos:", error);
    }
  };

  const mostrarMensaje = (texto: string, tipo: "success" | "error" = "success") => {
    setMessage(texto);
    setTimeout(() => setMessage(""), 3000);
  };

  // Agrupar permisos por módulo
  const permisosPorModulo = permisos.reduce((acc, permiso) => {
    if (!acc[permiso.modulo]) {
      acc[permiso.modulo] = [];
    }
    acc[permiso.modulo].push(permiso);
    return acc;
  }, {} as Record<string, Permiso[]>);

  // Verificar si un rol tiene un permiso específico
  const rolTienePermiso = (rol: Rol, permisoId: string): boolean => {
    return rol.permisos?.some(p => p.id_permiso === permisoId) || false;
  };

  // Actualizar permisos de un rol
  const actualizarPermisosRol = async (idRol: string, permisosIds: string[]) => {
    setLoading(true);
    try {
      const formData = new FormData();
      permisosIds.forEach(id => formData.append('permisos_ids', id));

      const response = await fetch(`http://localhost:8000/admin/rol/${idRol}/permisos`, {
        method: "POST",
        body: formData
      });

      if (response.ok) {
        await cargarRoles();
        mostrarMensaje("Permisos actualizados correctamente");
      } else {
        throw new Error("Error al actualizar permisos");
      }
    } catch (error) {
      console.error("Error:", error);
      mostrarMensaje("Error al actualizar permisos", "error");
    } finally {
      setLoading(false);
    }
  };

  // Toggle permiso de un rol
  const togglePermisoRol = async (rol: Rol, permisoId: string) => {
    const permisosActuales = rol.permisos?.map(p => p.id_permiso) || [];
    let nuevosPermisos: string[];

    if (permisosActuales.includes(permisoId)) {
      // Quitar permiso
      nuevosPermisos = permisosActuales.filter(id => id !== permisoId);
    } else {
      // Agregar permiso
      nuevosPermisos = [...permisosActuales, permisoId];
    }

    await actualizarPermisosRol(rol.id_rol, nuevosPermisos);
  };

  // Crear nuevo rol
  const crearRol = async () => {
    if (!nuevoRol.id_rol || !nuevoRol.nombre_rol) {
      mostrarMensaje("Completa los campos requeridos", "error");
      return;
    }

    setLoading(true);
    try {
      // 1. Crear el rol
      const formDataRol = new FormData();
      formDataRol.append("id_rol", nuevoRol.id_rol);
      formDataRol.append("nombre_rol", nuevoRol.nombre_rol);
      formDataRol.append("descripcion", nuevoRol.descripcion);

      const responseRol = await fetch("http://localhost:8000/admin/crear-rol", {
        method: "POST",
        body: formDataRol
      });

      if (!responseRol.ok) throw new Error("Error creando rol");

      // 2. Asignar ruta por defecto si se especificó
      if (nuevoRol.ruta_defecto) {
        const formDataRuta = new FormData();
        formDataRuta.append("ruta_defecto", nuevoRol.ruta_defecto);

        await fetch(`http://localhost:8000/admin/rol/${nuevoRol.id_rol}/ruta-defecto`, {
          method: "POST",
          body: formDataRuta
        });
      }

      // 3. Asignar permisos si se seleccionaron
      if (nuevoRol.permisos_seleccionados.length > 0) {
        await actualizarPermisosRol(nuevoRol.id_rol, nuevoRol.permisos_seleccionados);
      }

      // 4. Resetear formulario y actualizar lista
      setNuevoRol({
        id_rol: "",
        nombre_rol: "",
        descripcion: "",
        ruta_defecto: "",
        permisos_seleccionados: []
      });

      await cargarRoles();
      mostrarMensaje("Rol creado exitosamente");
      setActiveTab("gestionar");

    } catch (error) {
      console.error("Error:", error);
      mostrarMensaje("Error al crear rol", "error");
    } finally {
      setLoading(false);
    }
  };

  // Crear nuevo permiso
  const crearPermiso = async () => {
    if (!nuevoPermiso.id_permiso || !nuevoPermiso.nombre || !nuevoPermiso.modulo) {
      mostrarMensaje("Completa los campos requeridos", "error");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("id_permiso", nuevoPermiso.id_permiso);
      formData.append("nombre", nuevoPermiso.nombre);
      formData.append("descripcion", nuevoPermiso.descripcion);
      formData.append("modulo", nuevoPermiso.modulo);
      formData.append("ruta", nuevoPermiso.ruta);

      const response = await fetch("http://localhost:8000/admin/crear-permiso", {
        method: "POST",
        body: formData
      });

      if (response.ok) {
        setNuevoPermiso({
          id_permiso: "",
          nombre: "",
          descripcion: "",
          modulo: "",
          ruta: ""
        });
        await cargarPermisos();
        mostrarMensaje("Permiso creado exitosamente");
      } else {
        throw new Error("Error creando permiso");
      }
    } catch (error) {
      console.error("Error:", error);
      mostrarMensaje("Error al crear permiso", "error");
    } finally {
      setLoading(false);
    }
  };

  // Toggle permiso en nuevo rol
  const togglePermisoNuevoRol = (permisoId: string) => {
    const permisos = nuevoRol.permisos_seleccionados;
    if (permisos.includes(permisoId)) {
      setNuevoRol({
        ...nuevoRol,
        permisos_seleccionados: permisos.filter(id => id !== permisoId)
      });
    } else {
      setNuevoRol({
        ...nuevoRol,
        permisos_seleccionados: [...permisos, permisoId]
      });
    }
  };

  return (
    <div className="role-management">
      <div className="header">
        <h1>🔐 Sistema de Permisos</h1>
        <p>Configura roles y permisos para tu equipo XCargo</p>
      </div>

      {message && (
        <div className={`message ${message.includes("Error") ? "error" : "success"}`}>
          {message}
        </div>
      )}

      <div className="tabs">
        <button 
          className={`tab ${activeTab === "gestionar" ? "active" : ""}`}
          onClick={() => setActiveTab("gestionar")}
        >
          Gestionar Roles
        </button>
        <button 
          className={`tab ${activeTab === "crear-rol" ? "active" : ""}`}
          onClick={() => setActiveTab("crear-rol")}
        >
          Crear Nuevo Rol
        </button>
        <button 
          className={`tab ${activeTab === "crear-permiso" ? "active" : ""}`}
          onClick={() => setActiveTab("crear-permiso")}
        >
          Crear Permiso
        </button>
      </div>

      <div className="content">
        {/* GESTIONAR ROLES */}
        {activeTab === "gestionar" && (
          <div className="section">
            {roles.map((rol) => (
              <div key={rol.id_rol} className="role-card">
                <div className="role-header">
                  <div className="role-info">
                    <h3>{rol.nombre_rol}</h3>
                    <p>{rol.descripcion}</p>
                    {rol.ruta_defecto && (
                      <small>Ruta por defecto: {rol.ruta_defecto}</small>
                    )}
                  </div>
                  <div className="role-stats">
                    <span className="stat">
                      {rol.permisos?.length || 0} permisos
                    </span>
                  </div>
                </div>

                <div className="permissions-grid">
                  {Object.entries(permisosPorModulo).map(([modulo, permisosModulo]) => (
                    <div key={modulo} className="module-section">
                      <div className="module-header">
                        <h4>{modulo}</h4>
                      </div>
                      <div className="permissions-list">
                        {permisosModulo.map((permiso) => (
                          <div key={permiso.id_permiso} className="permission-item">
                            <div className="permission-info">
                              <div className="permission-name">{permiso.nombre}</div>
                              <div className="permission-desc">{permiso.descripcion}</div>
                            </div>
                            <label className="toggle-switch">
                              <input
                                type="checkbox"
                                checked={rolTienePermiso(rol, permiso.id_permiso)}
                                onChange={() => togglePermisoRol(rol, permiso.id_permiso)}
                                disabled={loading}
                              />
                              <span className="slider"></span>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CREAR NUEVO ROL */}
        {activeTab === "crear-rol" && (
          <div className="section">
            <div className="create-form">
              <div className="form-grid">
                <div className="form-section">
                  <h3>Información del Rol</h3>
                  
                  <div className="form-group">
                    <label>ID del Rol *</label>
                    <input
                      type="text"
                      value={nuevoRol.id_rol}
                      onChange={(e) => setNuevoRol({...nuevoRol, id_rol: e.target.value})}
                      placeholder="ej: supervisor_entregas"
                    />
                  </div>

                  <div className="form-group">
                    <label>Nombre del Rol *</label>
                    <input
                      type="text"
                      value={nuevoRol.nombre_rol}
                      onChange={(e) => setNuevoRol({...nuevoRol, nombre_rol: e.target.value})}
                      placeholder="ej: Supervisor de Entregas"
                    />
                  </div>

                  <div className="form-group">
                    <label>Descripción</label>
                    <textarea
                      value={nuevoRol.descripcion}
                      onChange={(e) => setNuevoRol({...nuevoRol, descripcion: e.target.value})}
                      placeholder="Describe las responsabilidades..."
                    />
                  </div>

                  <div className="form-group">
                    <label>Ruta por Defecto</label>
                    <input
                      type="text"
                      value={nuevoRol.ruta_defecto}
                      onChange={(e) => setNuevoRol({...nuevoRol, ruta_defecto: e.target.value})}
                      placeholder="ej: /supervisor/dashboard"
                    />
                  </div>

                  <button 
                    className="btn-primary"
                    onClick={crearRol}
                    disabled={loading}
                  >
                    {loading ? "Creando..." : "✨ Crear Rol"}
                  </button>
                </div>

                <div className="form-section">
                  <h3>Seleccionar Permisos</h3>
                  
                  {Object.entries(permisosPorModulo).map(([modulo, permisosModulo]) => (
                    <div key={modulo} className="module-section">
                      <div className="module-header">
                        <h4>{modulo}</h4>
                      </div>
                      <div className="permissions-list">
                        {permisosModulo.map((permiso) => (
                          <div key={permiso.id_permiso} className="permission-item">
                            <div className="permission-info">
                              <div className="permission-name">{permiso.nombre}</div>
                              <div className="permission-desc">{permiso.descripcion}</div>
                            </div>
                            <label className="toggle-switch">
                              <input
                                type="checkbox"
                                checked={nuevoRol.permisos_seleccionados.includes(permiso.id_permiso)}
                                onChange={() => togglePermisoNuevoRol(permiso.id_permiso)}
                              />
                              <span className="slider"></span>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Vista previa */}
                  <div className="preview">
                    <h4>👀 Vista Previa</h4>
                    <div className="preview-content">
                      <strong>{nuevoRol.nombre_rol || "Nombre del rol"}</strong>
                      <p>{nuevoRol.descripcion || "Descripción del rol"}</p>
                      <div className="preview-permissions">
                        {nuevoRol.permisos_seleccionados.map(permisoId => {
                          const permiso = permisos.find(p => p.id_permiso === permisoId);
                          return permiso ? (
                            <span key={permisoId} className="permission-tag">
                              {permiso.nombre}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CREAR PERMISO */}
        {activeTab === "crear-permiso" && (
          <div className="section">
            <div className="create-form">
              <h3>Crear Nuevo Permiso</h3>
              
              <div className="form-group">
                <label>ID del Permiso *</label>
                <input
                  type="text"
                  value={nuevoPermiso.id_permiso}
                  onChange={(e) => setNuevoPermiso({...nuevoPermiso, id_permiso: e.target.value})}
                  placeholder="ej: ver_reportes_ventas"
                />
              </div>

              <div className="form-group">
                <label>Nombre del Permiso *</label>
                <input
                  type="text"
                  value={nuevoPermiso.nombre}
                  onChange={(e) => setNuevoPermiso({...nuevoPermiso, nombre: e.target.value})}
                  placeholder="ej: Ver Reportes de Ventas"
                />
              </div>

              <div className="form-group">
                <label>Descripción</label>
                <input
                  type="text"
                  value={nuevoPermiso.descripcion}
                  onChange={(e) => setNuevoPermiso({...nuevoPermiso, descripcion: e.target.value})}
                  placeholder="ej: Acceder a los reportes de ventas mensuales"
                />
              </div>

              <div className="form-group">
                <label>Módulo *</label>
                <select
                  value={nuevoPermiso.modulo}
                  onChange={(e) => setNuevoPermiso({...nuevoPermiso, modulo: e.target.value})}
                >
                  <option value="">Seleccionar módulo</option>
                  <option value="admin">Administración</option>
                  <option value="contabilidad">Contabilidad</option>
                  <option value="operador">Operaciones</option>
                  <option value="conductor">Conductores</option>
                  <option value="ventas">Ventas</option>
                  <option value="reportes">Reportes</option>
                </select>
              </div>

              <div className="form-group">
                <label>Ruta (opcional)</label>
                <input
                  type="text"
                  value={nuevoPermiso.ruta}
                  onChange={(e) => setNuevoPermiso({...nuevoPermiso, ruta: e.target.value})}
                  placeholder="ej: /reportes/ventas"
                />
              </div>

              <button 
                className="btn-primary"
                onClick={crearPermiso}
                disabled={loading}
              >
                {loading ? "Creando..." : "✨ Crear Permiso"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}