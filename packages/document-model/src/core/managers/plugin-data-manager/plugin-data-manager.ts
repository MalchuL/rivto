/**
 * Stores portable, namespaced plugin data for a collaborative document.
 * The manager preserves shared child-map identities during snapshot loads and
 * exposes only detached portable values.
 */
import type {
  CRDTType,
  CRDTDoc,
  CRDTMap,
  CRDTUndoScope,
} from "@chulane/crdt-doc";
import type { DocumentPluginDataManagerApi } from "../../types";
import { assignMap, assertPortableRecord, assertPortableValue, clone, isCRDTMap } from "../../utils";

const PLUGINS_KEY = "rivto.editor.plugins";
/**
 * Owns generic, namespaced collaborative data used by document plugins.
 *
 * The manager deliberately knows nothing about any plugin schema. Object-valued
 * namespaces can be materialized as shared maps so independent records merge
 * through the active CRDT adapter instead of replacing the whole document.
 */
export class DocumentPluginDataManager implements DocumentPluginDataManagerApi {
  private readonly root: CRDTMap<Record<string, CRDTType>>;
  /** Adapter roots tracked by document-owned history. */
  readonly historyScopes: readonly CRDTUndoScope[];

  /**
   * Creates a generic plugin-data owner for one document.
   *
   * @param crdt - Collaborative storage adapter.
   */
  constructor(private readonly crdt: CRDTDoc) {
    this.root = crdt.getMap<Record<string, CRDTType>>(PLUGINS_KEY);
    this.historyScopes = [this.root];
  }

  /**
   * Reads a detached plugin namespace.
   *
   * @param pluginId - Stable plugin namespace identifier.
   * @returns Detached namespace data, or undefined when absent.
   */
  get<Value = unknown>(pluginId: string): Value | undefined {
    const value = this.root.get(this.requireId(pluginId));
    if (value === undefined) return undefined;
    return clone(isCRDTMap(value) ? value.toObject() : value) as Value;
  }

  /**
   * Replaces one plugin namespace without touching unrelated plugins.
   *
   * @param pluginId - Stable plugin namespace identifier.
   * @param value - Serializable namespace value.
   * @returns No value.
   */
  set(pluginId: string, value: unknown): void {
    assertPortableValue(value, "pluginData");
    this.crdt.transact(() => this.root.set(this.requireId(pluginId), clone(value) as CRDTType));
  }

  /**
   * Reads one detached field from an object-valued namespace.
   * @param pluginId - Stable plugin namespace identifier.
   * @param key - Field name inside the namespace.
   * @returns Detached field value, or undefined when absent.
   */
  getField<Value = unknown>(pluginId: string, key: string): Value | undefined {
    const id = this.requireId(pluginId);
    const current = this.root.get(id);
    const value = isCRDTMap(current)
      ? current.get(key)
      : current && typeof current === "object" && !Array.isArray(current)
        ? (current as Record<string, unknown>)[key]
        : undefined;
    return value === undefined ? undefined : clone(value) as Value;
  }

  /**
   * Sets one portable field while preserving independently collaborative siblings.
   * @param pluginId - Stable plugin namespace identifier.
   * @param key - Field name inside the namespace.
   * @param value - Portable field value.
   * @returns No value.
   */
  setField(pluginId: string, key: string, value: unknown): void {
    assertPortableValue(value, "pluginData");
    const id = this.requireId(pluginId);
    this.crdt.transact(() => this.requireMap(id).set(key, clone(value) as CRDTType));
  }

  /**
   * Deletes one field without replacing sibling values.
   * @param pluginId - Stable plugin namespace identifier.
   * @param key - Field name inside the namespace.
   * @returns Whether the field existed.
   */
  deleteField(pluginId: string, key: string): boolean {
    const id = this.requireId(pluginId);
    const current = this.root.get(id);
    const existed = isCRDTMap(current)
      ? current.has(key)
      : Boolean(current && typeof current === "object" && !Array.isArray(current) && key in current);
    if (existed) this.crdt.transact(() => this.requireMap(id).delete(key));
    return existed;
  }

  /**
   * Materializes an object namespace as an internal collaborative map.
   * @param id - Validated namespace identifier.
   * @returns Attached collaborative namespace map.
   */
  private requireMap(id: string): CRDTMap<Record<string, CRDTType>> {
    const current = this.root.get(id);
    if (isCRDTMap(current)) return current;
    if (current !== undefined && (!current || typeof current !== "object" || Array.isArray(current))) {
      throw new Error(`Plugin data ${id} is not an object namespace`);
    }
    const map = this.crdt.createDetachedMap<Record<string, CRDTType>>();
    if (current) assignMap(map, current as Record<string, unknown>);
    this.root.set(id, map);
    return map;
  }

  /**
   * Removes one namespace.
   *
   * @param pluginId - Stable plugin namespace identifier.
   * @returns Whether a namespace existed.
   */
  delete(pluginId: string): boolean {
    const id = this.requireId(pluginId);
    const existed = this.root.has(id);
    if (existed) this.crdt.transact(() => this.root.delete(id));
    return existed;
  }

  /** @returns Detached data for every persisted plugin namespace. */
  getAll(): Record<string, unknown> {
    return clone(this.root.toObject() as Record<string, unknown>);
  }

  /**
   * Replaces every plugin namespace from a document snapshot.
   *
   * @param values - Portable namespace data keyed by plugin ID.
   * @returns No value.
   */
  load(values: Record<string, unknown>): void {
    assertPortableRecord(values, "pluginData");
    this.crdt.transact(() => this.mergeMap(this.root, values));
  }

  /**
   * Validates and normalizes one namespace identifier.
   *
   * @param pluginId - Candidate plugin namespace identifier.
   * @returns Trimmed nonempty identifier.
   */
  private requireId(pluginId: string): string {
    const id = pluginId.trim();
    if (!id) throw new Error("Plugin data ID is required");
    return id;
  }

  /**
   * Preserves existing shared child maps while replacing portable fields.
   *
   * @param map - Collaborative map to reconcile in place.
   * @param values - Complete portable fields that should remain after reconciliation.
   * @returns No value.
   */
  private mergeMap(map: CRDTMap<Record<string, CRDTType>>, values: Record<string, unknown>): void {
    [...map.keys()].filter((key) => !(key in values)).forEach((key) => map.delete(key));
    Object.entries(values).forEach(([key, value]) => {
      const current = map.get(key);
      if (isCRDTMap(current) && value && typeof value === "object" && !Array.isArray(value)) {
        this.mergeMap(current as CRDTMap<Record<string, CRDTType>>, value as Record<string, unknown>);
      } else if (value !== undefined) {
        map.set(key, clone(value) as CRDTType);
      }
    });
  }
}
