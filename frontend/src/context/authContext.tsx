// src/context/authContext.tsx - VERSIÓN CORREGIDA
import { createContext, useContext, useEffect, useState } from "react";

interface User {
  email: string;
  role: string;
  token: string; // ✅ obligatorio para ProtectedRoute
  empresa_carrier?: string;
  permisos?: Array<{ id: string; nombre: string; modulo: string; ruta: string }>;
  // ✅ Campos adicionales del backend
  nombre?: string;
  telefono?: string;
  id_usuario?: string;
  clave_defecto?: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  isLoading: boolean;
  getToken: () => string | null; // ✅ Agregar método helper
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
  getToken: () => null,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    
    const storedUser = localStorage.getItem("user");
    const storedToken = localStorage.getItem("token"); // ✅ También verificar token separado
    
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        
        // ✅ Usar token del localStorage si existe, o el del objeto user
        const finalToken = storedToken || parsedUser.token;
        
        if (parsedUser && finalToken) {
          const userWithToken = {
            ...parsedUser,
            token: finalToken
          };
          

          setUser(userWithToken);
        } else {
          console.warn("⚠️ Usuario sin token válido, limpiando localStorage");
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
      } catch (error) {
        console.error("❌ Error parseando usuario del localStorage:", error);
        localStorage.removeItem("user");
        localStorage.removeItem("token");
      }
    }
    setIsLoading(false);
  }, []);

  const login = (userData: User) => {

    if (!userData.token) {
      console.error("❌ Error: Usuario sin token válido");
      return;
    }
    
    // ✅ CRÍTICO: Guardar TANTO el user como el token por separado
    localStorage.setItem("user", JSON.stringify(userData));
    localStorage.setItem("token", userData.token); // ✅ Esta línea faltaba!
    
    setUser(userData);

    
    // Verificación inmediata

  };

  const logout = () => {

    
    localStorage.removeItem("user");
    localStorage.removeItem("token"); // ✅ Limpiar ambos
    setUser(null);
    

  };

  // ✅ Método helper para obtener token
  const getToken = (): string | null => {
    // Primero del estado actual
    if (user?.token) {
      return user.token;
    }
    
    // Fallback del localStorage
    return localStorage.getItem("token");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, getToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);