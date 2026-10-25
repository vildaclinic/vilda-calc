import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

// Wyłącznie fikcyjny sejf w efemerycznym profilu. Natywny zegar: sprawdzamy
// prawdziwe granice odtwarzania, nie upływ arbitralnej liczby milisekund.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);

const PUBERTY = {
  version: 1, sex: 'M', observations: {
    G: { stage: 3, observedAtISO: '2026-06-17', ageMonths: 156, source: 'fictional-visit' },
    Th: null, P: { stage: 2, observedAtISO: null, ageMonths: null, source: null },
  },
  extension: { fictionalMarker: 'startup-restore-preserve-raw', values: [1, null, '2'] },
};
const GH = { id: 'gh-fictional-startup', ageYears: 12, ageMonths: 6, height: 155.2, weight: 43.1, type: 'gh' };

function installReloadSeed() {
  window.__e2eStartupPubertyTransitions = [];
  document.addEventListener('vilda:puberty-assessment-changed', event => {
    if (event.detail?.reason !== 'clear') return;
    window.__e2eStartupPubertyTransitions.push({
      at: performance.now(), stack: new Error('puberty carrier clear').stack,
      unlocked: window.VildaVault?.isUnlocked(),
      restoring: window.__vildaPersistRestoring,
      patientId: sessionStorage.getItem('vildaCurrentPatientId'),
    });
  });
  // Zapis przed nawigacją może uruchomić pagehide. Wstrzyknięcie na początku
  // następnego dokumentu gwarantuje faktycznie różne kopie shared/main.
  const shell = window === window.top && /\/app\.html$/u.test(location.pathname);
  if (!shell && !/\/(?:index|docpro)\.html$/u.test(location.pathname)) return;
  const raw = sessionStorage.getItem('__e2eStartupRestoreSeed');
  if (!raw) return;
  const seed = JSON.parse(raw);
  if (!shell && seed.targetPath && seed.targetPath !== location.pathname) return;
  if (seed.holdAuth) {
    // Kontrolowana kolejność, bez zegara testowego ani stałego opóźnienia.
    // Produkcyjne tryRestoreSession ruszy dopiero po zwolnieniu bramki.
    let api;
    Object.defineProperty(window, 'VildaVault', {
      configurable: true,
      get() { return api; },
      set(value) {
        api = { ...value, tryRestoreSession(...args) {
          window.__e2eStartupAuthGateStarted = true;
          return new Promise(resolve => {
            window.__e2eStartupAuthGateRelease = () => resolve(value.tryRestoreSession.apply(value, args));
          });
        } };
      },
    });
  }
  sessionStorage.removeItem('__e2eStartupRestoreSeed');
  sessionStorage.setItem('sharedUserData', JSON.stringify(seed.shared));
  sessionStorage.setItem('vildaMainSessionV1', JSON.stringify(seed.main));
  // Powłokę przygotowujemy przed utworzeniem ramek: sessionStorage jest wspólne
  // dla tej karty. Świadek nie zależy od cyklu życia dokumentu ramki Playwrighta.
  sessionStorage.setItem('__e2eStartupSeedApplied', seed.targetPath || location.pathname);
  sessionStorage.setItem('__e2eStartupSeedInjector', location.pathname);
  window.__e2eStartupSeedApplied = true;
}

