/** Canonical generic file macro regression coverage. @module */
import { parseFileMacros, serializeFileMacro } from "./file-macro";

describe("file macros", () => {
  test("round-trips portable metadata and ignores malformed sizes", () => {
    const macro = serializeFileMacro({
      uri: "assets/report.pdf",
      name: "Quarterly report.pdf",
      mimeType: "application/pdf",
      size: 42,
    });

    expect(parseFileMacros(macro)).toEqual([{
      uri: "assets/report.pdf",
      name: "Quarterly report.pdf",
      mimeType: "application/pdf",
      size: 42,
      start: 0,
      end: macro.length,
    }]);
    expect(parseFileMacros('{{file path="a" name="b" type="text/plain" size=-1}}')).toEqual([]);
  });
});
