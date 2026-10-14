import type { EdgelessOperations } from './edgeless-operations';
import type { EditableLabelFocusPoint } from '../../components';
import type { ComponentType, ReactNode, RefObject } from 'react';
import type { PanelAPI, ElementDefinition, EditorElementInput, EditorElementNode } from '@chulane/rivto';
import type { EdgelessAlignment, EdgelessReorder, EdgelessVisualTool } from '../../elements/visuals/types';
import type { ReactPanelApi } from '../../panels/types';
import type { ElementClipboardConverter } from '../clipboard/types';

/** Interactive element input; omitted stacking places the element above the panel's current elements. */
export type CreateElementInput = Omit<EditorElementInput, 'zIndex'> & { readonly zIndex?: number };

/** Props for registered element content; the surface owns position, DOM identity and selection. */
export interface ElementRenderProps {
  /**
   * Current record with registered defaults and local property previews; treat nested values as read-only.
   * With preview=true this is a detached creation draft, and its frame is the current placement preview.
   * Frame remains persisted geometry during a transform: the host previews size and position directly
   * in the DOM without rendering content again. Use host-relative sizing or a responsive SVG viewport
   * for content that must scale throughout a resize gesture.
   */
  readonly element: EditorElementNode;
  /** True for detached creation previews: the ID is not in the document. Render supplied data without mutations, subscriptions by ID, or autofocus. */
  readonly preview: boolean;
  readonly reactPanel: ReactPanelApi;
  /** Canvas operations shared with toolbar and property editors; never construct a second instance. */
  readonly operations: EdgelessOperations;
  /** Current viewport scale and selection presentation for this occurrence. */
  readonly zoom: number;
  readonly selected: boolean;
  /** Local label editing state, enabled by behavior.editableLabel. */
  readonly editing: boolean;
  readonly setEditing: (editing: boolean) => void;
  readonly focusPointRef: RefObject<EditableLabelFocusPoint | null>;
}
/** Props for same-type property contents; the shared sidebar owns preview, commit, cancel and history. */
export interface ElementPropertiesProps {
  readonly elements: readonly EditorElementNode[];
  readonly reactPanel: ReactPanelApi;
  /**
   * Reads a shared property using Object.is comparison across the selection.
   * @param key - Property name within element.props.
   * @returns Shared value, or undefined when absent or mixed.
   */
  readonly common: (key: string) => unknown;
  /**
   * Previews a validated and normalized patch locally without recording history.
   * @param patch - Opaque property keys; identity and frame remain separate from props.
   * @throws If a target is missing, selected types differ, or its definition rejects the patch.
   */
  readonly preview: (patch: Record<string, unknown>) => void;
  /**
   * Commits pending previews as one undo step, skipping targets deleted in the meantime.
   * Also runs on an outside pointer press, selection change, or panel unmount.
   * @throws If a remaining target rejects the patch; no target is changed and previews are retained.
   */
  readonly commit: () => void;
  /** Cancels the pending property edit without changing document records. */
  readonly cancel: () => void;
}
/** Atomic installation of an element definition, renderer and optional editing contributions. */
export interface ReactElementRegistration {
  readonly definition: ElementDefinition;
  readonly render: ComponentType<ElementRenderProps>;
  /** Human-readable title used by the shared property panel. Defaults to the persisted type. */
  readonly title?: string;
  readonly behavior?: Pick<ElementDefinition, 'resize'> & {
    /** Enables the common double-click label editing lifecycle for this renderer. */
    readonly editableLabel?: boolean;
    /** Uses an axis-aligned host for world-space geometry and disables ordinary resize/rotate controls; the renderer supplies its own geometry controls. */
    readonly absoluteGeometry?: boolean;
    /**
     * Derives creation defaults before explicit properties are applied.
     * @param defaults - Shared session values, or the registered definition defaults.
     * @param input - Creation request with complete frame and stacking; treat it as read-only.
     * @returns Defaults to merge with remembered values and explicit input properties.
     */
    readonly creationDefaults?: (defaults: Readonly<Record<string, unknown>>, input: EditorElementInput) => Record<string, unknown>;
    /** Optional session-default group shared by related registered types, such as the two shapes. */
    readonly defaultsGroup?: string;
    /**
     * Declares references used when deriving grouping and layer membership.
     * @param element - Current persisted record to inspect without mutation.
     * @returns Referenced IDs; this object follows them into a group when all references
     * are selected (including descendants of selected groups) and it shares the selected objects' parent.
     * An empty array opts out of automatic membership.
     */
    readonly relatedElements?: (element: EditorElementNode) => readonly string[];
    /**
     * Prepares interactive creation geometry within the receiving panel.
     * Document writes still use core validation after this callback returns.
     * @param input - Creation request with merged defaults and complete frame and stacking.
     * @param panel - Receiving panel for resolving local references; do not create elements here.
     * @returns Prepared input to insert through the element manager.
     * @throws To reject a creation request before insertion.
     */
    readonly create?: (input: EditorElementInput, panel: PanelAPI) => EditorElementInput;
  };
  readonly clipboard?: ElementClipboardConverter;
  readonly creation?: {
    /** Accessible toolbar name and tooltip; also visible when no icon is supplied. */
    readonly title: string;
    /** Toolbar icon replacing the visible title on standalone buttons; group layouts may display both icon and title. */
    readonly icon?: ReactNode;
    /** Optional toolbar group ID; omitted entries appear as standalone tools. */
    readonly group?: string;
    /** Ascending tool order within its group or the toolbar; defaults to zero. */
    readonly order?: number;
    /**
     * Creates detached input for one prospective placement. Called on first preview, not per pointer sample;
     * the same input is committed on release. Must not mutate document state or allocate persisted records.
     * Frame width/height set the initial preview size; the placement gesture supplies final geometry.
     */
    readonly create: (reactPanel: ReactPanelApi) => CreateElementInput;
  };
  /** Property panel contents. The surface supplies chrome, panel context, preview and undo lifecycle. */
  readonly properties?: ComponentType<ElementPropertiesProps>;
  /** Property keys reused for subsequent creation in this canvas; content and geometry are opt-in. */
  readonly rememberedProperties?: readonly string[];
}
/** Shared type registrations; unregistering presentation never deletes persisted content. */
export interface ElementTypesApi {
  /** @param registration - Unique persisted type and its presentation. @returns Idempotent cleanup owned by the current extension or editor. @throws For duplicate types, converter conflicts, or a destroyed editor; partial installation is rolled back. */
  register(registration: ReactElementRegistration): () => void;
  /** @param type - Persisted element type. @returns Its installed registration, or undefined when unknown. */
  get(type: string): ReactElementRegistration | undefined;
  /** @returns A detached array of registrations in installation order. */
  getAll(): readonly ReactElementRegistration[];
  /** @param listener - Called after a registration changes. @returns Unsubscribe callback; registration does not call the listener immediately. */
  subscribe(listener: () => void): () => void;
  /** Stable external-store version until a registration is installed or removed. */
  readonly revision: number;
}

