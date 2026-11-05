/** Canonical generic file macro regression coverage. @module */
import { parseFileMacros, remarkFileMacros, serializeFileMacro } from "./file-macro";
import { remarkImageMacros } from "../../image/macro/image-macro";

interface TestNode {
  type: string;
  value?: string;
  children?: TestNode[];
}

describe("file macros", () => {
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

  test("round-trips portable metadata and ignores malformed sizes", () => {
    const macro = serializeFileMacro({
      uri: "assets/report.pdf",
      name: "Quarterly report.pdf",
      mimeType: "application/pdf",
      size: 42,
    });

    expect(parseFileMacros(macro)).toEqual([
      {
        uri: "assets/report.pdf",
        name: "Quarterly report.pdf",
        mimeType: "application/pdf",
        size: 42,
        start: 0,
        end: macro.length,
      },
    ]);
    expect(parseFileMacros('{{file path="a" name="b" type="text/plain" size=-1}}')).toEqual([]);
  });
});
