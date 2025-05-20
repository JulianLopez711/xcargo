import { useState } from "react";

export default function FormCrearUsuario() {
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [telefono, setTelefono] = useState("");
  const [rol, setRol] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje("");
    setError("");

    const formData = new FormData();
    formData.append("nombre", nombre);
    formData.append("correo", correo);
    formData.append("telefono", telefono);
    formData.append("rol", rol);

    try {
      const res = await fetch("https://api.x-cargo.co/admin/crear-usuario", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al crear usuario");
      setMensaje(data.mensaje);
      setNombre("");
      setCorreo("");
      setTelefono("");
      setRol("");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <form className="form-admin" onSubmit={handleSubmit}>
      <h2>Crear Nuevo Usuario</h2>
      {mensaje && <p className="success-msg">{mensaje}</p>}
      {error && <p className="error-msg">{error}</p>}
      <label>Nombre completo:</label>
      <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required />

      <label>Correo electrónico:</label>
      <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required />

      <label>Teléfono:</label>
      <input type="text" value={telefono} onChange={(e) => setTelefono(e.target.value)} required />

      <label>Rol:</label>
      <select value={rol} onChange={(e) => setRol(e.target.value)} required>
        <option value="">-- Selecciona un rol --</option>
        <option value="admin">Administrador</option>
        <option value="conductor">Conductor</option>
        <option value="contabilidad">Contabilidad</option>
        <option value="operador">Operador</option>
      </select>

      <button type="submit">Crear Usuario</button>
    </form>
  );
}
