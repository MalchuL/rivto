/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import type { PointerInput } from "@chulane/rivto-root";

it("provides pointer data and focus without exposing its target, and rejects stale focus", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  const card = document.createElement("div");
  card.dataset.card = "first";
  card.tabIndex = -1;
  const target = document.createElement("span");
  card.append(target);
  const other = document.createElement("button");
  root.append(card, other);
  document.body.append(root);
  let input: PointerInput | undefined;
  panel.editor.events.register({ id: "pointer-test", type: "pointerdown" }, (event) => {
    input = event.pointerInput;
    expect(input?.target?.ancestorAttribute("[data-card]", "data-card")).toBe("first");
    input?.focusTargetAncestor("[data-card]");
  });
  try {
    panel.setRoot(root);
    target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 42 }));
    expect(input?.clientX).toBe(42);
    expect(input?.isCurrentRealmElement()).toBe(true);
    expect(input).not.toHaveProperty("raw");
    expect(document.activeElement).toBe(card);
    panel.setRoot(null);
    other.focus();
    input?.focusTargetAncestor("[data-card]");
    expect(document.activeElement).toBe(other);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
