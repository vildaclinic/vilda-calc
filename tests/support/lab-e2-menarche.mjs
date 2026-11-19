import { expect } from '@playwright/test';
import { bezBaneraZgody, otworzSejf } from './lab-historia-dane.mjs';

/**
 * P-E2-MENARCHE: przelicznik jednostek z odblokowanym FIKCYJNYM sejfem i fikcyjnymi pacjentkami wczytanymi tak,
 * jak robi to formularz (identyfikator w sesji karty, dane wspólne, sesja formularza głównego, zdarzenie wczytania).
 * Wiek menarche jest w PRAWDZIWYM kształcie danych: `payload.puberty.menarcheAgeYears` — w rekordzie sejfu i w sesji
 * formularza głównego (nie pod `user`). Zegar stron w testach to 17.06.2026 (tests/support/czas.mjs).
 */
export const DZIS = '2026-06-17';

export const R1 = 'Od menarche: 5,0 lat (≥ 5) — zakresy estradiolu jak u dorosłej.';
export const R1_ZMIEN = R1 + ' Jeśli faza cyklu jest znana, wybierz ją w „Zmień ▼".';
export const NAGLOWEK_NIELETNIA = 'Zakres estradiolu zależy od fazy cyklu. Poniżej dostępne warianty odniesienia.';
export const NAGLOWEK_DOROSLA = 'Zakres estradiolu zależy od fazy cyklu lub menopauzy. Poniżej dostępne warianty odniesienia.';
export const WSKAZOWKA_DOROSLA = 'Jeśli faza cyklu lub menopauza jest znana, wybierz ją w „Zmień ▼".';
export const R2_BRAK = 'Fazy cyklu działają poniżej 18 lat dopiero po 5 latach od menarche. Wpisz „Wiek menarche” tutaj (tylko dla tego sprawdzenia) albo na stałe w „+ Dane pokwitaniowe” na stronie głównej.';
export const r2Ponizej = (lata) => `Fazy cyklu nie zmieniają zakresu estradiolu: od menarche minęło mniej niż 5 lat (${lata}).`;
export const WPIS_ODRZUCONY = 'Wpisany wiek menarche nie jest brany pod uwagę: podaj wartość od 2 do 20 lat, nie większą niż wiek pacjentki.';
export const BRAK_DLA_KONTEKSTU = 'Brak zakresu estradiolu dla wskazanego kontekstu cyklu lub ciąży. Przeliczenie jednostek pozostaje dostępne.';
export const WARIANTY_NIELETNIA = [['Faza folikularna wczesna', '70–290 pmol/L'], ['Pik owulacyjny', '380–1460 pmol/L'], ['Faza lutealna', '200–770 pmol/L']];
export const WARIANTY_DOROSLA = [...WARIANTY_NIELETNIA, ['Po menopauzie', '0–110 pmol/L']];
// Opcje selektora „Faza cyklu / ciąża” w kolejności ze strony; pierwsza („nieznana”/„domyślnie”) zależy od badania.
export const FAZY = ['Faza folikularna', 'Pik owulacyjny', 'Faza lutealna'];
export const CIAZA = ['Ciąża — I trymestr', 'Ciąża — II trymestr', 'Ciąża — III trymestr'];

export async function otworzPrzelicznik(page) {
  await bezBaneraZgody(page);
  return otworzSejf(page, '/przelicznik-jednostek.html');
}

/**
 * Zapisuje fikcyjną osobę w sejfie i wczytuje ją do przelicznika.
 * dane: { imie, lata, miesiace = 0, th = null (stadium Th z tej wizyty), menarche = null (lata), plec = 'F' }.
 * sesja: false — bez sesji formularza głównego dla tej osoby: dane pokwitaniowe idą wtedy z rekordu sejfu.
 */
