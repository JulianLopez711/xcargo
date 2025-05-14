import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/login/RecuperarClave.css";

export default function CambiarClave() {
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const correo = localStorage.getItem("correo_recuperacion");
  const codigo = localStorage.getItem("codigo_recuperacion");

  const cambiar = async () => {
  if (nueva !== confirmar) {
    setError("Las contraseñas no coinciden");
    return;
  }

  if (!correo || !codigo) {
    setError("Correo o código no encontrados. Por favor reinicia el proceso.");
    return;
  }

  try {
    const res = await fetch("http://localhost:8000/auth/cambiar-clave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        correo,
        nueva_clave: nueva,
        codigo,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Error inesperado");

    setMensaje("Contraseña actualizada correctamente. Redirigiendo...");
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
