import { DEFAULT_HTML_SURFACE_LIMITS, resolveHtmlSurfaceLimits } from "../options";
import { htmlSurfaceExtension } from "../extension";

test("omitted options take the documented defaults", () => {
  expect(resolveHtmlSurfaceLimits()).toEqual({ maxBlockHeight: 720, maxDragRegions: 64 });
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
  { maxDragRegions: 0 },
  { maxDragRegions: 2.5 },
  { maxDragRegions: Number.POSITIVE_INFINITY },
])("rejects out-of-range options when the extension is created: %p", (options) => {
  expect(() => htmlSurfaceExtension(options)).toThrow(RangeError);
});
