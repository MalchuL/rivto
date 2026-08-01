import type { BlockDefinition } from "@chulane/rivto";
import { z } from "zod";

/** Demo-only custom block type backed by text plus a numeric range property. */
export const SLIDER_BLOCK_TYPE = "demo.slider";

/** Demo-only contentless block type backed by a click counter property. */
export const COUNTER_BLOCK_TYPE = "demo.counter";

/** Validated Slider data contract installed by the demo plugin. */
export const sliderBlockDefinition: BlockDefinition = {
  type: SLIDER_BLOCK_TYPE,
  title: "Slider",
  defaultProps: { value: 50 },
  propSchema: z.object({ value: z.number().min(0).max(100) }).strict(),
};

/** Validated contentless Counter data contract installed by the demo plugin. */
export const counterBlockDefinition: BlockDefinition = {
  type: COUNTER_BLOCK_TYPE,
  title: "Counter",
  defaultProps: { count: 0 },
  propSchema: z.object({ count: z.number().int().nonnegative() }).strict(),
  toRawText: (block) => `Count: ${block.props.count}`,
};
