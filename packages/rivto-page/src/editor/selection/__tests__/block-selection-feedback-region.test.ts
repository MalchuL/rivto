import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { BlockSelectionFeedback } from "../block-selection-feedback";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

it("keeps feedback within the hovered anchor and clears it on exit and detach", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "";
  root.innerHTML =
    '<div data-block-id="block"><div data-block-selection-anchor><span></span><span></span></div></div>';
  const anchor = root.querySelector<HTMLElement>("[data-block-selection-anchor]")!;
  const [first, second] = root.querySelectorAll("span");
  jest.spyOn(editor.keyboard, "isHeld").mockReturnValue(true);
  const feedback = new BlockSelectionFeedback(
    editor.events,
    editor.keyboard,
    { isToggleInstalled: () => true },
    "toggle",
  );
  const dispose = feedback.install();
  const detach = attachTestRoot(editor, root);
  first.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  expect(anchor.hasAttribute("data-block-selecting")).toBe(true);
  first.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: second }));
  expect(anchor.hasAttribute("data-block-selecting")).toBe(true);
  second.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: root }));
  expect(anchor.hasAttribute("data-block-selecting")).toBe(false);
  first.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  expect(anchor.hasAttribute("data-block-selecting")).toBe(true);
  detach();
  expect(anchor.hasAttribute("data-block-selecting")).toBe(false);
  dispose();
  editor.destroy();
});

it("releases feedback after its borrowed Root detaches", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "";
  root.innerHTML =
    '<div data-block-id="block"><div data-block-selection-anchor><span></span></div></div>';
  const anchor = root.querySelector<HTMLElement>("[data-block-selection-anchor]")!;
  const occurrence = new BrowserInputRoot(root);
  jest.spyOn(editor.keyboard, "isHeld").mockReturnValue(true);
  const feedback = new BlockSelectionFeedback(
    editor.events,
    editor.keyboard,
    { isToggleInstalled: () => true },
    "toggle",
  );
  const dispose = feedback.install();
  const detach = editor.attach(occurrence);
  try {
    anchor.firstElementChild!.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    expect(anchor.hasAttribute("data-block-selecting")).toBe(true);
    occurrence.detach();
    detach();
    expect(anchor.hasAttribute("data-block-selecting")).toBe(false);
  } finally {
    dispose();
    editor.destroy();
  }
});
