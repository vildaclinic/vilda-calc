// P-SYNC-WLASCICIEL (E3-PR0e2b, reguła Kosza) — poprawka wizyty przeniesionej „Scal pacjentów”, leżącej w Koszu karty
// scalonej, wraca do karty scalonej. Decyzja właściciela 2b z 2026-11-25: gdy wizyta przeniesiona „Scal pacjentów” leży
// w Koszu pod kartą scaloną (wpis Kosza zna scalenie — ma późniejszą chwilę przypisania niż kopia z ładunku), a
// urządzenie bez wiedzy o scaleniu poprawia ją (albo oznacza gwiazdką) w starej karcie później niż Kosz, wizyta wychodzi
// z Kosza w karcie scalonej (z poprawką), a stara karta nie wraca z jej powodu. Zasada „późniejsza poprawka wygrywa
// z Koszem” bez zmian — zmienia się tylko karta. Nowe wizyty i notatki w starej karcie dalej ją zwracają; wpisy Kosza
// bez chwili przypisania (sprzed wydania) — jak dotąd. Reguła stoi na pamięci wpisu Kosza (część Kosza,
// tests/unit/kosz-chwila-przypisania.test.mjs); cały plik wyłącza się jednym ruchem:
// POPRAWKA_PO_KOSZU_W_KARCIE_SCALONEJ = false (tests/support/czesci-wydania.mjs; false także przy wyłączonej części Kosza).
//
// Świat podstawowy (dane fikcyjne): K „Scal pacjentów” X → Y (wizyta v 20 kg, druga wizyta 21 kg) i daje v do Kosza pod
// Y; T (bliźniak sprzed scalenia, bez wiedzy o nim) poprawia v w starej X na 44 kg później niż Kosz. Dostawy: zdarzenia
// (koperty K: wersje Y, nagrobek X, wpis Kosza v; koperta T: wersja v) w obu kolejnościach — stan W1; potem cztery pełne
// wymiany — W4; także same pełne wymiany (T → K pierwsza i K → T pierwsza). Urządzenie poprawiające (T) po samych
// zdarzeniach ma dalej swoją X z poprawką — przeniesie ją do Y przy najbliższej pełnej wymianie (droga przeniesienia
// z chwilą przypisania, którą widzi ochrona planów opieki); to nie powrót karty (T jej nie usunął).
//
// PRZYPADKI (na bazie 30008d8f czerwone: X wraca z poprawioną wizytą na K i T, a jej „Usuń pacjenta” kasuje wizytę;
// zielone z natury — kontrole, każda z mutantem reguły obok): poprawka (cztery dostawy), gwiazdka, „Przywróć” w starej
// karcie zamiast poprawki (T dał wizytę do Kosza w X przed scaleniem), zegar T +3 min,
// dwie poprawki, łańcuch X → Y → Z (także T znający X → Y), nowa wizyta obok poprawki (X wraca z nową, poprawka w Y),
// notatka obok poprawki (decyzja właściciela z 2026-11-25), wizyta przypięta i „Odepnij i usuń”, „Usuń pacjenta” X na T
// przed pełną wymianą, trzy urządzenia, dwa niezależne scalenia (też stan po pierwszej pełnej wymianie), „Przywróć”
// po regule, liczniki scalania (z liczbą pominiętych), wyścigi
// z drugą kartą przeglądarki, karta wpisu bez rekordu i karta wpisu usunięta na trzecim urządzeniu; kontrole: zegar T
// −3 min i −90 s (Kosz wygrywa), wpis Kosza bez chwili przypisania (mutant: każdy wpis Kosza pod Q), T zna scalenie,
// „Usuń pacjenta” Y przed poprawką, Kosz pod Y i Y → Z (karta wpisu w zbiorze N), „Przywróć” przed poprawką, import pliku
// i „Scal kopię konta” (poza regułą), odtworzenie konta, starsza aplikacja (276) z Koszem, wpis samego przycięcia
// z chwilą przypisania (nie Kosz), karta wpisu = karta z ładunku (dwa scalenia do tej samej karty), adapter bez
// magazynu nagrobków kart.
// Prawdziwy vilda_vault.js w uprzęży tests/support/urzadzenie-sync.mjs; dane WYŁĄCZNIE FIKCYJNE („Testowy Jan…”), bez PESEL.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { utworzAtrapeWorkera, zegarSterowany } from '../support/atrapa-workera-sync.mjs';
import { sprzatnijUrzadzenia, utworzUrzadzenie } from '../support/urzadzenie-sync.mjs';
import { zrodlaStarszej } from '../support/starsza-aplikacja.mjs';
import { POPRAWKA_PO_KOSZU_W_KARCIE_SCALONEJ } from '../support/czesci-wydania.mjs';
import { naglowek } from './sesja-zapisu-uprzaz.mjs';

const HASLO = 'Vilda#Przypisanie!2026abc';
const START = Date.parse('2026-03-02T08:00:00.000Z');
const MIN = 60_000;
const CZAS = 120_000;
const POLE = 'assignedAtISO';

