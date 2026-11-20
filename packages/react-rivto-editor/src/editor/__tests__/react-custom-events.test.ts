import { createReactEditor } from "../react-editor";
import { createTestCoreEditor } from "../../test-utils";

interface CustomEvents {
  "document-saved": { documentId: string };
}

it("owns typed custom subscriptions through the React extension lifecycle", async () => {
  const core = await createTestCoreEditor();
  const values: string[] = [];
  const editor = createReactEditor<CustomEvents>({ editor: core });
  const remove = editor.extensions.install({
    id: "save-feedback",
    /**
     * Installs an observer owned by this extension.
     *
     * @param api - Borrowed editor without event publishing authority.
     * @returns The observer is owned by extension setup.
     */
    setup(api) {
      const checkBorrowedType = () => {
        const owner = { id: "other-panel", inputRoot: undefined };
        // @ts-expect-error Only the panel manager supplies the event registration owner.
        api.events.register({ id: "click", type: "click" }, () => false, owner);
        // @ts-expect-error Only the panel manager supplies the keyboard registration owner.
        api.keyboard.register({ id: "enter", keys: "Enter" }, () => false, owner);
        // @ts-expect-error Extensions cannot publish through their borrowed event interface.
        api.events.publish("document-saved", { documentId: "doc" });
      };
      void checkBorrowedType;
      api.events.observe({ kind: "custom", id: "saved", type: "document-saved" }, (event) => {
        values.push(event.documentId);
      });
    },
  });
  expect(editor.events.publish("document-saved", { documentId: "first" })).toBe("continue");
  remove();
  expect(editor.events.publish("document-saved", { documentId: "second" })).toBe("continue");
  expect(values).toEqual(["first"]);
  // @ts-expect-error The declared payload requires a string document ID.
  expect(editor.events.publish("document-saved", { documentId: 1 })).toBe("continue");
  await editor.destroy();
  expect(() => editor.events.publish("document-saved", { documentId: "third" })).toThrow();
  await core.destroy();
});

it("shares IDs with native input and skips custom callbacks removed during delivery", async () => {
  const core = await createTestCoreEditor();
  const editor = createReactEditor<CustomEvents>({ editor: core });
  const values: string[] = [];
  let removeLater = () => {};
  editor.events.register(
    { kind: "custom", id: "first", type: "document-saved", priority: 10 },
    () => {
      values.push("first");
      removeLater();
      return "continue" as const;
    },
  );
  removeLater = editor.events.register(
    { kind: "custom", id: "later", type: "document-saved" },
    () => {
      values.push("later");
      return "continue" as const;
    },
  );
  expect(() => editor.events.register({ id: "first", type: "click" }, () => false)).toThrow();
  expect(editor.events.publish("document-saved", { documentId: "doc" })).toBe("continue");
  expect(values).toEqual(["first"]);
  await editor.destroy();
  await core.destroy();
});
