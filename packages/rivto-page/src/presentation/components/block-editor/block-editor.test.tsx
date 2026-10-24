import { BlockRootPlacementContext } from "../../drag-and-drop/block-root-placements";
import { BlockDropDepthContext } from "../../drag-and-drop/block-drop-item";
// jsdom has no layout observer; browser suites exercise real root measurements.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    /**
     * Accepts targets without simulating browser layout.
     *
     * @returns No measurement callbacks are scheduled in jsdom.
     */
    observe() {}
    /**
     * Leaves the layout-free observer unchanged.
     *
     * @returns No tracked target requires release.
     */
    unobserve() {}
    /**
     * Completes observer cleanup without scheduling callbacks.
     *
     * @returns The mock retains no browser resources.
     */
    disconnect() {}
  };
  window.scrollTo = jest.fn();
});

import type { BlockWrapperComponent, BlockWrapperProps } from "../block-wrapper/types";
import type { BlockEditorApi } from "../../../editor/block-editor-api";
import { BlockRow } from "../block-layout/block-row";
import { BlockSlot } from "../../slots/block-slots";
import { blockLayoutRegion } from "../block-layout/block-layout-regions";
import { BlockContent } from "../block-layout/block-content";
import { BlockBody } from "../block-layout/block-body";
import { BlockChildren } from "../block-layout/block-children";
import { BlockItem } from "../block-layout/block-item";
import { BlockDropWrapper } from "../../drag-and-drop/block-drop-wrapper";
import { BlockDropExclude } from "../../drag-and-drop/block-drop-exclude";
import { BlockDropTarget } from "../../drag-and-drop/block-drop-target";
import type { BlockChildrenItemProps } from "../block-layout/block-list";
import type { BlockLayoutProps } from "../../renderers/types";
import { renderToString } from "react-dom/server.node";
import type { BlockRenderer, BlockRendererProps } from "../../renderers/types";
import {
  act,
  createRef,
  StrictMode,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  BlockEditorAdapter,
  BlockEditorBlocks,
  BlockEditorNodeSnapshot,
} from "../../../adapter/types";
import { BlockEditorController } from "../../../editor/block-editor-controller";
import type { BlockEditorNodeApi } from "../../../editor/blocks/block-editor-node-api";
import { useBlockNode } from "../../hooks/use-block-node";
import { useBlockEditorController } from "../../hooks/use-block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { BlockEditor } from "./block-editor";
import { BlockEditorContext } from "./block-editor-context";
import { BlockList } from "../block-layout/block-list";
import { BlockListSlot, BlockCollapseSlot } from "../../slots/block-controls";
import type { BlockSlotProps } from "../../slots/types";

interface RendererMetrics {
  readonly renders: Map<string, number>;
  readonly controllers: Set<BlockEditorApi>;
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

const editors: BlockEditorController[] = [];

/**
 * Creates a host-owned instance and retains it for teardown after React unmounts.
 *
 * @param adapter - Data-only source used by this test's instance.
 * @param fallbackRenderer - Optional content component for unregistered types.
 * @returns New editor whose registrations and nodes outlive temporary view unmounts.
 */
function createEditor(
  adapter: BlockEditorAdapter,
  fallbackRenderer?: BlockRenderer,
): BlockEditorController {
  const editor = new BlockEditorController({ adapter, fallbackRenderer });
  editors.push(editor);
  return editor;
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
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
  container.remove();
});

it("shares one attached root with the host and renders its ending slot last", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  const hostRoot = createRef<HTMLDivElement>();
  adapter.setNode("a");
  adapter.setBlockIds(["a"]);
  act(() =>
    root.render(
      <BlockEditor editor={editor} ref={hostRoot} role="main" aria-label="Document">
        <button>Append block</button>
      </BlockEditor>,
    ),
  );
  expect(hostRoot.current).toBe(editor.getRoot());
  expect(hostRoot.current).toBe(container.firstElementChild);
  expect(hostRoot.current?.getAttribute("aria-label")).toBe("Document");
  expect(hostRoot.current?.lastElementChild?.textContent).toBe("Append block");
  act(() => root.render(null));
  expect(hostRoot.current).toBeNull();
  expect(editor.getRoot()).toBeNull();
});

it("registers wrapped layout regions and manually placed slots with ref cleanup", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  adapter.setNode("parent", { type: "custom", childIds: ["child"] });
  adapter.setNode("child");
  adapter.setBlockIds(["parent"]);
  const rowRef = createRef<HTMLDivElement>();
  /**
   * Composes independent slot and child wrappers under the one canonical shell.
   *
   * @returns Manual row contributions and a separately wrapped child host.
   */
  function Layout() {
    return (
      <section>
        <header>
          <BlockRow ref={rowRef} slots="manual">
            <BlockSlot position="end" />
            <BlockContent />
          </BlockRow>
        </header>
        <aside>
          <BlockSlot position="body" />
        </aside>
        <main>
          <BlockChildren />
        </main>
      </section>
    );
  }
  editor.renderers.register("custom", { layout: Layout });
  editor.slots.register({ position: "end", component: () => <span>End contribution</span> });
  editor.slots.register({ position: "body", component: () => <span>Body contribution</span> });
  act(() =>
    root.render(
      <StrictMode>
        <BlockEditor editor={editor} />
      </StrictMode>,
    ),
  );
  const shell = container.querySelector<HTMLElement>('[data-block-id="parent"]')!;
  expect(blockLayoutRegion(shell, "row")).toBe(rowRef.current);
  expect(blockLayoutRegion(shell, "children")?.parentElement?.tagName).toBe("MAIN");
  expect(blockLayoutRegion(shell, "body")?.parentElement?.tagName).toBe("ASIDE");
  expect(rowRef.current?.querySelectorAll('[data-slot-position="end"]')).toHaveLength(1);
  act(() => root.render(null));
  expect(rowRef.current).toBeNull();
  for (const role of ["shell", "row", "children", "body", "slot"] as const) {
    expect(editor.regions.get("parent", role)).toBeUndefined();
  }
});

it("renders nested blocks, reorders them, and observes an empty display list", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  const metrics = createMetrics();
  editor.renderers.register("text", { content: createRenderer(adapter, metrics) });
  adapter.setNode("a", { childIds: ["child"] });
  adapter.setNode("child", { content: "Nested" });
  adapter.setNode("b");
  adapter.setBlockIds(["a", "b"]);
  act(() => root.render(<BlockEditor editor={editor} className="host-layout" />));
  const child = container.querySelector('[data-block-id="child"]');
  expect(container.textContent).toBe("aNestedb");
  expect(container.querySelectorAll(".rivto-block-children")).toHaveLength(1);
  expect(container.firstElementChild?.className).toBe("host-layout");
  expect(child?.parentElement?.parentElement?.getAttribute("data-block-id")).toBe("a");
  const mounts = metrics.mounts;
  act(() => adapter.setBlockIds(["b", "a"]));
  expect(container.textContent).toBe("baNested");
  expect(container.querySelector('[data-block-id="child"]')).toBe(child);
  expect(metrics.mounts).toBe(mounts);
  act(() => adapter.setBlockIds([]));
  expect(container.textContent).toBe("");
  expect(adapter.subscriberCount).toBe(1);
  expect(container.querySelectorAll("[data-block-id]")).toHaveLength(0);
  act(() => adapter.setBlockIds(["a"]));
  expect(container.textContent).toBe("aNested");
});

