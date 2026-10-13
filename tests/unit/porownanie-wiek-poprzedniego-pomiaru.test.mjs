import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { appSrc, funkcjaZ, tablica, zrodlo } from '../support/silnik-bmi.mjs';

// P-POROWNANIE-WIEK (polecenie właściciela 2026-10-13) — centyle kolumny „Poprzednio” karty porównania liczone na
// wieku z doby TAMTEGO pomiaru.
//
// ZNALEZISKO. Centyl wzrostu (silnik vilda_sds_wzrostu.js) i masy poniżej 36 mies. (getChildLMS) uściśla wiek przez
// lmsNiemowleWiek() w app.js, a ten brał dokładny wiek z daty urodzenia w FORMULARZU, na dziś. Strażnik sprawdzał
// tylko pełne miesiące, więc pomiar sprzed kilku tygodni w tym samym miesiącu życia dostawał dzisiejszy wiek —
// znane ograniczenie z wpisu P-ODTWORZ-WIEK. Ta sama karta pokazywała przy tym inny centyl zależnie od tego, czy
// formularz miał już datę urodzenia (wyścig przy wczytaniu pacjenta, P-POROWNANIE-W-TLE).
//
// REGUŁA. Ta sama, co dla odtworzonej wizyty (P-ODTWORZ-WIEK, Rata B P3): wzrost i masę znamy wyłącznie z chwili
// pomiaru, więc liczymy je w wieku z tamtej chwili. Dokładny wiek: z daty urodzenia zapisanej w rekordzie, na dobę
// pomiaru (VildaDobAge.ageAtMeasurement), tylko gdy doba daje dokładnie wiek zapisany w rekordzie. Inaczej wiersz
// pełnego miesiąca, jak masa powyżej 36 mies. i BMI. Nigdy z formularza.
//
// Testy wołają PRAWDZIWE: Se()/Y() z vilda_summary_cards.js (przez __renderPrevSummary), funkcje wycięte z app.js,
// silnik SDS wzrostu z tablicami app.js i vilda_dob_age.js — w kontekście node:vm, gdzie gołe nazwy (calcPercentileStats,
// bmiSource) są wspólnymi globalami, jak na stronie. Zegar „dziś” to atrapa Date w tym kontekście. Dane FIKCYJNE.

const TABLICE = ['LMS_INFANT_HEIGHT_BOYS', 'LMS_INFANT_HEIGHT_GIRLS', 'LMS_INFANT_WEIGHT_BOYS', 'LMS_INFANT_WEIGHT_GIRLS',
  'LMS_HEIGHT_WHO_BOYS', 'LMS_HEIGHT_WHO_GIRLS', 'LMS_WEIGHT_WHO_BOYS', 'LMS_WEIGHT_WHO_GIRLS',
  'LMS_HEIGHT_BOYS', 'LMS_HEIGHT_GIRLS', 'LMS_WEIGHT_BOYS', 'LMS_WEIGHT_GIRLS'];
const TABLICE_WZROSTU = ['LMS_INFANT_HEIGHT_BOYS', 'LMS_INFANT_HEIGHT_GIRLS', 'LMS_HEIGHT_WHO_BOYS', 'LMS_HEIGHT_WHO_GIRLS',
  'LMS_HEIGHT_BOYS', 'LMS_HEIGHT_GIRLS'];
const FUNKCJE = ['erf', 'normalCDF', 'lmsNiemowleWiek', 'lmsNiemowle', 'vildaDsTablica', 'vildaPopulacjaDs', 'vildaDsWiersz',
  'getChildLMS', 'calcPercentileStats', 'formatCentile', 'formatCentileLabel', 'BMI'];
const CM_TO_M = Number((/CM_TO_M=(\d+)/.exec(appSrc) || [])[1]);

const lokalnie = (rok, miesiac, dzien, godzina = 12) => new Date(rok, miesiac - 1, dzien, godzina, 0, 0);
const DZIS = lokalnie(2026, 6, 17, 15);

