// src/components/Admin/ConfigForm.tsx
import { useState } from "react";
import "../../styles/admin/AdminConfiguracion.css";

export default function ConfigForm() {
  const [form, setForm] = useState({
    correo: "",
    telefono: "",
    direccion: "",
    facebook: "",
    instagram: "",
    modoOscuro: false,
    logo: null as File | null,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.target as HTMLInputElement;
    const { name, value, type, checked } = target;

    setForm({ ...form, [name]: type === "checkbox" ? checked : value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setForm({ ...form, logo: file });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Aquí iría la lógica para enviar al backend
    console.log("Configuración guardada:", form);
  };

  return (
    <form className="form-config" onSubmit={handleSubmit}>
      <h3>Configuración General</h3>

      <label>Correo:</label>
      <input type="email" name="correo" value={form.correo} onChange={handleChange} />

      <label>Teléfono:</label>
      <input type="text" name="telefono" value={form.telefono} onChange={handleChange} />

      <label>Dirección:</label>
      <textarea name="direccion" value={form.direccion} onChange={handleChange}></textarea>

      <label>Facebook:</label>
      <input type="text" name="facebook" value={form.facebook} onChange={handleChange} />

      <label>Instagram:</label>
      <input type="text" name="instagram" value={form.instagram} onChange={handleChange} />

      <label>
        <input type="checkbox" name="modoOscuro" checked={form.modoOscuro} onChange={handleChange} />
        Activar modo oscuro
      </label>

      <label>Logo (opcional):</label>
      <input type="file" accept="image/*" onChange={handleFileChange} />

      <button type="submit">Guardar Cambios</button>
    </form>
  );
}
