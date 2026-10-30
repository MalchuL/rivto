/**
 * Jest stand-in for `@openuidev/react-ui`.
 *
 * Registration tests only need a library object to close over. The stock
 * component package is too large, and too browser-specific, to load here.
 *
 * @module
 */

/** Minimal library shape accepted by the OpenUI extension default. */
export const openuiLibrary = {
  root: "Stack",
  components: {},
};
