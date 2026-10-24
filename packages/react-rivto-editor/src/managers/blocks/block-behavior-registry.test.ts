import { createCaretSelection } from "@chulane/rivto";
import { createBlockBehaviorContext } from "../../block-behaviors/utils/context";
import { DefaultBlockBehavior } from "../../block-behaviors/default-block-behavior";
import type {
  BlockBehavior,
  BlockBehaviorAvailabilityContext,
  BlockBehaviorOutcome,
} from "../../block-behaviors/types";
import {
  defaultWritingBlockExtension,
  listShortcutsExtension,
} from "../../extensions/built-ins/built-ins";
import { createTableBlockInput, tableExtension } from "../../extensions/containers/table/table";
import { firstKeyboardTarget } from "../keyboard/selection";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";

/** @returns An owned headless panel, block, and action/applicability contexts for registry tests. */
async function fixture() {
  const core = await createTestCoreEditor({ registerWritingBlock: false });
  const panel = createTestReactEditor({
    editor: core,
    extensions: [defaultWritingBlockExtension()],
  });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "text" });
  const selection = createCaretSelection(block.id, 2);
  const context = createBlockBehaviorContext(panel, block.id, {} as HTMLElement, selection)!;
  const registry = panel.editor.blockBehaviors;
  const availability: BlockBehaviorAvailabilityContext = {
    editor: panel.editor,
    block,
  };
  const generic = registry.resolveAll(availability)[0]!;
  return { core, panel, block, context, registry, availability, generic };
}

/** @param methods - Focused behavior methods. @returns An always-available instance unless explicitly restricted. */
function behavior(methods: Partial<BlockBehavior> = {}): BlockBehavior {
  return { isAvailable: () => true, ...methods };
}

test.each(["handled", "rejected"] as const)(
  "dispatch preserves priority and tie order, stopping at %s",
  async (outcome) => {
    const { core, panel, context, registry } = await fixture();
    const calls: string[] = [];
    /** @param name - Handler identity. @param result - Configured outcome. @returns Recording split behavior. */
    const record = (name: string, result: BlockBehaviorOutcome = "unhandled") =>
      behavior({
        /** @returns The configured outcome after recording invocation. */
        onSplit() {
          calls.push(name);
          return result;
        },
      });
    registry.register(record("shared"), -100);
    registry.register(record("typed"));
    registry.register(record("first", outcome), 20);
    registry.register(record("second"), 20);
    registry.register(record("global override"), 30);
    expect(registry.dispatch("onSplit", context, firstKeyboardTarget(context.selection!)!)).toBe(
      true,
    );
    expect(calls).toEqual(["global override", "first"]);
    panel.editor.destroy();
    core.destroy();
  },
);

test("omitted methods defer and inherited handlers are invoked normally without fallback exceptions", async () => {
  const { core, panel, block, context, registry } = await fixture();
  const calls: string[] = [];
  class RecordingBehavior implements BlockBehavior {
    /** @returns True for this operation. */
    isAvailable(): boolean {
      return true;
    }
    /** @returns Unhandled after recording the inherited method. */
    onSplit(): BlockBehaviorOutcome {
      calls.push("inherited");
      return "unhandled";
    }
  }
  class InheritedBehavior extends RecordingBehavior {}
  registry.register(new InheritedBehavior());
  registry.register(behavior());
  registry.register(
    behavior({
      onSplit: () => {
        calls.push("typed");
        return "unhandled";
      },
    }),
  );
  registry.register(
    behavior({
      onSplit: () => {
        calls.push("shared");
        return "handled";
      },
    }),
    -100,
  );
  registry.dispatch("onSplit", context, firstKeyboardTarget(context.selection!)!);
  expect(calls).toEqual(["inherited", "typed", "shared"]);
  expect(panel.blocks.getRootIds()).toEqual([block.id]);
  expect(panel.blocks.getBlockNode(block.id)?.content).toBe("text");
  panel.editor.destroy();
  core.destroy();
});

