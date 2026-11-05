/** Inline image macro grammar and source replacement regression tests. */
import {
  parseImageMacros,
  remarkImageMacros,
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

    expect(parseImageMacros(`before ${macro} after`)).toEqual([
      {
        uri: "../assets/a b.png",
        alt: 'A "quoted" image',
        width: 320,
        height: 180,
        start: 7,
        end: 7 + macro.length,
      },
    ]);
  });

  test("leaves invalid macros literal", () => {
    expect(parseImageMacros('{{image path="x" width=0}}')).toEqual([]);
    expect(parseImageMacros("{{image path=unquoted}}")).toEqual([]);
  });

  test("replaces only the selected macro", () => {
    const first = serializeImageMacro({ uri: "one.png" });
    const second = serializeImageMacro({ uri: "two.png" });
    const source = `${first} ${second}`;
    const parsed = parseImageMacros(source)[1]!;

    expect(
      replaceImageMacro(source, parsed, { uri: "two.png", alt: "Two", width: 40, height: 20 }),
    ).toBe(`${first} {{image path="two.png" alt="Two" width=40 height=20}}`);
  });

  test("rejoins automatic links inside macros while retaining unrelated links", () => {
    const uri = "https://example.test/image.jpg?a=1&b=2";
    const link = { type: "link", url: uri, children: [{ type: "text", value: uri }] };
    const tree = {
      type: "paragraph",
      children: [
        { type: "text", value: 'before {{image path="', position: { start: { offset: 10 } } },
        link,
        { type: "text", value: '" alt=""}} after ' },
        link,
      ],
    };
    remarkImageMacros()(tree);
    expect(tree.children).toEqual([
      { type: "text", value: "before " },
      expect.objectContaining({
        type: "image",
        url: uri,
        data: { hProperties: expect.objectContaining({ "data-rivto-image-start": 17 }) },
      }),
      { type: "text", value: " after " },
      link,
    ]);
  });

  test("recognizes a linked image macro after an earlier complete macro", () => {
    const uri = "https://example.test/image.jpg";
    const tree = {
      type: "paragraph",
      children: [
        { type: "text", value: '{{image path="first.png"}} {{image path="' },
        { type: "link", url: uri, children: [{ type: "text", value: uri }] },
        { type: "text", value: '"}}' },
      ],
    };
    remarkImageMacros()(tree);
    expect(tree.children.filter(({ type }) => type === "image")).toHaveLength(2);
  });
});
