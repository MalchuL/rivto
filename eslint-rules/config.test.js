import assert from "node:assert/strict";
import test from "node:test";
import { ESLint } from "eslint";

const eslint = new ESLint();
const filePath = "demo/src/lint-rules.ts";

test("functions over 50 lines produce warnings only", async () => {
  for (const lines of [50, 51]) {
    const code = ["export function example() {", ...Array(lines - 2).fill("  void 0;"), "}"].join(
      "\n",
    );
    const [result] = await eslint.lintText(code, { filePath });
    assert.equal(result.errorCount, 0);
    assert.equal(result.warningCount, lines > 50 ? 1 : 0);
    if (lines > 50) {
      assert.equal(result.messages[0].ruleId, "max-lines-per-function");
      assert.equal(result.messages[0].severity, 1);
    }
  }
});

test("repository lint rules enforce method order, documentation, and ternaries", async (t) => {
  const cases = [
    {
      name: "private methods must follow public methods",
      code: "export class Example { private helper() {} run() {} }",
      rule: "@typescript-eslint/member-ordering",
    },
    {
      name: "static private methods must follow fields",
      code: "export class Example { private static helper() {} value = 1; }",
      rule: "@typescript-eslint/member-ordering",
    },
    {
      name: "JavaScript private methods must follow public methods",
      code: "export class Example { #helper() {} run() { this.#helper(); } }",
      rule: "@typescript-eslint/member-ordering",
    },
    {
      name: "nested ternaries are rejected",
      code: "export const value = Math.random() ? 1 : Math.random() ? 2 : 3;",
      rule: "no-nested-ternary",
    },
    ...[
      "export class Example { run() {} }",
      "export class Example { private helper() {} }",
      "export class Example { constructor() {} }",
      "export class Example { get value() { return 1; } }",
      "export class Example { set value(_value: number) {} }",
      "export class Example { run = () => {}; }",
      "export const example = { run() {} };",
      "export interface Example { run(): void; }",
    ].map((code) => ({ name: `requires JSDoc: ${code}`, code, rule: "jsdoc/require-jsdoc" })),
  ];

  for (const { name, code, rule } of cases) {
    await t.test(name, async () => {
      const [result] = await eslint.lintText(code, { filePath });
      assert.ok(
        result.messages.some((message) => message.ruleId === rule),
        rule,
      );
    });
  }

  await t.test(
    "documented methods pass and other members retain their relative order",
    async () => {
      const [result] = await eslint.lintText(
        `export class Example {
        /** Runs the example. */
        run() { this.helper(); }
        value = Math.random() ? 1 : 2;
        /** Provides the internal operation. */
        private helper() {}
      }`,
        { filePath },
      );
      assert.deepEqual(result.messages, []);
    },
  );
});
