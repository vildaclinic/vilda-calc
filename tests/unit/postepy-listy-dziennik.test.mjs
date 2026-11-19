import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-POSTEPY-DZIENNIK (decyzje właściciela 2026-11-19: „zacznij kolejny etap — Postępy i lista pacjentów z dziennika”;
// listy: „Bez zmiany sejfu”). Etap po P-OTYLOSC-DZIENNIK:
//   1. Zakładka „Postępy” dorosłego liczy z projekcji dziennika leczenia (wpisy poza wizytą + dawne punkty migawki),
//      a wpis bieżącego cyklu z dwiema wersjami wstrzymuje punkt oceny wg ChPL — jak werdykt w Karcie pacjenta.
//   2. Listy pacjentów „Leczenie otyłości: trwa / kiedykolwiek / lek X” liczy sejf z zapisu ostatniej wizyty i sejf
//      się nie zmienia. Zgodność z dziennikiem daje reguła Karty: poprawić, usunąć i przywrócić wolno tylko
//      Kontynuację bez zmiany leku (VildaDziennikOtylosci.zmianaPrzebiegu). Część „listy” sprawdza to na PRAWDZIWYM
//      sejfie: po każdym działaniu, na które Karta pozwala, sejf liczy listy z zapisu wizyty tak samo, jakby zapisem
//      wizyty była projekcja dziennika. Kontrole ujemne pokazują, po co jest reguła.
//
// Testy wołają PRODUKCYJNE moduły: VildaDziennikOtylosci (vilda_cykle_leczenia.js), silnik Postępów
// (scalSerie → analizuj, tak jak Karta pacjenta w vilda_auth_ui.js) i sejf (vilda_crypto.js + vilda_vault.js na
// adapterze pamięciowym). Dane pacjentów wyłącznie FIKCYJNE.

const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'Semaglutyd (agonista receptora GLP‑1)' };
const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP‑1)' };

/* Dorosły 170 cm, urodzony 12.01.1979 — wiek w konwencji monitora (pełne lata + reszta miesięcy). */
const pkt = (id, type, dateISO, weight, lek, mies, dose = '2,4 mg / tydz.') => ({
  id, type, dateISO, ageYears: 47, ageMonths: mies, weight, height: 170, bmi: +(weight / 2.89).toFixed(1), dose, ...lek,
});
const MIGAWKA = [
  pkt('w-start', 'start', '2026-01-12', 112, WEGOVY, 0, '0,25 mg / tydz.'),
  pkt('w-kwi', 'continue', '2026-04-14', 104, WEGOVY, 3),
];
const WIEK_MIES = 47 * 12 + 10;
const PID = 'fikcyjny-dorosly-1';

function moduly() {
  const g = loadBrowserScript('vilda_postepy_doroslego_wydruk.js', {});
  return { P: g.VildaPostepyDoroslego, D: g.VildaDziennikOtylosci };
}
const notatka = (ladunek, chwila) => ({ ...ladunek, createdAtISO: chwila, updatedAtISO: chwila, rev: 1 });
const zapisane = (D, plan, chwila = '2026-11-10T19:00:00.000Z') => plan.wersje.map((v) => notatka(D.zakoduj(PID, v), chwila));
const kontynuacja = (nad = {}) => ({
  type: 'continue', dateISO: '2026-11-10', ageYears: 47, ageMonths: 10, weight: 99.1, weightSource: 'pacjent',
  height: null, drug: WEGOVY.drug, substance: WEGOVY.substance, dose: '2,4 mg / tydz.', ...nad,
});

/** To samo wywołanie co Karta pacjenta (vilda_auth_ui.js, panel „Postępy”): scalona seria + te same punkty. */
function zKarty(P, punkty) {
  const ser = P.scalSerie({ pomiary: [], punktyLeczenia: punkty });
  return P.analizuj({
    wiekMies: WIEK_MIES,
    pomiary: ser.pomiary.map((c) => ({ ageMonthsTotal: c.wiekMies, weight: c.masa, height: c.wzrost, dateISO: c.dateISO })),
    punktyLeczenia: punkty,
  });
}

