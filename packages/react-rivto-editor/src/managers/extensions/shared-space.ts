import { RevisionStore } from "../../internal-store";
import { Listeners } from "@chulane/rivto-utils";

/** Observable runtime object whose lifetime belongs to a reserved key. */
export abstract class SharedObject {
  private readonly store = new RevisionStore();
  private disposed = false;

  /**
   * Reads the revision of this object's observable contents.
   *
   * @returns Monotonic revision, initially zero.
   * @throws If the object has been disposed.
   */
  get revision(): number {
    this.assertActive();
    return this.store.revision;
  }

  /**
   * Subscribes to changes in the object's observable contents.
   *
   * @param listener - Callback invoked synchronously after a change.
   * @returns A function that removes the listener.
   * @throws If the object has been disposed.
   */
  subscribe(listener: () => void): () => void {
    this.assertActive();
    return this.store.subscribe(listener);
  }

  /**
   * Releases subscriptions and invalidates the object.
   *
   * @returns The object is invalidated; repeated disposal has no effect.
   */
  dispose(): void {
    if (!this.disposed) {
      this.disposed = true;
      this.store.clear();
      this.clearContents();
    }
  }

  /**
   * Notifies subscribers that observable contents have changed.
   *
   * @returns The revision is advanced and listeners have been notified.
   */
  protected changed(): void {
    this.store.changed();
  }

  /**
   * Releases data retained by this object after its final reservation ends.
   *
   * @returns Subclass-owned contents have been released.
   */
  protected clearContents(): void {}

  /**
   * Checks whether operations are permitted on this object.
   *
   * @returns The object is still active.
   * @throws If the final reservation has been released.
   */
  protected assertActive(): void {
    if (this.disposed) {
      throw new Error("Shared object is disposed");
    }
  }
}

/** A set whose values remain present until their final claim is removed. */
export class SharedSet<T> extends SharedObject {
  private readonly counts = new Map<T, number>();

  /**
   * Adds one claim for a value.
   *
   * @param value - Value to claim.
   * @returns The set contains the value.
   * @throws If the set is disposed.
   */
  add(value: T): void {
    this.assertActive();
    const count = this.counts.get(value) ?? 0;
    this.counts.set(value, count + 1);
    if (count === 0) {
      this.changed();
    }
  }

  /**
   * Releases one claim for a value.
   *
   * @param value - Value whose claim is released.
   * @returns Whether a claim existed.
   * @throws If the set is disposed.
   */
  delete(value: T): boolean {
    this.assertActive();
    const count = this.counts.get(value);
    if (count === undefined) {
      return false;
    }
    if (count === 1) {
      this.counts.delete(value);
      this.changed();
    } else {
      this.counts.set(value, count - 1);
    }
    return true;
  }

  /**
   * Checks whether a value has at least one claim.
   *
   * @param value - Value to inspect.
   * @returns Whether the value is present.
   * @throws If the set is disposed.
   */
  has(value: T): boolean {
    this.assertActive();
    return this.counts.has(value);
  }

  /**
   * Reads a detached list of currently claimed values.
   *
   * @returns Values in insertion order.
   * @throws If the set is disposed.
   */
  values(): readonly T[] {
    this.assertActive();
    return [...this.counts.keys()];
  }

  /**
   * Releases all values retained by the disposed set.
   *
   * @returns Stored value references and counts have been cleared.
   */
  protected override clearContents(): void {
    this.counts.clear();
  }
}

/** A map whose keys remain present until their final claim is removed. */
export class SharedMap<K, V> extends SharedObject {
  private readonly entries = new Map<K, { value: V; count: number }>();

  /**
   * Adds a key claim and immediately replaces its value.
   *
   * @param key - Key to claim.
   * @param value - Current value for every reader.
   * @returns The key has an additional claim.
   * @throws If the map is disposed.
   */
  set(key: K, value: V): void {
    this.assertActive();
    const previous = this.entries.get(key);
    this.entries.set(key, { value, count: (previous?.count ?? 0) + 1 });
    if (!previous || !Object.is(previous.value, value)) {
      this.changed();
    }
  }

  /**
   * Releases one key claim without restoring previous values.
   *
   * @param key - Key whose claim is released.
   * @returns Whether a claim existed.
   * @throws If the map is disposed.
   */
  delete(key: K): boolean {
    this.assertActive();
    const entry = this.entries.get(key);
    if (!entry) {
      return false;
    }
    if (entry.count === 1) {
      this.entries.delete(key);
      this.changed();
    } else {
      entry.count -= 1;
    }
    return true;
  }

  /**
   * Reads the current value of a claimed key.
   *
   * @param key - Key to inspect.
   * @returns Current value, or undefined when absent.
   * @throws If the map is disposed.
   */
  get(key: K): V | undefined {
    this.assertActive();
    return this.entries.get(key)?.value;
  }

