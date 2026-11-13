import type { ReactBlockRegistration } from "../managers/blocks/types";
import type { ReactElementRegistration } from "../managers/elements/types";
import type { ReactEditorExtension } from "../managers/extensions/types";

/**
 * Creates an extension that installs one complete block type.
 *
 * Definition, presentation and optional behavior, clipboard and slash contributions
 * share the extension lifecycle. Removing the extension does not delete document blocks.
 * Installing the returned extension throws for conflicting or invalid registrations.
 *
 * @param registration - Complete block definition and its React presentation.
 * @returns Extension that registers the block when installed in an editor.
 */
export function blockExtension(registration: ReactBlockRegistration): ReactEditorExtension {
  return {
    id: `block.${registration.definition.type}`,
    setup: (editor) => {
      editor.blockTypes.register(registration);
    },
  };
}

/**
 * Creates an extension that installs one complete canvas element type.
 *
 * Definition, presentation and optional creation tool, properties and clipboard
 * contributions share the extension lifecycle. Removal preserves document elements.
 * Installing the returned extension throws for conflicting or invalid registrations.
 *
 * @param registration - Complete element definition and its React presentation.
 * @returns Extension that registers the element when installed in an editor.
 */
export function elementExtension(registration: ReactElementRegistration): ReactEditorExtension {
  return {
    id: `element.${registration.definition.type}`,
    setup: (editor) => {
      editor.elementTypes.register(registration);
    },
  };
}
