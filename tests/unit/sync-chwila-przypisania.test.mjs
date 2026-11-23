// P-SYNC-WLASCICIEL (E3-PR0e2a) — chwila przypisania wersji do karty (pole rekordu wersji assignedAtISO), pierwsze
// wydanie nowego pola w dwóch wydaniach (decyzja właściciela z 2026-11-23, wzór decyzji z 2026-11-17).
//
// To wydanie pole PRZECHOWUJE i PRZESYŁA, ale żadna droga produkcyjna go nie ustawia (zacznie E3-PR0e2b, w „Scal
// pacjentów”, po potwierdzeniu właściciela, że wszystkie urządzenia mają to wydanie). Dlatego pole wstrzykujemy jako
// rekord z urządzenia, które je zapisuje: wprost do rekordu wersji w magazynie urządzenia (surowy adapter) albo do
// elementu wersji w ładunku (kopia JSON eksportu). Reguły:
//   - łączenie przy każdym zapisie rekordu wersji: późniejsza chwila przypisania z obu kopii (tutejszej i z ładunku),
//     niezależnie od tego, która kopia wygrała treścią albo przypisaniem karty; postać kanoniczna chwili (toISOString),
//     każda inna wartość liczy się jak brak i nie przechodzi dalej;
//   - przesyłanie: element wersji eksportu pełnego, delty karty, pliku karty, kopii konta i koperty zdarzenia niesie pole
//     za payload, gdy jest; bez pola — kształt jak dotąd; importy zapisują pole z pliku;
//   - porównanie właściciela wersji wspólnej dwóm kartom (Bsw_ladunekWygrywa): najpierw późniejsza chwila przypisania
//     (brak = najwcześniej), potem jak dotąd (rev, chwila zmiany, mniejszy identyfikator karty); bez pola po obu
//     stronach — wynik bez zmian; strażnik natywny woła tę samą funkcję;
//   - wpis Kosza pola nie przechowuje: „Przywróć” bierze je z wersji leżącej w karcie, gdy jest;
//   - nikt pola nie tworzy: w kodzie sejfu pole powstaje tylko jako kopia albo późniejsza z istniejących wartości;
//   - starsza aplikacja (sejfy 221 i 276 z fikstur) przyjmuje ładunek, kopertę i pliki z polem bez błędu (pole gubi —
//     powód dwóch wydań).
// Odsyłanie (sama chwila przypisania nie wywołuje odesłania) — tests/unit/sync-odsylanie.test.mjs; model licznika
// odsyłania — tests/unit/licznik-odsylania.test.mjs; strażnik natywny w przeglądarce —
// tests/e2e/care-template-native-storage.spec.mjs.
//
// PRZYPADKI (63; na bazie d6f133eb, przed kodem tej zmiany, czerwone 43 — powód w nawiasie; zielone z natury 20):
//   drogi zapisu: poprawka wizyty, gwiazdka, edycja i usunięcie wiersza pomiaru (czerwone — rekord budowany z listy pól
//        gubi pole); „Scal pacjentów” (zielony — rekord rozpięty, pole zostaje bez zmian, nowa głowa bez pola);
//   wersja tej samej karty: 5 wariantów (treść z ładunku, treść tutejsza, rekord złożony W3, ta sama wersja, zapis samego
//        rev) × 4 układy chwili przypisania (tylko tutaj, tylko w ładunku, w obu z późniejszą tutaj albo w ładunku),
//        wynik porównany z przebiegiem bez pola (czerwone 14 — zapis z listy pól ładunku albo brak zapisu przy późniejszym
//        polu w ładunku; zielone 6 — tutejszy rekord z późniejszym polem zostaje albo jest rozpięty);
//   wersja wspólna dwóm kartom: „przenieś” ×2, „zabierz” ×2, „zabierz” po zniknięciu wersji, „treść”, „nowa” ×2,
//        następca (czerwone — rekord z listy pól ładunku albo z chwili decyzji bez pola);
//   wersja przeżywająca przycięcie (zielony — rekord rozpięty); „Przywróć” z Kosza i magazyn IndexedDB (czerwone);
//   eksporty niosą pole (czerwony); bez pola kształt elementu jak dotąd (zielony); import karty, „Scal kopię konta” ×2,
//        odtworzenie konta (czerwone — plik bez pola);
//   koperta: element koperty = element eksportu, encryptEvent z polem, zastosowanie koperty z polem (czerwone — builder
//        gubi pole, walidacja odrzuca kopertę z polem: EVENT_ENVELOPE_INVALID, scalanie gubi pole); koperty „Scal
//        pacjentów” jak bez pola i koperta wpisu Kosza bez pola (zielone);
//   porównanie (Bsw_ladunekWygrywa z kodu sejfu): późniejsza chwila z ładunku, późniejsza tutejsza, brak = najwcześniej
//        i scalanie w obu kierunkach (czerwone — porównanie nie patrzy na pole); ta sama chwila, tablica przypadków bez
//        pola, zła postać jak brak (w porównaniu i w zapisie), strażnik natywny (zielone);
//   nikt nie ustawia: strażnik drzewa składni i przebieg wszystkich dróg bez pola na wejściu (zielone);
//   zgodność wstecz: 221 i 276 — pełny ładunek i koperta z polem (zielone), plik karty i kopia konta z polem (czerwone —
//        bieżący eksport pola nie niesie).
// Strażniki zielone z natury mają mutanta kodu, przy którym czerwienieją (poza kontrolami bez zapisu rekordu i zgodnością
// wstecz, która charakteryzuje niezmienne sejfy z fikstur).
//
// Prawdziwy vilda_vault.js (i vilda_crypto.js, vilda_retention.js) w oknie uprzęży tests/support/urzadzenie-sync.mjs:
// bliźniaki tego samego konta (klon stanu magazynu w pamięci), starsza aplikacja przez zrodlaStarszej('S221' | 'S276'),
// sztuczny zegar (tylko Date), retencja w tle wyłączona (przycięcie tylko jawnie). Wyścigi z drugą kartą przeglądarki —
// pułapka na wywołaniu magazynu (scalanie stoi w kroku karty po karcie docelowej, akcja kończy się w tym czasie).
// Dane WYŁĄCZNIE FIKCYJNE („Testowy Jan1…”), bez PESEL.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'acorn';
import { analyze } from 'eslint-scope';
import { utworzAtrapeWorkera, zegarSterowany } from '../support/atrapa-workera-sync.mjs';
import { sprzatnijUrzadzenia, utworzUrzadzenie } from '../support/urzadzenie-sync.mjs';
import { zrodlaStarszej } from '../support/starsza-aplikacja.mjs';
import { AtrapaIDBKeyRange, utworzIndexedDB } from '../support/atrapa-indexeddb.mjs';
import { naglowek, zrodlo } from './sesja-zapisu-uprzaz.mjs';

const HASLO = 'Vilda#Przypisanie!2026abc';
const START = Date.parse('2026-03-02T08:00:00.000Z');
const MIN = 60_000;
const CZAS = 60_000;
const POLE = 'assignedAtISO';
const T1 = '2026-03-02T09:30:00.000Z';
const T2 = '2026-03-02T09:40:00.000Z';
// Kształt elementu wersji eksportu i koperty bez pola — jak dotąd (kolejność kluczy).
const KLUCZE = ['snapshotId', 'savedAtISO', 'rev', 'updatedAtISO', 'payload'];

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
// Pole w rekordzie wersji magazynu: wartość, null (rekord bez pola) albo 'brak wersji'.
async function pole(d, sid) {
  const r = await rek(d, sid);
  if (!r) return 'brak wersji';
  return Object.prototype.hasOwnProperty.call(r, POLE) ? r[POLE] : null;
}
// Rekord z urządzenia, które zapisuje chwilę przypisania: pole wprost w rekordzie magazynu (bez zmiany pozostałych pól).
async function wstaw(d, sid, wartosc) {
  const r = await rek(d, sid);
  expect(r, 'kontrola: rekord wersji do wstawienia pola').toBeTruthy();
  const n = { ...r };
  if (wartosc === undefined) delete n[POLE]; else n[POLE] = wartosc;
  await d.adapter.putSnapshotForUser(uid(d), n);
}
// Elementy wersji sid w ładunku (karty i wpisy Kosza).
const elementy = (lad, sid) => (lad.patients || []).flatMap((p) => (p.snapshots || []).filter((s) => s.snapshotId === sid));
function zPolem(lad, sid, wartosc) {
  const l = json(lad);
  const e = elementy(l, sid);
  expect(e.length, 'kontrola: wersja w ładunku').toBeGreaterThan(0);
  for (const s of e) s[POLE] = wartosc;
  return l;
}
const eksport = async (d) => json(await d.vault.exportSyncPayload());
const scal = async (z, na, zmien = (l) => l) => na.vault.mergeSyncPayload(zmien(await eksport(z)));
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
async function popraw(d, sid, masa) {
  krok();
  const r = await rek(d, sid);
  const s = await wersja(d, sid);
  await d.vault.updateSnapshotPayload(r.patientId, sid, { ...s.payload, user: { ...s.payload.user, weight: masa } }, { preserveSavedAt: true });
}
async function gwiazdka(d, sid, tak = true) {
  krok();
  const r = await rek(d, sid);
  await d.vault.setSnapshotPinned(r.patientId, sid, tak);
}
// Stan wersji bez pola przypisania i bez identyfikatorów (do porównania z przebiegiem bez pola); karta — etykieta.
async function stan(d, sid, et = {}) {
  const r = await rek(d, sid);
  if (!r) return null;
  const s = await wersja(d, sid);
  return {
    karta: et[r.patientId] || '?', rev: r.rev, savedAtISO: r.savedAtISO, updatedAtISO: r.updatedAtISO || null,
    masa: s ? s.payload.user.weight : null, gwiazdka: !!(s && s.payload._pinned),
  };
}
const liczniki = (w) => [w.addedSnapshotCount, w.skippedSnapshotCount, w.updatedSnapshotCount, w.mergedPatientCount, w.addedPatientCount, w.deletedPatientCount];
// Pułapka na wywołaniu magazynu urządzenia: pierwsze wywołanie metody spełniające warunek czeka (przed wykonaniem), aż
// test je zwolni. Owinięcie adaptera raz na urządzenie (setStorageAdapter); wstaw() i pole() czytają surowy adapter.
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
// Ładunek z kartą `pierwsza` na początku i kartą `ostatnia` na końcu (kolejność kroków kart w scalaniu).
const uloz = (pierwsza, ostatnia) => (l) => {
  const k = (p) => (p.patientId === pierwsza ? 0 : p.patientId === ostatnia ? 2 : 1);
  l.patients.sort((a, b) => k(a) - k(b));
  return l;
};

