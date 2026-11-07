/**
 * Implements profile persistence through the storage-independent identity contract.
 * SQLite records are returned as domain users with stable identities and names.
 * The supplied connection may be an active transaction shared with other repositories.
 */
import { asc, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { User } from "../../../domain/identity/types.ts";
import type { Pagination } from "../../../lib/pagination/types.ts";
import type { IdentityRepository } from "../types.ts";
import * as schema from "../../sqlite/schema.ts";

type Database = Pick<LibSQLDatabase<typeof schema>, "select" | "insert" | "update">;
export class SqliteIdentityRepository implements IdentityRepository {
  private readonly db: Database;
  /**
   * Connects the dependencies required by this instance.
   * @param db - SQLite connection or active transaction.
   */
  constructor(db: Database) { this.db = db; }
  /**
   * Looks up a persisted profile without fabricating missing records.
   * @param id - Stable identity of the requested record.
   * @returns The requested result after the operation completes.
   */
  async find(id: string) { return this.db.select().from(schema.users).where(eq(schema.users.id, id)).get(); }
  /**
   * Lists matching persisted records in stable order.
   * @param pagination - Optional bounds applied after filtering.
   * @returns The requested result after the operation completes.
   */
  async list(pagination?: Pagination) {
    const query = this.db.select().from(schema.users).orderBy(asc(schema.users.name), asc(schema.users.id));
    if (pagination) query.limit(pagination.limit).offset(pagination.offset);
    return query;
  }
  /**
   * Persists a new record and its required associations.
   * @param user - Authenticated actor or profile record.
   * @returns The requested result after the operation completes.
   */
  async insert(user: User) { await this.db.insert(schema.users).values(user); }
  /**
   * Persists validated editable fields for the requested record.
   * @param id - Stable identity of the requested record.
   * @param name - Validated display name.
   * @returns The requested result after the operation completes.
   */
  async update(id: string, name: string) { return (await this.db.update(schema.users).set({ name }).where(eq(schema.users.id, id)).returning().get())!; }
}
