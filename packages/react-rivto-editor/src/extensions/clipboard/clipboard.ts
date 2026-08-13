import {
  isStructuralSelection,
  RIVTO_CLIPBOARD_MIME,
  validateBlockListProps,
  type EditorBlock,
  type EditorBlockInput,
  type ClipboardBundle,
  type BlockSelection,
} from "@chulane/rivto";
import type { ReactEditor } from "../../types";
import {
  BUILTIN_KEYMAP,
  KEYBOARD_BINDING_IDS,
} from "../../managers";
import { findEdgelessRuntime } from "../edgeless/edgeless-runtime";
import { blockIdsOf, blockRangeProps, insertBlockElementSeparator } from "../../surfaces/edgeless/block-elements";

/** Configuration for browser clipboard integration. */
export interface ClipboardExtensionOptions {
  /**
   * Block type used when plain text creates additional blocks.
   *
   * When omitted, uses `reactEditor.createDefaultBlock().type` at paste time.
   */
  readonly defaultBlockType?: string;
  /**
   * Replaces an invalid structured block, or skips its subtree when nullish.
   *
   * @param block - Complete rejected block and nested data from the clipboard.
   * @param error - Validation error that caused rejection.
   * @returns A replacement block input, or a nullish value to skip the subtree.
   */
  readonly onBlockError?: (block: EditorBlock, error: unknown) => EditorBlockInput | null | undefined;
}

/**
 * Routes browser copy, cut, and paste events through the core clipboard manager.
 *
 * Without this bridge, a contenteditable handles paste itself and sees only
 * `text/plain`; native block types, list state, hierarchy, props, and plugin data are lost.
 * Core produces and consumes Rivto's structured clipboard MIME representation;
 * this component only transfers those portable values to and from the browser.
 * Ctrl/Cmd+Shift+V is remembered from keydown because ClipboardEvent has no
 * modifier fields; that shortcut ignores structured data and keeps multiline
 * plain text inside one block. Normal paste follows the copied selection type.
 *
 * DOM selection is synchronized immediately before each action because the
 * browser's `selectionchange` event may arrive after a keyboard clipboard event.
 * Event listeners are delegated to the active surface root and are removed by
 * the keyboard and DOM event runtimes when this component unmounts.
 *
 * @param reactEditor - React editor whose DOM events and clipboard managers are connected.
 * @param options - Plain-text fallback and invalid-block handling configuration.
 * @returns No value.
 */
