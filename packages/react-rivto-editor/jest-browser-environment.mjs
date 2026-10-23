import { TestEnvironment } from "jest-environment-jsdom";
import { randomUUID } from "node:crypto";

/** Supplies native cloning and UUIDs missing from Jest's older jsdom realm. */
export default class BrowserTestEnvironment extends TestEnvironment {
  /**
   * Retains jsdom's DOM and supplies the host runtime's native data primitives.
   *
   * @param config - Jest project environment configuration.
   * @param context - Current test suite metadata supplied by Jest.
   */
  constructor(config, context) {
    super(config, context);
    this.global.structuredClone = structuredClone;
    this.global.crypto.randomUUID = randomUUID;
  }
}
