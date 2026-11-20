import type { InputHit, InputRegion, InputRoot, RegionIdentity } from "@chulane/rivto-root";
import type { BlockLayoutRegions } from "../../presentation/components/block-layout/block-layout-regions";
import { containsDropPoint, dropBounds, readDropGeometry } from "./block-drop-region-geometry";
import { BLOCK_DROP_EXCLUDE_ATTRIBUTE } from "./block-drop-attributes";
import type {
  BlockDropBounds,
  BlockDropGeometry,
  BlockDropGeometryReader,
  BlockDropPoint,
  BlockDropAncestorPredicate,
} from "./types";

/** Internal signal that stops geometry resolution after an attachment becomes unavailable. */
export const DROP_MEASUREMENT_UNAVAILABLE = Symbol("drop measurement unavailable");

/** Measures mounted drop registrations through one borrowed Root for one query. */
export class BlockDropMeasurements implements BlockDropGeometryReader {
  private readonly hit: InputRegion;
  private readonly boundary: InputRegion;
  private readonly isAttached: () => boolean;
  /**
   * Binds measurements to the exact Page attachment without owning it.
   *
   * @param root - Root capability used to capture registered regions.
   * @param isAttached - Checks the originating Page attachment and document.
   * @param hit - Opaque hit captured for this synchronous query.
   * @param regions - Occurrence-local lookup of registered layout roles; borrowed without ownership.
   * @throws The internal unavailable signal or Root ownership-check failures.
   */
  constructor(
    private readonly root: Pick<InputRoot, "captureRegionByIdentity" | "getElementIdentity">,
    isAttached: () => boolean,
    hit: InputHit,
    private readonly regions: Pick<BlockLayoutRegions, "getRegionIdentity">,
  ) {
    this.isAttached = () => isAttached() && hit.isCurrent() && isAttached();
    const identity = hit.getNearestAncestorIdentity("*");
    const region = identity && root.captureRegionByIdentity(identity, this.isAttached);
    if (!region) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    this.hit = region;
    const rootIdentity = root.getElementIdentity?.();
    const boundary = rootIdentity && root.captureRegionByIdentity(rootIdentity, this.isAttached);
    if (!boundary) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    this.boundary = boundary;
  }

  /**
   * Visits the hit and its ancestors through this Page's root, inclusive.
   *
   * @param predicate - Synchronous test run from the hit toward the root.
   * @returns True when the predicate stops the walk, otherwise false.
   * @throws The internal unavailable signal or predicate and ownership-check failures.
   */
  walkHitAncestors(predicate: BlockDropAncestorPredicate): boolean {
    return this.walk(this.hit, predicate);
  }

  /**
   * Checks whether one registered region contains another within this attachment.
   *
   * @param parent - Opaque identity of the candidate containing region.
   * @param child - Opaque identity of the candidate contained region.
   * @returns True while the parent contains the child.
   * @throws The internal unavailable signal or Root ownership-check failures.
   */
  contains(parent: RegionIdentity, child: RegionIdentity): boolean {
    const outer = this.capture(parent);
    const inner = this.capture(child);
    const contains = outer.containsRegion(inner);
    if (!outer.getIdentity() || !inner.getIdentity() || !this.isCurrent()) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    return contains;
  }

  /**
   * Reads an attribute from the nearest matching ancestor through the Page root.
   *
   * @param regionIdentity - Opaque identity of the registered starting region, included in the search.
   * @param selector - Selector identifying the ancestor to read.
   * @param name - Attribute read from the first matching ancestor.
   * @returns The attribute value, or undefined when the match or attribute is absent.
   * @throws The internal unavailable signal or selector and ownership-check failures.
   */
  readAncestorAttribute(
    regionIdentity: RegionIdentity,
    selector: string,
    name: string,
  ): string | undefined {
    let value: string | undefined;
    this.walkAncestors(regionIdentity, (region) => {
      const matches = region.matches(selector);
      if (matches === undefined) {
        throw DROP_MEASUREMENT_UNAVAILABLE;
      }
      if (!matches) {
        return false;
      }
      value = region.readAttribute(name);
      return true;
    });
    return value;
  }

  /**
   * Checks whether an attachment-bound region contains a registered region.
   *
   * @param region - Candidate containing region.
   * @param identity - Opaque identity of the registered region.
   * @returns True while the registered region remains inside the candidate.
   * @throws The internal unavailable signal or Root ownership-check failures.
   */
  containsIdentity(region: InputRegion, identity: RegionIdentity): boolean {
    const child = this.root.captureRegionByIdentity(identity, this.isAttached);
    if (!region.getIdentity() || !this.isCurrent()) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    if (!child) {
      return false;
    }
    const contains = region.containsRegion(child);
    if (!region.getIdentity() || !child.getIdentity() || !this.isCurrent()) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    return contains;
  }

