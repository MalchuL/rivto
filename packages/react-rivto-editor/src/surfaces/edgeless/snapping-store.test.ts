import { EdgelessSnappingStore } from "./snapping-store";

describe("EdgelessSnappingStore", () => {
  test("publishes stable host-owned snapping settings", () => {
    const store = new EdgelessSnappingStore({ snapToGrid: false });
    const initial = store.getSnapshot();
    const snapshots: unknown[] = [];
    const unsubscribe = store.subscribe(() => snapshots.push(store.getSnapshot()));

    expect(initial).toEqual({ snapToGrid: false, alignObjects: true });
    expect(store.getSnapshot()).toBe(initial);
    store.set({ snapToGrid: false });
    expect(snapshots).toEqual([]);
    store.set({ snapToGrid: true, alignObjects: false });
    expect(snapshots).toEqual([{ snapToGrid: true, alignObjects: false }]);
    unsubscribe();
    store.set({ alignObjects: true });
    expect(snapshots).toHaveLength(1);
  });
});
