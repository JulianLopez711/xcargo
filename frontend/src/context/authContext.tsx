import { createContext, useContext, useEffect, useState, ReactNode } from "react";

// Definimos el tipo de datos que tendrá nuestro contexto
interface AuthContextType {
  nombre: string;
  rol: string;
  login: (rol: string, nombre: string) => void;
  logout: () => void;
  isLoading: boolean;
}

// Creamos el contexto
const AuthContext = createContext<AuthContextType>({
  nombre: "",
  rol: "",
  login: () => {},
  logout: () => {},
  isLoading: true,
});

// Hook personalizado para usar el contexto
export const useAuth = () => useContext(AuthContext);

// Componente proveedor del contexto
export function AuthProvider({ children }: { children: ReactNode }) {
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Cargamos datos del localStorage al montar
  useEffect(() => {
    const nombreGuardado = localStorage.getItem("nombre");
    const rolGuardado = localStorage.getItem("rol");
    if (nombreGuardado && rolGuardado) {
      setNombre(nombreGuardado);
      setRol(rolGuardado);
    }
    setIsLoading(false);
  }, []);

  // Función de login
  const login = (nuevoRol: string, nuevoNombre: string) => {
    setNombre(nuevoNombre);
    setRol(nuevoRol);
    localStorage.setItem("nombre", nuevoNombre);
    localStorage.setItem("rol", nuevoRol);
  };

  // Función de logout
  const logout = () => {
    setNombre("");
    setRol("");
    localStorage.removeItem("nombre");
    localStorage.removeItem("rol");
    window.location.href = "/";
  };

  return (
    <AuthContext.Provider value={{ nombre, rol, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
