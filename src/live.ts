import { useEffect, useRef } from "react";

type Listener = () => void;
type Channel = { source: EventSource; listeners: Set<Listener> };

const channels = new Map<string, Channel>();

function subscribe(endpoint: string, listener: Listener) {
  let channel = channels.get(endpoint);
  if (!channel) {
    const listeners = new Set<Listener>();
    const source = new EventSource(endpoint, { withCredentials: true });
    channel = { source, listeners };
    source.onmessage = () => listeners.forEach(notify => notify());
    channels.set(endpoint, channel);
  }
  channel.listeners.add(listener);
  return () => {
    const current = channels.get(endpoint);
    if (!current) return;
    current.listeners.delete(listener);
    if (!current.listeners.size) {
      current.source.close();
      channels.delete(endpoint);
    }
  };
}

export function useLiveRefresh(refresh: () => unknown, endpoint = "/api/staff/live") {
  const refreshRef = useRef(refresh);
  const runningRef = useRef(false);
  const queuedRef = useRef(false);
  refreshRef.current = refresh;

  useEffect(() => {
    let active = true;
    const run = () => {
      if (!active) return;
      if (runningRef.current) {
        queuedRef.current = true;
        return;
      }
      runningRef.current = true;
      void Promise.resolve(refreshRef.current()).catch(() => undefined).finally(() => {
        runningRef.current = false;
        if (queuedRef.current) {
          queuedRef.current = false;
          run();
        }
      });
    };
    const onVisibility = () => { if (document.visibilityState === "visible") run(); };
    const unsubscribe = typeof EventSource === "undefined" ? () => undefined : subscribe(endpoint, run);
    window.addEventListener("focus", run);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisibility);
    const fallback = window.setInterval(run, 30_000);
    return () => {
      active = false;
      queuedRef.current = false;
      unsubscribe();
      window.removeEventListener("focus", run);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(fallback);
    };
  }, [endpoint]);
}
