import assert from "node:assert/strict";
import test from "node:test";

const { crypto } = globalThis;

test("UUID fallback uses random bytes with v4 version and variant bits", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
  const getRandomValues = crypto.getRandomValues;
  try {
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true, writable: true });
    crypto.getRandomValues = bytes => bytes.fill(255);
    await import("../src/crypto-polyfill.ts?fallback");
    assert.equal(crypto.randomUUID(), "ffffffff-ffff-4fff-bfff-ffffffffffff");
  } finally {
    crypto.getRandomValues = getRandomValues;
    if (descriptor) Object.defineProperty(crypto, "randomUUID", descriptor);
    else delete crypto.randomUUID;
  }
});

test("keeps native randomUUID when available", async () => {
  const native = crypto.randomUUID;
  await import("../src/crypto-polyfill.ts?native");
  assert.equal(crypto.randomUUID, native);
});
