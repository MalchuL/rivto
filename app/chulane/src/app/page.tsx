/**
 * Provides the Chulane entry screen shared by the web and Electron hosts.
 * The server-rendered shell hosts password login and workspace management using
 * application-owned shadcn primitives. Page creation stays disabled until the
 * document stage; the shell does not introduce temporary document state.
 */
import { Button } from "@/components/ui/button";
import { LocalWorkspaces } from "@/components/local-workspaces";

const starterClasses = {
  main: "mx-auto flex min-h-svh max-w-3xl flex-col justify-center gap-6 px-6 py-16 sm:px-12",
  title: "text-4xl font-semibold tracking-tight sm:text-5xl",
  description: "text-base leading-relaxed text-muted-foreground",
  button: "self-start",
};

/**
 * Renders the application landing screen.
 * @returns The initial workspace placeholder.
 */
export default function Home() {
  return (
    <main className={starterClasses.main}>
      <h1 className={starterClasses.title}>Chulane</h1>
      <p className={starterClasses.description}>Your workspace starts here.</p>
      <Button className={starterClasses.button} size="lg" disabled>
        Create a page
      </Button>
      <LocalWorkspaces />
    </main>
  );
}
