import { escapeHtml } from "./escape-html";
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
import { useBlock, useBlockSelectionAnchor } from "../../hooks";
import type { ReactEditorExtension } from "../../managers";
import type { BinaryProvider } from "../../attachments";
import type { ElementRenderProps } from "../../managers/elements/types";
import type { ReactPanelApi } from "../../panels/types";
import { validateBinaryUri, type FileReference, type PreparedFile } from "../../attachments";
import { FileView, RegisteredFileView } from "./file-view";
import { serializeFileMacro } from "./file-macro";
import { ingestFileBatch, insertPrepared } from "./file-ingestion";
import {
  fileDestinationAtPoint,
  inlineDestination,
  type FileDestination,
} from "./file-destination";
import { FileUploadStatusOverlay, FileUploadStatusStore } from "./file-upload-status";
import { getTransferredFiles, findLocalFileUri, createFileReferenceFromUri } from "./file-input";

/** Persisted native type used by generic file blocks and elements. */
export const FILE_BLOCK_TYPE = "file";
export const FILE_ELEMENT_TYPE = "file";
const FILE_BLOCK_CLASS = "rivto-file-block";
const FILE_INPUT_CLASS = "rivto-file-input";

/** Optional notification for asynchronous file failures. */
export interface FileExtensionOptions {
  readonly provider: BinaryProvider<string, Blob>;
  readonly onError?: (error: unknown) => void;
}

/**
 * Reads normalized generic file props from persisted data.
 * @param props - Opaque persisted property record.
 * @returns Portable file reference, or undefined for invalid metadata.
 */
export function fileReference(props: Record<string, unknown>): FileReference | undefined {
  const size = props.size;
  if (
    typeof props.uri !== "string" ||
    !props.uri ||
    typeof props.name !== "string" ||
    !props.name ||
    typeof props.mimeType !== "string" ||
    !props.mimeType ||
    (size !== undefined && (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0))
  ) {
    return undefined;
  }
  return { uri: props.uri, name: props.name, mimeType: props.mimeType, size };
}

/**
 * Renders one standalone generic file block.
 * @param props - Stable block identity.
 * @returns Display-only file block or validation error.
 */
export function FileBlock({ blockId }: { readonly blockId: string }) {
  const { block } = useBlock(blockId);
  const selectionAnchor = useBlockSelectionAnchor(blockId);
  const reference = block ? fileReference(block.props) : undefined;
  return (
    <div {...selectionAnchor} className={FILE_BLOCK_CLASS}>
      {reference ? (
        <RegisteredFileView reference={reference} />
      ) : (
        <span role="alert">Invalid file block</span>
      )}
    </div>
  );
}

/**
 * Renders one generic file canvas element in the shared element host.
 *
 * @param props - Shared host props containing element identity and persisted properties.
 * @param props.element - Element whose persisted file metadata is displayed.
 * @returns A display-only file view or a validation error when metadata is invalid.
 */
function FileCanvasElement({ element }: ElementRenderProps) {
  const reference = fileReference(element.props);
  return reference ? <FileView {...reference} /> : <span role="alert">Invalid file element</span>;
}

/**
 * Installs generic file paste/drop, fallback views, and the native picker.
 * @param options - Optional asynchronous error notification.
 * @returns Lifecycle-owned React editor extension.
 */
