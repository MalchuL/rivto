import type { CompositionEvent, FormEvent } from "react";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { BlockEditingController } from "../block-editing-controller";
import type { BlockTextEditingAttributes, UseBlockEditingOptions } from "../types";

/**
 * Translates React input delivery into opaque editable identities.
 *
 * The native event remains in this rendering adapter and is not retained.
 *
 * @param controller - Borrowed composition and document-update policy.
 * @param runTextInput - Optional synchronous host transaction for input and composition completion.
 * @returns Stable React callbacks for the mounted editable.
 */
export function createTextEditingHandlers(
  controller: Pick<
    BlockEditingController,
    "acceptsInput" | "onInput" | "onCompositionStart" | "onCompositionEnd"
  >,
  runTextInput?: UseBlockEditingOptions["runTextInput"],
): Pick<BlockTextEditingAttributes, "onInput" | "onCompositionStart" | "onCompositionEnd"> {
  return {
    /**
     * Delivers an input event's current editable identity.
     *
     * @param event - React delivery; absent when called outside React.
     * @returns The controller receives the identity when an event is supplied.
     * @throws Propagates identity, text-read, and document update failures.
     */
    onInput: (event?: FormEvent<HTMLDivElement>) => {
      deliverTextInput(controller, runTextInput, "input", event);
    },
    /**
     * Delivers composition start for the current editable.
     *
     * @param event - React delivery; absent when called outside React.
     * @returns The matching composition is started when an event is supplied.
     * @throws Propagates identity lookup failures.
     */
    onCompositionStart: (event?: CompositionEvent<HTMLDivElement>) => {
      if (event) {
        controller.onCompositionStart(getBrowserElementIdentity(event.currentTarget));
      }
    },
    /**
     * Delivers composition completion for the current editable.
     *
     * @param event - React delivery; absent when called outside React.
     * @returns The matching composition is committed when an event is supplied.
     * @throws Propagates identity, text-read, and document update failures.
     */
    onCompositionEnd: (event?: CompositionEvent<HTMLDivElement>) => {
      deliverTextInput(controller, runTextInput, "compositionend", event);
    },
  };
}

/**
 * Applies one normalized input or composition completion through the host transaction.
 *
 * @param controller - Editing policy bound to the current occurrence.
 * @param runTextInput - Optional synchronous host transaction.
 * @param type - Input delivery or composition completion.
 * @param event - React delivery, or undefined outside React.
 * @returns The matching current target receives the operation.
 * @throws Propagates identity, ownership, and document update failures.
 */
function deliverTextInput(
  controller: Pick<BlockEditingController, "acceptsInput" | "onInput" | "onCompositionEnd">,
  runTextInput: UseBlockEditingOptions["runTextInput"],
  type: "input" | "compositionend",
  event?: FormEvent<HTMLDivElement>,
): void {
  if (!event) {
    return;
  }
  const identity = getBrowserElementIdentity(event.currentTarget);
  if (!controller.acceptsInput(identity)) {
    return;
  }
  const apply = () => {
    if (type === "input") {
      controller.onInput(identity);
    } else {
      controller.onCompositionEnd(identity);
    }
  };
  if (runTextInput) {
    runTextInput(apply);
  } else {
    apply();
  }
}
