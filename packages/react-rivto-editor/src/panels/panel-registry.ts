import type { RegistrationOwner } from "../managers/extensions/types";
import type { DocumentModel } from "@chulane/document-model";
import type { EditorMode, SelectionManagerApi } from "@chulane/rivto";
import type {
  PanelInputReceiver,
  PanelInputRegistration,
  PanelEventRoute,
  PanelPointerOwnership,
  PanelRoutingRoot,
  PanelSurfaceRoot,
  PanelTargetMatch,
  ReactPanelApi,
  RegisteredPanel,
} from "./types";
import type { BrowserListenerRoot, InputRoot } from "@chulane/rivto-root";
import type { BrowserListenerCapture } from "@chulane/rivto-root";
import { getSurfaceTypeFromAttribute, PANEL_SELECTOR, PANEL_SURFACE_ATTRIBUTE } from "./panel-dom";

/**
 * Tracks mounted document roots and owns focus and event routing between their panels.
 *
 * Each ReactEditor instance owns its own registry; this is not a global registry
 * of every editor on the page. Panels register with the editor supplying their
 * document, independently of where their DOM roots are nested. An embedding of
 * document A inside document B therefore registers with A's editor, alongside
 * any full-document panels of A, rather than with the surrounding editor of B.
 */
export class PanelRegistry {
  private activeRoot: PanelRoutingRoot | null = null;
  private activationRevision = 0;
  private pointerRoot?: object;
  private readonly eventPanels = new WeakMap<object, object | null>();
  private readonly panels = new Map<object, RegisteredPanel>();

  /**
   * Creates the registry that tracks mounted panels and their active selection.
   *
   * @param selection - Shared document selection cleared when the active panel changes.
   * Root subscribers reconnect delegated listeners after roots change.
   * @param extensions - Borrowed destruction guard; registration ownership and teardown remain external.
   */
  constructor(
    private readonly selection: Pick<SelectionManagerApi, "clear">,
    private readonly extensions: Pick<RegistrationOwner, "assertActive">,
  ) {}
  private readonly rootListeners = new Set<() => void>();
  /** Observes root registration changes without observing document edits. */
  subscribeRoots(listener: () => void): () => void {
    this.rootListeners.add(listener);
    return () => {
      this.rootListeners.delete(listener);
    };
  }
  /**
   * Returns the API of the last activated panel registered with this document editor.
   *
   * Activation follows focus, pointer-down, input, or keyboard events routed to a
   * panel. Hover alone does not activate it. The panel remains remembered when
   * focus leaves the editor; this is not a query for the browser's focused element.
   * This method does not fall back to getDefault() or activate another panel.
   *
   * @returns The last activated panel's API, or undefined before activation, after
   * its root is removed, or when that root was registered without an API.
   */
  getActive(): ReactPanelApi | undefined {
    return this.activeRoot ? this.panels.get(this.activeRoot.getElementIdentity())?.api : undefined;
  }
  /**
   * Returns the API of the preferred registered panel without consulting activation history.
   *
   * Uses getDefaultRoot(): the first registered full-document panel takes priority
   * over subtree panels, including embeddings. If no full-document panel exists,
   * the first registered subtree is used. Reading this default does not activate it
   * or change the panel remembered by getActive().
   *
   * @returns The chosen panel's API, or undefined when no root is registered or
   * the chosen root has no API. A missing API does not select a different root.
   */
  getDefault(): ReactPanelApi | undefined {
    const root = this.getDefaultRoot();
    return root ? this.panels.get(root)?.api : undefined;
  }
  /**
   * Returns the input Root of the last activated panel registered with this document editor.
   *
   * Focus, pointer-down, input, and keyboard events can activate a panel; hover
   * alone cannot. The panel remains remembered when browser focus leaves the editor.
   * For example, interacting with an embedding makes its Root active even while
   * getDefaultInputRoot() still prefers a mounted full-document panel.
   *
   * The remembered root belongs to this ReactEditor's registry. It can be an
   * embedding rendered inside another editor's DOM, but it cannot be a panel
   * registered only with that other editor. Activating another editor's panel
   * leaves this registry's last active root remembered rather than replacing it.
   *
   * @returns Its attachment-bound Root, or undefined before activation or once
   * its registration is removed. During synchronous removal, hasActivePanel()
   * can remain true until cleanup completes. No default is applied.
   */
  getActiveInputRoot(): Pick<InputRoot, "isAttached"> | undefined {
    return this.activeRoot
      ? this.panels.get(this.activeRoot.getElementIdentity())?.inputRoot
      : undefined;
  }

