import type { ReactNode } from "react";
import type { ToolCategory } from "../types";

/** Upward popover chrome with Tools / Defaults sections. */
export function ToolPopover({
  category,
  tools,
  defaults,
}: {
  category: ToolCategory;
  tools: ReactNode;
  defaults?: ReactNode;
}) {
  return (
    <div className="edgeless-tool-popover" data-edgeless-ui="true" role="menu" aria-label={`${category} tools`}>
      <section className="edgeless-tool-popover-section">
        <h3 className="edgeless-tool-popover-heading">Tools</h3>
        <div className="edgeless-tool-popover-tools">{tools}</div>
      </section>
      {defaults && (
        <section className="edgeless-tool-popover-section">
          <h3 className="edgeless-tool-popover-heading">Defaults</h3>
          <div className="edgeless-tool-popover-defaults">{defaults}</div>
        </section>
      )}
    </div>
  );
}
