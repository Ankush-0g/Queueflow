import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { Button } from "../components/ui/button";
import { ArrowRight, Activity, Users, Clock, QrCode } from "lucide-react";

export default function Landing() {
  return (
    <Layout>
      <section className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-20 lg:py-28 grid lg:grid-cols-12 gap-10 items-end">
          <div className="lg:col-span-8">
            <p className="text-xs tracking-[0.3em] uppercase font-bold text-muted-foreground mb-6">
              QF/Platform · v1.0
            </p>
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl tracking-tighter leading-[0.9]">
              Queue management,<br />
              <span className="text-primary">engineered.</span>
            </h1>
            <p className="mt-8 text-base sm:text-lg leading-relaxed text-muted-foreground max-w-xl">
              Real-time tokens, smart counters, public displays and admin
              control — purpose-built for banks, clinics and service centers.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link to="/register">
                <Button size="lg" data-testid="landing-cta-register" className="rounded-xl h-12 px-6 font-bold tracking-wide">
                  Get Started <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline" data-testid="landing-cta-login" className="rounded-xl h-12 px-6 font-bold tracking-wide">
                  Admin Sign-In
                </Button>
              </Link>
            </div>
          </div>
          <div className="lg:col-span-4 font-mono text-xs leading-relaxed border-l border-border pl-6 text-muted-foreground">
            <div className="grid grid-cols-2 gap-y-3">
              <div className="text-[10px] tracking-widest uppercase">Tokens / day</div>
              <div className="text-foreground font-bold">∞</div>
              <div className="text-[10px] tracking-widest uppercase">Avg wait drop</div>
              <div className="text-foreground font-bold">−42%</div>
              <div className="text-[10px] tracking-widest uppercase">Branches</div>
              <div className="text-foreground font-bold">multi</div>
              <div className="text-[10px] tracking-widest uppercase">Latency</div>
              <div className="text-foreground font-bold">&lt; 3s</div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 stagger">
          {[
            { icon: QrCode, label: "QR Token", desc: "Scan & join from anywhere on-site or remotely." },
            { icon: Activity, label: "Live Position", desc: "Updates every 3 seconds — never refresh again." },
            { icon: Users, label: "Multi-Counter", desc: "Assign counters and route tokens intelligently." },
            { icon: Clock, label: "Wait Insights", desc: "Daily, weekly & monthly analytics for admins." },
          ].map((f, i) => (
            <div
              key={i}
              className="p-8 border-r border-border last:border-r-0 border-b md:border-b-0 card-lift rounded-xl"
              data-testid={`feature-${i}`}
            >
              <f.icon className="h-6 w-6 text-primary mb-6" />
              <div className="text-xs tracking-[0.2em] uppercase font-bold mb-2">{f.label}</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="font-display text-4xl lg:text-5xl tracking-tighter leading-tight">
              Built for the<br />moment people walk in.
            </h2>
          </div>
          <ol className="space-y-6">
            {[
              "Customer scans QR or joins from app",
              "Digital token issued instantly",
              "Live position & wait time on their phone",
              "Admin calls next — public display updates",
            ].map((step, i) => (
              <li key={i} className="flex gap-4 items-start border-b border-border pb-5">
                <span className="font-mono text-3xl text-primary font-bold leading-none">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-base sm:text-lg leading-snug">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </Layout>
  );
}
