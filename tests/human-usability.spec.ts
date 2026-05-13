import { expect, type Locator, type Page, test } from '@playwright/test';

const BASE_HUD_IDS = [
  'hud-root',
  'hud-top-bar',
  'hud-team-roster',
  'hud-command-bar',
  'hud-view-controls',
  'hud-camera-zoom-in',
  'hud-camera-zoom-out',
  'hud-camera-reset-camera',
  'hud-command-plan',
  'hud-command-contact-drill',
  'hud-command-end-side',
] as const;

const SELECTED_UNIT_IDS = [
  'hud-selected-unit-panel',
  'hud-action-move',
  'hud-action-hold-angle',
  'hud-action-done',
] as const;

const CLICK_TARGET_IDS = new Set([
  'hud-camera-zoom-in',
  'hud-camera-zoom-out',
  'hud-camera-reset-camera',
  'hud-command-plan',
  'hud-command-contact-drill',
  'hud-command-end-side',
  'hud-command-end-side-secondary',
  'hud-command-run-execute',
  'hud-action-move',
  'hud-action-shoot',
  'hud-action-hold-angle',
  'hud-action-smoke',
  'hud-action-flash',
  'hud-action-reload',
  'hud-action-done',
  'hud-action-plant',
  'hud-action-defuse',
  'hud-action-pickup',
]);

async function expectHudReachable(page: Page, ids: readonly string[]) {
  await page.waitForSelector(`[data-testid="${ids[0]}"]`, { timeout: 10_000 });
  const results = await page.evaluate(({ ids, clickTargetIds }) => {
    return ids.map((id) => {
      const elements = Array.from(document.querySelectorAll(`[data-testid="${id}"]`));
      const element = elements[0] as HTMLElement | undefined;
      if (!element) return { id, count: 0, visible: false, inViewport: false, receivesClick: false };

      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const visible = rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number(style.opacity || 1) > 0;
      const inViewport = rect.left >= 0 &&
        rect.top >= 0 &&
        rect.right <= window.innerWidth + 1 &&
        rect.bottom <= window.innerHeight + 1;

      let receivesClick = true;
      if (clickTargetIds.includes(id)) {
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const topElement = document.elementFromPoint(x, y);
        receivesClick = topElement === element || Boolean(topElement && element.contains(topElement));
      }

      return { id, count: elements.length, visible, inViewport, receivesClick };
    });
  }, { ids, clickTargetIds: Array.from(CLICK_TARGET_IDS) });

  for (const result of results) {
    expect(result.count, `${result.id} should exist once`).toBe(1);
    expect(result.visible, `${result.id} should be visible`).toBe(true);
    expect(result.inViewport, `${result.id} should stay inside viewport`).toBe(true);
    expect(result.receivesClick, `${result.id} center point should not be covered by another HUD layer`).toBe(true);
  }
}

async function trialClickIfEnabled(locator: Locator) {
  if (await locator.isEnabled()) {
    await locator.click({ trial: true, timeout: 5_000 });
  }
}

test.describe('human usability regression', () => {
  test('HUD controls remain findable and clickable after camera abuse', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.goto('/');
    await expectHudReachable(page, BASE_HUD_IDS);

    await page.getByTestId('hud-command-contact-drill').click();
    await expectHudReachable(page, [...BASE_HUD_IDS, ...SELECTED_UNIT_IDS]);

    for (let i = 0; i < 2; i++) {
      await page.getByTestId('hud-camera-zoom-in').click();
    }

    await page.mouse.move(300, 560);
    await page.mouse.down();
    await page.mouse.move(790, 280, { steps: 4 });
    await page.mouse.move(260, 570, { steps: 4 });
    await page.mouse.up();

    await page.mouse.wheel(0, 320);
    await page.mouse.wheel(0, -320);
    await page.mouse.wheel(260, 0);
    await page.mouse.wheel(-260, 0);

    await page.getByTestId('hud-camera-reset-camera').click();
    await expectHudReachable(page, [...BASE_HUD_IDS, ...SELECTED_UNIT_IDS]);

    await page.getByTestId('hud-command-plan').click();
    await page.getByTestId('hud-action-move').click();
    await trialClickIfEnabled(page.getByTestId('hud-action-shoot'));
    await trialClickIfEnabled(page.getByTestId('hud-action-hold-angle'));
    await trialClickIfEnabled(page.getByTestId('hud-action-done'));

    await expectHudReachable(page, BASE_HUD_IDS);
    expect(consoleErrors).toEqual([]);
  });
});