export function fileExtension(options: FileExtensionOptions): ReactEditorExtension {
  return {
    id: "file",
    setup: (reactEditor) => {
      const abort = new AbortController();
      const statuses = new FileUploadStatusStore();
      let nextUploadId = 0;
      reactEditor.extensions.mount(
        () => <FileUploadStatusOverlay store={statuses} kind="file" />,
        "afterSurface",
      );
      reactEditor.blockTypes.register({
        definition: { type: FILE_BLOCK_TYPE, title: "File" },
        render: FileBlock,
      });
      reactEditor.elementTypes.register({
        definition: { type: FILE_ELEMENT_TYPE },
        title: "File",
        render: FileCanvasElement,
      });
      reactEditor.clipboard.registerFileHandler({
        id: "file",
        provider: options.provider,
        prepare: ({ reference }) => ({
          inline: serializeFileMacro(reference),
          block: { type: FILE_BLOCK_TYPE, props: { ...reference } },
          element: {
            type: FILE_ELEMENT_TYPE,
            props: { ...reference, rotation: 0 },
            width: 240,
            height: 64,
          },
        }),
      });
      reactEditor.clipboard.setDefaultFileHandler("file");
      reactEditor.clipboardFormats.registerFormatter({
        id: "file",
        matches: ({ block }) => block.type === FILE_BLOCK_TYPE,
        format: ({ block, children, depth }) => {
          const reference = fileReference(block.props);
          if (!reference) {
            return { plain: "", markdown: "", html: "" };
          }
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
          const elements = (bundle.elements ?? []).filter(
            (element) => selected.has(element.id) && element.type === FILE_ELEMENT_TYPE,
          );
          if (blocks.length + elements.length !== 1 || bundle.blocks.length + selected.size !== 1) {
            return undefined;
          }
          const reference = fileReference((blocks[0] ?? elements[0])!.props);
          return reference
            ? {
                name: reference.name,
                mimeType: reference.mimeType,
                data: reactEditor.attachments.readBinary(
                  options.provider,
                  reference.uri,
                  reference.mimeType,
                  {
                    signal: abort.signal,
                  },
                ),
              }
            : undefined;
        },
      });

      /**
       * Uploads and prepares one file batch in source order.
       *
       * @param reactPanel - Panel receiving the prepared files.
       * @param files - Browser files to store and dispatch.
       * @param destination - Captured insertion destination.
       * @param source - Browser interaction that supplied the files.
       * @param point - Viewport position for status feedback.
       * @returns Starts asynchronous preparation and commits successful files when safe.
       */
      const upload = (
        reactPanel: ReactPanelApi,
        files: readonly File[],
        destination: FileDestination,
        source: "clipboard" | "drop" | "picker",
        point: { readonly x: number; readonly y: number },
      ): void => {
        const mode = reactPanel.getSurfaceType();
        ingestFileBatch<File, PreparedFile>({
          panel: reactPanel,
          destination,
          items: files,
          point,
          signal: abort.signal,
          statuses,
          nextId: () => String(++nextUploadId),
          name: (file) => file.name || "file",
          retry: (file, nextDestination) =>
            upload(reactPanel, [file], nextDestination, source, point),
          onError: options.onError,
          failureMessage: "Unable to upload file",
          staleMessage:
            "The destination changed while the file was uploading. Select a location and retry.",
          commit: (items) => insertPrepared(reactPanel, items, destination),
          prepare: async (file, id) => {
            const reference: FileReference = {
              uri: "",
              name: file.name || "file",
              mimeType: file.type || "application/octet-stream",
              size: file.size,
            };
            const handler = reactEditor.clipboard.selectFileHandler({ file, reference });
            if (!handler) {
              throw new TypeError(`No attachment handler accepted ${reference.name}`);
            }
            abort.signal.throwIfAborted();
            const uri = validateBinaryUri(
              await handler.provider.write(file, {
                documentId: reactEditor.getDocument().id,
                name: reference.name,
                mimeType: reference.mimeType,
                source,
                mode,
                destination: destination.kind,
                signal: abort.signal,
                reportProgress: (progress) =>
                  statuses.update(id, { progress: Math.max(0, Math.min(1, progress)) }),
              }),
            );
            abort.signal.throwIfAborted();
            if (reactEditor.clipboard.getFileHandler(handler.id) !== handler) {
              throw new Error("Attachment handler was removed during upload");
            }
            const prepared = await handler.prepare(
              { file, reference: { ...reference, uri } },
              { destination: destination.kind, mode, signal: abort.signal },
            );
            if (reactEditor.clipboard.getFileHandler(handler.id) !== handler) {
              throw new Error("Attachment handler was removed during preparation");
            }
            return prepared;
          },
        });
      };

      /**
       * Resolves and prepares already-addressable local file references.
       *
       * @param reactPanel - Panel receiving the prepared references.
       * @param uris - Absolute paths or file URIs in source order.
       * @param destination - Captured insertion destination.
       * @param point - Viewport position for status feedback.
       * @returns Starts asynchronous preparation and commits successful files when safe.
       */
      const insertReferences = (
        reactPanel: ReactPanelApi,
        uris: readonly string[],
        destination: FileDestination,
        point: { readonly x: number; readonly y: number },
      ): void => {
        const mode = reactPanel.getSurfaceType();
        ingestFileBatch<string, PreparedFile>({
          panel: reactPanel,
          destination,
          items: uris,
          point,
          signal: abort.signal,
          statuses,
          nextId: () => String(++nextUploadId),
          name: (uri) => createFileReferenceFromUri(uri).name,
          retry: (uri, nextDestination) =>
            insertReferences(reactPanel, [uri], nextDestination, point),
          onError: options.onError,
          failureMessage: "Unable to load file",
          staleMessage:
            "The destination changed while the file was uploading. Select a location and retry.",
          commit: (items) => insertPrepared(reactPanel, items, destination),
          prepare: async (uri) => {
            const reference = createFileReferenceFromUri(uri);
            const handler = reactEditor.clipboard.selectFileHandler({ reference });
            if (!handler) {
              throw new TypeError(`No attachment handler accepted ${reference.name}`);
            }
            const prepared = await handler.prepare(
              { reference },
              { destination: destination.kind, mode, signal: abort.signal },
            );
            if (reactEditor.clipboard.getFileHandler(handler.id) !== handler) {
              throw new Error("Attachment handler was removed during preparation");
            }
            return prepared;
          },
        });
      };

      /**
       * Replaces an empty default block for one file, otherwise keeps inline placement.
       * @param destination - Initially resolved placement.
       * @param fileCount - Number of incoming files.
       * @param blockId - Block under the event.
       * @returns Final placement.
       */
      const replaceEmptyDefault = (
        destination: FileDestination,
        fileCount: number,
        blockId?: string,
      ): FileDestination => {
        if (destination.kind !== "inline" || fileCount !== 1 || !blockId) {
          return destination;
        }
        const block = reactEditor.blocks.getBlockNode(blockId);
        const defaultType = reactEditor.defaultWritingBlockFactory.createEmptyBlock().type;
        return block?.type === defaultType &&
          !reactEditor.blocks.hasChildren(block.id) &&
          reactEditor.defaultWritingBlockFactory.isEmptyBlock(block)
          ? { kind: "block", afterId: blockId, replaceId: blockId, content: block.content }
          : destination;
      };

      reactEditor.events.register(
        { id: "file.dragover", type: "dragover", capture: true },
        ({ raw, root }) => {
          const accepts = raw.dataTransfer?.types.includes("Files") === true;
          if (accepts && raw.dataTransfer) {
            raw.dataTransfer.dropEffect = "copy";
          }
          return accepts && root.contains(raw.target as Node);
        },
      );
      reactEditor.events.register(
        { id: "file.drop", type: "drop", capture: true },
        ({ raw, mode, contentElement, blockId, root, reactPanel }) => {
          const files = getTransferredFiles(raw.dataTransfer);
          const uri = findLocalFileUri(raw.dataTransfer?.getData("text/uri-list") ?? "");
          if (!files.length && !uri) {
            return false;
          }
          const destination = replaceEmptyDefault(
            fileDestinationAtPoint(
              reactPanel,
              mode,
              contentElement,
              blockId,
              raw.clientX,
              raw.clientY,
              root,
            ),
            files.length || Number(Boolean(uri)),
            blockId,
          );
          const point = { x: raw.clientX, y: raw.clientY };
          if (files.length) {
            upload(reactPanel, files, destination, "drop", point);
          } else if (uri) {
            insertReferences(reactPanel, [uri], destination, point);
          }
          return true;
        },
      );
      reactEditor.events.register(
        { id: "file.paste", type: "paste", capture: true },
        ({ raw, mode, contentElement, blockId, root, reactPanel }) => {
          const files = getTransferredFiles(raw.clipboardData);
          const uri =
            findLocalFileUri(raw.clipboardData?.getData("text/uri-list") ?? "") ??
            findLocalFileUri(raw.clipboardData?.getData("text/plain") ?? "");
          const redacted =
            !files.length && !uri && raw.clipboardData?.types.includes("text/uri-list") === true;
          if (!files.length && !uri && !redacted) {
            return false;
          }
          const bounds = contentElement?.getBoundingClientRect() ?? root.getBoundingClientRect();
          const initial = contentElement
            ? inlineDestination(reactPanel, blockId)
            : fileDestinationAtPoint(
                reactPanel,
                mode,
                null,
                blockId,
                bounds.left + bounds.width / 2,
                bounds.top + bounds.height / 2,
                root,
              );
          if (!initial) {
            return false;
          }
          const destination = replaceEmptyDefault(
            initial,
            files.length || Number(Boolean(uri || redacted)),
            blockId,
          );
          const point = { x: bounds.left + bounds.width / 2, y: bounds.bottom };
          if (files.length) {
            upload(reactPanel, files, destination, "clipboard", point);
          } else if (uri) {
            insertReferences(reactPanel, [uri], destination, point);
          } else {
            const clipboard = root.ownerDocument.defaultView?.navigator.clipboard;
            void clipboard
              ?.readText()
              .then((text) => {
                const local = findLocalFileUri(text);
                if (!local) {
                  throw new TypeError("Clipboard does not contain a readable local file path");
                }
                insertReferences(reactPanel, [local], destination, point);
              })
              .catch((error: unknown) => options.onError?.(error));
            if (!clipboard) {
              options.onError?.(
                new TypeError("This browser does not provide clipboard read access"),
              );
            }
          }
          return true;
        },
      );
      reactEditor.slashCommands.register({
        id: "file.insert",
        title: "File",
        group: "Insert",
        keywords: ["attachment", "upload"],
        execute: ({ blockId, reactPanel }) => {
          const input = document.createElement("input");
          input.className = FILE_INPUT_CLASS;
          input.type = "file";
          input.multiple = true;
          input.addEventListener(
            "change",
            () => {
              const files = [...(input.files ?? [])];
              const block = reactPanel.blocks.getBlockNode(blockId);
              const destination: FileDestination =
                files.length === 1 &&
                block &&
                !reactPanel.blocks.hasChildren(block.id) &&
                reactEditor.defaultWritingBlockFactory.isEmptyBlock(block)
                  ? { kind: "block", afterId: blockId, replaceId: blockId, content: block.content }
                  : { kind: "block", afterId: blockId };
              const blockElement = reactPanel
                .getRoot()
                ?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
              const bounds = blockElement?.getBoundingClientRect();
              upload(reactPanel, files, destination, "picker", {
                x: bounds?.left ?? innerWidth / 2,
                y: bounds?.bottom ?? innerHeight / 2,
              });
            },
            { once: true },
          );
          input.click();
        },
      });
      return () => abort.abort();
    },
  };
}
