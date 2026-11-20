import type { InputRegion, InputRoot, RegionIdentity } from "@chulane/rivto-root";
import type { ReactNode } from "react";

/** Marker content and controls placed at its enclosing block boundary. */
export interface TableBlockBoundaryProps {
  readonly className: string;
  readonly children?: ReactNode;
  readonly controls: ReactNode;
}

/** Native portal host retained only by the table mounting adapter. */
export interface TableBlockBoundaryHost {
  readonly marker: HTMLElement;
  readonly host: HTMLElement;
  readonly root: Pick<InputRoot, "isAttached" | "getElementIdentity" | "captureRegionByIdentity">;
  readonly identity: RegionIdentity;
  readonly region: Pick<InputRegion, "getIdentity">;
}
