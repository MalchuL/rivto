import { createElement } from "react";
import {
  isExecutableScriptUrl,
  nodeText,
} from "../blocks/markdown/markdown-html";

describe("nodeText", () => {
  it("keeps CSS and script whitespace from nested elements", () => {
    const css = "div > span {\n  color: red;\n}\n";
    expect(nodeText(css)).toBe(css);
    expect(nodeText(createElement("span", null, "a", createElement("b", null, "b")))).toBe("ab");
  });
});

describe("isExecutableScriptUrl", () => {
  it("allows http and relative script URLs", () => {
    expect(isExecutableScriptUrl("https://example.com/app.js")).toBe(true);
    expect(isExecutableScriptUrl("http://example.com/app.js")).toBe(true);
    expect(isExecutableScriptUrl("/assets/app.js")).toBe(true);
    expect(isExecutableScriptUrl("./app.js")).toBe(true);
    expect(isExecutableScriptUrl("//cdn.example.com/app.js")).toBe(true);
  });

  it("rejects script URLs that are not document resources", () => {
    expect(isExecutableScriptUrl("javascript:alert(1)")).toBe(false);
    expect(isExecutableScriptUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isExecutableScriptUrl("data:text/javascript,alert(1)")).toBe(false);
    expect(isExecutableScriptUrl("   ")).toBe(false);
  });
});
