import type { ComponentType, ReactNode } from "react";
import type { CanvasTool } from "../core/tools/canvas-tool";
import type { ReactCanvasToolEntry, ReactCanvasToolGroupEntry } from "./react-tool-registry";
import type { CanvasToolContext } from "../core/tools/canvas-tool-context";
import type { CanvasToolRegistry } from "../core/tools/canvas-tool-registry";

/** Accessible button contract; applications may supply their own icon and styling system. */
export interface CanvasToolButtonProps {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly pressed?: boolean;
  readonly children?: ReactNode;
  readonly className?: string;
  /** Registered tool identity used by the toolbar's normalized input routing. */
  readonly toolId?: string;
  /** ID of an open group menu, when this button opens one. */
  readonly menuId?: string;
  /** Whether this button's group menu is open; omitted for ordinary tools. */
  readonly menuOpen?: boolean;
  /**
   * Activates a tool or toggles its group menu.
   *
   * @returns The toolbar has applied its activation or menu action.
   * @throws Propagates tool activation failures.
   */
  readonly onActivate: () => void;
}

/** Resolved member passed to registered group renderers. */
export interface CanvasToolbarItem<Registration> {
  readonly tool: Registration;
  readonly active: boolean;
  /**
   * Activates this entry through the receiving canvas session.
   *
   * @returns Cancels the previous interaction and activates the registered instance.
   * @throws If the registration disappeared or its activation fails.
   */
  readonly activate: () => void;
}

/** Shared content and menu state passed to an application's toolbar layout. */
export interface CanvasToolbarLayout {
  readonly entries: ReactNode;
  readonly content: ReactNode;
  readonly menu: string | null;
  readonly popoverId: string;
  /**
   * Changes the visible group menu without activating another tool.
   *
   * @param menu - Registered group ID, or null to close the menu.
   * @returns Toolbar menu state has been scheduled for rendering.
   */
  readonly setMenu: (menu: string | null) => void;
}

/** Registered group content with the toolbar's common member rendering behavior. */
export interface CanvasToolbarGroupContent<Group, Registration> {
  readonly group: Group;
  readonly items: readonly CanvasToolbarItem<Registration>[];
  /**
   * Renders a member through the shared button and activation behavior.
   *
   * @param item - Registered member of this group.
   * @param children - Optional replacement for the title; null keeps only its icon.
   * @returns A keyed accessible button following the session's active tool.
   */
  readonly renderTool: (item: CanvasToolbarItem<Registration>, children?: ReactNode) => ReactNode;
}

/** Presentation dependencies for a shared canvas toolbar. */
export interface CanvasToolbarProps<
  Tool extends CanvasTool,
  Group extends { readonly registration: GroupRegistration },
  Registration extends ReactCanvasToolEntry,
  GroupRegistration extends ReactCanvasToolGroupEntry,
> {
  readonly tools: Pick<
    CanvasToolContext<Tool, Group, Registration, GroupRegistration>,
    | "active"
    | "revision"
    | "subscribe"
    | "reset"
    | "activate"
    | "activateGroup"
    | "getGroup"
    | "getGroupTool"
  >;
  readonly registry: Pick<
    CanvasToolRegistry<Registration, GroupRegistration>,
    "subscribe" | "revision" | "getTools" | "getGroups" | "getGroup" | "getEntries"
  >;
  readonly Button?: ComponentType<CanvasToolButtonProps>;
  /**
   * Renders registered group contents using the common member buttons.
   *
   * @param props - Group instance, members and rendering helper.
   * @returns Application content; omitted callbacks use the common member list.
   */
  readonly renderGroup?: (props: CanvasToolbarGroupContent<Group, Registration>) => ReactNode;
  /**
   * Applies application chrome while keeping menu state in the canvas toolbar.
   *
   * @param layout - Resolved entries, group contents and controlled menu state.
   * @returns Toolbar and popover markup; omitted callbacks use the default canvas layout.
   */
  readonly renderLayout?: (layout: CanvasToolbarLayout) => ReactNode;
}
