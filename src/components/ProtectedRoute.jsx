import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, loading } = useAuth();
  if (loading || user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-mono text-sm text-muted-foreground tracking-widest">LOADING…</div>
      </div>
    );
  }
  if (user === false) return <Navigate to="/login" replace />;
  if (requireAdmin && user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}
