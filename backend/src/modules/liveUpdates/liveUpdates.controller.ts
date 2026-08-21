import { Request, Response } from "express";
import { onMatchUpdate } from "./liveUpdates.service";

// How often to write a comment-only SSE frame while nothing has happened.
// Keeps the connection from looking idle to an intermediary (nginx's
// default proxy_read_timeout is 60s) between real, often minutes-apart,
// match events.
const HEARTBEAT_MS = 20_000;

export async function stream(req: Request, res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    // Disable nginx's response buffering for this connection so events
    // reach the client as they're written, not once a buffer fills.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const unsubscribe = onMatchUpdate((payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(":\n\n");
  }, HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}