  /**
   * Checks whether this registry still remembers an activated panel.
   *
   * During synchronous removal its registration can already be unavailable while
   * the active panel remains remembered until selection cleanup completes.
   *
   * @returns True until the remembered panel is cleared or another panel is activated.
   */
  hasActivePanel(): boolean {
    return this.activeRoot !== null;
  }

  /**
   * Returns the preferred panel's input Root without changing activation history.
   *
   * Full-document registrations take priority over subtree registrations; within
   * each category the first registered panel is preferred.
   *
   * @returns Its attachment-bound Root, or undefined when no panel is registered.
   */
  getDefaultInputRoot(): Pick<InputRoot, "isAttached"> | undefined {
    const root = this.getDefaultRoot();
    return root ? this.panels.get(root)?.inputRoot : undefined;
  }

  /** @returns A new set of all registered input roots, including full-document and subtree panels.
   * Later registrations and removals do not change the returned set. */
  getInputRoots(): ReadonlySet<BrowserListenerRoot> {
    return new Set([...this.panels.values()].map((panel) => panel.inputRoot));
  }

  /** @returns Whether mounted document panels need focus and pointer lifecycle listeners. */
  get hasPanels(): boolean {
    return this.panels.size > 0;
  }

  /**
   * Reads the current panel's rendered surface without changing the core mode.
   *
   * The core mode manager belongs to the document and chooses its main presentation.
   * This method reads the receiving occurrence instead: a page embedding
   * returns `block` even inside an `edgeless` document. Scoped event managers use
   * their own panel root; a call without a root uses the active root,
   * falling back to the first full-document panel or first subtree. No additional mode state is stored, and the core mode remains shared.
   * Dispatch captures this value once in `event.mode`; handlers use that snapshot.
   * Panel-specific commands outside dispatch can call this method, while operations
   * that depend on document mode should use `reactEditor.mode.get()`.
   * @param root - Root to inspect; omitted to choose the active or default panel.
   * Explicit null does not choose another panel. A detached Root is not resolved
   * through a replacement registration, even when it represents the same element.
   * @param registration - Captured routing lifetime when reading for an earlier input.
   * @returns The surface kind, the registered panel's mode when its marker is
   * unrecognized, or `block` when no active registration provides a mode.
   * @throws Propagates Root ownership and browser attribute-read failures.
   */
  getSurfaceType(
    root?: PanelSurfaceRoot | null,
    registration?: PanelInputRegistration,
  ): EditorMode {
    if (root === undefined) {
      const identity = this.activeRoot?.getElementIdentity() ?? this.getDefaultRoot();
      const selectedRoot = identity ? this.panels.get(identity)?.inputRoot : undefined;
      if (!selectedRoot && this.activeRoot?.isAttached()) {
        // Removal observers still see the focused occurrence until focus is restored.
        const active = this.activeRoot;
        const surface = getSurfaceTypeFromAttribute(active.readAttribute(PANEL_SURFACE_ATTRIBUTE));
        return active === this.activeRoot && active.isAttached() ? (surface ?? "block") : "block";
      }
      return this.getSurfaceType(selectedRoot ?? null);
    }
    if (!root || (registration && !registration.isCurrent(root))) {
      return "block";
    }
    const identity = root.getElementIdentity?.();
    const entry = identity && this.panels.get(identity);
    if (!entry || !entry.inputRegistration.isCurrent(root)) {
      return "block";
    }
    const surface = getSurfaceTypeFromAttribute(root.readAttribute(PANEL_SURFACE_ATTRIBUTE));
    if (!entry.inputRegistration.isCurrent(root)) {
      return "block";
    }
    const mode = surface ?? entry.api?.mode.get();
    return entry.inputRegistration.isCurrent(root) ? (mode ?? "block") : "block";
  }

