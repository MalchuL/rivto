/** Markdown attachment macro transformation regression coverage. @module */
import { remarkFileMacros } from "./file-macro";
import { remarkImageMacros } from "./image-macro";

interface TestNode {
  type: string;
  value?: string;
  children?: TestNode[];
}

describe("Markdown attachment macros", () => {
  test.each([
    ["file", remarkFileMacros, '{{file path="a" name="b" type="text/plain"}}', "link"],
    ["image", remarkImageMacros, '{{image path="a.png"}}', "image"],
  ])("visits nested nodes once for %s macros", (_kind, createTransformer, macro, nodeType) => {
    let visits = 0;
    const children: TestNode[] = [{ type: "text", value: macro }];
    let node: TestNode = {
      type: "paragraph",
      get children() {
        visits += 1;
        return children;
      },
      set children(value) {
        children.splice(0, children.length, ...value);
      },
    };
    for (let depth = 0; depth < 8; depth += 1) {
      node = { type: "container", children: [node] };
    }

    createTransformer()(node);

    expect(children[0]?.type).toBe(nodeType);
    expect(visits).toBeLessThanOrEqual(4);
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
