import type { PageId } from "../../domain/page/page";
import type { PageRepository } from "../../domain/page/page-repository";

export async function deletePage(
  repo: PageRepository,
  id: PageId,
): Promise<void> {
  await repo.delete(id);
}
