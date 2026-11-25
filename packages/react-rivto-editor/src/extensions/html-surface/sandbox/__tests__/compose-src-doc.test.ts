import { HTML_CHANNEL } from "../../constants";
import { composeSrcDoc } from "../compose-src-doc";

test("html documents keep authored markup and install the node bridge", () => {
  const fragment = composeSrcDoc({ source: "<p>Hi</p>", token: "token-1", fit: "auto" });
  expect(fragment).toMatch(/<!DOCTYPE html>/);
  expect(fragment).toMatch(/<p>Hi<\/p>/);
  expect(fragment).toMatch(/window\.rivto/);
  expect(fragment).toMatch(/"token-1"/);
  expect(fragment.includes("height:100%")).toBe(false);

  const filled = composeSrcDoc({ source: "<p>Hi</p>", token: "token-1", fit: "fill" });
  expect(filled).toMatch(/height:100%/);

  const document = composeSrcDoc({
    source: "<!DOCTYPE html><html><head><title>T</title></head><body><p>Hi</p></body></html>",
    token: "token-2",
    fit: "auto",
  });
  expect(document.indexOf("window.rivto")).toBeLessThan(document.indexOf("</head>"));
  expect(document.match(/<!DOCTYPE/gi)).toHaveLength(1);
  expect(document).toMatch(/<title>T<\/title>/);
  expect(document.includes(HTML_CHANNEL)).toBe(true);
});

test("the bridge is installed before body content even when head is omitted", () => {
  const source = "<script>window.seen = typeof rivto;</script><header>Title</header>";
  const document = composeSrcDoc({ source, token: "t", fit: "auto" });
  expect(document.indexOf("window.rivto =")).toBeLessThan(document.indexOf("window.seen"));
});

test("optional capabilities are installed only when requested", () => {
  const plain = composeSrcDoc({ source: "<p></p>", token: "t", fit: "auto" });
  expect(plain).not.toMatch(/selectionKey/);
  expect(plain).not.toMatch(/unsafe-request/);
  const extended = composeSrcDoc({
    source: "<p></p>",
    token: "t",
    fit: "auto",
    selectionKey: "secret",
    unsafeAccessEnabled: false,
  });
  expect(extended).toMatch(/"secret"/);
  expect(extended).toMatch(/unsafe-request/);
});

test("the composed bridge is syntactically valid JavaScript", () => {
  const document = composeSrcDoc({
    source: "",
    token: "t",
    fit: "fill",
    selectionKey: "k",
    unsafeAccessEnabled: true,
  });
  const script = /<script>([\s\S]*)<\/script>/.exec(document)?.[1] ?? "";
  expect(() => new Function(script)).not.toThrow();
});
