import { act, StrictMode, useCallback, useEffect, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  BlockEditorAdapter,
  BlockEditorBlocks,
  BlockEditorNode,
  BlockRenderer,
  BlockRendererProps,
} from "../../../adapter/types";
import type { BlockEditorController } from "../../../editor/block-editor-controller";
import { useBlockEditorController } from "../../hooks/use-block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { BlockEditor } from "./block-editor";

interface RendererMetrics {
  readonly renders: Map<string, number>;
  readonly controllers: Set<BlockEditorController>;
  mounts: number;
  unmounts: number;
}

/**
 * Creates independent render and lifecycle counters for a test component.
 *
 * @returns Empty counters that never participate in editor subscriptions.
 */
function createMetrics(): RendererMetrics {
  return { renders: new Map(), controllers: new Set(), mounts: 0, unmounts: 0 };
}

/**
 * Creates host-owned text presentation with its own addressed data subscription.
 *
 * @param adapter - Fixture host owning the text content outside Page structural data.
 * @param metrics - Counters recording content renders and committed lifetimes.
 * @param prefix - Visible label distinguishing dynamically installed components.
 * @returns Stable component identity to register in the fixture's live registry.
 */
function createRenderer(
  adapter: TestBlockEditorAdapter,
  metrics: RendererMetrics,
  prefix = "",
): BlockRenderer {
  /**
   * Observes one node while recording whether its content was rendered or remounted.
   *
   * @param props - Stable block identity provided by the structural shell.
   * @param props.blockId - Node whose content is observed independently of siblings.
   * @returns Text exposing the current snapshot through a content-only component.
   */
  return function TestRenderer({ blockId }: BlockRendererProps) {
    const subscribe = useCallback(
      (listener: () => void) => adapter.blocks.subscribeBlockNode(blockId, listener),
      [blockId],
    );
    const getSnapshot = useCallback(() => adapter.blocks.getBlockNode(blockId), [blockId]);
    const block = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const controller = useBlockEditorController();
    metrics.renders.set(blockId, (metrics.renders.get(blockId) ?? 0) + 1);
    metrics.controllers.add(controller);
    useEffect(() => {
      metrics.mounts += 1;
      return () => {
        metrics.unmounts += 1;
      };
    }, []);
    return (
      <span>
        {prefix}
        {block?.content}
      </span>
    );
  };
}

let container: HTMLDivElement;
let root: Root;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;

beforeAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("renders nested roots, updates their order, and distinguishes a missing owner", () => {
  const adapter = new TestBlockEditorAdapter();
  const metrics = createMetrics();
  adapter.setRenderer("text", createRenderer(adapter, metrics));
  adapter.setNode("a", { childIds: ["child"] });
  adapter.setNode("child", { content: "Nested" });
  adapter.setNode("b");
  adapter.setRoots(["a", "b"]);
  act(() => root.render(<BlockEditor adapter={adapter} className="host-layout" />));
  const child = container.querySelector('[data-block-id="child"]');
  expect(container.textContent).toBe("aNestedb");
  expect(container.firstElementChild?.className).toBe("host-layout");
  expect(child?.parentElement?.getAttribute("data-block-id")).toBe("a");
  const mounts = metrics.mounts;
  act(() => adapter.setRoots(["b", "a"]));
  expect(container.textContent).toBe("baNested");
  expect(container.querySelector('[data-block-id="child"]')).toBe(child);
  expect(metrics.mounts).toBe(mounts);
  act(() => adapter.setRoots(["b", "a"], "missing"));
  expect(container.textContent).toBe("");
  expect(adapter.subscriberCount).toBe(1);
  act(() => adapter.setRoots([]));
  expect(container.querySelectorAll("[data-block-id]")).toHaveLength(0);
  act(() => adapter.setRoots(["a"]));
  expect(container.textContent).toBe("aNested");
});

it("keeps descendants and content asleep during parent content and selection updates", () => {
  const adapter = new TestBlockEditorAdapter();
  const metrics = createMetrics();
  adapter.setRenderer("text", createRenderer(adapter, metrics));
  adapter.setNode("a", { childIds: ["child"] });
  adapter.setNode("child");
  adapter.setNode("b");
  adapter.setRoots(["a", "b"]);
  act(() => root.render(<BlockEditor adapter={adapter} />));
  const children = adapter.nodes.get("a")!.childIds;
  metrics.renders.clear();
  adapter.blocks.getBlockNode.mockClear();
  adapter.region.getSnapshot.mockClear();
  act(() => adapter.setNode("a", { content: "Edited" }));
  expect(container.textContent).toBe("Editedchildb");
  expect(adapter.nodes.get("a")!.childIds).toBe(children);
  expect([...metrics.renders.keys()]).toEqual(["a"]);
  expect(adapter.region.getSnapshot).not.toHaveBeenCalled();
  expect(adapter.blocks.getBlockNode.mock.calls.every(([id]) => id === "a")).toBe(true);
  metrics.renders.clear();
  act(() => adapter.select(["a"]));
  expect(container.querySelector('[data-block-id="a"]')?.getAttribute("data-block-selected")).toBe(
    "true",
  );
  expect(metrics.renders.size).toBe(0);
  act(() => adapter.select(["b"]));
  expect(container.querySelector('[data-block-id="a"]')?.hasAttribute("data-block-selected")).toBe(
    false,
  );
  expect(container.querySelector('[data-block-id="b"]')?.getAttribute("data-block-selected")).toBe(
    "true",
  );
  expect(metrics.renders.size).toBe(0);
});

