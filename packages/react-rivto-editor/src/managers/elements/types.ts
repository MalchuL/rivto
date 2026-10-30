import type { RememberedElementProperties } from "./creation-defaults-types";
import type { EdgelessOperations } from "./edgeless-operations";
import type { EditableLabelFocusPoint } from "../../components";
import type { ComponentType, ReactNode, RefObject } from "react";
import type {
  PanelAPI,
  ElementDefinition,
  EditorElementInput,
  EditorElementNode,
} from "@chulane/rivto";
import type { EdgelessAlignment, EdgelessReorder } from "../../elements/visuals/types";
import type { ReactPanelApi } from "../../panels/types";
import type { ElementClipboardConverter } from "../clipboard/types";

/** Interactive element input; omitted stacking places the element above the panel's current elements. */
export type CreateElementInput = Omit<EditorElementInput, "zIndex"> & { readonly zIndex?: number };

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
  /** Receiving mounted panel; do not retain it after this occurrence unmounts. */
  readonly reactPanel: ReactPanelApi;
  /** Canvas operations shared with toolbar and property editors; never construct a second instance. */
  readonly operations: EdgelessOperations;
  /** Current viewport scale factor: 1 is 100%; geometry remains in canvas units. */
  readonly zoom: number;
  /** Whether this persisted occurrence is selected; always false for creation previews. */
  readonly selected: boolean;
  /** Local label editing state, enabled by behavior.editableLabel. */
  readonly editing: boolean;
  /** Requests local label editing; creation previews supply a no-op callback. */
  readonly setEditing: (editing: boolean) => void;
  /** Pending label focus position shared with the host; previews leave it null. */
  readonly focusPointRef: RefObject<EditableLabelFocusPoint | null>;
}
/** Props for same-type property contents; the shared sidebar owns preview, commit, cancel and history. */
export interface ElementPropertiesProps {
  /** Selected records of one registered type, including local previews; treat nested props as read-only. */
  readonly elements: readonly EditorElementNode[];
  /** Receiving mounted panel; do not retain it after this occurrence unmounts. */
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
  /** Persisted type, defaults and validation installed into the core element registry. */
  readonly definition: ElementDefinition;
  /** Content renderer used both for persisted occurrences and detached creation previews. */
  readonly render: ComponentType<ElementRenderProps>;
  /** Human-readable title used by the shared property panel. Defaults to the persisted type. */
  readonly title?: string;
  /** Optional interaction and creation policies; resize overrides definition.resize when supplied. */
  readonly behavior?: Pick<ElementDefinition, "resize"> & {
    /** Enables the common double-click label editing lifecycle for this renderer. */
    readonly editableLabel?: boolean;
    /** Uses an axis-aligned host for world-space geometry and disables ordinary resize/rotate controls; the renderer supplies its own geometry controls. */
    readonly absoluteGeometry?: boolean;
    /**
     * Derives creation defaults before explicit properties are applied.
     * @param defaults - Detached definition defaults merged with remembered type values and shared group settings.
     * @param input - Creation request with complete frame and stacking; treat it as read-only.
     * @returns Effective defaults derived from the merged session; explicit input properties are applied afterward.
     */
    readonly creationDefaults?: (
      defaults: Readonly<Record<string, unknown>>,
      input: EditorElementInput,
    ) => Record<string, unknown>;
    /** Optional defaults-group registration shared by related types; falls back to creation.group. The group explicitly declares remembered fields independently of its visible controls. */
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
     * Also runs while rendering detached creation previews. Keep it pure and repeatable:
     * do not allocate persisted records, mutate the document, or modify the supplied input.
     * @param input - Creation request with merged defaults and complete frame and stacking.
     * @param panel - Receiving panel for resolving local references; do not create elements here.
     * @returns Prepared input to insert through the element manager.
     * @throws To reject a creation request before insertion.
     */
    readonly create?: (input: EditorElementInput, panel: PanelAPI) => EditorElementInput;
  };
  /** Optional converter installed for this type and removed with this registration. Conflicts reject installation. */
  readonly clipboard?: ElementClipboardConverter;
  /**
   * Optional placement tool registered as `element:${definition.type}` in edgelessToolbar.
   * Omit when tools are registered separately or this type has no interactive creation tool.
   * Registration does not create the referenced toolbar group.
   */
  readonly creation?: {
    /** Accessible toolbar name and tooltip; also visible when no icon is supplied. */
    readonly title: string;
    /** Toolbar icon replacing the visible title on standalone buttons; group layouts may display both icon and title. */
    readonly icon?: ReactNode;
    /** Optional toolbar group ID; omitted entries appear as standalone tools. Unknown groups hide the tool until installed. */
    readonly group?: string;
    /** Ascending tool order within its group or the toolbar; defaults to zero. */
    readonly order?: number;
    /**
     * Creates detached input for one prospective placement. Called on first preview, not per pointer sample;
     * the same input is committed on release. Must not mutate document state or allocate persisted records.
     * Frame width/height set the initial preview fallback; remembered dimensions override it,
     * and the placement gesture supplies final geometry.
     * @param reactPanel - Receiving mounted panel, for reading creation context without document writes.
     * @returns Detached creation request; final placement prepares defaults and validates before insertion.
     * @throws To reject preparing a placement; no element has been inserted by this factory.
     */
    readonly create: (reactPanel: ReactPanelApi) => CreateElementInput;
  };
  /** Property panel contents. The surface supplies chrome, panel context, preview and undo lifecycle. */
  readonly properties?: ComponentType<ElementPropertiesProps>;
  /** Property keys reused for subsequent creation in this canvas; content and geometry are opt-in. Values are remembered after property commits, not during previews, and reset when the owning edgeless surface unmounts. */
  readonly rememberedProperties?: RememberedElementProperties;
}
/** Shared type registrations; unregistering presentation never deletes persisted content. */
export interface ElementTypesApi {
  /**
   * Installs the definition, renderer and optional toolbar/clipboard contributions atomically.
   *
   * @param registration - Unique persisted type and its presentation.
   * @returns Idempotent cleanup owned by the current extension or editor.
   * @throws For duplicate types, creation-tool IDs, converter conflicts, or a destroyed editor; partial installation is rolled back.
   */
  register(registration: ReactElementRegistration): () => void;
  /**
   * Looks up a shared registration without copying it; callers must treat it as read-only.
   *
   * @param type - Persisted element type.
   * @returns Its installed registration, or undefined when unknown.
   */
  get(type: string): ReactElementRegistration | undefined;
  /**
   * Lists installed registrations; the array is detached but its registration objects are shared.
   *
   * @returns A detached array of registrations in installation order.
   */
  getAll(): readonly ReactElementRegistration[];
  /**
   * Observes synchronous registration additions and removals.
   *
   * @param listener - Called after a registration changes.
   * @returns Unsubscribe callback; registration does not call the listener immediately.
   */
  subscribe(listener: () => void): () => void;
  /** Stable external-store version until a registration is installed or removed. */
  readonly revision: number;
}