// ── A. Chwila przypisania zachowana w każdej drodze zapisu rekordu wersji ───────────────────────────────────────────
describe('chwila przypisania zachowana w każdej drodze zapisu rekordu wersji', () => {
  it('poprawka wizyty (updateSnapshotPayload) zachowuje chwilę przypisania wersji; treść, rev i chwile jak bez niej', async () => {
    const A = await urzadzenie('A');
    const { ids: [v, w] } = await karta(A, 1, [22, 30]);
    await wstaw(A, v, T1);
    await popraw(A, v, 23);
    await popraw(A, w, 31);
    expect(await pole(A, v), 'wersja z chwilą przypisania').toBe(T1);
    expect(await pole(A, w), 'wersja bez niej zostaje bez niej').toBe(null);
    const s = await stan(A, v);
    expect([s.masa, s.rev], 'kontrola: poprawka zapisana (23 kg, rev 1)').toEqual([23, 1]);
  }, CZAS);

  it('gwiazdka i zdjęcie gwiazdki (setSnapshotPinned) zachowują chwilę przypisania wersji', async () => {
    const A = await urzadzenie('A');
    const { ids: [v] } = await karta(A, 1, [22]);
    await wstaw(A, v, T1);
    await gwiazdka(A, v, true);
    const po1 = [await pole(A, v), (await stan(A, v)).gwiazdka];
    await gwiazdka(A, v, false);
    const po2 = [await pole(A, v), (await stan(A, v)).gwiazdka];
    expect({ po1, po2 }, 'chwila przypisania po gwiazdce i po jej zdjęciu').toEqual({ po1: [T1, true], po2: [T1, false] });
  }, CZAS);

  it('edycja i usunięcie wiersza pomiaru (updateMeasurementRow, deleteMeasurementRow) zachowują chwilę przypisania wersji', async () => {
    const A = await urzadzenie('A');
    krok();
    const tresc = { ...naglowek(1), advanced: { data: { measurements: [
      { uid: 'm-60', ageMonths: 60, height: 110, weight: 20 }, { uid: 'm-66', ageMonths: 66, height: 113, weight: 21 },
    ] } } };
    const { patientId: P, snapshotId: v } = await A.vault.savePatient(tresc, { dedup: false });
    await wstaw(A, v, T1);
    krok();
    await A.vault.updateMeasurementRow(P, { uid: 'm-66' }, { height: 114 });
    const poEdycji = await pole(A, v);
    krok();
    await A.vault.deleteMeasurementRow(P, { uid: 'm-60' });
    const poUsunieciu = await pole(A, v);
    const pomiary = (await wersja(A, v)).payload.advanced.data.measurements.map((m) => `${m.ageMonths}:${m.height}`);
    expect(pomiary, 'kontrola: wiersz poprawiony i wiersz usunięty w tej wersji').toEqual(['66:114']);
    expect({ poEdycji, poUsunieciu }).toEqual({ poEdycji: T1, poUsunieciu: T1 });
  }, CZAS);

  it('„Scal pacjentów” przenosi wersję z jej chwilą przypisania bez zmiany (rev + 1), wersja bez niej zostaje bez niej, nowa głowa scalenia jej nie dostaje', async () => {
    const A = await urzadzenie('A');
    const { P: X, ids: [v, w] } = await karta(A, 1, [22, 23]);
    const { P: Y } = await karta(A, 2, [30]);
    await wstaw(A, v, T1);
    const revV = (await rek(A, v)).rev;
    krok();
    const glowa = (await A.vault.mergePatients(X, Y)).snapshotId;
    const r = await rek(A, v);
    expect([r.patientId === Y, r.rev], 'kontrola: v pod Y z rev + 1').toEqual([true, revV + 1]);
    expect({ v: await pole(A, v), w: await pole(A, w), glowa: await pole(A, glowa) }).toEqual({ v: T1, w: null, glowa: null });
  }, CZAS);
});

// ── Wersja tej samej karty: późniejsza chwila przypisania z obu kopii ──────────────────────────────────────────────
// A i bliźniak B mają kartę P z wersją v (22 kg); zmiany według wariantu, potem chwila przypisania według układu (tutaj —
// w rekordzie A, w ładunku — w elemencie v pełnej kopii B) i A scala pełną kopię B. Wynik porównany z tym samym
// przebiegiem bez chwili przypisania (ten sam zegar od początku): treść, gwiazdka, rev, chwile i liczniki scalania bez
// zmian.
const WARIANTY_KARTY = {
  'treść z ładunku wygrywa (późniejsza poprawka na drugim urządzeniu)': async (A, B, v) => { await popraw(B, v, 23); },
  'tutejsza treść wygrywa (późniejsza poprawka tutaj)': async (A, B, v) => { await popraw(B, v, 23); await popraw(A, v, 24); },
  'rekord złożony W3 (treść z ładunku, gwiazdka tutaj)': async (A, B, v) => { await popraw(B, v, 23); await gwiazdka(A, v); },
  'ta sama wersja (ten sam rev i chwila zmiany)': async () => {},
  'wyższy rev z ładunku przy tutejszej treści (zapis samego rev)': async (A, B, v) => {
    await popraw(B, v, 23); await popraw(B, v, 24); await popraw(A, v, 25);
  },
};
const UKLADY = {
  'tylko tutaj': { tu: T1, lad: undefined, wynik: T1 },
  'tylko w ładunku': { tu: undefined, lad: T1, wynik: T1 },
  'w obu, późniejsza tutaj': { tu: T2, lad: T1, wynik: T2 },
  'w obu, późniejsza w ładunku': { tu: T1, lad: T2, wynik: T2 },
};
async function wersjaKarty(wariant, uklad) {
  ustaw(START);
  const n = uklad ? 'z' : 'bez';
  const A = await urzadzenie(`A ${n}`);
  const { P, ids: [v] } = await karta(A, 1, [22]);
  const B = await blizniak(A, `B ${n}`);
  await WARIANTY_KARTY[wariant](A, B, v);
  if (uklad && uklad.tu) await wstaw(A, v, uklad.tu);
  krok();
  const w = await scal(B, A, uklad && uklad.lad ? (l) => zPolem(l, v, uklad.lad) : undefined);
  return { stan: await stan(A, v, { [P]: 'P' }), liczniki: liczniki(w), pole: await pole(A, v) };
}

describe('wersja tej samej karty — późniejsza chwila przypisania z obu kopii, niezależnie od tego, która treść wygrywa', () => {
  const PRZYPADKI = Object.keys(WARIANTY_KARTY).flatMap((w) => Object.keys(UKLADY).map((u) => [w, u]));
  it.each(PRZYPADKI)('%s, chwila przypisania %s: wynik z późniejszą z obu, treść, rev, chwile i liczniki scalania jak bez niej', async (wariant, uklad) => {
    const bez = await wersjaKarty(wariant, null);
    expect(bez.pole, 'kontrola: przebieg bez chwili przypisania').toBe(null);
    const z = await wersjaKarty(wariant, UKLADY[uklad]);
    expect(z.pole, 'chwila przypisania po scaleniu').toBe(UKLADY[uklad].wynik);
    expect({ stan: z.stan, liczniki: z.liczniki }, 'treść, rev, chwile i liczniki jak bez chwili przypisania').toEqual({ stan: bez.stan, liczniki: bez.liczniki });
  }, CZAS);
});