it.each([5, 2000])("bounds one content update independently of %i mounted roots", (count) => {
  const adapter = new TestBlockEditorAdapter();
  const metrics = createMetrics();
  adapter.setRenderer("text", createRenderer(adapter, metrics));
  const ids = Array.from({ length: count }, (_, index) => `block-${index}`);
  for (const id of ids) {
    adapter.setNode(id);
  }
  adapter.setRoots(ids);
  act(() => root.render(<BlockEditor adapter={adapter} />));
  expect(container.querySelectorAll("[data-block-id]")).toHaveLength(count);
  const nodes = new Map(adapter.nodes);
  metrics.renders.clear();
  adapter.blocks.getBlockNode.mockClear();
  adapter.region.getSnapshot.mockClear();
  act(() => adapter.setNode(ids[0]!, { content: "Changed" }));
  expect(container.querySelector('[data-block-id="block-0"]')?.textContent).toBe("Changed");
  expect([...metrics.renders.entries()]).toEqual([[ids[0], 1]]);
  const reads = adapter.blocks.getBlockNode.mock.calls;
  expect(reads.length).toBeLessThanOrEqual(12);
  expect(reads.every(([id]) => id === ids[0])).toBe(true);
  expect(adapter.region.getSnapshot).not.toHaveBeenCalled();
  for (const id of ids.slice(1)) {
    expect(adapter.nodes.get(id)).toBe(nodes.get(id));
  }
  expect(adapter.region.getSnapshot().blockIds).toBe(ids);
});

it("observes dynamic renderer installation and removal without disturbing other types", () => {
  const adapter = new TestBlockEditorAdapter();
  const first = createMetrics();
  const second = createMetrics();
  adapter.setRenderer("text", createRenderer(adapter, first));
  adapter.setNode("a");
  adapter.setNode("other", { type: "custom", childIds: ["child"] });
  adapter.setNode("child");
  adapter.setRoots(["a", "other"]);
  act(() => root.render(<BlockEditor adapter={adapter} />));
  const shell = container.querySelector('[data-block-id="other"]');
  const controller = [...first.controllers][0];
  const mounts = first.mounts;
  first.renders.clear();
  act(() => adapter.setRenderer("custom", createRenderer(adapter, second, "Custom:")));
  expect(container.textContent).toBe("aCustom:otherchild");
  expect(first.mounts).toBe(mounts);
  expect(first.renders.size).toBe(0);
  expect([...second.controllers]).toEqual([controller]);
  act(() => adapter.setRenderer("custom", undefined));
  expect(container.textContent).toBe("achild");
  expect(container.querySelector('[data-block-id="other"]')).toBe(shell);
  expect(second.unmounts).toBe(1);
  expect(adapter.nodes.get("other")?.type).toBe("custom");
  expect(first.mounts).toBe(mounts);
});

it("removes deleted nodes and releases their descendant subscriptions", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setRenderer("text", createRenderer(adapter, createMetrics()));
  adapter.setNode("parent", { childIds: ["child"] });
  adapter.setNode("child");
  adapter.setRoots(["parent"]);
  act(() => root.render(<BlockEditor adapter={adapter} />));
  const subscriptions = adapter.subscriberCount;
  act(() => adapter.deleteNode("parent"));
  expect(container.querySelector("[data-block-id]")).toBeNull();
  expect(adapter.subscriberCount).toBeLessThan(subscriptions);
  act(() => adapter.setNode("parent", { childIds: ["child"] }));
  expect(container.textContent).toBe("parentchild");
  act(() => root.render(null));
  expect(adapter.subscriberCount).toBe(0);
});

