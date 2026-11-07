/**
 * Shares password authentication options between the CLI and application runtime.
 * Importing this module does not initialize authentication or open resources.
 * The runtime supplies its database and durable installation secret; the CLI
 * creates its own instance only when loading the schema-generation config.
 */
import type { BetterAuthOptions } from "better-auth";

export const authOptions = {
  appName: "Chulane",
  emailAndPassword: { enabled: true, requireEmailVerification: false },
  baseURL: { allowedHosts: ["127.0.0.1:*"], protocol: "http" },
} satisfies BetterAuthOptions;
