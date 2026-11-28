import { validateHtmlElementProps } from "../html-element-props";

test("element props require html and portable widget data", () => {
  expect(() => validateHtmlElementProps({ label: "HTML" })).toThrow();
  expect(validateHtmlElementProps({ html: "<p></p>", speed: 6 }).speed).toBe(6);
  expect(validateHtmlElementProps({ html: "<p></p>", removed: undefined })).toBeDefined();
  expect(() => validateHtmlElementProps({ html: "<p></p>", speed: Number.NaN })).toThrow();
  expect(() =>
    validateHtmlElementProps(
      JSON.parse('{"html":"<p></p>","constructor":1}') as Record<string, unknown>,
    ),
  ).toThrow();
});
