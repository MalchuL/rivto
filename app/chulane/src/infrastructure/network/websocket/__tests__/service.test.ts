/** Tests real WebSocket peers, lifecycle ownership, and runtime-only credentials. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { WebSocketServer } from "ws";
import { NodeWebSocketService } from ".././node.ts";

test("runtime sockets send binary/text, reconnect, and stop on disposal", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await once(server, "listening");
  let connections = 0;
  server.on("connection", (peer, request) => {
    connections++;
    assert.equal(request.headers.authorization, "secret");
    peer.on("message", (data, binary) => peer.send(data, { binary }));
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const service = new NodeWebSocketService();
  try {
    const socket = service.connect({
      url: `ws://127.0.0.1:${address.port}`,
      headers: { authorization: "secret" },
      reconnect: { initialDelayMs: 1, maxDelayMs: 2 },
    });
    assert.throws(() => socket.send("early"), /open/);
    await new Promise<void>((resolve) =>
      socket.on("state", (state) => {
        if (state === "open") resolve();
      }),
    );
    const message = new Promise((resolve) => socket.on("message", resolve));
    socket.send("hello");
    assert.equal(await message, "hello");
    const binary = new Promise((resolve) => socket.on("message", resolve));
    socket.send(new Uint8Array([1, 2]).buffer);
    assert.deepEqual(
      new Uint8Array((await binary) as ArrayBuffer),
      new Uint8Array([1, 2]),
    );
    const reopened = new Promise<void>((resolve) =>
      socket.on("state", (state) => {
        if (state === "open") resolve();
      }),
    );
    for (const peer of server.clients) peer.terminate();
    await reopened;
    assert.equal(connections, 2);
    service.dispose();
    assert.equal(socket.state, "closed");
    assert.throws(() => service.connect({ url: "ws://localhost" }), /disposed/);
  } finally {
    service.dispose();
    for (const peer of server.clients) peer.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("closing during authentication never opens a socket", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const service = new NodeWebSocketService();
  let prepare!: (value: { headers: Record<string, string> }) => void;
  const socket = service.connect({
    url: `ws://127.0.0.1:${address.port}`,
    auth: {
      prepare: () =>
        new Promise((resolve) => {
          prepare = resolve;
        }),
      refresh: async () => {},
    },
  });
  await Promise.resolve();
  socket.dispose();
  prepare({ headers: { authorization: "late" } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(server.clients.size, 0);
  assert.equal(socket.state, "closed");
  service.dispose();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("socket authentication refreshes once and terminal closure stops recovery", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  let refreshes = 0;
  let connections = 0;
  let token = "expired";
  server.on("connection", (peer, request) => {
    connections++;
    peer.close(request.headers.authorization === "valid" ? 1000 : 4001);
  });
  const service = new NodeWebSocketService();
  try {
    const socket = service.connect({
      url: `ws://127.0.0.1:${address.port}`,
      reconnect: { initialDelayMs: 1 },
      auth: {
        prepare: async () => ({ headers: { authorization: token } }),
        isAuthFailure: (close) => close.code === 4001,
        refresh: async () => {
          refreshes++;
          token = "valid";
        },
      },
    });
    await new Promise<void>((resolve) =>
      socket.on("state", (state) => {
        if (state === "closed") resolve();
      }),
    );
    assert.equal(refreshes, 1);
    assert.equal(connections, 2);
  } finally {
    service.dispose();
    for (const peer of server.clients) peer.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("a failing reconnect policy closes the connection and reports the error", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  server.on("connection", (peer) => peer.close(4000));
  const service = new NodeWebSocketService();
  const failure = new Error("policy failed");
  try {
    const connection = service.connect({
      url: `ws://127.0.0.1:${address.port}`,
      reconnect: {
        shouldReconnect: () => {
          throw failure;
        },
      },
    });
    const errors: unknown[] = [];
    connection.on("error", (error) => errors.push(error));
    await new Promise<void>((resolve) =>
      connection.on("state", (state) => {
        if (state === "closed") resolve();
      }),
    );
    assert.deepEqual(errors, [failure]);
  } finally {
    service.dispose();
    for (const peer of server.clients) peer.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("runtime handshake timeout is configurable and can be disabled", async () => {
  const { createServer } = await import("node:http");
  const server = createServer();
  const pending = new Set<import("node:stream").Duplex>();
  server.on("upgrade", (_request, socket) => {
    pending.add(socket);
    socket.on("close", () => pending.delete(socket));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const service = new NodeWebSocketService();
  try {
    const endpoint = `ws://127.0.0.1:${address.port}`;
    const timed = service.connect({ url: endpoint, handshakeTimeoutMs: 20 });
    const errors: unknown[] = [];
    timed.on("error", (error) => errors.push(error));
    await Promise.race([
      new Promise<void>((resolve) =>
        timed.on("state", (state) => {
          if (state === "closed") resolve();
        }),
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("handshake did not time out")), 250),
      ),
    ]);
    assert.ok(errors.length > 0);
    const unlimited = service.connect({ url: endpoint, handshakeTimeoutMs: 0 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(unlimited.state, "connecting");
    unlimited.dispose();
  } finally {
    service.dispose();
    for (const socket of pending) socket.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("reconnect stability threshold resets the authentication refresh limit", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  let connections = 0;
  let refreshes = 0;
  server.on("connection", (peer) => {
    connections++;
    setTimeout(() => peer.close(connections < 3 ? 4001 : 1000), 20);
  });
  const service = new NodeWebSocketService();
  try {
    const socket = service.connect({
      url: `ws://127.0.0.1:${address.port}`,
      reconnect: { initialDelayMs: 1, stableAfterMs: 5 },
      auth: {
        prepare: async () => ({}),
        isAuthFailure: (event) => event.code === 4001,
        refresh: async () => {
          refreshes++;
        },
      },
    });
    await new Promise<void>((resolve) =>
      socket.on("state", (state) => {
        if (state === "closed") resolve();
      }),
    );
    assert.equal(connections, 3);
    assert.equal(refreshes, 2);
  } finally {
    service.dispose();
    for (const peer of server.clients) peer.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
