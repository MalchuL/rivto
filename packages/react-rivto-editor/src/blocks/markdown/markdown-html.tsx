/**
 * Native HTML assets inside a Markdown preview.
 *
 * React does not execute inline scripts, and it escapes `>` in text children,
 * which breaks CSS child selectors. These components therefore insert real
 * `<style>` and `<script>` elements beside a placeholder the preview owns.
 * Fenced code never reaches them: only parsed HTML elements do.
 *
 * Authored scripts run with the page's privileges, in source order, after the
 * surrounding preview markup is in the document. Focusing the block unmounts
 * the preview and removes the inserted assets.
 *
 * @module
 */
import {
  Children,
  isValidElement,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type ScriptHTMLAttributes,
  type StyleHTMLAttributes,
} from "react";

const MARKDOWN_HTML_HOST_CLASS = "markdown-html-host";

/**
 * Concatenates the text React received for one HTML element.
 *
 * @param node - Children produced from a parsed HTML element.
 * @returns The raw text, including whitespace that is significant in CSS and scripts.
 */
export function nodeText(node: ReactNode): string {
  return Children.toArray(node).map((child) => {
    if (typeof child === "string" || typeof child === "number" || typeof child === "bigint") {
      return String(child);
    }
    if (isValidElement<{ readonly children?: ReactNode }>(child)) return nodeText(child.props.children);
    return "";
  }).join("");
}

/**
 * Accepts script URLs that can load as ordinary documents resources.
 *
 * Relative URLs stay available. `javascript:`, `vbscript:`, and `data:` sources
 * are rejected so a script URL cannot bypass the preview's link policy.
 *
 * @param src - Candidate `src` from authored HTML.
 * @returns Whether the browser should load that script.
 */
export function isExecutableScriptUrl(src: string): boolean {
  const value = src.trim();
  if (!value || /^(?:javascript|vbscript|data):/i.test(value)) return false;
  if (!/^[a-z][a-z\d+.-]*:/i.test(value)) return true;
  return /^https?:/i.test(value);
}

/** True for boolean HTML attributes React may pass as `true` or an empty string. */
function enabled(value: unknown): boolean {
  return value === true || value === "";
}

/**
 * Inserts one element where the HTML tag occurred without letting React own it.
 *
 * @param host - Placeholder rendered at the tag's position.
 * @param element - Style or script element to place immediately before the placeholder.
 * @returns Nothing.
 */
function insertAsset(host: HTMLElement, element: HTMLElement): void {
  try {
    host.parentNode?.insertBefore(element, host);
  } catch (error) {
    element.remove();
    console.error(error);
  }
}

/**
 * Applies one authored `<style>` block to the document.
 *
 * @param props - Style attributes and CSS text from the preview tree.
 * @returns A placeholder; the real style element is inserted beside it.
 */
export function MarkdownHtmlStyle({
  children,
  media,
  nonce,
  title,
}: StyleHTMLAttributes<HTMLStyleElement>) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const css = nodeText(children);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !css.trim()) return;
    const style = document.createElement("style");
    style.className = MARKDOWN_HTML_HOST_CLASS;
    if (media) style.media = media;
    if (nonce) style.nonce = nonce;
    if (title) style.title = title;
    style.textContent = css;
    insertAsset(host, style);
    return () => style.remove();
  }, [css, media, nonce, title]);

  return <span ref={hostRef} className={MARKDOWN_HTML_HOST_CLASS} hidden />;
}

/**
 * Runs one authored `<script>` block beside the HTML it belongs to.
 *
 * @param props - Script attributes and source text from the preview tree.
 * @returns A placeholder; the real script element is inserted beside it.
 */
export function MarkdownHtmlScript({
  async: asyncProp,
  children,
  crossOrigin,
  defer,
  integrity,
  noModule,
  nonce,
  referrerPolicy,
  src,
  type,
}: ScriptHTMLAttributes<HTMLScriptElement>) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const code = nodeText(children);
  const source = typeof src === "string" ? src : undefined;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const external = source !== undefined && source.trim() !== "";
    if (external && !isExecutableScriptUrl(source)) return;
    if (!external && !code.trim()) return;

    const script = document.createElement("script");
    script.className = MARKDOWN_HTML_HOST_CLASS;
    if (type) script.type = type;
    if (nonce) script.nonce = nonce;
    if (crossOrigin) script.crossOrigin = crossOrigin;
    if (integrity) script.integrity = integrity;
    if (referrerPolicy) script.referrerPolicy = referrerPolicy;
    if (noModule) script.noModule = true;
    if (defer) script.defer = true;
    if (external) {
      script.async = enabled(asyncProp);
      script.src = source;
    } else {
      script.text = code;
    }
    insertAsset(host, script);
    return () => script.remove();
  }, [asyncProp, code, crossOrigin, defer, integrity, noModule, nonce, referrerPolicy, source, type]);

  return <span ref={hostRef} className={MARKDOWN_HTML_HOST_CLASS} hidden />;
}
