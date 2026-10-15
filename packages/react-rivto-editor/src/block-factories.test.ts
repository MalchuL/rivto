import { createCaretSelection, type EditorBlockNode } from "@chulane/rivto";
import {
  createBlockFactory,
  paragraphBlockFactory,
  separatorBlockFactory,
} from "./block-factories";
import { createReactEditor } from "./editor/react-editor";
import { insertBlockElementSeparator } from "./elements/block-element-projection";
import { defaultWritingBlockExtension } from "./extensions/built-ins/built-ins";
import { createBlockBehaviorContext } from "./block-behaviors/utils/context";
import { DefaultBlockBehavior } from "./block-behaviors/default-block-behavior";
import type {
  BlockBehavior,
  BlockBehaviorAvailabilityContext,
  BlockBehaviorOutcome,
} from "./block-behaviors/types";
import { firstKeyboardTarget } from "./managers/events/selection";
import { createTestCoreEditor, createTestReactEditor } from "./test-utils";

class ResetRejectingBehavior implements BlockBehavior {
  /** @param context - Block being checked. @returns Whether the custom image behavior applies. */
  isAvailable(context: BlockBehaviorAvailabilityContext): boolean {
    return context.block.type === "image";
  }

  /** Keeps custom block state by refusing the default empty-text reset. */
  onResetEmpty(): BlockBehaviorOutcome {
    return "rejected";
  }
}

const populated: EditorBlockNode = {
  id: "candidate",
  type: "paragraph",
  content: "",
  props: { image: "keep" },
  listProps: { checked: true },
  pluginData: { custom: { value: "keep" } },
  childIds: ["child"],
};

test("pure built-ins keep their input shapes and text-only emptiness policy", () => {
  expect(paragraphBlockFactory.createEmptyBlock()).toEqual({ type: "paragraph", content: "" });
  expect(separatorBlockFactory.createEmptyBlock()).toEqual({ type: "separator", content: "" });
  expect(paragraphBlockFactory.createEmptyBlock()).not.toBe(
    paragraphBlockFactory.createEmptyBlock(),
  );
  expect(paragraphBlockFactory.isEmptyBlock(populated)).toBe(true);
  expect(paragraphBlockFactory.isEmptyBlock({ ...populated, content: "text" })).toBe(false);
  expect(separatorBlockFactory.isBlock(populated)).toBe(false);
  expect(separatorBlockFactory.isBlock({ type: "separator" })).toBe(true);
});

test("writing installation restores the previous contract and uninstalled failures", async () => {
  const editor = await createTestCoreEditor();
  const runtime = createReactEditor({ editor });
  try {
    const uninstalled = runtime.defaultWritingBlockFactory;
    expect(() => uninstalled.createEmptyBlock()).toThrow(/Install defaultWritingBlockExtension/);
    expect(() => uninstalled.isBlock(populated)).toThrow(/Install defaultWritingBlockExtension/);
    expect(() => uninstalled.isEmptyBlock(populated)).toThrow(
      /Install defaultWritingBlockExtension/,
    );
    const first = createBlockFactory("note");
    const releaseFirst = runtime.installDefaultWriting(first);
    const releaseSecond = runtime.installDefaultWriting(paragraphBlockFactory);
    expect(runtime.defaultWritingBlockFactory).toBe(paragraphBlockFactory);
    releaseSecond();
    expect(runtime.defaultWritingBlockFactory).toBe(first);
    releaseFirst();
    expect(runtime.defaultWritingBlockFactory).toBe(uninstalled);
  } finally {
    await runtime.destroy();
    await editor.destroy();
  }
});

test("automatic separator insertion follows registered type order and cleanup", async () => {
  const editor = await createTestCoreEditor();
  const runtime = createReactEditor({ editor });
  try {
    const release = runtime.blockTypes.register({
      definition: { type: "divider" },
      render: () => null,
      separatesBlockElements: true,
    });
    runtime.blockTypes.register({
      definition: { type: "boundary" },
      render: () => null,
      separatesBlockElements: true,
    });
    const anchor = editor.blocks.insertBlock({ type: "paragraph", content: "keep" }).id;
    expect(insertBlockElementSeparator(runtime, anchor).type).toBe("divider");
    expect(runtime.blockTypes.separatesBlockElements("divider")).toBe(true);
    release();
    expect(runtime.blockTypes.separatesBlockElements("divider")).toBe(false);
    expect(runtime.blockTypes.getDefaultBlockElementSeparatorType()).toBe("boundary");
    expect(insertBlockElementSeparator(runtime, anchor).type).toBe("boundary");
  } finally {
    await runtime.destroy();
    await editor.destroy();
  }
});

