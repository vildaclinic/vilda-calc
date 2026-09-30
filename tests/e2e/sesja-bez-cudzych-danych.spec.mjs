import { expect, test } from '../support/test-czas.mjs';

// P-SESJA-OBCA (2026-09-30): na docpro.html pomiar niezapisanego pacjenta przechodził do rekordu innego pacjenta.
//
// Mechanizm (zmierzony na `audyt`): strony bez #intakePal (docpro, klirens) przy każdym zapisie sesji głównej
// uzupełniają PUSTE pola nowej sesji wartościami z poprzedniej (Et w saveMainSessionNow), żeby nie gubić pól
// innych stron. Gdy lekarz wczytuje innego pacjenta bez „Wyczyść” — skok z notatki do punktu GH, autouzupełnianie
// nazwiska, „Odrzuć” w oknie niezapisanych zmian — poprzednia sesja należy do kogoś innego, a pola nowej wizyty
// (wiek, masa) są po wczytaniu puste. Sesja Beaty dostawała wiek i masę niezapisanej Celiny; po F5 formularz
// Beaty pokazywał te liczby, a „Zapisz” utrwalał je w rekordzie Beaty.
//
// Poprawka: pierwszy zapis sesji po wczytaniu rekordu nie scala jej z poprzednią, gdy imię i nazwisko albo data
// urodzenia się różnią. Dla tej samej osoby scalanie działa jak dotąd (kontrola na końcu pliku).
//
// Dane wyłącznie fikcyjne, własne konto sejfu w efemerycznym profilu przeglądarki.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#SesjaObca!26';

async function otworzDocpro(page) {
  await otworzStrone(page, '/docpro.html');
}

async function otworzStrone(page, url) {
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('analyticsConsent', 'denied');
    } catch { /* brak storage — pomiń */ }
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
}

async function gotowa(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && typeof window.applyLoadedData === 'function' && Boolean(window.VildaAuthUI)
    && Boolean(window.VildaPersistence) && typeof window.VildaPersistence.readMainSession === 'function'
    && Boolean(window.VildaProAccess));
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  // Pola imienia i nazwiska na docpro są w trybie profesjonalnym (PRO) — wzorzec z testów notatki do wizyty.
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const tryb = document.getElementById('resultsModeToggle');
    if (tryb && !tryb.checked) { tryb.checked = true; tryb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(1200);
}

