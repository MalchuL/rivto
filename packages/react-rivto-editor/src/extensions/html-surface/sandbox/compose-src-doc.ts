/**
 * Builds the page loaded into a widget iframe: the widget's HTML plus the
 * bridge script, inserted so that it runs before any widget script.
 *
 * @module
 */
import { HTML_CHANNEL } from "../constants";
import type { HtmlFrameFit } from "../types";
import {
  bridgeCoreScript,
  connectionTeardownScript,
  frameHeightScript,
  pointerNotificationScript,
} from "./runtime/bridge-runtime";
import { dragRegionScript } from "./runtime/drag-region-runtime";
import { textSelectionScript } from "./runtime/text-selection-runtime";
import { unsafeAccessScript } from "./runtime/unsafe-runtime";

/** Everything that determines one widget page. */
export interface SrcDocOptions {
  /** The widget's HTML: a fragment or a complete document. */
  readonly source: string;
  /** The page's secret; the editor ignores messages without it. */
  readonly token: string;
  /** `fill` locks the page to the host box; `auto` lets the body grow with its content. */
  readonly fit: HtmlFrameFit;
  /** Most drag regions the page reports; the editor's parser must use the same limit. */
  readonly maxDragRegions: number;
  /** Secret for text-selection reports. Omit to leave the relay out. */
  readonly selectionKey?: string;
  /** Whether Unsafe HTML access is granted. Omit for ordinary widgets: then `rivto.panel` does not exist at all. */
  readonly unsafeAccessEnabled?: boolean;
}

/**
 * Matches one piece of the part of a document that may come before the bridge:
 * whitespace, a comment, the doctype, or an opening `<html>` or `<head>` tag.
 *
 * `(?=[\s>])` stops `<header>` from matching as `<head`, and quoted attribute
 * values may contain `>`. The `y` (sticky) flag makes each match start exactly
 * where the previous one ended, so matching stops at the first other content.
 */
const DOCUMENT_PREFIX_PIECE =
  /\s+|<!--[\s\S]*?-->|<(!doctype|html|head)(?=[\s>])(?:[^>"']|"[^"]*"|'[^']*')*>/giy;

/**
 * Builds the `srcdoc` of a widget iframe.
 *
 * The bridge script must run before any widget script, so widget code can use
 * `window.rivto` from its first line. It is inserted right after the
 * document's opening pieces (doctype, comments, `<html>`, `<head>`), i.e.
 * before the first content of the widget. Anything that merely looks like a
 * `<head>` later on, inside a script, comment or attribute, is never used as
 * the insertion point. For a plain fragment, the bridge simply goes first and
 * the browser creates the implicit `<head>` and `<body>`.
 *
 * A doctype is added when the source has none, so the page renders in
 * standards mode.
 *
 * @param options - Source, secrets, limits and optional features of the page.
 * @returns The complete page.
 */
export function composeSrcDoc(options: SrcDocOptions): string {
  const sizing =
    options.fit === "fill"
      ? "html,body{margin:0;height:100%;background:transparent}body{overflow:hidden}"
      : "html,body{margin:0;background:transparent}";
  // Split "</script>" so the string cannot end an enclosing script element.
  const bootstrap = `<meta charset="utf-8"><style>${sizing}</style><script>${bridgeScript(options)}</scr${"ipt>"}`;
  const { source } = options;
  const { insertAt, hasDoctype } = findBridgeInsertionPoint(source);
  const doctype = hasDoctype ? "" : "<!DOCTYPE html>";
  return `${doctype}${source.slice(0, insertAt)}${bootstrap}${source.slice(insertAt)}`;
}

/**
 * Finds where the bridge goes: after the document's opening pieces.
 *
 * @param source - The widget's HTML.
 * @returns The character index to insert at, and whether the source declares a doctype.
 */
function findBridgeInsertionPoint(source: string): { insertAt: number; hasDoctype: boolean } {
  let insertAt = 0;
  let hasDoctype = false;
  for (const match of source.matchAll(DOCUMENT_PREFIX_PIECE)) {
    insertAt += match[0].length;
    const tag = match[1]?.toLowerCase();
    if (tag === "!doctype") {
      hasDoctype = true;
    } else if (tag === "head") {
      break;
    }
  }
  return { insertAt, hasDoctype };
}

/**
 * Joins the page script pieces into one function, in the order they depend on each other.
 *
 * The order matters:
 * 1. `token` and `channel` are declared first; every piece uses them.
 * 2. The core declares `port` and `send` and defines `window.rivto`.
 * 3. The text-selection relay takes private copies of native APIs before
 *    drag-region tracking wraps `addEventListener`.
 * 4. Teardown registers the last `pagehide` handler, so the others can still
 *    send before the port closes.
 *
 * @param options - Secrets, limits and optional features of the page.
 * @returns JavaScript source for the bridge `<script>`.
 */
function bridgeScript(options: SrcDocOptions): string {
  const pieces = [
    `var token = ${JSON.stringify(options.token)};`,
    `var channel = ${JSON.stringify(HTML_CHANNEL)};`,
    bridgeCoreScript(),
    options.selectionKey ? textSelectionScript(options.selectionKey) : "",
    pointerNotificationScript(),
    dragRegionScript(options.maxDragRegions),
    frameHeightScript(),
    options.unsafeAccessEnabled === undefined
      ? ""
      : unsafeAccessScript(options.unsafeAccessEnabled),
    connectionTeardownScript(),
  ];
  return `(function () {\n${pieces.join("\n")}\n})();`;
}