// ── Wersja wspólna dwóm kartom: każda decyzja scalania zachowuje późniejszą chwilę przypisania ────────────────────
// A: X (v 22 kg, x2 23 kg), Y (30 kg), opcjonalnie W; bliźniak B. Decyzje: „przenieś” (X zapisana na A po „Scal
// pacjentów” X → Y na B, więc wraca; ładunek wygrywa przypisanie karty), „zabierz” (X przegrywa z nagrobkiem — zbiór N),
// „zabierz”, gdy wersja zniknęła z tutejszej karty przed fazą przeniesień („Usuń pacjenta” X w drugiej karcie
// przeglądarki — rekord z chwili decyzji), „treść” (A scaliło X → Y, B poprawiło v w starej X), „nowa” (wersji nie ma
// tu nigdzie; karta nowa albo istniejąca) i następca („Scal pacjentów” Y → W w drugiej karcie przeglądarki między
// decyzją a fazą). Okno wyścigu: krok karty Q, której A nie zna, za kartą Y w ładunku (pułapka na odczycie rekordu Q).
async function dwieKarty({ czwarta = false } = {}) {
  const A = await urzadzenie('A');
  const { P: X, ids: [v, x2] } = await karta(A, 1, [22, 23]);
  const { P: Y } = await karta(A, 2, [30]);
  const W = czwarta ? (await karta(A, 3, [40])).P : null;
  const B = await blizniak(A, 'B');
  return { A, B, X, Y, W, v, x2, et: { [X]: 'X', [Y]: 'Y', ...(W ? { [W]: 'W' } : {}) } };
}
// A scala pełną kopię B z kartą Y na początku i kartą Q (nową na B) na końcu; akcja(c) — druga karta przeglądarki na A
// w kroku karty Q (po decyzjach dla wersji karty Y, przed fazą przeniesień).
async function zOknem(c, akcja) {
  const { P: Q } = await karta(c.B, 4, [50]);
  const lad = uloz(c.Y, Q)(await eksport(c.B));
  const p = pulapka(c.A, 'getPatientForUser', (u, pid) => pid === Q);
  const sync = c.A.vault.mergeSyncPayload(lad);
  const krokQ = await Promise.race([p.osiagnieta.then(() => 'krok Q'), sync.then(() => 'koniec')]);
  expect(krokQ, 'kontrola: scalanie stanęło w kroku karty Q').toBe('krok Q');
  krok();
  await akcja(c);
  p.zwolnij();
  return sync;
}

describe('wersja wspólna dwóm kartom — każda decyzja scalania zachowuje późniejszą chwilę przypisania z obu kopii', () => {
  it.each([['tylko w ładunku', undefined, T1, T1], ['w obu, późniejsza w ładunku', T1, T2, T2]])('„przenieś” (ładunek wygrywa przypisanie karty), chwila przypisania %s: wersja pod kartą z ładunku z późniejszą z obu', async (_n, tu, lad, wynik) => {
    const c = await dwieKarty();
    krok(); await c.B.vault.mergePatients(c.X, c.Y);
    krok(); await c.A.vault.savePatient(naglowek(1, { masa: 24 }), { dedup: false, patientId: c.X });
    if (tu) await wstaw(c.A, c.v, tu);
    krok();
    await scal(c.B, c.A, (l) => zPolem(l, c.v, lad));
    expect((await stan(c.A, c.v, c.et)).karta, 'kontrola: v przeniesiona pod Y, X zostaje').toBe('Y');
    expect(!!(await c.A.vault.getPatient(c.X)), 'kontrola: X zostaje').toBe(true);
    expect(await pole(c.A, c.v)).toBe(wynik);
  }, CZAS);

  it.each([['tylko tutaj', T1, undefined, T1], ['w obu, późniejsza tutaj', T2, T1, T2]])('„zabierz” (karta tutejsza przegrywa z nagrobkiem), chwila przypisania %s: wersja pod kartą z ładunku z późniejszą z obu', async (_n, tu, lad, wynik) => {
    const c = await dwieKarty();
    krok(); await c.B.vault.mergePatients(c.X, c.Y);
    await wstaw(c.A, c.v, tu);
    krok();
    await scal(c.B, c.A, lad ? (l) => zPolem(l, c.v, lad) : undefined);
    expect((await stan(c.A, c.v, c.et)).karta, 'kontrola: v pod Y').toBe('Y');
    expect(await c.A.vault.getPatient(c.X), 'kontrola: X znika').toBeFalsy();
    expect(await pole(c.A, c.v)).toBe(wynik);
  }, CZAS);

  it('„zabierz”, gdy wersja zniknęła z tutejszej karty przed fazą przeniesień („Usuń pacjenta” X w drugiej karcie przeglądarki): zapis z rekordu z chwili decyzji zachowuje chwilę przypisania', async () => {
    const c = await dwieKarty();
    krok(); await c.B.vault.mergePatients(c.X, c.Y);
    await wstaw(c.A, c.v, T1);
    krok();
    await zOknem(c, (q) => q.A.vault.removePatient(q.X));
    expect((await stan(c.A, c.v, c.et)).karta, 'kontrola: v pod Y').toBe('Y');
    expect(await pole(c.A, c.v)).toBe(T1);
  }, CZAS);

  it('„treść” (A scaliło X → Y, B poprawiło v w starej X bez wiedzy o scaleniu): poprawka przechodzi do v pod Y, a tutejsza chwila przypisania zostaje', async () => {
    const c = await dwieKarty();
    await popraw(c.B, c.v, 26);
    krok(); await c.A.vault.mergePatients(c.X, c.Y);
    await wstaw(c.A, c.v, T1);
    krok();
    await scal(c.B, c.A);
    const s = await stan(c.A, c.v, c.et);
    expect([s.karta, s.masa], 'kontrola: v pod Y z poprawką z B').toEqual(['Y', 26]);
    expect(await pole(c.A, c.v)).toBe(T1);
  }, CZAS);

  it('„nowa” — wersji nie ma tu nigdzie, karta nowa: zapis z chwilą przypisania z ładunku', async () => {
    const A = await urzadzenie('A');
    const B = await blizniak(A, 'B');
    const { P, ids: [v] } = await karta(B, 1, [22]);
    krok();
    await scal(B, A, (l) => zPolem(l, v, T1));
    expect((await rek(A, v)).patientId, 'kontrola: nowa karta z v').toBe(P);
    expect(await pole(A, v)).toBe(T1);
  }, CZAS);

  it('„nowa” — wersji nie ma tu nigdzie, karta istnieje: zapis z chwilą przypisania z ładunku', async () => {
    const A = await urzadzenie('A');
    const { P } = await karta(A, 1, [22]);
    const B = await blizniak(A, 'B');
    krok();
    const v = (await B.vault.savePatient(naglowek(1, { masa: 23 }), { dedup: false, patientId: P })).snapshotId;
    krok();
    await scal(B, A, (l) => zPolem(l, v, T1));
    expect((await rek(A, v)).patientId, 'kontrola: v w istniejącej karcie').toBe(P);
    expect(await pole(A, v)).toBe(T1);
  }, CZAS);

  it('następca — „Scal pacjentów” Y → W w drugiej karcie przeglądarki między decyzją „zabierz” a fazą: wersja pod W (rev + 1) z tutejszą chwilą przypisania', async () => {
    const c = await dwieKarty({ czwarta: true });
    krok(); await c.B.vault.mergePatients(c.X, c.Y);
    await wstaw(c.A, c.v, T1);
    krok();
    await zOknem(c, (q) => q.A.vault.mergePatients(q.Y, q.W));
    expect((await stan(c.A, c.v, c.et)).karta, 'kontrola: v pod W').toBe('W');
    expect(await pole(c.A, c.v)).toBe(T1);
  }, CZAS);
});

