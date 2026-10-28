const jest = (import.meta as ImportMeta & { jest: typeof globalThis.jest }).jest;
import { ChildrenPanel } from "@chulane/rivto";
import { createTestCoreEditor } from "../../test-utils";
import { scheduleCardHeight } from "./card-height-updates";

const card = { type: "block", frame: { x: 0, y: 0, width: 720, height: 120 }, zIndex: 0 };

test("publishes sibling measurements in one transaction after all layout reads", async () => {
  const core = await createTestCoreEditor();
  const panel = new ChildrenPanel(core, {});
  const first = panel.elements.insertElement(card);
  const second = panel.elements.insertElement(card);
  const batch = jest.spyOn(panel, "batchUpdatesWithoutHistory");
  try {
    scheduleCardHeight(panel, first.id, 720, 240);
    scheduleCardHeight(panel, second.id, 720, 360);
    expect(panel.elements.getElementNode(first.id)!.frame.height).toBe(120);
    expect(batch).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(batch).toHaveBeenCalledTimes(1);
    expect(panel.elements.getElementNode(first.id)!.frame.height).toBe(240);
    expect(panel.elements.getElementNode(second.id)!.frame.height).toBe(360);
    batch.mockClear();
    const cancel = scheduleCardHeight(panel, first.id, 720, 480);
    cancel();
    await Promise.resolve();
    expect(batch).not.toHaveBeenCalled();
    expect(panel.elements.getElementNode(first.id)!.frame.height).toBe(240);
  } finally {
    batch.mockRestore();
    await core.destroy();
  }
});

test("skips stale measurements and keeps a newer mount's measurement when older cleanup runs", async () => {
  const core = await createTestCoreEditor();
  const panel = new ChildrenPanel(core, {});
  const [replaced, fixed, resized, removed] = Array.from({ length: 4 }, () =>
    panel.elements.insertElement(card),
  );
  try {
    const cancel = scheduleCardHeight(panel, replaced!.id, 720, 160);
    scheduleCardHeight(panel, replaced!.id, 720, 240);
    cancel();
    scheduleCardHeight(panel, fixed!.id, 720, 240);
    scheduleCardHeight(panel, resized!.id, 720, 240);
    scheduleCardHeight(panel, removed!.id, 720, 240);
    panel.elements.updateElement(fixed!.id, { props: { autoHeight: false } });
    panel.elements.updateElement(resized!.id, { frame: { width: 800 } });
    panel.elements.removeElement(removed!.id);
    await Promise.resolve();
    expect(panel.elements.getElementNode(replaced!.id)!.frame.height).toBe(240);
    expect(panel.elements.getElementNode(fixed!.id)!.frame.height).toBe(120);
    expect(panel.elements.getElementNode(resized!.id)!.frame).toMatchObject({
      width: 800,
      height: 120,
    });
    expect(panel.elements.getElementNode(removed!.id)).toBeUndefined();
  } finally {
    await core.destroy();
  }
});
