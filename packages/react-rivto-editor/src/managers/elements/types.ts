import type { ComponentType, ReactNode } from 'react';
import type { PanelAPI, ElementDefinition, EditorElementInput, EditorElementNode } from '@chulane/rivto';
import type { ReactPanelApi } from '../../panels/types';
import type { ElementClipboardConverter } from '../clipboard/types';

/** Interactive element input; omitted stacking places the element above the panel's current elements. */
export type CreateElementInput = Omit<EditorElementInput, 'zIndex'> & { readonly zIndex?: number };

/** Props for registered element content; the surface owns position, DOM identity and selection. */
export interface ElementRenderProps {
  readonly element: EditorElementNode;
  readonly reactPanel: ReactPanelApi;
}
/** Props for a single-type property editor; updates should use reactPanel.elements in one history batch. */
export interface ElementPropertiesProps {
  readonly elements: readonly EditorElementNode[];
  readonly reactPanel: ReactPanelApi;
}
/** Atomic installation of an element definition, renderer and optional editing contributions. */
export interface ReactElementRegistration {
  readonly definition: ElementDefinition;
  readonly render: ComponentType<ElementRenderProps>;
  readonly behavior?: Pick<ElementDefinition, 'resize'> & {
    /** Prepares interactive creation geometry within the receiving panel; document writes still use core validation. */
    readonly create?: (input: EditorElementInput, panel: PanelAPI) => EditorElementInput;
  };
  readonly clipboard?: ElementClipboardConverter;
  readonly creation?: {
    readonly title: string;
    readonly icon?: ReactNode;
    /** Creates input for the registered type; the generic placement tool supplies the final frame. */
    readonly create: (reactPanel: ReactPanelApi) => CreateElementInput;
  };
  readonly properties?: ComponentType<ElementPropertiesProps>;
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
  getTool(): import('../../extensions/edgeless/visuals/types').EdgelessVisualTool;
  /** Chooses this canvas representation’s local tool; custom element tools must have a registered creation contribution. */
  setTool(tool: import('../../extensions/edgeless/visuals/types').EdgelessVisualTool | 'select'): void;
  /** Moves the selected elements by canvas-unit deltas in one history batch. */
  move(dx: number, dy: number): void;
  /** Resizes the selected outer bounds in canvas units, preserving type-specific geometry. */
  resize(width: number, height: number): void;
  /** Groups selected same-level elements and their internal connectors in one transaction. */
  group(): EditorElementNode;
  /** Replaces selected groups with their children without changing canvas geometry. */
  ungroup(): void;
  /** Aligns the selected objects along an edge or center line. */
  align(alignment: import('../../extensions/edgeless/visuals/types').EdgelessAlignment): void;
  /** Distributes at least three selected objects across their existing span. */
  distribute(axis: 'horizontal' | 'vertical'): void;
  /** Changes the selected objects' stacking order. */
  reorder(direction: import('../../extensions/edgeless/visuals/types').EdgelessReorder): void;
  /** Duplicates the selected subtrees through registered clipboard converters. */
  duplicateSelection(): EditorElementNode[];
}
