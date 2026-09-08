import { api, APIError } from "encore.dev/api";
import { randomUUID } from "node:crypto";
import { db } from "./db";

export interface Page {
  id: string;
  title: string;
  content: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PageRow {
  id: string;
  title: string;
  content: string;
  parent_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: PageRow): Page {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    parentId: row.parent_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function normalizeTitle(title: string | undefined): string {
  const trimmed = title?.trim() ?? "";
  return trimmed.length > 0 ? trimmed.slice(0, 500) : "Untitled";
}

export interface ListPagesResponse {
  pages: Page[];
}

export const list = api(
  { expose: true, method: "GET", path: "/page" },
  async (): Promise<ListPagesResponse> => {
    const rows = await db.query<PageRow>`
      SELECT id, title, content, parent_id, created_at, updated_at
      FROM page
      ORDER BY updated_at DESC
    `;
    const pages: Page[] = [];
    for await (const row of rows) {
      pages.push(mapRow(row));
    }
    return { pages };
  },
);

export const get = api(
  { expose: true, method: "GET", path: "/page/:id" },
  async ({ id }: { id: string }): Promise<Page> => {
    const row = await db.queryRow<PageRow>`
      SELECT id, title, content, parent_id, created_at, updated_at
      FROM page
      WHERE id = ${id}::uuid
    `;
    if (!row) {
      throw APIError.notFound("page not found");
    }
    return mapRow(row);
  },
);

export interface CreatePageRequest {
  title?: string;
  content?: string;
  parentId?: string | null;
}

export const create = api(
  { expose: true, method: "POST", path: "/page" },
  async (req: CreatePageRequest): Promise<Page> => {
    const id = randomUUID();
    const title = normalizeTitle(req.title);
    const content = req.content ?? "";
    const parentId = req.parentId ?? null;

    const row = parentId
      ? await db.queryRow<PageRow>`
          INSERT INTO page (id, title, content, parent_id)
          VALUES (${id}::uuid, ${title}, ${content}, ${parentId}::uuid)
          RETURNING id, title, content, parent_id, created_at, updated_at
        `
      : await db.queryRow<PageRow>`
          INSERT INTO page (id, title, content, parent_id)
          VALUES (${id}::uuid, ${title}, ${content}, NULL)
          RETURNING id, title, content, parent_id, created_at, updated_at
        `;
    if (!row) {
      throw APIError.internal("failed to create page");
    }
    return mapRow(row);
  },
);

export interface UpdatePageRequest {
  id: string;
  title?: string;
  content?: string;
  parentId?: string | null;
}

export const update = api(
  { expose: true, method: "PUT", path: "/page/:id" },
  async (req: UpdatePageRequest): Promise<Page> => {
    const existing = await db.queryRow<PageRow>`
      SELECT id, title, content, parent_id, created_at, updated_at
      FROM page
      WHERE id = ${req.id}::uuid
    `;
    if (!existing) {
      throw APIError.notFound("page not found");
    }

    const title =
      req.title !== undefined ? normalizeTitle(req.title) : existing.title;
    const content =
      req.content !== undefined ? req.content : existing.content;
    const parentId =
      req.parentId !== undefined ? req.parentId : existing.parent_id;

    const row = parentId
      ? await db.queryRow<PageRow>`
          UPDATE page
          SET
            title = ${title},
            content = ${content},
            parent_id = ${parentId}::uuid,
            updated_at = NOW()
          WHERE id = ${req.id}::uuid
          RETURNING id, title, content, parent_id, created_at, updated_at
        `
      : await db.queryRow<PageRow>`
          UPDATE page
          SET
            title = ${title},
            content = ${content},
            parent_id = NULL,
            updated_at = NOW()
          WHERE id = ${req.id}::uuid
          RETURNING id, title, content, parent_id, created_at, updated_at
        `;
    if (!row) {
      throw APIError.internal("failed to update page");
    }
    return mapRow(row);
  },
);

export const deletePage = api(
  { expose: true, method: "DELETE", path: "/page/:id" },
  async ({ id }: { id: string }): Promise<void> => {
    const row = await db.queryRow<{ id: string }>`
      DELETE FROM page
      WHERE id = ${id}::uuid
      RETURNING id
    `;
    if (!row) {
      throw APIError.notFound("page not found");
    }
  },
);
