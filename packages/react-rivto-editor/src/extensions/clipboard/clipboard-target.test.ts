import { BLOCK_CONTENT_SELECTOR } from "../../constants";
import { isNonBlockEditableClipboardEvent } from "./clipboard-target";

interface ClosestHost {
  closest: (selector: string) => ClosestHost | null;
  isContentEditable?: boolean;
  ownerDocument?: { activeElement: ClosestHost | null };
  parentElement?: ClosestHost | null;
}

/**
 * Builds a clipboard event whose target answers `closest` without a browser DOM.
 *
 * @param host - Event target, or a surface whose document focus is `active`.
 * @param active - Optional focused host used when the target itself is not editable.
 * @returns A native-shaped Event for {@link isNonBlockEditableClipboardEvent}.
 */
function clipboardEvent(host: ClosestHost, active?: ClosestHost): Event {
  const document = { activeElement: active ?? host };
  host.ownerDocument = document;
  if (active) active.ownerDocument = document;
  return { target: host } as unknown as Event;
}

/**
 * Builds a fake contenteditable host for selector-driven clipboard tests.
 *
 * @param kind - Whether the host is a visual label or a page block editor.
 * @returns A `closest`/`isContentEditable` stand-in.
 */
function editableHost(kind: "label" | "block"): ClosestHost {
  const host: ClosestHost = {
    isContentEditable: true,
    closest(selector: string) {
      if (selector.includes("contenteditable")) return host;
      if (selector === BLOCK_CONTENT_SELECTOR) return kind === "block" ? host : null;
      return null;
    },
  };
  return host;
}

describe("isNonBlockEditableClipboardEvent", () => {
  test("claims visual label editors and ignores page block editors", () => {
    expect(isNonBlockEditableClipboardEvent(clipboardEvent(editableHost("label")))).toBe(true);
    expect(isNonBlockEditableClipboardEvent(clipboardEvent(editableHost("block")))).toBe(false);
  });

  test("ignores non-editable canvas targets", () => {
    const surface: ClosestHost = {
      closest: () => null,
      isContentEditable: false,
    };
    expect(isNonBlockEditableClipboardEvent(clipboardEvent(surface))).toBe(false);
  });

  test("follows document focus when the event target is not the label", () => {
    const label = editableHost("label");
    const surface: ClosestHost = {
      closest: () => null,
      isContentEditable: false,
    };
    expect(isNonBlockEditableClipboardEvent(clipboardEvent(surface, label))).toBe(true);
  });
});
