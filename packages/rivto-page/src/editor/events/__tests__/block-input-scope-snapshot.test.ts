import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("keeps the original content and anchor scopes when an earlier handler changes the DOM", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "";
  root.innerHTML =
    '<div data-block-id="block"><div data-block-content data-block-selection-anchor><span></span></div></div>';
  const marker = root.querySelector<HTMLElement>("[data-block-content]")!;
  const calls: string[] = [];
  editor.events.register("first", { type: "click", scope: "content", priority: 10 }, () => {
    calls.push("first");
    marker.removeAttribute("data-block-content");
    marker.removeAttribute("data-block-selection-anchor");
    return "continue";
  });
  editor.events.register("content", { type: "click", scope: "content", priority: 0 }, () => {
    calls.push("content");
    return "continue";
  });
  editor.events.register(
    "anchor",
    { type: "click", scope: "selection-anchor", priority: 0 },
    () => {
      calls.push("anchor");
      return "continue";
    },
  );
  const detach = attachTestRoot(editor, root);
  root.querySelector("span")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(calls).toEqual(["first", "content", "anchor"]);
  detach();
  editor.destroy();
});

it("delivers nested occurrence input only to observers that explicitly include it", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "";
  root.innerHTML = "<div data-rivto-block-editor><button></button></div>";
  const local = jest.fn();
  const includingNested = jest.fn();
  editor.events.observe("local", { type: "pointermove", capture: true, priority: 0 }, local);
  editor.events.observe(
    "nested",
    { type: "pointermove", capture: true, priority: 0, scope: "including-nested" },
    includingNested,
  );
  const detach = attachTestRoot(editor, root);
  try {
    root.querySelector("button")!.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(local).not.toHaveBeenCalled();
    expect(includingNested).toHaveBeenCalledTimes(1);
  } finally {
    detach();
    editor.destroy();
  }
});
