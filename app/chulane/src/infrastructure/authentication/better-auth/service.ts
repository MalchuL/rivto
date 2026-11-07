/**
 * Configures Better Auth behind the application authentication service contract.
 * The runtime supplies its provider adapter and verified-user lookup at composition.
 * Session creation provisions application profiles without owning their storage.
 */
import { betterAuth, type BetterAuthOptions } from "better-auth";
import type { User, UserProvisioning } from "../../../domain/identity/types.ts";
import { normalizeName } from "../../../domain/workspaces/access.ts";
import type { AuthenticationService } from "../types.ts";

export class BetterAuthService implements AuthenticationService {
  readonly auth: ReturnType<typeof betterAuth>;
  /**
   * Connects the dependencies required by this instance.
   * @param options - Provider configuration and database adapter.
   * @param provisioner - Profile provisioning operation.
   * @param findUser - Lookup for a verified authentication identity.
   */
  constructor(options: BetterAuthOptions, provisioner: UserProvisioning, findUser: (id: string) => Promise<User | undefined>) {
    this.auth = betterAuth<BetterAuthOptions>({
      ...options,
      databaseHooks: {
        user: { create: { async before(user) { return { data: { ...user, name: normalizeName(user.name) } }; } } },
        session: { create: { async after(session) {
          const user = await findUser(session.userId);
          if (!user) throw new Error("Authenticated user is missing.");
          await provisioner.provision(user);
        } } },
      },
    });
  }
  /**
   * Dispatches the incoming authentication request.
   * @param request - Incoming authentication request.
   * @returns The requested result after the operation completes.
   */
  async handle(request: Request): Promise<Response> { return this.auth.handler(request); }
  /**
   * Verifies the current session and preserves provider response headers.
   * @param headers - Request headers carrying session credentials.
   * @returns The requested result after the operation completes.
   */
  async getSession(headers: Headers) {
    const result = await this.auth.api.getSession({ headers, returnHeaders: true });
    return { session: result.response, headers: result.headers };
  }
}
