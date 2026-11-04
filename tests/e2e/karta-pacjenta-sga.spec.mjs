import { expect, test } from '../support/test-czas.mjs';
import { loadPatient } from '../support/centile-live-fixture.mjs';
import { computeSga, expectNoSgaOverflow, expectSgaValues, goToSgaCard, openSgaFixture,
  openStatusCard, reloadSavedSga, saveSga, scrollPosition, SGA_DIALOG, SGA_INPUT, SGA_TILE } from '../support/karta-pacjenta-sga.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);

for (const route of ['index', 'docpro', 'app']) {
  test(`${route}: zapisane obliczenie SGA jest czytelne w Statusie i szczegółach bez zmiany danych`, async ({ page }) => {
    const fixture = await openSgaFixture(page, { shell: route === 'app' });
    const birth = await computeSga(fixture.frame);
    const saved = await saveSga(fixture.frame, fixture.ids.a);
    const { owner, card } = await goToSgaCard(page, fixture, route);
    await expect(card.locator(SGA_TILE)).toContainText('SGA');
    await expect(card.locator(SGA_TILE)).toContainText('Tak');
    await card.locator(SGA_TILE).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`${route}-patient-sga-card.png`) });
    await card.locator(SGA_TILE).click();
    await expect(owner.getByRole('dialog', { name: 'SGA — dane urodzeniowe' })).toBeVisible();
    await expectSgaValues(owner);
    await expect(owner.locator(`${SGA_DIALOG} time[data-sga-assessed]`)).toHaveAttribute('datetime', birth.assessment.computedAtISO);
    await expectNoSgaOverflow(page, owner);
    await page.screenshot({ path: test.info().outputPath(`${route}-patient-sga-dialog.png`) });
    await owner.locator(`${SGA_DIALOG} [data-sga-return]`).click();
    await expect(owner.locator(SGA_DIALOG)).not.toBeVisible();
    await expect(card.locator(SGA_TILE)).toBeFocused();
    expect(await owner.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a)).toEqual(saved);
  });
}

test('Enter, Escape, przyciski i Wstecz zamykają szczegóły do tej samej karty, pozycji i fokusu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 620 });
  const fixture = await openSgaFixture(page);
  await computeSga(fixture.frame);
  await saveSga(fixture.frame, fixture.ids.a);
  const { owner, card } = await goToSgaCard(page, fixture, 'index');
  const tile = card.locator(SGA_TILE), dialog = owner.locator(SGA_DIALOG);
  await tile.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await tile.focus();
  const position = await scrollPosition(owner);
  expect(position.some(value => value > 0), 'exercise a genuinely scrolled patient card').toBe(true);
  for (const close of ['escape', 'return', 'cross', 'back']) {
    await tile.press('Enter');
    await expect(dialog).toBeVisible();
    if (close === 'escape') await owner.locator(SGA_DIALOG).press('Escape');
    else if (close === 'back') {
      await owner.waitForFunction(() => Boolean(history.state?.vildaNavSentinel));
      await page.goBack();
    } else await dialog.locator(close === 'return' ? '[data-sga-return]' : '[data-sga-close]').click();
    await expect(dialog).not.toBeVisible();
    await expect(card.locator('.vilda-patient-hero-name')).toHaveText('Fikcyjny Antoni');
    await expect(tile).toBeFocused();
    await expect.poll(() => scrollPosition(owner)).toEqual(position);
  }
});