let teraz = START;
let atrapa = null;
const ustaw = (ms) => { teraz = ms; vi.setSystemTime(teraz); };
const krok = (ms = MIN) => ustaw(teraz + ms);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  ustaw(START);
  atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: false, zegar: zegarSterowany() });
});
afterEach(async () => {
  await sprzatnijUrzadzenia();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ── Uprząż ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const urzadzenie = (nazwa, o = {}) => utworzUrzadzenie({ atrapa, nazwa, sync: false, rejestrMagazynu: false, haslo: HASLO, ...o });
const blizniak = (d, nazwa, o = {}) => urzadzenie(nazwa, { zBlizniaka: d, ...o });
const json = (x) => JSON.parse(JSON.stringify(x));
const uid = (d) => d.vault.getCurrentUser().userId;
const rek = (d, sid) => d.adapter.getSnapshotForUser(uid(d), sid);
const maPole = (o) => !!o && Object.prototype.hasOwnProperty.call(o, POLE);
async function wstaw(d, sid, wartosc) {
  const r = await rek(d, sid);
  expect(r, 'kontrola: rekord wersji').toBeTruthy();
  const n = { ...r };
  if (wartosc === undefined) delete n[POLE]; else n[POLE] = wartosc;
  await d.adapter.putSnapshotForUser(uid(d), n);
}
const eksport = async (d) => json(await d.vault.exportSyncPayload());
const scal = async (z, na) => na.vault.mergeSyncPayload(await eksport(z));
async function karta(d, i = 1, masy = [22]) {
  const ids = [];
  let P = null;
  for (const m of masy) {
    krok();
    const r = await d.vault.savePatient(naglowek(i, { masa: m }), { dedup: false, ...(P ? { patientId: P } : {}) });
    P = r.patientId;
    ids.push(r.snapshotId);
  }
  return { P, ids };
}
async function wersja(d, sid) {
  const r = await rek(d, sid);
  if (!r) return null;
  const p = await d.vault.getPatient(r.patientId);
  return (p && p.snapshots.find((s) => s.snapshotId === sid)) || null;
}
// Akcja urządzenia z zegarem przesuniętym o `off` ms (wspólny sztuczny zegar procesu: przesunięcie na czas akcji).
async function zZegarem(off, f) { ustaw(teraz + off); try { return await f(); } finally { ustaw(teraz - off); } }
async function popraw(d, sid, masa, off = 0) {
  krok();
  await zZegarem(off, async () => {
    const r = await rek(d, sid);
    const s = await wersja(d, sid);
    await d.vault.updateSnapshotPayload(r.patientId, sid, { ...s.payload, user: { ...s.payload.user, weight: masa } }, { preserveSavedAt: true });
  });
}
async function gwiazdka(d, sid, off = 0) {
  krok();
  await zZegarem(off, async () => { const r = await rek(d, sid); await d.vault.setSnapshotPinned(r.patientId, sid, true); });
}
async function koszWpisy(d, sid) {
  const m = await d.adapter.getUserMeta(uid(d));
  return ((m && m.snapshotTombstones) || []).filter((e) => e && e.snapshotId === sid);
}
// Stan urządzenia: karty (etykiety) z masami wersji (v — oznaczona, * — gwiazdka), notatki (widoczna — pod istniejącą
// kartą), położenie v z informacją o chwili przypisania, wpisy Kosza v.
async function stanU(d, et, sid) {
  const karty = {};
  for (const k of await d.adapter.listPatientsForUser(uid(d))) {
    const p = await d.vault.getPatient(k.patientId);
    karty[et[k.patientId] || '?'] = (p ? p.snapshots : []).map((s) => (s.snapshotId === sid ? 'v:' : '') + s.payload.user.weight + (s.payload._pinned ? '*' : '')).sort();
  }
  const r = await rek(d, sid);
  const kosz = (await koszWpisy(d, sid)).map((e) => `${et[e.patientId] || '?'}${maPole(e) ? ' z chwilą' : ''}`);
  const ids = new Set((await d.adapter.listPatientsForUser(uid(d))).map((k) => k.patientId));
  const notatki = (await d.adapter.listPatientNotesForUser(uid(d))).map((n) => `${ids.has(n.patientId) ? 'widoczna w' : 'bez karty, zapisana pod'} ${et[n.patientId] || '?'}`);
  return { karty, ...(notatki.length ? { notatki } : {}), v: r ? `${et[r.patientId] || '?'}${maPole(r) ? ' z chwilą' : ''}` : null, kosz };
}
const blad = async (f) => { try { await f(); return null; } catch (e) { return (e && (e.code || e.message)) || 'błąd'; } };
// Koperty urządzenia (wersje kart, nagrobki kart, wpisy Kosza) zaszyfrowane jak z kolejki.
async function koperty(d, { wersje = [], nagrobki = [], kosz = [] }) {
  const ev = d.vault._eventLog;
  const z = async (k) => (await ev.encryptEvent(k)).env;
  const out = [];
  for (const [P, sid] of wersje) out.push(await z(await ev.buildSnapshotEvent(P, sid, null)));
  for (const P of nagrobki) out.push(await z(await ev.buildPatientTombstoneEvent(P, null)));
  for (const sid of kosz) out.push(await z(await ev.buildSnapshotTombstoneEvent(sid, null)));
  return out;
}
async function stosuj(d, lista) { const r = []; for (const env of lista) { krok(); r.push((await d.vault._eventLog.applyEncryptedEvent(env)).status); } return r; }
const wersjeKarty = async (d, P) => (await d.adapter.listSnapshotsForUser(uid(d), P)).map((s) => [P, s.snapshotId]);
async function pelne(pary) { const w = []; for (const [z, na] of pary) { krok(); w.push(await blad(() => scal(z, na))); } return w.filter(Boolean); }

// Świat: opcje — zmiana ('poprawka' | 'gwiazdka' | 'przywroc' — T dał v do Kosza w X przed scaleniem i przywraca ją
// tam później niż Kosz K), offT (zegar T), bezPola (wpis Kosza bez chwili przypisania — dane
// sprzed wydania), znaScalenie (T dostaje pełną kopię K po scaleniu, przed Koszem — zmienia v w Y), nowa (T zapisuje też
// nową wizytę w X), notatka (T dopisuje notatkę w X), gwiazdkaK (v przypięta przed scaleniem; K „Odepnij i usuń”), dwa
// (T poprawia dwa razy), usunY (K „Usuń pacjenta” Y po Koszu), lancuch (K scala X → Y → Z, Kosz pod Z), znaPierwsze
// (T dostaje pełną kopię K po X → Y), koszPrzedDrugim (Kosz pod Y, potem K scala Y → Z), Tstary/Kstary (sejf 276).
// Nowy świat w tym samym przypadku: urządzenia poprzedniego sprzątnięte, nowa atrapa, zegar od początku.
async function nowySwiat() {
  await sprzatnijUrzadzenia();
  ustaw(START);
  atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: false, zegar: zegarSterowany() });
}
async function swiat(o = {}) {
  await nowySwiat();
  const K = await urzadzenie('K', o.Kstary ? { zrodla: zrodlaStarszej('S276') } : {});
  const { P: X, ids: [v] } = await karta(K, 1, [20, 21]);
  const { P: Y } = await karta(K, 2, [30]);
  const Z = o.lancuch ? (await karta(K, 3, [40])).P : null;
  if (o.gwiazdkaK) { krok(); await K.vault.setSnapshotPinned(X, v, true); }
  const T = await blizniak(K, 'T', o.Tstary ? { zrodla: zrodlaStarszej('S276') } : {});
  const et = { [X]: 'X', [Y]: 'Y', ...(Z ? { [Z]: 'Z' } : {}) };
  if (o.zmiana === 'przywroc') { krok(); await T.vault.moveSnapshotToTrash(X, v); }
  krok(); await K.vault.mergePatients(X, Y);
  if (o.znaPierwsze) { krok(); await scal(K, T); }
  if (o.lancuch && !o.koszPrzedDrugim) { krok(); await K.vault.mergePatients(Y, Z); }
  const Q = o.lancuch && !o.koszPrzedDrugim ? Z : Y;
  if (o.bezPola) await wstaw(K, v, undefined);
  if (o.znaScalenie) { krok(); await scal(K, T); }
  krok(); await K.vault.moveSnapshotToTrash(Q, v, o.gwiazdkaK ? { odepnij: true } : undefined);
  if (o.usunY) { krok(); await K.vault.removePatient(Q); }
  if (o.koszPrzedDrugim) { krok(); await K.vault.mergePatients(Y, Z); }
  if ((o.zmiana || 'poprawka') === 'poprawka') await popraw(T, v, 44, o.offT || 0);
  else if (o.zmiana === 'przywroc') { krok(); await T.vault.restoreTrashedSnapshot(X, v); }
  else await gwiazdka(T, v, o.offT || 0);
  if (o.dwa) await popraw(T, v, 45, o.offT || 0);
  if (o.notatka) { krok(); await T.vault.savePatientNote({ patientId: X, title: 'Notatka N', body: 'Fikcyjna treść', category: 'inne' }); }
  let n2 = null;
  if (o.nowa) { krok(); n2 = (await T.vault.savePatient(naglowek(1, { masa: 55 }), { dedup: false, patientId: X })).snapshotId; }
  return { K, T, X, Y, Z, Q, v, n2, et, wpis: (await koszWpisy(K, v)).map((e) => (maPole(e) ? 'z chwilą' : 'bez chwili')) };
}
// Przebieg: dostawa ('zdarzenia T→K' | 'zdarzenia K→T' | 'pełne T→K' | 'pełne K→T') — W1, potem cztery pełne wymiany — W4.
async function przebieg(o, dostawa) {
  const s = await swiat(o);
  const { K, T, X, Q, v, n2, et } = s;
  let bl = [];
  if (dostawa.startsWith('zdarzenia')) {
    const kart = o.koszPrzedDrugim ? s.Z : Q;
    const zK = await koperty(K, { wersje: await wersjeKarty(K, kart), nagrobki: [X, ...(o.lancuch ? [s.Y] : []), ...(o.usunY ? [Q] : [])].filter((x, i, t) => t.indexOf(x) === i), kosz: [v] });
    const kv = (await rek(T, v)).patientId;
    const zT = await koperty(T, { wersje: [[kv, v], ...(n2 ? [[X, n2]] : [])] });
    if (dostawa.endsWith('T→K')) { await stosuj(K, zT); await stosuj(T, zK); } else { await stosuj(T, zK); await stosuj(K, zT); }
  } else {
    bl = bl.concat(await pelne(dostawa.endsWith('T→K') ? [[T, K], [K, T]] : [[K, T], [T, K]]));
  }
  const W1 = { K: await stanU(K, et, v), T: await stanU(T, et, v) };
  if (o.usunXnaT && await T.adapter.getPatientForUser(uid(T), X)) { krok(); bl.push(await blad(() => T.vault.removePatient(X))); }
  bl = bl.concat(await pelne([[K, T], [T, K], [K, T], [T, K]]));
  const W4 = { K: await stanU(K, et, v), T: await stanU(T, et, v) };
  return { wpis: s.wpis, W1, W4, bledy: bl.filter(Boolean) };
}
const DOSTAWY = ['zdarzenia T→K', 'zdarzenia K→T', 'pełne T→K', 'pełne K→T'];
const D2 = ['zdarzenia T→K', 'pełne K→T'];
// Światy i dostawy; kontrola — wynik jak bez reguły (zasada Kosza, wpis sprzed wydania, zwykła droga, ograniczenia).
const SWIATY = {
  'poprawka w X później niż Kosz': { o: {}, dostawy: DOSTAWY },
  'gwiazdka w X zamiast poprawki': { o: { zmiana: 'gwiazdka' }, dostawy: D2 },
  // „Przywróć” w starej karcie (T dał v do Kosza w X przed scaleniem, przywraca ją później niż Kosz K pod Y) — późniejsza
  // zmiana wersji jak poprawka: v wychodzi z Kosza w Y, X nie wraca (na bazie 30008d8f X wracała z v na K i T).
  '„Przywróć” w X zamiast poprawki (T dał v do Kosza w X przed scaleniem)': { o: { zmiana: 'przywroc' }, dostawy: D2 },
  'zegar T +3 min': { o: { offT: 3 * MIN }, dostawy: D2 },
  'T poprawia dwa razy': { o: { dwa: true }, dostawy: D2 },
  'łańcuch X → Y → Z, Kosz pod Z': { o: { lancuch: true }, dostawy: D2 },
  'łańcuch, T zna X → Y (poprawia v w Y)': { o: { lancuch: true, znaPierwsze: true }, dostawy: D2 },
  'nowa wizyta w X obok poprawki: X wraca z nową wizytą, poprawka w Y': { o: { nowa: true }, dostawy: D2 },
  'notatka w X obok poprawki (decyzja właściciela z 2026-11-25): poprawka w Y, notatka zapisana bez widocznej karty': { o: { notatka: true }, dostawy: D2 },
  'v przypięta przed scaleniem, K „Odepnij i usuń” pod Y, T poprawia w X: v w Y bez gwiazdki': { o: { gwiazdkaK: true }, dostawy: D2 },
  'T „Usuń pacjenta” X po pierwszej dostawie: v zostaje w Y': { o: { usunXnaT: true }, dostawy: ['zdarzenia T→K', 'zdarzenia K→T'] },
  '[kontrola] zegar T −3 min (poprawka według zegara przed Koszem): Kosz wygrywa': { o: { offT: -3 * MIN }, dostawy: D2, kontrola: true },
  '[kontrola] zegar T −90 s (poprawka według zegara przed Koszem): Kosz wygrywa': { o: { offT: -90_000 }, dostawy: D2, kontrola: true },
  '[kontrola] wpis Kosza bez chwili przypisania (sprzed wydania): jak dotąd, X wraca': { o: { bezPola: true }, dostawy: D2, kontrola: true },
  '[kontrola] T zna scalenie (poprawia v w Y): zwykła droga': { o: { znaScalenie: true }, dostawy: D2, kontrola: true },
  '[kontrola] „Usuń pacjenta” Y przed dotarciem poprawki: X wraca z v, nic nie ginie': { o: { usunY: true }, dostawy: D2, kontrola: true },
  '[kontrola] Kosz pod Y, potem K scala Y → Z (karta wpisu scalona dalej): jak dotąd, X wraca': { o: { lancuch: true, koszPrzedDrugim: true }, dostawy: D2, kontrola: true },
  '[kontrola] starsza aplikacja (276) jako K — wpis Kosza bez chwili: jak dotąd': { o: { Kstary: true }, dostawy: ['pełne T→K'], kontrola: true },
  // Starsza aplikacja jako T rozstrzyga wersję wspólną dwom kartom starą regułą (bez chwili przypisania; przy remisie
  // mniejszy identyfikator karty — losowy), więc literał obejmuje K (bieżące urządzenie) i obecność poprawki na T.
  'starsza aplikacja (276) jako T (poprawia bez wiedzy o scaleniu): K — v z poprawką w Y, X nie wraca': { o: { Tstary: true }, dostawy: ['pełne T→K'], tylkoK: true },
};

