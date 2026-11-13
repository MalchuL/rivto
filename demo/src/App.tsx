import { BLOCK_HANDLE_SELECTOR } from "../../packages/react-rivto-editor/src/components/block-handle/constants";
import { paragraphBlockFactory, separatorBlockFactory } from "@chulane/rivto-react/block-factories";
import { createDynamicExtensions } from "./dynamic-extensions/loader";
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
 * Adds the heading and description above the canvas cards.
 *
 * @param editor - Borrowed canvas command registry.
 * @returns After both text elements are created.
 * @throws If a registered canvas command fails.
 */
function seedEdgelessShowcaseHeading(editor: DemoCanvasSeedEditor): void {
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
}

/**
 * Creates and groups the two connected shapes.
 *
 * @param editor - Borrowed canvas command registry.
 * @returns IDs of the ellipse and the new group.
 * @throws If a registered canvas command fails.
 */
function seedEdgelessShowcaseShapes(editor: DemoCanvasSeedEditor): {
  ellipseId: string;
  shapeGroupId: string;
} {
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
  return { ellipseId: ellipse.id, shapeGroupId: shapeGroup.id };
}

/**
 * Creates a sticky, connects it to the ellipse, and nests the group.
 *
 * @param editor - Borrowed canvas command registry.
 * @param ellipseId - Existing ellipse ID for the connector.
 * @param shapeGroupId - Existing shape group ID.
 * @returns After the connector and nested group are created.
 * @throws If a registered canvas command fails.
 */
function seedEdgelessShowcaseSticky(
  editor: DemoCanvasSeedEditor,
  ellipseId: string,
  shapeGroupId: string,
): void {
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
      source: { elementId: ellipseId, anchor: { x: 1, y: 0.5 }, position: { x: 350, y: 585 } },
      target: { elementId: sticky.id, anchor: { x: 0, y: 0.5 }, position: { x: 420, y: 595 } },
      stroke: "#868e96",
      lineStyle: "dashed-animated",
      endStyle: "arrow",
      text: "",
    },
  }) as EditorElementNode;

  // Nested group: existing group + sticky (Primary-click / Group again in the UI).
  editor.commands.execute("edgeless.selection.set", [shapeGroupId, sticky.id]);
  editor.commands.execute("edgeless.selection.group") as EditorElementNode;
}

/**
 * Creates the pencil drawing and free-text example.
 *
 * @param editor - Borrowed canvas command registry.
 * @returns After both canvas elements are created.
 * @throws If a registered canvas command fails.
 */
function seedEdgelessShowcaseDrawing(editor: DemoCanvasSeedEditor): void {
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
}

/**
 * Creates independent shapes for alignment and distribution.
 *
 * @param editor - Borrowed canvas command registry.
 * @returns After the independent shapes are created.
 * @throws If a registered canvas command fails.
 */
function seedEdgelessShowcaseSiblings(editor: DemoCanvasSeedEditor): void {
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
  seedEdgelessShowcaseHeading(editor);
  const { ellipseId, shapeGroupId } = seedEdgelessShowcaseShapes(editor);
  seedEdgelessShowcaseSticky(editor, ellipseId, shapeGroupId);
  seedEdgelessShowcaseDrawing(editor);
  seedEdgelessShowcaseSiblings(editor);
  editor.commands.execute("edgeless.selection.clear");
}

/**
 * Opens one demo database model before creating its core API and seeding.
 * @returns Host-owned document storage and its database model; the caller or editor cache creates the core.
 */
async function createDemoDocument() {
  const database = new DemoDatabase();
  const storage = new DocumentStorage({
    registry: new YjsDocumentRegistry(`rivto-demo-${crypto.randomUUID()}`),
    createDocumentModel: (crdt) => new DBDocumentModel(crdt, database),
  });
  storage.registerDocument("journal");
  const document = await storage.openDocument("journal");
  return { storage, document };
}

/**
 * Releases runtime registrations before closing all document connections.
 * @param runtime - Resources created by a demo factory.
 * @returns Nothing after the host storage has closed its registry and documents.
 */
async function destroyDemoEditor(runtime: {
  readonly storage: DocumentStorage;
  readonly editor: DocumentEditorAPI;
  readonly reactEditor: ReactEditorApi;
  readonly editorStorage?: EditorStorage;
}): Promise<void> {
  if (runtime.editorStorage) {
    await runtime.editorStorage.destroy();
  } else {
    runtime.reactEditor.destroy();
    runtime.editor.destroy();
    await runtime.editor.getDocument().destroy();
  }
  await runtime.storage.destroy();
}

