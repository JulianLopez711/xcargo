import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/login/VerificarCodigo.css";

export default function VerificarCodigo() {
  const [codigo, setCodigo] = useState(["", "", "", "", "", ""]);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const correo = localStorage.getItem("correo_recuperacion");

  useEffect(() => {
    // Focus en el primer input al cargar
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    // Solo permitir números
    if (value && !/^\d$/.test(value)) return;

    const newCodigo = [...codigo];
    newCodigo[index] = value;
    setCodigo(newCodigo);

    // Auto-avanzar al siguiente input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Retroceder con Backspace
    if (e.key === "Backspace" && !codigo[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").slice(0, 6);
    const newCodigo = [...codigo];
    
    for (let i = 0; i < pastedData.length; i++) {
      if (/^\d$/.test(pastedData[i])) {
        newCodigo[i] = pastedData[i];
      }
    }
    
    setCodigo(newCodigo);
    // Focus en el siguiente input vacío o el último
    const nextEmpty = newCodigo.findIndex(val => val === "");
    const focusIndex = nextEmpty === -1 ? 5 : nextEmpty;
    inputRefs.current[focusIndex]?.focus();
  };

  const verificar = async () => {
    const codigoCompleto = codigo.join("");
    
    if (codigoCompleto.length !== 6) {
      setError("Por favor ingresa el código completo");
      return;
    }

    if (!correo) {
      setError("No se encontró el correo. Por favor reinicia el proceso.");
      navigate("/recuperar-clave");
      return;
    }

    setCargando(true);
    setError("");
    setMensaje("");

    try {
      const res = await fetch("http://localhost:8000auth/verificar-codigo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo, codigo: codigoCompleto }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Código inválido");

      // Guardar el código para el siguiente paso
      localStorage.setItem("codigo_recuperacion", codigoCompleto);
      
      setMensaje("Código verificado correctamente");
      setTimeout(() => navigate("/cambiar-clave"), 1500);
    } catch (err: any) {
      setError(err.message);
      // Limpiar los inputs en caso de error
      setCodigo(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setCargando(false);
    }
  };

  const reenviarCodigo = async () => {
    setCargando(true);
    setError("");
    setMensaje("");

    try {
      const formData = new FormData();
      formData.append("correo", correo || "");

      const res = await fetch("http://localhost:8000auth/solicitar-codigo", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error inesperado");

      setMensaje("Nuevo código enviado a tu correo");
      setCodigo(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || "Error al reenviar el código");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="verificar-codigo-container">
      <div className="icon-container">
        <div className="icon-background">
          <span className="icon">🔐</span>
        </div>
      </div>
      
      <h2>Verificar código</h2>
      <p>Ingresa el código de 6 dígitos que enviamos a<br />
        <strong>{correo}</strong>
      </p>

      <div className="codigo-inputs">
        {codigo.map((digit, index) => (
          <input
            key={index}
            ref={el => inputRefs.current[index] = el}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={index === 0 ? handlePaste : undefined}
            className={`codigo-input ${digit ? 'filled' : ''}`}
            disabled={cargando}
          />
        ))}
      </div>

      <button 
        onClick={verificar} 
        disabled={cargando || codigo.some(d => !d)}
        className="verificar-button"
      >
        {cargando ? (
          <>Verificando<span className="loading"></span></>
        ) : (
          "Verificar código"
        )}
      </button>

      <div className="resend-section">
        <p>¿No recibiste el código?</p>
        <button 
          onClick={reenviarCodigo} 
          className="resend-button"
          disabled={cargando}
        >
          Reenviar código
        </button>
      </div>

      {mensaje && <p className="mensaje-exito">{mensaje}</p>}
      {error && <p className="mensaje-error">{error}</p>}
      
      <a href="/recuperar-clave" className="volver-link">
        Cambiar correo
      </a>
    </div>
  );
}
