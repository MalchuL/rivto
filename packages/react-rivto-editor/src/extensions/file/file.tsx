/**
 * Generic browser file ingestion and fallback attachment presentation.
 *
 * One event path uploads files, asks ordered media handlers to prepare their
 * persisted representations, and commits successful results in source order.
 * The matcher-less fallback produces display-only file chips, blocks, and
 * canvas elements.
 *
 * @module
 */
import { createCaretSelection, type EditorMode } from "@chulane/rivto";
import { useSyncExternalStore } from "react";
import { useBlock } from "../../hooks";
import type { ReactEditorExtension } from "../../managers";
import { resolveSelectionEndpoints } from "../../managers";
import type { ReactEditor } from "../../types";
import type {
  FilePasteDestination,
  FileReference,
  PreparedFilePaste,
} from "../../managers/files";
import { FileView, RegisteredFileView } from "./file-view";
import { serializeFileMacro } from "./file-macro";

/** Persisted native type used by generic file blocks and elements. */
export const FILE_BLOCK_TYPE = "file";
export const FILE_ELEMENT_TYPE = "file";
const FILE_BLOCK_CLASS = "rivto-file-block";
const FILE_INPUT_CLASS = "rivto-file-input";
const FILE_UPLOADS_CLASS = "rivto-file-uploads";
const FILE_UPLOAD_CLASS = "rivto-file-upload";

/**
 * Escapes a string used in portable HTML text.
 * @param value - Untrusted filename text.
 * @returns HTML-safe text.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]!);
}

/** Optional notification for asynchronous file failures. */
export interface FileExtensionOptions {
  readonly onError?: (error: unknown) => void;
}

type FileDestination =
  | { readonly kind: "inline"; readonly blockId: string; readonly start: number; readonly end: number }
  | { readonly kind: "block"; readonly afterId?: string; readonly replaceId?: string }
  | { readonly kind: "element"; readonly x: number; readonly y: number };

interface PendingFileUpload {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly retry: () => void;
  progress?: number;
  error?: string;
}

/** Observable local upload feedback that never enters collaborative state. */
class FileUploadStore {
  private readonly uploads = new Map<string, PendingFileUpload>();
  private readonly listeners = new Set<() => void>();
  private revision = 0;

  /** @returns Stable revision used by React subscriptions. */
  getRevision(): number { return this.revision; }
  /** @returns Current upload cards in insertion order. */
  getUploads(): readonly PendingFileUpload[] { return [...this.uploads.values()]; }
  /** @param listener - Change callback. @returns Subscription disposer. */
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  /** @param upload - Complete pending upload. @returns Nothing. */
  set(upload: PendingFileUpload): void { this.uploads.set(upload.id, upload); this.emit(); }
  /** @param id - Pending upload ID. @param patch - Updated progress or error. @returns Nothing. */
  update(id: string, patch: Partial<PendingFileUpload>): void {
    const current = this.uploads.get(id);
    if (current) { this.uploads.set(id, { ...current, ...patch }); this.emit(); }
  }
  /** @param id - Completed or dismissed upload ID. @returns Nothing. */
  delete(id: string): void { if (this.uploads.delete(id)) this.emit(); }
  /** Notifies every subscriber after one local change. @returns Nothing. */
  private emit(): void { this.revision += 1; this.listeners.forEach((listener) => listener()); }
}

/**
 * Renders accessible pending/error cards near the source interaction.
 * @param props - Observable upload state.
 * @returns Fixed local-only status overlay.
 */
function FileUploadStatuses({ store }: { readonly store: FileUploadStore }) {
  useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getRevision(),
    () => store.getRevision(),
  );
  return <div className={FILE_UPLOADS_CLASS} aria-live="polite">
    {store.getUploads().map((upload) => <div
      key={upload.id}
      className={FILE_UPLOAD_CLASS}
      role={upload.error ? "alert" : "status"}
      style={{ left: upload.x, top: upload.y }}
    >
      <span>{upload.error ?? `Uploading ${upload.name}${upload.progress === undefined ? "…" : ` ${Math.round(upload.progress * 100)}%`}`}</span>
      {upload.error && <>
        <button type="button" onClick={upload.retry}>Retry</button>
        <button type="button" onClick={() => store.delete(upload.id)}>Dismiss</button>
      </>}
    </div>)}
  </div>;
}

/**
 * Reads normalized generic file props from persisted data.
 * @param props - Opaque persisted property record.
 * @returns Portable file reference, or undefined for invalid metadata.
 */