/** Panel-bound canvas actions. Document reads, selection and clipboard remain on their existing APIs. */
export interface EdgelessAPI {
  /**
   * Creates a registered canvas element in this panel and selects it.
   *
   * Registered defaults and remembered session values are copied before explicit properties.
   * A registration may derive defaults (for example, when an explicit drawing brush
   * differs from the current brush), then prepare geometry without mutating the input.
   * Custom types retain opaque property values, including null and nested content.
   *
   * @param input - Persisted type and initial fields; missing frame fields use x=120, y=120, width=160, height=120
   * in canvas units. Omitted zIndex places the element above current panel elements.
   * @returns Complete created node. The new ID replaces the active selection.
   * @throws If the type is not registered, geometry is not finite and positive, or its definition rejects the input.
   */
  createElement(input: CreateElementInput): EditorElementNode;

  /**
   * Moves the complete active selection by a canvas delta.
   *
   * Group descendants are translated once in one history batch.
   *
   * @param dx - Finite horizontal delta in canvas units.
   * @param dy - Finite vertical delta in canvas units.
   * @throws If either delta is not finite.
   */
  move(dx: number, dy: number): void;
  /**
   * Scales the active selection to an exact outer size.
   *
   * Group leaves scale around the selection bounds in one history batch. Missing
   * bounds, nonpositive sizes, and degenerate selection bounds cause no change.
   *
   * @param width - Requested selection width in canvas units.
   * @param height - Requested selection height in canvas units.
   */
  resize(width: number, height: number): void;
  /**
   * Creates an empty group element around the selected siblings and internal connectors.
   *
   * Children retain their IDs, original sibling order, and canvas-relative frames.
   * The parent occupies the first selected sibling's position. Its initial frame
   * covers the selection; displayed bounds are derived from the children afterward
   * in the group's props.rotation axes (zero when absent), without persisting
   * those derived dimensions or changing the angle when a child moves.
   * Group membership is derived by these panel-bound operations; the model stores an ordinary parent.
   * All writes use the editor processing pipeline within one history transaction.
   *
   * @returns Detached flat parent record with its final ordered childIds.
   * @throws If fewer than two distinct existing elements are selected, parents
   * differ, or the new record fails processing or validation before insertion.
   */
  group(): EditorElementNode;
  /**
   * Replaces selected groups with their children and removes their records.
   *
   * Children retain IDs, order, and canvas coordinates. Changes share one history
   * batch; the resulting children replace the active selection. Non-group IDs are ignored.
   */
  ungroup(): void;
  /**
   * Aligns selected top-level elements without changing sizes.
   *
   * Group leaves move together in one history batch. Fewer than two targets with
   * usable bounds cause no change.
   *
   * @param alignment - Edge or center of the selection bounds to align against.
   */
  align(alignment: EdgelessAlignment): void;
  /**
   * Distributes three or more selected elements across their current outer span.
   *
   * Equal gaps are computed along the current outer span, which may produce
   * negative gaps for overlapping targets. Changes share one history batch.
   *
   * @param axis - Canvas axis along which elements are sorted and spaced.
   */
  distribute(axis: "horizontal" | "vertical"): void;
  /**
   * Reorders selected leaves in the shared element layer.
   *
   * Groups expand to leaves and internal connectors. Relative layer order within
   * the moved selection is preserved; sequential stacking values are written together.
   *
   * @param direction - Move to an extreme layer or one step relative to stationary elements.
   */
  reorder(direction: EdgelessReorder): void;
  /**
   * Duplicates the active selection through the clipboard copy/paste pipeline.
   *
   * The clipboard pipeline allocates new identities and updates the selection.
   * @returns Complete top-level elements created from the active selection, or an empty array for an empty selection.
   */
  duplicateSelection(): EditorElementNode[];
}
