import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import "../../styles/RegistrarPago.css";
import LoadingSpinner from "../../components/LoadingSpinner";


type GuiaPago = { referencia: string; valor: number };
type DatosPago = {
  valor: string;
  fecha: string;
  hora: string;
  tipo_pago: string;
  entidad: string;
  referencia: string;
};

type PagoCompleto = {
  datos: DatosPago;
  archivo: File;
};

export default function RegistrarPago() {
  const location = useLocation();
  const navigate = useNavigate();

  const {
    guias,
    total,
    bono = 0,
  }: { guias: GuiaPago[]; total: number; bono?: number } = location.state || {
    guias: [],
    total: 0,
    bono: 0,
  };

  const [archivo, setArchivo] = useState<File | null>(null);
  const [usarBono, setUsarBono] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [pagosCargados, setPagosCargados] = useState<PagoCompleto[]>([]);
  const [datosManuales, setDatosManuales] = useState<DatosPago>({
    valor: "",
    fecha: "",
    hora: "",
    tipo_pago: "",
    entidad: "",
    referencia: "",
  });

  const totalConBono = Math.max(total - (usarBono ? bono : 0), 0);

  function parseValorMonetario(valor: string): number {
    const limpio = valor
      .replace(/[^0-9.,]/g, "")
      .replace(/\.(?=\d{3,})/g, "")
      .replace(",", ".");
    const num = parseFloat(limpio);
    return isNaN(num) ? 0 : num;
  }

  const totalAcumulado = pagosCargados.reduce((sum, p) => {
    const val = parseValorMonetario(p.datos.valor);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setArchivo(file);
    if (!file) return;

    setAnalizando(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:8000/ocr/extraer", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      const data = result?.datos_extraidos;

      if (data) {
        setDatosManuales({
          valor: data.valor || "",
          fecha: data.fecha_transaccion || "",
          hora: data.hora_transaccion || "",
          tipo_pago: data.entidad_financiera || "",
          entidad: data.entidad_financiera || "",
          referencia: data.referencia_pago || data.numero_confirmacion || "",
        });
      } else {
        alert("No se pudieron extraer los datos del comprobante.");
      }
    } catch (err) {
      console.error("Error al extraer datos:", err);
      alert("No se pudo leer el comprobante. Intenta nuevamente.");
    } finally {
      setAnalizando(false);
    }
  };

  const agregarPago = () => {
    const campos = Object.entries(datosManuales);
    for (const [key, val] of campos) {
      if (!val.trim()) {
        alert(`El campo "${key}" es obligatorio`);
        return;
      }
    }

    if (!archivo) {
      alert("Debes adjuntar el comprobante de pago.");
      return;
    }

    const referencia = datosManuales.referencia.trim();
    const fechaHora = `${datosManuales.fecha.trim()} ${datosManuales.hora.trim()}`;

    const duplicado = pagosCargados.find(
      (p) =>
        p.datos.referencia === referencia ||
        (`${p.datos.fecha} ${p.datos.hora}` === fechaHora)
    );

    if (duplicado) {
      alert("Este comprobante ya fue cargado (referencia o fecha/hora duplicada).");
      return;
    }

    setPagosCargados((prev) => [...prev, { datos: datosManuales, archivo }]);
    setDatosManuales({
      valor: "",
      fecha: "",
      hora: "",
      tipo_pago: "",
      entidad: "",
      referencia: "",
    });
    setArchivo(null);
  };

  const eliminarPago = (referencia: string) => {
    setPagosCargados((prev) =>
      prev.filter((p) => p.datos.referencia !== referencia)
    );
  };

  const registrarTodosLosPagos = async () => {
    if (totalAcumulado < totalConBono) {
      alert("El total acumulado aún no cubre el valor requerido.");
      return;
    }

    setCargando(true);

    setTimeout(() => {
      const excedente = totalAcumulado - totalConBono;
      const nuevoBono = excedente > 0 ? excedente : 0;
      localStorage.setItem("bonoAFavor", nuevoBono.toFixed(2));
      alert("✅ Pagos registrados correctamente.");
      navigate("/conductor/pagos");
    }, 1500);
  };

  return (
    <div className="registrar-pago">
      <h1>Registrar Pago</h1>

      <div className="tabla-guias">
        <h2>Guías seleccionadas</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Referencia</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {guias.map((g: GuiaPago, idx: number) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{g.referencia}</td>
                <td>${g.valor.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="resumen-pago">
          <div className="linea">
            <span>Total guías:</span>
            <strong>${total.toLocaleString()}</strong>
          </div>

          {bono > 0 && (
            <>
              <div className="linea bono-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={usarBono}
                    onChange={() => setUsarBono(!usarBono)}
                  />
                  Usar bono a favor (${bono.toLocaleString()})
                </label>
              </div>
              <div className="linea total-destacado">
                <span>Total a pagar:</span>
                <strong>${totalConBono.toLocaleString()}</strong>
              </div>
            </>
          )}
        </div>
      </div>

      {pagosCargados.length > 0 && (
        <div className="pagos-cargados">
          <h3>Pagos cargados</h3>
          <table>
            <thead>
              <tr>
                <th>Valor</th>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Entidad</th>
                <th>Referencia</th>
                <th>Comprobante</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {pagosCargados.map((p, idx) => (
                <tr key={idx}>
                  <td>${parseValorMonetario(p.datos.valor).toLocaleString("es-CO")}</td>
                  <td>{p.datos.fecha}</td>
                  <td>{p.datos.hora}</td>
                  <td>{p.datos.entidad}</td>
                  <td>{p.datos.referencia}</td>
                  <td>
                    <a
                      href={URL.createObjectURL(p.archivo)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver
                    </a>
                  </td>
                  <td>
                    <button onClick={() => eliminarPago(p.datos.referencia)}>🗑 Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="resumen-acumulado">
            <p><strong>Total acumulado:</strong> ${totalAcumulado.toLocaleString("es-CO")}</p>
            {totalAcumulado < totalConBono ? (
              <p style={{ color: "crimson" }}>
                Faltan ${(totalConBono - totalAcumulado).toLocaleString("es-CO")}
              </p>
            ) : (
              <p style={{ color: "green" }}>
                ✅ Cubierto. Excedente: ${(totalAcumulado - totalConBono).toLocaleString("es-CO")}
              </p>
            )}
          </div>

          {totalAcumulado >= totalConBono && (
            <button className="boton-registrar" onClick={registrarTodosLosPagos}>
              ✅ Registrar todos los pagos
            </button>
          )}
        </div>
      )}

      <form className="formulario-pago" onSubmit={(e) => e.preventDefault()}>
        <div className="input-group">
          <label>Comprobante de pago</label>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            required
          />
        </div>

        {analizando && (
          <div style={{ margin: "1rem 0", color: "#2e7d32", fontWeight: "bold" }}>
            <LoadingSpinner />
            <span style={{ marginLeft: "0.5rem" }}>Comprobando referencia...</span>
          </div>
        )}

        <div className="datos-extraidos">
          {[
            ["valor", "Valor del pago", "$ 0.00"],
            ["fecha", "Fecha", ""],
            ["hora", "Hora", ""],
            ["entidad", "Entidad", ""],
            ["referencia", "Referencia", ""],
            ["tipo_pago", "Tipo de pago", ""],
          ].map(([key, label, placeholder]) => (
            <div className="input-group" key={key}>
              <label>{label}</label>
              <input
                type={key === "fecha" ? "date" : key === "hora" ? "time" : "text"}
                value={datosManuales[key as keyof DatosPago]}
                onChange={(e) =>
                  setDatosManuales((prev) => ({
                    ...prev,
                    [key]: e.target.value,
                  }))
                }
                placeholder={placeholder}
                required
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          className="boton-secundario"
          onClick={agregarPago}
          disabled={analizando}
        >
          ➕ Agregar pago
        </button>
      </form>

      {cargando && <LoadingSpinner />}
    </div>
  );
}
