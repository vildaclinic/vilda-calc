import { expect, test } from '../support/test-czas.mjs';

// P-PRZEJECIE-MODULY (zlecenie właściciela 2026-10-06): moduły paneli powłoki nadążają za pacjentem przejętym z sesji
// karty.
//
// Panel powłoki app.html przejmuje pacjenta wczytanego w innej ramce w vildaPersistRestoreAll (P-POWLOKA-ID): bierze go
// z sesji karty, odtwarza formularz i kończy zdarzeniem `vilda:persist-restored`. `vilda:patient-loaded` dostaje tylko
// ramka, która pacjenta wczytała. Zmierzone na `audyt` `8aa4150` w prawdziwej powłoce (dane fikcyjne):
// - Klirens: formularz pokazuje C, a cel zapisu wyników „do karty” to dalej A;
// - DocPro, monitory otyłości i bisfosfonianów: wczytanie C na Start (punkty C = []) uruchamiało w DocPro zapasowy
//   odczyt punktów pacjenta A i zapis ich do wspólnego stanu C; DocPro pokazywał punkty A przy C;
// - DocPro, terapia otyłości: podpowiedź „Z notatek pacjenta: Wegovy” (lek A) zostawała przy C z przyciskiem „Ustaw”;
// - Start, generator epikryzy: krok „Dane urodzeniowe” wypełniony danymi A po przejęciu C — i po „Wyczyść” (czyszczenie
//   leci na window, moduł słuchał tylko na document);
// - Start, pytanie o podział imienia i nazwiska rekordu A zostawało otwarte przy formularzu C;
// - DocPro, wskaźnik zapisu: nazwa i numer zapisu A przy C.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie fikcyjne.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#PrzejecieModuly!26';

async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaVault);
  }, tytul, { timeout: 30000 });
  return (await page.$(`iframe.app-pane[title="${tytul}"]`)).contentFrame();
}

async function powlokaZKontem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch { /* brak storage — pomiń */ }
  });
  await page.goto('/app.html', { waitUntil: 'load' });
  let start = await ramka(page, 'Start');
  await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  start = await ramka(page, 'Start');
  await start.waitForFunction(() => window.VildaVault.isUnlocked() && typeof window.applyLoadedData === 'function');
  await page.waitForTimeout(2000);
  return start;
}

const zaloz = (ctx, payload) => ctx.evaluate(async (p) => (await window.VildaVault.savePatient(p, { dedup: false })).patientId, payload);

/* Wczytanie tak, jak robi to lista pacjentów (ścieżka source:"pick" z vilda_auth_ui.js). */
async function wczytaj(ctx, pid) {
  await ctx.evaluate(async (id) => {
    const p = await window.VildaVault.getPatient(id);
    const snap = p.snapshots[0];
    window.applyLoadedData(snap.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: id, savedAtISO: snap.savedAtISO || null, snapshotCount: p.snapshotCount || 1, name: snap.payload.name, source: 'pick' },
    }));
  }, pid);
  await ctx.waitForTimeout(1800); // kaskada zerowania pól i modal „Co chcesz zrobić?"
  if (await ctx.evaluate(() => Boolean(document.getElementById('vildaLcmNew')))) {
    await ctx.evaluate(() => document.getElementById('vildaLcmNew').click());
    await ctx.waitForTimeout(400);
  }
}

async function panel(page, trasa, tytul) {
  await page.evaluate((t) => window.VildaShell.navigate(t), trasa);
  const r = await ramka(page, tytul);
  await r.waitForFunction(() => window.VildaVault.isUnlocked() && typeof window.applyLoadedData === 'function');
  await page.waitForTimeout(2000);
  return r;
}

const user = (ln, fn, extra = {}) => ({ lastName: ln, firstName: fn, sex: 'M', age: 12, ageMonths: 0, height: 150, weight: 60, ...extra });
const C = { name: 'Probny Cezary', user: user('Probny', 'Cezary') };