test("disposal removes only its registration and extension cleanup removes the rest", async () => {
  const { core, panel, registry, availability, generic } = await fixture();
  const shared = behavior();
  const first = behavior();
  const second = behavior();
  let releaseFirst: () => void = () => undefined;
  const remove = panel.editor.extensions.install({
    id: "chain.test",
    /** @param runtime - Owner whose cleanup releases its exact registrations. */
    setup(runtime) {
      runtime.blockBehaviors.register(shared, -100);
      releaseFirst = runtime.blockBehaviors.register(first);
      runtime.blockBehaviors.register(second);
    },
  });
  expect(registry.resolveAll(availability)).toEqual([first, second, shared, generic]);
  const higher = behavior();
  const release = registry.register(higher, 10);
  expect(registry.resolveAll(availability)).toEqual([higher, first, second, shared, generic]);
  release();
  release();
  expect(registry.resolveAll(availability)[0]).toBe(first);
  releaseFirst();
  releaseFirst();
  expect(registry.resolveAll(availability)).toEqual([second, shared, generic]);
  remove();
  expect(registry.resolveAll(availability)).toEqual([generic]);
  panel.editor.destroy();
  core.destroy();
});

test("visibility and movement permissions retain false vetoes regardless of priority", async () => {
  const { core, panel, block, registry } = await fixture();
  const release = registry.register(
    behavior({ childrenVisible: () => false, canMove: () => false }),
    -100,
  );
  registry.register(behavior({ childrenVisible: () => true, canMove: () => true }), 100);
  let laterChecks = 0;
  registry.register(
    behavior({
      canMove: () => {
        laterChecks++;
        return true;
      },
    }),
    -200,
  );
  expect(registry.childrenVisible(block)).toBe(false);
  expect(registry.canMove({ destination: { parentId: block.id }, sources: [block] })).toBe(false);
  expect(laterChecks).toBe(0);
  release();
  expect(registry.childrenVisible(block)).toBe(true);
  expect(registry.canMove({ destination: { parentId: block.id }, sources: [block] })).toBe(true);
  expect(laterChecks).toBe(1);
  panel.editor.destroy();
  core.destroy();
});

test("drag geometry is owned by a type registration and cleaned up on disposal or rollback", async () => {
  const { core, panel } = await fixture();
  const types = panel.editor.blockTypes;
  const registration = {
    definition: {
      type: "geometry",
      title: "Geometry",
      metadata: {
        ["test.geometry"]: { dropAxis: "horizontal" as const },
      },
    },
    render: panel.editor.renderers.get("paragraph")!,
  };
  const release = types.register(registration);
  expect(types.getDefinition("geometry")?.metadata?.["test.geometry"]).toEqual(
    registration.definition.metadata["test.geometry"],
  );
  expect(types.getDefinition("missing")?.metadata?.["test.geometry"]).toBeUndefined();
  release();
  expect(types.getDefinition("geometry")?.metadata?.["test.geometry"]).toBeUndefined();
  panel.editor.slashCommands.register({
    id: "conflict",
    title: "Existing",
    execute: () => undefined,
  });
  expect(() =>
    types.register({ ...registration, slashCommand: { id: "conflict", title: "Conflict" } }),
  ).toThrow();
  expect(types.getDefinition("geometry")?.metadata?.["test.geometry"]).toBeUndefined();
  expect(panel.editor.renderers.has("geometry")).toBe(false);
  types.register(registration);
  panel.editor.destroy();
  expect(types.getDefinition("geometry")?.metadata?.["test.geometry"]).toBeUndefined();
  core.destroy();
});

test("registration rejects nonfinite priorities without adding behaviors", async () => {
  const { core, panel, registry, availability, generic } = await fixture();
  expect(() => registry.register(behavior(), NaN)).toThrow("priority");
  expect(() => registry.register(behavior(), Infinity)).toThrow("priority");
  expect(registry.resolveAll(availability)).toEqual([generic]);
  panel.editor.destroy();
  core.destroy();
});

