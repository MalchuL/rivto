"use client";

import {
  useProjectTagsQuery,
  useUpdatePageMutation,
} from "@chulane/app/client";
import { Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TagChip } from "@/domain/tag/components/tag-chip";
import { formatTagName } from "@chulane/app";

export function PageTagPicker({
  pageId,
  projectId,
  tagIds,
}: {
  pageId: string;
  projectId: string;
  tagIds: string[];
}) {
  const { data: available = [] } = useProjectTagsQuery(projectId);
  const updatePage = useUpdatePageMutation();

  const selected = new Set(tagIds);
  const byId = new Map(available.map((tag) => [tag.id, tag]));

  const toggle = (tagId: string) => {
    const next = selected.has(tagId)
      ? tagIds.filter((id) => id !== tagId)
      : [...tagIds, tagId];
    void updatePage.mutateAsync({ id: pageId, tagIds: next });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tagIds.map((id) => {
        const tag = byId.get(id);
        if (!tag) return null;
        return <TagChip key={id} tag={tag} />;
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
            <Tags />
            Tags
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Project tags</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {available.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              No tags in this project yet.
            </div>
          ) : (
            available.map((tag) => (
              <DropdownMenuCheckboxItem
                key={tag.id}
                checked={selected.has(tag.id)}
                onCheckedChange={() => toggle(tag.id)}
              >
                <span
                  className="mr-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {formatTagName(tag.name)}
                {tag.inherited ? (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    · {tag.ownerProjectName}
                  </span>
                ) : null}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
