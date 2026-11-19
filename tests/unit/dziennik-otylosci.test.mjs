import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { zaladuj221, zaladuj276, zaladujRetencjeV1 } from '../support/starsza-aplikacja.mjs';

// P-OTYLOSC-DZIENNIK (etapy 3 i 4 projektu „Leczenie otyłości — wpisy poza wizytą”; decyzje właściciela 2026-11-17/18,
// „Etap 3 + 4 razem” 2026-11-18). Dziennik leczenia otyłości oddziela wpisy leczenia (np. masę przysłaną przez pacjenta)
// od wizyt: każda wersja wpisu to osobna notatka pacjenta zapisana RAZ (savePatientNoteOnce), kategoria
// „leczenie-otylosci”, dane w ostatniej linii treści (JSON). Sejf bez zmian.
//
// Ten plik woła PRODUKCYJNY moduł VildaDziennikOtylosci (vilda_cykle_leczenia.js, razem z modułem cykli)
// i — w części „flota” — PRAWDZIWY sejf (vilda_crypto.js + vilda_vault.js) na adapterze pamięciowym, także starsze
// wersje aplikacji z fikstur (sejf 221 i 276). Dane wyłącznie FIKCYJNE.

function modul() {
  const win = {};
  loadBrowserScript('vilda_cykle_leczenia.js', win);
  return win.VildaDziennikOtylosci;
}
const D = modul();
const PID = 'fikcyjny-pacjent-1';
const WEGOVY = 'Wegovy (semaglutyd) – s.c. 1×/tydz.';
const dane = (nad = {}) => ({
  type: 'continue', dateISO: '2026-11-10', ageYears: 13, ageMonths: 7, weight: 74.6, weightSource: 'pacjent',
  height: null, drug: WEGOVY, dose: '2,4 mg / tydz.', ...nad,
});
// Notatka tak, jak oddaje ją sejf (Ft): pola ładunku + chwile.
const notatka = (ladunek, chwila = '2026-11-10T19:00:00.000Z') => ({ ...ladunek, createdAtISO: chwila, updatedAtISO: chwila, rev: 1 });
const zapisane = (plan, chwila) => plan.wersje.map((v) => notatka(D.zakoduj(PID, v), chwila));

describe('format notatki', () => {
  it('kategoria, czytelny tytuł i pierwsza linia, JSON w ostatniej linii, data kliniczna i wiek', () => {
    const plan = D.planNowego(D.zloz([], []), PID, dane({ comment: 'Recepta wysłana.\nKolejna linia' }));
    expect(plan.ok).toBe(true);
    const n = D.zakoduj(PID, plan.wersje[0]);
    expect(n.category).toBe('leczenie-otylosci');
    expect(n.title).toBe('Leczenie otyłości — Kontynuacja 10.11.2026');
    const linie = n.body.split('\n');
    expect(linie[0]).toBe('Kontynuacja 10.11.2026 · masa 74,6 kg (pacjent) · wzrost — · Wegovy (semaglutyd) 2,4 mg / tydz.');
    expect(linie[1]).toBe('Recepta wysłana. Kolejna linia');
    expect(linie[2]).toBe('Wpis dziennika leczenia otyłości (Vilda) — nie edytuj tej notatki.');
    expect(linie[3].startsWith('{"vildaOtylosc":1,')).toBe(true);
    expect(linie).toHaveLength(4);
    expect(n.clinicalDateISO).toBe('2026-11-10');
    expect(n.linkedAgeMonths).toBe(13 * 12 + 7);
    expect(n.dueDateISO).toBeUndefined();
  });

  it('odczyt odwraca zapis; obca kategoria albo zepsuty JSON — nie wpis', () => {
    const plan = D.planNowego(D.zloz([], []), PID, dane({ height: 163.4, heightSource: 'pacjent' }));
    const n = notatka(D.zakoduj(PID, plan.wersje[0]));
    const v = D.odkoduj(n);
    expect(v.entryId).toBe(plan.wersje[0].id);
    expect(v.dane).toMatchObject({ type: 'continue', weight: 74.6, weightSource: 'pacjent', height: 163.4, heightSource: 'pacjent' });
    expect(D.odkoduj({ ...n, category: 'observation' })).toBeNull();
    expect(D.odkoduj({ ...n, body: n.body.replace('"vildaOtylosc":1', '"vildaOtylosc":9') })).toBeNull();
    expect(D.odkoduj({ ...n, body: n.body.slice(0, -5) })).toBeNull();
    const s = D.zloz([{ ...n, body: 'ktoś to przepisał ręcznie' }], []);
    expect(s.nieczytelne).toHaveLength(1);
    expect(s.punkty).toEqual([]);
  });

  it('dane wpisu: data obowiązkowa w nowym wpisie, masa > 0, wzrost liczbą albo pusty', () => {
    const z = D.zloz([], []);
    expect(D.planNowego(z, PID, dane({ dateISO: '' })).bledy).toEqual(['data']);
    expect(D.planNowego(z, PID, dane({ dateISO: '2026-02-30' })).bledy).toEqual(['data']);
    expect(D.planNowego(z, PID, dane({ weight: 0 })).bledy).toEqual(['masa']);
    expect(D.planNowego(z, PID, dane({ height: 'abc' })).bledy).toEqual(['wzrost']);
    expect(D.planNowego(z, PID, dane({ weight: '74,6' })).ok).toBe(true);
  });
});

