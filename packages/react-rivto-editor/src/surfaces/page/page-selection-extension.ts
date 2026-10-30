import type {
  BlockEditorApi,
  BlockEditorExtension,
  BlockSelectionExtensions,
  BlockSelectionFeature,
} from "@chulane/rivto-page";
import type { KeyboardApi } from "../../managers/keyboard/keyboard-api";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../managers/keyboard/keymap";

/** Host gesture identities shared by the occurrence's independently removable features. */
export const PAGE_SELECTION_BINDINGS = {
  toggle: KEYBOARD_BINDING_IDS.blockSelectionModifierDown,
  range: "selection.range-modifier",
  exact: "selection.exact-modifier",
};

/** Existing host extension boundaries, each owning its corresponding Page capabilities. */
export type PageSelectionKind = "text" | "block";

/** Features corresponding to the host's existing optional extension groups. */
const SELECTION_FEATURES: Record<PageSelectionKind, readonly BlockSelectionFeature[]> = {
  text: ["native", "click", "range", "pointer"],
  block: ["toggle", "feedback"],
};

/** Installs one host feature group through Page's resource-owning extension lifecycle. */
export class PageSelectionExtension implements BlockEditorExtension {
  private readonly releases: Array<() => void> = [];
  private keyboard: Pick<BlockEditorApi["keyboard"], "register"> | undefined;
  private releaseBinding: (() => void) | undefined;
  private previousKeys: readonly string[] | undefined;

  /**
   * Borrows the panel's shared feature coordinator and the host's live shortcut inventory.
   *
   * A new installation belongs to one mounted surface wrapper. Page owns native
   * registrations; this instance owns feature state releases and the host subscription.
   *
   * @param features - Occurrence-local coordinator shared by text and block groups.
   * @param hostKeyboard - Shared effective shortcuts, without mutation or lifecycle access.
   * @param kind - Existing host extension group whose capabilities are being installed.
   */
  constructor(
    private readonly features: Pick<BlockSelectionExtensions, "feature">,
    private readonly hostKeyboard: Pick<KeyboardApi, "list" | "subscribe">,
    private readonly kind: PageSelectionKind,
  ) {}

  /**
   * Installs semantic modifiers and coordinated features in the current Page resource scope.
   *
   * @param editor - Page registration and keyboard capabilities borrowed during setup.
   * @returns Cleanup releasing feature state and host observers before Page removes native registrations.
   * @throws Rolls back installed features when a later feature or subscription fails.
   */
  setup(editor: BlockEditorApi): () => void {
    try {
      this.installBindings(editor.keyboard);
      for (const feature of SELECTION_FEATURES[this.kind]) {
        const release = this.features.feature(feature).setup(editor);
        if (release) {
          this.releases.push(release);
        }
      }
      return this.release;
    } catch (error) {
      try {
        this.release();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Page selection setup and cleanup failed");
      }
      throw error;
    }
  }

  /**
   * Registers modifier semantics without consuming native key events used by host commands.
   *
   * @param keyboard - Page registration capability; its returned disposers support teardown.
   * @returns Group bindings are installed, including live host toggle-key overrides.
   */
  private installBindings(keyboard: Pick<BlockEditorApi["keyboard"], "register">): void {
    if (this.kind === "text") {
      keyboard.register({ id: PAGE_SELECTION_BINDINGS.range, keys: "Shift" }, this.observeModifier);
      keyboard.register(
        { id: PAGE_SELECTION_BINDINGS.exact, keys: "Shift+Alt" },
        this.observeModifier,
      );
      return;
    }
    this.keyboard = keyboard;
    this.releases.push(() => this.releaseBinding?.());
    this.releases.push(this.hostKeyboard.subscribe(this.syncToggleKeys));
    this.syncToggleKeys();
  }

  /**
   * Reconciles only effective toggle keys when the shared host inventory changes.
   *
   * @returns Page captures the latest host override at the next gesture start.
   */
  private readonly syncToggleKeys = (): void => {
    const keys =
      this.hostKeyboard.list().find(({ id }) => id === PAGE_SELECTION_BINDINGS.toggle)?.keys ??
      BUILTIN_KEYMAP[PAGE_SELECTION_BINDINGS.toggle]!;
    const previous = this.previousKeys;
    if (
      previous &&
      previous.length === keys.length &&
      previous.every((key, index) => key === keys[index])
    ) {
      return;
    }
    this.previousKeys = keys;
    this.releaseBinding?.();
    this.releaseBinding = this.keyboard?.register(
      { id: PAGE_SELECTION_BINDINGS.toggle, keys },
      this.observeModifier,
    );
  };

  /**
   * Leaves modifier delivery available to host keyboard commands and browser defaults.
   *
   * @returns False because these bindings describe held gesture state, not a key command.
   */
  private readonly observeModifier = (): boolean => false;

  /**
   * Cancels each installed feature and disconnects live host inventory observation.
   *
   * @returns All owned releases have been attempted; repeated cleanup does nothing.
   * @throws Aggregates failures after every retained release has been attempted.
   */
  private readonly release = (): void => {
    const errors: unknown[] = [];
    for (const release of this.releases.splice(0).reverse()) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    this.keyboard = undefined;
    this.releaseBinding = undefined;
    this.previousKeys = undefined;
    if (errors.length) {
      throw new AggregateError(errors, "Page selection cleanup failed");
    }
  };
}
