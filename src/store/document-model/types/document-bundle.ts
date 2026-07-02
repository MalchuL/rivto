import { Link } from "./link";

export interface DocumentBundle {
    version: number;
    /**
     * Document-level metadata. Must be JSON-serializable (no Yjs types).
     */
    meta: Record<string, any>;
    /**
     * Serialized block payloads. Must be JSON-serializable (no Yjs types).
     */
    blocks: Array<any>;
    /**
     * Serialized link payloads. Must be JSON-serializable (no Yjs types).
     */
    links: Array<any>;
    /**
     * Plugin-level saved data. Must be JSON-serializable (no Yjs types).
     */
    plugins: Record<string, any>;
}