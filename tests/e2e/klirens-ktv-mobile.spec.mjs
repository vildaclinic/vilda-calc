import { expect, test } from '../support/test-czas.mjs';
import { clcrPoint, showClcrResults } from '../support/badania-klirens.mjs';
import { memory, odrzucObliczenieKlirensu, openShellCalculator, saveVisible, shellFrame } from '../support/klirens-patient-record.mjs';
import { emulatePhone } from '../support/telefon-poziomo.mjs';
import { kliknij } from '../support/uklad-czekanie.mjs';
import { card, chooseVariant, collect, expectBlocked, expectResult, installFictionalPatient, openCalculator, restore } from '../support/klirens-ktv-browser.mjs';

test.use({ chwila: '2026-11-06T12:00:00Z', serviceWorkers: 'block', reducedMotion: 'reduce' });

async function phoneGeometry(page, calculator) {
  const host = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth }));
  const result = await calculator.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    controls: [...document.querySelectorAll('#ktvInputCard input,#ktvInputCard select')].filter(n => n.checkVisibility({ checkOpacity: true })).map(n => ({
      id: n.id, font: parseFloat(getComputedStyle(n).fontSize), height: n.getBoundingClientRect().height,
      x: n.getBoundingClientRect().x, right: n.getBoundingClientRect().right,
    })),
    viewport: innerWidth,
  }));
  expect(host.overflow).toBeLessThanOrEqual(1); expect(result.overflow).toBeLessThanOrEqual(1);
  for (const control of result.controls) {
    expect(control.font, control.id).toBeGreaterThanOrEqual(16); expect(control.height, control.id).toBeGreaterThanOrEqual(48);
    expect(control.x, control.id).toBeGreaterThanOrEqual(0); expect(control.right, control.id).toBeLessThanOrEqual(result.viewport + 1);
  }
}

for (const shell of [false, true]) {
  test(`Kt/V ${shell ? 'shell' : 'standalone'}: obrót, zapis i Wyczyść zachowują wybrany wariant oraz zapisane badanie`, async ({ page }, info) => {
    test.setTimeout(150000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let calculator = page, start;
    if (shell) ({ calculator, start } = await openShellCalculator(page, { width: 390 }));
    else await openCalculator(page, 390);
    await installFictionalPatient(calculator); await restore(calculator);
    const variant = shell ? 'urr' : 'ektv', raw = shell ? 70 : 1.2227380474970133;
    await chooseVariant(calculator, variant); await expectResult(calculator, { variant, raw });
    const [note] = await saveVisible(calculator, '2026-11-06');
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
      await emulatePhone(page, viewport); await phoneGeometry(page, calculator);
      await expectResult(calculator, { variant, raw });
      await expect(calculator.locator('#ktvVariant')).toHaveValue(variant);
      await expect(calculator.locator('#UreaPre')).toHaveValue('20'); await expect(calculator.locator('#UreaPost')).toHaveValue('6');
    }
    const screenshot = info.outputPath(`ktv-${shell ? 'shell' : 'standalone'}-portrait.png`);
    await card(calculator).scrollIntoViewIfNeeded(); await page.screenshot({ path: screenshot });
    await info.attach('KtV-mobile', { path: screenshot, contentType: 'image/png' });
    if (shell) {
      await calculator.locator('#clcrOpenCardBtn').click(); await showClcrResults(start, 'charts');
      await expect(page).toHaveURL(/\/app\.html#\/start/);
      await expect(clcrPoint(start, note.id)).toHaveAttribute('data-value', String(note.labResult.valueNum));
      await start.evaluate(() => window.VildaAuthUI.hide());
      await page.evaluate(() => window.VildaShell.navigate('klirens', true)); await shellFrame(page, 'Kalkulator klirensu');
      await expectResult(calculator, { variant, raw });
    }
    await kliknij(calculator.locator('#clearBtn'));
    // P-KLIRENS-WYCZYSC: zapis URR nie obejmuje wpisanych pól eKt/V (UF, masa), więc na koncie
    // z sejfem „Wyczyść dane Klirensu” pyta przed ich odrzuceniem; zapisane eKt/V — nie.
    if (variant === 'urr') await odrzucObliczenieKlirensu(calculator);
    else await expect(calculator.getByRole('dialog')).toHaveCount(0);
    await calculator.waitForFunction(() => window.clcrIsResetting !== true);
    await expectBlocked(calculator); await expect(calculator.locator('#ktvVariant')).toHaveValue(variant);
    await expect(calculator.locator('#ktvRequiredCount')).toHaveText(shell ? '0/2' : '0/8');
    await expect(calculator.locator('#UreaPre')).toHaveValue(''); await expect(calculator.locator('#UreaPost')).toHaveValue('');
    expect(await collect(calculator)).toEqual([]);
    const saved = await memory(calculator); expect(saved.notes).toEqual([note]); expect(saved.originalsLocked).toBe(true);
    expect(saved.observerErrors).toEqual([]); expect(errors).toEqual([]);
  });
}