describe.skipIf(!POPRAWKA_PO_KOSZU_W_KARCIE_SCALONEJ)('poprawka wizyty przeniesionej „Scal pacjentów”, leżącej w Koszu karty scalonej, wraca do karty scalonej (decyzja właściciela 2b z 2026-11-25)', () => {
  for (const [nazwa, sw] of Object.entries(SWIATY)) {
    for (const dostawa of sw.dostawy) {
      it(`${nazwa} — ${dostawa}: literał stanu K i T po dostawie (W1) i po pełnych wymianach (W4)`, async () => {
        const p = await przebieg(sw.o, dostawa);
        const naT = (st) => Object.values(st.karty).flat().filter((x) => x.startsWith('v:'));
        const w = sw.tylkoK ? { wpis: p.wpis, W1: { K: p.W1.K }, W4: { K: p.W4.K }, poprawkaNaT: [naT(p.W1.T), naT(p.W4.T)], bledy: p.bledy } : p;
        expect(w).toEqual(OCZEKIWANE[`${nazwa} — ${dostawa}`]);
      }, CZAS);
    }
  }
});
// Literały (zmierzone na kodzie z regułą; na bazie 30008d8f — poza kontrolami — X wraca z v na K i T).
const OCZEKIWANE = {
  'poprawka w X później niż Kosz — zdarzenia T→K': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  'poprawka w X później niż Kosz — zdarzenia K→T': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  'poprawka w X później niż Kosz — pełne T→K': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  'poprawka w X później niż Kosz — pełne K→T': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  'gwiazdka w X zamiast poprawki — zdarzenia T→K': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:20*'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['v:20*'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:20*'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:20*'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  'gwiazdka w X zamiast poprawki — pełne K→T': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:20*'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['v:20*'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:20*'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:20*'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  '„Przywróć” w X zamiast poprawki (T dał v do Kosza w X przed scaleniem) — zdarzenia T→K': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:20'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['v:20'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:20'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:20'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  '„Przywróć” w X zamiast poprawki (T dał v do Kosza w X przed scaleniem) — pełne K→T': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:20'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['v:20'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:20'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:20'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  'zegar T +3 min — zdarzenia T→K': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  'zegar T +3 min — pełne K→T': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  'T poprawia dwa razy — zdarzenia T→K': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:45'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['v:45'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:45'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:45'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  'T poprawia dwa razy — pełne K→T': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:45'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['v:45'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:45'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:45'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  'łańcuch X → Y → Z, Kosz pod Z — zdarzenia T→K': { wpis: ['z chwilą'], W1: { K: { karty: { Z: ['21', '30', '30', '40', '40', 'v:44'] }, v: 'Z z chwilą', kosz: [] }, T: { karty: { X: ['v:44'], Z: ['21', '30', '30', '40', '40'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Z: ['21', '30', '30', '40', '40', 'v:44'] }, v: 'Z z chwilą', kosz: [] }, T: { karty: { Z: ['21', '30', '30', '40', '40', 'v:44'] }, v: 'Z z chwilą', kosz: [] } }, bledy: [] },
  'łańcuch X → Y → Z, Kosz pod Z — pełne K→T': { wpis: ['z chwilą'], W1: { K: { karty: { Z: ['21', '30', '30', '40', '40', 'v:44'] }, v: 'Z z chwilą', kosz: [] }, T: { karty: { X: ['v:44'], Z: ['21', '30', '30', '40', '40'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Z: ['21', '30', '30', '40', '40', 'v:44'] }, v: 'Z z chwilą', kosz: [] }, T: { karty: { Z: ['21', '30', '30', '40', '40', 'v:44'] }, v: 'Z z chwilą', kosz: [] } }, bledy: [] },
  'łańcuch, T zna X → Y (poprawia v w Y) — zdarzenia T→K': { wpis: ['z chwilą'], W1: { K: { karty: { Z: ['21', '30', '30', '40', '40', 'v:44'] }, v: 'Z z chwilą', kosz: [] }, T: { karty: { Y: ['v:44'], Z: ['21', '30', '30', '40', '40'] }, v: 'Y z chwilą', kosz: [] } }, W4: { K: { karty: { Z: ['21', '30', '30', '40', '40', 'v:44'] }, v: 'Z z chwilą', kosz: [] }, T: { karty: { Z: ['21', '30', '30', '40', '40', 'v:44'] }, v: 'Z z chwilą', kosz: [] } }, bledy: [] },
  'łańcuch, T zna X → Y (poprawia v w Y) — pełne K→T': { wpis: ['z chwilą'], W1: { K: { karty: { Z: ['21', '30', '30', '40', '40', 'v:44'] }, v: 'Z z chwilą', kosz: [] }, T: { karty: { Y: ['v:44'], Z: ['21', '30', '30', '40', '40'] }, v: 'Y z chwilą', kosz: [] } }, W4: { K: { karty: { Z: ['21', '30', '30', '40', '40', 'v:44'] }, v: 'Z z chwilą', kosz: [] }, T: { karty: { Z: ['21', '30', '30', '40', '40', 'v:44'] }, v: 'Z z chwilą', kosz: [] } }, bledy: [] },
  'nowa wizyta w X obok poprawki: X wraca z nową wizytą, poprawka w Y — zdarzenia T→K': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:44'], X: ['55'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['55', 'v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:44'], X: ['55'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['55'], Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  'nowa wizyta w X obok poprawki: X wraca z nową wizytą, poprawka w Y — pełne K→T': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:44'], X: ['55'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['55', 'v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:44'], X: ['55'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['55'], Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  'notatka w X obok poprawki (decyzja właściciela z 2026-11-25): poprawka w Y, notatka zapisana bez widocznej karty — zdarzenia T→K': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, notatki: ['widoczna w X'], v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, notatki: ['bez karty, zapisana pod X'], v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, notatki: ['bez karty, zapisana pod X'], v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  'notatka w X obok poprawki (decyzja właściciela z 2026-11-25): poprawka w Y, notatka zapisana bez widocznej karty — pełne K→T': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, notatki: ['bez karty, zapisana pod X'], v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, notatki: ['widoczna w X'], v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, notatki: ['bez karty, zapisana pod X'], v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, notatki: ['bez karty, zapisana pod X'], v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  'v przypięta przed scaleniem, K „Odepnij i usuń” pod Y, T poprawia w X: v w Y bez gwiazdki — zdarzenia T→K': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  'v przypięta przed scaleniem, K „Odepnij i usuń” pod Y, T poprawia w X: v w Y bez gwiazdki — pełne K→T': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  'T „Usuń pacjenta” X po pierwszej dostawie: v zostaje w Y — zdarzenia T→K': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  'T „Usuń pacjenta” X po pierwszej dostawie: v zostaje w Y — zdarzenia K→T': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  '[kontrola] zegar T −3 min (poprawka według zegara przed Koszem): Kosz wygrywa — zdarzenia T→K': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30'] }, v: null, kosz: ['Y z chwilą'] }, T: { karty: { Y: ['21', '30', '30'] }, v: null, kosz: ['Y z chwilą'] } }, W4: { K: { karty: { Y: ['21', '30', '30'] }, v: null, kosz: ['Y z chwilą'] }, T: { karty: { Y: ['21', '30', '30'] }, v: null, kosz: ['Y z chwilą'] } }, bledy: [] },
  '[kontrola] zegar T −3 min (poprawka według zegara przed Koszem): Kosz wygrywa — pełne K→T': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30'] }, v: null, kosz: ['Y z chwilą'] }, T: { karty: { Y: ['21', '30', '30'] }, v: null, kosz: ['Y z chwilą'] } }, W4: { K: { karty: { Y: ['21', '30', '30'] }, v: null, kosz: ['Y z chwilą'] }, T: { karty: { Y: ['21', '30', '30'] }, v: null, kosz: ['Y z chwilą'] } }, bledy: [] },
  '[kontrola] zegar T −90 s (poprawka według zegara przed Koszem): Kosz wygrywa — zdarzenia T→K': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30'] }, v: null, kosz: ['Y z chwilą'] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: ['Y z chwilą'] } }, W4: { K: { karty: { Y: ['21', '30', '30'] }, v: null, kosz: ['Y z chwilą'] }, T: { karty: { Y: ['21', '30', '30'] }, v: null, kosz: ['Y z chwilą'] } }, bledy: [] },
  '[kontrola] zegar T −90 s (poprawka według zegara przed Koszem): Kosz wygrywa — pełne K→T': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30'] }, v: null, kosz: ['Y z chwilą'] }, T: { karty: { Y: ['21', '30', '30'] }, v: null, kosz: ['Y z chwilą'] } }, W4: { K: { karty: { Y: ['21', '30', '30'] }, v: null, kosz: ['Y z chwilą'] }, T: { karty: { Y: ['21', '30', '30'] }, v: null, kosz: ['Y z chwilą'] } }, bledy: [] },
  '[kontrola] wpis Kosza bez chwili przypisania (sprzed wydania): jak dotąd, X wraca — zdarzenia T→K': { wpis: ['bez chwili'], W1: { K: { karty: { Y: ['21', '30', '30'], X: ['v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30'], X: ['v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, bledy: [] },
  '[kontrola] wpis Kosza bez chwili przypisania (sprzed wydania): jak dotąd, X wraca — pełne K→T': { wpis: ['bez chwili'], W1: { K: { karty: { Y: ['21', '30', '30'], X: ['v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30'], X: ['v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, bledy: [] },
  '[kontrola] T zna scalenie (poprawia v w Y): zwykła droga — zdarzenia T→K': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  '[kontrola] T zna scalenie (poprawia v w Y): zwykła droga — pełne K→T': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, bledy: [] },
  '[kontrola] „Usuń pacjenta” Y przed dotarciem poprawki: X wraca z v, nic nie ginie — zdarzenia T→K': { wpis: ['z chwilą'], W1: { K: { karty: { X: ['v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['21', 'v:44'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { X: ['21', 'v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['21', 'v:44'] }, v: 'X', kosz: [] } }, bledy: [] },
  '[kontrola] „Usuń pacjenta” Y przed dotarciem poprawki: X wraca z v, nic nie ginie — pełne K→T': { wpis: ['z chwilą'], W1: { K: { karty: { X: ['21', 'v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['21', 'v:44'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { X: ['21', 'v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['21', 'v:44'] }, v: 'X', kosz: [] } }, bledy: [] },
  '[kontrola] Kosz pod Y, potem K scala Y → Z (karta wpisu scalona dalej): jak dotąd, X wraca — zdarzenia T→K': { wpis: ['z chwilą'], W1: { K: { karty: { Z: ['21', '30', '30', '40', '40'], X: ['v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['v:44'], Z: ['21', '30', '30', '40', '40'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Z: ['21', '30', '30', '40', '40'], X: ['v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['v:44'], Z: ['21', '30', '30', '40', '40'] }, v: 'X', kosz: [] } }, bledy: [] },
  '[kontrola] Kosz pod Y, potem K scala Y → Z (karta wpisu scalona dalej): jak dotąd, X wraca — pełne K→T': { wpis: ['z chwilą'], W1: { K: { karty: { Z: ['21', '30', '30', '40', '40'], X: ['v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['v:44'], Z: ['21', '30', '30', '40', '40'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Z: ['21', '30', '30', '40', '40'], X: ['v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['v:44'], Z: ['21', '30', '30', '40', '40'] }, v: 'X', kosz: [] } }, bledy: [] },
  '[kontrola] starsza aplikacja (276) jako K — wpis Kosza bez chwili: jak dotąd — pełne T→K': { wpis: ['bez chwili'], W1: { K: { karty: { Y: ['21', '30', '30'], X: ['v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30'], X: ['v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['v:44'], Y: ['21', '30', '30'] }, v: 'X', kosz: [] } }, bledy: [] },
  'starsza aplikacja (276) jako T (poprawia bez wiedzy o scaleniu): K — v z poprawką w Y, X nie wraca — pełne T→K': { wpis: ['z chwilą'], W1: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, W4: { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } }, poprawkaNaT: [['v:44'], ['v:44']], bledy: [] },
};

// Pułapka na wywołaniu magazynu urządzenia (jak w tests/unit/sync-chwila-przypisania.test.mjs): pierwsze wywołanie
// metody spełniające warunek czeka, aż test je zwolni (druga karta przeglądarki działa w tym czasie).
function pulapka(d, metoda, warunek) {
  if (!d.__pulapki) {
    d.__pulapki = [];
    const cel = d.adapter;
    d.vault.setStorageAdapter(new Proxy(cel, {
      get(o, k) {
        const f = o[k];
        if (typeof f !== 'function') return f;
        return async (...a) => {
          for (const p of d.__pulapki) {
            if (p.zuzyta || p.metoda !== k || !p.warunek(...a)) continue;
            p.zuzyta = true;
            p.osiagnieta();
            await p.zwolnienie;
          }
          return f.apply(o, a);
        };
      },
    }));
  }
  const p = { metoda, warunek, zuzyta: false };
  const osiagnieta = new Promise((r) => { p.osiagnieta = r; });
  let zwolnij;
  p.zwolnienie = new Promise((r) => { zwolnij = r; });
  d.__pulapki.push(p);
  return { osiagnieta, zwolnij };
}
const wynikScalenia = (w) => ({ dodaneWersje: w.addedSnapshotCount, dodaneKarty: w.addedPatientCount, pominiete: w.skippedSnapshotCount });

describe.skipIf(!POPRAWKA_PO_KOSZU_W_KARCIE_SCALONEJ)('poprawka po Koszu w karcie scalonej (decyzja właściciela 2b z 2026-11-25) — trzy urządzenia, dwa scalenia, „Przywróć”, importy, wyścigi', () => {
  it('trzy urządzenia: C zna scalenie i Kosz, poprawka T dochodzi do C przed K i po K; C bez wiedzy (bliźniak sprzed scalenia) — v z poprawką w Y na K, T i C po pełnych wymianach, X nie wraca', async () => {
    const w = {};
    for (const kolej of ['T→C, potem K↔T', 'K↔T, potem T→C', 'C bez wiedzy (bliźniak sprzed scalenia)']) {
      await nowySwiat();
      const K = await urzadzenie('K');
      const { P: X, ids: [v] } = await karta(K, 1, [20, 21]);
      const { P: Y } = await karta(K, 2, [30]);
      const T = await blizniak(K, 'T');
      const C = await blizniak(K, 'C');
      const et = { [X]: 'X', [Y]: 'Y' };
      krok(); await K.vault.mergePatients(X, Y);
      if (!kolej.startsWith('C bez')) { krok(); await scal(K, C); }
      krok(); await K.vault.moveSnapshotToTrash(Y, v);
      if (!kolej.startsWith('C bez')) { krok(); await scal(K, C); }
      await popraw(T, v, 44);
      const bl = [];
      if (kolej.startsWith('T→C')) bl.push(...await pelne([[T, C], [C, T], [K, T], [T, K]]));
      else if (kolej.startsWith('K↔T')) bl.push(...await pelne([[K, T], [T, K], [T, C], [C, T]]));
      else bl.push(...await pelne([[T, C], [C, K], [K, T], [T, C]]));
      bl.push(...await pelne([[K, T], [T, C], [C, K], [K, T], [T, C], [C, K]]));
      w[kolej] = { K: await stanU(K, et, v), T: await stanU(T, et, v), C: await stanU(C, et, v), bledy: bl };
    }
    expect(w).toEqual(OCZEKIWANE_INNE['trzy urządzenia']);
  }, 3 * CZAS);

  it('dwa niezależne „Scal pacjentów” tej samej karty: K X → Y (v do Kosza pod Y), D X → W, D poprawia v w W później niż Kosz — wygrywa późniejsze scalenie według zegara (D wcześniej: Y, D później: W)', async () => {
    const w = {};
    for (const kiedy of ['D scala wcześniej niż K', 'D scala później niż K']) {
      await nowySwiat();
      const K = await urzadzenie('K');
      const { P: X, ids: [v] } = await karta(K, 1, [20, 21]);
      const { P: Y } = await karta(K, 2, [30]);
      const { P: W } = await karta(K, 4, [50]);
      const D = await blizniak(K, 'D');
      const et = { [X]: 'X', [Y]: 'Y', [W]: 'W' };
      if (kiedy.includes('wcześniej')) { krok(); await D.vault.mergePatients(X, W); krok(); await K.vault.mergePatients(X, Y); }
      else { krok(); await K.vault.mergePatients(X, Y); krok(); await D.vault.mergePatients(X, W); }
      krok(); await K.vault.moveSnapshotToTrash(Y, v);
      await popraw(D, v, 44);
      // Pierwsza pełna wymiana D → K: K rozstrzyga regułą od razu (wpis Kosza zna późniejsze scalenie albo nie).
      const bl = await pelne([[D, K]]);
      const poPierwszej = await stanU(K, et, v);
      bl.push(...await pelne([[K, D], [D, K], [K, D]]));
      w[kiedy] = { poPierwszej, K: await stanU(K, et, v), D: await stanU(D, et, v), bledy: bl };
    }
    expect(w).toEqual(OCZEKIWANE_INNE['dwa scalenia']);
  }, 2 * CZAS);

  // Karta wpisu Kosza = karta z ładunku: K i D niezależnie scalają X → Y (K później), K daje v do Kosza pod Y, D poprawia
  // v w Y później niż Kosz. Wpis zna późniejszą chwilę przypisania (scalenie K), ale to ta sama karta — reguła nie
  // dotyczy: v wraca do Y zwykłą drogą (zmiana po Koszu, wersja nowa dla K), z chwilą przypisania z ładunku (scalenie D).
  it('[kontrola] dwa niezależne „Scal pacjentów” X → Y (K później, Kosz pod Y), D poprawia v w Y później niż Kosz: karta wpisu = karta z ładunku — v wraca do Y zwykłą drogą, z chwilą przypisania z ładunku', async () => {
    const K = await urzadzenie('K');
    const { P: X, ids: [v] } = await karta(K, 1, [20, 21]);
    const { P: Y } = await karta(K, 2, [30]);
    const D = await blizniak(K, 'D');
    const et = { [X]: 'X', [Y]: 'Y' };
    krok(); await D.vault.mergePatients(X, Y);
    krok(); await K.vault.mergePatients(X, Y);
    const tD = (await rek(D, v))[POLE], tK = (await rek(K, v))[POLE];
    krok(); await K.vault.moveSnapshotToTrash(Y, v);
    await popraw(D, v, 44);
    const bl = await pelne([[D, K]]);
    const poPierwszej = { stan: await stanU(K, et, v), pole: (await rek(K, v))[POLE] };
    bl.push(...await pelne([[K, D], [D, K]]));
    const w = { kontrola: tD < tK, poPierwszej, pole: { K: (await rek(K, v))[POLE], D: (await rek(D, v))[POLE] }, bledy: bl };
    expect(w).toEqual({ kontrola: true, poPierwszej: { stan: { karty: { Y: ['21', '30', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, pole: tD }, pole: { K: tD, D: tD }, bledy: [] });
  }, CZAS);

  // Bez magazynu nagrobków kart na K (adapter bez listy, zapisu i zdjęcia nagrobka) scalanie nie zna kart przegrywających
  // z nagrobkiem — reguła działa tylko ze scalaniem z magazynem nagrobków (jak wersja przeżywająca przycięcie): X wraca
  // z v, jak dotąd.
  it('[kontrola] adapter K bez magazynu nagrobków kart: reguła nie działa — pełna kopia T → K, X wraca z v, jak dotąd', async () => {
    const s = await swiat({});
    const BEZ = new Set(['listTombstonesForUser', 'putTombstoneForUser', 'removeTombstoneForUser']);
    const surowy = s.K.adapter;
    s.K.vault.setStorageAdapter(new Proxy(surowy, { get(o, k) { if (BEZ.has(k)) return undefined; const f = o[k]; return typeof f === 'function' ? f.bind(o) : f; } }));
    krok(); const b = await blad(() => scal(s.T, s.K));
    s.K.vault.setStorageAdapter(surowy);
    expect({ b, K: await stanU(s.K, s.et, s.v) }).toEqual({ b: null, K: { karty: { Y: ['21', '30', '30'], X: ['v:44'] }, v: 'X', kosz: [] } });
  }, CZAS);

  // Trzecie urządzenie D „Usuń pacjenta” karty scalonej Y po Koszu; T poprawia v w X. D → T, T → K: Y w N na K, reguła
  // nie działa (bez warunku „karta wpisu spoza N” v szłaby do Y i znikała z nią). T → K, D → K: K najpierw stosuje
  // regułę, potem dostaje usunięcie Y — po pełnych wymianach X[21, v:44] na trzech, jak dotąd (ograniczenie z „Usuń
  // pacjenta” karty scalonej przed dotarciem poprawki; nic nie ginie po pełnej wymianie).
  it('trzecie urządzenie usuwa kartę scaloną („Usuń pacjenta” Y po Koszu), T poprawia v w X — obie kolejności: po pełnych wymianach X z v:44 na K, T i D, nic nie ginie', async () => {
    const w = {};
    for (const kolej of ['D→T, T→K', 'T→K, D→K']) {
      await nowySwiat();
      const K = await urzadzenie('K');
      const { P: X, ids: [v] } = await karta(K, 1, [20, 21]);
      const { P: Y } = await karta(K, 2, [30]);
      const T = await blizniak(K, 'T');
      const et = { [X]: 'X', [Y]: 'Y' };
      krok(); await K.vault.mergePatients(X, Y);
      krok(); await K.vault.moveSnapshotToTrash(Y, v);
      const D = await blizniak(K, 'D');
      krok(); await D.vault.removePatient(Y);
      await popraw(T, v, 44);
      const bl = kolej.startsWith('D→T') ? await pelne([[D, T], [T, K]]) : await pelne([[T, K], [D, K]]);
      const W1 = { K: await stanU(K, et, v), T: await stanU(T, et, v), D: await stanU(D, et, v) };
      bl.push(...await pelne([[K, T], [T, D], [D, K], [K, T], [T, D], [D, K]]));
      w[kolej] = { W1, W4: { K: await stanU(K, et, v), T: await stanU(T, et, v), D: await stanU(D, et, v) }, bledy: bl };
    }
    expect(w).toEqual(OCZEKIWANE_INNE['D usuwa kartę scaloną']);
  }, 2 * CZAS);

  it('[kontrola] karta wpisu bez rekordu w chwili decyzji (rekord Q usunięty z magazynu bez nagrobka; wpis Kosza zostaje): v z poprawką pod X, jak dotąd — nic nie znika', async () => {
    const s = await swiat({});
    const { K, T, Y, v, et } = s;
    await K.adapter.removePatientForUser(uid(K), Y);
    const bl = await pelne([[T, K]]);
    const w = { K: await stanU(K, et, v), bledy: bl };
    expect(w).toEqual(OCZEKIWANE_INNE['Q bez rekordu']);
  }, CZAS);

  // Pominięte: druga wizyta X (leży na K pod Y z późniejszą chwilą przypisania) i wersja Y bez zmian; wizyta wracająca
  // z Kosza do Y nie jest pominięta (liczy się jak dodana).
  it('liczniki scalania (pełna kopia T → K): wizyta wracająca do karty scalonej liczy się jak dodana wersja, nie jak pominięta; karta nie powstaje', async () => {
    const s = await swiat({});
    krok();
    const r = wynikScalenia(await scal(s.T, s.K));
    expect([r, (await stanU(s.K, s.et, s.v)).v]).toEqual([{ dodaneWersje: 1, dodaneKarty: 0, pominiete: 2 }, 'Y z chwilą']);
  }, CZAS);

  // Reguła działa tylko dla wpisu Kosza, nie dla samego przycięcia (retencja to nie decyzja lekarza o Koszu). Stan
  // zbudowany wprost w magazynie K: wpis v pod Y z chwilą przypisania, ale jako wpis samego przycięcia (bez chwili
  // Kosza i bez treści Kosza).
  it('[kontrola] wpis samego przycięcia pod Y z chwilą przypisania zamiast wpisu Kosza: reguła nie działa — pełna kopia T → K, X wraca z v, jak dotąd', async () => {
    const s = await swiat({});
    const m = await s.K.adapter.getUserMeta(uid(s.K));
    m.snapshotTombstones = (m.snapshotTombstones || []).map((e) => {
      if (e.snapshotId !== s.v) return e;
      const n = { ...e, powod: 'retencja' };
      for (const k of ['koszISO', 'Bpk', 'payloadCipher', 'trescISO']) delete n[k];
      return n;
    });
    await s.K.adapter.putUserMeta(uid(s.K), m);
    const wpis = (await koszWpisy(s.K, s.v)).map((e) => ({ karta: s.et[e.patientId], powod: e.powod || null, pole: maPole(e) }));
    krok(); const b = await blad(() => scal(s.T, s.K));
    expect({ wpis, b, K: await stanU(s.K, s.et, s.v) }).toEqual({
      wpis: [{ karta: 'Y', powod: 'retencja', pole: true }], b: null, K: { karty: { Y: ['21', '30', '30'], X: ['v:44'] }, v: 'X', kosz: [] },
    });
  }, CZAS);

  it('„Przywróć” po regule: K daje v (już w Y z poprawką) znów do Kosza i przywraca — v w Y z chwilą przypisania; po wymianach na K i T', async () => {
    const s = await swiat({});
    const { K, T, Y, v, et } = s;
    await pelne([[T, K]]);
    const poRegule = await stanU(K, et, v);
    krok(); const dk = await blad(() => K.vault.moveSnapshotToTrash(Y, v));
    krok(); const pr = await blad(() => K.vault.restoreTrashedSnapshot(Y, v));
    const poPrzywroceniu = await stanU(K, et, v);
    await pelne([[K, T], [T, K]]);
    const w = { poRegule, dk, pr, poPrzywroceniu, K: await stanU(K, et, v), T: await stanU(T, et, v) };
    expect(w).toEqual(OCZEKIWANE_INNE['Przywróć po regule']);
  }, CZAS);

  it('[kontrola] „Przywróć” na K przed dotarciem poprawki T: wizyta w Y bez poprawki, potem poprawka z X — jak dotąd', async () => {
    const s = await swiat({});
    const { K, T, Y, v, et } = s;
    krok(); await K.vault.restoreTrashedSnapshot(Y, v);
    const poPrzywroceniu = await stanU(K, et, v);
    await pelne([[T, K], [K, T], [T, K]]);
    const w = { poPrzywroceniu, K: await stanU(K, et, v), T: await stanU(T, et, v) };
    expect(w).toEqual(OCZEKIWANE_INNE['Przywróć przed poprawką']);
  }, CZAS);

  it('[kontrola] import pliku karty X z T na K, „Scal kopię konta” T na K i odtworzenie konta K na R z pełną kopią T — poza regułą, jak dotąd', async () => {
    const w = {};
    {
      const s = await swiat({});
      const plik = await s.T.vault.exportPatientEnvelope(s.X);
      krok(); const b = await blad(() => s.K.vault.importPatientFromEnvelope(plik, HASLO));
      w['import pliku X'] = { blad: b, K: await stanU(s.K, s.et, s.v) };
    }
    {
      const s = await swiat({});
      const kopia = await s.T.vault.exportVaultBackup();
      krok(); const b = await blad(() => s.K.vault.mergeVaultBackup(kopia, HASLO));
      w['Scal kopię konta T na K'] = { blad: b, K: await stanU(s.K, s.et, s.v) };
    }
    {
      const s = await swiat({});
      const kopia = await s.K.vault.exportVaultBackup();
      const R = await urzadzenie('R', { haslo: 'Vilda#Odtworzenie!2026abc' });
      krok(); const b = await blad(() => R.vault.restoreVaultBackup(kopia, HASLO, { label: 'Fikcyjne odtworzenie konta' }));
      krok(); const b2 = await blad(() => scal(s.T, R));
      w['odtworzenie konta K na R, potem pełna kopia T'] = { blad: b, blad2: b2, R: await stanU(R, s.et, s.v) };
    }
    expect(w).toEqual(OCZEKIWANE_INNE['importy']);
  }, 3 * CZAS);

  // Wyścigi z drugą kartą przeglądarki na K między decyzją (odczyt karty wpisu Q) a fazą przeniesień (świeży odczyt Q
  // pod jej blokadą): „Usuń pacjenta” Q — faza nie zapisuje v (karty Q nie ma), wpis zostaje w Koszu (X powstaje tylko
  // z powodu drugiej wizyty, która była w Q); następne scalanie: Q w N (nagrobek Q), v z poprawką wraca pod X — nic nie
  // znika. „Przywróć” v (później niż poprawka) — faza nie zapisuje (wersja już jest pod Q), zostaje późniejsza zmiana
  // („Przywróć”), jak dotąd.
  for (const [nazwa, akcja] of [
    ['„Usuń pacjenta” karty scalonej Y', (s) => s.K.vault.removePatient(s.Y)],
    ['„Przywróć” v w karcie scalonej Y', (s) => s.K.vault.restoreTrashedSnapshot(s.Y, s.v)],
  ]) {
    it(`wyścig: ${nazwa} w drugiej karcie przeglądarki między decyzją a fazą przeniesień — bez zapisu w fazie; następne scalanie bez utraty`, async () => {
      const s = await swiat({});
      const lad = await eksport(s.T);
      let n = 0;
      const p = pulapka(s.K, 'getPatientForUser', (u, pid) => pid === s.Y && ++n === 2);
      krok();
      const sync = s.K.vault.mergeSyncPayload(lad);
      const gdzie = await Promise.race([p.osiagnieta.then(() => 'okno'), sync.then(() => 'koniec')]);
      let wOknie = null;
      if (gdzie === 'okno') { krok(); wOknie = await blad(() => akcja(s)); p.zwolnij(); }
      await sync;
      const poOknie = await stanU(s.K, s.et, s.v);
      await pelne([[s.T, s.K], [s.K, s.T], [s.T, s.K]]);
      const w = { gdzie, wOknie, poOknie, K: await stanU(s.K, s.et, s.v), T: await stanU(s.T, s.et, s.v) };
      expect(w).toEqual(OCZEKIWANE_INNE[`wyścig ${nazwa}`]);
    }, CZAS);
  }
});
// Literały (zmierzone na kodzie z regułą; na bazie 30008d8f czerwone przypadki reguły — X wraca z v; kontrole — jak tu).
const OCZEKIWANE_INNE = {
  'trzy urządzenia': { 'T→C, potem K↔T': { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, C: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, bledy: [] }, 'K↔T, potem T→C': { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, C: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, bledy: [] }, 'C bez wiedzy (bliźniak sprzed scalenia)': { K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, C: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, bledy: [] } },
  'dwa scalenia': { 'D scala wcześniej niż K': { poPierwszej: { karty: { Y: ['21', '30', '30', 'v:44'], W: ['50', '50'] }, v: 'Y z chwilą', kosz: [] }, K: { karty: { Y: ['21', '30', '30', 'v:44'], W: ['50', '50'] }, v: 'Y z chwilą', kosz: [] }, D: { karty: { Y: ['21', '30', '30', 'v:44'], W: ['50', '50'] }, v: 'Y z chwilą', kosz: [] }, bledy: [] }, 'D scala później niż K': { poPierwszej: { karty: { Y: ['30', '30'], W: ['21', '50', '50', 'v:44'] }, v: 'W z chwilą', kosz: [] }, K: { karty: { Y: ['30', '30'], W: ['21', '50', '50', 'v:44'] }, v: 'W z chwilą', kosz: [] }, D: { karty: { Y: ['30', '30'], W: ['21', '50', '50', 'v:44'] }, v: 'W z chwilą', kosz: [] }, bledy: [] } },
  'D usuwa kartę scaloną': { 'D→T, T→K': { W1: { K: { karty: { X: ['21', 'v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['21', 'v:44'] }, v: 'X', kosz: [] }, D: { karty: {}, v: null, kosz: ['Y z chwilą'] } }, W4: { K: { karty: { X: ['21', 'v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['21', 'v:44'] }, v: 'X', kosz: [] }, D: { karty: { X: ['21', 'v:44'] }, v: 'X', kosz: [] } }, bledy: [] }, 'T→K, D→K': { W1: { K: { karty: {}, v: null, kosz: ['Y z chwilą'] }, T: { karty: { X: ['21', 'v:44'], Y: ['30'] }, v: 'X', kosz: [] }, D: { karty: {}, v: null, kosz: ['Y z chwilą'] } }, W4: { K: { karty: { X: ['21', 'v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['21', 'v:44'] }, v: 'X', kosz: [] }, D: { karty: { X: ['21', 'v:44'] }, v: 'X', kosz: [] } }, bledy: [] } },
  'Q bez rekordu': { K: { karty: { X: ['21', 'v:44'], Y: ['30'] }, v: 'X', kosz: [] }, bledy: [] },
  'Przywróć po regule': { poRegule: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, dk: null, pr: null, poPrzywroceniu: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, K: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:44'] }, v: 'Y z chwilą', kosz: [] } },
  'Przywróć przed poprawką': { poPrzywroceniu: { karty: { Y: ['21', '30', '30', 'v:20'] }, v: 'Y z chwilą', kosz: [] }, K: { karty: { Y: ['21', '30', '30', 'v:20'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:20'] }, v: 'Y z chwilą', kosz: [] } },
  'importy': { 'import pliku X': { blad: null, K: { karty: { Y: ['30', '30'], X: ['21', 'v:44'] }, v: 'X', kosz: [] } }, 'Scal kopię konta T na K': { blad: null, K: { karty: { Y: ['21', '30', '30'] }, v: null, kosz: ['Y z chwilą'] } }, 'odtworzenie konta K na R, potem pełna kopia T': { blad: null, blad2: null, R: { karty: { Y: ['21', '30', '30'], X: ['v:44'] }, v: 'X', kosz: [] } } },
  'wyścig „Usuń pacjenta” karty scalonej Y': { gdzie: 'okno', wOknie: null, poOknie: { karty: { X: ['21'] }, v: null, kosz: ['Y z chwilą'] }, K: { karty: { X: ['21', 'v:44'] }, v: 'X', kosz: [] }, T: { karty: { X: ['21', 'v:44'] }, v: 'X', kosz: [] } },
  'wyścig „Przywróć” v w karcie scalonej Y': { gdzie: 'okno', wOknie: null, poOknie: { karty: { Y: ['21', '30', '30', 'v:20'] }, v: 'Y z chwilą', kosz: [] }, K: { karty: { Y: ['21', '30', '30', 'v:20'] }, v: 'Y z chwilą', kosz: [] }, T: { karty: { Y: ['21', '30', '30', 'v:20'] }, v: 'Y z chwilą', kosz: [] } },
};
