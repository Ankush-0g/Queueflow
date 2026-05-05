import { useEffect, useRef } from "react";

/**
 * Subscribe to a backend WebSocket channel.
 *  - path: e.g. "/api/ws/queue/{queueId}" or "/api/ws/user" or "/api/ws/admin"
 *  - token: JWT token (sent as ?token= query for user/admin channels)
 *  - onEvent: (payload) => void  — fires on every message
 * Auto-reconnects on close with backoff. Caller should stop polling reliance and
 * still keep low-frequency polling as fallback (handled at component level).
 */
export default function useWebSocket(path, { token, onEvent, enabled = true } = {}) {
  const wsRef = useRef(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !path) return;
    let closed = false;
    let retry = 0;
    let timer = null;

    const connect = () => {
      if (closed) return;
      const base = process.env.REACT_APP_BACKEND_URL || "";
      const wsBase = base.replace(/^http/, "ws");
      const qs = token ? `?token=${encodeURIComponent(token)}` : "";
      const url = `${wsBase}${path}${qs}`;
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        scheduleRetry();
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => { retry = 0; };
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          handlerRef.current && handlerRef.current(data);
        } catch {
          // ignore
        }
      };
      ws.onerror = () => {};
      ws.onclose = () => { if (!closed) scheduleRetry(); };
    };

    const scheduleRetry = () => {
      retry = Math.min(retry + 1, 6);
      const delay = Math.min(1000 * 2 ** retry, 15000);
      timer = setTimeout(connect, delay);
    };

    connect();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
      }
    };
  }, [path, token, enabled]);
}
