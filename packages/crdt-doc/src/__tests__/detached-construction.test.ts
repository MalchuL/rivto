/**
 * Verifies the public detached-construction API for both adapter-neutral and
 * deliberately Yjs-specific consumers.
 */
import { YjsArray, YjsDoc, YjsMap, YjsNotAttachedError, YjsText } from "../index";

describe("detached CRDT construction", () => {
  it("creates detached values whose writes survive attachment", async () => {
    const document = new YjsDoc("detached-construction");
    const root = document.getMap("root");
    const items = document.createDetachedArray<string>();
    const metadata = document.createDetachedMap();
    const content = document.createDetachedText();

    items.push("first");
    content.insert(0, "hello");
    expect(() => items.length).toThrow(YjsNotAttachedError);
    expect(() => metadata.size).toThrow(YjsNotAttachedError);
    expect(() => content.toString()).toThrow(YjsNotAttachedError);

    root.set("items", items);
    root.set("metadata", metadata);
    root.set("content", content);

    expect(items.toArray()).toEqual(["first"]);
    expect(content.toString()).toBe("hello");
    await document.destroy();
  });

  it("exports directly constructible Yjs wrappers", async () => {
    const document = new YjsDoc("direct-construction");
    const root = document.getMap("root");

    root.set("items", new YjsArray<string>());
    root.set("metadata", new YjsMap());
    root.set("content", new YjsText());

    expect(root.get("items")).toBeInstanceOf(YjsArray);
    expect(root.get("metadata")).toBeInstanceOf(YjsMap);
    expect(root.get("content")).toBeInstanceOf(YjsText);
    await document.destroy();
  });
});
