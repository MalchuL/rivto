import type { ReactEditorExtension } from "../../../managers";
import { createElement } from "react";
import { EdgelessVisualController } from "./controller";
import { EdgelessVisualLayer } from "./visual-layer";
import type { EdgelessVisualsOptions } from "./types";

/**
 * Creates the opt-in visual-object extension for the standard edgeless surface.
 *
 * The extension registers commands on the supplied editor but stores every
 * visual-specific props on generic first-class document elements.
 *
 * @param options - Optional sticker catalog and toolbar visibility.
 * @returns Creation-time React editor extension.
 */
export function edgelessVisualsExtension(options: EdgelessVisualsOptions = {}): ReactEditorExtension {
  return {
    id: "edgeless.visuals",
    setup: (reactEditor) => {
      const controller = new EdgelessVisualController(reactEditor);
      reactEditor.extensions.mount(() => createElement(EdgelessVisualLayer, { controller, options }));
      return () => controller.destroy();
    },
  };
}

export * from "./types";
