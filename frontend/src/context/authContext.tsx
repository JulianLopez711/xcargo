// src/context/authContext.tsx
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
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);

        
        // ✅ Verificar que tenga token
        if (parsedUser && parsedUser.token) {
          setUser(parsedUser);
        } else {
          console.warn("⚠️ Usuario sin token válido, limpiando localStorage");
          localStorage.removeItem("user");
        }
      } catch (error) {
        console.error("❌ Error parseando usuario del localStorage:", error);
        localStorage.removeItem("user");
      }
    }
    setIsLoading(false);
  }, []);

  const login = (userData: User) => {

    
    // ✅ Verificar que tenga token antes de guardar
    if (!userData.token) {
      console.error("❌ Error: Usuario sin token válido");
      return;
    }
    
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {

    localStorage.removeItem("user");
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);