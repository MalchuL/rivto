import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { InputHit } from "@chulane/rivto-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("captures an opaque pointer target only during its delivery", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const target = document.createElement("div");
  root.dataset.rivtoBlockEditor = "";
  root.append(target);
  document.body.append(root);
  let capture: () => InputHit | undefined = () => undefined;
  editor.events.register("inspect", { type: "pointermove", priority: 0 }, (event) => {
    capture = () => event.input.target?.captureUncapturedPointerHit(event.input.pointerId);
    const hit = capture();
    expect(hit).toBeDefined();
    expect(hit).not.toBe(target);
    expect(hit?.getNearestAncestorIdentity("*")).toBe(getBrowserElementIdentity(target));
    hit?.release();
    expect(hit?.isCurrent()).toBe(false);
    return "continue";
  });
  const detach = attachTestRoot(editor, root);
  try {
    target.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(capture()).toBeUndefined();
  } finally {
    detach();
    editor.destroy();
    root.remove();
  }
});

it("keeps the outer pointer target available during a nested delivery", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const outer = document.createElement("div");
  const inner = document.createElement("div");
  root.dataset.rivtoBlockEditor = "";
  root.append(outer, inner);
  document.body.append(root);
  const targets: Array<ReturnType<typeof getBrowserElementIdentity> | undefined> = [];
  editor.events.register("nested", { type: "pointermove", priority: 0 }, (event) => {
    const capture = () => event.input.target?.captureUncapturedPointerHit(event.input.pointerId);
    const hit = capture();
    targets.push(hit?.getNearestAncestorIdentity("*"));
    hit?.release();
    if (targets.length === 1) {
      inner.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
      const outerHit = capture();
      targets.push(outerHit?.getNearestAncestorIdentity("*"));
      outerHit?.release();
    }
    return "continue";
  });
  const detach = attachTestRoot(editor, root);
  try {
    outer.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(targets).toEqual([
      getBrowserElementIdentity(outer),
      getBrowserElementIdentity(inner),
      getBrowserElementIdentity(outer),
    ]);
  } finally {
    detach();
    editor.destroy();
    root.remove();
  }
});

it("does not revive an earlier delivery when the browser event is dispatched again", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "";
  document.body.append(root);
  let previous: (() => InputHit | undefined) | undefined;
  let deliveries = 0;
  editor.events.register("replay", { type: "pointermove", priority: 0 }, (event) => {
    deliveries += 1;
    if (previous) {
      expect(previous()).toBeUndefined();
    }
    previous = () => event.input.target?.captureUncapturedPointerHit(event.input.pointerId);
    const hit = previous();
    expect(hit).toBeDefined();
    hit?.release();
    return "continue";
  });
  const detach = attachTestRoot(editor, root);
  try {
    const event = new MouseEvent("pointermove", { bubbles: true });
    root.dispatchEvent(event);
    root.dispatchEvent(event);
    expect(deliveries).toBe(2);
    expect(previous?.()).toBeUndefined();
  } finally {
    detach();
    editor.destroy();
    root.remove();
  }
});
