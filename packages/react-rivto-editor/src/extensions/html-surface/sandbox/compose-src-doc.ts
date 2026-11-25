/**
 * Builds the `srcdoc` of a widget iframe: the authored markup plus the bridge
 * runtime, injected so it runs before any authored script.
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

/** Inputs that determine one widget document. */
export interface SrcDocOptions {
  /** Authored HTML fragment or complete document. */
  readonly source: string;
  /** Per-document secret the host requires on every message. */
  readonly token: string;
  /** `fill` locks the document to the host box; `auto` lets the body grow. */
  readonly fit: HtmlFrameFit;
  /** Secret for native text-selection reports; omit to disable the relay. */
  readonly selectionKey?: string;
  /** Install `rivto.panel` / `rivto.reactEditor` with this grant; omit for ordinary widgets. */
  readonly unsafeAccessEnabled?: boolean;
}

/**
 * Matches the leading part of a document that may precede the bridge: whitespace,
 * comments, a doctype, and opening `html`/`head` tags. `(?=[\s>])` keeps `<header>`
 * from matching `<head`, and quoted attribute values may contain `>`.
 */
const DOCUMENT_PREFIX =
  /\s+|<!--[\s\S]*?-->|<(!doctype|html|head)(?=[\s>])(?:[^>"']|"[^"]*"|'[^']*')*>/giy;

/**
 * Builds the iframe document, injecting the bridge without reordering authored markup.
 *
 * The bridge is inserted right after any leading doctype, comments and opening
 * `html`/`head` tags, i.e. before the first authored content. A head-like
 * string later in a script, comment or attribute is never treated as the
 * insertion point, so an early authored script always sees `window.rivto`.
 * The browser supplies implicit `head`/`body` elements for fragments.
 *
 * @param options - Source, credentials and optional capabilities of the document.
 * @returns A complete `srcdoc` string.
 */
export function composeSrcDoc(options: SrcDocOptions): string {
  const sizing =
    options.fit === "fill"
      ? "html,body{margin:0;height:100%;background:transparent}body{overflow:hidden}"
      : "html,body{margin:0;background:transparent}";
  const bootstrap = `<meta charset="utf-8"><style>${sizing}</style><script>${bridgeScript(options)}</scr${"ipt>"}`;
  const { source } = options;
  let index = 0;
  let doctype = "<!DOCTYPE html>";
  for (const match of source.matchAll(DOCUMENT_PREFIX)) {
    index += match[0].length;
    const tag = match[1]?.toLowerCase();
    if (tag === "!doctype") {
      doctype = "";
    } else if (tag === "head") {
      break;
    }
  }
  return `${doctype}${source.slice(0, index)}${bootstrap}${source.slice(index)}`;
}

/**
 * Assembles the runtime fragments into one IIFE in dependency order.
 *
 * Order matters: the core declares `port`/`send`; the text-selection relay must
 * capture native APIs before listener tracking patches `EventTarget`; teardown
 * registers the last `pagehide` listener so earlier fragments can still send.
 *
 * @param options - Credentials and capabilities of the document.
 * @returns JavaScript source for the bootstrap `<script>`.
 */
function bridgeScript(options: SrcDocOptions): string {
  const fragments = [
    `var token = ${JSON.stringify(options.token)};`,
    `var channel = ${JSON.stringify(HTML_CHANNEL)};`,
    bridgeCoreScript(),
    options.selectionKey ? textSelectionScript(options.selectionKey) : "",
    pointerNotificationScript(),
    dragRegionScript(),
    frameHeightScript(),
    options.unsafeAccessEnabled === undefined
      ? ""
      : unsafeAccessScript(options.unsafeAccessEnabled),
    connectionTeardownScript(),
  ];
  return `(function () {\n${fragments.join("\n")}\n})();`;
}
