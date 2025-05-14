import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/login/RecuperarClave.css";

export default function VerificarCodigo() {
  const [codigo, setCodigo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const correo = localStorage.getItem("correo_recuperacion");

  const verificar = async () => {
    try {
      const res = await fetch("http://localhost:8000/auth/verificar-codigo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo, codigo }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Código inválido");

      setMensaje("Código verificado. Redirigiendo...");
      setTimeout(() => navigate("/cambiar-clave"), 1500);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="recuperar-clave-container">
      <h2>Verificar código</h2>
      <p>Ingresa el código que recibiste en tu correo</p>

      <input
        type="text"
        placeholder="Código de 6 dígitos"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        required
      />
      <button onClick={verificar}>Verificar código</button>

      {mensaje && <p className="mensaje-exito">{mensaje}</p>}
      {error && <p className="mensaje-error">{error}</p>}
    </div>
  );
}