// ── Wersja, która przeżywa przycięcie, i pozostałe drogi bez zmiany kodu ────────────────────────────────────────────
describe('wersja przeżywająca przycięcie, Kosz i „Przywróć”, magazyn IndexedDB', () => {
  it('wersja przeżywająca przycięcie przechodzi do karty docelowej „Scal pacjentów” z tą samą chwilą przypisania (P przypina x w X, C bez wiedzy przycina X, K scala X → Y i dostaje przycięcie od C)', async () => {
    const K = await urzadzenie('K');
    const { P: X, ids: [, x] } = await karta(K, 1, [20, 23, 25]);
    const { P: Y } = await karta(K, 2, [30]);
    const P = await blizniak(K, 'P');
    const C = await blizniak(K, 'C');
    await gwiazdka(P, x, true);
    krok();
    expect((await C.vault.pruneSnapshotsForPatient(X, { recentHours: 0 })).prunedIds, 'kontrola: C przycina x').toContain(x);
    krok(); await K.vault.mergePatients(X, Y);
    krok(); await scal(C, K);
    expect(await rek(K, x), 'kontrola: K bez x').toBeFalsy();
    await wstaw(P, x, T1);
    const przed = await rek(P, x);
    krok();
    await scal(K, P);
    const s = await stan(P, x, { [Y]: 'Y', [X]: 'X' });
    expect([s.karta, s.gwiazdka, s.rev], 'kontrola: x przypięta pod Y, rev bez zmian').toEqual(['Y', true, przed.rev]);
    expect(await pole(P, x)).toBe(T1);
  }, CZAS);

  it('„Przywróć” z Kosza: wersja leżąca też w karcie (stan po przerwanym scaleniu) zachowuje swoją chwilę przypisania; wersja tylko w Koszu wraca bez niej — wpis Kosza jej nie przechowuje', async () => {
    const A = await urzadzenie('A');
    const { P, ids: [v, w, u] } = await karta(A, 1, [22, 23, 24]);
    // v: do Kosza, potem rekord v z chwilą przypisania znów w karcie (jak po scaleniu przerwanym przed usunięciem wersji)
    await wstaw(A, v, T1);
    const rekordV = await rek(A, v);
    krok(); await A.vault.moveSnapshotToTrash(P, v);
    expect(await rek(A, v), 'kontrola: v poza kartą').toBeFalsy();
    await A.adapter.putSnapshotForUser(uid(A), rekordV);
    // w: do Kosza z chwilą przypisania, tylko w Koszu
    await wstaw(A, w, T1);
    krok(); await A.vault.moveSnapshotToTrash(P, w);
    krok();
    const rv = await A.vault.restoreTrashedSnapshot(P, v);
    expect(!!(rv && rv.alreadyInCard), 'kontrola: zapis przywrócenia, nie „już w karcie”').toBe(false);
    krok();
    await A.vault.restoreTrashedSnapshot(P, w);
    expect({ v: await pole(A, v), w: await pole(A, w), u: await pole(A, u) }).toEqual({ v: T1, w: null, u: null });
  }, CZAS);

  it('magazyn IndexedDB w trybie „Komputer prywatny”: „Scal pacjentów” i gwiazdka zachowują chwilę przypisania zapisaną w rekordzie', async () => {
    vi.stubGlobal('IDBKeyRange', AtrapaIDBKeyRange);
    const idb = utworzIndexedDB();
    const A = await urzadzenie('A', { magazynSejfu: 'natywny', indexedDB: idb });
    krok();
    const { patientId: X, snapshotId: v } = await A.vault.savePatient(naglowek(1), { dedup: false });
    krok();
    const { patientId: Y } = await A.vault.savePatient(naglowek(2, { masa: 30 }), { dedup: false });
    const baza = `vilda_user_${uid(A)}`;
    const wIdb = (tryb, f) => new Promise((ok, zle) => {
      const o = idb.open(baza);
      o.onerror = () => zle(o.error);
      o.onsuccess = () => {
        const db = o.result;
        const tx = db.transaction('snapshots', tryb);
        let w;
        f(tx.objectStore('snapshots'), (x) => { w = x; });
        tx.oncomplete = () => { db.close(); ok(w); };
        tx.onabort = tx.onerror = () => { db.close(); zle(tx.error); };
      };
    });
    const poleIdb = () => wIdb('readonly', (s, daj) => { const g = s.get(v); g.onsuccess = () => daj(g.result && POLE in g.result ? g.result[POLE] : null); });
    await wIdb('readwrite', (s) => { const g = s.get(v); g.onsuccess = () => { s.put({ ...g.result, [POLE]: T1 }); }; });
    krok(); await A.vault.mergePatients(X, Y);
    const poScaleniu = await poleIdb();
    krok(); await A.vault.setSnapshotPinned(Y, v, true);
    expect({ poScaleniu, poGwiazdce: await poleIdb() }).toEqual({ poScaleniu: T1, poGwiazdce: T1 });
  }, CZAS);
});

// ── Przesyłanie: eksporty i importy ─────────────────────────────────────────────────────────────────────────────────
// Elementy wersji sid w dowolnym obiekcie (ładunek, treść pliku karty, treść kopii konta).
function wszystkieElementy(o, sid, out = []) {
  if (Array.isArray(o)) o.forEach((x) => wszystkieElementy(x, sid, out));
  else if (o && typeof o === 'object') {
    if (o.snapshotId === sid && 'payload' in o) out.push(o);
    Object.values(o).forEach((x) => wszystkieElementy(x, sid, out));
  }
  return out;
}
// Cztery eksporty urządzenia d (treść odszyfrowana tym samym kontem): pełny ładunek, delta karty, plik karty, kopia konta.
async function eksporty(d, P) {
  const odszyfruj = (z) => d.vault.decryptPayloadForCurrentUser(z.iv, z.data);
  const delta = await d.vault.buildPatientDelta(P);
  const plik = await d.vault.exportPatientEnvelope(P);
  const kopia = await d.vault.exportVaultBackup();
  return {
    'eksport pełny': await eksport(d), 'delta karty': json(await odszyfruj(delta)),
    'plik karty': json(await odszyfruj(plik.payload)), 'kopia konta': json(await odszyfruj(kopia.payload)),
  };
}

describe('przesyłanie — eksporty i importy niosą chwilę przypisania, bez niej kształt jak dotąd', () => {
  it('eksport pełny, delta karty, plik karty i kopia konta niosą chwilę przypisania wersji za payload; wersja bez niej — bez niej', async () => {
    const A = await urzadzenie('A');
    const { P, ids: [v, w] } = await karta(A, 1, [22, 23]);
    await wstaw(A, v, T1);
    const wynik = {};
    for (const [nazwa, tresc] of Object.entries(await eksporty(A, P))) {
      const [ev] = wszystkieElementy(tresc, v), [ew] = wszystkieElementy(tresc, w);
      wynik[nazwa] = { v: [Object.keys(ev), ev[POLE]], w: Object.keys(ew) };
    }
    const oczekiwany = { v: [[...KLUCZE, POLE], T1], w: KLUCZE };
    expect(wynik).toEqual({ 'eksport pełny': oczekiwany, 'delta karty': oczekiwany, 'plik karty': oczekiwany, 'kopia konta': oczekiwany });
  }, CZAS);

  it('bez chwili przypisania element wersji każdego eksportu i każdej koperty wersji ma kształt jak dotąd (te same klucze w tej samej kolejności)', async () => {
    const A = await urzadzenie('A');
    const { P: X, ids } = await karta(A, 1, [22, 23]);
    const { P: Y } = await karta(A, 2, [30]);
    const ev = A.vault._eventLog;
    const ksztalty = new Set();
    const dodaj = (o) => { for (const sid of ids) for (const e of wszystkieElementy(o, sid)) ksztalty.add(JSON.stringify(Object.keys(e))); };
    for (const tresc of Object.values(await eksporty(A, X))) dodaj(tresc);
    for (const sid of ids) dodaj(await ev.buildSnapshotEvent(X, sid, null));
    dodaj(await ev.buildPatientFullEvents(X, null));
    krok(); await A.vault.mergePatients(X, Y);
    dodaj(await ev.buildPatientTombstoneEvent(X, null));
    for (const tresc of Object.values(await eksporty(A, Y))) dodaj(tresc);
    expect([...ksztalty]).toEqual([JSON.stringify(KLUCZE)]);
  }, CZAS);

  it('import karty z pliku zapisuje chwilę przypisania z pliku', async () => {
    const A = await urzadzenie('A');
    const D = await blizniak(A, 'D');
    const { P, ids: [v] } = await karta(A, 1, [22]);
    await wstaw(A, v, T1);
    const plik = await A.vault.exportPatientEnvelope(P);
    krok();
    await D.vault.importPatientFromEnvelope(plik, HASLO);
    expect((await rek(D, v)).patientId, 'kontrola: karta zaimportowana').toBe(P);
    expect(await pole(D, v)).toBe(T1);
  }, CZAS);

  it('„Scal kopię konta” — karty tu brak: zapisuje chwilę przypisania z kopii', async () => {
    const A = await urzadzenie('A');
    const E = await blizniak(A, 'E');
    const { ids: [v] } = await karta(A, 1, [22]);
    await wstaw(A, v, T1);
    const kopia = await A.vault.exportVaultBackup();
    krok();
    await E.vault.mergeVaultBackup(kopia, HASLO);
    expect(await pole(E, v)).toBe(T1);
  }, CZAS);

  it('„Scal kopię konta” — karta jest, wersji w niej brak: zapisuje chwilę przypisania z kopii', async () => {
    const A = await urzadzenie('A');
    const { P } = await karta(A, 1, [22]);
    const E = await blizniak(A, 'E');
    krok();
    const v = (await A.vault.savePatient(naglowek(1, { masa: 23 }), { dedup: false, patientId: P })).snapshotId;
    await wstaw(A, v, T1);
    const kopia = await A.vault.exportVaultBackup();
    krok();
    await E.vault.mergeVaultBackup(kopia, HASLO);
    expect((await rek(E, v)).patientId, 'kontrola: v w istniejącej karcie').toBe(P);
    expect(await pole(E, v)).toBe(T1);
  }, CZAS);

  it('odtworzenie konta z kopii (restoreVaultBackup) zapisuje chwilę przypisania z kopii', async () => {
    const A = await urzadzenie('A');
    const { ids: [v] } = await karta(A, 1, [22]);
    await wstaw(A, v, T1);
    const kopia = await A.vault.exportVaultBackup();
    const R = await urzadzenie('R', { haslo: 'Vilda#Odtworzenie!2026abc' });
    krok();
    await R.vault.restoreVaultBackup(kopia, HASLO, { label: 'Fikcyjne odtworzenie konta' });
    expect(await pole(R, v)).toBe(T1);
  }, CZAS);
});