describe('wersje wpisu: poprawka, usunięcie i cofnięcie, konflikt', () => {
  const pierwszy = D.planNowego(D.zloz([], []), PID, dane());
  const n1 = zapisane(pierwszy, '2026-11-10T19:00:00.000Z');
  const id = pierwszy.entryId;

  it('jeden wpis: stan ok, projekcja w formacie punktu monitora ze źródłem', () => {
    const s = D.zloz(n1, []);
    expect(s.wpisy).toHaveLength(1);
    expect(s.wpisy[0].stan).toBe('ok');
    expect(s.punkty).toEqual([expect.objectContaining({
      id, type: 'continue', dateISO: '2026-11-10', weight: 74.6, height: null, bmi: null, weightSource: 'pacjent', heightSource: null,
      ageYears: 13, ageMonths: 7, drug: WEGOVY, dose: '2,4 mg / tydz.',
    })]);
    expect(s.maDziennik).toBe(true);
  });

  it('poprawka zastępuje wersję — ten sam wpis, nowa treść, stara wersja zostaje w historii', () => {
    const p = D.planPoprawki(D.zloz(n1, []), PID, id, dane({ weight: 74.1 }));
    const s = D.zloz([...n1, ...zapisane(p, '2026-11-11T08:00:00.000Z')], []);
    expect(s.wpisy).toHaveLength(1);
    expect(s.wpisy[0].stan).toBe('ok');
    expect(s.wpisy[0].wersje).toHaveLength(2);
    expect(s.punkty[0].weight).toBe(74.1);
    expect(s.punkty[0].id).toBe(id);
  });

  it('usunięcie znika z projekcji, „Cofnij” przywraca tę samą treść', () => {
    const u = D.planUsuniecia(D.zloz(n1, []), PID, id);
    const po = [...n1, ...zapisane(u, '2026-11-12T08:00:00.000Z')];
    const s = D.zloz(po, []);
    expect(s.wpisy[0].stan).toBe('usuniety');
    expect(s.punkty).toEqual([]);
    expect(D.zakoduj(PID, u.wersje[0]).title).toBe('Leczenie otyłości — Kontynuacja 10.11.2026 (usunięty)');
    const c = D.planPrzywrocenia(s, PID, id);
    const s2 = D.zloz([...po, ...zapisane(c, '2026-11-12T08:01:00.000Z')], []);
    expect(s2.wpisy[0].stan).toBe('ok');
    expect(s2.punkty[0].weight).toBe(74.6);
  });

  it('dwie poprawki tej samej wersji (dwa urządzenia) — konflikt; żadna nie znika; wybór rozstrzyga', () => {
    const baza = D.zloz(n1, []);
    const tel = D.planPoprawki(baza, PID, id, dane({ weight: 74.6, comment: 'telefon' }), { urzadzenie: 'telefon' });
    const kom = D.planPoprawki(baza, PID, id, dane({ weight: 74.1 }), { urzadzenie: 'komputer' });
    const razem = [...n1, ...zapisane(tel, '2026-11-10T21:14:00.000Z'), ...zapisane(kom, '2026-11-11T08:02:00.000Z')];
    const s = D.zloz(razem, []);
    expect(s.wpisy[0].stan).toBe('konflikt');
    expect(s.konflikty).toHaveLength(1);
    expect(s.wpisy[0].liscie.map((v) => v.dane.weight).sort()).toEqual([74.1, 74.6]);
    expect(s.punkty[0].dziennik.konflikt).toBe(true);
    // Poprawka i usunięcie wpisu w konflikcie — dopiero po wyborze.
    expect(D.planPoprawki(s, PID, id, dane()).bledy).toEqual(['konflikt']);
    expect(D.planUsuniecia(s, PID, id).bledy).toEqual(['konflikt']);
    const wybor = D.planRozstrzygniecia(s, PID, id, s.wpisy[0].liscie.find((v) => v.dane.weight === 74.6).id);
    expect(wybor.wersje[0].parents).toEqual(s.wpisy[0].liscie.map((v) => v.id));
    const s2 = D.zloz([...razem, ...zapisane(wybor, '2026-11-11T09:00:00.000Z')], []);
    expect(s2.wpisy[0].stan).toBe('ok');
    expect(s2.punkty[0].weight).toBe(74.6);
    expect(s2.wpisy[0].wersje).toHaveLength(4);
  });

  it('dwa nowe wpisy z dwóch urządzeń nie nadpisują się — dwa wpisy; duplikat wykrywany przed zapisem', () => {
    const a = D.planNowego(D.zloz([], []), PID, dane());
    const b = D.planNowego(D.zloz([], []), PID, dane({ dateISO: '2026-11-17', weight: 74.3 }));
    const s = D.zloz([...zapisane(a), ...zapisane(b)], []);
    expect(s.wpisy).toHaveLength(2);
    expect(s.punkty.map((p) => p.dateISO)).toEqual(['2026-11-10', '2026-11-17']);
    expect(D.duplikat(s, { dateISO: '2026-11-17', weight: 74.32 })?.entryId).toBe(b.entryId);
    expect(D.duplikat(s, { dateISO: '2026-11-17', weight: 74.4 })).toBeNull();
    expect(D.duplikat(s, { dateISO: '2026-11-17', weight: 74.3 }, b.entryId)).toBeNull();
  });
});

