"use client";

import {
  DEFAULT_TAG_COLOR,
  TAG_COLOR_PRESETS,
  type AvailableTag,
} from "@chulane/app";
import {
  useCreateTagMutation,
  useDeleteTagMutation,
  useProjectTagsQuery,
  useUpdateTagMutation,
} from "@chulane/app/client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { TagChip } from "@/domain/tag/components/tag-chip";
import { cn } from "@/lib/utils";

function TagFormDialog({
  open,
  onOpenChange,
  title,
  initialName = "",
  initialDescription = "",
  initialColor = DEFAULT_TAG_COLOR,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialName?: string;
  initialDescription?: string;
  initialColor?: string;
  onSubmit: (name: string, description: string, color: string) => Promise<void>;
  submitting: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [color, setColor] = useState(initialColor);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(initialName);
          setDescription(initialDescription);
          setColor(initialColor);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Name</label>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">#</span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="architecture"
                autoFocus
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Description (optional)
            </label>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Shown on hover"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Color</label>
            <div className="flex flex-wrap gap-2">
              {TAG_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={`Color ${preset}`}
                  onClick={() => setColor(preset)}
                  className={cn(
                    "size-6 rounded-full border-2 transition-transform",
                    color === preset
                      ? "scale-110 border-foreground"
                      : "border-transparent hover:scale-105",
                  )}
                  style={{ backgroundColor: preset }}
                />
              ))}
              <Input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-6 w-10 cursor-pointer border-0 p-0"
                aria-label="Custom color"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || submitting}
            onClick={() => void onSubmit(name, description, color)}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectTagsPanel({ projectId }: { projectId: string }) {
  const { data: tags = [] } = useProjectTagsQuery(projectId);
  const createTag = useCreateTagMutation();
  const updateTag = useUpdateTagMutation();
  const deleteTag = useDeleteTagMutation();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AvailableTag | null>(null);

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Tags</h2>
        <Button variant="ghost" size="sm" className="h-7" onClick={() => setCreateOpen(true)}>
          <Plus />
          Add
        </Button>
      </div>

      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tags yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) =>
            tag.inherited ? (
              <TagChip key={tag.id} tag={tag} />
            ) : (
              <DropdownMenu key={tag.id}>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="rounded-md outline-none">
                    <TagChip tag={tag} interactive />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem onSelect={() => setEditing(tag)}>
                    <Pencil />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => void deleteTag.mutateAsync(tag.id)}
                  >
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          )}
        </div>
      )}

      <TagFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New tag"
        submitting={createTag.isPending}
        onSubmit={async (name, description, color) => {
          await createTag.mutateAsync({ projectId, name, description, color });
          setCreateOpen(false);
        }}
      />

      <TagFormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title="Edit tag"
        initialName={editing?.name ?? ""}
        initialDescription={editing?.description ?? ""}
        initialColor={editing?.color ?? DEFAULT_TAG_COLOR}
        submitting={updateTag.isPending}
        onSubmit={async (name, description, color) => {
          if (!editing) return;
          await updateTag.mutateAsync({ id: editing.id, name, description, color });
          setEditing(null);
        }}
      />
    </section>
  );
}
