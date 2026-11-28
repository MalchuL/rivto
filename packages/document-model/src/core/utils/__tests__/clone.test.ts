import { clone } from "..";

describe("clone", () => {
  it("clones records without copying dangerous keys", () => {
    const source = JSON.parse('{"safe":1,"__proto__":{"polluted":true}}') as Record<
      string,
      unknown
    >;
    const copied = clone(source);
    expect(copied).toEqual({ safe: 1 });
    expect(Object.prototype.hasOwnProperty.call(copied, "__proto__")).toBe(false);
  });
});