describe('dawne punkty z migawki (sprzed dziennika)', () => {
  const MIGAWKA = [
    { id: '1713000000000-ab12c', type: 'start', ageYears: 13, ageMonths: 0, weight: 80, height: 160, bmi: 31.3, drug: WEGOVY, dose: '0,25 mg', dateISO: '2026-04-14' },
    { id: '1726000000000-zz9', type: 'continue', ageYears: 13, ageMonths: 6, weight: 75.2, height: 162.9, drug: WEGOVY, dose: '2,4 mg', dateISO: '2026-10-13' },
  ];

  it('bez dziennika: projekcja = punkty migawki ze źródłem „gabinet”, bez zapisu', () => {
    const s = D.zloz([], MIGAWKA);
    expect(s.maDziennik).toBe(false);
    expect(s.niezmigrowane).toHaveLength(2);
    expect(s.punkty.map((p) => [p.id, p.weightSource, p.heightSource, p.dziennik.migawka])).toEqual([
      ['1713000000000-ab12c', 'gabinet', 'gabinet', true], ['1726000000000-zz9', 'gabinet', 'gabinet', true],
    ]);
  });

  it('pierwszy zapis przenosi dawne punkty — identyfikator i treść wyliczone z punktu (dwa urządzenia = ta sama notatka)', () => {
    const p1 = D.planNowego(D.zloz([], MIGAWKA), PID, dane());
    const p2 = D.planNowego(D.zloz([], MIGAWKA), PID, dane());
    expect(p1.wersje).toHaveLength(3);
    const mig1 = p1.wersje.slice(0, 2).map((v) => D.zakoduj(PID, v));
    const mig2 = p2.wersje.slice(0, 2).map((v) => D.zakoduj(PID, v));
    expect(mig1).toEqual(mig2);
    expect(mig1[0].id).toMatch(/^otylm-[0-9a-z]{7}-1713000000000-ab12c$/);
    expect(p1.wersje[0].dane).toMatchObject({ weightSource: 'gabinet', heightSource: 'gabinet', weight: 80, height: 160 });
    // Po zapisie: dawne punkty nie wracają drugi raz, także gdy migawka ma lustro dziennika (id = entryId).
    const s = D.zloz(zapisane(p1), [...MIGAWKA, { ...MIGAWKA[1], id: p1.entryId, weight: 74.6, dateISO: '2026-11-10' }]);
    expect(s.niezmigrowane).toEqual([]);
    expect(s.wpisy).toHaveLength(3);
    expect(s.punkty.map((p) => p.dateISO)).toEqual(['2026-04-14', '2026-10-13', '2026-11-10']);
  });

  it('punkt migawki bez daty przenosi się (dane sprzed R8), punkt bez masy zostaje w migawce', () => {
    const bez = [{ id: 'stary', type: 'start', ageYears: 40, ageMonths: 0, weight: 104, height: 170, dateISO: '' }, { id: 'pusty', type: 'continue', ageYears: 40, ageMonths: 3 }];
    const plan = D.planMigracji(D.zloz([], bez), PID);
    expect(plan).toHaveLength(1);
    const s = D.zloz(plan.map((v) => notatka(D.zakoduj(PID, v))), bez);
    expect(s.wpisy.filter((x) => x.stan === 'ok')).toHaveLength(1);
    expect(s.niezmigrowane.map((m) => m.id)).toEqual(['pusty']);
  });

  it('usunięty po przeniesieniu punkt nie wraca z migawki', () => {
    const plan = D.planNowego(D.zloz([], MIGAWKA), PID, dane());
    const po = zapisane(plan);
    const u = D.planUsuniecia(D.zloz(po, MIGAWKA), PID, plan.wersje[0].entryId);
    const s = D.zloz([...po, ...zapisane(u, '2026-11-12T08:00:00.000Z')], MIGAWKA);
    expect(s.niezmigrowane).toEqual([]);
    expect(s.punkty.map((p) => p.dateISO)).toEqual(['2026-10-13', '2026-11-10']);
  });
});