function karta({ payload, dobFormularza = '', dzis = DZIS }) {
  const elementy = {};
  ['prevSummaryWrap', 'prevSummaryCard', 'prevSummaryContent'].forEach((id) => {
    elementy[id] = { id, style: { display: 'none' }, dataset: {}, innerHTML: '' };
  });
  elementy.dobInput = { id: 'dobInput', value: dobFormularza };
  const store = {};
  const teraz = dzis.getTime();
  class DataTestu extends Date {
    constructor(...a) { if (a.length === 0) super(teraz); else super(...a); }

    static now() { return teraz; }
  }
  const win = {
    Date: DataTestu,
    document: {
      readyState: 'loading',
      getElementById: (id) => elementy[id] || null,
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
      querySelector() { return null; }, querySelectorAll() { return []; },
    },
    sessionStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    setTimeout: () => 0, clearTimeout() {},
    location: { pathname: '/index.html' },
    vildaAppSetTrustedHtml: (el, html) => { el.innerHTML = html; },
    // Przy wybraniu pacjenta (source 'pick') poprzednim pomiarem jest najnowsza zapisana migawka.
    VildaVault: { isUnlocked: () => true, getPatient: async () => ({ snapshots: [{ snapshotId: 'poprzedni', payload }] }) },
    bmiSource: 'OLAF',
    weightUsedFallback: false,
    CM_TO_M,
    VildaWzrostLMS: Object.fromEntries(TABLICE_WZROSTU.map((n) => [n, tablica(n)])),
  };
  win.window = win;
  for (const n of TABLICE) win[n] = tablica(n);
  vm.createContext(win);
  vm.runInContext(zrodlo('vilda_sds_wzrostu.js'), win);
  vm.runInContext(FUNKCJE.map((f) => funkcjaZ(appSrc, f)).join('\n'), win);
  vm.runInContext(zrodlo('vilda_dob_age.js'), win);
  vm.runInContext(zrodlo('vilda_summary_cards.js'), win);
  return { win, elementy };
}

const tick = () => new Promise((r) => { setTimeout(r, 0); });

function kolumnaPoprzednio(html, klucz) {
  const wiersz = new RegExp(`<tr data-klucz="${klucz}">.*?<td class="pt-kol-poprzednio">(.*?)</td>`).exec(html);
  const centyl = wiersz && /<span class="pt-s">(.*?)<\/span>/.exec(wiersz[1]);
  return centyl ? centyl[1] : null;
}

async function poprzednio(opcje) {
  const k = karta(opcje);
  k.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
  await tick();
  const html = k.elementy.prevSummaryContent.innerHTML;
  return { wzrost: kolumnaPoprzednio(html, 'wzrost'), masa: kolumnaPoprzednio(html, 'masa'), win: k.win };
}

// Etykieta centyla prosto z silnika wzrostu na podanym wieku w miesiącach — niezależna od karty i od lmsNiemowleWiek.
function centylWzrostu(win, wzrost, plec, wiekMies, zrodlo) {
  return win.formatCentileLabel(win.VildaSdsWzrostu.policz({ wzrost, plec, wiekMies, zrodlo }).centyl);
}
// Data z kontekstu strony: vilda_dob_age.js sprawdza `instanceof Date` względem własnego Date.
const miesiaceNaDobe = (win, dobISO, dzien) => win.VildaDobAge.exactMonthsFromDays(
  win.VildaDobAge.ageFromDobISO(dobISO, new win.Date(dzien.getFullYear(), dzien.getMonth(), dzien.getDate())).days);

// Chłopiec 9 l. 1 mies.: pomiar 06-06-2026 (doba 3319 → 109,04 mies.), dziś 17-06-2026 (doba 3330 → 109,40 mies.).
const CHLOPIEC = {
  version: 1, timestampISO: lokalnie(2026, 6, 6, 10).toISOString(), zscore: { dataSource: 'OLAF' },
  user: { sex: 'M', age: 9, ageMonths: 1, height: 135, weight: 40, dobISO: '2017-05-05', measuredAtISO: '2026-06-06' },
};
// Dziewczynka ur. 20-03-2026: pomiar 21-05-2026 (62. doba, 2 mies., 8 tyg.), dziś 17-06-2026 (89. doba, nadal 2 pełne miesiące).
const NIEMOWLE = {
  version: 1, timestampISO: lokalnie(2026, 5, 21, 10).toISOString(), zscore: { dataSource: 'WHO' },
  user: { sex: 'F', age: 0, ageMonths: 2, ageWeeks: 8, height: 57, weight: 5, dobISO: '2026-03-20', measuredAtISO: '2026-05-21' },
};
const bez = (payload, ...klucze) => {
  const kopia = JSON.parse(JSON.stringify(payload));
  klucze.forEach((k) => { delete kopia.user[k]; });
  return kopia;
};

