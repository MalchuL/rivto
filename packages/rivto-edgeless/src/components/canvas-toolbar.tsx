import { useEffect, useId, useState, useSyncExternalStore } from "react";
import type { CanvasTool } from "../core/tools/canvas-tool";
import type { ReactCanvasToolEntry, ReactCanvasToolGroupEntry } from "../types/react-tool-registry";
import type { CanvasToolbarProps } from "../types/toolbar";
import { CanvasToolbarRenderer } from "./canvas-toolbar-renderer";
import { CanvasToolbarLayoutView } from "./canvas-toolbar-layout";

/**
 * Renders registered tools and groups with surface-local activation and menu state.
 *
 * Groups preserve the last-used available member. Registration removal closes stale
 * menus; tools decide whether their settings menu remains open during interaction.
 * Applications supply factories and optional presentation without adding tool-name checks.
 *
 * @param props - Registry, session, common button and optional host presentation adapters.
 * @returns Accessible toolbar entries and the active registered group's content.
 */
export function CanvasToolbar<
  Tool extends CanvasTool,
  Group extends { readonly registration: GroupRegistration },
  Registration extends ReactCanvasToolEntry,
  GroupRegistration extends ReactCanvasToolGroupEntry,
>(props: CanvasToolbarProps<Tool, Group, Registration, GroupRegistration>) {
  const { menu, setMenu, popoverId } = useToolbarMenu(props);
  const layout = new CanvasToolbarRenderer(props, menu, setMenu, popoverId).getLayout();
  return props.renderLayout ? (
    props.renderLayout(layout)
  ) : (
    <CanvasToolbarLayoutView {...layout} tools={props.tools} />
  );
}

/**
 * Subscribes to registry and tool changes while retaining menu state in the receiving view.
 *
 * @param props - Registry and surface-local tool session.
 * @returns Open group, menu setter and accessible dialog identity.
 */
function useToolbarMenu<
  Tool extends CanvasTool,
  Group extends { readonly registration: GroupRegistration },
  Registration extends ReactCanvasToolEntry,
  GroupRegistration extends ReactCanvasToolGroupEntry,
>({
  registry,
  tools: toolsContext,
}: CanvasToolbarProps<Tool, Group, Registration, GroupRegistration>) {
  useSyncExternalStore(
    (listener) => toolsContext.subscribe(listener),
    () => toolsContext.revision,
    () => toolsContext.revision,
  );
  const tool = toolsContext.active;
  const revision = useSyncExternalStore(
    (listener) => registry.subscribe(listener),
    () => registry.revision,
    () => registry.revision,
  );
  const [menu, setMenu] = useState<string | null>(null);
  const popoverId = useId();
  useEffect(() => {
    if (
      menu &&
      !registry.getTools().some((item) => item.group === menu && registry.getGroup(menu))
    ) {
      setMenu(null);
    }
  }, [menu, registry, revision]);

  useEffect(() => {
    if (!tool?.keepsMenuOpen) {
      setMenu(null);
    }
  }, [tool]);

  return { menu, setMenu, popoverId };
}