describe('Karta: co wolno poprawić w „Wpisy leczenia” (zmianaPrzebiegu)', () => {
  const { D } = moduly();
  const wpisPunktu = (stan, id) => stan.wpisy.find((x) => x.punkt && x.punkt.id === id);

  it('Włączenie i Zakończenie — w DocPro; Kontynuacja tego samego leku — w Karcie', () => {
    const z = [...MIGAWKA, pkt('w-koniec', 'end', '2026-10-06', 96, WEGOVY, 9)];
    const s = D.zloz([], z);
    expect(D.zmianaPrzebiegu(s, wpisPunktu(s, 'w-start'))).toBe('wlaczenie');
    expect(D.zmianaPrzebiegu(s, wpisPunktu(s, 'w-kwi'))).toBeNull();
    expect(D.zmianaPrzebiegu(s, wpisPunktu(s, 'w-koniec'))).toBe('zakonczenie');
  });

  it('wpis z Karty (lek z poprzedniego wpisu) — w Karcie; po przeniesieniu dawnych punktów też', () => {
    const plan = D.planNowego(D.zloz([], MIGAWKA), PID, kontynuacja());
    expect(plan.ok).toBe(true);
    const s = D.zloz(zapisane(D, plan), MIGAWKA);
    const nowy = s.wpisy.find((x) => x.entryId === plan.entryId);
    expect(D.zmianaPrzebiegu(s, nowy)).toBeNull();
    expect(D.zmianaPrzebiegu(s, s.wpisy.find((x) => x.punkt && x.punkt.type === 'start'))).toBe('wlaczenie');
  });

  it('Kontynuacja, która zmienia lek, i Kontynuacja bez poprzedniego wpisu — w DocPro', () => {
    const zmiana = [pkt('s-start', 'start', '2026-01-12', 112, SAXENDA, 0, '0,6 mg / dobę'), pkt('w-kont', 'continue', '2026-04-14', 104, WEGOVY, 3)];
    const s1 = D.zloz([], zmiana);
    expect(D.zmianaPrzebiegu(s1, wpisPunktu(s1, 'w-kont'))).toBe('zmiana-leku');
    const przejety = [pkt('w-kont1', 'continue', '2026-04-14', 104, WEGOVY, 3), pkt('w-kont2', 'continue', '2026-07-14', 100, WEGOVY, 6)];
    const s2 = D.zloz([], przejety);
    expect(D.zmianaPrzebiegu(s2, wpisPunktu(s2, 'w-kont1'))).toBe('pierwszy-wpis');
    expect(D.zmianaPrzebiegu(s2, wpisPunktu(s2, 'w-kont2'))).toBeNull();
  });

  it('usunięty wpis: przywrócić w Karcie wolno tylko Kontynuację bez zmiany leku', () => {
    const z = [...MIGAWKA, pkt('w-koniec', 'end', '2026-10-06', 96, WEGOVY, 9)];
    let s = D.zloz([], z);
    const usunK = D.planDzialania(s, PID, { rodzaj: 'usun', id: 'w-kwi' });
    let notatki = zapisane(D, usunK, '2026-11-10T19:00:00.000Z');
    s = D.zloz(notatki, z);
    const usunE = D.planDzialania(s, PID, { rodzaj: 'usun', id: s.wpisy.find((x) => x.punkt && x.punkt.type === 'end').entryId });
    notatki = notatki.concat(zapisane(D, usunE, '2026-11-10T19:01:00.000Z'));
    s = D.zloz(notatki, z);
    const usuniete = s.wpisy.filter((x) => x.stan === 'usuniety');
    expect(usuniete.map((x) => x.biezaca.dane.type).sort()).toEqual(['continue', 'end']);
    expect(D.zmianaPrzebiegu(s, usuniete.find((x) => x.biezaca.dane.type === 'continue'))).toBeNull();
    expect(D.zmianaPrzebiegu(s, usuniete.find((x) => x.biezaca.dane.type === 'end'))).toBe('zakonczenie');
  });

  it('każdy powód ma zdanie dla lekarza z miejscem poprawki', () => {
    for (const powod of ['wlaczenie', 'zakonczenie', 'pierwszy-wpis', 'zmiana-leku']) {
      expect(D.POWODY_DOCPRO[powod], powod).toMatch(/w DocPro przy wizycie/);
    }
    expect(Object.isFrozen(D.POWODY_DOCPRO)).toBe(true);
  });
});

