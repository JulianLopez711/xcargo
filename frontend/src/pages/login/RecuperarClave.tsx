import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/login/RecuperarClave.css";

export default function RecuperarClave() {
  const [correo, setCorreo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const solicitarCodigo = async () => {
    try {
      const formData = new FormData();
      formData.append("correo", correo);

      const res = await fetch("https://api.x-cargo.co/auth/solicitar-codigo", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error inesperado");

      setMensaje("✅ Código enviado correctamente. Revisa tu correo.");
      localStorage.setItem("correo_recuperacion", correo);
      setTimeout(() => navigate("/verificar-codigo"), 2000);
    } catch (err: any) {
      setError(err.message || "Error al enviar el código");
    }
  };

  return (
    <div className="recuperar-clave-container">
      <h2>Recuperar contraseña</h2>
      <p>Ingresa tu correo para recibir un código de verificación</p>

      <input
        type="email"
        placeholder="tu-correo@x-cargo.co"
        value={correo}
        onChange={(e) => setCorreo(e.target.value)}
        required
      />
      <button onClick={solicitarCodigo}>Enviar código</button>

      {mensaje && <p className="mensaje-exito">{mensaje}</p>}
      {error && <p className="mensaje-error">{error}</p>}
    </div>
  );
}
