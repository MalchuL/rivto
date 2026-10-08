/**
 * Runs colocated TypeScript runtime and domain tests with Node's built-in runner.
 * Explicit recursive discovery supports this workstation's Node version, which
 * does not discover TypeScript tests automatically. An empty suite is an error;
 * optional runner arguments let callers focus tests without a new test framework.
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files: string[] = [];
for (const path of readdirSync("src", { recursive: true, encoding: "utf8" })) {
  if (path.endsWith(".test.ts")) files.push(`src/${path}`);
}
if (files.length === 0) throw new Error("No application unit tests found.");
const result = spawnSync(process.execPath, [
  "--experimental-strip-types", "--test", ...process.argv.slice(2), ...files.sort(),
], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
