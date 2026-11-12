import { BLOCK_HANDLE_SELECTOR } from "../../packages/react-rivto-editor/src/components/block-handle/constants";
import { paragraphBlockFactory, separatorBlockFactory } from "@chulane/rivto-react/block-factories";
import { mindmapExtension } from "./extensions/mindmap/mindmap";
import { ElementRegistrationTest } from "./ElementRegistrationTest";
import { EditorLifecycleTest } from "./EditorLifecycleTest";
import { DemoEditorPanels } from "./editor-panels";
import { BroadcastChannelProvider, YjsDocumentRegistry } from "@chulane/crdt-doc";
import { DocumentStorage } from "@chulane/document-model";
import {
  createDocumentEditor,
  type DocumentEditorAPI,
  type EditorElementNode,
  type EditorMode,
} from "@chulane/rivto";
import {
  DEFAULT_WRITING_BLOCK_TYPE,
  BENTO_BLOCK_TYPE,
  BlockHandleContext,
  bulletThreadingExtension,
  nestingLinesExtension,
  COLUMNS_BLOCK_TYPE,
  createBentoBlockInput,
  createColumnsBlockInput,
  createReactEditor,
  createKanbanBlockInput,
  createTableBlockInput,
  edgelessPreset,
  EditorStorage,
  EditorStorageContext,
  EditorPanel,
  EMBEDDING_BLOCK_TYPE,
  embeddingExtension,
  KANBAN_BLOCK_TYPE,
  KEYBOARD_BINDING_IDS,
  pageDragExtension,
  PageSurface,
  standardPreset,
  fileExtension,
  imageExtension,
  type ReactEditorExtension,
  type BinaryProvider,
  TABLE_BLOCK_TYPE,
  TODO_ITEM_BLOCK_TYPE,
  TODO_STORAGE_BLOCK_TYPE,
  todoItemExtension,
  useEditorMode,
  type ReactEditorApi,
  type MarkdownLinkClick,
} from "@chulane/rivto-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
} from "react";
import { Trash2Icon, Undo2Icon } from "lucide-react";
import {
  COUNTER_BLOCK_TYPE,
  customBlockExtensions,
  SLIDER_BLOCK_TYPE,
} from "./blocks/custom-blocks";
import { DBDocumentModel, DemoDatabase } from "./database";
import { DocumentsDemo } from "./DocumentsDemo";
import { DemoEditorSurface } from "./editor-surface";
import { seedJournalDemo } from "./journal-content";
import { blockIdExtension, BlockIdsVisibleProvider } from "./extensions/block-id";
import { blockNumberExtension, BlockNumbersVisibleProvider } from "./extensions/block-number";
import {
  createReviewElementInput,
  reviewReportExtensions,
  type ReviewReport,
} from "./extensions/reports/review-report";
import { KeyboardPanel } from "./KeyboardPanel";
import { RevisionsPanel } from "./RevisionsPanel";

const DEMO_LOCAL_FILE_ROUTE = "/__rivto_demo_local_file";
const DEMO_CLIPBOARD_FILE_ROUTE = "/__rivto_demo_clipboard_file";
const DEMO_OPEN_FILE_ROUTE = "/__rivto_demo_open_file";
/** Maximum image size retained briefly for immediate display, in bytes. */
const DEMO_PREVIEW_MAX_BYTES = 1024 * 1024;
/** Maximum number of recently uploaded image previews retained. */
const DEMO_PREVIEW_MAX_COUNT = 16;
/** Maximum time an unused preview remains available, in milliseconds. */
const DEMO_PREVIEW_LIFETIME_MS = 30_000;
/** Recent uploaded image bytes awaiting their first display. */
const demoImagePreviews = new Map<string, Blob>();

/**
 * Returns whether the demo server can resolve one local filesystem path.
 *
 * @param uri - Candidate file URI or filesystem path.
 * @returns True for file URIs and absolute Unix or Windows paths.
 */
function isDemoLocalFileUri(uri: string): boolean {
  return /^file:\/\//i.test(uri) || /^\//.test(uri) || /^[a-z]:[\\/]/i.test(uri);
}

/**
 * Stores browser-owned bytes in the demo server so a native app can address them.
 *
 * @param data - File or resolved blob to persist temporarily.
 * @param name - Portable filename retained for native-app selection.
 * @param mimeType - Persisted MIME type used when the blob has none.
 * @param signal - Cancellation signal from the file operation.
 * @returns Absolute temporary file path returned by the demo server.
 */
async function storeDemoFile(
  data: Blob,
  name: string,
  mimeType: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(`${DEMO_CLIPBOARD_FILE_ROUTE}?name=${encodeURIComponent(name)}`, {
    body: data,
    headers: { "Content-Type": data.type || mimeType || "application/octet-stream" },
    method: "POST",
    signal,
  });
  if (!response.ok) {
    throw new Error("The demo server could not store the file");
  }
  const result = (await response.json()) as { readonly uri?: unknown };
  if (typeof result.uri !== "string") {
    throw new TypeError("The demo server returned an invalid file URI");
  }
  return result.uri;
}

/** Demo storage keeps uploaded files on disk. */
const demoBinaryProvider: BinaryProvider = {
  /**
   * Stores file bytes on the demo server.
   *
   * A 10 MiB limit applies. Abort signals cancel the server request, and the
   * caller receives the resulting reference. Small images are retained briefly
   * for their first display to avoid immediately fetching the bytes again.
   *
   * @param file - Browser-provided binary content.
   * @param context - Name, MIME type, and cancellation signal.
   * @returns A promise resolving to the stored local path.
   * @throws If the file is too large, cancelled, or cannot be stored.
   * @inheritdoc BinaryProvider.write
   */
  async write(file, context) {
    if (file.size > 10 * 1024 * 1024) {
      throw new RangeError("File exceeds the 10 MiB limit");
    }
    const uri = await storeDemoFile(file, context.name, context.mimeType, context.signal);
    if (context.mimeType.startsWith("image/") && file.size <= DEMO_PREVIEW_MAX_BYTES) {
      if (demoImagePreviews.size >= DEMO_PREVIEW_MAX_COUNT) {
        demoImagePreviews.delete(demoImagePreviews.keys().next().value!);
      }
      demoImagePreviews.set(uri, file);
      // Release previews that never reach a mounted image view.
      window.setTimeout(() => demoImagePreviews.delete(uri), DEMO_PREVIEW_LIFETIME_MS);
    }
    return uri;
  },
  /**
   * Reads local references through the demo server and declines other URIs.
   *
   * A cached upload is consumed on its first read; later reads use the server.
   *
   * @param uri - Logical binary reference to resolve.
   * @param context - Operation context containing the cancellation signal.
   * @returns A promise resolving to bytes, or undefined for a nonlocal reference.
   * @throws If the request is cancelled or the server cannot provide the file.
   * @inheritdoc BinaryProvider.read
   */
  async read(uri, context) {
    if (!isDemoLocalFileUri(uri)) {
      return undefined;
    }
    context.signal.throwIfAborted();
    const preview = demoImagePreviews.get(uri);
    if (preview) {
      demoImagePreviews.delete(uri);
      return preview;
    }
    const response = await fetch(`${DEMO_LOCAL_FILE_ROUTE}?uri=${encodeURIComponent(uri)}`, {
      signal: context.signal,
    });
    if (!response.ok) {
      throw new Error("The local file is unavailable to the demo server");
    }
    return response.blob();
  },
};

/** Demo-only native opener. */
const demoLocalFileExtension: ReactEditorExtension = {
  id: "demo.local-files",
  // Register a host opener for files stored through the demo bridge.
  setup: (editor) => {
    editor.attachments.registerFileOpenHandler({
      id: "demo.native-files",
      // Store the resolved bytes before requesting a native application open.
      open: async (reference, context) => {
        const uri = await storeDemoFile(
          await editor.attachments.readBinary(
            demoBinaryProvider,
            reference.uri,
            reference.mimeType,
            context,
          ),
          reference.name,
          reference.mimeType,
          context.signal,
        );
        const response = await fetch(`${DEMO_OPEN_FILE_ROUTE}?uri=${encodeURIComponent(uri)}`, {
          method: "POST",
          signal: context.signal,
        });
        if (!response.ok) {
          throw new Error("The demo server could not open the file with its native app");
        }
      },
    });
    editor.attachments.setDefaultFileOpenHandler("demo.native-files");
  },
};

