// P-SYNC-WLASCICIEL (E3-PR0e2a) — chwila przypisania wersji do karty (pole rekordu wersji assignedAtISO), pierwsze
// wydanie nowego pola w dwóch wydaniach (decyzja właściciela z 2026-11-23, wzór decyzji z 2026-11-17).
//
// To wydanie pole PRZECHOWUJE i PRZESYŁA, ale żadna droga produkcyjna go nie ustawia (zacznie E3-PR0e2b, w „Scal
// pacjentów”, po potwierdzeniu właściciela, że wszystkie urządzenia mają to wydanie). Dlatego pole wstrzykujemy jako
// rekord z urządzenia, które je zapisuje: wprost do rekordu wersji w magazynie urządzenia (surowy adapter) albo do
// elementu wersji w ładunku (kopia JSON eksportu). Reguły:
//   - łączenie przy każdym zapisie rekordu wersji, który łączy dwie kopie: późniejsza chwila przypisania z obu (tutejszej
//     i z ładunku), niezależnie od tego, która kopia wygrała treścią albo przypisaniem karty; postać kanoniczna chwili
//     (toISOString), każda inna wartość liczy się jak brak i nie przechodzi dalej; faza przeniesień przenosi tylko
//     rekord, którego chwila przypisania nie zmieniła się od decyzji;
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
// PRZYPADKI (71; na bazie d6f133eb, przed kodem tej zmiany, czerwone 51 — powód w nawiasie; zielone z natury 20):
//   drogi zapisu: poprawka wizyty, gwiazdka, edycja i usunięcie wiersza pomiaru (czerwone — rekord budowany z listy pól
//        gubi pole); „Scal pacjentów” (zielony — rekord rozpięty, pole zostaje bez zmian, nowa głowa bez pola);
//   wersja tej samej karty: 5 wariantów (treść z ładunku, treść tutejsza, rekord złożony W3, ta sama wersja, zapis samego
//        rev) × 4 układy chwili przypisania (tylko tutaj, tylko w ładunku, w obu z późniejszą tutaj albo w ładunku),
//        wynik porównany z przebiegiem bez pola (czerwone 14 — zapis z listy pól ładunku albo brak zapisu przy późniejszym
//        polu w ładunku; zielone 6 — tutejszy rekord z późniejszym polem zostaje albo jest rozpięty); dwa różne rekordy
//        złożone z tą samą rev i chwilą zmiany × 3 układy (czerwone — rekord złożony budowany z listy pól);
//   wersja wspólna dwóm kartom: „przenieś” ×2, „zabierz” ×2, „zabierz” po zniknięciu wersji, „treść”, „treść” z rekordem
//        złożonym, „nowa” ×2, następca (czerwone — rekord z listy pól ładunku albo z chwili decyzji bez pola); „przenieś”,
//        gdy między decyzją a fazą przeniesień tutejsza wersja dostaje samą późniejszą chwilę przypisania (czerwony —
//        zapis samej chwili nie powstaje; faza, która nie sprawdza chwili z decyzji, przenosi wersję mimo późniejszej
//        tutejszej chwili);
//   zbieżność trzech urządzeń w sześciu kolejnościach wymian: wersja tej samej karty i wersja wspólna dwóm kartom
//        (czerwone — pole ginie w zapisie);
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
//   zgodność wstecz: 221 i 276 — pełny ładunek i koperta z polem (zielone), plik karty, kopia konta („Scal kopię konta”)
//        i odtworzenie konta z kopii z polem (czerwone — bieżący eksport pola nie niesie).
// Strażniki zielone z natury mają mutanta kodu, przy którym czerwienieją (poza kontrolami bez zapisu rekordu i zgodnością
// wstecz, która charakteryzuje niezmienne sejfy z fikstur).
// E3-PR0e3 (zmiana wizyty po Koszu wraca do karty wpisu po „Scal pacjentów”; 81 przypadków, +10; na d2f1eded czerwone
// 8): wersja wracająca do karty wpisu z chwilą przypisania z ładunku i bez niej (nowy zapis pola nie tworzy); starsza
// aplikacja (221, 276) tej zasady nie zna — 8 układów z literałem położenia wizyty (zielone z natury 2: starsza
// aplikacja zmienia wizytę i najpierw pobiera — gwiazdka ginie jak dotąd).
// E3-PR0e2b (drugie wydanie pola; decyzje właściciela 2a i 3a z 2026-11-23, potwierdzenie z 2026-11-24, że wszystkie
// urządzenia mają SW 1.1.586): „Scal pacjentów” zapisuje chwilę przypisania w każdej wersji przeniesionej do karty
// docelowej — późniejszą z dwóch: „teraz” (w gałęzi następcy fazy przeniesień — chwila wersji-siostry pod kartą
// następcy, bez niej chwila nagrobka karty z bieżącego skoku) i poprzednia chwila tej wersji + dokładnie 1 ms; gdy
// „poprzednia + 1 ms” nie ma postaci kanonicznej (rok 9999) — zostaje poprzednia. Nowa głowa scalenia i wersje karty
// docelowej — bez pola. Jedyne miejsca z kluczem pola: Bsw_przypisanie (bez zegara) i Bsw_przypisanieScalenia (jeden
// zegar), wołana tylko z Bsw_poScaleniu, a ta tylko z „Scal pacjentów” i z gałęzi następcy (strażnik drzewa składni).
// Literały przepisane: wersja przeniesiona z chwilą późniejszą niż „teraz” dostaje ją + 1 ms (scalenie, następca,
// IndexedDB, koperty), kształt elementu po scaleniu ma pole w wersjach przeniesionych, strażnik „nikt nie ustawia”
// zamieniony na strażnik „ustawia tylko „Scal pacjentów”” i przebieg dróg rozdzielony (bez scalenia — nigdzie; ze
// scaleniem — tylko wersje przeniesione, ta sama chwila na każdym urządzeniu bieżącym). Przy części Kosza
// (tests/support/czesci-wydania.mjs, KOSZ_PAMIETA_PRZYPISANIE; decyzja właściciela z 2026-11-24) wpis Kosza pamięta
// chwilę przypisania: „Przywróć” wersji tylko z Kosza, koperta wpisu Kosza i wersja wracająca do karty wpisu
// (E3-PR0e3) niosą ją — literał przy stałej. Notatka w starej karcie obok poprawki wizyty przeniesionej (decyzja
// właściciela z 2026-11-25, 1a) — blok na końcu pliku. Na bazie 30008d8f czerwone: przepisane literały i nowe
// przypadki zapisu (pole nie powstaje), strażnik (brak Bsw_przypisanieScalenia); zielone z natury — przebieg bez
// „Scal pacjentów”, kontrole notatki (sama notatka, notatka i nowa wizyta).
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
import { KOSZ_PAMIETA_PRZYPISANIE } from '../support/czesci-wydania.mjs';

