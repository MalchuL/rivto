import type { BlockSelectionBindings, BlockSelectionFeature } from "./block-selection-extensions";
import { BlockPointerSelection, type BlockPointerSelectionHost } from "./block-pointer-selection";
import { BlockNativeSelection } from "./block-native-selection";
import { BlockSelectionFeedback } from "./block-selection-feedback";
import type { BlockKeyboardApi } from "../keyboard/block-keyboard";

/** Combined capabilities borrowed by pointer, native and feedback selection. */
interface BlockSelectionHost extends BlockPointerSelectionHost {
  readonly keyboard: Pick<BlockKeyboardApi, "capture" | "isHeld" | "subscribeHeld" | "subscribe">;
}

/** Coordinates independently installed selection features with one pointer owner. */
export class BlockSelectionController {
  private readonly pointer: BlockPointerSelection;
  private readonly native: BlockNativeSelection;
  private readonly feedback: BlockSelectionFeedback;
  private readonly features = new Set<BlockSelectionFeature>();

  /**
   * Creates occurrence-local selection components without installing listeners.
   *
   * @param editor - Borrowed selection, input, pointer ownership and keyboard capabilities.
   * @param bindings - Host semantic action IDs; no default keys are installed.
   */
  constructor(editor: BlockSelectionHost, bindings: BlockSelectionBindings) {
    this.pointer = new BlockPointerSelection(editor, bindings);
    this.native = new BlockNativeSelection(editor.events, editor.adapter.selection, this.pointer);
    this.feedback = new BlockSelectionFeedback(
      editor.events,
      editor.keyboard,
      this.pointer,
      bindings.toggle,
    );
  }

  /**
   * Installs one optional feature into the active extension resource scope.
   *
   * @param feature - Capability to install at most once per occurrence.
   * @returns Disposer releasing feature state before captured native registrations are removed.
   * @throws If already installed or delegated setup fails.
   */
  install(feature: BlockSelectionFeature): () => void {
    if (this.features.has(feature)) {
      throw new Error(`Selection feature ${feature} is already installed`);
    }
    this.features.add(feature);
    let dispose: (() => void) | undefined;
    try {
      if (feature === "native") {
        this.native.install();
      } else if (feature === "feedback") {
        dispose = this.feedback.install();
      } else {
        dispose = this.pointer.install(feature);
      }
    } catch (error) {
      this.features.delete(feature);
      throw error;
    }
    return () => {
      if (this.features.delete(feature)) {
        dispose?.();
      }
    };
  }
}