describe('planDzialania — monitor i Karta działają na punkcie projekcji', () => {
  const MIG = [
    { id: 'm-start', type: 'start', ageYears: 13, ageMonths: 0, weight: 80, height: 160, drug: WEGOVY, dose: '0,25 mg', dateISO: '2026-04-14' },
    { id: 'm-paz', type: 'continue', ageYears: 13, ageMonths: 6, weight: 75.2, height: 162.9, drug: WEGOVY, dose: '2,4 mg', dateISO: '2026-10-13' },
  ];
  it('poprawka punktu migawki: przeniesienie wszystkich dawnych punktów, potem poprawka przeniesionego wpisu', () => {
    const s = D.zloz([], MIG);
    const plan = D.planDzialania(s, PID, { rodzaj: 'popraw', id: 'm-paz', dane: dane({ dateISO: '2026-10-13', ageMonths: 6, weight: 75.0, weightSource: 'gabinet' }) });
    expect(plan.ok).toBe(true);
    expect(plan.wersje.map((v) => v.op)).toEqual(['migracja', 'migracja', 'poprawka']);
    const po = D.zloz(zapisane(plan), MIG);
    expect(po.niezmigrowane).toEqual([]);
    expect(po.punkty.map((p) => [p.dateISO, p.weight])).toEqual([['2026-04-14', 80], ['2026-10-13', 75]]);
    expect(plan.entryId).toMatch(/^otylm-.*-m-paz$/);
  });
  it('usunięcie punktu migawki: przeniesienie i wersja „usunięty” — punkt nie wraca z migawki', () => {
    const plan = D.planDzialania(D.zloz([], MIG), PID, { rodzaj: 'usun', id: 'm-start' });
    expect(plan.wersje.map((v) => v.op)).toEqual(['migracja', 'migracja', 'wycofanie']);
    const po = D.zloz(zapisane(plan), MIG);
    expect(po.punkty.map((p) => p.dateISO)).toEqual(['2026-10-13']);
    expect(po.wpisy.filter((x) => x.stan === 'usuniety')).toHaveLength(1);
  });
  it('dodanie i działanie na wpisie dziennika; nieznany punkt — odmowa', () => {
    const s = D.zloz([], MIG);
    const dodaj = D.planDzialania(s, PID, { rodzaj: 'dodaj', dane: dane() });
    expect(dodaj.wersje.map((v) => v.op)).toEqual(['migracja', 'migracja', 'zapis']);
    const po = D.zloz(zapisane(dodaj), MIG);
    const popraw = D.planDzialania(po, PID, { rodzaj: 'popraw', id: dodaj.entryId, dane: dane({ weight: 74.2 }) });
    expect(popraw.wersje.map((v) => v.op)).toEqual(['poprawka']);
    expect(D.planDzialania(po, PID, { rodzaj: 'usun', id: 'nie-ma' }).bledy).toEqual(['brak-wpisu']);
  });
});

