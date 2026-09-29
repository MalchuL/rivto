/**
 * Renders fenced JSX with react-live and Tailwind utilities.
 *
 * react-live 5.0.0 (September 2026) is the preview runtime. It transpiles
 * with Sucrase 3.35.1. Sucrase has more GitHub stars, but its latest release
 * is November 2025 and it only transpiles source. react-live is the current
 * renderer and already depends on that Sucrase release.
 *
 * Tailwind comes from `@tailwindcss/browser`, limited to theme and utilities.
 * Preflight is omitted so authored classes do not reset the editor chrome.
 *
 * @module
 */
import {
  Fragment,
  useEffect,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { LiveError, LivePreview, LiveProvider } from "react-live";

const MARKDOWN_LIVE_CLASS = "markdown-live";
const MARKDOWN_LIVE_ERROR_CLASS = "markdown-live-error";
const TAILWIND_STYLE_ATTRIBUTE = "data-markdown-tailwind";

const LIVE_CODE_LABELS: ReadonlySet<string> = new Set(["jsx", "tsx", "live"]);

/**
 * Hooks available inside a live fence without an import.
 * react-live already injects `React`.
 */
const LIVE_SCOPE: Record<string, unknown> = {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
};

const TAILWIND_INPUT = [
  "@layer theme, base, components, utilities;",
  '@import "tailwindcss/theme.css" layer(theme);',
  '@import "tailwindcss/utilities.css" layer(utilities);',
].join("\n");

let tailwindBrowser: Promise<unknown> | undefined;

/**
 * True when a Markdown fence should render instead of showing highlighted code.
 *
 * Exact labels only. A path such as `src/example.jsx` stays source text.
 *
 * @param label - Fence info before language aliases are applied.
 * @returns Whether the fence is `jsx`, `tsx`, or `live`.
 */
export function isLiveCodeLabel(label: string | undefined): boolean {
  return LIVE_CODE_LABELS.has(label?.trim().toLowerCase() ?? "");
}

/**
 * True when the fence calls react-live's imperative `render`.
 *
 * Inline fences must be one expression. A component with hooks calls
 * `render(<Component />)` and is evaluated as a script instead.
 *
 * @param code - Fence body.
 * @returns Whether `noInline` mode is required.
 */
export function liveCodeUsesRender(code: string): boolean {
  return /\brender\s*\(/.test(code);
}

/**
 * Starts the Tailwind browser compiler once, without Preflight.
 *
 * @returns A promise that settles when the compiler module has been evaluated.
 */
function ensureTailwindBrowser(): Promise<unknown> {
  if (!tailwindBrowser) {
    const style = document.querySelector(`style[${TAILWIND_STYLE_ATTRIBUTE}]`) ?? document.createElement("style");
    style.setAttribute("type", "text/tailwindcss");
    style.setAttribute(TAILWIND_STYLE_ATTRIBUTE, "true");
    style.textContent = TAILWIND_INPUT;
    document.head.appendChild(style);
    // @ts-expect-error The published browser build is an untyped IIFE.
    tailwindBrowser = import("@tailwindcss/browser");
  }
  return tailwindBrowser;
}

/**
 * Renders one JSX fence.
 *
 * The surrounding Markdown block still edits the raw fence. This preview is
 * mounted only while that block is idle.
 *
 * @param props - Fence label and source.
 * @returns The live preview and any transpile or render error.
 */
export function MarkdownLivePreview({
  code,
  label,
}: {
  readonly code: string;
  readonly label: string;
}) {
  useEffect(() => {
    let cancelled = false;
    ensureTailwindBrowser().catch((error: unknown) => {
      if (!cancelled) console.error(error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const language = label.trim().toLowerCase() === "jsx" ? "jsx" : "tsx";
  const noInline = liveCodeUsesRender(code);

  return (
    <div className={MARKDOWN_LIVE_CLASS}>
      <LiveProvider code={code} language={language} noInline={noInline} scope={LIVE_SCOPE}>
        <LivePreview />
        <LiveError className={MARKDOWN_LIVE_ERROR_CLASS} />
      </LiveProvider>
    </div>
  );
}
