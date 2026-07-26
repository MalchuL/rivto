export { createPageTitle, PageSchema, PageIdSchema } from "./domain/page/page";
export type { Page, PageId } from "./domain/page/page";
export type {
  CreatePageInput,
  PageRepository,
  UpdatePageInput,
} from "./domain/page/page-repository";

export { listPages } from "./application/page/list-pages";
export { getPage } from "./application/page/get-page";
export { createPage } from "./application/page/create-page";
export { updatePage } from "./application/page/update-page";
export { deletePage } from "./application/page/delete-page";
export {
  CreatePageRequestSchema,
  ListPagesResponseSchema,
  PageDtoSchema,
  UpdatePageRequestSchema,
} from "./application/page/page-dto";
export type {
  CreatePageRequest,
  ListPagesResponse,
  PageDto,
  UpdatePageRequest,
} from "./application/page/page-dto";

export { ApiError, createApiClient } from "./infrastructure/api/client";
export type { ApiClient, ApiClientConfig } from "./infrastructure/api/client";
export { createPageApiRepository } from "./infrastructure/api/page-api-repository";
