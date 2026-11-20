import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

interface CustomEvents {
  "document-saved": { documentId: string };
}

it("owns custom subscriptions through the installing extension", () => {
  const editor = new BlockEditorController<CustomEvents>({ adapter: new TestBlockEditorAdapter() });
  const values: string[] = [];
  const remove = editor.extensions.register("save-feedback", {
    /**
     * Registers a typed observer for the extension lifetime.
     *
     * @param api - Borrowed editor API without publishing or lifecycle ownership.
     * @returns The observer is registered in this setup scope.
     */
    setup(api) {
      const checkBorrowedType = () => {
        // @ts-expect-error Borrowed extensions cannot publish owner events.
        api.events.publish("document-saved", { documentId: "doc" });
      };
      void checkBorrowedType;
      api.events.observe("observer", { kind: "custom", type: "document-saved" }, (event) => {
        values.push(event.documentId);
      });
    },
  });
  expect(editor.events.publish("document-saved", { documentId: "first" })).toBe("continue");
  remove();
  expect(editor.events.publish("document-saved", { documentId: "second" })).toBe("continue");
  expect(values).toEqual(["first"]);
  // @ts-expect-error The declared custom payload requires a string document ID.
  expect(editor.events.publish("document-saved", { documentId: 1 })).toBe("continue");
  editor.destroy();
  expect(() => editor.events.publish("document-saved", { documentId: "third" })).toThrow();
});

it("shares identity and ordering with browser input and skips removed handlers", () => {
  const editor = new BlockEditorController<CustomEvents>({ adapter: new TestBlockEditorAdapter() });
  const called: string[] = [];
  let removeLater = () => {};
  editor.events.register("first", { kind: "custom", type: "document-saved", priority: 10 }, () => {
    called.push("first");
    removeLater();
    return "continue";
  });
  removeLater = editor.events.register("later", { kind: "custom", type: "document-saved" }, () => {
    called.push("later");
    return "continue";
  });
  expect(() =>
    editor.events.register("first", { type: "click", priority: 0 }, () => "continue"),
  ).toThrow();
  expect(editor.events.publish("document-saved", { documentId: "doc" })).toBe("continue");
  expect(called).toEqual(["first"]);
  editor.destroy();
});
