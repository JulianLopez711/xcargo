import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../context/authContext";

// Layout y protección
import Layout from "../components/Layout";
import ProtectedRoute from "../components/ProtectedRoute";
import Login from "../pages/login/Login";

// Admin
import DashboardAdmin from "../pages/admin/Dashboard";
import UserManagement from "../pages/admin/UserManagement";
import GeneralSettings from "../pages/admin/GeneralSettings";
import Reportes from "../pages/admin/Reportes";
import Historial from "../pages/admin/Historial";
import EntregasAdmin from "../pages/admin/Entregas";
import PagosAdmin from "../pages/admin/Pagos";
import CrucesAdmin from "../pages/admin/Cruces";
import RoleManagement from "../pages/admin/RoleManagement";

// Conductor
import DashboardConductor from "../pages/conductor/Dashboard";
import PagosPendientes from "../pages/conductor/PagosPendientes";
import FormularioPagoConductor from "../pages/conductor/FormularioPagoConductor";

// Contabilidad
import DashboardContabilidad from "../pages/contabilidad/Dashboard";
import Pagos from "../pages/contabilidad/Pagos";
import Cruces from "../pages/contabilidad/Cruces";
import Entregas from "../pages/contabilidad/Entregas";

// Operador
import DashboardOperador from "../pages/operador/Dashboard";
import HistorialPedidos from "../pages/operador/historial";
import RegistrarPago from "../pages/operador/RegistrarPago";
import PagosOperador from "../pages/operador/PagoOperador";
import GuiasPendientes from "../pages/operador/GuiasPendientes";

export default function AppRoutes() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return <div className="loading">Cargando aplicación...</div>;
  }

  return (
    <Routes>
      {/* Ruta pública */}
      <Route path="/" element={<Login />} />

      {/* Admin */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardAdmin />} />
        <Route path="usuarios" element={<UserManagement />} />
        <Route path="configuracion" element={<GeneralSettings />} />
        <Route path="reportes" element={<Reportes />} />
        <Route path="historial" element={<Historial />} />
        <Route path="roles" element={<RoleManagement />} />
        <Route path="entregas" element={<EntregasAdmin />} />
        <Route path="pagos" element={<PagosAdmin />} />
        <Route path="cruces" element={<CrucesAdmin />} />
      </Route>

      {/* Conductor */}
      <Route
        path="/conductor"
        element={
          <ProtectedRoute allowedRoles={["conductor"]}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardConductor />} />
        <Route path="pagos-pendientes" element={<PagosPendientes />} />
        <Route path="formulario-pago" element={<FormularioPagoConductor />} />
      </Route>

      {/* Contabilidad */}
      <Route
        path="/contabilidad"
        element={
          <ProtectedRoute allowedRoles={["contabilidad"]}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardContabilidad />} />
        <Route path="entregas" element={<Entregas />} />
        <Route path="pagos" element={<Pagos />} />
        <Route path="cruces" element={<Cruces />} />
      </Route>

      {/* Operador */}
      <Route
        path="/operador"
        element={
          <ProtectedRoute allowedRoles={["operador"]}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardOperador />} />
        <Route path="historial" element={<HistorialPedidos />} />
        <Route path="pagos-operador" element={<PagosOperador />} />
        <Route path="registrar-pago" element={<RegistrarPago />} />
        <Route path="guias-pendientes" element={<GuiasPendientes />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
