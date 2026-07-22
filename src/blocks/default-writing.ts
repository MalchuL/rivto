import type { BlockDefinition } from "./types";
import { DEFAULT_BLOCK_TYPE } from "./constants";

/** Minimal writing block installed by every editor runtime. */
export const defaultBlockDefinitions: BlockDefinition[] = [
  { type: DEFAULT_BLOCK_TYPE, title: "Paragraph" },
];
