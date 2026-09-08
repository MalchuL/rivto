/** Browser URL and heading-anchor helpers for documentation navigation. */

/** Converts a canonical Markdown path to its extensionless browser route. */
export function createDocumentationUrl(pagePath: string, anchor = ""): string {
  const pathname = `/${pagePath.replace(/\.md$/i, "").split("/").map(encodeURIComponent).join("/")}`;
  return anchor ? `${pathname}#${encodeURIComponent(anchor)}` : pathname;
}

/** Converts an extensionless browser route back to a canonical Markdown path. */
export function getDocumentationPath(pathname: string): string {
  try {
    const path = pathname.split("/").filter(Boolean).map(decodeURIComponent).join("/");
    return path ? (path.endsWith(".md") ? path : `${path}.md`) : "";
  } catch {
    return "";
  }
}

/** Resolves a local Markdown or route link relative to the current page. */
export function resolveDocumentationLink(
  href: string,
  currentPagePath: string,
): { path: string; anchor: string } | null {
  let target: URL;
  try {
    target = new URL(href, `https://rivto.local/${currentPagePath.replace(/\.md$/i, "")}`);
  } catch {
    return null;
  }
  if (target.origin !== "https://rivto.local" || target.pathname.startsWith("/markdown/")) {
    return null;
  }
  const path = href.startsWith("#") ? currentPagePath : getDocumentationPath(target.pathname);
  return { path, anchor: decodeAnchor(target.hash) };
}

/** Produces stable GitHub-style IDs for document headings. */
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLocaleLowerCase()
    .replaceAll(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replaceAll(/\s+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

/** Decodes a location hash without letting malformed escapes break navigation. */
export function decodeAnchor(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return hash.replace(/^#/, "");
  }
}
