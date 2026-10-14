import { expect, test } from '@playwright/test';
import type { DocumentEditorAPI } from '@chulane/rivto';
import type { ReactEditorApi } from '@chulane/rivto-react';

for (const repeat of [0, 200]) {
  test(`creation preview renders the actual mindmap without document writes, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const toolbar = page.getByRole('toolbar', { name: 'Visual objects' });
    await toolbar.getByRole('button', { name: 'Diagrams', exact: true }).click();
    const bounds = (await page.locator('.edgeless-viewport').boundingBox())!;
    const stored = () => page.evaluate(() => (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo.editor.dump());
    const original = await stored();
    await page.evaluate(() => {
      const state = window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI }; creationUpdates: number; stopCreationObservation: () => void };
      state.creationUpdates = 0;
      state.stopCreationObservation = state.__rivtoDemo.editor.subscribe(() => { state.creationUpdates += 1; });
    });
    await page.evaluate(() => {
      const state = window as unknown as { __rivtoDemo: { reactEditor: ReactEditorApi }; creationFactoryCalls: number };
      state.creationFactoryCalls = 0;
      const creation = state.__rivtoDemo.reactEditor.elementTypes.get('mindmap')!.creation!;
      const create = creation.create;
      Object.assign(creation, { create: (panel: Parameters<typeof create>[0]) => {
        state.creationFactoryCalls += 1;
        const input = create(panel);
        return { ...input, props: { ...input.props, nodes: [{ id: 'root', parentId: null, label: `Draft ${state.creationFactoryCalls}` }] } };
      } });
    });
    await page.mouse.move(bounds.x + 250, bounds.y + 180);
    const preview = page.locator('[data-edgeless-creation-preview]');
    await expect(preview.locator('[data-mindmap-node="root"]')).toBeVisible();
    await expect(preview).toHaveAttribute('inert', '');
    await expect(preview).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('[data-edgeless-object-id][data-edgeless-visual-kind="mindmap"]')).toHaveCount(0);
    const natural = (await preview.boundingBox())!;
    expect(natural.width).not.toBe(160);
    await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.mouse.move(bounds.x + 450, bounds.y + 280);
    const smallNode = (await preview.locator('[data-mindmap-node]').boundingBox())!;
    await page.mouse.move(bounds.x + 550, bounds.y + 350);
    expect((await preview.locator('[data-mindmap-node]').boundingBox())!.width).toBeGreaterThan(smallNode.width);
    expect(await stored()).toEqual(original);
    expect(await page.evaluate(() => (window as unknown as { creationUpdates: number }).creationUpdates)).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { creationFactoryCalls: number }).creationFactoryCalls)).toBe(1);
    const finalBox = (await preview.boundingBox())!;
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await toolbar.getByRole('button', { name: 'Select', exact: true }).click();
    await expect(preview).toHaveCount(0);
    const created = page.locator('[data-edgeless-visual-kind="mindmap"]');
    await expect(created).toHaveCount(1);
    await expect(created.getByRole('textbox')).toHaveValue('Draft 1');
    expect(await page.evaluate(() => (window as unknown as { creationFactoryCalls: number }).creationFactoryCalls)).toBe(1);
    const createdBox = (await created.boundingBox())!;
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(createdBox[key]).toBeCloseTo(finalBox[key], 0);
    await page.locator('.edgeless-viewport').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(created).toHaveCount(0);
    await toolbar.getByRole('button', { name: 'Diagrams', exact: true }).click();
    await page.mouse.move(bounds.x + 300, bounds.y + 200);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 500, bounds.y + 300);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await toolbar.getByRole('button', { name: 'Select', exact: true }).click();
    await expect(preview).toHaveCount(0);
    await expect(created).toHaveCount(0);
    await page.evaluate(() => (window as unknown as { stopCreationObservation: () => void }).stopCreationObservation());
  });
}

test('built-in placement previews use the same renderer and creation defaults', async ({ page }) => {
  await page.goto('/?repeat=0');
  await page.locator('[data-editor-mode="edgeless"]').click();
  const toolbar = page.getByRole('toolbar', { name: 'Visual objects' });
  for (const [group, label, type, content] of [
    ['Shapes', 'Rectangle', 'rectangle', '.edgeless-shape rect'],
    ['Shapes', 'Ellipse', 'ellipse', '.edgeless-shape ellipse'],
    ['Text', 'Text', 'text', '.edgeless-visual-text'],
    ['Stickies', 'Pink sticky', 'sticker', '.edgeless-sticker-text'],
  ]) {
    await toolbar.getByRole('button', { name: group, exact: true }).click();
    const menu = toolbar.getByRole('dialog');
    if (group === 'Shapes') await menu.getByLabel('Default fill', { exact: true }).fill('#123456');
    await menu.getByRole('button', { name: label, exact: true }).click();
    const bounds = (await page.locator('.edgeless-viewport').boundingBox())!;
    await page.mouse.move(bounds.x + 600, bounds.y + 200);
    const preview = page.locator(`[data-edgeless-creation-preview="${type}"]`);
    await expect(preview.locator(content)).toBeVisible();
    if (group === 'Shapes') await expect(preview.locator(content)).toHaveAttribute('fill', '#123456');
    const previewText = await preview.textContent();
    await page.mouse.down(); await page.mouse.up();
    await toolbar.getByRole('button', { name: 'Select', exact: true }).click();
    const placed = page.locator(`[data-edgeless-visual-kind="${type}"]`).last();
    await expect(placed.locator(content)).toBeVisible();
    if (group === 'Shapes') await expect(placed.locator(content)).toHaveAttribute('fill', '#123456');
    expect(await placed.textContent()).toBe(previewText);
  }
});

test('toolbar drag renders the real ellipse and Escape discards the draft', async ({ page }) => {
  await page.goto('/?repeat=0');
  await page.locator('[data-editor-mode="edgeless"]').click();
  const toolbar = page.getByRole('toolbar', { name: 'Visual objects' });
  await toolbar.getByRole('button', { name: 'Shapes', exact: true }).click();
  const button = (await toolbar.getByRole('button', { name: 'Ellipse', exact: true }).boundingBox())!;
  const canvas = (await page.locator('.edgeless-viewport').boundingBox())!;
  const count = await page.locator('[data-edgeless-visual-kind="ellipse"]').count();
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 600, canvas.y + 240, { steps: 8 });
  const ghost = page.locator('.edgeless-preset-ghost');
  await expect(ghost.locator('.edgeless-shape ellipse')).toBeVisible();
  await expect(ghost.locator('[data-edgeless-creation-preview]')).toHaveAttribute('inert', '');
  await expect(page.locator('[data-edgeless-visual-kind="ellipse"]')).toHaveCount(count);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(ghost).toHaveCount(0);
  await expect(page.locator('[data-edgeless-visual-kind="ellipse"]')).toHaveCount(count);
});
