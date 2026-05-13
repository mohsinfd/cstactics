import { expect, type Page, test } from '@playwright/test';

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
  'hud-command-duel-lab',
  'hud-command-end-side',
] as const;

const SELECTED_UNIT_IDS = [
  'hud-selected-unit-panel',
  'hud-action-move',
  'hud-action-hold-angle',
  'hud-action-done',
] as const;

const COMPACT_CONTACT_CLEARANCE_IDS = [
  'hud-selected-unit-panel',
  'hud-view-controls',
  'hud-team-roster',
  'hud-command-bar',
  'hud-combat-log',
] as const;

const CLICK_TARGET_IDS = new Set([
  'hud-camera-zoom-in',
  'hud-camera-zoom-out',
  'hud-camera-reset-camera',
  'hud-command-plan',
  'hud-command-contact-drill',
  'hud-command-duel-lab',
  'hud-command-end-side',
  'hud-command-end-side-secondary',
  'hud-command-run-execute',
  'hud-contact-trade-shot',
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

async function expectHudTargetReachableIfEnabled(page: Page, id: string) {
  const result = await page.evaluate((id) => {
    const elements = Array.from(document.querySelectorAll(`[data-testid="${id}"]`));
    const element = elements[0] as HTMLElement | undefined;
    if (!element) return { id, count: 0, checked: false };

    const enabled = !element.matches(':disabled') &&
      element.getAttribute('aria-disabled') !== 'true';
    if (!enabled) return { id, count: elements.length, checked: false };

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
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const topElement = document.elementFromPoint(x, y);
    const receivesClick = topElement === element || Boolean(topElement && element.contains(topElement));

    return { id, count: elements.length, checked: true, visible, inViewport, receivesClick };
  }, id);

  if (!result.checked) return;

  expect(result.count, `${result.id} should exist once`).toBe(1);
  expect(result.visible, `${result.id} should be visible when enabled`).toBe(true);
  expect(result.inViewport, `${result.id} should stay inside viewport when enabled`).toBe(true);
  expect(result.receivesClick, `${result.id} center point should not be covered when enabled`).toBe(true);
}

async function expectHudDoesNotOverlap(page: Page, subjectId: string, targetIds: readonly string[]) {
  const result = await page.evaluate(({ subjectId, targetIds }) => {
    const getRect = (id: string) => {
      const elements = Array.from(document.querySelectorAll(`[data-testid="${id}"]`));
      const element = elements[0] as HTMLElement | undefined;
      if (!element) return { id, count: elements.length, missing: true };

      const rect = element.getBoundingClientRect();
      return {
        id,
        count: elements.length,
        missing: false,
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
      };
    };

    const subject = getRect(subjectId);
    if (subject.missing || !subject.rect) {
      return { subject, missingTargets: [], overlaps: [] };
    }

    const missingTargets: string[] = [];
    const overlaps: Array<{ id: string; width: number; height: number }> = [];
    for (const id of targetIds) {
      const target = getRect(id);
      if (target.missing || !target.rect) {
        missingTargets.push(id);
        continue;
      }

      const width = Math.min(subject.rect.right, target.rect.right) - Math.max(subject.rect.left, target.rect.left);
      const height = Math.min(subject.rect.bottom, target.rect.bottom) - Math.max(subject.rect.top, target.rect.top);
      if (width > 1 && height > 1) {
        overlaps.push({ id, width, height });
      }
    }

    return { subject, missingTargets, overlaps };
  }, { subjectId, targetIds });

  expect(result.subject.count, `${subjectId} should exist once`).toBe(1);
  expect(result.missingTargets, 'clearance targets should exist').toEqual([]);
  expect(result.overlaps, `${subjectId} should not overlap required compact HUD containers`).toEqual([]);
}

async function queueBananaDrillContact(page: Page) {
  const result = await page.evaluate(async () => {
    const store = window.__CS_TACTICS_STORE__;
    if (!store) return { ok: false, reason: 'debug store unavailable' };

    store.getState().startContactDrill();

    const targets = [
      { x: 43, y: 66 },
      { x: 43, y: 65 },
      { x: 43, y: 64 },
      { x: 43, y: 63 },
      { x: 43, y: 62 },
    ];

    for (const target of targets) {
      store.getState().queueMove(target);
      if (store.getState().plannedActions.length > 0) break;
    }

    if (store.getState().plannedActions.length === 0) {
      return { ok: false, reason: 'no planned movement queued' };
    }

    await store.getState().commitPlannedActions();
    const interrupt = store.getState().executeInterrupt;
    if (interrupt && (!interrupt.event.weaponName || !interrupt.event.weaponCategory)) {
      return { ok: false, reason: 'combat event missing weapon identity' };
    }
    return {
      ok: Boolean(interrupt),
      reason: interrupt ? '' : 'execute completed without contact interrupt',
    };
  });

  expect(result.ok, result.reason).toBe(true);
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
    await expectHudTargetReachableIfEnabled(page, 'hud-action-move');
    await expectHudTargetReachableIfEnabled(page, 'hud-action-shoot');
    await expectHudTargetReachableIfEnabled(page, 'hud-action-hold-angle');
    await expectHudTargetReachableIfEnabled(page, 'hud-action-done');

    await expectHudReachable(page, BASE_HUD_IDS);
    expect(consoleErrors).toEqual([]);
  });

  test('Banana drill contact freeze explains the decision and keeps HUD actions reachable', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.goto('/');
    await queueBananaDrillContact(page);

    await expect(page.getByTestId('hud-contact-break-panel')).toBeVisible();
    await expect(page.getByTestId('hud-contact-timeline')).toBeVisible();
    const timelineItemCount = await page.getByTestId('hud-contact-timeline-item').count();
    expect(timelineItemCount, 'contact break should show the short execute sequence').toBeGreaterThanOrEqual(4);
    const timelineText = await page.getByTestId('hud-contact-timeline').innerText();
    expect(timelineText, 'contact timeline should include the shot beat').toContain('SHOT');
    expect(timelineText, 'contact timeline should include the trade/no-trade call').toMatch(/trade|no clean trade/i);
    await expectHudReachable(page, [...BASE_HUD_IDS, 'hud-contact-break-panel']);

    const viewport = page.viewportSize();
    if (viewport && viewport.width <= 560) {
      await expectHudDoesNotOverlap(page, 'hud-contact-break-panel', COMPACT_CONTACT_CLEARANCE_IDS);
    }

    const tradeChoiceCount = await page.getByTestId('hud-contact-trade-shot').count();
    const noTradeChoiceCount = await page.getByTestId('hud-contact-no-trade').count();
    const contactChoiceCount = tradeChoiceCount + noTradeChoiceCount;
    expect(contactChoiceCount, 'contact break should show either trade or no-trade state').toBe(1);
    await expectHudTargetReachableIfEnabled(page, 'hud-contact-trade-shot');

    await expectHudReachable(page, BASE_HUD_IDS);
    expect(consoleErrors).toEqual([]);
  });

  test('Duel Lab loads a compact 1v1 combat state with immediate actions', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.goto('/');
    await page.getByTestId('hud-command-duel-lab').click();

    await expectHudReachable(page, [
      ...BASE_HUD_IDS,
      ...SELECTED_UNIT_IDS,
      'hud-action-shoot',
      'hud-action-smoke',
      'hud-action-flash',
      'hud-action-reload',
    ]);

    await expect(page.locator('[data-testid^="hud-visible-target-"]')).toHaveCount(1);

    const labState = await page.evaluate(() => {
      const store = window.__CS_TACTICS_STORE__;
      if (!store) return { ok: false, reason: 'debug store unavailable' };

      const state = store.getState();
      const liveT = state.units.filter((unit) => unit.alive && unit.team === 'T');
      const liveCT = state.units.filter((unit) => unit.alive && unit.team === 'CT');
      const deadUnits = state.units.filter((unit) => !unit.alive);
      const selected = state.units.find((unit) => unit.id === state.selectedUnitId);
      const targetCards = Array.from(document.querySelectorAll('[data-testid^="hud-visible-target-"]'))
        .map((element) => element.getAttribute('data-testid'));

      return {
        ok: true,
        reason: '',
        unitCount: state.units.length,
        unitIds: state.units.map((unit) => unit.id),
        deadUnitIds: deadUnits.map((unit) => unit.id),
        phase: state.round.phase,
        activeTeam: state.round.activeTeam,
        bombCarrierId: state.round.bombCarrierId,
        planningMode: state.planningMode,
        inputMode: state.inputMode,
        plannedActions: state.plannedActions.length,
        heldAngles: state.heldAngles.length,
        combatLog: state.combatLog.length,
        hasInterrupt: Boolean(state.executeInterrupt),
        hasAiStatus: Boolean(state.aiStatus),
        liveTCount: liveT.length,
        liveCTCount: liveCT.length,
        liveTIds: liveT.map((unit) => unit.id),
        liveCTIds: liveCT.map((unit) => unit.id),
        selectedId: selected?.id ?? null,
        selectedTeam: selected?.team ?? null,
        selectedPosition: selected?.position ?? null,
        selectedHasBomb: selected?.hasBomb ?? false,
        selectedApFull: selected ? selected.ap === selected.maxAp : false,
        selectedAmmoFull: selected ? selected.ammoInClip === selected.weapon.clipSize : false,
        selectedHasSmoke: selected ? selected.smokeGrenades > 0 : false,
        selectedHasFlash: selected ? selected.flashbangs > 0 : false,
        ctPosition: liveCT[0]?.position ?? null,
        targetCards,
      };
    });

    expect(labState.ok, labState.reason).toBe(true);
    expect(labState).toMatchObject({
      unitCount: 2,
      unitIds: [0, 6],
      deadUnitIds: [],
      phase: 'combat',
      activeTeam: 'T',
      bombCarrierId: 0,
      planningMode: false,
      inputMode: 'move',
      plannedActions: 0,
      heldAngles: 0,
      combatLog: 0,
      hasInterrupt: false,
      hasAiStatus: false,
      liveTCount: 1,
      liveCTCount: 1,
      liveTIds: [0],
      liveCTIds: [6],
      selectedId: 0,
      selectedTeam: 'T',
      selectedPosition: { x: 43, y: 61 },
      selectedHasBomb: true,
      selectedApFull: true,
      selectedAmmoFull: true,
      selectedHasSmoke: true,
      selectedHasFlash: true,
      ctPosition: { x: 43, y: 69 },
      targetCards: ['hud-visible-target-6'],
    });

    await expectHudTargetReachableIfEnabled(page, 'hud-action-move');
    await expectHudTargetReachableIfEnabled(page, 'hud-action-shoot');
    await expectHudTargetReachableIfEnabled(page, 'hud-visible-target-6');

    await page.getByTestId('hud-action-shoot').click();
    await expect.poll(async () => page.evaluate(() => window.__CS_TACTICS_STORE__?.getState().inputMode)).toBe('shoot');

    await page.getByTestId('hud-action-move').click();
    await expect.poll(async () => page.evaluate(() => window.__CS_TACTICS_STORE__?.getState().inputMode)).toBe('move');

    expect(consoleErrors).toEqual([]);
  });

  test('execute queue timing controls update planned beats', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.goto('/');

    const result = await page.evaluate(() => {
      const store = window.__CS_TACTICS_STORE__;
      if (!store) return { ok: false, reason: 'debug store unavailable' };

      store.getState().startContactDrill();

      const targets = [
        { x: 43, y: 66 },
        { x: 43, y: 65 },
        { x: 43, y: 64 },
        { x: 43, y: 63 },
        { x: 43, y: 62 },
      ];

      for (const target of targets) {
        store.getState().queueMove(target);
        if (store.getState().plannedActions.length > 0) break;
      }

      let action = store.getState().plannedActions[0];
      if (!action) return { ok: false, reason: 'no planned movement queued' };

      store.getState().setPlannedActionTiming(action.id, 1100);
      action = store.getState().plannedActions[0];
      if (action.executeAtMs !== 1100) return { ok: false, reason: `expected 1100ms, got ${action.executeAtMs}` };

      store.getState().setPlannedActionTiming(action.id, 9999);
      action = store.getState().plannedActions[0];
      if (action.executeAtMs !== 1200) return { ok: false, reason: `expected capped 1200ms, got ${action.executeAtMs}` };

      store.getState().setPlannedActionTiming(action.id, -10);
      action = store.getState().plannedActions[0];
      if (action.executeAtMs !== 400) return { ok: false, reason: `expected floor 400ms, got ${action.executeAtMs}` };

      return { ok: true, reason: '' };
    });

    expect(result.ok, result.reason).toBe(true);
    await expectHudReachable(page, [
      ...BASE_HUD_IDS.filter((id) => id !== 'hud-command-end-side'),
      'hud-command-run-execute',
      'hud-command-end-side-secondary',
    ]);
    expect(consoleErrors).toEqual([]);
  });
});