test("table-cell Enter remains specialized before shared list handling", async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
  const core = await createTestCoreEditor({ registerWritingBlock: false });
  const panel = createTestReactEditor({
    editor: core,
    extensions: [defaultWritingBlockExtension(), listShortcutsExtension(), tableExtension()],
  });
  try {
    const table = panel.blocks.insertBlock(createTableBlockInput());
    const cell = table.children[0]!.children[0]!;
    panel.blocks.updateBlock(cell.id, { listProps: { type: "checkbox", checked: true } });
    const selection = createCaretSelection(cell.id, 0);
    const context = createBlockBehaviorContext(panel, cell.id, {} as HTMLElement, selection)!;
    core.history.clear();
    expect(
      core.history.batchUpdates(() =>
        panel.editor.blockBehaviors.dispatch("onSplit", context, firstKeyboardTarget(selection)!),
      ),
    ).toBe(true);
    expect(panel.blocks.getBlockNode(cell.id)?.listProps).toMatchObject({
      type: "checkbox",
      checked: true,
    });
    expect(panel.blocks.getBlockNode(cell.id)?.childIds).toHaveLength(1);
    core.history.undo();
    expect(panel.blocks.getBlockNode(cell.id)?.childIds).toHaveLength(0);
  } finally {
    panel.editor.destroy();
    core.destroy();
    globalThis.requestAnimationFrame = originalFrame;
  }
});

test("block availability is shared across methods and reevaluated for changed data", async () => {
  const { core, panel, block, registry, context, availability, generic } = await fixture();
  const calls: string[] = [];
  const conditional = behavior({
    isAvailable: (context) => {
      expect(Object.keys(context).sort()).toEqual(["block", "editor"]);
      return context.block.props.enabled === true;
    },
    onSplit: () => {
      calls.push("split");
      return "handled";
    },
    childrenVisible: (block) => {
      expect(block.props.enabled).toBe(true);
      calls.push("visibility");
      return true;
    },
  });
  registry.register(conditional);
  expect(registry.resolveAll(availability)).toEqual([generic]);
  expect(registry.childrenVisible(block)).toBe(true);
  expect(calls).toEqual([]);
  panel.blocks.updateBlock(block.id, { props: { enabled: true } });
  const enabled = panel.blocks.getBlockNode(block.id)!;
  expect(registry.resolveAll({ ...availability, block: enabled })).toEqual([conditional, generic]);
  expect(registry.childrenVisible(enabled)).toBe(true);
  expect(
    registry.dispatch(
      "onSplit",
      { ...context, block: panel.blocks.getBlock(block.id)! },
      firstKeyboardTarget(context.selection!)!,
    ),
  ).toBe(true);
  expect(calls).toEqual(["visibility", "split"]);
  panel.blocks.updateBlock(block.id, { props: { enabled: false } });
  expect(
    registry.resolveAll({ ...availability, block: panel.blocks.getBlockNode(block.id)! }),
  ).toEqual([generic]);
  expect(panel.blocks.getRootIds()).toEqual([block.id]);
  panel.editor.destroy();
  core.destroy();
});

