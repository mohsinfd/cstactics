import { expect, type Page, test } from '@playwright/test';
import { bananaBDuelBoardPackage } from '../src/renderer/board2d5/bananaBDuelBoard';
import { findBoardPath, getReachableNodeIds } from '../src/renderer/board2d5/graph';
import { validateBoardPackage } from '../src/renderer/board2d5/validateBoardPackage';

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
] as const;

const EXECUTE_TIMELINE_CLEARANCE_IDS = [
  'hud-top-bar',
  'hud-team-roster',
  'hud-selected-unit-panel',
  'hud-view-controls',
  'hud-command-bar',
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

test('Banana/B 2.5D board package stays valid and connected', () => {
  expect(validateBoardPackage(bananaBDuelBoardPackage)).toEqual([]);
  expect(bananaBDuelBoardPackage.nodes).toHaveLength(8);
  expect(bananaBDuelBoardPackage.scene.layers).toHaveLength(1);
  expect(bananaBDuelBoardPackage.scene.bakedUnitMasks.map((mask) => mask.id).sort()).toEqual([
    'mask-baked-ct-start',
    'mask-baked-t-entry',
  ]);
  expect(bananaBDuelBoardPackage.scene.foregroundOccluders.length).toBeGreaterThanOrEqual(1);
  expect(bananaBDuelBoardPackage.actors[0]?.sprite.kind).toBe('ct-rifle');
  expect(bananaBDuelBoardPackage.targets[0]?.sprite.kind).toBe('t-rifle');
  expect(bananaBDuelBoardPackage.targets[0]?.hotspot.size.width).toBeGreaterThan(0);
  expect(getReachableNodeIds(
    bananaBDuelBoardPackage,
    'ct-start',
    bananaBDuelBoardPackage.initial.moveRange
  )).toEqual(['short-1', 'logs', 'center']);
  expect(findBoardPath(bananaBDuelBoardPackage, 'ct-start', 'logs')).toEqual(['ct-start', 'short-1', 'logs']);
});

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

async function expectHudViewportBudget(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const viewportArea = window.innerWidth * window.innerHeight;
    const trackedIds = [
      'hud-top-bar',
      'hud-team-roster',
      'hud-command-bar',
      'hud-view-controls',
      'hud-selected-unit-panel',
      'hud-contact-break-panel',
      'hud-execute-timeline-panel',
      'hud-combat-log',
      'hud-bomb-objective-panel',
      'hud-movement-legend',
    ];
    const safeRect = {
      left: window.innerWidth * 0.2,
      top: window.innerHeight * 0.22,
      right: window.innerWidth * 0.8,
      bottom: window.innerHeight * 0.7,
    };
    const safeArea = (safeRect.right - safeRect.left) * (safeRect.bottom - safeRect.top);
    const panels = trackedIds.flatMap((id) => {
      const element = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
      if (!element) return [];
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        style.visibility === 'hidden' ||
        style.display === 'none' ||
        Number(style.opacity || 1) <= 0
      ) return [];

      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      const right = Math.min(window.innerWidth, rect.right);
      const bottom = Math.min(window.innerHeight, rect.bottom);
      const area = Math.max(0, right - left) * Math.max(0, bottom - top);
      const safeOverlapWidth = Math.min(right, safeRect.right) - Math.max(left, safeRect.left);
      const safeOverlapHeight = Math.min(bottom, safeRect.bottom) - Math.max(top, safeRect.top);
      const safeOverlapArea = id === 'hud-contact-break-panel'
        ? 0
        : Math.max(0, safeOverlapWidth) * Math.max(0, safeOverlapHeight);

      return [{
        id,
        areaRatio: area / viewportArea,
        safeOverlapRatio: safeArea > 0 ? safeOverlapArea / safeArea : 0,
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      }];
    });
    const combinedAreaRatio = panels.reduce((sum, panel) => sum + panel.areaRatio, 0);
    const safeOverlapRatio = panels.reduce((sum, panel) => sum + panel.safeOverlapRatio, 0);
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      combinedAreaRatio,
      safeOverlapRatio,
      panels,
    };
  });

  const selected = result.panels.find((panel) => panel.id === 'hud-selected-unit-panel');
  const command = result.panels.find((panel) => panel.id === 'hud-command-bar');
  const roster = result.panels.find((panel) => panel.id === 'hud-team-roster');
  const compact = result.width <= 560;

  expect(
    selected?.areaRatio ?? 0,
    `${label}: selected unit panel should not become the playfield`
  ).toBeLessThanOrEqual(compact ? 0.32 : 0.24);
  expect(
    command?.areaRatio ?? 0,
    `${label}: command bar should not consume the lower screen`
  ).toBeLessThanOrEqual(compact ? 0.16 : 0.11);
  expect(
    roster?.areaRatio ?? 0,
    `${label}: roster should stay compact`
  ).toBeLessThanOrEqual(compact ? 0.07 : 0.05);
  expect(
    result.combinedAreaRatio,
    `${label}: total measured HUD footprint should leave the board readable`
  ).toBeLessThanOrEqual(compact ? 0.5 : 0.42);
  expect(
    result.safeOverlapRatio,
    `${label}: center board safe area should remain mostly clear`
  ).toBeLessThanOrEqual(0.1);
}

