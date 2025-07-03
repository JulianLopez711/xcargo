// ValidadorPago.tsx
import { useState, useEffect } from "react";

interface GuiaSeleccionada {
    referencia: string;
    valor: number;
    tracking?: string;
    empresa?: string;
}

interface BonoUsado {
    valor_usado: number;
    [key: string]: any;
}

interface ValidacionResult {
    valido: boolean;
    mensaje: string;
    bonos_a_usar?: BonoUsado[];
    nuevo_bono?: number;
    [key: string]: any;
}

interface Props {
    guiasSeleccionadas: GuiaSeleccionada[];
    valorConsignado: number;
    onValidacionChange: (resultado: ValidacionResult) => void;
}

function getToken(): string {
    return localStorage.getItem("token") || "";
}

function getUserId(): string | null {
    const user = localStorage.getItem("user");
    if (!user) return null;
    try {
        const parsed = JSON.parse(user);
        return parsed.id_usuario || null;
    } catch {
        return null;
    }
}

const ValidadorPago: React.FC<Props> = ({ guiasSeleccionadas, valorConsignado, onValidacionChange }) => {
    const [validacion, setValidacion] = useState<ValidacionResult | null>(null);
    const [cargando, setCargando] = useState(false);

    useEffect(() => {
        const validarPago = async () => {
            if (guiasSeleccionadas.length === 0 || valorConsignado <= 0) return;

            const userId = getUserId();
            if (!userId) {
                console.error("❌ No se encontró id_usuario en localStorage");
                return;
            }

            const payload = {
                guias: guiasSeleccionadas.map((guia) => ({
                    tracking: guia.tracking,
                    valor: guia.valor,
                    cliente: guia.empresa
                })),
                valor_consignado: valorConsignado,
                employee_id: userId
            };

            console.log("📦 Enviando payload:", payload);

            setCargando(true);
            try {
                const res = await fetch("http://127.0.0.1:8000/pagos-avanzados/validar-pago", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${getToken()}`
                    },
                    body: JSON.stringify(payload)
                });

                const resultado = await res.json();
                const resultadoForzado = {
                    ...resultado,
                    valido: valorConsignado > 0,
                    mensaje: valorConsignado > 0
                        ? "Pago parcial aceptado (se acumulará con otros comprobantes)"
                        : resultado.mensaje
                };

                setValidacion(resultadoForzado);
                onValidacionChange(resultadoForzado);

            } catch (error) {
                console.error("Error validando pago:", error);
            } finally {
                setCargando(false);
            }
        };

        const timer = setTimeout(validarPago, 500);
        return () => clearTimeout(timer);
    }, [guiasSeleccionadas, valorConsignado, onValidacionChange]);

    if (cargando) return <div>Validando...</div>;
    if (!validacion) return null;

    return (
        <div className={`validacion-resultado ${validacion.valido ? "valido" : "invalido"}`}>
            <div className="validacion-icono">
                {validacion.valido ? "✅" : "❌"}
            </div>
            <div className="validacion-mensaje">
                {validacion.mensaje}
            </div>

            {validacion.bonos_a_usar && validacion.bonos_a_usar.length > 0 && (
                <div className="bonos-uso">
                    <h4>Bonos a utilizar:</h4>
                    {validacion.bonos_a_usar.map((bono, idx) => (
                        <div key={idx} className="bono-item">
                            💰 ${bono.valor_usado.toLocaleString()}
                        </div>
                    ))}
                </div>
            )}

            {(validacion.nuevo_bono ?? 0) > 0 && (
                <div className="nuevo-bono">
                    🎁 Nuevo bono: ${(validacion.nuevo_bono ?? 0).toLocaleString()}
                </div>
            )}
        </div>
    );
};

export default ValidadorPago;