/** Panel-bound canvas actions. Document reads, selection and clipboard remain on their existing APIs. */
export interface EdgelessAPI {
  /** Creates a registered element in this panel and selects it; omitted frame fields use (120, 120, 160, 120), and omitted zIndex places it above existing elements. Rejects unknown types and invalid properties. */
  createElement(input: CreateElementInput): EditorElementNode;
  /** Reads this canvas representation’s current tool; gestures and previews remain local and reset when it unmounts. */
  getTool(): EdgelessVisualTool;
  /** Chooses this canvas representation’s local tool; custom element tools must have a registered creation contribution. */
  setTool(tool: EdgelessVisualTool | 'select'): void;
  /** Moves the selected elements by canvas-unit deltas in one history batch. */
  move(dx: number, dy: number): void;
  /** Resizes the selected outer bounds in canvas units, preserving type-specific geometry. */
  resize(width: number, height: number): void;
  /** Groups selected same-level elements and their internal connectors in one transaction. */
  group(): EditorElementNode;
  /** Replaces selected groups with their children without changing canvas geometry. */
  ungroup(): void;
  /** Aligns the selected objects along an edge or center line. */
  align(alignment: EdgelessAlignment): void;
  /** Distributes at least three selected objects across their existing span. */
  distribute(axis: 'horizontal' | 'vertical'): void;
  /** Changes the selected objects' stacking order. */
  reorder(direction: EdgelessReorder): void;
  /** Duplicates the selected subtrees through registered clipboard converters. */
  duplicateSelection(): EditorElementNode[];
}
