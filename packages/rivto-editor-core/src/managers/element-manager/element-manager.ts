import type {
  EditorElement,
  EditorElementInput,
  EditorElementPatch,
  EditorElementUpdate,
} from "../../editor/model";
import type { DocumentModel, ElementInput, ElementUpdate } from "@chulane/document-model";
import type { RivtoEditorApi } from "../../editor/types";
import type { ElementProcessor } from "./element-pipe";
import type { ElementManagerApi } from "../types";
import { Pipe } from "../../utils/pipe";

interface ElementProcessorRegistration {
  readonly processor: ElementProcessor;
  dispose: () => void;
}

/** Public typed manager for generic first-class canvas elements. */
export class ElementManager implements ElementManagerApi {
  /**
   * Editor-owned element processing pipeline.
   *
   * It remains stable across operations on different documents, so extension
   * processors follow this editor without becoming shared document state.
   */
  private readonly pipe = new Pipe<ElementInput>();
  private readonly processors = new Set<ElementProcessorRegistration>();
  private readonly subscriptions = new Set<() => void>();

  constructor(
    private readonly editor: RivtoEditorApi,
  ) {
  }

  /** Registers an editor-owned element processor and returns its disposer. */
  registerProcessor(processor: ElementProcessor): () => void {
    const registration: ElementProcessorRegistration = {
      processor,
      dispose: this.pipe.register(processor),
    };
    this.processors.add(registration);
    return () => {
      if (!this.processors.delete(registration)) return;
      registration.dispose();
    };
  }

  /**
   * Reports whether the document contains one element record.
   *
   * @param id - Stable element ID to inspect.
   * @returns True when the element exists.
   */
  hasElement(id: string): boolean {
    return this.document.elements.hasElement(id);
  }

  /** @param id - Stable element ID. @returns Detached element or undefined. */
  getElement(id: string): EditorElement | undefined {
    return this.document.elements.getElement(id);
  }

  /** @returns Every detached first-class element. */
  getElements(): EditorElement[] {
    return this.document.elements.getElements();
  }

  /** @param listener - Collection-change callback. @returns Its disposer. */
  subscribe(listener: () => void): () => void {
    return this.retainSubscription(this.document.elements.subscribe(listener));
  }

  /** @param id - Element to observe. @param listener - Change callback. @returns Its disposer. */
  subscribeElement(id: string, listener: () => void): () => void {
    return this.retainSubscription(this.document.elements.subscribeElement(id, listener));
  }

  /** @param listener - Membership-change callback. @returns Its disposer. */
  subscribeMembership(listener: () => void): () => void {
    return this.retainSubscription(this.document.elements.subscribeMembership(listener));
  }

  /**
   * Inserts new or existing element data through the editor processing pipeline.
   * Stable IDs are preserved for existing elements and deterministic derived records;
   * the document manager allocates missing identities and checks local collisions.
   * Application managers validate reuse of previously allocated database identities.
   * @param input - Complete element data with an optional stable ID.
   * @returns Complete persisted element after processing and identity validation.
   * @throws If processing, validation, insertion, or application identity reuse fails.
   */
  insertElement(input: EditorElementInput): EditorElement {
    return this.editor.history.batchUpdates(() => this.document.elements.insertElement(this.pipe.process(input)));
  }

  /**
   * Creates the element ID map for a destination import.
   *
   * The explicitly scoped document preserves available IDs and replaces collisions. The
   * returned map lets extensions rewrite group and connector references before
   * inserting elements; it does not insert or reserve IDs itself.
   *
   * @param sourceIds - Stable source element IDs in import order.
   * @returns Destination ID for every source element ID.
   */
  createImportIdMap(sourceIds: readonly string[]): ReadonlyMap<string, string> {
    // Keep generation inside the scoped document. Callers use this map to
    // rewrite group and connector references before inserting the elements.
    return this.document.elements.createImportIdMap(sourceIds);
  }

  /** @param id - Element to patch. @param patch - Geometry, layer, or props changes. @returns Complete persisted element. */
  updateElement(id: string, patch: EditorElementPatch): EditorElement {
    const [update] = this.processUpdates([{ id, patch }]);
    return this.document.elements.updateElement(update!.id, update!.patch);
  }

  /** Applies identified element patches atomically and returns complete elements in input order. */
  updateElements(updates: readonly EditorElementUpdate[]): EditorElement[] {
    return this.editor.history.batchUpdates(() => this.document.elements.updateElements(this.processUpdates(updates)));
  }

  /** Removes one element without implicit cascading. */
  removeElement(id: string): void {
    this.editor.history.batchUpdates(() => this.document.elements.removeElement(id));
  }

  /** Removes identified elements atomically. */
  removeElements(ids: readonly string[]): void {
    this.editor.history.batchUpdates(() => this.document.elements.removeElements(ids));
  }

  /** Releases this manager's subscriptions and processors. */
  destroy(): void {
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
    this.subscriptions.clear();
    this.processors.forEach((registration) => registration.dispose());
    this.processors.clear();
  }

  /**
   * Retains an existing document subscription until explicitly removed or destroyed.
   * Its listener remains bound to the model where the subscription was created.
   * @param unsubscribe - Function that removes the existing document subscription.
   * @returns Function that permanently removes the retained subscription.
   */
  private retainSubscription(unsubscribe: () => void): () => void {
    this.subscriptions.add(unsubscribe);
    return () => {
      if (!this.subscriptions.delete(unsubscribe)) return;
      unsubscribe();
    };
  }

  /** @returns The explicit document or throws outside a document context. */
  private get document(): DocumentModel {
    const document = this.editor.getDocument();
    return document;
  }

  /**
   * Applies editor processors to ordered element patches before document mutation.
   * Duplicate IDs observe earlier processed patches in the batch.
   *
   * @param updates - Ordered portable element patches.
   * @returns Patches containing processor-normalized values.
   */
  private processUpdates(updates: readonly ElementUpdate[]): ElementUpdate[] {
    const simulated = new Map<string, ElementInput>();
    return updates.map(({ id, patch }) => {
      const stored = this.getElement(id);
      if (!stored) throw new Error(`Element ${id} not found`);
      const current = simulated.get(id) ?? stored;
      const processed = this.pipe.process({
        ...current,
        frame: patch.frame ? { ...current.frame, ...patch.frame } : current.frame,
        zIndex: patch.zIndex ?? current.zIndex,
        props: patch.props ? { ...current.props, ...patch.props } : current.props,
      });
      simulated.set(id, processed);
      const frame = patch.frame
        ? Object.fromEntries(Object.keys(patch.frame).map((key) => [key, processed.frame[key as keyof typeof processed.frame]]))
        : undefined;
      const props = patch.props
        ? Object.fromEntries(Object.keys(patch.props).map((key) => [key, processed.props?.[key]]))
        : undefined;
      return {
        id,
        patch: {
          ...patch,
          ...(frame ? { frame } : {}),
          ...(patch.zIndex !== undefined ? { zIndex: processed.zIndex } : {}),
          ...(props ? { props } : {}),
        },
      };
    });
  }

}
