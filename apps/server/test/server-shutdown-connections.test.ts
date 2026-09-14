import Fastify from "fastify";
import { describe, expect, it } from "vitest";

/**
 * Pins the Fastify option that makes a Dispatch shutdown finish at all.
 *
 * Dispatch keeps hijacked sockets open indefinitely — the UI event stream,
 * MCP sessions, MJPEG viewers. Under Fastify's default ('idle') `close()`
 * waits for those active connections forever, so SIGTERM hung until systemd's
 * TimeoutStopSec ran out and SIGKILLed the process mid-update. This asserts
 * the behaviour, not the option: an open event-stream must not be able to
 * keep `close()` pending.
 */
function buildAppWithEventStream(options: { forceCloseConnections?: boolean }) {
  const app = Fastify(options);
  app.get("/events", async (_request, reply) => {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.hijack();
    reply.raw.write(": open\n\n");
    // Deliberately never ended — this is what a live SSE client looks like.
  });
  return app;
}

async function openEventStream(url: string): Promise<AbortController> {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });
  // Start consuming so the socket is genuinely active, not merely connected.
  void response.body?.getReader().read();
  return controller;
}

async function closeWithin(
  app: ReturnType<typeof Fastify>,
  ms: number
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([app.close().then(() => true), timedOut]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

describe("HTTP shutdown with a live event stream", () => {
  it("closes promptly when connections are force-closed", async () => {
    const app = buildAppWithEventStream({ forceCloseConnections: true });
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const stream = await openEventStream(`${address}/events`);

    await expect(closeWithin(app, 2_000)).resolves.toBe(true);
    stream.abort();
  });

  it("hangs on the default, which is the bug this option exists to avoid", async () => {
    const app = buildAppWithEventStream({});
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const stream = await openEventStream(`${address}/events`);

    await expect(closeWithin(app, 750)).resolves.toBe(false);

    // Release the socket so the suite doesn't inherit a pending close.
    stream.abort();
    await app.close();
  });
});
