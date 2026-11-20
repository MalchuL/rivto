import * as browser from "../browser";

it("keeps native listener and text-selection implementations private", () => {
  expect(browser).not.toHaveProperty("NativeEventListeners");
  expect(browser).not.toHaveProperty("BrowserInputListeners");
  expect(browser).not.toHaveProperty("captureTextSelection");
  expect(browser).not.toHaveProperty("captureBrowserInputHit");
  expect(browser).not.toHaveProperty("readBrowserInputHit");
  expect(browser).not.toHaveProperty("observeDocumentOffsetAndFollowEnd");
  expect(browser.BrowserInputRoot).toBeDefined();
});
