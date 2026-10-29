import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';

// Wyłącznie fikcyjny sejf i natywny zegar. Zapis bazowy przechodzi przez
// rzeczywisty przycisk, collector i vault; obserwacja nie przelicza formularza.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce',
  // 11 żywych dokumentów sprawia, że pełny DOM snapshot przy każdym odczycie
  // dominuje czas testu. Zachowujemy kroki, sieć, źródła i screenshot przy błędzie.
  trace: { mode: 'retain-on-failure', snapshots: false, screenshots: false, sources: true },
});
test.setTimeout(240_000);

const ROUTES = [
  ['start', 'index.html', 'Start'], ['docpro', 'docpro.html', 'DocPro'],
  ['homa', 'homa-ir.html', 'HOMA-IR'], ['steroidy', 'steroidy.html', 'Steroidy'],
  ['lab', 'przelicznik-jednostek.html', 'Jednostki laboratoryjne'], ['notatki', 'notatki.html', 'Notatki'],
  ['terminarz', 'terminarz.html', 'Terminarz'], ['ustawienia', 'ustawienia.html', 'Ustawienia'],
  ['edu', 'materialy-edukacyjne.html', 'Materiały edukacyjne'], ['cukrzyca', 'cukrzyca.html', 'Cukrzyca'],
  ['klirens', 'kalkulator-klirens.html', 'Kalkulator klirensu'],
].map(([id, path, title]) => ({ id, path, title }));
const ANCILLARY = ['genotropin-instrukcja.html', 'instrukcja.html', 'kontakt.html',
  'ngenla-instrukcja.html', 'o-aplikacji.html', 'omnitrope-instrukcja.html',
  'polityka-prywatnosci.html', 'przelicznik-doposilkowy-instrukcja.html', 'regulamin.html', 'subskrypcja.html'];

async function settled(owner) {
  await owner.waitForLoadState('load');
  await owner.waitForFunction(() => window.VildaVault?.isUnlocked()
    && (!window.VildaAuthUI?.isBootReady || window.VildaAuthUI.isBootReady())
    && window.VildaSaveStatusIndicator
    && !window.__vildaPersistRestoring && !window.VildaDobAge?.restorePending?.()
    && !window.VildaDataImportExport?.isMainSessionRestorePending?.()
    && window.VildaSaveStatusIndicator.isReadyForSharedReference?.() === true, null, { timeout: 30_000 });
  await owner.waitForFunction(() => !/\/docpro\.html$/u.test(location.pathname)
    || (window.VildaDocproStatePersistence?.isReady?.() === true
      && !window.VildaDocproStatePersistence.isRestoring()), null, { timeout: 30_000 });
  const confirmation = owner.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await owner.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
}

async function saveThroughUi(page, owner) {
  const previous = await owner.evaluate(() => window.VildaSaveStatusIndicator.getLastSavedAtISO());
  const sidebar = page.locator('#saveDataBtnSidebar');
  if (await sidebar.isVisible()) await sidebar.click();
  else {
    // Drawer kopiuje stan akcji hosta przy otwarciu; odtworzenie właściciela
    // poprzedza osobne odświeżenie tej akcji w powłoce.
    await expect(sidebar).toBeEnabled();
    await page.locator('[data-vilda-chrome-menu-btn]').click();
    await page.locator('[data-drawer-btn="saveDataBtnSidebar"]').click();
    await expect(page.locator('[data-vilda-chrome-drawer]')).toBeHidden();
  }
  await owner.waitForFunction(before => window.VildaSaveStatusIndicator.getState() === 'saved'
    && window.VildaSaveStatusIndicator.getLastSavedAtISO() !== before, previous, { timeout: 30_000 });
  await settled(owner);
}

async function clinicalState(owner) {
  return owner.evaluate(() => {
    const main = window.VildaPersistence.readMainSession();
    const user = main?.user || {};
    return {
      pid: sessionStorage.getItem('vildaCurrentPatientId'), name: main?.name,
      patient: Object.fromEntries(['firstName', 'lastName', 'sex', 'age', 'ageMonths', 'ageWeeks',
        'weight', 'height', 'dobISO', 'measuredAtISO', 'waist', 'hip'].map(key => [key, user[key] ?? null])),
      advanced: main?.advanced?.data?.measurements || [],
      basic: main?.growthBasic?.data?.measurements || [],
      annotations: main?.chartCreator?.growth?.free || null,
    };
  });
}

async function savedSnapshot(owner, id) {
  return owner.evaluate(async pid => {
    const record = await window.VildaVault.getPatient(pid);
    return { count: record.snapshotCount, head: record.snapshots[0] };
  }, id);
}

