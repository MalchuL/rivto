/**
 * Jest stand-in for `react-markdown` so unit tests do not load the ESM tree.
 *
 * @module
 */

/**
 * Renders Markdown children as a plain span for tests that only need a type.
 *
 * @param props - react-markdown-compatible children.
 * @returns A span containing the source text.
 */
export default function ReactMarkdown(props: { readonly children?: unknown }): unknown {
  return props.children;
}

/**
 * Identity URL transform used by the production Markdown renderer.
 *
 * @param value - Candidate URL.
 * @returns The same URL.
 */
export function defaultUrlTransform(value: string): string {
  return value;
}
