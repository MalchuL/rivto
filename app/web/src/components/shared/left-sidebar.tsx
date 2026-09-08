"use client";

import { SYSTEM_PROJECT_IDS, type Page, type Project } from "@chulane/app";
import { usePagesQuery, useProjectsQuery } from "@chulane/app/client";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  FolderKanban,
  HelpCircle,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CreateMenu } from "@/components/shared/create-menu";
import { ResizeHandle } from "@/components/shared/resize-handle";
import { buildPageTree, type PageTreeNode } from "@/domain/page/utils/page-tree";
import { useCreateActions } from "@/domain/workspace/hooks/use-create-actions";
import { useUiStore } from "@/domain/workspace/store/ui-store";
import { FRONTEND_ROUTES } from "@/lib/constants/routes";
import { cn } from "@/lib/utils";

function NavRow({
  icon: Icon,
  label,
  href,
  onClick,
  active,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  const className = cn(
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground transition-colors",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
      : "hover:bg-sidebar-accent/70",
    disabled && "pointer-events-none opacity-50",
  );
  const content = (
    <>
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </>
  );
  if (href && !disabled) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {content}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function PageLink({
  page,
  depth,
  active,
  pinned,
  onTogglePin,
  onAddSubpage,
  showPin = true,
}: {
  page: Page;
  depth: number;
  active: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  onAddSubpage?: () => void;
  showPin?: boolean;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-0.5 rounded-md text-sm text-sidebar-foreground transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "hover:bg-sidebar-accent/70",
      )}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
    >
      <Link
        href={FRONTEND_ROUTES.page(page.id)}
        className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-1"
      >
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{page.title}</span>
      </Link>
      {onAddSubpage ? (
        <button
          type="button"
          onClick={onAddSubpage}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent group-hover:opacity-100"
          aria-label="Add subpage"
        >
          <Plus className="size-3" />
        </button>
      ) : null}
      {showPin ? (
        <button
          type="button"
          onClick={onTogglePin}
          className={cn(
            "mr-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent",
            pinned ? "" : "opacity-0 transition-opacity group-hover:opacity-100",
          )}
          aria-label={pinned ? "Unpin page" : "Pin page"}
        >
          {pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
        </button>
      ) : null}
    </div>
  );
}

function PageTreeList({
  nodes,
  depth,
  pathname,
  pinnedPageIds,
  onTogglePinPage,
  onAddSubpage,
}: {
  nodes: PageTreeNode[];
  depth: number;
  pathname: string;
  pinnedPageIds: string[];
  onTogglePinPage: (id: string) => void;
  onAddSubpage: (page: Page) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.page.id}>
          <PageLink
            page={node.page}
            depth={depth}
            active={pathname === FRONTEND_ROUTES.page(node.page.id)}
            pinned={pinnedPageIds.includes(node.page.id)}
            onTogglePin={() => onTogglePinPage(node.page.id)}
            onAddSubpage={() => onAddSubpage(node.page)}
          />
          {node.children.length > 0 ? (
            <PageTreeList
              nodes={node.children}
              depth={depth + 1}
              pathname={pathname}
              pinnedPageIds={pinnedPageIds}
              onTogglePinPage={onTogglePinPage}
              onAddSubpage={onAddSubpage}
            />
          ) : null}
        </div>
      ))}
    </>
  );
}