test('odtworzenie wybranego pacjenta czeka na sejf i nie zapisuje częściowej sesji', async ({ page }) => {
  const { owner, id } = await open(page, 'start', false);
  const expected = await inputState(owner);
  expect(expected).toMatchObject({ patientId: id, puberty: PUBERTY });
  await expect.poll(() => owner.evaluate(() => window.vildaSession.saveNow({ force: true }))).toBe(true);
  await owner.evaluate(() => {
    window.vildaPersistFlushNow({ force: true });
    sessionStorage.setItem('__e2eStartupRestoreSeed', JSON.stringify({
      main: window.VildaPersistence.readMainSession(),
      shared: window.VildaPersistence.readShared(), holdAuth: true, targetPath: location.pathname,
    }));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2eStartupAuthGateStarted
    && window.VildaInit?.isInitialized('app:main-session-restore-init'));
  await page.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
  const waiting = await page.evaluate(() => ({
    unlocked: window.VildaVault.isUnlocked(),
    pending: window.VildaDataImportExport.isMainSessionRestorePending(),
    forcedSave: window.vildaSession.saveNow({ force: true }),
    savedAssessment: window.VildaPersistence.readMainSession()?.user?.pubertyAssessment,
    clears: window.__e2eStartupPubertyTransitions,
  }));
  expect(waiting.unlocked).toBe(false);
  expect(waiting.pending, 'odtwarzanie oczekuje na prawdziwe zakończenie startu sejfu').toBe(true);
  expect(waiting.forcedSave, 'zapis wymuszony także czeka na pełne odtworzenie').toBe(false);
  expect(waiting.savedAssessment).toEqual(PUBERTY);
  expect(waiting.clears, 'żaden odczyt UI nie niszczy oceny przed odblokowaniem sejfu').toEqual([]);
  await page.evaluate(() => window.__e2eStartupAuthGateRelease());
  await settled(page);
  await expect.poll(() => inputState(page)).toEqual(expected);
  await checkRestoredDisclosure(page);
  await checkFinalCalculation(page);
});

async function settled(owner) {
  // Po przeładowaniu wyłącznie obserwujemy: readyForPatient jest helperem
  // przygotowującym PRO i jego zdarzenie change mogłoby naprawić błędny wynik.
  await owner.waitForFunction(() => window.VildaVault?.isUnlocked()
    && window.VildaAuthUI?.isBootReady?.()
    && typeof window.collectUserData === 'function'
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await czekajNaOdtworzenieSesji(owner);
  await owner.waitForFunction(() => !window.__vildaPersistRestoring
    && !window.VildaDobAge?.restorePending?.());
  // DocPro odtwarza też stan własnych kontrolek i details. Ta osobna
  // transakcja musi skończyć się przed sprawdzaniem reakcji na kliknięcie.
  // Bramka tylko obserwuje gotowość; nie przelicza ani nie otwiera karty.
  await owner.waitForFunction(() => !/\/docpro\.html$/u.test(location.pathname)
    || (window.VildaDocproStatePersistence?.isReady?.() === true
      && window.VildaDocproStatePersistence.isRestoring() === false));
  await owner.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
}

async function open(page, route, shell) {
  await page.addInitScript(installReloadSeed);
  if (shell) {
    // Powłoka zastępuje dokumenty ramek. Uprawnienie fikcyjnego konta musi być
    // gotowe w rzeczywistym dokumencie przed odtworzeniem, nie poprawione przez
    // readyForPatient już po nim. Używamy tego samego publicznego hooka fixture.
    await page.route(/\/vilda_pro_access\.js(?:\?|$)/u, async request => {
      const response = await request.fetch();
      await request.fulfill({ response, body: `${await response.text()}\n;(${function () {
        const grant = () => {
          window.VildaProAccess.__setTokenModeForTest(false);
          window.VildaProAccess.setPlan('pro', '2099-12-31T23:59:59.000Z');
        };
        document.addEventListener('vilda:session-changed', grant);
        grant();
      }.toString()})();` });
    });
  }
  const fixture = await createFictionalVault(page, { shell });
  let owner = fixture.frame;
  if (route === 'docpro') {
    if (shell) {
      await page.evaluate(() => window.VildaShell.navigate('docpro'));
      owner = await shellFrame(page, 'DocPro');
    } else {
      await page.goto('/docpro.html', { waitUntil: 'load' });
      owner = page;
    }
    await readyForPatient(owner);
    await settled(owner);
    const confirm = owner.locator('#professionalConfirmBtn');
    if (await confirm.isVisible()) await confirm.click();
  }
  const record = fixture.patients.a;
  record.user.tannerStage = '3';
  record.user.pubertyAssessment = PUBERTY;
  record.ghTherapyPoints = [GH];
  const id = await owner.evaluate(async payload => (await window.VildaVault.savePatient(payload, { dedup: false })).patientId, record);
  await loadPatient(owner, id, 'new');
  await owner.locator('#height').fill('159');
  await owner.locator('#weight').fill('47');
  await owner.locator('#weight').blur();
  await expect.poll(() => owner.evaluate(() => window.VildaCentileLivePanel?.getState()), { timeout: 30_000 })
    .toMatchObject({ status: 'ready', patientId: id });
  await settled(owner);
  return { owner, id };
}

async function inputState(owner) {
  return owner.evaluate(() => {
    const payload = window.collectUserData();
    const value = id => document.getElementById(id)?.value ?? null;
    const number = value => value === '' || value == null ? null : Number(value);
    return {
      fields: Object.fromEntries(['name', 'age', 'ageMonths', 'sex', 'height', 'weight',
        'advMotherHeight', 'advFatherHeight', 'advBoneAge', 'tannerStage'].map(id => [id, value(id)])),
      dob: payload.user.dobISO,
      puberty: payload.user.pubertyAssessment,
      source: payload.zscore.dataSource,
      creator: payload.chartCreator,
      rows: [...document.querySelectorAll('#advMeasurements .measure-row')].map(row => {
        const field = selector => row.querySelector(selector)?.value ?? '';
        return {
          ageMonths: (number(field('.adv-age-years')) || 0) * 12 + (number(field('.adv-age-months')) || 0),
          height: number(field('.adv-height')), weight: number(field('.adv-weight')),
          boneAge: number(field('.adv-bone-age')),
          gh: row.getAttribute('data-gh-sync') === 'true', ghId: row.getAttribute('data-gh-id') || '',
          // Jak produkcyjny kontroler: wyłącznie "true" oznacza rozwinięcie;
          // brak atrybutu i "false" to ten sam domyślny stan zamknięty.
          analysisOpen: row.getAttribute('data-analysis-open') === 'true',
          arrow: Boolean(row.querySelector('.adv-arrow-enable')?.checked), comment: field('.adv-arrow-comment'),
        };
      }).filter(row => row.height !== null || row.weight !== null),
      patientId: sessionStorage.getItem('vildaCurrentPatientId'),
      mode: sessionStorage.getItem('vildaLoadChoiceV1'),
    };
  });
}

async function resultState(owner) {
  return owner.evaluate(() => ({
    text: Object.fromEntries(['currentSummaryContent', 'advResults', 'basicGrowthResults', 'bmiResult', 'coleInfo']
      .map(id => [id, document.getElementById(id)?.textContent.replace(/\s+/gu, ' ').trim() ?? null])),
    advanced: JSON.parse(JSON.stringify(window.advancedGrowthData || null)),
  }));
}

async function checkFinalCalculation(owner) {
  const before = await resultState(owner);
  expect(before.text.advResults, 'odtworzenie samo wypełniło wyniki').toBeTruthy();
  // Zwykłe produkcyjne przeliczenie na kompletnych już polach jest kontrolą:
  // odtworzenie nie może zostawić wyniku z pośredniego wieku, źródła lub historii.
  await owner.evaluate(() => {
    window.calculateGrowthAdvanced();
    window.calculateBasicGrowth?.();
    window.update();
  });
  await owner.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
  expect(await resultState(owner), 'wynik po odtworzeniu odpowiada kompletnym bieżącym danym').toEqual(before);
}

async function checkRestoredDisclosure(owner) {
  const initial = await owner.evaluate(() => {
    const details = document.querySelector('#advResults .vtap-main');
    if (!details) return null;
    const before = details.open;
    // Otwarcie całej karty przeliczyłoby wynik i zamaskowało brak bindingu.
    // Klikamy istniejący summary. Listener końcowego wyniku ma zapisać wybór.
    details.querySelector('summary').click();
    return before;
  });
  expect(initial, 'odtworzony wynik zawiera rozwiniętą analizę trajektorii').toBe(true);
  await expect.poll(() => owner.evaluate(() => localStorage.getItem('vildaTrajectoryPanelCollapsed')),
    { message: 'listener końcowego wyniku zapisał zwinięcie' }).toBe('1');
  await owner.evaluate(() => document.querySelector('#advResults .vtap-main > summary').click());
  await expect.poll(() => owner.evaluate(() => localStorage.getItem('vildaTrajectoryPanelCollapsed')),
    { message: 'ten sam listener zapisał ponowne rozwinięcie' }).toBe('0');
}

for (const { route, shell } of [
  { route: 'start', shell: false }, { route: 'docpro', shell: false },
  { route: 'start', shell: true }, { route: 'docpro', shell: true },
]) {
  test(`${shell ? 'SPA' : 'samodzielnie'} ${route}: odtworzenie grupuje wyniki i zachowuje końcowe dane`, async ({ page }) => {
    let { owner, id } = await open(page, route, shell);
    await expect(owner.locator(`#advMeasurements [data-gh-id="${GH.id}"]`)).toHaveCount(1);
    await expect.poll(() => owner.evaluate(() => window.vildaSession.saveNow({ force: true }))).toBe(true);
    await owner.evaluate(() => window.vildaPersistFlushNow({ force: true }));
    const shared = await owner.evaluate(() => window.VildaPersistence.readShared());
    await owner.evaluate(() => {
      for (const [id, value] of Object.entries({ height: '159.4', weight: '47.2', advMotherHeight: '166.5', advFatherHeight: '181.5' })) {
        const field = document.getElementById(id);
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const source = document.getElementById('sourcePalczewska');
      source.checked = true;
      source.dispatchEvent(new Event('change', { bubbles: true }));
      window.update();
      // Przygotowanie migawki: źródło głównego formularza i karty wzrastania
      // muszą już opisywać ten sam, skończony przypadek przed przeładowaniem.
      window.calculateGrowthAdvanced();
      window.calculateBasicGrowth?.();
    });
    await settled(owner);
    await expect.poll(() => owner.evaluate(() => window.advancedGrowthData?.calculationFingerprint || ''))
      .toContain('~PALCZEWSKA~');
    await checkFinalCalculation(owner);
    const expected = await inputState(owner);
    expect(expected).toMatchObject({ patientId: id, mode: 'new', puberty: PUBERTY, source: 'PALCZEWSKA' });
    expect(expected.rows.filter(row => row.gh)).toEqual([expect.objectContaining({ ghId: GH.id, height: GH.height })]);
    await expect.poll(() => owner.evaluate(() => window.vildaSession.saveNow({ force: true }))).toBe(true);
    const main = await owner.evaluate(() => window.VildaPersistence.readMainSession());
    expect(Number(main.user.height)).toBe(159.4);
    expect(main.user.pubertyAssessment, 'pełna sesja zawiera przenoszoną ocenę pokwitania').toEqual(PUBERTY);
    expect(shared._vildaPersist.byId.height, 'shared celowo zawiera wcześniejszy wzrost').toBe('159');
    await owner.evaluate(seed => sessionStorage.setItem('__e2eStartupRestoreSeed',
      JSON.stringify({ ...seed, targetPath: location.pathname })), { shared, main });

    await page.reload({ waitUntil: 'load' });
    owner = shell ? await shellFrame(page, route === 'docpro' ? 'DocPro' : 'Start') : page;
    await settled(owner);
    expect(await owner.evaluate(() => sessionStorage.getItem('__e2eStartupSeedApplied')),
      'rzeczywiście odtworzono różne kopie w docelowym panelu').toBe(route === 'docpro' ? '/docpro.html' : '/index.html');
    await test.info().attach('restored-context.json', {
      body: JSON.stringify(await owner.evaluate(id => ({
        puberty: window.VildaPubertyAssessmentState?.capture(),
        source: window.VildaPubertySource?.kontekstPacjenta(id),
        sessionPuberty: window.VildaPersistence.readMainSession()?.user?.pubertyAssessment,
        loadedPuberty: window.lastLoadedData?.user?.pubertyAssessment,
        clears: window.__e2eStartupPubertyTransitions,
      }), id), null, 2), contentType: 'application/json',
    });
    await expect.poll(() => inputState(owner)).toEqual(expected);
    await checkRestoredDisclosure(owner);
    await checkFinalCalculation(owner);

    // Liczba zapisów wyniku, a nie czas procesora. Publiczne restore wykonuje
    // wszystkie rzeczywiste etapy, modele i zdarzenia; sonda niczego nie wycina.
    const writes = await owner.evaluate(() => {
      const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
      const writes = { advResults: 0, basicGrowthResults: 0 };
      Object.defineProperty(Element.prototype, 'innerHTML', {
        ...descriptor, set(value) {
          if (Object.hasOwn(writes, this.id) && String(value).trim()) writes[this.id]++;
          descriptor.set.call(this, value);
        },
      });
      try { window.vildaSession.restore(); } finally { Object.defineProperty(Element.prototype, 'innerHTML', descriptor); }
      return writes;
    });
    expect(writes.advResults, 'jeden końcowy zapis wyniku zaawansowanego w transakcji').toBe(1);
    expect(writes.basicGrowthResults, 'co najwyżej jeden końcowy zapis wyniku podstawowego w transakcji').toBeLessThanOrEqual(1);
    await settled(owner);
    expect(await inputState(owner)).toEqual(expected);
    await checkRestoredDisclosure(owner);
    await checkFinalCalculation(owner);

    // Po zakończeniu transakcji zwykła edycja nadal przelicza. Puste pole jest
    // rzeczywistą zmianą, a nie pretekstem do odzyskania starego wyniku/snapshotu.
    await owner.locator('#weight').fill('');
    await owner.locator('#weight').blur();
    await expect.poll(() => owner.evaluate(() => window.collectUserData().user.weight)).toBeNull();
    await expect.poll(() => owner.evaluate(() => window.advancedGrowthData.currentWeight)).toBeNaN();
    // DocPro ma udokumentowane uzupełnianie pustych pól sesją tej samej osoby
    // (brak karty spożycia, ALGORITHMS: P-SESJA-OBCA). Na audyt identycznie:
    // kolektor daje null, a zapis pełnej sesji zachowuje poprzednią masę.
    // Optymalizacja nie zmienia tej polityki. Pusty zapis po F5 badamy na Start;
    // bieżącą pustą wartość i późniejszy kompletny zapis sprawdzamy na obu stronach.
    if (route === 'start') {
      await expect.poll(() => owner.evaluate(() => window.vildaSession.saveNow({ force: true }))).toBe(true);
      await page.reload({ waitUntil: 'load' });
      owner = shell ? await shellFrame(page, 'Start') : page;
      await settled(owner);
    }
    await expect(owner.locator('#weight')).toHaveValue('');
    await expect(owner.locator('#height')).toHaveValue('159.4');
    await owner.locator('#weight').fill('48.6');
    await owner.locator('#weight').blur();
    await expect.poll(() => owner.evaluate(() => window.collectUserData().user.weight)).toBe(48.6);
    // Liczba BMI ma własną animację; badamy docelowy wynik, nie klatkę licznika.
    await expect(owner.locator('#bmiResult')).toContainText('BMI: 19,1 kg/m²');
    await checkFinalCalculation(owner);
    const filled = await inputState(owner);
    await expect.poll(() => owner.evaluate(() => window.vildaSession.saveNow({ force: true }))).toBe(true);
    await page.reload({ waitUntil: 'load' });
    owner = shell ? await shellFrame(page, route === 'docpro' ? 'DocPro' : 'Start') : page;
    await settled(owner);
    await expect.poll(() => inputState(owner)).toEqual(filled);
    await expect(owner.locator('#weight')).toHaveValue('48.6');
    await checkRestoredDisclosure(owner);
    await checkFinalCalculation(owner);
  });
}