export function registerClipboard(
  reactEditor: ReactEditor,
  options: ClipboardExtensionOptions = {},
): void {
  const { editor } = reactEditor;
  const resolveDefaultBlockType = (): string =>
    options.defaultBlockType ?? reactEditor.createDefaultBlock().type;
  // ClipboardEvent does not expose keyboard modifiers. Remember only the
  // immediately preceding paste shortcut, then consume it in `paste` below.
  let pasteAsPlainText = false;
  // Firefox can omit custom MIME data when a later keyboard paste event is
  // dispatched without a native DOM range. Retain the exact last editor copy
  // as a fallback, but only use it when the browser's plain text still matches.
  let copiedClipboard: { structured: string; text: string } | null = null;

  const selectedCanvasElementIds = (): readonly string[] => {
    const snapshot = findEdgelessRuntime(reactEditor)?.get();
    return snapshot?.active ? snapshot.items : [];
  };

  /** Returns a core-compatible block selection for active canvas root objects. */
  const canvasSelection = (): BlockSelection | undefined => {
    if (editor.mode.get() !== "edgeless") return undefined;
    const snapshot = findEdgelessRuntime(reactEditor)?.get();
    const blockIds = snapshot?.active ? snapshot.items.flatMap((id) => {
      const element = editor.elements.getElement(id);
      return element?.type === "block" ? blockIdsOf(element, editor.blocks.getRootIds()) : [];
    }) : [];
    return blockIds.length ? {
      type: "block",
      blockIds,
      anchorBlockId: blockIds[0]!,
      focusBlockId: blockIds.at(-1)!,
    } : undefined;
  };

  /** Writes the core-produced flavors into a native clipboard event. */
  const writeClipboard = (event: ClipboardEvent, bundle: ClipboardBundle): void => {
    const elementIds = selectedCanvasElementIds();
    if (elementIds.length) {
      bundle.elements = elementIds.flatMap((id) => editor.elements.getElement(id) ?? []);
      bundle.selectedElementIds = [...elementIds];
    }
    const portable = reactEditor.clipboard.format(bundle.blocks);
    const structured = JSON.stringify(bundle);
    event.clipboardData?.setData(RIVTO_CLIPBOARD_MIME, structured);
    event.clipboardData?.setData("text/html", portable.html);
    event.clipboardData?.setData("text/markdown", portable.markdown);
    event.clipboardData?.setData("text/plain", portable.plain);
    copiedClipboard = {
      structured,
      text: portable.plain,
    };
  };

  /** Recovers custom data only when the event still represents our last copy. */
  const fallbackStructuredClipboard = (event: ClipboardEvent): string | undefined => {
    if (event.clipboardData?.getData(RIVTO_CLIPBOARD_MIME)) return;
    const copied = copiedClipboard;
    const plain = event.clipboardData?.getData("text/plain") ?? "";
    return copied && (!plain || plain === copied.text) ? copied.structured : undefined;
  };

  /** Publishes the exact native endpoints before an asynchronous event can lag. */
  const synchronizeSelection = (): void => {
    if (canvasSelection()) return;
    const selection = reactEditor.selection.readDOM();
    if (selection) editor.selection.set(selection);
  };

  /** Pastes either the richest clipboard flavor or one unbroken plain-text value. */
  const pasteClipboard = (event: ClipboardEvent): void => {
    const plainText = pasteAsPlainText;
    pasteAsPlainText = false;
    let structured: string | undefined;
    if (!plainText) {
      structured = event.clipboardData?.getData(RIVTO_CLIPBOARD_MIME)
        || fallbackStructuredClipboard(event);
    }
    const canvas = canvasSelection();
    let sourceBundle = structured ? JSON.parse(structured) as ClipboardBundle : undefined;
    if (!sourceBundle && !plainText) {
      const parsed = reactEditor.clipboard.parse({
        html: event.clipboardData?.getData("text/html") ?? "",
        text: event.clipboardData?.getData("text/plain") ?? "",
      });
      if (parsed) {
        const materialize = (input: EditorBlockInput): EditorBlock => {
          const prepared = reactEditor.blocks.prepareBlock(input);
          return {
            id: prepared.id ?? crypto.randomUUID(),
            type: prepared.type,
            listProps: prepared.listProps ?? {},
            props: prepared.props ?? {},
            pluginData: prepared.pluginData ?? {},
            content: prepared.content ?? "",
            children: (prepared.children ?? []).map(materialize),
          };
        };
        sourceBundle = { version: 4, blocks: parsed.map(materialize), links: [] };
      }
    }
    if (sourceBundle) {
      const validateBlock = (block: EditorBlock): void => {
        if (
          typeof block.id !== "string" ||
          typeof block.type !== "string" ||
          typeof block.content !== "string" ||
          !Array.isArray(block.children)
        ) throw new TypeError("Invalid clipboard block");
        validateBlockListProps(block.listProps);
        validateBlockListProps(block.props);
        validateBlockListProps(block.pluginData);
        editor.blocksRegistry.validate(block.type, block.props);
      };
      const materializeReplacement = (input: EditorBlockInput): EditorBlock | undefined => {
        const prepared = reactEditor.blocks.prepareBlock({ ...input, children: [] });
        const replacement = {
          id: prepared.id ?? crypto.randomUUID(),
          type: prepared.type,
          listProps: prepared.listProps ?? {},
          props: prepared.props ?? {},
          pluginData: prepared.pluginData ?? {},
          content: prepared.content ?? "",
          children: [],
        } satisfies EditorBlock;
        let result: EditorBlock | undefined;
        try {
          validateBlock(replacement);
          result = reactEditor.blocks.validateListProps(replacement.listProps) ? replacement : undefined;
        } catch {
          result = undefined;
        }
        return result;
      };
      const prepare = (block: EditorBlock): EditorBlock | undefined => {
        let result: EditorBlock | undefined;
        try {
          validateBlock(block);
          const candidate = {
            ...block,
            listProps: reactEditor.blocks.prepareBlock({ ...block, children: [] }).listProps ?? {},
          };
          if (!reactEditor.blocks.validateListProps(candidate.listProps)) {
            throw new TypeError("Invalid block list properties");
          }
          result = { ...candidate, children: block.children.flatMap((child) => prepare(child) ?? []) };
        } catch (error) {
          const replacement = options.onBlockError?.(block, error);
          result = replacement ? materializeReplacement(replacement) : undefined;
        }
        return result;
      };
      sourceBundle = { ...sourceBundle, blocks: sourceBundle.blocks.flatMap((block) => prepare(block) ?? []) };
      structured = JSON.stringify(sourceBundle);
    }
    const saved = canvas ? editor.selection.get() : undefined;
    // Temporarily project canvas block references into the core clipboard
    // placement API. The preserved page selection is restored below, so the
    // bridge affects insertion order without merging the two selection stores.
    if (canvas) editor.selection.set([canvas]);
    const active = editor.selection.get().at(-1);
    const activeId = active?.type === "text" ? active.head.blockId
      : active?.type === "block" ? active.focusBlockId : undefined;
    const activeBlock = activeId ? editor.blocks.getBlock(activeId) : undefined;
    const expanded = reactEditor.blocks.hasListProps("collapse") && activeBlock?.listProps.collapsed !== true;
    const placement = activeBlock && sourceBundle && sourceBundle.startsWithText !== true
      ? expanded && activeBlock.children.length
        ? { parentId: activeBlock.id, afterId: null }
        : { parentId: editor.blocks.getParentId(activeBlock.id) ?? null, afterId: activeBlock.id }
      : undefined;
    editor.clipboard.paste({
      defaultBlockType: resolveDefaultBlockType(),
      preserveNewlines: plainText,
      structured,
      mergeText: canvas ? false : undefined,
      text: event.clipboardData?.getData("text/plain"),
      bundle: sourceBundle,
      placement,
    });
    if (canvas && saved) {
      const pasted = editor.selection.get().find((item): item is BlockSelection => item.type === "block");
      editor.selection.set(saved);
      if (pasted) {
        const rootMap = new Map((sourceBundle?.blocks ?? []).map((block, index) => [block.id, pasted.blockIds[index]]).filter((entry): entry is [string, string] => Boolean(entry[1])));
        const sources = sourceBundle?.elements?.filter((element) => element.type === "block") ?? [];
        const created: string[] = [];
        editor.batchUpdates(() => {
          const sourceRootIds = (sourceBundle?.blocks ?? []).map((block) => block.id);
          const groups = sources.length ? sources.map((element) => ({ source: element, blockIds: blockIdsOf(element, sourceRootIds).flatMap((id) => rootMap.get(id) ?? []) })) : [{ source: undefined, blockIds: pasted.blockIds }];
          const rootOrder = editor.blocks.getRootIds();
          const first = groups[0]?.blockIds[0];
          const before = first ? rootOrder[rootOrder.indexOf(first) - 1] : undefined;
          if (before) insertBlockElementSeparator(reactEditor, before);
          groups.slice(0, -1).forEach(({ blockIds }) => {
            const last = blockIds.at(-1);
            if (last) insertBlockElementSeparator(reactEditor, last);
          });
          groups.forEach(({ source, blockIds }, index) => {
            if (!blockIds.length) return;
            created.push(editor.elements.insertElement({
              type: "block",
              frame: source ? { ...source.frame, x: source.frame.x + 24, y: source.frame.y + 24 } : { x: 60 + index * 24, y: 60 + index * 24, width: 320, height: 120 },
              zIndex: Math.max(0, ...editor.elements.getElements().map((element) => element.zIndex)) + 1,
              props: blockRangeProps(blockIds),
            }));
          });
        });
        findEdgelessRuntime(reactEditor)?.set(created);
      }
    }
    requestAnimationFrame(() => reactEditor.selection.restoreDOM());
  };

  reactEditor.events.register({
    id: "clipboard.copy",
    type: "copy",
    scope: "surface",
  }, ({ raw: event }) => {
    synchronizeSelection();
    const payload = editor.clipboard.copy(canvasSelection() ? [canvasSelection()!] : undefined);
    if (!payload) return false;
    writeClipboard(event, payload);
    return true;
  });

  reactEditor.events.register({
    id: "clipboard.cut",
    type: "cut",
    scope: "surface",
  }, ({ raw: event }) => {
    synchronizeSelection();
    const canvas = canvasSelection();
    const payload = canvas ? editor.clipboard.copy([canvas]) : editor.clipboard.cut();
    if (!payload) return false;
    writeClipboard(event, payload);
    if (canvas) {
      editor.batchUpdates(() => {
        canvas.blockIds.forEach((id) => editor.blocks.removeBlock(id));
        editor.elements.removeElements(selectedCanvasElementIds());
      });
      findEdgelessRuntime(reactEditor)?.clear();
    }
    return true;
  });

  /** Handles Firefox clipboard events dispatched to body for block selection. */
  const handleDocumentClipboard = (root: HTMLElement, event: ClipboardEvent, insideRoot: boolean): boolean => {
    if (insideRoot) return false;
    const activeElement = root.ownerDocument.activeElement;
    const editorHasFocus = activeElement === root ||
      (activeElement !== null && root.contains(activeElement));
    const current = editor.selection.get();
    const canvas = canvasSelection();
    if (!editorHasFocus || (!canvas && (!current.length || !isStructuralSelection(current)))) return false;
    let handled = false;
    if (event.type === "paste") {
      pasteClipboard(event);
      handled = true;
    } else {
      const payload = canvas
        ? editor.clipboard.copy([canvas])
        : event.type === "cut" ? editor.clipboard.cut() : editor.clipboard.copy();
      if (payload) {
        writeClipboard(event, payload);
        if (canvas && event.type === "cut") {
          editor.batchUpdates(() => {
            canvas.blockIds.forEach((id) => editor.blocks.removeBlock(id));
            editor.elements.removeElements(selectedCanvasElementIds());
          });
          findEdgelessRuntime(reactEditor)?.clear();
        }
        handled = true;
      }
    }
    return handled;
  };

  reactEditor.events.register({
    id: "clipboard.document-copy",
    type: "copy",
    target: "document",
  }, ({ raw: event, insideRoot, root }) => (
    handleDocumentClipboard(root, event, insideRoot)
  ));
  reactEditor.events.register({
    id: "clipboard.document-cut",
    type: "cut",
    target: "document",
  }, ({ raw: event, insideRoot, root }) => (
    handleDocumentClipboard(root, event, insideRoot)
  ));
  reactEditor.events.register({
    id: "clipboard.document-paste",
    type: "paste",
    target: "document",
  }, ({ raw: event, insideRoot, root }) => (
    handleDocumentClipboard(root, event, insideRoot)
  ));

  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.clipboardPasteAsPlainText,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.clipboardPasteAsPlainText]!,
  }, () => {
    pasteAsPlainText = true;
    return false;
  });

  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.clipboardPasteAsPlainTextRelease,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.clipboardPasteAsPlainTextRelease]!,
    phase: "keyup",
    target: "window",
  }, () => {
    pasteAsPlainText = false;
    return false;
  });

  reactEditor.events.register({
    id: "clipboard.paste",
    type: "paste",
    scope: "surface",
  }, ({ raw: event }) => {
    synchronizeSelection();
    pasteClipboard(event);
    return true;
  });
}
