/** Inline image macro grammar and source replacement regression tests. */
import {
  parseImageMacros,
  replaceImageMacro,
  serializeImageMacro,
} from "./image-macro";

describe("image macros", () => {
  test("round trips quoted metadata and dimensions", () => {
    const macro = serializeImageMacro({
      uri: "../assets/a b.png",
      alt: 'A "quoted" image',
      width: 320,
      height: 180,
    });

    expect(parseImageMacros(`before ${macro} after`)).toEqual([{
      uri: "../assets/a b.png",
      alt: 'A "quoted" image',
      width: 320,
      height: 180,
      start: 7,
      end: 7 + macro.length,
    }]);
  });

  test("leaves invalid macros literal", () => {
    expect(parseImageMacros('{{image path="x" width=0}}')).toEqual([]);
    expect(parseImageMacros("{{image path=unquoted}}" )).toEqual([]);
  });

  test("replaces only the selected macro", () => {
    const first = serializeImageMacro({ uri: "one.png" });
    const second = serializeImageMacro({ uri: "two.png" });
    const source = `${first} ${second}`;
    const parsed = parseImageMacros(source)[1]!;

    expect(replaceImageMacro(source, parsed, { uri: "two.png", alt: "Two", width: 40, height: 20 }))
      .toBe(`${first} {{image path="two.png" alt="Two" width=40 height=20}}`);
  });
});