export function fileReference(props: Record<string, unknown>): FileReference | undefined {
  const size = props.size;
  if (
    typeof props.uri !== "string" || !props.uri
    || typeof props.name !== "string" || !props.name
    || typeof props.mimeType !== "string" || !props.mimeType
    || (size !== undefined && (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0))
  ) return undefined;
  return { uri: props.uri, name: props.name, mimeType: props.mimeType, size };
}

/**
 * Renders one standalone generic file block.
 * @param props - Stable block identity.
 * @returns Display-only file block or validation error.
 */
export function FileBlock({ blockId }: { readonly blockId: string }) {
  const { block } = useBlock(blockId);
  const reference = block ? fileReference(block.props) : undefined;
  return <div className={FILE_BLOCK_CLASS}>
    {reference ? <RegisteredFileView reference={reference} /> : <span role="alert">Invalid file block</span>}
  </div>;
}

/**
 * Renders one generic file canvas element.
 * @param props - Element identity and persisted properties.
 * @returns Display-only file element or validation error.
 */
function FileElementView({ props }: { readonly id: string; readonly props: Record<string, unknown> }) {
  const reference = fileReference(props);
  return reference ? <FileView {...reference} /> : <span role="alert">Invalid file element</span>;
}

/**
 * Returns files exposed by a clipboard or drag data store.
 * @param data - Native transferable data, when provided.
 * @returns Files in browser-provided order.
 */
function transferableFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  if (data.files.length) return [...data.files];
  return [...data.items]
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

/**
 * Returns the first local filesystem URI exposed as clipboard text.
 * @param text - URI-list or plain clipboard text.
 * @returns Absolute local reference, when present.
 */