// ── Koperta zdarzenia ───────────────────────────────────────────────────────────────────────────────────────────────
describe('koperta zdarzenia — chwila przypisania w kształcie elementu eksportu', () => {
  it('koperty wersji, pełnej karty i nagrobka z kartą docelową niosą chwilę przypisania w kształcie elementu eksportu (za payload)', async () => {
    const A = await urzadzenie('A');
    const { P: X, ids: [v] } = await karta(A, 1, [22, 23]);
    const { P: Y } = await karta(A, 2, [30]);
    await wstaw(A, v, T1);
    const ev = A.vault._eventLog;
    const elEksportu = async () => elementy(await eksport(A), v)[0];
    const przed = await elEksportu();
    const snap = elementy(await ev.buildSnapshotEvent(X, v, null), v)[0];
    const pfull = (await ev.buildPatientFullEvents(X, null)).flatMap((k) => elementy(k, v))[0];
    krok(); await A.vault.mergePatients(X, Y);
    const po = await elEksportu();
    const ptomb = elementy(await ev.buildPatientTombstoneEvent(X, null), v)[0];
    expect({ snap, pfull, ptomb }, 'element koperty = element eksportu').toEqual({ snap: przed, pfull: przed, ptomb: po });
    expect([Object.keys(snap), snap[POLE], Object.keys(ptomb), ptomb[POLE]]).toEqual([[...KLUCZE, POLE], T1, [...KLUCZE, POLE], T1]);
  }, CZAS);

  it('encryptEvent przyjmuje kopertę z chwilą przypisania (wersja, pełna karta); obce pole wersji i numer kolejny wersji dalej odrzucane (EVENT_ENVELOPE_INVALID)', async () => {
    const A = await urzadzenie('A');
    const { P, ids: [v] } = await karta(A, 1, [22]);
    const ev = A.vault._eventLog;
    const k = await ev.buildSnapshotEvent(P, v, null);
    const [pf] = await ev.buildPatientFullEvents(P, null);
    const zmien = (x, f) => { const y = json(x); y.patients[0].snapshots.forEach(f); return y; };
    const wynik = async (x) => { try { await ev.encryptEvent(x); return 'ok'; } catch (e) { return (e && e.code) || String(e); } };
    expect({
      bez: await wynik(k),
      wersja: await wynik(zmien(k, (s) => { s[POLE] = T1; })),
      pelnaKarta: await wynik(zmien(pf, (s) => { s[POLE] = T1; })),
      obcePole: await wynik(zmien(k, (s) => { s.assignedAt = T1; })),
      numerKolejny: await wynik(zmien(k, (s) => { s.seq = 3; })),
    }).toEqual({ bez: 'ok', wersja: 'ok', pelnaKarta: 'ok', obcePole: 'EVENT_ENVELOPE_INVALID', numerKolejny: 'EVENT_ENVELOPE_INVALID' });
  }, CZAS);

  // Koperty „Scal pacjentów” X → Y z buildera: każda wersja Y (przeniesione i nowa głowa), pełna karta Y i nagrobek X
  // z kartą docelową — rodzaj, klucz i wynik szyfrowania; przebieg z chwilą przypisania przeniesionej wersji i bez niej.
  async function kopertyScalenia(n, zPolem) {
    ustaw(START);
    const A = await urzadzenie(`A ${n}`);
    const { P: X, ids: [v] } = await karta(A, 1, [22, 23]);
    const { P: Y } = await karta(A, 2, [30]);
    if (zPolem) await wstaw(A, v, T1);
    krok(); await A.vault.mergePatients(X, Y);
    const ev = A.vault._eventLog;
    const koperty = [];
    for (const s of await A.adapter.listSnapshotsForUser(uid(A), Y)) koperty.push(await ev.buildSnapshotEvent(Y, s.snapshotId, null));
    koperty.push(...await ev.buildPatientFullEvents(Y, null), await ev.buildPatientTombstoneEvent(X, null));
    const et = { [X]: 'X', [Y]: 'Y' };
    const opis = [];
    for (const k of koperty) {
      let szyfr;
      try { await ev.encryptEvent(k); szyfr = 'ok'; } catch (e) { szyfr = (e && e.code) || 'błąd'; }
      opis.push([k.event.kind, String(k.event.key).split('/').map((x) => et[x] || 'wersja').join('/'), szyfr]);
    }
    return { opis: opis.sort(), pole: await pole(A, v) };
  }
  it('„Scal pacjentów” wersji z chwilą przypisania: koperty przeniesionych wersji, nowej głowy, pełnej karty i nagrobka karty źródłowej z kartą docelową powstają i szyfrują się jak bez niej (żadna nie znika)', async () => {
    const bez = await kopertyScalenia('bez', false);
    const z = await kopertyScalenia('z', true);
    expect(z.pole, 'kontrola: przeniesiona wersja z chwilą przypisania').toBe(T1);
    expect(z.opis).toEqual(bez.opis);
    expect(bez.opis.every((x) => x[2] === 'ok'), 'kontrola: każda koperta zaszyfrowana').toBe(true);
  }, CZAS);

  it('zastosowanie koperty z chwilą przypisania (applyEncryptedEvent) zapisuje ją w rekordzie — wersja nowa dla odbiorcy i wersja tej samej karty', async () => {
    const A = await urzadzenie('A');
    const { P, ids: [v] } = await karta(A, 1, [22]);
    const B = await blizniak(A, 'B');
    const { P: Q, ids: [q] } = await karta(A, 2, [30]);
    const ev = A.vault._eventLog;
    // Koperta jawna buildera z polem w elemencie wersji, zaszyfrowana kluczem konta (jak od urządzenia, które pole zapisuje).
    const koperta = async (pid, sid, wartosc) => {
      const k = json(await ev.buildSnapshotEvent(pid, sid, null));
      k.patients[0].snapshots[0][POLE] = wartosc;
      return A.vault.encryptPayloadForCurrentUser(k);
    };
    krok();
    const r1 = await B.vault._eventLog.applyEncryptedEvent(await koperta(Q, q, T1));
    const r2 = await B.vault._eventLog.applyEncryptedEvent(await koperta(P, v, T2));
    expect([r1.status, r2.status], 'kontrola: zastosowane').toEqual(['applied', 'applied']);
    expect({ nowa: await pole(B, q), taSamaKarta: await pole(B, v) }).toEqual({ nowa: T1, taSamaKarta: T2 });
  }, CZAS);

  it('koperta wpisu Kosza nie niesie chwili przypisania (wpis Kosza jej nie przechowuje), także element Kosza w eksporcie', async () => {
    const A = await urzadzenie('A');
    const { P, ids: [v] } = await karta(A, 1, [22, 23]);
    await wstaw(A, v, T1);
    krok(); await A.vault.moveSnapshotToTrash(P, v);
    const ev = A.vault._eventLog;
    const k = await ev.buildSnapshotTombstoneEvent(v, null);
    expect(k && (k.snapshotTombstones || []).some((e) => e.snapshotId === v), 'kontrola: koperta wpisu Kosza v').toBe(true);
    await ev.encryptEvent(k);
    expect({ koperta: JSON.stringify(k).includes(POLE), eksport: JSON.stringify((await eksport(A)).snapshotTombstones || []).includes(POLE) })
      .toEqual({ koperta: false, eksport: false });
  }, CZAS);
});

// ── Funkcje z kodu sejfu (domknięcie wywołań po deklaracjach pliku, acorn + eslint-scope) ───────────────────────────
const ZRODLO_SEJFU = zrodlo('vilda_vault.js');
let SEJF_AST = null;
function sejfAst() {
  if (SEJF_AST) return SEJF_AST;
  const ast = parse(ZRODLO_SEJFU, { ecmaVersion: 'latest', sourceType: 'script', ranges: true });
  const sm = analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
  const iife = ast.body[0].expression.callee;
  const zakres = sm.acquire(iife);
  const dekl = new Map();
  for (const z of zakres.variables) { const d0 = z.defs[0]; if (d0 && d0.type === 'FunctionName') dekl.set(z.name, d0.node); }
  SEJF_AST = { ast, sm, zakres, dekl };
  return SEJF_AST;
}
function domkniecie(korzenie) {
  const { sm, zakres, dekl } = sejfAst();
  const wolane = (node) => {
    const out = new Set();
    const odwiedz = (z) => {
      for (const r of z.references) if (r.resolved && r.resolved.scope === zakres) out.add(r.resolved.name);
      for (const c of z.childScopes) odwiedz(c);
    };
    odwiedz(sm.acquire(node));
    return out;
  };
  const widziane = new Set();
  const q = [...korzenie];
  while (q.length) {
    const n = q.shift();
    if (widziane.has(n)) continue;
    expect(dekl.has(n), `${n}: w domknięciu tylko funkcje pliku (bez zmiennych zewnętrznych)`).toBe(true);
    widziane.add(n);
    for (const w of wolane(dekl.get(n))) q.push(w);
  }
  return widziane;
}
// Funkcje sejfu wycięte z kodu (z domknięciem) i wykonane poza oknem.
function zSejfu(korzenie) {
  const { dekl } = sejfAst();
  const kod = [...domkniecie(korzenie)].map((n) => ZRODLO_SEJFU.slice(...dekl.get(n).range)).join('\n');
  return new Function(`${kod}\nreturn { ${korzenie.join(', ')} };`)();
}