test("move contexts retain foreign source data and resolve only the destination parent", async () => {
  const { core, panel, block, registry } = await fixture();
  const source = { ...block, type: "foreign", props: { accepted: true } };
  const checks: string[] = [];
  const release = registry.register(
    behavior({
      isAvailable: ({ editor, block: candidate }) => {
        expect(editor).toBe(panel.editor);
        if (candidate.type === "foreign") {
          expect(candidate).toBe(source);
          return true;
        }
        return false;
      },
      canMove: (context) => {
        checks.push("source");
        expect(context.sources[0]).toBe(source);
        return context.parent?.type === "paragraph";
      },
    }),
  );
  registry.register(
    behavior({
      isAvailable: ({ block }) => block.type === "paragraph",
      canMove: (context) => {
        checks.push("destination");
        expect(Object.keys(context).sort()).toEqual(["destination", "editor", "parent", "sources"]);
        expect(context.parent?.id).toBe(block.id);
        expect(context.sources[0]).toBe(source);
        return context.sources[0]?.props.accepted === true;
      },
    }),
  );
  expect(registry.canMove({ destination: { parentId: block.id }, sources: [source] })).toBe(true);
  source.props.accepted = false;
  expect(registry.canMove({ destination: { parentId: block.id }, sources: [source] })).toBe(false);
  expect(registry.canMove({ destination: { parentId: null }, sources: [source] })).toBe(false);
  expect(checks).toEqual(["source", "destination", "source", "destination", "source"]);
  release();
  expect(registry.canMove({ destination: { parentId: null }, sources: [source] })).toBe(true);
  expect(registry.canMove({ destination: { parentId: "missing" }, sources: [source] })).toBe(false);
  expect(registry.canMove({ destination: { parentId: null }, sources: [] })).toBe(false);
  expect(
    registry.canMove({ destination: { parentId: null, beforeId: "missing" }, sources: [source] }),
  ).toBe(false);
  expect(
    registry.canMove({
      destination: { parentId: block.id, beforeId: block.id },
      sources: [source],
    }),
  ).toBe(false);
  expect(
    registry.canMove({ destination: { parentId: null, beforeId: block.id }, sources: [source] }),
  ).toBe(true);
  panel.editor.destroy();
  core.destroy();
});

test("move applicability uses block fields and calls each matching registration once", async () => {
  const { core, panel, block, registry } = await fixture();
  try {
    const first = { ...block, props: { source: true } };
    const second = { ...block, id: "foreign-second", props: { source: true } };
    panel.blocks.updateBlock(block.id, { props: { receiver: true } });
    const checks: string[] = [];
    registry.register(
      behavior({
        isAvailable: (context) => {
          expect(Object.keys(context).sort()).toEqual(["block", "editor"]);
          return context.block.type === "paragraph";
        },
        canMove: ({ sources, parent }) => {
          checks.push("matches sources and receiver");
          expect(sources).toEqual([first, second]);
          expect(parent?.props.receiver).toBe(true);
          return true;
        },
      }),
      20,
    );
    registry.register(
      behavior({
        isAvailable: ({ block }) => block.props.receiver === true,
        canMove: () => {
          checks.push("receiver only");
          return true;
        },
      }),
      10,
    );
    registry.register(
      behavior({
        isAvailable: ({ block }) => block.props.source === true,
        canMove: () => {
          checks.push("sources only");
          return true;
        },
      }),
    );
    registry.register(
      behavior({
        isAvailable: () => false,
        canMove: () => {
          throw new Error("unavailable move hook");
        },
      }),
    );
    const reads: string[] = [];
    const readNode = panel.editor.blocks.getBlockNode.bind(panel.editor.blocks);
    panel.editor.blocks.getBlockNode = (id) => {
      reads.push(id);
      return readNode(id);
    };
    const request = { sources: [first, second], destination: { parentId: block.id } };
    const before = panel.blocks.getBlock(block.id);
    reads.length = 0;
    expect(registry.canMove(request)).toBe(true);
    expect(checks).toEqual(["matches sources and receiver", "receiver only", "sources only"]);
    expect(reads).toEqual([block.id]);
    expect(panel.blocks.getBlock(block.id)).toEqual(before);
  } finally {
    panel.editor.destroy();
    core.destroy();
  }
});

