import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("stops later observers and handlers when the borrowed Root detaches", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const later = jest.fn();
  editor.events.observe("detach", { type: "click", priority: 10 }, () => root.detach());
  editor.events.observe("later-observer", { type: "click", priority: 0 }, later);
  editor.events.register("later-handler", { type: "click", priority: 0 }, later);
  const detach = editor.attach(root);
  try {
    element.click();
    expect(later).not.toHaveBeenCalled();
  } finally {
    detach();
    editor.destroy();
  }
});

it("does not invoke a handler when its predicate detaches the Root", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const handler = jest.fn();
  editor.events.register(
    "predicate",
    {
      type: "click",
      priority: 0,
      when: () => {
        root.detach();
        return true;
      },
    },
    handler,
  );
  const detach = editor.attach(root);
  try {
    element.click();
    expect(handler).not.toHaveBeenCalled();
  } finally {
    detach();
    editor.destroy();
  }
});

it("does not deliver an old event to a remount borrowing the same Root", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const later = jest.fn();
  let detach = editor.attach(root);
  let replaced = false;
  editor.events.register("replace", { type: "click", priority: 10 }, () => {
    if (!replaced) {
      replaced = true;
      detach();
      detach = editor.attach(root);
    }
    return "continue";
  });
  editor.events.register("later", { type: "click", priority: 0 }, later);
  try {
    element.click();
    expect(later).not.toHaveBeenCalled();
    element.click();
    expect(later).toHaveBeenCalledTimes(1);
  } finally {
    detach();
    root.detach();
    editor.destroy();
  }
});