  /**
   * Registers one document occurrence and connects shared delegated listeners to its root.
   * @param root - Attached occurrence displaying the full document or source subtree.
   * @param document - Source model used for commands within this region.
   * @param rootBlockId - Displayed source root bounding selection and navigation.
   * @param api - Panel-bound API supplied to handlers; omitted only for a region that must not dispatch editing handlers.
   * @param cancelSelection - Cancels pending DOM selection work before removing the root.
   * @param receiveInput - Receives the routing lifetime before listeners are notified. It becomes current when installed.
   * @param deactivate - Closes this panel's transient UI when it loses focus or is removed.
   * @returns Idempotent cleanup that clears selection when a focused subtree is removed
   * and returns keyboard focus to an enclosing mounted surface, retaining source undo.
   * Full-document surface changes preserve selection when switching presentation modes.
   * The cleanup attempts routing notification, deactivation, and focus restoration
   * even when an earlier cleanup fails; multiple failures are aggregated.
   * @throws If the Root is detached, capability delivery or registration notification fails, or AggregateError if rollback notification also fails.
   */
  registerPanel(
    root: PanelRoutingRoot,
    document: DocumentModel,
    rootBlockId?: string,
    api?: ReactPanelApi,
    deactivate?: () => void,
    cancelSelection?: () => void,
    receiveInput?: PanelInputReceiver,
  ): () => void {
    this.extensions.assertActive();
    if (!root.isAttached()) {
      throw new Error("Cannot register a detached input root");
    }
    const identity = root.getElementIdentity();
    const inputRegistration = {
      /**
       * Checks the registration after the mounted occurrence's attachment check.
       *
       * @param candidate - Optional Root that must belong to this registration.
       * @returns True only while this exact entry remains current and attached and the Root matches.
       * @throws Propagates occurrence attachment-check failures.
       */
      isCurrent: (candidate?: Pick<InputRoot, "isAttached">) =>
        (!candidate || candidate === root) &&
        this.panels.get(identity) === entry &&
        root.isAttached() &&
        this.panels.get(identity) === entry,
    };
    const entry: RegisteredPanel = {
      document,
      rootBlockId,
      api,
      deactivate,
      cancelSelection,
      inputRoot: root,
      inputRegistration,
    };
    receiveInput?.(inputRegistration);
    this.installPanel(identity, entry);
    return () => this.removePanel(identity, entry);
  }

