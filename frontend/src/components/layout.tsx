import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import "../styles/Layout.css"; // Asegúrate de crear este CSS

export default function Layout() {
  return (
    <div className="layout-container">
      <Navbar />
      <main className="layout-content">
        <Outlet />
      </main>
    </div>
  );
}
