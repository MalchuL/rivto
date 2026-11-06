import { renderToStaticMarkup } from "react-dom/server";
import { EditorFontsProvider, useEditorFonts } from "./editor-fonts";

/**
 * Displays the current configuration to check provider inheritance without a browser.
 * @returns A span containing the active default family and ordered catalog labels for SSR assertions.
 */
function FontConfiguration() {
  const { fonts, defaultFontFamily } = useEditorFonts();
  return (
    <span>
      {defaultFontFamily}:{fonts.map((font) => font.label).join(",")}
    </span>
  );
}

test("catalogs replace built-ins and nested providers keep independent defaults", () => {
  const markup = renderToStaticMarkup(
    <>
      <FontConfiguration />
      <EditorFontsProvider
        fonts={[{ label: "Outer", fontFamily: "Georgia, serif" }]}
        defaultFontFamily="Georgia, serif"
      >
        <FontConfiguration />
        <EditorFontsProvider
          fonts={[{ label: "Inner", fontFamily: "monospace" }]}
          defaultFontFamily="monospace"
        >
          <FontConfiguration />
        </EditorFontsProvider>
        <FontConfiguration />
      </EditorFontsProvider>
    </>,
  );
  expect(markup).toContain("Sans,Serif,Mono");
  expect(markup.match(/Georgia, serif:Outer/g)).toHaveLength(2);
  expect(markup).toContain("monospace:Inner");
});

test.each([
  { fonts: [], defaultFontFamily: "serif" },
  { fonts: [{ label: "Empty", fontFamily: " " }], defaultFontFamily: " " },
  { fonts: [{ label: "Serif", fontFamily: "serif" }], defaultFontFamily: "sans-serif" },
  {
    fonts: [
      { label: "A", fontFamily: "serif" },
      { label: "B", fontFamily: "serif" },
    ],
    defaultFontFamily: "serif",
  },
])("rejects invalid font configuration %#", (configuration) => {
  expect(() => renderToStaticMarkup(<EditorFontsProvider {...configuration} />)).toThrow(
    "Editor fonts require unique nonempty families and a default in the catalog",
  );
});