it("displays blocks from different parents and reads their canonical insertion neighbors", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  editor.renderers.register("text", { content: createRenderer(adapter, createMetrics()) });
  adapter.setNode("parent-a", { childIds: ["a"] });
  adapter.setNode("parent-b", { childIds: ["b"] });
  adapter.setNode("a", { childIds: ["child"] });
  adapter.setNode("b");
  adapter.setNode("child");
  const ids = ["b", "a"];
  adapter.setBlockIds(ids);
  expect(adapter.blocks.getBlockIds()).toBe(ids);
  expect(adapter.blocks.getBlockIds()).toBe(ids);
  act(() => root.render(<BlockEditor editor={editor} />));
  expect(container.textContent).toBe("bachild");
  expect(container.querySelectorAll("[data-block-id]")).toHaveLength(3);
  expect(adapter.blocks.getBlockNode.mock.calls.flat()).toContain("parent-a");
  expect(container.querySelector('[data-block-id="parent-a"]')).toBeNull();
  expect(adapter.blocks.getBlockNode.mock.calls.flat()).toContain("parent-b");
  expect(container.querySelector('[data-block-id="parent-b"]')).toBeNull();
  adapter.blocks.getBlockIds.mockClear();
  act(() => adapter.setNode("a", { content: "Changed" }));
  expect(container.textContent).toBe("bChangedchild");
  expect(adapter.blocks.getBlockIds).not.toHaveBeenCalled();
});

it("keeps descendants and content asleep during parent content and selection updates", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  const metrics = createMetrics();
  editor.renderers.register("text", { content: createRenderer(adapter, metrics) });
  adapter.setNode("a", { childIds: ["child"] });
  adapter.setNode("child");
  adapter.setNode("b");
  adapter.setBlockIds(["a", "b"]);
  act(() => root.render(<BlockEditor editor={editor} />));
  const children = adapter.nodes.get("a")!.childIds;
  metrics.renders.clear();
  adapter.blocks.getBlockNode.mockClear();
  adapter.blocks.getBlockIds.mockClear();
  act(() => adapter.setNode("a", { content: "Edited" }));
  expect(container.textContent).toBe("Editedchildb");
  expect(adapter.nodes.get("a")!.childIds).toBe(children);
  expect([...metrics.renders.keys()]).toEqual(["a"]);
  expect(adapter.blocks.getBlockIds).not.toHaveBeenCalled();
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

it.each([5, 2000])("bounds one content update independently of %i displayed blocks", (count) => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  const metrics = createMetrics();
  editor.renderers.register("text", { content: createRenderer(adapter, metrics) });
  const ids = Array.from({ length: count }, (_, index) => `block-${index}`);
  for (const id of ids) {
    adapter.setNode(id);
  }
  adapter.setBlockIds(ids);
  act(() => root.render(<BlockEditor editor={editor} />));
  expect(container.querySelectorAll("[data-block-id]")).toHaveLength(count);
  const nodes = new Map(adapter.nodes);
  metrics.renders.clear();
  adapter.blocks.getBlockNode.mockClear();
  adapter.blocks.getBlockIds.mockClear();
  act(() => adapter.setNode(ids[0]!, { content: "Changed" }));
  expect(container.querySelector('[data-block-id="block-0"]')?.textContent).toBe("Changed");
  expect([...metrics.renders.entries()]).toEqual([[ids[0], 1]]);
  const reads = adapter.blocks.getBlockNode.mock.calls;
  expect(reads.length).toBeLessThanOrEqual(12);
  expect(reads.every(([id]) => id === ids[0])).toBe(true);
  expect(adapter.blocks.getBlockIds).not.toHaveBeenCalled();
  for (const id of ids.slice(1)) {
    expect(adapter.nodes.get(id)).toBe(nodes.get(id));
  }
  expect(adapter.blocks.getBlockIds()).toBe(ids);
  metrics.renders.clear();
  adapter.blocks.getBlockNode.mockClear();
  adapter.blocks.getBlockIds.mockClear();
  act(() => {
    editor.slots.register({ position: "end", component: () => <span>Slot</span> });
  });
  expect(container.querySelectorAll('[data-slot-position="end"]')).toHaveLength(count);
  expect(metrics.renders.size).toBe(0);
  expect(adapter.blocks.getBlockNode).not.toHaveBeenCalled();
  expect(adapter.blocks.getBlockIds).not.toHaveBeenCalled();
});

it("observes dynamic renderer installation and removal without disturbing other types", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  const first = createMetrics();
  const second = createMetrics();
  editor.renderers.register("text", { content: createRenderer(adapter, first) });
  adapter.setNode("a");
  adapter.setNode("other", { type: "custom", childIds: ["child"] });
  adapter.setNode("child");
  adapter.setBlockIds(["a", "other"]);
  act(() => root.render(<BlockEditor editor={editor} />));
  const shell = container.querySelector('[data-block-id="other"]');
  const controller = [...first.controllers][0];
  const mounts = first.mounts;
  first.renders.clear();
  let removeCustom: () => void;
  act(() => {
    removeCustom = editor.renderers.register("custom", {
      content: createRenderer(adapter, second, "Custom:"),
    });
  });
  expect(container.textContent).toBe("aCustom:otherchild");
  expect(first.mounts).toBe(mounts);
  expect(first.renders.size).toBe(0);
  expect([...second.controllers]).toEqual([controller]);
  act(() => removeCustom());
  expect(container.textContent).toBe("achild");
  expect(container.querySelector('[data-block-id="other"]')).toBe(shell);
  expect(second.unmounts).toBe(1);
  expect(adapter.nodes.get("other")?.type).toBe("custom");
  expect(first.mounts).toBe(mounts);
});

it("removes deleted nodes and releases their descendant subscriptions", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  editor.renderers.register("text", { content: createRenderer(adapter, createMetrics()) });
  adapter.setNode("parent", { childIds: ["child"] });
  adapter.setNode("child");
  adapter.setBlockIds(["parent"]);
  act(() => root.render(<BlockEditor editor={editor} />));
  const subscriptions = adapter.subscriberCount;
  act(() => adapter.deleteNode("parent"));
  expect(container.querySelector("[data-block-id]")).toBeNull();
  expect(adapter.subscriberCount).toBeLessThan(subscriptions);
  act(() => adapter.setNode("parent", { childIds: ["child"] }));
  expect(container.textContent).toBe("parentchild");
  act(() => root.render(null));
  expect(adapter.subscriberCount).toBe(0);
});

it("preserves the instance through StrictMode replay and releases data subscriptions on editor replacement", () => {
  const firstAdapter = new TestBlockEditorAdapter();
  const firstEditor = createEditor(firstAdapter);
  const first = createMetrics();
  firstAdapter.setNode("first");
  firstAdapter.setBlockIds(["first"]);
  firstEditor.renderers.register("text", { content: createRenderer(firstAdapter, first) });
  act(() =>
    root.render(
      <StrictMode>
        <BlockEditor editor={firstEditor} />
      </StrictMode>,
    ),
  );
  expect(container.textContent).toBe("first");
  // Stable root rows also observe list decoration for both rendering modes.
  expect(firstAdapter.subscriberCount).toBe(6);
  const controller = [...first.controllers].at(-1)!;
  expect(controller.getRoot()).toBe(container.firstElementChild);
  act(() =>
    root.render(
      <StrictMode>
        <BlockEditor editor={firstEditor} className="changed" />
      </StrictMode>,
    ),
  );
  expect([...first.controllers].at(-1)).toBe(controller);
  // Stable root rows also observe list decoration for both rendering modes.
  expect(firstAdapter.subscriberCount).toBe(6);
  const secondAdapter = new TestBlockEditorAdapter();
  const secondEditor = createEditor(secondAdapter);
  secondAdapter.setNode("second");
  secondAdapter.setBlockIds(["second"]);
  secondEditor.renderers.register("text", {
    content: createRenderer(secondAdapter, createMetrics()),
  });
  act(() =>
    root.render(
      <StrictMode>
        <BlockEditor editor={secondEditor} />
      </StrictMode>,
    ),
  );
  expect(container.textContent).toBe("second");
  expect(firstAdapter.subscriberCount).toBe(0);
  expect([...first.controllers]).toEqual([firstEditor]);
  expect(firstEditor.getRoot()).toBeNull();
  act(() => firstAdapter.setNode("first", { content: "Must stay detached" }));
  expect(container.textContent).toBe("second");
  act(() => root.render(null));
  expect(secondAdapter.subscriberCount).toBe(0);
});

