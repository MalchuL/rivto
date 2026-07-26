import type { PageId } from "../../domain/page/page";
import type { PageRepository } from "../../domain/page/page-repository";
import type { PageDto } from "./page-dto";

export async function getPage(
  repo: PageRepository,
  id: PageId,
): Promise<PageDto | null> {
  return repo.get(id);
}
