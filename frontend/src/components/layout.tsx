import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import { useLoading } from "../context/loadingContext";
import LoadingSpinner from "./LoadingSpinner";

export default function Layout() {
  const { isLoading } = useLoading();

  return (
    <div className="layout">
      <Navbar />
      <div className="main-content">
        {isLoading ? <LoadingSpinner /> : <Outlet />}
      </div>
    </div>
  );
}
