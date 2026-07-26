import { z } from "zod";

export const PageIdSchema = z.string().uuid();

export type PageId = z.infer<typeof PageIdSchema>;

export const PageSchema = z.object({
  id: PageIdSchema,
  title: z.string().min(1).max(500),
  content: z.string(),
  parentId: PageIdSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Page = z.infer<typeof PageSchema>;

export function createPageTitle(input: string | undefined): string {
  const trimmed = input?.trim() ?? "";
  return trimmed.length > 0 ? trimmed.slice(0, 500) : "Untitled";
}
