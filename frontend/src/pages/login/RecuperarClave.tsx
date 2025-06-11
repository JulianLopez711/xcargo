import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/login/RecuperarClave.css";

export default function RecuperarClave() {
  const [correo, setCorreo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();

  const solicitarCodigo = async () => {
    if (!correo || !correo.includes("@")) {
      setError("Por favor ingresa un correo válido");
      return;
    }

    setCargando(true);
    setError("");
    setMensaje("");

    try {
      const formData = new FormData();
      formData.append("correo", correo);

      const res = await fetch("https://api.x-cargo.co/auth/solicitar-codigo", {
        method: "POST",
        body: formData
      });

      let data;
      try {
        data = await res.json();
      } catch (jsonError) {
        const textoPlano = await res.text();
        data = { detail: textoPlano || "Respuesta inválida del servidor" };
      }

      if (!res.ok) throw new Error(data.detail || "Error inesperado");

      setMensaje("Código enviado correctamente. Revisa tu correo.");
      localStorage.setItem("correo_recuperacion", correo);
      setTimeout(() => navigate("/verificar-codigo"), 2000);
    } catch (err: any) {
      setError(err.message || "Error al enviar el código");
    } finally {
      setCargando(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !cargando) {
      solicitarCodigo();
    }
  };

  return (
    <div className="recuperar-clave-container">
      <h2>Recuperar contraseña</h2>
      <p>Ingresa tu correo electrónico y te enviaremos un código de verificación</p>

      <input
        type="email"
        placeholder="tu-correo@x-cargo.co"
        value={correo}
        onChange={(e) => setCorreo(e.target.value)}
        onKeyPress={handleKeyPress}
        disabled={cargando}
        required
      />

      <button 
        onClick={solicitarCodigo} 
        disabled={cargando || !correo}
      >
        {cargando ? (
          <>Enviando<span className="loading"></span></>
        ) : (
          "Enviar código"
        )}
      </button>

      {mensaje && <p className="mensaje-exito">{mensaje}</p>}
      {error && <p className="mensaje-error">{error}</p>}

      {!mensaje && !cargando && (
        <a href="/login" className="volver-link">
          Volver al inicio de sesión
        </a>
      )}
    </div>
  );
}
