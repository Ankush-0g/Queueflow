import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import useWebSocket from "../hooks/useWebSocket";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function PublicDisplay() {
  const { queueId } = useParams();
  const [data, setData] = useState(null);
  const [now, setNow] = useState(new Date());

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/display/${queueId}`);
      setData(data);
    } catch (e) { console.error(e); }
  }, [queueId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    const c = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(id); clearInterval(c); };
  }, [load]);

  useWebSocket(`/api/ws/queue/${queueId}`, { onEvent: load });

  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => document.documentElement.classList.remove("dark");
  }, []);

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="font-mono text-sm tracking-widest opacity-60">LOADING DISPLAY…</div>
      </div>
    );
  }

  const { queue, counters, waiting } = data;
  const counterCards = counters.length > 0 ? counters : [{ id: "x", name: "—", current_token: null }];

  return (
    <div
      className="min-h-screen bg-zinc-950 text-white flex flex-col relative overflow-hidden"
      data-testid="public-display"
    >
      <div
        className="absolute inset-0 opacity-[0.04] bg-cover bg-center pointer-events-none"
        style={{ backgroundImage: "url(https://images.unsplash.com/photo-1735713212083-82eafc42bf64?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600)" }}
      />
      <header className="relative z-10 px-12 py-6 flex items-center justify-between border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-white flex items-center justify-center">
            <span className="font-mono text-black font-bold">Q</span>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.4em] uppercase font-bold text-zinc-500">QueueFlow Display</p>
            <h1 className="font-display text-3xl tracking-tighter">{queue.name}</h1>
          </div>
        </div>
        <div className="text-right font-mono">
          <div className="text-4xl font-bold tracking-tight" data-testid="display-clock">
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <div className="text-[10px] tracking-[0.4em] uppercase text-zinc-500">{queue.branch}</div>
        </div>
      </header>

      <div className="relative z-10 flex-1 grid grid-cols-12 gap-8 p-12">
        <div className="col-span-12 lg:col-span-8">
          <p className="text-xs tracking-[0.4em] uppercase font-bold text-zinc-500 mb-4">Now Serving</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {counterCards.map((c) => (
              <div
                key={c.id}
                className={`border-2 ${c.current_token ? "border-emerald-500 bg-emerald-500/5 flash-update" : "border-zinc-800"} p-8`}
                data-testid={`display-counter-${c.name}`}
              >
                <div className="text-[10px] tracking-[0.4em] uppercase font-bold text-zinc-400 mb-2">
                  Counter {c.name}
                </div>
                <div
                  className={`font-mono font-black tracking-tighter leading-none ${c.current_token ? "text-emerald-400" : "text-zinc-600"}`}
                  style={{ fontSize: "clamp(3.5rem, 9vw, 8rem)" }}
                  data-testid="display-token-code"
                >
                  {c.current_token?.code || "— — —"}
                </div>
                {c.current_token?.user_name && (
                  <div className="mt-4 text-zinc-300 text-lg">{c.current_token.user_name}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <aside className="col-span-12 lg:col-span-4 border-l border-zinc-800 pl-8" data-testid="display-up-next">
          <p className="text-xs tracking-[0.4em] uppercase font-bold text-zinc-500 mb-4">Up Next</p>
          <ul className="space-y-2">
            {waiting.length === 0 && (
              <li className="text-zinc-600 text-sm font-mono">No tokens waiting</li>
            )}
            {waiting.map((t, i) => (
              <li
                key={t.id}
                className={`flex items-center justify-between border-b border-zinc-800 py-3 ${i === 0 ? "text-amber-400" : ""}`}
              >
                <span className="font-mono text-2xl font-bold tracking-tighter">{t.code}</span>
                <span className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">
                  Pos {String(i + 1).padStart(2, "0")}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <footer className="relative z-10 px-12 py-4 text-[10px] tracking-[0.4em] uppercase font-bold text-zinc-600 border-t border-zinc-800 flex justify-between">
        <span>QueueFlow / Live Display</span>
        <span>Auto-refresh · 3s</span>
      </footer>
    </div>
  );
}