  /**
   * Chooses the receiving panel, retaining the origin of a continuing pointer gesture.
   * Hover routes without changing editing focus. Focus, input, and keyboard events
   * activate their panel and deactivate the previous occurrence's transient UI.
   * @param type - Normalized browser input name.
   * @param rootIdentity - Opaque surface identity; omitted for document/window listeners.
   * @param capture - Root-owned normalization for target routing.
   * @param identity - Opaque identity shared by the current dispatch's listener groups.
   * @param control - Root-owned pointer ownership for this browser delivery.
   * @returns Borrowed receiving registration, or undefined when another editor or surface owns the event,
   * or when a synchronous callback supersedes activation or replaces the receiving registration.
   * @throws Propagates target normalization and occurrence ownership failures.
   */
  resolveEventPanel(
    type: string,
    rootIdentity: object | undefined,
    capture: BrowserListenerCapture,
    identity: object,
    control: PanelPointerOwnership,
  ): PanelEventRoute | undefined {
    const fallback = this.activeRoot?.getElementIdentity() ?? this.getDefaultRoot();
    if (!fallback) {
      return;
    }
    const targetPanel = this.resolveTargetPanel(fallback, capture);
    if (!targetPanel) {
      return;
    }
    const activatesPanel =
      type === "focusin" || type === "pointerdown" || type === "input" || type === "keydown";
    const continuation = type === "pointermove" || type === "pointerup" || type === "pointercancel";
    const gestureOwner = continuation ? control.getPointerOwner() : undefined;
    if (gestureOwner) {
      if (!this.panels.has(gestureOwner)) {
        return;
      }
    }
    if (this.isForeignEventPanel(targetPanel, activatesPanel)) {
      return;
    }
    const chosen = this.chooseEventPanel(
      type,
      targetPanel.candidate,
      continuation,
      identity,
      control,
    );
    const root = chosen ?? fallback;
    if (rootIdentity && this.panels.get(root)?.inputRoot.getElementIdentity() !== rootIdentity) {
      return;
    }
    const changed = chosen !== (this.activeRoot?.getElementIdentity() ?? null);
    // Hover belongs to the pointed panel's handlers without taking editing focus
    // or clearing the selection in the panel where the user is working.
    if (changed && activatesPanel && !this.activateEventPanel(chosen, root)) {
      return;
    }
    return this.panels.get(root);
  }