describe('Postępy dorosłego z dziennika leczenia', () => {
  const { P, D } = moduly();

  it('wpis od pacjenta z Karty jest ostatnim pomiarem serii, z datą z dziennika', () => {
    const plan = D.planNowego(D.zloz([], MIGAWKA), PID, kontynuacja());
    const s = D.zloz(zapisane(D, plan), MIGAWKA);
    const m = zKarty(P, s.punkty);
    const ost = m.seria[m.seria.length - 1];
    expect([ost.masa, ost.dateISO]).toEqual([99.1, '2026-11-10']);
    expect(m.punktOdniesienia).toMatchObject({ zrodlo: 'start-leczenia', masa: 112, dateISO: '2026-01-12' });
    // Z samej migawki ostatniej wizyty tego wpisu nie było — to jest różnica etapu.
    const zMigawki = zKarty(P, MIGAWKA);
    expect(zMigawki.seria[zMigawki.seria.length - 1].masa).toBe(104);
  });

  it('wpis bieżącego cyklu z dwiema wersjami wstrzymuje punkt oceny wg ChPL; po wyborze wersji punkt wraca', () => {
    // Saxenda: u dorosłego ChPL ocenia odpowiedź po 12 tygodniach na dawce 3,0 mg (Wegovy u dorosłego punktu oceny nie ma).
    const sax = [
      pkt('s-start', 'start', '2026-06-01', 112, SAXENDA, 5, '0,6 mg / dobę'),
      pkt('s-lip', 'continue', '2026-07-06', 108, SAXENDA, 6, '3,0 mg / dobę'),
    ];
    const kontS = (nad = {}) => kontynuacja({ drug: SAXENDA.drug, substance: SAXENDA.substance, dose: '3,0 mg / dobę', ...nad });
    const p0 = D.planNowego(D.zloz([], sax), PID, kontS());
    let notatki = zapisane(D, p0, '2026-11-10T19:00:00.000Z');
    const baza = D.zloz(notatki, sax);
    // Dwie równoległe poprawki tego samego wpisu (dwa urządzenia) — obie zastępują tę samą wersję.
    notatki = notatki
      .concat(zapisane(D, D.planPoprawki(baza, PID, p0.entryId, kontS({ weight: 98.6 })), '2026-11-11T08:00:00.000Z'))
      .concat(zapisane(D, D.planPoprawki(baza, PID, p0.entryId, kontS({ weight: 99.4 })), '2026-11-11T08:05:00.000Z'));
    const sK = D.zloz(notatki, sax);
    expect(sK.konflikty).toHaveLength(1);
    const bez = zKarty(P, D.zloz(zapisane(D, p0, '2026-11-10T19:00:00.000Z'), sax).punkty);
    expect(bez.punktDecyzyjny.jest, 'Saxenda ma punkt oceny wg ChPL').toBe(true);
    expect(bez.punktDecyzyjny.tydzienOdOdniesienia, 'bez konfliktu punkt stoi na osi').not.toBeNull();
    const mK = zKarty(P, sK.punkty);
    expect(mK.punktDecyzyjny.jest).toBe(true);
    expect(mK.punktDecyzyjny.bezOsi).toBe('konflikt-wersji-wpisu');
    expect(mK.punktDecyzyjny.tydzienOdOdniesienia).toBeNull();
    expect(mK.ostrzezenia.join(' ')).toContain('Wpis z 10.11.2026 ma dwie wersje');
    expect(mK.ostrzezenia.join(' ')).toContain('„Wpisy leczenia”');

    const wybrana = sK.konflikty[0].liscie.find((v) => v.dane.weight === 98.6);
    notatki = notatki.concat(zapisane(D, D.planRozstrzygniecia(sK, PID, p0.entryId, wybrana.id), '2026-11-11T09:00:00.000Z'));
    const sR = D.zloz(notatki, sax);
    expect(sR.konflikty).toHaveLength(0);
    const mR = zKarty(P, sR.punkty);
    expect(mR.punktDecyzyjny.bezOsi == null).toBe(true);
    expect(mR.punktDecyzyjny.tydzienOdOdniesienia).not.toBeNull();
    expect(mR.ostrzezenia.join(' ')).not.toContain('dwie wersje');
    expect(mR.seria[mR.seria.length - 1].masa).toBe(98.6);
  });

  it('konflikt w zakończonym, wcześniejszym cyklu nie wstrzymuje oceny bieżącego', () => {
    const cykl1 = [
      pkt('s1', 'start', '2024-01-12', 120, SAXENDA, 0, '0,6 mg / dobę'),
      pkt('s2', 'continue', '2024-04-12', 115, SAXENDA, 3, '3,0 mg / dobę'),
      pkt('s3', 'end', '2024-10-15', 113, SAXENDA, 9, '3,0 mg / dobę'),
    ];
    const z = [...cykl1, ...MIGAWKA];
    const s0 = D.zloz([], z);
    const kontS = s0.wpisy.find((x) => x.punkt && x.punkt.id === 's2');
    const mig = D.planDzialania(s0, PID, { rodzaj: 'popraw', id: kontS.punkt.id, dane: { ...kontS.punkt, weightSource: 'gabinet' } });
    let notatki = zapisane(D, mig, '2026-11-10T19:00:00.000Z');
    const baza = D.zloz(notatki, z);
    const eid = baza.wpisy.find((x) => x.punkt && x.punkt.dateISO === '2024-04-12').entryId;
    const d = baza.wpisy.find((x) => x.entryId === eid).biezaca.dane;
    notatki = notatki
      .concat(zapisane(D, D.planPoprawki(baza, PID, eid, { ...d, weight: 114.5 }), '2026-11-11T08:00:00.000Z'))
      .concat(zapisane(D, D.planPoprawki(baza, PID, eid, { ...d, weight: 115.5 }), '2026-11-11T08:05:00.000Z'));
    const s = D.zloz(notatki, z);
    expect(s.konflikty).toHaveLength(1);
    const m = zKarty(P, s.punkty);
    expect(m.cykl).toMatchObject({ numer: 2 });
    expect(m.punktDecyzyjny.bezOsi == null).toBe(true);
    expect(m.ostrzezenia.join(' ')).not.toContain('dwie wersje');
  });
});

