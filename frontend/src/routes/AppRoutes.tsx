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

      {/* ADMIN */}
      <Route
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin/dashboard" element={<DashboardAdmin />} />
        <Route path="/admin/usuarios" element={<UserManagement />} />
        <Route path="/admin/entregas" element={<EntregasAdmin />} />
        <Route path="/admin/roles" element={<RoleManagement />} />
        <Route path="/admin/configuracion" element={<GeneralSettings />} />
      </Route>

      {/* CONTABILIDAD */}
      <Route
        element={
          <ProtectedRoute allowedRoles={["contabilidad"]}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route
          path="/contabilidad/dashboard"
          element={<DashboardContabilidad />}
        />
        <Route path="/contabilidad/calendario" element={<CalendarioConciliacion />} />
        <Route path="/contabilidad/historial" element={<HistorialPagos />} />
        <Route path="/contabilidad/pagos" element={<PagosContabilidad />} />
        <Route
          path="/contabilidad/entregas"
          element={<EntregasContabilidad />}
        />
        <Route path="/contabilidad/cruces" element={<CrucesContabilidad />} />
        <Route
          path="/contabilidad/pago-entregas"
          element={
            <ProtectedRoute allowedRoles={["contabilidad"]}>
              <PagoEntregas />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* OPERADOR */}
      <Route
        element={
          <ProtectedRoute allowedRoles={["operador"]}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/operador/dashboard" element={<DashboardOperador />} />
        <Route path="/operador/historial" element={<HistorialOperador />} />
        <Route path="/operador/registrar" element={<RegistrarPagoOperador />} />
        <Route path="/operador/pago" element={<PagoOperador />} />
      </Route>

      {/* CONDUCTOR */}
      <Route
        element={
          <ProtectedRoute allowedRoles={["conductor"]}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/conductor/pagos" element={<PagosPendientes />} />
        <Route path="/conductor/pago" element={<FormularioPagoConductor />} />
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
