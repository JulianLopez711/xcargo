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
      const res = await fetch("http://localhost:8000/auth/solicitar-codigo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error inesperado");

      setMensaje("Código enviado correctamente. Revisa tu correo.");
      localStorage.setItem("correo_recuperacion", correo);
      setTimeout(() => navigate("/verificar-codigo"), 2000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="recuperar-clave-container">
      <h2>Recuperar contraseña</h2>
      <p>Ingresa tu correo para recibir un código de verificación</p>

      <input
        type="email"
        placeholder="tucorreo@x-cargo.co"
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
