import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Alert, AlertDescription } from "../components/ui/alert";
import { toast } from "sonner";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const u = await register(form);
      toast.success(`Account created for ${u.name}`);
      nav("/dashboard");
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2" data-testid="register-page">
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
            <p className="text-xs tracking-[0.3em] uppercase mb-4 opacity-70">Get started</p>
            <h1 className="font-display text-5xl xl:text-6xl leading-none tracking-tighter">
              Your queue.<br />Reimagined.
            </h1>
          </div>
          <div className="font-mono text-xs opacity-60 tracking-wider">© 2026 — QF/01</div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <form onSubmit={onSubmit} className="w-full max-w-sm anim-fade-up" data-testid="register-form">
          <p className="text-xs tracking-[0.3em] uppercase font-bold text-muted-foreground mb-3">
            Register
          </p>
          <h2 className="font-display text-4xl tracking-tighter mb-8">Create account.</h2>
          {err && (
            <Alert variant="destructive" className="mb-4 rounded-xl" data-testid="register-error">
              <AlertDescription>{err}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" required value={form.name} onChange={upd("name")} data-testid="register-name-input" className="rounded-xl mt-1" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={form.email} onChange={upd("email")} data-testid="register-email-input" className="rounded-xl mt-1" />
            </div>
            <div>
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" value={form.phone} onChange={upd("phone")} data-testid="register-phone-input" className="rounded-xl mt-1" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={form.password} onChange={upd("password")} data-testid="register-password-input" className="rounded-xl mt-1" />
            </div>
          </div>
          <Button type="submit" disabled={loading} data-testid="register-submit-btn" className="w-full mt-6 rounded-xl h-11 font-bold tracking-wide">
            {loading ? "Creating…" : "Create account →"}
          </Button>
          <p className="text-sm text-muted-foreground mt-6 text-center">
            Already a member?{" "}
            <Link to="/login" className="text-primary font-semibold underline-offset-4 hover:underline" data-testid="goto-login">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