describe('porównanie — do której karty należy wersja wspólna dwóm kartom (Bsw_ladunekWygrywa z kodu sejfu)', () => {
  const WCZESNA_ZMIANA = '2026-03-02T08:10:00.000Z', POZNA_ZMIANA = '2026-03-02T08:50:00.000Z';
  const f = () => zSejfu(['Bsw_ladunekWygrywa', 'mt', 'Bsw_zmiana']);
  // Reguła sprzed tej zmiany (rev, przy równym rev późniejsza chwila zmiany, przy pełnym remisie mniejszy patientId).
  const dotad = (s, S, g, F, G) => {
    const rz = s.mt(S), rl = s.mt(g), zz = s.Bsw_zmiana(S), zl = s.Bsw_zmiana(g);
    if (rz !== rl || zz !== zl) return rz !== rl ? rz > rl : zz > zl;
    return F < G;
  };

  it('późniejsza chwila przypisania z ładunku wygrywa mimo niższego rev i wcześniejszej chwili zmiany (z tutejszą wcześniejszą i bez tutejszej)', () => {
    const s = f();
    const S = { rev: 1, updatedAtISO: WCZESNA_ZMIANA, [POLE]: T2 };
    expect([
      s.Bsw_ladunekWygrywa(S, { rev: 4, updatedAtISO: POZNA_ZMIANA, [POLE]: T1 }, 'b', 'a'),
      s.Bsw_ladunekWygrywa(S, { rev: 4, updatedAtISO: POZNA_ZMIANA }, 'b', 'a'),
    ]).toEqual([true, true]);
  });

  it('późniejsza tutejsza chwila przypisania wygrywa z ładunkiem o wyższym rev i późniejszej chwili zmiany (z wcześniejszą w ładunku i bez niej)', () => {
    const s = f();
    const g = { rev: 1, updatedAtISO: WCZESNA_ZMIANA, [POLE]: T2 };
    expect([
      s.Bsw_ladunekWygrywa({ rev: 4, updatedAtISO: POZNA_ZMIANA, [POLE]: T1 }, g, 'a', 'b'),
      s.Bsw_ladunekWygrywa({ rev: 4, updatedAtISO: POZNA_ZMIANA }, g, 'a', 'b'),
    ]).toEqual([false, false]);
  });

  it('brak chwili przypisania liczy się jak najwcześniejsza — po stronie ładunku i po stronie tutejszej; chwila w złej postaci tak samo', () => {
    const s = f();
    expect([
      s.Bsw_ladunekWygrywa({ rev: 0, [POLE]: T1 }, { rev: 9, updatedAtISO: POZNA_ZMIANA }, 'b', 'a'),
      s.Bsw_ladunekWygrywa({ rev: 9, updatedAtISO: POZNA_ZMIANA }, { rev: 0, [POLE]: T1 }, 'a', 'b'),
      s.Bsw_ladunekWygrywa({ rev: 0, [POLE]: T1 }, { rev: 9, updatedAtISO: POZNA_ZMIANA, [POLE]: '2026-03-02T09:40:00Z' }, 'b', 'a'),
      s.Bsw_ladunekWygrywa({ rev: 9, updatedAtISO: POZNA_ZMIANA, [POLE]: 1772443800000 }, { rev: 0, [POLE]: T1 }, 'a', 'b'),
    ]).toEqual([true, false, true, false]);
  });

  it('ta sama chwila przypisania po obu stronach — reguła dotychczasowa: rev, potem chwila zmiany, potem mniejszy identyfikator karty', () => {
    const s = f();
    const z = (o) => ({ ...o, [POLE]: T1 });
    expect([
      s.Bsw_ladunekWygrywa(z({ rev: 2 }), z({ rev: 1, updatedAtISO: POZNA_ZMIANA }), 'b', 'a'),
      s.Bsw_ladunekWygrywa(z({ rev: 1, updatedAtISO: POZNA_ZMIANA }), z({ rev: 2 }), 'a', 'b'),
      s.Bsw_ladunekWygrywa(z({ rev: 1, updatedAtISO: POZNA_ZMIANA }), z({ rev: 1, updatedAtISO: WCZESNA_ZMIANA }), 'b', 'a'),
      s.Bsw_ladunekWygrywa(z({ rev: 1, updatedAtISO: WCZESNA_ZMIANA }), z({ rev: 1, updatedAtISO: WCZESNA_ZMIANA }), 'a', 'b'),
      s.Bsw_ladunekWygrywa(z({ rev: 1, updatedAtISO: WCZESNA_ZMIANA }), z({ rev: 1, updatedAtISO: WCZESNA_ZMIANA }), 'b', 'a'),
    ]).toEqual([true, false, true, true, false]);
  });

  // Wartości brzegowe rev (brak, ujemny, ułamek, napis, NaN, nieskończoność) i chwili zmiany (brak, null, pusty napis,
  // napis spoza postaci ISO) — rev i chwila zmiany interpretowane jak w sejfie (mt, Bsw_zmiana).
  const REV = [undefined, 0, 1, 2, -1, 1.7, '2', NaN, Infinity];
  const ZMIANA = [undefined, null, '', WCZESNA_ZMIANA, POZNA_ZMIANA, 'bzdura'];
  const rekord = (rev, zmiana, dodatki = {}) => ({ ...(rev === undefined ? {} : { rev }), ...(zmiana === undefined ? {} : { updatedAtISO: zmiana }), ...dodatki });
  const tablica = () => {
    const out = [];
    for (const r1 of REV) for (const z1 of ZMIANA) for (const r2 of REV) for (const z2 of ZMIANA) for (const [F, G] of [['a', 'b'], ['b', 'a'], ['a', 'a']]) out.push([r1, z1, r2, z2, F, G]);
    return out;
  };

  it('bez chwili przypisania po obu stronach wynik jak dotąd — tablica przypadków (rev, chwila zmiany, identyfikatory, wartości brzegowe)', () => {
    const s = f();
    const rozne = [];
    let n = 0;
    for (const [r1, z1, r2, z2, F, G] of tablica()) {
      n += 1;
      const S = rekord(r1, z1), g = rekord(r2, z2);
      if (s.Bsw_ladunekWygrywa(S, g, F, G) !== dotad(s, S, g, F, G)) rozne.push(JSON.stringify([S, g, F, G]));
    }
    expect(n, 'kontrola: liczba przypadków').toBe(REV.length ** 2 * ZMIANA.length ** 2 * 3);
    expect(rozne.slice(0, 5)).toEqual([]);
  });

  const ZLE = ['2026-03-02T09:30:00Z', '2026-03-02T09:30:00.000+01:00', ' 2026-03-02T09:30:00.000Z', '2026-02-30T09:30:00.000Z',
    '10000-01-01T00:00:00.000Z', '+010000-01-01T00:00:00.000Z', '', 1772443800000, null, {}, [T1], true];
  it('chwila przypisania w złej postaci (bez milisekund, ze strefą, ze spacją, nieistniejący dzień, rok 10000, pusty napis, liczba, null, obiekt, tablica) liczy się w porównaniu jak brak', () => {
    const s = f();
    const rozne = [];
    for (const zla of ZLE) {
      for (const [r1, z1, r2, z2, F, G] of [[0, WCZESNA_ZMIANA, 3, POZNA_ZMIANA, 'b', 'a'], [3, POZNA_ZMIANA, 0, WCZESNA_ZMIANA, 'a', 'b'], [1, WCZESNA_ZMIANA, 1, WCZESNA_ZMIANA, 'a', 'b'], [1, WCZESNA_ZMIANA, 1, WCZESNA_ZMIANA, 'b', 'a']]) {
        const S = rekord(r1, z1), g = rekord(r2, z2);
        const bez = s.Bsw_ladunekWygrywa(S, g, F, G);
        if (s.Bsw_ladunekWygrywa({ ...S, [POLE]: zla }, g, F, G) !== bez) rozne.push(`ładunek ${JSON.stringify(zla)}`);
        if (s.Bsw_ladunekWygrywa(S, { ...g, [POLE]: zla }, F, G) !== bez) rozne.push(`tutaj ${JSON.stringify(zla)}`);
      }
    }
    expect(rozne).toEqual([]);
  });

  it('chwila przypisania w złej postaci nie przechodzi do rekordu (scalenie wersji z ładunku i tej samej karty), eksportu ani koperty', async () => {
    const A = await urzadzenie('A');
    const { P, ids: [v] } = await karta(A, 1, [22]);
    const B = await blizniak(A, 'B');
    const { ids: [q] } = await karta(B, 2, [30]);
    const wynik = [];
    for (const zla of ZLE.filter((x) => x !== null)) {
      krok();
      await scal(B, A, (l) => zPolem(zPolem(l, v, zla), q, zla));
      wynik.push([await pole(A, v), await pole(A, q)]);
      await wstaw(A, v, zla);
      const el = elementy(await eksport(A), v)[0];
      const k = elementy(await A.vault._eventLog.buildSnapshotEvent(P, v, null), v)[0];
      wynik.push([POLE in el, POLE in k]);
      await wstaw(A, v, undefined);
    }
    expect(wynik.filter((x) => x.some((y) => y !== null && y !== false))).toEqual([]);
  }, CZAS);

  it('strażnik natywny przewiduje przeniesienie tą samą regułą: fragment natywny woła Bsw_ladunekWygrywa z surowym elementem ładunku i surowym tutejszym rekordem, bez własnego porównania i bez nazwy pola', () => {
    const od = ZRODLO_SEJFU.indexOf('/* BEGIN VILDA CLINICAL WORKSPACE NATIVE V1 */');
    const doK = ZRODLO_SEJFU.indexOf('/* END VILDA CLINICAL WORKSPACE NATIVE V1 */');
    expect(od > 0 && doK > od, 'kontrola: fragment natywny').toBe(true);
    const frag = ZRODLO_SEJFU.slice(od, doK);
    const wywolania = frag.match(/Bsw_ladunekWygrywa\([^)]*\)/g) || [];
    expect(wywolania).toEqual(['Bsw_ladunekWygrywa(snapshot, currentSnapshot, destination.patientId, currentSnapshot.patientId)']);
    expect(frag.includes(POLE), 'fragment natywny bez nazwy pola').toBe(false);
    expect(/(?:snapshot|currentSnapshot)\s*=\s*Object\.assign/.test(frag), 'bez kopii rekordu przed wywołaniem').toBe(false);
  });
});

