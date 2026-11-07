/** Configures Better Auth with the runtime-owned SQLite adapter and profile provisioning. */
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { UserProvisioner } from "../domain/identity/service.ts";
import { BetterAuthService } from "../infrastructure/authentication/better-auth/service.ts";
import type { SqliteDatabase } from "../storage/sqlite/database.ts";
import * as schema from "../storage/sqlite/auth-schema.ts";
import { authOptions } from "./auth-options.ts";

/**
 * Configures the authentication service against the runtime-owned database.
 * @param services - SQLite connection and installation secret.
 * @returns A configured service with session verification and HTTP operations.
 */
export function createAuthenticationService(services: SqliteDatabase): BetterAuthService {
  return new BetterAuthService({
    ...authOptions,
    secret: services.authSecret,
    database: drizzleAdapter(services.database, { provider: "sqlite", schema, transaction: true }),
    rateLimit: { enabled: true },
    advanced: { ipAddress: { ipAddressHeaders: ["x-chulane-client-ip"] } },
  }, new UserProvisioner(services.storage), async (id) => services.database.select({ id: schema.user.id, name: schema.user.name })
    .from(schema.user).where(eq(schema.user.id, id)).get());
}