/** Configuration captured when the journal editor cache is created. */
interface JournalEditorSettings {
  /** Optional alternate keyboard bindings for the demo. */
  readonly alternateKeymap: Parameters<typeof createReactEditor>[0]["keymap"];
  /** Install the image handler before the file handler. */
  readonly imageFirst: boolean;
  /** Install the image handler without the file handler. */
  readonly imageOnly: boolean;
  /** Install the file handler without the image handler. */
  readonly fileOnly: boolean;
}

/**
 * Captures the journal's keyboard and file-handler options from the current URL.
 *
 * @returns Settings retained for every editor created by this journal cache.
 */
function readJournalEditorSettings(): JournalEditorSettings {
  // Used by e2e / KEYMAP demos: `?keymap=alternate` remaps indent without test-only APIs.
  const alternateKeymap =
    new URLSearchParams(window.location.search).get("keymap") === "alternate"
      ? {
          [KEYBOARD_BINDING_IDS.blockIndent]: ["Primary+ArrowRight"],
          [KEYBOARD_BINDING_IDS.blockOutdent]: [],
        }
      : undefined;
  const demoParams = new URLSearchParams(window.location.search);
  return {
    alternateKeymap,
    imageFirst: demoParams.has("imageFirst"),
    imageOnly: demoParams.has("imageOnly"),
    fileOnly: demoParams.has("fileOnly"),
  };
}

/**
 * Creates a journal presentation runtime with the requested demo extensions.
 *
 * The owning EditorStorage retains and destroys the returned React editor.
 *
 * @param documentEditor - Core editor owned by the journal cache.
 * @param settings - Keyboard and file-handler choices captured at initialization.
 * @returns React editor with the journal's presentation extensions installed.
 * @throws If an extension fails to install.
 */
