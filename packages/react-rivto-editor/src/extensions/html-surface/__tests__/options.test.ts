import { DEFAULT_HTML_SURFACE_LIMITS, resolveHtmlSurfaceLimits } from "../options";
import { htmlSurfaceExtension } from "../extension";

test("omitted options take the documented defaults", () => {
  expect(resolveHtmlSurfaceLimits()).toEqual({
    maxBlockHeight: 720,
    maxEditorPointerRegions: 64,
    previewDelayMs: 400,
  });
  expect(resolveHtmlSurfaceLimits({ maxBlockHeight: 1200 })).toEqual({
    ...DEFAULT_HTML_SURFACE_LIMITS,
    maxBlockHeight: 1200,
  });
});

test.each([
  { maxBlockHeight: 0 },
  { maxBlockHeight: -1 },
  { maxBlockHeight: Number.POSITIVE_INFINITY },
  { maxBlockHeight: Number.NaN },
  { previewDelayMs: -1 },
  { previewDelayMs: 2 ** 31 },
  { maxEditorPointerRegions: 0 },
  { maxEditorPointerRegions: 2.5 },
  { maxEditorPointerRegions: Number.POSITIVE_INFINITY },
])("rejects out-of-range options when the extension is created: %p", (options) => {
  expect(() => htmlSurfaceExtension(options)).toThrow(RangeError);
});
