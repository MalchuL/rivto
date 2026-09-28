/**
 * Jest stand-in for `@openuidev/react-lang`.
 *
 * The published renderer pulls browser ESM that this Node test environment
 * cannot execute. Tests that need a drawn OpenUI tree belong in the demo.
 *
 * @module
 */

/** Renderer substitute that produces no DOM. */
export function Renderer(): null {
  return null;
}
