import {
  createRivtoEditor,
  DEFAULT_BLOCK_TYPE,
  RIVTO_VERSION,
} from "@chulane/rivto";
import {
  createReactEditor,
  EditorView,
  KEYBOARD_BINDING_IDS,
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
 * Creates demo content for manual editing and selection checks.
 *
 * Adjacent Markdown blocks, nested branches, and two custom block types make
 * selection and extension behavior directly testable from the demo page.
 */
function createDemoEditor() {
  const editor = createRivtoEditor();
  // This named demo preset gives browser tests and documentation examples a
  // real host-level keymap without adding test-only editor APIs.
  const alternateKeymap = new URLSearchParams(window.location.search).get("keymap") === "alternate"
    ? {
        [KEYBOARD_BINDING_IDS.blockIndent]: ["Primary+ArrowRight"],
        [KEYBOARD_BINDING_IDS.blockOutdent]: [],
      }
    : undefined;
  const reactEditor = createReactEditor({
    editor,
    keymap: alternateKeymap,
    extensions: [standardPreset(), blockIdExtension(), ...customBlockExtensions],
  });
  const introId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "**Rivto editor**",
  });
  const paragraphId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "This paragraph renders *Markdown*, ~~old text~~, and `inline code` when it is not edited.",
  }, introId);

  const selectionStartId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Start a selection in the middle of this sentence and drag downward. See [Rivto](https://example.com).",
  }, paragraphId);
  const middleParagraphId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "This complete **Markdown paragraph** should be included between partial selections.",
  }, selectionStartId);
  const listId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Nested branch one owns several Markdown children.",
  }, middleParagraphId);
  const childId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Level 2: this child owns another nested branch.",
  }, listId);
  editor.indentBlock(childId);
  const grandchildId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Level 3: selection now crosses two indentation boundaries.",
  }, childId);
  editor.indentBlock(grandchildId);
  const greatGrandchildId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Level 4: deepest item for recursive rendering and outdent checks.",
  }, grandchildId);
  editor.indentBlock(greatGrandchildId);
  editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Level 2: sibling after the deep branch.",
  }, childId);

  const reverseSelectionId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Reverse selection should preserve the browser's anchor and focus direction.",
  }, listId);
  const secondBranchId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Nested branch two is a second independent structure.",
  }, reverseSelectionId);
  const numberedChildId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Second branch level 2 child.",
  }, secondBranchId);
  editor.indentBlock(numberedChildId);
  const numberedGrandchildId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Second branch level 3 descendant.",
  }, numberedChildId);
  editor.indentBlock(numberedGrandchildId);
  editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Second branch level 2 sibling.",
  }, numberedChildId);

  const sliderId = editor.insertBlock({
    type: SLIDER_BLOCK_TYPE,
    content: "const selectedBlocks = selection.filter(item => item.type === 'block');",
    props: { value: 35 },
  }, secondBranchId);
  const selectionEndId = editor.insertBlock({
    type: COUNTER_BLOCK_TYPE,
    props: { count: 2 },
  }, sliderId);
  const finalId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Finish the selection in the middle of this sentence, then try copy or cut.",
  }, selectionEndId);
  editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Type `/` anywhere here to open searchable slash commands.",
  }, finalId);

  // The core gives every new block the same safe geometry. Spread demo roots
  // into a small persisted grid so the first edgeless view is immediately
  // usable while still exercising the normal layout API.
  editor.updateBlocks(editor.getBlocks().map((block, index) => ({
    id: block.id,
    patch: {
      layout: {
        x: 60 + (index % 4) * 380,
        y: 60 + Math.floor(index / 4) * 270,
        width: 340,
        height: 220,
      },
    },
  })));
  editor.history.clear();

  return { editor, reactEditor };
}

/** Creates the initially empty previous-day document in the journal demo. */
function createEmptyDemoEditor() {
  const editor = createRivtoEditor();
  const reactEditor = createReactEditor({
    editor,
    extensions: [standardPreset(), blockIdExtension(), ...customBlockExtensions],
  });
  return { editor, reactEditor };
}

function localDateKey(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

/** Visible journal date without storing presentation metadata in the document. */
function JournalDate({ date }: { readonly date: Date }) {
  return (
    <h1 className="journal-date">
      <time dateTime={localDateKey(date)}>
        {new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date)}
      </time>
    </h1>
  );
}

/** Demo toolbar for switching the local presentation of one shared document. */
function DemoToolbar({
  showBlockIds,
  onShowBlockIdsChange,
}: {
  readonly showBlockIds: boolean;
  readonly onShowBlockIdsChange: (visible: boolean) => void;
}) {
  const editor = useEditor();
  const { mode, setMode } = useEditorMode();
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
          <button type="button" data-editor-mode="block" aria-pressed={mode === "block"} onClick={() => switchMode("block")}>Page</button>
          <button type="button" data-editor-mode="edgeless" aria-pressed={mode === "edgeless"} onClick={() => switchMode("edgeless")}>Edgeless</button>
        </div>
        <button type="button" data-editor-action="delete" onClick={() => editor.deleteSelection()}>Delete</button>
        <button type="button" data-editor-action="undo" onClick={() => editor.undo()}>Undo</button>
      </div>
    </header>
  );
}

