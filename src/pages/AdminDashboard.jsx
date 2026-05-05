import { useEffect, useState, useCallback } from "react";
import Layout from "../components/Layout";
import api, { formatApiError } from "../lib/api";
import useWebSocket from "../hooks/useWebSocket";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Plus, Trash2, Phone, Pause, RotateCcw, CheckCircle2, SkipForward, Tv, Ban, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const STATUS_COLORS = {
  waiting: "status-waiting", serving: "status-serving", completed: "status-completed",
  cancelled: "status-cancelled", skipped: "status-skipped", hold: "status-hold",
};

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [queues, setQueues] = useState([]);
  const [counters, setCounters] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedQueue, setSelectedQueue] = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, q, c, u] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/queues"),
        api.get("/counters"),
        api.get("/admin/users"),
      ]);
      setStats(s.data);
      setQueues(q.data);
      setCounters(c.data);
      setUsers(u.data);
      if (!selectedQueue && q.data.length > 0) setSelectedQueue(q.data[0].id);
    } catch (e) { console.error(e); }
  }, [selectedQueue]);

  const loadTokens = useCallback(async () => {
    if (!selectedQueue) return;
    try {
      const { data } = await api.get(`/tokens?queue_id=${selectedQueue}`);
      setTokens(data);
    } catch (e) { console.error(e); }
  }, [selectedQueue]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    loadTokens();
    const id = setInterval(() => { load(); loadTokens(); }, 10000);
    return () => clearInterval(id);
  }, [loadTokens, load]);

  const wsToken = typeof window !== "undefined" ? localStorage.getItem("qms_token") : null;
  useWebSocket("/api/ws/admin", {
    token: wsToken,
    enabled: !!wsToken,
    onEvent: () => { load(); loadTokens(); },
  });

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-10 anim-fade-up">
          <div>
            <p className="text-xs tracking-[0.3em] uppercase font-bold text-muted-foreground mb-2">
              Admin Console
            </p>
            <h1 className="font-display text-4xl sm:text-5xl tracking-tighter">Control Room.</h1>
          </div>
          {selectedQueue && (
            <Link to={`/display/${selectedQueue}`} target="_blank" data-testid="open-display-link">
              <Button variant="outline" className="rounded-xl btn-bounce">
                <Tv className="h-4 w-4 mr-2" /> Open Public Display
              </Button>
            </Link>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-border border border-border mb-10 rounded-xl overflow-hidden stagger" data-testid="stats-grid">
          {[
            { k: "Users", v: stats?.total_users ?? 0 },
            { k: "Queues", v: stats?.active_queues ?? 0 },
            { k: "Waiting", v: stats?.waiting_now ?? 0 },
            { k: "Serving", v: stats?.serving_now ?? 0 },
            { k: "Done Today", v: stats?.completed_today ?? 0 },
            { k: "Avg Wait", v: `${stats?.avg_wait_minutes ?? 0}m` },
          ].map((c) => (
            <div key={c.k} className="bg-card p-6">
              <div className="text-[10px] tracking-widest uppercase font-bold text-muted-foreground">
                {c.k}
              </div>
              <div className="font-display text-4xl tracking-tighter mt-2" data-testid={`stat-${c.k.replace(/\s/g,'-').toLowerCase()}`}>
                {c.v}
              </div>
            </div>
          ))}
        </div>

        <Tabs defaultValue="queue" className="w-full">
          <TabsList className="rounded-xl w-full justify-start mb-6 bg-muted/50">
            <TabsTrigger value="queue" data-testid="tab-queue-control" className="rounded-xl">Queue Control</TabsTrigger>
            <TabsTrigger value="manage" data-testid="tab-queues-counters" className="rounded-xl">Queues & Counters</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users" className="rounded-xl">Users</TabsTrigger>
            <TabsTrigger value="reports" data-testid="tab-reports" className="rounded-xl">Reports</TabsTrigger>
          </TabsList>

          {/* Queue Control */}
          <TabsContent value="queue">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs tracking-widest uppercase font-bold">Queue:</span>
              <Select value={selectedQueue || ""} onValueChange={setSelectedQueue}>
                <SelectTrigger className="rounded-xl w-64" data-testid="queue-selector">
                  <SelectValue placeholder="Select queue" />
                </SelectTrigger>
                <SelectContent>
                  {queues.map((q) => (
                    <SelectItem key={q.id} value={q.id}>{q.name} · {q.branch}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <CounterControls
              queueId={selectedQueue}
              counters={counters.filter((c) => c.queue_id === selectedQueue)}
              tokens={tokens}
              queues={queues}
              onAction={() => { load(); loadTokens(); }}
            />

            <div className="mt-6 border border-border" data-testid="tokens-table">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-[10px] uppercase tracking-widest font-bold">
                    <th className="px-4 py-3">Token</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Counter</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No tokens yet</td></tr>
                  )}
                  {tokens.map((t) => {
                    const counter = counters.find((c) => c.id === t.counter_id);
                    return (
                      <tr key={t.id} className="border-t border-border" data-testid={`token-row-${t.code}`}>
                        <td className="px-4 py-2 font-mono font-bold">{t.code}</td>
                        <td className="px-4 py-2">{t.user_name}</td>
                        <td className="px-4 py-2">
                          <Badge className={`${STATUS_COLORS[t.status]} rounded-xl uppercase font-bold text-[10px]`}>
                            {t.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{counter?.name || "—"}</td>
                        <td className="px-4 py-2 text-right">
                          <TokenActions token={t} onAction={() => { load(); loadTokens(); }} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="manage">
            <ManageQueuesCounters queues={queues} counters={counters} reload={load} />
          </TabsContent>

          <TabsContent value="users">
            <div className="border border-border" data-testid="users-table">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-[10px] uppercase tracking-widest font-bold">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-border">
                      <td className="px-4 py-2 font-semibold">{u.name}</td>
                      <td className="px-4 py-2 font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-2 font-mono text-xs">{u.phone || "—"}</td>
                      <td className="px-4 py-2"><Badge variant="outline" className="rounded-xl uppercase font-bold text-[10px]">{u.role}</Badge></td>
                      <td className="px-4 py-2">
                        {u.blocked ? (
                          <Badge className="status-cancelled rounded-xl uppercase text-[10px]">Blocked</Badge>
                        ) : (
                          <Badge className="status-completed rounded-xl uppercase text-[10px]">Active</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {u.role !== "admin" && (
                          <Button
                            size="sm"
                            variant={u.blocked ? "outline" : "destructive"}
                            className="rounded-xl"
                            data-testid={`block-user-${u.id}`}
                            onClick={async () => {
                              const ep = u.blocked ? "unblock" : "block";
                              await api.post(`/admin/users/${u.id}/${ep}`);
                              toast.success(`User ${ep}ed`);
                              load();
                            }}
                          >
                            <Ban className="h-3.5 w-3.5 mr-1" /> {u.blocked ? "Unblock" : "Block"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="reports">
            <Card className="rounded-xl border border-border p-6" data-testid="reports-card">
              <h3 className="text-xs tracking-widest uppercase font-bold mb-4">Tokens completed — last 7 days</h3>
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={stats?.daily || []}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
                    <YAxis tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
                    <Tooltip />
                    <Bar dataKey="completed" fill="#002FA7" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function CounterControls({ queueId, counters, tokens, onAction, queues = [] }) {
  if (!queueId) return null;
  if (counters.length === 0) {
    return (
      <Card className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        No counters for this queue. Add counters in "Queues & Counters" tab.
      </Card>
    );
  }
  const queue = queues.find((q) => q.id === queueId);
  const allSvcs = queue?.services || [];
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
      {counters.map((c) => {
        const current = tokens.find((t) => t.id === c.current_token_id);
        const sids = c.service_ids || [];
        const boundNames = sids.length === 0
          ? []
          : allSvcs.filter((s) => sids.includes(s.id)).map((s) => s.name);
        return (
          <Card key={c.id} className="rounded-xl border-2 p-5 card-lift" data-testid={`counter-card-${c.name}`}>
            <div className="flex justify-between items-center">
              <div>
                <div className="text-[10px] tracking-widest uppercase font-bold text-muted-foreground">Counter</div>
                <div className="font-display text-2xl tracking-tighter">{c.name}</div>
              </div>
              <Badge className={`${current ? "status-serving" : "status-completed"} rounded-full uppercase font-bold text-[10px]`}>
                {current ? "Busy" : "Idle"}
              </Badge>
            </div>
            <div className="mt-2 mb-1 flex flex-wrap gap-1 min-h-[18px]">
              {boundNames.length === 0 ? (
                <span className="text-[10px] tracking-widest uppercase font-bold text-emerald-700 dark:text-emerald-400">
                  All services
                </span>
              ) : (
                boundNames.map((n) => (
                  <span key={n} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {n}
                  </span>
                ))
              )}
            </div>
            <div className="my-4 border-y border-border py-3 text-center">
              <div className="text-[10px] tracking-widest uppercase text-muted-foreground">Now Serving</div>
              <div className="font-mono font-bold text-3xl mt-1">
                {current?.code || "—"}
              </div>
            </div>
            <Button
              onClick={async () => {
                try {
                  await api.post(`/queues/${queueId}/call-next`, { counter_id: c.id });
                  toast.success("Next called");
                  onAction();
                } catch (e) {
                  toast.error(formatApiError(e.response?.data?.detail));
                }
              }}
              data-testid={`call-next-${c.name}`}
              className="w-full rounded-xl h-12 font-bold tracking-wide"
            >
              <Phone className="h-4 w-4 mr-2" /> CALL NEXT
            </Button>
          </Card>
        );
      })}
    </div>
  );
}

function TokenActions({ token, onAction }) {
  const act = async (path, msg) => {
    try {
      await api.post(`/tokens/${token.id}/${path}`);
      toast.success(msg);
      onAction();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };
  if (token.status === "waiting") {
    return (
      <div className="flex gap-1 justify-end">
        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => act("hold", "On hold")} data-testid={`hold-${token.code}`}>
          <Pause className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => act("skip", "Skipped")} data-testid={`skip-${token.code}`}>
          <SkipForward className="h-3 w-3" />
        </Button>
      </div>
    );
  }
  if (token.status === "serving") {
    return (
      <Button size="sm" className="rounded-xl" onClick={() => act("complete", "Completed")} data-testid={`complete-${token.code}`}>
        <CheckCircle2 className="h-3 w-3 mr-1" /> Done
      </Button>
    );
  }
  if (token.status === "hold" || token.status === "skipped") {
    return (
      <Button size="sm" variant="outline" className="rounded-xl" onClick={() => act("recall", "Recalled")} data-testid={`recall-${token.code}`}>
        <RotateCcw className="h-3 w-3 mr-1" /> Recall
      </Button>
    );
  }
  return <span className="text-muted-foreground text-xs">—</span>;
}

function ManageQueuesCounters({ queues, counters, reload }) {
  const [qOpen, setQOpen] = useState(false);
  const [cOpen, setCOpen] = useState(false);
  const [qForm, setQForm] = useState({ name: "", description: "", avg_service_minutes: 5, branch: "Main" });
  const [cForm, setCForm] = useState({ id: null, name: "", queue_id: "", service_ids: [] });

  const createQ = async (e) => {
    e.preventDefault();
    try {
      await api.post("/queues", qForm);
      toast.success("Queue created");
      setQOpen(false);
      setQForm({ name: "", description: "", avg_service_minutes: 5, branch: "Main" });
      reload();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const saveC = async (e) => {
    e.preventDefault();
    try {
      const body = { name: cForm.name, queue_id: cForm.queue_id, service_ids: cForm.service_ids };
      if (cForm.id) {
        await api.put(`/counters/${cForm.id}`, body);
        toast.success("Counter updated");
      } else {
        await api.post("/counters", body);
        toast.success("Counter added");
      }
      setCOpen(false);
      setCForm({ id: null, name: "", queue_id: "", service_ids: [] });
      reload();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const openAddCounter = () => {
    setCForm({ id: null, name: "", queue_id: "", service_ids: [] });
    setCOpen(true);
  };

  const openEditCounter = (c) => {
    setCForm({
      id: c.id, name: c.name, queue_id: c.queue_id,
      service_ids: c.service_ids || [],
    });
    setCOpen(true);
  };

  const selectedQueue = queues.find((q) => q.id === cForm.queue_id);
  const queueServices = selectedQueue?.services || [];

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs tracking-widest uppercase font-bold">Queues</h3>
          <Dialog open={qOpen} onOpenChange={setQOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-xl" data-testid="add-queue-btn">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Queue
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-xl">
              <DialogHeader><DialogTitle>New Queue</DialogTitle></DialogHeader>
              <form onSubmit={createQ} className="space-y-4" data-testid="queue-form">
                <div><Label>Name</Label><Input required value={qForm.name} onChange={(e) => setQForm({ ...qForm, name: e.target.value })} className="rounded-xl" data-testid="queue-name-input" /></div>
                <div><Label>Description</Label><Input value={qForm.description} onChange={(e) => setQForm({ ...qForm, description: e.target.value })} className="rounded-xl" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Branch</Label><Input value={qForm.branch} onChange={(e) => setQForm({ ...qForm, branch: e.target.value })} className="rounded-xl" /></div>
                  <div><Label>Avg minutes</Label><Input type="number" min="1" value={qForm.avg_service_minutes} onChange={(e) => setQForm({ ...qForm, avg_service_minutes: parseInt(e.target.value) || 1 })} className="rounded-xl" /></div>
                </div>
                <Button type="submit" className="w-full rounded-xl" data-testid="queue-submit-btn">Create Queue</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <div className="border border-border rounded-xl overflow-hidden">
          {queues.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">No queues</div>}
          {queues.map((q) => (
            <QueueRow key={q.id} queue={q} reload={reload} />
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs tracking-widest uppercase font-bold">Counters</h3>
          <Dialog open={cOpen} onOpenChange={(o) => { setCOpen(o); if (!o) setCForm({ id: null, name: "", queue_id: "", service_ids: [] }); }}>
            <Button size="sm" className="rounded-xl btn-bounce" data-testid="add-counter-btn" onClick={openAddCounter}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Counter
            </Button>
            <DialogContent className="rounded-xl">
              <DialogHeader>
                <DialogTitle>{cForm.id ? "Edit Counter" : "New Counter"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={saveC} className="space-y-4" data-testid="counter-form">
                <div>
                  <Label>Counter name</Label>
                  <Input required value={cForm.name}
                    onChange={(e) => setCForm({ ...cForm, name: e.target.value })}
                    className="rounded-xl" data-testid="counter-name-input" />
                </div>
                <div>
                  <Label>Queue</Label>
                  <Select value={cForm.queue_id}
                    onValueChange={(v) => setCForm({ ...cForm, queue_id: v, service_ids: [] })}>
                    <SelectTrigger className="rounded-xl" data-testid="counter-queue-select">
                      <SelectValue placeholder="Select queue" />
                    </SelectTrigger>
                    <SelectContent>
                      {queues.map((q) => <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {queueServices.length > 0 && (
                  <div data-testid="counter-services-picker">
                    <Label>Handles which services?</Label>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      Leave empty = handles all services. Pick specific ones to restrict.
                    </p>
                    <div className="space-y-1.5 max-h-52 overflow-auto pr-1">
                      {queueServices.map((s) => {
                        const checked = cForm.service_ids.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className={`flex items-center gap-3 p-2.5 rounded-xl border-2 cursor-pointer transition-all ${
                              checked ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                            }`}
                            data-testid={`counter-service-opt-${s.id}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setCForm({
                                  ...cForm,
                                  service_ids: e.target.checked
                                    ? [...cForm.service_ids, s.id]
                                    : cForm.service_ids.filter((x) => x !== s.id),
                                });
                              }}
                              className="h-4 w-4 accent-primary"
                            />
                            <span className="text-sm font-medium flex-1">{s.name}</span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              ~{s.avg_service_minutes}m
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                <Button type="submit" disabled={!cForm.queue_id || !cForm.name}
                  className="w-full rounded-xl btn-bounce" data-testid="counter-submit-btn">
                  {cForm.id ? "Save Changes" : "Create Counter"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <div className="border border-border rounded-xl overflow-hidden">
          {counters.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">No counters</div>}
          {counters.map((c) => {
            const q = queues.find((x) => x.id === c.queue_id);
            const qSvcs = q?.services || [];
            const sids = c.service_ids || [];
            const boundNames = sids.length === 0
              ? []
              : qSvcs.filter((s) => sids.includes(s.id)).map((s) => s.name);
            return (
              <div key={c.id} className="border-b border-border last:border-b-0 px-4 py-3 flex items-start justify-between gap-3" data-testid={`counter-row-${c.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{c.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{q?.name || "—"}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {boundNames.length === 0 ? (
                      <span className="text-[10px] tracking-widest uppercase font-bold text-emerald-700 dark:text-emerald-400">
                        All services
                      </span>
                    ) : (
                      boundNames.map((n) => (
                        <span key={n} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {n}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="rounded-xl h-8 w-8 p-0"
                    onClick={() => openEditCounter(c)} data-testid={`edit-counter-${c.id}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-xl h-8 w-8 p-0" onClick={async () => {
                    if (!window.confirm("Delete counter?")) return;
                    await api.delete(`/counters/${c.id}`);
                    toast.success("Deleted");
                    reload();
                  }} data-testid={`delete-counter-${c.id}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function QueueRow({ queue, reload }) {
  const [open, setOpen] = useState(false);
  const [svcName, setSvcName] = useState("");
  const [svcMins, setSvcMins] = useState(5);
  const services = queue.services || [];

  const addSvc = async (e) => {
    e.preventDefault();
    if (!svcName.trim()) return;
    try {
      await api.post(`/queues/${queue.id}/services`, {
        name: svcName.trim(),
        avg_service_minutes: svcMins || 5,
      });
      setSvcName("");
      setSvcMins(5);
      toast.success("Service added");
      reload();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const removeSvc = async (sid) => {
    if (!window.confirm("Remove this service?")) return;
    await api.delete(`/queues/${queue.id}/services/${sid}`);
    toast.success("Service removed");
    reload();
  };

  return (
    <div className="border-b border-border last:border-b-0" data-testid={`queue-row-${queue.id}`}>
      <div className="px-4 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-left flex items-center gap-3 flex-1 group"
          data-testid={`toggle-services-${queue.id}`}
        >
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground transition-transform" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
          )}
          <div>
            <div className="font-bold group-hover:text-primary transition-colors">
              {queue.name}
              {services.length > 0 && (
                <span className="ml-2 text-[10px] font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  {services.length} svc
                </span>
              )}
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              {queue.branch} · {queue.prefix} · {queue.avg_service_minutes}m avg
            </div>
          </div>
        </button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-xl"
          onClick={async () => {
            if (!window.confirm("Delete queue?")) return;
            await api.delete(`/queues/${queue.id}`);
            toast.success("Deleted");
            reload();
          }}
          data-testid={`delete-queue-${queue.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {open && (
        <div className="px-4 pb-4 bg-muted/30 anim-fade-in" data-testid={`services-panel-${queue.id}`}>
          <div className="text-[10px] tracking-[0.2em] uppercase font-bold text-muted-foreground mb-2 pt-2">
            Services for this queue
          </div>
          {services.length === 0 && (
            <div className="text-xs text-muted-foreground py-2 italic">
              No services yet — users will join without picking a service.
            </div>
          )}
          {services.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {services.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between bg-card rounded-xl border border-border px-3 py-2"
                  data-testid={`service-row-${s.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="font-semibold text-sm">{s.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      ~{s.avg_service_minutes}m
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-xl h-7 w-7 p-0"
                    onClick={() => removeSvc(s.id)}
                    data-testid={`remove-service-${s.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={addSvc} className="flex gap-2" data-testid={`add-service-form-${queue.id}`}>
            <Input
              placeholder="Service name (e.g. Loan inquiry)"
              value={svcName}
              onChange={(e) => setSvcName(e.target.value)}
              className="rounded-xl flex-1 h-9"
              data-testid={`new-service-name-${queue.id}`}
            />
            <Input
              type="number"
              min="1"
              value={svcMins}
              onChange={(e) => setSvcMins(parseInt(e.target.value) || 1)}
              className="rounded-xl w-20 h-9 font-mono"
              placeholder="min"
              data-testid={`new-service-minutes-${queue.id}`}
            />
            <Button type="submit" size="sm" className="rounded-xl btn-bounce" data-testid={`add-service-btn-${queue.id}`}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}