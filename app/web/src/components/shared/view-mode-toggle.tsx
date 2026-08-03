"use client";

import { AlignJustify, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CollectionViewMode } from "@/domain/workspace/store/ui-store";
import { cn } from "@/lib/utils";

export function ViewModeToggle({
  value,
  onChange,
}: {
  value: CollectionViewMode;
  onChange: (mode: CollectionViewMode) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-md border bg-muted/40 p-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "size-7",
              value === "list" && "bg-background shadow-sm hover:bg-background",
            )}
            onClick={() => onChange("list")}
            aria-label="List view"
            aria-pressed={value === "list"}
          >
            <List />
          </Button>
        </TooltipTrigger>
        <TooltipContent>List</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "size-7",
              value === "linked" && "bg-background shadow-sm hover:bg-background",
            )}
            onClick={() => onChange("linked")}
            aria-label="Linked editors"
            aria-pressed={value === "linked"}
          >
            <AlignJustify />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Linked</TooltipContent>
      </Tooltip>
    </div>
  );
}