const HASLO = 'Vilda#Przypisanie!2026abc';
const START = Date.parse('2026-03-02T08:00:00.000Z');
const MIN = 60_000;
const CZAS = 60_000;
const POLE = 'assignedAtISO';
const T1 = '2026-03-02T09:30:00.000Z';
const T2 = '2026-03-02T09:40:00.000Z';
// E3-PR0e2b: „Scal pacjentów” wersji z chwilą T1 (późniejszą niż „teraz” scalenia) — T1 + dokładnie 1 ms.
const T1P = '2026-03-02T09:30:00.001Z';
const isoTeraz = () => new Date(teraz).toISOString();
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

  // E3-PR0e2b: „Scal pacjentów” zapisuje chwilę przypisania każdej wersji przeniesionej — późniejszą z „teraz”
  // i poprzedniej + 1 ms (dawniej: wersja zachowywała swoją chwilę bez zmiany, wersja bez niej zostawała bez niej).
  it('„Scal pacjentów” zapisuje chwilę przypisania w każdej wersji przeniesionej (rev + 1): z chwilą późniejszą niż „teraz” — ta chwila + dokładnie 1 ms; bez chwili i z wcześniejszą — „teraz” scalenia; nowa głowa scalenia i wersja karty docelowej bez niej', async () => {
    const A = await urzadzenie('A');
    const { P: X, ids: [v, w, u] } = await karta(A, 1, [22, 23, 24]);
    const { P: Y, ids: [y] } = await karta(A, 2, [30]);
    await wstaw(A, v, T1);
    await wstaw(A, u, '2026-03-02T07:00:00.000Z');
    const revV = (await rek(A, v)).rev;
    krok();
    const tScal = isoTeraz();
    const glowa = (await A.vault.mergePatients(X, Y)).snapshotId;
    const r = await rek(A, v);
    expect([r.patientId === Y, r.rev], 'kontrola: v pod Y z rev + 1').toEqual([true, revV + 1]);
    expect({ v: await pole(A, v), w: await pole(A, w), u: await pole(A, u), y: await pole(A, y), glowa: await pole(A, glowa) })
      .toEqual({ v: T1P, w: tScal, u: tScal, y: null, glowa: null });
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

  // Dwa różne rekordy złożone W3 tej samej wersji z tą samą rev i chwilą zmiany: A i B poprawiły v (37 i 41 kg), D je
  // przypięło, A i B scaliły kopię D. Przy wymianie wygrywa składnikowo późniejsza treść z gwiazdką, rev = wyższa + 1.
  it.each([['tylko tutaj', T1, undefined, T1], ['tylko w ładunku', undefined, T1, T1], ['w obu, późniejsza w ładunku', T1, T2, T2]])('dwa różne rekordy złożone z tą samą rev i chwilą zmiany, chwila przypisania %s: wynik z późniejszą z obu', async (_n, tu, lad, wynik) => {
    const A = await urzadzenie('A');
    const { ids: [v] } = await karta(A, 1, [22]);
    const B = await blizniak(A, 'B');
    const D = await blizniak(A, 'D');
    await popraw(A, v, 37);
    await popraw(B, v, 41);
    await gwiazdka(D, v, true);
    krok();
    await scal(D, A); await scal(D, B);
    const ra = await rek(A, v), rb = await rek(B, v);
    const sa = await stan(A, v), sb = await stan(B, v);
    expect([ra.rev === rb.rev, ra.updatedAtISO === rb.updatedAtISO, sa.masa, sb.masa, sa.gwiazdka, sb.gwiazdka], 'kontrola: dwa różne rekordy złożone, ta sama rev i chwila zmiany').toEqual([true, true, 37, 41, true, true]);
    await wstaw(A, v, tu);
    krok();
    await scal(B, A, lad ? (l) => zPolem(l, v, lad) : undefined);
    const s = await stan(A, v);
    expect([s.masa, s.gwiazdka, s.rev], 'kontrola: wygrywa późniejsza treść z gwiazdką, rev + 1').toEqual([41, true, ra.rev + 1]);
    expect(await pole(A, v)).toBe(wynik);
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
// w kroku karty Q (po decyzjach dla wersji karty Y, przed fazą przeniesień); zmien — zmiana ładunku przed scaleniem.
async function zOknem(c, akcja, zmien = (l) => l) {
  const { P: Q } = await karta(c.B, 4, [50]);
  const lad = zmien(uloz(c.Y, Q)(await eksport(c.B)));
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

  it('„treść” z rekordem złożonym (A scaliło X → Y i przypięło v, B poprawiło v w starej X bez wiedzy o scaleniu): treść z B, gwiazdka z A, a tutejsza chwila przypisania zostaje', async () => {
    const c = await dwieKarty();
    await popraw(c.B, c.v, 26);
    krok(); await c.A.vault.mergePatients(c.X, c.Y);
    await gwiazdka(c.A, c.v, true);
    await wstaw(c.A, c.v, T1);
    krok();
    await scal(c.B, c.A);
    const s = await stan(c.A, c.v, c.et);
    expect([s.karta, s.masa, s.gwiazdka], 'kontrola: rekord złożony pod Y — treść z B, gwiazdka z A').toEqual(['Y', 26, true]);
    expect(await pole(c.A, c.v)).toBe(T1);
  }, CZAS);

  // „Przenieś” zapada przy chwili przypisania z ładunku późniejszej niż tutejsza; w oknie przed fazą przeniesień druga
  // karta przeglądarki scala kopię z jeszcze późniejszą chwilą tej wersji w tutejszej karcie (zapis samej chwili, rev
  // i chwila zmiany bez zmian). Faza przenosi tylko rekord niezmieniony od decyzji — także co do chwili przypisania.
  it('„przenieś”, a między decyzją a fazą przeniesień tutejsza wersja dostaje samą późniejszą chwilę przypisania (scalenie w drugiej karcie przeglądarki): faza jej nie przenosi — zostaje pod tutejszą kartą z późniejszą chwilą, a następna wymiana rozstrzyga zwykłą regułą', async () => {
    const T3 = '2026-03-02T09:50:00.000Z';
    const c = await dwieKarty();
    krok(); await c.B.vault.mergePatients(c.X, c.Y);
    krok(); await c.A.vault.savePatient(naglowek(1, { masa: 24 }), { dedup: false, patientId: c.X });
    await wstaw(c.A, c.v, T1);
    const ladC = zPolem(await eksport(await blizniak(c.A, 'C')), c.v, T3);
    const przed = await rek(c.A, c.v);
    krok();
    let wOknie = null;
    await zOknem(c, async (q) => {
      await q.A.vault.mergeSyncPayload(ladC);
      const r = await rek(q.A, q.v);
      wOknie = { karta: q.et[r.patientId] || '?', pole: r[POLE] || null, rev: r.rev, zmiana: r.updatedAtISO || null };
    }, (l) => zPolem(l, c.v, T2));
    expect(wOknie, 'kontrola: w oknie v pod X z późniejszą chwilą przypisania, rev i chwila zmiany bez zmian').toEqual({ karta: 'X', pole: T3, rev: przed.rev, zmiana: przed.updatedAtISO || null });
    expect([(await stan(c.A, c.v, c.et)).karta, await pole(c.A, c.v)], 'v zostaje pod X z późniejszą chwilą przypisania').toEqual(['X', T3]);
    krok(); await scal(c.A, c.B);
    expect([(await stan(c.B, c.v, c.et)).karta, await pole(c.B, c.v)], 'następna wymiana: B przenosi v pod X z późniejszą chwilą').toEqual(['X', T3]);
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

  // E3-PR0e2b: gałąź następcy odtwarza „Scal pacjentów” Y → W — tutejsza chwila T1 jest późniejsza niż chwila tamtego
  // scalenia, więc wersja dostaje T1 + 1 ms (dawniej: T1 bez zmiany).
  it('następca — „Scal pacjentów” Y → W w drugiej karcie przeglądarki między decyzją „zabierz” a fazą: wersja pod W (rev + 1) z tutejszą chwilą przypisania + 1 ms (późniejszą niż chwila scalenia Y → W)', async () => {
    const c = await dwieKarty({ czwarta: true });
    krok(); await c.B.vault.mergePatients(c.X, c.Y);
    await wstaw(c.A, c.v, T1);
    krok();
    await zOknem(c, (q) => q.A.vault.mergePatients(q.Y, q.W));
    expect((await stan(c.A, c.v, c.et)).karta, 'kontrola: v pod W').toBe('W');
    expect(await pole(c.A, c.v)).toBe(T1P);
  }, CZAS);
});

// ── Zbieżność: trzy urządzenia, różna kolejność wymian pełnych kopii ───────────────────────────────────────────────
// Sześć par (skąd → dokąd) między A, B i C; pierwsze sześć wymian w sześciu różnych kolejnościach, potem jeszcze dwa
// razy wszystkie pary w kolejności stałej. Wynik na każdym urządzeniu i w każdej kolejności ten sam: późniejsza chwila
// przypisania z obu kopii przy każdym zapisie jest przemienna i łączna.
const PARY = [['A', 'B'], ['B', 'A'], ['A', 'C'], ['C', 'A'], ['B', 'C'], ['C', 'B']];
const KOLEJNOSCI = [[0, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 0], [2, 0, 4, 1, 5, 3], [3, 5, 1, 4, 0, 2], [4, 2, 0, 5, 3, 1], [1, 3, 5, 0, 2, 4]];
async function trzyUrzadzenia(przygotuj) {
  const wyniki = new Set();
  for (const kolejnosc of KOLEJNOSCI) {
    await sprzatnijUrzadzenia();
    ustaw(START);
    atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: false, zegar: zegarSterowany() });
    const D = { A: await urzadzenie('A') };
    const { v, et } = await przygotuj(D);
    for (const i of kolejnosc) { krok(); await scal(D[PARY[i][0]], D[PARY[i][1]]); }
    for (let r = 0; r < 2; r += 1) for (const [z, na] of PARY) { krok(); await scal(D[z], D[na]); }
    const s = {};
    for (const n of ['A', 'B', 'C']) s[n] = { ...(await stan(D[n], v, et)), pole: await pole(D[n], v) };
    wyniki.add(JSON.stringify(s));
  }
  expect(wyniki.size, 'ten sam wynik w każdej kolejności').toBe(1);
  const s = JSON.parse([...wyniki][0]);
  expect(s.B, 'B jak A').toEqual(s.A);
  expect(s.C, 'C jak A').toEqual(s.A);
  return s.A;
}

describe('zbieżność — trzy urządzenia, każda kolejność wymian pełnych kopii daje ten sam wynik', () => {
  it('wersja tej samej karty: A z wcześniejszą chwilą przypisania, B z późniejszą, C bez niej; B i C poprawiają wersję — wszędzie późniejsza chwila i ostatnia poprawka', async () => {
    const s = await trzyUrzadzenia(async (D) => {
      const { P, ids: [v] } = await karta(D.A, 1, [22]);
      D.B = await blizniak(D.A, 'B'); D.C = await blizniak(D.A, 'C');
      await popraw(D.B, v, 23); await popraw(D.C, v, 24);
      await wstaw(D.A, v, T1); await wstaw(D.B, v, T2);
      return { v, et: { [P]: 'P' } };
    });
    expect([s.karta, s.masa, s.pole]).toEqual(['P', 24, T2]);
  }, 4 * CZAS);

  it('wersja wspólna dwóm kartom: A scaliło X → Y (wersja z chwilą przypisania pod Y), B poprawiło ją w starej X bez wiedzy o scaleniu, C bez zmian — wszędzie pod Y z poprawką i chwilą przypisania', async () => {
    const s = await trzyUrzadzenia(async (D) => {
      const { P: X, ids: [v] } = await karta(D.A, 1, [22, 23]);
      const { P: Y } = await karta(D.A, 2, [30]);
      D.B = await blizniak(D.A, 'B'); D.C = await blizniak(D.A, 'C');
      krok(); await D.A.vault.mergePatients(X, Y);
      await wstaw(D.A, v, T1);
      await popraw(D.B, v, 26);
      return { v, et: { [X]: 'X', [Y]: 'Y' } };
    });
    expect([s.karta, s.masa, s.pole]).toEqual(['Y', 26, T1]);
  }, 4 * CZAS);
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

  // Część Kosza (KOSZ_PAMIETA_PRZYPISANIE, decyzja właściciela z 2026-11-24): wpis Kosza pamięta chwilę przypisania
  // wersji do karty wpisu, więc wersja tylko w Koszu wraca z nią; bez tej części — bez niej (jak w E3-PR0e2a).
  it(`„Przywróć” z Kosza: wersja leżąca też w karcie (stan po przerwanym scaleniu) zachowuje swoją chwilę przypisania; wersja tylko w Koszu wraca ${KOSZ_PAMIETA_PRZYPISANIE ? 'z nią — wpis Kosza ją pamięta' : 'bez niej — wpis Kosza jej nie przechowuje'}`, async () => {
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
    expect({ v: await pole(A, v), w: await pole(A, w), u: await pole(A, u) }).toEqual({ v: T1, w: KOSZ_PAMIETA_PRZYPISANIE ? T1 : null, u: null });
  }, CZAS);

  it('magazyn IndexedDB w trybie „Komputer prywatny”: „Scal pacjentów” zapisuje w rekordzie chwilę przypisania (zapisana T1, późniejsza niż „teraz” — T1 + 1 ms), gwiazdka ją zachowuje', async () => {
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
    expect({ poScaleniu, poGwiazdce: await poleIdb() }).toEqual({ poScaleniu: T1P, poGwiazdce: T1P });
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

  // E3-PR0e2b: po „Scal pacjentów” wersje przeniesione mają chwilę przypisania (za payload); dawniej przypadek sprawdzał
  // kształt bez pola także po scaleniu.
  it('bez chwili przypisania element wersji każdego eksportu i każdej koperty wersji ma kształt jak dotąd (te same klucze w tej samej kolejności); po „Scal pacjentów” wersje przeniesione mają ją za payload, nowa głowa i wersja karty docelowej — kształt jak dotąd', async () => {
    const A = await urzadzenie('A');
    const { P: X, ids } = await karta(A, 1, [22, 23]);
    const { P: Y, ids: idsY } = await karta(A, 2, [30]);
    const ev = A.vault._eventLog;
    const zbior = (sids) => {
      const k = new Set();
      return { k, dodaj: (o) => { for (const sid of sids) for (const e of wszystkieElementy(o, sid)) k.add(JSON.stringify(Object.keys(e))); } };
    };
    const przed = zbior([...ids, ...idsY]);
    for (const tresc of Object.values(await eksporty(A, X))) przed.dodaj(tresc);
    for (const sid of ids) przed.dodaj(await ev.buildSnapshotEvent(X, sid, null));
    przed.dodaj(await ev.buildPatientFullEvents(X, null));
    krok();
    const glowa = (await A.vault.mergePatients(X, Y)).snapshotId;
    const przeniesione = zbior(ids), pozostale = zbior([...idsY, glowa]);
    for (const z of [przeniesione, pozostale]) {
      z.dodaj(await ev.buildPatientTombstoneEvent(X, null));
      z.dodaj(await ev.buildPatientFullEvents(Y, null));
      for (const sid of [...ids, ...idsY, glowa]) z.dodaj(await ev.buildSnapshotEvent(Y, sid, null));
      for (const tresc of Object.values(await eksporty(A, Y))) z.dodaj(tresc);
    }
    expect({ przed: [...przed.k], przeniesione: [...przeniesione.k], pozostale: [...pozostale.k] })
      .toEqual({ przed: [JSON.stringify(KLUCZE)], przeniesione: [JSON.stringify([...KLUCZE, POLE])], pozostale: [JSON.stringify(KLUCZE)] });
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
    // E3-PR0e2b: nagrobek po „Scal pacjentów” niesie chwilę przypisania zapisaną przez scalenie (T1 + 1 ms)
    expect([Object.keys(snap), snap[POLE], Object.keys(ptomb), ptomb[POLE]]).toEqual([[...KLUCZE, POLE], T1, [...KLUCZE, POLE], T1P]);
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
    expect(z.pole, 'kontrola: przeniesiona wersja z chwilą przypisania (T1 + 1 ms)').toBe(T1P);
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

  // Część Kosza (KOSZ_PAMIETA_PRZYPISANIE): wpis Kosza pamięta chwilę przypisania, koperta wpisu i element Kosza
  // w eksporcie niosą ją; bez tej części — nie (jak w E3-PR0e2a).
  it(`koperta wpisu Kosza ${KOSZ_PAMIETA_PRZYPISANIE ? 'niesie chwilę przypisania (wpis Kosza ją pamięta)' : 'nie niesie chwili przypisania (wpis Kosza jej nie przechowuje)'}, także element Kosza w eksporcie; koperta się szyfruje`, async () => {
    const A = await urzadzenie('A');
    const { P, ids: [v] } = await karta(A, 1, [22, 23]);
    await wstaw(A, v, T1);
    krok(); await A.vault.moveSnapshotToTrash(P, v);
    const ev = A.vault._eventLog;
    const k = await ev.buildSnapshotTombstoneEvent(v, null);
    expect(k && (k.snapshotTombstones || []).some((e) => e.snapshotId === v), 'kontrola: koperta wpisu Kosza v').toBe(true);
    await ev.encryptEvent(k);
    expect({ koperta: JSON.stringify(k).includes(POLE), eksport: JSON.stringify((await eksport(A)).snapshotTombstones || []).includes(POLE) })
      .toEqual({ koperta: KOSZ_PAMIETA_PRZYPISANIE, eksport: KOSZ_PAMIETA_PRZYPISANIE });
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

// ── Chwilę przypisania ustawia tylko „Scal pacjentów” (E3-PR0e2b; w E3-PR0e2a — nikt) ─────────────────────────────
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
// E3-PR0e2b: klucz pola tylko w Bsw_przypisanie (późniejsza z istniejących, bez zegara) i Bsw_przypisanieScalenia
// (chwila „Scal pacjentów”, jeden zegar); napis pola tylko w liście pól koperty wersji i stałej odsyłania, przy części
// Kosza także w liście pól koperty wpisu Kosza i w kanonie odsyłania Kosza.
const DOZWOLONE = {
  klucz: ['Bsw_przypisanie', 'Bsw_przypisanieScalenia'], odczyt: ['Bsw_chwilaPrzypisania'],
  napis: ['Bev_POLA_WERSJI', 'Bev_ECHO_POMIJANE', ...(KOSZ_PAMIETA_PRZYPISANIE ? ['Bev_POLA_KOSZA', 'Bev_KANON_KOSZA'] : [])],
};
const niedozwolone = (lista) => lista.filter((w) => !(DOZWOLONE[w.rodzaj] || []).includes(w.rodzaj === 'napis' ? w.stala : w.fn))
  .map((w) => `${w.rodzaj} w ${w.fn || w.stala || '(poza funkcją)'}`);
// Odwołania do funkcji (wywołanie albo inne użycie nazwy) z funkcją pliku, w której leżą: { 'funkcja': liczba }.
function odwolania(ast, nazwa) {
  const out = {};
  const idz = (n, rodzic, fn) => {
    if (!n || typeof n.type !== 'string') return;
    let f = fn;
    if (n.type === 'FunctionDeclaration' && n.id && !fn) f = n.id.name;
    if (n.type === 'Identifier' && n.name === nazwa && !(rodzic && rodzic.type === 'FunctionDeclaration' && rodzic.id === n)
      && !(rodzic && ((rodzic.type === 'Property' && rodzic.key === n && !rodzic.computed) || (rodzic.type === 'MemberExpression' && rodzic.property === n && !rodzic.computed)))) {
      const k = `${rodzic && rodzic.type === 'CallExpression' && rodzic.callee === n ? '' : 'użycie '}${f || '(poza funkcją)'}`;
      out[k] = (out[k] || 0) + 1;
    }
    for (const k of Object.keys(n)) {
      const x = n[k];
      if (Array.isArray(x)) x.forEach((y) => idz(y, n, f));
      else if (x && typeof x.type === 'string') idz(x, n, f);
    }
  };
  idz(ast, null, null);
  return out;
}

describe('chwilę przypisania ustawia tylko „Scal pacjentów” (E3-PR0e2b)', () => {
  it('w kodzie sejfu klucz pola tylko w Bsw_przypisanie i Bsw_przypisanieScalenia, odczyt tylko w Bsw_chwilaPrzypisania, napis tylko w listach pól kopert i stałych odsyłania; Bsw_przypisanie bez zegara, Bsw_przypisanieScalenia z jednym zegarem (new Date()) i bez innych wywołań niż odczyt pola i postać kanoniczna; Bsw_przypisanieScalenia woła tylko Bsw_poScaleniu, a tę tylko „Scal pacjentów” (Bsc_podBlokada) i gałąź następcy fazy przeniesień (Bsw_doF)', () => {
    // samokontrola wykrywaczy na kodzie z naruszeniami
    const proba = parse(`function Bsw_przypisanie(a) { return { ${POLE}: Date.now() }; }
      function inna(x) { return { ${POLE}: x }; } function Bsc_podBlokada(w) { return Bsw_poScaleniu(w); }
      function obca(w) { const f = Bsw_poScaleniu; return f(w) || Bsw_poScaleniu(w); } const LISTA = ['${POLE}'];`, { ecmaVersion: 'latest' });
    expect(niedozwolone(wystapienia(proba, POLE)), 'samokontrola: klucz w innej funkcji, napis poza listami').toEqual(['klucz w inna', 'napis w LISTA']);
    expect(zegar(proba.body[0]), 'samokontrola: zegar w Bsw_przypisanie').toEqual(['Date.now']);
    expect(odwolania(proba, 'Bsw_poScaleniu'), 'samokontrola: wywołanie i użycie spoza dwóch miejsc').toEqual({ Bsc_podBlokada: 1, 'użycie obca': 1, obca: 1 });
    const { ast, dekl } = sejfAst();
    for (const n of ['Bsw_przypisanie', 'Bsw_chwilaPrzypisania', 'Bsw_poScaleniu', 'Bsw_przypisanieScalenia']) expect(dekl.has(n), `${n} w sejfie`).toBe(true);
    expect(niedozwolone(wystapienia(ast, POLE)), 'wystąpienia nazwy pola poza dozwolonymi miejscami').toEqual([]);
    expect([...domkniecie(['Bsw_przypisanie'])].sort(), 'domknięcie Bsw_przypisanie').toEqual(['Bnp_iso', 'Bsw_chwilaPrzypisania', 'Bsw_przypisanie']);
    expect([...domkniecie(['Bsw_przypisanie'])].flatMap((n) => zegar(dekl.get(n))), 'Bsw_przypisanie bez zegara').toEqual([]);
    expect([...domkniecie(['Bsw_przypisanieScalenia'])].sort(), 'domknięcie Bsw_przypisanieScalenia (bez losowego dodatku Bpp_chwilaZmiany)').toEqual(['Bnp_iso', 'Bsw_chwilaPrzypisania', 'Bsw_przypisanieScalenia']);
    expect(zegar(dekl.get('Bsw_przypisanieScalenia')), 'jeden zegar w Bsw_przypisanieScalenia').toEqual(['new Date()']);
    expect(odwolania(ast, 'Bsw_przypisanieScalenia'), 'Bsw_przypisanieScalenia wołana tylko z Bsw_poScaleniu').toEqual({ Bsw_poScaleniu: 1 });
    expect(odwolania(ast, 'Bsw_poScaleniu'), 'Bsw_poScaleniu wołana tylko z „Scal pacjentów” i z gałęzi następcy').toEqual({ Bsc_podBlokada: 1, Bsw_doF: 1 });
  });

  it('bez „Scal pacjentów” i bez chwili przypisania na wejściu żadna droga jej nie tworzy: zapisy, poprawka, gwiazdka, Kosz i „Przywróć”, „Usuń pacjenta”, przycięcie, wymiany pełnych kopii z bliźniakiem i ze starszą aplikacją (221, 276), koperty, import karty, „Scal kopię konta” i odtworzenie konta — ani w rekordach, ani w eksportach, kopertach i plikach', async () => {
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
    krok(); await A.vault.removePatient(Z);
    krok(); await A.vault.pruneSnapshotsForPatient(X, { recentHours: 0 });
    await popraw(B, x1, 25);
    await karta(B, 4, [50]);
    await popraw(O276, x2, 26);
    const wymiany = [[B, A], [A, B], [O221, A], [A, O221], [O276, A], [A, O276], [B, O276], [O276, B]];
    for (let i = 0; i < 2; i += 1) for (const [z, na] of wymiany) { krok(); await scal(z, na); }
    const teksty = [];
    const ev = A.vault._eventLog;
    const koperty = [];
    for (const k of await A.adapter.listPatientsForUser(uid(A))) {
      for (const s of await A.adapter.listSnapshotsForUser(uid(A), k.patientId)) koperty.push(await ev.buildSnapshotEvent(k.patientId, s.snapshotId, null));
      koperty.push(...await ev.buildPatientFullEvents(k.patientId, null));
    }
    koperty.push(await ev.buildPatientTombstoneEvent(Z, null));
    for (const e of (await eksport(A)).snapshotTombstones || []) koperty.push(await ev.buildSnapshotTombstoneEvent(e.snapshotId, null));
    for (const k of koperty.filter(Boolean)) {
      teksty.push(['koperta', JSON.stringify(k)]);
      const { env } = await ev.encryptEvent(k);
      for (const O of [B, O276]) expect((await O.vault._eventLog.applyEncryptedEvent(env)).status, `kontrola: koperta ${k.event.kind} na ${O.nazwa}`).toBe('applied');
    }
    const plik = await A.vault.exportPatientEnvelope(Y);
    const kopia = await A.vault.exportVaultBackup();
    teksty.push(['plik karty', JSON.stringify(await A.vault.decryptPayloadForCurrentUser(plik.payload.iv, plik.payload.data))]);
    teksty.push(['kopia konta', JSON.stringify(await A.vault.decryptPayloadForCurrentUser(kopia.payload.iv, kopia.payload.data))]);
    krok(); await D.vault.importPatientFromEnvelope(plik, HASLO);
    krok(); await E.vault.mergeVaultBackup(kopia, HASLO);
    const R = await urzadzenie('R', { haslo: 'Vilda#Odtworzenie!2026abc' });
    krok(); await R.vault.restoreVaultBackup(kopia, HASLO, { label: 'Fikcyjne odtworzenie konta' });
    for (const d of [A, B, O221, O276, D, E, R]) {
      const rekordy = [];
      for (const k of await d.adapter.listPatientsForUser(uid(d))) rekordy.push(...await d.adapter.listSnapshotsForUser(uid(d), k.patientId));
      expect(rekordy.length, `kontrola: wersje na ${d.nazwa}`).toBeGreaterThan(0);
      teksty.push([`rekordy ${d.nazwa}`, JSON.stringify(rekordy)], [`eksport ${d.nazwa}`, JSON.stringify(await eksport(d))]);
    }
    expect(teksty.filter(([, t]) => t.includes(POLE)).map(([n]) => n)).toEqual([]);
  }, 2 * CZAS);

  // Ta sama wymiana z „Scal pacjentów” X → Y na A: chwila przypisania powstaje raz, w trzech wersjach przeniesionych
  // (ta sama chwila scalenia), a dalej przechodzi tylko jako kopia — na bliźniaku, w kopertach, w pliku karty, w kopii
  // konta i w odtworzonym koncie ta sama wartość; nowa głowa scalenia, wersja karty docelowej i wersje innych kart bez
  // niej; starsza aplikacja jej nie zapisuje.
  it('„Scal pacjentów” tworzy chwilę przypisania tylko w wersjach przeniesionych — tę samą chwilę scalenia; nowa głowa, wersja karty docelowej i wersje innych kart bez niej; wymiany, koperty, import karty, „Scal kopię konta” i odtworzenie konta przenoszą tę samą wartość, starsza aplikacja (221, 276) jej nie zapisuje', async () => {
    const A = await urzadzenie('A');
    // D i E — bliźniaki sprzed kart (import i „Scal kopię konta” zapisują wersje, których tu nie ma)
    const D = await blizniak(A, 'D');
    const E = await blizniak(A, 'E');
    const { P: X, ids: [x1, x2, x3] } = await karta(A, 1, [20, 22, 24]);
    const { P: Y, ids: [y1] } = await karta(A, 2, [30]);
    const B = await blizniak(A, 'B');
    const O221 = await blizniak(A, 'S221', { zrodla: zrodlaStarszej('S221') });
    const O276 = await blizniak(A, 'S276', { zrodla: zrodlaStarszej('S276') });
    await popraw(A, x1, 21);
    await gwiazdka(A, x2);
    krok(); await A.vault.moveSnapshotToTrash(X, x3);
    krok(); await A.vault.restoreTrashedSnapshot(X, x3);
    krok();
    const tScal = isoTeraz();
    const glowa = (await A.vault.mergePatients(X, Y)).snapshotId;
    const et = { [x1]: 'x1', [x2]: 'x2', [x3]: 'x3', [y1]: 'y1', [glowa]: 'głowa' };
    await popraw(B, x1, 25);
    et[(await karta(B, 4, [50])).ids[0]] = 'b4';
    await popraw(O276, x2, 26);
    const wymiany = [[B, A], [A, B], [O221, A], [A, O221], [O276, A], [A, O276], [B, O276], [O276, B]];
    for (let i = 0; i < 2; i += 1) for (const [z, na] of wymiany) { krok(); await scal(z, na); }
    const ev = A.vault._eventLog;
    const zKopert = {};
    for (const k of await A.adapter.listPatientsForUser(uid(A))) {
      for (const s of await A.adapter.listSnapshotsForUser(uid(A), k.patientId)) {
        const kop = await ev.buildSnapshotEvent(k.patientId, s.snapshotId, null);
        for (const e of wszystkieElementy(kop, s.snapshotId)) if (POLE in e) zKopert[et[s.snapshotId] || '?'] = e[POLE];
      }
    }
    const plik = await A.vault.exportPatientEnvelope(Y);
    const kopia = await A.vault.exportVaultBackup();
    krok(); await D.vault.importPatientFromEnvelope(plik, HASLO);
    krok(); await E.vault.mergeVaultBackup(kopia, HASLO);
    const R = await urzadzenie('R', { haslo: 'Vilda#Odtworzenie!2026abc' });
    krok(); await R.vault.restoreVaultBackup(kopia, HASLO, { label: 'Fikcyjne odtworzenie konta' });
    const wynik = { koperty: zKopert };
    for (const d of [A, B, O221, O276, D, E, R]) {
      const p = {};
      for (const k of await d.adapter.listPatientsForUser(uid(d))) {
        for (const r of await d.adapter.listSnapshotsForUser(uid(d), k.patientId)) if (POLE in r) p[et[r.snapshotId] || '?'] = r[POLE];
      }
      wynik[d.nazwa] = p;
    }
    const trzy = { x1: tScal, x2: tScal, x3: tScal };
    expect(wynik).toEqual({ koperty: trzy, A: trzy, B: trzy, S221: {}, S276: {}, D: trzy, E: trzy, R: trzy });
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

  it('kopia konta z chwilą przypisania: odtworzenie konta (restoreVaultBackup) w sejfie 221 i 276 bez błędu, wersja bez niej', async () => {
    const f = await flota();
    await wstaw(f.A, f.v, T1);
    const kopia = await f.A.vault.exportVaultBackup();
    const tresc = await f.A.vault.decryptPayloadForCurrentUser(kopia.payload.iv, kopia.payload.data);
    expect(wszystkieElementy(tresc, f.v).map((e) => e[POLE]), 'kopia niesie chwilę przypisania').toEqual([T1]);
    const wynik = {};
    for (const app of ['S221', 'S276']) {
      const R = await urzadzenie(`R ${app}`, { haslo: 'Vilda#Odtworzenie!2026abc', zrodla: zrodlaStarszej(app) });
      krok();
      wynik[app] = [await bladLubOk(() => R.vault.restoreVaultBackup(kopia, HASLO, { label: 'Fikcyjne odtworzenie konta' })), await pole(R, f.v)];
    }
    expect(wynik).toEqual({ S221: ['ok', null], S276: ['ok', null] });
  }, CZAS);
});

// ── E3-PR0e3: wersja wracająca do karty wpisu Kosza po „Scal pacjentów” — chwila przypisania z ładunku ───────────────
// A: karta P „Testowy Jan” [v 20 kg, w 21 kg] i karta Q [q 30 kg]; bliźniak B (bez wiedzy o scaleniu). A scala P → Q
// i daje v do Kosza pod Q; B stawia v gwiazdkę w starej P. Pełna kopia B z kartą P z zapisem sprzed scalenia: P
// przegrywa z nagrobkiem scalenia, wpis Kosza v pod żywą Q przegrywa z gwiazdką B — v wraca do Q. Zapis z jednej kopii
// (Bsl_wersjaZLadunku): chwila przypisania z ładunku, gdy jest; bez niej na wejściu — rekord bez niej (nowy zapis jej
// nie tworzy).
describe('wersja wracająca do karty wpisu Kosza po „Scal pacjentów” (E3-PR0e3) — chwila przypisania z ładunku', () => {
  async function przebieg(wartosc) {
    const A = await urzadzenie('A');
    const { P, ids: [v] } = await karta(A, 1, [20, 21]);
    const { P: Q } = await karta(A, 2, [30]);
    const zapisP = (await eksport(A)).patients.find((p) => p.patientId === P).lastSavedAtISO;
    const B = await blizniak(A, 'B');
    krok(); await A.vault.mergePatients(P, Q);
    krok(); await A.vault.moveSnapshotToTrash(Q, v);
    await gwiazdka(B, v);
    krok();
    await scal(B, A, (l) => {
      for (const p of l.patients || []) if (p.patientId === P) p.lastSavedAtISO = zapisP;
      return wartosc === undefined ? l : zPolem(l, v, wartosc);
    });
    const r = await rek(A, v);
    const s = await wersja(A, v);
    return { karta: r ? (r.patientId === Q ? 'Q' : r.patientId === P ? 'P' : '?') : null, gwiazdka: !!(s && s.payload._pinned), pole: await pole(A, v) };
  }
  it('ładunek z chwilą przypisania: v wraca do Q z gwiazdką i z chwilą przypisania z ładunku', async () => {
    expect(await przebieg(T1)).toEqual({ karta: 'Q', gwiazdka: true, pole: T1 });
  }, CZAS);
  // E3-PR0e2b: A scala P → Q, więc v w Koszu pod Q ma chwilę scalenia; przy części Kosza wpis ją pamięta i rekord
  // pod Q dostaje późniejszą z kopii z ładunku i z wpisu (Bsw_doKartyWpisu), bez niej — kopię z ładunku (bez pola).
  it(`ładunek bez chwili przypisania: v wraca do Q z gwiazdką, rekord ${KOSZ_PAMIETA_PRZYPISANIE ? 'z chwilą przypisania z wpisu Kosza (chwila scalenia P → Q)' : 'bez pola (zapis z jednej kopii go nie tworzy)'}`, async () => {
    expect(await przebieg(undefined)).toEqual({ karta: 'Q', gwiazdka: true, pole: KOSZ_PAMIETA_PRZYPISANIE ? '2026-03-02T08:04:00.000Z' : null });
  }, CZAS);
});

// ── E3-PR0e3: starsza aplikacja (sejfy 221 i 276) zasady „zmiana wizyty po Koszu wraca do karty wpisu” nie zna ─────────
// Skutek dla floty mieszanej (znane ograniczenie starszej wersji; decyzja właściciela 2 z 2026-11-16). Trzy urządzenia
// z pełnych kopii, bliźniaki A: karta P „Testowy Jan” [v 20 kg, w 21 kg] i karta Q [q 30 kg]. S scala P → Q i daje v
// do Kosza pod Q; Z (bez wiedzy o scaleniu) daje v gwiazdkę w starej P; B (bieżąca, bez wiedzy) zapisuje w P nową
// wizytę; B → S (P wraca na S), S drugi raz „Scal pacjentów” P → Q. Potem Z i S wymieniają pełne kopie — Z najpierw
// wysyła albo najpierw pobiera — i dwie kolejne pełne wymiany S, Z, B. Starsza aplikacja jako Z (zmienia wizytę, S i B
// bieżące) albo jako S (scala i daje do Kosza, Z i B bieżące). Literał położenia v na każdym urządzeniu na końcu.
// Wynik: gwiazdka ginie na wszystkich urządzeniach tylko wtedy, gdy zmieniła ją starsza aplikacja, która najpierw
// pobiera (dostaje nagrobek P z wpisem Kosza i kasuje P razem ze swoją zmianą — strony tutejszej nie zna; tak jak przed
// E3-PR0e3 na każdym urządzeniu). W pozostałych układach bieżące urządzenie oddaje v do Q, a starsza aplikacja przyjmuje
// v pod Q z pełnej kopii (późniejsza niż jej wpis Kosza).
describe('zmiana wizyty po Koszu wraca do karty wpisu po „Scal pacjentów” (E3-PR0e3) — starsza aplikacja (221, 276) tej zasady nie zna: skutek dla floty', () => {
  const polozenie = async (d, P, Q, v) => {
    const lad = await eksport(d);
    const k = (lad.patients || []).find((p) => (p.snapshots || []).some((s) => s.snapshotId === v));
    if (k) { const s = k.snapshots.find((x) => x.snapshotId === v); return `karta ${k.patientId === Q ? 'Q' : k.patientId === P ? 'P' : '?'}${s.payload && s.payload._pinned ? ' z gwiazdką' : ''}`; }
    const e = (lad.snapshotTombstones || []).find((x) => x.snapshotId === v);
    return e ? `Kosz pod ${e.patientId === Q ? 'Q' : e.patientId === P ? 'P' : '?'}` : 'brak';
  };
  async function flota(stary, kto, kolejnosc) {
    const A = await urzadzenie('A');
    const { P, ids: [v] } = await karta(A, 1, [20, 21]);
    const { P: Q } = await karta(A, 2, [30]);
    const B = await blizniak(A, 'B');
    const O = await blizniak(A, stary, { zrodla: zrodlaStarszej(stary) });
    const C = kto === 'scala' ? await blizniak(A, 'C') : null;
    const S = kto === 'scala' ? O : A;
    const Z = kto === 'scala' ? C : O;
    krok(); await S.vault.mergePatients(P, Q);
    krok(); await S.vault.moveSnapshotToTrash(Q, v);
    krok(); await Z.vault.setSnapshotPinned(P, v, true);
    krok(); await B.vault.savePatient(naglowek(1, { masa: 22 }), { dedup: false, patientId: P });
    krok(); await scal(B, S);
    krok(); await S.vault.mergePatients(P, Q);
    if (kolejnosc === 'najpierw pobiera') { krok(); await scal(S, Z); krok(); await scal(Z, S); }
    else { krok(); await scal(Z, S); krok(); await scal(S, Z); }
    const urz = [S, Z, B];
    for (let r = 0; r < 2; r += 1) for (const x of urz) for (const y of urz) if (x !== y) { krok(); await scal(x, y); }
    return { S: await polozenie(S, P, Q, v), Z: await polozenie(Z, P, Q, v), B: await polozenie(B, P, Q, v) };
  }
  for (const stary of ['S221', 'S276']) for (const kto of ['zmienia', 'scala']) for (const kolejnosc of ['najpierw wysyła', 'najpierw pobiera']) {
    it(`${stary === 'S221' ? 'sejf 221' : 'sejf 276'} ${kto === 'zmienia' ? 'zmienia wizytę (Z)' : 'scala i daje do Kosza (S)'}, Z ${kolejnosc}: literał położenia v na S, Z i B`, async () => {
      const w = await flota(stary, kto, kolejnosc);
      console.log('E3-PR0e3 flota', stary, kto, kolejnosc, JSON.stringify(w));
      expect(w).toEqual(FLOTA_OCZEKIWANE[`${stary} ${kto} ${kolejnosc}`]);
    }, CZAS);
  }
});
const FLOTA_Q = { S: 'karta Q z gwiazdką', Z: 'karta Q z gwiazdką', B: 'karta Q z gwiazdką' };
const FLOTA_KOSZ = { S: 'Kosz pod Q', Z: 'Kosz pod Q', B: 'Kosz pod Q' };
const FLOTA_OCZEKIWANE = {
  'S221 zmienia najpierw wysyła': FLOTA_Q, 'S221 zmienia najpierw pobiera': FLOTA_KOSZ,
  'S221 scala najpierw wysyła': FLOTA_Q, 'S221 scala najpierw pobiera': FLOTA_Q,
  'S276 zmienia najpierw wysyła': FLOTA_Q, 'S276 zmienia najpierw pobiera': FLOTA_KOSZ,
  'S276 scala najpierw wysyła': FLOTA_Q, 'S276 scala najpierw pobiera': FLOTA_Q,
};

// ── E3-PR0e2b: „Scal pacjentów” zapisuje chwilę przypisania — przypadki brzegowe ───────────────────────────────────────
describe('„Scal pacjentów” zapisuje chwilę przypisania (E3-PR0e2b) — przepełnienie, gałąź następcy, łańcuch scaleń i zegar cofnięty', () => {
  it('przepełnienie: wersja z chwilą 9999-12-31T23:59:59.999Z zachowuje ją (+1 ms nie ma postaci kanonicznej), wersja z chwilą o 1 ms wcześniejszą dostaje dokładnie +1 ms', async () => {
    const A = await urzadzenie('A');
    const { P: X, ids: [v, w] } = await karta(A, 1, [22, 23]);
    const { P: Y } = await karta(A, 2, [30]);
    await wstaw(A, v, '9999-12-31T23:59:59.999Z');
    await wstaw(A, w, '9999-12-31T23:59:59.998Z');
    krok(); await A.vault.mergePatients(X, Y);
    expect({ v: await pole(A, v), w: await pole(A, w) }).toEqual({ v: '9999-12-31T23:59:59.999Z', w: '9999-12-31T23:59:59.999Z' });
  }, CZAS);

  // Okno jak w „następca” wyżej, ale wersja nie ma tutejszej chwili późniejszej niż scalenie w drugiej karcie
  // przeglądarki, a zegar idzie dalej przed fazą przeniesień: chwila wersji pod kartą następcy to chwila wersji-siostry
  // (to samo przypisanie co pozostałe wersje przeniesione tamtym scaleniem), nie „teraz” fazy.
  it('następca: wersja bez późniejszej tutejszej chwili dostaje pod W chwilę wersji-siostry spod W (scalenie Y → W w drugiej karcie przeglądarki), nie „teraz” fazy przeniesień', async () => {
    const c = await dwieKarty({ czwarta: true });
    krok(); await c.B.vault.mergePatients(c.X, c.Y);
    krok();
    let tW = null;
    await zOknem(c, async (q) => { tW = isoTeraz(); await q.A.vault.mergePatients(q.Y, q.W); krok(); });
    expect([(await stan(c.A, c.v, c.et)).karta, tW < isoTeraz()], 'kontrola: v pod W, zegar przesunięty po scaleniu Y → W').toEqual(['W', true]);
    expect(await pole(c.A, c.v)).toBe(tW);
  }, CZAS);

  // Jak wyżej, ale wersja-siostra pod Y ma już chwilę przypisania T1, późniejszą niż „teraz”: scalenie Y → W w drugiej
  // karcie przeglądarki daje jej T1 + 1 ms, a nagrobkowi Y — „teraz”. Wersja pod W dostaje chwilę siostry (to samo
  // przypisanie co pozostałe wersje przeniesione tamtym scaleniem); chwila nagrobka karty z bieżącego skoku — tylko
  // wtedy, gdy siostra jej nie ma.
  it('następca: chwila wersji-siostry ma pierwszeństwo przed chwilą nagrobka karty z bieżącego skoku (siostra z chwilą T1 dostaje T1 + 1 ms, nagrobek Y — „teraz” scalenia Y → W)', async () => {
    const c = await dwieKarty({ czwarta: true });
    const siostry = (await c.A.adapter.listSnapshotsForUser(uid(c.A), c.Y)).map((s) => s.snapshotId);
    expect(siostry.length, 'kontrola: jedna wersja pod Y na A').toBe(1);
    krok(); await c.B.vault.mergePatients(c.X, c.Y);
    await wstaw(c.A, siostry[0], T1);
    krok();
    let tW = null;
    await zOknem(c, async (q) => { tW = isoTeraz(); await q.A.vault.mergePatients(q.Y, q.W); krok(); });
    expect([(await stan(c.A, c.v, c.et)).karta, await pole(c.A, siostry[0]), tW < T1], 'kontrola: v pod W, siostra pod W z T1 + 1 ms, „teraz” scalenia Y → W wcześniejsze niż T1').toEqual(['W', T1P, true]);
    expect(await pole(c.A, c.v)).toBe(T1P);
  }, CZAS);

  // Dwa skoki gałęzi następcy: w kroku karty Q druga karta przeglądarki scala Y → W; w fazie przeniesień, gdy faza
  // przechodzi już do W (drugi odczyt karty W — pierwszy to sprawdzenie następcy), scala W → V. Chwila z bieżącego
  // skoku (siostra pod V), nie z pierwszego (pod W) i nie z karty z ładunku.
  it('łańcuch dwóch skoków gałęzi następcy (Y → W, potem W → V w drugiej karcie przeglądarki): wersja pod V z chwilą wersji-siostry z ostatniego skoku', async () => {
    const c = await dwieKarty({ czwarta: true });
    const { P: V } = await karta(c.A, 6, [60]);
    c.et[V] = 'V';
    krok(); await c.B.vault.mergePatients(c.X, c.Y);
    krok();
    let tV = null, drugi = null;
    await zOknem(c, async (q) => {
      await q.A.vault.mergePatients(q.Y, q.W);
      let n = 0;
      drugi = pulapka(q.A, 'getPatientForUser', (u, pid) => pid === q.W && ++n === 2);
      drugi.osiagnieta.then(async () => { krok(); tV = isoTeraz(); await q.A.vault.mergePatients(q.W, V); krok(); drugi.zwolnij(); });
      krok();
    });
    expect([tV !== null, (await stan(c.A, c.v, c.et)).karta], 'kontrola: drugie okno osiągnięte, v pod V').toEqual([true, 'V']);
    expect(await pole(c.A, c.v)).toBe(tV);
  }, CZAS);

  // Monotoniczność przy zegarze cofniętym: K scala X → Y, C (zna to scalenie, zegar −10 min) scala Y → Z, T (bez
  // wiedzy) poprawia v w starej X. Chwila C = chwila K + 1 ms (nie wcześniejsza), więc wizyta nie wraca do Y ani X.
  it('zegar cofnięty w łańcuchu scaleń: drugie scalenie (zegar −10 min) daje chwilę pierwszego + 1 ms; po wymianach v z poprawką z X w Z na K, C i T', async () => {
    const K = await urzadzenie('K');
    const { P: X, ids: [v] } = await karta(K, 1, [20, 21]);
    const { P: Y } = await karta(K, 2, [30]);
    const { P: Z } = await karta(K, 3, [35]);
    const C = await blizniak(K, 'C');
    const T = await blizniak(K, 'T');
    krok(); await K.vault.mergePatients(X, Y);
    const poleK = await pole(K, v);
    krok(); await scal(K, C);
    const t0 = teraz;
    ustaw(t0 - 10 * MIN); await C.vault.mergePatients(Y, Z);
    const poleC = await pole(C, v);
    ustaw(t0 + MIN);
    await popraw(T, v, 44);
    for (let i = 0; i < 2; i += 1) for (const [z, na] of [[K, C], [C, K], [T, K], [K, T], [C, T], [T, C]]) { krok(); await scal(z, na); }
    const et = { [X]: 'X', [Y]: 'Y', [Z]: 'Z' };
    const wynik = {};
    for (const d of [K, C, T]) { const s = await stan(d, v, et); wynik[d.nazwa] = [s.karta, s.masa, await pole(d, v)]; }
    expect({ poleK, poleC }).toEqual({ poleK: '2026-03-02T08:05:00.000Z', poleC: '2026-03-02T08:05:00.001Z' });
    expect(wynik).toEqual({ K: ['Z', 44, poleC], C: ['Z', 44, poleC], T: ['Z', 44, poleC] });
  }, 2 * CZAS);
});

// ── Notatka w starej karcie obok poprawki wizyty przeniesionej (decyzja właściciela z 2026-11-25) ─────────────────────
// K scala X → Y (wizyta v 20 kg, druga 21 kg); T (bliźniak sprzed scalenia, bez wiedzy o nim) w starej X: poprawia v na
// 44 kg i dopisuje notatkę / tylko dopisuje notatkę / zapisuje nową wizytę (50 kg) i dopisuje notatkę; potem cztery
// pełne wymiany. Notatka „widoczna” — leży pod istniejącą kartą; „bez karty” — zapisana w magazynie pod kartą, której
// nie ma (niewidoczna; nie skasowana).
describe('notatka zapisana w starej karcie na urządzeniu bez wiedzy o „Scal pacjentów” (decyzja właściciela z 2026-11-25)', () => {
  async function przebieg(wariant) {
    const K = await urzadzenie('K');
    const { P: X, ids: [v] } = await karta(K, 1, [20, 21]);
    const { P: Y } = await karta(K, 2, [30]);
    const T = await blizniak(K, 'T');
    const et = { [X]: 'X', [Y]: 'Y' };
    krok(); await K.vault.mergePatients(X, Y);
    if (wariant.poprawka) await popraw(T, v, 44);
    if (wariant.nowa) { krok(); await T.vault.savePatient(naglowek(1, { masa: 50 }), { dedup: false, patientId: X }); }
    krok(); await T.vault.savePatientNote({ patientId: X, title: 'Notatka N', body: 'Fikcyjna treść', category: 'inne' });
    for (const [z, na] of [[K, T], [T, K], [K, T], [T, K]]) { krok(); await scal(z, na); }
    const wynik = {};
    for (const d of [K, T]) {
      const karty = {};
      const ids = new Set();
      for (const k of await d.adapter.listPatientsForUser(uid(d))) {
        ids.add(k.patientId);
        const p = await d.vault.getPatient(k.patientId);
        karty[et[k.patientId] || '?'] = (p ? p.snapshots : []).map((s) => String(s.payload.user.weight)).sort();
      }
      const notatki = (await d.adapter.listPatientNotesForUser(uid(d))).map((n) => `${ids.has(n.patientId) ? 'widoczna w' : 'bez karty, zapisana pod'} ${et[n.patientId] || '?'}`);
      wynik[d.nazwa] = { karty, notatki };
    }
    return wynik;
  }
  const obaj = (x) => ({ K: x, T: x });

  // Decyzja właściciela z 2026-11-25 (1a): poprawka wizyty przeniesionej idzie do karty scalonej (2a) także wtedy, gdy
  // w tej samej starej karcie dopisano notatkę; notatka zostaje zapisana bez widocznej karty (jak dziś sama notatka —
  // znane ograniczenie, przeniesienie notatek starej karty do karty scalonej: E3-PR0f). Dawniej X wracała z poprawką
  // i z widoczną notatką (duplikat karty).
  it('notatka i poprawka wizyty przeniesionej: poprawka w karcie scalonej Y, stara karta X nie wraca, notatka zapisana bez widocznej karty (decyzja właściciela z 2026-11-25)', async () => {
    expect(await przebieg({ poprawka: true })).toEqual(obaj({ karty: { Y: ['21', '30', '30', '44'] }, notatki: ['bez karty, zapisana pod X'] }));
  }, 2 * CZAS);

  it('[kontrola] sama notatka: jak dotąd — X nie wraca, notatka zapisana bez widocznej karty', async () => {
    expect(await przebieg({})).toEqual(obaj({ karty: { Y: ['20', '21', '30', '30'] }, notatki: ['bez karty, zapisana pod X'] }));
  }, 2 * CZAS);

  it('[kontrola] notatka i nowa wizyta: jak dotąd — X wraca z nową wizytą i z widoczną notatką, wizyty przeniesione zostają w Y', async () => {
    expect(await przebieg({ nowa: true })).toEqual(obaj({ karty: { Y: ['20', '21', '30', '30'], X: ['50'] }, notatki: ['widoczna w X'] }));
  }, 2 * CZAS);
});
