import { expect, test } from '@playwright/test';
import { prepareBrowser, enterGuest, openShellCalculator, memory } from '../support/klirens-patient-record.mjs';

async function open(page, width) {
  await prepareBrowser(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await enterGuest(page, { calculator: true });
}

for (const width of [1440, 390, 320]) {
  test(`Lista formuł: zamykanie, klawiatura i równe wiersze ${width}px`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await open(page, width);
    const input = page.locator('#formulaSearch'), list = page.locator('#formulaLive');
    await expect(list).toBeHidden();
    await input.fill('wap');
    await expect(list).toBeVisible();
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    const layout = await list.evaluate(node => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      rows: [...node.querySelectorAll('.clcr-search-result')].map(row => {
        const r = row.getBoundingClientRect(), style = getComputedStyle(row);
        return { y: r.y, height: r.height, shadow: style.boxShadow, transform: style.transform };
      }),
      width: node.getBoundingClientRect().width,
      inputWidth: document.querySelector('.clcr-search').getBoundingClientRect().width,
      inputFont: parseFloat(getComputedStyle(document.getElementById('formulaSearch')).fontSize),
    }));
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.inputFont).toBeGreaterThanOrEqual(16);
    expect(Math.abs(layout.width - layout.inputWidth)).toBeLessThan(1);
    for (let i = 0; i < layout.rows.length; i++) {
      expect(layout.rows[i].height).toBeGreaterThanOrEqual(48);
      expect(layout.rows[i].shadow).toBe('none');
      expect(layout.rows[i].transform).toBe('none');
      if (i) expect(Math.abs(layout.rows[i].y - layout.rows[i - 1].y - layout.rows[i - 1].height - 8)).toBeLessThan(1);
    }
    await page.locator('.clcr-workflow__title').click();
    await expect(list).toBeHidden(); await expect(input).toHaveValue('wap');
    await input.click(); await expect(list).toBeVisible();
    await input.press('Escape'); await expect(list).toBeHidden(); await expect(input).toHaveValue('wap');
    await input.click(); await page.locator('.clcr-search-result').first().focus();
    await page.locator('.clcr-search-result').first().press('Escape'); await expect(list).toBeHidden();
    await expect(input).toHaveValue('wap');
    await input.fill(''); await input.press('ArrowDown'); await expect(list).toBeHidden();
    await expect(input).not.toHaveAttribute('aria-activedescendant');
    await input.evaluate(node => { node.value = 'wap'; node.dispatchEvent(new Event('input', { bubbles: true })); node.focus(); });
    await expect(list).toBeHidden();
    await input.click(); await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', 'clcr-search-option-0');
    await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', 'clcr-search-option-1');
    await input.press('Enter');
    await expect(list).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.ClcrUiWorkflow.state.activeFormulaId)).toBe('Ca_mgkg');
    await expect(page.locator('#caDzmInputCard')).toHaveCount(1);
    expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('Lista formuł: rzeczywista powłoka zachowuje tę samą ramkę, frazę i zamknięty stan po powrocie', async ({ page }) => {
  const { calculator } = await openShellCalculator(page, { width: 390 });
  const input = calculator.locator('#formulaSearch'), list = calculator.locator('#formulaLive');
  await calculator.evaluate(() => { window.__searchFrameIdentity = 'fictional-search-frame-token'; });
  await input.fill('wap'); await expect(list).toBeVisible();
  await page.locator('header').first().click({ position: { x: 5, y: 5 } });
  await expect(list).toBeHidden(); await expect(input).toHaveValue('wap');
  await input.click(); await expect(list).toBeVisible();
  await page.evaluate(() => window.VildaShell.navigate('start'));
  await expect(page.locator('iframe.app-pane[title="Kalkulator klirensu"]')).toBeHidden();
  await page.evaluate(() => window.VildaShell.navigate('klirens'));
  await expect(page.locator('iframe.app-pane[title="Kalkulator klirensu"]')).toBeVisible();
  await expect(list).toBeHidden(); await expect(input).toHaveValue('wap');
  expect(await calculator.evaluate(() => window.__searchFrameIdentity)).toBe('fictional-search-frame-token');
  expect((await memory(calculator)).originalsLocked).toBe(true);
});

test('Lista formuł: dotykowe przewijanie nie wybiera pozycji', async ({ page, context }) => {
  await open(page, 390);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await page.locator('#formulaSearch').fill('wap');
  const before = await page.evaluate(() => window.ClcrUiWorkflow.state.activeFormulaId);
  const box = await page.locator('#formulaLive').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height - 30;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (const distance of [20, 50, 90, 130]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - distance }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#formulaLive')).toBeVisible();
  expect(await page.locator('#formulaLive').evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.state.activeFormulaId)).toBe(before);
  await cdp.detach();
});
