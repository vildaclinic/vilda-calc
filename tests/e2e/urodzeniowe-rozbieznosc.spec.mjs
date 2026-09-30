import { expect, test } from '@playwright/test';

// P-URODZENIOWE-ROZBIEZNOSC (decyzja właściciela 2026-09-30: „Najpierw ostrzeżenie", makieta
// zaakceptowana tego samego dnia).
//
// Dane urodzeniowe żyją w rekordzie dwa razy: sekcja `birth` (karta SGA w DocPro) i sekcja
// `perinatal` (Karta Pacjenta → „Dane okołoporodowe"). Nic ich nie synchronizuje. Karta SGA,
// opis pacjenta, ściąga B.64 i Blum ISS liczą z `birth`, a generator epikryzy wypełnia się
// z `perinatal`. Przy rozbieżności aplikacja ma to POKAZAĆ w trzech miejscach i niczego nie
// zmieniać.
//
// Przypadek z diagnozy: dziewczynka, 38+0 tc, 48 cm, normy Niklasson — karta SGA 2700 g
// (SDS masy −1,21), Karta Pacjenta 2100 g (SDS masy −3,20). SDS liczy produkcyjny silnik
// karty SGA (window.VildaSgaBirth.compute); test porównuje z liczbami, które ten silnik daje.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane jednoznacznie fikcyjne.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Urodzeniowe!26r';

const BIRTH = {
  sourceChoice: 'niklasson', sourceKeys: ['niklasson'], sex: 'female',
  weeks: '38', days: '0', weight: '2700', length: '48', head: '', hasComputed: false,
};
const PERINATAL = { gestationalWeeks: 38, gestationalDays: 0, birthWeightG: 2100, birthLengthCm: 48 };
const PERINATAL_ZGODNE = { gestationalWeeks: 38, gestationalDays: 0, birthWeightG: 2700, birthLengthCm: 48 };

async function otworzZKontem(page, strona) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch { /* brak storage — pomiń */ }
  });
  await page.goto('/' + strona, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && typeof window.applyLoadedData === 'function' && Boolean(window.VildaUrodzeniowaRozbieznosc)
    && Boolean(window.VildaProAccess));
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  if (strona === 'docpro.html') {
    // Moduł lekarski (z kartą SGA) jest w trybie profesjonalnym — wzorzec z sesja-bez-cudzych-danych.spec.mjs.
    await page.evaluate(() => {
      window.VildaProAccess.hasAccess = () => true;
      document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
      const tryb = document.getElementById('resultsModeToggle');
      if (tryb && !tryb.checked) { tryb.checked = true; tryb.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(1200);
  }
}

const zalozPacjenta = (page, d) => page.evaluate(async (dane) => {
  const payload = {
    name: `${dane.lastName} ${dane.firstName}`,
    user: { lastName: dane.lastName, firstName: dane.firstName, sex: 'F', age: 6, ageMonths: 2, height: 112, weight: 18 },
    birth: dane.birth,
    perinatal: dane.perinatal,
  };
  return (await window.VildaVault.savePatient(payload, { dedup: false })).patientId;
}, d);

/* Wczytanie tak, jak robi to lista pacjentów (applyLoadedData + vilda:patient-loaded). */
async function wczytaj(page, pid) {
  await page.evaluate(async (id) => {
    const p = await window.VildaVault.getPatient(id);
    const snap = p.snapshots[0];
    window.applyLoadedData(snap.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: id, savedAtISO: snap.savedAtISO || null, snapshotCount: p.snapshotCount || 1, source: 'pick' },
    }));
  }, pid);
  await page.waitForTimeout(1500); // kaskada zerowania pól, prefill karty SGA i modal „Co chcesz zrobić?"
  if (await page.evaluate(() => Boolean(document.getElementById('vildaLcmNew')))) {
    await page.evaluate(() => document.getElementById('vildaLcmNew').click());
    await page.waitForTimeout(400);
  }
}

