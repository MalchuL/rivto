import type { PageRepository } from "../../domain/page/page-repository";
import type { CreatePageRequest, PageDto } from "./page-dto";

export async function createPage(
  repo: PageRepository,
  input: CreatePageRequest = {},
): Promise<PageDto> {
  return repo.create({
    title: input.title,
    content: input.content,
    parentId: input.parentId ?? null,
  });
}
