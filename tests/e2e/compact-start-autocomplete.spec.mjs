import { expect, test } from '../support/test-czas.mjs';
import { clinicalFingerprint, createFictionalVault, readyForPatient } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

for (const width of [390, 1024]) {
  for (const fieldId of ['lastName', 'firstName']) {
    test(`podpowiedzi pacjentów przy ${fieldId}, ${width}px: pełne nazwy i wybór klawiaturą`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(() => localStorage.setItem('showMobileDock', 'false'));
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol)
          ? route.continue() : route.abort();
      });
      const fixture = await createFictionalVault(page);
      // The autocomplete cache is populated at startup. Reload after creating
      // the synthetic records, using the same persistence path as a normal visit.
      await page.reload({ waitUntil: 'load' });
      await readyForPatient(page);
      const savedRecord = await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a);

      const input = page.locator(`#${fieldId}`);
      await input.fill(fieldId === 'lastName' ? 'Fikcyjny' : 'Ant');
      const suggestions = page.locator('.vilda-ac-dd');
      await expect(suggestions).toBeVisible();
      await expect(suggestions.locator('.vilda-ac-nm', { hasText: 'Fikcyjny Antoni' })).toHaveCount(1);
      if (fieldId === 'lastName') {
        await expect(suggestions.locator('.vilda-ac-nm', { hasText: 'Fikcyjny Beata' })).toHaveCount(1);
      }

      const geometry = await page.evaluate(id => {
        const active = document.getElementById(id).getBoundingClientRect();
        const pair = document.querySelector('.start-name-pair').getBoundingClientRect();
        const dropdown = document.querySelector('.vilda-ac-dd').getBoundingClientRect();
        return {
          left: dropdown.left, right: dropdown.right, width: dropdown.width,
          pairLeft: pair.left, pairWidth: pair.width, top: dropdown.top, inputBottom: active.bottom,
          clippedNames: [...document.querySelectorAll('.vilda-ac-nm')]
            .filter(node => node.scrollWidth > node.clientWidth).map(node => node.textContent),
        };
      }, fieldId);
      expect(Math.abs(geometry.left - geometry.pairLeft), 'lista zaczyna się przy całej parze pól').toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.width - geometry.pairWidth), 'lista używa szerokości całej pary').toBeLessThanOrEqual(1);
      expect(geometry.top).toBeGreaterThanOrEqual(geometry.inputBottom);
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(width);
      expect(geometry.clippedNames, 'pełne nazwisko i imię pozwalają odróżnić pacjentów').toEqual([]);

      const names = await suggestions.locator('.vilda-ac-nm').allTextContents();
      const targetIndex = names.indexOf('Fikcyjny Antoni');
      expect(targetIndex).toBeGreaterThanOrEqual(0);
      for (let index = 0; index <= targetIndex; index++) await input.press('ArrowDown');
      await expect(suggestions.locator('.is-hi .vilda-ac-nm')).toHaveText('Fikcyjny Antoni');
      await input.press('Enter');
      await expect(suggestions).toBeHidden();
      // Typing the query changes the new patient's identity. Confirm the real
      // unsaved-data guard instead of bypassing it through the loading API.
      const guard = page.getByRole('dialog', { name: 'Zapisać wpisane dane przed wczytaniem?' });
      await expect(guard).toBeVisible();
      await guard.getByRole('button', { name: 'Odrzuć dane i wczytaj', exact: true }).click();
      await expect(guard).toHaveCount(0);
      const loadChoice = page.locator('#vildaLoadChoiceModal');
      await expect(loadChoice).toBeVisible();
      await loadChoice.locator('#vildaLcmRestore').click();
      await expect(loadChoice).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(fixture.ids.a);
      await expect(page.locator('#lastName')).toHaveValue('Fikcyjny');
      await expect(page.locator('#firstName')).toHaveValue('Antoni');
      await expect(page.locator('#height')).toHaveValue(String(fixture.patients.a.user.height));
      await expect(page.locator('#weight')).toHaveValue(String(fixture.patients.a.user.weight));
      expect(await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a), 'wybór zachowuje zapisany rekord').toEqual(savedRecord);

      await readyForPatient(page);
      const beforeResize = await clinicalFingerprint(page, fixture.ids.a);
      await page.setViewportSize({ width: width === 390 ? 1024 : 390, height: 844 });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
      });
      expect(await clinicalFingerprint(page, fixture.ids.a), 'zmiana układu zachowuje dane i dokumentację pacjenta').toEqual(beforeResize);
    });
  }
}
