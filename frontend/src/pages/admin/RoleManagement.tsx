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

interface PermisoRol {
  id_permiso: string;
  permiso_nombre: string;
  modulo: string;
}

interface Rol {
  id_rol: string;
  nombre_rol: string;
  descripcion: string;
  ruta_defecto: string;
  permisos: PermisoRol[];
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

interface Estado {
  isLoading: boolean;
  error: string | null;
  mensaje: string;
}

export default function RoleManagement() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("gestionar");
  const [roles, setRoles] = useState<Rol[]>([]);
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [estado, setEstado] = useState<Estado>({
    isLoading: true,
    error: null,
    mensaje: ""
  });

  const [nuevoRol, setNuevoRol] = useState<NuevoRol>({
    id_rol: "",
    nombre_rol: "",
    descripcion: "",
    ruta_defecto: "",
    permisos_seleccionados: []
  });

  const [nuevoPermiso, setNuevoPermiso] = useState<NuevoPermiso>({
    id_permiso: "",
    nombre: "",
    descripcion: "",
    modulo: "",
    ruta: ""
  });

  const mountedRef = useRef(true);
  const inicializadoRef = useRef(false);

  const getHeaders = useCallback(() => {
    if (!user) return {};
    return {
      ...(user.token && { Authorization: `Bearer ${user.token}` }),
      ...(user.email && { "X-User-Email": user.email }),
      ...(user.role && { "X-User-Role": user.role })
    };
  }, [user]);

  const mostrarMensaje = useCallback((mensaje: string, tipo: "success" | "error" = "success") => {
    if (!mountedRef.current) return;
    setEstado(prev => ({
      ...prev,
      mensaje,
      error: tipo === "error" ? mensaje : null
    }));
    setTimeout(() => {
      if (mountedRef.current) {
        setEstado(prev => ({ ...prev, mensaje: "", error: null }));
      }
    }, 3000);
  }, []);

  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
    if (!mountedRef.current) return null;

    try {
      const headers = getHeaders();
      console.log(`🌐 Haciendo petición a ${url}`);
      
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...headers,
          ...options.headers,
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error ${response.status}: ${errorText || response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ Respuesta exitosa de ${url}:`, data);
      return data;
    } catch (error) {
      console.error(`❌ Error en petición a ${url}:`, error);
      throw error;
    }
  }, [getHeaders]);

  const cargarDatos = useCallback(async () => {
    if (!user || !mountedRef.current || inicializadoRef.current) return;

    console.log("🚀 Iniciando carga de datos...");
    setEstado(prev => ({ ...prev, isLoading: true }));

    try {
      const [rolesData, permisosData] = await Promise.all([
        fetchWithAuth("https://api.x-cargo.co/admin/roles-con-permisos"),
        fetchWithAuth("https://api.x-cargo.co/admin/permisos")
      ]);

      if (!mountedRef.current) return;

      if (Array.isArray(rolesData)) {
        setRoles(rolesData);
        console.log(`✅ ${rolesData.length} roles cargados`);
      }

      if (Array.isArray(permisosData)) {
        setPermisos(permisosData);
        console.log(`✅ ${permisosData.length} permisos cargados`);
      }

      inicializadoRef.current = true;
    } catch (error) {
      console.error("❌ Error al cargar datos:", error);
      if (mountedRef.current) {
        mostrarMensaje("Error al cargar los datos", "error");
      }
    } finally {
      if (mountedRef.current) {
        setEstado(prev => ({ ...prev, isLoading: false }));
      }
    }
  }, [user, fetchWithAuth, mostrarMensaje]);

  const handleRolChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNuevoRol(prev => ({ ...prev, [name]: value }));
  }, []);

  const handlePermisoChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNuevoPermiso(prev => ({ ...prev, [name]: value }));
  }, []);

  const togglePermisoRol = useCallback(async (rolId: string, permisoId: string, isChecked: boolean) => {
    if (!mountedRef.current) return;

    const rol = roles.find(r => r.id_rol === rolId);
    if (!rol) return;

    try {
      setEstado(prev => ({ ...prev, isLoading: true }));
      
      const nuevosPermisos = isChecked
        ? [...rol.permisos.map(p => p.id_permiso), permisoId]
        : rol.permisos.map(p => p.id_permiso).filter(id => id !== permisoId);

      await fetchWithAuth(`https://api.x-cargo.co/admin/rol/${rolId}/permisos`, {
        method: "POST",
        body: JSON.stringify({ permisos: nuevosPermisos })
      });

