import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContext";
import "../../styles/Login.css";

export default function Login() {
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!nombre || !rol) {
      alert("Por favor completa todos los campos.");
      return;
    }

    login(rol, nombre);

    const rutasInicio: Record<string, string> = {
      admin: "/admin",
      conductor: "/conductor",
      contabilidad: "/contabilidad",
      operador: "/operador",
    };

    navigate(rutasInicio[rol] || "/");
  };

  return (
    <div className="login-container">
      <h2>Inicio de Sesión</h2>
      <form className="login-form" onSubmit={handleSubmit}>
        <label>Nombre:</label>
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />

        <label>Rol:</label>
        <select value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="">Selecciona tu rol</option>
          <option value="admin">Administrador</option>
          <option value="conductor">Conductor</option>
          <option value="contabilidad">Contabilidad</option>
          <option value="operador">Operador</option>
        </select>

        <button type="submit">Ingresar</button>
      </form>
    </div>
  );
}