describe('porównanie w scalaniu — wersja wspólna dwóm kartom rozstrzygana najpierw chwilą przypisania', () => {
  it('ładunek z późniejszą chwilą przypisania i niższym rev (B: „Scal pacjentów” X → Y; A dwa razy poprawia v w X i zapisuje X) — v przechodzi pod Y z późniejszą treścią tutejszą', async () => {
    const c = await dwieKarty();
    krok(); await c.B.vault.mergePatients(c.X, c.Y);
    await popraw(c.A, c.v, 27);
    await popraw(c.A, c.v, 28);
    krok(); await c.A.vault.savePatient(naglowek(1, { masa: 29 }), { dedup: false, patientId: c.X });
    krok();
    await scal(c.B, c.A, (l) => zPolem(l, c.v, T1));
    const s = await stan(c.A, c.v, c.et);
    expect({ karta: s.karta, masa: s.masa, pole: await pole(c.A, c.v) }).toEqual({ karta: 'Y', masa: 28, pole: T1 });
  }, CZAS);

  it('późniejsza tutejsza chwila przypisania przy wyższym rev z ładunku (A: „Scal pacjentów” X → Y; B dwa razy poprawia v w X i zapisuje X) — v zostaje pod Y, poprawka z B przechodzi do jej treści', async () => {
    const c = await dwieKarty();
    krok(); await c.A.vault.mergePatients(c.X, c.Y);
    await wstaw(c.A, c.v, T1);
    await popraw(c.B, c.v, 27);
    await popraw(c.B, c.v, 28);
    krok(); await c.B.vault.savePatient(naglowek(1, { masa: 29 }), { dedup: false, patientId: c.X });
    krok();
    await scal(c.B, c.A);
    const s = await stan(c.A, c.v, c.et);
    expect({ karta: s.karta, masa: s.masa, pole: await pole(c.A, c.v) }).toEqual({ karta: 'Y', masa: 28, pole: T1 });
  }, CZAS);
});

// ── Nikt nie ustawia chwili przypisania w tym wydaniu ───────────────────────────────────────────────────────────────
// Wystąpienia nazwy pola w drzewie składni: klucz obiektu, odczyt właściwości, napis, inne (szablon, identyfikator,
// napis zawierający nazwę) — z funkcją pliku i stałą, w których leżą.
function wystapienia(ast, nazwa) {
  const out = [];
  const idz = (n, rodzic, ctx) => {
    if (!n || typeof n.type !== 'string') return;
    let c = ctx;
    if (n.type === 'FunctionDeclaration' && n.id && !ctx.fn) c = { ...ctx, fn: n.id.name };
    if (n.type === 'VariableDeclarator' && n.id && n.id.type === 'Identifier' && !ctx.fn && !ctx.stala) c = { ...ctx, stala: n.id.name };
    const klucz = (k) => k && ((k.type === 'Identifier' && k.name === nazwa) || (k.type === 'Literal' && k.value === nazwa));
    if (n.type === 'Property' && !n.computed && klucz(n.key)) out.push({ rodzaj: rodzic && rodzic.type === 'ObjectPattern' ? 'odczyt' : 'klucz', ...c });
    else if (n.type === 'MemberExpression' && ((!n.computed && klucz(n.property)) || (n.computed && n.property.type === 'Literal' && n.property.value === nazwa))) out.push({ rodzaj: 'odczyt', ...c });
    else if (n.type === 'Literal' && typeof n.value === 'string' && n.value.includes(nazwa)) {
      const jakoKlucz = rodzic && ((rodzic.type === 'Property' && rodzic.key === n) || (rodzic.type === 'MemberExpression' && rodzic.property === n));
      if (!jakoKlucz) out.push({ rodzaj: n.value === nazwa ? 'napis' : 'inne', ...c });
    } else if (n.type === 'TemplateElement' && String(n.value && n.value.raw).includes(nazwa)) out.push({ rodzaj: 'inne', ...c });
    else if (n.type === 'Identifier' && n.name === nazwa && !(rodzic && ((rodzic.type === 'Property' && rodzic.key === n) || (rodzic.type === 'MemberExpression' && rodzic.property === n)))) out.push({ rodzaj: 'inne', ...c });
    for (const k of Object.keys(n)) {
      if (k === 'parent') continue;
      const x = n[k];
      if (Array.isArray(x)) x.forEach((y) => idz(y, n, c));
      else if (x && typeof x.type === 'string') idz(x, n, c);
    }
  };
  idz(ast, null, {});
  return out;
}
// Zegar w ciele funkcji (jak w tests/unit/sync-zdarzenia-buildery.test.mjs): new Date() bez argumentu, Date(…),
// Date.now, performance.now, Date[…]; new Date(<arg>) to parsowanie (dozwolone).
function zegar(node) {
  const z = [];
  const idz = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'NewExpression' && n.callee.type === 'Identifier' && n.callee.name === 'Date' && n.arguments.length === 0) z.push('new Date()');
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'Date') z.push('Date()');
    if (n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && n.property.name === 'now' && ['Date', 'performance'].includes(n.object.name)) z.push(`${n.object.name}.now`);
    if (n.type === 'MemberExpression' && n.computed && n.object.type === 'Identifier' && ['Date', 'performance'].includes(n.object.name)) z.push(`${n.object.name}[…]`);
    for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach(idz); else if (x && typeof x.type === 'string') idz(x); }
  };
  idz(node.body);
  return z;
}
const DOZWOLONE = { klucz: ['Bsw_przypisanie'], odczyt: ['Bsw_chwilaPrzypisania'], napis: ['Bev_POLA_WERSJI', 'Bev_ECHO_POMIJANE'] };
const niedozwolone = (lista) => lista.filter((w) => !(DOZWOLONE[w.rodzaj] || []).includes(w.rodzaj === 'napis' ? w.stala : w.fn))
  .map((w) => `${w.rodzaj} w ${w.fn || w.stala || '(poza funkcją)'}`);