const DEMO_BLOCK_ID_TOGGLE_CLASS = "demo-block-id-toggle";
/** Demo-wide setting for persistent block handle visibility. */
interface DemoHandleVisibility {
  /** Whether handles stay visible without hover or focus. */
  readonly visible: boolean;
  /**
   * Updates the checked state of the demo's handle visibility option.
   *
   * @param visible - Whether handles remain visible without hover or focus.
   * @returns Schedules the updated visibility setting.
   */
  readonly setVisible: (visible: boolean) => void;
}
/** Shares the demo control state with toolbar instances. */
const DemoHandleVisibilityContext = createContext<DemoHandleVisibility | null>(null);
const DEMO_BLOCK_IDS_TOOLTIP =
  "Shows a shortened block id at the end of each row. Hover that label to see the full id.";
const DEMO_VIRTUALIZE_PAGE_TOOLTIP =
  "When on, only page roots near the viewport stay mounted. When off, every root stays mounted.";
const DEMO_VIRTUALIZE_THRESHOLD_TOOLTIP =
  "Starts windowing once the page has at least this many root blocks. Only roots in the viewport, plus the extra roots on each side, stay mounted; other roots become spacers. Nested blocks inside a mounted root stay in the document. Leave empty to virtualize at any root count.";
const DEMO_VIRTUALIZE_OVERSCAN_TOOLTIP =
  "How many extra root blocks stay mounted above and below the viewport while the page is virtualized.";

/**
 * Persists one Review envelope through the demo-only Vite server adapter.
 *
 * @param report - Detached report produced by the standalone extension.
 * @returns Nothing after the JSON file has been written successfully.
 */
async function saveDemoReviewReport(report: ReviewReport): Promise<void> {
  const response = await fetch("/__review-reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(report),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || "Failed to write Review report");
  }
}

/** @returns A fresh Review extension for one independently owned editor. */
const demoReviewReports = () =>
  reviewReportExtensions({
    saveReport: saveDemoReviewReport,
  });

/**
 * Intercepts custom Markdown link protocols (`rivto:` / `chulane:`).
 *
 * Host apps own non-http links; ordinary URLs stay native. Dispatches
 * `rivto:markdown-link` for e2e / host listeners.
 */
