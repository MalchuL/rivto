import { createContext } from "react";
import type { EditorStorage } from "./editor-storage";

/**
 * Supplies the host-owned editor cache to document views and nested embeddings.
 *
 * Wrap related EditorViews in this context's Provider. Each view retains its
 * own document consumer, and embeddings resolve and acquire their sources from
 * the nearest provider. Separate users can provide independent storage instances.
 * The provider does not create or destroy storage; the application owns cleanup.
 * Without a provider, standalone views use their caller-owned editor directly
 * and embeddings report that block resolution is unavailable.
 */
export const EditorStorageContext = createContext<EditorStorage | undefined>(undefined);