function createJournalReactEditor(
  documentEditor: DocumentEditorAPI,
  settings: JournalEditorSettings,
) {
  return createReactEditor({
    editor: documentEditor,
    keymap: settings.alternateKeymap,
    extensions: [
      ...(settings.imageFirst || settings.imageOnly
        ? [imageExtension({ provider: demoBinaryProvider })]
        : []),
      ...(settings.imageOnly ? [] : [fileExtension({ provider: demoBinaryProvider })]),
      demoLocalFileExtension,
      ...(settings.imageFirst || settings.imageOnly || settings.fileOnly
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
      ...createDynamicExtensions(),
      embeddingExtension(),
      ...demoReviewReports(),
    ],
  });
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
  const settings = readJournalEditorSettings();
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
      return createJournalReactEditor(documentEditor, settings);
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
 * Creates the introductory and selection paragraphs and the first outline root.
 *
 * @param editor - Document block operations.
 * @returns IDs needed by later blocks and cards.
 * @throws If a delegated document operation fails.
 */
function seedShowcaseIntroduction(editor: Pick<FeatureSeedEditor, "blocks">): {
  introId: string;
  paragraphId: string;
  listId: string;
} {
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
  return { introId, paragraphId, listId };
}

/**
 * Creates the nested children of the first outline root.
 *
 * @param editor - Document block operations.
 * @param listId - First outline root ID.
 * @returns After the nested branch has been inserted.
 * @throws If a delegated document operation fails.
 */
function seedFirstShowcaseOutline(editor: Pick<FeatureSeedEditor, "blocks">, listId: string): void {
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
}

/**
 * Creates the reverse-selection paragraph and second nested outline.
 *
 * @param editor - Document block operations.
 * @param listId - First outline root ID.
 * @returns IDs of the reverse-selection paragraph and second outline root.
 * @throws If a delegated document operation fails.
 */
function seedSecondShowcaseOutline(
  editor: Pick<FeatureSeedEditor, "blocks">,
  listId: string,
): { reverseSelectionId: string; secondBranchId: string } {
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
  return { reverseSelectionId, secondBranchId };
}

/**
 * Creates the slider, counter, and ending selection paragraphs.
 *
 * @param editor - Document block operations.
 * @param secondBranchId - Second outline root ID.
 * @returns ID of the slash-command paragraph.
 * @throws If a delegated document operation fails.
 */
function seedShowcaseSelectionEnd(
  editor: Pick<FeatureSeedEditor, "blocks">,
  secondBranchId: string,
): string {
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
  return slashId;
}

/**
 * Creates checked and unchecked checkbox examples.
 *
 * @param editor - Document block operations.
 * @param slashId - Preceding slash-command paragraph ID.
 * @returns ID of the checked checkbox.
 * @throws If a delegated document operation fails.
 */
function seedShowcaseCheckboxes(
  editor: Pick<FeatureSeedEditor, "blocks">,
  slashId: string,
): string {
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
  return checkedId;
}

/**
 * Creates numbered-list examples after the checkbox blocks.
 *
 * @param editor - Document block operations.
 * @param checkedId - Preceding checked checkbox ID.
 * @returns ID of the final numbered item.
 * @throws If a delegated document operation fails.
 */
function seedShowcaseNumberedLists(
  editor: Pick<FeatureSeedEditor, "blocks">,
  checkedId: string,
): string {
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
  return numberedContinueId;
}

/**
 * Creates the separator and the two initial canvas block cards.
 *
 * @param editor - Document block and element operations.
 * @param introId - First block ID.
 * @param reverseSelectionId - End of the first card.
 * @param secondBranchId - Start of the second card.
 * @param numberedContinueId - End of the second card.
 * @returns After inserting the separator and canvas cards.
 * @throws If a delegated document operation fails.
 */
function seedShowcaseCards(
  editor: Pick<FeatureSeedEditor, "blocks" | "elements">,
  introId: string,
  reverseSelectionId: string,
  secondBranchId: string,
  numberedContinueId: string,
): void {
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
}

/**
 * Creates bento, table, and Kanban examples with a movable card.
 *
 * @param editor - Document block operations.
 * @param numberedContinueId - Block preceding the example layouts.
 * @returns ID of the Kanban board.
 * @throws If a delegated document operation fails.
 */
function seedShowcaseBentoAndKanban(
  editor: Pick<FeatureSeedEditor, "blocks">,
  numberedContinueId: string,
): string {
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
  return kanbanId;
}

/**
 * Creates two columns and moves one sample block into each.
 *
 * @param editor - Document block operations.
 * @param kanbanId - Kanban board preceding the columns.
 * @returns After inserting and populating the columns.
 * @throws If a delegated document operation fails.
 */
function seedShowcaseColumns(editor: Pick<FeatureSeedEditor, "blocks">, kanbanId: string): void {
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
}

/**
 * Appends the configured number of copies of the selected root range.
 *
 * @param editor - Document block and history operations.
 * @param secondBranchId - First root in the repeated range.
 * @param numberedContinueId - Last root in the repeated range.
 * @returns After inserting the repeated blocks in one history batch.
 * @throws If a delegated document operation fails.
 */
function seedRepeatedShowcaseBlocks(
  editor: Pick<FeatureSeedEditor, "blocks" | "history">,
  secondBranchId: string,
  numberedContinueId: string,
): void {
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
}

/**
 * Creates a TODO storage block and three sample tasks.
 *
 * @param editor - Document block operations.
 * @returns After inserting and nesting the task examples.
 * @throws If a delegated document operation fails.
 */
function seedShowcaseTodos(editor: Pick<FeatureSeedEditor, "blocks">): void {
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
}

/**
 * Creates the edgeless visuals and review element.
 *
 * @param editor - Canvas commands and element operations.
 * @returns After the canvas examples have been inserted.
 * @throws If a delegated document operation fails.
 */
function seedShowcaseCanvas(editor: Pick<FeatureSeedEditor, "commands" | "elements">): void {
  seedEdgelessShowcase(editor);
  editor.elements.insertElement(
    createReviewElementInput({
      id: "demo-review-element",
      frame: { x: 920, y: 730, width: 420, height: 260 },
      zIndex: Math.max(0, ...editor.elements.getElementNodes().map(({ zIndex }) => zIndex)) + 1,
      problem: "Ошибка структуры на холсте",
    }),
  );
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
  const { introId, paragraphId, listId } = seedShowcaseIntroduction(editor);
  seedFirstShowcaseOutline(editor, listId);
  const { reverseSelectionId, secondBranchId } = seedSecondShowcaseOutline(editor, listId);
  const slashId = seedShowcaseSelectionEnd(editor, secondBranchId);
  const checkedId = seedShowcaseCheckboxes(editor, slashId);
  const numberedContinueId = seedShowcaseNumberedLists(editor, checkedId);
  seedShowcaseCards(editor, introId, reverseSelectionId, secondBranchId, numberedContinueId);
  const kanbanId = seedShowcaseBentoAndKanban(editor, numberedContinueId);
  seedShowcaseColumns(editor, kanbanId);
  seedRepeatedShowcaseBlocks(editor, secondBranchId, numberedContinueId);
  seedShowcaseTodos(editor);
  seedShowcaseCanvas(editor);
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
  const reactEditor = createMultiSurfaceDemoEditor(editor);
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

/** Host-owned settings displayed by the shared demo toolbar. */
interface DemoToolbarProps {
  /** Document actions used by the toolbar. */
  readonly editor: Pick<DocumentEditorAPI, "selection" | "history" | "load">;
  /** Whether debug block IDs are visible. */
  readonly showBlockIds: boolean;
  /**
   * Requests a change to block ID visibility.
   *
   * @param visible - Checked state selected by the visitor.
   * @returns Completes the host state update request.
   */
  readonly onShowBlockIdsChange: (visible: boolean) => void;
  /** Whether gutter block numbers are visible. */
  readonly showBlockNumbers: boolean;
  /**
   * Requests a host-owned change to gutter-number visibility.
   *
   * @param visible - Checked state selected by the toolbar checkbox.
   * @returns No value; the host supplies the updated showBlockNumbers prop.
   */
  readonly onShowBlockNumbersChange: (visible: boolean) => void;
  /** Whether nesting lines are enabled, when exposed. */
  readonly showNestingLines?: boolean;
  /**
   * Requests a change to nesting-line visibility.
   *
   * @param visible - Whether the overlay should be installed.
   * @returns The host receives the requested visibility.
   */
  readonly onShowNestingLinesChange?: (visible: boolean) => void;
  /** Current page virtualization threshold, when exposed. */
  readonly virtualizePageThreshold?: boolean | number;
  /**
   * Requests a page virtualization threshold.
   *
   * @param threshold - Disabled, always enabled, or minimum root count.
   * @returns Completes the host state update request.
   */
  readonly onVirtualizePageThresholdChange?: (threshold: boolean | number) => void;
  /** Number of extra page roots rendered on each side. */
  readonly virtualizePageOverscan?: number;
  /**
   * Requests a new page virtualization overscan.
   *
   * @param count - Number of extra roots to render on each side.
   * @returns Completes the host state update request.
   */
  readonly onVirtualizePageOverscanChange?: (count: number) => void;
}

/**
 * Switches the active panel between Page and Edgeless modes.
 *
 * @returns Mode controls reflecting the active panel.
 */
function DemoToolbarMode() {
  const { mode, setMode } = useEditorMode();
  /**
   * Changes mode only when the requested surface differs from the current one.
   *
   * @param next - Requested editor surface.
   * @returns After any necessary mode change.
   */
  const switchMode = (next: "block" | "edgeless") => {
    if (next === mode) {
      return;
    }
    setMode(next);
  };
  return (
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
  );
}

/**
 * Renders the mode switch and the document's delete and undo actions.
 *
 * @param props - Document actions used by the shared toolbar.
 * @param props.editor - Borrowed selection and history managers.
 * @returns The toolbar's main action row.
 */
function DemoToolbarMain(props: {
  readonly editor: Pick<DocumentEditorAPI, "selection" | "history">;
}) {
  return (
    <div className="demo-toolbar-main">
      <span className="demo-wordmark">
        Rivto <span>editor</span>
      </span>
      <DemoToolbarMode />
      <button
        type="button"
        data-editor-action="delete"
        aria-label="Delete"
        title="Delete"
        onClick={() => props.editor.selection.delete()}
      >
        <Trash2Icon size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        data-editor-action="undo"
        aria-label="Undo"
        title="Undo"
        onClick={() => props.editor.history.undo()}
      >
        <Undo2Icon size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Renders the shared drag-handle visibility toggle when its host provides it.
 *
 * @returns The toggle label, or null without a visibility provider.
 */
function DemoToolbarHandleVisibility() {
  const handleVisibility = useContext(DemoHandleVisibilityContext);
  if (!handleVisibility) {
    return null;
  }
  return (
    <label className={DEMO_BLOCK_ID_TOGGLE_CLASS}>
      <input
        type="checkbox"
        checked={handleVisibility.visible}
        onChange={(event) => handleVisibility.setVisible(event.currentTarget.checked)}
      />
      Always show drag handles
    </label>
  );
}

/**
 * Renders shared block-label, nesting-line, and handle visibility controls.
 *
 * @param props - Host-controlled visibility values and change callbacks.
 * @param props.showBlockIds - Whether block IDs are visible.
 * @param props.onShowBlockIdsChange - Receives requested ID visibility.
 * @param props.showBlockNumbers - Whether block numbers are visible.
 * @param props.onShowBlockNumbersChange - Receives requested number visibility.
 * @param props.showNestingLines - Whether nesting lines are enabled.
 * @param props.onShowNestingLinesChange - Receives requested line visibility, when exposed.
 * @returns Checkbox labels without an additional DOM wrapper.
 */
function DemoToolbarVisibility(
  props: Pick<
    DemoToolbarProps,
    | "showBlockIds"
    | "onShowBlockIdsChange"
    | "showBlockNumbers"
    | "onShowBlockNumbersChange"
    | "showNestingLines"
    | "onShowNestingLinesChange"
  >,
) {
  const updateNestingLines = props.onShowNestingLinesChange;
  return (
    <>
      <label className={DEMO_BLOCK_ID_TOGGLE_CLASS} title={DEMO_BLOCK_IDS_TOOLTIP}>
        <input
          type="checkbox"
          checked={props.showBlockIds}
          title={DEMO_BLOCK_IDS_TOOLTIP}
          onChange={(event) => props.onShowBlockIdsChange(event.currentTarget.checked)}
        />
        Block IDs
      </label>
      <label className={DEMO_BLOCK_ID_TOGGLE_CLASS}>
        <input
          type="checkbox"
          checked={props.showBlockNumbers}
          onChange={(event) => props.onShowBlockNumbersChange(event.currentTarget.checked)}
        />
        Block numbers
      </label>
      {updateNestingLines && (
        <label className={DEMO_BLOCK_ID_TOGGLE_CLASS}>
          <input
            type="checkbox"
            checked={props.showNestingLines}
            onChange={(event) => updateNestingLines(event.currentTarget.checked)}
          />
          Nesting lines
        </label>
      )}
      <DemoToolbarHandleVisibility />
    </>
  );
}

/**
 * Uses an empty threshold input to mean virtualization is always enabled.
 *
 * @param event - Current numeric input.
 * @param update - Host callback receiving the resulting setting.
 * @returns Requests the clamped threshold or always-enabled setting.
 */
function changeVirtualizationThreshold(
  event: ChangeEvent<HTMLInputElement>,
  update: NonNullable<DemoToolbarProps["onVirtualizePageThresholdChange"]>,
): void {
  const value = event.currentTarget.valueAsNumber;
  if (Number.isFinite(value)) {
    update(Math.max(0, Math.trunc(value)));
  } else {
    update(true);
  }
}

/**
 * Renders the optional virtualization toggle and minimum root count.
 *
 * @param props - Current threshold and host update callback.
 * @param props.virtualizePageThreshold - Current threshold or enabled state.
 * @param props.onVirtualizePageThresholdChange - Receives the requested setting, when exposed.
 * @returns Threshold controls, or null when virtualization is not exposed.
 */
function DemoToolbarVirtualizationThreshold(
  props: Pick<DemoToolbarProps, "virtualizePageThreshold" | "onVirtualizePageThresholdChange">,
) {
  const update = props.onVirtualizePageThresholdChange;
  if (!update) {
    return null;
  }
  let thresholdInputValue: number | "" = "";
  if (typeof props.virtualizePageThreshold === "number") {
    thresholdInputValue = props.virtualizePageThreshold;
  }
  return (
    <>
      <label className={DEMO_BLOCK_ID_TOGGLE_CLASS} title={DEMO_VIRTUALIZE_PAGE_TOOLTIP}>
        <input
          type="checkbox"
          checked={props.virtualizePageThreshold !== false}
          title={DEMO_VIRTUALIZE_PAGE_TOOLTIP}
          onChange={(event) => update(event.currentTarget.checked)}
        />
        Virtualize page
      </label>
      <label className={DEMO_BLOCK_ID_TOGGLE_CLASS} title={DEMO_VIRTUALIZE_THRESHOLD_TOOLTIP}>
        Virtualize after roots count
        <input
          type="number"
          min={0}
          step={1}
          placeholder="Always"
          disabled={props.virtualizePageThreshold === false}
          value={thresholdInputValue}
          title={DEMO_VIRTUALIZE_THRESHOLD_TOOLTIP}
          onChange={(event) => changeVirtualizationThreshold(event, update)}
        />
      </label>
    </>
  );
}

/**
 * Renders the optional number of extra virtualized roots.
 *
 * @param props - Current overscan and host update callback.
 * @param props.virtualizePageOverscan - Number of extra roots rendered on each side.
 * @param props.onVirtualizePageOverscanChange - Receives the requested count, when exposed.
 * @returns The overscan control, or null when it is not exposed.
 */
function DemoToolbarVirtualizationOverscan(
  props: Pick<DemoToolbarProps, "virtualizePageOverscan" | "onVirtualizePageOverscanChange">,
) {
  const update = props.onVirtualizePageOverscanChange;
  if (!update) {
    return null;
  }
  return (
    <label className={DEMO_BLOCK_ID_TOGGLE_CLASS} title={DEMO_VIRTUALIZE_OVERSCAN_TOOLTIP}>
      Extra roots per side
      <input
        type="number"
        min={0}
        step={1}
        value={props.virtualizePageOverscan}
        title={DEMO_VIRTUALIZE_OVERSCAN_TOOLTIP}
        onChange={(event) =>
          update(Math.max(0, Math.trunc(event.currentTarget.valueAsNumber || 0)))
        }
      />
    </label>
  );
}

/**
 * Restores a selected Review report snapshot and displays any parsing error.
 *
 * @param props - Borrowed document load operation.
 * @param props.editor - Editor receiving the validated snapshot.
 * @returns Report file input and any error, without a wrapper.
 */
function DemoToolbarReport(props: { readonly editor: Pick<DocumentEditorAPI, "load"> }) {
  const [reportError, setReportError] = useState<string | null>(null);
  /**
   * Loads the snapshot from a user-selected Review report envelope.
   *
   * @param event - File input change containing the selected report.
   * @returns Resolves after loading the snapshot or reporting an error.
   */
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
      props.editor.load(report.snapshot);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Failed to restore Review report");
    }
  };
  return (
    <>
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
    </>
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
function DemoToolbar(props: DemoToolbarProps) {
  return (
    <header className="demo-header">
      <DemoToolbarMain editor={props.editor} />
      <div className="demo-toolbar-controls">
        <DemoToolbarVisibility {...props} />
        <DemoToolbarVirtualizationThreshold {...props} />
        <DemoToolbarVirtualizationOverscan {...props} />
        <DemoToolbarReport editor={props.editor} />
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
 * Tracks the active journal panel's mode and open-block state.
 *
 * @returns Current presentation and a callback that ignores unchanged values.
 */
function useJournalPresentation() {
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
  return { presentation, onPresentationChange };
}

/**
 * Creates the journal editors and owns their subscriptions and cleanup.
 *
 * @param showNestingLines - Whether the today editor installs nesting lines.
 * @returns Current editor runtimes and any initialization error.
 */
function useJournalRuntime(showNestingLines: boolean) {
  const [runtime, setRuntime] = useState<{
    today: Awaited<ReturnType<typeof createDemoEditor>>;
    yesterday: Awaited<ReturnType<typeof createEmptyDemoEditor>>;
  }>();
  const [error, setError] = useState<string>();
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
  return { runtime, error };
}

/** Inputs owned by the journal host and passed to today's editor surface. */
interface JournalTodayProps {
  /** Editor resources retained by the journal host. */
  readonly runtime: Pick<
    Awaited<ReturnType<typeof createDemoEditor>>,
    "editor" | "reactEditor" | "editorStorage"
  >;
  /** Calendar date shown above the editor. */
  readonly date: Date;
  /** Current mode used for journal presentation. */
  readonly mode: EditorMode;
  /**
   * Updates the journal when the active panel changes presentation.
   *
   * @param mode - Active panel's editor mode.
   * @param hasOpenBlock - Whether the panel displays a nested block.
   * @returns Completes the host state update request.
   */
  readonly onPresentationChange: (mode: EditorMode, hasOpenBlock: boolean) => void;
  /** Whether block IDs are shown. */
  readonly showBlockIds: boolean;
  /**
   * Requests a change to block ID visibility.
   *
   * @param visible - Whether block IDs should be shown.
   * @returns Completes the host state update request.
   */
  readonly onShowBlockIdsChange: (visible: boolean) => void;
  /** Whether block numbers are shown. */
  readonly showBlockNumbers: boolean;
  /**
   * Requests a change to block number visibility.
   *
   * @param visible - Whether block numbers should be shown.
   * @returns Completes the host state update request.
   */
  readonly onShowBlockNumbersChange: (visible: boolean) => void;
  /** Whether the nesting-lines extension is installed. */
  readonly showNestingLines: boolean;
  /**
   * Requests installation or removal of nesting lines.
   *
   * @param visible - Whether nesting lines should be shown.
   * @returns Completes the host state update request.
   */
  readonly onShowNestingLinesChange: (visible: boolean) => void;
}

/**
 * Renders today's editor, its toolbar, and its nested panel surface.
 *
 * The host owns editor lifetime and shared visibility state; virtualization
 * settings belong to this mounted journal surface.
 *
 * @param props - Runtime, date, presentation callback, and toolbar settings.
 * @param props.runtime - Editors retained by the journal host.
 * @param props.date - Date displayed above the editor.
 * @param props.mode - Current panel mode used by the section.
 * @param props.onPresentationChange - Receives mode and nested-block changes.
 * @param props.showBlockIds - Whether block IDs are visible.
 * @param props.onShowBlockIdsChange - Receives the requested ID visibility.
 * @param props.showBlockNumbers - Whether block numbers are visible.
 * @param props.onShowBlockNumbersChange - Receives the requested number visibility.
 * @param props.showNestingLines - Whether nesting lines are enabled.
 * @param props.onShowNestingLinesChange - Receives the requested line visibility.
 * @returns The today section within its editor storage context.
 */
function JournalToday(props: JournalTodayProps) {
  const [virtualizePageThreshold, setVirtualizePageThreshold] = useState<boolean | number>(false);
  const [virtualizePageOverscan, setVirtualizePageOverscan] = useState(8);
  return (
    <section
      className="journal-document"
      data-journal-document="today"
      data-edgeless={props.mode === "edgeless" || undefined}
    >
      <EditorStorageContext.Provider value={props.runtime.editorStorage}>
        <DemoEditorPanels
          editor={props.runtime.reactEditor}
          onPresentationChange={props.onPresentationChange}
          documentTitle={
            <time dateTime={localDateKey(props.date)}>
              {new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(props.date)}
            </time>
          }
          virtualizePageThreshold={virtualizePageThreshold}
          virtualizePageOverscan={virtualizePageOverscan}
        >
          {(header) => (
            <>
              <DemoToolbar
                editor={props.runtime.editor}
                showBlockIds={props.showBlockIds}
                onShowBlockIdsChange={props.onShowBlockIdsChange}
                showBlockNumbers={props.showBlockNumbers}
                onShowBlockNumbersChange={props.onShowBlockNumbersChange}
                showNestingLines={props.showNestingLines}
                onShowNestingLinesChange={props.onShowNestingLinesChange}
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
  );
}

/**
 * Captures today's and yesterday's local dates for one journal mount.
 *
 * @returns The stable pair of dates displayed by the journal.
 */
function useJournalDates() {
  const [dates] = useState(() => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return { today, yesterday };
  });
  return dates;
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
  const { presentation, onPresentationChange } = useJournalPresentation();
  const [showBlockIds, setShowBlockIds] = useState(false);
  const [showBlockNumbers, setShowBlockNumbers] = useState(false);
  const [showNestingLines, setShowNestingLines] = useState(true);
  const { runtime, error } = useJournalRuntime(showNestingLines);
  const dates = useJournalDates();

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
          <JournalToday
            runtime={todayEditor}
            date={dates.today}
            mode={presentation.mode}
            onPresentationChange={onPresentationChange}
            showBlockIds={showBlockIds}
            onShowBlockIdsChange={setShowBlockIds}
            showBlockNumbers={showBlockNumbers}
            onShowBlockNumbersChange={setShowBlockNumbers}
            showNestingLines={showNestingLines}
            onShowNestingLinesChange={setShowNestingLines}
          />
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
 * Seeds the source editor with a movable subtree, card, and remaining sibling.
 *
 * @param editor - Document editor owning the new sample blocks and element.
 * @returns After the source fixture has been inserted.
 */
function seedMultiEditorSource(editor: Pick<DocumentEditorAPI, "blocks" | "elements">): void {
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
}

/**
 * Seeds the destination editor, optionally including a conflicting block ID.
 *
 * @param editor - Document editor owning the new sample blocks.
 * @param conflict - Adds a duplicate source-child ID when set to `block`.
 * @returns After the destination fixture has been inserted.
 */
function seedMultiEditorDestination(
  editor: Pick<DocumentEditorAPI, "blocks">,
  conflict: "block" | undefined,
): void {
  editor.blocks.insertBlock({
    id: "right-target",
    type: DEFAULT_WRITING_BLOCK_TYPE,
    content: "Destination parent",
    children: [
      { id: "right-nested", type: DEFAULT_WRITING_BLOCK_TYPE, content: "Destination child" },
      // Used by e2e + manual `?conflict=block`: duplicate id must reject the drop.
      ...(conflict === "block"
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

/**
 * Creates the shared Page and canvas presentation used by demo editors.
 *
 * The caller owns the returned React editor and destroys it with its document.
 *
 * @param editor - Existing document editor borrowed by the React runtime.
 * @returns React editor with the demo's file, block, canvas, and report extensions installed.
 * @throws If an extension fails during installation.
 */
function createMultiSurfaceDemoEditor(editor: DocumentEditorAPI) {
  return createReactEditor({
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
      ...createDynamicExtensions(),
      ...demoReviewReports(),
    ],
  });
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
  const reactEditor = createMultiSurfaceDemoEditor(editor);
  if (side === "left") {
    seedMultiEditorSource(editor);
  } else if (!options.empty) {
    seedMultiEditorDestination(editor, options.conflict);
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
 * Creates and releases both independent editors for the dual-editor demo.
 *
 * Editors resolving after unmount are destroyed immediately; mounted editors
 * remain owned by this hook until its options change or it unmounts.
 *
 * @param emptyDestination - Whether the right document starts empty.
 * @param conflict - Optional conflicting block fixture in the right document.
 * @returns Current editor resources and any initialization error.
 */
function useMultiEditorRuntime(emptyDestination: boolean, conflict: "block" | undefined) {
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
  return { runtime, error };
}

/**
 * Side-by-side editors for manual cross-document practice (`?editors=2`).
 *
 * Query extras (also used by e2e): `emptyDestination=1`, `conflict=block`.
 *
 * @returns The two editor panes, a loading message, or an initialization error.
 */
function MultiEditorApp() {
  const params = new URLSearchParams(window.location.search);
  const emptyDestination = params.get("emptyDestination") === "1";
  const conflictParam = params.get("conflict");
  const conflict = conflictParam === "block" ? conflictParam : undefined;
  const { runtime, error } = useMultiEditorRuntime(emptyDestination, conflict);
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
 * Waits for the shared document registration or cancels the wait.
 *
 * @param storage - Document storage receiving registry updates.
 * @param signal - Signal that cancels the subscription and rejects the wait.
 * @returns Resolves after the shared document is registered.
 * @throws The abort reason when the signal is aborted before registration.
 */
async function waitForSharedDocument(
  storage: Pick<DocumentStorage, "getDocumentIds" | "subscribe">,
  signal: AbortSignal,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
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
 * Seeds the first synchronized document with introduction and repeated blocks.
 *
 * @param editor - Document editor owning the shared blocks and history.
 * @param repeatCount - Number of additional writing blocks to append.
 * @returns After seeding the document and clearing its initial history.
 */
function seedSyncedDocument(
  editor: Pick<DocumentEditorAPI, "blocks" | "history">,
  repeatCount: number,
): void {
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
 * @returns Editor runtime and provider resources for one peer.
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
  } catch (failure) {
    await document?.destroy();
    await storage.destroy();
    throw failure;
  }
  const editor = createDocumentEditor({ document: document! });
  const reactEditor = createMultiSurfaceDemoEditor(editor);
  if (side === "left" && !editor.blocks.getRootIds().length) {
    seedSyncedDocument(editor, repeatCount);
  }
  return { storage, editor, reactEditor };
}

/**
 * Creates and releases the two BroadcastChannel peers for the sync demo.
 *
 * Cleanup cancels pending acquisition and destroys peers that have already
 * been created, including peers that finish after unmount.
 *
 * @param roomId - Shared channel identifier for both peers.
 * @param repeatCount - Additional blocks seeded by the left peer.
 * @returns Current peers and any initialization error.
 */
function useSyncedPeers(roomId: string, repeatCount: number) {
  const [peers, setPeers] = useState<{
    left: Awaited<ReturnType<typeof createSyncedPeer>>;
    right: Awaited<ReturnType<typeof createSyncedPeer>>;
  }>();
  const [error, setError] = useState<string>();
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
  return { peers, error };
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
  const { peers, error } = useSyncedPeers(roomId, repeatCount);
  const [showBlockIds, setShowBlockIds] = useState(false);
  const [showBlockNumbers, setShowBlockNumbers] = useState(false);
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
