/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { ChildrenPanel, createStructuralSelection } from "@chulane/rivto";
import { ReactPanel } from "../../../panels/react-panel";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { PageBlockDrag } from "../page-block-drag";
import { PageDragOccurrence } from "../page-drag-occurrence";
import { BlockDragRouter } from "@chulane/rivto-page";
import {
  crossDocumentPageRootControllers,
  CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE,
} from "../../../extensions/block-drag/cross-document/target";

/** Owns a real receiving registration without adding another event or rendering runtime. */
class DragAttachment {
  readonly root = document.createElement("div");
  readonly inputRoot = new BrowserInputRoot(this.root);
  readonly scope: PageDragOccurrence;

  /**
   * Attaches a host adapter to a fixture-owned DOM root.
   *
   * @param panel - Borrowed panel whose lifecycle remains with the test.
   */
  constructor(panel: ReactPanel) {
    document.body.append(this.root);
    this.scope = new PageDragOccurrence(
      panel,
      {
        /**
         * Leaves geometry unused while these cases exercise registry-bound commands.
         *
         * @returns No hit; each test supplies an explicit canonical destination.
         */
        resolve: () => undefined,
      },
      this.inputRoot,
      { isCurrent: () => true },
    );
  }

  /**
   * Releases registration before removing its borrowed DOM identity.
   *
   * @returns Receiver listeners and feedback are released; the panel remains borrowed.
   */
  destroy(): void {
    this.scope.destroy();
    this.inputRoot.detach();
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
  const newScope = new PageDragOccurrence(
    panel,
    {
      /**
       * Keeps geometry out of the attachment identity assertion.
       *
       * @returns No target for this lifecycle-only fixture.
       */
      resolve: () => undefined,
    },
    new BrowserInputRoot(first.root),
    { isCurrent: () => true },
  );
  try {
    oldScope.onDetach(() => {
      expect(crossDocumentPageRootControllers.getCurrent(newScope)).toBe(newScope);
    });
    first.destroy();
    document.body.append(first.root);
    expect(crossDocumentPageRootControllers.getCurrent(newScope)).toBe(newScope);
    expect(first.root.hasAttribute(CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE)).toBe(true);
  } finally {
    newScope.destroy();
    first.root.remove();
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
    expect(crossDocumentPageRootControllers.getCurrent(scope)).toBeUndefined();
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
  const previousElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => hit });
  let localCalls = 0;
  let receivingScope: PageDragOccurrence | undefined;
  const router = new BlockDragRouter(
    source.inputRoot,
    source.scope.region,
    crossDocumentPageRootControllers,
    {
      /**
       * Records that routing selected the source occurrence.
       *
       * @returns No drop target for this routing-only fixture.
       */
      resolve: () => {
        localCalls += 1;
        return undefined;
      },
    },
    {
      /**
       * Records the foreign receiving occurrence selected by routing.
       *
       * @param receiver - Receiver selected for the current hit.
       * @returns No drop target for this routing-only fixture.
       */
      resolveForeign: (receiver) => {
        receivingScope = receiver;
        return undefined;
      },
    },
  );
  try {
    router.resolve(10, 150, new Set());
    expect(receivingScope).toBe(nested.scope);
    router.resolve(10, 101, new Set());
    expect(receivingScope).toBe(nested.scope);
    nested.destroy();
    source.root.append(hit);
    router.resolve(10, 101, new Set());
    expect(localCalls).toBe(1);
  } finally {
    if (previousElementFromPoint) {
      Object.defineProperty(document, "elementFromPoint", previousElementFromPoint);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
    nested.destroy();
    source.destroy();
    panel.editor.destroy();
    core.destroy();
  }
});
