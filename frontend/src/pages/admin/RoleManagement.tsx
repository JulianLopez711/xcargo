// src/pages/admin/RoleManagement.tsx
import { useEffect, useState } from "react";
import "../../styles/admin/RoleManagement.css";

interface Rol {
  id_rol: string;
  nombre_rol: string;
  descripcion: string;
}

export default function RoleManagement() {
  const [roles, setRoles] = useState<Rol[]>([]);
  const [nuevoRol, setNuevoRol] = useState<Rol>({
    id_rol: "",
    nombre_rol: "",
    descripcion: "",
  });

  useEffect(() => {
    fetch("https://api.x-cargo.co/roles/")
      .then((res) => res.json())
      .then((data) => setRoles(data))
      .catch(() => alert("Error al obtener roles"));
  }, []);

  const agregarRol = async () => {
    const res = await fetch("https://api.x-cargo.co/roles/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuevoRol),
    });
    if (res.ok) {
      const nuevo = await res.json();
      setRoles([...roles, nuevo]);
      setNuevoRol({ id_rol: "", nombre_rol: "", descripcion: "" });
    } else {
      alert("Error al crear rol");
    }
  };

  const eliminarRol = async (id_rol: string) => {
    const confirm = window.confirm("¿Estás seguro de eliminar este rol?");
    if (!confirm) return;

    const res = await fetch(`https://api.x-cargo.co/roles/${id_rol}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setRoles(roles.filter((rol) => rol.id_rol !== id_rol));
    } else {
      alert("Error al eliminar rol");
    }
  };

  return (
    <div className="role-management">
      <h2>Gestión de Roles</h2>

      <div className="formulario-rol">
  <input
    type="text"
    placeholder="ID del rol"
    value={nuevoRol.id_rol}
    onChange={(e) => setNuevoRol({ ...nuevoRol, id_rol: e.target.value })}
  />
  <input
    type="text"
    placeholder="Nombre del rol"
    value={nuevoRol.nombre_rol}
    onChange={(e) => setNuevoRol({ ...nuevoRol, nombre_rol: e.target.value })}
  />
  <input
    type="text"
    placeholder="Descripción"
    value={nuevoRol.descripcion}
    onChange={(e) => setNuevoRol({ ...nuevoRol, descripcion: e.target.value })}
  />
  <button className="btn-agregar" onClick={agregarRol}>➕ Crear rol</button>
</div>


      <table className="tabla-roles">
        <thead>
          <tr>
            <th>ID</th>
            <th>Nombre</th>
            <th>Descripción</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {Array.isArray(roles) ? (
            roles.map((rol) => (
              <tr key={rol.id_rol}>
                <td>{rol.id_rol}</td>
                <td>{rol.nombre_rol}</td>
                <td>{rol.descripcion}</td>
                <td>
                  <button
                    className="btn-eliminar"
                    onClick={() => eliminarRol(rol.id_rol)}
                  >
                    🗑 Eliminar
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4}>No se pudieron cargar los roles.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