/* Generator epikryzy: krok „Dane urodzeniowe” (przyciski „Dalej →” klikane w DOM — baner zgód zasłania dół ekranu). */
async function epikryzaUrodzenie(ctx) {
  await ctx.evaluate(() => window.VildaEpicrisisUI.show());
  const tyg = ctx.locator('#epi-gest-weeks');
  for (let i = 0; i < 6 && !(await tyg.isVisible()); i += 1) {
    await ctx.evaluate(() => [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Dalej →' && b.getClientRects().length).click());
  }
  const wynik = await ctx.evaluate(() => ['epi-gest-weeks', 'epi-gest-days', 'epi-birth-weight']
    .map((id) => document.getElementById(id).value).join('|'));
  await ctx.evaluate(() => window.VildaEpicrisisUI.close());
  return wynik;
}

test('Klirens: cel zapisu wyników „do karty” to pacjent przejęty z sesji karty, nie poprzedni', async ({ page }) => {
  test.setTimeout(200_000);
  const start = await powlokaZKontem(page);
  const idA = await zaloz(start, { name: 'Testowy Adam', user: user('Testowy', 'Adam') });
  const idC = await zaloz(start, C);
  const k = await panel(page, 'klirens', 'Kalkulator klirensu');
  await wczytaj(k, idA);
  const cel = () => k.evaluate(() => window.ClcrVisitSave.resolveCurrentPatientId());
  expect(await cel(), 'kontrola: Klirens z A zapisuje do A').toBe(idA);

  await panel(page, 'start', 'Start');
  await wczytaj(await ramka(page, 'Start'), idC);
  await panel(page, 'klirens', 'Kalkulator klirensu');
  await expect(k.locator('#patientName')).toHaveText('Probny Cezary', { timeout: 15000 });
  await expect.poll(cel, { timeout: 10000, message: 'formularz C — cel zapisu C' }).toBe(idC);
});

test('DocPro: monitory otyłości i bisfosfonianów nie przenoszą punktów A do C; podpowiedź leku A znika', async ({ page }) => {
  test.setTimeout(200_000);
  const start = await powlokaZKontem(page);
  const punkt = (type, dateISO, weight) => ({
    type, ageYears: 12, ageMonths: 0, weight, height: 150, bmi: +(weight / 2.25).toFixed(1), dose: '2,4 mg / tydz.', dateISO,
    drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'semaglutide',
  });
  const idA = await zaloz(start, {
    name: 'Testowy Adam', user: user('Testowy', 'Adam'),
    obesityTherapyPoints: [punkt('start', '2026-01-10', 70), punkt('continue', '2026-04-10', 66)],
    bisphosTherapyPoints: [{ type: 'start', dateISO: '2026-02-01', ageYears: 12, ageMonths: 0, weight: 60, drug: 'Pamidronian', dose: '1 mg/kg' }],
  });
  const idC = await zaloz(start, C);
  await start.evaluate(async (id) => window.VildaVault.savePatientNote({
    patientId: id, title: 'Wegovy', body: 'Włączenie.', category: 'treatment', medication: { name: 'Wegovy', action: 'start', dose: '0,25 mg' },
  }), idA);

  const d = await panel(page, 'docpro', 'DocPro');
  await wczytaj(d, idA);
  const docpro = () => d.evaluate(() => {
    const p = document.getElementById('obesityMonDrugSuggest');
    return {
      otylosc: (window.obesityTherapyPoints || []).length,
      bisfosfoniany: (window.bisphosTherapyPoints || []).length,
      podpowiedz: p && p.style.display !== 'none' ? p.textContent.replace(/\s+/g, ' ').slice(0, 40) : null,
    };
  });
  await expect.poll(docpro, { timeout: 10000, message: 'kontrola: DocPro z A' })
    .toEqual({ otylosc: 2, bisfosfoniany: 1, podpowiedz: 'Z notatek pacjenta: Wegovy (ostatnia daw' });

  await panel(page, 'start', 'Start');
  const s = await ramka(page, 'Start');
  await wczytaj(s, idC);
  await page.waitForTimeout(2500); // dłużej niż opóźniony zapasowy odczyt z sejfu w ramce DocPro
  // Wspólny stan karty przeglądarki (moduły zapisują punkty przez adapter VildaPersistence).
  expect(await s.evaluate(() => ['OBESITY_THERAPY_POINTS', 'BISPHOS_THERAPY_POINTS'].map((k) => {
    const v = window.sessionStorage.getItem(k) ?? window.localStorage.getItem(k);
    return v ? JSON.parse(v).length : 0;
  })), 'wspólny stan C bez punktów A').toEqual([0, 0]);

  await panel(page, 'docpro', 'DocPro');
  await expect(d.locator('#lastName')).toHaveValue('Probny', { timeout: 15000 });
  await page.waitForTimeout(1500);
  expect(await docpro(), 'DocPro z C: bez punktów i bez podpowiedzi leku A').toEqual({ otylosc: 0, bisfosfoniany: 0, podpowiedz: null });
});

test('Start: epikryza i pytanie o podział nazwiska należą do pacjenta przejętego z DocPro; „Wyczyść” zdejmuje dane epikryzy', async ({ page }) => {
  test.setTimeout(200_000);
  const start = await powlokaZKontem(page);
  // Rekord jednopolowy („Imię Nazwisko”, bez user.firstName/lastName) — vilda_name_fix pyta o podział.
  const idA = await zaloz(start, {
    name: 'Adam Testowy', user: { sex: 'M', age: 12, ageMonths: 0, height: 150, weight: 60 },
    perinatal: { gestationalWeeks: 34, gestationalDays: 2, birthWeightG: 1650, birthLengthCm: 41 },
  });
  const idC = await zaloz(start, C);
  await wczytaj(start, idA);
  const pytanie = (ctx) => ctx.evaluate(() => { const f = document.querySelector('.vnf-fix'); return Boolean(f && !f.hidden && f.getClientRects().length); });
  expect(await pytanie(start), 'kontrola: pytanie o podział nazwiska A').toBe(true);
  expect(await epikryzaUrodzenie(start), 'kontrola: epikryza A').toBe('34|2|1650');

  await wczytaj(await panel(page, 'docpro', 'DocPro'), idC);
  await panel(page, 'start', 'Start');
  const s = await ramka(page, 'Start');
  await expect(s.locator('#lastName')).toHaveValue('Probny', { timeout: 15000 });
  await expect.poll(() => pytanie(s), { timeout: 10000, message: 'pytanie A nie zostaje przy C' }).toBe(false);
  expect(await epikryzaUrodzenie(s), 'epikryza C bez danych urodzeniowych A').toBe('||');

  // „Wyczyść” na tej samej stronie, po ponownym wczytaniu A.
  await wczytaj(s, idA);
  expect(await epikryzaUrodzenie(s), 'kontrola: znów A').toBe('34|2|1650');
  await s.evaluate(() => document.getElementById('clearAllDataBtn').click());
  await expect.poll(() => s.evaluate(() => [document.getElementById('lastName').value, window.sessionStorage.getItem('vildaCurrentPatientId')]),
    { timeout: 10000 }).toEqual(['', null]);
  expect(await epikryzaUrodzenie(s), 'po „Wyczyść” bez danych urodzeniowych A').toBe('||');
});

test('DocPro: wskaźnik zapisu po powrocie „Wstecz” pokazuje pacjenta C, nie A', async ({ page }) => {
  test.setTimeout(200_000);
  const start = await powlokaZKontem(page);
  const idA = await zaloz(start, { name: 'Testowy Adam', user: user('Testowy', 'Adam') });
  const idC = await zaloz(start, C);
  const d = await panel(page, 'docpro', 'DocPro');
  await wczytaj(d, idA);
  const nazwa = () => d.evaluate(() => window.VildaSaveStatusIndicator.getLastPatientName());
  expect(await nazwa(), 'kontrola: wskaźnik z A').toBe('Testowy Adam');

  await panel(page, 'start', 'Start');
  await wczytaj(await ramka(page, 'Start'), idC);
  await page.evaluate(() => window.history.back());
  await expect(d.locator('#lastName')).toHaveValue('Probny', { timeout: 15000 });
  await expect.poll(nazwa, { timeout: 10000 }).toBe('Probny Cezary');
});