async function expectRosterButtonsReachable(page: Page) {
  const results = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-testid^="hud-roster-unit-"]')).map((element) => {
      const button = element as HTMLButtonElement;
      const rect = button.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const topElement = document.elementFromPoint(centerX, centerY);
      return {
        id: button.dataset.testid ?? '',
        isButton: button.tagName === 'BUTTON',
        accessibleName: button.getAttribute('aria-label') ?? '',
        visible: rect.width > 0 && rect.height > 0,
        inViewport: rect.left >= 0 &&
          rect.top >= 0 &&
          rect.right <= window.innerWidth + 1 &&
          rect.bottom <= window.innerHeight + 1,
        receivesClick: button.disabled || topElement === button || Boolean(topElement && button.contains(topElement)),
      };
    });
  });

  expect(results.length, 'active roster should expose five unit buttons').toBe(5);
  for (const result of results) {
    expect(result.isButton, `${result.id} should be a semantic button`).toBe(true);
    expect(result.accessibleName, `${result.id} should have an accessible name`).toContain('Select');
    expect(result.visible, `${result.id} should be visible`).toBe(true);
    expect(result.inViewport, `${result.id} should stay inside viewport`).toBe(true);
    expect(result.receivesClick, `${result.id} should not be covered`).toBe(true);
  }
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
    await expectRosterButtonsReachable(page);

    await page.getByTestId('hud-command-contact-drill').click();
    await expectHudReachable(page, [...BASE_HUD_IDS, ...SELECTED_UNIT_IDS]);
    await expectRosterButtonsReachable(page);
    await page.getByTestId('hud-roster-unit-0').click({ trial: true });

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
    await expectRosterButtonsReachable(page);

    await page.getByTestId('hud-command-plan').click();
    await expectHudTargetReachableIfEnabled(page, 'hud-action-move');
    await expectHudTargetReachableIfEnabled(page, 'hud-action-shoot');
    await expectHudTargetReachableIfEnabled(page, 'hud-action-hold-angle');
    await expectHudTargetReachableIfEnabled(page, 'hud-action-done');

    await expectHudReachable(page, BASE_HUD_IDS);
    await expectRosterButtonsReachable(page);
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
    const decisionState = await page.evaluate(() => {
      const interrupt = window.__CS_TACTICS_STORE__?.getState().executeInterrupt;
      if (!interrupt) return null;
      return {
        stoppedName: interrupt.event.targetName,
        shooterName: interrupt.event.attackerName,
        decisionCall: interrupt.tradeShot
          ? 'Trade now'
          : interrupt.event.killed
            ? 'No clean trade'
            : 'Hold and recover',
      };
    });
    expect(decisionState, 'contact break should carry decision context').not.toBeNull();
    await expect(page.getByTestId('hud-contact-decision-call')).toHaveText(decisionState!.decisionCall);
    await expect(page.getByTestId('hud-contact-stopped')).toContainText(decisionState!.stoppedName);
    await expect(page.getByTestId('hud-contact-shooter')).toContainText(decisionState!.shooterName);
    await expect(page.getByTestId('hud-contact-responder')).toBeVisible();
    await expect(page.getByTestId('hud-execute-timeline-panel')).toHaveCount(0);
    await expect(page.getByTestId('hud-contact-timeline')).toBeVisible();
    const timelineItemCount = await page.getByTestId('hud-contact-timeline-item').count();
    expect(timelineItemCount, 'contact break should show the short execute sequence').toBeGreaterThanOrEqual(4);
    const timelineText = await page.getByTestId('hud-contact-timeline').innerText();
    expect(timelineText, 'contact timeline should include the shot beat').toContain('SHOT');
    expect(timelineText, 'contact timeline should include the trade/no-trade call').toMatch(/trade|no clean trade/i);
    expect(timelineText, 'contact timeline should include a move or swing beat').toMatch(/MOVE|SWING/i);
    await expectHudReachable(page, [...BASE_HUD_IDS, 'hud-contact-break-panel']);
    await expectRosterButtonsReachable(page);

    const timelineState = await page.evaluate(() => {
      const state = window.__CS_TACTICS_STORE__?.getState();
      const interruptEvents = state?.executeInterrupt?.timelineEvents ?? [];
      const lastEvents = state?.lastExecuteTimeline?.events ?? [];
      const kinds = lastEvents.map((event) => event.kind);
      const times = lastEvents.map((event) => event.timeMs);
      return {
        hasLastTimeline: Boolean(state?.lastExecuteTimeline),
        lastStatus: state?.lastExecuteTimeline?.status ?? null,
        interruptEventCount: interruptEvents.length,
        lastEventCount: lastEvents.length,
        kinds,
        hasMovementBeat: kinds.includes('movement_beat'),
        hasSwingOrMoveStart: kinds.includes('swing_start') || kinds.includes('move_start'),
        ordered: times.every((time, index) => index === 0 || time >= times[index - 1]),
      };
    });
    expect(timelineState.hasLastTimeline, 'execute should persist a last timeline').toBe(true);
    expect(timelineState.lastStatus, 'contact should interrupt the last timeline').toBe('interrupted');
    expect(timelineState.interruptEventCount, 'interrupt should carry reusable timeline events').toBeGreaterThanOrEqual(4);
    expect(timelineState.lastEventCount, 'last timeline should retain the contact sequence').toBeGreaterThanOrEqual(4);
    expect(timelineState.ordered, 'execute timeline events should be ordered by beat').toBe(true);
    expect(timelineState.hasMovementBeat, 'execute timeline should include movement beat events').toBe(true);
    expect(timelineState.hasSwingOrMoveStart, 'execute timeline should include movement/swing start events').toBe(true);
    expect(timelineState.kinds, 'timeline should include swing/move, shot, and trade decision events').toEqual(expect.arrayContaining([
      'reaction_shot',
      'shot_result',
      'trade_decision',
    ]));
    await expectHudReachable(page, [
      ...BASE_HUD_IDS,
      'hud-contact-break-panel',
      'hud-contact-decision-call',
      'hud-contact-stopped',
      'hud-contact-shooter',
      'hud-contact-responder',
    ]);

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

    const hoverResult = await page.evaluate(() => {
      const store = window.__CS_TACTICS_STORE__;
      if (!store) return { ok: false, reason: 'debug store unavailable' };
      const state = store.getState();
      const selected = state.units.find((unit) => unit.id === state.selectedUnitId);
      const hoverTile = state.movementTiles.find((tile) => (
        selected &&
        (tile.x !== selected.position.x || tile.y !== selected.position.y)
      ));
      if (!hoverTile) return { ok: false, reason: 'hover tile unavailable' };
      store.getState().hoverTile(hoverTile);
      return { ok: true, reason: '', hoverTile };
    });

    expect(hoverResult.ok, hoverResult.reason).toBe(true);
    await expect(page.getByTestId('hud-tile-info')).toBeVisible();
    await expectHudDoesNotOverlap(page, 'hud-tile-info', [
      'hud-selected-unit-panel',
      'hud-command-bar',
    ]);
    await expectHudViewportBudget(page, 'Duel Lab hovered tile');

    await page.getByTestId('hud-action-shoot').click();
    await expect.poll(async () => page.evaluate(() => window.__CS_TACTICS_STORE__?.getState().inputMode)).toBe('shoot');

    await page.getByTestId('hud-action-move').click();
    await expect.poll(async () => page.evaluate(() => window.__CS_TACTICS_STORE__?.getState().inputMode)).toBe('move');

    const directMoveResult = await page.evaluate(async () => {
      const store = window.__CS_TACTICS_STORE__;
      if (!store) return { ok: false, reason: 'debug store unavailable' };
      const state = store.getState();
      const selected = state.units.find((unit) => unit.id === state.selectedUnitId);
      const moveTarget = state.movementTiles.find((tile) => (
        selected &&
        (tile.x !== selected.position.x || tile.y !== selected.position.y)
      ));
      if (!moveTarget) return { ok: false, reason: 'move target unavailable' };
      await store.getState().moveUnit(moveTarget);
      const nextState = store.getState();
      return {
        ok: nextState.lastExecuteTimeline?.source === 'direct_move' &&
          nextState.lastExecuteTimeline.status === 'completed',
        reason: `source=${nextState.lastExecuteTimeline?.source ?? 'none'} status=${nextState.lastExecuteTimeline?.status ?? 'none'}`,
      };
    });

    expect(directMoveResult.ok, directMoveResult.reason).toBe(true);
    await expect(page.getByTestId('hud-execute-timeline-panel')).toHaveCount(0);

    expect(consoleErrors).toEqual([]);
  });

  test('HUD footprint stays usable after compact zoom stress', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.goto('/');
    await queueBananaDrillContact(page);
    await expectHudViewportBudget(page, 'Banana contact');

    const viewport = page.viewportSize();
    if (viewport && viewport.width <= 560) {
      await page.addStyleTag({ content: 'html { zoom: 1.5 !important; }' });
      await expectHudViewportBudget(page, 'Banana contact at simulated zoom');
    }

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

    const completedTimelineResult = await page.evaluate(async () => {
      const store = window.__CS_TACTICS_STORE__;
      if (!store) return { ok: false, reason: 'debug store unavailable' };

      store.getState().initGame();
      store.getState().setPlanningMode(true);
      store.getState().selectUnit(3);

      const support = store.getState().units.find((unit) => unit.id === 3);
      if (!support) return { ok: false, reason: 'support unit unavailable' };
      store.getState().throwSmoke(support.position);

      let smokeAction = store.getState().plannedActions.find((action) => action.kind === 'smoke');
      if (!smokeAction) return { ok: false, reason: 'smoke plan unavailable' };
      store.getState().setPlannedActionTiming(smokeAction.id, 500);

      store.getState().selectUnit(1);
      const mover = store.getState().units.find((unit) => unit.id === 1);
      if (!mover) return { ok: false, reason: 'mover unit unavailable' };

      const occupied = new Set(
        store.getState().units
          .filter((unit) => unit.alive && unit.id !== mover.id)
          .map((unit) => `${unit.position.x},${unit.position.y}`)
      );
      const moveTarget = store.getState().walkableTiles.find((tile) => (
        (tile.x !== mover.position.x || tile.y !== mover.position.y) &&
        !occupied.has(`${tile.x},${tile.y}`)
      ));
      if (!moveTarget) return { ok: false, reason: 'move target unavailable' };

      store.getState().queueMove(moveTarget);
      const moveAction = store.getState().plannedActions.find((action) => action.kind === 'move');
      if (!moveAction) return { ok: false, reason: 'move plan unavailable' };
      store.getState().setPlannedActionTiming(moveAction.id, 400);

      smokeAction = store.getState().plannedActions.find((action) => action.kind === 'smoke');
      if (!smokeAction || smokeAction.executeAtMs !== 500) {
        return { ok: false, reason: 'smoke timing was not preserved at 500ms' };
      }

      await store.getState().commitPlannedActions();

      const timeline = store.getState().lastExecuteTimeline;
      const events = timeline?.events ?? [];
      const swingIndex = events.findIndex((event) => event.kind === 'swing_start' && event.timeMs === 400);
      const utilityIndex = events.findIndex((event) => event.kind === 'utility_resolved' && event.timeMs === 500);
      const ordered = events.every((event, index) => index === 0 || event.timeMs >= events[index - 1].timeMs);

      return {
        ok: timeline?.status === 'completed' &&
          swingIndex >= 0 &&
          utilityIndex >= 0 &&
          swingIndex < utilityIndex &&
          ordered,
        reason: `status=${timeline?.status ?? 'none'} swingIndex=${swingIndex} utilityIndex=${utilityIndex} events=${events.map((event) => `${event.kind}:${event.timeMs}`).join(',')}`,
      };
    });

    expect(completedTimelineResult.ok, completedTimelineResult.reason).toBe(true);
    await expect(page.getByTestId('hud-contact-break-panel')).toHaveCount(0);
    await expect(page.getByTestId('hud-execute-timeline-panel')).toBeVisible();

    const debriefItems = page.getByTestId('hud-execute-timeline-item');
    const debriefItemCount = await debriefItems.count();
    expect(debriefItemCount, 'completed execute should render a compact debrief rail').toBeGreaterThanOrEqual(2);
    const debriefText = await page.getByTestId('hud-execute-timeline-panel').innerText();
    expect(debriefText, 'debrief should identify the execute result').toMatch(/execute debrief/i);
    expect(debriefText, 'debrief should show ordered CS execute phases').toMatch(/SWING|MOVE|BLOOM|POP/);

    const debriefState = await page.evaluate(() => {
      const events = window.__CS_TACTICS_STORE__?.getState().lastExecuteTimeline?.events ?? [];
      const visibleTimes = Array.from(document.querySelectorAll('[data-testid="hud-execute-timeline-item"]'))
        .map((element) => element.textContent?.match(/(\d+\.\d)s/)?.[1])
        .filter((value): value is string => Boolean(value))
        .map((value) => Number(value) * 1000);
      return {
        visibleOrdered: visibleTimes.every((time, index) => index === 0 || time >= visibleTimes[index - 1]),
        eventCount: events.length,
        eventOrdered: events.every((event, index) => index === 0 || event.timeMs >= events[index - 1].timeMs),
        hasResolvedUtility: events.some((event) => event.kind === 'utility_resolved'),
        hasSwingStart: events.some((event) => event.kind === 'swing_start'),
        hasInterrupt: Boolean(window.__CS_TACTICS_STORE__?.getState().executeInterrupt),
      };
    });
    expect(debriefState.hasInterrupt, 'completed execute debrief should not duplicate Contact Break').toBe(false);
    expect(debriefState.eventCount, 'completed execute should persist timeline events').toBeGreaterThanOrEqual(2);
    expect(debriefState.eventOrdered, 'completed execute events should stay ordered').toBe(true);
    expect(debriefState.visibleOrdered, 'visible debrief items should stay ordered').toBe(true);
    expect(debriefState.hasResolvedUtility, 'debrief path should include the resolved utility beat').toBe(true);
    expect(debriefState.hasSwingStart, 'debrief path should include the swing beat').toBe(true);
    await expectHudReachable(page, [...BASE_HUD_IDS, 'hud-execute-timeline-panel']);
    await expectHudDoesNotOverlap(page, 'hud-execute-timeline-panel', EXECUTE_TIMELINE_CLEARANCE_IDS);

    expect(consoleErrors).toEqual([]);
  });
});

