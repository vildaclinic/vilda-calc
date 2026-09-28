import { expect, test } from '../support/test-czas.mjs';

// P-POWLOKA-PANELE (zgłoszenie właściciela 2026-09-28): po wczytaniu pacjenta na Start i przejściu na
// DocPro w powłoce app.html formularz główny DocPro był pusty albo tylko częściowo wypełniony (raz tylko
// data urodzenia, wiek i płeć, raz sześć pól bez daty), więc „Podsumowanie wyników” liczyło się z niepełnych
// danych; „często” pojawiała się też karta „Porównanie z poprzednim pomiarem”.
//
// Zmierzone przed poprawką (haki na prawdziwej powłoce): panel Start zapisywał sesję główną dopiero ~3,9 s po
// „Odtwórz zapis” (pierwszy zapis robiło lustro formularza timerem 3200 ms), a przełączenie paneli nie
// wywołuje pagehide. Panel DocPro utworzony 2,5 s po odtworzeniu zostawał PUSTY przez całe 7 s obserwacji;
// utworzony 8 s później wypełniał się w całości. Panel otwarty wcześniej dostawał tylko lustro formularza
// (nazwisko, wiek, masa, wzrost, płeć) — bez daty urodzenia i bez lastLoadedData.
//
// Po poprawce: sesja główna jest zapisywana z force na końcu applyLoadedData / restoreLoadedState, powłoka
// przed przełączeniem wymusza zapis panelu źródłowego, a panel docelowy (o ile sesja zmieniła się od jego
// ostatniego odtworzenia) odtwarza wspólny stan i sesję główną ponownie. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#PowlokaPanele!26';
const PUNKT_GH = { id: 'gh-e2e-panele', ageYears: 13, ageMonths: 1, height: 139.9, weight: 45, type: 'gh' };

// Zegar e2e jest zamrożony przez test-czas, więc datę urodzenia (14 lat i 1 mies. przed „dziś" strony)
// liczymy w przeglądarce, a nie w Node.
const dataUr = (fr) => fr.evaluate(() => {
  const d = new Date();
  const u = new Date(d.getFullYear() - 14, d.getMonth() - 1, 5);
  const z = (n) => String(n).padStart(2, '0');
  return `${z(u.getDate())}-${z(u.getMonth() + 1)}-${u.getFullYear()}`;
});

async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaVault);
  }, tytul, { timeout: 30000 });
  const uchwyt = await page.$(`iframe.app-pane[title="${tytul}"]`);
  return uchwyt.contentFrame();
}

const gotowa = (fr) => fr.waitForFunction(() => window.VildaVault.isUnlocked()
  && typeof window.saveUserData === 'function' && Boolean(window.VildaDobAge) && typeof window.applyLoadedData === 'function'
  && !document.documentElement.classList.contains('vilda-auth-locked'));

const stan = (fr) => fr.evaluate(() => {
  const g = (id) => { const e = document.getElementById(id); return e ? String(e.value) : null; };
  const sc = document.getElementById('currentSummaryContent');
  const txt = sc ? (sc.textContent || '').replace(/\s+/g, ' ').trim() : '';
  const pc = document.getElementById('prevSummaryCard'); const pw = document.getElementById('prevSummaryWrap');
  const vis = (el) => !!el && getComputedStyle(el).display !== 'none';
  return {
    dob: g('dobInput'), age: g('age'), ageM: g('ageMonths'), sex: g('sex'), h: g('height'), w: g('weight'), name: g('name'),
    podsumowanieBMI: /BMI/.test(txt), baza: Boolean(window.lastLoadedData), porownanie: vis(pc) || vis(pw),
  };
});

const wpisz = (fr, pola) => fr.evaluate((p) => {
  Object.keys(p).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error('brak pola ' + id);
    el.value = p[id];
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}, pola);

async function otworzPowloke(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/app.html', { waitUntil: 'load' });
  let start = await ramka(page, 'Start');
  await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  start = await ramka(page, 'Start');
  await gotowa(start);
  await page.waitForTimeout(1500);
  return start;
}