/* Karta SGA stoi w module lekarskim, zwiniętym w domyślnym stanie strony — klikamy przycisk
   karty bezpośrednio, jak b64-sciaga-przycisk.spec.mjs. */
async function otworzKarteSga(page) {
  await page.evaluate(() => {
    const karta = document.getElementById('sgaBirthCard');
    if (!karta || karta.style.display === 'none' || !karta.style.display) document.getElementById('toggleSgaBirth').click();
  });
  await expect(page.locator('#sgaBirthWeight')).toHaveValue('2700', { timeout: 10000 });
}

/* Treść ostrzeżenia jako tekst wierszy tabeli — to, co widzi lekarz. */
const ostrzezenie = (page, selektor) => page.evaluate((sel) => {
  const s = document.querySelector(sel);
  if (!s || !s.getClientRects().length) return null;
  const wiersze = [...s.querySelectorAll('.vilda-ur__wiersz')].map((w) => [...w.children].map((c) => c.textContent.replace(/\u00a0/g, ' ')));
  return {
    tytul: s.querySelector('.vilda-ur__tytul').textContent,
    tekst: s.textContent.replace(/\u00a0/g, ' '),
    wiersze,
  };
}, selektor);

test('docpro: karta SGA 2700 g, Karta Pacjenta 2100 g — ostrzeżenie w karcie SGA, dane nietknięte, znika po wyrównaniu', async ({ page }) => {
  await otworzZKontem(page, 'docpro.html');
  const pid = await zalozPacjenta(page, { lastName: 'Testowa', firstName: 'Anna', birth: BIRTH, perinatal: PERINATAL });
  await wczytaj(page, pid);
  await otworzKarteSga(page);

  await expect.poll(() => ostrzezenie(page, '#sgaBirthRozbieznosc .vilda-ur'), { timeout: 10000 }).not.toBeNull();
  const o = await ostrzezenie(page, '#sgaBirthRozbieznosc .vilda-ur');
  expect(o.tytul).toBe('Dane urodzeniowe różnią się między kartami');
  expect(o.wiersze).toEqual([
    ['Pole', 'Ta karta SGA', 'Karta Pacjenta'],
    ['Masa urodzeniowa', '2700 g', '2100 g'],
    ['SDS masy · Niklasson', '−1,21', '−3,20'],
  ]);
  expect(o.tekst).toContain('Wiek ciążowy (38+0 tc) i długość (48 cm) są zgodne.');
  expect(o.tekst).toContain('Wynik tej karty, opis pacjenta, ściąga B.64 i Blum ISS liczą z 2700 g. Epikryza bierze 2100 g z Karty Pacjenta.');
  expect(o.tekst).toContain('Nic nie zostało zmienione.');
  await expect(page.locator('#sgaBirthWeight')).toHaveClass(/vilda-ur-pole/);
  await expect(page.locator('#sgaBirthCard .vilda-ur-podpis')).toHaveText('Karta Pacjenta: 2100 g');

  // Ostrzeżenie niczego nie zmienia: karta i rekord zostają przy swoich liczbach.
  expect(await page.evaluate(() => window.vildaSgaBirthPersistApi.captureState().weight)).toBe('2700');
  const rekord = await page.evaluate(async (id) => (await window.VildaVault.getPatient(id)).snapshots[0].payload, pid);
  expect(rekord.birth.weight).toBe('2700');
  expect(rekord.perinatal.birthWeightG).toBe(2100);

  // Lekarz poprawia kartę na wartość z Karty Pacjenta — ostrzeżenie i oznaczenie pola znikają.
  await page.locator('#sgaBirthWeight').fill('2100');
  await expect(page.locator('#sgaBirthRozbieznosc')).toBeHidden();
  await expect(page.locator('#sgaBirthWeight')).not.toHaveClass(/vilda-ur-pole/);
  await expect(page.locator('#sgaBirthCard .vilda-ur-podpis')).toHaveCount(0);
});