test("failed registration releases separator metadata with other contributions", async () => {
  const editor = await createTestCoreEditor();
  const runtime = createReactEditor({ editor });
  try {
    runtime.slashCommands.register({ id: "occupied", title: "Occupied", execute: () => undefined });
    expect(() =>
      runtime.blockTypes.register({
        definition: { type: "note" },
        render: () => null,
        separatesBlockElements: true,
        slashCommand: { id: "occupied", title: "Note" },
      }),
    ).toThrow();
    expect(runtime.blockTypes.getDefaultBlockElementSeparatorType()).toBeUndefined();
    expect(runtime.blockTypes.separatesBlockElements("note")).toBe(false);
    expect(runtime.renderers.has("note")).toBe(false);
    expect(editor.blockRegistry.has("note")).toBe(false);
  } finally {
    await runtime.destroy();
    await editor.destroy();
  }
});

test("custom reset refusal belongs to the existing block behavior", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor, extensions: [defaultWritingBlockExtension()] });
  try {
    panel.editor.blockTypes.register({
      definition: { type: "image" },
      render: () => null,
      behavior: new ResetRejectingBehavior(),
    });
    const id = panel.blocks.insertBlock({ type: "image", props: { image: "keep" } }).id;
    const selection = createCaretSelection(id, 0);
    const context = createBlockBehaviorContext(panel, id, {} as HTMLElement, selection)!;
    expect(
      panel.editor.blockBehaviors.dispatch(
        "onResetEmpty",
        context,
        firstKeyboardTarget(selection)!,
      ),
    ).toBe(true);
    expect(panel.blocks.getBlockNode(id)?.props.image).toBe("keep");
    expect(panel.blocks.getBlockNode(id)?.type).toBe("image");
  } finally {
    await panel.editor.destroy();
    await editor.destroy();
  }
});

test("reset skips host predicates when text is nonempty", async () => {
  const editor = await createTestCoreEditor();
  let calls = 0;
  const panel = createTestReactEditor({
    editor,
    extensions: [
      defaultWritingBlockExtension({
        factory: {
          ...paragraphBlockFactory,
          /** Records whether reset consulted the host emptiness policy. */
          isEmptyBlock: () => {
            calls += 1;
            return false;
          },
        },
      }),
    ],
  });
  try {
    const id = panel.blocks.insertBlock({ type: "paragraph", content: "keep" }).id;
    const selection = createCaretSelection(id, 0);
    const context = createBlockBehaviorContext(panel, id, {} as HTMLElement, selection)!;
    expect(new DefaultBlockBehavior().onResetEmpty(context, firstKeyboardTarget(selection)!)).toBe(
      "default",
    );
    expect(calls).toBe(0);
  } finally {
    await panel.editor.destroy();
    await editor.destroy();
  }
});

test.each(["image", "paragraph"])(
  "reset keeps existing conversion semantics for %s",
  async (type) => {
    const editor = await createTestCoreEditor();
    const originalFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
    let calls = 0;
    const panel = createTestReactEditor({
      editor,
      extensions: [
        defaultWritingBlockExtension({
          factory: {
            ...paragraphBlockFactory,
            /** Keeps empty writing blocks eligible for the existing reset fallback. */
            isEmptyBlock: () => {
              calls += 1;
              return false;
            },
          },
        }),
      ],
    });
    try {
      if (type === "image") {
        panel.editor.blockTypes.register({ definition: { type }, render: () => null });
      }
      const id = panel.blocks.insertBlock({
        type,
        props: { image: "keep" },
        listProps: { custom: "keep" },
        pluginData: { custom: { value: "keep" } },
        children: [{ type: "paragraph", content: "child" }],
      }).id;
      const before = panel.blocks.getBlockNode(id)!;
      const selection = createCaretSelection(id, 0);
      const root = {
        querySelector: () => null,
        querySelectorAll: () => [],
      } as unknown as HTMLElement;
      const context = createBlockBehaviorContext(panel, id, root, selection)!;
      expect(
        new DefaultBlockBehavior().onResetEmpty(context, firstKeyboardTarget(selection)!),
      ).toBe("handled");
      expect(calls).toBe(1);
      expect(panel.blocks.getBlockNode(id)).toEqual({ ...before, type: "paragraph" });
      expect(panel.blocks.getBlockNode(before.childIds[0]!)?.content).toBe("child");
    } finally {
      await panel.editor.destroy();
      await editor.destroy();
      globalThis.requestAnimationFrame = originalFrame;
    }
  },
);
