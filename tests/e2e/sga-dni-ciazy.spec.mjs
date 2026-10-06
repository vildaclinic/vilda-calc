import { expect, test } from '@playwright/test';

// P-SGA-DNI (zlecenie właściciela 2026-10-06): karta SGA wypełniana z „Danych okołoporodowych" bierze także dni ciąży.
//
// Pole dni (`#sgaBirthDays`, docpro.html) to lista 0–6, która przy starcie strony i po każdym czyszczeniu karty stoi
// na „0”. Wypełnianie karty z Karty Pacjenta (`sga_birth_module.js`, prefill) wpisuje wartość tylko do PUSTEGO pola,
// więc dni z rekordu nie trafiały do karty nigdy. Zmierzone na `audyt` `5a81f59`: rekord 34+2 tc, 1650 g, 41 cm →
// karta 34+0 tc; karta liczy SDS dla 34+0, a ściąga B.64 pokazuje „masa −2,94 SD; długość −3,27 SD; 34 tc”
// zamiast −3,13 SD i −3,48 SD dla 34+2 tc. Moduł rozbieżności (P-URODZENIOWE-ROZBIEZNOSC) ostrzegał przy tym, że karta
// i Karta Pacjenta różnią się wiekiem ciążowym — choć różnicę zrobiła sama aplikacja.
//
// Reguła po poprawce: gdy karta nie ma jeszcze tygodni ciąży, wypełnianie wpisuje z rekordu tygodnie RAZEM z dniami
// (0–6). Karta, w której wiek ciążowy już jest (wpisany przez lekarza albo odtworzony z sekcji `birth`), zostaje
// nietknięta — wtedy różnicę pokazuje ostrzeżenie o rozbieżności, jak dotąd.
//
// SDS liczy produkcyjny silnik karty SGA; liczby w asercjach to wynik tego silnika dla danych z testu.
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane jednoznacznie fikcyjne.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#SgaDniCiazy!26';

async function otworzDocproZKontem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch { /* brak storage — pomiń */ }
    try {
      const writeText = (t) => { window.__schowek = t; return Promise.resolve(); };
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    } catch { /* brak schowka — pomiń */ }
  });
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && typeof window.applyLoadedData === 'function' && Boolean(window.VildaUrodzeniowaRozbieznosc)
    && Boolean(window.VildaProAccess));
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  // Moduł lekarski (z kartą SGA) jest w trybie profesjonalnym — wzorzec z urodzeniowe-rozbieznosc.spec.mjs.
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const tryb = document.getElementById('resultsModeToggle');
    if (tryb && !tryb.checked) { tryb.checked = true; tryb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(1200);
}

const zalozPacjenta = (page, d) => page.evaluate(async (dane) => {
  const payload = {
    name: `${dane.lastName} ${dane.firstName}`,
    user: { lastName: dane.lastName, firstName: dane.firstName, sex: 'M', age: 6, ageMonths: 2, height: 108, weight: 16 },
    perinatal: dane.perinatal,
  };
  if (dane.birth) payload.birth = dane.birth;
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

/* Karta SGA stoi w module lekarskim, zwiniętym w domyślnym stanie strony — klikamy przycisk karty bezpośrednio. */
async function otworzKarteSga(page, masa) {
  await page.evaluate(() => {
    const karta = document.getElementById('sgaBirthCard');
    if (!karta || karta.style.display === 'none' || !karta.style.display) document.getElementById('toggleSgaBirth').click();
  });
  await expect(page.locator('#sgaBirthWeight')).toHaveValue(masa, { timeout: 10000 });
}

const wiekWKarcie = (page) => page.evaluate(() => {
  const s = window.vildaSgaBirthPersistApi.captureState();
  return `${s.weeks}+${s.days}`;
});

/* Kryterium 1 ściągi B.64 z uzasadnieniem — prawdziwy przycisk „Kopiuj ściągę B.64". */
async function b64Kryterium1(page) {
  await page.evaluate(() => { window.__schowek = null; document.getElementById('copyB64ChecklistBtn').click(); });
  await page.waitForFunction(() => typeof window.__schowek === 'string' && window.__schowek.length > 0);
  const linie = (await page.evaluate(() => window.__schowek)).split('\n');
  const i = linie.findIndex((l) => /^1\./.test(l));
  return `${linie[i]} | ${(linie[i + 1] || '').trim()}`;
}

const tekstOstrzezenia = (page) => page.evaluate(() => {
  const s = document.querySelector('#sgaBirthRozbieznosc .vilda-ur');
  return s && s.getClientRects().length ? s.textContent.replace(/\u00a0/g, ' ') : null;
});

test('docpro: „Dane okołoporodowe" 34+2 tc wypełniają kartę SGA jako 34+2 tc — SDS i B.64 dla 34+2, bez ostrzeżenia', async ({ page }) => {
  await otworzDocproZKontem(page);
  const pid = await zalozPacjenta(page, {
    lastName: 'Testowy', firstName: 'Adam',
    perinatal: { gestationalWeeks: 34, gestationalDays: 2, birthWeightG: 1650, birthLengthCm: 41, birthHeadCircCm: 29 },
  });
  await wczytaj(page, pid);
  await otworzKarteSga(page, '1650');

  await expect.poll(() => wiekWKarcie(page), { timeout: 10000 }).toBe('34+2');
  await page.waitForTimeout(2000); // dwa cykle sprawdzania widocznej karty przez moduł rozbieżności
  expect(await tekstOstrzezenia(page), 'karta i Karta Pacjenta zgodne — bez ostrzeżenia').toBeNull();
  expect(await b64Kryterium1(page)).toBe(
    '1. Masa lub długość urodzeniowa < −2 SD dla wieku ciążowego — SPEŁNIONE | masa −3,13 SD; długość −3,48 SD; 34+2 tc; wg Niklasson / Albertsson-Wikland');
});

test('kontrola: karta z wiekiem ciążowym z sekcji `birth` (34+0) zostaje nietknięta — rozbieżność pokazuje ostrzeżenie', async ({ page }) => {
  await otworzDocproZKontem(page);
  const pid = await zalozPacjenta(page, {
    lastName: 'Probny', firstName: 'Bartosz',
    birth: {
      sourceChoice: 'niklasson', sourceKeys: ['niklasson'], sex: 'male',
      weeks: '34', days: '0', weight: '1650', length: '41', head: '29', hasComputed: false,
    },
    perinatal: { gestationalWeeks: 34, gestationalDays: 2, birthWeightG: 1650, birthLengthCm: 41, birthHeadCircCm: 29 },
  });
  await wczytaj(page, pid);
  await otworzKarteSga(page, '1650');

  await page.waitForTimeout(1500);
  expect(await wiekWKarcie(page), 'wiek ciążowy karty lekarza bez zmian').toBe('34+0');
  await expect.poll(() => tekstOstrzezenia(page), { timeout: 10000 }).toContain('Wiek ciążowy');
  expect(await tekstOstrzezenia(page)).toContain('34+2 tc');
});

test('kontrola: „Dane okołoporodowe" bez dni (39 tc) — karta 39+0', async ({ page }) => {
  await otworzDocproZKontem(page);
  const pid = await zalozPacjenta(page, {
    lastName: 'Kontrolny', firstName: 'Cezary',
    perinatal: { gestationalWeeks: 39, birthWeightG: 3300, birthLengthCm: 53 },
  });
  await wczytaj(page, pid);
  await otworzKarteSga(page, '3300');
  await page.waitForTimeout(1000);
  expect(await wiekWKarcie(page)).toBe('39+0');
});