test('docpro: „Otwórz Kartę Pacjenta" z ostrzeżenia otwiera edycję pacjenta z rozwiniętą sekcją i jej ostrzeżeniem', async ({ page }) => {
  await otworzZKontem(page, 'docpro.html');
  const pid = await zalozPacjenta(page, { lastName: 'Testowa', firstName: 'Anna', birth: BIRTH, perinatal: PERINATAL });
  await wczytaj(page, pid);
  await otworzKarteSga(page);
  await expect(page.locator('#sgaBirthRozbieznosc .vilda-ur__przycisk')).toBeVisible({ timeout: 10000 });
  await page.locator('#sgaBirthRozbieznosc .vilda-ur__przycisk').click();

  const sekcja = page.locator('.ve-card.ve-coll', { hasText: 'Dane okołoporodowe' });
  await expect(sekcja).toHaveClass(/is-open/, { timeout: 10000 });
  await expect(sekcja.locator('.vilda-ur-plakietka')).toHaveText('● Inna masa niż w karcie SGA');
  const o = await ostrzezenie(page, '.ve-coll .vilda-ur');
  expect(o.tytul).toBe('Karta SGA ma inną masę urodzeniową');
  expect(o.wiersze).toEqual([
    ['Pole', 'Ta sekcja', 'Karta SGA'],
    ['Masa urodzeniowa', '2100 g', '2700 g'],
    ['SDS masy · Niklasson', '−3,20', '−1,21'],
  ]);
});

test('index: Karta Pacjenta porównuje z sekcją `birth` rekordu; poprawka w polu zdejmuje ostrzeżenie bez zapisu', async ({ page }) => {
  await otworzZKontem(page, 'index.html');
  const pid = await zalozPacjenta(page, { lastName: 'Testowa', firstName: 'Anna', birth: BIRTH, perinatal: PERINATAL });
  await page.evaluate((id) => window.VildaAuthUI.showPatientEditScreen(id), pid);

  const sekcja = page.locator('.ve-card.ve-coll', { hasText: 'Dane okołoporodowe' });
  await expect(sekcja).toHaveClass(/is-open/, { timeout: 10000 });
  await expect(sekcja.locator('.vilda-ur-plakietka')).toHaveText('● Inna masa niż w karcie SGA');
  const o = await ostrzezenie(page, '.ve-coll .vilda-ur');
  expect(o.tytul).toBe('Karta SGA ma inną masę urodzeniową');
  expect(o.wiersze.slice(0, 2)).toEqual([
    ['Pole', 'Ta sekcja', 'Karta SGA'],
    ['Masa urodzeniowa', '2100 g', '2700 g'],
  ]);
  expect(o.tekst).toContain('Karta SGA, opis pacjenta, ściąga B.64 i Blum ISS liczą z 2700 g. Epikryza bierze 2100 g z tej sekcji.');
  expect(o.tekst).toContain('Popraw błędną wartość tutaj albo w karcie SGA i zapisz pacjenta.');
  const masa = sekcja.locator('input[placeholder="g"]');
  await expect(masa).toHaveClass(/vilda-ur-pole/);
  await expect(sekcja.locator('.vilda-ur-podpis')).toHaveText('Karta SGA: 2700 g');

  await masa.fill('2700');
  await expect(sekcja.locator('.vilda-ur')).toHaveCount(0);
  await expect(sekcja.locator('.vilda-ur-plakietka')).toHaveCount(0);
  await expect(masa).not.toHaveClass(/vilda-ur-pole/);
  // Bez „Zapisz zmiany" rekord jest nietknięty.
  const rekord = await page.evaluate(async (id) => (await window.VildaVault.getPatient(id)).snapshots[0].payload, pid);
  expect(rekord.perinatal.birthWeightG).toBe(2100);
});

