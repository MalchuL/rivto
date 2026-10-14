import type { ComponentType, ReactNode, PointerEvent } from 'react';
import type { EdgelessToolButtonProps } from '../../components/edgeless/tool-button';
import type { EdgelessOperations } from '../elements/edgeless-operations';
import type { EdgelessVisualTool, PresetPayload } from '../../elements/visuals/types';
import type { ReactPanelApi } from '../../panels/types';

/** Context of the receiving canvas; registrations must not retain it across panel lifetimes. */
export interface EdgelessToolbarContext {
  readonly reactPanel: ReactPanelApi;
  readonly operations: EdgelessOperations;
}

/** A creation tool or preset. Its identity is independent of persisted element type. */
export interface EdgelessToolbarTool {
  readonly id: string;
  readonly title: string;
  readonly icon?: EdgelessToolButtonProps['icon'];
  /** Omit to show an individual toolbar button. Unknown groups defer presentation until installed. */
  readonly group?: string;
  /** Ascending presentation order; defaults to zero, with registration order breaking ties. */
  readonly order?: number;
  /** @param context - Receiving panel and its shared operations. Activate locally; do not create document content on menu selection. */
  readonly activate: (context: EdgelessToolbarContext) => void;
  /** @param tool - Current canvas interaction state. @returns Whether this entry represents that tool or preset. Must be pure. */
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
  readonly startPresetDrag: (event: PointerEvent<HTMLButtonElement>, payload: PresetPayload) => void;
  readonly movePresetDrag: (event: PointerEvent<HTMLButtonElement>) => void;
  readonly endPresetDrag: (event: PointerEvent<HTMLButtonElement>, commit?: boolean) => void;
}

/** Resolved group member; use its activation and button so extension tools share interaction and accessibility. */
export interface EdgelessToolbarItem {
  readonly tool: EdgelessToolbarTool;
  readonly active: boolean;
  /** Activates this registered entry in the receiving panel. */
  readonly activate: () => void;
}

/** Contents of a group; the toolbar owns popover positioning and dismissal. */
export interface EdgelessToolbarGroupProps extends EdgelessToolbarContext {
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
  readonly id: string;
  readonly title: string;
  readonly icon?: EdgelessToolButtonProps['icon'];
  /** Ascending toolbar order, default zero; ties preserve registration order. */
  readonly order?: number;
  /** First activation chooses this member; missing members fall back to the first available tool. */
  readonly defaultToolId?: string;
  /** Custom contents must render all items, including contributions from other extensions. */
  readonly render?: ComponentType<EdgelessToolbarGroupProps>;
}

/** Top-level toolbar entry; group members are read through getTools instead. */
export type EdgelessToolbarEntry =
  | { readonly kind: 'group'; readonly registration: EdgelessToolbarGroup }
  | { readonly kind: 'tool'; readonly registration: EdgelessToolbarTool };

/** Shared presentation registrations; open menus and last-used tools remain panel-local. */
export interface EdgelessToolbarApi {
  /** @param group - Unique group definition. @returns Idempotent extension-owned removal. @throws For duplicate IDs or an inactive owner. */
  registerGroup(group: EdgelessToolbarGroup): () => void;
  /** @param tool - Unique tool definition; its group may be registered later. @returns Idempotent extension-owned removal. @throws For duplicate IDs or an inactive owner. */
  registerTool(tool: EdgelessToolbarTool): () => void;
  /** @param id - Group ID. @returns Installed group, or undefined. */
  getGroup(id: string): EdgelessToolbarGroup | undefined;
  /** @param id - Tool ID. @returns Installed tool, or undefined. */
  getTool(id: string): EdgelessToolbarTool | undefined;
  /** @returns Detached array of shared group definitions ordered by order and registration. */
  getGroups(): readonly EdgelessToolbarGroup[];
  /** @returns Detached array of shared tool definitions ordered by order and registration, including deferred tools. */
  getTools(): readonly EdgelessToolbarTool[];
  /** @returns Top-level groups and standalone tools ordered together by order, then registration; empty groups are omitted. */
  getEntries(): readonly EdgelessToolbarEntry[];
  /** @param listener - Called synchronously after registration changes, without an initial call. @returns Unsubscribe callback. */
  subscribe(listener: () => void): () => void;
  /** Stable external-store token until a registration changes. */
  readonly revision: number;
}
