import {
  BroadcastChannelProvider,
  createRivtoEditor,
  DEFAULT_BLOCK_TYPE,
  RIVTO_VERSION,
  YjsDoc,
} from "@chulane/rivto";
import {
  createReactEditor,
  type MarkdownLinkClick,
  edgelessVisualsExtension,
  EditorView,
  KEYBOARD_BINDING_IDS,
  SEPARATOR_BLOCK_TYPE,
  standardPreset,
  useEditor,
  useEditorMode,
} from "@chulane/rivto-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  COUNTER_BLOCK_TYPE,
  customBlockExtensions,
  SLIDER_BLOCK_TYPE,
} from "./blocks/custom-blocks";
import {
  blockIdExtension,
  BlockIdsVisibleProvider,
} from "./extensions/block-id";

/**
 * Intercepts custom Markdown link protocols (`rivto:` / `chulane:`).
 *
 * Host apps own non-http links; ordinary URLs stay native. Dispatches
 * `rivto:markdown-link` for e2e / host listeners.
 */
const handleMarkdownLink = ({ href, event }: MarkdownLinkClick): void => {
  if (!/^(?:rivto|chulane):/i.test(href)) return;
  event.preventDefault();
  window.dispatchEvent(new CustomEvent("rivto:markdown-link", { detail: href }));
};

/**
 * Host-supplied edgeless picker options (extra fonts and sticky presets).
 *
 * Needed to show that `edgelessVisualsExtension(...)` accepts real product
 * configuration, not only the library defaults.
 */
const edgelessOptions = {
  fonts: [{ label: "Editorial serif", fontFamily: "Georgia, Cambria, serif" }],
  stickers: [
    { id: "lavender", label: "Lavender sticky", fill: "#eeeaff", color: "#362b67" },
    { id: "mint", label: "Mint sticky", fill: "#d3f9d8", color: "#2b8a3e" },
  ],
} as const;

/**
 * Seeds canvas visuals that exercise edgeless features in the journal demo.
 *
 * Needed so a fresh demo load already has shapes, text, sticky, drawing,
 * connectors, nested groups, and spare siblings for align / distribute /
 * layer-order practice — without the visitor having to create them first.
 */
