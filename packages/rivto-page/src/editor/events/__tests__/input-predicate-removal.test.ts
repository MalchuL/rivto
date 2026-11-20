import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("skips a handler removed by its own predicate and defers its replacement", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const old = jest.fn();
  const replacement = jest.fn();
  const later = jest.fn();
  let release = () => {};
  release = editor.events.register(
    "target",
    {
      type: "click",
      priority: 10,
      when: () => {
        release();
        editor.events.register("target", { type: "click", priority: 10 }, replacement);
        return true;
      },
    },
    old,
  );
  editor.events.register("later", { type: "click", priority: 0 }, later);
  const detach = attachTestRoot(editor, root);
  try {
    root.click();
    expect(old).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledTimes(1);
    root.click();
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(later).toHaveBeenCalledTimes(2);
  } finally {
    detach();
    editor.destroy();
  }
});

it("skips an observer removed by its own predicate", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const observer = jest.fn();
  let release = () => {};
  release = editor.events.observe(
    "observer",
    {
      type: "click",
      priority: 0,
      when: () => {
        release();
        return true;
      },
    },
    observer,
  );
  const detach = attachTestRoot(editor, root);
  try {
    root.click();
    expect(observer).not.toHaveBeenCalled();
  } finally {
    detach();
    editor.destroy();
  }
});

it("defers a replacement even when the old registration was the last in its group", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  document.body.append(root);
  const old = jest.fn();
  const replacement = jest.fn();
  let release = () => {};
  release = editor.events.register(
    "target",
    {
      type: "click",
      priority: 0,
      when: () => {
        release();
        editor.events.register("target", { type: "click", priority: 0 }, replacement);
        return true;
      },
    },
    old,
  );
  const detach = attachTestRoot(editor, root);
  try {
    root.click();
    expect(old).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    root.click();
    expect(replacement).toHaveBeenCalledTimes(1);
  } finally {
    detach();
    editor.destroy();
    root.remove();
  }
});
