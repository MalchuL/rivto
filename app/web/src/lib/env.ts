import { z } from "zod";

const serverEnvSchema = z.object({
  PUBLIC_API_BASE_URL: z.url().default("http://127.0.0.1:4000"),
  SERVER_API_BASE_URL: z.url().default("http://127.0.0.1:4000"),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const result = serverEnvSchema.safeParse({
    PUBLIC_API_BASE_URL: process.env.PUBLIC_API_BASE_URL,
    SERVER_API_BASE_URL: process.env.SERVER_API_BASE_URL,
  });
  if (!result.success) {
    const invalid = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(
      `Invalid server environment (check web/.env.local or Compose env): ${invalid}`,
    );
  }
  cached = result.data;
  return cached;
}

/** BFF / Route Handlers → API base URL (server only). */
export function getServerApiBaseUrl(): string {
  return getServerEnv().SERVER_API_BASE_URL;
}