function seedEdgelessShowcase(editor: ReturnType<typeof createRivtoEditor>): void {
  editor.execute("edgeless.visual.create", {
    kind: "text",
    text: "Edgeless showcase",
    frame: { x: 60, y: 450, width: 280, height: 32 },
    fontSize: 22,
    fontFamily: "Georgia, Cambria, serif",
    color: "#212529",
  });
  editor.execute("edgeless.visual.create", {
    kind: "text",
    text: "Shapes · sticky · pencil · connector · nested group · align/distribute extras",
    frame: { x: 60, y: 482, width: 560, height: 28 },
    fontSize: 13,
    color: "#495057",
  });

  const rect = editor.execute("edgeless.visual.create", {
    kind: "rectangle",
    frame: { x: 60, y: 530, width: 130, height: 90 },
    fill: "#d0ebff",
    stroke: "#1c7ed6",
    strokeWidth: 2,
    text: "Rect",
  }) as string;
  const ellipse = editor.execute("edgeless.visual.create", {
    kind: "ellipse",
    frame: { x: 240, y: 545, width: 110, height: 80 },
    fill: "#fff3bf",
    stroke: "#e67700",
    strokeWidth: 2,
    text: "Ellipse",
  }) as string;
  editor.execute("edgeless.visual.create", {
    kind: "connector",
    route: "orthogonal",
    source: { elementId: rect, anchor: { x: 1, y: 0.5 }, position: { x: 190, y: 575 } },
    target: { elementId: ellipse, anchor: { x: 0, y: 0.5 }, position: { x: 240, y: 585 } },
    stroke: "#495057",
    lineStyle: "dashed",
    endStyle: "arrow",
    text: "link",
    textRotation: "along",
  });

  editor.execute("edgeless.selection.set", [rect, ellipse]);
  const shapeGroup = editor.execute("edgeless.selection.group") as string;

  const sticky = editor.execute("edgeless.visual.create", {
    kind: "sticker",
    text: "Sticky note\n(double-click to edit)",
    fill: "#eeeaff",
    color: "#362b67",
    frame: { x: 420, y: 530, width: 170, height: 130 },
  }) as string;

  // Second connector: animated dashes flow toward the sticky.
  editor.execute("edgeless.visual.create", {
    kind: "connector",
    route: "curve",
    source: { elementId: ellipse, anchor: { x: 1, y: 0.5 }, position: { x: 350, y: 585 } },
    target: { elementId: sticky, anchor: { x: 0, y: 0.5 }, position: { x: 420, y: 595 } },
    stroke: "#868e96",
    lineStyle: "dashed-animated",
    endStyle: "arrow",
    text: "",
  });

  // Nested group: existing group + sticky (Primary-click / Group again in the UI).
  editor.execute("edgeless.selection.set", [shapeGroup, sticky]);
  editor.execute("edgeless.selection.group");

  editor.execute("edgeless.visual.create", {
    kind: "drawing",
    brush: "pencil",
    frame: { x: 640, y: 530, width: 150, height: 100 },
    points: [
      { x: 8, y: 72 }, { x: 28, y: 18 }, { x: 52, y: 58 },
      { x: 78, y: 12 }, { x: 108, y: 64 }, { x: 138, y: 28 },
    ],
    stroke: "#212529",
    strokeWidth: 2,
  });
  editor.execute("edgeless.visual.create", {
    kind: "text",
    text: "Free text — resize corners, drag handle, layer arrows",
    frame: { x: 640, y: 650, width: 260, height: 48 },
    fontSize: 14,
    color: "#343a40",
  });

  // Unrelated siblings for align / distribute / multi-select practice.
  editor.execute("edgeless.visual.create", {
    kind: "rectangle",
    frame: { x: 920, y: 530, width: 56, height: 56 },
    fill: "#d3f9d8",
    stroke: "#2b8a3e",
  });
  editor.execute("edgeless.visual.create", {
    kind: "rectangle",
    frame: { x: 1020, y: 560, width: 56, height: 56 },
    fill: "#d3f9d8",
    stroke: "#2b8a3e",
  });
  editor.execute("edgeless.visual.create", {
    kind: "rectangle",
    frame: { x: 1120, y: 510, width: 56, height: 56 },
    fill: "#d3f9d8",
    stroke: "#2b8a3e",
  });
  editor.execute("edgeless.visual.create", {
    kind: "ellipse",
    frame: { x: 920, y: 640, width: 70, height: 48 },
    fill: "#ffd8a8",
    stroke: "#d9480f",
  });

  editor.execute("edgeless.selection.clear");
  editor.execute("edgeless.tool.set", "select");
}

/**
 * Builds today's journal editor with rich seed content.
 *
 * Needed as the main playground document: Markdown, nested lists, checkboxes,
 * numbered lists, custom blocks, separators, block elements, and edgeless
 * showcase — so selection, slash commands, and extensions are immediately
 * testable. Optional `?keymap=alternate` remaps indent for keymap demos.
 */