describe('wiek w dniu pomiaru', () => {
  it('z daty urodzenia', () => {
    expect(D.wiekNaDzien('2026-11-10', { urodzenieISO: '2013-04-11' })).toEqual({ ageYears: 13, ageMonths: 6, zrodlo: 'urodzenie' });
    expect(D.wiekNaDzien('2026-11-11', { urodzenieISO: '2013-04-11' })).toEqual({ ageYears: 13, ageMonths: 7, zrodlo: 'urodzenie' });
  });
  it('bez daty urodzenia — z ostatniego wcześniejszego punktu i pełnych miesięcy między datami', () => {
    const punkty = [{ dateISO: '2026-04-14', ageYears: 13, ageMonths: 0 }, { dateISO: '2026-10-13', ageYears: 13, ageMonths: 6 }];
    expect(D.wiekNaDzien('2026-11-17', { punkty })).toEqual({ ageYears: 13, ageMonths: 7, zrodlo: 'punkt' });
    expect(D.wiekNaDzien('2026-11-12', { punkty })).toEqual({ ageYears: 13, ageMonths: 6, zrodlo: 'punkt' });
    expect(D.wiekNaDzien('2026-01-01', { punkty })).toBeNull();
    expect(D.wiekNaDzien('', { punkty })).toBeNull();
  });
});

// ── Flota: prawdziwy sejf, kilka urządzeń, także starsze wersje aplikacji ────────────────────────────────────

function magazyn() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; },
  };
}
function okno(starsza) {
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
  if (starsza) { zaladujRetencjeV1(win); (starsza === '221' ? zaladuj221 : zaladuj276)(win); } else loadBrowserScript('vilda_vault.js', win);
  loadBrowserScript('vilda_cykle_leczenia.js', win);
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  return { win, vault, D: win.VildaDziennikOtylosci };
}
let licznik = 0;
async function urzadzenie(nazwa, starsza = null) {
  licznik += 1;
  const u = okno(starsza);
  await u.vault.createUser(`Fikcyjne#Dziennik!${licznik}`, { label: `Fikcyjny ${nazwa} ${licznik}`, iterations: 10000 });
  u.nazwa = nazwa;
  return u;
}
let teraz = Date.parse('2026-11-18T08:00:00.000Z');
const krok = (ms = 60e3) => { teraz += ms; vi.setSystemTime(teraz); };
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(teraz); });
afterEach(() => { vi.useRealTimers(); });
async function wyslij(zrodlo, cel) {
  const ladunek = JSON.parse(JSON.stringify(await zrodlo.vault.exportSyncPayload()));
  krok(1000);
  return cel.vault.mergeSyncPayload(ladunek);
}
async function wymiana(urz) { for (const X of urz) for (const Y of urz) if (X !== Y) await wyslij(X, Y); }
// Dziennik pacjenta na urządzeniu — tylko nowa aplikacja go składa; starsza oddaje surowe notatki.
async function dziennik(U, patientId, migawka = []) {
  return U.D.zloz(await U.vault.listPatientNotesForPatient(patientId), migawka);
}
const PACJENTKA = { name: 'Fikcyjna Zuzanna', user: { sex: 'F', age: 13, height: 160, weight: 80 } };