it("uses the configured fallback and changes only the renderer of a converted block", () => {
  const adapter = new TestBlockEditorAdapter();
  const textMetrics = createMetrics();
  const fallbackMetrics = createMetrics();
  const Text = createRenderer(adapter, textMetrics);
  const Fallback = createRenderer(adapter, fallbackMetrics, "Unknown:");
  const editor = createEditor(adapter, Fallback);
  editor.renderers.register("text", { content: Text });
  adapter.setNode("unknown", { type: "custom", childIds: ["child"] });
  adapter.setNode("child");
  adapter.setBlockIds(["unknown"]);
  act(() => root.render(<BlockEditor editor={editor} />));
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

it("observes direct child order without rereading the display list or remounting existing children", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  const metrics = createMetrics();
  editor.renderers.register("text", { content: createRenderer(adapter, metrics) });
  adapter.setNode("parent", { childIds: ["a", "b"] });
  adapter.setNode("a");
  adapter.setNode("b");
  adapter.setBlockIds(["parent"]);
  act(() => root.render(<BlockEditor editor={editor} />));
  const child = container.querySelector('[data-block-id="a"]');
  const mounts = metrics.mounts;
  adapter.blocks.getBlockIds.mockClear();
  act(() => adapter.setNode("parent", { childIds: ["b", "a"] }));
  expect(container.textContent).toBe("parentba");
  expect(container.querySelector('[data-block-id="a"]')).toBe(child);
  expect(metrics.mounts).toBe(mounts);
  expect(adapter.blocks.getBlockIds).not.toHaveBeenCalled();
});

it("renders structural-only snapshots while content stays in the host's own source", () => {
  const source = new TestBlockEditorAdapter();
  const metrics = createMetrics();
  source.setNode("a", { content: "Host content" });
  source.setBlockIds(["a"]);
  const node: BlockEditorNodeSnapshot = { id: "a", type: "text", childIds: [] };
  const blocks: BlockEditorBlocks = {
    getRootIds: source.blocks.getRootIds,
    getParentId: source.blocks.getParentId,
    getBlockIds: source.blocks.getBlockIds,
    subscribeBlockIds: source.blocks.subscribeBlockIds,
    /**
     * Supplies only Page's structural fields without projecting host content.
     *
     * @param blockId - Requested structural node identity.
     * @returns The same minimal snapshot for a, or undefined for an inaccessible ID.
     */
    getBlockNode: jest.fn((blockId: string) => (blockId === node.id ? node : undefined)),
    subscribeBlockNode: source.blocks.subscribeBlockNode,
    updateBlockNode: source.blocks.updateBlockNode,
  };
  const adapter: BlockEditorAdapter = {
    blocks,
    selection: source.selection,
  };
  const editor = createEditor(adapter);
  editor.renderers.register("text", { content: createRenderer(source, metrics) });
  act(() => root.render(<BlockEditor editor={editor} />));
  expect(container.textContent).toBe("Host content");
  const shell = container.querySelector('[data-block-id="a"]');
  metrics.renders.clear();
  act(() => source.setNode("a", { content: "Updated by host" }));
  expect(container.textContent).toBe("Updated by host");
  expect(container.querySelector('[data-block-id="a"]')).toBe(shell);
  expect(blocks.getBlockNode("a")).toBe(node);
  expect([...metrics.renders.entries()]).toEqual([["a", 1]]);
});

it("keeps the hook's node object while React observes its changing host snapshots", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  adapter.setNode("a", { checked: false });
  adapter.setBlockIds(["a"]);
  const nodes = new Set<BlockEditorNodeApi>();
  /**
   * Uses the OOP node while React is driven by its changing snapshot subscription.
   *
   * @param props - Stable ID supplied by the shell.
   * @param props.blockId - Node observed by this renderer.
   * @returns Current checkbox state and list mode read through the live getters.
   */
  function NodeProbe({ blockId }: BlockRendererProps) {
    const node = useBlockNode(blockId);
    nodes.add(node);
    return <span>{`${String(node.checked)}:${node.listType ?? "none"}`}</span>;
  }
  editor.renderers.register("text", { content: NodeProbe });
  act(() => root.render(<BlockEditor editor={editor} />));
  expect(container.textContent).toBe("false:none");
  const node = [...nodes][0]!;
  act(() => node.setChecked(true));
  expect(container.textContent).toBe("true:none");
  act(() => node.setListType("continue_numbered_list"));
  expect(container.textContent).toBe("true:continue_numbered_list");
  act(() => node.setListType(null));
  expect(container.textContent).toBe("true:none");
  act(() => node.setColor("red"));
  expect(
    container.querySelector('[data-block-id="a"]')?.getAttribute("data-block-background"),
  ).toBe("red");
  act(() => node.setColor(null));
  expect(
    container.querySelector('[data-block-id="a"]')?.hasAttribute("data-block-background"),
  ).toBe(false);
  expect(nodes.size).toBe(1);
  expect(adapter.blocks.updateBlockNode).toHaveBeenCalledWith("a", { checked: true });
  act(() => adapter.select(["a"]));
  expect(nodes.size).toBe(1);
  act(() => root.render(null));
  expect(adapter.subscriberCount).toBe(0);
  expect(node.getSnapshot()).toBe(adapter.nodes.get("a"));
  editor.destroy();
  expect(node.getSnapshot()).toBeUndefined();
  expect(() => node.setChecked(false)).toThrow("destroyed");
});

it("filters slots by owner state and selection, preserving neighboring lifetimes", () => {
  const source = new TestBlockEditorAdapter();
  const editor = createEditor(source);
  source.setNode("a", { childIds: ["child"] });
  source.setNode("child");
  source.setBlockIds(["a"]);
  const metrics = createMetrics();
  editor.renderers.register("text", { content: createRenderer(source, metrics) });
  const unmount = jest.fn();
  /**
   * Exposes current bounded context and records destruction of this registration.
   *
   * @param props - Current owner snapshot and its bounded block context.
   * @returns A labeled contribution whose DOM identity can be checked across updates.
   */
  function Probe({ block }: BlockSlotProps) {
    useEffect(() => unmount, []);
    return <span data-slot-probe={block.id}>{block.id}</span>;
  }
  editor.slots.register({ position: "start", component: Probe });
  editor.slots.register({
    position: "end",
    component: Probe,
    when: ({ block }) => block.type === "custom",
  });
  editor.slots.register({ position: "body", component: Probe, when: ({ selected }) => selected });
  act(() => root.render(<BlockEditor editor={editor} />));
  const row = container.querySelector('[data-block-id="a"]')!;
  const probe = row.querySelector('[data-slot-position="start"] [data-slot-probe="a"]');
  expect(probe?.textContent).toBe("a");
  expect(row.querySelector('[data-slot-position="end"]')).toBeNull();
  metrics.renders.clear();
  let remove: () => void;
  act(() => {
    remove = editor.slots.register({ position: "start", component: Probe, priority: 10 });
  });
  expect(row.querySelectorAll('[data-slot-position="start"] [data-slot-probe="a"]')[1]).toBe(probe);
  expect(unmount).not.toHaveBeenCalled();
  expect(metrics.renders.size).toBe(0);
  act(() => source.select(["a"]));
  expect(row.children[1]?.getAttribute("data-slot-position")).toBe("body");
  expect(row.children[2]?.classList.contains("rivto-block-children")).toBe(true);
  act(() => remove!());
  expect(row.querySelector('[data-slot-position="start"] [data-slot-probe="a"]')).toBe(probe);
  expect(metrics.renders.size).toBe(0);
});

