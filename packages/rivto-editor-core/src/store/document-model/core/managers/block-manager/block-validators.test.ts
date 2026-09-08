/**
 * Registration and ordered application of portable block validators.
 *
 * @module
 */
import type { BlockInput, BlockValidator } from "../../types";
import { BlockValidators } from "./block-validators";

const block = (type: string, props: Record<string, unknown> = {}): BlockInput => ({
  type,
  props,
});

describe("BlockValidators", () => {
  test("applies validators in registration order and supports remove", () => {
    const validators = new BlockValidators();
    expect(validators.apply(block("note", { n: 1 }), null)).toEqual(block("note", { n: 1 }));

    const tagParent: BlockValidator = (current, parentType) => ({
      ...current,
      props: { ...current.props, parent: parentType },
    });
    const bump: BlockValidator = (current) => ({
      ...current,
      props: { ...current.props, n: Number(current.props?.n) + 1 },
    });

    const disposeTag = validators.add(tagParent);
    validators.add(bump);
    expect(validators.apply(block("note", { n: 1 }), "page")).toEqual({
      type: "note",
      props: { n: 2, parent: "page" },
    });

    expect(validators.remove(bump)).toBe(true);
    expect(validators.remove(bump)).toBe(false);
    expect(validators.apply(block("note", { n: 1 }), "page")).toEqual({
      type: "note",
      props: { n: 1, parent: "page" },
    });

    disposeTag();
    disposeTag();
    expect(validators.apply(block("note", { n: 1 }), "page")).toEqual(block("note", { n: 1 }));
  });
});
