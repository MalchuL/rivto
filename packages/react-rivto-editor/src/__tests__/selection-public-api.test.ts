import * as editor from "../index";

it("keeps native-root selection helpers outside the public editor entry", () => {
  expect(editor).not.toHaveProperty("readEditorDOMSelection");
  expect(editor).not.toHaveProperty("restoreEditorDOMSelection");
});