it("uses borrowed node commands in controls and restores collapsed descendants without copying host state", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  adapter.setNode("parent", { listType: "checkbox", childIds: ["child"] });
  adapter.setNode("child");
  adapter.setBlockIds(["parent"]);
  const metrics = createMetrics();
  editor.renderers.register("text", { content: createRenderer(adapter, metrics) });
  editor.slots.register({ position: "start", component: BlockListSlot });
  editor.slots.register({ position: "start", component: BlockCollapseSlot });
  act(() => root.render(<BlockEditor editor={editor} />));
  const controller = [...metrics.controllers][0]!;
  const child = controller.getNode("child");
  const checkbox = container.querySelector(
    '[role="checkbox"][data-block-control="checkbox"]',
  ) as HTMLButtonElement;
  act(() => checkbox.click());
  expect(adapter.nodes.get("parent")?.checked).toBe(true);
  const collapse = container.querySelector('[data-block-control="collapse"]') as HTMLButtonElement;
  const controls = collapse.getAttribute("aria-controls")!;
  expect(
    container.querySelector(`[id="${controls}"]`)?.querySelector('[data-block-id="child"]'),
  ).not.toBeNull();
  const subscriptions = adapter.subscriberCount;
  act(() => collapse.click());
  expect(adapter.nodes.get("parent")?.collapsed).toBe(true);
  expect(container.querySelector('[data-block-id="child"]')).toBeNull();
  expect(adapter.subscriberCount).toBeLessThan(subscriptions);
  expect(collapse.getAttribute("aria-expanded")).toBe("false");
  act(() => child.setColor("red"));
  act(() => collapse.click());
  expect(controller.getNode("child")).toBe(child);
  expect(
    container.querySelector('[data-block-id="child"]')?.getAttribute("data-block-background"),
  ).toBe("red");
  expect(adapter.subscriberCount).toBe(subscriptions);
});

it("releases view subscriptions while retaining independent editor registrations", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  adapter.setNode("a");
  adapter.setBlockIds(["a"]);
  editor.slots.register({ position: "body", component: () => <span>Shared</span> });
  const secondEditor = createEditor(adapter);
  secondEditor.slots.register({ position: "body", component: () => <span>Other</span> });
  const subscribe = editor.slots.subscribe.bind(editor.slots);
  const disposers: jest.Mock[] = [];
  jest.spyOn(editor.slots, "subscribe").mockImplementation((listener) => {
    const stop = jest.fn(subscribe(listener));
    disposers.push(stop);
    return stop;
  });
  act(() =>
    root.render(
      <StrictMode>
        <BlockEditor editor={editor} />
        <BlockEditor editor={secondEditor} />
      </StrictMode>,
    ),
  );
  expect(container.querySelectorAll('[data-slot-position="body"]')).toHaveLength(2);
  act(() => root.render(null));
  expect(disposers.length).toBeGreaterThanOrEqual(2);
  for (const dispose of disposers) {
    expect(dispose).toHaveBeenCalledTimes(1);
  }
  expect(editor.slots.getSnapshot()).toHaveLength(1);
  expect(secondEditor.slots.getSnapshot()).toHaveLength(1);
});

it("retains node and registration identity when the same editor view is remounted", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  adapter.setNode("a");
  adapter.setBlockIds(["a"]);
  const metrics = createMetrics();
  const Component = createRenderer(adapter, metrics);
  editor.renderers.register("text", { content: Component });
  editor.slots.register({ position: "body", component: () => <span>Retained</span> });
  const node = editor.getNode("a");
  const entries = editor.slots.getSnapshot();
  act(() => root.render(<BlockEditor editor={editor} />));
  act(() => root.render(null));
  expect(adapter.subscriberCount).toBe(0);
  expect(editor.getRoot()).toBeNull();
  node.setChecked(true);
  act(() => root.render(<BlockEditor editor={editor} />));
  expect(container.textContent).toBe("aRetained");
  expect(editor.getNode("a")).toBe(node);
  expect(editor.slots.getSnapshot()).toBe(entries);
  expect(editor.renderers.get("text")?.content).toBe(Component);
  expect(node.checked).toBe(true);
  expect([...metrics.controllers]).toEqual([editor]);
});

it("renders synchronous host snapshots on the server without subscriptions or DOM attachment", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  adapter.setNode("a", { content: "Server content" });
  adapter.setBlockIds(["a"]);
  editor.renderers.register("text", { content: createRenderer(adapter, createMetrics()) });
  const markup = renderToString(<BlockEditor editor={editor} />);
  expect(markup).toContain("Server content");
  expect(markup).toContain('data-block-id="a"');
  expect(adapter.subscriberCount).toBe(0);
  expect(editor.getRoot()).toBeNull();
});

it("lets JSX choose region order without rerendering layout during chrome or child text changes", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  adapter.setNode("parent", { type: "container", childIds: ["child"] });
  adapter.setNode("child");
  adapter.setBlockIds(["parent"]);
  const compose = jest.fn();
  /**
   * Places descendants before the owner's row using the same shared primitives.
   *
   * @param props - Stable layout identity for diagnostic composition counting.
   * @returns Children, a body contribution, and the row in caller-defined order.
   */
  function Layout({ blockId }: BlockLayoutProps) {
    compose(blockId);
    return (
      <>
        <BlockChildren />
        <BlockBody />
        <BlockRow>
          <BlockContent />
        </BlockRow>
      </>
    );
  }
  const metrics = createMetrics();
  editor.renderers.register("container", {
    layout: Layout,
    content: createRenderer(adapter, metrics),
  });
  editor.renderers.register("text", { content: createRenderer(adapter, metrics) });
  editor.slots.register({ position: "body", component: () => <span>Body</span> });
  act(() => root.render(<BlockEditor editor={editor} />));
  const owner = container.querySelector('[data-block-id="parent"]')!;
  expect(owner.firstElementChild?.classList.contains("rivto-block-children")).toBe(true);
  expect(owner.lastElementChild?.classList.contains("rivto-block-row")).toBe(true);
  expect(compose).toHaveBeenCalledTimes(1);
  act(() => adapter.select(["parent"]));
  act(() => adapter.setNode("child", { content: "Changed" }));
  act(() => editor.getNode("parent").setColor("red"));
  expect(owner.textContent).toContain("Changed");
  expect(owner.getAttribute("data-block-selected")).toBe("true");
  expect(compose).toHaveBeenCalledTimes(1);
});

it("supports headerless layouts, canonical gap props, and item wrappers without duplicate block identity", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  adapter.setNode("parent", { type: "container", childIds: ["a", "b"] });
  adapter.setNode("a", { listType: "numbered_list" });
  adapter.setNode("b");
  adapter.setBlockIds(["parent"]);
  /**
   * Places an existing node inside the package's optional placement boundary.
   *
   * @param props - Stable child identity and Page-created child element.
   * @returns One placement item containing the original child.
   */
  function Item({ children }: BlockChildrenItemProps) {
    return <BlockItem>{children}</BlockItem>;
  }
  /**
   * Omits the header and places only shared children inside the single block shell.
   *
   * @returns A canonical child list with independently targetable gaps.
   */
  function Layout() {
    return <BlockChildren item={Item} />;
  }
  editor.renderers.register("container", { layout: Layout });
  act(() => root.render(<BlockEditor editor={editor} />));
  expect(container.querySelectorAll("[data-block-id]")).toHaveLength(3);
  expect(container.querySelector('[data-block-id="parent"] > .rivto-block-row')).toBeNull();
  const item = container.querySelector(".rivto-block-item");
  expect(item?.getAttribute("data-block-list-type")).toBe("numbered_list");
  expect(item?.firstElementChild?.getAttribute("data-block-in-item")).toBe("true");
  expect(container.querySelectorAll(".rivto-block-drop-gap")).toHaveLength(0);
  const child = container.querySelector('[data-block-id="a"]');
  act(() => adapter.setNode("parent", { childIds: ["b", "a"] }));
  expect(container.querySelector('[data-block-id="a"]')).toBe(child);
});

it("replaces layouts dynamically while preserving the editor's ID-bound objects", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  adapter.setNode("a");
  adapter.setBlockIds(["a"]);
  const node = editor.getNode("a");
  act(() => root.render(<BlockEditor editor={editor} />));
  const shell = container.querySelector('[data-block-id="a"]');
  let remove: () => void;
  act(() => {
    remove = editor.renderers.register("text", {
      layout: () => (
        <section>
          Custom layout
          <BlockChildren />
        </section>
      ),
    });
  });
  expect(container.textContent).toBe("Custom layout");
  expect(container.querySelector('[data-block-id="a"]')).toBe(shell);
  act(() => remove());
  expect(container.textContent).toBe("");
  expect(editor.getNode("a")).toBe(node);
  expect(container.querySelector('[data-block-id="a"]')).toBe(shell);
});