// ── Listy pacjentów: prawdziwy sejf, który się nie zmienia ──────────────────────────────────────────────

function magazyn() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; },
  };
}
function okno() {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  loadBrowserScript('vilda_cykle_leczenia.js', win);
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  return { win, vault, D: win.VildaDziennikOtylosci };
}

let teraz = Date.parse('2026-11-19T08:00:00.000Z');
const krok = (ms = 60e3) => { teraz += ms; vi.setSystemTime(teraz); };
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(teraz); });
afterEach(() => { vi.useRealTimers(); });

const DOROSLY = { name: 'Fikcyjny Adam', user: { sex: 'M', age: 47, height: 170, weight: 112 } };
const REGULY = [
  { type: 'obesity', drugKey: 'wegovy', scope: 'active' },
  { type: 'obesity', drugKey: 'wegovy', scope: 'ever' },
  { type: 'obesity', drugKey: '', scope: 'active' },
  { type: 'obesity', drugKey: 'saxenda', scope: 'active' },
  { type: 'obesity', drugKey: 'saxenda', scope: 'ever' },
  { type: 'medication', value: 'wegovy', scope: 'active' },
  { type: 'medication', value: 'saxenda', scope: 'ever' },
];

async function zbiory(vault) {
  krok(10e3); // pamięć podręczna leczenia w sejfie żyje 5 s
  const out = [];
  for (const r of REGULY) out.push(new Set((await vault.previewPatientListRule(r)).patientIds));
  return out;
}