async function baseline(page, owner, id) {
  await saveThroughUi(page, owner);
  return { id, clinical: await clinicalState(owner), vault: await savedSnapshot(owner, id),
    reference: await owner.evaluate(() => window.VildaSaveStatusIndicator.getReferenceFingerprint()),
    color: await page.locator('#vildaPatientChip').evaluate(async element => {
      // Kolor bazowy pochodzi z końca skończonego przejścia CSS, nie z jego klatki.
      getComputedStyle(element).backgroundColor;
      const finite = element.getAnimations({ subtree: true }).filter(animation =>
        Number.isFinite(animation.effect?.getComputedTiming().endTime));
      await Promise.allSettled(finite.map(animation => animation.finished));
      await new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
      const icon = element.querySelector('.chip-icon'), style = getComputedStyle(icon);
      return { chip: getComputedStyle(element).backgroundColor, icon: style.backgroundImage, text: style.color };
    }) };
}

async function assertSaved(page, owner, expected, where, { popover = false, snapshot = false } = {}) {
  try {
    await expect.poll(() => owner.evaluate(() => ({
      state: window.VildaSaveStatusIndicator?.getState?.(),
      reference: window.VildaSaveStatusIndicator?.getReferenceFingerprint?.(),
      persisted: JSON.parse(sessionStorage.getItem('vilda-save-ref-v1') || 'null')?.fp,
      current: window.VildaSaveStatusIndicator?._computeCanonicalFingerprint?.(),
    })), { message: where, timeout: 15_000 }).toMatchObject({ state: 'saved' });
    const state = await owner.evaluate(() => ({
      reference: window.VildaSaveStatusIndicator.getReferenceFingerprint(),
      persisted: JSON.parse(sessionStorage.getItem('vilda-save-ref-v1') || 'null')?.fp,
      current: window.VildaSaveStatusIndicator._computeCanonicalFingerprint(),
    }));
    expect(state.reference, `${where}: niezmieniona baza prawdziwego zapisu`).toBe(expected.reference);
    expect(state.reference, `${where}: wspólna baza`).toBe(state.persisted);
    expect(state.current, `${where}: brak rzeczywistej edycji`).toBe(state.reference);
    await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator?.getState?.()), { message: where }).toBe('saved');
    const chip = page.locator('#vildaPatientChip');
    await expect(chip, where).toHaveClass(/vilda-save-state--saved(?:\s|$)/);
    await expect(chip).toHaveAttribute('title', /Dane pacjenta zapisane/);
    await expect.poll(() => chip.evaluate(element => {
      const icon = element.querySelector('.chip-icon'), style = getComputedStyle(icon);
      return { chip: getComputedStyle(element).backgroundColor, icon: style.backgroundImage, text: style.color };
    }), { message: `${where}: końcowy kolor kapsuły i ikony` }).toEqual(expected.color);
    expect(await clinicalState(owner), `${where}: dane pacjenta`).toEqual(expected.clinical);
    if (snapshot) expect(await savedSnapshot(owner, expected.id), `${where}: zapis sejfu`).toEqual(expected.vault);
    if (popover) {
      await chip.click();
      const dialog = page.locator('.vilda-save-popover');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('.vsp-hero-title')).toContainText('Zapisane');
      await expect(dialog).not.toContainText('Brak danych pacjenta');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await page.mouse.move(0, 0);
    }
  } catch (error) {
    const detail = await owner.evaluate(() => ({ path: location.pathname, state: window.__vildaSaveStatusState,
      reference: window.VildaSaveStatusIndicator?.getReferenceFingerprint?.(),
      current: window.VildaSaveStatusIndicator?._computeCanonicalFingerprint?.(),
      ref: sessionStorage.getItem('vilda-save-ref-v1'), main: window.VildaPersistence?.readMainSession?.(),
      clcr: window.VildaPersistence?.readClcrSession?.(), loaded: window.lastLoadedData,
      pid: sessionStorage.getItem('vildaCurrentPatientId'),
    }));
    await test.info().attach(where, { body: JSON.stringify(detail, null, 2), contentType: 'application/json' });
    throw error;
  }
}

async function begin(page, shell) {
  const fixture = await createFictionalVault(page, { shell });
  await loadPatient(fixture.frame, fixture.ids.a, 'restore');
  await settled(fixture.frame);
  return { ...fixture, expected: await baseline(page, fixture.frame, fixture.ids.a) };
}

async function activate(page, route) {
  await page.evaluate(id => window.VildaShell.navigate(id), route.id);
  return readyRoute(page, route);
}
async function readyRoute(page, route) {
  await expect(page).toHaveURL(new RegExp(`#/` + route.id + '$'));
  const owner = await shellFrame(page, route.title);
  await expect(page.locator(`iframe.app-pane[title="${route.title}"]`)).toBeVisible();
  await settled(owner);
  return owner;
}

// Cykl Eulera ma każdą skierowaną krawędź raz: 110 przejść bez dodatkowych
// przejść przygotowujących, które zaciemniałyby rzeczywiste źródło nawigacji.
function directedTour(size) {
  const edges = Array.from({ length: size }, (_, from) => Array.from({ length: size }, (_, to) => to).filter(to => to !== from));
  const stack = [0], result = [];
  while (stack.length) {
    const from = stack.at(-1);
    if (edges[from].length) stack.push(edges[from].shift());
    else result.push(stack.pop());
  }
  return result.reverse();
}