async function wpisz(page, d) {
  await page.fill('#lastName', d.nazwisko);
  await page.fill('#firstName', d.imie);
  await page.evaluate((v) => {
    const ustaw = (id, x) => {
      const e = document.getElementById(id);
      e.value = x;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    ustaw('age', v.wiek); ustaw('ageMonths', '0'); ustaw('sex', 'F'); ustaw('height', v.wzrost); ustaw('weight', v.masa);
  }, d);
  await page.waitForTimeout(900); // zapis sesji głównej z input/change ma debounce 300 ms
}

const sesja = (page) => page.evaluate(() => {
  const s = window.VildaPersistence.readMainSession();
  if (!s) return null;
  return {
    imie: s.user && s.user.firstName, wiek: s.user && s.user.age, masa: s.user && s.user.weight,
    potrawy: Array.isArray(s.foods) ? s.foods.length : null,
  };
});

const pola = (page) => page.evaluate(() => {
  const v = (id) => (document.getElementById(id) || {}).value;
  return { imie: v('firstName'), wiek: v('age'), masa: v('weight') };
});

const wersje = (page, patientId) => page.evaluate(async (pid) => {
  const r = await window.VildaVault.getPatient(pid);
  return r.snapshots.map((s) => ({ wiek: s.payload.user.age, masa: s.payload.user.weight }));
}, patientId);

async function zapiszBeate(page) {
  await page.fill('#lastName', 'Fikcyjna');
  await page.fill('#firstName', 'Beata');
  await page.evaluate(() => {
    const ustaw = (id, x) => {
      const e = document.getElementById(id);
      e.value = x;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    ustaw('age', '40'); ustaw('ageMonths', '0'); ustaw('sex', 'F'); ustaw('height', '164'); ustaw('weight', '65');
  });
  await page.waitForTimeout(800);
  await page.locator('#saveDataBtnSidebar').evaluate((b) => b.click());
  await expect.poll(() => page.evaluate(async () => (await window.VildaVault.listPatients()).length)).toBe(1);
  const id = await page.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId);
  // Notatka z punktem GH — daje prawdziwy przycisk „↗ Siatki / punkt GH" (wzorzec z skok-gh-rozgloszenie.spec.mjs).
  const notatka = await page.evaluate(async (pid) => {
    const w = await window.VildaVault.savePatientNote({
      patientId: pid, title: 'Somatropina', body: 'Dawka kontrolna.', category: 'treatment', ghPointId: 'gh-fikcja-b1',
      medication: { name: 'Somatropina', action: 'start', doseUnit: 'mg/kg/d', doseNum: 0.03 },
    });
    const lista = await window.VildaVault.listPatientNotesForPatient(pid);
    return lista.find((n) => n.id === w.id) || null;
  }, id);
  expect(notatka, 'notatka leczenia Beaty').toBeTruthy();
  return { id, notatka };
}

/* Prawdziwy skok: arkusz notatki i przycisk „↗ Siatki / punkt GH". Przy niezapisanym formularzu okno
   niezapisanych zmian pyta, co zrobić — lekarz odrzuca dane (jego przycisk zaczyna się od „Odrzuć”). */
async function skokDoPunktuGH(page, beata) {
  await page.evaluate((d) => window.VildaAuthUI.showPatientNoteEditor({ patientId: d.id, note: d.notatka }), beata);
  const przycisk = page.locator('.vilda-pne button', { hasText: 'Siatki / punkt GH' });
  await expect(przycisk).toBeVisible();
  await przycisk.click();
  const odrzuc = page.getByRole('button', { name: /^Odrzuć/ });
  try {
    await odrzuc.first().click({ timeout: 3000 });
  } catch { /* okna nie było — skok poszedł od razu */ }
  await expect(page.locator('#firstName'), 'skok wczytał Beatę').toHaveValue('Beata', { timeout: 15000 });
  await page.waitForTimeout(2500); // zapis sesji na końcu wczytania, prefill, podświetlenie punktu
}

test('docpro: skok z notatki do punktu GH Beaty przy niezapisanej Celinie — po F5 i „Zapisz” rekord Beaty bez wieku i masy Celiny', async ({ page }) => {
  test.setTimeout(180_000);
  await otworzDocpro(page);
  const beata = await zapiszBeate(page);
  expect(await wersje(page, beata.id)).toEqual([{ wiek: 40, masa: 65 }]);

  await page.locator('#clearAllDataBtn').evaluate((b) => b.click());
  // „Wyczyść” uzbraja 2,5 s blokady zapisu sesji (ochrona przed wskrzeszeniem wyczyszczonych danych) — Celinę
  // wpisujemy po jej końcu, jak lekarz przy kolejnym pacjencie.
  await page.waitForTimeout(3000);
  await wpisz(page, { nazwisko: 'Testowa', imie: 'Celina', wiek: '35', wzrost: '164', masa: '66' });
  expect(await sesja(page), 'warunek wstępny: niezapisana Celina w sesji głównej')
    .toMatchObject({ imie: 'Celina', wiek: 35, masa: 66 });

  await skokDoPunktuGH(page, beata);
  const przedF5 = await pola(page);
  expect.soft(await sesja(page), 'sesja Beaty nie niesie wieku ani masy Celiny')
    .toMatchObject({ imie: 'Beata', wiek: przedF5.wiek === '' ? null : Number(przedF5.wiek), masa: przedF5.masa === '' ? null : Number(przedF5.masa) });

  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
  await page.waitForTimeout(2500);
  const poF5 = await pola(page);
  expect(poF5.imie, 'po F5 nadal Beata').toBe('Beata');
  expect.soft(poF5, 'po F5 formularz Beaty pokazuje to, co przed F5 — nie wiek i masę Celiny').toEqual(przedF5);
  expect.soft(poF5.wiek, 'wiek Celiny nie przechodzi do Beaty').not.toBe('35');
  expect.soft(poF5.masa, 'masa Celiny nie przechodzi do Beaty').not.toBe('66');

  // Lekarz zapisuje Beatę po drobnej zmianie. Rekord Beaty nie może dostać liczb Celiny.
  await page.evaluate(() => {
    const e = document.getElementById('waistCm');
    if (e) { e.value = '80'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(800);
  await page.locator('#saveDataBtnSidebar').evaluate((b) => b.click());
  await page.waitForTimeout(2500);
  const poZapisie = await wersje(page, beata.id);
  expect(poZapisie.some((w) => w.wiek === 35 || w.masa === 66), `rekord Beaty bez wieku 35 i masy 66: ${JSON.stringify(poZapisie)}`)
    .toBe(false);
});

test('index: wczytanie Beaty z autouzupełniania nazwiska przy niezapisanej Celinie, „Nowy pomiar”, F5 — bez wieku i masy Celiny', async ({ page }) => {
  // Strona główna nie scala sesji (ma #intakePal), ale wspólny stan (sharedUserData) jest ten sam co na docpro.
  // Wczytanie jest tym samym wywołaniem co autouzupełnianie nazwiska w vilda_auth_ui.js; bez skipLoadChoice
  // pojawia się modal „Co chcesz zrobić?” i lekarz wybiera „Nowy pomiar”.
  test.setTimeout(180_000);
  await otworzStrone(page, '/index.html');
  const beata = await zapiszBeate(page);
  await page.locator('#clearAllDataBtn').evaluate((b) => b.click());
  await page.waitForTimeout(3000);
  await wpisz(page, { nazwisko: 'Testowa', imie: 'Celina', wiek: '35', wzrost: '164', masa: '66' });

  await page.evaluate(async (id) => {
    const r = await window.VildaVault.getPatient(id);
    const o = r.snapshots[0];
    window.applyLoadedData(o.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: id, savedAtISO: o.savedAtISO || null, snapshotCount: r.snapshots.length, name: o.payload.name, source: 'pick' },
    }));
  }, beata.id);
  await expect(page.locator('#firstName')).toHaveValue('Beata');
  const nowy = page.locator('#vildaLcmNew');
  await expect(nowy, 'modal „Co chcesz zrobić?”').toBeVisible({ timeout: 10000 });
  await nowy.click();
  await page.waitForTimeout(2500);
  const przedF5 = await pola(page);

  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
  await page.waitForTimeout(2500);
  const poF5 = await pola(page);
  expect(poF5.imie, 'po F5 nadal Beata').toBe('Beata');
  expect.soft(poF5, 'po F5 formularz Beaty pokazuje to, co przed F5').toEqual(przedF5);
  expect.soft(poF5.wiek, 'wiek Celiny nie przechodzi do Beaty').not.toBe('35');
  expect.soft(poF5.masa, 'masa Celiny nie przechodzi do Beaty').not.toBe('66');
});

test('kontrola: ponowne wczytanie rekordu TEJ SAMEJ osoby zachowuje w sesji pola innych stron (scalanie jak dotąd)', async ({ page }) => {
  // docpro nie ma listy potraw; sesja główna Beaty z potrawą (jak po pracy na stronie głównej) po ponownym wczytaniu
  // rekordu Beaty nadal ją ma — scalanie z poprzednią sesją działa dla tej samej osoby. Wczytanie jest tym samym
  // wywołaniem co autouzupełnianie nazwiska w vilda_auth_ui.js: applyLoadedData(payload) + vilda:patient-loaded.
  // (Skok do punktu GH tej samej osoby niczego nie wczytuje — monitor pomija wczytanie bieżącego pacjenta.)
  test.setTimeout(180_000);
  await otworzDocpro(page);
  const beata = await zapiszBeate(page);
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const P = window.VildaPersistence;
    const s = P.readMainSession();
    s.foods = [{ name: 'Jabłko', grams: 150 }];
    P.writeMainSession(s);
  });
  expect(await sesja(page), 'warunek wstępny: sesja Beaty z potrawą').toMatchObject({ imie: 'Beata', potrawy: 1 });

  await page.evaluate(async (id) => {
    const r = await window.VildaVault.getPatient(id);
    const o = r.snapshots[0];
    window.applyLoadedData(o.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: id, savedAtISO: o.savedAtISO || null, snapshotCount: r.snapshots.length, name: o.payload.name, source: 'pick', skipLoadChoice: true },
    }));
  }, beata.id);
  await expect(page.locator('#firstName')).toHaveValue('Beata');
  await page.waitForTimeout(2500);
  expect(await sesja(page), 'sesja Beaty po ponownym wczytaniu jej rekordu nadal ma potrawę').toMatchObject({ imie: 'Beata', potrawy: 1 });
});
