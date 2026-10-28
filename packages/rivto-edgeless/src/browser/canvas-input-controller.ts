import type { CanvasEvents } from "./canvas-events";
import type { CanvasInputOptions, CanvasInputScene } from "./types";
import type { Point } from "../types/canvas";
import { CanvasViewport } from "./canvas-viewport";

/** Normalized line/page wheel deltas up to this many CSS pixels per axis follow input directly. */
const DIRECT_WHEEL_PAN_LIMIT = 32;

/** Owns native camera, selection, focus and capture behavior without a React dependency. */
export class CanvasInputController {
  private connected = false;
  private readonly eventReleases: (() => void)[] = [];
  private disposed = true;
  private space = false;
  private primaryPointerId?: number;
  private pan?: { point: Point; x: number; y: number; pointer: number; moved: boolean };
  private panFrame?: number;
  private pendingPan?: Pick<PointerEvent, "clientX" | "clientY">;
  private wheelPan?: { target: Point; frame?: number };
  private marquee?: { point: Point; base: readonly string[]; pointer: number };
  private releaseFocus?: () => void;
  private rect!: HTMLDivElement;

  /**
   * Binds one browser viewport to a scene without installing listeners.
   *
   * @param canvas - Scene receiving normalized camera and selection changes.
   * @param root - Fixed browser viewport for this controller.
   * @param events - Borrowed registration API attached by the browser viewport owner.
   * @param options - Live native-input admission policies and notifications.
   */
  constructor(
    private readonly canvas: CanvasInputScene,
    private readonly root: HTMLElement,
    private readonly events: Pick<CanvasEvents, "register">,
    private options: CanvasInputOptions = {},
  ) {}

  /**
   * Replaces host input policies without reinstalling browser listeners.
   *
   * @param options - Policies used by subsequent native input events.
   * @returns Existing gestures retain their starting geometry and use the new callbacks.
   */
  update(options: CanvasInputOptions): void {
    this.options = options;
  }