  /**
   * Reads an anchor attribute while its Page attachment remains current.
   *
   * @param regionIdentity - Opaque identity of the registered anchor within the current Page.
   * @param name - Attribute to read from the anchor.
   * @returns Its value, or undefined when the attribute is absent.
   * @throws The internal unavailable signal or browser and ownership-check failures.
   */
  readAttribute(regionIdentity: RegionIdentity, name: string): string | undefined {
    const region = this.capture(regionIdentity);
    const value = region.readAttribute(name);
    if (!region.getIdentity() || !this.isCurrent()) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    return value;
  }

  /**
   * Visits a registered region and its ancestors through this Page's root.
   *
   * @param regionIdentity - Opaque identity of the registered region inside the current Page.
   * @param predicate - Synchronous test run from the region toward the root, inclusive.
   * @returns True when the predicate stops the walk, otherwise false.
   * @throws The internal unavailable signal or predicate and ownership-check failures.
   */
  walkAncestors(regionIdentity: RegionIdentity, predicate: BlockDropAncestorPredicate): boolean {
    return this.walk(this.capture(regionIdentity), predicate);
  }

  /**
   * Checks whether the current hit belongs to a registered region.
   *
   * @param regionIdentity - Opaque identity of the region within the current Page attachment.
   * @returns True when the hit remains inside the region.
   * @throws The internal unavailable signal or Root ownership-check failures.
   */
  containsHit(regionIdentity: RegionIdentity): boolean {
    const region = this.capture(regionIdentity);
    const contains = region.containsRegion(this.hit);
    if (!this.isCurrent()) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    return contains;
  }

  /**
   * Checks whether the current hit belongs to unoccupied host background.
   *
   * The registered own content/row stays occupied even when its controls have no
   * content marker. This does not exclude those controls from their owner's inside
   * region; it only prevents child-list background from replacing that body action.
   * Marked descendants covering the pointer and exclusions also block background.
   * The host itself is excluded from the ancestor walk.
   *
   * @param host - Registered background owner in the current attachment.
   * @param point - Exact viewport coordinates in CSS pixels.
   * @returns True for unoccupied host background, including rounded hits outside child bounds.
   * @throws The internal unavailable signal or region and ownership-check failures.
   */
  isBackground(host: RegionIdentity, point: BlockDropPoint): boolean {
    const content = this.readContentBounds(host);
    if (content && containsDropPoint(content, point)) {
      return false;
    }
    const boundary = this.capture(host);
    if (!boundary.containsRegion(this.hit)) {
      if (!this.isCurrent()) {
        throw DROP_MEASUREMENT_UNAVAILABLE;
      }
      return false;
    }
    const blocked = this.hit.someAncestorWithin(boundary, (region) => {
      if (region.isSame(boundary)) {
        return false;
      }
      if (region.readAttribute(BLOCK_DROP_EXCLUDE_ATTRIBUTE) !== undefined) {
        return true;
      }
      const occupied = region.matches(
        "[data-block-id], [data-block-item-id], [data-block-content]",
      );
      if (occupied === undefined) {
        throw DROP_MEASUREMENT_UNAVAILABLE;
      }
      if (!occupied) {
        return false;
      }
      const bounds = region.readBounds();
      if (!bounds) {
        throw DROP_MEASUREMENT_UNAVAILABLE;
      }
      return containsDropPoint(
        dropBounds(bounds.left, bounds.top, bounds.width, bounds.height),
        point,
      );
    });
    if (blocked === undefined || !this.isCurrent()) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    return !blocked;
  }

  /**
   * Measures an owned region without exposing its browser rectangle.
   *
   * @param regionIdentity - Opaque identity of the region within the current Page attachment.
   * @returns Detached viewport bounds.
   * @throws The internal unavailable signal or browser and attachment-check failures.
   */
  readBounds(regionIdentity: RegionIdentity): BlockDropBounds {
    const bounds = this.capture(regionIdentity).readBounds();
    if (!bounds || !this.isCurrent()) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    return dropBounds(bounds.left, bounds.top, bounds.width, bounds.height);
  }

