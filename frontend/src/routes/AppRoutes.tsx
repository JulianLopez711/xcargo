import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../context/authContext";
import Layout from "../components/layout";
import ProtectedRoute from "../components/ProtectedRoute";
import Login from "../pages/login/Login";

// Admin
import DashboardAdmin from "../pages/admin/Dashboard";
import UserManagement from "../pages/admin/UserManagement";
import EntregasAdmin from "../pages/admin/Entregas";
import RoleManagement from "../pages/admin/RoleManagement";
import GeneralSettings from "../pages/admin/GeneralSettings";

// Contabilidad
import DashboardContabilidad from "../pages/contabilidad/Dashboard";
import PagosContabilidad from "../pages/contabilidad/Pagos";
import EntregasContabilidad from "../pages/contabilidad/Entregas";
import CrucesContabilidad from "../pages/contabilidad/Cruces";
import PagoEntregas from "../pages/contabilidad/PagoEntregas";
import CalendarioConciliacion from "../pages/contabilidad/CalendarioConciliacion";
import HistorialPagos from "../pages/contabilidad/HistorialPagos";

// Operador
import DashboardOperador from "../pages/operador/Dashboard";
import HistorialOperador from "../pages/operador/historial";
import PagoOperador from "../pages/operador/PagoOperador";
import RegistrarPagoOperador from "../pages/operador/RegistrarPago";

// Conductor
import PagosPendientes from "../pages/conductor/PagosPendientes";
import FormularioPagoConductor from "../pages/conductor/RegistrarPago";

// Recuperación de contraseña
import RecuperarClave from "../pages/login/RecuperarClave";
import VerificarCodigo from "../pages/login/VerificarCodigo";
import NuevaClave from "../pages/login/NuevaClave";

export default function AppRoutes() {
  const { isLoading } = useAuth();

  if (isLoading) return <div>Cargando...</div>;

  return (
    <Routes>
      <Route path="/" element={<Login />} />

      {/* ADMIN - Usando permisos específicos */}
      <Route
        element={
          <ProtectedRoute requiredPermission="admin_dashboard">
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route 
          path="/admin/dashboard" 
          element={
            <ProtectedRoute requiredPermission="admin_dashboard">
              <DashboardAdmin />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin/usuarios" 
          element={
            <ProtectedRoute requiredPermission="admin_usuarios">
              <UserManagement />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin/entregas" 
          element={
            <ProtectedRoute requiredPermission="admin_dashboard">
              <EntregasAdmin />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin/roles" 
          element={
            <ProtectedRoute requiredPermission="admin_roles">
              <RoleManagement />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin/configuracion" 
          element={
            <ProtectedRoute requiredPermission="admin_dashboard">
              <GeneralSettings />
            </ProtectedRoute>
          } 
        />
      </Route>

      {/* CONTABILIDAD - Usando permisos específicos */}
      <Route
        element={
          <ProtectedRoute requiredPermission="contabilidad_dashboard">
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route
          path="/contabilidad/dashboard"
          element={
            <ProtectedRoute requiredPermission="contabilidad_dashboard">
              <DashboardContabilidad />
            </ProtectedRoute>
          }
        />
        <Route 
          path="/contabilidad/calendario" 
          element={
            <ProtectedRoute requiredPermission="contabilidad_dashboard">
              <CalendarioConciliacion />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/contabilidad/historial" 
          element={
            <ProtectedRoute requiredPermission="contabilidad_dashboard">
              <HistorialPagos />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/contabilidad/pagos" 
          element={
            <ProtectedRoute requiredPermission="contabilidad_pagos">
              <PagosContabilidad />
            </ProtectedRoute>
          } 
        />
        <Route
          path="/contabilidad/entregas"
          element={
            <ProtectedRoute requiredPermission="contabilidad_dashboard">
              <EntregasContabilidad />
            </ProtectedRoute>
          }
        />
        <Route 
          path="/contabilidad/cruces" 
          element={
            <ProtectedRoute requiredPermission="contabilidad_dashboard">
              <CrucesContabilidad />
            </ProtectedRoute>
          } 
        />
        <Route
          path="/contabilidad/pago-entregas"
          element={
            <ProtectedRoute requiredPermission="contabilidad_pagos">
              <PagoEntregas />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* OPERADOR - Usando permisos específicos */}
      <Route
        element={
          <ProtectedRoute requiredPermission="operador_dashboard">
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route 
          path="/operador/dashboard" 
          element={
            <ProtectedRoute requiredPermission="operador_dashboard">
              <DashboardOperador />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/operador/historial" 
          element={
            <ProtectedRoute requiredPermission="operador_dashboard">
              <HistorialOperador />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/operador/registrar" 
          element={
            <ProtectedRoute requiredPermission="operador_dashboard">
              <RegistrarPagoOperador />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/operador/pago" 
          element={
            <ProtectedRoute requiredPermission="operador_dashboard">
              <PagoOperador />
            </ProtectedRoute>
          } 
        />
      </Route>

      {/* CONDUCTOR - Usando permisos específicos */}
      <Route
        element={
          <ProtectedRoute requiredPermission="conductor_pagos">
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route 
          path="/conductor/pagos" 
          element={
            <ProtectedRoute requiredPermission="conductor_pagos">
              <PagosPendientes />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/conductor/pago" 
          element={
            <ProtectedRoute requiredPermission="conductor_pagos">
              <FormularioPagoConductor />
            </ProtectedRoute>
          } 
        />
      </Route>

      {/* PÚBLICO - Recuperación de contraseña */}
      <Route path="/recuperar-clave" element={<RecuperarClave />} />
      <Route path="/verificar-codigo" element={<VerificarCodigo />} />
      <Route path="/cambiar-clave" element={<NuevaClave />} />

      {/* Redirección genérica */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}