test('index: generator epikryzy — krok „Dane urodzeniowe" wypełniony z Karty Pacjenta pokazuje, że karta SGA ma inną masę', async ({ page }) => {
  await otworzZKontem(page, 'index.html');
  const pid = await zalozPacjenta(page, { lastName: 'Testowa', firstName: 'Anna', birth: BIRTH, perinatal: PERINATAL });
  await wczytaj(page, pid);
  await page.evaluate(() => window.VildaEpicrisisUI.show());
  const masa = page.locator('#epi-birth-weight');
  for (let i = 0; i < 6 && !(await masa.isVisible()); i += 1) {
    await page.getByRole('button', { name: 'Dalej →' }).click();
  }
  await expect(masa).toHaveValue('2100');

  const o = await ostrzezenie(page, '[role="dialog"] .vilda-ur');
  expect(o.tytul).toBe('Karta SGA ma inną masę urodzeniową');
  expect(o.wiersze.slice(0, 2)).toEqual([
    ['Pole', 'Ten formularz', 'Karta SGA'],
    ['Masa urodzeniowa', '2100 g', '2700 g'],
  ]);
  expect(o.tekst).toContain('Epikryza użyje wartości z tego formularza. Karta SGA, opis pacjenta, ściąga B.64 i Blum ISS liczą z 2700 g.');
  await expect(masa).toHaveClass(/vilda-ur-pole/);

  await masa.fill('2700');
  await expect(page.locator('[role="dialog"] .vilda-ur')).toHaveCount(0);
  await expect(masa).not.toHaveClass(/vilda-ur-pole/);
});

test('kontrola: zgodne dane w obu zapisach — ani ostrzeżenia w karcie SGA, ani w Karcie Pacjenta', async ({ page }) => {
  await otworzZKontem(page, 'docpro.html');
  const pid = await zalozPacjenta(page, { lastName: 'Probna', firstName: 'Beata', birth: BIRTH, perinatal: PERINATAL_ZGODNE });
  await wczytaj(page, pid);
  await otworzKarteSga(page);
  await page.waitForTimeout(2000); // dwa cykle sprawdzania widocznej karty
  await expect(page.locator('#sgaBirthRozbieznosc')).toBeHidden();
  await expect(page.locator('.vilda-ur-pole')).toHaveCount(0);

  await page.evaluate((id) => window.VildaAuthUI.showPatientEditScreen(id), pid);
  const sekcja = page.locator('.ve-card.ve-coll', { hasText: 'Dane okołoporodowe' });
  await expect(sekcja).toHaveCount(1, { timeout: 10000 });
  await expect(sekcja.locator('.vilda-ur, .vilda-ur-plakietka')).toHaveCount(0);
  await expect(sekcja).not.toHaveClass(/is-open/);
});

test('telefon (390 px): ostrzeżenie w karcie SGA mieści się na ekranie bez poziomego przewijania', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await otworzZKontem(page, 'docpro.html');
  const pid = await zalozPacjenta(page, { lastName: 'Testowa', firstName: 'Anna', birth: BIRTH, perinatal: PERINATAL });
  await wczytaj(page, pid);
  await otworzKarteSga(page);
  const s = page.locator('#sgaBirthRozbieznosc .vilda-ur');
  await expect(s).toBeVisible({ timeout: 10000 });
  await s.scrollIntoViewIfNeeded();
  const pomiar = await page.evaluate(() => {
    const el = document.querySelector('#sgaBirthRozbieznosc .vilda-ur');
    const r = el.getBoundingClientRect();
    const b = el.querySelector('.vilda-ur__przycisk').getBoundingClientRect();
    return {
      przewijanie: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      lewo: r.left, prawo: r.right, szerokoscOkna: window.innerWidth,
      przyciskWysokosc: b.height, przyciskSzerokosc: b.width, szerokosc: r.width,
    };
  });
  expect(pomiar.przewijanie).toBeLessThanOrEqual(0);
  expect(pomiar.lewo).toBeGreaterThanOrEqual(0);
  expect(pomiar.prawo).toBeLessThanOrEqual(pomiar.szerokoscOkna);
  expect(pomiar.przyciskWysokosc).toBeGreaterThanOrEqual(44);
});
