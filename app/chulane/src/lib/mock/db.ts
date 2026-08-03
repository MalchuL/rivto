import type { Page } from "../../domain/page/types";
import type { Project, SystemContainer } from "../../domain/project/types";
import type { Tag } from "../../domain/tag/types";
import { formatDayTitle, toDayKey } from "../../domain/journal/utils";

export const SYSTEM_PROJECT_IDS: Record<SystemContainer, string> = {
  inbox: "project-system-inbox",
  journal: "project-system-journal",
  templates: "project-system-templates",
  archive: "project-system-archive",
  trash: "project-system-trash",
};

export type MockDb = {
  projects: Map<string, Project>;
  pages: Map<string, Page>;
  tags: Map<string, Tag>;
};

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function makeProject(input: {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  status?: Project["status"];
  system?: SystemContainer | null;
  parentProjectId?: string | null;
  createdDaysAgo?: number;
}): Project {
  const created = daysAgoIso(input.createdDaysAgo ?? 30);
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    icon: input.icon,
    status: input.status,
    properties: {},
    parentProjectId: input.parentProjectId ?? null,
    system: input.system ?? null,
    createdAt: created,
    updatedAt: created,
  };
}

function makeTag(input: {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  color: string;
  createdDaysAgo?: number;
}): Tag {
  const created = daysAgoIso(input.createdDaysAgo ?? 20);
  return {
    id: input.id,
    projectId: input.projectId,
    name: input.name,
    description: input.description,
    color: input.color,
    createdAt: created,
    updatedAt: created,
  };
}

function makePage(input: {
  id: string;
  projectId: string;
  title: string;
  kind?: Page["kind"];
  parentPageId?: string | null;
  tagIds?: string[];
  properties?: Record<string, unknown>;
  content?: string;
  createdDaysAgo?: number;
}): Page {
  const created = daysAgoIso(input.createdDaysAgo ?? 14);
  return {
    id: input.id,
    projectId: input.projectId,
    title: input.title,
    parentPageId: input.parentPageId ?? null,
    kind: input.kind ?? "page",
    tagIds: input.tagIds ?? [],
    properties: input.properties ?? {},
    content: input.content ?? "<p></p>",
    createdAt: created,
    updatedAt: created,
  };
}

function seedJournalPage(db: MockDb, daysAgo: number, content: string): void {
  const dayKey = toDayKey(new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000));
  const page = makePage({
    id: `page-journal-${dayKey}`,
    projectId: SYSTEM_PROJECT_IDS.journal,
    title: formatDayTitle(dayKey),
    kind: "journal",
    properties: { day: dayKey },
    content,
    createdDaysAgo: daysAgo,
  });
  db.pages.set(page.id, page);
}