      await cargarDatos();
      mostrarMensaje("Permisos actualizados correctamente");
    } catch (error) {
      console.error("Error al actualizar permisos:", error);
      mostrarMensaje("Error al actualizar permisos", "error");
    } finally {
      if (mountedRef.current) {
        setEstado(prev => ({ ...prev, isLoading: false }));
      }
    }
  }, [roles, fetchWithAuth, cargarDatos, mostrarMensaje]);

  const togglePermisoNuevoRol = useCallback((permisoId: string) => {
    setNuevoRol(prev => {
      const permisos = prev.permisos_seleccionados.includes(permisoId)
        ? prev.permisos_seleccionados.filter(id => id !== permisoId)
        : [...prev.permisos_seleccionados, permisoId];
      return { ...prev, permisos_seleccionados: permisos };
    });
  }, []);

  const crearRol = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mountedRef.current) return;

    if (!nuevoRol.nombre_rol || !nuevoRol.descripcion || !nuevoRol.ruta_defecto) {
      mostrarMensaje("Por favor complete todos los campos obligatorios", "error");
      return;
    }

    try {
      setEstado(prev => ({ ...prev, isLoading: true }));
      await fetchWithAuth("https://api.x-cargo.co/admin/crear-rol", {
        method: "POST",
        body: JSON.stringify(nuevoRol)
      });

      setNuevoRol({
        id_rol: "",
        nombre_rol: "",
        descripcion: "",
        ruta_defecto: "",
        permisos_seleccionados: []
      });

      await cargarDatos();
      mostrarMensaje("Rol creado exitosamente");
      setActiveTab("gestionar");
    } catch (error) {
      console.error("Error al crear rol:", error);
      mostrarMensaje("Error al crear el rol", "error");
    } finally {
      if (mountedRef.current) {
        setEstado(prev => ({ ...prev, isLoading: false }));
      }
    }
  }, [nuevoRol, fetchWithAuth, cargarDatos, mostrarMensaje]);

  const crearPermiso = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mountedRef.current) return;

    if (!nuevoPermiso.nombre || !nuevoPermiso.descripcion || !nuevoPermiso.modulo || !nuevoPermiso.ruta) {
      mostrarMensaje("Por favor complete todos los campos obligatorios", "error");
      return;
    }

    try {
      setEstado(prev => ({ ...prev, isLoading: true }));
      await fetchWithAuth("https://api.x-cargo.co/admin/crear-permiso", {
        method: "POST",
        body: JSON.stringify(nuevoPermiso)
      });

      setNuevoPermiso({
        id_permiso: "",
        nombre: "",
        descripcion: "",
        modulo: "",
        ruta: ""
      });

      await cargarDatos();
      mostrarMensaje("Permiso creado exitosamente");
      setActiveTab("gestionar");
    } catch (error) {
      console.error("Error al crear permiso:", error);
      mostrarMensaje("Error al crear el permiso", "error");
    } finally {
      if (mountedRef.current) {
        setEstado(prev => ({ ...prev, isLoading: false }));
      }
    }
  }, [nuevoPermiso, fetchWithAuth, cargarDatos, mostrarMensaje]);

  useEffect(() => {
    mountedRef.current = true;
    cargarDatos();

    return () => {
      console.log("🔄 Limpiando componente RoleManagement");
      mountedRef.current = false;
    };
  }, [cargarDatos]);

  if (!user) {
    return (
      <div className="role-management-container">
        <div className="mensaje error">
          Por favor inicie sesión para acceder a esta página
        </div>
      </div>
    );
  }
  const renderLoading = () => (
    <div className="role-management-container">
      <div className="loading">
        <div className="spinner"></div>
        <p>Cargando roles y permisos...</p>
      </div>
    </div>
  );

  if (estado.isLoading && !roles.length && !permisos.length) {
    return renderLoading();
  }

  return (
    <div className="role-management-container">
      <div className="tabs">
        <button
          className={`tab ${activeTab === "gestionar" ? "active" : ""}`}
          onClick={() => setActiveTab("gestionar")}
        >
          Gestionar Roles y Permisos
        </button>
        <button
          className={`tab ${activeTab === "crear" ? "active" : ""}`}
          onClick={() => setActiveTab("crear")}
        >
          Crear Nuevo Rol/Permiso
        </button>
      </div>

      {estado.mensaje && (
        <div className={`mensaje ${estado.error ? "error" : "success"}`}>
          {estado.mensaje}
        </div>
      )}

      {activeTab === "gestionar" && roles.length > 0 && (
        <div className="gestionar-container">
          <h2>Roles y sus Permisos</h2>
          <div className="roles-list">
            {estado.isLoading && renderLoading()}
            {!estado.isLoading && roles.map((rol) => (
              <div key={rol.id_rol} className="rol-card">
                <h3>{rol.nombre_rol}</h3>
                <p className="rol-descripcion">{rol.descripcion}</p>
                <p className="rol-ruta">Ruta por defecto: {rol.ruta_defecto}</p>
                <div className="permisos-grid">
                  {permisos.map((permiso) => (
                    <div key={permiso.id_permiso} className="permiso-checkbox">
                      <input
                        type="checkbox"
                        id={`${rol.id_rol}-${permiso.id_permiso}`}
                        checked={rol.permisos.some(p => p.id_permiso === permiso.id_permiso)}
                        onChange={(e) => togglePermisoRol(rol.id_rol, permiso.id_permiso, e.target.checked)}
                        disabled={estado.isLoading}
                      />
                      <label htmlFor={`${rol.id_rol}-${permiso.id_permiso}`}>
                        {permiso.nombre}
                        <span className="modulo-tag">{permiso.modulo}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "crear" && (
        <div className="crear-container">
          <div className="crear-rol">
            <h3>Crear Nuevo Rol</h3>
            <form onSubmit={crearRol}>
              <div className="form-group">
                <label htmlFor="nombre_rol">Nombre del Rol*</label>
                <input
                  type="text"
                  id="nombre_rol"
                  name="nombre_rol"
                  value={nuevoRol.nombre_rol}
                  onChange={handleRolChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="descripcion">Descripción*</label>
                <textarea
                  id="descripcion"
                  name="descripcion"
                  value={nuevoRol.descripcion}
                  onChange={handleRolChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="ruta_defecto">Ruta por Defecto*</label>
                <input
                  type="text"
                  id="ruta_defecto"
                  name="ruta_defecto"
                  value={nuevoRol.ruta_defecto}
                  onChange={handleRolChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Permisos Iniciales</label>
                <div className="permisos-grid">
                  {permisos.map((permiso) => (
                    <div key={permiso.id_permiso} className="permiso-checkbox">
                      <input
                        type="checkbox"
                        id={`nuevo-rol-${permiso.id_permiso}`}
                        checked={nuevoRol.permisos_seleccionados.includes(permiso.id_permiso)}
                        onChange={() => togglePermisoNuevoRol(permiso.id_permiso)}
                      />
                      <label htmlFor={`nuevo-rol-${permiso.id_permiso}`}>
                        {permiso.nombre}
                        <span className="modulo-tag">{permiso.modulo}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <button type="submit" disabled={estado.isLoading}>
                {estado.isLoading ? "Creando..." : "Crear Rol"}
              </button>
            </form>
          </div>

          <div className="crear-permiso">
            <h3>Crear Nuevo Permiso</h3>
            <form onSubmit={crearPermiso}>
              <div className="form-group">
                <label htmlFor="nombre">Nombre del Permiso*</label>
                <input
                  type="text"
                  id="nombre"
                  name="nombre"
                  value={nuevoPermiso.nombre}
                  onChange={handlePermisoChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="descripcion_permiso">Descripción*</label>
                <textarea
                  id="descripcion_permiso"
                  name="descripcion"
                  value={nuevoPermiso.descripcion}
                  onChange={handlePermisoChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="modulo">Módulo*</label>
                <input
                  type="text"
                  id="modulo"
                  name="modulo"
                  value={nuevoPermiso.modulo}
                  onChange={handlePermisoChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="ruta">Ruta*</label>
                <input
                  type="text"
                  id="ruta"
                  name="ruta"
                  value={nuevoPermiso.ruta}
                  onChange={handlePermisoChange}
                  required
                />
              </div>
              <button type="submit" disabled={estado.isLoading}>
                {estado.isLoading ? "Creando..." : "Crear Permiso"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}