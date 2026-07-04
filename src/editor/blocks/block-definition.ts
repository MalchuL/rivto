import type { ComponentType, ReactNode } from "react";
import type { ZodType } from "zod";
import type { Block } from "../../store/document-model";
import type { EditorMode, RivtoEditorApi, RuntimeEventHandler, RuntimeEventType } from "../editor/types";

/** Properties supplied to a React renderer owned by a block definition. */
export interface BlockRenderProps {
  /** Detached collaborative block value being rendered. */
  block: Block;
  /** Public editor commands available to trusted local extensions. */
  editor: RivtoEditorApi;
  /** Default editable content produced by Rivto. */
  content: ReactNode;
}

/** Command-backed action displayed for one native block type. */
export interface BlockUIAction {
  /** Unique action ID within the rendered contribution set. */
  id: string;
  /** Human-readable button label. */
  title: string;
  /** Runtime command invoked with the active block ID. */
  command: string;
  /** Optional modes in which this action is visible. */
  modes?: EditorMode[];
}

/**
 * Interaction hooks and capabilities owned by a block definition.
 *
 * Event handlers receive normalized values rather than React events, allowing
 * EventRouter to invoke the same behavior from any renderer implementation.
 */
export type BlockBehavior = Partial<Record<RuntimeEventType, RuntimeEventHandler>> & {
  /** Whether selection UI may treat this block as a selectable object. */
  selectable?: boolean;
  /** Whether interaction plugins may offer drag behavior for this block. */
  draggable?: boolean;
};

/**
 * Defines one native block type understood by the editor runtime.
 *
 * Definitions own validation and presentation. Collaborative values remain in
 * DocumentModelImpl, so definitions never receive native CRDT objects.
 */
export interface BlockDefinition<Props extends Record<string, unknown> = Record<string, unknown>> {
  /** Stable native type persisted in every block record. */
  type: string;
  /** Whether the block owns editable inline text. */
  content: "inline" | "none";
  /** Human-readable name used by accessible UI. */
  title?: string;
  /** Properties merged into caller data during editor-level creation. */
  defaultProps?: Partial<Props>;
  /** Runtime validator for the complete property object. */
  propSchema?: ZodType<Props>;
  /** Modes in which this block can be created and presented. */
  supportedModes?: EditorMode[];
  /** Shared or mode-specific React presentation around Rivto's default content. */
  render?: ComponentType<BlockRenderProps> | Partial<Record<EditorMode, ComponentType<BlockRenderProps>>>;
  /** Optional slash-menu metadata consumed by the slash-menu plugin. */
  slash?: {
    title: string;
    aliases?: string[];
    group?: string;
  };
  /** Command-backed actions shown in the main toolbar for this block. */
  toolbar?: BlockUIAction[];
  /** Command-backed actions shown beside this block. */
  sideMenu?: BlockUIAction[];
  /** Normalized event hooks and interaction capabilities. */
  behavior?: BlockBehavior;
}
