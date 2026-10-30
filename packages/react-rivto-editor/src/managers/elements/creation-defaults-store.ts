import type {
  ElementCreationDefaults,
  RememberedElementProperties,
} from "./creation-defaults-types";

/** Mutable creation settings for one registration; contains no document or React state. */
export class CreationDefaultsStore {
  private value: ElementCreationDefaults = {};

  /**
   * Reads detached remembered values, without initial registration defaults.
   *
   * @returns A copy whose nested properties can be changed without modifying this store.
   */
  getSnapshot(): ElementCreationDefaults {
    return structuredClone(this.value);
  }

  /**
   * Selects declared fields and checks frame values before any mutation.
   *
   * @param patch - Candidate values; undefined fields do not replace remembered values.
   * @param policy - Explicit remembered fields for this registration.
   * @param strict - Reject undeclared fields for settings commands; document commits skip them.
   * @returns A detached patch containing only declared fields.
   * @throws If a frame dimension is not finite and positive, or a strict patch has undeclared fields.
   */
  prepare(
    patch: ElementCreationDefaults,
    policy: RememberedElementProperties = {},
    strict = false,
  ): ElementCreationDefaults {
    const props: Record<string, unknown> = {};
    const frame: Partial<Record<"width" | "height", number>> = {};
    for (const [key, value] of Object.entries(patch.props ?? {})) {
      if (!policy.props?.includes(key)) {
        if (strict) {
          throw new Error(`Creation property ${key} is not declared for remembering`);
        }
      } else if (value !== undefined) {
        props[key] = structuredClone(value);
      }
    }
    for (const [key, value] of Object.entries(patch.frame ?? {})) {
      if ((key !== "width" && key !== "height") || !policy.frame?.includes(key)) {
        if (strict) {
          throw new Error(`Creation frame field ${key} is not declared for remembering`);
        }
      } else if (value !== undefined) {
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error(`Creation ${key} must be finite and positive`);
        }
        frame[key] = value;
      }
    }
    return { props, frame };
  }

  /**
   * Applies a previously prepared patch without reading or writing document records.
   *
   * @param patch - Detached, validated fields returned by prepare.
   * @returns Whether any field changed; the owning session uses this to notify subscribers once.
   */
  apply(patch: ElementCreationDefaults): boolean {
    const changed =
      Object.entries(patch.props ?? {}).some(
        ([key, value]) => !Object.is(this.value.props?.[key], value),
      ) ||
      Object.entries(patch.frame ?? {}).some(
        ([key, value]) => !Object.is(this.value.frame?.[key as "width" | "height"], value),
      );
    if (!changed) {
      return false;
    }
    this.value = {
      props: { ...this.value.props, ...structuredClone(patch.props) },
      frame: { ...this.value.frame, ...patch.frame },
    };
    return true;
  }
}
