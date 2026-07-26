import { z } from "zod";
import { PageSchema } from "../../domain/page/page";

export const PageDtoSchema = PageSchema;
export type PageDto = z.infer<typeof PageDtoSchema>;

export const CreatePageRequestSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  parentId: z.string().uuid().nullable().optional(),
});
export type CreatePageRequest = z.infer<typeof CreatePageRequestSchema>;

export const UpdatePageRequestSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  parentId: z.string().uuid().nullable().optional(),
});
export type UpdatePageRequest = z.infer<typeof UpdatePageRequestSchema>;

export const ListPagesResponseSchema = z.object({
  pages: z.array(PageDtoSchema),
});
export type ListPagesResponse = z.infer<typeof ListPagesResponseSchema>;
