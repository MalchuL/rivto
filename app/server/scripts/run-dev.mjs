import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 4000);

function hasEncore() {
  return new Promise((resolve) => {
    const child = spawn("encore", ["version"], {
      stdio: "ignore",
      shell: true,
    });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

function sendJson(res, status, body) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Accept",
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function startFallback() {
  /** @type {Map<string, any>} */
  const pages = new Map();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const method = req.method ?? "GET";

    if (method === "OPTIONS") {
      sendJson(res, 204);
      return;
    }

    try {
      if (method === "GET" && url.pathname === "/page") {
        const list = [...pages.values()].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        );
        sendJson(res, 200, { pages: list });
        return;
      }

      const pageMatch = url.pathname.match(/^\/page\/([^/]+)$/);

      if (method === "GET" && pageMatch) {
        const page = pages.get(pageMatch[1]);
        if (!page) {
          sendJson(res, 404, { message: "page not found" });
          return;
        }
        sendJson(res, 200, page);
        return;
      }

      if (method === "POST" && url.pathname === "/page") {
        const body = await readJson(req);
        const now = new Date().toISOString();
        const page = {
          id: randomUUID(),
          title: (body.title?.trim() || "Untitled").slice(0, 500),
          content: body.content ?? "",
          parentId: body.parentId ?? null,
          createdAt: now,
          updatedAt: now,
        };
        pages.set(page.id, page);
        sendJson(res, 200, page);
        return;
      }

      if (method === "PUT" && pageMatch) {
        const existing = pages.get(pageMatch[1]);
        if (!existing) {
          sendJson(res, 404, { message: "page not found" });
          return;
        }
        const body = await readJson(req);
        const page = {
          ...existing,
          title:
            body.title !== undefined
              ? (body.title.trim() || "Untitled").slice(0, 500)
              : existing.title,
          content:
            body.content !== undefined ? body.content : existing.content,
          parentId:
            body.parentId !== undefined ? body.parentId : existing.parentId,
          updatedAt: new Date().toISOString(),
        };
        pages.set(page.id, page);
        sendJson(res, 200, page);
        return;
      }

      if (method === "DELETE" && pageMatch) {
        if (!pages.has(pageMatch[1])) {
          sendJson(res, 404, { message: "page not found" });
          return;
        }
        pages.delete(pageMatch[1]);
        sendJson(res, 204);
        return;
      }

      sendJson(res, 404, { message: "not found" });
    } catch (error) {
      sendJson(res, 500, {
        message: error instanceof Error ? error.message : "internal error",
      });
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(
      `[rivto-server] Encore CLI not found; in-memory API on http://127.0.0.1:${port}`,
    );
    console.log(
      "[rivto-server] Install Encore CLI to use the real Encore.ts SQL backend.",
    );
  });
}

if (await hasEncore()) {
  const child = spawn("encore", ["run"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  startFallback();
}
