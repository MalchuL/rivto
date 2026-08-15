/**
 * Converts portable relative Markdown image paths to browser mirror URLs and back.
 * Repository files retain paths relative to their own location, while the editor
 * displays the same assets through the documentation site's `/markdown/` mirror.
 */

const IMAGE_DESTINATION_PATTERN = /(!\[[^\]]*\]\()(<[^>\n]+>|[^)\s]+)([^)]*\))/g;
const MARKDOWN_MIRROR_PREFIX = "/markdown/";

/**
 * Resolves relative Markdown image destinations for display inside the editor app.
 *
 * @param markdown Canonical file Markdown.
 * @param pagePath Canonical path of the Markdown page.
 * @returns Editor Markdown whose local image sources point at the browser mirror.
 */
export function resolveImagesForEditor(markdown: string, pagePath: string): string {
  return markdown.replace(IMAGE_DESTINATION_PATTERN, function replaceImagePath(
    _match,
    opening: string,
    rawSource: string,
    closing: string,
  ) {
    const source = unwrapAngleBrackets(rawSource);
    if (isExternalSource(source)) {
      return `${opening}${rawSource}${closing}`;
    }
    const assetPath = resolveRelativePath(getParentPath(pagePath), source);
    if (!assetPath) {
      return `${opening}${rawSource}${closing}`;
    }
    const browserSource = `${MARKDOWN_MIRROR_PREFIX}${assetPath.split("/").map(encodeURIComponent).join("/")}`;
    return `${opening}${browserSource}${closing}`;
  });
}

/**
 * Restores browser mirror image destinations to paths relative to the Markdown file.
 *
 * @param markdown Markdown serialized from the active Tiptap document.
 * @param pagePath Canonical path of the Markdown page.
 * @returns Portable file Markdown suitable for persistence.
 */
export function restoreImagesForFile(markdown: string, pagePath: string): string {
  return markdown.replace(IMAGE_DESTINATION_PATTERN, function restoreImagePath(
    _match,
    opening: string,
    rawSource: string,
    closing: string,
  ) {
    const source = unwrapAngleBrackets(rawSource);
    if (!source.startsWith(MARKDOWN_MIRROR_PREFIX)) {
      return `${opening}${rawSource}${closing}`;
    }
    const assetPath = source
      .slice(MARKDOWN_MIRROR_PREFIX.length)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
    return `${opening}${makeRelativePath(getParentPath(pagePath), assetPath)}${closing}`;
  });
}

/**
 * Converts one server-returned portable source to its editor display URL.
 *
 * @param source Image source relative to the owning page.
 * @param pagePath Canonical owning Markdown path.
 * @returns Browser mirror URL inserted into Tiptap.
 */
export function resolvePastedImageForEditor(source: string, pagePath: string): string {
  const markdown = resolveImagesForEditor(`![](${source})`, pagePath);
  return markdown.match(/!\[\]\(([^)]+)\)/)?.[1] ?? source;
}

/**
 * Reports whether a source already has an absolute, fragment, or URI scheme.
 *
 * @param source Markdown image destination.
 * @returns Whether relative path conversion must be skipped.
 */
function isExternalSource(source: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(source);
}

/**
 * Resolves a relative path without allowing it to escape the documentation root.
 *
 * @param parentPath Owning page directory.
 * @param source Relative image source.
 * @returns Root-relative asset path or null when traversal escapes the root.
 */
function resolveRelativePath(parentPath: string, source: string): string | null {
  const segments = parentPath.split("/").filter(Boolean);
  for (const segment of source.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length === 0) {
        return null;
      }
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

/**
 * Produces a relative path between two root-relative documentation locations.
 *
 * @param fromDirectory Owning page directory.
 * @param targetPath Root-relative image path.
 * @returns Portable slash-separated relative path.
 */
function makeRelativePath(fromDirectory: string, targetPath: string): string {
  const fromSegments = fromDirectory.split("/").filter(Boolean);
  const targetSegments = targetPath.split("/").filter(Boolean);
  let commonLength = 0;
  while (
    commonLength < fromSegments.length &&
    commonLength < targetSegments.length &&
    fromSegments[commonLength] === targetSegments[commonLength]
  ) {
    commonLength += 1;
  }
  return [
    ...fromSegments.slice(commonLength).map(function parentSegment() { return ".."; }),
    ...targetSegments.slice(commonLength),
  ].join("/");
}

/**
 * Reads the containing directory from a canonical page path.
 *
 * @param pagePath Canonical Markdown path.
 * @returns Slash-separated parent directory.
 */
function getParentPath(pagePath: string): string {
  return pagePath.split("/").slice(0, -1).join("/");
}

/**
 * Removes optional angle brackets around a Markdown destination.
 *
 * @param source Raw Markdown destination.
 * @returns Unwrapped path.
 */
function unwrapAngleBrackets(source: string): string {
  return source.startsWith("<") && source.endsWith(">") ? source.slice(1, -1) : source;
}
