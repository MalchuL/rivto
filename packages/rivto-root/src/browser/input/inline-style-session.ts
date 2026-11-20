import type { InputInlineStyleSession } from "../../events/types";
import type { InlineStyleState } from "./types";

/**
 * Creates one priority-preserving style owner for a captured browser region.
 *
 * @param state - Original declaration, ownership, and live region check.
 * @returns A session that previews and releases the captured declaration.
 */
export function createInlineStyleSession(state: InlineStyleState): InputInlineStyleSession {
  let active = true;
  return {
    /**
     * Applies a temporary value while the captured region remains current.
     *
     * @param value - CSS value used for the active preview.
     * @returns The declaration is updated when this session still owns it.
     * @throws Propagates style mutation and region ownership failures.
     */
    set: (value) => {
      if (active && state.isCurrent() && state.owners.get(state.property) === state.owner) {
        state.element.style.setProperty(state.property, value);
      }
    },
    /**
     * Releases this owner and restores the captured declaration or a replacement.
     *
     * @param value - Final value, or omitted to restore the captured value.
     * @returns The original priority is retained and this session is released.
     * @throws Propagates browser style restoration failures.
     */
    finish: (value) => {
      if (!active) {
        return;
      }
      active = false;
      if (state.owners.get(state.property) !== state.owner) {
        return;
      }
      try {
        state.element.style.setProperty(state.property, value ?? state.original, state.priority);
      } finally {
        if (state.owners.get(state.property) === state.owner) {
          state.owners.delete(state.property);
        }
      }
    },
  };
}
