import { expect, test, type Frame, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

interface DemoWindow extends Window {
  __rivtoDemo: { editor: DocumentEditorAPI };
}

interface AudioProbeWindow extends Window {
  audioProbe: {
    contexts: AudioContext[];
    analysers: AnalyserNode[];
    gains: GainNode[];
    notes: number[];
  };
}

/**
 * Records real audio nodes and scheduled notes for later browser assertions.
 *
 * @param page - Browser page whose documents will host the mixer.
 * @returns Future frames expose their audio graph to the test without replacing audio output.
 */
async function trackAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const current = window as unknown as AudioProbeWindow;
    current.audioProbe = { contexts: [], analysers: [], gains: [], notes: [] };
    const NativeAudioContext = window.AudioContext;
    if (!NativeAudioContext) {
      return;
    }
    const close = NativeAudioContext.prototype.close;
    NativeAudioContext.prototype.close = function () {
      console.info("mixer audio context closed");
      return close.call(this);
    };
    window.AudioContext = class extends NativeAudioContext {
      /**
       * Creates a real context and records it for lifecycle assertions.
       *
       * @param options - Browser audio context configuration.
       */
      constructor(options?: AudioContextOptions) {
        super(options);
        current.audioProbe.contexts.push(this);
      }
      /**
       * Records gain nodes created by the mixer.
       *
       * @returns The gain node used by the widget's audio graph.
       */
      createGain(): GainNode {
        const gain = super.createGain();
        current.audioProbe.gains.push(gain);
        return gain;
      }
      /**
       * Records oscillators created by the mixer.
       *
       * @returns The real oscillator used by the widget.
       */
      createOscillator(): OscillatorNode {
        const oscillator = super.createOscillator();
        const schedule = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
        oscillator.frequency.setValueAtTime = (value, time) => {
          current.audioProbe.notes.push(value);
          return schedule(value, time);
        };
        return oscillator;
      }
    };
  });
}

/**
 * Measures the peak sample from the current mixer output.
 *
 * @param sandbox - Frame whose audio analyser is being observed.
 * @returns The peak absolute sample, or zero when no analyser exists.
 */
async function readAmplitude(sandbox: Frame): Promise<number> {
  return sandbox.evaluate(() => {
    const analyser = (window as unknown as AudioProbeWindow).audioProbe.analysers.at(-1);
    if (!analyser) {
      return 0;
    }
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    return Math.max(...samples.map(Math.abs));
  });
}

/**
 * Checks audible signal and two scheduled copies of the phrase.
 *
 * @param sandbox - Current mixer document containing its actual audio graph.
 * @returns The graph produced nonzero sound and played for more than one phrase.
 */
async function expectMelody(sandbox: Frame): Promise<void> {
  await expect
    .poll(() =>
      sandbox.evaluate(
        () => (window as unknown as AudioProbeWindow).audioProbe.contexts.at(-1)?.state,
      ),
    )
    .toBe("running");
  await sandbox.evaluate(() => {
    const probe = (window as unknown as AudioProbeWindow).audioProbe;
    const context = probe.contexts.at(-1)!;
    const analyser = context.createAnalyser();
    probe.gains.at(-1)!.connect(analyser);
    analyser.connect(context.destination);
    probe.analysers.push(analyser);
  });
  await expect.poll(() => readAmplitude(sandbox)).toBeGreaterThan(0.001);
  const notes = await sandbox.evaluate(
    () => (window as unknown as AudioProbeWindow).audioProbe.notes,
  );
  expect(notes.length).toBeGreaterThanOrEqual(16);
  expect(new Set(notes.slice(0, 8)).size).toBeGreaterThan(2);
  expect(notes.slice(8, 16)).toEqual(notes.slice(0, 8));
  await expect
    .poll(
      () =>
        sandbox.evaluate(
          () => (window as unknown as AudioProbeWindow).audioProbe.contexts.at(-1)!.currentTime,
        ),
      { timeout: 5000 },
    )
    .toBeGreaterThan(2);
  await expect
    .poll(() =>
      sandbox.evaluate(() => (window as unknown as AudioProbeWindow).audioProbe.notes.length),
    )
    .toBeGreaterThanOrEqual(24);
  const repeated = await sandbox.evaluate(
    () => (window as unknown as AudioProbeWindow).audioProbe.notes,
  );
  expect(repeated.slice(16, 24)).toEqual(notes.slice(0, 8));
}

