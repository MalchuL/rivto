/**
 * Opt-in image blocks, inline image insertion, and browser file interactions.
 *
 * Clipboard, filesystem drop, and the native slash-command picker all share
 * one asynchronous upload path. Pending work is local presentation state;
 * successful references alone are committed to collaborative blocks/elements.
 *
 * @module
 */
import {
  createCaretSelection,
  type EditorBlock,
  type EditorMode,
} from "@chulane/rivto";
import { useSyncExternalStore } from "react";
import type { ReactEditor } from "../../types";
import type { ReactEditorExtension } from "../../managers";
import { resolveSelectionEndpoints } from "../../managers";
import { useBlock } from "../../hooks";
import {
  configureImageViews,
  ImageView,
  type ImageViewCustomizations,
} from "./image-view";
import { serializeImageMacro } from "./image-macro";
import type { FileInlineViewProps, FileReference } from "../../managers/files";

/** Persisted native type used by standalone image blocks. */
export const IMAGE_BLOCK_TYPE = "image";
const IMAGE_BLOCK_CLASS = "rivto-image-block";
const IMAGE_UPLOADS_CLASS = "rivto-image-uploads";
const IMAGE_UPLOAD_CLASS = "rivto-image-upload";
const IMAGE_FILE_INPUT_CLASS = "rivto-image-file-input";

/** Persisted image metadata shared by standalone blocks and canvas elements. */
export interface ImageProps extends FileReference {
  readonly uri: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
  readonly intrinsicWidth?: number;
  readonly intrinsicHeight?: number;
}

/** Optional host notification for asynchronous image failures. */
export interface ImageExtensionOptions {
  readonly onError?: (error: unknown) => void;
  readonly views?: ImageViewCustomizations;
}

interface ImageAsset extends FileReference {
  readonly alt: string;
  readonly intrinsicWidth: number;
  readonly intrinsicHeight: number;
}

type ImageDestination =
  | { readonly kind: "inline"; readonly blockId: string; readonly start: number; readonly end: number }
  | { readonly kind: "block"; readonly afterId?: string; readonly replaceId?: string }
  | { readonly kind: "element"; readonly x: number; readonly y: number };

interface PendingUpload {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly retry: () => void;
  progress?: number;
  error?: string;
}

/**
 * Renders an image reference encountered through the generic file macro.
 * @param props - Portable file metadata matched as an image.
 * @returns Shared inline image view.
 */
function InlineImageFileView({ reference }: FileInlineViewProps) {
  return <ImageView
    kind="inline"
    uri={reference.uri}
    alt={reference.name}
    name={reference.name}
    mimeType={reference.mimeType}
  />;
}

/** Small observable store for non-persisted upload feedback. */
class UploadStatusStore {
  private readonly uploads = new Map<string, PendingUpload>();
  private readonly listeners = new Set<() => void>();
  private revision = 0;

  /** Returns a stable revision for React subscription. */
  getRevision(): number { return this.revision; }
  /** Returns current status cards in insertion order. */
  getUploads(): readonly PendingUpload[] { return [...this.uploads.values()]; }
  /** Subscribes to status changes. */
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  /** Adds or replaces one status. */
  set(upload: PendingUpload): void { this.uploads.set(upload.id, upload); this.emit(); }
  /** Applies a partial status update. */
  update(id: string, patch: Partial<PendingUpload>): void {
    const current = this.uploads.get(id);
    if (current) { this.uploads.set(id, { ...current, ...patch }); this.emit(); }
  }
  /** Removes one completed or dismissed status. */
  delete(id: string): void { if (this.uploads.delete(id)) this.emit(); }
  /** Notifies subscribers after one local state change. */
  private emit(): void { this.revision += 1; this.listeners.forEach((listener) => listener()); }
}

