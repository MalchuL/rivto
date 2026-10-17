import type { Meta, StoryObj } from "@storybook/react-vite";
import { BlockResizeFrame } from "./block-resize-frame";
import { playBlockResize } from "./block-resize-check";

const meta = {
  title: "Blocks/Resize",
  component: BlockResizeFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof BlockResizeFrame>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Shrinks the page column from a desktop width down to a narrow card.
 *
 * @param context - Storybook play context for the mounted frame.
 * @param context.canvasElement - Root element containing the resize frame.
 * @returns Nothing after every width stays inside the page surface.
 */
export const ColumnWidths: Story = {
  name: "Column widths",
  play: async ({ canvasElement }) => {
    await playBlockResize(canvasElement, [960, 720, 480, 360, 280]);
  },
};

/**
 * Repeats the containment check for a narrow column, such as a card or sidebar.
 *
 * @param context - Storybook play context for the mounted frame.
 * @param context.canvasElement - Root element containing the resize frame.
 * @returns Nothing after the narrow column keeps blocks inside the page surface.
 */
export const NarrowColumn: Story = {
  name: "Narrow column",
  play: async ({ canvasElement }) => {
    await playBlockResize(canvasElement, [360, 280]);
  },
};