test.each(["unhandled", "handled", "rejected"] as const)(
  "structural dispatch visits selected blocks in order and %s claims the complete group",
  async (outcome) => {
    const { core, panel, block, context, registry } = await fixture();
    core.blockRegistry.defineBlock({ type: "special" });
    const second = panel.blocks.insertBlock({
      type: "special",
      content: "second",
      children: [{ type: "paragraph", content: "nested" }],
    });
    const third = panel.blocks.insertBlock({ type: "paragraph", content: "third" });
    const ids = ["missing", block.id, second.id, third.id];
    const before = panel.blocks.getBlocks();
    const calls: string[] = [];
    registry.register(
      behavior({
        /**
         * Records the shared handler's first matching block and defers for the whole group.
         *
         * @param current - First selected block's full context.
         * @param selected - Complete group, including IDs absent from the document.
         * @returns Unhandled so later distinct handlers can participate.
         */
        onStructuralDelete(current, selected) {
          calls.push(`shared:${current.block.id}`);
          expect(current).toBe(context);
          expect(selected).toBe(ids);
          return "unhandled";
        },
      }),
      30,
    );
    registry.register(
      behavior({
        /**
         * Selects the special block using shallow live fields on both applicability checks.
         *
         * @param availability - Candidate fields and registry runtime.
         * @returns Whether the candidate is the seeded special block.
         */
        isAvailable(availability) {
          expect("children" in availability.block).toBe(false);
          return availability.block.type === "special";
        },
        /**
         * Claims or defers the entire group from its first matching selected block.
         *
         * @param current - Special block's full snapshot and original operation context.
         * @param selected - Unchanged complete group supplied by the caller.
         * @returns The configured outcome for this group.
         */
        onStructuralDelete(current, selected) {
          calls.push(`special:${current.block.id}`);
          expect(current.block).toEqual(second);
          expect(current.selection).toBe(context.selection);
          expect(current.root).toBe(context.root);
          expect(current.reactPanel).toBe(panel);
          expect(selected).toBe(ids);
          return outcome;
        },
      }),
      20,
    );
    registry.register(
      behavior({
        /**
         * Selects only the last block even though this registration has higher priority.
         *
         * @param availability - Current candidate block fields.
         * @returns Whether the candidate is the group's final existing block.
         */
        isAvailable(availability) {
          return availability.block.id === third.id;
        },
        /**
         * Records the final block after earlier selected blocks have all deferred.
         *
         * @param current - Final selected block's full context.
         * @param selected - Complete group retained across all calls.
         * @returns Unhandled so generic selection deletion remains available to the caller.
         */
        onStructuralDelete(current, selected) {
          calls.push(`third:${current.block.id}`);
          expect(selected).toBe(ids);
          return "unhandled";
        },
      }),
      100,
    );
    const expected = [`shared:${block.id}`, `special:${second.id}`];
    if (outcome === "unhandled") {
      expected.push(`third:${third.id}`);
    }
    for (let request = 0; request < 2; request++) {
      calls.length = 0;
      expect(registry.dispatch("onStructuralDelete", context, ids)).toBe(outcome !== "unhandled");
      expect(calls).toEqual(expected);
      expect(panel.blocks.getBlocks()).toEqual(before);
    }
    panel.editor.destroy();
    core.destroy();
  },
);

test.each([{ ids: [] }, { ids: ["missing"] }])(
  "structural dispatch ignores an absent group %j",
  async ({ ids }) => {
    const { core, panel, block, context, registry } = await fixture();
    const calls: string[] = [];
    registry.register(
      behavior({
        /**
         * Records an unexpected invocation for a group containing no existing blocks.
         *
         * @param current - Block context that must not be dispatched for this request.
         * @param selected - Empty or entirely missing group.
         * @returns Handled to expose any accidental dispatch through its return value.
         */
        onStructuralDelete(current, selected) {
          calls.push(current.block.id);
          return "handled";
        },
      }),
    );
    expect(registry.dispatch("onStructuralDelete", context, ids)).toBe(false);
    expect(calls).toEqual([]);
    expect(panel.blocks.getRootIds()).toEqual([block.id]);
    panel.editor.destroy();
    core.destroy();
  },
);

test("rolls back a behavior when live presentation observers reject publication", async () => {
  const { core, panel, registry, availability } = await fixture();
  const previous = registry.resolveAll(availability);
  const failure = new Error("presentation subscription failed");
  const stop = registry.subscribe(() => {
    throw failure;
  });
  expect(() => registry.register(behavior(), 100)).toThrow(AggregateError);
  expect(registry.resolveAll(availability)).toEqual(previous);
  stop();
  panel.editor.destroy();
  core.destroy();
});