// Dziewczynka 14 lat z datą urodzenia, dwie wizyty (149,2 cm / 51,4 kg ostatnia), wiersz ręczny i punkt GH.
async function pacjentkaWSejfie(page, start) {
  await wpisz(start, { lastName: 'Probna', firstName: 'Alicja', dobInput: await dataUr(start), sex: 'F', height: '148.5', weight: '50.5' });
  await start.waitForSelector('#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]', { state: 'attached' });
  await start.evaluate(() => {
    const t = document.getElementById('toggleAdvancedGrowth');
    const f = document.getElementById('advancedGrowthForm');
    if (f && getComputedStyle(f).display !== 'none') return;
    if (t) { t.disabled = false; t.click(); }
  });
  await start.waitForSelector('#advMeasurements .measure-row', { state: 'attached', timeout: 10000 });
  await start.evaluate(() => {
    const w = document.querySelector('#advMeasurements .measure-row');
    const set = (sel, v) => { const e = w.querySelector(sel); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('.adv-age-years', '11'); set('.adv-age-months', '0'); set('.adv-height', '123.9'); set('.adv-weight', '35');
  });
  await start.evaluate((p) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', [p], { force: true });
    window.ghTherapyPoints = [p];
  }, PUNKT_GH);
  await start.evaluate(() => window.importTherapyPointsToAdvancedGrowth());
  await page.waitForTimeout(1200);
  expect(await start.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await expect.poll(() => start.evaluate(async () => (await window.VildaVault.listPatients()).length)).toBe(1);
  await page.waitForTimeout(1000);
  await wpisz(start, { height: '149.2', weight: '51.4' });
  await page.waitForTimeout(600);
  expect(await start.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await page.waitForTimeout(1200);
  await start.evaluate(() => window.clearAllData());
  await page.waitForTimeout(800);
  return (await start.evaluate(async () => (await window.VildaVault.listPatients()).map((p) => p.patientId)))[0];
}

// Wczytanie z Karty pacjenta jak u lekarza: „Wczytaj tego pacjenta” → wybór w modalu.
async function wczytajZKarty(page, start, pid, wybor) {
  await start.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (r) => { if (r) window.applyLoadedData(r); }, null), pid);
  await start.waitForSelector('.vhv-tile', { state: 'visible' });
  await start.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await start.waitForSelector('#vildaLoadChoiceModal', { state: 'visible', timeout: 8000 });
  await start.click(wybor === 'nowy' ? '#vildaLcmNew' : '#vildaLcmRestore');
  await start.waitForSelector('#vildaLoadChoiceModal', { state: 'detached', timeout: 8000 }).catch(() => {});
}

// Oczekiwany stan DocPro = stan Start po wczytaniu (data, wiek z daty, płeć, ostatnia wizyta, nazwisko).
const pelny = async (start) => { const s = await stan(start); return { dob: s.dob, age: s.age, ageM: s.ageM, sex: 'F', h: '149.2', w: '51.4', name: 'Probna Alicja' }; };

test('„Odtwórz zapis” i natychmiastowe przejście na DocPro (panel tworzony dopiero teraz): formularz i podsumowanie w komplecie', async ({ page }) => {
  test.setTimeout(180_000);
  const start = await otworzPowloke(page);
  const pid = await pacjentkaWSejfie(page, start);
  await wczytajZKarty(page, start, pid, 'odtworz');
  await expect.poll(() => stan(start).then((s) => s.h)).toBe('149.2');
  const PELNY = await pelny(start);
  expect(PELNY.dob, 'Start ma datę z kartoteki').toMatch(/^\d{2}-\d{2}-\d{4}$/);

  // Zgłoszony przebieg: lekarz przechodzi na DocPro od razu. Przed poprawką panel zostawał pusty.
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await ramka(page, 'DocPro');
  await expect.poll(() => stan(docpro), { timeout: 8000, message: 'DocPro: pełny formularz i podsumowanie' })
    .toMatchObject({ dob: PELNY.dob, age: PELNY.age, ageM: PELNY.ageM, sex: 'F', h: PELNY.h, w: PELNY.w, name: PELNY.name, podsumowanieBMI: true, baza: true, porownanie: false });
  // Start nic nie traci
  expect(await stan(start)).toMatchObject({ dob: PELNY.dob, h: PELNY.h, w: PELNY.w, name: PELNY.name, porownanie: false });
});

