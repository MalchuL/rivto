/**
 * Exercises network ownership against real loopback HTTP and WebSocket peers.
 * Fixtures assert observable recovery and cancellation rather than Axios internals.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { HttpService, HttpError } from ".././service.ts";
import { parseSse } from ".././sse.ts";

test("HTTP metadata, isolated clients, refresh coordination, and disposal", async () => {
  let refreshes = 0;
  let token = "old";
  const server = createServer((req, res) => {
    if (req.url === "/hang") return;
    if (req.url === "/auth" && req.headers.authorization !== "new") {
      res.writeHead(401).end("unauthorized");
    } else {
      res.setHeader("content-type", "application/json");
      res.setHeader("x-test", "yes");
      res.end(
        JSON.stringify({
          method: req.method,
          token: req.headers.authorization ?? null,
        }),
      );
    }
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const service = new HttpService();
  try {
    const auth = {
      prepare: async () => ({ authorization: token }),
      refresh: async () => {
        refreshes++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        token = "new";
      },
    };
    const client = service.create({ baseUrl, auth });
    const results = await Promise.all([
      client.get("/auth"),
      client.get("/auth"),
    ]);
    assert.equal(refreshes, 1);
    assert.equal(results[0].status, 200);
    assert.equal(results[0].headers.get("x-test"), "yes");
    assert.deepEqual((await service.create({ baseUrl }).get("/")).data, {
      method: "GET",
      token: null,
    });
    await assert.rejects(client.get("http://example.com"), /origin/);
    const pending = client.get("/hang");
    client.dispose();
    await assert.rejects(
      pending,
      (error: unknown) =>
        error instanceof HttpError && error.kind === "cancelled",
    );
    await assert.rejects(client.get("/"), /disposed/);
  } finally {
    service.dispose();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("SSE handles fragmented UTF-8 and multiline events", async () => {
  const bytes = new TextEncoder().encode(
    ": comment\r\nid: 7\r\nevent: delta\r\ndata: hé\r\ndata: there\r\nretry: 20\r\n\r\n",
  );
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  const events = [];
  for await (const event of parseSse(stream)) events.push(event);
  assert.deepEqual(events, [
    { event: "delta", data: "hé\nthere", id: "7", retry: 20 },
  ]);
});

test("HTTP payloads, failures, timeout and stream lifetime", async () => {
  let mutationCalls = 0;
  let refreshes = 0;
  const server = createServer(async (req, res) => {
    if (req.url === "/hang") return;
    if (req.url === "/stream") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("data: first\n\n");
      return;
    }
    if (req.url === "/empty") {
      res.writeHead(204).end();
      return;
    }
    if (req.url === "/invalid") {
      res.end("not json");
      return;
    }
    if (req.url === "/auth") {
      mutationCalls++;
      res.writeHead(401).end("{}");
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        body: Buffer.concat(chunks).toString(),
        type: req.headers["content-type"],
      }),
    );
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const service = new HttpService();
  const client = service.create({
    baseUrl: `http://127.0.0.1:${address.port}`,
    auth: {
      prepare: async () => ({}),
      refresh: async () => {
        refreshes++;
      },
    },
  });
  try {
    assert.deepEqual((await client.post("/echo", { body: { a: 1 } })).data, {
      body: '{"a":1}',
      type: "application/json",
    });
    const form = new FormData();
    form.set("file", new Blob(["bytes"]), "test.txt");
    assert.match(
      (await client.post<{ body: string }>("/echo", { body: form })).data.body,
      /filename="test.txt"/,
    );
    assert.ok(
      (await client.get("/echo", { responseType: "arraybuffer" }))
        .data instanceof ArrayBuffer,
    );
    await assert.rejects(
      client.get("/invalid"),
      (error: unknown) => error instanceof HttpError && error.kind === "decode",
    );
    await assert.rejects(
      client.get("/hang", { timeoutMs: 10 }),
      (error: unknown) =>
        error instanceof HttpError && error.kind === "timeout",
    );
    await assert.rejects(
      client.post("/auth"),
      (error: unknown) =>
        error instanceof HttpError && error.response?.status === 401,
    );
    assert.equal(mutationCalls, 1);
    assert.equal(refreshes, 0);
    await assert.rejects(client.post("/auth", { retryAfterRefresh: true }));
    assert.equal(mutationCalls, 3);
    assert.equal(refreshes, 1);
    const empty = await client.stream("/empty");
    assert.equal((await empty.data.getReader().read()).done, true);
    const response = await client.stream("/stream", { timeoutMs: 20 });
    const reader = response.data.getReader();
    assert.match(
      new TextDecoder().decode((await reader.read()).value),
      /first/,
    );
    await new Promise((resolve) => setTimeout(resolve, 40));
    const pending = reader.read();
    service.dispose();
    await assert.rejects(pending);
  } finally {
    service.dispose();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("SSE dispatches a final CR-delimited event but discards unterminated data", async () => {
  const stream = new Blob(["data: yes\r\r"]).stream();
  const events = [];
  for await (const event of parseSse(stream)) events.push(event.data);
  assert.deepEqual(events, ["yes"]);
});

test("disposal cancels a request waiting on authentication", async () => {
  const service = new HttpService();
  const client = service.create({
    baseUrl: "http://localhost",
    auth: {
      prepare: () => new Promise(() => {}),
      refresh: async () => {},
    },
  });
  const request = client.get("/");
  client.dispose();
  await assert.rejects(
    Promise.race([
      request,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("still pending")), 50),
      ),
    ]),
    (error: unknown) =>
      error instanceof HttpError && error.kind === "cancelled",
  );
  service.dispose();
});

test("static credentials cannot escape their origin and refresh failures terminate requests", async () => {
  const server = createServer((_request, response) =>
    response.writeHead(401).end("denied"),
  ).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const service = new HttpService();
  try {
    const client = service.create({
      baseUrl,
      headers: { Authorization: "secret" },
    });
    await assert.rejects(client.get("http://127.0.0.1:1"), /origin/);
    let refreshes = 0;
    const failure = new Error("Refresh denied");
    const authenticated = service.create({
      baseUrl,
      auth: {
        prepare: async () => ({}),
        refresh: async () => {
          refreshes++;
          throw failure;
        },
      },
    });
    await assert.rejects(
      authenticated.get("/"),
      (error: unknown) => error instanceof HttpError && error.cause === failure,
    );
    assert.equal(refreshes, 1);
  } finally {
    service.dispose();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
