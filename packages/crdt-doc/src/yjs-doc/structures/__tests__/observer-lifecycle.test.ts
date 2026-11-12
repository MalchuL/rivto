import * as Y from "yjs";
import { YjsArray } from "../array";
import { YjsMap } from "../map";

test.each(["map", "array"] as const)(
  "%s observer handles remove only their own registration and retry failures",
  (kind) => {
    const doc = new Y.Doc();
    const native = kind === "map" ? doc.getMap("root") : doc.getArray("root");
    const wrapper = native instanceof Y.Map ? new YjsMap(native) : new YjsArray(native);
    let notifications = 0;
    const handler = () => {
      notifications++;
    };
    const first = wrapper.observe(handler);
    const second = wrapper.observe(handler);
    const update = () => {
      if (native instanceof Y.Map) {
        native.set("value", notifications);
      } else {
        native.push([notifications]);
      }
    };
    update();
    expect(notifications).toBe(2);
    const remove = jest.spyOn(native, "unobserveDeep").mockImplementationOnce(() => {
      throw new Error("remove failed");
    });
    expect(first).toThrow("remove failed");
    update();
    expect(notifications).toBe(4);
    first();
    first();
    update();
    expect(notifications).toBe(5);
    second();
    update();
    expect(notifications).toBe(5);
    remove.mockRestore();
    doc.destroy();
  },
);
