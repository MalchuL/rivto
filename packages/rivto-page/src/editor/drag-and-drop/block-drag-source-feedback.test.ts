import { BlockDragSourceFeedback } from "./block-drag-source-feedback";

it("decorates a single source without querying the occurrence and restores its prior marker", () => {
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="one" data-dragging="borrowed"></div>';
  const source = root.firstElementChild as HTMLElement;
  const query = jest.spyOn(root, "querySelectorAll");
  const feedback = new BlockDragSourceFeedback(root, source);
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
  const feedback = new BlockDragSourceFeedback(root, active);
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
  const feedback = new BlockDragSourceFeedback(root, first);
  feedback.show(["one", "two"]);
  const failure = new Error("cannot restore");
  jest.spyOn(first, "removeAttribute").mockImplementation(() => {
    throw failure;
  });
  expect(() => feedback.clear()).toThrow(AggregateError);
  expect(second.hasAttribute("data-dragging")).toBe(false);
  expect(() => feedback.clear()).not.toThrow();
});