const handleMarkdownLink = ({ href, event }: MarkdownLinkClick): void => {
  if (!/^(?:rivto|chulane):/i.test(href)) {
    return;
  }
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
 * Reads `?repeat=` as extra seeded content for the active demo route.
 *
 * Invalid, missing, or non-positive values are ignored so the default seed
 * stays unchanged. Each copy is a new card because a separator is inserted
 * before it.
 *
 * @returns Finite extra-copy count, or 0 when the param should be ignored.
 */
function demoRepeatCount(): number {
  const raw = new URLSearchParams(window.location.search).get("repeat");
  if (raw == null || raw === "") {
    return 0;
  }
  const count = Number.parseInt(raw, 10);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

/**
 * Resolves the demo thread endpoint from the controls rendered in one block row.
 *
 * @param block - Rendered block shell being measured.
 * @returns The universal handle when it has nonzero layout dimensions, otherwise
 * a collapse toggle with nonzero dimensions, or null when neither is available.
 * Opacity is not checked, so a hover-hidden handle still supplies a stable anchor.
 */
function demoThreadAnchor(block: Element): Element | null {
  const row = block.querySelector(":scope > .rivto-block-row");
  for (const selector of [BLOCK_HANDLE_SELECTOR, ".page-collapse-toggle"]) {
    const control = row?.querySelector(selector);
    if (control) {
      const rect = control.getBoundingClientRect();
      if (rect.width && rect.height) {
        return control;
      }
    }
  }
  return null;
}

/** Borrowed command operation used to seed the canvas showcase. */
interface DemoCanvasSeedEditor {
  /** Executes registered edgeless creation and selection commands. */
  readonly commands: Pick<DocumentEditorAPI["commands"], "execute">;
}

/** Borrowed document operations used by the feature showcase. */
interface FeatureSeedEditor extends DemoCanvasSeedEditor {
  /** Creates, nests, moves and reads showcase blocks. */
  readonly blocks: Pick<
    DocumentEditorAPI["blocks"],
    | "getBlock"
    | "getInsertionDestinationAfter"
    | "getRootIds"
    | "importForest"
    | "indentBlock"
    | "insertBlock"
    | "moveBlocks"
  >;
  /** Creates canvas elements and reads their stacking order. */
  readonly elements: Pick<DocumentEditorAPI["elements"], "getElementNodes" | "insertElement">;
  /** Groups repeated showcase insertions into one history batch. */
  readonly history: Pick<DocumentEditorAPI["history"], "batchUpdates">;
}

/**
 * Seeds canvas visuals that exercise edgeless features in the journal demo.
 *
 * Needed so a fresh demo load already has shapes, text, sticky, drawing,
 * connectors, nested groups, and spare siblings for align / distribute /
 * layer-order practice — without the visitor having to create them first.
 *
 * @param editor - Borrowed command registry used to create and select showcase elements.
 * @returns Showcase elements have been inserted and their selection cleared.
 * @throws If a registered canvas command fails.
 */
function seedEdgelessShowcase(editor: DemoCanvasSeedEditor): void {
  // Cards grow with their content, including embeddings. Keep the heading
  // above their initial frames so collapsing an outline cannot put it over a row.
  editor.commands.execute("edgeless.visual.create", {
    kind: "text",
    ...{
      text: "Edgeless showcase",
      frame: { x: 60, y: 0, width: 280, height: 32 },
      fontSize: 22,
      fontFamily: "Georgia, Cambria, serif",
      color: "#212529",
    },
  }) as EditorElementNode;
  editor.commands.execute("edgeless.visual.create", {
    kind: "text",
    ...{
      text: "Shapes · sticky · pencil · connector · nested group · align/distribute extras",
      frame: { x: 60, y: 32, width: 560, height: 28 },
      fontSize: 13,
      color: "#495057",
    },
  }) as EditorElementNode;

  const rect = editor.commands.execute("edgeless.visual.create", {
    kind: "rectangle",
    ...{
      frame: { x: 60, y: 530, width: 130, height: 90 },
      fill: "#d0ebff",
      stroke: "#1c7ed6",
      strokeWidth: 2,
      text: "Rect",
    },
  }) as EditorElementNode;
  const ellipse = editor.commands.execute("edgeless.visual.create", {
    kind: "ellipse",
    ...{
      frame: { x: 240, y: 545, width: 110, height: 80 },
      fill: "#fff3bf",
      stroke: "#e67700",
      strokeWidth: 2,
      text: "Ellipse",
    },
  }) as EditorElementNode;
  editor.commands.execute("edgeless.visual.create", {
    kind: "connector",
    ...{
      route: "orthogonal",
      source: { elementId: rect.id, anchor: { x: 1, y: 0.5 }, position: { x: 190, y: 575 } },
      target: { elementId: ellipse.id, anchor: { x: 0, y: 0.5 }, position: { x: 240, y: 585 } },
      stroke: "#495057",
      lineStyle: "dashed",
      endStyle: "arrow",
      text: "link",
      textRotation: "along",
    },
  }) as EditorElementNode;

  editor.commands.execute("edgeless.selection.set", [rect.id, ellipse.id]);
  const shapeGroup = editor.commands.execute("edgeless.selection.group") as EditorElementNode;

  const sticky = editor.commands.execute("edgeless.visual.create", {
    kind: "sticker",
    ...{
      text: "Sticky note\n(double-click to edit)",
      fill: "#eeeaff",
      color: "#362b67",
      frame: { x: 420, y: 530, width: 170, height: 130 },
    },
  }) as EditorElementNode;

  // Second connector: animated dashes flow toward the sticky.
  editor.commands.execute("edgeless.visual.create", {
    kind: "connector",
    ...{
      route: "curve",
      source: { elementId: ellipse.id, anchor: { x: 1, y: 0.5 }, position: { x: 350, y: 585 } },
      target: { elementId: sticky.id, anchor: { x: 0, y: 0.5 }, position: { x: 420, y: 595 } },
      stroke: "#868e96",
      lineStyle: "dashed-animated",
      endStyle: "arrow",
      text: "",
    },
  }) as EditorElementNode;

  // Nested group: existing group + sticky (Primary-click / Group again in the UI).
  editor.commands.execute("edgeless.selection.set", [shapeGroup.id, sticky.id]);
  editor.commands.execute("edgeless.selection.group") as EditorElementNode;

  editor.commands.execute("edgeless.visual.create", {
    kind: "drawing",
    ...{
      brush: "pencil",
      frame: { x: 640, y: 530, width: 150, height: 100 },
      points: [
        { x: 8, y: 72 },
        { x: 28, y: 18 },
        { x: 52, y: 58 },
        { x: 78, y: 12 },
        { x: 108, y: 64 },
        { x: 138, y: 28 },
      ],
      stroke: "#212529",
      strokeWidth: 2,
    },
  }) as EditorElementNode;
  editor.commands.execute("edgeless.visual.create", {
    kind: "text",
    ...{
      text: "Free text — resize corners, drag handle, layer arrows",
      frame: { x: 640, y: 650, width: 260, height: 48 },
      fontSize: 14,
      color: "#343a40",
    },
  }) as EditorElementNode;

  // Unrelated siblings for align / distribute / multi-select practice.
  editor.commands.execute("edgeless.visual.create", {
    kind: "rectangle",
    ...{
      frame: { x: 920, y: 530, width: 56, height: 56 },
      fill: "#d3f9d8",
      stroke: "#2b8a3e",
    },
  }) as EditorElementNode;
  editor.commands.execute("edgeless.visual.create", {
    kind: "rectangle",
    ...{
      frame: { x: 1020, y: 560, width: 56, height: 56 },
      fill: "#d3f9d8",
      stroke: "#2b8a3e",
    },
  }) as EditorElementNode;
  editor.commands.execute("edgeless.visual.create", {
    kind: "rectangle",
    ...{
      frame: { x: 1120, y: 510, width: 56, height: 56 },
      fill: "#d3f9d8",
      stroke: "#2b8a3e",
    },
  }) as EditorElementNode;
  editor.commands.execute("edgeless.visual.create", {
    kind: "ellipse",
    ...{
      frame: { x: 920, y: 640, width: 70, height: 48 },
      fill: "#ffd8a8",
      stroke: "#d9480f",
    },
  }) as EditorElementNode;

  editor.commands.execute("edgeless.selection.clear");
}

/**
 * Opens one demo database model before creating its core API and seeding.
 *
 * @returns Host-owned document storage, session database, and database model;
 * the caller or editor cache creates the core.
 * @throws If registry initialization or document opening fails.
 */
async function createDemoDocument() {
  const database = new DemoDatabase();
  const storage = new DocumentStorage({
    registry: new YjsDocumentRegistry(`rivto-demo-${crypto.randomUUID()}`),
    createDocumentModel: (crdt) => new DBDocumentModel(crdt, database),
  });
  storage.registerDocument("journal");
  const document = await storage.openDocument("journal");
  return { storage, document, database };
}

/**
 * Releases runtime registrations before closing all document connections.
 *
 * The session database is destroyed even if editor or storage cleanup fails.
 * A failing earlier cleanup prevents later editor and storage cleanup steps.
 *
 * @param runtime - Resources created by a demo factory.
 * @returns A promise resolving after the host storage has closed its registry and documents.
 * @throws If an editor, document, storage, or database cleanup fails.
 */
async function destroyDemoEditor(runtime: {
  readonly storage: DocumentStorage;
  readonly database: DemoDatabase;
  readonly editor: DocumentEditorAPI;
  readonly reactEditor: ReactEditorApi;
  readonly editorStorage?: EditorStorage;
}): Promise<void> {
  try {
    if (runtime.editorStorage) {
      await runtime.editorStorage.destroy();
    } else {
      runtime.reactEditor.destroy();
      runtime.editor.destroy();
      await runtime.editor.getDocument().destroy();
    }
    await runtime.storage.destroy();
  } finally {
    runtime.database.destroy();
  }
}

/**
 * Builds today's journal editor with notebook or feature-showcase content.
 *
 * The default notebook is written for the demo. `?test_features=1` selects the
 * original playground with Markdown, nested lists, checkboxes, numbered lists,
 * custom blocks, separators, block elements, embeddings, and the edgeless showcase
 * so selection, slash commands, and extensions remain testable.
 * `?keymap=alternate` remaps indent; `?repeat=N` adds N separated copies of a
 * section for large-document exploration.
 *
 * @returns Seeded journal resources and editor cache after initialization and history reset.
 * The caller owns their cleanup through destroyDemoEditor.
 * @throws If storage initialization, editor creation, or document seeding fails.
 */
async function createDemoEditor() {
  const resources = await createDemoDocument();
  // Used by e2e / KEYMAP demos: `?keymap=alternate` remaps indent without test-only APIs.
  const alternateKeymap =
    new URLSearchParams(window.location.search).get("keymap") === "alternate"
      ? {
          [KEYBOARD_BINDING_IDS.blockIndent]: ["Primary+ArrowRight"],
          [KEYBOARD_BINDING_IDS.blockOutdent]: [],
        }
      : undefined;
  const demoParams = new URLSearchParams(window.location.search);
  const imageFirst = demoParams.has("imageFirst");
  const imageOnly = demoParams.has("imageOnly");
  const fileOnly = demoParams.has("fileOnly");
  // Hand the already-open journal model to the editor cache exactly once.
  const prepared = new Map([[resources.document.id, resources.document]]);
  const editorStorage = new EditorStorage({
    openDocument: async (id) => {
      const document = prepared.get(id);
      prepared.delete(id);
      return document ?? resources.storage.openDocument(id);
    },
    /**
     * Installs the demo renderers and interactions for a cached document editor.
     *
     * @param documentEditor - Core editor whose lifecycle is managed by EditorStorage.
     * @returns React editor retained and disposed by the owning cache.
     */
    createEditor: (documentEditor) => {
      return createReactEditor({
        editor: documentEditor,
        keymap: alternateKeymap,
        extensions: [
          ...(imageFirst || imageOnly ? [imageExtension({ provider: demoBinaryProvider })] : []),
          ...(imageOnly ? [] : [fileExtension({ provider: demoBinaryProvider })]),
          demoLocalFileExtension,
          ...(imageFirst || imageOnly || fileOnly
            ? []
            : [imageExtension({ provider: demoBinaryProvider })]),
          standardPreset({ writing: { onMarkdownLinkClick: handleMarkdownLink } }),
          todoItemExtension({ prompts: { todo: ["task"] } }),
          pageDragExtension(),
          bulletThreadingExtension({
            anchor: demoThreadAnchor,
            excludeBlockTypes: [
              BENTO_BLOCK_TYPE,
              COLUMNS_BLOCK_TYPE,
              KANBAN_BLOCK_TYPE,
              TABLE_BLOCK_TYPE,
              TODO_STORAGE_BLOCK_TYPE,
            ],
          }),
          ...edgelessPreset({ visuals: edgelessOptions }),
          mindmapExtension(),
          blockIdExtension(),
          blockNumberExtension(),
          ...customBlockExtensions,
          embeddingExtension(),
          ...demoReviewReports(),
        ],
      });
    },
  });
  const acquisition = await editorStorage.acquireEditor(resources.document.id);
  const editor = acquisition.editor;
  const reactEditor = editorStorage.getEditor(editor.getDocument().id)!;
  // Playwright and host scripts locate this demo instance through window, not React refs.
  // The token changes on each create so a stale handle cannot be mistaken for a remount.
  const demoToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  Object.assign(window, {
    __rivtoDemo: { token: demoToken, editor, reactEditor },
  });
  if (new URLSearchParams(window.location.search).get("test_features") === "1") {
    seedFeatureDemo(editor, resources.document.id);
  } else {
    seedJournalDemo(editor, demoRepeatCount());
  }
  editor.history.clear();

  return { ...resources, editor, reactEditor, editorStorage };
}

/**
 * Populates the feature showcase used by browser regression tests and manual exploration.
 *
 * This preserves the original seeded structure, including optional repeated cards and
 * canvas examples. The caller owns the editor and resets its history after seeding.
 *
 * @param editor - Initialized editor whose document receives the showcase blocks and elements.
 * @param documentId - Identity used by the self-referencing embedded block.
 * @returns The feature showcase has been inserted into the document.
 * @throws If a delegated block or element operation fails.
 */
function seedFeatureDemo(editor: FeatureSeedEditor, documentId: string): void {
  const introId = editor.blocks.insertBlock({
    ...paragraphBlockFactory.createEmptyBlock(),
    content: "**Rivto editor**",
  }).id;
  const paragraphId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content:
        "This paragraph renders *Markdown*, ~~old text~~, and `inline code` when it is not edited.",
    },
    editor.blocks.getInsertionDestinationAfter(introId),
  ).id;

  const selectionStartId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content:
        "Start a selection in the middle of this sentence and drag downward. See [Rivto](https://example.com).",
    },
    editor.blocks.getInsertionDestinationAfter(paragraphId),
  ).id;
  const middleParagraphId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content:
        "This complete **Markdown paragraph** should be included between partial selections.",
    },
    editor.blocks.getInsertionDestinationAfter(selectionStartId),
  ).id;
  const listId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Nested branch one owns several Markdown children.",
    },
    editor.blocks.getInsertionDestinationAfter(middleParagraphId),
  ).id;
  const childId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Level 2: this child owns another nested branch.",
    },
    editor.blocks.getInsertionDestinationAfter(listId),
  ).id;
  editor.blocks.indentBlock(childId);
  const grandchildId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Level 3: selection now crosses two indentation boundaries.",
    },
    editor.blocks.getInsertionDestinationAfter(childId),
  ).id;
  editor.blocks.indentBlock(grandchildId);
  const greatGrandchildId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Level 4: deepest item for recursive rendering and outdent checks.",
    },
    editor.blocks.getInsertionDestinationAfter(grandchildId),
  ).id;
  editor.blocks.indentBlock(greatGrandchildId);
  editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Level 2: sibling after the deep branch.",
    },
    editor.blocks.getInsertionDestinationAfter(childId),
  );

  const reverseSelectionId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Reverse selection should preserve the browser's anchor and focus direction.",
    },
    editor.blocks.getInsertionDestinationAfter(listId),
  ).id;
  const secondBranchId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Nested branch two is a second independent structure.",
    },
    editor.blocks.getInsertionDestinationAfter(reverseSelectionId),
  ).id;
  const numberedChildId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Second branch level 2 child.",
    },
    editor.blocks.getInsertionDestinationAfter(secondBranchId),
  ).id;
  editor.blocks.indentBlock(numberedChildId);
  const numberedGrandchildId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Second branch level 3 descendant.",
    },
    editor.blocks.getInsertionDestinationAfter(numberedChildId),
  ).id;
  editor.blocks.indentBlock(numberedGrandchildId);
  editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Second branch level 2 sibling.",
    },
    editor.blocks.getInsertionDestinationAfter(numberedChildId),
  );

  const sliderId = editor.blocks.insertBlock(
    {
      type: SLIDER_BLOCK_TYPE,
      content: "const selectedBlocks = selection.filter(item => item.type === 'block');",
      props: { value: 35 },
    },
    editor.blocks.getInsertionDestinationAfter(secondBranchId),
  ).id;
  const selectionEndId = editor.blocks.insertBlock(
    {
      type: COUNTER_BLOCK_TYPE,
      props: { count: 2 },
    },
    editor.blocks.getInsertionDestinationAfter(sliderId),
  ).id;
  const finalId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Finish the selection in the middle of this sentence, then try copy or cut.",
    },
    editor.blocks.getInsertionDestinationAfter(selectionEndId),
  ).id;
  const slashId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Type `/` anywhere here to open searchable slash commands.",
    },
    editor.blocks.getInsertionDestinationAfter(finalId),
  ).id;
  const uncheckedId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Try the interactive checkbox",
      listProps: { type: "checkbox", checked: false },
    },
    editor.blocks.getInsertionDestinationAfter(slashId),
  ).id;
  const checkedId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Completed checkbox item",
      listProps: { type: "checkbox", checked: true },
    },
    editor.blocks.getInsertionDestinationAfter(uncheckedId),
  ).id;
  const numberedStartId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Start a numbered sequence",
      listProps: { type: "start_numbered_list" },
    },
    editor.blocks.getInsertionDestinationAfter(checkedId),
  ).id;
  const numberedNextId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Continue the adjacent sequence",
      listProps: { type: "numbered_list" },
    },
    editor.blocks.getInsertionDestinationAfter(numberedStartId),
  ).id;
  const numberedGapId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Ordinary content between numbered items",
    },
    editor.blocks.getInsertionDestinationAfter(numberedNextId),
  ).id;
  const numberedContinueId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Continue numbering across the ordinary block",
      listProps: { type: "continue_numbered_list" },
    },
    editor.blocks.getInsertionDestinationAfter(numberedGapId),
  ).id;

  // The explicit separator is visible in block mode and partitions cards only
  // because its React block plugin declares `separatesBlockElements`.
  editor.blocks.insertBlock(
    separatorBlockFactory.createEmptyBlock(),
    editor.blocks.getInsertionDestinationAfter(reverseSelectionId),
  );
  editor.elements.insertElement({
    type: "block",
    frame: { x: 60, y: 60, width: 500, height: 360 },
    zIndex: 0,
    props: { startBlockId: introId, endBlockId: reverseSelectionId },
  });
  editor.elements.insertElement({
    type: "block",
    frame: { x: 600, y: 60, width: 500, height: 360 },
    zIndex: 1,
    props: { startBlockId: secondBranchId, endBlockId: numberedContinueId },
  });
  editor.blocks.insertBlock(
    {
      ...createBentoBlockInput(),
      children: [
        {
          ...paragraphBlockFactory.createEmptyBlock(),
          content: "A small idea",
          props: { bentoWidth: 220 },
        },
        {
          ...paragraphBlockFactory.createEmptyBlock(),
          content:
            "Room to explore. Drag this tile's left or right edge to resize. Heights follow your content, and tiles wrap with the editor width.",
          props: { bentoWidth: 400 },
        },
        {
          ...paragraphBlockFactory.createEmptyBlock(),
          content:
            "Drag blocks between tiles, nest them inside, or move them back into the editor.",
        },
      ],
    },
    editor.blocks.getInsertionDestinationAfter(numberedContinueId),
  );
  const tableId = editor.blocks.insertBlock(
    createTableBlockInput(),
    editor.blocks.getInsertionDestinationAfter(numberedContinueId),
  ).id;
  const kanbanId = editor.blocks.insertBlock(
    createKanbanBlockInput(),
    editor.blocks.getInsertionDestinationAfter(tableId),
  ).id;
  const column = editor.blocks.getBlock(kanbanId)!.children[0]!;
  const cardId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Drag me between columns or back into the editor",
    },
    editor.blocks.getInsertionDestinationAfter(kanbanId),
  ).id;
  editor.blocks.moveBlocks([cardId], column.id, "inside");
  const columnsId = editor.blocks.insertBlock(
    createColumnsBlockInput(2),
    editor.blocks.getInsertionDestinationAfter(kanbanId),
  ).id;
  const columnsBoard = editor.blocks.getBlock(columnsId)!;
  const leftColumnId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content:
        "Left column. Add more blocks here, or use the settings control to change the column count.",
    },
    editor.blocks.getInsertionDestinationAfter(columnsId),
  ).id;
  const rightColumnId = editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Right column. Deleting a column moves its blocks into the remaining column.",
    },
    editor.blocks.getInsertionDestinationAfter(columnsId),
  ).id;
  editor.blocks.moveBlocks([leftColumnId], columnsBoard.children[0]!.id, "inside");
  editor.blocks.moveBlocks([rightColumnId], columnsBoard.children[1]!.id, "inside");
  const repeatCount = demoRepeatCount();
  if (repeatCount > 0) {
    const rootIds = editor.blocks.getRootIds();
    const start = rootIds.indexOf(secondBranchId);
    const end = rootIds.indexOf(numberedContinueId);
    const template = rootIds.slice(start, end + 1).flatMap((id) => {
      const block = editor.blocks.getBlock(id);
      return block ? [block] : [];
    });
    editor.history.batchUpdates(() => {
      for (let index = 0; index < repeatCount; index += 1) {
        editor.blocks.insertBlock(separatorBlockFactory.createEmptyBlock());
        editor.blocks.importForest(template);
      }
    });
  }
  const todoStorageId = editor.blocks.insertBlock({
    type: TODO_STORAGE_BLOCK_TYPE,
    content: "",
  }).id;
  const todoId = editor.blocks.insertBlock(
    {
      type: TODO_ITEM_BLOCK_TYPE,
      content: "Review the project brief",
      props: {
        status: "todo",
        description: "Confirm scope and acceptance criteria.",
        priority: 2,
        project: "Planning",
      },
    },
    editor.blocks.getInsertionDestinationAfter(todoStorageId),
  ).id;
  editor.blocks.indentBlock(todoId);
  const doingId = editor.blocks.insertBlock(
    {
      type: TODO_ITEM_BLOCK_TYPE,
      content: "Build the editor extension",
      props: {
        status: "doing",
        description: "Prompt conversion and task properties are in progress.",
        priority: 1,
        project: "Rivto",
      },
    },
    editor.blocks.getInsertionDestinationAfter(todoId),
  ).id;
  editor.blocks.insertBlock(
    {
      type: TODO_ITEM_BLOCK_TYPE,
      content: "Set up the workspace",
      props: {
        status: "done",
        description: "Core packages and demo are ready.",
        priority: 3,
        project: "Rivto",
      },
    },
    editor.blocks.getInsertionDestinationAfter(doingId),
  );
  seedEdgelessShowcase(editor);
  editor.elements.insertElement(
    createReviewElementInput({
      id: "demo-review-element",
      frame: { x: 920, y: 730, width: 420, height: 260 },
      zIndex: Math.max(0, ...editor.elements.getElementNodes().map(({ zIndex }) => zIndex)) + 1,
      problem: "Ошибка структуры на холсте",
    }),
  );
  editor.blocks.insertBlock(
    {
      type: EMBEDDING_BLOCK_TYPE,
      props: { targetDocumentId: documentId, targetBlockId: listId },
    },
    editor.blocks.getInsertionDestinationAfter(paragraphId),
  );
}

