/**
 * Owns Markdown discovery and safe local persistence for the documentation app.
 * The plugin treats Markdown files below `docs/` as canonical content, excludes
 * generated/dependency directories, and prevents path traversal or stale writes.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const DOCUMENTS_ENDPOINT = "/__rivto-documents";
const IMAGES_ENDPOINT = "/__rivto-images";
const LLMS_ENDPOINT = "/llms.txt";
const MARKDOWN_ENDPOINT = "/markdown";
const EXCLUDED_DIRECTORIES = new Set(["dist", "node_modules"]);
const MAX_REQUEST_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const VIRTUAL_MODULE_ID = "virtual:rivto-documents";
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;
const IMAGE_TYPES = {
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
} as const;

export interface MarkdownDocument {
  path: string;
  content: string;
  modifiedAt: number;
}

export interface DocumentationImageAsset {
  path: string;
  content: Buffer;
  contentType: keyof typeof IMAGE_TYPES;
}

export interface CreatedDocumentationImage {
  path: string;
  markdownSource: string;
}

interface SaveDocumentRequest {
  content: string;
  expectedModifiedAt: number;
}

interface CreateDocumentRequest {
  path: string;
  content: string;
}

interface DeleteDocumentRequest {
  expectedModifiedAt: number;
}

/**
 * Recursively reads canonical Markdown documents in stable path order.
 *
 * @param rootDirectory Absolute documentation directory.
 * @param currentDirectory Directory currently being traversed.
 * @returns Discovered Markdown documents and their current modification tokens.
 */
export async function readMarkdownDocuments(
  rootDirectory: string,
  currentDirectory = rootDirectory,
): Promise<MarkdownDocument[]> {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const documents: MarkdownDocument[] = [];

  for (const entry of entries) {
    const absolutePath = resolve(currentDirectory, entry.name);
    if (entry.isDirectory() && !EXCLUDED_DIRECTORIES.has(entry.name)) {
      documents.push(...await readMarkdownDocuments(rootDirectory, absolutePath));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      const metadata = await stat(absolutePath);
      documents.push({
        path: relative(rootDirectory, absolutePath).split(sep).join("/"),
        content: await readFile(absolutePath, "utf8"),
        modifiedAt: metadata.mtimeMs,
      });
    }
  }

  return documents.sort(compareDocumentPaths);
}

/**
 * Recursively reads supported documentation image assets for static mirroring.
 *
 * @param rootDirectory Absolute documentation directory.
 * @param currentDirectory Directory currently being traversed.
 * @returns Supported images with root-relative paths and MIME types.
 */
export async function readDocumentationImages(
  rootDirectory: string,
  currentDirectory = rootDirectory,
): Promise<DocumentationImageAsset[]> {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const images: DocumentationImageAsset[] = [];
  for (const entry of entries) {
    const absolutePath = resolve(currentDirectory, entry.name);
    if (entry.isDirectory() && !EXCLUDED_DIRECTORIES.has(entry.name)) {
      images.push(...await readDocumentationImages(rootDirectory, absolutePath));
    } else if (entry.isFile()) {
      const contentType = getImageContentType(entry.name);
      if (contentType) {
        images.push({
          path: relative(rootDirectory, absolutePath).split(sep).join("/"),
          content: await readFile(absolutePath),
          contentType,
        });
      }
    }
  }
  return images;
}

/**
 * Resolves a user-provided Markdown path without permitting directory escape.
 *
 * @param rootDirectory Absolute documentation directory.
 * @param documentPath URL-decoded path relative to the documentation directory.
 * @returns Safe absolute path for an existing Markdown document.
 */
export function resolveMarkdownPath(rootDirectory: string, documentPath: string): string {
  const absoluteRoot = resolve(rootDirectory);
  const absolutePath = resolve(absoluteRoot, documentPath);
  const isInsideRoot = absolutePath.startsWith(`${absoluteRoot}${sep}`);

  if (!isInsideRoot || extname(absolutePath).toLowerCase() !== ".md") {
    throw new Error("Only Markdown files inside the documentation directory are allowed.");
  }

  return absolutePath;
}