export async function wczytajOsobe(page, dane, { sesja = true } = {}) {
  const patientId = await page.evaluate(async ({ dane, dzis, sesja }) => {
    const miesiace = dane.miesiace || 0, plec = dane.plec || 'F';
    const urodzenie = new Date(Date.UTC(2026, 5 - miesiace, 17));
    urodzenie.setUTCFullYear(urodzenie.getUTCFullYear() - dane.lata);
    const user = { name: `Fikcyjna ${dane.imie}`, firstName: dane.imie, lastName: 'Fikcyjna', sex: plec, age: dane.lata, ageMonths: miesiace,
      dobISO: urodzenie.toISOString().slice(0, 10), measuredAtISO: dzis, height: 160, weight: 52 };
    const puberty = dane.menarche == null ? null : { menarcheAgeYears: dane.menarche };
    const payload = { version: 1, name: user.name, user };
    if (puberty) payload.puberty = puberty;
    const pid = (await window.VildaVault.savePatient(payload, { dedup: false })).patientId;
    window._vildaCurrentPatientId = pid;
    sessionStorage.setItem('vildaCurrentPatientId', pid);
    window.VildaPersistence.writeShared(user, { force: true });
    const sessionUser = { ...user };
    if (sesja && dane.th != null) {
      sessionUser.pubertyAssessment = { version: 1, sex: plec, observations: { G: null, P: null,
        Th: { stage: dane.th, sex: plec, observedAtISO: dzis, ageMonths: dane.lata * 12 + miesiace, source: 'clinician-entry' } } };
      sessionUser.pubertyAssessmentVisit = { version: 1, visitId: 'e2e-wizyta-e2', ownerPatientId: pid, currentAxes: ['Th'],
        reference: { sex: plec, ageMonths: dane.lata * 12 + miesiace, measuredAtISO: dzis } };
    }
    const session = { version: 1, user: sessionUser };
    if (sesja && puberty) session.puberty = puberty;
    window.VildaPersistence.writeMainSession(session);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: pid } }));
    return pid;
  }, { dane, dzis: DZIS, sesja });
  // Rekord pacjenta czyta się z sejfu asynchronicznie; strona liczy na nim dopiero, gdy jest gotowy.
  await expect.poll(() => page.evaluate((pid) => window.VildaPubertySource.kontekstPacjenta(pid).status, patientId)).toBe('ready');
  return patientId;
}

/**
 * Przelicznik bez sejfu („Korzystaj bez logowania”): dane pacjenta są wyłącznie w danych wspólnych karty, a ta sama
 * osoba (bez identyfikatora) może je zmienić — np. płeć albo wiek poprawione w formularzu głównym.
 */