test('cinematic 1v1 proof gives clear target, invalid, kill, and reset feedback', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-human', 'Cinematic proof is a desktop presentation slice for now.');

  await page.goto('/cinematic-1v1');
  await expect(page.getByTestId('cinematic-feedback')).toContainText('Select a contact action.');
  await expect(page.getByTestId('hud-root')).toHaveCount(0);

  await page.getByTestId('cinematic-shoot').click();
  await expect(page.getByTestId('cinematic-feedback')).toContainText('Target lock: 70%');

  await page.mouse.click(640, 560);
  await expect(page.getByTestId('cinematic-feedback')).toContainText('No clean shot there.');

  await expect(page.getByTestId('cinematic-feedback')).toContainText('Target lock: 70%');
  await page.getByTestId('cinematic-target').click();
  await expect(page.getByTestId('cinematic-feedback')).toContainText('Entry down. Lane held.');
  await expect(page.getByTestId('cinematic-target')).toBeDisabled();

  await page.getByTestId('cinematic-reset').click();
  await expect(page.getByTestId('cinematic-feedback')).toContainText('Select a contact action.');
  await expect(page.getByTestId('cinematic-target')).toBeEnabled();
});

test('2.5D board duel proof supports move, invalid targeting, kill, and reset', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-human', '2.5D proof is a desktop presentation slice for now.');

  await page.goto('/duel-2-5d');
  await expect(page.getByTestId('board-duel-package')).toHaveAttribute('data-board-id', 'banana-b-duel-v0');
  await expect(page.getByTestId('board-duel-feedback')).toContainText('CT anchor ready');
  await expect(page.getByTestId('hud-root')).toHaveCount(0);
  await expect(page.getByTestId('board-author-panel')).toHaveCount(0);
  await expect(page.getByTestId('board-actor-token')).toBeVisible();
  await expect(page.getByTestId('board-target-token')).toBeVisible();
  await expect(page.getByTestId('board-scene-mask')).toHaveCount(2);
  await expect(page.getByTestId('board-foreground-occluder')).toHaveCount(
    bananaBDuelBoardPackage.scene.foregroundOccluders.length
  );
  await expect(page.locator('.iso-tile')).toHaveCount(8);
  await expect.poll(async () => page.locator('.iso-tile').evaluateAll((nodes) => (
    nodes.map((node) => (node as HTMLElement).dataset.nodeId).filter(Boolean).sort()
  ))).toEqual(['center', 'coffins', 'ct-start', 'logs', 'short-1', 'site-box', 'site-left', 'site-mid']);

  await page.getByTestId('board-duel-move').click();
  await expect(page.getByTestId('board-duel-feedback')).toContainText('Pick a blue floor tile.');
  await expect(page.getByTestId('board-duel-latest-event')).toHaveText('move_preview');
  const startTokenBox = await page.locator('.unit-token').boundingBox();
  await page.getByTestId('board-duel-peek-tile').hover();
  await expect.poll(async () => {
    const points = await page.locator('.tile-path polyline').getAttribute('points');
    return points?.trim().split(/\s+/).length ?? 0;
  }).toBe(3);
  await page.getByTestId('board-duel-peek-tile').click();
  await expect(page.getByTestId('board-duel-feedback')).toContainText('CT anchor ready');
  const movedTokenBox = await page.locator('.unit-token').boundingBox();
  expect(startTokenBox, 'unit token should be measurable before movement').not.toBeNull();
  expect(movedTokenBox, 'unit token should be measurable after movement').not.toBeNull();
  expect(
    Math.hypot(
      (movedTokenBox?.x ?? 0) - (startTokenBox?.x ?? 0),
      (movedTokenBox?.y ?? 0) - (startTokenBox?.y ?? 0)
    ),
    'unit token should visibly move across the isometric tile graph'
  ).toBeGreaterThan(40);

  await page.getByTestId('board-duel-shoot').click();
  await expect(page.getByTestId('board-duel-feedback')).toContainText('Target lock: 70%');
  await page.mouse.click(640, 560);
  await expect(page.getByTestId('board-duel-feedback')).toContainText('Invalid command.');
  await expect(page.getByTestId('board-duel-latest-event')).toHaveText('invalid');

  await expect(page.getByTestId('board-duel-feedback')).toContainText('Target lock: 70%');
  await page.getByTestId('board-duel-target').click();
  await expect(page.getByTestId('board-duel-feedback')).toContainText('Entry down. B lane held.');
  await expect(page.getByTestId('board-duel-latest-event')).toHaveText('kill');
  await expect(page.getByTestId('board-duel-target')).toBeDisabled();

  await page.getByTestId('board-duel-reset').click();
  await expect(page.getByTestId('board-duel-feedback')).toContainText('CT anchor ready');
  await expect(page.getByTestId('board-duel-target')).toBeEnabled();
});

