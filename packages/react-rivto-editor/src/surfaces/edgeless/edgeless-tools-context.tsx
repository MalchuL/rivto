import { EdgelessToolContext } from "../../managers/edgeless-tools/edgeless-tool-context";
import { createContext, useContext, useMemo, useEffect, type ReactNode } from "react";
import { useReactPanel } from "../../hooks/editor/use-react-panel";
import { EdgelessCreationDefaults } from "../../managers/elements/edgeless-creation-defaults";

/** Surface-local tool instances shared by all operation and preview consumers. */
const ToolsContext = createContext<EdgelessToolContext | null>(null);

/** One creation-settings session shared by an edgeless surface and all its extensions. */
export const EdgelessCreationDefaultsContext = createContext<EdgelessCreationDefaults | null>(null);

/**
 * Owns tool instances, document operations and creation defaults for one edgeless representation.
 *
 * Construction installs no external subscriptions. The provider observes registrations
 * and document changes after mount, and disposes tools and subscriptions on cleanup.
 * React effect remounts retain settings; a new panel or surface gets fresh stores.
 *
 * @param props - Children including the surface boundary and its mounted extension UI.
 * @param props.children - React subtree receiving this isolated session, including portals.
 * @returns A provider sharing one tool context and settings session without adding state to the panel.
 */
export function EdgelessToolsProvider({ children }: { readonly children: ReactNode }) {
  const panel = useReactPanel();
  const tools = useMemo(() => new EdgelessToolContext(panel), [panel]);
  useEffect(() => tools.observeChanges(), [tools]);
  return (
    <ToolsContext.Provider value={tools}>
      <EdgelessCreationDefaultsContext.Provider value={tools.defaults}>
        {children}
      </EdgelessCreationDefaultsContext.Provider>
    </ToolsContext.Provider>
  );
}

/**
 * Reads the existing creation-settings session without allocating another store.
 *
 * @returns The owning edgeless representation's shared settings.
 * @throws If called outside an EdgelessSurface subtree.
 */
export function useEdgelessCreationDefaults(): EdgelessCreationDefaults {
  const defaults = useContext(EdgelessCreationDefaultsContext);
  if (!defaults) {
    throw new Error("Creation defaults require an EdgelessSurface");
  }
  return defaults;
}

/**
 * Reads the surface's tool context without allocating another instance.
 *
 * @returns Shared tool, operation and group ownership for this surface.
 * @throws If called outside the edgeless provider.
 */
export function useEdgelessTools(): EdgelessToolContext {
  const tools = useContext(ToolsContext);
  if (!tools) {
    throw new Error("Tools require an EdgelessSurface");
  }
  return tools;
}