export async function otworzGoscia(page) {
  await bezBaneraZgody(page);
  await page.route('**/*', (route) => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (const klucz of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${klucz}-v1`, `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaPersistence && window.LabUnitConverter && window.VildaHormoneLifespanRuntime);
}

/** Dane wspólne karty w trybie bez sejfu: { plec = 'F', lata, miesiace = 0, menarche = null }. */
export async function daneGoscia(page, dane) {
  await page.evaluate((dane) => {
    const user = { name: 'Fikcyjna Gościnna', sex: dane.plec || 'F', age: dane.lata, ageMonths: dane.miesiace || 0 };
    if (dane.menarche != null) user.puberty = { menarcheAgeYears: dane.menarche };
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Nie zapisano fikcyjnych danych wspólnych');
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, dane);
}

/** Tekst karty „Hormony w ciągu życia” (to, co widać), albo null, gdy karta jest schowana. */
export const wykresHormonow = (page) => page.evaluate(() => {
  const karta = document.getElementById('labHormoneLifespan');
  if (!karta || !karta.getClientRects().length) return null;
  return karta.innerText.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
});

export async function wybierzBadanie(page, id, szukaj, wartosc = null) {
  await page.locator('#labSubstance').fill(szukaj);
  await page.locator(`#labSubstanceDropdown .lab-substance-option[data-id="${id}"]`).click();
  if (id === 'estradiol') {
    await page.locator('#labUnit').selectOption('pmol/L');
    await page.locator('#labUnitTarget').selectOption('pmol/L');
  }
  if (wartosc != null) await page.locator('#labValue').fill(String(wartosc));
}
export const wybierzEstradiol = (page, wartosc) => wybierzBadanie(page, 'estradiol', 'Estradiol', wartosc);

export async function otworzPanel(page) {
  if (await page.locator('#labPatientOverride').isHidden()) await page.locator('#labPatientToggle').click();
  await expect(page.locator('#labPatientOverride')).toBeVisible();
}

const czysty = (tekst) => String(tekst || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

/** Stan kroku „Pacjent” i wyniku — to, co widzi lekarz (twarde spacje jako zwykłe). */
export async function stan(page) {
  const surowy = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const widac = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
    const select = q('#labOverrideCycle'), pole = q('#labOverrideMenarcheAge');
    return {
      opis: q('#labPatientText').textContent,
      wiersz: widac(q('#labClinicalHint')) ? q('#labClinicalHint').textContent : null,
      selektor: widac(q('#labOverrideCycleWrap')),
      opcje: [...select.options].map((o) => o.textContent + (o.disabled ? ' [wyłączona]' : '')),
      faza: select.value,
      pole: widac(q('#labOverrideMenarcheWrap')),
      etykieta: q('#labOverrideMenarcheWrap').firstChild.textContent,
      placeholder: pole.placeholder, wpis: pole.value, bledny: pole.getAttribute('aria-invalid') === 'true',
      nota: widac(q('#labOverrideMenarcheNote')) ? q('#labOverrideMenarcheNote').textContent : null,
      reset: widac(q('#labOverrideReset')),
      status: q('#labResultStatus').innerText,
      naglowek: q('#labRangeBlock .vilda-lab-variants-lead') ? q('#labRangeBlock .vilda-lab-variants-lead').textContent : null,
      warianty: [...document.querySelectorAll('#labRangeBlock .vilda-lab-reference-variant')].map((w) => [w.children[0].textContent, w.children[1].textContent]),
      brakZakresu: q('#labRangeBlock .lab-range-empty') ? q('#labRangeBlock .lab-range-empty').textContent : null,
      zakres: q('#labResultSourceLine').innerText,
      wynik: q('#labResultBig .lab-result-big-value') ? q('#labResultBig .lab-result-big-value').textContent : null,
    };
  });
  const out = {};
  for (const [klucz, wartosc] of Object.entries(surowy)) {
    out[klucz] = typeof wartosc === 'string' ? czysty(wartosc)
      : Array.isArray(wartosc) ? wartosc.map((w) => Array.isArray(w) ? w.map(czysty) : czysty(w)) : wartosc;
  }
  return out;
}

export const bezPoziomegoPrzewijania = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

/** Wszystko, co trwałe dla bieżącej osoby: rekord sejfu, dane wspólne, sesja formularza, magazyny przeglądarki. */
export const zapisaneDane = (page, patientId) => page.evaluate(async (pid) => {
  const record = await window.VildaVault.getPatient(pid);
  const magazyn = (store) => Object.fromEntries([...Array(store.length).keys()].map((i) => store.key(i)).sort()
    // Znaczniki czasu i liczniki sesji zmieniają się same; treść pacjenta jest w pozostałych kluczach.
    .filter((key) => !/heartbeat|activity|lastSeen|timestamp|idle|touch|reminders/i.test(key))
    .map((key) => [key, store.getItem(key)]));
  return JSON.stringify({
    wersje: (record.snapshots || []).map((s) => s.payload),
    notatki: (await window.VildaVault.listPatientNotesForPatient(pid)).length,
    wspolne: window.VildaPersistence.readShared(),
    sesja: window.VildaPersistence.readMainSession(),
    sessionStorage: magazyn(sessionStorage),
    localStorage: magazyn(localStorage),
  });
}, patientId);
