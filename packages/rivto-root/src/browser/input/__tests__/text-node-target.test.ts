import { BrowserInputListeners } from "../browser-input-listeners";

it("resolves a text target through its parent in the root document", () => {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const doc = frame.contentDocument!;
  const root = doc.createElement("div");
  root.innerHTML = "<button data-control>Text</button>";
  doc.body.append(root);
  const input = new BrowserInputListeners();
  const received = jest.fn();
  input.register({ type: "click", target: "root", capture: false }, (event) => {
    received(event.target?.hasAncestor("[data-control]"));
  });
  const detach = input.attach(root);
  root
    .querySelector("button")!
    .firstChild!.dispatchEvent(new doc.defaultView!.MouseEvent("click", { bubbles: true }));
  expect(received).toHaveBeenCalledWith(true);
  detach();
  frame.remove();
});
