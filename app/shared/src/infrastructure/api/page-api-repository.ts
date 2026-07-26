import type { Page, PageId } from "../../domain/page/page";
import type {
  CreatePageInput,
  PageRepository,
  UpdatePageInput,
} from "../../domain/page/page-repository";
import type { ApiClient } from "./client";

export function createPageApiRepository(client: ApiClient): PageRepository {
  return {
    async list(): Promise<Page[]> {
      const { pages } = await client.page.list();
      return pages;
    },
    async get(id: PageId): Promise<Page | null> {
      try {
        return await client.page.get(id);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          error.status === 404
        ) {
          return null;
        }
        throw error;
      }
    },
    async create(input: CreatePageInput): Promise<Page> {
      return client.page.create({
        title: input.title,
        content: input.content,
        parentId: input.parentId ?? null,
      });
    },
    async update(input: UpdatePageInput): Promise<Page> {
      return client.page.update(input.id, {
        title: input.title,
        content: input.content,
        parentId: input.parentId,
      });
    },
    async delete(id: PageId): Promise<void> {
      await client.page.delete(id);
    },
  };
}
