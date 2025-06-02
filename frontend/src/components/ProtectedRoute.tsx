// src/components/ProtectedRoute.tsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/authContext";

// Función para verificar si el usuario tiene un permiso específico
function userHasPermission(user: any, requiredPermission: string): boolean {
  if (!user.permisos) return false;
  return user.permisos.some((permiso: any) => permiso.id === requiredPermission);
}

interface ProtectedRouteProps {
  allowedRoles?: string[];
  requiredPermission?: string;
  children: React.ReactNode;
}

export default function ProtectedRoute({
  allowedRoles,
  requiredPermission,
  children
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="loading">Cargando...</div>;
  }

 if (!user || !user.token) {
  console.warn("Usuario no autenticado o sin token. Redirigiendo al login...");
  return <Navigate to="/" replace />;
}


  if (requiredPermission && !userHasPermission(user, requiredPermission)) {
    console.warn(`Usuario sin permiso "${requiredPermission}". Acceso denegado.`);
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    console.warn(`Rol "${user.role}" no autorizado para esta ruta.`);
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