  /**
   * Installs native input registrations for one connected browser surface.
   *
   * DOM attachment and lookup remain owned by CanvasViewport; connecting input
   * does not create a second viewport registration.
   *
   * @returns Idempotent cleanup releasing listeners, capture, focus pins and marquee DOM.
   * @throws If this controller is already connected or the browser setup fails.
   */
  connect(): () => void {
    if (this.connected) {
      throw new Error("Canvas input is already connected");
    }
    const cleanup = this.connectEvents();
    this.connected = true;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.connected = false;
      cleanup();
    };
  }

  /**
   * Initializes connection-local gesture state and installs browser listeners.
   *
   * Each remount receives fresh pointer state while the scene retains its camera.
   *
   * @returns Cleanup for this connection's native resources.
   */
  private connectEvents(): () => void {
    const win = this.root.ownerDocument.defaultView;
    if (!win) {
      throw new Error("Canvas input requires a document with a window");
    }
    this.disposed = false;
    this.space = false;
    this.rect = this.root.ownerDocument.createElement("div");
    Object.assign(this.rect.style, {
      position: "absolute",
      pointerEvents: "none",
      border: "1px solid #5292ff",
      background: "#5292ff22",
      display: "none",
      zIndex: "1000",
    });
    this.root.append(this.rect);
    try {
      this.registerEvents();
    } catch (error) {
      this.disconnectEvents();
      throw error;
    }
    return () => this.disconnectEvents();
  }

  /**
   * Releases native input listeners and connection-local gesture resources.
   *
   * @returns Listeners, focus pins and marquee DOM are released even when gesture cleanup fails.
   * @throws Propagates gesture or focus cleanup failures after releasing native resources.
   */
  private disconnectEvents(): void {
    this.disposed = true;
    this.cancelWheelPan();
    try {
      this.stopPointerGesture();
    } finally {
      for (const release of this.eventReleases.splice(0)) {
        release();
      }
      try {
        this.releaseFocus?.();
      } finally {
        this.releaseFocus = undefined;
        this.rect.remove();
      }
    }
  }

  /**
   * Registers default camera and selection inputs through the viewport's event owner.
   *
   * Higher-priority registrations may claim a native listener group before these
   * defaults run. Global gesture listeners belong to the viewport's own window.
   *
   * @returns Every created registration is retained for connection cleanup.
   * @throws Propagates registration failures; the caller releases partial setup.
   */
  private registerEvents(): void {
    this.registerCameraEvents();
    this.registerFocusEvents();
    this.registerWindowEvents();
  }

  /**
   * Registers viewport-local camera and keyboard handlers.
   *
   * @returns Camera input registrations are retained for connection cleanup.
   */
  private registerCameraEvents(): void {
    this.eventReleases.push(
      this.events.register({
        id: "canvas.input.pointer-start",
        type: "pointerdown",
        capture: true,
        handle: this.onPointerDown,
      }),
    );
    this.eventReleases.push(
      this.events.register({ id: "canvas.input.wheel", type: "wheel", handle: this.onWheel }),
    );
    this.eventReleases.push(
      this.events.register({
        id: "canvas.input.auxclick",
        type: "auxclick",
        capture: true,
        handle: this.onAuxClick,
      }),
    );
    this.eventReleases.push(
      this.events.register({ id: "canvas.input.keydown", type: "keydown", handle: this.onKeyDown }),
    );
  }

  /**
   * Registers focus observation for mounting the actively edited element.
   *
   * @returns Focus registrations are retained for connection cleanup.
   */
  private registerFocusEvents(): void {
    this.eventReleases.push(
      this.events.register({
        id: "canvas.input.focusin",
        type: "focusin",
        handle: this.pinFocusedElement,
      }),
    );
    this.eventReleases.push(
      this.events.register({
        id: "canvas.input.focusout",
        type: "focusout",
        handle: this.onFocusOut,
      }),
    );
  }

  /**
   * Registers global gesture continuation and cancellation handlers.
   *
   * @returns Window registrations are retained for connection cleanup.
   */
  private registerWindowEvents(): void {
    this.eventReleases.push(
      this.events.register({
        id: "canvas.input.pointer-move",
        type: "pointermove",
        target: "window",
        handle: this.onPointerMove,
      }),
    );
    this.eventReleases.push(
      this.events.register({
        id: "canvas.input.pointer-end",
        type: "pointerup",
        target: "window",
        handle: this.stopPointerGesture,
      }),
    );
    this.eventReleases.push(
      this.events.register({
        id: "canvas.input.pointer-cancel",
        type: "pointercancel",
        target: "window",
        handle: this.onPointerCancel,
      }),
    );
    this.eventReleases.push(
      this.events.register({
        id: "canvas.input.keyup",
        type: "keyup",
        target: "window",
        handle: this.onKeyUp,
      }),
    );
    this.eventReleases.push(
      this.events.register({
        id: "canvas.input.blur",
        type: "blur",
        target: "window",
        handle: this.onBlur,
      }),
    );
  }

  /**
   * Converts a native pointer position to viewport-local CSS pixels.
   *
   * @param event - Native client coordinates.
   * @returns Position relative to the current viewport origin.
   */
  private readonly toViewportPoint = (event: { clientX: number; clientY: number }): Point => {
    const box = this.root.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  /**
   * Recognizes editable content and controls that keep native input.
   *
   * @param event - Input whose target is inspected.
   * @returns Whether the target belongs to interactive content.
   */
  private readonly isInteractive = (event: Event) =>
    event.target instanceof Element &&
    Boolean(
      event.target.closest(
        "input,textarea,select,button,[contenteditable]:not([contenteditable=false]),[data-canvas-control]",
      ),
    );

  /**
   * Applies host camera policy or the default native-content exclusion.
   *
   * @param event - Pointer or wheel event inside the viewport.
   * @returns Whether the camera may consume this event.
   */
  private readonly allowsCamera = (event: PointerEvent | WheelEvent) => {
    if (this.options.allowCamera) {
      return this.options.allowCamera(event);
    }
    return ("button" in event && event.button === 1) || !this.isInteractive(event);
  };

  /**
   * Reports pan readiness and active tracking to the host.
   *
   * @returns The host has received the current pan flags.
   */
  private readonly reportPanState = () =>
    this.options.onPanState?.(
      this.space || Boolean(this.options.panEnabled?.()),
      Boolean(this.pan),
    );

  /**
   * Starts an admitted pan, item selection or empty-space marquee.
   *
   * @param event - Native pointerdown originating in this viewport.
   * @returns The chosen gesture is captured or the event remains available to content.
   */
  private readonly onPointerDown = (event: PointerEvent) => {
    if (
      event.target instanceof Element &&
      CanvasViewport.forElement(event.target)?.canvas !== this.canvas
    ) {
      return;
    }
    this.cancelWheelPan();
    if (this.pan || this.marquee) {
      return;
    }
    if (event.button === 0) {
      this.primaryPointerId ??= event.pointerId;
    }
    if (
      this.allowsCamera(event) &&
      (event.button === 1 || (event.button === 0 && (this.space || this.options.panEnabled?.())))
    ) {
      this.startPan(event);
      return;
    }
    if (this.options.interactions === false || event.button !== 0 || this.isInteractive(event)) {
      return;
    }
    const host =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-canvas-element]")
        : null;
    if (host) {
      const id = host.dataset.canvasElement!;
      const ids = this.canvas.selection.get();
      if (event.metaKey || event.ctrlKey) {
        this.canvas.select(ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
      } else if (!ids.includes(id)) {
        this.canvas.select([id]);
      }
      return;
    }
    this.marquee = {
      point: this.toViewportPoint(event),
      base: event.ctrlKey || event.metaKey ? this.canvas.selection.get() : [],
      pointer: event.pointerId,
    };
    this.canvas.select(this.marquee.base);
    this.root.setPointerCapture(event.pointerId);
    this.root.focus();
    event.preventDefault();
  };

  /**
   * Captures an admitted camera pan from its initial client position.
   *
   * @param event - Pointer sample already accepted by the camera policy.
   * @returns Pointer capture and host pan state reflect the active gesture.
   * @throws If browser pointer capture or the host's pan-state callback fails.
   */
  private startPan(event: PointerEvent): void {
    const camera = this.canvas.camera.get();
    this.pan = {
      point: { x: event.clientX, y: event.clientY },
      x: camera.x,
      y: camera.y,
      pointer: event.pointerId,
      moved: false,
    };
    this.root.setPointerCapture(event.pointerId);
    this.reportPanState();
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Updates only an active pan or marquee from a captured pointer.
   *
   * @param event - Latest native pointer sample.
   * The first pan movement publishes immediately. Later samples retain only the
   * latest client position until the next animation frame, so high-rate mouse input
   * cannot repeatedly publish camera state and starve painting. Marquee selection
   * still processes each admitted sample.
   *
   * @returns The first pan movement is published, later pan paint is scheduled,
   * or selection reflects this sample without source geometry writes.
   * @throws If the first movement's camera subscribers reject publication.
   */
  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.pan && !this.marquee) {
      return;
    }
    if (this.pan && event.pointerId === this.pan.pointer) {
      this.pendingPan = { clientX: event.clientX, clientY: event.clientY };
      if (!this.pan.moved) {
        // Waiting for a frame here adds visible latency before the canvas follows the first movement.
        this.pan.moved = event.clientX !== this.pan.point.x || event.clientY !== this.pan.point.y;
        this.flushPan();
      } else {
        this.panFrame ??= this.root.ownerDocument.defaultView!.requestAnimationFrame(this.flushPan);
      }
      event.preventDefault();
    } else if (this.marquee && event.pointerId === this.marquee.pointer) {
      const point = this.toViewportPoint(event);
      const x = Math.min(point.x, this.marquee.point.x),
        y = Math.min(point.y, this.marquee.point.y);
      const width = Math.abs(point.x - this.marquee.point.x),
        height = Math.abs(point.y - this.marquee.point.y);
      if (Math.hypot(width, height) < 3) {
        return;
      }
      Object.assign(this.rect.style, {
        display: "block",
        left: `${x}px`,
        top: `${y}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
      const origin = this.canvas.toWorld({ x, y }),
        zoom = this.canvas.camera.get().zoom;
      this.canvas.select([
        ...this.marquee.base,
        ...this.canvas.query({ ...origin, width: width / zoom, height: height / zoom }),
      ]);
    }
  };

  /**
   * Releases pan and marquee tracking and hides the selection rectangle.
   *
   * Pointer release publishes its final coordinates even before the scheduled frame.
   * Cancellation, blur and detachment discard pending movement and cancel its frame.
   *
   * @param event - Optional pointer completion; active pans suppress its native default.
   * @returns Tracking, scheduled paint and host pan flags are cleared.
   * @throws Propagates camera publication, host notification or pointer capture failures.
   */
  private readonly stopPointerGesture = (event?: PointerEvent) => {
    const pointer = this.pan?.pointer ?? this.marquee?.pointer;
    if (event && pointer !== undefined && event.pointerId !== pointer) {
      return;
    }
    if (this.panFrame !== undefined) {
      this.root.ownerDocument.defaultView!.cancelAnimationFrame(this.panFrame);
      this.panFrame = undefined;
    }
    try {
      if (this.pan && event?.type === "pointerup") {
        this.pendingPan = { clientX: event.clientX, clientY: event.clientY };
        this.flushPan();
      }
    } finally {
      this.pendingPan = undefined;
      if (this.pan) {
        event?.preventDefault();
      }
      this.pan = undefined;
      this.marquee = undefined;
      if (!event || event.pointerId === this.primaryPointerId) {
        this.primaryPointerId = undefined;
      }
      this.rect.style.display = "none";
      this.reportPanState();
      if (pointer !== undefined && this.root.hasPointerCapture(pointer)) {
        this.root.releasePointerCapture(pointer);
      }
    }
  };

  /**
   * Publishes the latest pending pan position without measuring viewport layout.
   *
   * Consumes the sample before notifying subscribers. Pointer release can invoke
   * this synchronously after cancelling the scheduled frame; cancellation never
   * applies movement that has not yet been presented. The first movement also
   * calls this synchronously; subsequent samples use the browser's paint cadence.
   *
   * @returns The camera reflects the latest sample, or stays unchanged without an active pan.
   * @throws Propagates camera subscriber failures.
   */
  private readonly flushPan = (): void => {
    this.panFrame = undefined;
    const pending = this.pendingPan;
    this.pendingPan = undefined;
    if (!this.pan || !pending) {
      return;
    }
    // Client-coordinate deltas cancel the viewport origin without forcing layout after pan styles change.
    this.canvas.setCamera({
      ...this.canvas.camera.get(),
      x: this.pan.x + pending.clientX - this.pan.point.x,
      y: this.pan.y + pending.clientY - this.pan.point.y,
    });
  };

  /**
   * Pans by wheel deltas or zooms around the pointer with Ctrl or Meta.
   *
   * Pixel deltas apply directly at every speed: trackpad acceleration and momentum
   * already describe the movement to display. Larger line/page steps publish intermediate
   * camera positions so a repeating dot grid visibly moves even for whole-grid jumps.
   *
   * @param event - Native wheel event subject to host camera policy.
   * @returns Admitted input moves the camera or schedules its remaining wheel displacement.
   * @throws If the wheel target is not finite or camera subscribers reject publication.
   */
  private readonly onWheel = (event: WheelEvent) => {
    if (
      event.target instanceof Element &&
      CanvasViewport.forElement(event.target)?.canvas !== this.canvas
    ) {
      return;
    }
    if (!this.allowsCamera(event)) {
      return;
    }
    const camera = this.canvas.camera.get();
    if (event.ctrlKey || event.metaKey) {
      this.cancelWheelPan();
      this.canvas.zoomAt(
        camera.zoom * Math.exp(-event.deltaY * 0.006),
        this.toViewportPoint(event),
      );
    } else {
      const delta = this.wheelDeltaInPixels(event);
      this.panByWheel(delta.x, delta.y, event.deltaMode === 0);
    }
    event.preventDefault();
  };

  /**
   * Converts native line and page wheel units to camera displacement in CSS pixels.
   *
   * Pixel-mode input retains fractional precision. Line-mode input uses the root's
   * computed line height, falling back to 16 pixels for a nonnumeric normal value.
   * Page-mode input uses the viewport width and height for the corresponding axes.
   *
   * @param event - Admitted wheel event with its native delta mode.
   * @returns Horizontal and vertical displacement in CSS pixels.
   */
  private wheelDeltaInPixels(event: WheelEvent): Point {
    if (event.deltaMode === 1) {
      const style = this.root.ownerDocument.defaultView!.getComputedStyle(this.root);
      const lineHeight = Number.parseFloat(style.lineHeight) || 16;
      return { x: event.deltaX * lineHeight, y: event.deltaY * lineHeight };
    }
    if (event.deltaMode === 2) {
      return { x: event.deltaX * this.root.clientWidth, y: event.deltaY * this.root.clientHeight };
    }
    return { x: event.deltaX, y: event.deltaY };
  }

  /**
   * Accumulates wheel displacement without delaying pixel-mode trackpad samples.
   *
   * Pixel-mode samples move the current camera immediately regardless of magnitude,
   * and also shift any pending target, preserving every input delta when coarse and
   * fine samples are mixed. Delta size cannot distinguish a fast trackpad swipe
   * from a mouse wheel; applying easing to it adds latency to native momentum.
   *
   * @param x - Horizontal displacement in CSS pixels.
   * @param y - Vertical displacement in CSS pixels.
   * @param pixelMode - Whether native deltas were already expressed in pixels.
   * @returns The camera advances directly or starts a bounded easing tail.
   * @throws If the accumulated target is not finite or camera subscribers fail.
   */
  private panByWheel(x: number, y: number, pixelMode: boolean): void {
    const camera = this.canvas.camera.get();
    const previous = this.wheelPan?.target ?? camera;
    const target = { x: previous.x - x, y: previous.y - y };
    if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) {
      throw new RangeError("Invalid wheel pan target");
    }
    if (pixelMode || Math.max(Math.abs(x), Math.abs(y)) <= DIRECT_WHEEL_PAN_LIMIT) {
      if (this.wheelPan) {
        this.wheelPan.target = target;
      }
      this.canvas.setCamera({ ...camera, x: camera.x - x, y: camera.y - y });
    } else if (this.wheelPan) {
      this.wheelPan.target = target;
    } else {
      this.wheelPan = { target };
      this.paintWheelPan();
    }
  }

  /**
   * Advances a coarse wheel jump while keeping the grid and content on one camera.
   *
   * Each frame halves the remaining distance, then snaps within half a CSS pixel
   * to the exact target, including when floating-point precision prevents another
   * intermediate position. Work is scheduled before notification so teardown from a
   * subscriber can cancel it and subscriber failures cannot strand the gesture.
   *
   * @returns The next camera position is published; no frame remains after settling.
   * @throws If camera subscribers reject publication.
   */
  private readonly paintWheelPan = (): void => {
    const pan = this.wheelPan;
    if (!pan) {
      return;
    }
    const camera = this.canvas.camera.get();
    const x = pan.target.x - camera.x;
    const y = pan.target.y - camera.y;
    const next = { x: camera.x / 2 + pan.target.x / 2, y: camera.y / 2 + pan.target.y / 2 };
    const settled =
      Math.max(Math.abs(x), Math.abs(y)) <= 0.5 || (next.x === camera.x && next.y === camera.y);
    if (settled) {
      this.wheelPan = undefined;
    } else {
      // Immediate whole-grid jumps look stationary; intermediate camera positions expose the motion.
      pan.frame = this.root.ownerDocument.defaultView!.requestAnimationFrame(this.paintWheelPan);
    }
    this.canvas.setCamera({
      ...camera,
      x: settled ? pan.target.x : next.x,
      y: settled ? pan.target.y : next.y,
    });
  };

  /**
   * Discards unpainted wheel movement when another gesture takes over or the view detaches.
   *
   * @returns Any scheduled wheel frame is cancelled; the last published camera is retained.
   */
  private cancelWheelPan(): void {
    if (this.wheelPan?.frame !== undefined) {
      this.root.ownerDocument.defaultView!.cancelAnimationFrame(this.wheelPan.frame);
    }
    this.wheelPan = undefined;
  }

  /**
   * Enables Space panning or cancels the active local gesture on Escape.
   *
   * @param event - Keyboard input bubbling through the viewport.
   * @returns Editing retains Space; accepted shortcuts update transient state.
   */
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (
      event.target instanceof Element &&
      CanvasViewport.forElement(event.target)?.canvas !== this.canvas
    ) {
      return;
    }
    if (event.code === "Space" && !this.isInteractive(event)) {
      this.space = true;
      this.reportPanState();
      event.preventDefault();
    }
    if (event.key === "Escape") {
      this.cancelWheelPan();
      this.canvas.cancelTransform();
      this.stopPointerGesture();
    }
  };

  /**
   * Releases Space panning even when keyup occurs outside the viewport.
   *
   * @param event - Native window keyup.
   * @returns Space readiness is cleared when appropriate.
   */
  private readonly onKeyUp = (event: KeyboardEvent) => {
    if (event.code === "Space") {
      this.space = false;
      this.reportPanState();
    }
  };

  /**
   * Cancels transient gestures when the window loses focus.
   *
   * @returns No local pan, marquee or transform remains active.
   */
  private readonly onBlur = () => {
    this.cancelWheelPan();
    this.space = false;
    this.stopPointerGesture();
    this.canvas.cancelTransform();
  };

  /**
   * Pins the element containing active DOM focus and releases the previous scope.
   *
   * @returns The focused host remains mounted outside the visible viewport.
   */
  private readonly pinFocusedElement = () => {
    if (this.disposed) {
      return;
    }
    const previous = this.releaseFocus;
    this.releaseFocus = undefined;
    const host =
      this.root.ownerDocument.activeElement?.closest<HTMLElement>("[data-canvas-element]");
    if (host && this.root.contains(host)) {
      this.releaseFocus = this.canvas.pin([host.dataset.canvasElement!]);
    }
    previous?.();
  };

  /**
   * Defers focus reconciliation until the browser assigns the next active element.
   *
   * @returns A microtask will reconcile focus pins unless the view was unmounted.
   */
  private readonly onFocusOut = () => queueMicrotask(this.pinFocusedElement);

  /**
   * Suppresses native middle-button clipboard and autoscroll defaults.
   *
   * @param event - Auxiliary mouse input inside the viewport.
   * @returns Middle-button input is marked handled without modifying clipboard data.
   */
  private readonly onAuxClick = (event: MouseEvent) => {
    if (event.button === 1) {
      event.preventDefault();
    }
  };

  /**
   * Cancels only a pointer owned by this viewport's camera, marquee or transform gesture.
   *
   * @param event - Native pointer cancellation, possibly from another contact.
   * @returns The matching gesture is released without stopping unrelated pointers.
   */
  private readonly onPointerCancel = (event: PointerEvent) => {
    try {
      if (event.pointerId === this.primaryPointerId) {
        this.canvas.cancelTransform();
      }
    } finally {
      this.stopPointerGesture(event);
    }
  };
}
