import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Alert, AlertDescription } from "../components/ui/alert";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const u = await login(email, password);
      toast.success(`Welcome back, ${u.name}`);
      const next = loc.state?.from || (u.role === "admin" ? "/admin" : "/dashboard");
      nav(next);
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen relative grid lg:grid-cols-2"
      data-testid="login-page"
    >
      <div className="hidden lg:block relative">
        <img
          src="https://images.unsplash.com/photo-1768270181430-3e3672a32283?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/65" />
        <div className="relative z-10 h-full p-12 flex flex-col justify-between text-white">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white flex items-center justify-center">
              <span className="font-mono text-black font-bold text-sm">Q</span>
            </div>
            <span className="font-display text-xl tracking-tighter">QUEUEFLOW</span>
          </Link>
          <div>
            <p className="text-xs tracking-[0.3em] uppercase mb-4 opacity-70">Queue Intelligence</p>
            <h1 className="font-display text-5xl xl:text-6xl leading-none tracking-tighter">
              Skip the line.<br />Own your time.
            </h1>
            <p className="mt-6 text-sm opacity-80 max-w-md leading-relaxed">
              A clean, real-time queue management platform built for banks, clinics
              and service centers that respect their customers.
            </p>
          </div>
          <div className="font-mono text-xs opacity-60 tracking-wider">© 2026 — QF/01</div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-sm anim-fade-up"
          data-testid="login-form"
        >
          <p className="text-xs tracking-[0.3em] uppercase font-bold text-muted-foreground mb-3">
            Sign In
          </p>
          <h2 className="font-display text-4xl tracking-tighter mb-8">Welcome back.</h2>
          {err && (
            <Alert variant="destructive" className="mb-4 rounded-xl" data-testid="login-error">
              <AlertDescription>{err}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="login-email-input"
                className="rounded-xl mt-1"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="login-password-input"
                className="rounded-xl mt-1"
              />
            </div>
          </div>
          <Button
            type="submit"
            disabled={loading}
            data-testid="login-submit-btn"
            className="w-full mt-6 rounded-xl h-11 font-bold tracking-wide"
          >
            {loading ? "Signing in…" : "Sign In →"}
          </Button>
          <p className="text-sm text-muted-foreground mt-6 text-center">
            New here?{" "}
            <Link to="/register" className="text-primary font-semibold underline-offset-4 hover:underline" data-testid="goto-register">
              Create account
            </Link>
          </p>
          <div className="mt-8 p-3 border border-dashed border-border bg-muted/40 text-xs font-mono">
            <div className="font-bold text-[10px] tracking-widest uppercase mb-1 text-muted-foreground">Demo admin</div>
            admin@qms.com / admin123
          </div>
        </form>
      </div>
    </div>
  );
}
