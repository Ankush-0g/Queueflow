import { useEffect, useState, useCallback } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import api, { formatApiError } from "../lib/api";
import useWebSocket from "../hooks/useWebSocket";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Clock, Users, X, QrCode } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS = {
  waiting: "status-waiting",
  serving: "status-serving",
  completed: "status-completed",
  cancelled: "status-cancelled",
  skipped: "status-skipped",
  hold: "status-hold",
};

export default function UserDashboard() {
  const { user } = useAuth();
  const [queues, setQueues] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [qrToken, setQrToken] = useState(null);
  const [svcPicker, setSvcPicker] = useState(null);
  const [pickedService, setPickedService] = useState("");

  const load = useCallback(async () => {
    try {
      const [q, t] = await Promise.all([api.get("/queues"), api.get("/tokens/my")]);
      setQueues(q.data);
      setTokens(t.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    load();
    // Fallback polling at 10s; WebSocket triggers immediate refreshes
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  // WebSocket: per-user channel
  const wsToken = typeof window !== "undefined" ? localStorage.getItem("qms_token") : null;
  useWebSocket("/api/ws/user", {
    token: wsToken,
    enabled: !!wsToken,
    onEvent: (msg) => {
      if (msg.event === "token_called") {
        const t = msg.data?.token;
        toast.success(`Your turn! ${t?.code} → ${msg.data?.counter_name || "service desk"}`,
                      { duration: 8000 });
      }
      load();
    },
  });

  const join = async (queue, serviceId = null) => {
    try {
      const body = serviceId ? { service_id: serviceId } : {};
      const { data } = await api.post(`/queues/${queue.id}/join`, body);
      toast.success(`Token issued: ${data.code}`);
      setQrToken(data);
      setSvcPicker(null);
      setPickedService("");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Could not join");
    }
  };

  const onJoinClick = (queue) => {
    const services = queue.services || [];
    if (services.length === 0) return join(queue);
    setPickedService(services[0].id);
    setSvcPicker({ queue });
  };

  const cancel = async (id) => {
    try {
      await api.post(`/tokens/${id}/cancel`);
      toast.success("Token cancelled");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const activeTokens = tokens.filter((t) => ["waiting", "serving", "hold"].includes(t.status));
  const history = tokens.filter((t) => !["waiting", "serving", "hold"].includes(t.status));

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-6 py-10">
        <p className="text-xs tracking-[0.3em] uppercase font-bold text-muted-foreground mb-2 anim-fade-in">
          Welcome, {user?.name}
        </p>
        <h1 className="font-display text-4xl sm:text-5xl tracking-tighter mb-10 anim-fade-up">Your Dashboard.</h1>

        {/* Active token */}
        {activeTokens.length > 0 && (
          <section className="mb-12" data-testid="active-tokens-section">
            <h2 className="text-xs tracking-[0.2em] uppercase font-bold text-muted-foreground mb-4">
              Active Tokens
            </h2>
            <div className="grid md:grid-cols-2 gap-4 stagger">
              {activeTokens.map((t) => (
                <Card
                  key={t.id}
                  className={`rounded-xl border-2 border-primary p-6 anim-pop ${t.status === "serving" ? "anim-soft-pulse" : ""}`}
                  data-testid={`active-token-${t.code}`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="text-xs tracking-[0.2em] uppercase font-bold text-muted-foreground">
                        {t.queue_name}
                      </div>
                      {t.service_name && (
                        <div className="text-[11px] font-semibold text-primary mt-0.5">
                          {t.service_name}
                        </div>
                      )}
                      <div className="font-mono text-5xl font-bold tracking-tighter mt-1" data-testid="active-token-code">
                        {t.code}
                      </div>
                    </div>
                    <Badge className={`${STATUS_COLORS[t.status]} rounded-full uppercase font-bold`}>
                      {t.status}
                    </Badge>
                  </div>
                  {t.status === "waiting" && (
                    <div className="grid grid-cols-2 gap-4 my-6 border-y border-border py-4">
                      <div>
                        <div className="text-xs tracking-widest uppercase text-muted-foreground">Position</div>
                        <div className="font-mono text-3xl font-bold mt-1" data-testid="token-position">
                          #{t.position}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs tracking-widest uppercase text-muted-foreground">~ Wait</div>
                        <div className="font-mono text-3xl font-bold mt-1">
                          {t.estimated_wait_minutes}m
                        </div>
                      </div>
                    </div>
                  )}
                  {t.status === "serving" && (
                    <div className="my-6 border-y border-border py-4 text-center">
                      <div className="text-emerald-600 dark:text-emerald-400 font-bold tracking-wider uppercase animate-pulse">
                        Now Serving — Please proceed
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQrToken(t)}
                      data-testid={`qr-btn-${t.code}`}
                      className="rounded-xl"
                    >
                      <QrCode className="h-3.5 w-3.5 mr-1" /> QR
                    </Button>
                    {t.status !== "serving" && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => cancel(t.id)}
                        data-testid={`cancel-token-${t.code}`}
                        className="rounded-xl"
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Cancel
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Queues */}
        <section data-testid="queues-section">
          <h2 className="text-xs tracking-[0.2em] uppercase font-bold text-muted-foreground mb-4">
            Available Queues
          </h2>
          {queues.length === 0 ? (
            <Card className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              No queues available yet. Ask an admin to create one.
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
              {queues.map((q) => {
                const has = activeTokens.find((t) => t.queue_id === q.id);
                const services = q.services || [];
                return (
                  <Card
                    key={q.id}
                    className="rounded-xl border border-border p-6 card-lift"
                    data-testid={`queue-card-${q.id}`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="font-display text-2xl tracking-tighter">{q.name}</h3>
                      <Badge variant="outline" className="rounded-full font-mono text-[10px]">
                        {q.branch}
                      </Badge>
                    </div>
                    {q.description && (
                      <p className="text-sm text-muted-foreground mb-4">{q.description}</p>
                    )}
                    {services.length > 0 && (
                      <div className="mb-3" data-testid={`queue-services-${q.id}`}>
                        <div className="text-[10px] tracking-[0.2em] uppercase font-bold text-muted-foreground mb-2">
                          Services
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {services.slice(0, 4).map((s) => (
                            <span
                              key={s.id}
                              className="text-[11px] font-semibold px-2 py-1 rounded-full bg-muted text-foreground"
                            >
                              {s.name}
                            </span>
                          ))}
                          {services.length > 4 && (
                            <span className="text-[11px] text-muted-foreground px-2 py-1">
                              +{services.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-4 my-4 font-mono">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" /> {q.waiting_count}
                      </div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" /> ~{q.estimated_wait_minutes}m
                      </div>
                    </div>
                    <Button
                      onClick={() => onJoinClick(q)}
                      disabled={!!has}
                      data-testid={`join-queue-${q.id}`}
                      className="w-full rounded-xl h-11 font-bold tracking-wide btn-bounce"
                    >
                      {has ? "Already in queue" : "Join Queue →"}
                    </Button>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* History */}
        {history.length > 0 && (
          <section className="mt-12" data-testid="history-section">
            <h2 className="text-xs tracking-[0.2em] uppercase font-bold text-muted-foreground mb-4">
              History
            </h2>
            <div className="border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs uppercase tracking-widest font-bold">
                    <th className="px-4 py-3">Token</th>
                    <th className="px-4 py-3">Queue</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 10).map((t) => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="px-4 py-2 font-mono font-bold">{t.code}</td>
                      <td className="px-4 py-2">{t.queue_name}</td>
                      <td className="px-4 py-2">
                        <Badge className={`${STATUS_COLORS[t.status]} rounded-xl uppercase font-bold text-[10px]`}>
                          {t.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      <Dialog open={!!svcPicker} onOpenChange={(o) => { if (!o) { setSvcPicker(null); setPickedService(""); } }}>
        <DialogContent className="rounded-xl max-w-md anim-pop" data-testid="service-picker-dialog">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tighter text-2xl">
              Pick a service
            </DialogTitle>
          </DialogHeader>
          {svcPicker && (
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                What do you need help with at <b>{svcPicker.queue.name}</b>?
              </p>
              <div className="space-y-2 max-h-80 overflow-auto pr-1">
                {(svcPicker.queue.services || []).map((s) => {
                  const active = pickedService === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setPickedService(s.id)}
                      data-testid={`service-option-${s.id}`}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{s.name}</div>
                          {s.description && (
                            <div className="text-xs text-muted-foreground mt-1">{s.description}</div>
                          )}
                        </div>
                        <span className="text-[10px] tracking-widest uppercase font-bold text-muted-foreground font-mono whitespace-nowrap">
                          ~{s.avg_service_minutes}m
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <Button
                onClick={() => join(svcPicker.queue, pickedService)}
                disabled={!pickedService}
                data-testid="service-picker-confirm"
                className="w-full mt-5 h-11 rounded-xl font-bold tracking-wide btn-bounce"
              >
                Get Token →
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!qrToken} onOpenChange={(o) => !o && setQrToken(null)}>
        <DialogContent className="rounded-xl max-w-sm" data-testid="qr-dialog">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tighter text-2xl">Your Token</DialogTitle>
          </DialogHeader>
          {qrToken && (
            <div className="text-center">
              <div className="font-mono text-5xl font-bold tracking-tighter my-4" data-testid="qr-token-code">
                {qrToken.code}
              </div>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(
                  JSON.stringify({ token: qrToken.code, id: qrToken.id })
                )}`}
                alt="Token QR"
                className="mx-auto border border-border"
              />
              <p className="mt-4 text-xs tracking-widest uppercase text-muted-foreground">
                {qrToken.queue_name}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