function seed(): MockDb {
  const db: MockDb = {
    projects: new Map(),
    pages: new Map(),
    tags: new Map(),
  };

  const systemProjects: Array<[SystemContainer, string, string]> = [
    ["inbox", "Inbox", "Default home for quick notes"],
    ["journal", "Journal", "Daily journal documents"],
    ["templates", "Templates", "Reusable page templates"],
    ["archive", "Archive", "Archived pages and projects"],
    ["trash", "Trash", "Deleted items"],
  ];
  for (const [system, name, description] of systemProjects) {
    const project = makeProject({
      id: SYSTEM_PROJECT_IDS[system],
      name,
      description,
      system,
      createdDaysAgo: 60,
    });
    db.projects.set(project.id, project);
  }

  const research = makeProject({
    id: "project-research",
    name: "Research",
    description: "Explorations, papers and open questions.",
    icon: "🔬",
    status: "active",
    createdDaysAgo: 40,
  });
  const personal = makeProject({
    id: "project-personal",
    name: "Personal",
    description: "Everything outside of work.",
    icon: "🌱",
    status: "active",
    createdDaysAgo: 35,
  });
  const rivto = makeProject({
    id: "project-rivto",
    name: "Rivto",
    description: "Block editor for notes and research.",
    icon: "📝",
    status: "active",
    createdDaysAgo: 50,
  });
  const rivtoDocs = makeProject({
    id: "project-rivto-docs",
    name: "Docs",
    description: "Product documentation for Rivto.",
    icon: "📚",
    status: "active",
    parentProjectId: rivto.id,
    createdDaysAgo: 12,
  });
  for (const project of [research, personal, rivto, rivtoDocs]) {
    db.projects.set(project.id, project);
  }

  const tags: Tag[] = [
    makeTag({
      id: "tag-rivto-editor",
      projectId: rivto.id,
      name: "editor",
      description: "Editor surface and document model",
      color: "#0f766e",
    }),
    makeTag({
      id: "tag-rivto-research",
      projectId: rivto.id,
      name: "research",
      description: "Background research for Rivto",
      color: "#7c3aed",
    }),
    makeTag({
      id: "tag-rivto-architecture",
      projectId: rivto.id,
      name: "architecture",
      description: "System design notes",
      color: "#2563eb",
    }),
    makeTag({
      id: "tag-docs-guide",
      projectId: rivtoDocs.id,
      name: "guide",
      description: "End-user guides (Docs only)",
      color: "#ea580c",
    }),
    makeTag({
      id: "tag-research-ai",
      projectId: research.id,
      name: "ai",
      description: "AI / agents topics",
      color: "#db2777",
    }),
    makeTag({
      id: "tag-research-notes",
      projectId: research.id,
      name: "notes",
      color: "#16a34a",
    }),
  ];
  for (const tag of tags) {
    db.tags.set(tag.id, tag);
  }

  const pages: Page[] = [
    makePage({
      id: "page-rivto-architecture",
      projectId: rivto.id,
      title: "Rivto architecture",
      tagIds: ["tag-rivto-architecture", "tag-rivto-editor"],
      content:
        "<h1>Rivto architecture</h1><p>High-level design of the editor and the app shell.</p><h2>Document model</h2><p>Pages are trees of blocks stored in a CRDT-backed document model.</p><h2>Rendering</h2><p>React surface renders blocks; edgeless canvas is a separate surface over the same data.</p><h2>AI integration</h2><p>AI operates on blocks through the same commands the user has.</p>",
      createdDaysAgo: 20,
    }),
    makePage({
      id: "page-rivto-document-model",
      projectId: rivto.id,
      title: "Document model",
      parentPageId: "page-rivto-architecture",
      tagIds: ["tag-rivto-editor"],
      content:
        "<h2>Blocks</h2><p>A block is the minimal editable unit. Pages, journal days and databases are all documents made of blocks.</p>",
      createdDaysAgo: 18,
    }),
    makePage({
      id: "page-rivto-rendering",
      projectId: rivto.id,
      title: "Rendering",
      parentPageId: "page-rivto-architecture",
      content:
        "<h2>Surfaces</h2><p>The page surface renders a document as a vertical list of blocks. Edgeless renders the same blocks on a canvas.</p>",
      createdDaysAgo: 18,
    }),
    makePage({
      id: "page-rivto-roadmap",
      projectId: rivto.id,
      title: "Roadmap",
      tagIds: ["tag-rivto-research"],
      content:
        "<h1>Roadmap</h1><ul><li><p>App shell with tabs and sidebar</p></li><li><p>Journal timeline</p></li><li><p>Project dashboards</p></li><li><p>Swap TipTap for the Rivto editor</p></li></ul>",
      createdDaysAgo: 15,
    }),
    makePage({
      id: "page-docs-getting-started",
      projectId: rivtoDocs.id,
      title: "Getting started",
      tagIds: ["tag-docs-guide", "tag-rivto-editor"],
      content:
        "<h1>Getting started</h1><p>Install Rivto, open a workspace, and create your first page. Inherited tags like <code>#editor</code> come from the parent Rivto project.</p>",
      createdDaysAgo: 10,
    }),
    makePage({
      id: "page-research-ai",
      projectId: research.id,
      title: "AI research",
      tagIds: ["tag-research-ai"],
      content:
        "<h1>AI research</h1><p>Notes on retrieval, agents and how they apply to a second-brain editor.</p><h2>Open questions</h2><ul><li><p>How should AI edits show up in history?</p></li><li><p>Per-page chat vs workspace chat?</p></li></ul>",
      createdDaysAgo: 10,
    }),
    makePage({
      id: "page-personal-reading",
      projectId: personal.id,
      title: "Reading list",
      content:
        "<h1>Reading list</h1><ul><li><p>Thinking, Fast and Slow</p></li><li><p>The Design of Everyday Things</p></li></ul>",
      createdDaysAgo: 8,
    }),
    makePage({
      id: "page-inbox-scratch",
      projectId: SYSTEM_PROJECT_IDS.inbox,
      title: "Scratchpad",
      content: "<p>Quick thoughts land here before they find a project.</p>",
      createdDaysAgo: 2,
    }),
  ];
  for (const page of pages) {
    db.pages.set(page.id, page);
  }

  seedJournalPage(
    db,
    0,
    "<p>Started building the Rivto app shell: tabs, sidebar, journal.</p>",
  );
  seedJournalPage(
    db,
    1,
    "<p>Sketched the contextual right sidebar. Details / Outline / Relations / AI.</p>",
  );
  seedJournalPage(
    db,
    2,
    "<p>Decided journal days are ordinary pages with <code>kind: journal</code>.</p>",
  );

  return db;
}

let db: MockDb | null = null;

export function getMockDb(): MockDb {
  if (!db) {
    db = seed();
  }
  return db;
}

/** Reset mock DB (tests / hot reload helpers). */
export function resetMockDb(): void {
  db = null;
}
