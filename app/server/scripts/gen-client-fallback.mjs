import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(
  root,
  "../shared/src/infrastructure/api/encore-client.gen.ts",
);

const contents = `/**
 * Fallback stub when \`encore gen client\` is unavailable.
 * The hand-written client in \`./client.ts\` is the Stage-1 source of truth.
 * Run \`pnpm gen:client\` after installing the Encore CLI to regenerate.
 */
export const ENCORE_CLIENT_GENERATED = false;
`;

writeFileSync(out, contents);
console.log(`Wrote fallback client stub to ${out}`);