describe('P-POROWNANIE-WIEK: kolumna „Poprzednio” w wieku z doby tamtego pomiaru', () => {
  it('niemowlę: pomiar z 62. doby oceniany w 62. dobie, nie w dzisiejszej 89. (wzrost 47., masa 41. centyl)', async () => {
    for (const dobFormularza of ['20-03-2026', '']) {
      const r = await poprzednio({ payload: NIEMOWLE, dobFormularza });
      expect(r.wzrost, `data w formularzu: ${dobFormularza || 'brak'}`).toBe('47 centyl');
      expect(r.masa, `data w formularzu: ${dobFormularza || 'brak'}`).toBe('41 centyl');
    }
    // Kontrola, że przypadek rozróżnia regułę: ten sam wzrost w dzisiejszej 89. dobie to 11. centyl (tak liczyła karta
    // przed zmianą, gdy formularz miał datę urodzenia), a w wierszu pełnych 2 miesięcy — 49. centyl.
    const { win } = karta({ payload: NIEMOWLE });
    expect(centylWzrostu(win, 57, 'F', miesiaceNaDobe(win, '2026-03-20', lokalnie(2026, 5, 21)), 'WHO')).toBe('47 centyl');
    expect(centylWzrostu(win, 57, 'F', miesiaceNaDobe(win, '2026-03-20', DZIS), 'WHO')).toBe('11 centyl');
    expect(centylWzrostu(win, 57, 'F', 2, 'WHO')).toBe('49 centyl');
  });

  it('chłopiec 9 lat: pomiar sprzed 11 dni w tym samym miesiącu życia — 39. centyl wzrostu, niezależnie od formularza', async () => {
    for (const dobFormularza of ['05-05-2017', '']) {
      const r = await poprzednio({ payload: CHLOPIEC, dobFormularza });
      expect(r.wzrost, `data w formularzu: ${dobFormularza || 'brak'}`).toBe('39 centyl');
      expect(r.masa).toBe('87 centyl');
    }
    const { win } = karta({ payload: CHLOPIEC });
    expect(centylWzrostu(win, 135, 'M', miesiaceNaDobe(win, '2017-05-05', lokalnie(2026, 6, 6)), 'OLAF')).toBe('39 centyl');
    expect(centylWzrostu(win, 135, 'M', miesiaceNaDobe(win, '2017-05-05', DZIS), 'OLAF')).toBe('38 centyl');
  });

  it('rekord bez daty urodzenia: wiersz pełnego miesiąca, a nie dzisiejszy wiek z formularza', async () => {
    const r = await poprzednio({ payload: bez(NIEMOWLE, 'dobISO'), dobFormularza: '20-03-2026' });
    expect(r.wzrost).toBe('49 centyl');
    expect(r.masa).toBe('42 centyl');
  });

  it('doba zapisu niezgodna z zapisanym wiekiem (ponowny zapis starszym kodem): bez zgadywania, wiersz pełnego miesiąca', async () => {
    // Bez measuredAtISO dobą pomiaru jest dzień zapisu, a 20-06-2026 dziewczynka ma już 3 pełne miesiące, nie zapisane 2.
    const payload = { ...bez(NIEMOWLE, 'measuredAtISO'), timestampISO: lokalnie(2026, 6, 20, 10).toISOString() };
    const r = await poprzednio({ payload, dobFormularza: '20-03-2026', dzis: lokalnie(2026, 6, 20, 15) });
    expect(r.wzrost).toBe('49 centyl');
    expect(r.masa).toBe('42 centyl');
  });

  it('kontekst wieku żyje tylko w czasie obliczeń: bieżący pomiar nadal liczy się z daty urodzenia w formularzu', async () => {
    const r = await poprzednio({ payload: NIEMOWLE, dobFormularza: '20-03-2026' });
    expect(r.win.__vildaWiekPomiaru).toBeUndefined();
    // DOB-AGE-4 bez zmian: bieżący pomiar (2 pełne miesiące) dostaje dzisiejszy dokładny wiek z formularza (89. doba).
    expect(r.win.lmsNiemowleWiek(2)).toBeCloseTo(89 / 30.4375, 10);
    expect(r.win.formatCentileLabel(r.win.calcPercentileStats(57, 'F', 2 / 12, 'HT').percentile)).toBe('11 centyl');
  });

  it('wyjątek w trakcie obliczeń nie zostawia kontekstu wieku', async () => {
    const k = karta({ payload: NIEMOWLE, dobFormularza: '20-03-2026' });
    const liczCentyl = k.win.calcPercentileStats;
    let wywolania = 0;
    k.win.calcPercentileStats = () => { wywolania += 1; throw new Error('awaria silnika'); };
    k.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    await tick();
    k.win.calcPercentileStats = liczCentyl;
    expect(wywolania, 'awaria zaszła w obliczeniach z kontekstem wieku').toBe(1);
    expect(k.win.__vildaWiekPomiaru).toBeUndefined();
    expect(k.win.lmsNiemowleWiek(2)).toBeCloseTo(89 / 30.4375, 10);
  });

  it('lmsNiemowleWiek z kontekstem: tylko ten sam wiek w pełnych miesiącach, a exactMonths null wyłącza uściślenie', () => {
    const { win } = karta({ payload: NIEMOWLE, dobFormularza: '20-03-2026' });
    win.__vildaWiekPomiaru = { totalMonths: 2, exactMonths: 62 / 30.4375 };
    expect(win.lmsNiemowleWiek(2)).toBeCloseTo(62 / 30.4375, 10);
    expect(win.lmsNiemowleWiek(3)).toBeNull();
    win.__vildaWiekPomiaru = { totalMonths: 2, exactMonths: null };
    expect(win.lmsNiemowleWiek(2)).toBeNull();
    win.__vildaWiekPomiaru = undefined;
    expect(win.lmsNiemowleWiek(2)).toBeCloseTo(89 / 30.4375, 10);
  });
});