/**
 * Pacjent-lustro: jego zapis wizyty to projekcja dziennika pacjenta `pid`. Zwraca reguły, w których
 * pacjent i jego lustro różnią się przynależnością (pusta lista = listy zgodne z dziennikiem).
 */
async function rozjazdy(U, pid, migawka, lustroId) {
  const s = U.D.zloz(await U.vault.listPatientNotesForPatient(pid), migawka);
  krok();
  await U.vault.savePatient({ ...DOROSLY, name: 'Fikcyjne Lustro', obesityTherapyPoints: s.punkty }, { patientId: lustroId, dedup: false });
  const z = await zbiory(U.vault);
  return REGULY.filter((r, i) => z[i].has(pid) !== z[i].has(lustroId)).map((r) => `${r.type}:${r.drugKey ?? r.value}:${r.scope}`);
}

async function zapisz(U, pid, plan) {
  expect(plan.ok, JSON.stringify(plan.bledy || [])).toBe(true);
  krok();
  await U.D.zapisz(pid, plan.wersje, { vault: U.vault });
}

describe('listy pacjentów zgodne z dziennikiem bez zmiany sejfu', () => {
  it('każde działanie, na które Karta pozwala, zostawia listy zgodne z dziennikiem', async () => {
    const U = okno();
    await U.vault.createUser('Fikcyjne#Listy!1', { label: 'Fikcyjny lekarz', iterations: 10000 });
    krok();
    const pid = (await U.vault.savePatient({ ...DOROSLY, obesityTherapyPoints: MIGAWKA }, { dedup: false })).patientId;
    krok();
    const lustro = (await U.vault.savePatient({ ...DOROSLY, name: 'Fikcyjne Lustro', obesityTherapyPoints: [] }, { dedup: false })).patientId;
    const stan = async () => U.D.zloz(await U.vault.listPatientNotesForPatient(pid), MIGAWKA);
    const wolno = (s, wpis) => U.D.zmianaPrzebiegu(s, wpis) === null;

    expect(await rozjazdy(U, pid, MIGAWKA, lustro)).toEqual([]);
    const z0 = await zbiory(U.vault);
    expect([z0[0].has(pid), z0[1].has(pid), z0[3].has(pid)], 'Wegovy trwa; Saxenda nie').toEqual([true, true, false]);

    // 1. „+ Kontynuacja” z masą od pacjenta (lek z ostatniego wpisu).
    const nowy = U.D.planNowego(await stan(), pid, kontynuacja());
    await zapisz(U, pid, nowy);
    expect(await rozjazdy(U, pid, MIGAWKA, lustro)).toEqual([]);

    // 2. „Popraw” tego wpisu.
    let s = await stan();
    expect(wolno(s, s.wpisy.find((x) => x.entryId === nowy.entryId))).toBe(true);
    await zapisz(U, pid, U.D.planDzialania(s, pid, { rodzaj: 'popraw', id: nowy.entryId, dane: kontynuacja({ weight: 98.8 }) }));
    expect(await rozjazdy(U, pid, MIGAWKA, lustro)).toEqual([]);

    // 3. „Usuń” dawnej Kontynuacji z wizyty (przeniesienie + usunięcie) i 4. „Cofnij”.
    s = await stan();
    const kwi = s.wpisy.find((x) => x.punkt && x.punkt.dateISO === '2026-04-14');
    expect(wolno(s, kwi)).toBe(true);
    await zapisz(U, pid, U.D.planDzialania(s, pid, { rodzaj: 'usun', id: kwi.punkt.id }));
    expect(await rozjazdy(U, pid, MIGAWKA, lustro)).toEqual([]);
    s = await stan();
    const usuniety = s.wpisy.find((x) => x.stan === 'usuniety');
    expect(wolno(s, usuniety)).toBe(true);
    await zapisz(U, pid, U.D.planPrzywrocenia(s, pid, usuniety.entryId));
    expect(await rozjazdy(U, pid, MIGAWKA, lustro)).toEqual([]);

    // 5. Usunięcie OSTATNIEGO wpisu (wpisu z Karty) — ostatnim punktem znów jest Kontynuacja tego samego leku.
    s = await stan();
    await zapisz(U, pid, U.D.planUsuniecia(s, pid, nowy.entryId));
    expect(await rozjazdy(U, pid, MIGAWKA, lustro)).toEqual([]);
  });

  it('kontrola ujemna: usunięcie Zakończenia albo Kontynuacji ze zmianą leku rozjechałoby listy — dlatego tylko w DocPro', async () => {
    const U = okno();
    await U.vault.createUser('Fikcyjne#Listy!2', { label: 'Fikcyjny lekarz', iterations: 10000 });
    // Zakończony cykl: na liście „trwa” pacjenta nie ma.
    const zakonczony = [...MIGAWKA, pkt('w-koniec', 'end', '2026-10-06', 96, WEGOVY, 9)];
    krok();
    const pidE = (await U.vault.savePatient({ ...DOROSLY, obesityTherapyPoints: zakonczony }, { dedup: false })).patientId;
    krok();
    const lustroE = (await U.vault.savePatient({ ...DOROSLY, name: 'Fikcyjne Lustro', obesityTherapyPoints: [] }, { dedup: false })).patientId;
    let s = U.D.zloz([], zakonczony);
    const koniec = s.wpisy.find((x) => x.punkt && x.punkt.type === 'end');
    expect(U.D.zmianaPrzebiegu(s, koniec)).toBe('zakonczenie');
    await zapisz(U, pidE, U.D.planDzialania(s, pidE, { rodzaj: 'usun', id: koniec.punkt.id }));
    expect(await rozjazdy(U, pidE, zakonczony, lustroE)).toEqual(expect.arrayContaining(['obesity:wegovy:active', 'obesity::active', 'medication:wegovy:active']));

    // Kontynuacja, która zmieniła lek z Saxendy na Wegovy.
    const zmiana = [pkt('s-start', 'start', '2026-01-12', 112, SAXENDA, 0, '0,6 mg / dobę'), pkt('w-kont', 'continue', '2026-04-14', 104, WEGOVY, 3)];
    krok();
    const pidL = (await U.vault.savePatient({ ...DOROSLY, obesityTherapyPoints: zmiana }, { dedup: false })).patientId;
    krok();
    const lustroL = (await U.vault.savePatient({ ...DOROSLY, name: 'Fikcyjne Lustro', obesityTherapyPoints: [] }, { dedup: false })).patientId;
    s = U.D.zloz([], zmiana);
    const kont = s.wpisy.find((x) => x.punkt && x.punkt.id === 'w-kont');
    expect(U.D.zmianaPrzebiegu(s, kont)).toBe('zmiana-leku');
    await zapisz(U, pidL, U.D.planDzialania(s, pidL, { rodzaj: 'usun', id: 'w-kont' }));
    expect(await rozjazdy(U, pidL, zmiana, lustroL)).toEqual(expect.arrayContaining(['obesity:wegovy:active', 'obesity:wegovy:ever']));
  });
});
