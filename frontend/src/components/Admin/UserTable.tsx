// src/components/admin/UserTable.tsx
import "../../styles/admin/UserTable.css";

const sampleUsers = [
  { id: 1, nombre: "Carlos Pérez", correo: "carlos@xcargo.com", rol: "admin" },
  { id: 2, nombre: "Laura Ruiz", correo: "laura@xcargo.com", rol: "conductor" },
  { id: 3, nombre: "Ana Gómez", correo: "ana@xcargo.com", rol: "contabilidad" },
];

export default function UserTable() {
  return (
    <div className="user-table-container">
      <table className="user-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Nombre</th>
            <th>Correo</th>
            <th>Rol</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {sampleUsers.map((user) => (
            <tr key={user.id}>
              <td>{user.id}</td>
              <td>{user.nombre}</td>
              <td>{user.correo}</td>
              <td>{user.rol}</td>
              <td>
                <button className="edit-button">Editar</button>
                <button className="delete-button">Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
