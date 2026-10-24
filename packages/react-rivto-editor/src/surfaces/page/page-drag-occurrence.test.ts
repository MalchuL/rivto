/** @jest-environment ./jest-browser-environment.mjs */
import { ChildrenPanel, createStructuralSelection } from "@chulane/rivto";
import { ReactPanel } from "../../panels/react-panel";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { PageBlockDrag } from "./page-block-drag";
import {
  crossDocumentPageRootControllers,
  CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE,
} from "../../extensions/block-drag/cross-document/target";

/** Owns a real receiving registration without adding another event or rendering runtime. */
class DragAttachment {
  readonly root = document.createElement("div");
  readonly drag: PageBlockDrag;
  private readonly detach: () => void;

  /**
   * Attaches a host adapter to a fixture-owned DOM root.
   *
   * @param panel - Borrowed panel whose lifecycle remains with the test.
   */
  constructor(panel: ReactPanel) {
    document.body.append(this.root);
    this.drag = new PageBlockDrag(panel);
    this.detach = this.drag.attach(this.root, {
      /**
       * Leaves geometry unused while these cases exercise registry-bound commands.
       *
       * @returns No hit; each test supplies an explicit canonical destination.
       */
      resolve: () => undefined,
    });
  }

  /**
   * Reads the registry identity used by real foreign Page gestures.
   *
   * @returns The current receiving attachment, which remains stable until cleanup.
   */
  get scope() {
    return crossDocumentPageRootControllers.get(this.root)!;
  }

  /**
   * Releases registration before removing its borrowed DOM identity.
   *
   * @returns Receiver listeners and feedback are released; the panel remains borrowed.
   */
  destroy(): void {
    this.detach();
    this.root.remove();
  }
}

it("moves a mixed-parent group between panels of one document in one undo item", async () => {
  const core = await createTestCoreEditor();
  const source = createTestReactEditor({ editor: core });
  const first = core.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph" }] });
  const second = core.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph" }] });
  const parent = core.blocks.insertBlock({ type: "paragraph" });
  const receiver = new ReactPanel(
    source.editor,
    new ChildrenPanel(core, { rootBlockId: parent.id }),
  );
  const attachment = new DragAttachment(receiver);
  const drag = new PageBlockDrag(source);
  const ids = [second.children[0]!.id, first.children[0]!.id];
  source.selection.set(createStructuralSelection(ids));
  core.history.clear();
  try {
    expect(drag.moveBlocks(ids, { kind: "inside", parentId: parent.id }, attachment.scope)).toBe(
      true,
    );
    expect(core.blocks.getChildIds(parent.id)).toEqual([...ids].reverse());
    // Unmounted panels share core selection; DOM focus assigns the active occurrence.
    expect(core.selection.get()?.blocks.map(({ id }) => id)).toEqual([...ids].reverse());
    expect(receiver.selection.get()?.blocks.map(({ id }) => id)).toEqual([...ids].reverse());
    core.history.undo();
    expect(core.blocks.getChildIds(first.id)).toEqual([ids[1]]);
    expect(core.blocks.getChildIds(second.id)).toEqual([ids[0]]);
    expect(core.blocks.getChildIds(parent.id)).toEqual([]);
    core.history.redo();
    expect(core.blocks.getChildIds(parent.id)).toEqual([...ids].reverse());
  } finally {
    attachment.destroy();
    receiver.destroy();
    source.editor.destroy();
    core.destroy();
  }
});

it("transfers to empty documents and rejects descendant collisions and detached destinations", async () => {
  const left = await createTestCoreEditor();
  const right = await createTestCoreEditor();
  const source = createTestReactEditor({ editor: left });
  const receiver = createTestReactEditor({ editor: right });
  left.blocks.insertBlock({
    id: "source",
    type: "paragraph",
    children: [{ id: "child", type: "paragraph" }],
  });
  right.blocks.insertBlock({ id: "child", type: "paragraph" });
  const attachment = new DragAttachment(receiver);
  const drag = new PageBlockDrag(source);
  const scope = attachment.scope;
  const destination = { kind: "inside" as const, parentId: null };
  try {
    expect(drag.canMove(["source"], destination, scope)).toBe(false);
    expect(left.blocks.hasBlock("source")).toBe(true);
    right.blocks.removeBlock("child");
    expect(drag.canMove(["source"], destination, scope)).toBe(true);
    expect(drag.moveBlocks(["source"], destination, scope)).toBe(true);
    expect(left.blocks.getRootIds()).toEqual([]);
    expect(right.blocks.getRootIds()).toEqual(["source"]);
    expect(right.blocks.getChildIds("source")).toEqual(["child"]);
    attachment.destroy();
    expect(drag.canMove(["source"], destination, scope)).toBe(false);
  } finally {
    attachment.destroy();
    source.editor.destroy();
    receiver.editor.destroy();
    left.destroy();
    right.destroy();
  }
});

it("keeps a replacement root registration when an older disposer runs", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const first = new DragAttachment(panel);
  const oldScope = first.scope;
  const replacement = new PageBlockDrag(panel);
  const detach = replacement.attach(first.root, {
    /**
     * Keeps geometry out of the attachment identity assertion.
     *
     * @returns No target for this lifecycle-only fixture.
     */
    resolve: () => undefined,
  });
  const newScope = first.scope;
  try {
    oldScope.onDetach(() => {
      expect(crossDocumentPageRootControllers.get(first.root)).toBe(newScope);
    });
    first.destroy();
    expect(crossDocumentPageRootControllers.get(first.root)).toBe(newScope);
    expect(first.root.hasAttribute(CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE)).toBe(true);
  } finally {
    detach();
    panel.editor.destroy();
    core.destroy();
  }
});

it("notifies all attached sources even when one cancellation throws", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const attachment = new DragAttachment(panel);
  const scope = attachment.scope;
  const failure = new Error("source cancellation failed");
  let notified = false;
  scope.onDetach(() => {
    throw failure;
  });
  scope.onDetach(() => {
    notified = true;
  });
  try {
    expect(() => attachment.destroy()).toThrow(AggregateError);
    expect(notified).toBe(true);
    expect(crossDocumentPageRootControllers.get(attachment.root)).toBeUndefined();
    expect(attachment.root.hasAttribute(CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE)).toBe(false);
    expect(() => attachment.destroy()).not.toThrow();
  } finally {
    attachment.destroy();
    panel.editor.destroy();
    core.destroy();
  }
});

it("keeps edge hits within their registered occurrence until its attachment is removed", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const source = new DragAttachment(panel);
  const nested = new DragAttachment(panel);
  source.root.append(nested.root);
  const hit = document.createElement("span");
  nested.root.append(hit);
  Object.defineProperty(nested.root, "getBoundingClientRect", {
    value: () => ({ top: 100, bottom: 200, height: 100 }),
  });
  try {
    expect(crossDocumentPageRootControllers.resolve(source.root, { x: 10, y: 150 }, hit)).toBe(
      nested.scope,
    );
    expect(crossDocumentPageRootControllers.resolve(source.root, { x: 10, y: 101 }, hit)).toBe(
      nested.scope,
    );
    nested.destroy();
    source.root.append(hit);
    expect(crossDocumentPageRootControllers.resolve(source.root, { x: 10, y: 101 }, hit)).toBe(
      source.scope,
    );
  } finally {
    nested.destroy();
    source.destroy();
    panel.editor.destroy();
    core.destroy();
  }
});
