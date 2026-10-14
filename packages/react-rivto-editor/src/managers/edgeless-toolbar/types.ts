import type { ComponentType, ReactNode, PointerEvent } from 'react';
import type { EdgelessToolButtonProps } from '../../components/edgeless/tool-button';
import type { EdgelessOperations } from '../elements/edgeless-operations';
import type { EdgelessVisualTool, PresetPayload } from '../../elements/visuals/types';
import type { ReactPanelApi } from '../../panels/types';

/** Context of the receiving canvas; registrations must not retain it across panel lifetimes. */
export interface EdgelessToolbarContext {
  /** Mounted panel receiving activation and custom group contents. */
  readonly reactPanel: ReactPanelApi;
  /** Existing panel-bound operations; share these with renderers and property editors. */
  readonly operations: EdgelessOperations;
}

/** A creation tool or preset. Its identity is independent of persisted element type. */
export interface EdgelessToolbarTool {
  /** Unique ID within this registry category; group IDs and tool IDs have separate namespaces. */
  readonly id: string;
  /** Accessible name and native tooltip, also available to custom group layouts. */
  readonly title: string;
  /** Built-in icon name or custom content; standalone controls show their title when absent. */
  readonly icon?: EdgelessToolButtonProps['icon'];
  /** Omit to show an individual toolbar button. Unknown groups defer presentation until installed. */
  readonly group?: string;
  /** Ascending presentation order; defaults to zero, with registration order breaking ties. */
  readonly order?: number;
  /**
   * @param context - Receiving panel and its shared operations. Activate locally; do not create document content on menu selection.
   */
  readonly activate: (context: EdgelessToolbarContext) => void;
  /**
   * @param tool - Current canvas interaction state.
   * @returns Whether this entry represents that tool or preset. Must be pure.
   */
  readonly isActive: (tool: EdgelessVisualTool) => boolean;
  /**
   * Supplies optional pointer bindings, for example existing draggable placement presets.
   * Keyboard activation normally uses activate. A supplied click handler may preventDefault
   * when a pointer gesture has already activated the tool, avoiding duplicate activation.
   * @param context - Receiving panel, shared operations and mounted preset-drag services.
   * @returns Native pointer handlers and optional button class for the common renderer.
   */
  readonly getButtonProps?: (context: EdgelessToolbarRenderContext) => Pick<EdgelessToolButtonProps, 'onClick' | 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'className'>;
}

/** Pointer placement services available while the toolbar is mounted. */
export interface EdgelessToolbarRenderContext extends EdgelessToolbarContext {
  /**
   * Captures the primary pointer for a built-in placement preset without inserting content.
   * @param event - Pointer-down event from the shared tool button.
   * @param payload - Built-in preset retained until release; movement starts the detached preview.
   */
  readonly startPresetDrag: (event: PointerEvent<HTMLButtonElement>, payload: PresetPayload) => void;
  /**
   * Moves the captured preview and snap guides without document writes.
   * @param event - Pointer-move event; events for another pointer are ignored.
   */
  readonly movePresetDrag: (event: PointerEvent<HTMLButtonElement>) => void;
  /**
   * Releases capture, removes the preview and optionally completes placement.
   * A drag inserts only when released over the canvas, outside editor controls.
   * A click activates placement for the next canvas gesture without inserting an element.
   * @param event - Pointer-up or pointer-cancel event for the captured pointer.
   * @param commit - Defaults to true; pass false on cancellation to avoid insertion or activation.
   */
  readonly endPresetDrag: (event: PointerEvent<HTMLButtonElement>, commit?: boolean) => void;
}

/** Resolved group member; use its activation and button so extension tools share interaction and accessibility. */
export interface EdgelessToolbarItem {
  /** Shared registration; treat it as read-only. */
  readonly tool: EdgelessToolbarTool;
  /** Result of the registered isActive predicate for this panel’s current tool. */
  readonly active: boolean;
  /** Activates this registered entry in the receiving panel. */
  readonly activate: () => void;
}

