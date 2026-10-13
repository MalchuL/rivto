import { registerConnectorNormalization } from "../../../managers/elements/normalize-connectors";
import { registerEdgelessCommands } from "../../../managers/elements/register-edgeless-commands";
import { registerVisualElements } from "../../../elements/visuals/register-elements";
import { createElement } from "react";
import type { ReactEditorExtension } from "../../../managers";
import type { EdgelessVisualsOptions } from "./types";
import { EdgelessVisualLayer } from "./visual-layer";

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
    setup(reactEditor) {
      const disposers: Array<() => void> = [];
      const cleanup = () => { disposers.splice(0).reverse().forEach(dispose => dispose()); };
      try {
        disposers.push(registerVisualElements(reactEditor));
        disposers.push(registerConnectorNormalization(reactEditor, options));
        disposers.push(registerEdgelessCommands(reactEditor));
        disposers.push(reactEditor.extensions.mount(() => createElement(EdgelessVisualLayer, { options })));
        return cleanup;
      } catch (error) {
        cleanup();
        throw error;
      }
    },
  };
}

