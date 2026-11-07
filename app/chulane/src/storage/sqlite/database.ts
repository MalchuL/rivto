/**
 * Owns the SQLite connection, repository storage, and installation secret.
 * Opening awaits CLI-generated migrations and a durable installation secret;
 * failed initialization closes the connection before propagating the error.
 * Transactions on the exposed database are serialized within this owner so
 * pooled libSQL connections cannot contend with each other's writes.
 * Cordis owns disposal, while authenticated requests construct scoped services.
 */
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { SqliteStorage } from "./storage.ts";
import * as schema from "./schema.ts";

export class SqliteDatabase {
  readonly storage: SqliteStorage;
  readonly database: LibSQLDatabase<typeof schema>;
  readonly authSecret: string;
  private readonly client: Client;
  private writeTail: Promise<void> = Promise.resolve();

  /**
   * Creates services only after connection initialization succeeds.
   * @param client - Connection whose lifetime belongs to this instance.
   * @param database - Migrated Drizzle database shared by the services.
   * @param authSecret - Durable device-local session signing secret.
   */
  private constructor(client: Client, database: LibSQLDatabase<typeof schema>, authSecret: string) {
    this.client = client;
    this.database = database;
    this.authSecret = authSecret;
    const transaction = database.transaction.bind(database);
    /**
     * Queues domain and authentication transactions before opening a connection.
     * @param callback - Atomic operation, including its authorization reads.
     * @param config - Drizzle transaction options passed through unchanged.
     * @returns The operation's result after commit, or its original rejection.
     */
    database.transaction = (callback, config) => {
      const result = this.writeTail.then(() => transaction(callback, config));
      // A rollback must release the queue without hiding the caller's error.
      this.writeTail = result.then(() => undefined, () => undefined);
      return result;
    };
    this.storage = new SqliteStorage(database);
  }

  /**
   * Opens local persistence before exposing any services to the runtime.
   * @param path - SQLite file location owned by the application host.
   * @returns Initialized services; rejects after closing a failed connection.
   */
  static async open(path: string): Promise<SqliteDatabase> {
    await mkdir(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    const client = createClient({ url: pathToFileURL(resolve(path)).href, timeout: 5000 });
    const database = drizzle(client, { schema });
    let services: SqliteDatabase;
    try {
      await client.execute("PRAGMA foreign_keys = ON");
      await client.execute("PRAGMA journal_mode = WAL");
      await migrate(database, { migrationsFolder: resolve("drizzle") });
      // Keep the signing secret device-local and stable across host restarts.
      const authSecret = await database.transaction(async (tx) => {
        await tx.insert(schema.installation).values({ id: 1, authSecret: randomBytes(32).toString("base64url") }).onConflictDoNothing();
        return (await tx.select().from(schema.installation).where(eq(schema.installation.id, 1)).get())!.authSecret;
      });
      services = new SqliteDatabase(client, database, authSecret);
    } catch (error) {
      client.close();
      throw error;
    }
    return services;
  }

  /** @returns No value after closing the application-owned connection. */
  close(): void {
    this.client.close();
  }
}
