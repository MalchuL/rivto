/**
 * Provides the initial Chulane screen shared by the web and Electron hosts.
 * This server component establishes a runnable application without introducing
 * domain services, editor state, or framework-specific business behavior.
 */

/**
 * Renders the application landing screen.
 * @returns The initial workspace placeholder.
 */
export default function Home() {
  return (
    <main>
      <h1>Chulane</h1>
      <p>Your workspace starts here.</p>
    </main>
  );
}
