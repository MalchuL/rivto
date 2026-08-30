/**
 * Jest stand-in for remark/rehype plugins.
 *
 * @module
 */

/** No-op plugin used when Markdown tests do not exercise highlighting or GFM. */
export default function emptyPlugin(): undefined {
  return undefined;
}
