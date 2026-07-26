import type { PageId } from "../../domain/page/page";
import type { PageRepository } from "../../domain/page/page-repository";
import type { PageDto, UpdatePageRequest } from "./page-dto";

export async function updatePage(
  repo: PageRepository,
  id: PageId,
  input: UpdatePageRequest,
): Promise<PageDto> {
  return repo.update({
    id,
    title: input.title,
    content: input.content,
    parentId: input.parentId,
  });
}