test('powłoka: wszystkie 110 skierowanych par tras zachowują rzeczywisty zapis pacjenta', async ({ page }) => {
  console.info('P-CHIP-TRASY: readiness=public-owner-contract; 110 directed edges');
  const fixture = await begin(page, true);
  expect(await page.evaluate(() => Object.keys(window.VildaShell.routes).sort())).toEqual(ROUTES.map(route => route.id).sort());
  for (const route of ROUTES) {
    console.info(`P-CHIP-TRASY: warm ${route.id}`);
    await activate(page, route);
    console.info(`P-CHIP-TRASY: ready ${route.id}`);
  }
  let owner = await activate(page, ROUTES[0]);
  // Faktyczna nowa wartość i zapis tego samego PID muszą dotrzeć do już
  // rozgrzanych sibling SSI, nie tylko podmienić ich klasę na saved.
  await owner.locator('#weight').fill('47');
  await owner.locator('#weight').blur();
  await expect.poll(() => owner.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('dirty');
  const expected = await baseline(page, owner, fixture.ids.a);
  const tour = directedTour(ROUTES.length), seen = new Set();
  for (let index = 1; index < tour.length; index++) {
    const from = ROUTES[tour[index - 1]], to = ROUTES[tour[index]], label = `${from.id}→${to.id}`;
    owner = await activate(page, to);
    await assertSaved(page, owner, expected, label, { snapshot: index % 10 === 0 });
    seen.add(label);
    if (index % 10 === 0) console.info(`P-CHIP-TRASY: ${index}/110, ${label}`);
  }
  expect(seen.size).toBe(110);
  expect(await savedSnapshot(owner, expected.id)).toEqual(expected.vault);
});

for (const shell of [false, true]) {
  test(`${shell ? 'powłoka 11 tras' : '21 samodzielnych dokumentów'}: zimne wejście i F5 każdej strony zachowuje zapis`, async ({ page }) => {
    const fixture = await begin(page, shell);
    const paths = shell ? ROUTES : [...ROUTES, ...ANCILLARY.map(path => ({ id: path, path }))];
    for (const route of paths) {
      await page.goto(shell ? `/app.html#/${route.id}` : `/${route.path}`, { waitUntil: 'load' });
      let owner = shell ? await readyRoute(page, route) : page;
      await settled(owner);
      await assertSaved(page, owner, fixture.expected, `cold:${route.id}`, { popover: true, snapshot: true });
      await page.reload({ waitUntil: 'load' });
      owner = shell ? await readyRoute(page, route) : page;
      await settled(owner);
      await assertSaved(page, owner, fixture.expected, `F5:${route.id}`, { snapshot: true });
    }
  });
}

for (const mobile of [false, true]) {
  test(`${mobile ? 'telefon: drawer i dock' : 'desktop: sidebar'} — prawdziwe kliki, Wstecz i Dalej zachowują pacjenta`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    const fixture = await begin(page, true);
    let owner;
    for (const route of ROUTES.filter(route => route.id !== 'cukrzyca')) {
      if (mobile) {
        await page.locator('[data-vilda-chrome-menu-btn]').click();
        await page.locator(`.chrome-drawer-nav a[href="${route.path}"]`).click();
        await expect(page.locator('[data-vilda-chrome-drawer]')).toBeHidden();
      } else await page.locator(`.sidebar-nav a[href="${route.path}"]`).click();
      owner = await readyRoute(page, route);
      await assertSaved(page, owner, fixture.expected, `UI:${route.id}`);
    }
    if (mobile) {
      const dock = await page.locator('#mobileBottomDock a[href]').evaluateAll(links => links.map(link => link.getAttribute('href')));
      expect(dock).toHaveLength(5);
      for (const href of dock) {
        const route = ROUTES.find(item => href.endsWith(`#/${item.id}`));
        await page.locator(`#mobileBottomDock a[href="${href}"]`).click();
        owner = await readyRoute(page, route);
        await assertSaved(page, owner, fixture.expected, `dock:${route.id}`);
      }
    }
    // Cukrzyca należy do mapy powłoki, ale nie do jej 10 pozycji sidebar/drawer.
    // Rzeczywisty odnośnik w stopce ramki także musi przejść przez router hosta.
    await owner.locator('.site-footer__link[href="cukrzyca.html"]').click();
    owner = await readyRoute(page, ROUTES.find(route => route.id === 'cukrzyca'));
    await assertSaved(page, owner, fixture.expected, 'stopka:Cukrzyca');
    const current = new URL(page.url()).hash;
    await page.goBack();
    const previous = ROUTES.find(route => `#/${route.id}` === new URL(page.url()).hash);
    owner = await readyRoute(page, previous);
    await assertSaved(page, owner, fixture.expected, 'Wstecz');
    await page.goForward();
    expect(new URL(page.url()).hash).toBe(current);
    const next = ROUTES.find(route => `#/${route.id}` === current);
    owner = await readyRoute(page, next);
    await assertSaved(page, owner, fixture.expected, 'Dalej', { snapshot: true });
  });
}
