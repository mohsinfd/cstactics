import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

function analyzePng(buffer) {
  const image = PNG.sync.read(buffer);
  const total = image.width * image.height;
  const buckets = new Set();
  let nonBlank = 0;
  let brightAction = 0;
  let spentSlate = 0;
  let ctBlue = 0;
  let tRed = 0;
  let lumaSum = 0;
  let midValue = 0;
  let nearBlack = 0;

  for (let y = 0; y < image.height; y += 2) {
    for (let x = 0; x < image.width; x += 2) {
      const index = (image.width * y + x) << 2;
      const r = image.data[index];
      const g = image.data[index + 1];
      const b = image.data[index + 2];
      const a = image.data[index + 3];

      if (a < 40) continue;

      buckets.add(`${r >> 4},${g >> 4},${b >> 4}`);

      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumaSum += luma;
      if (luma > 25) midValue += 1;
      if (luma < 12) nearBlack += 1;

      if (r + g + b > 24 && r + g + b < 742) nonBlank += 1;
      if ((r > 210 && g > 155 && b < 150) || (r > 215 && g > 215 && b > 185)) brightAction += 1;
      if (r > 95 && r < 220 && g > 105 && g < 225 && b > 115 && b < 235 && b > r * 1.04) spentSlate += 1;
      if (b > 82 && b > r * 1.15 && b >= g * 0.85 && r < 150) ctBlue += 1;
      if (r > 135 && g < 115 && b < 110 && r > g * 1.25 && r > b * 1.25) tRed += 1;
    }
  }

  return {
    width: image.width,
    height: image.height,
    sampled: Math.ceil(image.width / 2) * Math.ceil(image.height / 2),
    total,
    nonBlank,
    bucketCount: buckets.size,
    brightAction,
    spentSlate,
    ctBlue,
    tRed,
    averageLuma: lumaSum / Math.max(1, Math.ceil(image.width / 2) * Math.ceil(image.height / 2)),
    midValue,
    nearBlack,
  };
}

async function waitForReadableCanvas(page) {
  await page.goto('/');
  await expect(page.getByTestId('hud-root')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__CS_TACTICS_STORE__));
  await page.waitForTimeout(250);
}

async function canvasStats(page) {
  const screenshot = await page.locator('canvas').screenshot();
  return analyzePng(screenshot);
}

function expectNonBlankCanvas(stats, label) {
  expect(
    stats.nonBlank,
    `${label} canvas should contain rendered board pixels: ${JSON.stringify(stats)}`
  ).toBeGreaterThan(stats.sampled * 0.5);
  expect(
    stats.bucketCount,
    `${label} canvas should have enough color variation to not be blank: ${JSON.stringify(stats)}`
  ).toBeGreaterThan(55);
  expect(
    stats.averageLuma,
    `${label} canvas should keep the tactical board out of near-black values: ${JSON.stringify(stats)}`
  ).toBeGreaterThan(24);
  expect(
    stats.midValue,
    `${label} canvas should keep enough mid-value board pixels readable: ${JSON.stringify(stats)}`
  ).toBeGreaterThan(stats.sampled * 0.45);
  expect(
    stats.nearBlack,
    `${label} canvas should not be dominated by near-black board pixels: ${JSON.stringify(stats)}`
  ).toBeLessThan(stats.sampled * 0.35);
}

test.describe('unit visual readability smoke', () => {
  test('Banana Drill and Duel Lab screenshots keep team and action pixels readable', async ({ page }) => {
    await waitForReadableCanvas(page);

    await page.getByTestId('hud-command-contact-drill').click();
    await expect.poll(async () => page.evaluate(() => window.__CS_TACTICS_STORE__?.getState().units.length)).toBeGreaterThan(2);
    await page.waitForTimeout(250);

    const banana = await canvasStats(page);
    expectNonBlankCanvas(banana, 'Banana Drill');
    expect(banana.brightAction, 'Banana Drill should show selected/action readability pixels').toBeGreaterThan(45);
    expect(banana.ctBlue, 'Banana Drill should include CT blue family pixels').toBeGreaterThan(18);
    expect(banana.tRed, 'Banana Drill should include T red cloth/mark pixels').toBeGreaterThan(8);

    await page.getByTestId('hud-command-duel-lab').click();
    await page.getByTestId('hud-action-shoot').click();
    await expect.poll(async () => page.evaluate(() => window.__CS_TACTICS_STORE__?.getState().inputMode)).toBe('shoot');
    await page.waitForTimeout(250);

    const duel = await canvasStats(page);
    expectNonBlankCanvas(duel, 'Duel Lab shoot mode');
    expect(duel.brightAction, 'Duel Lab shoot mode should show target/shot action pixels').toBeGreaterThan(45);
    expect(duel.ctBlue, 'Duel Lab should include CT blue family pixels').toBeGreaterThan(8);
    expect(duel.tRed, 'Duel Lab should include T red cloth/mark pixels').toBeGreaterThan(4);

    await page.evaluate(() => {
      const store = window.__CS_TACTICS_STORE__;
      const state = store?.getState();
      if (!store || !state || state.selectedUnitId === null) return;

      store.setState({
        units: state.units.map((unit) => (
          unit.id === state.selectedUnitId
            ? { ...unit, ap: 0 }
            : unit
        )),
        movementTiles: [],
        walkableTiles: [],
      });
    });
    await page.waitForTimeout(250);

    const selectedSpent = await canvasStats(page);
    expectNonBlankCanvas(selectedSpent, 'selected spent Duel Lab unit');
    expect(
      selectedSpent.spentSlate,
      'selected spent unit should keep visible slate/DONE state pixels'
    ).toBeGreaterThan(30);
    expect(
      selectedSpent.brightAction,
      'selected spent unit should still keep selected ownership/readability pixels'
    ).toBeGreaterThan(45);
  });
});
