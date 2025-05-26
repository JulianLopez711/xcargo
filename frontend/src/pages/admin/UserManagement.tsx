import { useState } from "react";
import FormCrearUsuario from "../../components/Admin/FormCrearUsuario";
import FormCambiarRol from "../../components/Admin/FormCambiarRol";
import FormRestablecerClave from "../../components/Admin/FormRestablecerClave";
import "../../styles/admin/UserManagement.css";

export default function UserManagement() {
  const [activeTab, setActiveTab] = useState("crearUsuario");

  return (
    <div className="user-management-container">
      <h1>Gestión de Usuarios</h1>
      <div className="tabs">
        <button
          className={activeTab === "crearUsuario" ? "active" : ""}
          onClick={() => setActiveTab("crearUsuario")}
        >
          Crear Usuario
        </button>
        <button
          className={activeTab === "cambiarRol" ? "active" : ""}
          onClick={() => setActiveTab("cambiarRol")}
        >
          Cambiar Rol
          Crear Rol
        </button>
        <button
          className={activeTab === "restablecerClave" ? "active" : ""}
          onClick={() => setActiveTab("restablecerClave")}
        >
          Restablecer Clave
        </button>
      </div>

      <div className="form-container">
        {activeTab === "crearUsuario" && <FormCrearUsuario />}
        {activeTab === "cambiarRol" && <FormCambiarRol />}
        {activeTab === "restablecerClave" && <FormRestablecerClave />}
      </div>
    </div>
  );
}
