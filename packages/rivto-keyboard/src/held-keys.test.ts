import { HeldKeys, HeldKeyBinding } from "./held-keys";

it("reconciles missed modifiers and captures binding configuration", () => {
  const held = new HeldKeys();
  const configured = ["Shift+Alt"];
  const binding = new HeldKeyBinding(configured);
  configured[0] = "Control";
  held.reconcile({ ctrlKey: false, metaKey: false, altKey: true, shiftKey: true });
  expect(binding.matches(held)).toBe(true);
  held.reset();
  expect(binding.matches(held)).toBe(false);
});

it("supports ordinary held keys without consuming their events", () => {
  const held = new HeldKeys();
  const binding = new HeldKeyBinding(["a"]);
  const raw = new KeyboardEvent("keydown", { key: "a", code: "KeyA", cancelable: true });
  held.update(raw);
  expect(binding.matches(held)).toBe(true);
  expect(raw.defaultPrevented).toBe(false);
  held.update(new KeyboardEvent("keyup", { key: "a", code: "KeyA" }));
  expect(binding.matches(held)).toBe(false);
});