/**
 * Builds yesterday's journal editor with no seed blocks.
 *
 * Needed to show two independent editor instances on one page (journal stack)
 * and to contrast a populated document with an empty one.
 *
 * @returns A promise resolving to document resources and initialized core and React editors.
 * @throws If document or editor initialization fails.
 */
async function createEmptyDemoEditor() {
  const resources = await createDemoDocument();
  const editor = createDocumentEditor({ document: resources.document });
  const reactEditor = createReactEditor({
    editor,
    extensions: [
      fileExtension({ provider: demoBinaryProvider }),
      demoLocalFileExtension,
      imageExtension({ provider: demoBinaryProvider }),
      standardPreset({ writing: { onMarkdownLinkClick: handleMarkdownLink } }),
      pageDragExtension(),
      ...edgelessPreset({ visuals: edgelessOptions }),
      mindmapExtension(),
      blockIdExtension(),
      blockNumberExtension(),
      ...customBlockExtensions,
      ...demoReviewReports(),
    ],
  });
  return { ...resources, editor, reactEditor };
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
 * Needed so visitors can flip Page ↔ Edgeless, toggle debug block IDs and numbering, and
 * exercise delete/undo without digging into keyboard shortcuts. Reused by
 * journal, multi-editor, and sync surfaces.
 *
 * @param props - Editor actions and host-controlled display settings.
 * @param props.editor - Core editor receiving delete, undo, and snapshot operations.
 * @param props.showBlockIds - Whether debug block IDs are visible.
 * @param props.onShowBlockIdsChange - Receives the requested ID visibility.
 * @param props.showBlockNumbers - Whether gutter numbers are visible.
 * @param props.onShowBlockNumbersChange - Receives the requested number visibility.
 * @param props.showNestingLines - Whether nesting lines are enabled, when exposed.
 * @param props.onShowNestingLinesChange - Receives the requested nesting-line visibility.
 * @param props.virtualizePageThreshold - Current page virtualization setting, when exposed.
 * @param props.onVirtualizePageThresholdChange - Receives the requested virtualization setting.
 * @param props.virtualizePageOverscan - Current number of extra page rows to render.
 * @param props.onVirtualizePageOverscanChange - Receives the requested extra-row count.
 * @returns Toolbar controls and any report-restoration error, within the active panel.
 */
function DemoToolbar({
  editor,
  showBlockIds,
  onShowBlockIdsChange,
  showBlockNumbers,
  onShowBlockNumbersChange,
  showNestingLines,
  onShowNestingLinesChange,
  virtualizePageThreshold,
  onVirtualizePageThresholdChange,
  virtualizePageOverscan,
  onVirtualizePageOverscanChange,
}: {
  readonly editor: DocumentEditorAPI;
  readonly showBlockNumbers: boolean;
  /**
   * Requests a host-owned change to gutter-number visibility.
   *
   * @param visible - Checked state selected by the toolbar checkbox.
   * @returns No value; the host supplies the updated showBlockNumbers prop.
   */
  readonly onShowBlockNumbersChange: (visible: boolean) => void;
  readonly showNestingLines?: boolean;
  /**
   * Requests a change to nesting-line visibility.
   *
   * @param visible - Whether the overlay should be installed.
   * @returns The host receives the requested visibility.
   */
  readonly onShowNestingLinesChange?: (visible: boolean) => void;
  readonly showBlockIds: boolean;
  readonly onShowBlockIdsChange: (visible: boolean) => void;
  readonly virtualizePageThreshold?: boolean | number;
  readonly onVirtualizePageThresholdChange?: (threshold: boolean | number) => void;
  readonly virtualizePageOverscan?: number;
  readonly onVirtualizePageOverscanChange?: (count: number) => void;
}) {
  const { mode, setMode } = useEditorMode();
  const handleVisibility = useContext(DemoHandleVisibilityContext);
  const [reportError, setReportError] = useState<string | null>(null);
  let thresholdInputValue: number | "" = "";
  if (typeof virtualizePageThreshold === "number") {
    thresholdInputValue = virtualizePageThreshold;
  }
  /** No-ops when already in `next` so repeated clicks do not thrash mode. */
  const switchMode = (next: "block" | "edgeless") => {
    if (next === mode) {
      return;
    }
    setMode(next);
  };

  /** Loads the snapshot from a user-selected Review report envelope. */
  const restoreReport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }
    setReportError(null);
    try {
      const report = JSON.parse(await file.text()) as Partial<ReviewReport>;
      if (!report.snapshot || report.snapshot.version !== 9) {
        throw new Error("Selected file is not a Review report");
      }
      editor.load(report.snapshot);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Failed to restore Review report");
    }
  };

  /**
   * Uses an empty threshold input to mean virtualization is always enabled.
   *
   * @param event - Current numeric input.
   * @returns Nothing.
   */
  const changeVirtualizationThreshold = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = event.currentTarget.valueAsNumber;
    if (Number.isFinite(value)) {
      onVirtualizePageThresholdChange?.(Math.max(0, Math.trunc(value)));
    } else {
      onVirtualizePageThresholdChange?.(true);
    }
  };

  return (
    <header className="demo-header">
      <div className="demo-toolbar-main">
        <span className="demo-wordmark">
          Rivto <span>editor</span>
        </span>
        <div className="demo-mode-switch" role="group" aria-label="Editor mode">
          {/* `data-editor-mode` / `data-editor-action` are used by e2e. */}
          <button
            type="button"
            data-editor-mode="block"
            aria-pressed={mode === "block"}
            onClick={() => switchMode("block")}
          >
            Page
          </button>
          <button
            type="button"
            data-editor-mode="edgeless"
            aria-pressed={mode === "edgeless"}
            onClick={() => switchMode("edgeless")}
          >
            Edgeless
          </button>
        </div>
        <button
          type="button"
          data-editor-action="delete"
          aria-label="Delete"
          title="Delete"
          onClick={() => editor.selection.delete()}
        >
          <Trash2Icon size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          data-editor-action="undo"
          aria-label="Undo"
          title="Undo"
          onClick={() => editor.history.undo()}
        >
          <Undo2Icon size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="demo-toolbar-controls">
        <label className={DEMO_BLOCK_ID_TOGGLE_CLASS} title={DEMO_BLOCK_IDS_TOOLTIP}>
          <input
            type="checkbox"
            checked={showBlockIds}
            title={DEMO_BLOCK_IDS_TOOLTIP}
            onChange={(event) => onShowBlockIdsChange(event.currentTarget.checked)}
          />
          Block IDs
        </label>
        <label className={DEMO_BLOCK_ID_TOGGLE_CLASS}>
          <input
            type="checkbox"
            checked={showBlockNumbers}
            onChange={(event) => onShowBlockNumbersChange(event.currentTarget.checked)}
          />
          Block numbers
        </label>
        {onShowNestingLinesChange && (
          <label className={DEMO_BLOCK_ID_TOGGLE_CLASS}>
            <input
              type="checkbox"
              checked={showNestingLines}
              onChange={(event) => onShowNestingLinesChange(event.currentTarget.checked)}
            />
            Nesting lines
          </label>
        )}
        {handleVisibility && (
          <label className={DEMO_BLOCK_ID_TOGGLE_CLASS}>
            <input
              type="checkbox"
              checked={handleVisibility.visible}
              onChange={(event) => handleVisibility.setVisible(event.currentTarget.checked)}
            />
            Always show drag handles
          </label>
        )}
        {onVirtualizePageThresholdChange && (
          <label className={DEMO_BLOCK_ID_TOGGLE_CLASS} title={DEMO_VIRTUALIZE_PAGE_TOOLTIP}>
            <input
              type="checkbox"
              checked={virtualizePageThreshold !== false}
              title={DEMO_VIRTUALIZE_PAGE_TOOLTIP}
              onChange={(event) => onVirtualizePageThresholdChange(event.currentTarget.checked)}
            />
            Virtualize page
          </label>
        )}
        {onVirtualizePageThresholdChange && (
          <label className={DEMO_BLOCK_ID_TOGGLE_CLASS} title={DEMO_VIRTUALIZE_THRESHOLD_TOOLTIP}>
            Virtualize after roots count
            <input
              type="number"
              min={0}
              step={1}
              placeholder="Always"
              disabled={virtualizePageThreshold === false}
              value={thresholdInputValue}
              title={DEMO_VIRTUALIZE_THRESHOLD_TOOLTIP}
              onChange={changeVirtualizationThreshold}
            />
          </label>
        )}
        {onVirtualizePageOverscanChange && (
          <label className={DEMO_BLOCK_ID_TOGGLE_CLASS} title={DEMO_VIRTUALIZE_OVERSCAN_TOOLTIP}>
            Extra roots per side
            <input
              type="number"
              min={0}
              step={1}
              value={virtualizePageOverscan}
              title={DEMO_VIRTUALIZE_OVERSCAN_TOOLTIP}
              onChange={(event) =>
                onVirtualizePageOverscanChange(
                  Math.max(0, Math.trunc(event.currentTarget.valueAsNumber || 0)),
                )
              }
            />
          </label>
        )}
        <label>
          Restore report
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Restore Review report"
            onChange={(event) => void restoreReport(event)}
          />
        </label>
        {reportError && <span role="alert">{reportError}</span>}
      </div>
    </header>
  );
}