it("updates declarative drop targets on host element replacement and cleans StrictMode registrations", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  adapter.setNode("a");
  adapter.setBlockIds(["a"]);
  const register = jest.spyOn(editor.dropTargets, "register");
  /**
   * Switches the target's native host while retaining the same owning editor.
   *
   * @param props - Existing block identity supplied by Page.
   * @returns A composed child element registered without an extra target wrapper.
   */
  function Layout({ blockId }: BlockLayoutProps) {
    const node = useBlockNode(blockId);
    return (
      <BlockDropTarget asChild destination={{ kind: "inside", parentId: blockId }}>
        {node.checked ? <section data-target="new" /> : <div data-target="old" />}
      </BlockDropTarget>
    );
  }
  editor.renderers.register("text", { layout: Layout });
  act(() =>
    root.render(
      <StrictMode>
        <BlockEditor editor={editor} />
      </StrictMode>,
    ),
  );
  const oldElement = container.querySelector('[data-target="old"]');
  act(() => editor.getNode("a").setChecked(true));
  expect(container.querySelector('[data-target="new"]')).not.toBeNull();
  expect(register.mock.calls.at(-1)?.[0].element).not.toBe(oldElement);
  act(() => root.render(null));
  expect(adapter.subscriberCount).toBe(0);
});

it("does not rebuild child gaps for text, color, selection, or slot publications", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  adapter.setNode("parent", { type: "container", childIds: ["a"] });
  adapter.setNode("a");
  adapter.setBlockIds(["parent"]);
  const register = jest.spyOn(editor.dropTargets, "register");
  editor.renderers.register("container", {
    layout: () => (
      <>
        <BlockRow />
        <BlockChildren />
      </>
    ),
  });
  act(() => root.render(<BlockEditor editor={editor} />));
  register.mockClear();
  act(() => adapter.setNode("parent", { content: "Parent text" }));
  act(() => adapter.setNode("a", { content: "Child text" }));
  act(() => editor.getNode("parent").setColor("red"));
  act(() => adapter.select(["parent"]));
  act(() => {
    editor.slots.register({ position: "end", component: () => <span>Slot</span> });
  });
  expect(register).not.toHaveBeenCalled();
  act(() => adapter.setNode("parent", { childIds: [] }));
  expect(container.querySelector('[data-block-id="a"]')).toBeNull();
});

it("keeps custom empty child regions usable and hides collapsed children even with explicit display styles", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  adapter.setNode("parent", { type: "container" });
  adapter.setBlockIds(["parent"]);
  editor.renderers.register("container", {
    layout: () => <BlockChildren style={{ display: "grid", minHeight: 64 }} />,
  });
  act(() => root.render(<BlockEditor editor={editor} />));
  const host = container.querySelector<HTMLElement>(".rivto-block-children")!;
  expect(host.style.display).toBe("grid");
  expect(host.style.minHeight).toBe("64px");
  act(() => editor.getNode("parent").setCollapsed(true));
  expect(host.hidden).toBe(true);
  expect(host.style.display).toBe("none");
  act(() => editor.getNode("parent").setCollapsed(false));
  expect(host.style.display).toBe("grid");
});

/**
 * Supplies four canonical insertion boundaries around one existing child node.
 *
 * The wrapper keeps boundaries outside the center without creating another block
 * identity or renderer traversal; canonical placement still comes from BlockChildren.
 *
 * @param props - Identity and already-rendered node supplied by the shared iterator.
 * @param props.blockId - Child ID used only to locate the fixture's placement element.
 * @param props.children - Page-owned node retaining its shell and addressed subscriptions.
 * @returns A single item with four in-flow boundary targets and the original node.
 */
function GridItem({ blockId, children }: BlockChildrenItemProps) {
  return <BlockDropWrapper data-grid-item={blockId}>{children}</BlockDropWrapper>;
}

it.each(["vertical", "horizontal", "grid"] as const)(
  "reserves only the requested %s item boundaries",
  (axis) => {
    const adapter = new TestBlockEditorAdapter();
    const editor = createEditor(adapter);
    adapter.setNode("parent", { type: "container", childIds: ["a"] });
    adapter.setNode("a");
    adapter.setBlockIds(["parent"]);
    /**
     * Reserves strips around the supplied existing child subtree.
     *
     * @param props - Page-owned child content.
     * @param props.children - Single rendered child to retain inside the item.
     * @returns One item with boundaries on the requested flow axis.
     */
    function Item({ children }: BlockChildrenItemProps) {
      return (
        <BlockDropWrapper axis={axis} style={{ "--rivto-drop-target-size": "12px" }}>
          {children}
        </BlockDropWrapper>
      );
    }
    editor.renderers.register("container", {
      layout: () => <BlockChildren dropAxis="grid" dropPlacement="siblings" item={Item} />,
    });
    act(() => root.render(<BlockEditor editor={editor} />));
    expect(container.querySelectorAll(".rivto-block-drop-wrapper-boundary")).toHaveLength(0);
    expect(container.querySelectorAll('[data-block-id="a"]')).toHaveLength(1);
    expect(
      container.querySelector(".rivto-block-drop-wrapper")?.getAttribute("data-drop-wrapper-axis"),
    ).toBe(axis);
  },
);

it("keeps grid edges item-local, updates canonical neighbors without remounting, and releases them on collapse", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  adapter.setNode("parent", { type: "container", childIds: ["a", "b"] });
  adapter.setNode("a");
  adapter.setNode("b");
  adapter.setBlockIds(["parent"]);
  const register = jest.spyOn(editor.dropTargets, "register");
  editor.renderers.register("container", {
    layout: () => <BlockChildren dropAxis="grid" item={GridItem} />,
  });
  act(() => root.render(<BlockEditor editor={editor} />));
  const item = container.querySelector('[data-grid-item="a"]')!;
  const before = item;
  const after = item;
  const beforeEntry = [...register.mock.calls]
    .reverse()
    .find(([entry]) => entry.element === before)![0];
  const afterEntry = [...register.mock.calls]
    .reverse()
    .find(([entry]) => entry.element === after)![0];
  expect(container.querySelectorAll("[data-block-id]")).toHaveLength(3);
  expect(container.querySelectorAll(".rivto-block-drop-wrapper-boundary")).toHaveLength(0);
  expect(beforeEntry.getRegions()[0]?.destination).toEqual({
    kind: "between",
    parentId: "parent",
    previousId: null,
    nextId: "a",
  });
  expect(afterEntry.getRegions()[1]?.destination).toMatchObject({ previousId: "a", nextId: "b" });
  register.mockClear();
  act(() => adapter.setNode("parent", { childIds: ["b", "a"] }));
  expect(container.querySelector('[data-grid-item="a"]')).toBe(item);
  expect(register).not.toHaveBeenCalled();
  expect(beforeEntry.getRegions()[0]?.destination).toMatchObject({ previousId: "b", nextId: "a" });
  expect(afterEntry.getRegions()[1]?.destination).toMatchObject({ previousId: "a", nextId: null });
  act(() => editor.getNode("parent").setCollapsed(true));
  expect(container.querySelectorAll(".rivto-block-drop-wrapper-boundary")).toHaveLength(0);
  act(() => root.render(null));
  expect(adapter.subscriberCount).toBe(0);
});

it("rejects wrappers without a real parent and item anchor", () => {
  expect(() => renderToString(<BlockDropWrapper />)).toThrow(
    "BlockDropWrapper requires a canonical child placement",
  );
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  adapter.setNode("a");
  adapter.setBlockIds(["a"]);
  expect(() =>
    renderToString(
      <BlockEditorContext.Provider value={editor}>
        <BlockList blockIds={["a"]} item={GridItem} />
      </BlockEditorContext.Provider>,
    ),
  ).toThrow("BlockDropWrapper requires a canonical child placement");
});