/**
 * Brings the seeded mixer into view in the requested surface.
 *
 * @param page - Demo page with its editor initialized.
 * @param mode - Page block or canvas element to exercise.
 * @returns The iframe name for the visible mixer.
 */
async function showMixer(page: Page, mode: "block" | "edgeless"): Promise<string> {
  if (mode === "block") {
    await page.locator('[data-html-label="Page mixer"]').scrollIntoViewIfNeeded();
    return "Page mixer";
  }
  await page.locator('[data-editor-mode="edgeless"]').click();
  const viewport = page.locator(".edgeless-viewport");
  await viewport.evaluate((root) => {
    const element = (window as unknown as DemoWindow).__rivtoDemo.editor.elements
      .getElementNodes()
      .find((item) => item.props.sample === "mixer");
    if (!element) {
      throw new Error("Missing mixer element");
    }
    const zoom = Number(root.getAttribute("data-edgeless-zoom")) || 1;
    const x = Number(root.getAttribute("data-edgeless-pan-x")) || 0;
    const y = Number(root.getAttribute("data-edgeless-pan-y")) || 0;
    root.dispatchEvent(
      new WheelEvent("wheel", {
        deltaX: x - (120 - element.frame.x * zoom),
        deltaY: y - (180 - element.frame.y * zoom),
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  return "Sound mixer";
}

/**
 * Reads the saved playback flag for one seeded mixer.
 *
 * @param page - Demo page containing the editor.
 * @param mode - Surface containing the mixer being inspected.
 * @returns The saved value, or undefined if the mixer is absent.
 */
async function readMixerPlaying(page: Page, mode: "block" | "edgeless"): Promise<unknown> {
  return page.evaluate((surface) => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    if (surface === "block") {
      return editor.blocks.getBlocks().find((item) => item.props.sample === "mixer-block")?.props
        .playing;
    }
    return editor.elements.getElementNodes().find((item) => item.props.sample === "mixer")?.props
      .playing;
  }, mode);
}

for (const mode of ["block", "edgeless"] as const) {
  test(`mixer produces audio, adjusts volume, and stops in ${mode}`, async ({ page }) => {
    await trackAudio(page);
    await page.goto("/");
    const name = await showMixer(page, mode);
    const frame = page.frameLocator(`iframe[name="${name}"]`);
    const play = frame.getByRole("button", { name: "Play", exact: true });
    if (mode === "block") {
      await play.focus();
      await page.keyboard.press("Enter");
    } else {
      await play.click();
    }
    const sandbox = page.frame({ name });
    if (!sandbox) {
      throw new Error("Missing mixer frame");
    }
    await expectMelody(sandbox);
    const slider = frame.getByRole("slider", { name: "Volume" });
    await slider.focus();
    await page.keyboard.press("Home");
    await expect
      .poll(() =>
        sandbox.evaluate(
          () => (window as unknown as AudioProbeWindow).audioProbe.gains.at(-1)?.gain.value,
        ),
      )
      .toBeLessThan(0.001);
    await page.keyboard.press("End");
    await expect
      .poll(() =>
        sandbox.evaluate(
          () => (window as unknown as AudioProbeWindow).audioProbe.gains.at(-1)?.gain.value,
        ),
      )
      .toBeGreaterThan(0.079);
    await frame.getByRole("button", { name: "Pause", exact: true }).click();
    await expect
      .poll(() =>
        sandbox.evaluate(
          () => (window as unknown as AudioProbeWindow).audioProbe.contexts.at(-1)?.state,
        ),
      )
      .toBe("closed");
  });

  test(`mixer stops on source editing and does not autoplay on remount in ${mode}`, async ({
    page,
  }) => {
    let closes = 0;
    page.on("console", (message) => {
      if (message.text() === "mixer audio context closed") {
        closes += 1;
      }
    });
    await trackAudio(page);
    await page.goto("/");
    const name = await showMixer(page, mode);
    const frame = page.frameLocator(`iframe[name="${name}"]`);
    await frame.getByRole("button", { name: "Play", exact: true }).click();
    await expect(frame.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    const host = page.locator(`[data-html-label="${name}"]`);
    const owner = host.locator(
      mode === "block"
        ? "xpath=ancestor::*[@data-block-id][1]"
        : "xpath=ancestor::*[@data-edgeless-object-id][1]",
    );
    await owner.hover();
    await owner.getByRole("button", { name: "Edit HTML" }).click();
    await expect.poll(() => closes).toBe(1);
    await owner.getByRole("button", { name: "Done", exact: true }).click();
    await expect(frame.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await expect.poll(() => readMixerPlaying(page, mode)).toBe(true);
    const sandbox = page.frame({ name });
    if (!sandbox) {
      throw new Error("Missing remounted mixer frame");
    }
    expect(
      await sandbox.evaluate(
        () => (window as unknown as AudioProbeWindow).audioProbe.contexts.length,
      ),
    ).toBe(0);
    await frame.getByRole("button", { name: "Play", exact: true }).click();
    await expect(frame.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await frame.getByRole("button", { name: "Pause", exact: true }).click();
    await expect.poll(() => closes).toBe(2);
  });

  test(`undo stops mixer playback in ${mode}`, async ({ page }) => {
    await trackAudio(page);
    await page.goto("/");
    const name = await showMixer(page, mode);
    await page.evaluate(() => (window as unknown as DemoWindow).__rivtoDemo.editor.history.clear());
    const frame = page.frameLocator(`iframe[name="${name}"]`);
    await frame.getByRole("button", { name: "Play", exact: true }).click();
    await expect(frame.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    const sandbox = page.frame({ name });
    if (!sandbox) {
      throw new Error("Missing mixer frame");
    }
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(frame.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await expect
      .poll(() =>
        sandbox.evaluate(
          () => (window as unknown as AudioProbeWindow).audioProbe.contexts.at(-1)?.state,
        ),
      )
      .toBe("closed");
  });
}

test("mixer reports audio startup failure without enabling playback", async ({ page }) => {
  await page.addInitScript(() => {
    if (window.AudioContext) {
      window.AudioContext.prototype.resume = () => Promise.reject(new Error("Audio unavailable"));
    }
  });
  await page.goto("/");
  await showMixer(page, "block");
  const frame = page.frameLocator('iframe[name="Page mixer"]');
  await frame.getByRole("button", { name: "Play", exact: true }).click();
  await expect(frame.locator("#status")).toHaveText("Audio could not start.");
  await expect(frame.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as DemoWindow).__rivtoDemo.editor.blocks
          .getBlocks()
          .find((item) => item.props.sample === "mixer-block")?.props.playing,
    ),
  ).toBe(false);
});

test("leaving Page stops its playing mixer", async ({ page }) => {
  let closes = 0;
  page.on("console", (message) => {
    if (message.text() === "mixer audio context closed") {
      closes += 1;
    }
  });
  await trackAudio(page);
  await page.goto("/");
  await showMixer(page, "block");
  const frame = page.frameLocator('iframe[name="Page mixer"]');
  await frame.getByRole("button", { name: "Play", exact: true }).click();
  await expect(frame.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.locator('[data-editor-mode="edgeless"]').click();
  await expect.poll(() => closes).toBe(1);
});

test("a suspended mixer does not accumulate future phrases", async ({ page }) => {
  await trackAudio(page);
  await page.goto("/");
  await showMixer(page, "block");
  const frame = page.frameLocator('iframe[name="Page mixer"]');
  await frame.getByRole("button", { name: "Play", exact: true }).click();
  await expect(frame.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  const sandbox = page.frame({ name: "Page mixer" });
  if (!sandbox) {
    throw new Error("Missing mixer frame");
  }
  const suspended = await sandbox.evaluate(async () => {
    const probe = (window as unknown as AudioProbeWindow).audioProbe;
    await probe.contexts.at(-1)!.suspend();
    const before = probe.notes.length;
    await new Promise<void>((resolve) => setTimeout(resolve, 2200));
    return { before, after: probe.notes.length };
  });
  expect(suspended.after).toBe(suspended.before);
  await sandbox.evaluate(() =>
    (window as unknown as AudioProbeWindow).audioProbe.contexts.at(-1)!.resume(),
  );
  await expect
    .poll(
      () => sandbox.evaluate(() => (window as unknown as AudioProbeWindow).audioProbe.notes.length),
      { timeout: 5000 },
    )
    .toBeGreaterThan(suspended.after);
  await frame.getByRole("button", { name: "Pause", exact: true }).click();
});
