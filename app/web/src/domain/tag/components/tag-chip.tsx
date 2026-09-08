"use client";

import { formatTagName, type AvailableTag, type Tag } from "@chulane/app";
import { Lock } from "lucide-react";
import type { CSSProperties } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type TagLike = Pick<Tag, "name" | "color" | "description"> & {
  inherited?: boolean;
  ownerProjectName?: string;
};

function chipStyle(color: string): CSSProperties {
  return {
    backgroundColor: `${color}22`,
    color,
    borderColor: `${color}55`,
  };
}

export function TagChip({
  tag,
  className,
  onClick,
  interactive = false,
}: {
  tag: TagLike | AvailableTag;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}) {
  const label = formatTagName(tag.name);
  const tip = [
    tag.description,
    tag.inherited && tag.ownerProjectName
      ? `From ${tag.ownerProjectName} (read-only)`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const chip = (
    <span
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium transition-colors",
        interactive && "cursor-pointer hover:brightness-95",
        className,
      )}
      style={chipStyle(tag.color)}
    >
      <span className="truncate">{label}</span>
      {tag.inherited ? <Lock className="size-2.5 shrink-0 opacity-70" /> : null}
    </span>
  );

  if (!tip) return chip;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="font-medium" style={{ color: tag.color }}>
          {label}
        </p>
        {tag.description ? (
          <p className="mt-0.5 text-background/90">{tag.description}</p>
        ) : null}
        {tag.inherited && tag.ownerProjectName ? (
          <p className="mt-0.5 text-[11px] text-background/70">
            From {tag.ownerProjectName}
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
