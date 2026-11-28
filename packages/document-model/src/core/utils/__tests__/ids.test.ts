import { requireNonemptyId } from "..";

describe("requireNonemptyId", () => {
  it("rejects empty and whitespace-only IDs without rewriting valid IDs", () => {
    expect(() => requireNonemptyId("", "Block")).toThrow("Block ID is required");
    expect(() => requireNonemptyId("   ", "Link")).toThrow("Link ID is required");
    expect(requireNonemptyId(" kept ", "Block")).toBe(" kept ");
  });
});
