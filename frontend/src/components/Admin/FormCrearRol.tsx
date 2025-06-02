import { useState } from "react";
import { useAuth } from "../../context/authContext"; // ← AGREGAR

export default function FormCambiarRol() {
  const { user } = useAuth(); // ← AGREGAR
  const [correo, setCorreo] = useState("");
  const [nuevoRol, setNuevoRol] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje("");
    setError("");

    const formData = new FormData();
    formData.append("correo", correo);
    formData.append("nuevo_rol", nuevoRol);

    try {
      // ✅ CORRECCIÓN: Agregar headers
      const res = await fetch("http://localhost:8000/admin/cambiar-rol", {
        method: "POST",
        headers: {
          "X-User-Email": user?.email || "",
          "X-User-Role": user?.role || "admin"
        },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al cambiar rol");
      setMensaje(data.mensaje);
      setCorreo("");
      setNuevoRol("");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <form className="form-admin" onSubmit={handleSubmit}>
      <h2>Cambiar Rol de Usuario</h2>
      {mensaje && <p className="success-msg">{mensaje}</p>}
      {error && <p className="error-msg">{error}</p>}

      <label>Correo del usuario:</label>
      <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required />

      <label>Nuevo rol:</label>
      <select value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)} required>
        <option value="">-- Selecciona un nuevo rol --</option>
        <option value="admin">Administrador</option>
        <option value="master">Master</option> {/* ← AGREGAR MASTER */}
        <option value="supervisor">Supervisor</option>
        <option value="conductor">Conductor</option>
        <option value="contabilidad">Contabilidad</option>
        <option value="operador">Operador</option>
      </select>

      <button type="submit">Actualizar Rol</button>
    </form>
  );
}