function createDemoEditor() {
  const editor = createRivtoEditor();
  // Used by e2e / KEYMAP demos: `?keymap=alternate` remaps indent without test-only APIs.
  const alternateKeymap = new URLSearchParams(window.location.search).get("keymap") === "alternate"
    ? {
        [KEYBOARD_BINDING_IDS.blockIndent]: ["Primary+ArrowRight"],
        [KEYBOARD_BINDING_IDS.blockOutdent]: [],
      }
    : undefined;
  const reactEditor = createReactEditor({
    editor,
    keymap: alternateKeymap,
    onMarkdownLinkClick: handleMarkdownLink,
    extensions: [standardPreset(), edgelessVisualsExtension(edgelessOptions), blockIdExtension(), ...customBlockExtensions],
  });
  const introId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "**Rivto editor**",
  });
  const paragraphId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "This paragraph renders *Markdown*, ~~old text~~, and `inline code` when it is not edited.",
  }, introId);

  const selectionStartId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Start a selection in the middle of this sentence and drag downward. See [Rivto](https://example.com).",
  }, paragraphId);
  const middleParagraphId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "This complete **Markdown paragraph** should be included between partial selections.",
  }, selectionStartId);
  const listId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Nested branch one owns several Markdown children.",
  }, middleParagraphId);
  const childId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Level 2: this child owns another nested branch.",
  }, listId);
  editor.blocks.indentBlock(childId);
  const grandchildId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Level 3: selection now crosses two indentation boundaries.",
  }, childId);
  editor.blocks.indentBlock(grandchildId);
  const greatGrandchildId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Level 4: deepest item for recursive rendering and outdent checks.",
  }, grandchildId);
  editor.blocks.indentBlock(greatGrandchildId);
  editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Level 2: sibling after the deep branch.",
  }, childId);

  const reverseSelectionId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Reverse selection should preserve the browser's anchor and focus direction.",
  }, listId);
  const secondBranchId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Nested branch two is a second independent structure.",
  }, reverseSelectionId);
  const numberedChildId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Second branch level 2 child.",
  }, secondBranchId);
  editor.blocks.indentBlock(numberedChildId);
  const numberedGrandchildId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Second branch level 3 descendant.",
  }, numberedChildId);
  editor.blocks.indentBlock(numberedGrandchildId);
  editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Second branch level 2 sibling.",
  }, numberedChildId);

  const sliderId = editor.blocks.insertBlock({
    type: SLIDER_BLOCK_TYPE,
    content: "const selectedBlocks = selection.filter(item => item.type === 'block');",
    props: { value: 35 },
  }, secondBranchId);
  const selectionEndId = editor.blocks.insertBlock({
    type: COUNTER_BLOCK_TYPE,
    props: { count: 2 },
  }, sliderId);
  const finalId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Finish the selection in the middle of this sentence, then try copy or cut.",
  }, selectionEndId);
  const slashId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Type `/` anywhere here to open searchable slash commands.",
  }, finalId);
  const uncheckedId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Try the interactive checkbox",
    listProps: { type: "checkbox", checked: false },
  }, slashId);
  const checkedId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Completed checkbox item",
    listProps: { type: "checkbox", checked: true },
  }, uncheckedId);
  const numberedStartId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Start a numbered sequence",
    listProps: { type: "start_numbered_list" },
  }, checkedId);
  const numberedNextId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Continue the adjacent sequence",
    listProps: { type: "numbered_list" },
  }, numberedStartId);
  const numberedGapId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Ordinary content between numbered items",
  }, numberedNextId);
  const numberedContinueId = editor.blocks.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Continue numbering across the ordinary block",
    listProps: { type: "continue_numbered_list" },
  }, numberedGapId);

  // The explicit separator is visible in block mode and partitions cards only
  // because its React block plugin declares `separatesBlockElements`.
  editor.blocks.insertBlock({ type: SEPARATOR_BLOCK_TYPE, content: "" }, reverseSelectionId);
  editor.elements.insertElement({
    id: listId,
    type: "block",
    frame: { x: 60, y: 60, width: 500, height: 360 },
    zIndex: 0,
    props: { startBlockId: introId, endBlockId: reverseSelectionId },
  });
  editor.elements.insertElement({
    id: secondBranchId,
    type: "block",
    frame: { x: 600, y: 60, width: 500, height: 360 },
    zIndex: 1,
    props: { startBlockId: secondBranchId, endBlockId: numberedContinueId },
  });
  seedEdgelessShowcase(editor);
  editor.history.clear();

  return { editor, reactEditor };
}

/**
 * Builds yesterday's journal editor with no seed blocks.
 *
 * Needed to show two independent editor instances on one page (journal stack)
 * and to contrast a populated document with an empty one.
 */
function createEmptyDemoEditor() {
  const editor = createRivtoEditor();
  const reactEditor = createReactEditor({
    editor,
    onMarkdownLinkClick: handleMarkdownLink,
    extensions: [standardPreset(), edgelessVisualsExtension(edgelessOptions), blockIdExtension(), ...customBlockExtensions],
  });
  return { editor, reactEditor };
}

/**
 * Formats a Date as a local `YYYY-MM-DD` key for `<time dateTime>`.
 *
 * Needed so journal headings expose a machine-readable date without putting
 * presentation metadata into the document CRDT.
 */
function localDateKey(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

/**
 * Renders the journal day heading above an editor.
 *
 * Needed to make the stacked “today / yesterday” demo readable as a journal
 * while keeping date UI outside the document model.
 */
function JournalDate({ date }: { readonly date: Date }) {
  return (
    <h1 className="journal-date">
      <time dateTime={localDateKey(date)}>
        {new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date)}
      </time>
    </h1>
  );
}