  /**
   * Checks whether a key has a claim, including when its value is undefined.
   *
   * @param key - Key to inspect.
   * @returns Whether the key is present.
   * @throws If the map is disposed.
   */
  has(key: K): boolean {
    this.assertActive();
    return this.entries.has(key);
  }

  /**
   * Releases all keys and values retained by the disposed map.
   *
   * @returns Stored entries and counts have been cleared.
   */
  protected override clearContents(): void {
    this.entries.clear();
  }
}

/** An observable ordered collection of runtime values. */
export class SharedArray<T> extends SharedObject {
  private readonly items: T[] = [];

  /**
   * Reads a detached snapshot of the array.
   *
   * @returns Values in their current order.
   * @throws If the array is disposed.
   */
  values(): readonly T[] {
    this.assertActive();
    return [...this.items];
  }

  /**
   * Replaces a range using JavaScript splice index semantics.
   *
   * @param start - Zero-based insertion or removal position.
   * @param deleteCount - Number of existing values to remove.
   * @param items - Values to insert at the position.
   * @returns The removed values.
   * @throws If the array is disposed.
   */
  splice(start: number, deleteCount: number, ...items: T[]): T[] {
    this.assertActive();
    const removed = this.items.splice(start, deleteCount, ...items);
    if (removed.length || items.length) {
      this.changed();
    }
    return removed;
  }

  /**
   * Releases all values retained by the disposed array.
   *
   * @returns Stored values have been cleared.
   */
  protected override clearContents(): void {
    this.items.length = 0;
  }
}

/** One observable runtime value, including a replaceable function. */
export class SharedValue<T> extends SharedObject {
  private value: T | undefined;

  /**
   * Reads the current value.
   *
   * @returns The value, or undefined before assignment.
   * @throws If the value is disposed.
   */
  get(): T | undefined {
    this.assertActive();
    return this.value;
  }

  /**
   * Replaces the current value.
   *
   * @param value - New value, or undefined to clear it.
   * @returns The current value is replaced.
   * @throws If the value is disposed.
   */
  set(value: T | undefined): void {
    this.assertActive();
    if (!Object.is(this.value, value)) {
      this.value = value;
      this.changed();
    }
  }

  /**
   * Releases the value retained by the disposed object.
   *
   * @returns The stored value reference has been cleared.
   */
  protected override clearContents(): void {
    this.value = undefined;
  }
}

/** Borrowed set operations; the space owns disposal. */
export type SharedSetApi<T> = Omit<SharedSet<T>, "dispose">;
/** Borrowed map operations; the space owns disposal. */
export type SharedMapApi<K, V> = Omit<SharedMap<K, V>, "dispose">;
/** Borrowed array operations; the space owns disposal. */
export type SharedArrayApi<T> = Omit<SharedArray<T>, "dispose">;
/** Borrowed value operations; the space owns disposal. */
export type SharedValueApi<T> = Omit<SharedValue<T>, "dispose">;

/** Supported runtime object kinds; function values use the function kind. */
export type SharedObjectKind = "set" | "map" | "array" | "value" | "function";

/** Borrowed shared-space operations; the extension manager owns destruction. */
export type SharedSpaceApi = Pick<
  SharedSpace,
  | "reserve"
  | "getSet"
  | "getMap"
  | "getArray"
  | "getValue"
  | "getFunction"
  | "subscribe"
  | "revision"
>;

interface SharedEntry {
  readonly kind: SharedObjectKind;
  count: number;
  object?: SharedObject;
}

/** Named runtime objects shared by extensions of one editor. */
export class SharedSpace {
  private readonly entries = new Map<string, SharedEntry>();
  private readonly listeners = new Listeners<Record<string, void>>();
  private revisionValue = 0;
  private destroyed = false;

  /**
   * Creates a space whose reservations participate in the editor lifecycle.
   *
   * @param registerCleanup - Registers a release with the extension lifecycle owner.
   */
  constructor(private readonly registerCleanup: (release: () => void) => () => void) {}

  /**
   * Reads the revision of changes to reserved names and their objects.
   *
   * @returns Monotonic revision suitable for an external-store snapshot.
   */
  get revision(): number {
    return this.revisionValue;
  }

  /**
   * Observes a name even while it is not reserved.
   *
   * Notifications cover the first reservation, observable object changes, and
   * the last release. Other names do not notify this subscription.
   *
   * @param key - Shared name to observe.
   * @param listener - Callback invoked synchronously after a change.
   * @returns A function that removes this subscription.
   * @throws If the owning editor has destroyed the space.
   */
  subscribe(key: string, listener: () => void): () => void {
    if (this.destroyed) {
      throw new Error("Shared space is destroyed");
    }
    return this.listeners.subscribe(key, listener);
  }

