import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { EditorContext } from "../../packages/react-rivto-editor/src/editor-context";
import { createTestCoreEditor, createTestReactEditor } from "../../packages/react-rivto-editor/src/test-utils";
import { useBlockNode, useBlockOperations, type BlockOperations } from "../../packages/react-rivto-editor/src/hooks/blocks/use-block";
import { useBlockTextEditing } from "../../packages/react-rivto-editor/src/hooks/blocks/use-block-text-editing";

/** Exercises real React subscriptions and contenteditable commits in a browser. */
export async function run(): Promise<void> {
  const cores = await Promise.all([createTestCoreEditor(), createTestCoreEditor()]);
  const editors = cores.map((editor) => createTestReactEditor({ editor }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const subscriptions = editors.map(() => new Map<string, number>());
  let commands!: BlockOperations;
  let renders = 0;
  const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
  const settle = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  function Commands({ id }: { id: string }) {
    commands = useBlockOperations(id);
    renders += 1;
    return null;
  }
  function Text({ id, domKey }: { id: string; domKey: number }) {
    const { block } = useBlockNode(id);
    const attributes = useBlockTextEditing(id, block?.content);
    return block ? createElement("div", { ...attributes, key: domKey }) : null;
  }
  const render = (editorIndex: number, id: string, text: boolean, domKey = 0) => {
    const editorView = editors[editorIndex]!;
    flushSync(() => root.render(createElement(EditorContext.Provider, {
      value: { editorView, documentId: editorView.getDocument().id },
    }, text ? createElement(Text, { id, domKey }) : createElement(Commands, { id }))));
  };
  const editable = () => host.querySelector<HTMLDivElement>("[contenteditable]")!;
  try {
    editors.forEach((editor, index) => {
      for (const id of ["a", "b"]) editor.blocks.insertBlock({ id, type: "paragraph", content: `${index}-${id}` });
      const subscribe = editor.blocks.subscribeBlockNode.bind(editor.blocks);
      editor.blocks.subscribeBlockNode = (id, listener) => {
        const counts = subscriptions[index]!;
        counts.set(id, (counts.get(id) ?? 0) + 1);
        const dispose = subscribe(id, listener);
        return () => { counts.set(id, counts.get(id)! - 1); dispose(); };
      };
    });
    render(0, "a", false);
    const oldCommands = commands;
    render(0, "a", false);
    check(oldCommands === commands, "commands must remain stable across renders");
    check(subscriptions[0]!.size === 0, "commands must not subscribe");
    const before = renders;
    commands.setContent("Changed");
    await settle();
    check(renders === before, "writes must not render command-only consumers");
    check(editors[0]!.blocks.getBlockNode("a")?.content === "Changed", "commands must write");
    render(0, "b", false);
    commands.setContent("Other ID");
    render(1, "b", false);
    commands.setContent("Other editor");
    oldCommands.setContent("Retained binding");
    check(editors[0]!.blocks.getBlockNode("a")?.content === "Retained binding", "retained commands must keep original binding");
    check(editors[0]!.blocks.getBlockNode("b")?.content === "Other ID", "ID change must rebind commands");
    check(editors[1]!.blocks.getBlockNode("b")?.content === "Other editor", "editor change must rebind commands");

    render(0, "a", true);
    check(editable().textContent === "Retained binding", "mount must synchronize text");
    check(subscriptions[0]!.get("a") === 1, "text composition must create one subscription");
    const oldElement = editable();
    render(0, "a", true, 1);
    check(editable() !== oldElement && editable().textContent === "Retained binding", "replacement DOM must synchronize unchanged text");
    flushSync(() => editors[0]!.blocks.updateBlock("a", { content: "External" }));
    check(editable().textContent === "External", "external command must synchronize");
    editable().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    editable().textContent = "入力";
    flushSync(() => editors[0]!.blocks.updateBlock("a", { content: "Remote during composition" }));
    editable().dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
    check(editable().textContent === "入力", "IME must retain DOM ownership");
    check(editors[0]!.blocks.getBlockNode("a")?.content === "Remote during composition", "intermediate IME input must not commit");
    flushSync(() => editable().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
    check(editors[0]!.blocks.getBlockNode("a")?.content === "入力", "composition end must commit");
    render(0, "b", true);
    check(subscriptions[0]!.get("a") === 0 && subscriptions[0]!.get("b") === 1, "ID change must release old subscription");
    render(1, "b", true);
    check(subscriptions[0]!.get("b") === 0 && subscriptions[1]!.get("b") === 1, "editor change must release old subscription");
    check(editable().textContent === "Other editor", "editor change must synchronize its text");
    editable().textContent = "Input after switch";
    flushSync(() => editable().dispatchEvent(new InputEvent("input", { bubbles: true })));
    check(editors[1]!.blocks.getBlockNode("b")?.content === "Input after switch", "input must use the new editor binding");
    check(editors[0]!.blocks.getBlockNode("b")?.content === "Other ID", "input must not write to the previous editor");
    flushSync(() => editors[1]!.blocks.removeBlock("b"));
    check(editable() === null, "deletion must render missing snapshot");
  } finally {
    flushSync(() => root.unmount());
    host.remove();
    editors.forEach((editor) => editor.destroy());
    await Promise.all(cores.map((editor) => editor.destroy()));
  }
  check(subscriptions.every((counts) => [...counts.values()].every((count) => count === 0)), "unmount must release all subscriptions");
}
