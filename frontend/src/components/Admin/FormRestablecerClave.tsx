import { useState } from "react";

export default function FormRestablecerClave() {
  const [correo, setCorreo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje("");
    setError("");

    const formData = new FormData();
    formData.append("correo", correo);

    try {
      const res = await fetch("http://localhost:8000admin/restablecer-clave", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al restablecer clave");
      setMensaje(data.mensaje);
      setCorreo("");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <form className="form-admin" onSubmit={handleSubmit}>
      <h2>Restablecer Clave de Usuario</h2>
      {mensaje && <p className="success-msg">{mensaje}</p>}
      {error && <p className="error-msg">{error}</p>}

      <label>Correo del usuario:</label>
      <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required />

      <button type="submit">Restablecer Clave</button>
    </form>
  );
}
