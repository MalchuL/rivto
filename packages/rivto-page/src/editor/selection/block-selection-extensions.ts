import type { BlockSelectionBindings, BlockSelectionFeature } from "./types";
import type { BlockEditorApi } from "../types";
import type { BlockEditorExtension } from "../extensions/types";
import { BlockSelectionController } from "./block-selection-controller";

/** Creates optional selection extensions with gesture coordination scoped to each editor. */
export class BlockSelectionExtensions {
  private readonly controllers = new WeakMap<BlockEditorApi, BlockSelectionController>();

  /**
   * Retains semantic IDs used by independently installed capabilities.
   *
   * @param bindings - Host action identities for toggle, range, and exact endpoints.
   */
  constructor(private readonly bindings: BlockSelectionBindings) {}

  /**
   * Creates a reusable feature registration with state isolated per editor.
   *
   * @param feature - Selection capability to install; install at most once per editor.
   * @returns Extension whose event registrations follow setup rollback and cleanup.
   */
  feature(feature: BlockSelectionFeature): BlockEditorExtension {
    return {
      /**
       * Installs a feature into this editor's coordinated selection controller.
       *
       * @param editor - Borrowed Page interaction and adapter APIs.
       * @returns Cleanup cancelling gesture work before registrations are removed.
       */
      setup: (editor) => {
        let controller = this.controllers.get(editor);
        if (!controller) {
          controller = new BlockSelectionController(editor, this.bindings);
          this.controllers.set(editor, controller);
        }
        return controller.install(feature);
      },
    };
  }
}
