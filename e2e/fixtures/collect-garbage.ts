import type { CDPSession, Page } from "@playwright/test";

/**
 * Runs repeated Chromium garbage collection across separate event-loop turns.
 *
 * The caller owns the protocol session and must detach it after inspecting weak references.
 *
 * @param page - Page used to yield between collection passes.
 * @param session - Chromium protocol session attached to that page.
 * @returns A promise resolving after eight collection passes.
 * @throws If waiting or a protocol request fails.
 */
export async function collectGarbage(page: Page, session: CDPSession): Promise<void> {
  for (let index = 0; index < 8; index++) {
    await page.waitForTimeout(0);
    await session.send("HeapProfiler.collectGarbage");
  }
}
