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
import { escapeHtml } from "./utils/escape-html";
import { useBlock, useBlockSelectionAnchor } from "../../hooks";
import type { ReactEditorExtension } from "../../managers";
import type { ReactEditorApi } from "../../editor/types";
import { singleSelectedClipboardProps } from "../../managers/clipboard/clipboard-content";
import type { ElementRenderProps } from "../../managers/elements/types";
import type { BlockRendererProps } from "../../managers/blocks/renderer-types";
import type { BinaryProvider, FileReference } from "../../attachments";
import { FileView, RegisteredFileView } from "./view/file-view";
import { configureFileProvider } from "./view/file-configuration";
import { serializeFileMacro } from "./macro/file-macro";
import { FileIngestion } from "./ingestion/file-ingestion";
import { FileInputEvents } from "./ingestion/file-input-events";
import { FileUploadStatusOverlay, FileUploadStatusStore } from "./ingestion/file-upload-status";

/** Persisted native type used by generic file blocks and elements. */
export const FILE_BLOCK_TYPE = "file";
export const FILE_ELEMENT_TYPE = "file";
const FILE_BLOCK_CLASS = "rivto-file-block";

/** Storage and asynchronous error notification for generic files. */
export interface FileExtensionOptions {
  readonly provider: BinaryProvider;
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
 * @param props.blockId - Persisted file block ID to render.
 * @returns Display-only file block or validation error.
 */
export function FileBlock({ blockId }: BlockRendererProps) {
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
 * Registers generic file preparation and selects it as the fallback.
 *
 * @param clipboard - File handler registration and default selection.
 * @param provider - Provider used for generic file storage.
 * @returns Installs the extension-owned handler.
 * @throws If registration or default selection fails.
 */
function registerFileHandler(
  clipboard: Pick<ReactEditorApi["clipboard"], "registerFileHandler" | "setDefaultFileHandler">,
  provider: BinaryProvider,
): void {
  clipboard.registerFileHandler({
    id: "file",
    provider,
    prepare: ({ reference }, { destination }) => {
      if (destination === "inline") {
        return { kind: "inline", content: serializeFileMacro(reference) };
      }
      if (destination === "block") {
        return { kind: "block", type: FILE_BLOCK_TYPE, props: { ...reference } };
      }
      return {
        kind: "element",
        type: FILE_ELEMENT_TYPE,
        props: { ...reference, rotation: 0 },
        width: 240,
        height: 64,
      };
    },
  });
  clipboard.setDefaultFileHandler("file");
}

/**
 * Registers portable text and HTML formatting for file blocks.
 *
 * @param formats - Clipboard formatter registration.
 * @returns Installs the extension-owned formatter.
 * @throws If the formatter registration fails.
 */
function registerFileFormatter(
  formats: Pick<ReactEditorApi["clipboardFormats"], "registerFormatter">,
): void {
  formats.registerFormatter({
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
}

/**
 * Registers binary copy for one selected generic file.
 *
 * @param clipboard - Clipboard postprocessor registration.
 * @param attachments - Binary read operations for the selected file.
 * @param provider - Provider used for generic file references.
 * @param signal - Signal aborted when the extension is destroyed.
 * @returns Installs the extension-owned postprocessor.
 * @throws If the postprocessor registration fails.
 */
function registerFileClipboardCopy(
  clipboard: Pick<ReactEditorApi["clipboard"], "registerPostprocessor">,
  attachments: Pick<ReactEditorApi["attachments"], "readBinary">,
  provider: BinaryProvider,
  signal: AbortSignal,
): void {
  clipboard.registerPostprocessor({
    id: "file",
    process: ({ bundle }) => {
      const props = singleSelectedClipboardProps(bundle, FILE_BLOCK_TYPE, FILE_ELEMENT_TYPE);
      const reference = props ? fileReference(props) : undefined;
      return reference
        ? {
            name: reference.name,
            mimeType: reference.mimeType,
            data: attachments.readBinary(provider, reference.uri, reference.mimeType, {
              signal,
            }),
          }
        : undefined;
    },
  });
}

/**
 * Installs generic file paste/drop, fallback views, and the native picker.
 * @param options - Storage provider and optional asynchronous error notification.
 * @returns Lifecycle-owned React editor extension.
 */
export function fileExtension(options: FileExtensionOptions): ReactEditorExtension {
  return {
    id: "file",
    setup: (reactEditor) => {
      const disposeFileViews = configureFileProvider(reactEditor, options.provider);
      const statuses = new FileUploadStatusStore();
      const ingestion = new FileIngestion(statuses, options.onError);
      const dispose = reactEditor.extensions.registerCleanup(() => {
        ingestion.destroy();
        disposeFileViews();
      });
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
      registerFileHandler(reactEditor.clipboard, options.provider);
      registerFileFormatter(reactEditor.clipboardFormats);
      registerFileClipboardCopy(
        reactEditor.clipboard,
        reactEditor.attachments,
        options.provider,
        ingestion.signal,
      );

      new FileInputEvents(reactEditor, ingestion, options.onError).register();
      return dispose;
    },
  };
}