/** Contents of a group; the toolbar owns popover positioning and dismissal. */
export interface EdgelessToolbarGroupProps extends EdgelessToolbarContext {
  /** All current members, including extension contributions, sorted by order then registration. */
  readonly items: readonly EdgelessToolbarItem[];
  /**
   * Renders a registered member with common active styling and pointer/keyboard behavior.
   * @param item - Member from this group's supplied items; do not construct another tool registration.
   * @param children - Optional replacement for the visible title; null produces an icon-only button.
   * @returns Keyed common tool button, including the registered icon and pointer bindings.
   */
  readonly renderTool: (item: EdgelessToolbarItem, children?: ReactNode) => ReactNode;
}

/** One level of tools with an optional custom content layout. */
export interface EdgelessToolbarGroup {
  /** Unique ID within this registry category; group IDs and tool IDs have separate namespaces. */
  readonly id: string;
  /** Accessible name and native tooltip, also available to custom group layouts. */
  readonly title: string;
  /** Built-in icon name or custom content; standalone controls show their title when absent. */
  readonly icon?: EdgelessToolButtonProps['icon'];
  /** Ascending toolbar order, default zero; ties preserve registration order. */
  readonly order?: number;
  /** First activation chooses this member; missing members fall back to the first available tool. Later activations prefer the last used member in this panel. */
  readonly defaultToolId?: string;
  /** Custom contents must render all items, including contributions from other extensions. Omit to use the common tool list; the toolbar owns the surrounding popover. */
  readonly render?: ComponentType<EdgelessToolbarGroupProps>;
}

/** Top-level toolbar entry; group members are read through getTools instead. */
export type EdgelessToolbarEntry =
  | { readonly kind: 'group'; readonly registration: EdgelessToolbarGroup }
  | { readonly kind: 'tool'; readonly registration: EdgelessToolbarTool };

/** Shared presentation registrations; open menus and last-used tools remain panel-local. */
export interface EdgelessToolbarApi {
  /**
   * Installs a shared group and synchronously notifies registry observers.
   * Removing it hides its member tools until a group with the same ID is installed again.
   *
   * @param group - Unique group definition.
   * @returns Idempotent extension-owned removal.
   * @throws For duplicate IDs or an inactive owner.
   */
  registerGroup(group: EdgelessToolbarGroup): () => void;
  /**
   * Installs a shared tool and synchronously notifies registry observers.
   * Removal does not delete document elements or the containing group.
   *
   * @param tool - Unique tool definition; its group may be registered later.
   * @returns Idempotent extension-owned removal.
   * @throws For duplicate IDs or an inactive owner.
   */
  registerTool(tool: EdgelessToolbarTool): () => void;
  /**
   * Looks up a shared group definition without copying it.
   *
   * @param id - Group ID.
   * @returns Installed group, or undefined.
   */
  getGroup(id: string): EdgelessToolbarGroup | undefined;
  /**
   * Looks up a shared tool definition without copying it.
   *
   * @param id - Tool ID.
   * @returns Installed tool, or undefined.
   */
  getTool(id: string): EdgelessToolbarTool | undefined;
  /**
   * Lists all groups, including those without members.
   *
   * @returns Detached array of shared group definitions ordered by order and registration.
   */
  getGroups(): readonly EdgelessToolbarGroup[];
  /**
   * Lists all tools, including members of groups that have not been installed.
   *
   * @returns Detached array of shared tool definitions ordered by order and registration, including deferred tools.
   */
  getTools(): readonly EdgelessToolbarTool[];
  /**
   * Builds the visible top-level toolbar entries; unresolved group members are omitted.
   *
   * @returns Top-level groups and standalone tools ordered together by order, then registration; empty groups are omitted.
   */
  getEntries(): readonly EdgelessToolbarEntry[];
  /**
   * Observes synchronous registry changes; subscribing does not emit an initial notification.
   *
   * @param listener - Called synchronously after registration changes, without an initial call.
   * @returns Unsubscribe callback.
   */
  subscribe(listener: () => void): () => void;
  /** Stable external-store token until a registration changes. */
  readonly revision: number;
}
