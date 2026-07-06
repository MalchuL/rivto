import { z } from "zod";
import { YjsDoc } from "../../store/crdt-doc";
import { createClipboardPayload } from "../managers/clipboard-bundle";
import { CommandRegistry, type CommandSpec } from "../managers";
import { createRivtoEditor } from "../editor";
import { createSlashMenuPlugin, defaultSlashItems, getSlashMenuPlugin } from "../plugins";

const textSelection = (anchorId: string, anchorOffset: number, headId = anchorId, headOffset = anchorOffset) => ({
  type: "text" as const,
  anchor: { blockId: anchorId, offset: anchorOffset },
  head: { blockId: headId, offset: headOffset },
});

describe("Phase 2 editor runtime", () => {
  it("registers, executes, observes, and disposes commands", () => {
    const commands = new CommandRegistry<{
      answer: CommandSpec<number, number>;
      ping: CommandSpec<undefined, string>;
    }>();
    const listener = jest.fn();
    commands.subscribe(listener);
    const dispose = commands.register("answer", (value) => Number(value) + 1);
    expect(commands.execute("answer", 41)).toBe(42);
    expect(dispose.execute(41)).toBe(42);
    expect(commands.lastExecuted).toBe("answer");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(() => commands.register("answer", () => 0)).toThrow("already registered");
    dispose.dispose();
    expect(() => commands.execute("answer", 41)).toThrow("Unknown command");
    const checkStaticTypes = (): void => {
      // @ts-expect-error Static commands reject an invalid payload.
      commands.execute("answer", "41");
      // @ts-expect-error Static commands reject an unknown name.
      commands.execute("missing");
    };
    expect(checkStaticTypes).toBeDefined();
  });

  it("preserves extension types through the generic command API", () => {
    const commands = new CommandRegistry();
    type GreetingCommands = { "plugin.greet": CommandSpec<{ name: string }, string> };
    const greeting = commands.register<GreetingCommands>(
      "plugin.greet",
      ({ name }) => `Hello ${name}`,
    );
    expect(greeting.execute({ name: "Rivto" })).toBe("Hello Rivto");
    greeting.dispose();
    expect(() => greeting.execute({ name: "Rivto" })).toThrow("Unknown command");
    const checkHandleTypes = (): void => {
      commands.execute<GreetingCommands>("plugin.greet", { name: "Rivto" });
      // @ts-expect-error Extension command maps validate direct execution payloads.
      commands.execute<GreetingCommands>("plugin.greet", { name: 42 });
      // @ts-expect-error Registration handles retain their declared payload type.
      greeting.execute({ name: 42 });
    };
    expect(checkHandleTypes).toBeDefined();
  });

  it("routes all document mutations through built-in commands and history", () => {
    const editor = createRivtoEditor({ initialContent: [
      { id: "a", type: "paragraph", content: "Alpha" },
      { id: "b", type: "paragraph", content: "Beta" },
    ] });
    editor.commands.execute("block.indent", { id: "b" });
    editor.commands.execute("block.layout.set", { id: "a", layout: { x: 240, y: 80 } });
    editor.commands.execute("text.format", { id: "a", from: 0, length: 5, format: "bold" });
    expect(editor.document.document[0]).toMatchObject({
      id: "a", content: "**Alpha**", layout: { x: 240, y: 80 }, children: [{ id: "b" }],
    });
    editor.commands.execute("history.undo");
    expect(editor.document.document[0].content).toBe("Alpha");
  });

  it("uses renderers for block availability and plugins for behavior and actions", () => {
    const editor = createRivtoEditor({ plugins: [createSlashMenuPlugin(defaultSlashItems)] });
    const Render = () => null;
    editor.defineBlock({
      type: "shape", content: "none",
      render: { edgeless: Render },
    });
    editor.use({
      id: "shape.tools",
      slashItems: [{ title: "Shape", block: { type: "shape" } }],
      ui: [{ id: "shape.color", slot: "toolbar", title: "Color", command: "shape.color", blockTypes: ["shape"] }],
      blockEvents: { shape: { pointerdown: () => true } },
    });
    expect(editor.blocks.getRenderer("shape", "edgeless")).toBe(Render);
    expect(editor.ui.get("toolbar", "edgeless", "shape")).toHaveLength(1);
    const slash = getSlashMenuPlugin(editor)!;
    expect(slash.getItems(editor)).not.toEqual(expect.arrayContaining([expect.objectContaining({ title: "Shape" })]));
    expect(() => editor.commands.execute("block.insert", { block: { type: "shape" } })).toThrow("unavailable");
    editor.commands.execute("mode.set", { mode: "edgeless" });
    expect(slash.getItems(editor)).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Shape" })]));
  });

  it("owns slash query, filtering, and execution in the slash plugin", () => {
    const editor = createRivtoEditor({
      initialContent: [{ id: "a", type: "paragraph" }],
      plugins: [createSlashMenuPlugin(defaultSlashItems)],
    });
    const slash = getSlashMenuPlugin(editor)!;
    const listener = jest.fn();
    slash.subscribe(listener);

    editor.events.dispatch({ type: "input", blockId: "a", payload: { text: "/hea" } });
    expect(slash.getState()).toEqual({ blockId: "a", query: "hea" });
    expect(slash.getItems(editor, "hea").map((item) => item.title)).toEqual([
      "Heading 1", "Heading 2", "Heading 3",
    ]);

    editor.commands.execute<Record<string, (payload: unknown) => unknown>>("slash.execute", { blockId: "a", itemId: "heading2" });
    expect(editor.document.document).toEqual([expect.objectContaining({ type: "heading2" })]);
    expect(slash.getState()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("validates text, block, and edgeless selections and mode compatibility", () => {
    const editor = createRivtoEditor({ initialContent: [
      { id: "a", type: "paragraph", content: "Alpha" },
      { id: "b", type: "paragraph", content: "Beta" },
    ] });
    editor.commands.execute("selection.set", { selection: textSelection("a", 1, "b", 2) });
    expect(editor.selection.get()?.type).toBe("text");
    editor.commands.execute("selection.set", { selection: { type: "block", blockIds: ["b", "a", "b"], anchorBlockId: "b", focusBlockId: "a" } });
    expect(editor.selection.get()).toEqual({
      type: "block", blockIds: ["a", "b"], anchorBlockId: "b", focusBlockId: "a",
    });
    expect(() => editor.commands.execute("selection.set", { selection: { type: "edgeless", blockIds: ["a"] } })).toThrow("requires edgeless");
    editor.commands.execute("mode.set", { mode: "edgeless" });
    editor.commands.execute("selection.set", { selection: { type: "edgeless", blockIds: ["a"] } });
    editor.commands.execute("mode.set", { mode: "block" });
    expect(editor.selection.get()).toBeNull();
    expect(() => editor.commands.execute("selection.set", { selection: textSelection("missing", 0) })).toThrow("not found");
  });

  it("clears selections whose blocks are deleted", () => {
    const editor = createRivtoEditor({ initialContent: [{ id: "a", type: "paragraph", content: "Alpha" }] });
    editor.commands.execute("selection.set", { selection: textSelection("a", 1) });
    editor.commands.execute("block.remove", { id: "a" });
    expect(editor.selection.get()).toBeNull();
  });

  it("routes plugin, block, then fallback handlers with short-circuiting", () => {
    const calls: string[] = [];
    const editor = createRivtoEditor({ initialContent: [{ id: "a", type: "paragraph" }] });
    const fallback = editor.events.registerFallback("pointerdown", () => { calls.push("fallback"); return true; });
    const removeBlock = editor.defineBlock({ type: "event-block", content: "inline" });
    const id = editor.commands.execute("block.insert", { block: { type: "event-block" } });
    const disposeBlockPlugin = editor.use({
      id: "block-events",
      blockEvents: { "event-block": { pointerdown: () => { calls.push("block"); return false; } } },
    });
    const disposePlugin = editor.use({
      id: "events", events: { pointerdown: () => { calls.push("plugin"); return false; } },
    });
    expect(editor.events.dispatch({ type: "pointerdown", blockId: id })).toBe(true);
    expect(calls).toEqual(["plugin", "block", "fallback"]);
    calls.length = 0;
    disposePlugin();
    editor.events.dispatch({ type: "pointerdown", blockId: id });
    expect(calls).toEqual(["block", "fallback"]);
    disposeBlockPlugin(); fallback(); removeBlock();
  });

  it("installs plugins atomically and removes commands, events, blocks, and UI", () => {
    const editor = createRivtoEditor();
    const Render = () => null;
    const dispose = editor.use({
      id: "test.plugin", modes: ["edgeless"],
      blocks: [{ type: "notice", content: "inline", title: "Notice", render: { edgeless: Render } }],
      commands: { hello: (_editor, value) => `hello ${String(value)}` },
      events: { pointerdown: () => true },
      ui: [{ id: "hello", slot: "toolbar", title: "Hello", command: "hello" }],
    });
    type HelloCommands = { hello: CommandSpec<string, string> };
    expect(() => editor.commands.execute<HelloCommands>("hello", "world")).toThrow("unavailable");
    expect(editor.ui.get("toolbar", "block")).toHaveLength(0);
    expect(editor.ui.get("toolbar", "edgeless")).toHaveLength(1);
    expect(() => editor.commands.execute("block.insert", { block: { type: "notice" } })).toThrow("unavailable");
    editor.commands.execute("mode.set", { mode: "edgeless" });
    expect(editor.commands.execute<HelloCommands>("hello", "world")).toBe("hello world");
    dispose();
    expect(editor.blocks.has("notice")).toBe(false);
    expect(() => editor.commands.execute<HelloCommands>("hello", "world")).toThrow("Unknown command");
    expect(editor.ui.get("toolbar", "edgeless")).toHaveLength(0);

    editor.commands.register<{ taken: CommandSpec }>("taken", () => undefined);
    expect(() => editor.use({ id: "broken", blocks: [{ type: "temporary", content: "none" }], commands: { taken: () => undefined } })).toThrow();
    expect(editor.blocks.has("temporary")).toBe(false);
  });

  it("copies, cuts, and pastes text through commands", async () => {
    const editor = createRivtoEditor({ initialContent: [{ id: "a", type: "paragraph", content: "Hello world" }] });
    editor.commands.execute("selection.set", { selection: textSelection("a", 6, "a", 11) });
    expect(await editor.commands.execute("clipboard.copy")).toBe("world");
    expect(await editor.commands.execute("clipboard.cut")).toBe("world");
    await editor.commands.execute("clipboard.paste", { defaultBlockType: "paragraph", text: "Rivto" });
    expect(editor.document.document[0].content).toBe("Hello Rivto");
  });

  it("copies whole block selections and preserves typed structured data", () => {
    const editor = createRivtoEditor({ initialContent: [
      { id: "a", type: "paragraph", content: "Alpha", props: { tone: "plain" } },
      { id: "b", type: "heading", content: "Beta" },
    ] });
    editor.commands.execute("selection.set", { selection: { type: "block", blockIds: ["a", "b"], anchorBlockId: "a", focusBlockId: "b" } });
    expect(createClipboardPayload(editor.document, editor.selection.get())?.text).toBe("Alpha\nBeta");
  });

  it("normalizes reverse partial text selection without losing its boundaries", () => {
    const editor = createRivtoEditor({ initialContent: [
      { id: "a", type: "paragraph", content: "Alpha" },
      { id: "b", type: "paragraph", content: "Beta" },
    ] });
    editor.commands.execute("selection.set", { selection: textSelection("b", 2, "a", 2) });
    expect(createClipboardPayload(editor.document, editor.selection.get())?.text).toBe("pha\nBe");
    expect(editor.selection.get()).toEqual(textSelection("b", 2, "a", 2));
  });

  it("cuts whole block selections instead of retaining an empty boundary block", async () => {
    const editor = createRivtoEditor({ initialContent: [
      { id: "a", type: "paragraph", content: "Alpha" },
      { id: "b", type: "heading", content: "Beta" },
    ] });
    editor.commands.execute("selection.set", { selection: {
      type: "block", blockIds: ["a", "b"], anchorBlockId: "a", focusBlockId: "b",
    } });
    expect(await editor.commands.execute("clipboard.cut")).toBe("Alpha\nBeta");
    expect(editor.document.document).toEqual([]);
    expect(editor.selection.get()).toBeNull();
  });

  it("validates custom block props and preserves unknown stored types", () => {
    const editor = createRivtoEditor();
    editor.defineBlock({
      type: "alert", content: "inline", defaultProps: { tone: "info" },
      propSchema: z.object({ tone: z.enum(["info", "warning"]) }),
    });
    const id = editor.commands.execute("block.insert", { block: { type: "alert" } });
    expect(editor.document.document[0]).toMatchObject({ id, props: { tone: "info" } });
    expect(() => editor.commands.execute("block.insert", { block: { type: "alert", props: { tone: "bad" } } })).toThrow();
    editor.commands.execute("document.load", { snapshot: { version: 3, blocks: [{
      id: "unknown", type: "missing", content: "Raw", props: {}, pluginData: {}, children: [],
      layout: { x: 40, y: 40, width: 320, height: 120, zIndex: 0 },
    }], links: [] } });
    expect(editor.document.document[0].type).toBe("missing");
  });

  it("merges nested default properties without replacing sibling defaults", () => {
    const editor = createRivtoEditor();
    editor.defineBlock({
      type: "card", content: "inline",
      defaultProps: { style: { color: "blue", border: { width: 1, kind: "solid" } } },
    });
    editor.commands.execute("block.insert", { block: {
      type: "card", props: { style: { border: { width: 2 } } },
    } });
    expect(editor.document.document[0].props).toEqual({
      style: { color: "blue", border: { width: 2, kind: "solid" } },
    });
  });

  it("loads only fetched snapshot sections", () => {
    const editor = createRivtoEditor();
    editor.commands.execute("document.load", { snapshot: {
      version: 3,
      blocks: [
        { id: "a", type: "paragraph", props: {}, pluginData: {}, content: "A", children: [] },
        { id: "b", type: "paragraph", props: {}, pluginData: {}, content: "B", children: [] },
      ],
      links: [{ id: "edge", from: { blockId: "a" }, to: { blockId: "b" } }],
      pluginData: { source: "remote" },
    } });
    editor.commands.execute("document.load", { snapshot: {
      version: 3,
      blocks: [
        { id: "a", type: "paragraph", props: {}, pluginData: {}, content: "Updated", children: [] },
        { id: "b", type: "paragraph", props: {}, pluginData: {}, content: "B", children: [] },
      ],
    } });
    expect(editor.document.links).toEqual([expect.objectContaining({ id: "edge" })]);
    expect(editor.document.getSnapshot().pluginData).toEqual({ source: "remote" });
  });

  it("converges command changes across CRDT adapters", () => {
    const docA = new YjsDoc("a");
    const docB = new YjsDoc("b");
    const editorA = createRivtoEditor({ document: docA });
    const editorB = createRivtoEditor({ document: docB });
    const id = editorA.commands.execute("block.insert", { block: { type: "paragraph", content: "Shared" } });
    docB.applySnapshot(docA.getSnapshot());
    editorB.commands.execute("text.set", { id, text: "Remote" });
    docA.applySnapshot(docB.getSnapshot());
    expect(editorA.document.getSnapshot()).toEqual(editorB.document.getSnapshot());
    editorA.destroy(); editorB.destroy(); docA.destroy(); docB.destroy();
  });
});
