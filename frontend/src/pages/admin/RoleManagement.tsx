import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "../../context/authContext";
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
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("gestionar");
  const [roles, setRoles] = useState<Rol[]>([]);
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [inicializado, setInicializado] = useState(false);

  // Control para evitar llamadas múltiples
  const mountedRef = useRef(true);
  const loadingRef = useRef(false);

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

  // Headers comunes para todas las peticiones
  const getHeaders = useCallback(() => {
    if (!user) {
      console.warn("⚠️ Usuario no disponible para headers");
      return {};
    }

    const headers: Record<string, string> = {};

    if (user.token) {
      headers["Authorization"] = `Bearer ${user.token}`;
    }
    if (user.email) {
      headers["X-User-Email"] = user.email;
    }
    if (user.role) {
      headers["X-User-Role"] = user.role;
    }

    return headers;
  }, [user]);

  // Función helper para hacer peticiones sin AbortController
  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
    const headers = getHeaders();
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    return response.json();
  }, [getHeaders]);

  const cargarRoles = useCallback(async () => {
    if (!user || loadingRef.current || !mountedRef.current) {
      console.log("🔄 Evitando carga de roles - usuario:", !!user, "loading:", loadingRef.current, "mounted:", mountedRef.current);
      return;
    }

    try {
      console.log("📋 Cargando roles...");
      const data = await fetchWithAuth("https://api.x-cargo.co/admin/roles-con-permisos");
      
      if (mountedRef.current) {
        setRoles(Array.isArray(data) ? data : []);
        console.log("✅ Roles cargados:", data?.length || 0);
      }
    } catch (error) {
      console.error("❌ Error cargando roles:", error);
      if (mountedRef.current) {
        mostrarMensaje("Error al cargar roles", "error");
        setRoles([]);
      }
    }
  }, [user, fetchWithAuth]);

  const cargarPermisos = useCallback(async () => {
    if (!user || loadingRef.current || !mountedRef.current) {
      console.log("🔄 Evitando carga de permisos - usuario:", !!user, "loading:", loadingRef.current, "mounted:", mountedRef.current);
      return;
    }

    try {
      console.log("🔑 Cargando permisos...");
      const data = await fetchWithAuth("https://api.x-cargo.co/admin/permisos");
      
      if (mountedRef.current) {
        setPermisos(Array.isArray(data) ? data : []);
        console.log("✅ Permisos cargados:", data?.length || 0);
      }
    } catch (error) {
      console.error("❌ Error cargando permisos:", error);
      if (mountedRef.current) {
        mostrarMensaje("Error al cargar permisos", "error");
        setPermisos([]);
      }
    }
  }, [user, fetchWithAuth]);

  // Inicialización única cuando el componente se monta
  useEffect(() => {
    if (!user || inicializado || loadingRef.current) {
      return;
    }

    console.log("🚀 Inicializando RoleManagement para usuario:", user.email);
    
    const inicializarDatos = async () => {
      if (loadingRef.current) return;
      
      loadingRef.current = true;
      setLoading(true);
      
      try {
        // Cargar datos secuencialmente para evitar conflictos
        await cargarRoles();
        if (mountedRef.current) {
          await cargarPermisos();
        }
      } catch (error) {
        console.error("❌ Error en inicialización:", error);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setInicializado(true);
        }
        loadingRef.current = false;
      }
    };

    inicializarDatos();

    // Cleanup al desmontar
    return () => {
      mountedRef.current = false;
    };
  }, [user, inicializado]); // Removido cargarRoles y cargarPermisos de las dependencias

  const mostrarMensaje = (texto: string, _tipo: "success" | "error" = "success") => {
    setMessage(texto);
    setTimeout(() => setMessage(""), 3000);
  };

  // Agrupar permisos por módulo - CON VALIDACIÓN
  const permisosPorModulo = Array.isArray(permisos) ? permisos.reduce((acc, permiso) => {
    if (!acc[permiso.modulo]) {
      acc[permiso.modulo] = [];
    }
    acc[permiso.modulo].push(permiso);
    return acc;
  }, {} as Record<string, Permiso[]>) : {};

  // Verificar si un rol tiene un permiso específico
  const rolTienePermiso = (rol: Rol, permisoId: string): boolean => {
    return rol.permisos?.some(p => p.id_permiso === permisoId) || false;
  };

  // Actualizar permisos de un rol
  const actualizarPermisosRol = async (idRol: string, permisosIds: string[]) => {
    if (loadingRef.current) return;
    
    loadingRef.current = true;
    setLoading(true);
    
    try {
      const formData = new FormData();
      permisosIds.forEach(id => formData.append('permisos_ids', id));

      const headers = getHeaders();
      // No agregar Content-Type para FormData

      const response = await fetch(`https://api.x-cargo.co/admin/rol/${idRol}/permisos`, {
        method: "POST",
        headers,
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
      loadingRef.current = false;
    }
  };

  // Toggle permiso de un rol
  const togglePermisoRol = async (rol: Rol, permisoId: string) => {
    if (loadingRef.current) return;
    
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
    if (!nuevoRol.id_rol || !nuevoRol.nombre_rol || loadingRef.current) {
      if (!nuevoRol.id_rol || !nuevoRol.nombre_rol) {
        mostrarMensaje("Completa los campos requeridos", "error");
      }
      return;
    }

    loadingRef.current = true;
    setLoading(true);
    
    try {
      // 1. Crear el rol
      const formDataRol = new FormData();
      formDataRol.append("id_rol", nuevoRol.id_rol);
      formDataRol.append("nombre_rol", nuevoRol.nombre_rol);
      formDataRol.append("descripcion", nuevoRol.descripcion);
      formDataRol.append("ruta_defecto", nuevoRol.ruta_defecto);

      const headers = getHeaders();

      const responseRol = await fetch("https://api.x-cargo.co/admin/crear-rol", {
        method: "POST",
        headers,
        body: formDataRol
      });

      if (!responseRol.ok) throw new Error("Error creando rol");

      // 2. Asignar permisos si se seleccionaron
      if (nuevoRol.permisos_seleccionados.length > 0) {
        const formDataPermisos = new FormData();
        nuevoRol.permisos_seleccionados.forEach(id => formDataPermisos.append('permisos_ids', id));

        await fetch(`https://api.x-cargo.co/admin/rol/${nuevoRol.id_rol}/permisos`, {
          method: "POST",
          headers,
          body: formDataPermisos
        });
      }

      // 3. Resetear formulario y actualizar lista
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
      loadingRef.current = false;
    }
  };

  // Crear nuevo permiso
  const crearPermiso = async () => {
    if (!nuevoPermiso.id_permiso || !nuevoPermiso.nombre || !nuevoPermiso.modulo || loadingRef.current) {
      if (!nuevoPermiso.id_permiso || !nuevoPermiso.nombre || !nuevoPermiso.modulo) {
        mostrarMensaje("Completa los campos requeridos", "error");
      }
      return;
    }

    loadingRef.current = true;
    setLoading(true);
    
    try {
      const formData = new FormData();
      formData.append("id_permiso", nuevoPermiso.id_permiso);
      formData.append("nombre", nuevoPermiso.nombre);
      formData.append("descripcion", nuevoPermiso.descripcion);
      formData.append("modulo", nuevoPermiso.modulo);
      formData.append("ruta", nuevoPermiso.ruta);

      const headers = getHeaders();

      const response = await fetch("https://api.x-cargo.co/admin/crear-permiso", {
        method: "POST",
        headers,
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
      loadingRef.current = false;
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

  const refrescarDatos = () => {
    if (loadingRef.current) return;
    
    console.log("🔄 Refrescando datos de roles y permisos");
    setInicializado(false);
    setRoles([]);
    setPermisos([]);
    setMessage("");
    
    // Trigger re-initialization
    setTimeout(() => {
      if (mountedRef.current) {
        setInicializado(false);
      }
    }, 100);
  };

  // Mostrar loading si no hay usuario
  if (!user) {
    return (
      <div className="role-management">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Cargando información del usuario...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="role-management">
      <div className="header">
        <div className="header-content">
          <div className="header-info">
            <h1>🔐 Sistema de Permisos</h1>
            <p>Configura roles y permisos para tu equipo XCargo</p>
          </div>
          <div className="header-actions">
            <button 
              className="btn-refresh"
              onClick={refrescarDatos}
              disabled={loading}
              title="Refrescar datos"
            >
              🔄 Actualizar
            </button>
          </div>
        </div>
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
          📋 Gestionar Roles
        </button>
        <button 
          className={`tab ${activeTab === "crear-rol" ? "active" : ""}`}
          onClick={() => setActiveTab("crear-rol")}
        >
          ➕ Crear Nuevo Rol
        </button>
        <button 
          className={`tab ${activeTab === "crear-permiso" ? "active" : ""}`}
          onClick={() => setActiveTab("crear-permiso")}
        >
          🔑 Crear Permiso
        </button>
      </div>

      <div className="content">
        {/* GESTIONAR ROLES */}
        {activeTab === "gestionar" && (
          <div className="section">
            {loading && !inicializado ? (
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Cargando roles y permisos...</p>
              </div>
            ) : roles.length > 0 ? (
              roles.map((rol) => (
                <div key={rol.id_rol} className="role-card">
                  <div className="role-header">
                    <div className="role-info">
                      <h3>🎭 {rol.nombre_rol}</h3>
                      <p>{rol.descripcion}</p>
                      {rol.ruta_defecto && (
                        <small>🛣️ Ruta por defecto: {rol.ruta_defecto}</small>
                      )}
                    </div>
                    <div className="role-stats">
                      <span className="stat">
                        🔑 {rol.permisos?.length || 0} permisos
                      </span>
                    </div>
                  </div>

                  <div className="permissions-grid">
                    {Object.keys(permisosPorModulo).length > 0 ? (
                      Object.entries(permisosPorModulo).map(([modulo, permisosModulo]) => (
                        <div key={modulo} className="module-section">
                          <div className="module-header">
                            <h4>📂 {modulo}</h4>
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
                      ))
                    ) : (
                      <div className="empty-permissions">
                        <p>No hay permisos disponibles. Crea algunos permisos primero.</p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🎭</div>
                <h3>No hay roles configurados</h3>
                <p>Crea un nuevo rol para empezar a configurar permisos.</p>
                <button 
                  className="btn-primary"
                  onClick={() => setActiveTab("crear-rol")}
                >
                  ➕ Crear Primer Rol
                </button>
              </div>
            )}
          </div>
        )}

        {/* CREAR NUEVO ROL */}
        {activeTab === "crear-rol" && (
          <div className="section">
            <div className="create-form">
              <div className="form-grid">
                <div className="form-section">
                  <h3>📝 Información del Rol</h3>
                  
                  <div className="form-group">
                    <label>ID del Rol *</label>
                    <input
                      type="text"
                      value={nuevoRol.id_rol}
                      onChange={(e) => setNuevoRol({...nuevoRol, id_rol: e.target.value})}
                      placeholder="ej: supervisor_entregas"
                      disabled={loading}
                    />
                    <small>Use solo letras minúsculas, números y guiones bajos</small>
                  </div>

                  <div className="form-group">
                    <label>Nombre del Rol *</label>
                    <input
                      type="text"
                      value={nuevoRol.nombre_rol}
                      onChange={(e) => setNuevoRol({...nuevoRol, nombre_rol: e.target.value})}
                      placeholder="ej: Supervisor de Entregas"
                      disabled={loading}
                    />
                  </div>

                  <div className="form-group">
                    <label>Descripción</label>
                    <textarea
                      value={nuevoRol.descripcion}
                      onChange={(e) => setNuevoRol({...nuevoRol, descripcion: e.target.value})}
                      placeholder="Describe las responsabilidades de este rol..."
                      disabled={loading}
                    />
                  </div>

                  <div className="form-group">
                    <label>Ruta por Defecto</label>
                    <input
                      type="text"
                      value={nuevoRol.ruta_defecto}
                      onChange={(e) => setNuevoRol({...nuevoRol, ruta_defecto: e.target.value})}
                      placeholder="ej: /supervisor/dashboard"
                      disabled={loading}
                    />
                    <small>Página a la que será redirigido el usuario al iniciar sesión</small>
                  </div>

                  <button 
                    className="btn-primary"
                    onClick={crearRol}
                    disabled={loading || !nuevoRol.id_rol || !nuevoRol.nombre_rol}
                  >
                    {loading ? "Creando..." : "✨ Crear Rol"}
                  </button>
                </div>

                <div className="form-section">
                  <h3>🔑 Seleccionar Permisos</h3>
                  
                  {Object.keys(permisosPorModulo).length > 0 ? (
                    Object.entries(permisosPorModulo).map(([modulo, permisosModulo]) => (
                      <div key={modulo} className="module-section">
                        <div className="module-header">
                          <h4>📂 {modulo}</h4>
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
                                  disabled={loading}
                                />
                                <span className="slider"></span>
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-permissions">
                      <p>📥 Cargando permisos...</p>
                      <small>Si no aparecen permisos, créalos primero en la pestaña "Crear Permiso"</small>
                    </div>
                  )}

                  {/* Vista previa */}
                  <div className="preview">
                    <h4>👀 Vista Previa</h4>
                    <div className="preview-content">
                      <strong>🎭 {nuevoRol.nombre_rol || "Nombre del rol"}</strong>
                      <p>{nuevoRol.descripcion || "Descripción del rol"}</p>
                      {nuevoRol.ruta_defecto && (
                        <small>🛣️ Ruta: {nuevoRol.ruta_defecto}</small>
                      )}
                      <div className="preview-permissions">
                        <strong>Permisos seleccionados ({nuevoRol.permisos_seleccionados.length}):</strong>
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
              <h3>🔑 Crear Nuevo Permiso</h3>
              
              <div className="form-group">
                <label>ID del Permiso *</label>
                <input
                  type="text"
                  value={nuevoPermiso.id_permiso}
                  onChange={(e) => setNuevoPermiso({...nuevoPermiso, id_permiso: e.target.value})}
                  placeholder="ej: ver_reportes_ventas"
                  disabled={loading}
                />
                <small>Use solo letras minúsculas, números y guiones bajos</small>
              </div>

              <div className="form-group">
                <label>Nombre del Permiso *</label>
                <input
                  type="text"
                  value={nuevoPermiso.nombre}
                  onChange={(e) => setNuevoPermiso({...nuevoPermiso, nombre: e.target.value})}
                  placeholder="ej: Ver Reportes de Ventas"
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label>Descripción</label>
                <input
                  type="text"
                  value={nuevoPermiso.descripcion}
                  onChange={(e) => setNuevoPermiso({...nuevoPermiso, descripcion: e.target.value})}
                  placeholder="ej: Acceder a los reportes de ventas mensuales"
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label>Módulo *</label>
                <select
                  value={nuevoPermiso.modulo}
                  onChange={(e) => setNuevoPermiso({...nuevoPermiso, modulo: e.target.value})}
                  disabled={loading}
                >
                  <option value="">Seleccionar módulo</option>
                  <option value="admin">📱 Administración</option>
                  <option value="contabilidad">💰 Contabilidad</option>
                  <option value="operador">📦 Operaciones</option>
                  <option value="conductor">🚛 Conductores</option>
                  <option value="ventas">💼 Ventas</option>
                  <option value="reportes">📊 Reportes</option>
                  <option value="master">🔧 Master</option>
                </select>
              </div>

              <div className="form-group">
                <label>Ruta (opcional)</label>
                <input
                  type="text"
                  value={nuevoPermiso.ruta}
                  onChange={(e) => setNuevoPermiso({...nuevoPermiso, ruta: e.target.value})}
                  placeholder="ej: /reportes/ventas"
                  disabled={loading}
                />
                <small>Ruta específica donde aplica este permiso</small>
              </div>

              <button 
                className="btn-primary"
                onClick={crearPermiso}
                disabled={loading || !nuevoPermiso.id_permiso || !nuevoPermiso.nombre || !nuevoPermiso.modulo}
              >
                {loading ? "Creando..." : "✨ Crear Permiso"}
              </button>

              {/* Lista de permisos existentes */}
              {permisos.length > 0 && (
                <div className="existing-permissions">
                  <h4>📋 Permisos Existentes</h4>
                  <div className="permissions-summary">
                    {Object.entries(permisosPorModulo).map(([modulo, permisosModulo]) => (
                      <div key={modulo} className="module-summary">
                        <strong>📂 {modulo} ({permisosModulo.length})</strong>
                        <div className="permissions-tags">
                          {permisosModulo.map(permiso => (
                            <span key={permiso.id_permiso} className="permission-tag small">
                              {permiso.nombre}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer con información del estado */}
      <div className="footer-info">
        <div className="status-indicators">
          <div className="status-item">
            <strong>🎭 Roles:</strong> {roles.length}
          </div>
          <div className="status-item">
            <strong>🔑 Permisos:</strong> {permisos.length}
          </div>
          <div className="status-item">
            <strong>👤 Usuario:</strong> {user?.email} ({user?.role})
          </div>
          <div className="status-item">
            <strong>🔗 Estado:</strong> {inicializado ? "✅ Conectado" : "⏳ Inicializando"}
          </div>
        </div>
      </div>
    </div>
  );
}