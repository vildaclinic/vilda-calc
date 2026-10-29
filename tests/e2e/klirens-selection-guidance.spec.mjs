import { expect, test } from '@playwright/test';
import { openCalculator, restore } from '../support/klirens-ca-dzm-browser.mjs';

async function guidance(page) {
  return page.evaluate(() => { const state = window.ClcrUiWorkflow.state.selectionGuidance; return { count: state.navigationCount, target: state.lastTarget, formula: state.lastFormula }; });
}
async function chooseFromSearch(page, query, id) {
  const input = page.locator('#formulaSearch');
  await input.fill(query);
  await page.locator(`.clcr-search-result[data-formula-id="${id}"]`).click();
  await expect.poll(async () => (await guidance(page)).formula).toBe(id);
}
async function visibleTarget(page, id) {
  await expect.poll(() => page.locator('#' + id).evaluate(node => {
    const r = node.getBoundingClientRect(); return r.top >= 40 && r.bottom <= innerHeight - 40;
  })).toBe(true);
}

for (const width of [1440, 390, 320]) {
  test(`Wybór formuły prowadzi do brakujących pól bez kasowania danych ${width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openCalculator(page, width);
    // Window scrolling follows the root element, not the body's computed style.
    // Respect reduced motion before measuring/reopening the search popup.
    await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
    await expect(page.locator('body')).toHaveCSS('scroll-behavior', 'auto');
    await restore(page, { CA_concentration: '', CA_volume: '', weight: '' });
    await page.evaluate(() => window.scrollTo(0, 0));
    const initial = await guidance(page);
    await chooseFromSearch(page, 'wap', 'Ca_mgkg');
    await expect.poll(async () => (await guidance(page)).count).toBe(initial.count + 1);
    expect((await guidance(page)).target).toBe('CA_concentration');
    await visibleTarget(page, 'CA_concentration');
    await expect(page.locator('#CA_concentration')).toHaveClass(/clcr-missing-input/);
    await expect(page.locator('#CA_volume')).toHaveClass(/clcr-missing-input/);
    await expect(page.locator('#weight')).not.toHaveClass(/clcr-missing-input/);
    const style = await page.locator('#CA_concentration').evaluate(node => ({ border: getComputedStyle(node).borderColor, background: getComputedStyle(node).backgroundColor }));
    expect(style.border).toBe('rgb(189, 134, 28)'); expect(style.background).toBe('rgb(255, 249, 237)');
    const count = (await guidance(page)).count;
    await page.locator('#CA_concentration').fill('1.5');
    await expect(page.locator('#CA_concentration')).not.toHaveClass(/clcr-missing-input/);
    expect((await guidance(page)).count).toBe(count);
    await page.getByRole('button', { name: 'Gotowe wydalanie', exact: true }).click();
    await expect(page.locator('#CA_reportedValue')).toHaveClass(/clcr-missing-input/);
    await expect(page.locator('#CA_concentration')).not.toHaveClass(/clcr-missing-input/);
    await page.locator('#CA_reportedUnit').selectOption('mg/24h'); await page.locator('#CA_reportedValue').fill('120');
    expect((await guidance(page)).count).toBe(count);
    await page.evaluate(() => window.scrollTo(0, 0));
    await chooseFromSearch(page, 'wap', 'Ca_mgkg');
    await expect.poll(async () => (await guidance(page)).target).toBe('result');
    await expect(page.locator('#clcrForm .clcr-missing-input:visible')).toHaveCount(0);
    await expect(page.locator('#CA_reportedValue')).toHaveValue('120');
    const beforeRestore = (await guidance(page)).count;
    await restore(page, { CA_concentration: '', CA_volume: '' });
    expect((await guidance(page)).count).toBe(beforeRestore);
    await page.evaluate(() => { window.ClcrUiWorkflow.selectFormula('Ca_mgkg'); window.ClcrUiWorkflow.selectFormula('ACR'); });
    await expect.poll(async () => (await guidance(page)).formula).toBe('ACR');
    await expect.poll(async () => (await guidance(page)).target).toBe('U_Alb');
    await visibleTarget(page, 'U_Alb');
    expect((await guidance(page)).count).toBe(beforeRestore + 1);
    expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  });
}

test('Natywny wybór formuły używa tej samej nawigacji, a odtworzenie jej nie uruchamia', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await openCalculator(page, 390);
  await restore(page, { CA_concentration: '', CA_volume: '' });
  await page.evaluate(() => { const picker = document.getElementById('formulaPicker'); picker.value = 'Ca_mgkg'; picker.dispatchEvent(new Event('change', { bubbles: true })); });
  await expect.poll(async () => (await guidance(page)).target).toBe('CA_concentration');
  await visibleTarget(page, 'CA_concentration');
  const before = await guidance(page);
  await restore(page, { CA_concentration: '1.5', CA_volume: '1200' });
  expect((await guidance(page)).count).toBe(before.count);
});

test('Publiczny wybór kompatybilności prowadzi na mobile do brakującej kreatyniny i zachowuje dane', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await openCalculator(page, 390);
  await restore(page, { age: '45', ageMonths: '0', sex: 'F', weight: '60', Scr: '', ScrUnit: 'mg/dl' });
  await page.evaluate(() => { window.scrollTo(0, 0); window.selectClcrFormula('cg'); });
  await expect.poll(async () => (await guidance(page)).target).toBe('Scr');
  await visibleTarget(page, 'Scr');
  await expect(page.locator('#weight')).toHaveValue('60');
  await expect(page.locator('#age')).toHaveValue('45');
  await expect(page.locator('#sex')).toHaveValue('F');
  const before = await guidance(page);
  await page.evaluate(() => { window.__vildaPersistRestoring = true; try { window.selectClcrFormula('Ca_mgkg'); } finally { window.__vildaPersistRestoring = false; } });
  expect((await guidance(page)).count).toBe(before.count);
});
