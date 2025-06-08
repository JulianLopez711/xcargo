// Nuevo componente: ValidadorPago.tsx
import { useState, useEffect } from "react";

// Define los tipos necesarios
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

// Debes implementar estas funciones utilitarias según tu contexto de autenticación
function getToken(): string {
    // Implementa según tu sistema de auth
    return localStorage.getItem("token") || "";
}
function getUserEmployeeId(): number | null {
    // Implementa según tu sistema de usuario
    const user = localStorage.getItem("user");
    if (!user) return null;
    try {
        const parsed = JSON.parse(user);
        return parsed.employee_id || null;
    } catch {
        return null;
    }
}

const ValidadorPago: React.FC<Props> = ({ 
    guiasSeleccionadas, 
    valorConsignado, 
    onValidacionChange 
}) => {
    const [validacion, setValidacion] = useState<ValidacionResult | null>(null);
    const [cargando, setCargando] = useState(false);

    useEffect(() => {
        const validarPago = async () => {
            if (guiasSeleccionadas.length === 0 || valorConsignado <= 0) return;

            setCargando(true);
            try {
                const response = await fetch('/api/pagos-avanzados/validar-pago', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${getToken()}`
                    },
                    body: JSON.stringify({
                        guias: guiasSeleccionadas,
                        valor_consignado: valorConsignado,
                        employee_id: getUserEmployeeId()
                    })
                });

                const resultado = await response.json();
                setValidacion(resultado);
                onValidacionChange(resultado);

            } catch (error) {
                console.error('Error validando pago:', error);
            } finally {
                setCargando(false);
            }
        };

        // Debounce para evitar muchas llamadas
        const timer = setTimeout(validarPago, 500);
        return () => clearTimeout(timer);

    }, [guiasSeleccionadas, valorConsignado, onValidacionChange]);

    if (cargando) return <div>Validando...</div>;
    if (!validacion) return null;

    return (
        <div className={`validacion-resultado ${validacion.valido ? 'valido' : 'invalido'}`}>
            <div className="validacion-icono">
                {validacion.valido ? '✅' : '❌'}
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