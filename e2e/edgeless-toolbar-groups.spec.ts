import { expect, test } from '@playwright/test';

for (const repeat of [0, 200]) {
  test(`Diagrams highlights its active tool and keeps its menu during placement, repeat=${repeat}`, async ({ page }) => {
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const bar = page.getByRole('toolbar', { name: 'Visual objects' });
    const group = bar.getByRole('button', { name: 'Diagrams', exact: true });
    const inactiveBackground = await group.evaluate(element => getComputedStyle(element).backgroundColor);
    await group.focus();
    await page.keyboard.press('Enter');
    await expect(group).toHaveAttribute('aria-expanded', 'true');
    await expect(bar.getByRole('dialog', { name: 'diagrams tools' })).toHaveAttribute('data-slot', 'popover-content');
    await expect(group).toBeFocused();
    await expect(group).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(bar.getByRole('dialog', { name: 'diagrams tools' })).toHaveAttribute('id', (await group.getAttribute('aria-controls'))!);
    const mindmap = bar.getByRole('button', { name: 'Mindmap', exact: true });
    await expect(mindmap).toHaveAttribute('aria-pressed', 'true');
    await expect(group).toHaveAttribute('aria-pressed', 'true');
    expect(await group.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(inactiveBackground);
    expect(await mindmap.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(inactiveBackground);
    const bounds = await page.locator('.edgeless-viewport').boundingBox();
    await page.mouse.click(bounds!.x + 200, bounds!.y + 220);
    await expect(page.locator('[data-mindmap]')).toHaveCount(1);
    await expect(group).toHaveAttribute('aria-expanded', 'true');
    await group.click();
    await expect(group).toHaveAttribute('aria-expanded', 'false');
    await expect(group).toHaveAttribute('aria-pressed', 'true');
    await bar.getByRole('button', { name: 'Select', exact: true }).click();
    await expect(group).toHaveAttribute('aria-pressed', 'false');
    await group.click();
    await page.keyboard.press('Escape');
    await expect(group).toHaveAttribute('aria-expanded', 'false');
    await expect(bar.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
}

test('an extension contributes to Shapes, remembers its tool independently and unregisters cleanly', async ({ page }) => {
  await page.goto('/?elementRegistration=1&toolbarGroup=shapes');
  const first = page.locator('[data-canvas="first"]');
  const second = page.locator('[data-canvas="second"]');
  const a = first.getByRole('toolbar', { name: 'Visual objects' });
  const b = second.getByRole('toolbar', { name: 'Visual objects' });
  await a.getByRole('button', { name: 'Shapes', exact: true }).click();
  const badge = a.getByRole('button', { name: 'Badge', exact: true });
  await badge.focus();
  await page.keyboard.press('Enter');
  await expect(badge).toHaveAttribute('aria-pressed', 'true');
  const bounds = await first.locator('.edgeless-viewport').boundingBox();
  await page.mouse.click(bounds!.x + 200, bounds!.y + 150);
  await expect(first.locator('[data-custom-badge]')).toHaveCount(1);
  await expect(first.getByLabel('Default fill')).toBeVisible();
  await a.getByRole('button', { name: 'Select', exact: true }).click();
  await b.getByRole('button', { name: 'Shapes', exact: true }).click();
  await expect(b.getByRole('button', { name: 'Rectangle', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await b.getByRole('button', { name: 'Ellipse', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(b.getByRole('button', { name: 'Ellipse', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await a.getByRole('button', { name: 'Shapes', exact: true }).click();
  await expect(badge).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Unregister badge', exact: true }).click();
  await expect(badge).toHaveCount(0);
  await expect(a.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(first.locator('[data-custom-state]')).toContainText('"type":"badge"');
});

test('a deferred group uses custom contents and closes on group disposal', async ({ page }) => {
  await page.goto('/?elementRegistration=1&toolbarGroup=custom');
  const panel = page.locator('[data-canvas="first"]');
  const group = panel.getByRole('button', { name: 'Custom tools', exact: true });
  await expect(group).toHaveCount(0);
  await page.getByRole('button', { name: 'Register badge group', exact: true }).click();
  await group.click();
  await expect(panel.locator('[data-custom-tools]')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Badge', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Unregister badge group', exact: true }).click();
  await expect(group).toHaveCount(0);
  await expect(panel.locator('[data-custom-tools]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Register badge group', exact: true }).click();
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await group.click();
  await expect(panel.locator('[data-custom-tools]')).toBeVisible();
  await page.getByRole('button', { name: 'Unregister badge', exact: true }).click();
  await expect(group).toHaveCount(0);
});
