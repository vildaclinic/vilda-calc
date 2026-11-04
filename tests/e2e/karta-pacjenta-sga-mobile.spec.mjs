import { expect, test } from '../support/test-czas.mjs';
import { computeSga, expectNoSgaOverflow, expectSgaValues, goToSgaCard, openSgaFixture,
  saveSga, scrollPosition, SGA_DIALOG, SGA_TILE } from '../support/karta-pacjenta-sga.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);

for (const width of [390, 320]) test(`${width}px: kafelek i szczegóły SGA mieszczą się na telefonie i wracają do Statusu`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const fixture = await openSgaFixture(page, { shell: true });
  await computeSga(fixture.frame);
  const saved = await saveSga(fixture.frame, fixture.ids.a);
  const { owner, card } = await goToSgaCard(page, fixture, 'app');
  const tile = card.locator(SGA_TILE), dialog = owner.locator(SGA_DIALOG);
  await tile.scrollIntoViewIfNeeded();
  const position = await scrollPosition(owner);
  await tile.click();
  await expect(dialog).toBeVisible();
  await expectSgaValues(owner);
  await expectNoSgaOverflow(page, owner);
  await page.screenshot({ path: test.info().outputPath(`patient-sga-dialog-${width}.png`) });
  await dialog.locator('[data-sga-return]').click();
  await expect(dialog).not.toBeVisible();
  await expect(tile).toBeFocused();
  await expect.poll(() => scrollPosition(owner)).toEqual(position);
  await expect(card.locator('.vilda-patient-hero-name')).toHaveText('Fikcyjny Antoni');
  expect(await owner.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a)).toEqual(saved);
  await page.screenshot({ path: test.info().outputPath(`patient-sga-${width}.png`) });
});