it("releases every grid registration once through StrictMode replay and view unmount", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  adapter.setNode("parent", { type: "container", childIds: ["a"] });
  adapter.setNode("a");
  adapter.setBlockIds(["parent"]);
  const register = editor.dropTargets.register.bind(editor.dropTargets);
  const releases: jest.Mock[] = [];
  jest.spyOn(editor.dropTargets, "register").mockImplementation((entry) => {
    const release = jest.fn(register(entry));
    releases.push(release);
    return release;
  });
  editor.renderers.register("container", {
    layout: () => <BlockChildren dropAxis="grid" item={GridItem} />,
  });
  act(() =>
    root.render(
      <StrictMode>
        <BlockEditor editor={editor} />
      </StrictMode>,
    ),
  );
  expect(container.querySelectorAll(".rivto-block-drop-wrapper-boundary")).toHaveLength(0);
  act(() => root.render(null));
  expect(releases.length).toBeGreaterThanOrEqual(4);
  for (const release of releases) {
    expect(release).toHaveBeenCalledTimes(1);
  }
  editor.destroy();
  for (const release of releases) {
    expect(release).toHaveBeenCalledTimes(1);
  }
});

it("reports autofocus acquired during commit before attachment, then normal focus transitions", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("a");
  adapter.setBlockIds(["a"]);
  const editor = createEditor(adapter);
  const focus = jest.fn(() => expect(editor.getRoot()).toBe(container.firstElementChild));
  const blur = jest.fn();
  editor.events.on("focus", focus);
  editor.events.on("blur", blur);
  editor.renderers.register("text", { content: () => <input autoFocus aria-label="Autofocus" /> });
  act(() => root.render(<BlockEditor editor={editor} />));
  const input = container.querySelector("input")!;
  expect(document.activeElement).toBe(input);
  expect(focus).toHaveBeenCalledTimes(1);
  act(() => input.blur());
  expect(blur).toHaveBeenCalledTimes(1);
  act(() => input.focus());
  expect(focus).toHaveBeenCalledTimes(2);
});

it("forwards wrapper refs and native placement attributes without duplicating the block shell", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("parent", { type: "container", childIds: ["a"] });
  adapter.setNode("a");
  adapter.setBlockIds(["parent"]);
  const editor = createEditor(adapter);
  const ref = createRef<HTMLDivElement>();
  editor.renderers.register("container", {
    layout: () => (
      <BlockChildren
        item={({ children }) => (
          <BlockDropWrapper
            ref={ref}
            className="host-placement"
            aria-label="Tile placement"
            style={{ width: 280 }}
          >
            {children}
          </BlockDropWrapper>
        )}
      />
    ),
  });
  act(() => root.render(<BlockEditor editor={editor} />));
  const wrapper = container.querySelector(".rivto-block-drop-wrapper")!;
  expect(ref.current).toBe(wrapper);
  expect(wrapper.classList.contains("rivto-block-item")).toBe(true);
  expect(wrapper.classList.contains("host-placement")).toBe(true);
  expect(wrapper.getAttribute("aria-label")).toBe("Tile placement");
  expect(ref.current?.style.width).toBe("280px");
  expect(wrapper.querySelectorAll('[data-block-id="a"]')).toHaveLength(1);
  expect(wrapper.querySelectorAll(".rivto-block-drop-wrapper-content")).toHaveLength(1);
  act(() => root.render(null));
  expect(ref.current).toBeNull();
});

/**
 * Creates a decorator owning an ordinary placement element around its children.
 *
 * @param refs - Records this decorator's own element and its ordinary ref-detachment notifications.
 * @returns A stable decorator owning its own DOM without reaching into the shared shell.
 */
function createElementWrapper(refs: Map<string, HTMLDivElement | null>): BlockWrapperComponent {
  /**
   * Wraps the existing chain with a counter-aware element owned by this decorator.
   *
   * @param props - Current own-node snapshot and existing render chain.
   * @param props.block - Stable ID used to retain the latest ref notification.
   * @param props.children - Remaining chain rendered exactly once.
   * @returns An ordinary BlockItem whose ref belongs only to this decorator.
   */
  return function ElementWrapper({ block, children }: BlockWrapperProps) {
    const elementRef = useCallback(
      (element: HTMLDivElement | null) => {
        refs.set(block.id, element);
      },
      [block.id],
    );
    return (
      <BlockItem block={block} ref={elementRef}>
        {children}
      </BlockItem>
    );
  };
}

it("composes decorators in priority order around exactly one shared shell", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("a");
  adapter.setBlockIds(["a"]);
  const editor = createEditor(adapter);
  const Outer = ({ children }: BlockWrapperProps) => (
    <section data-wrapper="outer">{children}</section>
  );
  const Inner = ({ children }: BlockWrapperProps) => (
    <section data-wrapper="inner">{children}</section>
  );
  editor.wrappers.register({ component: Inner, priority: 0 });
  editor.wrappers.register({ component: Outer, priority: 100 });
  act(() => root.render(<BlockEditor editor={editor} />));
  expect(
    container.querySelectorAll(
      '[data-wrapper="outer"] > [data-wrapper="inner"] > [data-block-id="a"]',
    ),
  ).toHaveLength(1);
  expect(container.querySelectorAll('[data-block-id="a"]')).toHaveLength(1);
});

it("keeps wrapper elements independent and releases their own refs on removal", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("parent", { childIds: ["child"] });
  adapter.setNode("child");
  adapter.setBlockIds(["parent"]);
  const editor = createEditor(adapter);
  const first = new Map<string, HTMLDivElement | null>();
  const second = new Map<string, HTMLDivElement | null>();
  const remove = editor.wrappers.register({
    component: createElementWrapper(first),
    priority: 100,
  });
  editor.wrappers.register({ component: createElementWrapper(second), priority: 0 });
  act(() =>
    root.render(
      <StrictMode>
        <BlockEditor editor={editor} />
      </StrictMode>,
    ),
  );
  for (const id of ["parent", "child"]) {
    const shell = container.querySelector(`[data-block-id="${id}"]`)!;
    expect(first.get(id)).not.toBe(shell);
    expect(second.get(id)).not.toBe(first.get(id));
    expect(first.get(id)?.contains(second.get(id)!)).toBe(true);
    expect(second.get(id)?.contains(shell)).toBe(true);
    expect(first.get(id)?.hasAttribute("data-block-in-item")).toBe(id === "parent");
    expect(second.get(id)?.getAttribute("data-block-in-item")).toBe("true");
    expect(shell.getAttribute("data-block-in-item")).toBe("true");
  }
  const node = editor.getNode("child");
  act(() => remove());
  expect(first.get("parent")).toBeNull();
  expect(first.get("child")).toBeNull();
  expect(second.get("parent")?.contains(container.querySelector('[data-block-id="parent"]'))).toBe(
    true,
  );
  expect(second.get("child")?.contains(container.querySelector('[data-block-id="child"]'))).toBe(
    true,
  );
  expect(editor.getNode("child")).toBe(node);
  act(() => root.render(null));
  expect(second.get("parent")).toBeNull();
  expect(second.get("child")).toBeNull();
  expect(adapter.subscriberCount).toBe(0);
});

it.each([5, 2000])(
  "keeps addressed content rendering bounded with a decorator across %i blocks",
  (count) => {
    const adapter = new TestBlockEditorAdapter();
    const ids = Array.from({ length: count }, (_, index) => `wrapped-${index}`);
    for (const id of ids) {
      adapter.setNode(id);
    }
    adapter.setBlockIds(ids);
    const editor = createEditor(adapter);
    const metrics = createMetrics();
    editor.renderers.register("text", { content: createRenderer(adapter, metrics) });
    const refs = new Map<string, HTMLDivElement | null>();
    editor.wrappers.register({ component: createElementWrapper(refs), priority: 0 });
    act(() => root.render(<BlockEditor editor={editor} />));
    const unchanged = refs.get(ids[1]);
    expect(
      adapter.blocks.subscribeBlockNode.mock.calls.filter(([id]) => id === ids[0]),
    ).toHaveLength(3);
    metrics.renders.clear();
    adapter.blocks.getBlockNode.mockClear();
    adapter.blocks.getBlockIds.mockClear();
    act(() => adapter.setNode(ids[0], { content: "Updated" }));
    expect(metrics.renders.size).toBe(1);
    expect(metrics.renders.get(ids[0])).toBe(1);
    expect(adapter.blocks.getBlockNode.mock.calls.every(([id]) => id === ids[0])).toBe(true);
    expect(adapter.blocks.getBlockNode.mock.calls.length).toBeLessThanOrEqual(12);
    expect(adapter.blocks.getBlockIds).not.toHaveBeenCalled();
    expect(refs.get(ids[1])).toBe(unchanged);
    expect(container.querySelector(`[data-block-id="${ids[0]}"]`)?.textContent).toContain(
      "Updated",
    );
  },
);

