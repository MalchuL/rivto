/**
 * Short reference for the `window.rivto` API that widget scripts use, shown
 * next to the places where users enter HTML.
 *
 * Keep it in sync with `window.rivto` in `sandbox/runtime/bridge-runtime.ts`
 * and with the node views in `types.ts`.
 *
 * @module
 */

/**
 * Renders a one-paragraph summary of how a widget script reads and writes its node.
 *
 * The same text serves blocks and canvas elements, so it names the fields of
 * both. Unsafe HTML access (`rivto.panel`, `rivto.reactEditor`) is left out:
 * it exists only in Unsafe HTML blocks after the user grants access there.
 *
 * @returns The hint paragraph.
 */
export function HtmlWidgetApiHint() {
  return (
    <p className="html-widget-api-hint">
      Scripts read this node with <code>rivto.ready()</code> and get later changes through{" "}
      <code>rivto.subscribe(listener)</code>. Blocks have <code>props</code>, <code>listProps</code>
      , <code>content</code>, <code>pluginData</code> and <code>childIds</code>; elements have{" "}
      <code>props</code>, <code>frame</code>, <code>zIndex</code> and <code>childIds</code>. Write
      with <code>rivto.setProp(key, value)</code>, <code>setProps</code>, <code>setListProps</code>{" "}
      or <code>setContent</code>.
    </p>
  );
}