/** Presentation of the active journal panel, independent of rendered descendants. */
interface JournalPresentation {
  mode: EditorMode;
  hasOpenBlock: boolean;
}

/**
 * Default demo: stacked today (seeded) + yesterday (empty) journals.
 *
 * Needed as the primary product walkthrough — two editors, shared toolbar
 * patterns, and lifecycle cleanup when the page unmounts.
 *
 * @returns Loading or initialization-error feedback, then two journal surfaces.
 * The component disposes created runtimes on unmount, including late completions.
 */
function JournalDemoApp() {
  const [presentation, setPresentation] = useState<JournalPresentation>({
    mode: "block",
    hasOpenBlock: false,
  });
  /**
   * Updates journal chrome only when the active panel's presentation changes.
   *
   * @param mode - Mode owned by the active panel.
   * @param hasOpenBlock - Whether the panel displays a nested block.
   * @returns Schedules changed chrome state while preserving equal state identity.
   */
  const onPresentationChange = useCallback((mode: EditorMode, hasOpenBlock: boolean) => {
    setPresentation((previous) => {
      if (previous.mode === mode && previous.hasOpenBlock === hasOpenBlock) {
        return previous;
      }
      return { mode, hasOpenBlock };
    });
  }, []);
  const [runtime, setRuntime] = useState<{
    today: Awaited<ReturnType<typeof createDemoEditor>>;
    yesterday: Awaited<ReturnType<typeof createEmptyDemoEditor>>;
  }>();
  const [error, setError] = useState<string>();
  const [showBlockIds, setShowBlockIds] = useState(false);
  const [showBlockNumbers, setShowBlockNumbers] = useState(false);
  const [showNestingLines, setShowNestingLines] = useState(true);
  const [virtualizePageThreshold, setVirtualizePageThreshold] = useState<boolean | number>(false);
  const [virtualizePageOverscan, setVirtualizePageOverscan] = useState(8);
  const [dates] = useState(() => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return { today, yesterday };
  });

  // EditorPanel acquires its model but does not own the shared runtime. The
  // application releases runtime subscriptions, commands, and host storage.
  // Cleanup also closes factories that finish after this component unmounts.
  useEffect(() => {
    let active = true;
    const created: Parameters<typeof destroyDemoEditor>[0][] = [];
    const retain = async <Runtime extends Parameters<typeof destroyDemoEditor>[0]>(
      factory: Promise<Runtime>,
    ): Promise<Runtime> => {
      const resource = await factory;
      if (active) {
        created.push(resource);
      } else {
        await destroyDemoEditor(resource);
      }
      return resource;
    };
    void Promise.all([retain(createDemoEditor()), retain(createEmptyDemoEditor())])
      .then(([today, yesterday]) => {
        if (active) {
          setRuntime({ today, yesterday });
        }
      })
      .catch((failure) => {
        if (active) {
          setError(String(failure));
        }
      });
    return () => {
      active = false;
      created.forEach((resource) => void destroyDemoEditor(resource).catch(console.error));
    };
  }, []);
  useEffect(() => {
    if (!runtime || !showNestingLines) {
      return;
    }
    return runtime.today.reactEditor.extensions.install(nestingLinesExtension());
  }, [runtime, showNestingLines]);
  if (error) {
    return <p role="alert">{error}</p>;
  }
  if (!runtime) {
    return <p>Loading documents…</p>;
  }
  const { today: todayEditor, yesterday: yesterdayEditor } = runtime;

  return (
    <BlockNumbersVisibleProvider visible={showBlockNumbers}>
      <BlockIdsVisibleProvider visible={showBlockIds}>
        <div
          className="journal-stack"
          data-open-panel={presentation.hasOpenBlock || undefined}
          data-edgeless={presentation.mode === "edgeless" || undefined}
        >
          {/* `data-journal-document` is used by e2e to pick today vs yesterday. */}
          <section
            className="journal-document"
            data-journal-document="today"
            data-edgeless={presentation.mode === "edgeless" || undefined}
          >
            <EditorStorageContext.Provider value={todayEditor.editorStorage}>
              <DemoEditorPanels
                editor={todayEditor.reactEditor}
                onPresentationChange={onPresentationChange}
                documentTitle={
                  <time dateTime={localDateKey(dates.today)}>
                    {new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(dates.today)}
                  </time>
                }
                virtualizePageThreshold={virtualizePageThreshold}
                virtualizePageOverscan={virtualizePageOverscan}
              >
                {(header) => (
                  <>
                    <DemoToolbar
                      editor={todayEditor.editor}
                      showBlockIds={showBlockIds}
                      onShowBlockIdsChange={setShowBlockIds}
                      showBlockNumbers={showBlockNumbers}
                      onShowBlockNumbersChange={setShowBlockNumbers}
                      showNestingLines={showNestingLines}
                      onShowNestingLinesChange={setShowNestingLines}
                      virtualizePageThreshold={virtualizePageThreshold}
                      onVirtualizePageThresholdChange={setVirtualizePageThreshold}
                      virtualizePageOverscan={virtualizePageOverscan}
                      onVirtualizePageOverscanChange={setVirtualizePageOverscan}
                    />
                    <RevisionsPanel />
                    <KeyboardPanel />
                    {header}
                    <DemoEditorSurface />
                  </>
                )}
              </DemoEditorPanels>
            </EditorStorageContext.Provider>
          </section>
          <section className="journal-document" data-journal-document="yesterday">
            <EditorPanel editor={yesterdayEditor.reactEditor}>
              <JournalDate date={dates.yesterday} />
              <PageSurface />
            </EditorPanel>
          </section>
        </div>
      </BlockIdsVisibleProvider>
    </BlockNumbersVisibleProvider>
  );
}

