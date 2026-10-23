import { BlockDropGap, type BlockChildrenGapProps } from "@chulane/rivto-page";

/**
 * Reserves a Page-owned insertion strip between horizontally arranged container lanes.
 *
 * Canonical neighbors come from Page's child iterator; the host only chooses the
 * flow axis. No children are rendered again and no drag listeners are installed.
 *
 * @param props - Actual parent and adjacent child IDs supplied by BlockChildren.
 * @returns A vertical hit region for the current canonical sibling gap.
 */
export function HorizontalDropGap(props: BlockChildrenGapProps) {
  return <BlockDropGap {...props} axis="horizontal" />;
}
