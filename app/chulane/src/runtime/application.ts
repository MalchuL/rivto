/**
 * Owns Chulane's Cordis composition boundary outside its domain and UI layers.
 * One application fiber owns bundled plugins and their services, event listeners,
 * and effects. Hosts await startup and dispose that fiber before exiting; the
 * kernel does not implement storage, AI orchestration, or plugin installation.
 */
import { Context, type Fiber, type Plugin } from "@deepseek-ai/cordis";

/**
 * Creates the application lifecycle owned by a Node host.
 * @param plugins - Bundled plugins in dependency order.
 * @returns The started application fiber.
 */
export async function createApplicationRuntime(plugins: Plugin[] = []): Promise<Fiber> {
  const root = new Context();
  const application = root.plugin({
    name: "chulane",
    /**
     * Mounts bundled capabilities beneath the application's disposal boundary.
     * @param ctx - The application scope that owns every child plugin.
     * @returns Resolves once each plugin's startup has settled.
     */
    async apply(ctx: Context): Promise<void> {
      for (const plugin of plugins) await ctx.plugin(plugin).await();
    },
  });
  try {
    await application.await();
  } catch (error) {
    // Await rollback before reporting failure, including partial async setup.
    await application.dispose();
    throw error;
  }
  return application;
}
