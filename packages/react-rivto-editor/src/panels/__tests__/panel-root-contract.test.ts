import type { ReactEditorExtensionApi } from "../../editor/types";
import type { PanelEventRoute } from "../types";
import type { PanelRegistry } from "../panel-registry";

test("limits active and default Root lookup to occurrence availability", () => {
  type ActiveRoot = NonNullable<
    ReturnType<ReactEditorExtensionApi["panels"]["getActiveInputRoot"]>
  >;
  type DefaultRoot = NonNullable<
    ReturnType<ReactEditorExtensionApi["panels"]["getDefaultInputRoot"]>
  >;
  const activeCanCheck: "isAttached" extends keyof ActiveRoot ? true : false = true;
  const activeCanWriteClipboard: "writeClipboard" extends keyof ActiveRoot ? true : false = false;
  const defaultCanCreateObserver: "createInputObserver" extends keyof DefaultRoot ? true : false =
    false;
  expect({ activeCanCheck, activeCanWriteClipboard, defaultCanCreateObserver }).toEqual({
    activeCanCheck: true,
    activeCanWriteClipboard: false,
    defaultCanCreateObserver: false,
  });
});

test("limits routed and listener Roots to their consumers' operations", () => {
  type RouteRoot = PanelEventRoute["inputRoot"];
  type Recipient = NonNullable<PanelEventRoute["api"]>;
  type ListenerRoot =
    ReturnType<PanelRegistry["getInputRoots"]> extends ReadonlySet<infer Root> ? Root : never;
  const routeCanFocus: "focus" extends keyof RouteRoot ? true : false = true;
  const routeCanCreateObserver: "createInputObserver" extends keyof RouteRoot ? true : false =
    false;
  const listenerCanCheck: "isAttached" extends keyof ListenerRoot ? true : false = true;
  const listenerCanFocus: "focus" extends keyof ListenerRoot ? true : false = false;
  const recipientCanRegisterCleanup: "registerCleanup" extends keyof Recipient ? true : false =
    false;
  expect({
    routeCanFocus,
    routeCanCreateObserver,
    listenerCanCheck,
    listenerCanFocus,
    recipientCanRegisterCleanup,
  }).toEqual({
    routeCanFocus: true,
    routeCanCreateObserver: false,
    listenerCanCheck: true,
    listenerCanFocus: false,
    recipientCanRegisterCleanup: false,
  });
});

test("panel registration borrows the mounted Root without acquiring teardown", () => {
  type RegisteredRoot = Parameters<PanelRegistry["registerPanel"]>[0];
  const canDetach: "detach" extends keyof RegisteredRoot ? true : false = false;
  expect(canDetach).toBe(false);
});
