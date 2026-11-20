import { BrowserInputListeners } from "../browser-input-listeners";

it("exposes focus transition targets and occurrence boundaries without browser objects", () => {
  const root = document.createElement("div");
  root.dataset.editor = "";
  root.innerHTML = "<input><div data-editor><input></div><input>";
  const [first, nested, last] = root.querySelectorAll("input");
  const listeners = new BrowserInputListeners();
  const values: Array<[boolean | undefined, boolean | undefined]> = [];
  listeners.register({ type: "focusin", target: "root", capture: false }, (event) => {
    values.push([
      event.target?.belongsToRoot("[data-editor]"),
      event.relatedTarget?.belongsToRoot("[data-editor]"),
    ]);
    expect(event).not.toHaveProperty("raw");
  });
  const detach = listeners.attach(root);
  first.dispatchEvent(new FocusEvent("focusin", { bubbles: true, relatedTarget: last }));
  first.dispatchEvent(new FocusEvent("focusin", { bubbles: true, relatedTarget: nested }));
  first.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  expect(values).toEqual([
    [true, true],
    [true, false],
    [true, undefined],
  ]);
  detach();
});

it("resolves focus targets in the attached root's document realm", () => {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const doc = frame.contentDocument!;
  const root = doc.createElement("div");
  root.innerHTML = "<input><input>";
  doc.body.append(root);
  const [first, second] = root.querySelectorAll("input");
  const listeners = new BrowserInputListeners();
  const received = jest.fn();
  listeners.register({ type: "focusin", target: "root", capture: false }, (event) => {
    received(event.target?.belongsToRoot(), event.relatedTarget?.belongsToRoot());
  });
  const detach = listeners.attach(root);
  first.dispatchEvent(
    new doc.defaultView!.FocusEvent("focusin", { bubbles: true, relatedTarget: second }),
  );
  expect(received).toHaveBeenCalledWith(true, true);
  detach();
  frame.remove();
});
