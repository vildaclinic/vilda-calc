import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, loadPatient, readyForPatient } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

function withoutCaptureTime(payload) {
  // Every native collector invocation stamps the capture time. This is not a
  // patient edit; all clinical values, visit identity and other metadata remain
  // part of the comparison.
  const result = { ...payload };
  delete result.timestampISO;
  return result;
}

for (const width of [320, 390, 820, 1440, 1920]) {
  test(`preview workspace ${width}px preserves native form, summary and visit history`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => {
      window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true;
      window.__homeCopiedSummaries = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText(text) { window.__homeCopiedSummaries.push(text); return Promise.resolve(); }
      } });
    });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
    });
    const fixture = await createFictionalVault(page);
    await loadPatient(page, fixture.ids.a, 'restore');
    await readyForPatient(page);
    await expect(page.locator('html')).toHaveClass(/vilda-home-workspace/);
    await expect(page.locator('.vhome-history-button')).toBeEnabled();
    await expect(page.locator('.vhome-visit-date')).toHaveText('17.06.2026');
    await expect(page.locator('#firstName')).toHaveValue('Antoni');
    await expect(page.locator('#lastName')).toHaveValue('Fikcyjny');
    await expect(page.locator('#height')).toHaveValue('158');
    await expect(page.locator('#weight')).toHaveValue('46');

    const before = withoutCaptureTime(await page.evaluate(() => {
      window.__workspaceNodes = ['firstName', 'lastName', 'name', 'dobInput', 'age', 'ageMonths', 'sex', 'height', 'weight', 'currentSummaryCard', 'metabolicSummaryBtn', 'clearAllDataBtn']
        .map(id => document.getElementById(id));
      return window.collectUserData();
    }));
    await page.evaluate(() => { window.VildaHomeWorkspace.start(); window.VildaHomeWorkspace.refresh(); });
    expect(await page.evaluate(() => window.__workspaceNodes.every(node => document.getElementById(node.id) === node))).toBe(true);
    expect(await page.evaluate(() => window.__workspaceNodes.every(node => document.querySelectorAll('#' + node.id).length === 1))).toBe(true);
    expect(withoutCaptureTime(await page.evaluate(() => window.collectUserData()))).toEqual(before);
    const geometry = await page.evaluate(() => {
      const bounds = id => document.getElementById(id).getBoundingClientRect();
      const clear = bounds('clearAllDataBtn'), copy = bounds('metabolicSummaryBtn');
      const first = bounds('firstName'), last = bounds('lastName');
      const dob = bounds('dobInput'), sex = bounds('sex');
      const weight = bounds('weight'), height = bounds('height');
      return {
        actionWidth: Math.abs(clear.width - copy.width), actionHeight: Math.abs(clear.height - copy.height),
        actionTop: Math.abs(clear.top - copy.top), nameWidth: Math.abs(first.width - last.width),
        nameTop: Math.abs(first.top - last.top), measureWidth: Math.abs(weight.width - height.width),
        demographicsWidth: Math.abs(dob.width - sex.width), demographicsTop: Math.abs(dob.top - sex.top),
        measureTop: Math.abs(weight.top - height.top),
        overflow: document.documentElement.scrollWidth > innerWidth,
        sameDocument: document.getElementById('height').ownerDocument === document,
        inForm: document.getElementById('height').form === document.getElementById('calcForm')
      };
    });
    for (const metric of ['actionWidth', 'actionHeight', 'actionTop', 'nameWidth', 'nameTop', 'demographicsWidth', 'demographicsTop', 'measureWidth', 'measureTop']) expect(geometry[metric], metric).toBeLessThanOrEqual(1);
    expect(geometry.overflow).toBe(false);
    expect(geometry.sameDocument).toBe(true);
    expect(geometry.inForm).toBe(true);
    if (width < 700) await expect(page.locator('.vhome-visit-title')).toBeHidden();
    else await expect(page.locator('.vhome-visit-title')).toBeVisible();

    const saved = await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a);
    await page.locator('.vhome-history-button').click();
    const history = page.getByRole('dialog', { name: 'Historia wizyt', exact: true });
    await expect(history).toBeVisible();
    await expect(history.locator('.vvisit-visit')).toHaveCount(1);
    await history.getByRole('button', { name: 'Zamknij', exact: true }).click();
    await expect(history).toHaveCount(0);
    expect(await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a)).toEqual(saved);
    expect(withoutCaptureTime(await page.evaluate(() => window.collectUserData()))).toEqual(before);

    await page.getByRole('tab', { name: 'Siatka centylowa', exact: true }).click();
    await expect(page.locator('#vildaSummaryChartPanel svg.vilda-centile-live-preview')).toBeVisible();
    await page.getByRole('tab', { name: 'Podsumowanie', exact: true }).click();
    await expect(page.locator('#currentSummaryContent')).toBeVisible();
    expect(withoutCaptureTime(await page.evaluate(() => window.collectUserData()))).toEqual(before);

    // Native bindings still calculate after moving the original field nodes.
    await page.locator('#height').fill('160');
    await expect.poll(() => page.evaluate(() => Number(window.collectUserData().user.height))).toBe(160);
    await expect(page.locator('#metabolicSummaryBtn')).toBeEnabled();
    await page.screenshot({ path: `/tmp/home-workspace-${width}.png`, fullPage: false });
    await page.locator('#metabolicSummaryBtn').click();
    await expect.poll(() => page.evaluate(() => window.__homeCopiedSummaries.length)).toBe(1);
    expect(await page.evaluate(() => window.__homeCopiedSummaries[0])).toContain('BMI:');
    await page.locator('#clearAllDataBtn').click();
    const clear = page.getByRole('dialog', { name: /^Zapisać (wpisane dane|zmiany) przed wyczyszczeniem\?$/ });
    await expect(clear).toBeVisible();
    await clear.getByRole('button', { name: /^Odrzuć (dane|zmiany) i wyczyść$/ }).click();
    await expect(page.locator('#height')).toHaveValue('');
    await expect(page.locator('#weight')).toHaveValue('');
    await expect(page.locator('.vhome-history-button')).toBeDisabled();
    await expect(page.locator('#metabolicSummaryBtn')).toBeDisabled();
    expect(await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a)).toEqual(saved);
  });
}
