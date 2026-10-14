import { registerVisualToolbar } from "./register-toolbar";
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
 * Setup installs built-in definitions, toolbar groups, connector maintenance and the
 * visual layer. Cleanup removes these registrations in reverse order without deleting
 * persisted content; partial setup is rolled back if any registration fails.
 *
 * @param options - Optional font/sticker catalogs, toolbar visibility and connector settings;
 * omitted fields use the built-in defaults.
 * @returns Creation-time React editor extension.
 */
export function edgelessVisualsExtension(
  options: EdgelessVisualsOptions = {},
): ReactEditorExtension {
  return {
    id: "edgeless.visuals",
    /**
     * Registers visual elements, tools, normalization, commands, and overlays, rolling back registrations on setup failure.
     *
     * @param reactEditor - React editor that owns the extension registrations.
     * @returns Cleanup that releases registrations in reverse order.
     * @throws If any visual registration fails.
     */
    setup(reactEditor) {
      const disposers: Array<() => void> = [];
      const cleanup = () => {
        disposers
          .splice(0)
          .reverse()
          .forEach((dispose) => dispose());
      };
      try {
        disposers.push(registerVisualElements(reactEditor));
        disposers.push(registerVisualToolbar(reactEditor, options));
        disposers.push(registerConnectorNormalization(reactEditor, options));
        disposers.push(registerEdgelessCommands(reactEditor));
        disposers.push(
          reactEditor.extensions.mount(() => createElement(EdgelessVisualLayer, { options })),
        );
        return cleanup;
      } catch (error) {
        cleanup();
        throw error;
      }
    },
  };
}