/**
 * Builds one side of the dual-editor demo opened via `?editors=2`.
 *
 * Manual playground for cross-document drag/selection/history. Stable block
 * ids (`left-parent`, …) keep panes readable with Block IDs on and let e2e
 * target rows. Optional `empty` / `conflict` flags cover edge cases (also used
 * by Playwright via query params).
 *
 * @param side - Pane whose document and sample blocks should be created.
 * @param options - Optional right-pane empty state and conflicting block fixture.
 * @param options.empty - Leaves the right pane without sample blocks when true.
 * @param options.conflict - Adds a conflicting child ID to the populated right pane when set to `block`.
 * @returns A promise resolving to document resources and initialized core and React editors.
 * @throws If document initialization or fixture creation fails.
 */
async function createMultiEditor(
  side: "left" | "right",
  options: {
    /** Skip sample blocks in the right pane. */
    readonly empty?: boolean;
    /** Add a conflicting child block ID to the right pane. */
    readonly conflict?: "block";
  } = {},
) {
  const resources = await createDemoDocument();
  const editor = createDocumentEditor({ document: resources.document });
  const reactEditor = createReactEditor({
    editor,
    extensions: [
      fileExtension({ provider: demoBinaryProvider }),
      demoLocalFileExtension,
      imageExtension({ provider: demoBinaryProvider }),
      standardPreset({ writing: { onMarkdownLinkClick: handleMarkdownLink } }),
      pageDragExtension(),
      ...edgelessPreset({ visuals: edgelessOptions }),
      mindmapExtension(),
      blockIdExtension(),
      blockNumberExtension(),
      ...customBlockExtensions,
      ...demoReviewReports(),
    ],
  });
  if (side === "left") {
    const parentId = editor.blocks.insertBlock({
      id: "left-parent",
      type: DEFAULT_WRITING_BLOCK_TYPE,
      content: "Movable parent",
      listProps: { collapsed: true },
      children: [
        {
          id: "left-child",
          type: DEFAULT_WRITING_BLOCK_TYPE,
          content: "Nested child",
        },
      ],
    }).id;
    editor.elements.insertElement({
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
    editor.blocks.insertBlock({
      id: "left-stay",
      type: DEFAULT_WRITING_BLOCK_TYPE,
      content: "Stays in the source",
    });
  } else if (!options.empty) {
    editor.blocks.insertBlock({
      id: "right-target",
      type: DEFAULT_WRITING_BLOCK_TYPE,
      content: "Destination parent",
      children: [
        { id: "right-nested", type: DEFAULT_WRITING_BLOCK_TYPE, content: "Destination child" },
        // Used by e2e + manual `?conflict=block`: duplicate id must reject the drop.
        ...(options.conflict === "block"
          ? [{ id: "left-child", type: DEFAULT_WRITING_BLOCK_TYPE, content: "Conflicting ID" }]
          : []),
      ],
    });
    editor.blocks.insertBlock({
      id: "right-counter",
      type: COUNTER_BLOCK_TYPE,
      props: { count: 20 },
    });
  }
  editor.history.clear();
  return { ...resources, editor, reactEditor };
}

/** Used by e2e: hidden `editor.dump()` for asserting structure not shown in the UI. */
function DocumentStateDump({ editor }: { readonly editor: DocumentEditorAPI }) {
  const snapshot = useSyncExternalStore(
    (listener) => editor.subscribe(listener),
    () => JSON.stringify(editor.dump()),
    () => JSON.stringify(editor.dump()),
  );
  return (
    <output data-document-state hidden>
      {snapshot}
    </output>
  );
}

/**
 * One pane of `?editors=2` (toolbar + document dump for e2e).
 *
 * Owns debug-label visibility; the parent owns the supplied runtime's lifetime.
 *
 * @param props - Pane identity and initialized editor resources.
 * @param props.side - Stable left/right identity used to scope browser assertions.
 * @param props.runtime - Core and React editors created for this pane.
 * @returns Independent editor surface, toolbar, revisions, and serialized document state.
 */
function MultiEditorPane({
  side,
  runtime,
}: {
  readonly side: "left" | "right";
  readonly runtime: Awaited<ReturnType<typeof createMultiEditor>>;
}) {
  const [showBlockIds, setShowBlockIds] = useState(false);
  const [showBlockNumbers, setShowBlockNumbers] = useState(false);
  return (
    // `data-multi-editor` is used by e2e to scope left/right locators.
    <section className="multi-editor-pane" data-multi-editor={side}>
      <BlockNumbersVisibleProvider visible={showBlockNumbers}>
        <BlockIdsVisibleProvider visible={showBlockIds}>
          <EditorPanel editor={runtime.reactEditor}>
            <DemoToolbar
              editor={runtime.editor}
              showBlockIds={showBlockIds}
              onShowBlockIdsChange={setShowBlockIds}
              showBlockNumbers={showBlockNumbers}
              onShowBlockNumbersChange={setShowBlockNumbers}
            />
            <RevisionsPanel />
            <DocumentStateDump editor={runtime.editor} />
            <DemoEditorSurface />
          </EditorPanel>
        </BlockIdsVisibleProvider>
      </BlockNumbersVisibleProvider>
    </section>
  );
}

/**
 * Side-by-side editors for manual cross-document practice (`?editors=2`).
 *
 * Query extras (also used by e2e): `emptyDestination=1`, `conflict=block`.
 */
function MultiEditorApp() {
  const params = new URLSearchParams(window.location.search);
  const emptyDestination = params.get("emptyDestination") === "1";
  const conflictParam = params.get("conflict");
  const conflict = conflictParam === "block" ? conflictParam : undefined;
  const [runtime, setRuntime] = useState<{
    left: Awaited<ReturnType<typeof createMultiEditor>>;
    right: Awaited<ReturnType<typeof createMultiEditor>>;
  }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    const created: Awaited<ReturnType<typeof createMultiEditor>>[] = [];
    void Promise.all(
      [
        createMultiEditor("left"),
        createMultiEditor("right", { empty: emptyDestination, conflict }),
      ].map(async (factory) => {
        const resource = await factory;
        if (active) {
          created.push(resource);
        } else {
          await destroyDemoEditor(resource);
        }
        return resource;
      }),
    )
      .then(([left, right]) => {
        if (active) {
          setRuntime({ left, right });
        }
      })
      .catch((failure) => {
        if (active) {
          setError(String(failure));
        }
      });
    return () => {
      active = false;
      created.forEach((resource) => void destroyDemoEditor(resource).catch(console.error));
    };
  }, [emptyDestination, conflict]);
  if (error) {
    return <p role="alert">{error}</p>;
  }
  if (!runtime) {
    return <p>Loading documents…</p>;
  }
  const { left, right } = runtime;

  return (
    <div className="multi-editor-page">
      <MultiEditorPane side="left" runtime={left} />
      <MultiEditorPane side="right" runtime={right} />
    </div>
  );
}

