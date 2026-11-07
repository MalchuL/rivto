/**
 * Composes local persistence, authentication, and application HTTP operations.
 * Cordis owns the database lifetime and exposes the verified HTTP handler;
 * each request binds domain services to its own user and shares that connection.
 */
import type { Context } from "@deepseek-ai/cordis";
import { SqliteDatabase } from "../storage/sqlite/database.ts";
import { createAuthenticationService } from "./auth.ts";
import { LocalApi } from "./local-api.ts";

/** Owns the bundled persistence, authentication, and HTTP service composition. */
export class LocalServicesPlugin {
  readonly name = "local-services";
  private readonly path: string;

  /**
   * Selects persistence for this plugin instance without opening resources yet.
   * @param path - Durable SQLite file selected by the host.
   */
  constructor(path: string) {
    this.path = path;
  }

  /**
   * Installs application services and registers cleanup before further startup.
   * @param ctx - Cordis scope owning service registration and cleanup.
   * @returns Resolves after all local capabilities are available.
   */
  readonly apply = async (ctx: Context): Promise<void> => {
    const services = await SqliteDatabase.open(this.path);
    // Cordis calls disposers independently of the service instance.
    ctx.effect(() => () => services.close());
    const auth = createAuthenticationService(services);
    await auth.auth.$context;
    ctx.provide("localHandler", new LocalApi(services.storage, auth).handle);
  };
}
