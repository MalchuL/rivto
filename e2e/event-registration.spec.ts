import { expect, test } from "@playwright/test";
import type { ReactEditor } from "@chulane/rivto-react";

/** Production host runtime with an observable trace owned by this test. */
interface EventInspection {
  readonly __rivtoDemo: { readonly reactEditor: ReactEditor };
  __eventTrace: string[];
}

/**
 * Installs a native button and host handlers that mutate their own registrations.
 *
 * @param root - Mounted production Page surface owning the test button.
 * @returns The next button clicks append delivery order to the test trace.
 */
function installRegistrationTrace(root: Element): void {
  const inspection = window as unknown as EventInspection;
  inspection.__eventTrace = [];
  const events = inspection.__rivtoDemo.reactEditor.events;
  const button = document.createElement("button");
  button.textContent = "Test event registration";
  button.setAttribute("data-editor-control", "");
  root.prepend(button);
  const definition = {
    type: "click" as const,
    when: ({ raw }: { raw: Event }) => raw.target === button,
  };
  const removeCapture = events.register(
    { ...definition, id: "test.capture", capture: true },
    () => {
      inspection.__eventTrace.push("capture");
      removeCapture();
      events.register({ ...definition, id: "test.new", target: "window" }, () => {
        inspection.__eventTrace.push("new");
      });
    },
  );
  const removeBubble = events.register({ ...definition, id: "test.bubble" }, () => {
    inspection.__eventTrace.push("bubble");
    removeBubble();
  });
  for (const registration of [
    { id: "passive", passive: true },
    { id: "window", target: "window" as const },
  ]) {
    events.register({ ...definition, ...registration }, () => {
      inspection.__eventTrace.push(registration.id);
    });
  }
}

test("registration changes preserve pending native delivery and defer new handlers", async ({
  page,
}) => {
  await page.goto("/?test_features=1");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await expect(surface).toBeVisible();
  await surface.evaluate(installRegistrationTrace);
  const button = page.getByRole("button", { name: "Test event registration", exact: true });
  await button.click();
  expect(await page.evaluate(() => (window as unknown as EventInspection).__eventTrace)).toEqual([
    "capture",
    "bubble",
    "passive",
    "window",
  ]);
  await page.evaluate(() => {
    (window as unknown as EventInspection).__eventTrace = [];
  });
  await button.click();
  expect(await page.evaluate(() => (window as unknown as EventInspection).__eventTrace)).toEqual([
    "passive",
    "window",
    "new",
  ]);
});