describe('flota: wpisy na prawdziwym sejfie, kilka urządzeń', () => {
  it('nowy wpis przechodzi przez synchronizację; zapis jednorazowy — powtórka niczego nie zmienia', async () => {
    const A = await urzadzenie('A'); const B = await urzadzenie('B');
    krok(); const pid = (await A.vault.savePatient(PACJENTKA, { dedup: false })).patientId;
    await wyslij(A, B);
    krok();
    const plan = A.D.planNowego(await dziennik(A, pid), pid, dane());
    await A.D.zapisz(pid, plan.wersje, { vault: A.vault });
    await A.D.zapisz(pid, plan.wersje, { vault: A.vault }); // ponowienie po zgubionym potwierdzeniu
    await wymiana([A, B]);
    for (const U of [A, B]) {
      const s = await dziennik(U, pid);
      expect(s.wpisy.map((x) => [x.stan, x.punkt.weight, x.punkt.weightSource]), U.nazwa).toEqual([['ok', 74.6, 'pacjent']]);
    }
  });

  it('równoległa poprawka na dwóch urządzeniach — konflikt widoczny na obu; wybór na jednym rozstrzyga wszędzie', async () => {
    const A = await urzadzenie('A'); const B = await urzadzenie('B');
    krok(); const pid = (await A.vault.savePatient(PACJENTKA, { dedup: false })).patientId;
    const p0 = A.D.planNowego(await dziennik(A, pid), pid, dane());
    await A.D.zapisz(pid, p0.wersje, { vault: A.vault });
    await wymiana([A, B]);
    krok(); await A.D.zapisz(pid, A.D.planPoprawki(await dziennik(A, pid), pid, p0.entryId, dane({ weight: 74.1 })).wersje, { vault: A.vault });
    krok(); await B.D.zapisz(pid, B.D.planPoprawki(await dziennik(B, pid), pid, p0.entryId, dane({ weight: 74.4 })).wersje, { vault: B.vault });
    await wymiana([A, B]);
    for (const U of [A, B]) {
      const s = await dziennik(U, pid);
      expect(s.wpisy[0].stan, U.nazwa).toBe('konflikt');
      expect(s.wpisy[0].liscie.map((v) => v.dane.weight).sort(), U.nazwa).toEqual([74.1, 74.4]);
    }
    const sA = await dziennik(A, pid);
    const wybrana = sA.wpisy[0].liscie.find((v) => v.dane.weight === 74.4);
    krok(); await A.D.zapisz(pid, A.D.planRozstrzygniecia(sA, pid, p0.entryId, wybrana.id).wersje, { vault: A.vault });
    await wymiana([A, B]);
    for (const U of [A, B]) {
      const s = await dziennik(U, pid);
      expect([s.wpisy[0].stan, s.punkty[0].weight], U.nazwa).toEqual(['ok', 74.4]);
    }
  });

  it('przeniesienie dawnych punktów jednocześnie na dwóch urządzeniach — bez duplikatów', async () => {
    const A = await urzadzenie('A'); const B = await urzadzenie('B');
    krok(); const pid = (await A.vault.savePatient(PACJENTKA, { dedup: false })).patientId;
    const migawka = [{ id: 'p-start', type: 'start', ageYears: 13, ageMonths: 0, weight: 80, height: 160, drug: WEGOVY, dose: '0,25 mg', dateISO: '2026-04-14' }];
    krok(); await A.D.zapisz(pid, A.D.planNowego(await dziennik(A, pid, migawka), pid, dane()).wersje, { vault: A.vault });
    krok(); await B.D.zapisz(pid, B.D.planNowego(await dziennik(B, pid, migawka), pid, dane({ dateISO: '2026-11-17', weight: 74.3 })).wersje, { vault: B.vault });
    await wymiana([A, B]);
    for (const U of [A, B]) {
      const s = await dziennik(U, pid, migawka);
      expect(s.punkty.map((p) => [p.dateISO, p.weight]), U.nazwa).toEqual([['2026-04-14', 80], ['2026-11-10', 74.6], ['2026-11-17', 74.3]]);
      expect(s.niezmigrowane, U.nazwa).toEqual([]);
    }
  });

  it.each([['276'], ['221']])('starsza aplikacja (sejf %s) przekazuje wpisy dalej bez strat — także po oznaczeniu notatki jako wykonanej', async (wersja) => {
    const A = await urzadzenie('A'); const S = await urzadzenie('S', wersja); const C = await urzadzenie('C');
    krok(); const pid = (await A.vault.savePatient(PACJENTKA, { dedup: false })).patientId;
    const p0 = A.D.planNowego(await dziennik(A, pid), pid, dane({ height: 163.4, heightSource: 'pacjent' }));
    await A.D.zapisz(pid, p0.wersje, { vault: A.vault });
    await wyslij(A, S);
    // Starsza aplikacja widzi zwykłą notatkę z czytelną pierwszą linią.
    const surowa = (await S.vault.listPatientNotesForPatient(pid)).find((n) => n.category === 'leczenie-otylosci');
    expect(surowa.title).toBe('Leczenie otyłości — Kontynuacja 10.11.2026');
    expect(surowa.body.split('\n')[0]).toContain('masa 74,6 kg (pacjent) · wzrost 163,4 cm (pacjent)');
    // Lekarz na starszym urządzeniu oznacza ją „wykonane” — zapis przebudowuje notatkę z białej listy pól.
    krok(); await S.vault.completePatientNote(surowa.id);
    // Urządzenie C dostaje dane WYŁĄCZNIE od starszej aplikacji.
    await wyslij(S, C);
    const s = await dziennik(C, pid);
    expect(s.nieczytelne).toEqual([]);
    expect(s.wpisy.map((x) => [x.stan, x.punkt.weight, x.punkt.height, x.punkt.heightSource])).toEqual([['ok', 74.6, 163.4, 'pacjent']]);
  });
});
