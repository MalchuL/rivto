import type {
  BasicCRDTType,
  BasicType,
  CRDTMap,
  CRDTUndoScope,
} from "../../../../crdt-doc";
import type { DocumentModel } from "../../types";
import { assignMap, clone, isCRDTMap } from "../../utils";

const PLUGINS_KEY = "rivto.editor.plugins";

/**
 * Owns generic, namespaced collaborative data used by document plugins.
 *
 * The manager deliberately knows nothing about any plugin schema. Object-valued
 * namespaces can be materialized as shared maps so independent records merge
 * through the active CRDT adapter instead of replacing the whole document.
 */
export class DocumentPluginDataManager {
  /** Collaborative root included in document undo history. */
  readonly undoScopes: CRDTUndoScope[];
  private readonly root: CRDTMap<Record<string, BasicCRDTType>>;

  /**
   * Creates a generic plugin-data owner for one document.
   *
   * @param document - Document providing CRDT storage and transactions.
   */
  constructor(private readonly document: DocumentModel) {
    this.root = document.crdt.getMap<Record<string, BasicCRDTType>>(PLUGINS_KEY);
    this.undoScopes = [this.root];
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
  set(pluginId: string, value: BasicType): void {
    this.document.transact(() => this.root.set(this.requireId(pluginId), clone(value) as BasicCRDTType));
  }

  /**
   * Returns a collaborative map for an object-valued namespace.
   *
   * Existing plain snapshot data is promoted once while preserving its fields.
   * Calling this method can therefore mutate storage when the namespace has not
   * yet been materialized as a shared map.
   *
   * @param pluginId - Stable plugin namespace identifier.
   * @returns Attached collaborative namespace map.
   * @throws {Error} When existing namespace data is not an object.
   */
  getMap(pluginId: string): CRDTMap<Record<string, BasicCRDTType>> {
    const id = this.requireId(pluginId);
    const current = this.root.get(id);
    if (isCRDTMap(current)) return current;
    if (current !== undefined && (!current || typeof current !== "object" || Array.isArray(current))) {
      throw new Error(`Plugin data ${id} is not an object namespace`);
    }
    const map = this.document.crdt.instantiator.createMap<Record<string, BasicCRDTType>>();
    if (current) assignMap(map, current as Record<string, unknown>);
    this.document.transact(() => this.root.set(id, map));
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
    if (existed) this.document.transact(() => this.root.delete(id));
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
    this.document.transact(() => this.mergeMap(this.root, values));
  }

  /** Validates and normalizes one namespace identifier. */
  private requireId(pluginId: string): string {
    const id = pluginId.trim();
    if (!id) throw new Error("Plugin data ID is required");
    return id;
  }

  /** Preserves existing shared child maps while replacing portable fields. */
  private mergeMap(map: CRDTMap<Record<string, BasicCRDTType>>, values: Record<string, unknown>): void {
    [...map.keys()].filter((key) => !(key in values)).forEach((key) => map.delete(key));
    Object.entries(values).forEach(([key, value]) => {
      const current = map.get(key);
      if (isCRDTMap(current) && value && typeof value === "object" && !Array.isArray(value)) {
        this.mergeMap(current as CRDTMap<Record<string, BasicCRDTType>>, value as Record<string, unknown>);
      } else if (value !== undefined) {
        map.set(key, clone(value) as BasicCRDTType);
      }
    });
  }
}
