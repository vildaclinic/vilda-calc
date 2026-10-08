import { expect, test } from '../support/test-czas.mjs';

// P-ODTWORZ-WIEK (zgłoszenie właściciela 2026-10-08). Pacjent z datą urodzenia zapisany w wieku
// 16 lat 10 mies. i wczytany miesiąc później przez „Odtwórz zapis": formularz główny pokazywał
// „Wiek na dzień dzisiejszej wizyty: 16 lat 11 mies.", pola wieku 16/11, a centyle liczyły stary
// wzrost i masę w dzisiejszym wieku. Karta Pacjenta (Rata B) liczyła poprawnie, w wieku pomiaru.
//
// Zmierzone przed poprawką na tej stronie (zapis 17-06-2026, odtworzenie 10-07-2026): przed zapisem
// „Waga: 26 centyl, Wzrost: 21 centyl", po odtworzeniu „Waga: 25 centyl, Wzrost: 20 centyl"; to samo
// po F5 i na DocPro. Żaden wcześniejszy test tego nie widział — wszystkie zapisują i odtwarzają
// tego samego dnia, więc wiek z zapisu i wiek „na dziś" są równe. Tu zegar strony przesuwamy
// o miesiąc między zapisem a odtworzeniem. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#OdtworzWiek!26';
const ZAPIS = '2026-06-17T13:00:00Z'; // chwila startu z tests/support/czas.mjs
const MIESIAC_POZNIEJ = '2026-07-10T10:00:00Z';

async function otworz(page) {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })); } catch (_) { /* brak storage */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
}

const gotowa = async (page) => {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && !document.documentElement.classList.contains('vilda-auth-locked')
    && typeof window.saveUserData === 'function' && Boolean(window.VildaDobAge));
  await page.waitForTimeout(1500);
};

const wpisz = (page, pola) => page.evaluate((p) => {
  Object.keys(p).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error('brak pola ' + id);
    el.value = p[id];
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  if (typeof window.update === 'function') window.update();
}, pola);

/* Stan formularza i wyniki liczone PRAWDZIWYMI funkcjami strony. */
const stan = (page, { wzrost, masa, plec }) => page.evaluate(({ h, m, s }) => {
  const q = (id) => document.getElementById(id);
  const widoczny = (el) => !!(el && !el.hidden);
  const wiekLat = (parseFloat(q('age').value) || 0) + (parseFloat(q('ageMonths').value) || 0) / 12;
  const wyniki = (q('results') ? q('results').innerText : '').replace(/\s+/g, ' ');
  const centyle = (wyniki.match(/Waga:[\s\S]*?centyl[\s\S]*?Wzrost:[\s\S]*?centyl/) || [''])[0];
  const pct = (st) => (st && typeof st.percentile === 'number' ? Number(st.percentile.toFixed(4)) : null);
  return {
    age: q('age').value,
    ageMonths: q('ageMonths').value,
    tygodnie: widoczny(q('ageWeeksRow')) ? q('ageWeeks').value : null,
    dob: q('dobInput').value,
    notka: widoczny(q('dobNote')) ? q('dobNote').textContent : '',
    dokladny: window.VildaDobAge.readExactAge(),
    centyle,
    wzrostHT: pct(window.calcPercentileStats(h, s, wiekLat, 'HT')),
    masaWT: pct(window.calcPercentileStats(m, s, wiekLat, 'WT')),
    wiekDS: typeof window.__ds_readAgeYears === 'function' ? Number(window.__ds_readAgeYears().toFixed(6)) : null,
  };
}, { h: wzrost, m: masa, s: plec });

async function zapiszPacjenta(page, pola) {
  await wpisz(page, pola);
  await page.waitForTimeout(800);
  expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  let pid = null;
  await expect.poll(async () => {
    pid = await page.evaluate(async () => { const l = await window.VildaVault.listPatients(); return l && l.length === 1 ? l[0].patientId : null; });
    return typeof pid === 'string';
  }, { message: 'sejf ma jednego zapisanego pacjenta' }).toBe(true);
  return pid;
}

/* Jak u lekarza: Karta Pacjenta → „Wczytaj tego pacjenta" → okno „Co chcesz zrobić?". */
async function otworzWybor(page, pid) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (r) => { if (r) window.applyLoadedData(r); }, null), pid);
  const wczytajBtn = page.getByRole('button', { name: 'Wczytaj tego pacjenta' });
  await expect(wczytajBtn).toBeVisible({ timeout: 15000 });
  await wczytajBtn.click();
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
}

async function wczytaj(page, pid, wybor) {
  await otworzWybor(page, pid);
  await page.locator(wybor === 'nowy' ? '#vildaLcmNew' : '#vildaLcmRestore').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await page.waitForTimeout(1500);
}