test('stare dane urodzeniowe wymagają oceny, brak danych nie tworzy kafelka i pacjent B nic nie dziedziczy', async ({ page }) => {
  const fixture = await openSgaFixture(page);
  await computeSga(fixture.frame);
  await saveSga(fixture.frame, fixture.ids.a);
  const legacyId = await fixture.frame.evaluate(async birth => (await window.VildaVault.savePatient({
    name: 'Fikcyjny StarszySGA', user: { lastName: 'Fikcyjny', firstName: 'StarszySGA', sex: 'M', age: 6, ageMonths: 2, height: 108, weight: 16 },
    birth: { ...birth, sourceChoice: 'niklasson', sourceKeys: ['niklasson'], hasComputed: true },
  }, { dedup: false })).patientId, SGA_INPUT);
  await openStatusCard(fixture.frame, legacyId);
  const legacyTile = fixture.frame.locator(SGA_TILE);
  await expect(legacyTile).toContainText('Do oceny');
  await legacyTile.click();
  const dialog = fixture.frame.locator(SGA_DIALOG);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-sga-sds] .vilda-sga-sds-value')).toHaveText(['—', '—', '—']);
  await expect(dialog).not.toContainText(/[−-]3,13|[−-]3,48/);
  await dialog.locator('[data-sga-return]').click();
  await openStatusCard(fixture.frame, fixture.ids.b);
  await expect(fixture.frame.locator(SGA_TILE)).toHaveCount(0);
  await loadPatient(fixture.frame, fixture.ids.b, 'restore');
  expect(await fixture.frame.evaluate(() => window.collectUserData().birth)).toBeNull();
  const captured = await fixture.frame.evaluate(() => window.vildaSgaBirthPersistApi.captureStateReadOnly());
  expect(captured.assessment).toBeFalsy();
  expect(captured.weeks).toBe('');
  expect(captured.weight).toBe('');
});

test('szczegóły zachowują porównanie trzech źródeł; sam Malewski nie daje fałszywego „Nie”', async ({ page }) => {
  const fixture = await openSgaFixture(page);
  await computeSga(fixture.frame, { sources: ['niklasson', 'intergrowth', 'malewski'] });
  await saveSga(fixture.frame, fixture.ids.a);
  await openStatusCard(fixture.frame, fixture.ids.a);
  await fixture.frame.locator(SGA_TILE).click();
  const dialog = fixture.frame.locator(SGA_DIALOG);
  for (const source of ['niklasson', 'intergrowth', 'malewski']) {
    await expect(dialog.locator(`[data-sga-source="${source}"]`)).toBeVisible();
  }
  await expectSgaValues(fixture.frame);
  await dialog.locator('[data-sga-return]').click();
  await reloadSavedSga(fixture.frame, fixture.ids.a);
  await computeSga(fixture.frame, { inputs: { ...SGA_INPUT, weeks: '40', days: '0', weight: '3400', length: '51', head: '35' }, sources: ['malewski'] });
  await saveSga(fixture.frame, fixture.ids.a);
  await openStatusCard(fixture.frame, fixture.ids.a);
  await expect(fixture.frame.locator(SGA_TILE)).toContainText('Do oceny');
  await fixture.frame.locator(SGA_TILE).click();
  await expect(dialog.locator('[data-sga-source]')).toHaveCount(1);
  await expect(dialog.locator('[data-sga-source="malewski"]')).toBeVisible();
  await expect(dialog.locator('[data-sga-metric="length"]')).toContainText(/niedostępn|brak/i);
});

test('wczytanie nie odmładza daty oceny; zmiana wejścia bez Oblicz nie prezentuje starego SDS', async ({ page }) => {
  const fixture = await openSgaFixture(page);
  const birth = await computeSga(fixture.frame);
  await saveSga(fixture.frame, fixture.ids.a);
  await reloadSavedSga(fixture.frame, fixture.ids.a);
  const restored = await fixture.frame.evaluate(() => window.vildaSgaBirthPersistApi.captureStateReadOnly());
  expect(restored.assessment.computedAtISO).toBe(birth.assessment.computedAtISO);
  await fixture.frame.evaluate(() => {
    const card = document.getElementById('sgaBirthCard');
    if (!card.style.display || card.style.display === 'none') document.getElementById('toggleSgaBirth').click();
  });
  await fixture.frame.locator('#sgaBirthWeight').fill('1710');
  await fixture.frame.locator('#sgaBirthWeight').blur();
  await saveSga(fixture.frame, fixture.ids.a);
  await openStatusCard(fixture.frame, fixture.ids.a);
  await expect(fixture.frame.locator(SGA_TILE)).toContainText('Do oceny');
  await fixture.frame.locator(SGA_TILE).click();
  await expect(fixture.frame.locator(`${SGA_DIALOG} [data-sga-sds] .vilda-sga-sds-value`)).toHaveText(['—', '—', '—']);
  await expect(fixture.frame.locator(SGA_DIALOG)).not.toContainText(/[−-]3,13/);
});

