import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("delivers normalized input to an extension without browser objects", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="block"><span data-block-content>Text</span></div>';
  const received = jest.fn();
  editor.extensions.register("input", {
    /**
     * Registers a click handler in the fixture extension's lifetime.
     *
     * @param api - Borrowed Page editor capabilities.
     * @returns The handler remains installed until extension cleanup.
     */
    setup(api) {
      api.events.register("click", { type: "click", priority: 0, scope: "block" }, (event) => {
        received(event);
        event.preventDefault();
        return "handled";
      });
    },
  });
  const detach = attachTestRoot(editor, root);
  const native = new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 42 });
  root.querySelector("span")!.dispatchEvent(native);
  expect(received).toHaveBeenCalledTimes(1);
  const input = received.mock.calls[0]![0];
  expect(input.blockId).toBe("block");
  expect(input.input.clientX).toBe(42);
  expect(input).not.toHaveProperty("raw");
  expect(input.root).not.toBeInstanceOf(HTMLElement);
  expect(input.root).not.toHaveProperty("root");
  expect(input.root).not.toHaveProperty("element");
  expect(input.root).toEqual(
    expect.objectContaining({ clearSelection: expect.any(Function), focus: expect.any(Function) }),
  );
  expect(input).not.toHaveProperty("blockElement");
  expect(input).not.toHaveProperty("contentElement");
  expect(input).not.toHaveProperty("selectionAnchor");
  expect(native.defaultPrevented).toBe(true);
  detach();
  editor.destroy();
});
