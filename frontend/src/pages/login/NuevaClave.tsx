import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContext";
import "../../styles/login/RecuperarClave.css";

export default function CambiarClave() {
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();

  const correo =
    localStorage.getItem("correo_recuperacion") || user?.email || "";
  const codigo = localStorage.getItem("codigo_recuperacion"); // puede ser null

  const cambiar = async () => {
    setMensaje("");
    setError("");

    if (nueva !== confirmar) {
      setError("Las contraseñas no coinciden");
      return;
    }

    if (!correo) {
      setError("No se encontró el correo. Por favor reinicia sesión o el proceso.");
      return;
    }

    try {
      const res = await fetch("https://api.x-cargo.co/auth/cambiar-clave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correo,
          nueva_clave: nueva,
          codigo: codigo || null, // solo se envía si existe
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error inesperado");

      setMensaje("✅ Contraseña actualizada correctamente. Redirigiendo...");
      localStorage.removeItem("correo_recuperacion");
      localStorage.removeItem("codigo_recuperacion");

      setTimeout(() => navigate("/"), 2000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="recuperar-clave-container">
      <h2>Nueva contraseña</h2>
      <p>Ingresa tu nueva contraseña</p>

      <input
        type="password"
        placeholder="Nueva contraseña"
        value={nueva}
        onChange={(e) => setNueva(e.target.value)}
      />
      <input
        type="password"
        placeholder="Confirmar contraseña"
        value={confirmar}
        onChange={(e) => setConfirmar(e.target.value)}
      />
      <button onClick={cambiar}>Actualizar contraseña</button>

      {mensaje && <p className="mensaje-exito">{mensaje}</p>}
      {error && <p className="mensaje-error">{error}</p>}
    </div>
  );
}
