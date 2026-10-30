import { BlockEditorController } from "../block-editor-controller";
import { TestBlockEditorAdapter } from "../../test-utils/test-block-editor-adapter";
import { BlockSelectionExtensions } from "./block-selection-extensions";

it("releases physical-key subscriptions when feedback setup fails partway through", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const releaseHeld = jest.fn();
  const held = jest.spyOn(editor.keyboard, "subscribeHeld").mockReturnValue(releaseHeld);
  editor.events.observe("selection.feedback.out", { type: "pointerout", priority: 0 }, () => {});
  const selection = new BlockSelectionExtensions({
    toggle: "toggle",
    range: "range",
    exact: "exact",
  });
  expect(() => editor.extensions.register("feedback", selection.feature("feedback"))).toThrow();
  expect(releaseHeld).toHaveBeenCalledTimes(1);
  // The registration installed before the duplicate must also be rolled back.
  expect(() =>
    editor.events.observe(
      "selection.feedback.over",
      { type: "pointerover", priority: 0 },
      () => {},
    ),
  ).not.toThrow();
  held.mockRestore();
  editor.destroy();
});