test('DocPro otwarty wcześniej: po „Odtwórz zapis” na Start i szybkim przełączeniu dostaje datę urodzenia i lastLoadedData, nie tylko lustro', async ({ page }) => {
  test.setTimeout(180_000);
  const start = await otworzPowloke(page);
  const pid = await pacjentkaWSejfie(page, start);

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await ramka(page, 'DocPro');
  await gotowa(docpro);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.VildaShell.navigate('start'));
  await page.waitForTimeout(500);
  expect((await stan(docpro)).dob, 'przed wczytaniem DocPro jest pusty').toBe('');

  await wczytajZKarty(page, start, pid, 'odtworz');
  await expect.poll(() => stan(start).then((s) => s.h)).toBe('149.2');
  const PELNY = await pelny(start);
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  await expect.poll(() => stan(docpro), { timeout: 8000, message: 'DocPro w tle: komplet, z datą i bazą' })
    .toMatchObject({ dob: PELNY.dob, age: PELNY.age, ageM: PELNY.ageM, sex: 'F', h: PELNY.h, w: PELNY.w, name: PELNY.name, podsumowanieBMI: true, baza: true });
});

// Przebieg z czerwonego CI (E2E odłamek 2/3): DocPro otwarty wcześniej, a przełączenie dopiero po chwili — gdy
// lustro formularza i pingi wspólnego stanu już przeszły. Panel miał komplet pól, ale „Podsumowanie wyników” bez BMI:
// karta była renderowana przed przeliczeniem głównego formularza (requestAnimationFrame, w ukrytym panelu może czekać
// na widoczność) i nic jej potem nie odświeżało. Po poprawce panel docelowy odświeża kartę po przełączeniu.
test('DocPro otwarty wcześniej, przełączenie po chwili (po rozgłoszeniu lustra): podsumowanie z BMI, nie tylko komplet pól', async ({ page }) => {
  test.setTimeout(180_000);
  const start = await otworzPowloke(page);
  const pid = await pacjentkaWSejfie(page, start);

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await ramka(page, 'DocPro');
  await gotowa(docpro);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.VildaShell.navigate('start'));
  await page.waitForTimeout(500);

  await wczytajZKarty(page, start, pid, 'odtworz');
  await expect.poll(() => stan(start).then((s) => s.h)).toBe('149.2');
  const PELNY = await pelny(start);
  await page.waitForTimeout(3500); // lustro formularza (180/1000/2600 ms) i pingi wspólnego stanu już przeszły
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  await expect.poll(() => stan(docpro), { timeout: 8000, message: 'DocPro po zwłoce: komplet pól i podsumowanie z BMI' })
    .toMatchObject({ dob: PELNY.dob, age: PELNY.age, ageM: PELNY.ageM, sex: 'F', h: PELNY.h, w: PELNY.w, name: PELNY.name, podsumowanieBMI: true, baza: true, porownanie: false });
});

test('„Nowy pomiar” i przejście na DocPro: ten sam stan co na Start — dane pacjentki bez masy i wzrostu, karta porównania na obu panelach', async ({ page }) => {
  test.setTimeout(180_000);
  const start = await otworzPowloke(page);
  const pid = await pacjentkaWSejfie(page, start);
  await wczytajZKarty(page, start, pid, 'nowy');
  await expect.poll(() => stan(start).then((s) => s.dob)).toMatch(/^\d{2}-\d{2}-\d{4}$/);
  const naStart = await stan(start);
  expect(naStart, 'Start po „Nowy pomiar": tożsamość i data, pola nowej wizyty puste, porównanie z poprzednią wizytą widoczne')
    .toMatchObject({ sex: 'F', h: '', w: '', name: 'Probna Alicja', porownanie: true });
  expect(naStart.age, 'wiek z daty urodzenia').toMatch(/^\d+$/);

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await ramka(page, 'DocPro');
  await expect.poll(() => stan(docpro), { timeout: 8000, message: 'DocPro pokazuje to samo co Start' })
    .toMatchObject({ dob: naStart.dob, age: naStart.age, ageM: naStart.ageM, sex: 'F', h: '', w: '', name: 'Probna Alicja', baza: true, porownanie: true });
});