it("lets wrappers receive bubbling DOM events on their own elements", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("a");
  adapter.setBlockIds(["a"]);
  const editor = createEditor(adapter);
  const clicked: string[] = [];
  const Outer = ({ block, children }: BlockWrapperProps) => (
    <BlockItem block={block} onClick={() => clicked.push("outer")}>
      {children}
    </BlockItem>
  );
  const Inner = ({ block, children }: BlockWrapperProps) => (
    <BlockItem block={block} onClick={() => clicked.push("inner")}>
      {children}
    </BlockItem>
  );
  editor.wrappers.register({ component: Inner, priority: 0 });
  const remove = editor.wrappers.register({ component: Outer, priority: 100 });
  act(() => root.render(<BlockEditor editor={editor} />));
  act(() => container.querySelector<HTMLElement>('[data-block-id="a"]')!.click());
  expect(clicked).toEqual(["inner", "outer"]);
  clicked.length = 0;
  act(() => remove());
  act(() => container.querySelector<HTMLElement>('[data-block-id="a"]')!.click());
  expect(clicked).toEqual(["inner"]);
});

it("scopes wrapping item controls to its own row without leaking into descendants or DOM props", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  adapter.setNode("parent", { type: "container", childIds: ["a"] });
  adapter.setNode("a", { childIds: ["nested"] });
  adapter.setNode("nested");
  adapter.setBlockIds(["parent"]);
  /**
   * Supplies inside placement to one child while preserving its own subtree.
   *
   * @param props - Existing child from the shared iterator.
   * @param props.children - Block shell rendered once inside the placement item.
   * @returns A wrapping drop item with controls inside its matching row.
   */
  function Item({ children }: BlockChildrenItemProps) {
    return <BlockDropWrapper controlsPlacement="inside">{children}</BlockDropWrapper>;
  }
  editor.renderers.register("container", { layout: () => <BlockChildren item={Item} /> });
  act(() => root.render(<BlockEditor editor={editor} />));
  const child = container.querySelector('[data-block-id="a"]')!;
  expect(
    child.querySelector(":scope > .rivto-block-row")?.getAttribute("data-controls-placement"),
  ).toBe("inside");
  const nested = container.querySelector('[data-block-id="nested"]')!;
  expect(
    nested.querySelector(":scope > .rivto-block-row")?.getAttribute("data-controls-placement"),
  ).toBe("outside");
  expect(container.querySelector("[controlsPlacement]")).toBeNull();
});

it("inherits child-layout controls, permits nested resets and keeps item overrides local", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  adapter.setNode("parent", { type: "container", childIds: ["a", "reset"] });
  adapter.setNode("a", { childIds: ["nested"] });
  adapter.setNode("nested");
  adapter.setNode("reset", { type: "reset", childIds: ["outside"] });
  adapter.setNode("outside");
  adapter.setBlockIds(["parent"]);
  /**
   * Overrides one item's row without changing the inherited child-layout policy.
   *
   * @param props - Canonical child subtree supplied by the shared iterator.
   * @param props.children - Existing block rendered exactly once.
   * @returns An item whose own controls stay outside its row.
   */
  function Item({ children }: BlockChildrenItemProps) {
    return <BlockItem controlsPlacement="outside">{children}</BlockItem>;
  }
  editor.renderers.register("container", {
    layout: () => <BlockChildren controlsPlacement="inside" item={Item} />,
  });
  editor.renderers.register("reset", {
    layout: () => <BlockChildren controlsPlacement="outside" />,
  });
  act(() => root.render(<BlockEditor editor={editor} />));
  for (const [blockId, placement] of [
    ["a", "outside"],
    ["nested", "inside"],
    ["outside", "outside"],
  ]) {
    expect(
      container
        .querySelector(`[data-block-id="${blockId}"] > .rivto-block-row`)
        ?.getAttribute("data-controls-placement"),
    ).toBe(placement);
  }
  expect(container.querySelectorAll("[data-block-id]")).toHaveLength(5);
  expect(container.querySelector("[controlsPlacement]")).toBeNull();
});

it("resets inherited child controls at nested autonomous editor boundaries", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = createEditor(adapter);
  const nestedAdapter = new TestBlockEditorAdapter();
  const nestedEditor = createEditor(nestedAdapter);
  adapter.setNode("parent", { type: "container", childIds: ["embedded"] });
  adapter.setNode("embedded", { type: "embedded" });
  adapter.setBlockIds(["parent"]);
  nestedAdapter.setNode("nested-root");
  nestedAdapter.setBlockIds(["nested-root"]);
  editor.renderers.register("container", {
    layout: () => <BlockChildren controlsPlacement="inside" />,
  });
  editor.renderers.register("embedded", {
    content: () => <BlockEditor editor={nestedEditor} />,
  });
  act(() => root.render(<BlockEditor editor={editor} />));
  expect(
    container
      .querySelector('[data-block-id="embedded"] > .rivto-block-row')
      ?.getAttribute("data-controls-placement"),
  ).toBe("inside");
  expect(
    container
      .querySelector('[data-block-id="nested-root"] > .rivto-block-row')
      ?.getAttribute("data-controls-placement"),
  ).toBe("outside");
});

it("declares terminal depth on existing shells without creating insertion DOM", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("parent", { childIds: ["a", "b"] });
  adapter.setNode("a");
  adapter.setNode("b");
  adapter.rootIds = ["parent"];
  adapter.setBlockIds(["parent"]);
  const editor = createEditor(adapter);
  const register = jest.spyOn(editor.dropTargets, "register");
  act(() => root.render(<BlockEditor editor={editor} />));
  const shell = container.querySelector('[data-block-id="b"]')!;
  const entry = register.mock.calls.find(
    ([entry]) =>
      entry.element === shell && entry.getRegions().some((region) => region.kind === "edge"),
  )![0];
  const edge = entry.getRegions()[1]!;
  expect(edge.kind === "edge" && edge.depth?.destinations).toEqual([
    { kind: "between", parentId: null, previousId: "parent", nextId: null },
    { kind: "between", parentId: "parent", previousId: "b", nextId: null },
    { kind: "inside", parentId: "b" },
  ]);
  expect(
    container.querySelectorAll(".rivto-block-drop-gap, .rivto-block-outline-drop-gap"),
  ).toHaveLength(0);
  act(() => adapter.setNode("parent", { collapsed: true }));
  expect(shell.isConnected).toBe(false);
});

it("removes filtered anchors while retaining hidden canonical neighbors", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("parent", { type: "filtered", childIds: ["a", "hidden", "b"] });
  for (const id of ["a", "hidden", "b"]) {
    adapter.setNode(id);
  }
  adapter.setBlockIds(["parent"]);
  const editor = createEditor(adapter);
  const register = jest.spyOn(editor.dropTargets, "register");
  /**
   * Omits a filtered item together with its Page-owned subtree and registrations.
   *
   * @param props - Canonical identity and existing subtree.
   * @returns Visible subtree, or null for the filtered identity.
   */
  function Item({ blockId, children }: BlockChildrenItemProps) {
    return blockId === "hidden" ? null : children;
  }
  editor.renderers.register("filtered", { layout: () => <BlockChildren item={Item} /> });
  act(() => root.render(<BlockEditor editor={editor} />));
  const shell = container.querySelector('[data-block-id="b"]');
  const entry = register.mock.calls.find(
    ([entry]) =>
      entry.element === shell && entry.getRegions().some((region) => region.kind === "edge"),
  )![0];
  expect(entry.getRegions()[0]?.destination).toEqual({
    kind: "between",
    parentId: "parent",
    previousId: "hidden",
    nextId: "b",
  });
  expect(container.querySelector('[data-block-id="hidden"]')).toBeNull();
});