test('synchronizacja czeka na zamknięcie SGA, a potem odświeża dane z zachowaniem fokusu i przewinięcia', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 620 });
  const fixture = await openSgaFixture(page);
  await computeSga(fixture.frame);
  const initial = await saveSga(fixture.frame, fixture.ids.a);
  await computeSga(fixture.frame, { inputs: { ...SGA_INPUT, weeks: '40', days: '0', weight: '3400', length: '51', head: '35' } });
  const nextPayload = await fixture.frame.evaluate(() => window.collectUserData());
  // Both assessments come from the real calculator. A direct vault write below
  // represents a saved version arriving from another device, not a fake result.
  const card = await openStatusCard(fixture.frame, fixture.ids.a);
  const tile = card.locator(SGA_TILE), dialog = fixture.frame.locator(SGA_DIALOG);
  await tile.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await tile.focus();
  const position = await scrollPosition(fixture.frame);
  expect(position.some(value => value > 0)).toBe(true);
  let oldValue = 'Tak';
  for (const [index, close] of ['cross', 'return', 'escape'].entries()) {
    const payload = index === 1 ? initial.snapshots[0].payload : nextPayload;
    const nextValue = index === 1 ? 'Tak' : 'Nie';
    await expect(tile).toContainText(oldValue);
    await tile.press('Enter');
    await expect(dialog).toBeVisible();
    await expect.poll(() => scrollPosition(fixture.frame)).toEqual(position);
    // The top-layer backdrop must not let wheel gestures move the underlying
    // document/card, even though only the internal card receives the extra lock.
    await page.mouse.move(20, 20);
    await page.mouse.wheel(0, 300);
    await fixture.frame.evaluate(() => new Promise(resolve => {
      requestAnimationFrame(() => { requestAnimationFrame(resolve); });
    }));
    expect(await scrollPosition(fixture.frame)).toEqual(position);
    const contentBefore = await dialog.innerText();
    await fixture.frame.evaluate(async ({ patientId, payload }) => {
      await window.VildaVault.savePatient(payload, { patientId, dedup: false });
      document.dispatchEvent(new CustomEvent('vilda:sync-merged'));
      // Cover the real 250 ms sync debounce before checking that the open
      // dialog and its original tile were not replaced by a refresh.
      await new Promise(resolve => { setTimeout(resolve, 400); });
    }, { patientId: fixture.ids.a, payload });
    await expect(dialog).toBeVisible();
    expect(await dialog.innerText()).toBe(contentBefore);
    await expect(tile).toContainText(oldValue);
    if (close === 'escape') await dialog.press('Escape');
    else await dialog.locator(close === 'cross' ? '[data-sga-close]' : '[data-sga-return]').click();
    await expect(dialog).not.toBeVisible();
    await expect(tile).toContainText(nextValue);
    await expect(tile).toBeFocused();
    await expect.poll(() => scrollPosition(fixture.frame)).toEqual(position);
    await tile.press('Enter');
    await expect(dialog.locator('time[data-sga-assessed]')).toHaveAttribute('datetime', payload.birth.assessment.computedAtISO);
    const source = payload.birth.assessment.sources.find(item => item.sourceKey === 'niklasson');
    const expectedSds = Number(source.metrics.weight.sds).toFixed(2).replace('.', ',').replace('-', '−');
    await expect(dialog.locator('[data-sga-sds="weight"] .vilda-sga-sds-value')).toHaveText(expectedSds);
    await dialog.press('Escape');
    oldValue = nextValue;
  }
});
