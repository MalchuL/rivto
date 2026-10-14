import assert from "node:assert/strict";
import test from "node:test";
import { ESLint } from "eslint";
import * as prettier from "prettier";

const eslint = new ESLint();
const filePath = "demo/src/lint-rules.ts";

test("non-empty blocks require line breaks inside their braces", async () => {
  const cases = [
    "if (Math.random()) { void 0; }",
    "for (const item of []) { void item; }",
    "export function run() { void 0; }",
    "export const run = () => { void 0; };",
    "export class Example {\n/** Runs the example. */\nrun() { void 0; }\n}",
    "export class LongArrayWrapperNameForMultilineClassHeaderFormatting extends Array<number> implements Iterable<number> { value = 1; }",
    "export function run(value: boolean) { if (value) { return 1; }\n// Preserve the branch explanation.\nelse { return 2; } }",
  ];
  const fixingEslint = new ESLint({ fix: true });
  for (const code of cases) {
    const [result] = await eslint.lintText(code, { filePath });
    assert.ok(
      result.messages.some(
        (message) => message.ruleId === "@stylistic/curly-newline" && message.severity === 2,
      ),
    );
    const [fixed] = await fixingEslint.lintText(code, { filePath });
    assert.equal(fixed.errorCount, 0);
    assert.match(fixed.output, /\{\n/);
    const formatted = await prettier.format(fixed.output, {
      ...(await prettier.resolveConfig(filePath)),
      filepath: filePath,
    });
    const [afterFormatting] = await eslint.lintText(formatted, { filePath });
    assert.equal(afterFormatting.errorCount, 0);
  }
  const [empty] = await eslint.lintText("export function run() {}", { filePath });
  assert.deepEqual(empty.messages, []);
});

test("control-flow bodies require braces even for a single statement", async () => {
  const bodies = [
    "if (Math.random()) void 0;",
    "if (Math.random()) { void 1; } else void 0;",
    "for (let i = 0; i < 2; i++) void i;",
    "for (const key in {}) void key;",
    "for (const item of []) void item;",
    "while (Math.random()) void 0;",
    "do void 0; while (Math.random());",
  ];
  const fixingEslint = new ESLint({ fix: true });
  for (const code of bodies) {
    const [result] = await eslint.lintText(code, { filePath });
    assert.ok(
      result.messages.some((message) => message.ruleId === "curly" && message.severity === 2),
    );
    const [fixed] = await fixingEslint.lintText(code, { filePath });
    assert.equal(fixed.errorCount, 0);
    assert.match(fixed.output, /\{\s*void/);
  }
});

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
        run() {
          this.helper();
        }
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
