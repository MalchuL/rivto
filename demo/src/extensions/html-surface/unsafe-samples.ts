/** Example unsafe HTML blocks demonstrating both bridge scopes. */

/** One sandboxed example and its preceding paragraph. */
export interface UnsafeHtmlSample {
  /** Label displayed on the block and its frame. */
  readonly label: string;
  /** Text to place immediately before the block. */
  readonly previous: string;
  /** Authored HTML with a button that modifies the previous sibling. */
  readonly html: string;
}

/**
 * Builds an example that appends text through one of the two bridge scopes.
 *
 * @param target - Panel-bounded or shared-editor block operations.
 * @returns A self-contained HTML fragment whose button updates its preceding sibling.
 */
function unsafeExample(target: "panel" | "reactEditor"): string {
  return `<style>
  body { margin: 0; font: 14px system-ui, sans-serif; color: #151522; }
  .card { padding: 16px; border: 1px solid #c5c8d5; border-radius: 12px; }
  p { margin: 0 0 12px; color: #555569; }
  button { border: 0; border-radius: 8px; padding: 8px 12px; background: #5038b3; color: white; cursor: pointer; }
  button:focus-visible { outline: 3px solid #a89be5; outline-offset: 2px; }
  </style>
  <div class="card"><p>Update the preceding block through ${target}.</p><button type="button">Append Unsafe!!!</button></div>
  <script>
    document.querySelector('button').addEventListener('click', async function () {
      var api = rivto.${target};
      if (!api) return;
      var node = await rivto.ready();
      var parent = await api.blocks.getParentId(node.id);
      var siblings = parent === null ? await api.blocks.getRootIds() : await api.blocks.getChildIds(parent);
      var previousId = siblings[siblings.indexOf(node.id) - 1];
      if (!previousId) return;
      var previous = await api.blocks.getBlockNode(previousId);
      if (previous) await api.blocks.setContent(previousId, previous.content + ' Unsafe!!!');
    });
  </script>`;
}

/** Panel-scoped and whole-document versions of the previous-block example. */
export const UNSAFE_HTML_SAMPLES: readonly UnsafeHtmlSample[] = [
  { label: "Unsafe panel example", previous: "Panel example target", html: unsafeExample("panel") },
  {
    label: "Unsafe editor example",
    previous: "Editor example target",
    html: unsafeExample("reactEditor"),
  },
];