/** Hosts the editor runtime and explicitly selects the active demo surface. */
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

function createFixtureEditor(
  side: "left" | "right",
  options: { readonly empty?: boolean; readonly conflict?: "block" | "link" } = {},
) {
  const editor = createRivtoEditor();
  const reactEditor = createReactEditor({
    editor,
    extensions: [standardPreset(), blockIdExtension(), ...customBlockExtensions],
  });
  if (side === "left") {
    editor.insertBlock({
      id: "left-parent",
      type: DEFAULT_BLOCK_TYPE,
      content: "Movable parent",
      collapsed: true,
      pluginData: { fixture: { retained: true } },
      layout: { x: 41, y: 52, width: 310, height: 170, zIndex: 3 },
      children: [{
        id: "left-child",
        type: DEFAULT_BLOCK_TYPE,
        content: "Nested child",
      }],
    });
    editor.insertBlock({
      id: "left-counter",
      type: COUNTER_BLOCK_TYPE,
      props: { count: 7 },
      pluginData: { fixture: { counter: true } },
    });
    editor.insertBlock({ id: "left-stay", type: DEFAULT_BLOCK_TYPE, content: "Stays in the source" });
    editor.createLink({
      id: "left-internal-link",
      from: { blockId: "left-parent" },
      to: { blockId: "left-child" },
      meta: { fixture: "internal" },
    });
    editor.createLink({
      id: "left-external-link",
      from: { blockId: "left-child" },
      to: { blockId: "left-stay" },
    });
  } else if (!options.empty) {
    editor.insertBlock({
      id: "right-target",
      type: DEFAULT_BLOCK_TYPE,
      content: "Destination parent",
      children: [
        { id: "right-nested", type: DEFAULT_BLOCK_TYPE, content: "Destination child" },
        ...(options.conflict === "block"
          ? [{ id: "left-child", type: DEFAULT_BLOCK_TYPE, content: "Conflicting ID" }]
          : []),
      ],
    });
    editor.insertBlock({ id: "right-counter", type: COUNTER_BLOCK_TYPE, props: { count: 20 } });
    if (options.conflict === "link") {
      editor.createLink({
        id: "left-internal-link",
        from: { blockId: "right-target" },
        to: { blockId: "right-nested" },
      });
    }
  }
  editor.history.clear();
  return { editor, reactEditor };
}

/** Test-only serialized state for assertions about data not represented in DOM. */
function FixtureDocumentState() {
  const editor = useEditor();
  const snapshot = useSyncExternalStore(
    (listener) => editor.subscribe(listener),
    () => JSON.stringify(editor.dump()),
    () => JSON.stringify(editor.dump()),
  );
  return <output data-document-state hidden>{snapshot}</output>;
}

function FixtureEditor({
  side,
  runtime,
}: {
  readonly side: "left" | "right";
  readonly runtime: ReturnType<typeof createFixtureEditor>;
}) {
  const [showBlockIds, setShowBlockIds] = useState(true);
  return (
    <section className="multi-editor-fixture" data-editor-fixture={side}>
      <BlockIdsVisibleProvider visible={showBlockIds}>
        <EditorView editor={runtime.reactEditor}>
          <DemoToolbar showBlockIds={showBlockIds} onShowBlockIdsChange={setShowBlockIds} />
          <FixtureDocumentState />
        </EditorView>
      </BlockIdsVisibleProvider>
    </section>
  );
}

function MultiEditorApp() {
  const emptyDestination = new URLSearchParams(window.location.search).get("emptyDestination") === "1";
  const conflict = new URLSearchParams(window.location.search).get("conflict");
  const [left] = useState(() => createFixtureEditor("left"));
  const [right] = useState(() => createFixtureEditor("right", {
    empty: emptyDestination,
    conflict: conflict === "block" || conflict === "link" ? conflict : undefined,
  }));
  useEffect(() => () => {
    left.reactEditor.destroy();
    left.editor.destroy();
    right.reactEditor.destroy();
    right.editor.destroy();
  }, [left, right]);
  return (
    <div className="multi-editor-page">
      <FixtureEditor side="left" runtime={left} />
      <FixtureEditor side="right" runtime={right} />
    </div>
  );
}

/** Chooses the normal demo or the isolated dual-editor regression fixture. */
export function App() {
  const multiple = new URLSearchParams(window.location.search).get("editors") === "2";
  return multiple ? <MultiEditorApp /> : <JournalDemoApp />;
}