const NASTOLATEK = { lastName: 'Fikcyjny', firstName: 'Testowy', sex: 'M', dobInput: '20-07-2009', height: '172', weight: '60' };
const POMIAR_NASTOLATKA = { wzrost: 172, masa: 60, plec: 'M' };
const NOTKA_ODTWORZENIA = 'Z kartoteki. Pomiar z 17-06-2026 — wiek w dniu pomiaru: 16 lat 10 mies. (aktualnie pacjent ma 16 lat 11 mies.). '
  + 'Wiek na dziś liczy „Nowy pomiar”. Zmiana daty w Karcie Pacjenta.';

test('„Odtwórz zapis" miesiąc po wizycie: wiek, notka i centyle z dnia pomiaru — także po F5 i na DocPro; „Nowy pomiar" liczy na dziś', async ({ page }) => {
  test.setTimeout(240_000);
  await page.clock.setSystemTime(new Date(ZAPIS));
  await otworz(page);
  const pid = await zapiszPacjenta(page, NASTOLATEK);
  const wizyta = await stan(page, POMIAR_NASTOLATKA);
  expect([wizyta.age, wizyta.ageMonths]).toEqual(['16', '10']);
  expect(wizyta.centyle, 'wyniki centylowe widoczne w formularzu').toMatch(/Waga: \d+ centyl.*Wzrost: \d+ centyl/);

  await page.evaluate(() => window.clearAllData());
  await page.clock.setSystemTime(new Date(MIESIAC_POZNIEJ));
  await wczytaj(page, pid, 'odtworz');

  const odtworzony = await stan(page, POMIAR_NASTOLATKA);
  expect([odtworzony.age, odtworzony.ageMonths], 'dotąd 16/11 — wiek z daty urodzenia na dziś').toEqual(['16', '10']);
  expect(odtworzony.notka).toBe(NOTKA_ODTWORZENIA);
  expect(odtworzony.centyle, 'te same centyle, co w dniu wizyty').toBe(wizyta.centyle);
  expect(odtworzony.wzrostHT, 'calcPercentileStats wzrostu: dokładny wiek z doby pomiaru').toBe(wizyta.wzrostHT);
  expect(odtworzony.masaWT).toBe(wizyta.masaWT);
  expect(odtworzony.dokladny).toEqual(wizyta.dokladny);
  expect(odtworzony.wiekDS, 'karta zespołu Downa czyta ten sam wiek').toBe(wizyta.wiekDS);
  expect(await page.evaluate(() => { const u = window.collectUserData().user; return [u.age, u.ageMonths]; }), 'ponowny zapis niesie wiek pomiaru')
    .toEqual([16, 10]);

  // F5 — sesja i moduł daty odtwarzają się od nowa.
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
  await page.waitForTimeout(1500);
  const poF5 = await stan(page, POMIAR_NASTOLATKA);
  expect([poF5.age, poF5.ageMonths, poF5.notka, poF5.centyle]).toEqual(['16', '10', NOTKA_ODTWORZENIA, wizyta.centyle]);

  // DocPro — ten sam formularz główny, inna strona.
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await gotowa(page);
  await expect.poll(() => page.evaluate(() => [document.getElementById('age').value, document.getElementById('ageMonths').value, document.getElementById('dobNote').textContent]))
    .toEqual(['16', '10', NOTKA_ODTWORZENIA]);

  // KONTROLA: „Nowy pomiar" to dzisiejsza wizyta — wiek z daty urodzenia na dziś.
  await page.goto('/index.html', { waitUntil: 'load' });
  await gotowa(page);
  await page.evaluate(() => window.clearAllData());
  await wczytaj(page, pid, 'nowy');
  const nowy = await page.evaluate(() => [document.getElementById('age').value, document.getElementById('ageMonths').value, document.getElementById('dobNote').textContent]);
  expect(nowy).toEqual(['16', '11', 'Z kartoteki. Wiek na dzień dzisiejszej wizyty: 16 lat 11 mies. Zmiana daty w Karcie Pacjenta.']);
});

