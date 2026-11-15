import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ProtectedRoute = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        className="d-flex flex-column align-items-center justify-content-center min-vh-100 bg-white"
        style={{ minHeight: "100vh" }}
      >
        <div className="spinner-border text-dark mb-3" role="status" style={{ width: "2.5rem", height: "2.5rem" }}>
          <span className="visually-hidden">Loading session...</span>
        </div>
        <p className="text-secondary small fw-medium mb-0">Verifying session...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
