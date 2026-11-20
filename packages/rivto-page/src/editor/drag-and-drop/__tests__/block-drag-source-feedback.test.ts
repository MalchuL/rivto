import { BlockDragSourceFeedback } from "../block-drag-source-feedback";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import type { InputRegion } from "@chulane/rivto-root";

const detachments: Array<() => void> = [];

afterEach(() => {
  for (const detach of detachments.splice(0)) {
    detach();
  }
});

/**
 * Captures a source region through the same pointer adapter used by drag input.
 *
 * @param root - Editor occurrence containing the source.
 * @param source - Block shell receiving the synthetic pointer event.
 * @returns Feedback bound to the captured source region.
 * @throws If the source does not produce a captured region.
 */
function sourceFeedback(root: HTMLElement, source: HTMLElement): BlockDragSourceFeedback {
  let region: InputRegion | undefined;
  const occurrence = new BrowserInputRoot(root);
  const release = occurrence.observeInput("pointerdown", (input) => {
    region = input.captureRegion("[data-block-id]", "[data-block-id]", "[data-rivto-block-editor]");
  });
  detachments.push(() => {
    release?.();
    occurrence.detach();
  });
  source.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  if (!region) {
    throw new Error("Source region was not captured");
  }
  return new BlockDragSourceFeedback(occurrence, region, source.dataset.blockId!);
}

it("decorates a single source without querying the occurrence and restores its prior marker", () => {
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="one" data-dragging="borrowed"></div>';
  const source = root.firstElementChild as HTMLElement;
  const query = jest.spyOn(root, "querySelectorAll");
  const feedback = sourceFeedback(root, source);
  feedback.show(["one"]);
  expect(source.getAttribute("data-dragging")).toBe("true");
  expect(query).not.toHaveBeenCalled();
  source.remove();
  feedback.clear();
  expect(source.getAttribute("data-dragging")).toBe("borrowed");
  feedback.clear();
});

it("marks only captured mounted group roots and isolates nested occurrences", () => {
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-block-id="one" data-block-selected><div data-block-id="child" data-block-selected></div></div><div data-block-id="two" data-block-selected></div><div data-rivto-block-editor><div data-block-id="two" data-block-selected></div></div>';
  const active = root.querySelector<HTMLElement>('[data-block-id="child"]')!;
  const feedback = sourceFeedback(root, active);
  feedback.show(["one", "two", "unmounted"]);
  expect(
    [...root.querySelectorAll("[data-dragging]")].map((element) =>
      element.getAttribute("data-block-id"),
    ),
  ).toEqual(["one", "two"]);
  feedback.clear();
  expect(root.querySelectorAll("[data-dragging]")).toHaveLength(0);
});

it("attempts every source restoration after a DOM cleanup failure", () => {
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-block-id="one" data-block-selected></div><div data-block-id="two" data-block-selected></div>';
  const first = root.firstElementChild as HTMLElement;
  const second = root.lastElementChild as HTMLElement;
  const feedback = sourceFeedback(root, first);
  feedback.show(["one", "two"]);
  const failure = new Error("cannot restore");
  jest.spyOn(first, "removeAttribute").mockImplementation(() => {
    throw failure;
  });
  expect(() => feedback.clear()).toThrow(AggregateError);
  expect(second.hasAttribute("data-dragging")).toBe(false);
  expect(() => feedback.clear()).not.toThrow();
});