/**
 * Waits until the shared document appears in registry metadata.
 *
 * The registry and abort listeners are removed when the wait settles.
 *
 * @param storage - Registry storage observed for the shared document.
 * @param signal - Cancels the wait when the demo unmounts.
 * @returns A promise resolving once the shared document is registered.
 * @throws If the signal is aborted before registration.
 */
function waitForSharedDocument(storage: DocumentStorage, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Release both listeners before completing the wait.
    const finish = () => {
      unsubscribe();
      signal.removeEventListener("abort", abort);
    };
    // Resolve only after the shared document has been registered.
    const refresh = () => {
      if (!storage.getDocumentIds().includes("shared")) {
        return;
      }
      finish();
      resolve();
    };
    // Reject the wait and release its listeners when cancelled.
    const abort = () => {
      finish();
      reject(signal.reason);
    };
    const unsubscribe = storage.subscribe(refresh);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
    } else {
      refresh();
    }
  });
}

/**
 * Seeds the left peer with introductory and optional repeated writing blocks.
 *
 * The repeated blocks share one history batch, and history is cleared after seeding.
 *
 * @param editor - Core editor for the initially empty shared document.
 * @param repeatCount - Number of additional writing blocks to append.
 * @returns The initial blocks are inserted and the editor history is cleared.
 * @throws If insertion or history operations fail.
 */
