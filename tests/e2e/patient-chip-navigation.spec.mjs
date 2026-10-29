import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

// Wyłącznie fikcyjny sejf w efemerycznym profilu Playwrighta. Natywny zegar:
// sprawdzamy odtworzenie sesji i prawdziwe zdarzenia formularza/nawigacji.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

async function settled(owner) {
  // Po F5 nie używamy readyForPatient(): jego change wyników/PRO mógłby
  // zmienić dane i zamaskować stan, który ma powstać po samym odtworzeniu.
  await owner.waitForFunction(() => window.VildaVault?.isUnlocked()
    && window.VildaAuthUI?.isBootReady?.()
    && typeof window.collectUserData === 'function'
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await czekajNaOdtworzenieSesji(owner);
  await owner.waitForFunction(() => !window.__vildaPersistRestoring
    && !window.VildaDobAge?.restorePending?.()
    && !window.VildaDataImportExport?.isMainSessionRestorePending?.());
  await owner.waitForFunction(() => !/\/docpro\.html$/u.test(location.pathname)
    || (window.VildaDocproStatePersistence?.isReady?.() === true
      && window.VildaDocproStatePersistence.isRestoring() === false));
  await owner.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function status(owner) {
  return owner.evaluate(() => {
    const indicator = window.VildaSaveStatusIndicator;
    const reference = indicator?.getReferenceFingerprint();
    const current = indicator?._computeCanonicalFingerprint();
    return {
      state: indicator?.getState(),
      referenceReady: typeof reference === 'string' && reference.length > 0,
      sameData: current === reference,
    };
  });
}

async function expectStatus(page, owner, state, label) {
  try {
    await expect.poll(() => status(owner), { message: label, timeout: 15_000 }).toEqual({
      state, referenceReady: true, sameData: state === 'saved',
    });
    await expect(page.locator('#vildaPatientChip'), `${label}: chip nagłówka`)
      .toHaveClass(new RegExp(`vilda-save-state--${state}(?:\\s|$)`));
    await expect(page.locator('#vildaPatientChip'))
      .toHaveAttribute('title', state === 'saved' ? /Dane pacjenta zapisane/ : /Niezapisane zmiany/);
  } catch (error) {
    const details = await owner.evaluate(() => ({
      path: location.pathname,
      state: window.__vildaSaveStatusState,
      reference: window.VildaSaveStatusIndicator?.getReferenceFingerprint(),
      current: window.VildaSaveStatusIndicator?._computeCanonicalFingerprint(),
      mainSession: window.VildaPersistence?.readMainSession(),
      choice: sessionStorage.getItem('vildaLoadChoiceV1'),
      savedMeasurement: sessionStorage.getItem('vildaDobAgeZapisV1'),
      loadedUser: window.lastLoadedData?.user,
      sharedComparisonUser: window.VildaPersistence?.readShared()?._vildaPersist?.globals?.loadedComparisonData?.user,
      measurementMatches: window.VildaDobAge?.showsSavedMeasurement?.(),
    }));
    await test.info().attach(`chip-${label}`, {
      body: JSON.stringify(details, null, 2), contentType: 'application/json',
    });
    throw error;
  }
}

async function confirmProfessional(owner) {
  const confirmation = owner.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
}

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    'nagłówek i aplikacja mieszczą się w szerokości ekranu').toBeLessThanOrEqual(1);
}

for (const shell of [false, true]) {
  for (const choice of ['restore', 'new']) {
    test(`${shell ? 'powłoka' : 'samodzielnie'}, ${choice}: wczytanie, F5 i przejścia nie oznaczają pacjenta jako zmienionego`, async ({ page }) => {
      await page.setViewportSize(choice === 'restore'
        ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
      const fixture = await createFictionalVault(page, { shell });
      let owner = fixture.frame;
      await loadPatient(owner, fixture.ids.a, choice);
      await settled(owner);
      await expectStatus(page, owner, 'saved', 'po wczytaniu');

      await page.reload({ waitUntil: 'load' });
      owner = shell ? await shellFrame(page, 'Start') : page;
      await settled(owner);
      await expectStatus(page, owner, 'saved', 'po F5');

      if (shell) {
        await page.evaluate(() => window.VildaShell.navigate('docpro'));
        owner = await shellFrame(page, 'DocPro');
        await expect(page.locator('iframe.app-pane[title="DocPro"]')).toBeVisible();
      } else {
        await page.goto('/docpro.html', { waitUntil: 'load' });
      }
      await settled(owner);
      await confirmProfessional(owner);
      await expectStatus(page, owner, 'saved', 'na DocPro');

      if (shell) {
        await page.evaluate(() => window.VildaShell.navigate('start'));
        owner = await shellFrame(page, 'Start');
        await expect(page.locator('iframe.app-pane[title="Start"]')).toBeVisible();
      } else {
        await page.goto('/index.html', { waitUntil: 'load' });
      }
      await settled(owner);
      await expectStatus(page, owner, 'saved', 'po powrocie na Start');
      await noOverflow(page);

      // Kontrola: poprawka nie może ukrywać rzeczywistej edycji ani uznawać
      // niezapisanej sesji po F5 za nowy zapis pacjenta.
      const originalWeight = await owner.locator('#weight').inputValue();
      const editedWeight = String(Number(originalWeight || 46) + 1);
      await owner.locator('#weight').fill(editedWeight);
      await owner.locator('#weight').blur();
      await expectStatus(page, owner, 'dirty', 'po rzeczywistej edycji masy');

      await page.reload({ waitUntil: 'load' });
      owner = shell ? await shellFrame(page, 'Start') : page;
      await settled(owner);
      await expect(owner.locator('#weight')).toHaveValue(editedWeight);
      await expectStatus(page, owner, 'dirty', 'niezapisana edycja po F5');

      if (choice === 'new') {
        await owner.locator('#weight').fill(originalWeight);
        await owner.locator('#weight').blur();
        await expectStatus(page, owner, 'saved', 'po cofnięciu rzeczywistej edycji');
      }
      // Edycja odtworzonej, dawnej wizyty rozpoczyna nowy pomiar i archiwizuje
      // poprzedni w historii. Cofnięcie samej masy nie cofa tej zmiany danych;
      // stan dirty po F5 powyżej jest wówczas prawidłowy.
    });
  }
}
