// src/components/ProtectedRoute.tsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/authContext";

interface ProtectedRouteProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

export default function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="loading">Cargando...</div>;
  }

  if (!user) {
    console.warn("Usuario no autenticado. Redirigiendo al login...");
    return <Navigate to="/" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    console.warn(`Rol "${user.role}" no autorizado para esta ruta.`);
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