/**
 * Shared chrome above each demo editor (mode, block IDs, delete, undo).
 *
 * Needed so visitors can flip Page ↔ Edgeless, toggle debug block IDs, and
 * exercise delete/undo without digging into keyboard shortcuts. Reused by
 * journal, multi-editor, and sync surfaces.
 */
function DemoToolbar({
  showBlockIds,
  onShowBlockIdsChange,
}: {
  readonly showBlockIds: boolean;
  readonly onShowBlockIdsChange: (visible: boolean) => void;
}) {
  const editor = useEditor();
  const { mode, setMode } = useEditorMode();
  /** No-ops when already in `next` so repeated clicks do not thrash mode. */
  const switchMode = (next: "block" | "edgeless") => {
    if (next === mode) return;
    setMode(next);
  };

  return (
    <header className="demo-header">
      <span>Rivto v{RIVTO_VERSION}</span>
      <div className="demo-toolbar-controls">
        <label className="demo-block-id-toggle">
          <input
            type="checkbox"
            checked={showBlockIds}
            onChange={(event) => onShowBlockIdsChange(event.currentTarget.checked)}
          />
          Block IDs
        </label>
        <div className="demo-mode-switch" role="group" aria-label="Editor mode">
          {/* `data-editor-mode` / `data-editor-action` are used by e2e. */}
          <button type="button" data-editor-mode="block" aria-pressed={mode === "block"} onClick={() => switchMode("block")}>Page</button>
          <button type="button" data-editor-mode="edgeless" aria-pressed={mode === "edgeless"} onClick={() => switchMode("edgeless")}>Edgeless</button>
        </div>
        <button type="button" data-editor-action="delete" onClick={() => editor.deleteSelection()}>Delete</button>
        <button type="button" data-editor-action="undo" onClick={() => editor.undo()}>Undo</button>
      </div>
    </header>
  );
}

/**
 * Default demo: stacked today (seeded) + yesterday (empty) journals.
 *
 * Needed as the primary product walkthrough — two editors, shared toolbar
 * patterns, and lifecycle cleanup when the page unmounts.
 */
function JournalDemoApp() {
  const [todayEditor] = useState(createDemoEditor);
  const [yesterdayEditor] = useState(createEmptyDemoEditor);
  const [showBlockIds, setShowBlockIds] = useState(true);
  const [dates] = useState(() => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return { today, yesterday };
  });

  // EditorView consumes but does not own the runtime, so the application that
  // created it also releases its subscriptions and command registrations.
  // This useEffect returns a cleanup function that destroys the editor.
  useEffect(() => () => {
    todayEditor.reactEditor.destroy();
    todayEditor.editor.destroy();
    yesterdayEditor.reactEditor.destroy();
    yesterdayEditor.editor.destroy();
  }, [todayEditor, yesterdayEditor]);

  return (
    <BlockIdsVisibleProvider visible={showBlockIds}>
      <div className="journal-stack">
        {/* `data-journal-document` is used by e2e to pick today vs yesterday. */}
        <section className="journal-document" data-journal-document="today">
          <EditorView editor={todayEditor.reactEditor}>
            <DemoToolbar
              showBlockIds={showBlockIds}
              onShowBlockIdsChange={setShowBlockIds}
            />
            <JournalDate date={dates.today} />
          </EditorView>
        </section>
        <section className="journal-document" data-journal-document="yesterday">
          <EditorView editor={yesterdayEditor.reactEditor}>
            <JournalDate date={dates.yesterday} />
          </EditorView>
        </section>
      </div>
    </BlockIdsVisibleProvider>
  );
}

/**
 * Builds one side of the dual-editor demo opened via `?editors=2`.
 *
 * Manual playground for cross-document drag/selection/history. Stable block
 * ids (`left-parent`, …) keep panes readable with Block IDs on and let e2e
 * target rows. Optional `empty` / `conflict` flags cover edge cases (also used
 * by Playwright via query params).
 */