  /**
   * Measures an anchor without exposing browser geometry or computed styles.
   *
   * An unavailable region stops the complete query before other registrations
   * can be read. The resolution owner catches the internal unavailable signal.
   *
   * @param regionIdentity - Opaque identity of the registered anchor within the current Page attachment.
   * @returns Detached geometry for the current query.
   * @throws The internal unavailable signal or browser and attachment-check failures.
   */
  read(regionIdentity: RegionIdentity): BlockDropGeometry {
    const region = this.capture(regionIdentity);
    const geometry = readDropGeometry(region);
    if (!geometry) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    const contentRect = this.readContentBounds(regionIdentity);
    const continuesOutline = this.continuesOutline(regionIdentity);
    if (!this.isCurrent()) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    return { ...geometry, contentRect, continuesOutline };
  }

  /**
   * Reads the computed direction of a registered list host.
   *
   * @param regionIdentity - Opaque identity of the list host within the current Page attachment.
   * @returns CSS direction for the current query.
   * @throws The internal unavailable signal or browser and attachment-check failures.
   */
  readDirection(regionIdentity: RegionIdentity): string {
    const region = this.capture(regionIdentity);
    const layout = region.readLayout([]);
    if (!layout || !this.isAttached()) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    return layout.direction;
  }

  /**
   * Reads whether the registered child host continues ordinary outline depth.
   *
   * Only the existing registered child host participates. Its local declaration
   * separates outer sibling placement from body and child drops; no block type,
   * CSS class, descendant traversal or unregistered marker determines this policy.
   * Missing declarations keep ordinary outline behavior for leaves and custom anchors.
   *
   * @param regionIdentity - Opaque identity of the registered anchor owning the child host.
   * @returns False for a local child scope; true when the host is absent or unmarked.
   * @throws The internal unavailable signal or region attribute and ownership-check failures.
   */
  continuesOutline(regionIdentity: RegionIdentity): boolean {
    const anchor = this.capture(regionIdentity);
    const identity = anchor.getIdentity();
    if (!identity || !this.isCurrent()) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    const child = this.regions.getRegionIdentity(anchor, "children", this.root).identity;
    if (!child) {
      return true;
    }
    const region = this.root.captureRegionByIdentity(child, this.isAttached);
    const scope = region?.readAttribute("data-block-drop-scope");
    if (!region?.getIdentity() || !this.isCurrent()) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    return scope !== "local";
  }

  /**
   * Checks that every requested measurement and its attachment remain current.
   *
   * @returns False after a missing measurement or attachment replacement.
   * @throws Propagates attachment-check failures.
   */
  isCurrent(): boolean {
    return this.isAttached();
  }

  /**
   * Measures the registered body or primary row without crossing into child blocks.
   *
   * Empty or omitted regions do not contribute a protected rectangle. The lookup
   * uses primitive registrations only and never searches descendants or the document.
   *
   * @param regionIdentity - Opaque identity of the registered anchor whose own content is protected.
   * @returns First nonempty body or row bounds, or undefined when neither is present.
   * @throws The internal unavailable signal or region measurement and ownership-check failures.
   */
  private readContentBounds(regionIdentity: RegionIdentity): BlockDropBounds | undefined {
    const anchor = this.capture(regionIdentity);
    const identity = anchor.getIdentity();
    if (!identity) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    for (const role of ["content", "row"] as const) {
      const child = this.regions.getRegionIdentity(anchor, role, this.root).identity;
      if (!child) {
        continue;
      }
      const bounds = this.readBounds(child);
      if (bounds.width > 0 && bounds.height > 0) {
        return bounds;
      }
    }
    return undefined;
  }

  /**
   * Captures a registered browser element without transferring its ownership.
   *
   * @param regionIdentity - Opaque identity of the existing region inside the attached Page.
   * @returns Region capability for the current query.
   * @throws The internal unavailable signal or Root ownership-check failures.
   */
  private capture(regionIdentity: RegionIdentity): InputRegion {
    const region = this.root.captureRegionByIdentity(regionIdentity, this.isAttached);
    if (!region || !this.boundary.containsRegion(region) || !this.isCurrent()) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    return region;
  }

  /**
   * Runs an attachment-bound ancestor walk and rejects a stale result.
   *
   * @param region - Starting region inside this Page.
   * @param predicate - Synchronous test run through the root, inclusive.
   * @returns True when the predicate stops the walk, otherwise false.
   * @throws The internal unavailable signal or predicate and ownership-check failures.
   */
  private walk(region: InputRegion, predicate: BlockDropAncestorPredicate): boolean {
    const matched = region.someAncestorWithin(this.boundary, predicate);
    if (matched === undefined || !this.isCurrent()) {
      throw DROP_MEASUREMENT_UNAVAILABLE;
    }
    return matched;
  }
}
