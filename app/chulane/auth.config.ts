/**
 * Configures password-only local authentication, initialized by Better Auth CLI.
 * This database-free instance supplies schema generation; the Cordis-owned
 * runtime adds its SQLite adapter, per-installation secret, and local origin.
 */
import { betterAuth } from "better-auth";
import { authOptions } from "./src/runtime/auth-options.ts";

export const auth = betterAuth(authOptions);
