/**
 * Registers the HTML blocks, the HTML canvas element and their editor chrome.
 *
 * @module
 */
import { CodeXmlIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";
import type { ReactEditorApi } from "../../editor/types";
import type { BlockRendererProps } from "../../managers/blocks/renderer-types";
import type { ElementRenderProps } from "../../managers/elements/types";
import type { ReactEditorExtension } from "../../managers/extensions/types";
import type { BlockSlotProps, ElementSlotProps } from "../../managers/surfaces/types";
import { HtmlBlock, HtmlBlockEditSlot } from "./block/html-block";
import { HTML_BLOCK_TYPE, HTML_ELEMENT_TYPE, UNSAFE_HTML_BLOCK_TYPE } from "./constants";
import { createHtmlEditingStore, type HtmlEditingStore } from "./editing/use-html-editing";
import { HtmlElement, HtmlElementEditSlot } from "./element/html-element";
import { validateHtmlElementProps } from "./element/html-element-props";
import { HTML_STARTER } from "./html-starter";
import {
  resolveHtmlSurfaceLimits,
  type HtmlSurfaceLimits,
  type HtmlSurfaceOptions,
} from "./options";
import { createLocalHtmlPermissions, type HtmlPermissions } from "./unsafe/permissions";
import { UnsafeHtmlBlock } from "./unsafe/unsafe-html-block";

/** Registries borrowed while installing the extension. */
type HtmlSurfaceRegistries = Pick<
  ReactEditorApi,
  "blockTypes" | "elementTypes" | "surfaces" | "blockContextMenu"
>;

/** State and settings of one installation, handed to every renderer and slot it registers. */
interface HtmlSurfaceInstallation {
  /** Editing state shared by a renderer and its edit slot within one panel. */
  readonly editingStore: HtmlEditingStore;
  /** Validated limits from the extension options. */
  readonly limits: HtmlSurfaceLimits;
}

/** Default size of a newly placed HTML element, in canvas units. */
const DEFAULT_ELEMENT_FRAME = { x: 0, y: 0, width: 280, height: 220 };

/**
 * Exports an HTML block's source as its portable text in every clipboard format.
 *
 * @param context - Clipboard context of the copied block.
 * @param context.block - Copied block; its content is the widget's HTML.
 * @returns Plain text, Markdown and HTML forms, all equal to the source.
 */
function formatHtmlClipboard({ block }: { readonly block: { readonly content: string } }) {
  return { plain: block.content, markdown: block.content, html: block.content };
}

/**
 * Creates the HTML surface extension.
 *
 * Installs:
 * - the `html` block, with a right-slot edit button and a slash command;
 * - the `unsafe-html` block, whose script may be granted editor access;
 * - "Convert to safe/unsafe HTML" block context menu items;
 * - the `html` canvas element, its edit slot and a placement tool.
 *
 * Disposing the extension removes every registration and leaves saved
 * widgets in the document.
 *
 * @param options - Limits for widget frames; omitted fields take documented defaults.
 * @returns Extension to pass to the React editor.
 * @throws RangeError if an option is out of range; options are validated here,
 * before the extension is installed.
 */
export function htmlSurfaceExtension(options: HtmlSurfaceOptions = {}): ReactEditorExtension {
  const limits = resolveHtmlSurfaceLimits(options);
  return {
    id: "rivto.html-surface",
    /**
     * Installs all registrations with one editing store and the resolved limits.
     *
     * @param editor - Editor that owns the registries.
     * @returns Cleanup that removes every registration in reverse order.
     */
    setup(editor) {
      const installation: HtmlSurfaceInstallation = {
        editingStore: createHtmlEditingStore(),
        limits,
      };
      const permissions = (options.permissions ?? createLocalHtmlPermissions)(editor.getDocument());
      const disposers = [() => permissions.dispose()];
      const cleanup = () => {
        for (const dispose of disposers.splice(0).reverse()) {
          dispose();
        }
      };
      try {
        disposers.push(registerHtmlBlock(editor, installation));
        disposers.push(registerUnsafeHtmlBlock(editor, installation, permissions));
        disposers.push(
          registerConversion(
            editor,
            HTML_BLOCK_TYPE,
            UNSAFE_HTML_BLOCK_TYPE,
            "Convert to unsafe HTML",
            TriangleAlertIcon,
          ),
        );
        disposers.push(
          registerConversion(
            editor,
            UNSAFE_HTML_BLOCK_TYPE,
            HTML_BLOCK_TYPE,
            "Convert to safe HTML",
            CodeXmlIcon,
          ),
        );
        disposers.push(registerHtmlElement(editor, installation));
      } catch (error) {
        cleanup();
        throw error;
      }
      return cleanup;
    },
  };
}

/**
 * Registers the `html` block and its right-slot edit button.
 *
 * @param editor - Registries to install into.
 * @param installation - Editing store and limits for the renderer and its slot.
 * @returns Disposer that removes both registrations.
 */
function registerHtmlBlock(editor: HtmlSurfaceRegistries, installation: HtmlSurfaceInstallation) {
  const removeType = editor.blockTypes.register({
    definition: { type: HTML_BLOCK_TYPE, title: "HTML", defaultProps: { label: "HTML" } },
    render: (props: BlockRendererProps) => <HtmlBlock {...props} {...installation} />,
    slashCommand: {
      title: "HTML",
      group: "Turn into",
      keywords: ["html", "css", "javascript", "widget", "embed"],
    },
    clipboard: { format: formatHtmlClipboard },
  });
  const removeSlot = editor.surfaces.registerBlockSlot({
    position: "right",
    component: (props: BlockSlotProps) => (
      <HtmlBlockEditSlot {...props} editingStore={installation.editingStore} />
    ),
    when: ({ block }) => block.type === HTML_BLOCK_TYPE,
  });
  return () => {
    removeSlot();
    removeType();
  };
}

/**
 * Registers the `unsafe-html` block. Its edit button is rendered inline by the block.
 *
 * @param editor - Registries to install into.
 * @param installation - Supplies the limits; unsafe editing state is local to each occurrence.
 * @param permissions - Policy shared by all occurrences in this installation.
 * @returns Disposer that removes the registration.
 */
function registerUnsafeHtmlBlock(
  editor: HtmlSurfaceRegistries,
  installation: HtmlSurfaceInstallation,
  permissions: Pick<HtmlPermissions, "read" | "write" | "subscribe">,
): () => void {
  return editor.blockTypes.register({
    definition: {
      type: UNSAFE_HTML_BLOCK_TYPE,
      title: "Unsafe HTML",
      defaultProps: { label: "Unsafe HTML" },
    },
    render: (props: BlockRendererProps) => (
      <UnsafeHtmlBlock permissions={permissions} {...props} limits={installation.limits} />
    ),
    slashCommand: {
      title: "Unsafe HTML",
      group: "Turn into",
      keywords: ["html", "unsafe", "script"],
    },
    clipboard: { format: formatHtmlClipboard },
  });
}

/**
 * Registers a block context menu item that changes selected blocks from one HTML type to another.
 *
 * Converting does not carry over any access grant; grants belong to the
 * approved unsafe type and exact source.
 *
 * @param editor - Registries to install into.
 * @param from - Type every selected block must have for the item to show.
 * @param to - Destination type.
 * @param title - Menu label.
 * @param icon - Menu icon.
 * @returns Disposer that removes the menu item.
 */
function registerConversion(
  editor: HtmlSurfaceRegistries,
  from: string,
  to: string,
  title: string,
  icon: LucideIcon,
): () => void {
  return editor.blockContextMenu.register({
    id: `html-surface.convert-to-${to}`,
    title,
    icon,
    order: 30,
    /**
     * Shows the item only when every target currently has the source type.
     *
     * @param context - Invoking panel and target block IDs.
     * @returns Whether the conversion applies.
     */
    isAvailable: ({ reactPanel, blockIds }) =>
      blockIds.every((id) => reactPanel.blocks.getBlockNode(id)?.type === from),
    /**
     * Changes every target's type as one undoable edit.
     *
     * @param context - Invoking panel and target block IDs.
     * @returns The targets have the destination type.
     * @throws If the panel rejects a type change.
     */
    execute: ({ reactPanel, blockIds }) =>
      reactPanel.batchUpdates(() => {
        for (const id of blockIds) {
          reactPanel.blocks.setBlockType(id, to);
        }
      }),
  });
}

/**
 * Registers the `html` canvas element, its edit slot and its placement tool.
 *
 * @param editor - Registries to install into.
 * @param installation - Editing store and limits for the renderer and its slot.
 * @returns Disposer that removes both registrations.
 */
function registerHtmlElement(editor: HtmlSurfaceRegistries, installation: HtmlSurfaceInstallation) {
  const removeType = editor.elementTypes.register({
    title: "HTML",
    definition: {
      type: HTML_ELEMENT_TYPE,
      defaults: { html: HTML_STARTER, label: "HTML" },
      validate: validateHtmlElementProps,
    },
    render: (props: ElementRenderProps) => <HtmlElement {...props} {...installation} />,
    creation: {
      title: "HTML",
      icon: <CodeXmlIcon size={20} strokeWidth={1.75} aria-hidden="true" focusable="false" />,
      /**
       * Supplies a detached element at the default size; placement replaces its frame.
       *
       * @returns The element input to place.
       */
      create: () => ({ type: HTML_ELEMENT_TYPE, frame: { ...DEFAULT_ELEMENT_FRAME } }),
    },
  });
  const removeSlot = editor.surfaces.registerElementSlot({
    position: "right",
    component: (props: ElementSlotProps) => (
      <HtmlElementEditSlot {...props} editingStore={installation.editingStore} />
    ),
    when: ({ element }) => element.type === HTML_ELEMENT_TYPE,
  });
  return () => {
    removeSlot();
    removeType();
  };
}