function createMultiEditor(
  side: "left" | "right",
  options: { readonly empty?: boolean; readonly conflict?: "block" | "link" } = {},
) {
  const editor = createRivtoEditor();
  const reactEditor = createReactEditor({
    editor,
    onMarkdownLinkClick: handleMarkdownLink,
    extensions: [standardPreset(), edgelessVisualsExtension(edgelessOptions), blockIdExtension(), ...customBlockExtensions],
  });
  if (side === "left") {
    const parentId = editor.blocks.insertBlock({
      id: "left-parent",
      type: DEFAULT_BLOCK_TYPE,
      content: "Movable parent",
      collapsed: true,
      children: [{
        id: "left-child",
        type: DEFAULT_BLOCK_TYPE,
        content: "Nested child",
      }],
    });
    editor.elements.insertElement({
      id: parentId,
      type: "block",
      frame: { x: 41, y: 52, width: 310, height: 170 },
      zIndex: 3,
      props: { startBlockId: parentId, endBlockId: parentId },
    });
    editor.blocks.insertBlock({
      id: "left-counter",
      type: COUNTER_BLOCK_TYPE,
      props: { count: 7 },
    });
    editor.blocks.insertBlock({ id: "left-stay", type: DEFAULT_BLOCK_TYPE, content: "Stays in the source" });
    // Internal link moves with the subtree; external link should drop when its
    // endpoint leaves the source document.
    editor.links.createLink({
      id: "left-internal-link",
      from: { blockId: "left-parent" },
      to: { blockId: "left-child" },
    });
    editor.links.createLink({
      id: "left-external-link",
      from: { blockId: "left-child" },
      to: { blockId: "left-stay" },
    });
  } else if (!options.empty) {
    editor.blocks.insertBlock({
      id: "right-target",
      type: DEFAULT_BLOCK_TYPE,
      content: "Destination parent",
      children: [
        { id: "right-nested", type: DEFAULT_BLOCK_TYPE, content: "Destination child" },
        // Used by e2e + manual `?conflict=block`: duplicate id must reject the drop.
        ...(options.conflict === "block"
          ? [{ id: "left-child", type: DEFAULT_BLOCK_TYPE, content: "Conflicting ID" }]
          : []),
      ],
    });
    editor.blocks.insertBlock({ id: "right-counter", type: COUNTER_BLOCK_TYPE, props: { count: 20 } });
    if (options.conflict === "link") {
      // Used by e2e + manual `?conflict=link`: duplicate link id must reject the drop.
      editor.links.createLink({
        id: "left-internal-link",
        from: { blockId: "right-target" },
        to: { blockId: "right-nested" },
      });
    }
  }
  editor.history.clear();
  return { editor, reactEditor };
}

/** Used by e2e: hidden `editor.dump()` for asserting links / structure not shown in the UI. */
function DocumentStateDump() {
  const editor = useEditor();
  const snapshot = useSyncExternalStore(
    (listener) => editor.subscribe(listener),
    () => JSON.stringify(editor.dump()),
    () => JSON.stringify(editor.dump()),
  );
  return <output data-document-state hidden>{snapshot}</output>;
}

/** One pane of `?editors=2` (toolbar + document dump for e2e). */
function MultiEditorPane({
  side,
  runtime,
}: {
  readonly side: "left" | "right";
  readonly runtime: ReturnType<typeof createMultiEditor>;
}) {
  const [showBlockIds, setShowBlockIds] = useState(true);
  return (
    // `data-multi-editor` is used by e2e to scope left/right locators.
    <section className="multi-editor-pane" data-multi-editor={side}>
      <BlockIdsVisibleProvider visible={showBlockIds}>
        <EditorView editor={runtime.reactEditor}>
          <DemoToolbar showBlockIds={showBlockIds} onShowBlockIdsChange={setShowBlockIds} />
          <DocumentStateDump />
        </EditorView>
      </BlockIdsVisibleProvider>
    </section>
  );
}

/**
 * Side-by-side editors for manual cross-document practice (`?editors=2`).
 *
 * Query extras (also used by e2e): `emptyDestination=1`, `conflict=block|link`.
 */