test('2.5D board authoring mode can place an editable cover block', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-human', '2.5D authoring proof is a desktop presentation slice for now.');

  await page.goto('/duel-2-5d?debug=1');
  await expect(page.getByTestId('board-author-panel')).toBeVisible();
  await expect(page.getByTestId('board-author-node-handle')).toHaveCount(8);
  await expect(page.getByTestId('board-author-actor-handle')).toHaveCount(1);
  await expect(page.getByTestId('board-author-target-handle')).toHaveCount(1);
  await expect(page.getByTestId('board-author-mask-handle')).toHaveCount(2);
  await expect(page.getByTestId('board-author-occluder-handle')).toHaveCount(
    bananaBDuelBoardPackage.scene.foregroundOccluders.length
  );

  await page.getByTestId('board-author-place-cover').click();
  await page.locator('.concept-frame').click({ position: { x: 500, y: 400 } });
  await expect(page.getByTestId('board-author-block')).toHaveCount(1);
  await expect(page.getByTestId('board-author-export')).toContainText('author-cover-1');
  await expect(page.getByTestId('board-author-export')).toContainText('"kind": "cover"');

  const exportBefore = JSON.parse(await page.getByTestId('board-author-export').textContent() ?? '{}');
  const logsBefore = exportBefore.nodes.find((node: { id: string }) => node.id === 'logs').anchor.x;
  const logsHandle = page.locator('[data-testid="board-author-node-handle"][data-author-id="logs"]');
  const logsBox = await logsHandle.boundingBox();
  expect(logsBox, 'logs authoring handle should be measurable').not.toBeNull();
  await page.mouse.move((logsBox?.x ?? 0) + (logsBox?.width ?? 0) / 2, (logsBox?.y ?? 0) + (logsBox?.height ?? 0) / 2);
  await page.mouse.down();
  await page.mouse.move((logsBox?.x ?? 0) + 44, (logsBox?.y ?? 0) + 24, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('board-author-selected')).toContainText('node:logs');
  const exportAfter = JSON.parse(await page.getByTestId('board-author-export').textContent() ?? '{}');
  const logsAfter = exportAfter.nodes.find((node: { id: string }) => node.id === 'logs').anchor.x;
  expect(logsAfter).toBeGreaterThan(logsBefore);
});
