import type { BlockOutlineContext } from "./types";
import { createCaretSelection } from "@chulane/rivto";
import {
  createTestCoreEditor,
  createTestReactEditor,
  indentBlocks,
  outdentBlocks,
} from "../test-utils";
import { defaultWritingBlockExtension } from "../extensions/built-ins/built-ins";

for (const operation of ["indent", "outdent"] as const) {
  for (const outcome of ["unhandled", "handled", "rejected"] as const) {
    test(`parent ${operation} runs first and ${outcome} controls the complete group`, async () => {
      const core = await createTestCoreEditor({ registerWritingBlock: false });
      const panel = createTestReactEditor({
        editor: core,
        extensions: [defaultWritingBlockExtension()],
      });
      const parent = panel.blocks.insertBlock({
        type: "paragraph",
        content: "parent",
        children: [
          { type: "paragraph", content: "first" },
          { type: "paragraph", content: "second" },
          { type: "paragraph", content: "third" },
        ],
      });
      const ids = parent.children.slice(1).map((child) => child.id);
      const calls: string[] = [];
      panel.selection.set(createCaretSelection(ids[0]!, 2));
      const selection = panel.selection.get();
      const parentMethod = operation === "indent" ? "onChildIndent" : "onChildOutdent";
      const childMethod = operation === "indent" ? "onIndent" : "onOutdent";
      panel.editor.blockBehaviors.register(
        {
          isAvailable: ({ block }) => block.id === parent.id,
          [parentMethod]: (context: BlockOutlineContext, received: readonly string[]) => {
            calls.push("parent");
            expect(context.block.id).toBe(parent.id);
            expect(context.selection).toEqual(selection);
            expect(received).toEqual(ids);
            if (outcome === "handled") {
              context.reactPanel.blocks.updateBlock(parent.id, { content: "custom parent" });
              context.reactPanel.blocks.updateBlock(ids[0]!, { content: "custom child" });
            }
            return outcome;
          },
        },
        10,
      );
      panel.editor.blockBehaviors.register(
        {
          isAvailable: ({ block }) => block.id === ids[0],
          [childMethod]: () => {
            calls.push("child");
            return "unhandled";
          },
        },
        100,
      );
      core.history.clear();
      const getBlock = panel.blocks.getBlock;
      panel.blocks.getBlock = () => {
        throw new Error("outline dispatch must not read recursive snapshots");
      };
      (operation === "indent" ? indentBlocks : outdentBlocks)(panel, ids);
      panel.blocks.getBlock = getBlock;
      expect(calls).toEqual(outcome === "unhandled" ? ["parent", "child"] : ["parent"]);
      const expectedParent = operation === "indent" ? parent.children[0]!.id : null;
      expect(ids.map((id) => panel.blocks.getParentId(id))).toEqual(
        ids.map(() => (outcome === "unhandled" ? expectedParent : parent.id)),
      );
      expect(panel.selection.get()).toEqual(selection);
      if (outcome === "handled") {
        expect(panel.blocks.getBlockNode(parent.id)?.content).toBe("custom parent");
        expect(panel.blocks.getBlockNode(ids[0]!)?.content).toBe("custom child");
        core.history.undo();
        expect(panel.blocks.getBlockNode(parent.id)?.content).toBe("parent");
        expect(panel.blocks.getBlockNode(ids[0]!)?.content).toBe("second");
      } else if (outcome === "unhandled") {
        core.history.undo();
        expect(panel.blocks.getParentId(ids[0]!)).toBe(parent.id);
      }
      panel.editor.destroy();
      core.destroy();
    });
  }
}

test("parent priority and equal-priority registration order stop at the first claim", async () => {
  const core = await createTestCoreEditor({ registerWritingBlock: false });
  const panel = createTestReactEditor({
    editor: core,
    extensions: [defaultWritingBlockExtension()],
  });
  const parent = panel.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph" }] });
  const calls: string[] = [];
  for (const [label, priority, outcome] of [
    ["low", 0, "unhandled"],
    ["first", 20, "unhandled"],
    ["second", 20, "rejected"],
    ["later", 20, "unhandled"],
  ] as const) {
    panel.editor.blockBehaviors.register(
      {
        isAvailable: ({ block }) => block.id === parent.id,
        onChildOutdent: () => {
          calls.push(label);
          return outcome;
        },
      },
      priority,
    );
  }
  outdentBlocks(panel, [parent.children[0]!.id]);
  expect(calls).toEqual(["first", "second"]);
  expect(panel.blocks.getParentId(parent.children[0]!.id)).toBe(parent.id);
  panel.editor.destroy();
  core.destroy();
});

for (const action of ["onIndent", "onOutdent"] as const) {
  test(`${action} resolves the live parent and stops parent interception at one level`, async () => {
    const core = await createTestCoreEditor({ registerWritingBlock: false });
    const panel = createTestReactEditor({
      editor: core,
      extensions: [defaultWritingBlockExtension()],
    });
    const grandparent = panel.blocks.insertBlock({
      type: "paragraph",
      children: [
        { type: "paragraph", children: [{ type: "paragraph", content: "source" }] },
        { type: "paragraph" },
      ],
    });
    const [previousParent, currentParent] = grandparent.children;
    const source = previousParent!.children[0]!;
    const selection = createCaretSelection(source.id, 2);
    const context: BlockOutlineContext = {
      reactPanel: panel,
      block: panel.blocks.getBlockNode(source.id)!,
      parentId: previousParent!.id,
      selection,
    };
    panel.blocks.moveBlocks([source.id], currentParent!.id, "inside");
    const calls: string[] = [];
    const parentAction = action === "onIndent" ? "onChildIndent" : "onChildOutdent";
    panel.editor.blockBehaviors.register({
      /**
       * Makes both hooks applicable so an accidental grandparent traversal is observable.
       *
       * @param candidate - Candidate block and runtime; neither restricts this fixture.
       * @returns True for parent and child dispatch alike.
       */
      isAvailable: (candidate) => true,
      /**
       * Records the current parent context and defers to the child's handler.
       *
       * @param parentContext - Fresh parent fields resolved at dispatch time.
       * @param ids - Complete requested group, retained across parent dispatch.
       * @returns Unhandled so the original child action can continue.
       */
      [parentAction]: (parentContext: BlockOutlineContext, ids: readonly string[]) => {
        calls.push(parentContext.block.id);
        expect(parentContext.parentId).toBe(grandparent.id);
        expect(parentContext.selection).toBe(selection);
        expect(ids).toEqual([source.id]);
        return "unhandled";
      },
      /**
       * Claims the original child action after the direct parent's deferral.
       *
       * @param childContext - Original caller context, whose parent field may be stale.
       * @param ids - Unchanged requested group.
       * @returns Handled without invoking standard mutation.
       */
      [action]: (childContext: BlockOutlineContext, ids: readonly string[]) => {
        calls.push(childContext.block.id);
        expect(childContext).toBe(context);
        expect(ids).toEqual([source.id]);
        return "handled";
      },
    });
    expect(panel.editor.blockBehaviors.dispatch(action, context, [source.id])).toBe(true);
    expect(calls).toEqual([currentParent!.id, source.id]);
    expect(panel.blocks.getParentId(source.id)).toBe(currentParent!.id);
    panel.editor.destroy();
    core.destroy();
  });
}