describe('nikt nie ustawia chwili przypisania w tym wydaniu', () => {
  it('w kodzie sejfu chwila przypisania powstaje tylko jako kopia albo późniejsza z istniejących wartości: klucz obiektu tylko w Bsw_przypisanie, odczyt tylko w Bsw_chwilaPrzypisania, napis tylko w liście pól koperty i stałej odsyłania; obie funkcje bez zegara i bez innych wywołań', () => {
    // samokontrola wykrywacza na kodzie z naruszeniami
    const proba = parse(`function Bsw_poScaleniu(w, c) { return { patientId: c, ${POLE}: new Date().toISOString() }; }
      function inna(x) { return x.${POLE} || x['${POLE}']; } const Bev_POLA_WERSJI = ['${POLE}']; const LISTA = ['${POLE}', 'x${POLE}'];`, { ecmaVersion: 'latest' });
    expect(niedozwolone(wystapienia(proba, POLE))).toEqual(['klucz w Bsw_poScaleniu', 'odczyt w inna', 'odczyt w inna', 'napis w LISTA', 'inne w LISTA']);
    const { ast, dekl } = sejfAst();
    const lista = wystapienia(ast, POLE);
    expect(niedozwolone(lista), 'wystąpienia nazwy pola poza dozwolonymi miejscami').toEqual([]);
    if (lista.length) {
      for (const n of ['Bsw_przypisanie', 'Bsw_chwilaPrzypisania']) expect(dekl.has(n), `${n} w sejfie`).toBe(true);
      expect([...domkniecie(['Bsw_przypisanie'])].sort(), 'domknięcie wywołań pomocniczych').toEqual(['Bnp_iso', 'Bsw_chwilaPrzypisania', 'Bsw_przypisanie']);
      expect([...domkniecie(['Bsw_przypisanie'])].flatMap((n) => zegar(dekl.get(n))), 'bez zegara').toEqual([]);
    }
  });

  it('bez chwili przypisania na wejściu żadna droga jej nie tworzy: zapisy, poprawka, gwiazdka, Kosz i „Przywróć”, „Scal pacjentów”, „Usuń pacjenta”, przycięcie, wymiany pełnych kopii z bliźniakiem i ze starszą aplikacją (221, 276), koperty, import karty, „Scal kopię konta” i odtworzenie konta — ani w rekordach, ani w eksportach, kopertach i plikach', async () => {
    const A = await urzadzenie('A');
    const { P: X, ids: [x1, x2, x3] } = await karta(A, 1, [20, 22, 24]);
    const { P: Y } = await karta(A, 2, [30]);
    const { P: Z } = await karta(A, 3, [40]);
    const B = await blizniak(A, 'B');
    const O221 = await blizniak(A, 'S221', { zrodla: zrodlaStarszej('S221') });
    const O276 = await blizniak(A, 'S276', { zrodla: zrodlaStarszej('S276') });
    const D = await blizniak(A, 'D');
    const E = await blizniak(A, 'E');
    await popraw(A, x1, 21);
    await gwiazdka(A, x2);
    krok(); await A.vault.moveSnapshotToTrash(X, x3);
    krok(); await A.vault.restoreTrashedSnapshot(X, x3);
    krok(); await A.vault.mergePatients(X, Y);
    krok(); await A.vault.removePatient(Z);
    krok(); await A.vault.pruneSnapshotsForPatient(Y, { recentHours: 0 });
    await popraw(B, x1, 25);
    await karta(B, 4, [50]);
    await popraw(O276, x2, 26);
    const wymiany = [[B, A], [A, B], [O221, A], [A, O221], [O276, A], [A, O276], [B, O276], [O276, B]];
    for (let i = 0; i < 2; i += 1) for (const [z, na] of wymiany) { krok(); await scal(z, na); }
    const teksty = [];
    // koperty z A, zastosowane na B i 276
    const ev = A.vault._eventLog;
    const koperty = [];
    for (const k of await A.adapter.listPatientsForUser(uid(A))) {
      for (const s of await A.adapter.listSnapshotsForUser(uid(A), k.patientId)) koperty.push(await ev.buildSnapshotEvent(k.patientId, s.snapshotId, null));
      koperty.push(...await ev.buildPatientFullEvents(k.patientId, null));
    }
    koperty.push(await ev.buildPatientTombstoneEvent(X, null), await ev.buildPatientTombstoneEvent(Z, null));
    for (const e of (await eksport(A)).snapshotTombstones || []) koperty.push(await ev.buildSnapshotTombstoneEvent(e.snapshotId, null));
    for (const k of koperty.filter(Boolean)) {
      teksty.push(['koperta', JSON.stringify(k)]);
      const { env } = await ev.encryptEvent(k);
      for (const O of [B, O276]) expect((await O.vault._eventLog.applyEncryptedEvent(env)).status, `kontrola: koperta ${k.event.kind} na ${O.nazwa}`).toBe('applied');
    }
    // pliki
    const plik = await A.vault.exportPatientEnvelope(Y);
    const kopia = await A.vault.exportVaultBackup();
    teksty.push(['plik karty', JSON.stringify(await A.vault.decryptPayloadForCurrentUser(plik.payload.iv, plik.payload.data))]);
    teksty.push(['kopia konta', JSON.stringify(await A.vault.decryptPayloadForCurrentUser(kopia.payload.iv, kopia.payload.data))]);
    krok(); await D.vault.importPatientFromEnvelope(plik, HASLO);
    krok(); await E.vault.mergeVaultBackup(kopia, HASLO);
    const R = await urzadzenie('R', { haslo: 'Vilda#Odtworzenie!2026abc' });
    krok(); await R.vault.restoreVaultBackup(kopia, HASLO, { label: 'Fikcyjne odtworzenie konta' });
    // rekordy i eksporty każdego urządzenia
    for (const d of [A, B, O221, O276, D, E, R]) {
      const rekordy = [];
      for (const k of await d.adapter.listPatientsForUser(uid(d))) rekordy.push(...await d.adapter.listSnapshotsForUser(uid(d), k.patientId));
      expect(rekordy.length, `kontrola: wersje na ${d.nazwa}`).toBeGreaterThan(0);
      teksty.push([`rekordy ${d.nazwa}`, JSON.stringify(rekordy)], [`eksport ${d.nazwa}`, JSON.stringify(await eksport(d))]);
    }
    expect(teksty.filter(([, t]) => t.includes(POLE)).map(([n]) => n)).toEqual([]);
  }, 2 * CZAS);
});

// ── Zgodność wstecz: starsza aplikacja (sejfy 221 i 276 z fikstur) ──────────────────────────────────────────────────
describe('zgodność wstecz — starsza aplikacja przyjmuje dane z chwilą przypisania bez błędu i ją gubi', () => {
  async function flota() {
    const A = await urzadzenie('A');
    const O221 = await blizniak(A, 'S221', { zrodla: zrodlaStarszej('S221') });
    const O276 = await blizniak(A, 'S276', { zrodla: zrodlaStarszej('S276') });
    const N = await blizniak(A, 'N');
    const { P, ids: [v] } = await karta(A, 1, [22]);
    return { A, O221, O276, N, P, v };
  }
  const bladLubOk = async (f) => { try { await f(); return 'ok'; } catch (e) { return (e && (e.code || e.message)) || 'błąd'; } };

  it('sejf 221 i 276 przyjmują pełny ładunek z chwilą przypisania bez błędu i zapisują wersję bez niej (wersja nowa i poprawka wersji tej samej karty)', async () => {
    const f = await flota();
    const wynik = {};
    krok();
    const lad = zPolem(await eksport(f.A), f.v, T1);
    await popraw(f.A, f.v, 23);
    const lad2 = zPolem(await eksport(f.A), f.v, T2);
    for (const O of [f.O221, f.O276]) {
      wynik[O.nazwa] = { nowa: await bladLubOk(() => O.vault.mergeSyncPayload(json(lad))), poNowej: await pole(O, f.v) };
      wynik[O.nazwa].poprawka = await bladLubOk(() => O.vault.mergeSyncPayload(json(lad2)));
      wynik[O.nazwa].poPoprawce = [await pole(O, f.v), (await wersja(O, f.v)).payload.user.weight];
    }
    const oczekiwany = { nowa: 'ok', poNowej: null, poprawka: 'ok', poPoprawce: [null, 23] };
    expect(wynik).toEqual({ S221: oczekiwany, S276: oczekiwany });
  }, CZAS);

  it('sejf 276 stosuje kopertę z chwilą przypisania (applied), sejf 221 (bez dziennika zdarzeń) scala ją jako ładunek bez błędu; obie wersje bez niej', async () => {
    const f = await flota();
    const k = json(await f.A.vault._eventLog.buildSnapshotEvent(f.P, f.v, null));
    k.patients[0].snapshots[0][POLE] = T1;
    const env = await f.A.vault.encryptPayloadForCurrentUser(k);
    const r276 = await f.O276.vault._eventLog.applyEncryptedEvent(env);
    const r221 = await bladLubOk(() => f.O221.vault.mergeSyncPayload(json(k)));
    expect({ r276: r276.status, r221, p276: await pole(f.O276, f.v), p221: await pole(f.O221, f.v) })
      .toEqual({ r276: 'applied', r221: 'ok', p276: null, p221: null });
  }, CZAS);

  it('plik karty z chwilą przypisania: bieżąca wersja ją zapisuje, import w sejfie 221 i 276 bez błędu, wersja bez niej', async () => {
    const f = await flota();
    await wstaw(f.A, f.v, T1);
    const plik = await f.A.vault.exportPatientEnvelope(f.P);
    const tresc = await f.A.vault.decryptPayloadForCurrentUser(plik.payload.iv, plik.payload.data);
    expect(wszystkieElementy(tresc, f.v).map((e) => e[POLE]), 'plik niesie chwilę przypisania').toEqual([T1]);
    const wynik = {};
    for (const O of [f.N, f.O221, f.O276]) {
      krok();
      wynik[O.nazwa] = [await bladLubOk(() => O.vault.importPatientFromEnvelope(plik, HASLO)), await pole(O, f.v)];
    }
    expect(wynik).toEqual({ N: ['ok', T1], S221: ['ok', null], S276: ['ok', null] });
  }, CZAS);

  it('kopia konta z chwilą przypisania: „Scal kopię konta” w bieżącej wersji ją zapisuje, w sejfie 221 i 276 bez błędu, wersja bez niej', async () => {
    const f = await flota();
    await wstaw(f.A, f.v, T1);
    const kopia = await f.A.vault.exportVaultBackup();
    const tresc = await f.A.vault.decryptPayloadForCurrentUser(kopia.payload.iv, kopia.payload.data);
    expect(wszystkieElementy(tresc, f.v).map((e) => e[POLE]), 'kopia niesie chwilę przypisania').toEqual([T1]);
    const wynik = {};
    for (const O of [f.N, f.O221, f.O276]) {
      krok();
      wynik[O.nazwa] = [await bladLubOk(() => O.vault.mergeVaultBackup(kopia, HASLO)), await pole(O, f.v)];
    }
    expect(wynik).toEqual({ N: ['ok', T1], S221: ['ok', null], S276: ['ok', null] });
  }, CZAS);
});