  /** Cancels mounted panels' DOM work before shared extension cleanup begins. */
  cancelPendingSelections(): void {
    const errors: unknown[] = [];
    for (const { cancelSelection } of this.panels.values()) {
      try {
        cancelSelection?.();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length) {
      throw new AggregateError(errors, "View selection cleanup failed");
    }
  }

  /** Releases mounted roots and pointer ownership during runtime teardown. */
  destroy(): void {
    this.activeRoot = null;
    if (this.pointerRoot) {
      this.panels.get(this.pointerRoot)?.inputRoot.releasePointerOwnership();
    }
    this.panels.clear();
    this.rootListeners.clear();
    this.pointerRoot = undefined;
  }

  /**
   * Activates a routed panel unless synchronous callbacks replace its routing state.
   *
   * A nested activation takes precedence over the older event. The previous and
   * destination registrations must remain current through deactivation and selection clearing.
   *
   * @param chosen - Chosen panel identity, or null when no panel was selected.
   * @param root - Receiving registration identity, including the default fallback.
   * @returns False when a callback superseded this activation; otherwise true.
   * @throws Propagates deactivation and selection cleanup failures.
   */
  private activateEventPanel(chosen: object | null, root: object): boolean {
    const activation = ++this.activationRevision;
    const previous = this.activeRoot;
    const destination = this.panels.get(root);
    if (previous) {
      this.panels.get(previous.getElementIdentity())?.deactivate?.();
      if (
        this.activationRevision !== activation ||
        this.activeRoot !== previous ||
        this.panels.get(root) !== destination
      ) {
        return false;
      }
      this.selection.clear();
      if (
        this.activationRevision !== activation ||
        this.activeRoot !== previous ||
        this.panels.get(root) !== destination
      ) {
        return false;
      }
    }
    this.activeRoot = chosen ? (destination?.inputRoot ?? null) : null;
    return true;
  }

  /**
   * Finds the nearest panel boundary for input without exposing its target to routing.
   *
   * Selection changes use Root's captured selection anchor; other events use the
   * normalized event target. Both compare opaque target and root capabilities.
   *
   * @param fallback - Registered panel supplying the browser realm for normalization.
   * @param capture - Root normalizer for this delivery.
   * @returns Boundary information when normalization succeeds, or undefined for a stale registration.
   * @throws Propagates normalization, selector, and attachment failures.
   */
  private resolveTargetPanel(
    fallback: object,
    capture: BrowserListenerCapture,
  ): PanelTargetMatch | undefined {
    const registration = this.panels.get(fallback);
    if (!registration) {
      return undefined;
    }
    const input = capture(registration.inputRoot);
    if (!input) {
      return undefined;
    }
    const target = "selectionTarget" in input ? input.selectionTarget : input.target;
    const identity = target?.getNearestAncestorIdentity?.(PANEL_SELECTOR);
    if (!identity) {
      return { hasBoundary: false };
    }
    if (this.panels.get(identity)?.inputRoot.isAttached()) {
      return { hasBoundary: true, candidate: identity };
    }
    return { hasBoundary: true };
  }

  /**
   * Releases one registration without affecting a replacement on the same element.
   *
   * @param identity - Opaque identity of the surface originally registered by this entry.
   * @param entry - Exact registration being released.
   * @returns The registration and its local interaction state have been released when still current.
   * @throws Propagates a cleanup failure, or AggregateError when multiple cleanup operations fail.
   */
  private removePanel(identity: object, entry: RegisteredPanel): void {
    if (this.panels.get(identity) !== entry) {
      return;
    }
    const errors: unknown[] = [];
    /**
     * Attempts a cleanup without preventing later panel resources from being released.
     *
     * @param cleanup - Exact cleanup operation to attempt.
     * @returns Its failure is retained for reporting after the remaining cleanups.
     */
    const attempt = (cleanup: () => void) => {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    };
    this.panels.delete(identity);
    // Selection cleanup can register a replacement and start a new gesture on the same surface.
    if (this.pointerRoot === identity) {
      this.pointerRoot = undefined;
      attempt(() => entry.inputRoot.releasePointerOwnership());
    }
    attempt(() => entry.cancelSelection?.());
    attempt(() => this.notifyRootsChanged());
    attempt(() => entry.deactivate?.());
    if (this.activeRoot === entry.inputRoot && !this.panels.has(identity)) {
      this.activeRoot = null;
      // Retain source undo while the target is missing; the next panel interaction chooses its own history again.
      // Replacing a full-document surface (page/canvas) keeps core selection.
      // Removing the active embedded subtree releases its occurrence's selection.
      if (entry.rootBlockId !== undefined) {
        attempt(() => this.selection.clear());
      }
      attempt(() => this.focusParentPanel(entry.inputRoot));
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Panel removal cleanup failed");
    }
  }

  /**
   * Returns focus to a registered enclosing panel when the removed surface held it.
   *
   * @param occurrence - Removed occurrence whose browser focus is inspected.
   * @returns Its registered parent is focused when one exists and focus was inside.
   * @throws Propagates browser focus and parent lookup failures.
   */
  private focusParentPanel(occurrence: PanelRoutingRoot): void {
    if (!occurrence.hasFocus()) {
      return;
    }
    const parentIdentity = occurrence.getParentIdentity(PANEL_SELECTOR);
    if (parentIdentity) {
      this.panels.get(parentIdentity)?.inputRoot.focus();
    }
  }

  /**
   * Installs a registration and reconciles subscribers before releasing its predecessor.
   *
   * If notification fails, the new capability is invalidated and the previous
   * registration is restored when no reentrant replacement superseded it.
   * Subscribers are notified again to reconcile listeners with the restored set.
   *
   * @param root - Surface receiving the registration.
   * @param entry - New registration borrowing the mounted browser Root.
   * @returns The registration is installed and its predecessor can no longer route input.
   * @throws The notification failure, or AggregateError if rollback notification also fails.
   */
  private installPanel(root: object, entry: RegisteredPanel): void {
    const previous = this.panels.get(root);
    this.panels.set(root, entry);
    try {
      this.notifyRootsChanged();
    } catch (error) {
      if (this.panels.get(root) !== entry) {
        throw error;
      }
      if (previous) {
        this.panels.set(root, previous);
      } else {
        this.panels.delete(root);
      }
      try {
        this.notifyRootsChanged();
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "Panel registration rollback failed");
      }
      throw error;
    }
    if (this.panels.get(root) === entry && this.activeRoot?.getElementIdentity() === root) {
      this.activeRoot = entry.inputRoot;
    }
  }
  /**
   * Notifies subscribers that the set of mounted panel roots changed.
   *
   * @returns Every current subscriber has been offered the notification.
   * @throws Propagates one listener failure or aggregates multiple listener failures.
   */
  private notifyRootsChanged(): void {
    const errors: unknown[] = [];
    this.rootListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        errors.push(error);
      }
    });
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Panel root notification failed");
    }
  }

  /**
   * Chooses a registered DOM root by panel scope and registration order, independently of interaction.
   *
   * Prefers the first full-document panel (registered without rootBlockId), even
   * if an embedding registered earlier. When only subtree panels are mounted,
   * uses the first of those. The choice is recomputed from current registrations;
   * it neither reads nor changes the last activated root or browser focus.
   *
   * @returns The first registered full-document root, otherwise the first registered
   * subtree root, or null when no panels are registered.
   */
  private getDefaultRoot(): object | null {
    // Child refs mount first. Prefer the full document over an embedding until
    // an interaction explicitly activates one of its subtree occurrences.
    for (const [root, panel] of this.panels) {
      if (panel.rootBlockId === undefined) {
        return root;
      }
    }
    return this.panels.keys().next().value ?? null;
  }

  /**
   * Rejects a foreign panel while preserving the last local selection and occurrence.
   *
   * A nested editor owns its nearest panel even for capture listeners. A foreign
   * boundary must not become the active root, including when nested inside one of
   * this editor's panels. Returning to the last occurrence can extend its selection.
   *
   * @param target - Nearest panel boundary and any locally registered candidate.
   * @param activatesPanel - Whether this input activates its receiving panel.
   * @returns True when the foreign panel owns this input and no local gesture is active.
   * @throws Propagates a local panel's deactivation failure.
   */
  private isForeignEventPanel(target: PanelTargetMatch, activatesPanel: boolean): boolean {
    if (!target.hasBoundary || target.candidate || this.pointerRoot) {
      return false;
    }
    if (activatesPanel && this.activeRoot) {
      this.panels.get(this.activeRoot.getElementIdentity())?.deactivate?.();
    }
    return true;
  }

  /**
   * Reuses the dispatch's chosen panel and updates pointer ownership on first delivery.
   *
   * @param type - Browser input name for the current listener group.
   * @param candidate - Locally registered panel containing the current target, when present.
   * @param pointerContinuation - Whether the input continues an existing pointer gesture.
   * @param identity - Opaque identity shared by the current dispatch's listener groups.
   * @param control - Root-owned pointer ownership for this delivery.
   * @returns The chosen local surface, or null when no panel is active.
   * @throws Propagates pointer ownership failures.
   */
  private chooseEventPanel(
    type: string,
    candidate: object | undefined,
    pointerContinuation: boolean,
    identity: object,
    control: PanelPointerOwnership,
  ): object | null {
    if (this.eventPanels.has(identity)) {
      return this.eventPanels.get(identity) ?? null;
    }
    let chosen: object | null = this.activeRoot?.getElementIdentity() ?? null;
    if (pointerContinuation && this.pointerRoot && this.panels.has(this.pointerRoot)) {
      chosen = this.pointerRoot;
    } else if (candidate) {
      chosen = candidate;
    }
    this.eventPanels.set(identity, chosen);
    if (type === "pointerdown" && chosen) {
      this.pointerRoot = chosen;
      const owner = this.panels.get(chosen)?.inputRoot;
      if (owner) {
        control.claimPointerOwner(owner.getElementIdentity());
      }
    }
    if (type === "pointerup" || type === "pointercancel") {
      this.pointerRoot = undefined;
      control.releasePointerOwner();
    }
    return chosen;
  }
}