function seedSyncedPeer(editor: DocumentEditorAPI, repeatCount: number): void {
  const introId = editor.blocks.insertBlock({
    ...paragraphBlockFactory.createEmptyBlock(),
    content: "**Synced demo** — edit here or in the other pane.",
  }).id;
  editor.blocks.insertBlock(
    {
      ...paragraphBlockFactory.createEmptyBlock(),
      content: "Both editors share one Yjs room over `BroadcastChannel` (same PC, no server).",
    },
    editor.blocks.getInsertionDestinationAfter(introId),
  );
  editor.history.batchUpdates(() => {
    let afterId = editor.blocks.getRootIds().at(-1);
    for (let index = 0; index < repeatCount; index += 1) {
      afterId = editor.blocks.insertBlock(
        {
          ...paragraphBlockFactory.createEmptyBlock(),
          content: `Synced repeated block ${index + 1}`,
        },
        editor.blocks.getInsertionDestinationAfter(afterId),
      ).id;
    }
  });
  editor.history.clear();
}

/**
 * Opens the shared document after the right peer discovers its registry entry.
 *
 * Failed opening attempts to release the document, storage, and database in that
 * order; a document cleanup failure stops the remaining cleanup. Cancellation is
 * checked after registry initialization and document opening and during discovery.
 *
 * @param storage - Registry and document provider owner for this peer.
 * @param database - Session database released if opening fails.
 * @param side - Left peer registers the document; right peer waits for it.
 * @param signal - Cancels pending discovery or an acquisition after it completes.
 * @returns A promise resolving to the opened document.
 * @throws If discovery, opening, cancellation, or cleanup fails.
 */
async function openSyncedDocument(
  storage: DocumentStorage,
  database: DemoDatabase,
  side: "left" | "right",
  signal: AbortSignal,
) {
  let document;
  try {
    await storage.ready;
    signal.throwIfAborted();
    if (side === "right" && !storage.getDocumentIds().includes("shared")) {
      await waitForSharedDocument(storage, signal);
    }
    if (!storage.getDocumentIds().includes("shared")) {
      storage.registerDocument("shared");
    }
    document = await storage.openDocument("shared");
    signal.throwIfAborted();
    return document;
  } catch (failure) {
    await document?.destroy();
    try {
      await storage.destroy();
    } finally {
      database.destroy();
    }
    throw failure;
  }
}

/**
 * Creates one peer for the local BroadcastChannel sync demo.
 *
 * Needed to wire a Yjs-backed editor + `BroadcastChannelProvider` without a
 * server. Only the left peer is seeded; the right starts empty and receives
 * the document so convergence is obvious.
 *
 * @param side - Stable peer identity used for seeding and document IDs.
 * @param roomId - Broadcast channel shared by every peer.
 * @param repeatCount - Additional writing blocks seeded on the left peer.
 * @param signal - Cancels pending registry discovery and document acquisition when the demo unmounts.
 * @returns Editor runtime, session database, and provider resources for one peer.
 * @throws If initialization, cancellation, editor construction, or seeding fails.
 */
async function createSyncedPeer(
  side: "left" | "right",
  roomId: string,
  repeatCount: number,
  signal: AbortSignal,
) {
  const database = new DemoDatabase();
  const storage = new DocumentStorage({
    registry: new YjsDocumentRegistry(roomId),
    createDocumentModel: (crdt) => new DBDocumentModel(crdt, database),
    createProviders: (channel) => [new BroadcastChannelProvider(channel)],
    onError: console.error,
  });
  const document = await openSyncedDocument(storage, database, side, signal);
  const editor = createDocumentEditor({ document });
  const reactEditor = createReactEditor({
    editor,
    extensions: [
      fileExtension({ provider: demoBinaryProvider }),
      demoLocalFileExtension,
      imageExtension({ provider: demoBinaryProvider }),
      standardPreset({ writing: { onMarkdownLinkClick: handleMarkdownLink } }),
      pageDragExtension(),
      ...edgelessPreset({ visuals: edgelessOptions }),
      mindmapExtension(),
      blockIdExtension(),
      blockNumberExtension(),
      ...customBlockExtensions,
      ...demoReviewReports(),
    ],
  });
  if (side === "left" && !editor.blocks.getRootIds().length) {
    seedSyncedPeer(editor, repeatCount);
  }
  return { storage, database, editor, reactEditor };
}

/**
 * Collaborative demo opened with `?sync=1` (optional `?room=`).
 *
 * Needed to verify same-origin Yjs sync over BroadcastChannel: two panes on
 * this page, plus more peers if another tab opens the same URL.
 *
 * @returns Loading or initialization-error feedback, then two synchronized editor panes.
 * The component closes created peers on unmount, including late completions.
 */
function SyncEditorsApp() {
  const roomId = new URLSearchParams(window.location.search).get("room") ?? "rivto-demo-sync";
  const repeatCount = demoRepeatCount();
  const [peers, setPeers] = useState<{
    left: Awaited<ReturnType<typeof createSyncedPeer>>;
    right: Awaited<ReturnType<typeof createSyncedPeer>>;
  }>();
  const [error, setError] = useState<string>();
  const [showBlockIds, setShowBlockIds] = useState(false);
  const [showBlockNumbers, setShowBlockNumbers] = useState(false);
  useEffect(() => {
    let active = true;
    const request = new AbortController();
    const created: Awaited<ReturnType<typeof createSyncedPeer>>[] = [];
    void (async () => {
      const left = await createSyncedPeer("left", roomId, repeatCount, request.signal);
      if (!active) {
        await destroyDemoEditor(left);
        return;
      }
      created.push(left);
      const right = await createSyncedPeer("right", roomId, repeatCount, request.signal);
      if (!active) {
        await destroyDemoEditor(right);
        return;
      }
      created.push(right);
      setPeers({ left, right });
    })().catch((failure) => {
      if (active) {
        setError(String(failure));
      }
    });
    return () => {
      active = false;
      request.abort();
      created.forEach((resource) => void destroyDemoEditor(resource).catch(console.error));
    };
  }, [roomId, repeatCount]);
  if (error) {
    return <p role="alert">{error}</p>;
  }
  if (!peers) {
    return <p>Loading synchronized documents…</p>;
  }

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
            <BlockNumbersVisibleProvider visible={showBlockNumbers}>
              <BlockIdsVisibleProvider visible={showBlockIds}>
                <EditorPanel editor={peers[side].reactEditor}>
                  <DemoToolbar
                    editor={peers[side].editor}
                    showBlockIds={showBlockIds}
                    onShowBlockIdsChange={setShowBlockIds}
                    showBlockNumbers={showBlockNumbers}
                    onShowBlockNumbersChange={setShowBlockNumbers}
                  />
                  <RevisionsPanel />
                  <DemoEditorSurface />
                </EditorPanel>
              </BlockIdsVisibleProvider>
            </BlockNumbersVisibleProvider>
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
 * - `?embeddings=1` → shared document storage and live source subtree embeds
 * - `?sync=1` → BroadcastChannel peers (`SyncEditorsApp`); `repeat=N` adds N synced blocks
 * - `?test_features=1` → original feature showcase used by browser regressions
 * - `?repeat=N` → N extra copies of a journal section (with separators)
 *
 * Needed so one Vite demo app can cover walkthrough, regression, and sync
 * without separate entrypoints.
 *
 * @returns The selected demo with shared handle visibility controls.
 */
export function App() {
  const [visible, setVisible] = useState(false);
  return (
    <DemoHandleVisibilityContext.Provider value={{ visible, setVisible }}>
      <BlockHandleContext.Provider value={{ alwaysVisible: visible }}>
        <DemoAppContent />
      </BlockHandleContext.Provider>
    </DemoHandleVisibilityContext.Provider>
  );
}

/**
 * Selects the requested demo surface from the current URL.
 *
 * @returns The selected demo surface.
 */
function DemoAppContent() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("elementRegistration")) {
    return <ElementRegistrationTest />;
  }
  if (params.get("editorLifecycle") === "1") {
    return <EditorLifecycleTest />;
  }
  if (params.get("embeddings") === "1") {
    return <DocumentsDemo />;
  }
  if (params.get("editors") === "2") {
    return <MultiEditorApp />;
  }
  if (params.get("sync") === "1") {
    return <SyncEditorsApp />;
  }
  return <JournalDemoApp />;
}
