import { createTestEditor } from "../../editor/test-utils";

it("applies definitions to nested creation and atomic updates, including type-specific resizing", async () => {
  const editor = await createTestEditor();
  const dispose = editor.elementRegistry.register({
    type: "badge",
    defaults: { count: 1 },
    /**
     * Validates the fixture's numeric non-negative count.
     *
     * @param props - Element properties to validate.
     * @returns The unchanged properties.
     * @throws If the count is invalid.
     */
    validate(props) {
      if (typeof props.count !== "number" || props.count < 0) {
        throw new Error("Invalid count");
      }
      return props;
    },
    /**
     * Scales the fixture count in proportion to the element's resized width.
     *
     * @param element - Element snapshot or DOM host used by the operation.
     * @param frame - Requested element frame in canvas coordinates.
     * @returns Count property patch for the requested frame.
     */
    resize(element, frame) {
      return { count: (Number(element.props.count) * frame.width) / element.frame.width };
    },
  });
  const frame = { x: 0, y: 0, width: 10, height: 10 };
  editor.elements.insertElement({
    id: "root",
    type: "group",
    zIndex: 0,
    children: [
      { id: "a", type: "badge", frame, zIndex: 0 },
      { id: "b", type: "badge", frame, zIndex: 0 },
    ],
  });
  expect(editor.elements.getElementNode("a")?.props.count).toBe(1);
  expect(() =>
    editor.elements.updateElements([
      { id: "a", patch: { props: { count: 2 } } },
      { id: "b", patch: { props: { count: -1 } } },
    ]),
  ).toThrow("Invalid count");
  expect(editor.elements.getElementNode("a")?.props.count).toBe(1);
  editor.history.clear();
  editor.elements.updateElement("a", { frame: { width: 20 } });
  expect(editor.elements.getElementNode("a")?.props.count).toBe(2);
  editor.history.undo();
  expect(editor.elements.getElementNode("a")?.props.count).toBe(1);
  dispose();
  dispose();
  expect(editor.elements.getElementNode("a")).toBeDefined();
  editor.elements.insertElement({ type: "unknown", frame, zIndex: 0, props: { retained: true } });
  await editor.destroy();
});
