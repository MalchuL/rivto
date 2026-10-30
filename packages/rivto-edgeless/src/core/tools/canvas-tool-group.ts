/** Settings access supplied by the application's surface-local settings owner. */
export interface CanvasToolSettings<Settings> {
  /**
   * Reads the current group settings.
   *
   * @returns The host's settings snapshot, including any defaults it applies.
   */
  get(): Settings;
  /**
   * Applies a settings patch through the host's validation and notification policy.
   *
   * @param patch - Settings accepted by the owning application.
   * @returns The host has applied the patch.
   * @throws If the host rejects the settings.
   */
  set(patch: Settings): void;
}

/** Surface-local access to a registered group's settings without duplicating its storage. */
export class CanvasToolGroup<Settings, Registration extends { readonly id: string }> {
  /**
   * Binds a group to its application's settings owner.
   *
   * @param registration - Immutable group registration shared by the registry.
   * @param settings - Surface-local settings access; never retained in the registry.
   */
  constructor(
    readonly registration: Registration,
    private readonly settings: CanvasToolSettings<Settings>,
  ) {}

  /**
   * Resolves the group's initial and remembered settings.
   *
   * @returns The owning application's current settings snapshot.
   */
  getSettings(): Settings {
    return this.settings.get();
  }

  /**
   * Changes settings through the owning application's policy.
   *
   * @param patch - Properties or dimensions to change.
   * @returns Publishes a successful settings change through the host.
   * @throws If the policy rejects the fields or values.
   */
  setSettings(patch: Settings): void {
    this.settings.set(patch);
  }
}
