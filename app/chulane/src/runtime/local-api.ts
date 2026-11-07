/**
 * Exposes authenticated local application operations through the Node host.
 * Better Auth verifies sessions before user-scoped services are constructed.
 * This boundary validates input and origins and delegates workspace rules to
 * services. Next.js components have no database or filesystem access.
 */
import { DomainError } from "../domain/workspaces/access.ts";
import type { ApplicationStorage } from "../storage/types.ts";
import type { AuthenticationService } from "../infrastructure/authentication/types.ts";
import { IdentityServiceImpl, UserProvisioner } from "../domain/identity/service.ts";
import { WorkspaceServiceImpl } from "../domain/workspaces/service.ts";
import type { LocalState } from "./types.ts";

/**
 * Parses a bounded JSON object for local mutations.
 * @param request - Incoming application request.
 * @returns A record of untrusted values for field-specific validation.
 */
async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new DomainError("invalid", "Expected JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError("invalid", "Request body is missing.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16_384) throw new DomainError("invalid", "Request body is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new DomainError("invalid", "Invalid JSON."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new DomainError("invalid", "Expected a JSON object.");
  return body as Record<string, unknown>;
}

/**
 * Validates scalar operation arguments at the HTTP trust boundary.
 * @param body - Parsed but untrusted input.
 * @param key - Required string field.
 * @returns The bounded, nonempty field value.
 */
function field(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new DomainError("invalid", `Invalid ${key}.`);
  return value;
}

/** Owns the authenticated HTTP boundary shared by browser and desktop hosts. */
export class LocalApi {
  private readonly services: ApplicationStorage;
  private readonly auth: AuthenticationService;

  /**
   * Connects transport operations to the runtime-owned services and sessions.
   * @param services - Application services sharing one persistence lifecycle.
   * @param auth - Better Auth handler and verified session API.
   */
  constructor(services: ApplicationStorage, auth: AuthenticationService) {
    this.services = services;
    this.auth = auth;
  }

  /**
   * Dispatches an authenticated operation and returns transport-safe errors.
   * @param request - Current browser request.
   * @returns A response without cacheable private application data.
   */
  readonly handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (!["GET", "POST"].includes(request.method)) return Response.json({ error: "Method not allowed." }, { status: 405 });
    if (request.method === "POST" && request.headers.get("origin") !== url.origin) {
      return Response.json({ error: "Origin not allowed." }, { status: 403 });
    }
    if (url.pathname.startsWith("/api/auth/")) return this.auth.handle(request);
    if (url.pathname !== "/api/local") return Response.json({ error: "Not found." }, { status: 404 });
    let response: Response;
    let sessionHeaders = new Headers();
    try {
      const headers = new Headers(request.headers);
      headers.set("host", url.host);
      const result = await this.auth.getSession(headers);
      const session = result.session;
      sessionHeaders = result.headers;
      if (!session) {
        sessionHeaders.set("cache-control", "no-store");
        return Response.json({ error: "Sign in required." }, { status: 401, headers: sessionHeaders });
      }
      // A committed auth session may survive interrupted domain provisioning.
      const user = await new UserProvisioner(this.services).provision(session.user);
      const context = { userId: user.id };
      const identity = new IdentityServiceImpl(this.services, context);
      const workspaceService = new WorkspaceServiceImpl(this.services, context);
      if (request.method === "GET") {
        const accessible = await workspaceService.listAccessible();
        const workspaces: LocalState["workspaces"] = [];
        for (const workspace of accessible) {
          const members = await workspaceService.listMembers(workspace.id);
          workspaces.push({ ...workspace, members, role: members.find((member) => member.userId === user.id)!.role });
        }
        const state: LocalState = {
          user, users: await identity.list(), workspaces,
          deletedWorkspaces: await workspaceService.listDeleted(),
        };
        response = Response.json(state);
      } else {
        const body = await readBody(request);
        const action = field(body, "action");
        if (action === "create") {
          await workspaceService.create(field(body, "name"));
        } else if (action === "update") {
          await workspaceService.update(field(body, "workspaceId"), { name: field(body, "name") });
        } else if (action === "delete") {
          await workspaceService.delete(field(body, "workspaceId"));
        } else if (action === "restore") {
          await workspaceService.restore(field(body, "workspaceId"));
        } else if (action === "update-profile") {
          await identity.update({ name: field(body, "name") });
        } else if (action === "set-member") {
          const role = field(body, "role");
          if (role !== "owner" && role !== "editor" && role !== "viewer") throw new DomainError("invalid", "Invalid role.");
          await workspaceService.setMemberRole(field(body, "workspaceId"), field(body, "userId"), role);
        } else if (action === "remove-member") {
          await workspaceService.removeMember(field(body, "workspaceId"), field(body, "userId"));
        } else throw new DomainError("invalid", "Unknown operation.");
        response = Response.json({ ok: true });
      }
    } catch (error) {
      if (error instanceof DomainError) {
        const status = error.code === "forbidden" ? 403 : error.code === "not-found" ? 404 : 400;
        response = Response.json({ error: error.message }, { status });
      } else {
        console.error("Local application operation failed:", error);
        response = Response.json({ error: "The operation could not be completed." }, { status: 500 });
      }
    }
    // Session renewal precedes domain work, so failed operations must also deliver its cookies.
    for (const cookie of sessionHeaders.getSetCookie()) response.headers.append("set-cookie", cookie);
    response.headers.set("cache-control", "no-store");
    return response;
  };
}