  /**
   * Invalidates remaining objects and releases all named subscriptions.
   *
   * The extension manager calls this after attempting all reservation cleanup.
   *
   * @returns The space no longer retains objects or listeners; repeated calls do nothing.
   */
  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    for (const entry of this.entries.values()) {
      entry.object?.dispose();
    }
    this.entries.clear();
    this.listeners.clear();
  }

  /**
   * Reserves a name and object kind until its disposer runs.
   *
   * @param key - Shared name agreed by participants.
   * @param kind - Object kind associated with the name.
   * @returns Idempotent reservation disposer.
   * @throws If the name is already reserved for another kind or the editor is destroyed.
   */
  reserve(key: string, kind: SharedObjectKind): () => void {
    if (this.destroyed) {
      throw new Error("Shared space is destroyed");
    }
    let entry = this.entries.get(key);
    if (entry && entry.kind !== kind) {
      throw new Error(`Shared key ${key} is reserved as ${entry.kind}`);
    }
    const firstReservation = !entry;
    if (!entry) {
      entry = { kind, count: 0 };
      this.entries.set(key, entry);
    }
    const reserved = entry;
    reserved.count += 1;
    let release: () => void;
    try {
      release = this.registerCleanup(() => {
        reserved.count -= 1;
        if (reserved.count === 0) {
          this.entries.delete(key);
          reserved.object?.dispose();
          this.changed(key);
        }
      });
    } catch (error) {
      reserved.count -= 1;
      if (reserved.count === 0) {
        this.entries.delete(key);
      }
      throw error;
    }
    if (firstReservation) {
      try {
        this.changed(key);
      } catch (error) {
        try {
          release();
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], "Shared reservation notification failed");
        }
        throw error;
      }
    }
    return release;
  }

  /**
   * Looks up a reserved set, creating it on first lookup.
   *
   * @param key - Name reserved for a set.
   * @returns The shared set, or undefined if the name is unreserved.
   * @throws If the name is reserved for another kind.
   */
  getSet<T>(key: string): SharedSetApi<T> | undefined {
    return this.getObject(key, "set", () => new SharedSet<T>());
  }

  /**
   * Looks up a reserved map, creating it on first lookup.
   *
   * @param key - Name reserved for a map.
   * @returns The shared map, or undefined if the name is unreserved.
   * @throws If the name is reserved for another kind.
   */
  getMap<K, V>(key: string): SharedMapApi<K, V> | undefined {
    return this.getObject(key, "map", () => new SharedMap<K, V>());
  }

  /**
   * Looks up a reserved array, creating it on first lookup.
   *
   * @param key - Name reserved for an array.
   * @returns The shared array, or undefined if the name is unreserved.
   * @throws If the name is reserved for another kind.
   */
  getArray<T>(key: string): SharedArrayApi<T> | undefined {
    return this.getObject(key, "array", () => new SharedArray<T>());
  }

  /**
   * Looks up a reserved scalar value, creating it on first lookup.
   *
   * @param key - Name reserved for a value.
   * @returns The shared value, or undefined if the name is unreserved.
   * @throws If the name is reserved for another kind.
   */
  getValue<T>(key: string): SharedValueApi<T> | undefined {
    return this.getObject(key, "value", () => new SharedValue<T>());
  }

  /**
   * Looks up a reserved replaceable function, creating it on first lookup.
   *
   * @param key - Name reserved for a function.
   * @returns The shared function value, or undefined if the name is unreserved.
   * @throws If the name is reserved for another kind.
   */
  getFunction<T extends (...args: never[]) => unknown>(key: string): SharedValueApi<T> | undefined {
    return this.getObject(key, "function", () => new SharedValue<T>());
  }

  /**
   * Retrieves or creates the object belonging to a reserved name.
   *
   * @param key - Name to look up.
   * @param kind - Required object kind.
   * @param create - Factory for the first lookup.
   * @returns The object, or undefined for an unreserved name.
   * @throws If the name has a different reserved kind.
   */
  private getObject<T extends SharedObject>(
    key: string,
    kind: SharedObjectKind,
    create: () => T,
  ): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.kind !== kind) {
      throw new Error(`Shared key ${key} is reserved as ${entry.kind}`);
    }
    if (!entry.object) {
      entry.object = create();
      entry.object.subscribe(() => this.changed(key));
    }
    return entry.object as T;
  }

  /**
   * Advances the shared revision and notifies observers of one name.
   *
   * @param key - Name whose reservation or object changed.
   * @returns Matching subscribers have been notified.
   */
  private changed(key: string): void {
    this.revisionValue += 1;
    this.listeners.emit(key);
  }
}
