import { test, expect } from '../support/test-czas.mjs';
import { prepareM1, pointViewport, expectSameViewport } from '../support/lab-chart-m1.mjs';
import { otworzBadania, sekcjaBadan } from '../support/lab-historia-dane.mjs';

test.use({ serviceWorkers: 'block' });

test('phone: selecting a point in horizontally scrolled history and closing explicit Details preserves both scroll directions without saving', async ({ page }) => {
  const { patientId, notes } = await prepareM1(page, 390);
  const ids = await page.evaluate(async patientId => {
    const ids = [];
    for (let day = 15; day <= 24; day++) {
      ids.push((await window.VildaVault.savePatientNote({ patientId, category: 'wynik-badania',
        title: 'Fikcyjny TSH do kontroli przewijania ' + day, body: '', clinicalDateISO: `2026-01-${day}`,
        labResult: { test: 'TSH', testKey: 'tsh', value: '2,0', valueNum: 2, unit: 'mIU/L', norm: '0,7–4,2 mIU/L' },
      })).id);
    }
    return ids;
  }, patientId);
  const before = await notes();
  await otworzBadania(page, patientId);
  const section = sekcjaBadan(page);
  await section.locator('[data-view="charts"]').click();
  const point = section.locator(`.vilda-lab-result-chart-point[data-note-id="${ids[5]}"]`);
  await point.scrollIntoViewIfNeeded();
  const card = point.locator('xpath=ancestor::article[1]');
  const scroll = card.locator('.vilda-lab-result-chart-scroll');
  expect(await scroll.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await scroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  const position = await pointViewport(point);
  await point.tap();
  await expect(page.locator('.vilda-lab-point-preview-bubble strong')).toHaveText('2');
  await expect(page.locator('dialog.vilda-result-details-dialog[open]')).toHaveCount(0);
  expectSameViewport(position, await pointViewport(point));
  await card.locator('.vilda-lab-hist-chart-details').tap();
  const details = page.locator('#labResultDetailsDialog');
  await expect(details.locator('.vilda-lab-hist-result-details')).toHaveAttribute('data-note-id', ids[5]);
  expectSameViewport(position, await pointViewport(point));
  await details.getByRole('button', { name: 'Zamknij szczegóły wyniku', exact: true }).tap();
  await expect(details).toBeHidden();
  expectSameViewport(position, await pointViewport(point));
  await expect(point).toHaveAttribute('aria-pressed', 'true');
  expect(await notes()).toBe(before);
});
