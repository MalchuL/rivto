/**
 * Binds SQLite repositories to the shared connection or an atomic transaction.
 * A transaction creates both domain repositories on the same transaction handle.
 * The connection owner remains responsible for serialization and disposal.
 */
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { ApplicationStorage, Repositories } from "../types.ts";
import { SqliteIdentityRepository } from "../identity/sqlite/repository.ts";
import { SqliteWorkspaceRepository } from "../workspaces/sqlite/repository.ts";
import * as schema from "./schema.ts";

export class SqliteStorage implements ApplicationStorage {
  readonly identity: SqliteIdentityRepository;
  readonly workspaces: SqliteWorkspaceRepository;
  private readonly db: LibSQLDatabase<typeof schema>;
  /**
   * Connects the dependencies required by this instance.
   * @param db - SQLite connection or active transaction.
   */
  constructor(db: LibSQLDatabase<typeof schema>) {
    this.db = db;
    this.identity = new SqliteIdentityRepository(db);
    this.workspaces = new SqliteWorkspaceRepository(db);
  }
  /**
   * Runs the operation with repositories sharing an atomic transaction.
   * @param operation - Work performed using the same atomic repository context.
   * @returns The requested result after the operation completes.
   */
  async transaction<T>(operation: (repositories: Repositories) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => operation({ identity: new SqliteIdentityRepository(tx), workspaces: new SqliteWorkspaceRepository(tx) }));
  }
}