function localFileUriFromText(text: string): string | undefined {
  const value = text.trim().split(/\r?\n/).find((line) => line && !line.startsWith("#"));
  return value && (/^file:\/\//i.test(value) || /^\//.test(value) || /^[a-z]:[\\/]/i.test(value))
    ? value
    : undefined;
}

/**
 * Infers conservative metadata for a referenced local file.
 * @param uri - Absolute local path or file URI.
 * @returns Portable reference with conservative MIME inference.
 */
function referenceFromUri(uri: string): FileReference {
  const path = uri.split(/[?#]/, 1)[0]!;
  const encodedName = path.split(/[\\/]/).pop() || "file";
  let name = encodedName;
  try { name = decodeURIComponent(encodedName); } catch { /* Keep the literal basename. */ }
  const extension = name.match(/\.([a-z\d]+)$/i)?.[1]?.toLowerCase() ?? "";
  const mimeType = ({
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    svg: "image/svg+xml", avif: "image/avif", bmp: "image/bmp", ico: "image/x-icon",
    pdf: "application/pdf", csv: "text/csv", txt: "text/plain", mp3: "audio/mpeg", wav: "audio/wav",
  } as Record<string, string>)[extension] ?? "application/octet-stream";
  return { uri, name, mimeType };
}

/**
 * Returns the current single-block selection as an inline destination.
 * @param reactEditor - Active React editor runtime.
 * @param fallbackBlockId - Block used when no live DOM selection exists.
 * @returns Inline destination, when one block can own the insertion.
 */
function inlineDestination(reactEditor: ReactEditor, fallbackBlockId?: string): FileDestination | undefined {
  const selection = reactEditor.selection.readDOM() ?? reactEditor.selection.get();
  const endpoints = selection && resolveSelectionEndpoints(
    selection,
    (id) => reactEditor.editor.blocks.getBlock(id)?.content.length ?? 0,
  );
  if (endpoints && endpoints.anchor.blockId === endpoints.head.blockId) {
    return {
      kind: "inline",
      blockId: endpoints.anchor.blockId,
      start: Math.min(endpoints.anchor.offset, endpoints.head.offset),
      end: Math.max(endpoints.anchor.offset, endpoints.head.offset),
    };
  }
  const block = fallbackBlockId ? reactEditor.editor.blocks.getBlock(fallbackBlockId) : undefined;
  return block ? { kind: "inline", blockId: block.id, start: block.content.length, end: block.content.length } : undefined;
}

/**
 * Chooses inline, block, or canvas placement for one browser point.
 * @param reactEditor - Active React editor runtime.
 * @param mode - Current editor mode.
 * @param contentElement - Editable content under the event.
 * @param blockId - Block under the event.
 * @param clientX - Viewport x coordinate.
 * @param clientY - Viewport y coordinate.
 * @param root - Active surface root.
 * @returns Captured insertion destination.
 */
function destinationAt(
  reactEditor: ReactEditor,
  mode: EditorMode,
  contentElement: HTMLElement | null,
  blockId: string | undefined,
  clientX: number,
  clientY: number,
  root: HTMLElement,
): FileDestination {
  if (contentElement) {
    const document = root.ownerDocument as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
    const hit = document.caretPositionFromPoint?.(clientX, clientY);
    const range = document.caretRangeFromPoint?.(clientX, clientY);
    const node = hit?.offsetNode ?? range?.startContainer;
    const offset = hit?.offset ?? range?.startOffset;
    if (node !== undefined && offset !== undefined) {
      root.ownerDocument.getSelection()?.setBaseAndExtent(node, offset, node, offset);
    }
    const inline = inlineDestination(reactEditor, blockId);
    if (inline) return inline;
  }
  if (mode === "block") return { kind: "block", afterId: blockId };
  const bounds = root.getBoundingClientRect();
  const zoom = Number(root.dataset.edgelessZoom) || 1;
  return {
    kind: "element",
    x: (clientX - bounds.left - (Number(root.dataset.edgelessPanX) || 0)) / zoom,
    y: (clientY - bounds.top - (Number(root.dataset.edgelessPanY) || 0)) / zoom,
  };
}

/**
 * Commits prepared file representations without persisting pending state.
 * @param reactEditor - Active React editor runtime.
 * @param prepared - Successful handler results in source order.
 * @param destination - Captured insertion destination.
 * @returns Nothing.
 */
function insertPrepared(
  reactEditor: ReactEditor,
  prepared: readonly PreparedFilePaste[],
  destination: FileDestination,
): void {
  if (!prepared.length) return;
  const { editor } = reactEditor;
  editor.batchUpdates(() => {
    if (destination.kind === "inline") {
      const block = editor.blocks.getBlock(destination.blockId);
      if (!block) return;
      const inline = prepared.map((item) => item.inline).join(" ");
      editor.blocks.updateBlock(block.id, {
        content: block.content.slice(0, destination.start) + inline + block.content.slice(destination.end),
      });
      reactEditor.selection.set(createCaretSelection(block.id, destination.start + inline.length));
      return;
    }
    if (destination.kind === "block") {
      let afterId = destination.afterId;
      prepared.forEach((item, index) => {
        if (index === 0 && destination.replaceId) {
          editor.blocks.setBlockType(destination.replaceId, item.block.type);
          editor.blocks.updateBlock(destination.replaceId, { props: item.block.props });
          afterId = destination.replaceId;
        } else {
          afterId = reactEditor.blocks.insertBlock({ type: item.block.type, props: item.block.props }, afterId);
        }
      });
      return;
    }
    const zIndex = Math.max(0, ...editor.elements.getElements().map((element) => element.zIndex)) + 1;
    const ids = prepared.map((item, index) => editor.elements.insertElement({
      type: item.element.type,
      frame: {
        x: destination.x + index * 24,
        y: destination.y + index * 24,
        width: item.element.width,
        height: item.element.height,
      },
      zIndex: zIndex + index,
      props: item.element.props,
    }));
    if (editor.commands.has("edgeless.selection.set")) editor.execute("edgeless.selection.set", ids);
  });
  requestAnimationFrame(() => reactEditor.selection.restoreDOM());
}

/**
 * Installs generic file paste/drop, fallback views, and the native picker.
 * @param options - Optional asynchronous error notification.
 * @returns Lifecycle-owned React editor extension.
 */
export function fileExtension(options: FileExtensionOptions = {}): ReactEditorExtension {
  return {
    id: "file",
    setup: (reactEditor) => {
      const abort = new AbortController();
      const statuses = new FileUploadStore();
      reactEditor.extensions.mount(() => <FileUploadStatuses store={statuses} />, "afterSurface");
      reactEditor.blocks.register({ definition: { type: FILE_BLOCK_TYPE, title: "File" }, render: FileBlock });
      reactEditor.files.registerPasteHandler({
        id: "file",
        elementType: FILE_ELEMENT_TYPE,
        ElementView: FileElementView,
        prepare: ({ reference }) => ({
          inline: serializeFileMacro(reference),
          block: { type: FILE_BLOCK_TYPE, props: { ...reference } },
          element: { type: FILE_ELEMENT_TYPE, props: { ...reference, rotation: 0 }, width: 240, height: 64 },
        }),
      });
      reactEditor.clipboard.registerFormatter({
        id: "file",
        matches: ({ block }) => block.type === FILE_BLOCK_TYPE,
        format: ({ block, children, depth }) => {
          const reference = fileReference(block.props);
          if (!reference) return { plain: "", markdown: "", html: "" };
          const macro = `${"  ".repeat(depth)}${serializeFileMacro(reference)}`;
          return {
            plain: children.plain ? `${macro}\n${children.plain}` : macro,
            markdown: children.markdown ? `${macro}\n${children.markdown}` : macro,
            html: `<span data-rivto-file="${encodeURIComponent(JSON.stringify(reference))}">${escapeHtml(reference.name)}</span>${children.html}`,
          };
        },
      });
      reactEditor.clipboard.registerPostprocessor({
        id: "file",
        process: ({ bundle }) => {
          const blocks = bundle.blocks.filter((block) => block.type === FILE_BLOCK_TYPE);
          const selected = new Set(bundle.selectedElementIds ?? []);
          const elements = (bundle.elements ?? []).filter((element) => selected.has(element.id) && element.type === FILE_ELEMENT_TYPE);
          if (blocks.length + elements.length !== 1 || bundle.blocks.length + selected.size !== 1) return undefined;
          const reference = fileReference((blocks[0] ?? elements[0])!.props);
          return reference ? {
            name: reference.name,
            mimeType: reference.mimeType,
            data: reactEditor.files.read(reference.uri, reference.mimeType, { signal: abort.signal }),
          } : undefined;
        },
      });

      /**
       * Uploads and prepares one file batch in source order.
       * @param files - Browser files to store and dispatch.
       * @param destination - Captured insertion destination.
       * @param source - Browser interaction that supplied the files.
       * @param point - Viewport position for status feedback.
       * @returns Nothing; completion commits asynchronously.
       */
      const upload = (
        files: readonly File[],
        destination: FileDestination,
        source: "clipboard" | "drop" | "picker",
        point: { readonly x: number; readonly y: number },
      ): void => {
        const jobs = files.map(async (file, index): Promise<PreparedFilePaste | undefined> => {
          const id = crypto.randomUUID();
          const retry = () => { statuses.delete(id); upload([file], destination, source, point); };
          statuses.set({ id, name: file.name || "file", x: point.x + index * 12, y: point.y + index * 12, retry });
          try {
            const uri = await reactEditor.files.upload(file, {
              source,
              destination: destination.kind as FilePasteDestination,
              signal: abort.signal,
              reportProgress: (progress) => statuses.update(id, { progress: Math.max(0, Math.min(1, progress)) }),
            });
            const reference: FileReference = {
              uri,
              name: file.name || "file",
              mimeType: file.type || "application/octet-stream",
              size: file.size,
            };
            const prepared = await reactEditor.files.preparePaste({ file, reference }, {
              destination: destination.kind,
              signal: abort.signal,
            });
            statuses.delete(id);
            return prepared;
          } catch (error) {
            statuses.update(id, { error: error instanceof Error ? error.message : "Unable to upload file" });
            options.onError?.(error);
            return undefined;
          }
        });
        void Promise.all(jobs).then((items) => {
          if (!abort.signal.aborted) insertPrepared(
            reactEditor,
            items.filter((item): item is PreparedFilePaste => Boolean(item)),
            destination,
          );
        });
      };

      /**
       * Resolves and prepares already-addressable local file references.
       * @param uris - Absolute paths or file URIs in source order.
       * @param destination - Captured insertion destination.
       * @param point - Viewport position for status feedback.
       * @returns Nothing; completion commits asynchronously.
       */
      const insertReferences = (
        uris: readonly string[],
        destination: FileDestination,
        point: { readonly x: number; readonly y: number },
      ): void => {
        const jobs = uris.map(async (uri, index): Promise<PreparedFilePaste | undefined> => {
          const id = crypto.randomUUID();
          const retry = () => { statuses.delete(id); insertReferences([uri], destination, point); };
          const reference = referenceFromUri(uri);
          statuses.set({ id, name: reference.name, x: point.x + index * 12, y: point.y + index * 12, retry });
          try {
            const prepared = await reactEditor.files.preparePaste({ reference }, {
              destination: destination.kind,
              signal: abort.signal,
            });
            statuses.delete(id);
            return prepared;
          } catch (error) {
            statuses.update(id, { error: error instanceof Error ? error.message : "Unable to load file" });
            options.onError?.(error);
            return undefined;
          }
        });
        void Promise.all(jobs).then((items) => {
          if (!abort.signal.aborted) insertPrepared(
            reactEditor,
            items.filter((item): item is PreparedFilePaste => Boolean(item)),
            destination,
          );
        });
      };

      /**
       * Replaces an empty default block for one file, otherwise keeps inline placement.
       * @param destination - Initially resolved placement.
       * @param fileCount - Number of incoming files.
       * @param blockId - Block under the event.
       * @returns Final placement.
       */
      const replaceEmptyDefault = (destination: FileDestination, fileCount: number, blockId?: string): FileDestination => {
        if (destination.kind !== "inline" || fileCount !== 1 || !blockId) return destination;
        const block = reactEditor.editor.blocks.getBlock(blockId);
        const defaultType = reactEditor.createDefaultBlock().type;
        return block?.type === defaultType && block.children.length === 0 && reactEditor.isEmptyBlock(block)
          ? { kind: "block", afterId: blockId, replaceId: blockId }
          : destination;
      };

      reactEditor.events.register({ id: "file.dragover", type: "dragover", capture: true }, ({ raw, root }) => {
        const accepts = raw.dataTransfer?.types.includes("Files") === true;
        if (accepts && raw.dataTransfer) raw.dataTransfer.dropEffect = "copy";
        return accepts && root.contains(raw.target as Node);
      });
      reactEditor.events.register({ id: "file.drop", type: "drop", capture: true }, ({ raw, mode, contentElement, blockId, root }) => {
        const files = transferableFiles(raw.dataTransfer);
        const uri = localFileUriFromText(raw.dataTransfer?.getData("text/uri-list") ?? "");
        if (!files.length && !uri) return false;
        const destination = replaceEmptyDefault(
          destinationAt(reactEditor, mode, contentElement, blockId, raw.clientX, raw.clientY, root),
          files.length || Number(Boolean(uri)),
          blockId,
        );
        const point = { x: raw.clientX, y: raw.clientY };
        if (files.length) upload(files, destination, "drop", point);
        else if (uri) insertReferences([uri], destination, point);
        return true;
      });
      reactEditor.events.register({ id: "file.paste", type: "paste", capture: true }, ({ raw, mode, contentElement, blockId, root }) => {
        const files = transferableFiles(raw.clipboardData);
        const uri = localFileUriFromText(raw.clipboardData?.getData("text/uri-list") ?? "")
          ?? localFileUriFromText(raw.clipboardData?.getData("text/plain") ?? "");
        const redacted = !files.length && !uri && raw.clipboardData?.types.includes("text/uri-list") === true;
        if (!files.length && !uri && !redacted) return false;
        const bounds = contentElement?.getBoundingClientRect() ?? root.getBoundingClientRect();
        const initial = contentElement
          ? inlineDestination(reactEditor, blockId)
          : destinationAt(reactEditor, mode, null, blockId, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, root);
        if (!initial) return false;
        const destination = replaceEmptyDefault(initial, files.length || Number(Boolean(uri || redacted)), blockId);
        const point = { x: bounds.left + bounds.width / 2, y: bounds.bottom };
        if (files.length) upload(files, destination, "clipboard", point);
        else if (uri) insertReferences([uri], destination, point);
        else {
          const clipboard = root.ownerDocument.defaultView?.navigator.clipboard;
          void clipboard?.readText().then((text) => {
            const local = localFileUriFromText(text);
            if (!local) throw new TypeError("Clipboard does not contain a readable local file path");
            insertReferences([local], destination, point);
          }).catch((error: unknown) => options.onError?.(error));
          if (!clipboard) options.onError?.(new TypeError("This browser does not provide clipboard read access"));
        }
        return true;
      });
      reactEditor.slashCommands.register({
        id: "file.insert",
        title: "File",
        group: "Insert",
        keywords: ["attachment", "upload"],
        execute: ({ blockId }) => {
          const input = document.createElement("input");
          input.className = FILE_INPUT_CLASS;
          input.type = "file";
          input.multiple = true;
          input.addEventListener("change", () => {
            const files = [...input.files ?? []];
            const block = reactEditor.editor.blocks.getBlock(blockId);
            const destination: FileDestination = files.length === 1 && block && block.children.length === 0 && reactEditor.isEmptyBlock(block)
              ? { kind: "block", afterId: blockId, replaceId: blockId }
              : { kind: "block", afterId: blockId };
            const blockElement = reactEditor.events.getRoot()?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
            const bounds = blockElement?.getBoundingClientRect();
            upload(files, destination, "picker", {
              x: bounds?.left ?? innerWidth / 2,
              y: bounds?.bottom ?? innerHeight / 2,
            });
          }, { once: true });
          input.click();
        },
      });
      return () => abort.abort();
    },
  };
}