/** Overlay of accessible pending/error upload cards near their insertion point. */
function ImageUploadStatuses({ store }: { readonly store: UploadStatusStore }) {
  useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getRevision(),
    () => store.getRevision(),
  );
  return <div className={IMAGE_UPLOADS_CLASS} aria-live="polite">
    {store.getUploads().map((upload) => <div
      key={upload.id}
      className={IMAGE_UPLOAD_CLASS}
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

/** Returns normalized image props from an opaque persisted property record. */
function imageProps(props: Record<string, unknown>): ImageProps | undefined {
  if (typeof props.uri !== "string" || typeof props.alt !== "string") return undefined;
  const number = (value: unknown): number | undefined => (
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined
  );
  return {
    uri: props.uri,
    name: typeof props.name === "string" && props.name ? props.name : props.alt || "image",
    mimeType: typeof props.mimeType === "string" && props.mimeType ? props.mimeType : "application/octet-stream",
    ...(number(props.size) === undefined ? {} : { size: number(props.size) }),
    alt: props.alt,
    width: number(props.width),
    height: number(props.height),
    intrinsicWidth: number(props.intrinsicWidth),
    intrinsicHeight: number(props.intrinsicHeight),
  };
}

/** Escapes one string for safe portable HTML attributes. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]!);
}

/** Standalone image block renderer shared by page and block-card surfaces. */
export function ImageBlock({ blockId }: { readonly blockId: string }) {
  const { block, operations } = useBlock(blockId);
  const image = block ? imageProps(block.props) : undefined;
  if (!image) return <div className={IMAGE_BLOCK_CLASS} role="alert">Invalid image block</div>;
  return <div className={IMAGE_BLOCK_CLASS}>
    <ImageView
      kind="block"
      uri={image.uri}
      alt={image.alt}
      name={image.name}
      mimeType={image.mimeType}
      width={image.width}
      height={image.height}
      onIntrinsicSize={(intrinsicWidth, intrinsicHeight) => {
        if (!image.intrinsicWidth || !image.intrinsicHeight) {
          operations.update({ props: { ...image, intrinsicWidth, intrinsicHeight } });
        }
      }}
      onChange={(patch) => operations.update({
        props: patch.reset
          ? { ...image, width: undefined, height: undefined }
          : {
              ...image,
              ...(patch.alt !== undefined ? { alt: patch.alt } : {}),
              ...(patch.width !== undefined ? { width: patch.width } : {}),
              ...(patch.height !== undefined ? { height: patch.height } : {}),
            },
      })}
    />
  </div>;
}

/** Loads intrinsic dimensions and rejects undecodable image data. */
function inspectImage(source: string, revoke = false): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => { if (revoke) URL.revokeObjectURL(source); };
    image.onload = () => { cleanup(); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { cleanup(); reject(new TypeError("File or URI is not a decodable image")); };
    image.src = source;
  });
}

/** Returns whether a transferable file is plausibly an image before decode validation. */
function isImageFile(file: File): boolean {
  return file.type.startsWith("image/")
    || (/^(?:application\/octet-stream)?$/i.test(file.type) && /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(file.name));
}

/** Reads image files from either clipboard/drag file lists or item-only browser payloads. */
function transferableImageFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = [...data.files].filter(isImageFile);
  if (files.length) return files;
  return [...data.items]
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file && isImageFile(file)));
}