it("cleans up StrictMode replay and adapter replacement without leaking the old region", () => {
  const firstAdapter = new TestBlockEditorAdapter();
  const first = createMetrics();
  firstAdapter.setNode("first");
  firstAdapter.setRoots(["first"]);
  firstAdapter.setRenderer("text", createRenderer(firstAdapter, first));
  act(() =>
    root.render(
      <StrictMode>
        <BlockEditor adapter={firstAdapter} />
      </StrictMode>,
    ),
  );
  expect(container.textContent).toBe("first");
  expect(firstAdapter.subscriberCount).toBe(5);
  const controllers = [...first.controllers];
  const controller = controllers.at(-1)!;
  expect(controller.getRoot()).toBe(container.firstElementChild);
  act(() =>
    root.render(
      <StrictMode>
        <BlockEditor adapter={firstAdapter} className="changed" />
      </StrictMode>,
    ),
  );
  expect([...first.controllers].at(-1)).toBe(controller);
  expect(firstAdapter.subscriberCount).toBe(5);
  const secondAdapter = new TestBlockEditorAdapter();
  secondAdapter.setNode("second");
  secondAdapter.setRoots(["second"]);
  secondAdapter.setRenderer("text", createRenderer(secondAdapter, createMetrics()));
  act(() =>
    root.render(
      <StrictMode>
        <BlockEditor adapter={secondAdapter} />
      </StrictMode>,
    ),
  );
  expect(container.textContent).toBe("second");
  expect(firstAdapter.subscriberCount).toBe(0);
  for (const oldController of controllers) {
    expect(oldController.getRoot()).toBeNull();
    expect(() => oldController.attach(document.createElement("div"))).toThrow("destroyed");
  }
  act(() => firstAdapter.setNode("first", { content: "Must stay detached" }));
  expect(container.textContent).toBe("second");
  act(() => root.render(null));
  expect(secondAdapter.subscriberCount).toBe(0);
});

it("uses a configured fallback and changes only the renderer of a converted block", () => {
  const adapter = new TestBlockEditorAdapter();
  const textMetrics = createMetrics();
  const fallbackMetrics = createMetrics();
  const Text = createRenderer(adapter, textMetrics);
  const Fallback = createRenderer(adapter, fallbackMetrics, "Unknown:");
  adapter.renderers.get.mockImplementation((type) => (type === "text" ? Text : Fallback));
  adapter.setNode("unknown", { type: "custom", childIds: ["child"] });
  adapter.setNode("child");
  adapter.setRoots(["unknown"]);
  act(() => root.render(<BlockEditor adapter={adapter} />));
  expect(container.textContent).toBe("Unknown:unknownchild");
  expect(adapter.nodes.get("unknown")?.type).toBe("custom");
  const child = container.querySelector('[data-block-id="child"]');
  textMetrics.renders.clear();
  act(() => adapter.setNode("unknown", { type: "text" }));
  expect(container.textContent).toBe("unknownchild");
  expect(fallbackMetrics.unmounts).toBe(1);
  expect([...textMetrics.renders.keys()]).toEqual(["unknown"]);
  expect(container.querySelector('[data-block-id="child"]')).toBe(child);
});

it("observes direct child order without rebuilding roots or remounting existing children", () => {
  const adapter = new TestBlockEditorAdapter();
  const metrics = createMetrics();
  adapter.setRenderer("text", createRenderer(adapter, metrics));
  adapter.setNode("parent", { childIds: ["a", "b"] });
  adapter.setNode("a");
  adapter.setNode("b");
  adapter.setRoots(["parent"]);
  act(() => root.render(<BlockEditor adapter={adapter} />));
  const child = container.querySelector('[data-block-id="a"]');
  const mounts = metrics.mounts;
  adapter.region.getSnapshot.mockClear();
  act(() => adapter.setNode("parent", { childIds: ["b", "a"] }));
  expect(container.textContent).toBe("parentba");
  expect(container.querySelector('[data-block-id="a"]')).toBe(child);
  expect(metrics.mounts).toBe(mounts);
  expect(adapter.region.getSnapshot).not.toHaveBeenCalled();
});

it("renders structural-only snapshots while content stays in the host's own source", () => {
  const source = new TestBlockEditorAdapter();
  const metrics = createMetrics();
  source.setNode("a", { content: "Host content" });
  source.setRoots(["a"]);
  source.setRenderer("text", createRenderer(source, metrics));
  const node: BlockEditorNode = { id: "a", type: "text", childIds: [] };
  const blocks: BlockEditorBlocks = {
    /**
     * Supplies only Page's structural fields without projecting host content.
     *
     * @param blockId - Requested structural node identity.
     * @returns The same minimal snapshot for a, or undefined outside this region.
     */
    getBlockNode: jest.fn((blockId: string) => (blockId === node.id ? node : undefined)),
    subscribeBlockNode: source.blocks.subscribeBlockNode,
  };
  const adapter: BlockEditorAdapter = {
    blocks,
    region: source.region,
    selection: source.selection,
    renderers: source.renderers,
  };
  act(() => root.render(<BlockEditor adapter={adapter} />));
  expect(container.textContent).toBe("Host content");
  const shell = container.querySelector('[data-block-id="a"]');
  metrics.renders.clear();
  act(() => source.setNode("a", { content: "Updated by host" }));
  expect(container.textContent).toBe("Updated by host");
  expect(container.querySelector('[data-block-id="a"]')).toBe(shell);
  expect(blocks.getBlockNode("a")).toBe(node);
  expect([...metrics.renders.entries()]).toEqual([["a", 1]]);
});
