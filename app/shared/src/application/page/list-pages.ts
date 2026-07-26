import type { PageRepository } from "../../domain/page/page-repository";
import type { PageDto } from "./page-dto";

export async function listPages(repo: PageRepository): Promise<PageDto[]> {
  return repo.list();
}