/** Returns whether clipboard text is a host-resolvable local image path. */
function isLocalImageUri(uri: string): boolean {
  return /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(uri)
    && (/^file:\/\//i.test(uri) || /^\//.test(uri) || /^[a-z]:[\\/]/i.test(uri));
}

/** Extracts one supported remote or local image URI from clipboard text. */
function imageUriFromText(text: string): string | undefined {
  const uri = text.trim().split(/\r?\n/).find((line) => line && !line.startsWith("#"));
  return uri && (/^https?:\/\//i.test(uri) || isLocalImageUri(uri)) ? uri : undefined;
}

/** Returns an image-only remote URI from transferable HTML/plain data. */
function remoteImageUri(data: DataTransfer | null): { uri: string; alt: string } | undefined {
  if (!data || data.files.length) return undefined;
  const html = data.getData("text/html").trim();
  if (html) {
    const document = new DOMParser().parseFromString(html, "text/html");
    const images = [...document.body.querySelectorAll("img")];
    const remaining = document.body.cloneNode(true) as HTMLElement;
    remaining.querySelectorAll("img").forEach((image) => image.remove());
    if (images.length === 1 && !remaining.textContent?.trim()) {
      return { uri: images[0]!.src, alt: images[0]!.alt };
    }
    return undefined;
  }
  const uri = imageUriFromText(data.getData("text/uri-list"))
    ?? imageUriFromText(data.getData("text/plain"));
  return uri ? { uri, alt: "" } : undefined;
}

/** Returns the current selection as a safe inline insertion target. */
function inlineDestination(reactEditor: ReactEditor, fallbackBlockId?: string): ImageDestination | undefined {
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

/** Installs image upload events, block rendering, and slash insertion. */
export function imageExtension(options: ImageExtensionOptions = {}): ReactEditorExtension {
  return {
    id: "image",
    setup: (reactEditor) => {
      const statuses = new UploadStatusStore();
      const abort = new AbortController();
      const disposeImageViews = configureImageViews(reactEditor, options.views ?? {});
      reactEditor.extensions.mount(() => <ImageUploadStatuses store={statuses} />, "afterSurface");
      reactEditor.blocks.register({ definition: { type: IMAGE_BLOCK_TYPE, title: "Image" }, render: ImageBlock });
      reactEditor.files.registerPasteHandler({
        id: "image",
        elementType: "image",
        InlineView: InlineImageFileView,
        matches: ({ file, reference }) => Boolean(file ? isImageFile(file) : reference.mimeType.startsWith("image/")),
        prepare: async ({ file, reference }) => {
          const resolved = file ? file : await reactEditor.files.resolve(reference.uri, { signal: abort.signal });
          const localUrl = resolved instanceof Blob ? URL.createObjectURL(resolved) : resolved;
          const dimensions = await inspectImage(localUrl, resolved instanceof Blob);
          const completeReference = {
            ...reference,
            mimeType: resolved instanceof Blob && resolved.type ? resolved.type : reference.mimeType,
            ...(resolved instanceof Blob ? { size: resolved.size } : {}),
          };
          const props = {
            ...completeReference,
            alt: file ? file.name || "Image" : reference.name || "Image",
            intrinsicWidth: dimensions.width,
            intrinsicHeight: dimensions.height,
          };
          const scale = Math.min(1, 640 / dimensions.width, 480 / dimensions.height);
          return {
            inline: serializeImageMacro({ uri: reference.uri, alt: props.alt }),
            block: { type: IMAGE_BLOCK_TYPE, props },
            element: {
              type: "image",
              props: { ...props, rotation: 0 },
              width: Math.max(24, Math.round(dimensions.width * scale)),
              height: Math.max(24, Math.round(dimensions.height * scale)),
            },
          };
        },
      });
      reactEditor.clipboard.registerPostprocessor({
        id: "image.binary",
        process: ({ bundle }) => {
          const blocks = bundle.blocks.filter((block) => block.type === IMAGE_BLOCK_TYPE);
          const selected = new Set(bundle.selectedElementIds ?? []);
          const elements = (bundle.elements ?? []).filter((element) => selected.has(element.id) && element.type === "image");
          if (blocks.length + elements.length !== 1 || bundle.blocks.length + selected.size !== 1) return undefined;
          const image = imageProps((blocks[0] ?? elements[0])!.props);
          return image ? {
            name: image.name,
            mimeType: image.mimeType,
            data: reactEditor.files.read(image.uri, image.mimeType, { signal: abort.signal }),
          } : undefined;
        },
      });
      reactEditor.clipboard.registerFormatter({
        id: "image",
        matches: ({ block }) => block.type === IMAGE_BLOCK_TYPE,
        format: ({ block, children, depth }) => {
          const image = imageProps(block.props);
          if (!image) return { plain: "", markdown: "", html: "" };
          const macro = `${"  ".repeat(depth)}${serializeImageMacro({ uri: image.uri, alt: image.alt, width: image.width, height: image.height })}`;
          const plain = children.plain ? `${macro}\n${children.plain}` : macro;
          return {
            plain,
            markdown: children.markdown ? `${macro}\n${children.markdown}` : macro,
            html: `<img src="${escapeHtml(image.uri)}" alt="${escapeHtml(image.alt)}"`
              + (image.width ? ` width="${image.width}"` : "")
              + (image.height ? ` height="${image.height}"` : "")
              + `>${children.html}`,
          };
        },
      });

      /** Commits uploaded images to their captured destination. */
      const insert = (assets: readonly ImageAsset[], destination: ImageDestination): void => {
        if (!assets.length) return;
        const { editor } = reactEditor;
        editor.batchUpdates(() => {
          if (destination.kind === "inline") {
            const block = editor.blocks.getBlock(destination.blockId);
            if (!block) return;
            const macros = assets.map((asset) => serializeImageMacro({ uri: asset.uri, alt: asset.alt })).join(" ");
            editor.blocks.updateBlock(block.id, {
              content: block.content.slice(0, destination.start) + macros + block.content.slice(destination.end),
            });
            reactEditor.selection.set(createCaretSelection(destination.blockId, destination.start + macros.length));
          } else if (destination.kind === "block") {
            let afterId = destination.afterId;
            assets.forEach((asset, index) => {
              if (index === 0 && destination.replaceId) {
                editor.blocks.setBlockType(destination.replaceId, IMAGE_BLOCK_TYPE);
                editor.blocks.updateBlock(destination.replaceId, { props: { ...asset } });
                afterId = destination.replaceId;
                return;
              }
              afterId = reactEditor.blocks.insertBlock({ type: IMAGE_BLOCK_TYPE, props: { ...asset } }, afterId);
            });
          } else {
            const created: string[] = [];
            assets.forEach((asset, index) => {
              const scale = Math.min(1, 640 / asset.intrinsicWidth, 480 / asset.intrinsicHeight);
              created.push(editor.execute("edgeless.visual.create", {
                kind: "image",
                frame: {
                  x: destination.x + index * 24,
                  y: destination.y + index * 24,
                  width: Math.max(24, Math.round(asset.intrinsicWidth * scale)),
                  height: Math.max(24, Math.round(asset.intrinsicHeight * scale)),
                },
                uri: asset.uri,
                alt: asset.alt,
                intrinsicWidth: asset.intrinsicWidth,
                intrinsicHeight: asset.intrinsicHeight,
                name: asset.name,
                mimeType: asset.mimeType,
                size: asset.size,
              }) as string);
            });
            editor.execute("edgeless.selection.set", created);
          }
        });
        requestAnimationFrame(() => reactEditor.selection.restoreDOM());
      };

      /** Uploads one batch concurrently and inserts successful results in source order. */
      const upload = (
        files: readonly File[],
        destination: ImageDestination,
        source: "clipboard" | "drop" | "picker",
        point: { x: number; y: number },
      ): void => {
        if (destination.kind === "element" && !reactEditor.editor.commands.has("edgeless.visual.create")) {
          const id = crypto.randomUUID();
          statuses.set({
            id,
            name: files[0]?.name ?? "image",
            x: point.x,
            y: point.y,
            error: "Canvas images require edgelessVisualsExtension()",
            retry: () => statuses.delete(id),
          });
          return;
        }
        const jobs = files.filter(isImageFile).map((file, index) => {
          const id = crypto.randomUUID();
          const retry = () => { statuses.delete(id); upload([file], destination, source, point); };
          statuses.set({ id, name: file.name || "image", x: point.x + index * 12, y: point.y + index * 12, retry });
          return (async (): Promise<ImageAsset | undefined> => {
            try {
              const localUrl = URL.createObjectURL(file);
              const dimensions = await inspectImage(localUrl, true);
              const uri = await reactEditor.files.upload(file, {
                source,
                destination: destination.kind,
                signal: abort.signal,
                reportProgress: (progress) => statuses.update(id, { progress: Math.max(0, Math.min(1, progress)) }),
              });
              statuses.delete(id);
              return {
                uri,
                name: file.name || "image",
                mimeType: file.type || "application/octet-stream",
                size: file.size,
                alt: file.name || "Image",
                intrinsicWidth: dimensions.width,
                intrinsicHeight: dimensions.height,
              };
            } catch (error) {
              const message = error instanceof Error ? error.message : "Unable to upload image";
              statuses.update(id, { error: message });
              options.onError?.(error);
              return undefined;
            }
          })();
        });
        void Promise.all(jobs).then((assets) => {
          if (!abort.signal.aborted) insert(assets.filter((asset): asset is ImageAsset => Boolean(asset)), destination);
        });
      };

      /** Resolves and inserts a remote image reference without uploading it. */
      const insertRemote = (
        remote: { uri: string; alt: string },
        destination: ImageDestination,
        point: { x: number; y: number },
      ): void => {
        if (destination.kind === "element" && !reactEditor.editor.commands.has("edgeless.visual.create")) {
          const id = crypto.randomUUID();
          statuses.set({
            id,
            name: remote.uri,
            x: point.x,
            y: point.y,
            error: "Canvas images require edgelessVisualsExtension()",
            retry: () => statuses.delete(id),
          });
          return;
        }
        const id = crypto.randomUUID();
        const retry = () => { statuses.delete(id); insertRemote(remote, destination, point); };
        statuses.set({ id, name: remote.uri, x: point.x, y: point.y, retry });
        void reactEditor.files.resolve(remote.uri, { signal: abort.signal }).then(async (resolved) => {
          const source = resolved instanceof Blob ? URL.createObjectURL(resolved) : resolved;
          const dimensions = await inspectImage(source, resolved instanceof Blob);
          if (abort.signal.aborted) return;
          statuses.delete(id);
          const name = (() => {
            try { return decodeURIComponent(new URL(remote.uri, location.href).pathname.split("/").pop() || "image"); }
            catch { return "image"; }
          })();
          insert([{
            uri: remote.uri,
            name,
            mimeType: resolved instanceof Blob && resolved.type ? resolved.type : "application/octet-stream",
            ...(resolved instanceof Blob ? { size: resolved.size } : {}),
            alt: remote.alt,
            intrinsicWidth: dimensions.width,
            intrinsicHeight: dimensions.height,
          }], destination);
        }).catch((error: unknown) => {
          statuses.update(id, { error: error instanceof Error ? error.message : "Unable to load image" });
          options.onError?.(error);
        });
      };

      /** Chooses inline, block, or element placement from one browser event. */
      const destinationAt = (
        mode: EditorMode,
        contentElement: HTMLElement | null,
        blockId: string | undefined,
        clientX: number,
        clientY: number,
        root: HTMLElement,
      ): ImageDestination => {
        if (contentElement) {
          const document = root.ownerDocument as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
          const hit = document.caretPositionFromPoint?.(clientX, clientY);
          const range = document.caretRangeFromPoint?.(clientX, clientY);
          const node = hit?.offsetNode ?? range?.startContainer;
          const offset = hit?.offset ?? range?.startOffset;
          if (node !== undefined && offset !== undefined) {
            const selection = root.ownerDocument.getSelection();
            selection?.setBaseAndExtent(node, offset, node, offset);
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
      };

      reactEditor.events.register({ id: "image.dragover", type: "dragover", capture: true }, ({ raw, root }) => {
        const accepts = [...raw.dataTransfer?.files ?? []].some((file) => file.type.startsWith("image/"))
          || raw.dataTransfer?.types.includes("Files") === true
          || raw.dataTransfer?.types.includes("text/uri-list") === true;
        if (accepts && raw.dataTransfer) raw.dataTransfer.dropEffect = "copy";
        return accepts && root.contains(raw.target as Node);
      });
      reactEditor.events.register({ id: "image.drop", type: "drop", capture: true }, ({ raw, mode, contentElement, blockId, root }) => {
        const files = transferableImageFiles(raw.dataTransfer);
        const remote = remoteImageUri(raw.dataTransfer);
        if (!files.length && !remote) return false;
        const destination = destinationAt(mode, contentElement, blockId, raw.clientX, raw.clientY, root);
        if (files.length) upload(files, destination, "drop", { x: raw.clientX, y: raw.clientY });
        else if (remote) insertRemote(remote, destination, { x: raw.clientX, y: raw.clientY });
        return true;
      });
      reactEditor.events.register({ id: "image.paste", type: "paste", capture: true }, ({ raw, mode, contentElement, blockId, root }) => {
        const files = transferableImageFiles(raw.clipboardData);
        const remote = remoteImageUri(raw.clipboardData);
        const redactedFileList = !files.length && !remote
          && raw.clipboardData?.types.includes("text/uri-list") === true;
        if (!files.length && !remote && !redactedFileList) return false;
        const bounds = contentElement?.getBoundingClientRect() ?? root.getBoundingClientRect();
        const destination = contentElement
          ? inlineDestination(reactEditor, blockId)
          : destinationAt(mode, null, blockId, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, root);
        if (!destination) return false;
        const point = { x: bounds.left + bounds.width / 2, y: bounds.bottom };
        if (files.length) upload(files, destination, "clipboard", point);
        else if (remote) insertRemote(remote, destination, point);
        else {
          const id = crypto.randomUUID();
          const read = (): void => {
            statuses.set({ id, name: "clipboard image", x: point.x, y: point.y, retry: read });
            const clipboard = root.ownerDocument.defaultView?.navigator.clipboard;
            void clipboard?.readText().then((text) => {
              const uri = imageUriFromText(text);
              if (!uri) throw new TypeError("Clipboard does not contain a readable image path");
              statuses.delete(id);
              insertRemote({ uri, alt: "" }, destination, point);
            }).catch((error: unknown) => {
              statuses.update(id, { error: error instanceof Error ? error.message : "Unable to read the clipboard image path" });
              options.onError?.(error);
            });
            if (!clipboard) statuses.update(id, { error: "This browser does not provide clipboard read access" });
          };
          read();
        }
        return true;
      });
      reactEditor.slashCommands.register({
        id: "image.insert",
        title: "Image",
        group: "Insert",
        keywords: ["picture", "photo", "upload"],
        execute: ({ blockId }) => {
          const block = reactEditor.editor.blocks.getBlock(blockId);
          const replaceId = block && block.children.length === 0 && reactEditor.isEmptyBlock(block)
            ? blockId
            : undefined;
          const input = document.createElement("input");
          input.className = IMAGE_FILE_INPUT_CLASS;
          input.type = "file";
          input.accept = "image/*";
          input.multiple = true;
          input.addEventListener("change", () => {
            const blockElement = reactEditor.events.getRoot()?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
            const bounds = blockElement?.getBoundingClientRect();
            upload([...input.files ?? []], { kind: "block", afterId: blockId, replaceId }, "picker", {
              x: bounds?.left ?? innerWidth / 2,
              y: bounds?.bottom ?? innerHeight / 2,
            });
          }, { once: true });
          input.click();
        },
      });
      return () => {
        abort.abort();
        disposeImageViews();
      };
    },
  };
}

/** Returns whether a block is a valid standalone image record. */
export function isImageBlock(block: EditorBlock): boolean {
  return block.type === IMAGE_BLOCK_TYPE && Boolean(imageProps(block.props));
}
