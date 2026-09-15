import type { Response } from "express";

const clients = new Set<Response>();

export function addLiveClient(res: Response) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(`event: ready\ndata: ${JSON.stringify({ connected: true })}\n\n`);
  clients.add(res);

  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 20_000);
  const close = () => {
    clearInterval(heartbeat);
    clients.delete(res);
  };
  res.on("close", close);
  res.on("error", close);
}

export function publishLiveUpdate(detail: { method?: string; path?: string } = {}) {
  const message = `data: ${JSON.stringify({ ...detail, at: Date.now() })}\n\n`;
  for (const client of clients) {
    if (!client.writableEnded && !client.destroyed) client.write(message);
  }
}