/**
 * Creates the Vite plugin that bundles Markdown and serves the local file API.
 *
 * @returns Vite plugin for Markdown discovery and persistence.
 */
export function markdownFilesPlugin(): Plugin {
  const rootDirectory = resolve(import.meta.dirname, "..");

  return {
    name: "rivto-markdown-files",
    resolveId(id) {
      return id === VIRTUAL_MODULE_ID ? RESOLVED_VIRTUAL_MODULE_ID : undefined;
    },
    async load(id) {
      if (id !== RESOLVED_VIRTUAL_MODULE_ID) {
        return undefined;
      }

      const documents = await readMarkdownDocuments(rootDirectory);
      for (const document of documents) {
        this.addWatchFile(resolve(rootDirectory, document.path));
      }
      return `export const bundledDocuments = ${JSON.stringify(documents)};`;
    },
    configureServer(server) {
      server.middlewares.use(IMAGES_ENDPOINT, async function handleImageUpload(request, response) {
        try {
          if (request.method !== "POST") {
            sendJson(response, 405, { message: "Only POST is supported." });
            return;
          }
          const encodedPagePath = request.headers["x-rivto-page-path"];
          const contentType = request.headers["content-type"]?.split(";")[0];
          if (typeof encodedPagePath !== "string" || typeof contentType !== "string") {
            throw new Error("Image upload metadata is missing.");
          }
          const image = await createDocumentationImage(
            rootDirectory,
            decodeURIComponent(encodedPagePath),
            contentType,
            await readBinaryRequest(request, MAX_IMAGE_BYTES),
          );
          sendJson(response, 201, image);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to save pasted image.";
          sendJson(response, 400, { message });
        }
      });
      server.middlewares.use(LLMS_ENDPOINT, async function handleLlmsRequest(request, response) {
        if (request.method !== "GET") {
          sendJson(response, 405, { message: "Only GET is supported." });
          return;
        }
        sendText(response, 200, generateLlmsText(await readMarkdownDocuments(rootDirectory)));
      });
      server.middlewares.use(MARKDOWN_ENDPOINT, async function handleMarkdownMirrorRequest(
        request,
        response,
      ) {
        try {
          if (request.method !== "GET") {
            sendJson(response, 405, { message: "Only GET is supported." });
            return;
          }
          const requestPath = new URL(request.url ?? "/", "http://localhost").pathname.slice(1);
          const decodedPath = decodeURIComponent(requestPath);
          if (extname(decodedPath).toLowerCase() === ".md") {
            const absolutePath = resolveMarkdownPath(rootDirectory, decodedPath);
            sendText(response, 200, await readFile(absolutePath, "utf8"));
          } else {
            const contentType = getImageContentType(decodedPath);
            if (!contentType) {
              throw new Error("Unsupported documentation asset type.");
            }
            const absolutePath = resolveImagePath(rootDirectory, decodedPath);
            sendBinary(response, 200, await readFile(absolutePath), contentType);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Markdown page not found.";
          sendJson(response, 404, { message });
        }
      });
      server.middlewares.use(DOCUMENTS_ENDPOINT, async function handleDocumentsRequest(
        request,
        response,
      ) {
        await routeDocumentsRequest(rootDirectory, request, response);
      });
    },
    async generateBundle() {
      const documents = await readMarkdownDocuments(rootDirectory);
      this.emitFile({ type: "asset", fileName: "llms.txt", source: generateLlmsText(documents) });
      for (const document of documents) {
        this.emitFile({
          type: "asset",
          fileName: `markdown/${document.path}`,
          source: document.content,
        });
      }
      const images = await readDocumentationImages(rootDirectory);
      for (const image of images) {
        this.emitFile({
          type: "asset",
          fileName: `markdown/${image.path}`,
          source: image.content,
        });
      }
    },
  };
}

/**
 * Persists a validated clipboard image under its owning page directory.
 *
 * @param rootDirectory Absolute documentation directory.
 * @param pagePath Owning numeric-prefixed Markdown page.
 * @param contentType Browser-provided MIME type.
 * @param content Raw clipboard image bytes.
 * @returns Root-relative asset path and portable page-relative Markdown source.
 */
export async function createDocumentationImage(
  rootDirectory: string,
  pagePath: string,
  contentType: string,
  content: Buffer,
): Promise<CreatedDocumentationImage> {
  const extension = IMAGE_TYPES[contentType as keyof typeof IMAGE_TYPES];
  if (!extension || !hasValidImageSignature(contentType, content)) {
    throw new Error("Paste a valid PNG, JPEG, GIF, WebP, or AVIF image.");
  }
  if (content.length === 0 || content.length > MAX_IMAGE_BYTES) {
    throw new Error("Pasted images must be no larger than 10 MB.");
  }

  const absolutePagePath = resolveMarkdownPath(rootDirectory, pagePath);
  await stat(absolutePagePath);
  const pageFolderName = basename(absolutePagePath, extname(absolutePagePath));
  const assetDirectory = resolve(dirname(absolutePagePath), pageFolderName, "assets");
  const realRoot = await realpath(rootDirectory);
  await assertExistingAncestorsStayInsideRoot(rootDirectory, assetDirectory, realRoot);
  await mkdir(assetDirectory, { recursive: true });
  const realAssetDirectory = await realpath(assetDirectory);
  if (realAssetDirectory !== realRoot && !realAssetDirectory.startsWith(`${realRoot}${sep}`)) {
    throw new Error("Image path resolves outside the documentation directory.");
  }

  const filename = `pasted-${Date.now()}-${randomUUID().slice(0, 8)}${extension}`;
  const absoluteAssetPath = resolve(assetDirectory, filename);
  await writeFile(absoluteAssetPath, content, { flag: "wx" });
  const assetPath = relative(rootDirectory, absoluteAssetPath).split(sep).join("/");
  const pageDirectory = dirname(pagePath);
  const markdownSource = relative(pageDirectory, assetPath).split(sep).join("/");
  return { path: assetPath, markdownSource };
}

/**
 * Resolves a supported image path without permitting directory escape.
 *
 * @param rootDirectory Absolute documentation directory.
 * @param imagePath Root-relative image path.
 * @returns Safe absolute image path.
 */
function resolveImagePath(rootDirectory: string, imagePath: string): string {
  const absoluteRoot = resolve(rootDirectory);
  const absolutePath = resolve(absoluteRoot, imagePath);
  const isInsideRoot = absolutePath.startsWith(`${absoluteRoot}${sep}`);
  if (!isInsideRoot || !getImageContentType(imagePath)) {
    throw new Error("Only supported images inside the documentation directory are allowed.");
  }
  return absolutePath;
}

/**
 * Maps a supported filename extension to its MIME type.
 *
 * @param path Image filename or relative path.
 * @returns Supported MIME type or undefined.
 */
function getImageContentType(path: string): keyof typeof IMAGE_TYPES | undefined {
  const extension = extname(path).toLowerCase();
  return (Object.entries(IMAGE_TYPES) as Array<[keyof typeof IMAGE_TYPES, string]>)
    .find(function matchesExtension(entry) { return entry[1] === extension; })?.[0];
}

/**
 * Rejects content whose signature does not match its declared image MIME type.
 *
 * @param contentType Declared supported MIME type.
 * @param content Raw image bytes.
 * @returns Whether the leading bytes identify the declared format.
 */
function hasValidImageSignature(contentType: string, content: Buffer): boolean {
  let valid = false;
  if (contentType === "image/png") {
    valid = content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  } else if (contentType === "image/jpeg") {
    valid = content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  } else if (contentType === "image/gif") {
    valid = ["GIF87a", "GIF89a"].includes(content.subarray(0, 6).toString("ascii"));
  } else if (contentType === "image/webp") {
    valid = content.subarray(0, 4).toString("ascii") === "RIFF" && content.subarray(8, 12).toString("ascii") === "WEBP";
  } else if (contentType === "image/avif") {
    valid = content.subarray(4, 8).toString("ascii") === "ftyp" && ["avif", "avis"].includes(content.subarray(8, 12).toString("ascii"));
  }
  return valid;
}

/**
 * Reads a bounded binary request body.
 *
 * @param request Incoming HTTP request.
 * @param maximumBytes Maximum accepted payload size.
 * @returns Concatenated request bytes.
 */
async function readBinaryRequest(request: IncomingMessage, maximumBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;
    if (receivedBytes > maximumBytes) {
      throw new Error("Pasted images must be no larger than 10 MB.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Creates a specification-shaped LLM index from the canonical documentation.
 * Product pages are promoted into package/application sections while older
 * planning notes remain optional context.
 *
 * @param documents Canonical Markdown pages in navigation order.
 * @returns Markdown-formatted `/llms.txt` content.
 */
export function generateLlmsText(documents: readonly MarkdownDocument[]): string {
  const packagePages = documents.filter(function isPackagePage(document) {
    return document.path === "10-packages.md" || document.path.startsWith("10-packages/");
  });
  const applicationPages = documents.filter(function isApplicationPage(document) {
    return document.path === "20-apps.md" || document.path.startsWith("20-apps/");
  });
  const primaryPages = documents.filter(function isPrimaryPage(document) {
    return document.path === "00-rivto.md" || document.path === "30-documentation-architecture.md";
  });
  const promotedPaths = new Set(
    [...packagePages, ...applicationPages, ...primaryPages].map(function readPath(document) {
      return document.path;
    }),
  );
  const optionalPages = documents.filter(function isOptionalPage(document) {
    return !promotedPaths.has(document.path);
  });

  const sections = [
    "# Rivto",
    "",
    "> Rivto is an extensible editor workspace with a framework-neutral collaborative core, a React presentation package, and browser applications built on those packages.",
    "",
    "Use the package pages for ownership and public API boundaries. Use application pages for runnable integration behavior.",
    renderLlmsSection("Packages", packagePages),
    renderLlmsSection("Applications", applicationPages),
    renderLlmsSection("Documentation", primaryPages),
    renderLlmsSection("Optional", optionalPages),
  ];
  return `${sections.filter(Boolean).join("\n\n")}\n`;
}

/**
 * Orders documents by each path segment's numeric prefix.
 *
 * @param left First document to compare.
 * @param right Second document to compare.
 * @returns Negative, zero, or positive sort result.
 */
function compareDocumentPaths(left: MarkdownDocument, right: MarkdownDocument): number {
  const leftSegments = left.path.split("/");
  const rightSegments = right.path.split("/");
  const segmentCount = Math.max(leftSegments.length, rightSegments.length);
  let result = 0;
  for (let index = 0; index < segmentCount && result === 0; index += 1) {
    const leftSegment = leftSegments[index] ?? "";
    const rightSegment = rightSegments[index] ?? "";
    const leftOrder = Number.parseInt(leftSegment.match(/^(\d+)-/)?.[1] ?? "", 10);
    const rightOrder = Number.parseInt(rightSegment.match(/^(\d+)-/)?.[1] ?? "", 10);
    const normalizedLeftOrder = Number.isFinite(leftOrder) ? leftOrder : Number.POSITIVE_INFINITY;
    const normalizedRightOrder = Number.isFinite(rightOrder) ? rightOrder : Number.POSITIVE_INFINITY;
    result = normalizedLeftOrder - normalizedRightOrder || leftSegment.localeCompare(rightSegment);
  }
  return result;
}

/**
 * Renders one llms.txt file-list section.
 *
 * @param title Required H2 section title.
 * @param documents Markdown pages assigned to the section.
 * @returns Section Markdown, or an empty string when no pages exist.
 */
function renderLlmsSection(title: string, documents: readonly MarkdownDocument[]): string {
  if (documents.length === 0) {
    return "";
  }
  const links = documents.map(function renderDocumentLink(document) {
    const encodedPath = document.path.split("/").map(encodeURIComponent).join("/");
    return `- [${getMarkdownTitle(document)}](/markdown/${encodedPath}): ${getMarkdownDescription(document)}`;
  });
  return `## ${title}\n\n${links.join("\n")}`;
}

/**
 * Reads the first H1 or derives a title from the Markdown filename.
 *
 * @param document Canonical Markdown document.
 * @returns Concise human-readable page title.
 */
function getMarkdownTitle(document: MarkdownDocument): string {
  const heading = document.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const fileName = document.path.split("/").at(-1)?.replace(/\.md$/i, "") ?? document.path;
  return heading || fileName.replace(/^\d+-/, "").replaceAll(/[-_]/g, " ");
}

/**
 * Extracts a short prose description for an LLM index entry.
 *
 * @param document Canonical Markdown document.
 * @returns First suitable prose line or a stable fallback description.
 */
function getMarkdownDescription(document: MarkdownDocument): string {
  const description = document.content
    .split("\n")
    .map(function trimLine(line) { return line.trim(); })
    .find(function isDescriptionLine(line) {
      return line.length > 0 && !/^(#|>|-|\*|```)/.test(line);
    });
  return description ?? `Markdown documentation from ${document.path}.`;
}

/**
 * Routes list, creation, and save requests for the local documentation API.
 *
 * @param rootDirectory Absolute documentation directory.
 * @param request Incoming Vite development request.
 * @param response Outgoing Vite development response.
 * @returns Promise completed after the response is sent.
 */
async function routeDocumentsRequest(
  rootDirectory: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    if (request.method === "GET" && (request.url === "/" || request.url === "")) {
      sendJson(response, 200, await readMarkdownDocuments(rootDirectory));
    } else if (request.method === "POST" && (request.url === "/" || request.url === "")) {
      const payload = await readCreateRequest(request);
      const createdDocument = await createMarkdownDocument(rootDirectory, payload);
      sendJson(response, 201, createdDocument);
    } else if (request.method === "PUT" && request.url?.startsWith("/")) {
      const documentPath = decodeURIComponent(request.url.slice(1));
      const payload = await readSaveRequest(request);
      const savedDocument = await saveMarkdownDocument(rootDirectory, documentPath, payload);
      sendJson(response, 200, savedDocument);
    } else if (request.method === "DELETE" && request.url?.startsWith("/")) {
      const documentPath = decodeURIComponent(request.url.slice(1));
      const payload = await readDeleteRequest(request);
      await deleteMarkdownDocument(rootDirectory, documentPath, payload.expectedModifiedAt);
      response.statusCode = 204;
      response.end();
    } else {
      sendJson(response, 404, { message: "Document endpoint not found." });
    }
  } catch (error) {
    const statusCode = error instanceof StaleDocumentError || error instanceof DuplicateDocumentError ? 409 : 400;
    const message = error instanceof Error ? error.message : "Unable to process document request.";
    sendJson(response, statusCode, { message });
  }
}

/**
 * Deletes one Markdown page after checking its current modification token.
 * Same-named child directories are deliberately retained so nested pages and
 * pasted images are never removed by a page-only action.
 *
 * @param rootDirectory Absolute documentation directory.
 * @param documentPath Relative Markdown page path.
 * @param expectedModifiedAt Modification token loaded by the browser.
 * @returns Promise completed after the file is removed.
 */
export async function deleteMarkdownDocument(
  rootDirectory: string,
  documentPath: string,
  expectedModifiedAt: number,
): Promise<void> {
  const absolutePath = resolveMarkdownPath(rootDirectory, documentPath);
  const realRoot = await realpath(rootDirectory);
  const realParent = await realpath(dirname(absolutePath));
  if (realParent !== realRoot && !realParent.startsWith(`${realRoot}${sep}`)) {
    throw new Error("Document path resolves outside the documentation directory.");
  }
  const metadata = await stat(absolutePath);
  if (metadata.mtimeMs !== expectedModifiedAt) {
    throw new StaleDocumentError();
  }
  await unlink(absolutePath);
}

/**
 * Creates a new numerically prefixed Markdown file without overwriting content.
 *
 * @param rootDirectory Absolute documentation directory.
 * @param payload Validated relative path and initial Markdown.
 * @returns Newly created document with its modification token.
 */
export async function createMarkdownDocument(
  rootDirectory: string,
  payload: CreateDocumentRequest,
): Promise<MarkdownDocument> {
  if (!isOrderedMarkdownPath(payload.path)) {
    throw new Error("New page paths must use numeric prefixes such as 10-page-name.md.");
  }
  const absolutePath = resolveMarkdownPath(rootDirectory, payload.path);
  const absoluteParent = dirname(absolutePath);
  const realRoot = await realpath(rootDirectory);
  await assertExistingAncestorsStayInsideRoot(rootDirectory, absoluteParent, realRoot);
  await mkdir(absoluteParent, { recursive: true });
  const realParent = await realpath(absoluteParent);
  if (realParent !== realRoot && !realParent.startsWith(`${realRoot}${sep}`)) {
    throw new Error("Document path resolves outside the documentation directory.");
  }

  try {
    await writeFile(absolutePath, payload.content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new DuplicateDocumentError();
    }
    throw error;
  }
  const metadata = await stat(absolutePath);
  return { path: payload.path, content: payload.content, modifiedAt: metadata.mtimeMs };
}

/**
 * Ensures every existing parent segment resolves inside the docs root.
 *
 * @param rootDirectory Lexical documentation root.
 * @param parentDirectory Target parent that may not exist yet.
 * @param realRoot Resolved documentation root.
 * @returns Promise completed after all existing ancestors are checked.
 */
async function assertExistingAncestorsStayInsideRoot(
  rootDirectory: string,
  parentDirectory: string,
  realRoot: string,
): Promise<void> {
  const segments = relative(rootDirectory, parentDirectory).split(sep).filter(Boolean);
  for (let index = 0; index < segments.length; index += 1) {
    const candidate = resolve(rootDirectory, ...segments.slice(0, index + 1));
    try {
      const resolvedCandidate = await realpath(candidate);
      if (resolvedCandidate !== realRoot && !resolvedCandidate.startsWith(`${realRoot}${sep}`)) {
        throw new Error("Document path resolves outside the documentation directory.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        break;
      }
      throw error;
    }
  }
}

/**
 * Validates numeric prefixes for every folder and the Markdown filename.
 *
 * @param documentPath Slash-separated relative Markdown path.
 * @returns Whether every segment follows the ordered page convention.
 */
function isOrderedMarkdownPath(documentPath: string): boolean {
  const segments = documentPath.split("/");
  return segments.every(function isOrderedSegment(segment, index) {
    const value = index === segments.length - 1 ? segment.replace(/\.md$/i, "") : segment;
    return /^\d+-[\p{Letter}\p{Number}]+(?:-[\p{Letter}\p{Number}]+)*$/u.test(value);
  }) && documentPath.toLowerCase().endsWith(".md");
}

/**
 * Saves Markdown atomically after checking that the source has not changed.
 *
 * @param rootDirectory Absolute documentation directory.
 * @param documentPath Relative Markdown path selected by the app.
 * @param payload Content and modification token supplied by the browser.
 * @returns Updated document record with its new modification token.
 */
async function saveMarkdownDocument(
  rootDirectory: string,
  documentPath: string,
  payload: SaveDocumentRequest,
): Promise<MarkdownDocument> {
  const absolutePath = resolveMarkdownPath(rootDirectory, documentPath);
  const realRoot = await realpath(rootDirectory);
  const realParent = await realpath(dirname(absolutePath));
  if (realParent !== realRoot && !realParent.startsWith(`${realRoot}${sep}`)) {
    throw new Error("Document path resolves outside the documentation directory.");
  }

  const currentMetadata = await stat(absolutePath);
  if (currentMetadata.mtimeMs !== payload.expectedModifiedAt) {
    throw new StaleDocumentError();
  }

  const temporaryPath = `${absolutePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, payload.content, "utf8");
  await rename(temporaryPath, absolutePath);
  const savedMetadata = await stat(absolutePath);
  return {
    path: documentPath,
    content: payload.content,
    modifiedAt: savedMetadata.mtimeMs,
  };
}

/**
 * Reads and validates a bounded JSON save request.
 *
 * @param request Incoming HTTP request body.
 * @returns Validated save payload.
 */
async function readSaveRequest(request: IncomingMessage): Promise<SaveDocumentRequest> {
  const payload = await readJsonRequest(request);
  if (!isSaveDocumentRequest(payload)) {
    throw new Error("Invalid document save request.");
  }
  return payload;
}

/**
 * Reads and validates a bounded page-creation request.
 *
 * @param request Incoming HTTP request body.
 * @returns Validated creation payload.
 */
async function readCreateRequest(request: IncomingMessage): Promise<CreateDocumentRequest> {
  const payload = await readJsonRequest(request);
  if (!isCreateDocumentRequest(payload)) {
    throw new Error("Invalid document creation request.");
  }
  return payload;
}

/**
 * Reads and validates a bounded page-deletion request.
 *
 * @param request Incoming HTTP request body.
 * @returns Validated deletion modification token.
 */
async function readDeleteRequest(request: IncomingMessage): Promise<DeleteDocumentRequest> {
  const payload = await readJsonRequest(request);
  if (!isDeleteDocumentRequest(payload)) {
    throw new Error("Invalid document deletion request.");
  }
  return payload;
}

/**
 * Reads a bounded JSON request body shared by document mutations.
 *
 * @param request Incoming HTTP request body.
 * @returns Decoded unknown JSON value.
 */
async function readJsonRequest(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;
    if (receivedBytes > MAX_REQUEST_BYTES) {
      throw new Error("Document is too large to save.");
    }
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

/**
 * Validates the shape of a browser save payload.
 *
 * @param value Unknown decoded JSON value.
 * @returns Whether the value contains Markdown and a modification token.
 */
function isSaveDocumentRequest(value: unknown): value is SaveDocumentRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.content === "string" && typeof candidate.expectedModifiedAt === "number";
}

/**
 * Validates the shape of a browser page-creation payload.
 *
 * @param value Unknown decoded JSON value.
 * @returns Whether the value contains a path and initial Markdown.
 */
function isCreateDocumentRequest(value: unknown): value is CreateDocumentRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.path === "string" && typeof candidate.content === "string";
}

/**
 * Validates the shape of a browser page-deletion payload.
 *
 * @param value Unknown decoded JSON value.
 * @returns Whether the value contains a modification token.
 */
function isDeleteDocumentRequest(value: unknown): value is DeleteDocumentRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return typeof (value as Record<string, unknown>).expectedModifiedAt === "number";
}

/**
 * Sends a JSON response with a deterministic content type.
 *
 * @param response Node HTTP response.
 * @param statusCode HTTP status code.
 * @param body JSON-serializable response value.
 * @returns Nothing.
 */
function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

/**
 * Sends plain Markdown content without JSON encoding.
 *
 * @param response Node HTTP response.
 * @param statusCode HTTP status code.
 * @param body Markdown response body.
 * @returns Nothing.
 */
function sendText(response: ServerResponse, statusCode: number, body: string): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/markdown; charset=utf-8");
  response.end(body);
}

/**
 * Sends binary image content with its verified MIME type.
 *
 * @param response Node HTTP response.
 * @param statusCode HTTP status code.
 * @param body Raw image bytes.
 * @param contentType Verified image MIME type.
 * @returns Nothing.
 */
function sendBinary(
  response: ServerResponse,
  statusCode: number,
  body: Buffer,
  contentType: keyof typeof IMAGE_TYPES,
): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", contentType);
  response.end(body);
}

/** Signals that a file changed outside the current browser editing session. */
class StaleDocumentError extends Error {
  /** Creates a conflict error with user-facing recovery guidance. */
  constructor() {
    super("This file changed on disk. Reload the page before saving again.");
  }
}

/** Signals that page creation targeted an existing Markdown file. */
class DuplicateDocumentError extends Error {
  /** Creates a conflict error that preserves the existing file. */
  constructor() {
    super("A page already exists at that path.");
  }
}