it("declares empty insertion on the existing editor surface without adding an empty drop element", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("hidden", { childIds: [] });
  const editor = createEditor(adapter);
  const register = jest.spyOn(editor.dropTargets, "register");
  act(() => root.render(<BlockEditor editor={editor} emptyDropParentId="hidden" />));
  const surface = container.querySelector("[data-rivto-block-editor]");
  const entry = register.mock.calls.find(([entry]) => entry.element === surface)![0];
  expect(entry.getRegions()[0]?.destination).toEqual({ kind: "inside", parentId: "hidden" });
  act(() => {
    adapter.setNode("a");
    adapter.setBlockIds(["a"]);
  });
  expect(entry.getRegions()).toEqual([]);
  expect(container.querySelector(".rivto-block-empty-drop")).toBeNull();
});

it("resets terminal depth at a nested autonomous occurrence", () => {
  const outer = new TestBlockEditorAdapter();
  outer.setNode("outer", { type: "embedding" });
  outer.rootIds = ["outer"];
  outer.setBlockIds(["outer"]);
  const inner = new TestBlockEditorAdapter();
  inner.setNode("inner");
  inner.rootIds = ["inner"];
  inner.setBlockIds(["inner"]);
  const editor = createEditor(outer);
  const nested = createEditor(inner);
  const register = jest.spyOn(nested.dropTargets, "register");
  editor.renderers.register("embedding", { content: () => <BlockEditor editor={nested} /> });
  act(() => root.render(<BlockEditor editor={editor} />));
  const shell = container.querySelector('[data-block-id="inner"]');
  const edge = register.mock.calls
    .find(
      ([entry]) =>
        entry.element === shell && entry.getRegions().some((region) => region.kind === "edge"),
    )![0]
    .getRegions()[1]!;
  expect(edge.kind === "edge" && edge.depth?.destinations).toEqual([
    { kind: "between", parentId: null, previousId: "inner", nextId: null },
    { kind: "inside", parentId: "inner" },
  ]);
});

it("retains depth context identity when unrelated roots reorder", () => {
  const adapter = new TestBlockEditorAdapter();
  for (const id of ["a", "b", "c", "parent", "d", "leaf"]) {
    adapter.setNode(id);
  }
  adapter.setNode("parent", { childIds: ["leaf"] });
  adapter.setNode("leaf", { type: "observed" });
  adapter.rootIds = ["a", "b", "c", "parent", "d"];
  adapter.setBlockIds(adapter.rootIds);
  const editor = createEditor(adapter);
  let renders = 0;
  /**
   * Counts publications to a descendant borrowing the terminal insertion levels.
   *
   * @returns No DOM; only context identity is observed.
   */
  function Content() {
    useContext(BlockDropDepthContext);
    renders += 1;
    return null;
  }
  editor.renderers.register("observed", { content: Content });
  act(() => root.render(<BlockEditor editor={editor} />));
  const before = renders;
  act(() => {
    adapter.rootIds = ["b", "a", "c", "parent", "d"];
    adapter.setBlockIds(adapter.rootIds);
  });
  expect(renders).toBe(before);
});

it.each([5, 2000])("shares canonical root reads when %i displayed roots reorder", (count) => {
  const adapter = new TestBlockEditorAdapter();
  const ids = Array.from({ length: count }, (_, index) => `root-${index}`);
  for (const id of ids) {
    adapter.setNode(id);
  }
  adapter.rootIds = ids;
  adapter.setBlockIds(ids);
  const editor = createEditor(adapter);
  let placementReads: jest.SpyInstance;
  /**
   * Counts addressed snapshot checks independently of component renders.
   *
   * @returns No DOM; the effect restores its borrowed method on unmount.
   */
  function ObserveRootReads() {
    const placements = useContext(BlockRootPlacementContext)!;
    useEffect(() => {
      placementReads = jest.spyOn(placements, "get");
      return () => placementReads.mockRestore();
    }, [placements]);
    return null;
  }
  act(() =>
    root.render(
      <BlockEditor editor={editor}>
        <ObserveRootReads />
      </BlockEditor>,
    ),
  );
  placementReads!.mockClear();
  adapter.blocks.getRootIds.mockClear();
  const parentReads = jest.spyOn(adapter.blocks, "getParentId");
  parentReads.mockClear();
  act(() => {
    adapter.rootIds = [ids[1]!, ids[0]!, ...ids.slice(2)];
    adapter.setBlockIds(adapter.rootIds);
  });
  expect(container.querySelectorAll("[data-block-id]")[0]?.getAttribute("data-block-id")).toBe(
    ids[1],
  );
  expect(adapter.blocks.getRootIds.mock.calls.length).toBeLessThanOrEqual(8);
  expect(parentReads.mock.calls.length).toBeLessThanOrEqual(8);
  expect(placementReads!.mock.calls.length).toBeLessThanOrEqual(24);
});

it.each(["primitive", "property"])(
  "toggles nested exclusion through %s inside an excluded ancestor without replacing the child",
  (kind) => {
    const adapter = new TestBlockEditorAdapter();
    adapter.setNode("a", { checked: false });
    adapter.setBlockIds(["a"]);
    const editor = createEditor(adapter);
    const inputRef = createRef<HTMLInputElement>();
    const click = jest.fn();
    /**
     * Composes a target and a switchable exclusion onto the fixture's existing elements.
     *
     * @param props - Block whose checked field toggles exclusion without replacing the child.
     * @returns One section and its input, preserving the child's ref and click handler.
     */
    function Layout({ blockId }: BlockLayoutProps) {
      const node = useBlockNode(blockId);
      return (
        <BlockDropExclude asChild>
          <div>
            <BlockDropTarget
              asChild
              destination={{ kind: "inside", parentId: blockId }}
              exclude={kind === "property" && node.checked}
            >
              <section data-target>
                <BlockDropExclude asChild exclude={kind === "primitive" && node.checked}>
                  <input ref={inputRef} data-editor-control onClick={click} />
                </BlockDropExclude>
              </section>
            </BlockDropTarget>
          </div>
        </BlockDropExclude>
      );
    }
    editor.renderers.register("text", { layout: Layout });
    act(() =>
      root.render(
        <StrictMode>
          <BlockEditor editor={editor} />
        </StrictMode>,
      ),
    );
    const input = inputRef.current!;
    const host = container.querySelector<HTMLElement>("[data-target]")!;
    jest.spyOn(host, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });
    const count = container.querySelectorAll("*").length;
    expect(editor.dropTargets.resolve(50, 50, undefined, input)?.destination.parentId).toBe("a");
    act(() => editor.getNode("a").setChecked(true));
    expect(editor.dropTargets.resolve(50, 50, undefined, input)).toBeUndefined();
    expect(inputRef.current).toBe(input);
    expect(container.querySelectorAll("*")).toHaveLength(count);
    act(() => input.click());
    expect(click).toHaveBeenCalledTimes(1);
    act(() => editor.getNode("a").setChecked(false));
    expect(editor.dropTargets.resolve(50, 50, undefined, input)?.destination.parentId).toBe("a");
    act(() => root.render(null));
    expect(inputRef.current).toBeNull();
    expect(adapter.subscriberCount).toBe(0);
  },
);

it("excludes an existing element by default without requiring an editor", () => {
  const ref = createRef<HTMLButtonElement>();
  act(() =>
    root.render(
      <BlockDropExclude asChild>
        <button ref={ref}>Control</button>
      </BlockDropExclude>,
    ),
  );
  const button = ref.current!;
  expect(container.children).toHaveLength(1);
  expect(button.hasAttribute("data-drop-inert")).toBe(true);
  act(() =>
    root.render(
      <BlockDropExclude asChild exclude={false}>
        <button ref={ref}>Control</button>
      </BlockDropExclude>,
    ),
  );
  expect(ref.current).toBe(button);
  expect(button.hasAttribute("data-drop-inert")).toBe(false);
  act(() => root.render(null));
  expect(ref.current).toBeNull();
});
