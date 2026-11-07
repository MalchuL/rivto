/**
 * Executes browser-safe transport modules in Chromium against real HTTP and
 * WebSocket peers. TypeScript transpilation serves the exact source modules;
 * unresolved Node imports fail in the browser instead of being polyfilled.
 */
import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { once } from "node:events";
import ts from "typescript";
import { WebSocketServer } from "ws";

const require = createRequire(import.meta.url);
const modules = new Set([
  "index.ts",
  "cancellation.ts",
  "http/service.ts",
  "http/sse.ts",
  "websocket/service.ts",
]);
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url ?? "/", "http://fixture").pathname;
    if (path === "/") {
      response.setHeader(
        "set-cookie",
        "session=test; Path=/; HttpOnly; SameSite=Lax",
      );
      response.setHeader("content-type", "text/html");
      response.end("<!doctype html><title>Network fixture</title>");
    } else if (path === "/stream") {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("data: first\n\n");
      setTimeout(() => response.end("data: second\n\n"), 80);
    } else if (path === "/hang") {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("first");
    } else if (path === "/cookie") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ cookie: request.headers.cookie }));
    } else if (path === "/axios.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(
        await readFile(
          join(
            dirname(require.resolve("axios/package.json")),
            "dist/esm/axios.js",
          ),
        ),
      );
    } else if (modules.has(path.slice(1))) {
      const source = await readFile(
        join(process.cwd(), "src/infrastructure/network", path.slice(1)),
        "utf8",
      );
      const compiled = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText;
      response.setHeader("content-type", "text/javascript");
      response.end(compiled.replace(/from ['"]axios['"]/, 'from "/axios.js"'));
    } else response.writeHead(404).end();
  } catch {
    response.writeHead(500).end();
  }
});
const sockets = new WebSocketServer({ server });
sockets.on("connection", (socket, request) => {
  socket.send(request.headers.cookie ?? "");
  socket.on("message", (data, binary) => socket.send(data, { binary }));
});
let origin: string;
test.beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture address");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  for (const socket of sockets.clients) socket.terminate();
  await new Promise<void>((resolve) => sockets.close(() => resolve()));
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** @param fixtures - Browser page. @returns Resolves after real browser transport assertions. */
test("browser HTTP streaming, credentials, cancellation, and native sockets", async ({
  page,
}) => {
  await page.goto(origin);
  const result = await page.evaluate(async (origin) => {
    const { HttpService, WebSocketService, parseSse } = await import(
      `${origin}/index.ts`
    );
    const http = new HttpService();
    const sockets = new WebSocketService();
    try {
      const client = http.create({ baseUrl: origin });
      const cookie = (await client.get("/cookie")).data.cookie;
      const stream = await client.stream("/stream", { timeoutMs: 50 });
      const events = [];
      for await (const event of parseSse(stream.data)) events.push(event.data);
      const socket = sockets.connect({ url: origin.replace("http:", "ws:") });
      const socketCookie = await new Promise((resolve) =>
        socket.on("message", resolve),
      );
      const echo = new Promise((resolve) => socket.on("message", resolve));
      socket.send("hello");
      const echoed = await echo;
      const pending = await client.stream("/hang");
      const reader = pending.data.getReader();
      await reader.read();
      const reading = reader.read();
      http.dispose();
      const cancelled = await reading.then(
        () => false,
        () => true,
      );
      sockets.dispose();
      return {
        cookie,
        events,
        socketCookie,
        echoed,
        cancelled,
        state: socket.state,
      };
    } finally {
      http.dispose();
      sockets.dispose();
    }
  }, origin);
  expect(result).toEqual({
    cookie: "session=test",
    events: ["first", "second"],
    socketCookie: "session=test",
    echoed: "hello",
    cancelled: true,
    state: "closed",
  });
});