function MultiEditorApp() {
  const params = new URLSearchParams(window.location.search);
  const emptyDestination = params.get("emptyDestination") === "1";
  const conflictParam = params.get("conflict");
  const conflict = conflictParam === "block" || conflictParam === "link" ? conflictParam : undefined;
  const [left] = useState(() => createMultiEditor("left"));
  const [right] = useState(() => createMultiEditor("right", { empty: emptyDestination, conflict }));
  useEffect(() => () => {
    left.reactEditor.destroy();
    left.editor.destroy();
    right.reactEditor.destroy();
    right.editor.destroy();
  }, [left, right]);
  return (
    <div className="multi-editor-page">
      <MultiEditorPane side="left" runtime={left} />
      <MultiEditorPane side="right" runtime={right} />
    </div>
  );
}

/**
 * Creates one peer for the local BroadcastChannel sync demo.
 *
 * Needed to wire a Yjs-backed editor + `BroadcastChannelProvider` without a
 * server. Only the left peer is seeded; the right starts empty and receives
 * the document so convergence is obvious.
 */
function createSyncedPeer(side: "left" | "right", roomId: string) {
  const yjsDoc = new YjsDoc(`${roomId}:${side}`);
  const editor = createRivtoEditor({ document: yjsDoc });
  const reactEditor = createReactEditor({
    editor,
    onMarkdownLinkClick: handleMarkdownLink,
    extensions: [standardPreset(), edgelessVisualsExtension(edgelessOptions), blockIdExtension(), ...customBlockExtensions],
  });
  if (side === "left") {
    const introId = editor.blocks.insertBlock({
      type: DEFAULT_BLOCK_TYPE,
      content: "**Synced demo** — edit here or in the other pane.",
    });
    editor.blocks.insertBlock({
      type: DEFAULT_BLOCK_TYPE,
      content: "Both editors share one Yjs room over `BroadcastChannel` (same PC, no server).",
    }, introId);
    editor.history.clear();
  }
  return { yjsDoc, editor, reactEditor, provider: new BroadcastChannelProvider(roomId) };
}

/**
 * Collaborative demo opened with `?sync=1` (optional `?room=`).
 *
 * Needed to verify same-origin Yjs sync over BroadcastChannel: two panes on
 * this page, plus more peers if another tab opens the same URL.
 */
function SyncEditorsApp() {
  const roomId = new URLSearchParams(window.location.search).get("room") ?? "rivto-demo-sync";
  const [peers] = useState(() => ({
    left: createSyncedPeer("left", roomId),
    right: createSyncedPeer("right", roomId),
  }));
  const [showBlockIds, setShowBlockIds] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await peers.left.yjsDoc.attachProvider(peers.left.provider);
      await peers.right.yjsDoc.attachProvider(peers.right.provider);
      if (cancelled) {
        await peers.left.yjsDoc.detachProvider().catch(() => undefined);
        await peers.right.yjsDoc.detachProvider().catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
      void peers.left.yjsDoc.detachProvider().catch(() => undefined);
      void peers.right.yjsDoc.detachProvider().catch(() => undefined);
      peers.left.reactEditor.destroy();
      peers.left.editor.destroy();
      peers.right.reactEditor.destroy();
      peers.right.editor.destroy();
    };
  }, [peers]);

  return (
    <div className="sync-editor-page">
      <header className="sync-editor-banner">
        <span>Yjs sync via BroadcastChannel</span>
        <code>room={roomId}</code>
        <span>Open another tab with the same URL to add more peers.</span>
      </header>
      <div className="multi-editor-page">
        {(["left", "right"] as const).map((side) => (
          // `data-editor-sync` is used by e2e to scope sync panes.
          <section key={side} className="multi-editor-pane" data-editor-sync={side}>
            <BlockIdsVisibleProvider visible={showBlockIds}>
              <EditorView editor={peers[side].reactEditor}>
                <DemoToolbar showBlockIds={showBlockIds} onShowBlockIdsChange={setShowBlockIds} />
              </EditorView>
            </BlockIdsVisibleProvider>
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * Demo entry: picks which surface to mount from the URL.
 *
 * - default → journal stack (`JournalDemoApp`)
 * - `?editors=2` → dual editors (`MultiEditorApp`)
 * - `?sync=1` → BroadcastChannel peers (`SyncEditorsApp`)
 *
 * Needed so one Vite demo app can cover walkthrough, regression, and sync
 * without separate entrypoints.
 */
export function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("editors") === "2") return <MultiEditorApp />;
  if (params.get("sync") === "1") return <SyncEditorsApp />;
  return <JournalDemoApp />;
}
