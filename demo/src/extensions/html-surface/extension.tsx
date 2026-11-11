/**
 * Registers the HTML block and the HTML canvas element.
 *
 * @module
 */
import type { ReactEditorExtension } from "@chulane/rivto-react";
import { HtmlBlock, HtmlBlockBodySlot, HtmlBlockEditSlot } from "./html-block";
import { HtmlElement, HtmlElementEditSlot } from "./html-element";
import "./html-surface.css";
import { HTML_BLOCK_TYPE, HTML_ELEMENT_TYPE, validateHtmlElementProps } from "./protocol";
import { HTML_STARTER } from "./samples";

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
 * Installs the paste-and-render HTML block and canvas element.
 *
 * The block is available from the slash menu. The element is a standalone
 * canvas tool. Disposing the extension removes both registrations and leaves
 * any saved widgets in the document.
 *
 * @returns Extension installed with the demo editor.
 */
export function htmlSurfaceExtension(): ReactEditorExtension {
  return {
    id: "demo.html-surface",
    /**
     * Registers the block renderer and the canvas element together.
     *
     * @param editor - Editor that owns both registries.
     * @returns Cleanup that removes the block and the element registration.
     */
    setup(editor) {
      const removeBlock = registerHtmlBlock(editor);
      const removeElement = registerHtmlElement(editor);
      return () => {
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
 * @returns Disposer that removes the block, its body, and its right-slot control.
 */
function registerHtmlBlock(editor: Parameters<ReactEditorExtension["setup"]>[0]) {
  const removeType = editor.blockTypes.register({
    definition: {
      type: HTML_BLOCK_TYPE,
      title: "HTML",
      defaultProps: { label: "HTML" },
    },
    render: HtmlBlock,
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
  const removeBody = editor.surfaces.registerBlockSlot({
    position: "body",
    component: HtmlBlockBodySlot,
    when: ({ block }) => block.type === HTML_BLOCK_TYPE,
  });
  const removeEdit = editor.surfaces.registerBlockSlot({
    position: "right",
    component: HtmlBlockEditSlot,
    when: ({ block }) => block.type === HTML_BLOCK_TYPE,
  });
  return () => {
    removeEdit();
    removeBody();
    removeType();
  };
}

/**
 * Registers the canvas HTML element and its placement tool.
 *
 * @param editor - Editor whose element registry receives the type.
 * @returns Disposer that removes the element and its right-slot control.
 */
function registerHtmlElement(editor: Parameters<ReactEditorExtension["setup"]>[0]) {
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
    render: HtmlElement,
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
    component: HtmlElementEditSlot,
    when: ({ element }) => element.type === HTML_ELEMENT_TYPE,
  });
  return () => {
    removeEdit();
    removeType();
  };
}
