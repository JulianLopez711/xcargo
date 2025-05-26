import { useState } from "react";

export default function FormCrearRol() {
  const [idRol, setIdRol] = useState("");
  const [nombreRol, setNombreRol] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje("");
    setError("");

    const formData = new FormData();
    formData.append("id_rol", idRol);
    formData.append("nombre_rol", nombreRol);
    formData.append("descripcion", descripcion);

    try {
      const res = await fetch("http://localhost:8000/admin/crear-rol", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al crear rol");
      setMensaje(data.mensaje);
      setIdRol("");
      setNombreRol("");
      setDescripcion("");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <form className="form-admin" onSubmit={handleSubmit}>
      <h2>Crear Nuevo Rol</h2>
      {mensaje && <p className="success-msg">{mensaje}</p>}
      {error && <p className="error-msg">{error}</p>}

      <label>ID del Rol (único):</label>
      <input type="text" value={idRol} onChange={(e) => setIdRol(e.target.value)} required />

      <label>Nombre del Rol:</label>
      <input type="text" value={nombreRol} onChange={(e) => setNombreRol(e.target.value)} required />

      <label>Descripción:</label>
      <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} />

      <button type="submit">Crear Rol</button>
    </form>
  );
}