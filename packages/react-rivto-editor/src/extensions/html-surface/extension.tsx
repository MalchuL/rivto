/**
 * Registers the HTML blocks and the HTML canvas element.
 *
 * @module
 */
import type { BlockRendererProps } from "../../managers/blocks/renderer-types";
import type { ElementRenderProps } from "../../managers/elements/types";
import type { BlockSlotProps, ElementSlotProps } from "../../managers/surfaces/types";
import { createHtmlEditingStore, type HtmlEditingStore } from "./hooks/use-html-editing";
import type { ReactEditorExtension } from "../../managers/extensions/types";
import type { ReactEditorApi } from "../../editor/types";
import { HtmlBlock, HtmlBlockEditSlot } from "./components/html-block";
import { HtmlElement, HtmlElementEditSlot } from "./components/html-element";
import { UnsafeHtmlBlock, UNSAFE_HTML_BLOCK_TYPE } from "./components/unsafe-html-block";
import { HTML_BLOCK_TYPE, HTML_ELEMENT_TYPE, validateHtmlElementProps } from "./protocol/protocol";
import { HTML_STARTER } from "./html-starter";

/** Registration operations borrowed while installing the HTML block. */
interface HtmlBlockRegistrationEditor {
  readonly blockTypes: Pick<ReactEditorApi["blockTypes"], "register">;
  readonly surfaces: Pick<ReactEditorApi["surfaces"], "registerBlockSlot">;
}

/** Registration operations borrowed while installing the HTML element. */
interface HtmlElementRegistrationEditor {
  readonly elementTypes: Pick<ReactEditorApi["elementTypes"], "register">;
  readonly surfaces: Pick<ReactEditorApi["surfaces"], "registerElementSlot">;
}

const htmlIcon = (
  <svg
    viewBox="0 0 24 24"
    width={20}
    height={20}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    style={{ display: "inline-block", verticalAlign: "middle", pointerEvents: "none" }}
  >
    <rect x={3} y={4} width={18} height={16} rx={3} />
    <path d="M8 9l-2 3 2 3M16 9l2 3-2 3M13 8l-2 8" />
  </svg>
);

/**
 * Installs the sandboxed HTML blocks and canvas element.
 *
 * Both blocks are available from the slash menu. The element is a standalone
 * canvas tool. Disposing the extension removes all registrations and leaves
 * any saved widgets in the document. Unsafe block grants are local to the mounted occurrence.
 *
 * @returns Extension installed by the host editor.
 */
export function htmlSurfaceExtension(): ReactEditorExtension {
  return {
    id: "rivto.html-surface",
    /**
     * Registers both block renderers and the canvas element together.
     *
     * @param editor - Editor that owns the block and element registries.
     * @returns Cleanup that removes both block and element registrations.
     */
    setup(editor) {
      const editingStore = createHtmlEditingStore();
      const removeBlock = registerHtmlBlock(editor, editingStore);
      const removeElement = registerHtmlElement(editor, editingStore);
      const removeUnsafeBlock = registerUnsafeHtmlBlock(editor);
      return () => {
        removeUnsafeBlock();
        removeElement();
        removeBlock();
      };
    },
  };
}

/**
 * Registers the page HTML block, including its slash command and clipboard text.
 *
 * @param editor - Editor whose block registry receives the type.
 * @param editingStore - State shared by the registered block components.
 * @returns Disposer that removes the block and its right-slot control.
 */
function registerHtmlBlock(editor: HtmlBlockRegistrationEditor, editingStore: HtmlEditingStore) {
  const removeType = editor.blockTypes.register({
    definition: {
      type: HTML_BLOCK_TYPE,
      title: "HTML",
      defaultProps: { label: "HTML" },
    },
    render: (props: BlockRendererProps) => <HtmlBlock {...props} editingStore={editingStore} />,
    slashCommand: {
      title: "HTML",
      group: "Turn into",
      keywords: ["html", "css", "javascript", "widget", "embed"],
    },
    clipboard: {
      /**
       * Exports the authored HTML as the portable text of the block.
       *
       * @param context - Clipboard context whose block content is the HTML source.
       * @returns Plain text, Markdown, and HTML forms of that source.
       */
      format(context) {
        return {
          plain: context.block.content,
          markdown: context.block.content,
          html: context.block.content,
        };
      },
    },
  });
  const removeEdit = editor.surfaces.registerBlockSlot({
    position: "right",
    component: (props: BlockSlotProps) => (
      <HtmlBlockEditSlot {...props} editingStore={editingStore} />
    ),
    when: ({ block }) => block.type === HTML_BLOCK_TYPE,
  });
  return () => {
    removeEdit();
    removeType();
  };
}

/**
 * Registers the opt-in HTML block and its conversion command.
 *
 * @param editor - Editor that owns the block type registry.
 * @returns A disposer that removes the registration.
 */
function registerUnsafeHtmlBlock(editor: HtmlBlockRegistrationEditor): () => void {
  return editor.blockTypes.register({
    definition: {
      type: UNSAFE_HTML_BLOCK_TYPE,
      title: "Unsafe HTML",
      defaultProps: { label: "Unsafe HTML" },
    },
    render: UnsafeHtmlBlock,
    slashCommand: {
      title: "Unsafe HTML",
      group: "Turn into",
      keywords: ["html", "unsafe", "script"],
    },
  });
}

/**
 * Registers the canvas HTML element and its placement tool.
 *
 * @param editor - Editor whose element registry receives the type.
 * @param editingStore - State shared by the registered element components.
 * @returns Disposer that removes the element and its right-slot control.
 */
function registerHtmlElement(
  editor: HtmlElementRegistrationEditor,
  editingStore: HtmlEditingStore,
) {
  const removeType = editor.elementTypes.register({
    title: "HTML",
    definition: {
      type: HTML_ELEMENT_TYPE,
      defaults: { html: HTML_STARTER, label: "HTML" },
      /**
       * Requires an HTML string and JSON widget data.
       *
       * @param props - Merged element properties.
       * @returns The same properties when they are valid.
       * @throws If `html` is missing or a property is not JSON data.
       */
      validate: validateHtmlElementProps,
    },
    render: (props: ElementRenderProps) => <HtmlElement {...props} editingStore={editingStore} />,
    creation: {
      title: "HTML",
      icon: htmlIcon,
      /**
       * Supplies the initial box for a placed HTML element.
       *
       * The placement gesture replaces this box. The factory does not insert a record.
       *
       * @returns A detached HTML element at the default size.
       */
      create: () => ({
        type: HTML_ELEMENT_TYPE,
        frame: { x: 0, y: 0, width: 280, height: 220 },
      }),
    },
  });
  const removeEdit = editor.surfaces.registerElementSlot({
    position: "right",
    component: (props: ElementSlotProps) => (
      <HtmlElementEditSlot {...props} editingStore={editingStore} />
    ),
    when: ({ element }) => element.type === HTML_ELEMENT_TYPE,
  });
  return () => {
    removeEdit();
    removeType();
  };
}
