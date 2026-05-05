import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { Button } from "./ui/button";
import { Moon, Sun, LogOut, User as UserIcon } from "lucide-react";

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header
        data-testid="app-header"
        className="border-b border-border bg-card sticky top-0 z-30"
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" data-testid="brand-link" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary flex items-center justify-center">
              <span className="font-mono text-primary-foreground font-bold text-sm">Q</span>
            </div>
            <span className="font-display text-xl tracking-tighter">QUEUEFLOW</span>
          </Link>
          <nav className="flex items-center gap-2">
            {user && user !== false && user.role === "admin" && (
              <Link to="/admin" data-testid="nav-admin">
                <Button variant="ghost" size="sm">Admin</Button>
              </Link>
            )}
            {user && user !== false && (
              <Link to="/dashboard" data-testid="nav-dashboard">
                <Button variant="ghost" size="sm">Dashboard</Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              data-testid="theme-toggle"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {user && user !== false ? (
              <>
                <span
                  data-testid="user-name"
                  className="text-sm text-muted-foreground hidden sm:flex items-center gap-1"
                >
                  <UserIcon className="h-3.5 w-3.5" /> {user.name}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleLogout}
                  data-testid="logout-btn"
                  className="rounded-xl"
                >
                  <LogOut className="h-3.5 w-3.5 mr-1" /> Logout
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" data-testid="nav-login">
                  <Button variant="ghost" size="sm">Login</Button>
                </Link>
                <Link to="/register" data-testid="nav-register">
                  <Button size="sm" className="rounded-xl">Register</Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border py-6 px-6 text-xs text-muted-foreground tracking-[0.2em] uppercase font-bold text-center">
        QueueFlow · Built for service excellence
      </footer>
    </div>
  );
}