function ProjectRow({
  project,
  expanded,
  pinned,
  pathname,
  pages,
  childProjects,
  pinnedPageIds,
  pinnedProjectIds,
  expandedProjectIds,
  onToggleExpand,
  onTogglePin,
  onTogglePinPage,
  onToggleExpandProject,
  onTogglePinProject,
  onAddSubpage,
}: {
  project: Project;
  expanded: boolean;
  pinned: boolean;
  pathname: string;
  pages: Page[];
  childProjects: Project[];
  pinnedPageIds: string[];
  pinnedProjectIds: string[];
  expandedProjectIds: string[];
  onToggleExpand: () => void;
  onTogglePin: () => void;
  onTogglePinPage: (id: string) => void;
  onToggleExpandProject: (id: string) => void;
  onTogglePinProject: (id: string) => void;
  onAddSubpage: (page: Page) => void;
}) {
  const tree = useMemo(
    () =>
      buildPageTree(
        pages.filter((page) => page.projectId === project.id && page.kind !== "journal"),
      ),
    [pages, project.id],
  );
  const active = pathname === FRONTEND_ROUTES.project(project.id);

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md px-1 py-1 text-sm transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/70",
        )}
      >
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent"
          aria-label={expanded ? "Collapse project" : "Expand project"}
        >
          {expanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </button>
        <Link
          href={FRONTEND_ROUTES.project(project.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-sidebar-foreground"
        >
          <span className="text-sm leading-none">{project.icon ?? "•"}</span>
          <span className="truncate">{project.name}</span>
        </Link>
        <button
          type="button"
          onClick={onTogglePin}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent",
            pinned ? "" : "opacity-0 transition-opacity group-hover:opacity-100",
          )}
          aria-label={pinned ? "Unpin project" : "Pin project"}
        >
          {pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
        </button>
      </div>
      {expanded ? (
        <div className="mt-0.5 flex flex-col gap-0.5 duration-200 animate-in fade-in slide-in-from-top-1">
          {childProjects.map((child) => (
            <div key={child.id} className="pl-3">
              <ProjectRow
                project={child}
                pages={pages}
                childProjects={[]}
                pathname={pathname}
                expanded={expandedProjectIds.includes(child.id)}
                pinned={pinnedProjectIds.includes(child.id)}
                pinnedPageIds={pinnedPageIds}
                pinnedProjectIds={pinnedProjectIds}
                expandedProjectIds={expandedProjectIds}
                onToggleExpand={() => onToggleExpandProject(child.id)}
                onTogglePin={() => onTogglePinProject(child.id)}
                onTogglePinPage={onTogglePinPage}
                onToggleExpandProject={onToggleExpandProject}
                onTogglePinProject={onTogglePinProject}
                onAddSubpage={onAddSubpage}
              />
            </div>
          ))}
          {tree.length === 0 && childProjects.length === 0 ? (
            <div className="px-7 py-1 text-xs text-muted-foreground">No pages yet</div>
          ) : tree.length > 0 ? (
            <PageTreeList
              nodes={tree}
              depth={1}
              pathname={pathname}
              pinnedPageIds={pinnedPageIds}
              onTogglePinPage={onTogglePinPage}
              onAddSubpage={onAddSubpage}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CollapsedRail({
  onExpand,
  onOpenPalette,
}: {
  onExpand: () => void;
  onOpenPalette: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const items = [
    {
      icon: Inbox,
      label: "Inbox",
      onClick: () => router.push(FRONTEND_ROUTES.project(SYSTEM_PROJECT_IDS.inbox)),
      active: pathname === FRONTEND_ROUTES.project(SYSTEM_PROJECT_IDS.inbox),
    },
    {
      icon: BookOpen,
      label: "Journal",
      onClick: () => router.push(FRONTEND_ROUTES.journal),
      active: pathname.startsWith(FRONTEND_ROUTES.journal),
    },
    {
      icon: FolderKanban,
      label: "Projects",
      onClick: () => router.push(FRONTEND_ROUTES.projects),
      active: pathname.startsWith(FRONTEND_ROUTES.projects),
    },
    {
      icon: FileText,
      label: "Pages",
      onClick: () => router.push(FRONTEND_ROUTES.search),
      active: pathname.startsWith(FRONTEND_ROUTES.search),
    },
  ];
  return (
    <aside className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" onClick={onExpand} aria-label="Expand sidebar">
            <PanelLeftOpen />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Expand sidebar</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" onClick={onOpenPalette} aria-label="Search">
            <Search />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Search</TooltipContent>
      </Tooltip>
      <CreateMenu>
        <Button variant="ghost" size="icon-sm" aria-label="Create">
          <Plus />
        </Button>
      </CreateMenu>
      <Separator className="my-1 w-6" />
      {items.map((item) => (
        <Tooltip key={item.label}>
          <TooltipTrigger asChild>
            <Button
              variant={item.active ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={item.onClick}
              aria-label={item.label}
            >
              <item.icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      ))}
    </aside>
  );
}

export function LeftSidebar() {
  const pathname = usePathname();
  const { newPage } = useCreateActions();
  const {
    sidebarCollapsed,
    sidebarWidth,
    toggleSidebarCollapsed,
    setSidebarWidth,
    expandedProjectIds,
    toggleExpandedProject,
    pinnedProjectIds,
    togglePinnedProject,
    favoritePageIds,
    recentPageIds,
    setPaletteOpen,
    togglePinnedPage,
  } = useUiStore();

  const { data: projects = [] } = useProjectsQuery();
  const { data: pages = [] } = usePagesQuery();

  const childrenByParent = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const project of projects) {
      if (project.system || !project.parentProjectId) continue;
      const list = map.get(project.parentProjectId) ?? [];
      list.push(project);
      map.set(project.parentProjectId, list);
    }
    return map;
  }, [projects]);

  const userProjects = useMemo(() => {
    const visible = projects.filter(
      (project) => !project.system && !project.parentProjectId,
    );
    const pinned = visible.filter((project) => pinnedProjectIds.includes(project.id));
    const rest = visible.filter((project) => !pinnedProjectIds.includes(project.id));
    return [...pinned, ...rest];
  }, [projects, pinnedProjectIds]);

  const pageById = useMemo(() => new Map(pages.map((page) => [page.id, page])), [pages]);
  const pinnedPages = favoritePageIds
    .map((id) => pageById.get(id))
    .filter((page): page is Page => Boolean(page));
  const recentPages = recentPageIds
    .map((id) => pageById.get(id))
    .filter((page): page is Page => Boolean(page))
    .slice(0, 5);

  if (sidebarCollapsed) {
    return (
      <CollapsedRail
        onExpand={toggleSidebarCollapsed}
        onOpenPalette={() => setPaletteOpen(true)}
      />
    );
  }

  return (
    <div className="flex h-full shrink-0">
      <aside
        className="flex h-full flex-col border-r border-sidebar-border bg-sidebar"
        style={{ width: sidebarWidth }}
      >
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-sm font-semibold tracking-tight">Rivto</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleSidebarCollapsed}
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose />
          </Button>
        </div>

        <div className="flex flex-col gap-0.5 px-2">
          <NavRow
            icon={Search}
            label="Search"
            onClick={() => setPaletteOpen(true)}
          />
          <CreateMenu>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70"
            >
              <Plus className="size-4 shrink-0" />
              <span>Create</span>
            </button>
          </CreateMenu>
        </div>

        <div className="mt-2 flex flex-col gap-0.5 px-2">
          <NavRow
            icon={Inbox}
            label="Inbox"
            href={FRONTEND_ROUTES.project(SYSTEM_PROJECT_IDS.inbox)}
            active={pathname === FRONTEND_ROUTES.project(SYSTEM_PROJECT_IDS.inbox)}
          />
          <NavRow
            icon={BookOpen}
            label="Journal"
            href={FRONTEND_ROUTES.journal}
            active={pathname.startsWith(FRONTEND_ROUTES.journal)}
          />
          <NavRow
            icon={FolderKanban}
            label="Projects"
            href={FRONTEND_ROUTES.projects}
            active={pathname === FRONTEND_ROUTES.projects}
          />
          <NavRow
            icon={FileText}
            label="Pages"
            href={FRONTEND_ROUTES.search}
            active={pathname.startsWith(FRONTEND_ROUTES.search)}
          />
        </div>

        <ScrollArea className="min-h-0 flex-1 px-2 pb-2">
          {pinnedPages.length > 0 ? (
            <>
              <SectionLabel>
                <span className="inline-flex items-center gap-1">
                  <Pin className="size-3" /> Pinned
                </span>
              </SectionLabel>
              {pinnedPages.map((page) => (
                <PageLink
                  key={page.id}
                  page={page}
                  depth={0}
                  active={pathname === FRONTEND_ROUTES.page(page.id)}
                  pinned
                  onTogglePin={() => togglePinnedPage(page.id)}
                />
              ))}
            </>
          ) : null}

          {recentPages.length > 0 ? (
            <>
              <SectionLabel>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" /> Recent
                </span>
              </SectionLabel>
              {recentPages.map((page) => (
                <PageLink
                  key={page.id}
                  page={page}
                  depth={0}
                  active={pathname === FRONTEND_ROUTES.page(page.id)}
                  pinned={favoritePageIds.includes(page.id)}
                  onTogglePin={() => togglePinnedPage(page.id)}
                />
              ))}
            </>
          ) : null}

          <SectionLabel>Projects</SectionLabel>
          <div className="flex flex-col gap-0.5">
            {userProjects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                pages={pages}
                childProjects={childrenByParent.get(project.id) ?? []}
                pathname={pathname}
                expanded={expandedProjectIds.includes(project.id)}
                pinned={pinnedProjectIds.includes(project.id)}
                pinnedPageIds={favoritePageIds}
                pinnedProjectIds={pinnedProjectIds}
                expandedProjectIds={expandedProjectIds}
                onToggleExpand={() => toggleExpandedProject(project.id)}
                onToggleExpandProject={toggleExpandedProject}
                onTogglePin={() => togglePinnedProject(project.id)}
                onTogglePinProject={togglePinnedProject}
                onTogglePinPage={togglePinnedPage}
                onAddSubpage={(page) => void newPage(page.projectId, page.id)}
              />
            ))}
          </div>
        </ScrollArea>

        <div className="border-t border-sidebar-border px-2 py-2">
          <NavRow icon={Settings} label="Settings" disabled />
          <NavRow icon={Trash2} label="Trash" disabled />
          <div className="mt-1 flex items-center justify-between px-1">
            {[
              { icon: User, label: "Profile" },
              { icon: RefreshCw, label: "Sync" },
              { icon: Sparkles, label: "AI" },
              { icon: HelpCircle, label: "Help" },
            ].map((item) => (
              <Tooltip key={item.label}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled
                    aria-label={item.label}
                  >
                    <item.icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{item.label} — coming soon</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      </aside>
      <ResizeHandle onDrag={(clientX) => setSidebarWidth(clientX)} />
    </div>
  );
}
