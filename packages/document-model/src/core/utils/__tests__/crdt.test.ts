/**
 * Verifies the document-model helpers that mutate adapter-neutral CRDT values.
 * These checks protect both helper behavior and the public core utility exports.
 */
import { YjsDoc } from "@chulane/crdt-doc";
import { assignArray } from "..";

describe("CRDT utilities", () => {
  it("replaces or appends shared array items", () => {
    const array = new YjsDoc("assign-array").getArray<string>("items");
    array.push("old");

    assignArray(array, ["first", "second"]);
    expect(array.toArray()).toEqual(["first", "second"]);

    assignArray(array, ["third"], false);
    expect(array.toArray()).toEqual(["first", "second", "third"]);
  });
});
