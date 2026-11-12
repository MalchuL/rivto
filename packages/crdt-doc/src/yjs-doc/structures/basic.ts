import * as Y from "yjs";
import type { CRDTObserveHandler } from "../../types";
import { YjsUndefinedError } from "../error";

/**
 * Creates a disposer outside the observer callback's lexical scope.
 *
 * Failed removal keeps its references so the caller can retry.
 *
 * @param target - Native shared type owning the observer.
 * @param listener - Exact native observer to remove.
 * @returns A disposer that releases both references after successful removal.
 * @throws If native observer removal fails.
 */
function createDeepObserverDisposer<T extends Y.AbstractType<any>>(
  target: T,
  listener: (events: Y.YEvent<any>[], transaction: Y.Transaction) => void,
): () => void {
  let subscription: [T, typeof listener] | undefined = [target, listener];
  return () => {
    if (subscription) {
      subscription[0].unobserveDeep(subscription[1]);
      subscription = undefined;
    }
  };
}

export abstract class YjsBasic<T extends Y.AbstractType<any>> {
  /**
   * The YJS object.
   */
  private _yjsObj: T;

  /**
   * Creates a new YjsBasic.
   * @param yjsObj - The YJS object to wrap.
   */
  constructor(yjsObj: T) {
    if (yjsObj === undefined || yjsObj === null) {
      throw new YjsUndefinedError("YjsBasic: yjsObj is undefined or null");
    }
    this._yjsObj = yjsObj;
  }

  /**
   * Gets the YJS object.
   * @returns The YJS object.
   */
  protected get yjsObj(): T {
    return this._yjsObj;
  }

  /**
   * Gets the document.
   * @returns The document.
   */
  protected get doc(): Y.Doc | null {
    return this._yjsObj.doc;
  }

  /**
   * Gets the parent.
   * @returns The parent.
   */
  protected get parent(): Y.AbstractType<any> | null {
    const parent = this._yjsObj.parent;
    if (parent instanceof Y.Doc) {
      return null;
    }
    return parent;
  }

  /**
   * Checks if the YjsBasic is attached to a document.
   * @returns True if the YjsBasic is attached to a document, false otherwise.
   */
  protected get isAttached(): boolean {
    return this.doc !== null && this.doc !== undefined;
  }

  /**
   * Sets the YJS object.
   * @param yjsObj - The YJS object to set.
   */
  protected setYjsObj(yjsObj: T): void {
    this._yjsObj = yjsObj;
  }

  /**
   * Observes nested shared-type changes without retaining released subscriptions.
   *
   * The returned function keeps its target and callback until removal succeeds;
   * repeated calls after successful removal do nothing.
   *
   * @param handler - Callback receiving adapter-neutral changes and the transaction.
   * @returns A disposer that removes the observer and releases its references.
   * @throws If native observer registration or removal fails.
   */
  protected observeDeep(handler: CRDTObserveHandler): () => void {
    const listener = (events: Y.YEvent<any>[], transaction: Y.Transaction) =>
      handler(
        events.map((event) => ({
          path: event.path,
          keys: event instanceof Y.YMapEvent ? [...event.keysChanged] : [],
        })),
        transaction,
      );
    const target = this.yjsObj;
    target.observeDeep(listener);
    return createDeepObserverDisposer(target, listener);
  }
}