test('niemowlę w 29. dobie życia odtworzone po miesiącu: 0 mies., 4 tygodnie i ten sam centyl co w dniu pomiaru (DOB-AGE-4)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.clock.setSystemTime(new Date(ZAPIS));
  await otworz(page);
  // 19-05-2026 → 17-06-2026: 29. doba życia. Przy wierszu ukończonego miesiąca (0) takie dziecko
  // wychodziło wysoko ponad swój centyl — dlatego dokładny wiek musi być z doby POMIARU.
  const pid = await zapiszPacjenta(page, { lastName: 'Fikcyjna', firstName: 'Testowa', sex: 'F', dobInput: '19-05-2026', height: '53.5', weight: '4.2' });
  const pomiar = { wzrost: 53.5, masa: 4.2, plec: 'F' };
  const wizyta = await stan(page, pomiar);
  expect([wizyta.age, wizyta.ageMonths, wizyta.tygodnie]).toEqual(['0', '0', '4']);
  expect(wizyta.dokladny.days).toBe(29);

  await page.evaluate(() => window.clearAllData());
  await page.clock.setSystemTime(new Date('2026-07-20T10:00:00Z')); // dziś 2 mies. z daty urodzenia
  await wczytaj(page, pid, 'odtworz');

  const odtworzony = await stan(page, pomiar);
  expect([odtworzony.age, odtworzony.ageMonths, odtworzony.tygodnie]).toEqual(['0', '0', '4']);
  expect(odtworzony.dokladny, 'doba pomiaru, nie dzisiejsza').toEqual(wizyta.dokladny);
  expect(odtworzony.wzrostHT).toBe(wizyta.wzrostHT);
  expect(odtworzony.masaWT).toBe(wizyta.masaWT);
  expect(odtworzony.centyle).toBe(wizyta.centyle);
  expect(odtworzony.notka).toContain('wiek w dniu pomiaru: 0 lat 0 mies. (aktualnie pacjentka ma 0 lat 2 mies.)');
  expect(await page.evaluate(() => window.collectUserData().user.ageWeeks), 'tygodnie do ponownego zapisu z dnia pomiaru').toBe(4);
});

test('okno wyboru zamknięte Escape, potem sam przycisk „Odtwórz zapisany stan": ten sam wynik co z okna', async ({ page }) => {
  test.setTimeout(180_000);
  await page.clock.setSystemTime(new Date(ZAPIS));
  await otworz(page);
  const pid = await zapiszPacjenta(page, NASTOLATEK);
  const wizyta = await stan(page, POMIAR_NASTOLATKA);

  await page.evaluate(() => window.clearAllData());
  await page.clock.setSystemTime(new Date(MIESIAC_POZNIEJ));
  await otworzWybor(page, pid);
  await page.keyboard.press('Escape');
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await expect(page.locator('#restoreStateBtn')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.locator('#restoreStateBtn').click();
  await expect(page.locator('#restoreStateBtn')).toBeHidden();
  await page.waitForTimeout(1500);

  const odtworzony = await stan(page, POMIAR_NASTOLATKA);
  expect(await page.evaluate(() => window.sessionStorage.getItem('vildaLoadChoiceV1'))).toBe('restore');
  expect([odtworzony.age, odtworzony.ageMonths, odtworzony.notka]).toEqual(['16', '10', NOTKA_ODTWORZENIA]);
  expect(odtworzony.centyle).toBe(wizyta.centyle);
  expect(odtworzony.wzrostHT).toBe(wizyta.wzrostHT);
});

/* Powłoka app.html: DocPro w ramce dostaje stan z panelu Start (vilda:persist-restored). */
async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaVault);
  }, tytul, { timeout: 30000 });
  const uchwyt = await page.$(`iframe.app-pane[title="${tytul}"]`);
  return uchwyt.contentFrame();
}

test('powłoka: „Odtwórz zapis" na Start i przejście na DocPro — DocPro też w wieku pomiaru', async ({ page }) => {
  test.setTimeout(240_000);
  await page.clock.setSystemTime(new Date(ZAPIS));
  await page.addInitScript(() => {
    try { window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })); } catch (_) { /* brak storage */ }
  });
  await page.goto('/app.html', { waitUntil: 'load' });
  let start = await ramka(page, 'Start');
  await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  start = await ramka(page, 'Start');
  await gotowa(start);
  const pid = await zapiszPacjenta(start, NASTOLATEK);
  await start.evaluate(() => window.clearAllData());

  await page.clock.setSystemTime(new Date(MIESIAC_POZNIEJ));
  await wczytaj(start, pid, 'odtworz');
  await expect.poll(() => start.evaluate(() => [document.getElementById('age').value, document.getElementById('ageMonths').value])).toEqual(['16', '10']);

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await ramka(page, 'DocPro');
  await expect.poll(() => docpro.evaluate(() => [
    document.getElementById('dobInput').value, document.getElementById('age').value, document.getElementById('ageMonths').value, document.getElementById('dobNote').textContent,
  ]), { timeout: 15000, message: 'DocPro: data z kartoteki i wiek pomiaru' }).toEqual(['20-07-2009', '16', '10', NOTKA_ODTWORZENIA]);
  // Start nic nie traci po przełączeniu.
  expect(await start.evaluate(() => [document.getElementById('age').value, document.getElementById('ageMonths').value])).toEqual(['16', '10']);
});
