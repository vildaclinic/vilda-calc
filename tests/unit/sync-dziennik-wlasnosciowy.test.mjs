// P-DZIENNIK-ZDARZEN (E2-PR2a) — test A ≡ B: „suma zdarzeń z builderów daje ten sam stan co pełny blob” w postaci
// etapu 2 (specyfikacja E2-PR2a rozdz. 3 po decyzji właściciela 11.1 z 2026-11-03, projekt E2-PR2 rozdz. 7, poprawki K1,
// K2, K4, K5). Prawdziwy sejf w oknach uprzęży E2-PR0 (tests/support/urzadzenie-sync.mjs): urządzenia A i B to bliźniaki
// jednego konta (ten sam klucz — koperty encryptEvent A są czytelne na B), sync: false, zegar vi.useFakeTimers({ toFake:
// ['Date'] }) od stałej fikcyjnej chwili, identyfikatory i IV z ziarna (crypto okna), Math.random z ziarna. Dane
// WYŁĄCZNIE FIKCYJNE („Testowy Jan…”), bez PESEL.
//
// MODEL. Kolejka testowa Q_X = FIFO { kind, key, atISO, env } (szyfrogram z chwili emisji, zamrożony), kursory dostaw
// X→Y. Emisja = wyrocznia „emiter doskonały”: po każdej mutacji lokalnej na X różnica encji eksportu przed/po → builder
// każdej zmienionej encji w tej chwili → encryptEvent → Q_X. Scalanie nie emituje — poza dwoma hakami E2-PR3b u odbiorcy
// po każdej partii: H1 (ptomb(p) przegrał, karta p jest dalej u Y → pfull(p) z setId p|deletedAtISO, dedup po setId) i H2
// (ratunek notatki D-21 „zawsze do kolejki”: notatka, której nagrobek zniknął w partii, a rekord zmieniło scalanie →
// pnote(id), także gdy jej koperta pnote przyszła w tej partii). Dostawa X→Y = FIFO-prefiks od kursora (losowa tylko
// długość i przeplot nadawców), powtórka = cofnięcie kursora i ponowne zastosowanie sufiksu; każde zdarzenie przez
// applyEncryptedEvent, status inny niż applied = błąd.
//
// WYMAGANIE DLA E2-PR3a — kolejność emisji w kroku: snap (także wersje przeniesione pod kartę celu „Scal pacjentów”
// i głowy scalenia), potem stomb, potem ptomb, potem pnote, pnotetomb, note, notetomb, plist, plisttomb, pref, pk, pktomb,
// cred. Pola karty zmienione bez snap tej karty w kroku niesie stomb z kartą (11.2), inaczej snap(karta, najnowsza
// wersja); karta bez wersji i bez stomb = „brak nośnika” (liczony w wyniku ziarna).
// Do ponownej decyzji w E2-PR3a: `ptomb` przed `snap` w kroku »Scal pacjentów«. Zmierzone w sondach analizy: leczy
// R2-E3, a w profilu pełnym uprzęży echa usuwa klasę »obecność wersji« (7 → 0; inny program niż ten plik); P1e bez zmian.
// Niezmierzone: scenariusz K6 (poprawka przeniesionej wersji na odbiorcy); zmiana kolejności potrafi zepsuć inny przypadek
// (N2 przeglądu E2-PR2a).
//
// WARUNKI (3.2). D(X, Y) — różnice encja po encji na eksportach kanonicznych (pominSeq, pominSnapshotCount), każda z klasą
// z 3.6 albo bez (null): R2 (rev wersji ±1), R3 (rev nagrobka notatki), R4a (opis i gwiazdka wpisu kosza żywej karty),
// R4a′ (jak R4a z inną treścią — tylko p. 6), R4n (postać gwiazdki w treści wpisu kosza; widok Kosza równy), R5
// (obecność wpisu kosza karty usuniętej), createdAtISO-notatki i D7 (klasy dzisiejsze, profil pełny i p. 6), E1-katalog
// (klasa dzisiejsza, tylko W4 p. 5 i tylko przebiegi z listy E1_KATALOG, gdy same bloby dają różnicę na tych samych
// kluczach encji) i „notatka pod inną kartą” (klasa dzisiejsza po „Scal pacjentów”, także przy samych blobach; profil
// pełny — raport, p. 6 — literał); tabela DOZWOLONE mówi, gdzie klasa nie czerwieni. Poza tabelą: wyjątek Q8-obca-2
// „ZNANA RÓŻNICA (zdarzenia)” (E2-PR3c) — tylko W4 p. 5 i tylko klucze D z literału Q8_ZDARZENIA (klasyW4Kat).
// - W1 (dokładna charakterystyka) — w każdym punkcie spoczynku (pełne dostawy w obie strony z hakami, ≤ 4 rundy) D(A, B)
//   na żywych urządzeniach: profil podstawowy — każda różnica z klasą dozwoloną, a dla ziaren domyślnych lista punktów
//   [ziarno, krok, [klasy]] = ZNANE_W1 (nowa albo znikająca różnica = czerwień).
// - W2r (dokładna charakterystyka) — wymiana blobem na ŚWIEŻYCH klonach jednej migawki (klon = „przeładowanie strony”):
//   klon X′ po mergeSyncPayload(exportSyncPayload(Y)) wobec klonu X″; klasy jak W1, W2r ⊆ W1, ziarna domyślne = ZNANE_W2R.
// - W2s (charakterystyka) — w każdym punkcie pełnej dostawy X→Y klon Y1 (zdarzenia FIFO, bez haków) wobec klonu Y2 (blob
//   X), różnica po różnicy: K1 „karta częściowa do pfull” (tylko karta i jej wersje), K2 „ratunek D-21”, klasy 3.6, klasa
//   W2s K1k „wpis kosza karty w wyścigu”, „inne”; profil podstawowy wymaga „inne” = ∅.
// - W3 (zieleń) — te same koperty przez applyEncryptedDelta (ps) na trzecim klonie ≡ przez applyEncryptedEvent.
// - W4 (zieleń; gwarancja etapu 2, decyzja 7) — w każdym punkcie spoczynku dwie pary świeżych klonów: PO-A (B₁ scala
//   eksport A₁, potem A₁ eksport B₁ — jak przyjęty PUT z ETagiem) i PO-B; D obu par puste albo tylko klasy dozwolone w W4,
//   druga runda nic nie zmienia, a każda różnica R4n przechodzi W4p („Przywróć” na klonach obu stron przy stałym
//   Math.random daje ściśle równe eksporty).
// - Kolejność losowa (nie FIFO) — licznik i klasy różnic (charakterystyka).
// Nowe pomiary (W4, W4p, „Przywróć”, odczyt Kosza w klasyfikatorze) są izolowane (kr_cicho): program ziarna jest ten sam co
// przed ich dodaniem (kontrola wierności: dziennik operacji ziaren 1..40 taki sam jak w przebiegu bez nowych pomiarów;
// poprawka H2 zmienia dziennik w 13 ziarnach, listy W1/W2r bez zmian).
//
// PROFILE I ZIARNA. Podstawowy: zapis karty i nowej wersji, poprawka w miejscu, gwiazdka, kosz (nie najnowszej wersji
// karty — inaczej ograniczenie E1), „Przywróć”, „Usuń pacjenta”, notatka pacjenta, notatka biblioteki, lista, zmiana
// hasła, dostawy częściowe i pełne w obie strony. Pełny (charakterystyka; W3 i W4 z klasami profilu pełnego — zieleń):
// dodatkowo retencja, „Scal pacjentów” z koszem po scaleniu, retencja przypiętej i „Zostaw notatkę” (wskrzeszenie notatki
// pacjenta). Ziarna: E2_AB_ZIARNA (podstawowy 8, pełny 2) od E2_AB_START (1), E2_AB_KROKI (domyślnie 60–120 mutacji
// z ziarna), E2_AB_WYNIKI=plik — JSONL z wynikiem ziarna (E2_AB_P5, E2_AB_P6 — wyniki bloków p. 5 i p. 6).
//
// BLOK DETERMINISTYCZNY (3.4). p. 1 — każdy z 14 builderów: mutacja jednej encji na A → koperty → świeży klon B ≡ klon B
// po blobie A, także dwukrotnie i w obu kolejnościach z sąsiednim rodzajem; W4. p. 2 — stomb: P1, P1b, P1c, P1d, znika,
// retencja (W2 w pierwszej pełnej dostawie, spoczynek, W1, W2r, W3, W4), odbiorca bez karty (K10) i P1e jako dokładna
// charakterystyka (ZMIANA ZACHOWANIA do akceptacji właściciela przed E2-PR6). p. 3 — D-5. p. 4 — nagrobek pacjenta
// u odbiorcy starszy i nowszy niż nowa wersja nadawcy, minimalne odtworzenie klasy W2s K1k, strażnik H2 „zawsze do
// kolejki” (N1 i N1b: notatka karty usuniętej, której koperta pnote przyszła razem z nagrobkiem). p. 5 — katalog kosza
// (kosz-po-kluczu-wspolne.mjs): literały ścieżek zdarzeń, blobu i W4, różnice E1-katalog (KAT_E1), lista „zmian
// zachowania”, „ZNANA UTRATA” npret-pin i npret-K (E2-PR3c), „ZNANA RÓŻNICA (zdarzenia)” Q8-obca-2 (Q8_ZDARZENIA,
// E2-PR3c). p. 6 — znane klasy i dalsze ciągi z minimalnych odtworzeń analizy („ZNANA RÓŻNICA”, „ZNANA UTRATA” z pozycją
// planu, która je naprawi; „ZNANA RÓŻNICA (dzisiejsza)” — notatka pod inną kartą po „Scal pacjentów”, pozycja planu
// E2-PR3c jako propozycja do decyzji właściciela). Klasy 3.6 — testy negatywne: predykat każdej klasy (pozytyw i negatywy
// z definicji na syntetycznych parach), tabela DOZWOLONE = tabela 3.6 literałem, D z niepustymi ścieżkami, W4p zawodzi
// na R4-a i R4-a′, W4 (dwa i trzy urządzenia) czerwone przy nieudanym W4p, przy różnicy niedozwolonej i bez punktu
// stałego.
//
// KOALESCENCJA KOLEJKI (E2-PR2b, reguła ogona). Przy S.koalescencja === 'ogon' kolejka Q_X łączy wpisy jak magazyn
// kolejki sejfu: o zastąpieniu wpisu decyduje funkcja Bob_plan WYCIĘTA z vilda_vault.js (tests/support/model-kolejki.mjs,
// ten sam model w M5c magazynu). Wpisy oczekujące = nigdy niedostarczone (indeks ≥ X.wyslane). Bez flagi zachowanie jak
// w E2-PR2a (kontrola wierności: JSONL ziaren domyślnych, p. 5 i p. 6 bez zmian poza ms). Testy: describe „koalescencja
// kolejki (reguła ogona)” — profil podstawowy bez W2s, ziarna ZIARNA_KOAL (E2_AB_ZIARNA_KOAL), literał ZNANE_W1_KOAL,
// suma koalescencji > 0; blok deterministyczny p. 7 (7a poprawki jednej wizyty z rzędu, 7b ratunek notatki za pełną
// kartą, 7c punkty R3 wariantu „na koniec”); E2_AB_KOAL=ogon — profil pełny z koalescencją (przebieg ręczny).
// Każdy describe zaczyna od sprawdzenia, że VildaVault._eventLog istnieje (D1).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { utworzAtrapeWorkera, zegarSterowany } from '../support/atrapa-workera-sync.mjs';
import { sprzatnijUrzadzenia, utworzUrzadzenie, eksportKanoniczny } from '../support/urzadzenie-sync.mjs';
import { appendFileSync } from 'node:fs';
import { okno } from './sesja-zapisu-uprzaz.mjs';
import { createHash } from 'node:crypto';
import { PRZYGOTOWANIA, sztucznyZegar, przesunZegar, zegar } from './s4d7-wspolne.mjs';
import { SCEN as KATALOG, RUNDY, pelnyStan, widok } from './kosz-po-kluczu-wspolne.mjs';
import { dopiszDoKolejki } from '../support/model-kolejki.mjs';

// ── Wspólne ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const START = Date.parse('2026-03-02T08:00:00.000Z');
let teraz = START;
const ustaw = (ms) => { teraz = ms; vi.setSystemTime(teraz); };
const krok = (ms = 1000) => ustaw(teraz + ms);
const json = (x) => JSON.parse(JSON.stringify(x));
const OPCJE = { pominSeq: true, pominSnapshotCount: true };
const kanon = (lad) => JSON.parse(eksportKanoniczny(lad, OPCJE));
const RODZAJE = ['snap', 'pfull', 'ptomb', 'stomb', 'pnote', 'pnotetomb', 'note', 'notetomb', 'plist', 'plisttomb', 'pref', 'pk', 'pktomb', 'cred'];
// D1: każdy describe zaczyna od sprawdzenia, że eksport dziennika zdarzeń istnieje (czerwone na bazie bez API).
const d1 = () => it('D1: VildaVault._eventLog istnieje', () => { expect(typeof okno().win.VildaVault._eventLog).toBe('object'); });

// Własny generator (mulberry32, wzór kosz-po-kluczu-fuzz.test.mjs) — ziarno wyznacza program, identyfikatory i IV.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const tasuj = (a, los) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i -= 1) { const j = Math.floor(los() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
// crypto okna z ziarnem: identyfikatory (16 B) i IV (12 B) z generatora, reszta (klucze) z prawdziwego źródła.
function kryptoZiarna(ziarno) {
  const los = rng(ziarno);
  return {
    subtle: globalThis.crypto.subtle,
    getRandomValues: (x) => {
      if (x instanceof Uint8Array && (x.length === 16 || x.length === 12)) { for (let i = 0; i < x.length; i += 1) x[i] = Math.floor(los() * 256); return x; }
      return globalThis.crypto.getRandomValues(x);
    },
    randomUUID: () => 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(los() * 16).toString(16)),
  };
}
function sortuj(x) {
  if (Array.isArray(x)) return x.map(sortuj);
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x).sort()) o[k] = sortuj(x[k]); return o; }
  return x;
}
const naj = (snapshots) => (snapshots || []).reduce((m, s) => {
  if (!m) return s;
  const a = [s.savedAtISO || '', s.updatedAtISO || '', s.snapshotId], b = [m.savedAtISO || '', m.updatedAtISO || '', m.snapshotId];
  return a.join('|') > b.join('|') ? s : m;
}, null);

// ── Encje ładunku (wyrocznia emisji i różnice) ───────────────────────────────────────────────────────────────────────
// Klucz encji = rodzaj:klucz zdarzenia; wartość = JSON z posortowanymi kluczami. Karta (pola bez wersji, bez
// snapshotCount i header.timestampISO) to osobna encja „karta” — nośnikiem jej pól jest snap albo stomb z kartą (11.2).
const SEKCJE_PROSTE = [
  ['patientNotes', 'pnote', 'id'], ['patientNoteTombstones', 'pnotetomb', 'id'], ['notes', 'note', 'id'],
  ['noteTombstones', 'notetomb', 'id'], ['patientLists', 'plist', 'id'], ['patientListTombstones', 'plisttomb', 'id'],
  ['passkeys', 'pk', 'credentialId'], ['passkeyTombstones', 'pktomb', 'credentialId'], ['tombstones', 'ptomb', 'patientId'],
];
function encje(lad) {
  const m = new Map();
  const dodaj = (kind, key, val, extra = {}) => m.set(kind + ':' + key, { kind, key, val: JSON.stringify(sortuj(val)), ...extra });
  for (const p of lad.patients || []) {
    const { snapshots, snapshotCount: _c, ...karta } = p;
    const header = karta.header && typeof karta.header === 'object' ? { ...karta.header } : karta.header;
    if (header && typeof header === 'object') delete header.timestampISO;
    dodaj('karta', p.patientId, { ...karta, header }, { patientId: p.patientId, wersje: (snapshots || []).map((s) => s.snapshotId), najnowsza: (naj(snapshots) || {}).snapshotId || null });
    for (const s of snapshots || []) dodaj('snap', p.patientId + '/' + s.snapshotId, s, { patientId: p.patientId, snapshotId: s.snapshotId });
  }
  for (const [sekcja, kind, pole] of SEKCJE_PROSTE) for (const e of lad[sekcja] || []) dodaj(kind, e[pole], e, { patientId: e.patientId || null });
  const kosz = new Map();
  for (const e of lad.snapshotTombstones || []) {
    const { seq: _s, ...bez } = e;
    if (!kosz.has(e.snapshotId)) kosz.set(e.snapshotId, []);
    kosz.get(e.snapshotId).push(sortuj(bez));
  }
  for (const [sid, l] of kosz) dodaj('stomb', sid, l.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)), { patientIds: l.map((x) => x.patientId) });
  for (const [k, w] of Object.entries(lad.userPreferences || {})) dodaj('pref', k, w);
  if (lad.credential) dodaj('cred', 'cred', lad.credential);
  return m;
}
// Zmienione albo nowe encje (zniknięcie bez nagrobka — nic: lokalne z założenia, D-8 A).
function zmienione(przed, po) {
  const a = encje(przed), b = encje(po);
  return [...b.entries()].filter(([k, e]) => !a.has(k) || a.get(k).val !== e.val).map(([, e]) => e);
}
// Różniące się encje dwóch ładunków (obie strony).
function rozneEncje(x, y) {
  const a = encje(x), b = encje(y);
  const klucze = new Set([...a.keys(), ...b.keys()]);
  return [...klucze].filter((k) => !a.has(k) || !b.has(k) || a.get(k).val !== b.get(k).val).sort();
}
// Pierwsze różniące się ścieżki dwóch kanonicznych eksportów.
function sciezki(a, b, limit = 8) {
  const out = [];
  const id = (o) => (o && typeof o === 'object' ? o.patientId || o.snapshotId || o.id || o.credentialId || null : null);
  const krotko = (v) => { const s = JSON.stringify(v); return s === undefined ? 'brak' : s.length > 80 ? s.slice(0, 77) + '…' : s; };
  const idz = (x, y, p) => {
    if (out.length >= limit) return;
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    if (Array.isArray(x) && Array.isArray(y)) {
      const mx = new Map(x.map((e, i) => [id(e) || '#' + i, e])), my = new Map(y.map((e, i) => [id(e) || '#' + i, e]));
      for (const k of new Set([...mx.keys(), ...my.keys()])) idz(mx.get(k), my.get(k), `${p}[${String(k).slice(0, 8)}]`);
      return;
    }
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) idz(x[k], y[k], p ? `${p}.${k}` : k);
      return;
    }
    out.push(`${p}: ${krotko(x)} ≠ ${krotko(y)}`);
  };
  idz(a, b, '');
  return out;
}

// ── D(X, Y): różnice encja po encji (specyfikacja 2a, 3.2) ──────────────────────────────────────────────────────────
// Na eksportach kanonicznych (pominSeq, pominSnapshotCount). Klucze: karta patientId (bez tablicy snapshots), wersja
// patientId/snapshotId, wpis kosza snapshotId|patientId, notatka pacjenta i jej nagrobek id, notatka biblioteki, lista
// i ich nagrobki id, klucz dostępu credentialId, preferencja — klucz, credential — jeden obiekt, nagrobek karty
// patientId; pozostałe pola główne — „inne:<pole>”. Wynik: [{ klucz, rodzaj, sciezki (niepuste), a, b, tylko }] —
// a/b = encja po stronie X/Y (null, gdy jej brak; wtedy sciezki ['(obecność)'] i tylko 'x' albo 'y').
const SEKCJE_D = [
  ['patientNotes', 'pnote', (e) => e.id], ['patientNoteTombstones', 'pnotetomb', (e) => e.id], ['notes', 'note', (e) => e.id],
  ['noteTombstones', 'notetomb', (e) => e.id], ['patientLists', 'plist', (e) => e.id], ['patientListTombstones', 'plisttomb', (e) => e.id],
  ['passkeys', 'pk', (e) => e.credentialId], ['passkeyTombstones', 'pktomb', (e) => e.credentialId], ['tombstones', 'ptomb', (e) => e.patientId],
  ['snapshotTombstones', 'kosz', (e) => `${e.snapshotId}|${e.patientId}`],
];
function encjeD(k) {
  const m = new Map();
  const dodaj = (rodzaj, klucz, val) => {
    let kk = rodzaj + ':' + klucz;
    for (let i = 2; m.has(kk); i += 1) kk = `${rodzaj}:${klucz}#${i}`; // duplikat klucza — osobna encja (widoczna w D)
    m.set(kk, { rodzaj, klucz: kk.slice(rodzaj.length + 1), val });
  };
  for (const [pole, w] of Object.entries(k || {})) {
    if (pole === 'patients') {
      for (const p of w || []) {
        const { snapshots, ...karta } = p;
        dodaj('karta', p.patientId, karta);
        for (const s of snapshots || []) dodaj('wersja', `${p.patientId}/${s.snapshotId}`, s);
      }
    } else if (pole === 'userPreferences') {
      for (const [kl, v] of Object.entries(w || {})) dodaj('pref', kl, v);
    } else if (pole === 'credential') {
      dodaj('cred', 'cred', w);
    } else {
      const sek = SEKCJE_D.find(([s]) => s === pole);
      if (sek && Array.isArray(w)) for (const e of w) dodaj(sek[1], sek[2](e), e);
      else dodaj('inne:' + pole, pole, w);
    }
  }
  return m;
}
// Ścieżki różnic wewnątrz encji (tablice obiektów z polem tożsamości — po nim, inne — po indeksie).
function sciezkiEncji(x, y, p = '', out = []) {
  if (JSON.stringify(x) === JSON.stringify(y)) return out;
  if (Array.isArray(x) && Array.isArray(y)) {
    const id = (e, i) => (e && typeof e === 'object' && (e.patientId || e.snapshotId || e.id || e.credentialId)) || '#' + i;
    const mx = new Map(x.map((e, i) => [String(id(e, i)), e])), my = new Map(y.map((e, i) => [String(id(e, i)), e]));
    for (const k of new Set([...mx.keys(), ...my.keys()])) sciezkiEncji(mx.get(k), my.get(k), `${p}[${k}]`, out);
    return out;
  }
  if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y)) {
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) sciezkiEncji(x[k], y[k], p ? `${p}.${k}` : k, out);
    return out;
  }
  out.push(p || '(wartość)');
  return out;
}
function D(x, y) {
  const a = encjeD(x), b = encjeD(y);
  const out = [];
  for (const k of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const ea = a.get(k), eb = b.get(k);
    if (ea && eb && JSON.stringify(ea.val) === JSON.stringify(eb.val)) continue;
    const e = ea || eb;
    // Ścieżki zawsze niepuste (3.2): różnica, której sciezkiEncji nie umie wskazać (np. duplikat tożsamości w tablicy
    // wewnątrz encji), dostaje '(wartość)' — żaden predykat klasy jej wtedy nie przyjmie (P7 weryfikacji).
    const sc = ea && eb ? sciezkiEncji(ea.val, eb.val) : ['(obecność)'];
    out.push({
      klucz: e.klucz, rodzaj: e.rodzaj, a: ea ? ea.val : null, b: eb ? eb.val : null, tylko: !ea ? 'y' : !eb ? 'x' : null,
      sciezki: sc.length ? sc : ['(wartość)'],
    });
  }
  return out;
}

// ── Znane klasy (specyfikacja 2a, 3.6) ───────────────────────────────────────────────────────────────────────────────
// Klasa = predykat na jednej różnicy z D(X, Y) porównywanej pary (A, B w W1 i W4; A′, A″ / B′, B″ w W2r; Y1, Y2 w W2s);
// pierwszy pasujący wygrywa (R2, R3, R4a, R4a′, R4n, R5, createdAtISO-notatki, D7, E1-katalog, notatka pod inną kartą).
// kont.kosz = { x, y } — listTrashedSnapshots() obu stron (dla R4n; pomiar izolowany); kont.e1Bloby — klucze D ścieżki
// samych blobów tej pary (tylko W4 p. 5).
const R4A_POLA = ['rev', 'updatedAtISO', 'gwiazdka', 'payload._pinned', 'payload._pinnedState'];
const POSTAC_GWIAZDKI = ['payload._pinned', 'payload._pinnedState'];
// D7 (ALGORITHMS, „rev, opis i część pól nagrobka zależne od kolejności (D7, Z5)”, ok. 22622–22627): „opis nagrobka po
// plotce (rev, updatedAtISO, zmianaISO), koszISO (składnik k ginie razem z koszem, który przegrał z późniejszą wersją bez
// przycięcia […]) […] — od kolejności scaleń” — przy samych blobach.
const D7_POLA = ['rev', 'updatedAtISO', 'zmianaISO', 'koszISO'];
const wPolach = (s, pola) => pola.some((d) => s === d || s.startsWith(d + '.') || s.startsWith(d + '['));
const kartaW = (k, pid) => (k.patients || []).some((p) => p.patientId === pid);
const nagrobekW = (k, pid) => (k.tombstones || []).some((t) => t.patientId === pid);
const notatkaW = (k, id) => (k.patientNotes || []).some((n) => n.id === id);
// Widok Kosza jednego wpisu (to, co pokazuje okno Kosza i co niesie „Przywróć”): pola listTrashedSnapshots bez postaci
// gwiazdki w treści (payload._pinned, payload._pinnedState) — gwiazdkę pokazuje pole pinned.
function widokWpisu(e) {
  if (!e) return null;
  const { payload, ...reszta } = e;
  const p = payload && typeof payload === 'object' ? { ...payload } : payload;
  if (p && typeof p === 'object') { delete p._pinned; delete p._pinnedState; }
  return sortuj({ ...reszta, payload: p });
}
const widokKosza = (lista) => (lista || []).map(widokWpisu).sort((m, n) => (JSON.stringify(m) < JSON.stringify(n) ? -1 : 1));
function klasa(r, X, Y, kont = {}) {
  const obie = r.a != null && r.b != null;
  const tylkoPola = (pola) => r.sciezki.length > 0 && r.sciezki.every((s) => wPolach(s, pola));
  if (r.rodzaj === 'wersja' && obie && tylkoPola(['rev']) && Math.abs((Number(r.a.rev) || 0) - (Number(r.b.rev) || 0)) === 1) return 'R2';
  if (r.rodzaj === 'pnotetomb' && obie && tylkoPola(['rev']) && !notatkaW(X, r.klucz) && !notatkaW(Y, r.klucz)) return 'R3';
  if (r.rodzaj === 'kosz') {
    const [sid, pid] = r.klucz.split('|');
    const zywa = kartaW(X, pid) && kartaW(Y, pid) && !nagrobekW(X, pid) && !nagrobekW(Y, pid);
    const spozaPayload = r.sciezki.some((s) => !wPolach(s, ['payload']));
    if (obie && zywa && spozaPayload && tylkoPola(R4A_POLA)) return 'R4a';
    if (obie && zywa && spozaPayload && tylkoPola([...R4A_POLA, 'payload']) && r.sciezki.some((s) => wPolach(s, ['payload']) && !wPolach(s, POSTAC_GWIAZDKI))) return 'R4a′';
    if (obie && tylkoPola(POSTAC_GWIAZDKI) && kont.kosz) {
      const wx = widokKosza((kont.kosz.x || []).filter((e) => e.snapshotId === sid)), wy = widokKosza((kont.kosz.y || []).filter((e) => e.snapshotId === sid));
      if (JSON.stringify(wx) === JSON.stringify(wy)) return 'R4n';
    }
    if (!obie && !kartaW(X, pid) && !kartaW(Y, pid) && nagrobekW(X, pid) && nagrobekW(Y, pid)) return 'R5';
  }
  if (r.rodzaj === 'pnote' && obie && tylkoPola(['createdAtISO'])) return 'createdAtISO-notatki';
  if (r.rodzaj === 'kosz' && obie && tylkoPola(D7_POLA)) return 'D7';
  if (kont.e1Bloby && kont.e1Bloby.has(kluczD(r))) return E1;
  if (r.rodzaj === 'pnote' && obie && tylkoPola(['patientId']) && r.a.patientId !== r.b.patientId
    && [r.a.patientId, r.b.patientId].some((p) => nagrobekW(X, p) && nagrobekW(Y, p))) return NPIK;
  return null;
}
// Klasy dzisiejsze dopisane 2026-11-03 (występują też przy samych blobach; specyfikacja 2a, 3.6):
// - E1-katalog (znane ograniczenie E1 „obecność”, tests/unit/kosz-po-kluczu.test.mjs:165 „P trzyma x, K s1 (E1)”):
//   różnica, której klucz encji (rodzaj, klucz) ma też D ścieżki SAMYCH BLOBÓW tego samego przebiegu katalogu, w tej
//   samej parze (kont.e1Bloby — W4 nie gorsze niż same bloby). Predykat liczony dla każdego przebiegu p. 5; klasa jest
//   dozwolona TYLKO w W4 p. 5 (tabela 'W4:p5') i TYLKO w przebiegach z jawnej listy E1_KATALOG (dozwolona) — przebieg spoza
//   listy z taką różnicą = czerwień. Różnice wartości wobec ścieżki blobów — lista „zmian zachowania” (KAT_E1_ZMIANY).
// - „notatka pod inną kartą”: notatka pacjenta id na obu stronach, różni się WYŁĄCZNIE patientId, a karta co
//   najmniej jednego z dwóch patientId ma nagrobek na obu stronach. Pola pochodne zmiany patientId: ŻADNE (zmierzone:
//   D ma jedną ścieżkę „patientId”). Mechanizm: reguła P-NOTATKI-1 (G5) w Le (vilda_vault.js:7877 — zbiór Qpt kart
//   z nagrobkiem lokalnym albo z ładunku; zapis 7881:4179) podmienia w zwycięskim rekordzie z ładunku TYLKO patientId na
//   lokalny, gdy karta z ładunku ma nagrobek; treść (bodyCipher), category, rev = max, updatedAtISO z ładunku i
//   createdAtISO lokalne idą zwykłą regułą (wyższy rev, potem późniejsze updatedAtISO), więc obie strony mają ten sam
//   rekord poza patientId. Powstaje po „Scal pacjentów” P → Q na A i edycji notatki karty P na B bez wiedzy o scaleniu
//   (także po skrzyżowanych „Scal pacjentów”); taki sam wynik przy samych blobach i po W4 — błąd dzisiejszego scalania,
//   niezależny od dziennika zdarzeń (do zgłoszenia właścicielowi jako osobna poprawka reguły, decyzja 9).
const E1 = 'E1-katalog';
const NPIK = 'notatka pod inną kartą';
const kluczD = (r) => `${r.rodzaj} ${r.klucz}`;
// Jawna lista przebiegów katalogu (obie kolejności), w których W4 p. 5 dopuszcza klasę E1-katalog (3.6).
const E1_KATALOG = new Set(['PRZ0-bez', 'E1-popr-C', 'E1-C', 'Q8-obca-2']);
// Gdzie klasa jest dozwolona (3.6): 'tak' — zieleń, 'raport' — drukowana, nie czerwieni; brak wpisu — czerwień.
// Tabele: 'podstawowy' (W1, W2r, W2s profilu podstawowego), 'W4' (W4: profil podstawowy, p. 1–4, P1e), 'W4:p5' (W4 p. 5;
// E1-katalog tylko w przebiegach z listy E1_KATALOG), 'pelny' (W1, W2r, W2s profilu pełnego), 'pelny:W4' (W4 profilu
// pełnego; createdAtISO-notatki tylko przy notatce z „Zostaw notatkę”), 'p6' (p. 6). R4n w każdej tabeli W4 wymaga W4p
// (w4 i w4Trzy liczą W4p); W4 p. 5 (klasyW4Kat, urządzenia katalogu bez klonów) W4p nie liczy, więc R4n w 'W4:p5' NIE
// jest dozwolone — R4n w p. 5 = czerwień do analizy (P4 weryfikacji; dziś p. 5 nie ma R4n).
const DOZWOLONE = Object.freeze({
  podstawowy: { R2: 'tak', R3: 'tak', R4a: 'tak', R5: 'tak', R4n: 'tak' },
  W4: { R4n: 'tak' },
  'W4:p5': { [E1]: 'tak' },
  pelny: { R2: 'raport', R3: 'raport', R4a: 'raport', R5: 'raport', 'R4a′': 'raport', R4n: 'raport', 'createdAtISO-notatki': 'raport', D7: 'raport', [NPIK]: 'raport' },
  'pelny:W4': { R4n: 'tak', 'createdAtISO-notatki': 'raport', D7: 'raport', [NPIK]: 'raport' },
  p6: { R2: 'tak', R3: 'tak', R4a: 'tak', R5: 'tak', 'R4a′': 'tak', R4n: 'tak', 'createdAtISO-notatki': 'tak', [NPIK]: 'tak' },
});
function dozwolona(kl, r, kont) {
  const w = kl ? (DOZWOLONE[kont.tabela] || {})[kl] : undefined;
  if (kl === 'createdAtISO-notatki' && kont.tabela === 'pelny:W4' && !(kont.wskrzeszone && kont.wskrzeszone.has(r.klucz))) return false;
  if (kl === E1 && !(kont.tabela === 'W4:p5' && E1_KATALOG.has(kont.przebieg))) return false;
  return w || false;
}
// Klasyfikacja listy D: [{ ...r, klasa, dozwolona }] (kosz czytany tylko, gdy jest różnica postaci gwiazdki).
async function sklasyfikuj(d, X, Y, kont, czytajKosz) {
  const trzebaKosza = d.some((r) => r.rodzaj === 'kosz' && r.a && r.b && r.sciezki.every((s) => wPolach(s, POSTAC_GWIAZDKI)));
  const k = { ...kont, kosz: trzebaKosza && czytajKosz ? await czytajKosz() : null };
  return d.map((r) => { const kl = klasa(r, X, Y, k); return { ...r, klasa: kl, dozwolona: dozwolona(kl, r, kont) }; });
}
const klasyPunktu = (lista) => [...new Set(lista.map((r) => r.klasa || 'null'))].sort();
const skrotRoznicy = (r) => ({ klucz: r.klucz, rodzaj: r.rodzaj, klasa: r.klasa, dozwolona: r.dozwolona, tylko: r.tylko, sciezki: r.sciezki.slice(0, 6) });

// ── Uprząż A ≡ B ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Świat S: atrapa workera (uprząż E2-PR0 jej wymaga, sync: false — bez ruchu), urządzenia (bliźniaki jednego konta),
// kolejki testowe Q (FIFO { kind, key, atISO, env }), kursory dostaw, hasła po chwili poświadczenia (zmiana hasła).
const HASLO_POCZATKOWE = 'Vilda#Testowe!2026abc';
function swiat(ziarno = 1) {
  return {
    ziarno, nrUrz: 0, atrapa: utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: false, zegar: zegarSterowany() }),
    kursor: new Map(), hasla: new Map(), dziennik: [], braki: [], nrHasla: 0,
    stat: { zdarzen: 0, dostaw: 0, pelnych: 0, h1: 0, h2: 0, w2s: { zgodne: 0, niezgodne: 0, kategorie: {}, roznice: {} }, w2sLista: [], w3: 0, w3Bledy: [], losowa: { zgodne: 0, niezgodne: 0 }, losowaLista: [], spoczynki: 0, w1Bledy: [], w2rBledy: [], w2r: 0, brakSpoczynku: [], w4: 0, w4Bledy: [], w4Klasy: [], w4R4n: 0, w4p: [] },
    nrPomiaru: 0, losAlt: null, wskrzeszone: new Set(), profil: 'podstawowy',
  };
}
async function urzadzenie(S, nazwa, zBlizniaka = null) {
  S.nrUrz += 1;
  const d = await utworzUrzadzenie({
    atrapa: S.atrapa, nazwa: `${nazwa}-${S.nrUrz}`, zBlizniaka: zBlizniaka ? zBlizniaka.d : undefined, sync: false,
    rejestrMagazynu: false, haslo: HASLO_POCZATKOWE, dodatki: { crypto: kryptoZiarna(S.ziarno * 7919 + S.nrUrz) },
  });
  const U = { d, v: d.vault, ev: d.vault._eventLog, nazwa, Q: [], setIds: new Set(), stan: null, usuniete: new Set(), znaneNotatki: new Map() };
  ustawStan(U, await eksport(U));
  if (!zBlizniaka) S.hasla.set(idHasla(U.stan), HASLO_POCZATKOWE);
  return U;
}
// Stan urządzenia (ostatni eksport) i historia kart, które kiedykolwiek miały tu nagrobek (kategorie W2s).
function ustawStan(U, lad) {
  U.stan = lad;
  for (const t of lad.tombstones || []) U.usuniete.add(t.patientId);
  if (U.znaneNotatki) for (const n of lad.patientNotes || []) U.znaneNotatki.set(n.id, { patientId: n.patientId, title: n.title });
}
const idHasla = (lad) => (lad && lad.credential ? lad.credential.updatedAtISO : null);
async function eksport(U) { return json(await U.v.exportSyncPayload()); }
// Bieżące hasło urządzenia = hasło poświadczenia, które ma w magazynie (zmiana hasła przychodzi zdarzeniem cred).
function haslo(S, U) {
  const h = S.hasla.get(idHasla(U.stan));
  if (!h) throw new Error(`brak hasła dla poświadczenia ${idHasla(U.stan)} na ${U.nazwa}`);
  return h;
}
// Świeży klon z migawki („przeładowanie strony”: bez cieni i pamięci sesji w oknie, K4).
async function klon(S, U, nazwa = 'klon') {
  U.d.konto.haslo = haslo(S, U);
  return urzadzenie(S, `${U.nazwa}-${nazwa}`, U);
}
const zamknij = async (...lista) => { for (const K of lista) await K.d.zamknij(); };
const kursor = (S, X, Y) => S.kursor.get(X.nazwa + '>' + Y.nazwa) || 0;

// Wyrocznia „emiter doskonały” (projekt.md 7.3, specyfikacja 2a rozdz. 3.1): po mutacji lokalnej na X różnica encji
// eksportu przed/po → builder każdej zmienionej encji w tej chwili → encryptEvent → Q_X. KOLEJNOŚĆ W KROKU (wymaganie dla
// E2-PR3a): snap (także wersje przeniesione pod kartę celu „Scal pacjentów” i nośnik pól karty: snap najnowszej wersji),
// potem stomb, potem ptomb, potem pnote, pnotetomb, note, notetomb, plist, plisttomb, pref, pk, pktomb, cred.
// Pola karty bez snap tej karty w kroku: stomb z kartą (11.2); inaczej snap(karta, najnowsza wersja); karta bez wersji
// i bez stomb → „brak nośnika” (S.braki).
const PO_STOMB = ['ptomb', 'pnote', 'pnotetomb', 'note', 'notetomb', 'plist', 'plisttomb', 'pref', 'pk', 'pktomb', 'cred'];
async function zbuduj(U, e) {
  const ev = U.ev;
  switch (e.kind) {
    case 'snap': return ev.buildSnapshotEvent(e.patientId, e.snapshotId, null);
    case 'stomb': return ev.buildSnapshotTombstoneEvent(e.key, null);
    case 'ptomb': return ev.buildPatientTombstoneEvent(e.key, null);
    case 'pnote': return ev.buildPatientNoteEvent(e.key, null);
    case 'pnotetomb': return ev.buildPatientNoteTombstoneEvent(e.key, null);
    case 'note': return ev.buildNoteEvent(e.key, null);
    case 'notetomb': return ev.buildNoteTombstoneEvent(e.key, null);
    case 'plist': return ev.buildPatientListEvent(e.key, null);
    case 'plisttomb': return ev.buildPatientListTombstoneEvent(e.key, null);
    case 'pref': return ev.buildPreferenceEvent(e.key, null);
    case 'pk': return ev.buildPasskeyEvent(e.key, null);
    case 'pktomb': return ev.buildPasskeyTombstoneEvent(e.key, null);
    case 'cred': return ev.buildCredentialEvent(null);
    default: throw new Error('nieznany rodzaj ' + e.kind);
  }
}
async function emituj(S, U, przed, po, opis = '') {
  const zm = zmienione(przed, po);
  const koperty = { snap: [], stomb: [], reszta: [] };
  const snapKart = new Set();
  for (const e of zm.filter((x) => x.kind === 'snap')) {
    const k = await zbuduj(U, e);
    if (k) { koperty.snap.push(k); snapKart.add(e.patientId); }
  }
  for (const e of zm.filter((x) => x.kind === 'stomb')) {
    const k = await zbuduj(U, e);
    if (k) koperty.stomb.push(k);
  }
  const kartyStomb = new Set(koperty.stomb.flatMap((k) => (k.patients || []).map((p) => p.patientId)));
  const kartyPo = encje(po);
  for (const e of zm.filter((x) => x.kind === 'karta')) {
    if (snapKart.has(e.patientId) || kartyStomb.has(e.patientId)) continue;
    const najnowsza = kartyPo.get('karta:' + e.patientId).najnowsza;
    const k = najnowsza ? await U.ev.buildSnapshotEvent(e.patientId, najnowsza, null) : null;
    if (k) koperty.snap.push(k);
    else S.braki.push(`${U.nazwa} ${opis}: karta ${e.patientId.slice(0, 8)} bez wersji i bez stomb`);
  }
  for (const r of PO_STOMB) {
    for (const e of zm.filter((x) => x.kind === r)) {
      const k = await zbuduj(U, e);
      if (k) koperty.reszta.push(k);
    }
  }
  const lista = [...koperty.snap, ...koperty.stomb, ...koperty.reszta];
  for (const k of lista) await doKolejki(S, U, k);
  return lista;
}
async function doKolejki(S, U, k) {
  if (U.jawnie) { // katalog p. 5: osobne konta, koperta jawna (bez szyfrowania — szyfrowanie pokrywa W3)
    U.Q.push(Object.freeze({ kind: k.event.kind, key: k.event.key, atISO: k.event.atISO, k: Object.freeze(json(k)) }));
    S.stat.zdarzen += 1;
    return;
  }
  if (S.koalescencja === 'ogon') { await doKolejkiOgon(S, U, Array.isArray(k) ? k : [k]); return; }
  const { env } = await U.ev.encryptEvent(k);
  U.Q.push(Object.freeze({ kind: k.event.kind, key: k.event.key, atISO: k.event.atISO, env: Object.freeze(env) }));
  S.stat.zdarzen += 1;
}
// Kolejka z łączeniem wpisów (S.koalescencja === 'ogon', E2-PR2b): wpisy nigdy niedostarczone (indeks ≥ U.wyslane) są
// wierszami pending magazynu; o zastąpieniu decyduje wycięta z sejfu Bob_plan (tests/support/model-kolejki.mjs), nowe
// wpisy na końcu. Porcje jednego zestawu pfull przychodzą razem, jak jedno enqueue. Liczniki: koal — dopisania, które
// zastąpiły wpis; koalWierszy — zastąpione wpisy; koalPominiete — dopisania z oczekującym wpisem tej encji bez
// zastąpienia (nie na ogonie). S.kolejkaLog — dopisania [urządzenie, kind, key, porcji, setId] i dostawy [urządzenie,
// 'dostawa', liczba nowo dostarczonych wpisów] (do JSONL przebiegu, E2_AB_WYNIKI; z niego ciągi przypadku M5c magazynu).
function zKoalescencja(S) {
  S.koalescencja = 'ogon';
  S.kolejkaLog = [];
  Object.assign(S.stat, { koal: 0, koalWierszy: 0, koalPominiete: 0 });
  return S;
}
async function doKolejkiOgon(S, U, koperty) {
  const nowe = [];
  for (const k of koperty) {
    const { env } = await U.ev.encryptEvent(k);
    nowe.push(Object.freeze({ kind: k.event.kind, key: k.event.key, atISO: k.event.atISO, env: Object.freeze(env), setId: k.event.full ? k.event.full.setId : null }));
    S.stat.zdarzen += 1;
  }
  S.kolejkaLog.push([U.nazwa, nowe[0].kind, nowe[0].key, nowe.length, nowe[0].setId]);
  const { usuniete, kandydaci } = dopiszDoKolejki(U.Q, U.wyslane || 0, nowe);
  if (usuniete) { S.stat.koal += 1; S.stat.koalWierszy += usuniete; } else if (kandydaci) S.stat.koalPominiete += 1;
}
// Mutacja lokalna na X z emisją (stan przed = ostatni eksport X; X zmienia się tylko własnymi krokami i dostawami).
async function mutacja(S, U, opis, fn) {
  const przed = U.stan;
  let wynik;
  let blad = null;
  try { wynik = await fn(); } catch (e) { blad = e; }
  const po = await eksport(U);
  if (idHasla(po) !== idHasla(przed) && U.noweHaslo) { S.hasla.set(idHasla(po), U.noweHaslo); }
  U.noweHaslo = null;
  const k = await emituj(S, U, przed, po, opis);
  ustawStan(U, po);
  S.dziennik.push(`#${S.nrKroku || 0} ${new Date(teraz).toISOString().slice(11, 23)} ${U.nazwa}: ${opis}${blad ? ` → wyjątek ${blad.code || blad.message}` : ''} → [${k.map((x) => x.event.kind).join(',')}]`);
  if (blad) throw blad;
  return { wynik, koperty: k };
}

// Zastosowanie partii u Y (applyEncryptedEvent; każdy status inny niż applied = błąd testu).
async function zastosuj(Y, partia, sposob = 'event') {
  for (const e of partia) {
    if (e.k) { await Y.v.mergeSyncPayload(json(e.k)); continue; } // katalog p. 5: koperta jawna przez mergeSyncPayload
    if (sposob === 'delta') { await Y.v.applyEncryptedDelta(e.env); continue; }
    const r = await Y.ev.applyEncryptedEvent(e.env);
    if (!r || r.status !== 'applied') throw new Error(`${Y.nazwa}: zdarzenie ${e.kind} ${e.key} → status ${r && r.status} ${r && (r.reason || r.code || '')}`);
  }
}
// Haki E2-PR3b u odbiorcy Y po partii (jedyne miejsca, w których scalanie dopisuje do kolejki):
// H1 przegrany nagrobek pacjenta — po ptomb(p) karta p nadal jest u Y → pfull(p) z setId p|deletedAtISO (dedup po setId);
// H2 ratunek notatki D-21 (K2) — notatka pacjenta, której nagrobek zniknął w partii (był przed albo przyszedł w partii)
// i której rekord zmieniło scalanie → pnote(id), „zawsze do kolejki” (plan:201), TAKŻE gdy w tej partii przyszła jej
// własna koperta pnote (poprawka N1 krytyka 2a, 4.0; specyfikacja 2a, 3.1 H2: bez wyjątku notatka zostawała tylko na
// jednym urządzeniu — B z nagrobkiem, choć karta wracała przez H1).
async function haki(S, Y, partia, przed, po) {
  const dodane = [];
  const karty = new Set((po.patients || []).map((p) => p.patientId));
  for (const e of partia.filter((x) => x.kind === 'ptomb')) {
    const setId = e.key + '|' + e.atISO;
    if (Y.setIds.has(setId) || !karty.has(e.key)) continue;
    Y.setIds.add(setId);
    const porcje = await Y.ev.buildPatientFullEvents(e.key, null, { setId });
    if (S.koalescencja && porcje && porcje.length) { await doKolejki(S, Y, porcje); dodane.push(...porcje); } // zestaw razem
    else for (const k of porcje || []) { await doKolejki(S, Y, k); dodane.push(k); }
    S.stat.h1 += 1;
  }
  const a = encje(przed), b = encje(po);
  const wPartii = (kind, id) => partia.some((x) => x.kind === kind && x.key === id);
  for (const [klucz, n] of b) {
    if (n.kind !== 'pnote') continue;
    const zmieniona = !a.has(klucz) || a.get(klucz).val !== n.val;
    const nagrobekZniknal = (a.has('pnotetomb:' + n.key) || wPartii('pnotetomb', n.key)) && !b.has('pnotetomb:' + n.key);
    if (!zmieniona || !nagrobekZniknal) continue;
    const k = await Y.ev.buildPatientNoteEvent(n.key, null);
    if (k) { await doKolejki(S, Y, k); dodane.push(k); S.stat.h2 += 1; }
  }
  return dodane;
}

// Dostawa X→Y: FIFO-prefiks od kursora (losowa tylko długość k), powtórka = cofnięcie kursora o r i ponowne
// zastosowanie sufiksu. W każdym punkcie pełnej dostawy (k = wszystkie oczekujące) charakterystyka W2s i warunek W3
// (bez nich, gdy świat ma S.w2s === false). X.wyslane — najwyższy indeks Q_X kiedykolwiek dostarczony (granica wpisów
// oczekujących dla łączenia wpisów).
async function dostawa(S, X, Y, { k = Infinity, cofnij = 0, haki: zHakami = true, w2s = S.w2s !== false } = {}) {
  const nazwa = X.nazwa + '>' + Y.nazwa;
  const c = Math.max(0, (S.kursor.get(nazwa) || 0) - cofnij);
  const oczekujace = X.Q.slice(c);
  if (!oczekujace.length) return { partia: [], dodane: [] };
  const partia = oczekujace.slice(0, Math.min(k, oczekujace.length));
  const pelna = partia.length === oczekujace.length;
  S.stat.dostaw += 1;
  if (pelna) S.stat.pelnych += 1;
  if (pelna && w2s) await sprawdzW2s(S, X, Y, partia);
  const przed = Y.stan;
  await zastosuj(Y, partia);
  S.kursor.set(nazwa, c + partia.length);
  const wyslane = Math.max(X.wyslane || 0, c + partia.length);
  if (S.kolejkaLog && wyslane > (X.wyslane || 0)) S.kolejkaLog.push([X.nazwa, 'dostawa', wyslane - (X.wyslane || 0)]);
  X.wyslane = wyslane;
  const po = await eksport(Y);
  const dodane = zHakami ? await haki(S, Y, partia, przed, po) : [];
  ustawStan(Y, po);
  S.dziennik.push(`#${S.nrKroku || 0} ${new Date(teraz).toISOString().slice(11, 23)} dostawa ${nazwa}: ${partia.length}${cofnij ? ` (powtórka ${Math.min(cofnij, c + cofnij)})` : ''}${pelna ? ' pełna' : ''} [${partia.map((e) => e.kind).join(',')}]${dodane.length ? ` → haki [${dodane.map((x) => x.event.kind).join(',')}]` : ''}`);
  return { partia, dodane };
}

// W2s (charakterystyka) i W3 (warunek) w punkcie pełnej dostawy X→Y: świeże klony tej samej migawki Y — Y1 stosuje
// oczekujące zdarzenia X (FIFO, bez haków, applyEncryptedEvent), Y2 scala blob X, Y3 stosuje te same koperty przez
// applyEncryptedDelta (ps, flota mieszana), Y4 — w losowej kolejności (charakterystyka, nie FIFO).
async function sprawdzW2s(S, X, Y, partia) {
  Y.d.konto.haslo = haslo(S, Y);
  const [Y1, Y2, Y3, Y4] = await Promise.all(['z', 'b', 'd', ...(S.losowa ? ['l'] : [])].map((n) => klon(S, Y, n)));
  const blob = json(await X.v.exportSyncPayload());
  try {
    await Promise.all([zastosuj(Y1, partia), Y2.v.mergeSyncPayload(blob), zastosuj(Y3, partia, 'delta')]);
    const [e1, e2, e3] = await Promise.all([eksport(Y1), eksport(Y2), eksport(Y3)]);
    const [k1, k2, k3] = [kanon(e1), kanon(e2), kanon(e3)];
    S.stat.w3 += 1;
    if (JSON.stringify(k1) !== JSON.stringify(k3)) S.stat.w3Bledy.push({ krok: S.nrKroku, dostawa: X.nazwa + '>' + Y.nazwa, sciezki: sciezki(k1, k3) });
    if (JSON.stringify(k1) === JSON.stringify(k2)) S.stat.w2s.zgodne += 1;
    else {
      S.stat.w2s.niezgodne += 1;
      // Kategorie różnica po różnicy (3.2): K1 (tylko karta i jej wersje), K2, klasy 3.6 na parze (Y1, Y2), „inne”.
      const lista = await kr_cicho(S, async () => kategorieW2s(Y, X, partia, e1, e2, k1, k2, S.profil,
        async () => ({ x: await Y1.v.listTrashedSnapshots(), y: await Y2.v.listTrashedSnapshots() })));
      const kat = [...new Set(lista.map((r) => r.kategoria))].sort().join(' + ');
      S.stat.w2s.kategorie[kat] = (S.stat.w2s.kategorie[kat] || 0) + 1;
      for (const r of lista) S.stat.w2s.roznice[r.kategoria] = (S.stat.w2s.roznice[r.kategoria] || 0) + 1;
      S.stat.w2sLista.push({ kategoria: kat, krok: S.nrKroku, dostawa: X.nazwa + '>' + Y.nazwa, encje: rozneEncje(e1, e2).slice(0, 6), sciezki: sciezki(k1, k2, 4), roznice: lista.slice(0, 8).map((r) => ({ ...skrotRoznicy(r), kategoria: r.kategoria })) });
    }
    if (Y4) {
      await zastosuj(Y4, tasuj(partia, S.los));
      const k4 = kanon(await eksport(Y4));
      if (JSON.stringify(k4) === JSON.stringify(k1)) S.stat.losowa.zgodne += 1;
      else {
        S.stat.losowa.niezgodne += 1;
        const d = await kr_cicho(S, async () => sklasyfikuj(D(k1, k4), k1, k4, { tabela: S.profil },
          async () => ({ x: await Y1.v.listTrashedSnapshots(), y: await Y4.v.listTrashedSnapshots() })));
        S.stat.losowaLista.push({ krok: S.nrKroku, dostawa: X.nazwa + '>' + Y.nazwa, klasy: klasyPunktu(d), roznice: d.slice(0, 6).map(skrotRoznicy) });
      }
    }
  } finally { await zamknij(...[Y1, Y2, Y3, Y4].filter(Boolean)); }
}
// Kategorie W2s różnica po różnicy (specyfikacja 2a, 3.2), w kolejności:
// 1. K1 „karta częściowa do pfull” — różnica samej karty p (rekord karty albo jej nagrobek: karta po jednej stronie,
//    nagrobek po drugiej) albo jej wersji (to, co niesie pfull z haka H1), gdy p jest w wyścigu „Usuń pacjenta”
//    (nagrobek po jednej stronie teraz, w partii albo kiedykolwiek wcześniej, a druga strona ma kartę); różnice wpisów
//    kosza i notatek nie wchodzą do K1 (przegląd E2-PR2a);
// 2. K2 „ratunek D-21” — notatka pacjenta (albo jej nagrobek), którą X uratował scalaniem, bez jej koperty pnote w partii;
// 3. klasa z 3.6 (predykaty na parze Y1, Y2) dozwolona w W2s profilu; potem klasa W2s K1k „wpis kosza karty w wyścigu”
//    (dopisana 2026-11-03 z rodowodem — ziarno 7 #36–#51, ziarno 8 #49–#59; minimalne odtworzenie w bloku p. 4):
//    wpis kosza s|p tylko po jednej stronie, a karta p w wyścigu „Usuń pacjenta” jak w K1. Blob niesie całą listę kosza
//    (suma list, Bkz_scalStart), więc wpis zdjęty u odbiorcy przez „Przywróć” wraca z blobem nadawcy, który o
//    przywróceniu nie wie; zdarzenia niosą tylko zmiany. Tylko W2s (stan po jednej dostawie; W1 po spoczynku i W4 zielone);
// 4. „inne”.
const K1K = 'K1k wpis kosza karty w wyścigu';
const K1K_ODTWORZENIE = [ // literał minimalnego odtworzenia K1k (blok p. 4)
  'K1k wpis kosza karty w wyścigu: kosz x|X tylko blob',
  'karta częściowa do pfull: wersja X/x1 tylko blob',
  'karta częściowa do pfull: wersja X/x3 tylko blob',
];
async function kategorieW2s(Y, X, partia, e1, e2, k1, k2, profil, czytajKosz) {
  const b = encje(e2), y = encje(Y.stan), x = encje(X.stan);
  const nagrobekX = (p) => {
    const t = x.get('ptomb:' + p);
    if (t) return JSON.parse(t.val).deletedAtISO;
    return partia.filter((q) => q.kind === 'ptomb' && q.key === p).map((q) => q.atISO).sort().pop() || null;
  };
  const wyscig = (p) => {
    if (!p) return false;
    const nagrY = Y.usuniete.has(p), nagrX = X.usuniete.has(p) || !!nagrobekX(p);
    return (nagrY && x.has('karta:' + p)) || (nagrX && y.has('karta:' + p));
  };
  const ratunek = (id) => b.has('pnote:' + id) && x.has('pnote:' + id) && !x.has('pnotetomb:' + id) && !partia.some((e) => e.kind === 'pnote' && e.key === id);
  const d = await sklasyfikuj(D(k1, k2), k1, k2, { tabela: profil }, czytajKosz);
  return d.map((r) => {
    let kategoria = 'inne';
    if ((r.rodzaj === 'karta' || r.rodzaj === 'wersja' || r.rodzaj === 'ptomb') && wyscig(r.klucz.split('/')[0])) kategoria = 'karta częściowa do pfull';
    else if ((r.rodzaj === 'pnote' || r.rodzaj === 'pnotetomb') && ratunek(r.klucz)) kategoria = 'ratunek D-21';
    else if (r.klasa && r.dozwolona) kategoria = r.klasa;
    else if (r.rodzaj === 'kosz' && r.tylko && wyscig(r.klucz.split('|')[1])) kategoria = K1K;
    return { ...r, kategoria };
  });
}

// Punkt spoczynku: pełne dostawy w obie strony z hakami, aż obie kolejki są dostarczone i haki nic nie dodały (≤ 4 rundy).
async function spoczynek(S, A, B, { w2s = S.w2s !== false } = {}) {
  for (let r = 1; r <= 4; r += 1) {
    await dostawa(S, A, B, { w2s });
    await dostawa(S, B, A, { w2s });
    if (kursor(S, A, B) === A.Q.length && kursor(S, B, A) === B.Q.length) return r;
  }
  return null;
}
// W1: eksport kanoniczny A ≡ B (modulo seq i snapshotCount).
async function w1(A, B) {
  const [a, b] = [kanon(await eksport(A)), kanon(await eksport(B))];
  return JSON.stringify(a) === JSON.stringify(b) ? null : sciezki(a, b);
}
// W2r: na świeżych klonach jednej migawki — klon X' po scaleniu bloba drugiej strony ≡ klon X'' bez scalenia.
// Gdy W2r różne: wynik = ścieżki (jak dotąd) z polem roznice (D na parze X″, X′ z klasami; odczyt Kosza izolowany).
async function w2r(S, X, Y) {
  const X1 = await klon(S, X, 'r1'), X2 = await klon(S, X, 'r2');
  try {
    await X1.v.mergeSyncPayload(json(await Y.v.exportSyncPayload()));
    const [a, b] = [kanon(await eksport(X1)), kanon(await eksport(X2))];
    if (JSON.stringify(a) === JSON.stringify(b)) return null;
    const wynik = sciezki(b, a);
    wynik.roznice = await kr_cicho(S, async () => sklasyfikuj(D(b, a), b, a, { tabela: S.profil },
      async () => ({ x: await X2.v.listTrashedSnapshots(), y: await X1.v.listTrashedSnapshots() })));
    return wynik;
  } finally { await zamknij(X1, X2); }
}

// ── Izolacja NOWYCH pomiarów (specyfikacja 2a, 3.1; wzór kr_cicho krytyka) ─────────────────────────────────────────
// Pomiar dodany po 2026-11-03 (W4, W4p, „Przywróć”, klasyfikator czytający listTrashedSnapshots(), W4 w p. 5 i p. 6)
// idzie przez kr_cicho: własny deterministyczny Math.random na czas pomiaru (S.losAlt, podpięty do szpiega
// przebiegZiarna) i własne numery klonów (nazwy w atrapie są jednorazowe), licznik urządzeń przywracany. Program ziarna
// zostaje ten sam. Istniejące W2r, W2s, W3 i klon Y4 zostają BEZ izolacji (Y4 zużywa S.los, a każde załadowanie
// vilda_vault.js w nowym oknie pobiera Math.random — vilda_vault.js:7890 — więc ich izolacja zmieniłaby program).
async function kr_cicho(S, fn) {
  const nr = S.nrUrz, pop = S.losAlt;
  S.nrPomiaru = (S.nrPomiaru || 0) + 1;
  S.losAlt = rng(0xC0FFEE + (S.nrKroku || 0) * 131 + S.nrPomiaru);
  S.nrUrz = 900000 + S.nrPomiaru * 100;
  try { return await fn(); } finally { S.nrUrz = nr; S.losAlt = pop; }
}
// Stały Math.random na czas „Przywróć” w W4p (3.1): withImplementation na szpiegu ziarna (vi.spyOn na już podmienionym
// Math.random zwraca tego samego szpiega i trwale nadpisałby generator); bez szpiega — chwilowy.
async function stalyLos(fn) {
  if (vi.isMockFunction(Math.random)) return vi.mocked(Math.random).withImplementation(() => 0.5, fn);
  const spy = vi.spyOn(Math, 'random').mockImplementation(() => 0.5);
  try { return await fn(); } finally { spy.mockRestore(); }
}
// W1 z klasami: D na żywych urządzeniach (odczyt Kosza izolowany).
async function w1Klasy(S, A, B, kont) {
  const [a, b] = [kanon(await eksport(A)), kanon(await eksport(B))];
  return kr_cicho(S, async () => sklasyfikuj(D(a, b), a, b, kont,
    async () => ({ x: await A.v.listTrashedSnapshots(), y: await B.v.listTrashedSnapshots() })));
}

// ── W4: zdarzenia, a po nich pełna wymiana blobem (gwarancja etapu 2, decyzja 7; specyfikacja 2a, 3.2) ─────────────
// Dwie pary świeżych klonów z migawek tego samego punktu. PO-A: B₁ scala eksport A₁, potem A₁ scala eksport B₁ (już po
// scaleniu) — jak przyjęty PUT z ETagiem (przy 412 albo braku ETagu najpierw pobranie i scalenie, potem eksport stanu po
// scaleniu: vilda_sync.js 49:12490, 49:10211); PO-B symetrycznie. Warunki: (a) D obu par puste albo tylko klasy
// dozwolone w W4 danego kontekstu; (b) punkt stały — druga runda (ta sama kolejność) na TYCH SAMYCH klonach nie zmienia
// eksportu żadnego z nich; (c) każda encja R4n z (a) przechodzi W4p. Wynik: { ok, warianty: [...], r4n, w4p }.
// Opcje dla testów negatywnych samego W4 (klasy 3.6, negatywy): runda (domyślnie rundaPO) i dowodR4n (domyślnie w4p).
async function rundaPO(X, Y) {
  await Y.v.mergeSyncPayload(json(await X.v.exportSyncPayload()));
  await X.v.mergeSyncPayload(json(await Y.v.exportSyncPayload()));
  ustawStan(X, await eksport(X)); ustawStan(Y, await eksport(Y));
}
async function w4(S, A, B, kont, { warianty = ['PO-A', 'PO-B'], opisz = null, runda = rundaPO, dowodR4n = w4p } = {}) {
  return kr_cicho(S, async () => {
    const wynik = { ok: true, warianty: [], r4n: 0, w4p: [] };
    for (const wariant of warianty) {
      const A1 = await klon(S, A, 'w4a'), B1 = await klon(S, B, 'w4b');
      try {
        const [X, Y] = wariant === 'PO-A' ? [A1, B1] : [B1, A1];
        await runda(X, Y, 1);
        const [a, b] = [kanon(A1.stan), kanon(B1.stan)];
        await runda(X, Y, 2);
        const punktStaly = JSON.stringify(kanon(A1.stan)) === JSON.stringify(a) && JSON.stringify(kanon(B1.stan)) === JSON.stringify(b);
        const d = await sklasyfikuj(D(a, b), a, b, kont, async () => ({ x: await A1.v.listTrashedSnapshots(), y: await B1.v.listTrashedSnapshots() }));
        const w = { wariant, punktStaly, roznice: d.map(skrotRoznicy), w4p: [] };
        for (const r of d.filter((q) => q.klasa === 'R4n')) {
          const [sid, pid] = r.klucz.split('|');
          const p = await dowodR4n(S, A1, B1, sid, pid);
          w.w4p.push(p);
          wynik.w4p.push({ wariant, klucz: r.klucz, ...p });
          wynik.r4n += 1;
        }
        w.ok = punktStaly && d.every((r) => r.dozwolona) && w.w4p.every((p) => p.ok);
        if (opisz) w.opis = await opisz(A1, B1);
        if (!w.ok) wynik.ok = false;
        wynik.warianty.push(w);
      } finally { await zamknij(A1, B1); }
    }
    return wynik;
  });
}
// W4p (dowód normalizacji R4n): na świeżych klonach obu stron widok Kosza (listTrashedSnapshots, także pinned) równy;
// „Przywróć” tej wersji na obu przy stałym Math.random i tym samym Date; eksporty kanoniczne obu klonów równe ŚCIŚLE,
// a Kosz żadnego nie zawiera już tej wersji. (Scalanie świadomie nie uzgadnia postaci gwiazdki w treści wpisu kosza:
// vilda_vault.js:2093, Bpk_nowszaTrescKosza 1029–1034.)
async function w4p(S, X1, Y1, sid, pid) {
  const X2 = await klon(S, X1, 'w4p'), Y2 = await klon(S, Y1, 'w4p');
  try {
    const [lx, ly] = [await X2.v.listTrashedSnapshots(), await Y2.v.listTrashedSnapshots()];
    const widokRowny = JSON.stringify(widokKosza(lx)) === JSON.stringify(widokKosza(ly));
    await stalyLos(async () => { await X2.v.restoreTrashedSnapshot(pid, sid); await Y2.v.restoreTrashedSnapshot(pid, sid); });
    const [kx, ky] = [kanon(await eksport(X2)), kanon(await eksport(Y2))];
    const zniknal = ![...(await X2.v.listTrashedSnapshots()), ...(await Y2.v.listTrashedSnapshots())].some((e) => e.snapshotId === sid);
    const rowne = JSON.stringify(kx) === JSON.stringify(ky);
    return { ok: widokRowny && rowne && zniknal, widokRowny, rowne, zniknal, roznice: rowne ? [] : D(kx, ky).map(skrotRoznicy) };
  } finally { await zamknij(X2, Y2); }
}

// ── Bliźniaki z bazą (blok deterministyczny) ─────────────────────────────────────────────────────────────────────────
// Baza na A: karty P (3 wersje) i R (2 wersje), notatka pacjenta, notatka biblioteki, lista, preferencja, klucz dostępu
// i jego nagrobek; B — bliźniak A po bazie (ta sama wiedza). Chwile co 1 s.
async function zmienMeta(U, zmiana) {
  const uid = U.d.konto.userId;
  const m = await U.d.adapter.getUserMeta(uid);
  await U.d.adapter.putUserMeta(uid, zmiana(m));
}
const iso = () => new Date(teraz).toISOString();
async function baza(S) {
  const A = await urzadzenie(S, 'A');
  const v = A.v;
  krok(); const P = (await A.d.zapiszKarte(1)).patientId;
  krok(); await A.d.zapiszKarte(1, { wzrost: 121, zapis: { patientId: P, forceNewSnapshot: true } });
  krok(); await A.d.zapiszKarte(1, { wzrost: 122, zapis: { patientId: P, forceNewSnapshot: true } });
  krok(); const R = (await A.d.zapiszKarte(2)).patientId;
  krok(); await A.d.zapiszKarte(2, { wzrost: 111, zapis: { patientId: R, forceNewSnapshot: true } });
  krok(); const nP = (await v.savePatientNote({ patientId: P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść', category: 'inne' })).id;
  krok(); const L = (await v.saveNote({ title: 'Fikcyjny szablon', body: 'Fikcyjna treść' })).id;
  krok(); const X = (await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [P] })).id;
  krok();
  await zmienMeta(A, (m) => ({
    ...m,
    userPreferences: { ...(m.userPreferences || {}), fikcyjnaPreferencja: { value: 'Fikcyjna', updatedAtISO: iso() } },
    passkeys: [...(m.passkeys || []), { credentialId: 'fikcyjny-klucz-1', deviceLabel: 'Fikcyjne urządzenie', createdAtISO: iso(), roaming: false }],
  }));
  krok();
  ustawStan(A, await eksport(A));
  const B = await urzadzenie(S, 'B', A);
  return { A, B, P, R, nP, L, X };
}

// Stan Y po zastosowaniu partii zdarzeń (kolejno) na świeżym klonie Y i stan po scaleniu bloba X na drugim klonie.
async function stanZdarzen(S, Y, partie) {
  const K = await klon(S, Y, 'z');
  try { for (const p of partie) await zastosuj(K, p); return kanon(await eksport(K)); } finally { await zamknij(K); }
}
async function stanBlobu(S, Y, X) {
  const K = await klon(S, Y, 'b');
  try { await K.v.mergeSyncPayload(json(await X.v.exportSyncPayload())); return kanon(await eksport(K)); } finally { await zamknij(K); }
}
// W2 dla oczekujących zdarzeń X→Y (świeże klony jednej migawki Y): null albo różniące się ścieżki.
async function w2(S, X, Y) {
  const zd = await stanZdarzen(S, Y, [X.Q.slice(kursor(S, X, Y))]);
  const bl = await stanBlobu(S, Y, X);
  return JSON.stringify(zd) === JSON.stringify(bl) ? null : sciezki(bl, zd);
}
const karty = (U) => (U.stan.patients || []).map((p) => p.patientId).sort();
const wersjeKarty = (U, pid) => ((U.stan.patients || []).find((p) => p.patientId === pid) || { snapshots: [] }).snapshots.map((s) => s.snapshotId).sort();
const nagrobki = (U) => (U.stan.tombstones || []).map((t) => t.patientId).sort();
const raport = (S, opis) => `${opis}\n  ziarno ${S.ziarno}${S.nrKroku ? `, krok ${S.nrKroku}` : ''}\n  ostatnie operacje:\n    ${S.dziennik.slice(-10).join('\n    ')}`;
// Spoczynek + W1 + W2r (obie strony) jako asercje bloku deterministycznego.
async function spoczynekZgodny(S, A, B, { odB = false } = {}) {
  const r = odB ? await spoczynek(S, B, A) : await spoczynek(S, A, B);
  expect(r, raport(S, 'punkt spoczynku w ≤ 4 rundach')).not.toBe(null);
  expect(await w1(A, B), raport(S, 'W1')).toBe(null);
  expect(await w2r(S, A, B), raport(S, 'W2r (A)')).toBe(null);
  expect(await w2r(S, B, A), raport(S, 'W2r (B)')).toBe(null);
  expect(S.stat.w3Bledy, 'W3: applyEncryptedDelta ≡ applyEncryptedEvent').toEqual([]);
  await w4Zgodne(S, A, B);
  return r;
}
// W4 na końcu scenariusza bloku deterministycznego (p. 1–4): obie pary, klasy dozwolone w W4 (tylko R4n z W4p).
async function w4Zgodne(S, A, B) {
  const w = await w4(S, A, B, { tabela: 'W4' });
  expect(w.ok, raport(S, 'W4 (zdarzenia, potem pełna wymiana blobem)') + '\n' + JSON.stringify(w.warianty, null, 1)).toBe(true);
  return w;
}

// ── Opisy do literałów (etykiety encji zamiast identyfikatorów) ─────────────────────────────────────────────────────
const etykieta = (n, id) => (n && n.get(id)) || (id ? '#' + String(id).slice(0, 4) : String(id));
const kluczEtykiet = (n, k) => String(k).split(/([/|])/).map((c) => (c === '/' || c === '|' ? c : etykieta(n, c))).join('');
// Lista różnic D (posortowana): „rodzaj klucz: ścieżki [klasa]” albo „rodzaj klucz: tylko <strona>”.
const opisD = (d, n, nx, ny) => d.map((r) => `${r.rodzaj} ${kluczEtykiet(n, r.klucz)}: ${r.tylko ? 'tylko ' + (r.tylko === 'x' ? nx : ny) : r.sciezki.join(', ')}${r.klasa ? ` [${r.klasa}]` : ''}`).sort();
function etykietyP1e(u) {
  const n = new Map([[u.X, 'X'], [u.Y, 'Y'], [u.Z, 'Z'], [u.x1, 'x1'], [u.x, 'x'], [u.x3, 'x3']]);
  for (const p of u.A.stan.patients || []) for (const q of p.snapshots || []) if (!n.has(q.snapshotId)) n.set(q.snapshotId, p.patientId === u.Y ? 'y' : 'z');
  return n;
}
// Stan kliniczny urządzenia (literały p. 6): karty z wizytami (masa, gwiazdka), Kosz tak, jak go zwraca
// listTrashedSnapshots() (gwiazdka: pinned; wpisy kart usuniętych okno Kosza ukrywa — vilda_kosz_zapisow.js:226),
// notatki pacjentów (treść).
async function kliniczny(U, n) {
  const st = await eksport(U);
  const kg = (p) => (p && p.user ? p.user.weight : '?');
  const karty = (st.patients || []).map((p) => `${etykieta(n, p.patientId)}[${(p.snapshots || []).slice().sort((x, y) => ((x.savedAtISO || '') < (y.savedAtISO || '') ? -1 : 1)).map((q) => `${etykieta(n, q.snapshotId)}:${kg(q.payload)}${q.payload && q.payload._pinned ? '*' : ''}`).join(' ')}]`).sort();
  const kosz = (await U.v.listTrashedSnapshots()).map((e) => `${etykieta(n, e.snapshotId)}@${etykieta(n, e.patientId)}:${kg(e.payload)}${e.pinned ? '*' : ''}${e.patientExists ? '' : ' (ukryty)'}`).sort();
  const notatki = (st.patientNotes || []).map((x) => `${etykieta(n, x.id)}: ${x.body}`).sort();
  return `karty ${karty.join(' ') || '-'} | Kosz ${kosz.join(' ') || '-'} | notatki ${notatki.join(' ') || '-'}`;
}
// Świat samych blobów: rundy PO-A (Y scala eksport X, X scala eksport Y), aż runda nic nie zmienia (≤ 4 rundy ze zmianą).
async function spoczynekBlobow(...urz) {
  for (let r = 1; r <= 5; r += 1) {
    const przed = await Promise.all(urz.map(async (U) => JSON.stringify(kanon(await eksport(U)))));
    for (let i = 0; i < urz.length; i += 1) await rundaPO(urz[i], urz[(i + 1) % urz.length]);
    const po = urz.map((U) => JSON.stringify(kanon(U.stan)));
    if (po.every((x, i) => x === przed[i])) return r;
  }
  return null;
}
// W4 dla trzech urządzeń (p. 6): świeże klony; rundy PO-A kolejno na parach (A, B), (B, C), (C, A), aż żaden eksport
// się nie zmienia (≤ 3 rundy ze zmianą); warunek: D każdej pary puste albo z klasami dozwolonymi w p. 6 (R4n z W4p).
async function w4Trzy(S, urz, n, { dowodR4n = w4p } = {}) {
  return kr_cicho(S, async () => {
    const K = [];
    for (const U of urz) K.push(await klon(S, U, 'w4t'));
    try {
      let rund = 0, stabilny = false;
      while (!stabilny && rund < 4) {
        rund += 1;
        const przed = K.map((k) => JSON.stringify(kanon(k.stan)));
        for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) await rundaPO(K[i], K[j]);
        stabilny = K.every((k, i) => JSON.stringify(kanon(k.stan)) === przed[i]);
      }
      const pary = [];
      let ok = stabilny && rund <= 4;
      for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
        const [a, b] = [kanon(K[i].stan), kanon(K[j].stan)];
        const d = await sklasyfikuj(D(a, b), a, b, { tabela: 'p6' }, async () => ({ x: await K[i].v.listTrashedSnapshots(), y: await K[j].v.listTrashedSnapshots() }));
        const w4pp = [];
        for (const r of d.filter((q) => q.klasa === 'R4n')) { const [sid, pid] = r.klucz.split('|'); w4pp.push(await dowodR4n(S, K[i], K[j], sid, pid)); }
        if (!d.every((r) => r.dozwolona) || !w4pp.every((x) => x.ok)) ok = false;
        pary.push({ para: `${urz[i].nazwa}${urz[j].nazwa}`, roznice: opisD(d, n, urz[i].nazwa, urz[j].nazwa), w4p: w4pp });
      }
      const opis = {};
      for (let i = 0; i < K.length; i += 1) opis[urz[i].nazwa] = await kliniczny(K[i], n);
      return { ok, rund, stabilny, pary, opis };
    } finally { await zamknij(...K); }
  });
}

// ── Blok deterministyczny, p. 1: każdy z 14 builderów — para „mutacja na A → zdarzenie → B” ≡ blob ─────────────────────
// Mutacja jednej encji na A (wyrocznia emisji; pfull — porcje pełnej karty nowej karty, jak z haka H1), koperty
// z kolejki Q_A (szyfrogram z chwili emisji) stosowane przez applyEncryptedEvent na świeżym klonie B; wzorzec: klon B po
// mergeSyncPayload(exportSyncPayload(A)). Także zdarzenie dwukrotnie i w obu kolejnościach z sąsiednim (następny rodzaj).
const nowe = async (U, fn) => { const od = U.Q.length; await fn(); return U.Q.slice(od); };
const MUT = {
  snap: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'nowa wersja P', () => b.A.d.zapiszKarte(1, { wzrost: 130, zapis: { patientId: b.P, forceNewSnapshot: true } }))),
  pfull: (S, b) => nowe(b.A, async () => {
    const N = (await b.A.d.zapiszKarte(5)).patientId;
    krok(); await b.A.d.zapiszKarte(5, { wzrost: 131, zapis: { patientId: N, forceNewSnapshot: true } });
    krok(); await b.A.d.zapiszKarte(5, { wzrost: 132, zapis: { patientId: N, forceNewSnapshot: true } });
    ustawStan(b.A, await eksport(b.A));
    for (const k of await b.A.ev.buildPatientFullEvents(N, null, { setId: 'fikcyjny-zestaw' })) await doKolejki(S, b.A, k);
  }),
  ptomb: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'usuń pacjenta R', () => b.A.v.removePatient(b.R))),
  stomb: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'kosz najstarszej wersji P', () => b.A.v.moveSnapshotToTrash(b.P, wersjeP(b)[0], { odepnij: true }))),
  pnote: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'nowa notatka P', () => b.A.v.savePatientNote({ patientId: b.P, title: 'Fikcyjna notatka 2', body: 'Fikcyjna', category: 'inne' }))),
  pnotetomb: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'usuń notatkę P', () => b.A.v.removePatientNote(b.nP))),
  note: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'nowa notatka biblioteki', () => b.A.v.saveNote({ title: 'Fikcyjny szablon 2', body: 'Fikcyjna' }))),
  notetomb: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'usuń notatkę biblioteki', () => b.A.v.removeNote(b.L))),
  plist: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'nowa lista', () => b.A.v.savePatientList({ name: 'Fikcyjna lista 2', memberIds: [b.R] }))),
  plisttomb: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'usuń listę', () => b.A.v.deletePatientList(b.X))),
  pref: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'preferencja', () => zmienMeta(b.A, (m) => ({ ...m, userPreferences: { ...m.userPreferences, fikcyjnaPreferencja2: { value: 'Fikcyjna 2', updatedAtISO: iso() } } })))),
  pk: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'klucz dostępu', () => zmienMeta(b.A, (m) => ({ ...m, passkeys: [...m.passkeys, { credentialId: 'fikcyjny-klucz-2', deviceLabel: 'Fikcyjne urządzenie 2', createdAtISO: iso(), roaming: true }] })))),
  pktomb: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'usuń klucz dostępu', () => zmienMeta(b.A, (m) => ({
    ...m, passkeys: m.passkeys.filter((x) => x.credentialId !== 'fikcyjny-klucz-1'),
    passkeyTombstones: [...(m.passkeyTombstones || []), { credentialId: 'fikcyjny-klucz-1', deletedAtISO: iso() }],
  })))),
  cred: (S, b) => nowe(b.A, () => zmianaHasla(S, b.A)),
};
const wersjeP = (b) => [...(b.A.stan.patients.find((p) => p.patientId === b.P).snapshots)].sort((x, y) => (x.savedAtISO < y.savedAtISO ? -1 : 1)).map((s) => s.snapshotId);
async function zmianaHasla(S, U) {
  S.nrHasla += 1;
  const nowe = `Fikcyjne#Haslo!${2026 + S.nrHasla}xy`;
  const stare = haslo(S, U);
  U.noweHaslo = nowe;
  await mutacja(S, U, 'zmiana hasła', () => U.v.changePassword(stare, nowe));
  U.d.konto.haslo = nowe;
}

describe('A ≡ B, blok deterministyczny p. 1: każdy z 14 builderów (mutacja → zdarzenie → B) ≡ blob', () => {
  d1();
  for (const [i, r] of RODZAJE.entries()) {
    const s = RODZAJE[(i + 1) % RODZAJE.length];
    it(`${r}: koperty [${r}] ≡ blob, dwukrotnie ≡ blob, z sąsiednim ${s} w obu kolejnościach ≡ blob`, async () => {
      const S = swiat(100 + i);
      const b = await baza(S);
      const przed = kanon(b.B.stan);
      krok(); const e1 = await MUT[r](S, b);
      expect(e1.map((e) => e.kind), 'koperty mutacji').toEqual(r === 'pfull' ? ['pfull'] : [r]);
      const blob1 = await stanBlobu(S, b.B, b.A);
      expect(blob1, 'mutacja zmienia stan odbiorcy').not.toEqual(przed);
      expect(await stanZdarzen(S, b.B, [e1]), 'zdarzenie ≡ blob').toEqual(blob1);
      expect(await stanZdarzen(S, b.B, [e1, e1]), 'zdarzenie dwukrotnie ≡ blob').toEqual(blob1);
      krok(); const e2 = await MUT[s](S, b);
      expect(e2.map((e) => e.kind), 'koperty sąsiada').toEqual(s === 'pfull' ? ['pfull'] : [s]);
      const blob2 = await stanBlobu(S, b.B, b.A);
      expect(await stanZdarzen(S, b.B, [e1, e2]), `${r}, potem ${s} ≡ blob`).toEqual(blob2);
      expect(await stanZdarzen(S, b.B, [e2, e1]), `${s}, potem ${r} ≡ blob`).toEqual(blob2);
      // W4: odbiorca po zdarzeniach (klon B z kopertami e1, e2), potem pełna wymiana blobem z A.
      const Bz = await klon(S, b.B, 'zd');
      try { await zastosuj(Bz, [...e1, ...e2]); ustawStan(Bz, await eksport(Bz)); await w4Zgodne(S, b.A, Bz); } finally { await zamknij(Bz); }
    }, 60_000);
  }
});

// ── p. 2: scenariusze stomb (weryfikacja 2026-10-29: P1, P1b, P1c, P1d, P1e, znika; retencja; odbiorca bez karty) ─────
// Bliźniaki A (nadawca) i B (odbiorca ze starym stanem). Kroki A i B przez wyrocznię emisji (także „Scal pacjentów”:
// snap wersji przeniesionych i głów scalenia pod kartą celu, potem ptomb kart źródłowych). Warunki: W2 w pierwszej pełnej
// dostawie A→B (zdarzenia A na świeżym klonie B ≡ blob A na drugim klonie), potem punkt spoczynku, W1, W2r, W3.
async function trzyKarty(S) {
  const A = await urzadzenie(S, 'A');
  krok(); const x1 = await A.d.zapiszKarte(1, { wzrost: 120, masa: 20 });
  const X = x1.patientId;
  krok(); const x = await A.d.zapiszKarte(1, { wzrost: 125, masa: 23, zapis: { patientId: X, forceNewSnapshot: true } });
  krok(); const x3 = await A.d.zapiszKarte(1, { wzrost: 130, masa: 25, zapis: { patientId: X, forceNewSnapshot: true } });
  krok(); const Y = (await A.d.zapiszKarte(2, { wzrost: 110, masa: 18 })).patientId;
  krok(); const Z = (await A.d.zapiszKarte(3, { wzrost: 111, masa: 19 })).patientId;
  krok(); ustawStan(A, await eksport(A));
  const B = await urzadzenie(S, 'B', A);
  return { S, A, B, X, Y, Z, x1: x1.snapshotId, x: x.snapshotId, x3: x3.snapshotId };
}
async function jednaWersja(S) {
  const A = await urzadzenie(S, 'A');
  krok(); const x = await A.d.zapiszKarte(1, { wzrost: 125, masa: 23 });
  krok(); const Z = (await A.d.zapiszKarte(3, { wzrost: 111, masa: 19 })).patientId;
  krok(); ustawStan(A, await eksport(A));
  const B = await urzadzenie(S, 'B', A);
  return { S, A, B, X: x.patientId, Z, x: x.snapshotId };
}
const gdzie = (U, sid) => (U.stan.patients || []).find((p) => (p.snapshots || []).some((s) => s.snapshotId === sid));
async function scal(u, U, z, na) { krok(60e3); await mutacja(u.S, U, 'Scal pacjentów', () => U.v.mergePatients(z, na)); }
async function popraw(u, U, sid, kg) {
  krok(60e3);
  const p = gdzie(U, sid);
  const s = (await U.v.getPatient(p.patientId)).snapshots.find((q) => q.snapshotId === sid);
  await mutacja(u.S, U, `poprawka ${kg} kg`, () => U.v.updateSnapshotPayload(p.patientId, sid, { ...s.payload, user: { ...s.payload.user, weight: kg } }, { preserveSavedAt: true }));
}
async function doKosza(u, U, sid) { krok(60e3); await mutacja(u.S, U, 'kosz', () => U.v.moveSnapshotToTrash(gdzie(U, sid).patientId, sid, { odepnij: true })); }
const SCEN_STOMB = {
  P1: { przygotuj: trzyKarty, kroki: async (u) => { await scal(u, u.A, u.X, u.Y); await scal(u, u.A, u.Y, u.Z); await doKosza(u, u.A, u.x); } },
  P1b: { przygotuj: trzyKarty, kroki: async (u) => { await scal(u, u.A, u.X, u.Y); await scal(u, u.A, u.Y, u.Z); await popraw(u, u.A, u.x, 74); await doKosza(u, u.A, u.x); } },
  P1c: { przygotuj: jednaWersja, kroki: async (u) => { await scal(u, u.A, u.X, u.Z); await popraw(u, u.A, u.x, 74); await doKosza(u, u.A, u.x); } },
  P1d: { przygotuj: jednaWersja, kroki: async (u) => { await scal(u, u.A, u.X, u.Z); await popraw(u, u.A, u.x, 74); await doKosza(u, u.A, u.x); }, odB: true },
  P1e: { przygotuj: trzyKarty, kroki: async (u) => { await scal(u, u.A, u.X, u.Y); await scal(u, u.A, u.Y, u.Z); await doKosza(u, u.A, u.x); await popraw(u, u.B, u.x, 55); } },
  znika: { przygotuj: jednaWersja, kroki: async (u) => {
    await scal(u, u.A, u.X, u.Z); await doKosza(u, u.A, u.x);
    // pozostawiony lokalny nagrobek istniejącej karty X na B (przerwane wcześniejsze scalenie)
    await u.B.d.adapter.putTombstoneForUser(u.B.d.konto.userId, { patientId: u.X, deletedAtISO: u.A.stan.tombstones.find((t) => t.patientId === u.X).deletedAtISO });
    ustawStan(u.B, await eksport(u.B));
  } },
  retencja: { przygotuj: trzyKarty, kroki: async (u) => {
    krok(60e3);
    await mutacja(u.S, u.A, 'retencja X', () => u.A.v.pruneSnapshotsForPatient(u.X, { recentHours: 0 }));
    expect(u.A.stan.snapshotTombstones.filter((e) => e.powod === 'retencja').length, 'retencja przycina').toBeGreaterThan(0);
  } },
};
describe('A ≡ B, blok deterministyczny p. 2: scenariusze stomb', () => {
  d1();
  for (const [nazwa, sc] of Object.entries(SCEN_STOMB).filter(([n]) => n !== 'P1e')) {
    it(`${nazwa}: W2 w pierwszej pełnej dostawie A→B, spoczynek${sc.odB ? ' (najpierw B→A)' : ''}, W1, W2r, W3, W4`, async () => {
      const S = swiat(200 + Object.keys(SCEN_STOMB).indexOf(nazwa));
      const u = await sc.przygotuj(S);
      await sc.kroki(u);
      expect(u.A.Q.some((e) => e.kind === 'stomb'), 'nadawca ma zdarzenie stomb').toBe(true);
      expect(await w2(S, u.A, u.B), raport(S, 'W2 A→B')).toBe(null);
      await spoczynekZgodny(S, u.A, u.B, { odB: !!sc.odB });
    }, 60_000);
  }
  // P1e — dokładna charakterystyka (specyfikacja 2a, 3.4): strumień zdarzeń pokazuje B stan pośredni A (x pod Z, rev 2),
  // reguła właściciela wersji wspólnej dwóm kartom („najpierw rev”) kładzie x pod Z; A ma x tylko w koszu, więc snap(X/x)
  // od B zakłada na A z powrotem kartę X. Pełna wymiana blobem (W4) daje x pod Z na obu — inaczej niż świat samych blobów.
  it('P1e — ZMIANA ZACHOWANIA — do akceptacji właściciela przed E2-PR6: (a) W2 w 1. dostawie, (b) spoczynek, (c) W4: x pod Z, (d) same bloby: X[x], (e) (c) ≠ (d)', async () => {
    const swiatP1e = async () => {
      const S = swiat(204);
      const los = rng(0x9e1e);
      vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || los)());
      const u = await trzyKarty(S);
      u.n = etykietyP1e(u);
      await SCEN_STOMB.P1e.kroki(u);
      return { S, u };
    };
    const { S, u } = await swiatP1e();
    // (a) W2 w pierwszej pełnej dostawie A→B: stan klonu B po zdarzeniach wobec stanu klonu B po blobie A
    const zd = await stanZdarzen(S, u.B, [u.A.Q.slice(kursor(S, u.A, u.B))]);
    const bl = await stanBlobu(S, u.B, u.A);
    expect(opisD(D(bl, zd), u.n, 'blob', 'zdarzenia'), '(a) W2 A→B: blob A wobec zdarzeń A na klonie B').toEqual([
      'karta X: tylko blob',
      'wersja X/x: tylko blob',
      'wersja Z/x: tylko zdarzenia',
    ]);
    // (b) po spoczynku: D(A, B)
    expect(await spoczynek(S, u.A, u.B), 'spoczynek w ≤ 4 rundach').not.toBe(null);
    const [a, b] = [kanon(await eksport(u.A)), kanon(await eksport(u.B))];
    expect(opisD(await sklasyfikuj(D(a, b), a, b, { tabela: 'p6' }), u.n, 'A', 'B'), '(b) D(A, B) po spoczynku zdarzeń: karta X (z x) tylko na A, x pod Z tylko na B').toEqual([
      'karta X: tylko A',
      'wersja X/x: tylko A',
      'wersja Z/x: tylko B',
    ]);
    // (c) W4 (PO-A i PO-B): na obu Z zawiera x (55 kg, rev 2), karty X nie ma
    const gdzieX = async (U) => { const k = kanon(await eksport(U)); const z = (k.patients || []).find((p) => p.patientId === u.Z); const sx = z && z.snapshots.find((q) => q.snapshotId === u.x); return { X: kartaW(k, u.X), Zx: sx ? { kg: sx.payload.user.weight, rev: sx.rev } : null }; };
    const w = await w4(S, u.A, u.B, { tabela: 'W4' }, { opisz: async (A1, B1) => ({ A: await gdzieX(A1), B: await gdzieX(B1) }) });
    expect(w.ok, '(c) W4: zgodność po pełnej wymianie\n' + JSON.stringify(w.warianty, null, 1)).toBe(true);
    const po = { X: false, Zx: { kg: 55, rev: 2 } };
    expect(w.warianty.map((x) => [x.wariant, x.opis]), '(c) W4: x (55 kg, rev 2) pod Z na obu, bez karty X').toEqual([['PO-A', { A: po, B: po }], ['PO-B', { A: po, B: po }]]);
    // (d) świat samych blobów: te same kroki, wymiana blobami w obie strony
    await sprzatnijUrzadzenia(); vi.restoreAllMocks(); ustaw(START);
    const s2 = await swiatP1e();
    expect(await spoczynekBlobow(s2.u.A, s2.u.B), 'spoczynek blobów').not.toBe(null);
    const d = { A: await gdzieX(s2.u.A), B: await gdzieX(s2.u.B) };
    const xX = async (U) => { const k = kanon(await eksport(U)); const p = (k.patients || []).find((q) => q.patientId === u.X); return p ? p.snapshots.map((q) => `${etykieta(u.n, q.snapshotId)}:${q.payload.user.weight}`) : null; };
    expect({ ...d, xA: await xX(s2.u.A), xB: await xX(s2.u.B) }, '(d) same bloby: X[x 55 kg] na obu, Z bez x').toEqual({ A: { X: true, Zx: null }, B: { X: true, Zx: null }, xA: ['x:55'], xB: ['x:55'] });
    // (e) zmiana zachowania wobec wymiany samymi blobami
    expect({ A: po, B: po }, '(e) ZMIANA ZACHOWANIA wobec wymiany samymi blobami: po W4 x jest pod Z, a w świecie samych blobów karta X wraca z x — do akceptacji właściciela przed E2-PR6').not.toEqual({ A: d.A, B: d.B });
  }, 120_000);
  it('stomb na odbiorcy bez karty (K10): karta bez wizyt nie powstaje, nagrobek odbiorcy zostaje; po haku H1 pełna karta wszędzie', async () => {
    const S = swiat(230);
    const u = await trzyKarty(S);
    krok(60e3); await mutacja(S, u.B, 'usuń pacjenta X', () => u.B.v.removePatient(u.X));
    await doKosza(u, u.A, u.x1);
    expect(u.A.Q.map((e) => e.kind), 'A: jedno zdarzenie kosza').toEqual(['stomb']);
    await dostawa(S, u.A, u.B);
    expect({ karty: karty(u.B).includes(u.X), nagrobek: nagrobki(u.B).includes(u.X), kosz: (u.B.stan.snapshotTombstones || []).map((e) => e.snapshotId) },
      'B po stomb z kartą bez wizyt').toEqual({ karty: false, nagrobek: true, kosz: [u.x1] });
    await spoczynekZgodny(S, u.A, u.B, { odB: true });
    expect({ karty: karty(u.A).includes(u.X), wersje: wersjeKarty(u.A, u.X) }, 'po spoczynku: karta X z pełną historią bez kosza')
      .toEqual({ karty: true, wersje: [u.x, u.x3].sort() });
    expect(S.stat.h1, 'hak H1 (nagrobek B przegrywa z koszem A)').toBeGreaterThan(0);
  }, 60_000);
});

// ── p. 3: D-5 — kosz podnosi lastSavedAtISO; późniejszy nagrobek karty z chwilą pomiędzy zapisem a koszem ──────────────
describe('A ≡ B, blok deterministyczny p. 3: D-5 (stomb z kartą, wariant 11.2)', () => {
  d1();
  it('nagrobek z chwilą pomiędzy: odbiorca zdarzeń ma tyle kart co źródło i odbiorca bloba; spoczynek, W1', async () => {
    const S = swiat(300);
    const A = await urzadzenie(S, 'A');
    krok(); const P = (await A.d.zapiszKarte(1)).patientId;
    krok(); const v2 = (await A.d.zapiszKarte(1, { wzrost: 125, zapis: { patientId: P, forceNewSnapshot: true } })).snapshotId;
    krok(); ustawStan(A, await eksport(A));
    const B = await urzadzenie(S, 'B', A);
    const D = await urzadzenie(S, 'D', A);
    krok(60e3); await mutacja(S, D, 'usuń pacjenta P', () => D.v.removePatient(P));
    const ptomb = D.Q.find((e) => e.kind === 'ptomb');
    krok(60e3); await mutacja(S, A, 'kosz v1', () => A.v.moveSnapshotToTrash(P, wersjeKarty(A, P).find((s) => s !== v2), { odepnij: true }));
    expect(A.Q.map((e) => e.kind)).toEqual(['stomb']);
    expect(Date.parse(ptomb.atISO) > START && ptomb.atISO < A.stan.patients[0].lastSavedAtISO, 'nagrobek między zapisem a koszem').toBe(true);
    expect(await w2(S, A, B), 'W2 A→B').toBe(null);
    // odbiorca bloba: klon B scala blob A, potem nagrobek D
    const C = await klon(S, B, 'blob');
    await C.v.mergeSyncPayload(json(await A.v.exportSyncPayload()));
    await zastosuj(C, [ptomb]); ustawStan(C, await eksport(C));
    await dostawa(S, A, B);
    await dostawa(S, D, B); await dostawa(S, D, A);
    expect({ A: karty(A), B: karty(B), blob: karty(C) }).toEqual({ A: [P], B: [P], blob: [P] });
    await zamknij(C);
    await spoczynekZgodny(S, A, B);
  }, 60_000);
});

// ── p. 4: nagrobki pacjenta u odbiorcy (starszy i nowszy niż nowa wersja nadawcy) ─────────────────────────────────────
describe('A ≡ B, blok deterministyczny p. 4: nagrobek pacjenta u odbiorcy', () => {
  d1();
  it('starszy niż nowa wersja A: zdarzenie daje kartę częściową (W2s K1), hak H1 dowozi pełną historię; W1', async () => {
    const S = swiat(400);
    const u = await trzyKarty(S);
    krok(60e3); await mutacja(S, u.B, 'usuń pacjenta X', () => u.B.v.removePatient(u.X));
    krok(60e3);
    const { koperty } = await mutacja(S, u.A, 'nowa wersja X', () => u.A.d.zapiszKarte(1, { wzrost: 135, masa: 27, zapis: { patientId: u.X, forceNewSnapshot: true } }));
    const nowa = koperty[0].event.key.split('/')[1];
    await dostawa(S, u.A, u.B);
    expect({ wersje: wersjeKarty(u.B, u.X), W2s: S.stat.w2s.kategorie }, 'B po snap: karta tylko z nową wersją (charakterystyka K1)')
      .toEqual({ wersje: [nowa], W2s: { 'karta częściowa do pfull': 1 } });
    await spoczynekZgodny(S, u.A, u.B, { odB: true });
    expect(wersjeKarty(u.B, u.X), 'pełna historia przez H1').toEqual([u.x1, u.x, u.x3, nowa].sort());
    expect(S.stat.h1).toBe(1);
  }, 60_000);
  // Klasa W2s K1k (rodowód: ziarno 7 #36–#51 i ziarno 8 #49–#59 profilu podstawowego): A daje do kosza x, kosz dochodzi
  // do B; B „Przywróć” x (wpis zdjęty lokalnie), potem B „Usuń pacjenta” X; A bez wiedzy dopisuje wizytę X. W pełnej
  // dostawie A→B blob A niesie całą listę kosza z x (A nie wie o przywróceniu), a zdarzenia A — tylko nową wizytę:
  // wpis kosza x tylko po stronie bloba, karta X w wyścigu „Usuń pacjenta”. Po spoczynku W1, W2r i W4 zielone.
  it('klasa W2s K1k (wpis kosza karty w wyścigu „Usuń pacjenta”): minimalne odtworzenie; spoczynek, W1, W2r, W4', async () => {
    const S = swiat(402);
    const u = await trzyKarty(S);
    const n = etykietyP1e(u);
    await doKosza(u, u.A, u.x);
    await dostawa(S, u.A, u.B);
    krok(60e3); await mutacja(S, u.B, 'przywróć x', () => u.B.v.restoreTrashedSnapshot(u.X, u.x));
    krok(60e3); await mutacja(S, u.B, 'usuń pacjenta X', () => u.B.v.removePatient(u.X));
    krok(60e3);
    const { koperty } = await mutacja(S, u.A, 'nowa wersja X', () => u.A.d.zapiszKarte(1, { wzrost: 135, masa: 27, zapis: { patientId: u.X, forceNewSnapshot: true } }));
    n.set(koperty[0].event.key.split('/')[1], 'nowa');
    const od = S.stat.w2sLista.length;
    await dostawa(S, u.A, u.B);
    const p = S.stat.w2sLista.slice(od).find((x) => x.dostawa === 'A>B');
    const opis = p ? p.roznice.map((r) => `${r.kategoria}: ${r.rodzaj} ${kluczEtykiet(n, r.klucz)}${r.tylko ? ' tylko ' + (r.tylko === 'x' ? 'zdarzenia' : 'blob') : ''}`).sort() : null;
    expect(opis, 'W2s A→B: kategorie różnic (bez „inne”)').toEqual(K1K_ODTWORZENIE);
    await spoczynekZgodny(S, u.A, u.B, { odB: true });
  }, 60_000);
  it('nowszy niż nowa wersja A: karta nieobecna u B, po spoczynku nieobecna wszędzie (wiersze nadawcy zostają w Q_A)', async () => {
    const S = swiat(401);
    const u = await trzyKarty(S);
    krok(60e3); await mutacja(S, u.A, 'nowa wersja X', () => u.A.d.zapiszKarte(1, { wzrost: 135, masa: 27, zapis: { patientId: u.X, forceNewSnapshot: true } }));
    krok(60e3); await mutacja(S, u.B, 'usuń pacjenta X', () => u.B.v.removePatient(u.X));
    await dostawa(S, u.A, u.B);
    expect({ karta: karty(u.B).includes(u.X), nagrobek: nagrobki(u.B).includes(u.X) }, 'B po snap starszym niż nagrobek').toEqual({ karta: false, nagrobek: true });
    await spoczynekZgodny(S, u.A, u.B);
    expect({ A: karty(u.A).includes(u.X), B: karty(u.B).includes(u.X), nagrA: nagrobki(u.A).includes(u.X), Q_A: u.A.Q.map((e) => e.kind) })
      .toEqual({ A: false, B: false, nagrA: true, Q_A: ['snap'] });
    expect(S.stat.h1).toBe(0);
  }, 60_000);
  // Strażnik poprawki H2 „zawsze do kolejki” (specyfikacja 2a, 3.1; N1 — minimalne odtworzenie
  // z przeglądu E2-PR2a; P3 weryfikacji): B zapisuje notatkę n karty P, B „Usuń
  // pacjenta” P (ptomb, pnotetomb n z kartą), A bez wiedzy poprawia wizytę v. W partii B→A koperta pnote n przychodzi
  // RAZEM ze swoim nagrobkiem; nagrobek przegrywa (karta P zostaje u A, wraca na B hakiem H1), więc A dokłada pnote(n)
  // do Q_A (H2). Z dawnym wyjątkiem „pnote tej notatki w partii” notatka zostaje tylko na A, a nagrobek tylko na B (W1 i
  // W2r(B) czerwone). N1b — ta sama historia, najpierw dostawa B→A.
  for (const [nazwa, odB] of [['N1', false], ['N1b, najpierw dostawa B→A', true]]) {
    it(`H2 „zawsze do kolejki” (${nazwa}): notatka karty usuniętej na B, poprawka wizyty na A — spoczynek, W1, W2r, W4; pnote w hakach A`, async () => {
      const S = swiat(odB ? 651 : 650);
      const los = rng(odB ? 0x6051 : 0x6050);
      vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || los)());
      const u = await p6r4(S); u.S = S;
      krok(60e3); await mutacja(S, u.B, 'notatka pacjenta', () => u.B.v.savePatientNote({ patientId: u.P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść N1', category: 'inne' }));
      await p6usunPacjenta(u, u.B, u.P);
      await popraw(u, u.A, u.v, 34.9);
      expect(u.B.Q.map((e) => e.kind), 'Q_B').toEqual(['pnote', 'ptomb', 'pnotetomb']);
      krok();
      await spoczynekZgodny(S, u.A, u.B, { odB });
      const hakiA = S.dziennik.filter((l) => l.includes(' dostawa B>A: ') && /\[[^\]]*\bpnote\b[^\]]*\] → haki \[[^\]]*\bpnote\b/.test(l));
      expect(hakiA.length, raport(S, 'H2 u A: pnote(n) w hakach po partii B→A z kopertą pnote n i jej nagrobkiem')).toBe(1);
      expect(S.stat.h2, 'H2').toBeGreaterThan(0);
      const stan = async (U) => { const k = kanon(await eksport(U)); return { karty: (k.patients || []).map((p) => p.patientId), notatki: (k.patientNotes || []).map((n) => n.body), nagrobkiNotatek: (k.patientNoteTombstones || []).length }; };
      const oczek = { karty: [u.P, u.Q].sort(), notatki: ['Fikcyjna treść N1'], nagrobkiNotatek: 0 };
      expect({ A: { ...(await stan(u.A)), karty: (await stan(u.A)).karty.sort() }, B: { ...(await stan(u.B)), karty: (await stan(u.B)).karty.sort() } }, 'po spoczynku: karta P i notatka n na obu').toEqual({ A: oczek, B: oczek });
    }, 120_000);
  }
});

// ── p. 5: katalog kosza SCEN (kosz-po-kluczu-wspolne.mjs) — wymiana zdarzeniami wobec wymiany blobem ──────────────────
// Osobne konta jak w katalogu (P, K, C; przygotowanie blobem), kroki katalogu, pierwsze scalenia w danej kolejności,
// 3 rundy „każdy z każdym” (RUNDY.katalog). Wymiana zdarzeniami: każda mutacja lokalna kroku (wyrocznia emisji, jak
// w programie losowym) daje koperty z builderów do kolejki urządzenia; wymiana Z→NA = dostawa FIFO kolejki Z od kursora
// przez mergeSyncPayload (koperta jawna — osobne konta; szyfrowanie pokrywa W3) z hakami H1/H2 u odbiorcy; „sync” w
// krokach katalogu też idzie zdarzeniami. Po rundach dostawy aż kolejki są puste (≤ 4 rundy). Potem W4: rundy PO-A na
// parach (P, K), (K, C), (C, P), aż eksport się nie zmienia. Literał: widok (każde urządzenie) i skrót pelnyStan dla
// trzech ścieżek — zdarzenia, blob (dzisiejszy katalog), zdarzenia + W4. Losowość z ziarna (crypto i Math.random),
// żeby remisy identyfikatorów i chwile „Przywróć” były powtarzalne. D przy W4 bez credential (osobne konta). Klasy W4
// (tabela 'W4:p5'): R4n z W4p i E1-katalog — różnica, której klucz encji ma też D ścieżki blobów tej samej pary, dozwolona
// tylko w przebiegach z listy E1_KATALOG (3.6; w przebiegach z listy test sprawdza też, że po podmianie listy W4 jest
// czerwone), oraz wyjątek Q8-obca-2 „ZNANA RÓŻNICA (zdarzenia)” (E2-PR3c): WYŁĄCZNIE klucze D z literału Q8_ZDARZENIA
// tego przebiegu (każda inna różnica albo brak którejś z nich — czerwień; negatywy: inny przebieg, podmieniony literał).
const KAT_LISTA = ['E4b', 'E4b-1', 'E4b-2w', 'kosz-przed', 'kosz-po', 'kosz-po-2', 'E4b-ret', 'npret-pin', 'npret-K', 'PRZ0-bez', 'E1-popr-C', 'E1-C', 'Q8-obca-2', 'PRZ'];
const KAT_KOL = ['K←C,P←K', 'C←P,C←K'];
const KAT_URZ = ['P', 'K', 'C'];
const KAT_MUTUJACE = new Set(['savePatient', 'updateSnapshotPayload', 'setSnapshotPinned', 'moveSnapshotToTrash', 'pruneSnapshotsForPatient', 'mergePatients', 'restoreTrashedSnapshot', 'removePatient', 'savePatientNote', 'removePatientNote']);
const skrot = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 12);
const bezCred = (k) => { const { credential: _c, ...r } = k; return r; };
function losowoscZiarna(ziarno) {
  const los = rng(ziarno), losMath = rng(ziarno ^ 0x5bd1e995);
  const c = globalThis.crypto;
  const gr = c.getRandomValues.bind(c);
  vi.spyOn(c, 'getRandomValues').mockImplementation((x) => {
    if (x instanceof Uint8Array && (x.length === 16 || x.length === 12)) { for (let i = 0; i < x.length; i += 1) x[i] = Math.floor(los() * 256); return x; }
    return gr(x);
  });
  vi.spyOn(c, 'randomUUID').mockImplementation(() => 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(los() * 16).toString(16)));
  vi.spyOn(Math, 'random').mockImplementation(() => losMath());
}
async function przebiegKat(nazwa, kol, tryb, ziarno) {
  vi.restoreAllMocks();
  losowoscZiarna(ziarno);
  sztucznyZegar();
  const scen = KATALOG[nazwa];
  const u = await PRZYGOTOWANIA[scen.przygotuj]();
  u.dziennik = []; u.warunki = []; u.warunkiBledne = false; u.slad = [];
  u.t0 = zegar.t;
  if (scen.przygotuj === 'trzyKarty') {
    const x = (await u.K.getPatient(u.X)).snapshots;
    u.wersje = { [x[2].snapshotId]: 'x1', [u.sid]: 'x', [x[0].snapshotId]: 'x3' };
    u.wersje[(await u.K.getPatient(u.Y)).snapshots[0].snapshotId] = 'y';
    u.wersje[(await u.K.getPatient(u.Z)).snapshots[0].snapshotId] = 'z';
  } else {
    u.X = u.pid; u.karty = { [u.pid]: 'X' }; u.wersje = { [u.s1]: 's1', [u.sid]: 'x' };
  }
  const S = { stat: { zdarzen: 0, h1: 0, h2: 0, dostaw: 0, pelnych: 0 }, kursor: new Map(), dziennik: [], braki: [], hasla: new Map(), nrKroku: 0 };
  const surowe = Object.fromEntries(KAT_URZ.map((n) => [n, u[n]]));
  const U = {};
  for (const n of KAT_URZ) {
    U[n] = { v: surowe[n], ev: surowe[n]._eventLog, nazwa: n, Q: [], setIds: new Set(), stan: null, usuniete: new Set(), jawnie: true };
    ustawStan(U[n], await eksport(U[n]));
  }
  const wlasciciel = new Map(KAT_URZ.map((n) => [U[n].stan.userId, U[n]]));
  const wymiana = async (z, na) => {
    if (tryb === 'blob') { await na.v.mergeSyncPayload(json(await z.v.exportSyncPayload())); ustawStan(na, await eksport(na)); return; }
    await dostawa(S, z, na, { w2s: false });
  };
  if (tryb === 'zdarzenia') {
    // mutacje kroków z emisją; „sync” z kroków katalogu jako dostawa zdarzeń od właściciela ładunku
    for (const n of KAT_URZ) {
      u[n] = new Proxy(surowe[n], {
        get(cel, k) {
          const f = cel[k];
          if (typeof f !== 'function') return f;
          if (KAT_MUTUJACE.has(k)) return async (...a) => (await mutacja(S, U[n], k, () => f.apply(cel, a))).wynik;
          if (k === 'mergeSyncPayload') return async (lad) => { await wymiana(wlasciciel.get(lad.userId), U[n]); return {}; };
          return f.bind(cel);
        },
      });
    }
  }
  przesunZegar(60e3);
  await scen.kroki(u);
  for (const n of KAT_URZ) { u[n] = surowe[n]; ustawStan(U[n], await eksport(U[n])); }
  for (const k of kol.split(',')) { const [na, z] = k.split('←'); await wymiana(U[z], U[na]); }
  for (let r = 0; r < 3; r += 1) for (const [z, na] of RUNDY.katalog) await wymiana(U[z], U[na]);
  let doRundy = 0;
  const oczekujace = () => KAT_URZ.some((z) => KAT_URZ.some((na) => z !== na && (S.kursor.get(z + '>' + na) || 0) < U[z].Q.length));
  if (tryb === 'zdarzenia') while (oczekujace() && doRundy < 4) { doRundy += 1; for (const [z, na] of RUNDY.katalog) await wymiana(U[z], U[na]); }
  const stan = async () => { const st = {}; for (const n of KAT_URZ) st[n] = await pelnyStan(u, surowe[n]); return st; };
  const widoki = (st) => { const w = KAT_URZ.map((n) => widok(st[n])); return w.every((x) => x === w[0]) ? w[0] : Object.fromEntries(KAT_URZ.map((n, i) => [n, w[i]])); };
  const st = await stan();
  const wynik = { widok: widoki(st), stan: skrot(st), pelny: st, oczekujace: oczekujace(), zdarzen: S.stat.zdarzen, h1: S.stat.h1, h2: S.stat.h2, braki: S.braki.length, warunkiBledne: u.warunkiBledne };
  // Etykiety encji (karty i wersje katalogu; głowy „Scal pacjentów” — „m” z chwilą zapisu, jak widok) do literałów E1.
  const etyk = (r) => {
    const [x, y] = r.klucz.split(/[/|]/);
    const kk = (pid) => (u.karty && u.karty[pid]) || String(pid).slice(0, 6);
    const rek = r.a || r.b || {};
    const ww = (sid) => (u.wersje && u.wersje[sid]) || (sid === u.sid ? 'x' : sid === u.s1 ? 's1' : rek.savedAtISO ? `m${((Date.parse(rek.savedAtISO) - u.t0) / 60e3).toFixed(3).replace(/\.?0+$/, '')}` : String(sid).slice(0, 6));
    return r.rodzaj === 'wersja' ? `${kk(x)}/${ww(y)}` : r.rodzaj === 'kosz' ? `${ww(x)}|${kk(y)}` : r.rodzaj === 'karta' || r.rodzaj === 'ptomb' ? kk(x) : String(r.klucz).slice(0, 8);
  };
  wynik.etyk = etyk;
  wynik.t0 = u.t0;
  if (tryb === 'blob') {
    // D ścieżki samych blobów w parach (P, K), (K, C), (C, P) — podstawa predykatu E1-katalog (3.6) w W4 tego przebiegu.
    wynik.pary = {};
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
      const [a, b] = [bezCred(kanon(await eksport(U[KAT_URZ[i]]))), bezCred(kanon(await eksport(U[KAT_URZ[j]])))];
      wynik.pary[KAT_URZ[i] + KAT_URZ[j]] = D(a, b);
    }
  }
  if (tryb === 'zdarzenia') {
    // W4: rundy PO-A na parach (P, K), (K, C), (C, P), aż żaden eksport się nie zmienia (≤ 3 rundy ze zmianą)
    let rund = 0, stabilny = false;
    while (!stabilny && rund < 4) {
      rund += 1;
      const przed = KAT_URZ.map((n) => JSON.stringify(kanon(U[n].stan)));
      for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) await rundaPO(U[KAT_URZ[i]], U[KAT_URZ[j]]);
      stabilny = KAT_URZ.every((n, i) => JSON.stringify(kanon(U[n].stan)) === przed[i]);
    }
    // D par po W4; klasyfikacja (z predykatem E1-katalog, który potrzebuje D ścieżki blobów tego przebiegu) — po przebiegu
    // blobów, w klasyW4Kat (Kosz czytany z tych samych urządzeń, tylko przy różnicy postaci gwiazdki).
    const pary = [];
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
      const [a, b] = [bezCred(kanon(U[KAT_URZ[i]].stan)), bezCred(kanon(U[KAT_URZ[j]].stan))];
      const [X, Y] = [surowe[KAT_URZ[i]], surowe[KAT_URZ[j]]];
      pary.push({ para: KAT_URZ[i] + KAT_URZ[j], a, b, d: D(a, b), czytajKosz: async () => ({ x: await X.listTrashedSnapshots(), y: await Y.listTrashedSnapshots() }) });
    }
    const st4 = await stan();
    wynik.w4 = { widok: widoki(st4), stan: skrot(st4), pelny: st4, rund, stabilny, pary };
  }
  return wynik;
}
// Klasy W4 p. 5 (tabela 'W4:p5'): predykat E1-katalog na kluczach D ścieżki blobów tej samej pary (paryBlob), dozwolenie
// zależne od nazwy przebiegu (przebieg — lista E1_KATALOG). Wynik: { ok, pary: [{ para, roznice }], e1: [...] } — e1 to
// różnice z klasą E1-katalog: etykieta, strona i to, czy wartość jest taka jak przy samych blobach („zmiana zachowania”).
// Chwile ISO względem początku przebiegu (t0; zegar katalogu biegnie dalej między przebiegami — jak rel w pelnyStan).
const wzgledne = (v, t0) => {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)) return `t0${Date.parse(v) - t0 >= 0 ? '+' : ''}${Date.parse(v) - t0}ms`;
  if (Array.isArray(v)) return v.map((x) => wzgledne(x, t0));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, wzgledne(x, t0)]));
  return v;
};
// Wyjątek Q8-obca-2 (specyfikacja 2a, 3.6, akapit „Wyjątek Q8-obca-2” pod E1-katalog; rozstrzygnięte
// 2026-11-03): „ZNANA RÓŻNICA (zdarzenia)”, pozycja planu E2-PR3c. Po W4 K (w kolejności K←C,P←K także C)
// zostaje z inną wersją karty Y niż przy samych blobach: m1 (głowa „Scal pacjentów”, zapis t0+1 min) zamiast y (wizyta
// sprzed scalenia, −1 min); obie 18 kg, P w obu światach Y/x3 (25 kg). Różnicę tworzy dostawa zdarzeń P→K (stomb
// przychodzą pojedynczo — ocalała wersja, której wpis kosza przyszedł ostatni; przy blobie zostaje wersja lokalna), W4 jej
// nie zmienia; ta sama rodzina co npret-* (brak kontekstu całej karty). Dozwolone WYŁĄCZNIE dokładnie te
// dodatkowe klucze D po W4 (różnice bez innej klasy): [przebieg] = lista [klucz, rodzaj, strona] w kolejności par
// (P, K), (K, C), (C, P); klucz — etykieta encji jak w KAT_E1 (m1 — głowa scalenia z chwilą zapisu względem t0), strona —
// „para:urządzenie, które ma encję” ('PK:K' — w parze (P, K) wersja jest tylko na K). Każda inna różnica bez klasy, klucz
// spoza literału tego przebiegu (inny przebieg, literał podmieniony) albo brak którejkolwiek z tych różnic = czerwień W4.
// Wpis na liście „zmian zachowania” (KAT_ZMIANY, KAT_ZMIANY_ZD) do akceptacji właściciela przed E2-PR6, o ile E2-PR3c jej
// nie usunie; naprawa przepisze ten literał (lista pusta) i KAT_LITERALY obu przebiegów. Klasa nie wchodzi do tabeli
// DOZWOLONE (wspólnej z profilami): nadaje ją i dozwala tylko klasyW4Kat — dozwolona(ZR_ZD, …) = false w każdej tabeli.
const ZR_ZD = 'ZNANA RÓŻNICA (zdarzenia)';
const Q8_ZDARZENIA = Object.freeze({
  'Q8-obca-2 K←C,P←K': [['Y/m1', 'wersja', 'PK:K'], ['Y/m1', 'wersja', 'CP:C']],
  'Q8-obca-2 C←P,C←K': [['Y/m1', 'wersja', 'PK:K'], ['Y/m1', 'wersja', 'KC:K']],
});
const sygnZd = (r, para, etyk) => [etyk(r), r.rodzaj, `${para}:${r.tylko ? para[r.tylko === 'x' ? 0 : 1] : 'obie'}`];
const jakoNapis = (t) => JSON.stringify(t);
// klucz — przebieg z kolejnością (klucz Q8_ZDARZENIA); znaneZd — literał, którego predykat używa (domyślnie z
// Q8_ZDARZENIA; negatyw podmienia go albo klucz). Dozwolenie zawsze wobec Q8_ZDARZENIA[klucz].
async function klasyW4Kat(w4, paryBlob, przebieg, etyk, t0 = { zd: 0, bl: 0 }, { klucz = null, znaneZd = Q8_ZDARZENIA[klucz] || [] } = {}) {
  const pary = [], e1 = [], zd = [];
  const znane = new Set(znaneZd.map(jakoNapis)), wolno = new Set((Q8_ZDARZENIA[klucz] || []).map(jakoNapis));
  for (const p of w4.pary) {
    const blob = paryBlob[p.para] || [];
    const kont = { tabela: 'W4:p5', przebieg, e1Bloby: new Set(blob.map(kluczD)) };
    const d = (await sklasyfikuj(p.d, p.a, p.b, kont, p.czytajKosz)).map((r) => {
      if (r.klasa !== null) return r;
      const s = sygnZd(r, p.para, etyk);
      if (!znane.has(jakoNapis(s))) return r;
      zd.push(s);
      return { ...r, klasa: ZR_ZD, dozwolona: wolno.has(jakoNapis(s)) ? 'tak' : false };
    });
    pary.push({ para: p.para, roznice: d.map(skrotRoznicy) });
    for (const r of d.filter((q) => q.klasa === E1)) {
      const rb = blob.find((q) => kluczD(q) === kluczD(r));
      // pola, którymi encja po W4 różni się od encji ścieżki blobów (strona x i strona y osobno)
      const [w, b] = [wzgledne([r.a, r.b], t0.zd), wzgledne([rb.a, rb.b], t0.bl)];
      const inne = [...new Set([...sciezkiEncji(w[0], b[0]), ...sciezkiEncji(w[1], b[1])])].sort();
      e1.push(`${p.para} ${r.rodzaj} ${etyk(r)}: ${r.tylko ? 'tylko ' + p.para[r.tylko === 'x' ? 0 : 1] : r.sciezki.slice(0, 4).join(', ')}${inne.length ? ` — inna wartość niż przy samych blobach (${inne.slice(0, 6).join(', ')})` : ''}`);
    }
  }
  // „brak tej różnicy = czerwień”: każdy klucz literału wystąpił dokładnie raz
  const zdKomplet = jakoNapis(zd.map(jakoNapis).sort()) === jakoNapis([...znane].sort());
  return { ok: w4.stabilny && pary.every((p) => p.roznice.every((r) => r.dozwolona)) && zdKomplet, pary, e1, zd };
}
// Literały p. 5 (zmierzone): [klucz] = { zdarzenia, blob, w4 } — widok (jeden napis, gdy P, K i C mają ten sam) i skrót
// pelnyStan trzech urządzeń.
const KAT_LITERALY = {
  'E4b K←C,P←K': {
    zdarzenia: { stan: '25412651f039', widok: {
      P: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y',
      K: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y',
      C: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y',
    } },
    blob: { stan: 'df198e7f7420', widok: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y' },
    w4: { stan: 'df198e7f7420', widok: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y' },
  },
  'E4b C←P,C←K': {
    zdarzenia: { stan: '2dd95f147ee1', widok: {
      P: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y',
      K: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y',
      C: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y',
    } },
    blob: { stan: 'df198e7f7420', widok: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y' },
    w4: { stan: 'df198e7f7420', widok: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y' },
  },
  'E4b-1 K←C,P←K': {
    zdarzenia: { stan: 'def61627a75e', widok: {
      P: 'X[x:74] Y[m1,y,x3,x1] Z[z] | kosz x@Y:23',
      K: 'Y[m1,y,x3,x1] Z[z] | kosz x@Y:74 | nagr X',
      C: 'Y[m1,y,x3,x1] Z[z] | kosz x@Y:74 | nagr X',
    } },
    blob: { stan: 'd91b44938892', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@Y:74 | nagr X' },
    w4: { stan: 'd91b44938892', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@Y:74 | nagr X' },
  },
  'E4b-1 C←P,C←K': {
    zdarzenia: { stan: '083341467bea', widok: {
      P: 'X[x:74] Y[m1,y,x3,x1] Z[z] | kosz x@Y:74',
      K: 'Y[m1,y,x3,x1] Z[z] | kosz x@Y:74 | nagr X',
      C: 'X[x:74] Y[m1,y,x3,x1] Z[z] | kosz x@Y:74',
    } },
    blob: { stan: 'd91b44938892', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@Y:74 | nagr X' },
    w4: { stan: 'd91b44938892', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@Y:74 | nagr X' },
  },
  'E4b-2w K←C,P←K': {
    zdarzenia: { stan: '237fa729b20d', widok: 'X[nowa] Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y' },
    blob: { stan: '237fa729b20d', widok: 'X[nowa] Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y' },
    w4: { stan: '237fa729b20d', widok: 'X[nowa] Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y' },
  },
  'E4b-2w C←P,C←K': {
    zdarzenia: { stan: '237fa729b20d', widok: 'X[nowa] Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y' },
    blob: { stan: '237fa729b20d', widok: 'X[nowa] Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y' },
    w4: { stan: '237fa729b20d', widok: 'X[nowa] Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y' },
  },
  'kosz-przed K←C,P←K': {
    zdarzenia: { stan: '3f6e50e10e9e', widok: 'Y[m2,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
    blob: { stan: '3f6e50e10e9e', widok: 'Y[m2,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
    w4: { stan: '3f6e50e10e9e', widok: 'Y[m2,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
  },
  'kosz-przed C←P,C←K': {
    zdarzenia: { stan: '3f6e50e10e9e', widok: 'Y[m2,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
    blob: { stan: '3f6e50e10e9e', widok: 'Y[m2,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
    w4: { stan: '3f6e50e10e9e', widok: 'Y[m2,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
  },
  'kosz-po K←C,P←K': {
    zdarzenia: { stan: 'a1df206edb25', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
    blob: { stan: 'a1df206edb25', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
    w4: { stan: 'a1df206edb25', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
  },
  'kosz-po C←P,C←K': {
    zdarzenia: { stan: 'a1df206edb25', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
    blob: { stan: 'a1df206edb25', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
    w4: { stan: 'a1df206edb25', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
  },
  'kosz-po-2 K←C,P←K': {
    zdarzenia: { stan: 'fc08869559cf', widok: {
      P: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr X,Y',
      K: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr X,Y',
      C: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr Y',
    } },
    blob: { stan: '57558de76997', widok: {
      P: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr X,Y',
      K: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr X,Y',
      C: 'X[x:74] Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr Y',
    } },
    w4: { stan: '74a2f084cfbf', widok: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr X,Y' },
  },
  'kosz-po-2 C←P,C←K': {
    zdarzenia: { stan: '74a2f084cfbf', widok: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr X,Y' },
    blob: { stan: '74a2f084cfbf', widok: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr X,Y' },
    w4: { stan: '74a2f084cfbf', widok: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr X,Y' },
  },
  'E4b-ret K←C,P←K': {
    zdarzenia: { stan: '814a97e28149', widok: {
      P: 'Z[m2] | nagr Y',
      K: 'Z[m2] | nagr X,Y',
      C: 'Z[m2] | nagr X,Y',
    } },
    blob: { stan: '0b8b03e77f8d', widok: 'Z[m2] | nagr X,Y' },
    w4: { stan: '0b8b03e77f8d', widok: 'Z[m2] | nagr X,Y' },
  },
  'E4b-ret C←P,C←K': {
    zdarzenia: { stan: '8ccdd100337b', widok: {
      P: 'Z[m2] | nagr Y',
      K: 'Z[m2] | nagr X,Y',
      C: 'Z[m2] | nagr Y',
    } },
    blob: { stan: '0b8b03e77f8d', widok: 'Z[m2] | nagr X,Y' },
    w4: { stan: '0b8b03e77f8d', widok: 'Z[m2] | nagr X,Y' },
  },
  'npret-pin K←C,P←K': {
    zdarzenia: { stan: '85eef848ee45', widok: 'Y[m3,y,x3] Z[z] | nagr X' },
    blob: { stan: '3e3ec48f354a', widok: 'Y[m3,y,x3,x:23*] Z[z] | nagr X' },
    w4: { stan: '85eef848ee45', widok: 'Y[m3,y,x3] Z[z] | nagr X' },
  },
  'npret-pin C←P,C←K': {
    zdarzenia: { stan: '85eef848ee45', widok: 'Y[m3,y,x3] Z[z] | nagr X' },
    blob: { stan: '3e3ec48f354a', widok: 'Y[m3,y,x3,x:23*] Z[z] | nagr X' },
    w4: { stan: '85eef848ee45', widok: 'Y[m3,y,x3] Z[z] | nagr X' },
  },
  'npret-K K←C,P←K': {
    zdarzenia: { stan: '39cbe8aeaf23', widok: 'Y[m2] Z[z] | nagr X' },
    blob: { stan: '30174011f115', widok: 'Y[m2,x:23*] Z[z] | nagr X' },
    w4: { stan: '39cbe8aeaf23', widok: 'Y[m2] Z[z] | nagr X' },
  },
  'npret-K C←P,C←K': {
    zdarzenia: { stan: '39cbe8aeaf23', widok: 'Y[m2] Z[z] | nagr X' },
    blob: { stan: '30174011f115', widok: 'Y[m2,x:23*] Z[z] | nagr X' },
    w4: { stan: '39cbe8aeaf23', widok: 'Y[m2] Z[z] | nagr X' },
  },
  'PRZ0-bez K←C,P←K': {
    zdarzenia: { stan: '2e54886e8b35', widok: {
      P: 'X[x:78] | kosz s1@X:20 kosz x@X:23',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
    } },
    blob: { stan: '15785883acf9', widok: {
      P: 'X[x:78] | kosz s1@X:20 kosz x@X:78',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
    } },
    w4: { stan: '15785883acf9', widok: {
      P: 'X[x:78] | kosz s1@X:20 kosz x@X:78',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
    } },
  },
  'PRZ0-bez C←P,C←K': {
    zdarzenia: { stan: 'cbdb1e39f79d', widok: {
      P: 'X[x:78] | kosz s1@X:20 kosz x@X:23',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
      C: 'X[x:78] | kosz s1@X:20 kosz x@X:23',
    } },
    blob: { stan: '58bf51776fa1', widok: {
      P: 'X[x:78] | kosz s1@X:20 kosz x@X:78',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
      C: 'X[x:78] | kosz s1@X:20 kosz x@X:78',
    } },
    w4: { stan: '58bf51776fa1', widok: {
      P: 'X[x:78] | kosz s1@X:20 kosz x@X:78',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
      C: 'X[x:78] | kosz s1@X:20 kosz x@X:78',
    } },
  },
  'E1-popr-C K←C,P←K': {
    zdarzenia: { stan: '8e16cf2e9c45', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
    } },
    blob: { stan: '8e16cf2e9c45', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
    } },
    w4: { stan: '8e16cf2e9c45', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
    } },
  },
  'E1-popr-C C←P,C←K': {
    zdarzenia: { stan: '16436912db6c', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[x:74] | kosz s1@X:20 kosz x@X:23',
    } },
    blob: { stan: 'f4fb47fc3636', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
    } },
    w4: { stan: 'f4fb47fc3636', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
    } },
  },
  'E1-C K←C,P←K': {
    zdarzenia: { stan: '11d95182211b', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
    } },
    blob: { stan: '11d95182211b', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
    } },
    w4: { stan: '11d95182211b', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
    } },
  },
  'E1-C C←P,C←K': {
    zdarzenia: { stan: 'aed6ca2765b2', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[x:74] | kosz s1@X:20 kosz x@X:23',
    } },
    blob: { stan: '9af333a075dd', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
    } },
    w4: { stan: '9af333a075dd', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
    } },
  },
  'Q8-obca-2 K←C,P←K': {
    zdarzenia: { stan: '9847adf3fe86', widok: {
      P: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      K: 'Y[m1] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      C: 'Y[m1] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
    } },
    blob: { stan: '51df063264fa', widok: {
      P: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      K: 'Y[y] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      C: 'Y[y] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
    } },
    w4: { stan: '78b542aa8125', widok: {
      P: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      K: 'Y[m1] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      C: 'Y[m1] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
    } },
  },
  'Q8-obca-2 C←P,C←K': {
    zdarzenia: { stan: '5dc38c0f5d3a', widok: {
      P: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      K: 'Y[m1] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      C: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
    } },
    blob: { stan: '398ee2a60994', widok: {
      P: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      K: 'Y[y] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      C: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
    } },
    w4: { stan: '8af2e8a1141a', widok: {
      P: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      K: 'Y[m1] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      C: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
    } },
  },
  'PRZ K←C,P←K': {
    zdarzenia: { stan: 'a45d94f0f178', widok: 'X[x:78] | kosz s1@X:20' },
    blob: { stan: 'a45d94f0f178', widok: 'X[x:78] | kosz s1@X:20' },
    w4: { stan: 'a45d94f0f178', widok: 'X[x:78] | kosz s1@X:20' },
  },
  'PRZ C←P,C←K': {
    zdarzenia: { stan: 'd650cd56c4f2', widok: 'X[x:78] | kosz s1@X:20' },
    blob: { stan: 'd650cd56c4f2', widok: 'X[x:78] | kosz s1@X:20' },
    w4: { stan: 'd650cd56c4f2', widok: 'X[x:78] | kosz s1@X:20' },
  },
};
// „Zmiany zachowania” p. 5 (do akceptacji właściciela przed E2-PR6, jak P1e): przebiegi, w których stan po W4 ≠ stan
// samych blobów (pelnyStan; „widok” — gdy różni się też widok).
const KAT_ZMIANY = [
  'kosz-po-2 K←C,P←K: widok',
  'npret-pin K←C,P←K: widok',
  'npret-pin C←P,C←K: widok',
  'npret-K K←C,P←K: widok',
  'npret-K C←P,C←K: widok',
  'Q8-obca-2 K←C,P←K: widok', // ZNANA RÓŻNICA (zdarzenia), KAT_ZMIANY_ZD
  'Q8-obca-2 C←P,C←K: widok', // ZNANA RÓŻNICA (zdarzenia), KAT_ZMIANY_ZD
];
// „Zmiany zachowania” z wyjątku Q8-obca-2 (Q8_ZDARZENIA; „ZNANA RÓŻNICA (zdarzenia)”, E2-PR3c): po zdarzeniach i W4 na K
// (w K←C,P←K także na C) zostaje wizyta m1 karty Y (głowa „Scal pacjentów”, 18 kg, zapis t0+1 min), przy samych blobach —
// wizyta y (18 kg, t0−1 min); obie w Koszu, P w obu światach Y/x3. Do akceptacji właściciela przed E2-PR6, o ile E2-PR3c
// jej nie usunie. Test „zmiany zachowania” wymaga: przebiegi z różnicą tej klasy = ta lista i każdy jest na KAT_ZMIANY.
const KAT_ZMIANY_ZD = [
  'Q8-obca-2 K←C,P←K: na K i C wizyta Y/m1 zamiast Y/y (obie 18 kg)',
  'Q8-obca-2 C←P,C←K: na K wizyta Y/m1 zamiast Y/y (obie 18 kg)',
];
// E1-katalog w W4 p. 5 (zmierzone; specyfikacja 2a, 3.6): [przebieg] = różnice z klasą E1-katalog po W4 („para rodzaj
// encja: tylko <strona>” albo ścieżki), z dopiskiem, gdy wartość różnicy jest inna niż przy samych blobach (to trafia na
// listę „zmian zachowania”; chwile porównywane względem początku przebiegu). Przebieg spoza listy E1_KATALOG z różnicą
// o tej klasie — czerwień (W4).
const KAT_E1 = {
  'PRZ0-bez K←C,P←K': ['PK wersja X/x: tylko P', 'PK wersja X/s1: tylko K', 'CP wersja X/x: tylko P', 'CP wersja X/s1: tylko C'],
  'PRZ0-bez C←P,C←K': ['PK wersja X/x: tylko P', 'PK wersja X/s1: tylko K', 'KC wersja X/x: tylko C', 'KC wersja X/s1: tylko K'],
  'E1-popr-C K←C,P←K': ['PK wersja X/s1: tylko K', 'PK wersja X/x: tylko P', 'CP wersja X/s1: tylko C', 'CP wersja X/x: tylko P'],
  'E1-popr-C C←P,C←K': ['PK wersja X/s1: tylko K', 'PK wersja X/x: tylko P', 'KC wersja X/s1: tylko K', 'KC wersja X/x: tylko C'],
  'E1-C K←C,P←K': ['PK wersja X/x: tylko P', 'PK wersja X/s1: tylko K', 'CP wersja X/x: tylko P', 'CP wersja X/s1: tylko C'],
  'E1-C C←P,C←K': ['PK wersja X/s1: tylko K', 'PK wersja X/x: tylko P', 'KC wersja X/s1: tylko K', 'KC wersja X/x: tylko C'],
  'Q8-obca-2 K←C,P←K': [
    'PK karta Y: header.dobISO, header.firstName, header.lastName, header.name', 'PK wersja Y/x3: tylko P',
    'CP karta Y: header.dobISO, header.firstName, header.lastName, header.name', 'CP wersja Y/x3: tylko P',
  ],
  'Q8-obca-2 C←P,C←K': [
    'PK karta Y: header.dobISO, header.firstName, header.lastName, header.name', 'PK wersja Y/x3: tylko P',
    'KC karta Y: header.dobISO, header.firstName, header.lastName, header.name', 'KC wersja Y/x3: tylko C',
  ],
};
// Przebiegi p. 5 ze znaną utratą albo znaną różnicą (specyfikacja 2a, 3.4 i 3.6): prefiks nazwy testu i pozycja planu,
// która ją naprawi. Naprawa przed E2-PR6 przepisze literał na wynik bez utraty (bez różnicy; Q8_ZDARZENIA — lista pusta).
const KAT_ZNANE = {
  'npret-pin': 'ZNANA UTRATA (zdarzenia; naprawa: E2-PR3c) — przypięta wizyta x:23* znika po zdarzeniach i W4',
  'npret-K': 'ZNANA UTRATA (zdarzenia; naprawa: E2-PR3c) — przypięta wizyta x:23* znika po zdarzeniach i W4',
  'Q8-obca-2': 'ZNANA RÓŻNICA (zdarzenia; naprawa: E2-PR3c) — po zdarzeniach P→K na K zostaje inna z dwóch wizyt 18 kg karty Y (m1 zamiast y), W4 tego nie zmienia',
};
const KAT_WYNIKI = {};
describe('A ≡ B, blok deterministyczny p. 5: katalog kosza (zdarzenia wobec blobu, W4)', () => {
  d1();
  for (const [i, nazwa] of KAT_LISTA.entries()) {
    for (const [j, kol] of KAT_KOL.entries()) {
      const kl = `${nazwa} ${kol}`;
      it(`${KAT_ZNANE[nazwa] ? KAT_ZNANE[nazwa] + ': ' : ''}${kl}: literał zdarzeń, blobu i W4; W4 bez różnic${E1_KATALOG.has(nazwa) ? ' poza E1-katalog' : ''}${Q8_ZDARZENIA[kl] ? ' i kluczami Q8_ZDARZENIA (ZNANA RÓŻNICA (zdarzenia), E2-PR3c)' : ''}`, async () => {
        const ziarno = 5000 + i * 10 + j;
        const klucz = kl;
        const zd = await przebiegKat(nazwa, kol, 'zdarzenia', ziarno);
        const bl = await przebiegKat(nazwa, kol, 'blob', ziarno);
        const t0 = { zd: zd.t0, bl: bl.t0 };
        const w4 = await klasyW4Kat(zd.w4, bl.pary, nazwa, zd.etyk, t0, { klucz });
        const wynik = { zdarzenia: { widok: zd.widok, stan: zd.stan }, blob: { widok: bl.widok, stan: bl.stan }, w4: { widok: zd.w4.widok, stan: zd.w4.stan } };
        const zmiana = zd.w4.stan === bl.stan ? null : JSON.stringify(zd.w4.widok) === JSON.stringify(bl.widok) ? 'pelnyStan' : 'widok';
        KAT_WYNIKI[klucz] = { ...wynik, zmiana, e1: w4.e1, zd: w4.zd };
        if (process.env.E2_AB_P5) appendFileSync(process.env.E2_AB_P5, JSON.stringify({ klucz, ...wynik, zmiana, e1: w4.e1, zdZnane: w4.zd, w4ok: w4.ok, w4pary: w4.pary, blobPary: Object.fromEntries(Object.entries(bl.pary).map(([k, d]) => [k, d.map(skrotRoznicy)])), zd: { ...zd, pelny: undefined, w4: { ...zd.w4, pelny: undefined, pary: undefined } }, pelny: { zdarzenia: zd.pelny, blob: bl.pelny, w4: zd.w4.pelny } }) + '\n');
        expect({ warunki: [zd.warunkiBledne, bl.warunkiBledne], oczekujace: zd.oczekujace, braki: zd.braki }, 'warunki kroków katalogu, kolejki dostarczone, nośnik').toEqual({ warunki: [false, false], oczekujace: false, braki: 0 });
        expect(wynik, `literał p. 5: ${klucz}`).toEqual(KAT_LITERALY[klucz]);
        expect(w4.e1, `E1-katalog po W4 (${klucz})`).toEqual(KAT_E1[klucz] || []);
        expect(w4.zd, `ZNANA RÓŻNICA (zdarzenia) po W4 (${klucz}): dokładnie klucze Q8_ZDARZENIA`).toEqual(Q8_ZDARZENIA[klucz] || []);
        expect(w4.ok, `W4 (${klucz}): różnice po pełnej wymianie\n${JSON.stringify(w4.pary, null, 1)}`).toBe(true);
        if (w4.e1.length) {
          // Negatyw (3.6): te same różnice w przebiegu spoza listy E1_KATALOG (lista podmieniona) — W4 czerwone.
          const poza = await klasyW4Kat(zd.w4, bl.pary, '(przebieg spoza E1_KATALOG)', zd.etyk, t0, { klucz });
          expect(poza.ok, `E1-katalog poza listą E1_KATALOG nie jest dozwolone (${klucz})`).toBe(false);
        }
        if (w4.zd.length) {
          // Negatywy wyjątku Q8-obca-2 (3.6): ta sama klasyfikacja W4 jest czerwona, gdy (1) przebieg nie ma wpisu
          // Q8_ZDARZENIA, (2) przebieg z drugą kolejnością (jej literał), (3) literał podmieniony (inna strona, inna wersja),
          // (4) literał z dodatkowym kluczem, którego różnicy nie ma („brak tej różnicy”), (5) literał bez jednego klucza.
          const lit = Q8_ZDARZENIA[klucz];
          const inna = Object.keys(Q8_ZDARZENIA).find((k) => k !== klucz);
          const negatywy = {
            'przebieg spoza Q8_ZDARZENIA': { klucz: '(przebieg spoza Q8_ZDARZENIA)' },
            [`klucz drugiej kolejności (${inna})`]: { klucz: inna },
            'literał: inna strona pierwszego klucza': { klucz, znaneZd: [[lit[0][0], lit[0][1], lit[0][2].replace(/:(.)$/, (_, s) => ':' + (s === 'P' ? 'K' : 'P'))], ...lit.slice(1)] },
            'literał: wersja Y/y zamiast Y/m1': { klucz, znaneZd: lit.map(([k, r, s]) => [k.replace('/m1', '/y'), r, s]) },
            'literał z dodatkowym kluczem (brak różnicy)': { klucz, znaneZd: [...lit, ['Y/y', 'wersja', 'PK:K']] },
            'literał bez jednego klucza': { klucz, znaneZd: lit.slice(1) },
          };
          const wyniki = {};
          for (const [opis, o] of Object.entries(negatywy)) wyniki[opis] = (await klasyW4Kat(zd.w4, bl.pary, nazwa, zd.etyk, t0, o)).ok;
          expect(wyniki, `ZNANA RÓŻNICA (zdarzenia) tylko dokładnie z literałem Q8_ZDARZENIA tego przebiegu (${klucz})`).toEqual(Object.fromEntries(Object.keys(negatywy).map((k) => [k, false])));
        }
      }, 120_000);
    }
  }
  it('klasa E1-katalog: dozwolona tylko w W4 p. 5 i tylko w przebiegach z listy E1_KATALOG (tabela dozwolonych, 3.6)', () => {
    const r = { rodzaj: 'wersja', klucz: 'X/x', a: { snapshotId: 'x' }, b: null, tylko: 'x', sciezki: ['(obecność)'] };
    const X = { patients: [] }, Y = { patients: [] };
    expect(klasa(r, X, Y, {}), 'bez D ścieżki blobów — brak klasy').toBe(null);
    expect(klasa(r, X, Y, { e1Bloby: new Set(['wersja X/y']) }), 'inny klucz w D ścieżki blobów — brak klasy').toBe(null);
    expect(klasa(r, X, Y, { e1Bloby: new Set(['wersja X/x']) }), 'ten sam klucz w D ścieżki blobów').toBe(E1);
    expect([...E1_KATALOG].sort(), 'lista E1_KATALOG (3.6)').toEqual(['E1-C', 'E1-popr-C', 'PRZ0-bez', 'Q8-obca-2']);
    const tak = [];
    for (const tabela of Object.keys(DOZWOLONE)) {
      for (const przebieg of [...KAT_LISTA, '(przebieg spoza E1_KATALOG)']) if (dozwolona(E1, r, { tabela, przebieg })) tak.push(`${tabela} ${przebieg}`);
    }
    expect(tak.sort(), 'E1-katalog dozwolona wyłącznie w W4:p5 dla przebiegów z listy').toEqual([...E1_KATALOG].sort().map((n) => `W4:p5 ${n}`));
  });
  it('ZNANA RÓŻNICA (zdarzenia) (wyjątek Q8-obca-2, E2-PR3c): tylko W4 p. 5, tylko dokładnie klucze Q8_ZDARZENIA (literał i negatywy)', async () => {
    expect(Q8_ZDARZENIA, 'literał Q8_ZDARZENIA (3.6, wyjątek Q8-obca-2)').toEqual({
      'Q8-obca-2 K←C,P←K': [['Y/m1', 'wersja', 'PK:K'], ['Y/m1', 'wersja', 'CP:C']],
      'Q8-obca-2 C←P,C←K': [['Y/m1', 'wersja', 'PK:K'], ['Y/m1', 'wersja', 'KC:K']],
    });
    // Poza klasyW4Kat klasa nie jest dozwolona w żadnej tabeli (DOZWOLONE wspólne z profilami — bez wpisu).
    const r0 = { rodzaj: 'wersja', klucz: 'Y/m1', a: null, b: { snapshotId: 'm1' }, tylko: 'y', sciezki: ['(obecność)'] };
    const tak = [];
    for (const tabela of Object.keys(DOZWOLONE)) for (const przebieg of KAT_LISTA) if (dozwolona(ZR_ZD, r0, { tabela, przebieg })) tak.push(`${tabela} ${przebieg}`);
    expect(tak, 'dozwolona(ZR_ZD) w tabelach DOZWOLONE').toEqual([]);
    // Syntetyczne W4 (etykieta = klucz): para (P, K) — m1 tylko na K, para (C, P) — m1 tylko na C; bez D blobów.
    const pusty = { patients: [] };
    const roz = (tylko, klucz = 'Y/m1', rodzaj = 'wersja') => ({ rodzaj, klucz, a: tylko === 'x' ? { snapshotId: 'm' } : null, b: tylko === 'y' ? { snapshotId: 'm' } : null, tylko, sciezki: ['(obecność)'] });
    const w4 = (pk, cp) => ({ stabilny: true, pary: [{ para: 'PK', a: pusty, b: pusty, d: pk }, { para: 'KC', a: pusty, b: pusty, d: [] }, { para: 'CP', a: pusty, b: pusty, d: cp }] });
    const kl = 'Q8-obca-2 K←C,P←K';
    const ok = async (w, o) => { const x = await klasyW4Kat(w, {}, 'Q8-obca-2', (r) => r.klucz, undefined, o); return [x.ok, x.zd]; };
    expect(await ok(w4([roz('y')], [roz('x')]), { klucz: kl }), 'dokładnie literał — zieleń').toEqual([true, Q8_ZDARZENIA[kl]]);
    expect(await ok(w4([roz('y')], [roz('x')]), { klucz: '(przebieg spoza Q8_ZDARZENIA)' }), 'inny przebieg — czerwień').toEqual([false, []]);
    expect(await ok(w4([roz('y')], [roz('x')]), { klucz: 'Q8-obca-2 C←P,C←K' }), 'literał drugiej kolejności — czerwień').toEqual([false, [['Y/m1', 'wersja', 'PK:K']]]);
    expect(await ok(w4([roz('y')], []), { klucz: kl }), 'brak różnicy CP:C — czerwień').toEqual([false, [['Y/m1', 'wersja', 'PK:K']]]);
    expect(await ok(w4([roz('x')], [roz('x')]), { klucz: kl }), 'inna strona (tylko P) — czerwień').toEqual([false, [['Y/m1', 'wersja', 'CP:C']]]);
    expect(await ok(w4([roz('y'), roz('y', 'Y/y')], [roz('x')]), { klucz: kl }), 'dodatkowa różnica bez klasy — czerwień').toEqual([false, Q8_ZDARZENIA[kl]]);
    expect(await ok(w4([roz('y', 'Y/m1', 'kosz')], [roz('x')]), { klucz: kl }), 'inny rodzaj encji — czerwień').toEqual([false, [['Y/m1', 'wersja', 'CP:C']]]);
    expect(await ok(w4([roz('y')], [roz('x')]), { klucz: kl, znaneZd: [['Y/y', 'wersja', 'PK:K'], ['Y/m1', 'wersja', 'CP:C']] }), 'literał podmieniony — czerwień').toEqual([false, [['Y/m1', 'wersja', 'CP:C']]]);
    expect(await ok(w4([roz('y')], [roz('x')]), { klucz: kl, znaneZd: [...Q8_ZDARZENIA[kl], ['Y/m1', 'wersja', 'KC:K']] }), 'klucz spoza Q8_ZDARZENIA w literale — czerwień').toEqual([false, Q8_ZDARZENIA[kl]]);
    // dozwolenie zawsze wobec Q8_ZDARZENIA[klucz]: literał rozszerzony o klucz, którego różnica JEST — nadal czerwień
    const x = await klasyW4Kat(w4([roz('y'), roz('y', 'Y/y')], [roz('x')]), {}, 'Q8-obca-2', (r) => r.klucz, undefined, { klucz: kl, znaneZd: [...Q8_ZDARZENIA[kl], ['Y/y', 'wersja', 'PK:K']] });
    expect([x.ok, x.pary[0].roznice.map((r) => [r.klucz, r.klasa, r.dozwolona])], 'klucz spoza Q8_ZDARZENIA z różnicą — klasa, ale niedozwolona').toEqual([false, [['Y/m1', ZR_ZD, 'tak'], ['Y/y', ZR_ZD, false]]]);
  });
  it('zmiany zachowania wobec świata samych blobów (stan po W4 ≠ blob) — do akceptacji właściciela przed E2-PR6', (ctx) => {
    // filtr -t albo czerwone przebiegi: bez kompletu wyników test jest POMINIĘTY (nie zielony bez asercji; U5 weryfikacji)
    if (Object.keys(KAT_WYNIKI).length !== KAT_LISTA.length * KAT_KOL.length) { ctx.skip(); return; }
    const zmiany = Object.entries(KAT_WYNIKI).filter(([, w]) => w.zmiana).map(([k, w]) => `${k}: ${w.zmiana}`);
    // E1-katalog z inną wartością niż przy samych blobach (3.6) — każdy taki przebieg jest na liście zmian zachowania.
    const e1Inne = Object.entries(KAT_WYNIKI).filter(([, w]) => (w.e1 || []).some((x) => / — inna wartość /.test(x))).map(([k]) => k);
    // ZNANA RÓŻNICA (zdarzenia) (wyjątek Q8-obca-2, Q8_ZDARZENIA) — przebiegi z tą klasą = KAT_ZMIANY_ZD, każdy na KAT_ZMIANY.
    const zdZnane = Object.entries(KAT_WYNIKI).filter(([, w]) => (w.zd || []).length).map(([k]) => k);
    console.log('E2-AB p. 5 zmiany zachowania', JSON.stringify({ zmiany, e1Inne, zdZnane, KAT_ZMIANY_ZD }));
    expect(zmiany).toEqual(KAT_ZMIANY);
    expect(e1Inne.filter((k) => !KAT_ZMIANY.some((z) => z.startsWith(k + ':'))), 'E1-katalog z inną wartością niż bloby — na liście zmian zachowania').toEqual([]);
    expect(zdZnane, 'przebiegi z ZNANA RÓŻNICA (zdarzenia) = KAT_ZMIANY_ZD').toEqual(KAT_ZMIANY_ZD.map((z) => z.slice(0, z.indexOf(':'))));
    expect(zdZnane.filter((k) => !KAT_ZMIANY.some((z) => z.startsWith(k + ':'))), 'ZNANA RÓŻNICA (zdarzenia) — na liście zmian zachowania').toEqual([]);
  });
});

// ── p. 6: znane klasy i dalsze ciągi (minimalne odtworzenia analizy 2a; specyfikacja 2a, 3.4) ─────────────────────────
// Źródło: minimalne odtworzenia z analizy E2-PR2a (dane fikcyjne). Dla każdego
// scenariusza trzy literały: (1) klasy i ścieżki D(A, B) po spoczynku zdarzeń; (2) wynik W4 (stan kliniczny: które
// wizyty, gdzie, jaka treść); (3) świat samych blobów (te same kroki): D = ∅, z wyjątkiem R3-E1 (createdAtISO notatki
// różni się także przy samych blobach — klasa dzisiejsza) i dwóch scenariuszy „notatka pod inną kartą” (klasa dzisiejsza
// z pomiaru: TA SAMA różnica co po zdarzeniach i po W4, ze skutkiem klinicznym — pod którą kartą leży notatka, jaka
// treść, czy widać ją w karcie). Naprawa w E2-PR3c albo E3-PR0 ZMIENIA te literały — to zamierzone: PR naprawy przepisuje
// je na wynik zgodny.
async function p6r2(S) {
  const A = await urzadzenie(S, 'A');
  krok(); const { patientId: P, snapshotId: v } = await A.d.zapiszKarte(1, { masa: 20 });
  const Q = [];
  for (let i = 2; i <= 14 && !(Q.some((q) => q > P) && Q.some((q) => q < P)); i += 1) { krok(); Q.push((await A.d.zapiszKarte(i, { masa: 20 + i })).patientId); }
  krok(); ustawStan(A, await eksport(A));
  const B = await urzadzenie(S, 'B', A);
  const wieksza = Q.filter((q) => q > P).sort()[0];
  const n = new Map([[P, 'P'], [v, 'v'], [wieksza, 'Q']]);
  Q.forEach((q, i) => { if (!n.has(q)) n.set(q, 'K' + (i + 2)); });
  return { S, A, B, P, v, Q: wieksza, n };
}
async function p6r3(S) {
  const A = await urzadzenie(S, 'A');
  krok(); const { patientId: P } = await A.d.zapiszKarte(1);
  krok(); const Q = (await A.d.zapiszKarte(2)).patientId;
  krok(); const nId = (await A.v.savePatientNote({ patientId: P, title: 'Fikcyjna', body: 'Fikcyjna treść', category: 'inne' })).id;
  krok(); ustawStan(A, await eksport(A));
  const B = await urzadzenie(S, 'B', A);
  return { S, A, B, P, Q, nId, n: new Map([[P, 'P'], [Q, 'Q'], [nId, 'n']]) };
}
async function p6r4(S, { zC = false } = {}) {
  const A = await urzadzenie(S, 'A');
  krok(); const r1 = await A.d.zapiszKarte(1, { wzrost: 120, masa: 20 });
  krok(); const r2 = await A.d.zapiszKarte(1, { wzrost: 125, masa: 21, zapis: { patientId: r1.patientId, forceNewSnapshot: true } });
  krok(); const Q = (await A.d.zapiszKarte(2, { masa: 30 })).patientId;
  krok(); ustawStan(A, await eksport(A));
  const B = await urzadzenie(S, 'B', A);
  const C = zC ? await urzadzenie(S, 'C', A) : null; // C: kopia sprzed kosza (R5-E1)
  return { S, A, B, C, P: r1.patientId, Q, v: r1.snapshotId, w: r2.snapshotId, n: new Map([[r1.patientId, 'P'], [Q, 'Q'], [r1.snapshotId, 'v'], [r2.snapshotId, 'w']]) };
}
async function p6gwiazdka(u, U, sid, tak) { krok(60e3); await mutacja(u.S, U, tak ? 'gwiazdka' : 'odpięcie', () => U.v.setSnapshotPinned(gdzie(U, sid).patientId, sid, tak)); }
async function p6usunPacjenta(u, U, pid) { krok(60e3); await mutacja(u.S, U, 'usuń pacjenta', () => U.v.removePatient(pid)); }
async function p6przywroc(u, U, sid) {
  krok(60e3);
  const e = (await U.v.listTrashedSnapshots()).find((x) => x.snapshotId === sid);
  await mutacja(u.S, U, 'przywróć', () => U.v.restoreTrashedSnapshot(e.patientId, sid));
}
const p6notatka = async (u, U, tresc) => { krok(60e3); await mutacja(u.S, U, `notatka „${tresc}”`, () => U.v.savePatientNote({ id: u.nId, patientId: u.P, title: 'Fikcyjna', body: tresc, category: 'inne' })); };
const p6usunNotatke = async (u, U) => { krok(60e3); await mutacja(u.S, U, 'usuń notatkę', () => U.v.removePatientNote(u.nId)); };
// Wymiana zależna od świata: zdarzenia (pełne dostawy FIFO z hakami, spoczynek) albo same bloby (rundy PO-A).
const p6spoczynek = async (u, tryb) => (tryb === 'zdarzenia' ? spoczynek(u.S, u.A, u.B, { w2s: false }) : spoczynekBlobow(u.A, u.B));
const p6dostawa = async (u, X, Y, tryb) => {
  if (tryb === 'zdarzenia') return dostawa(u.S, X, Y, { w2s: false });
  await Y.v.mergeSyncPayload(json(await X.v.exportSyncPayload())); ustawStan(Y, await eksport(Y));
  return null;
};
const p6blob = async (X, Y) => { await Y.v.mergeSyncPayload(json(await X.v.exportSyncPayload())); ustawStan(Y, await eksport(Y)); };
const P6_DZIS = 'ZNANA RÓŻNICA (dzisiejsza, także przy samych blobach; naprawa: osobna poprawka reguły notatek — decyzja 9; pozycja planu: E2-PR3c (propozycja, do decyzji właściciela))';
const P6 = {
  'R2-0': { baza: p6r2, kroki: async (u, t) => { await p6gwiazdka(u, u.B, u.v, true); await popraw(u, u.B, u.v, 27); await popraw(u, u.A, u.v, 30); await p6spoczynek(u, t); } },
  'R3-0': { baza: p6r3, kroki: async (u, t) => { await p6notatka(u, u.A, 'Fikcyjna treść 2'); await p6usunPacjenta(u, u.B, u.P); await p6spoczynek(u, t); } },
  'R4-a': { baza: p6r4, kroki: async (u, t) => { await p6gwiazdka(u, u.A, u.v, true); await p6usunPacjenta(u, u.A, u.P); await doKosza(u, u.B, u.v); await p6spoczynek(u, t); } },
  'R4-a′': { baza: p6r4, kroki: async (u, t) => { await popraw(u, u.A, u.v, 40); await p6usunPacjenta(u, u.A, u.P); await doKosza(u, u.B, u.v); await p6spoczynek(u, t); } },
  'R4n (R4-b)': { baza: p6r4, kroki: async (u, t) => { await p6gwiazdka(u, u.A, u.v, true); await popraw(u, u.B, u.v, 42.6); await doKosza(u, u.A, u.v); await p6spoczynek(u, t); } },
  'R5-0': { baza: p6r4, kroki: async (u, t) => {
    await doKosza(u, u.B, u.v); krok(); await p6dostawa(u, u.B, u.A, t);
    await p6przywroc(u, u.B, u.v); await p6usunPacjenta(u, u.A, u.P); await p6spoczynek(u, t);
  } },
  // Dalsze ciągi (prefiks i pozycja planu, która ma je naprawić).
  'R2-E3': { znana: 'ZNANA RÓŻNICA (naprawa: E2-PR3a — kolejność ptomb przed snap — albo E3-PR0)', baza: p6r2, kroki: async (u, t) => {
    await p6gwiazdka(u, u.B, u.v, true); await popraw(u, u.B, u.v, 27); await popraw(u, u.A, u.v, 30); await p6spoczynek(u, t);
    await scal(u, u.A, u.P, u.Q); await p6spoczynek(u, t); // A (niższa rev) „Scal pacjentów” P → Q, id Q > id P
  } },
  'R5-E1': { znana: 'ZNANA RÓŻNICA (naprawa: E3-PR0)', baza: (S) => p6r4(S, { zC: true }), kroki: async (u, t) => {
    await doKosza(u, u.B, u.v); krok(); await p6dostawa(u, u.B, u.A, t);
    await p6przywroc(u, u.B, u.v); await p6usunPacjenta(u, u.A, u.P); await p6spoczynek(u, t);
    // trzecie urządzenie C (kopia sprzed kosza) zapisuje nową wizytę P i wysyła blob (etap 2)
    krok(60e3); await mutacja(u.S, u.C, 'C: nowa wizyta P', () => u.C.d.zapiszKarte(1, { wzrost: 130, masa: 25, zapis: { patientId: u.P, forceNewSnapshot: true } }));
    await p6blob(u.C, u.A); await p6blob(u.C, u.B);
  } },
  'R3-E1': { znana: 'ZNANA UTRATA (naprawa: E2-PR3c)', baza: p6r3, kroki: async (u, t) => {
    await p6notatka(u, u.A, 'A2'); await p6notatka(u, u.A, 'A3'); await p6usunNotatke(u, u.B); await p6spoczynek(u, t);
    // „Zostaw notatkę” (P5) na obu: A wcześniej, B później
    await p6notatka(u, u.A, 'wskrzeszona na A (wcześniej)'); await p6notatka(u, u.B, 'wskrzeszona na B (później)'); await p6spoczynek(u, t);
  } },
  'R3-E2': { znana: 'ZNANA UTRATA (naprawa: E2-PR3c)', baza: p6r3, kroki: async (u, t) => {
    await p6notatka(u, u.A, 'A2'); await p6notatka(u, u.A, 'A3');
    krok(); ustawStan(u.A, await eksport(u.A));
    u.C = await urzadzenie(u.S, 'C', u.A); // C: kopia A z „A3” (rev 3), poza siecią
    await p6usunNotatke(u, u.B); await p6spoczynek(u, t);
    await p6notatka(u, u.B, 'wskrzeszona na B'); await p6spoczynek(u, t);
    // C wraca: scala blob B, potem blob A; A i B scalają blob C (pełna wysyłka etapu 2)
    krok(60e3); await p6blob(u.B, u.C); await p6blob(u.A, u.C); await p6blob(u.C, u.A); await p6blob(u.C, u.B);
  } },
  // NOWE (2026-11-03): klasa dzisiejsza „notatka pod inną kartą” — zdarzenia, W4 i same bloby dają TĘ SAMĄ
  // różnicę (patientId notatki n), bo wynik robi reguła P-NOTATKI-1 (G5) dzisiejszego scalania, nie dziennik zdarzeń.
  // Pozycja planu w nazwie (P6_DZIS): E2-PR3c (propozycja, do decyzji właściciela; osobna poprawka reguły — decyzja 9).
  'Scal pacjentów P → Q na A, edycja notatki karty P na B (bez wiedzy o scaleniu)': { znana: P6_DZIS, notatki: true, baza: p6r3, kroki: async (u, t) => {
    await scal(u, u.A, u.P, u.Q); await p6notatka(u, u.B, 'edycja B'); await p6spoczynek(u, t);
  } },
  'skrzyżowane Scal pacjentów (A: P → Q, B: Q → P), notatka karty P': { znana: P6_DZIS, notatki: true, baza: p6r3, kroki: async (u, t) => {
    await scal(u, u.A, u.P, u.Q); await scal(u, u.B, u.Q, u.P); await p6spoczynek(u, t);
  } },
};
// Skutek kliniczny notatki n (scenariusze „notatka pod inną kartą”): pod którą kartą leży, jaka treść, czy karta jest
// i co pokazują listy notatek kart P i Q (listPatientNotesForPatient — lista w karcie pacjenta).
async function skutekNotatki(U, u) {
  const st = await eksport(U);
  const zywe = new Set((st.patients || []).map((p) => p.patientId));
  const n = (st.patientNotes || []).find((x) => x.id === u.nId);
  const listy = [];
  for (const pid of [u.P, u.Q]) {
    const l = (await U.v.listPatientNotesForPatient(pid)).map((x) => `${etykieta(u.n, x.id)} „${x.body}”`);
    listy.push(`karta ${etykieta(u.n, pid)}${zywe.has(pid) ? '' : ' (usunięta)'}: ${l.join(', ') || '-'}`);
  }
  const gdzieN = !n ? 'brak notatki n' : `n „${n.body}” pod ${etykieta(u.n, n.patientId)} — ${zywe.has(n.patientId) ? `widoczna w karcie ${etykieta(u.n, n.patientId)}` : `karta ${etykieta(u.n, n.patientId)} usunięta: n nie widać w żadnej karcie`}`;
  return `${gdzieN} | notatki w kartach: ${listy.join('; ')}`;
}
// Literały p. 6 (zmierzone; specyfikacja 2a, 3.4 i 3.6).
const P6_LITERALY = {
  'R2-0': {
    zdarzenia: ['wersja P/v: rev [R2]'],
    w4: {
      A: 'karty K2[#f57c:22] K3[#02bc:23] K4[#f1a7:24] K5[#1c0f:25] P[v:30*] Q[#7e8f:26] | Kosz - | notatki -',
      B: 'karty K2[#f57c:22] K3[#02bc:23] K4[#f1a7:24] K5[#1c0f:25] P[v:30*] Q[#7e8f:26] | Kosz - | notatki -',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
  },
  'R3-0': {
    zdarzenia: ['pnotetomb n: rev [R3]'],
    w4: {
      A: 'karty Q[#669b:22] | Kosz - | notatki -',
      B: 'karty Q[#669b:22] | Kosz - | notatki -',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
  },
  'R4-a': {
    zdarzenia: [
      'kosz v|P: payload._pinnedState.at, payload._pinnedState.pin, payload._pinned, rev, updatedAtISO, gwiazdka [R4a]',
    ],
    w4: {
      A: 'karty P[w:21] Q[#1c7f:30] | Kosz v@P:20* | notatki -',
      B: 'karty P[w:21] Q[#1c7f:30] | Kosz v@P:20* | notatki -',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
  },
  'R4-a′': {
    zdarzenia: [
      'kosz v|P: payload._contentAtISO, payload._pinnedState.h, payload.user.weight, rev, updatedAtISO [R4a′]',
    ],
    w4: {
      A: 'karty P[w:21] Q[#03aa:30] | Kosz v@P:40 | notatki -',
      B: 'karty P[w:21] Q[#03aa:30] | Kosz v@P:40 | notatki -',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
  },
  'R4n (R4-b)': {
    zdarzenia: [
      'kosz v|P: payload._pinnedState.at, payload._pinnedState.pin, payload._pinnedState.zl, payload._pinned [R4n]',
    ],
    w4: {
      A: 'karty P[w:21] Q[#b4f5:30] | Kosz v@P:42.6 | notatki -',
      B: 'karty P[w:21] Q[#b4f5:30] | Kosz v@P:42.6 | notatki -',
      r4n: 2,
      w4p: [true, true],
    },
    bloby: [],
  },
  'R5-0': {
    zdarzenia: ['kosz v|P: tylko A [R5]'],
    w4: {
      A: 'karty Q[#0241:30] | Kosz v@P:20 (ukryty) | notatki -',
      B: 'karty Q[#0241:30] | Kosz v@P:20 (ukryty) | notatki -',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
  },
  'R2-E3': {
    zdarzenia: ['wersja Q/v: tylko A'],
    w4: {
      A: 'karty K10[#c9c6:30] K11[#87d2:31] K12[#7181:32] K13[#a36c:33] K14[#a0ce:34] K2[#5f94:22] K3[#9ef4:23] K4[#ab9c:24] K5[#8c85:25] K6[#4d00:26] K7[#020f:27] K9[#ba07:29] Q[v:30* #e5ee:28 #1acb:28] | Kosz - | notatki -',
      B: 'karty K10[#c9c6:30] K11[#87d2:31] K12[#7181:32] K13[#a36c:33] K14[#a0ce:34] K2[#5f94:22] K3[#9ef4:23] K4[#ab9c:24] K5[#8c85:25] K6[#4d00:26] K7[#020f:27] K9[#ba07:29] Q[v:30* #e5ee:28 #1acb:28] | Kosz - | notatki -',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
  },
  'R5-E1': {
    zdarzenia: ['kosz v|P: tylko A', 'wersja P/v: tylko B'],
    w4: {
      rund: 2,
      A: 'karty P[w:21 #4a7d:25] Q[#d085:30] | Kosz v@P:20 | notatki -',
      B: 'karty P[w:21 #4a7d:25] Q[#d085:30] | Kosz v@P:20 | notatki -',
      C: 'karty P[w:21 #4a7d:25] Q[#d085:30] | Kosz v@P:20 | notatki -',
    },
    bloby: {
      AB: [],
      BC: ['kosz v|P: tylko B', 'wersja P/v: tylko C'],
      CA: ['kosz v|P: tylko A', 'wersja P/v: tylko C'],
    },
  },
  'R3-E1': {
    zdarzenia: ['pnote n: createdAtISO [createdAtISO-notatki]'],
    w4: {
      A: 'karty P[#34a9:22] Q[#9d24:22] | Kosz - | notatki n: wskrzeszona na A (wcześniej)',
      B: 'karty P[#34a9:22] Q[#9d24:22] | Kosz - | notatki n: wskrzeszona na A (wcześniej)',
      r4n: 0,
      w4p: [],
    },
    bloby: ['pnote n: createdAtISO [createdAtISO-notatki]'],
  },
  'R3-E2': {
    zdarzenia: [],
    w4: {
      rund: 1,
      A: 'karty P[#5051:22] Q[#fca6:22] | Kosz - | notatki n: A3',
      B: 'karty P[#5051:22] Q[#fca6:22] | Kosz - | notatki n: A3',
      C: 'karty P[#5051:22] Q[#fca6:22] | Kosz - | notatki n: A3',
    },
    bloby: {
      AB: [],
      BC: ['pnote n: createdAtISO [createdAtISO-notatki]'],
      CA: ['pnote n: createdAtISO [createdAtISO-notatki]'],
    },
  },
  // „notatka pod inną kartą” (klasa dzisiejsza): skutek kliniczny — treść notatki ta sama na obu (nic nie ginie), ale na
  // jednym urządzeniu notatka leży pod kartą usuniętą, więc w żadnej karcie jej nie widać (lista notatek karty jest pusta).
  'Scal pacjentów P → Q na A, edycja notatki karty P na B (bez wiedzy o scaleniu)': {
    zdarzenia: ['pnote n: patientId [notatka pod inną kartą]'],
    w4: {
      A: 'karty Q[#41a7:22 #71c4:22 #102a:22] | Kosz - | notatki n: edycja B',
      B: 'karty Q[#41a7:22 #71c4:22 #102a:22] | Kosz - | notatki n: edycja B',
      skutekA: 'n „edycja B” pod Q — widoczna w karcie Q | notatki w kartach: karta P (usunięta): -; karta Q: n „edycja B”',
      skutekB: 'n „edycja B” pod P — karta P usunięta: n nie widać w żadnej karcie | notatki w kartach: karta P (usunięta): n „edycja B”; karta Q: -',
      r4n: 0,
      w4p: [],
    },
    bloby: ['pnote n: patientId [notatka pod inną kartą]'],
    blobySkutek: {
      A: 'n „edycja B” pod Q — widoczna w karcie Q | notatki w kartach: karta P (usunięta): -; karta Q: n „edycja B”',
      B: 'n „edycja B” pod P — karta P usunięta: n nie widać w żadnej karcie | notatki w kartach: karta P (usunięta): n „edycja B”; karta Q: -',
    },
  },
  'skrzyżowane Scal pacjentów (A: P → Q, B: Q → P), notatka karty P': {
    zdarzenia: ['pnote n: patientId [notatka pod inną kartą]'],
    w4: {
      A: 'karty P[#ce45:22 #f06d:22 #b0cd:22] | Kosz - | notatki n: Fikcyjna treść',
      B: 'karty P[#ce45:22 #f06d:22 #b0cd:22] | Kosz - | notatki n: Fikcyjna treść',
      skutekA: 'n „Fikcyjna treść” pod Q — karta Q usunięta: n nie widać w żadnej karcie | notatki w kartach: karta P: -; karta Q (usunięta): n „Fikcyjna treść”',
      skutekB: 'n „Fikcyjna treść” pod P — widoczna w karcie P | notatki w kartach: karta P: n „Fikcyjna treść”; karta Q (usunięta): -',
      r4n: 0,
      w4p: [],
    },
    bloby: ['pnote n: patientId [notatka pod inną kartą]'],
    blobySkutek: {
      A: 'n „Fikcyjna treść” pod Q — karta Q usunięta: n nie widać w żadnej karcie | notatki w kartach: karta P: -; karta Q (usunięta): n „Fikcyjna treść”',
      B: 'n „Fikcyjna treść” pod P — widoczna w karcie P | notatki w kartach: karta P: n „Fikcyjna treść”; karta Q (usunięta): -',
    },
  },
};
async function p6swiat(nr, sc, tryb) {
  ustaw(START);
  const S = swiat(600 + nr);
  const los = rng(0x6006 + nr);
  vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || los)());
  const u = await sc.baza(S);
  u.S = S;
  await sc.kroki(u, tryb);
  for (const U of [u.A, u.B, u.C].filter(Boolean)) ustawStan(U, await eksport(U));
  return u;
}
async function p6D(u, X, Y) {
  const [a, b] = [kanon(await eksport(X)), kanon(await eksport(Y))];
  const d = await kr_cicho(u.S, async () => sklasyfikuj(D(a, b), a, b, { tabela: 'p6' }, async () => ({ x: await X.v.listTrashedSnapshots(), y: await Y.v.listTrashedSnapshots() })));
  return opisD(d, u.n, X.nazwa, Y.nazwa);
}
const P6_WYNIKI = {};
describe('A ≡ B, blok deterministyczny p. 6: znane klasy i dalsze ciągi (literały: zdarzenia, W4, same bloby)', () => {
  d1();
  for (const [nr, [nazwa, sc]] of Object.entries(P6).entries()) {
    it(`${sc.znana ? sc.znana + ' — ' : ''}${nazwa}`, async () => {
      const u = await p6swiat(nr, sc, 'zdarzenia');
      const trzy = !!u.C;
      const wynik = { zdarzenia: await p6D(u, u.A, u.B) };
      if (trzy) {
        const w = await w4Trzy(u.S, [u.A, u.B, u.C], u.n);
        expect(w.ok, 'W4 (trzy urządzenia)\n' + JSON.stringify(w, null, 1)).toBe(true);
        wynik.w4 = { rund: w.rund, ...w.opis };
      } else {
        const opisz = async (A1, B1) => ({ A: await kliniczny(A1, u.n), B: await kliniczny(B1, u.n), ...(sc.notatki ? { skutekA: await skutekNotatki(A1, u), skutekB: await skutekNotatki(B1, u) } : {}) });
        const w = await w4(u.S, u.A, u.B, { tabela: 'p6' }, { opisz });
        expect(w.ok, 'W4\n' + JSON.stringify(w.warianty, null, 1)).toBe(true);
        expect(w.warianty[1].opis, 'W4: PO-B ≡ PO-A').toEqual(w.warianty[0].opis);
        wynik.w4 = { ...w.warianty[0].opis, r4n: w.r4n, w4p: w.w4p.map((x) => x.ok) };
      }
      if (sc.notatki) {
        // Negatyw (3.6): ta sama różnica w profilu podstawowym (W1, W2r, W2s) i w W4 p. 1–5 — niedozwolona (czerwień).
        const [a, b] = [kanon(await eksport(u.A)), kanon(await eksport(u.B))];
        for (const tabela of ['podstawowy', 'W4', 'W4:p5']) {
          const d = await sklasyfikuj(D(a, b), a, b, { tabela, przebieg: 'E1-C' });
          expect(d.map((r) => [r.klasa, r.dozwolona]), `„notatka pod inną kartą” w tabeli ${tabela} — czerwień`).toEqual([[NPIK, false]]);
        }
      }
      await sprzatnijUrzadzenia(); vi.restoreAllMocks();
      const ub = await p6swiat(nr, sc, 'blob');
      wynik.bloby = trzy ? { AB: await p6D(ub, ub.A, ub.B), BC: await p6D(ub, ub.B, ub.C), CA: await p6D(ub, ub.C, ub.A) } : await p6D(ub, ub.A, ub.B);
      if (sc.notatki) wynik.blobySkutek = { A: await skutekNotatki(ub.A, ub), B: await skutekNotatki(ub.B, ub) };
      P6_WYNIKI[nazwa] = wynik;
      if (process.env.E2_AB_P6) appendFileSync(process.env.E2_AB_P6, JSON.stringify({ nazwa, ...wynik }) + '\n');
      expect(wynik, `literał p. 6: ${nazwa}`).toEqual(P6_LITERALY[nazwa]);
    }, 120_000);
  }
  it('klasa „notatka pod inną kartą” (pozycja planu: E2-PR3c (propozycja, do decyzji właściciela)): predykat i tabela dozwolonych (3.6) — czerwona w profilu podstawowym i w W4 p. 1–5', () => {
    const n = (pid) => ({ id: 'n', patientId: pid, title: 'Fikcyjna', rev: 2, updatedAtISO: '2026-03-02T08:10:00.000Z' });
    const r = { rodzaj: 'pnote', klucz: 'n', a: n('Q'), b: n('P'), tylko: null, sciezki: ['patientId'] };
    const st = (karty, nagr) => ({ patients: karty.map((p) => ({ patientId: p, snapshots: [] })), tombstones: nagr.map((p) => ({ patientId: p })) });
    expect(klasa(r, st(['Q'], ['P']), st(['Q'], ['P'])), 'karta P z nagrobkiem na obu').toBe(NPIK);
    expect(klasa(r, st(['P'], ['Q']), st(['P'], ['Q'])), 'karta Q z nagrobkiem na obu (skrzyżowane)').toBe(NPIK);
    expect(klasa(r, st(['Q'], ['P']), st(['P', 'Q'], [])), 'nagrobek tylko po jednej stronie — brak klasy').toBe(null);
    expect(klasa({ ...r, a: { ...n('Q'), rev: 3 }, sciezki: ['patientId', 'rev'] }, st(['Q'], ['P']), st(['Q'], ['P'])), 'inne pole poza patientId — brak klasy').toBe(null);
    const tak = Object.keys(DOZWOLONE).map((tabela) => [tabela, dozwolona(NPIK, r, { tabela, przebieg: 'E1-C' })]).filter(([, w]) => w);
    expect(tak, 'gdzie dozwolona').toEqual([['pelny', 'raport'], ['pelny:W4', 'raport'], ['p6', 'tak']]);
  });
});

// ── p. 7: koalescencja kolejki (reguła ogona, E2-PR2b) — literały ────────────────────────────────────────────────────
// Kolejki z łączeniem wpisów (doKolejkiOgon, wycięta Bob_plan sejfu), bez W2s. p. 7a — poprawki jednej wizyty z rzędu bez
// połączenia: jeden wpis tej wersji z najnowszą treścią. p. 7b — ratunek notatki za pełną kartą: nowy pnote(n) z haka H2
// nie zastępuje oczekującego pnote(n), bo za nim stoją snap i pfull karty (wpis zastąpiony „w miejscu” starego trafiłby
// przed pfull i odbiorca stosowałby notatkę, zanim karta wróci). p. 7c — odtworzenie punktów R3, które w przebiegu 40
// ziaren pojawiły się tylko przy wariancie „na koniec” (ziarno 10, punkty #51, #106, #124, #125): różnica wynika z ciągu
// operacji tego programu (B poprawia notatkę n, A ją usuwa, dostawy w obie strony), który bez łączenia wpisów i z regułą
// ogona daje tę samą klasę R3 (dozwoloną w W1); łączenie wpisów w tych krokach nie zachodzi. Program ziarna z wariantem
// „na koniec” jest inny, bo długość kolejki zmienia losowania klonu W2s; samo przeniesienie wpisu na koniec tej różnicy
// nie tworzy.
async function p7swiat(nr) {
  ustaw(START);
  const S = zKoalescencja(swiat(700 + nr));
  S.w2s = false;
  const los = rng(0x7007 + nr);
  vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || los)());
  return S;
}
const oczekujaceQ = (S, X, Y) => X.Q.slice(kursor(S, X, Y)).map((e) => [e.kind, e.key]);
async function trescWpisu(U, e) { return U.v.decryptPayloadForCurrentUser(e.env.iv, e.env.data); }
describe('A ≡ B, blok deterministyczny p. 7: koalescencja kolejki (reguła ogona)', () => {
  d1();
  it('p. 7a poprawki jednej wizyty z rzędu bez połączenia: 3 poprawki → Q_A ma 1 wpis tej wersji z najnowszą treścią; spoczynek, W1 = ∅, W2r, W4', async () => {
    const S = await p7swiat(1);
    const u = await p6r4(S); u.S = S;
    for (const kg of [31.1, 32.2, 33.3]) await popraw(u, u.A, u.v, kg);
    expect(oczekujaceQ(S, u.A, u.B), 'Q_A').toEqual([['snap', `${u.P}/${u.v}`]]);
    const tresc = await trescWpisu(u.A, u.A.Q[0]);
    const wersja = tresc.patients[0].snapshots.find((s) => s.snapshotId === u.v);
    expect(wersja.payload.user.weight, 'treść wpisu = ostatnia poprawka').toBe(33.3);
    expect([S.stat.koal, S.stat.koalWierszy, S.stat.koalPominiete], 'koalescencje').toEqual([2, 2, 0]);
    await spoczynekZgodny(S, u.A, u.B);
    const masaB = (await u.B.v.getPatient(u.P)).snapshots.find((s) => s.snapshotId === u.v).payload.user.weight;
    expect(masaB, 'B po spoczynku: ostatnia poprawka').toBe(33.3);
  }, 120_000);

  it('p. 7b ratunek notatki za pełną kartą: A poprawia notatkę n karty P, B usuwa P, A poprawia wizytę P; po dostawie B→A haki A dokładają pfull(P) i pnote(n) — Q_A [pnote, snap, pfull…, pnote] (oba pnote(n)); spoczynek: notatka n i karta P na obu, W1 = ∅, W2r, W4', async () => {
    const S = await p7swiat(2);
    const u = await p6r3(S); u.S = S;
    const v = u.A.stan.patients.find((p) => p.patientId === u.P).snapshots[0].snapshotId;
    await p6notatka(u, u.A, 'Fikcyjna poprawka notatki A');
    await p6usunPacjenta(u, u.B, u.P);
    await popraw(u, u.A, v, 34.9);
    expect(oczekujaceQ(S, u.A, u.B), 'Q_A przed dostawą').toEqual([['pnote', u.nId], ['snap', `${u.P}/${v}`]]);
    expect(u.B.Q.map((e) => e.kind), 'Q_B').toEqual(['ptomb', 'pnotetomb']);
    krok();
    const { dodane } = await dostawa(S, u.B, u.A);
    expect(dodane.map((k) => [k.event.kind, k.event.key]), 'haki A po partii B→A: pfull(P) (jedna porcja), pnote(n)').toEqual([['pfull', u.P], ['pnote', u.nId]]);
    expect(oczekujaceQ(S, u.A, u.B), 'Q_A po hakach: stary pnote(n) zostaje (nie jest ogonem)')
      .toEqual([['pnote', u.nId], ['snap', `${u.P}/${v}`], ['pfull', u.P], ['pnote', u.nId]]);
    expect([S.stat.koal, S.stat.koalPominiete], 'bez zastąpienia; jedno dopisanie z oczekującym wpisem tej encji').toEqual([0, 1]);
    await spoczynekZgodny(S, u.A, u.B);
    const stan = async (U) => { const k = kanon(await eksport(U)); return { karty: (k.patients || []).map((p) => p.patientId).sort(), notatki: (k.patientNotes || []).map((n) => [n.id, n.patientId, n.body]), nagrobkiNotatek: (k.patientNoteTombstones || []).length }; };
    const oczek = { karty: [u.P, u.Q].sort(), notatki: [[u.nId, u.P, 'Fikcyjna poprawka notatki A']], nagrobkiNotatek: 0 };
    expect({ A: await stan(u.A), B: await stan(u.B) }, 'po spoczynku: karta P i notatka n na obu').toEqual({ A: oczek, B: oczek });
  }, 120_000);

  it('p. 7c odtworzenie punktów R3 wariantu „na koniec” (ziarno 10 przebiegu 40 ziaren): B poprawia notatkę n, A ją usuwa, dostawy B→A i A→B — ta sama różnica R3 bez łączenia wpisów i z regułą ogona; W4', async () => {
    const wyniki = {};
    for (const tryb of ['bez łączenia', 'ogon']) {
      await sprzatnijUrzadzenia(); vi.restoreAllMocks();
      const S = await p7swiat(3);
      if (tryb === 'bez łączenia') { S.koalescencja = null; }
      const u = await p6r3(S); u.S = S;
      await p6notatka(u, u.B, 'Fikcyjna poprawka notatki B');
      await p6usunNotatke(u, u.A);
      krok(60e3); await dostawa(S, u.B, u.A);
      krok(60e3); await dostawa(S, u.A, u.B);
      expect(await spoczynek(S, u.A, u.B), raport(S, 'punkt spoczynku')).not.toBe(null);
      const d = await w1Klasy(S, u.A, u.B, { tabela: 'podstawowy' });
      const w = await w4Zgodne(S, u.A, u.B);
      wyniki[tryb] = { D: d.map((r) => [r.rodzaj, r.klasa, r.dozwolona, r.sciezki]), W4: w.ok, dziennik: S.dziennik.map((l) => l.replace(/^#\d+ [0-9:.]+ /, '')) };
    }
    const oczek = {
      D: [['pnotetomb', 'R3', 'tak', ['rev']]], W4: true,
      dziennik: ['B: notatka „Fikcyjna poprawka notatki B” → [pnote]', 'A: usuń notatkę → [pnotetomb]', 'dostawa B>A: 1 pełna [pnote]', 'dostawa A>B: 1 pełna [pnotetomb]'],
    };
    expect(wyniki, 'literał p. 7c').toEqual({ 'bez łączenia': oczek, ogon: oczek });
  }, 120_000);
});

// ── Klasy 3.6 i warunki W4/W4p: testy negatywne (poprawki po weryfikacji: P1, P2, P4, P5, P7) ─────────────────
// Predykat klasy, który przyjmuje więcej niż definicja 3.6, i tabela DOZWOLONE szersza niż tabela 3.6 schowałyby nową
// różnicę kliniczną w ziarnach spoza literałów i w punktach już obecnych w ZNANE_W1 (literał porównuje tylko klasy).
// Dlatego: dla każdej klasy przypadek pozytywny i negatywy z definicji na syntetycznych parach (bez sejfu), tabela 3.6
// literałem, a W4 i W4p — negatywy na stanach z p. 6 (W4p, który zawodzi, punkt stały, który nie zachodzi, różnica
// niedozwolona w tabeli 'W4').
const T0 = '2026-03-02T08:00:00.000Z', T1 = '2026-03-02T08:01:00.000Z';
const syntPl = (o = {}) => ({ user: { weight: 20 }, ...o });
const syntWersja = (o = {}) => ({ snapshotId: 'v', savedAtISO: T0, rev: 1, updatedAtISO: T0, payload: syntPl(), ...o });
const syntKosz = (o = {}) => ({ snapshotId: 'v', patientId: 'P', deletedAtISO: T0, rev: 1, updatedAtISO: T0, gwiazdka: false, payload: syntPl(), ...o });
const syntNotatka = (o = {}) => ({ id: 'n', patientId: 'P', title: 'Fikcyjna', body: 'Fikcyjna treść', category: 'inne', createdAtISO: T0, updatedAtISO: T0, rev: 1, ...o });
const syntNagrN = (o = {}) => ({ id: 'n', deletedAtISO: T0, rev: 1, ...o });
const syntStan = ({ karty = ['P'], nagrobki = [], wersje = [], kosz = [], notatki = [], nagrNotatek = [] } = {}) => ({
  patients: karty.map((p) => ({ patientId: p, header: { name: 'Testowy Jan' }, createdAtISO: T0, lastSavedAtISO: T0, snapshots: p === 'P' ? wersje : [] })),
  tombstones: nagrobki.map((p) => ({ patientId: p, deletedAtISO: T0 })),
  snapshotTombstones: kosz, patientNotes: notatki, patientNoteTombstones: nagrNotatek,
});
// Klasy różnic jednego rodzaju encji w D(X, Y).
const klasyRodzaju = (X, Y, rodzaj, kont = {}) => D(X, Y).filter((r) => r.rodzaj === rodzaj).map((r) => klasa(r, X, Y, kont));
// Tabela 3.6 jako literał (wiersz = klasa; kolumny: W1/W2r/W2s profilu podstawowego, W4 profilu podstawowego i p. 1–4 i P1e,
// W4 p. 5, W1/W2r/W2s profilu pełnego, W4 profilu pełnego, p. 6). '—' = czerwień. R4n w W4 p. 5: '—' (W4p nie jest tam
// liczony — P4); E1-katalog w W4 p. 5 dodatkowo tylko dla listy E1_KATALOG, createdAtISO-notatki w W4 pełnym tylko przy
// notatce z „Zostaw notatkę” (dozwolona()).
const TABELA_3_6 = {
  R2: ['tak', '—', '—', 'raport', '—', 'tak'],
  R3: ['tak', '—', '—', 'raport', '—', 'tak'],
  R4a: ['tak', '—', '—', 'raport', '—', 'tak'],
  R5: ['tak', '—', '—', 'raport', '—', 'tak'],
  'R4a′': ['—', '—', '—', 'raport', '—', 'tak'],
  R4n: ['tak', 'tak', '—', 'raport', 'tak', 'tak'],
  'createdAtISO-notatki': ['—', '—', '—', 'raport', 'raport', 'tak'],
  D7: ['—', '—', '—', 'raport', 'raport', '—'],
  [E1]: ['—', '—', 'tak', '—', '—', '—'],
  [NPIK]: ['—', '—', '—', 'raport', 'raport', 'tak'],
};
const TABELE_3_6 = ['podstawowy', 'W4', 'W4:p5', 'pelny', 'pelny:W4', 'p6'];
describe('A ≡ B, klasy 3.6: predykaty (pozytywy i negatywy), tabela DOZWOLONE, negatywy W4 i W4p', () => {
  d1();
  it('R2 — wersja na obu, równa poza rev, |Δrev| = 1; Δrev 2 albo inne pole → brak klasy', () => {
    const p = (a, b) => klasyRodzaju(syntStan({ wersje: [syntWersja(a)] }), syntStan({ wersje: [syntWersja(b)] }), 'wersja');
    expect(p({ rev: 1 }, { rev: 2 }), 'Δrev 1').toEqual(['R2']);
    expect(p({ rev: 1 }, { rev: 3 }), 'Δrev 2').toEqual([null]);
    expect(p({ rev: 1 }, { rev: 2, payload: syntPl({ user: { weight: 21 } }) }), 'Δrev 1 i masa').toEqual([null]);
    expect(p({ rev: 1 }, { rev: 2, updatedAtISO: T1 }), 'Δrev 1 i updatedAtISO').toEqual([null]);
    expect(klasyRodzaju(syntStan({ wersje: [syntWersja()] }), syntStan(), 'wersja'), 'wersja po jednej stronie').toEqual([null]);
  });
  it('R3 — nagrobek notatki na obu, równy poza rev, notatki nie ma po żadnej stronie; notatka po jednej stronie albo inne pole → brak klasy', () => {
    const X = syntStan({ nagrNotatek: [syntNagrN({ rev: 1 })] });
    expect(klasyRodzaju(X, syntStan({ nagrNotatek: [syntNagrN({ rev: 2 })] }), 'pnotetomb')).toEqual(['R3']);
    expect(klasyRodzaju(X, syntStan({ nagrNotatek: [syntNagrN({ rev: 2 })], notatki: [syntNotatka()] }), 'pnotetomb'), 'notatka po stronie Y').toEqual([null]);
    expect(klasyRodzaju(syntStan({ nagrNotatek: [syntNagrN({ rev: 1 })], notatki: [syntNotatka()] }), syntStan({ nagrNotatek: [syntNagrN({ rev: 2 })] }), 'pnotetomb'), 'notatka po stronie X').toEqual([null]);
    expect(klasyRodzaju(X, syntStan({ nagrNotatek: [syntNagrN({ rev: 2, deletedAtISO: T1 })] }), 'pnotetomb'), 'rev i deletedAtISO').toEqual([null]);
  });
  it('R4a / R4a′ — wpis kosza żywej karty na obu: opis i gwiazdka (R4a), z inną treścią (R4a′); karta z nagrobkiem albo tylko pola payload → nie R4a', () => {
    const zywa = { karty: ['P'] }, martwa = { karty: ['P'], nagrobki: ['P'] };
    const X = (s = zywa) => syntStan({ ...s, kosz: [syntKosz()] });
    const Y = (o, s = zywa) => syntStan({ ...s, kosz: [syntKosz(o)] });
    const gwiazdka = { rev: 2, updatedAtISO: T1, gwiazdka: true, payload: syntPl({ _pinned: true, _pinnedState: { pin: true } }) };
    expect(klasyRodzaju(X(), Y(gwiazdka), 'kosz'), 'opis i gwiazdka').toEqual(['R4a']);
    expect(klasyRodzaju(X(), Y({ rev: 2, updatedAtISO: T1 }), 'kosz'), 'sam opis — R4a przed D7 (pierwszy pasujący)').toEqual(['R4a']);
    expect(klasyRodzaju(X(martwa), Y(gwiazdka, martwa), 'kosz'), 'karta z nagrobkiem po obu stronach').toEqual([null]);
    expect(klasyRodzaju(X(zywa), Y(gwiazdka, martwa), 'kosz'), 'nagrobek karty po jednej stronie').toEqual([null]);
    expect(klasyRodzaju(X({ karty: [] }), Y(gwiazdka, { karty: [] }), 'kosz'), 'brak karty').toEqual([null]);
    expect(klasyRodzaju(X(), Y({ payload: syntPl({ _pinned: true }) }), 'kosz'), 'tylko pole payload (bez kont.kosz)').toEqual([null]);
    const masa = { rev: 2, updatedAtISO: T1, payload: syntPl({ user: { weight: 40 } }) };
    expect(klasyRodzaju(X(), Y(masa), 'kosz'), 'opis i masa').toEqual(['R4a′']);
    expect(klasyRodzaju(X(martwa), Y(masa, martwa), 'kosz'), 'opis i masa, karta z nagrobkiem').toEqual([null]);
    expect(klasyRodzaju(X(), Y({ payload: syntPl({ user: { weight: 40 } }) }), 'kosz'), 'sama masa (bez pola spoza payload)').toEqual([null]);
  });
  it('R4n — wpis kosza na obu, różni się tylko postacią gwiazdki w treści, widok Kosza obu stron równy; inny widok, brak odczytu Kosza albo inne pole → brak klasy', () => {
    const pin = syntPl({ _pinned: true, _pinnedState: { pin: true, at: T1 } }), bez = syntPl({ _pinned: false });
    const X = syntStan({ kosz: [syntKosz({ payload: pin })] }), Y = syntStan({ kosz: [syntKosz({ payload: bez })] });
    const widok = (pinned, p) => ({ snapshotId: 'v', patientId: 'P', pinned, patientExists: true, payload: p });
    expect(klasyRodzaju(X, Y, 'kosz', { kosz: { x: [widok(true, pin)], y: [widok(true, bez)] } }), 'widok równy (pinned jak pole widoku)').toEqual(['R4n']);
    expect(klasyRodzaju(X, Y, 'kosz', { kosz: { x: [widok(true, pin)], y: [widok(false, bez)] } }), 'inny widok (pinned)').toEqual([null]);
    expect(klasyRodzaju(X, Y, 'kosz', { kosz: { x: [widok(true, pin)], y: [] } }), 'wpis tylko w jednym widoku').toEqual([null]);
    expect(klasyRodzaju(X, Y, 'kosz'), 'bez odczytu Kosza').toEqual([null]);
    const Yrev = syntStan({ karty: ['P'], nagrobki: ['P'], kosz: [syntKosz({ payload: bez, rev: 2 })] });
    const Xm = syntStan({ karty: ['P'], nagrobki: ['P'], kosz: [syntKosz({ payload: pin })] });
    expect(klasyRodzaju(Xm, Yrev, 'kosz', { kosz: { x: [widok(true, pin)], y: [widok(true, bez)] } }), 'postać gwiazdki i rev (karta z nagrobkiem)').toEqual([null]);
  });
  it('R5 — wpis kosza tylko po jednej stronie, karty nie ma na żadnej, nagrobek karty na obu; nagrobek po jednej stronie albo karta → brak klasy', () => {
    const X = syntStan({ karty: [], nagrobki: ['P'], kosz: [syntKosz()] });
    expect(klasyRodzaju(X, syntStan({ karty: [], nagrobki: ['P'] }), 'kosz')).toEqual(['R5']);
    expect(klasyRodzaju(X, syntStan({ karty: [], nagrobki: [] }), 'kosz'), 'nagrobek tylko po stronie X').toEqual([null]);
    expect(klasyRodzaju(syntStan({ karty: [], kosz: [syntKosz()] }), syntStan({ karty: [], nagrobki: ['P'] }), 'kosz'), 'nagrobek tylko po stronie Y').toEqual([null]);
    expect(klasyRodzaju(X, syntStan({ karty: ['P'], nagrobki: ['P'] }), 'kosz'), 'karta po stronie Y').toEqual([null]);
  });
  it('createdAtISO-notatki i D7 — tylko pola z definicji; pole spoza listy (także revPary) → brak klasy', () => {
    const n = (o) => klasyRodzaju(syntStan({ notatki: [syntNotatka()] }), syntStan({ notatki: [syntNotatka(o)] }), 'pnote');
    expect(n({ createdAtISO: T1 })).toEqual(['createdAtISO-notatki']);
    expect(n({ createdAtISO: T1, body: 'Fikcyjna treść 2' }), 'createdAtISO i treść').toEqual([null]);
    expect(n({ createdAtISO: T1, updatedAtISO: T1 }), 'createdAtISO i updatedAtISO').toEqual([null]);
    const k = (o, s = { karty: ['P'] }) => klasyRodzaju(syntStan({ ...s, kosz: [syntKosz()] }), syntStan({ ...s, kosz: [syntKosz(o)] }), 'kosz');
    expect(k({ koszISO: T1, zmianaISO: T1 }), 'koszISO, zmianaISO (żywa karta)').toEqual(['D7']);
    expect(k({ rev: 2, updatedAtISO: T1 }, { karty: ['P'], nagrobki: ['P'] }), 'rev, updatedAtISO (karta z nagrobkiem)').toEqual(['D7']);
    expect(k({ koszISO: T1, payload: syntPl({ user: { weight: 21 } }) }), 'koszISO i masa').toEqual([null]);
    expect(k({ koszISO: T1, deletedAtISO: T1 }), 'koszISO i deletedAtISO').toEqual([null]);
    expect(k({ revPary: 2 }), 'revPary').toEqual([null]);
  });
  it('D: ścieżki zawsze niepuste — różnica bez wskazanej ścieżki (duplikat tożsamości w tablicy) daje (wartość) i brak klasy (P7)', () => {
    const nagr = (arr) => ({ patientNoteTombstones: [{ id: 't', rev: 1, deletedAtISO: T0, x: arr }] });
    const [a, b] = [kanon(nagr([{ id: 'q', v: 1 }, { id: 'q', v: 2 }])), kanon(nagr([{ id: 'q', v: 2 }]))];
    const d = D(a, b);
    expect(d.map((r) => [r.rodzaj, r.klucz, r.sciezki])).toEqual([['pnotetomb', 't', ['(wartość)']]]);
    expect(d.map((r) => klasa(r, a, b, {})), 'pusta lista ścieżek nie spełnia predykatu').toEqual([null]);
  });
  it('tabela DOZWOLONE = tabela 3.6 (literał) i reguły dozwolona(); klasa null nigdzie', () => {
    const oczek = Object.fromEntries(TABELE_3_6.map((t) => [t, {}]));
    for (const [kl, wiersz] of Object.entries(TABELA_3_6)) wiersz.forEach((w, i) => { if (w !== '—') oczek[TABELE_3_6[i]][kl] = w; });
    expect(json(DOZWOLONE), 'DOZWOLONE (3.6)').toEqual(oczek);
    expect(Object.isFrozen(DOZWOLONE)).toBe(true);
    const r = { rodzaj: 'pnote', klucz: 'n' };
    expect(dozwolona('createdAtISO-notatki', r, { tabela: 'pelny:W4', wskrzeszone: new Set() }), 'pelny:W4 bez „Zostaw notatkę”').toBe(false);
    expect(dozwolona('createdAtISO-notatki', r, { tabela: 'pelny:W4', wskrzeszone: new Set(['n']) }), 'pelny:W4 po „Zostaw notatkę”').toBe('raport');
    expect(dozwolona('R4n', r, { tabela: 'W4:p5', przebieg: 'E1-C' }), 'R4n w W4 p. 5 (bez W4p)').toBe(false);
    for (const t of TABELE_3_6) expect(dozwolona(null, r, { tabela: t, przebieg: 'E1-C', wskrzeszone: new Set(['n']) }), `null w ${t}`).toBe(false);
  });
  const nrP6 = (nazwa) => Object.keys(P6).indexOf(nazwa);
  it('W4p — negatywy: R4-a (inny widok Kosza, inna gwiazdka po „Przywróć”) i R4-a′ (inna masa) nie przechodzą; R4n przechodzi', async () => {
    const wynik = {};
    for (const nazwa of ['R4-a', 'R4-a′', 'R4n (R4-b)']) {
      const u = await p6swiat(nrP6(nazwa), P6[nazwa], 'zdarzenia');
      const p = await kr_cicho(u.S, async () => w4p(u.S, u.A, u.B, u.v, u.P));
      wynik[nazwa] = { ok: p.ok, widokRowny: p.widokRowny, rowne: p.rowne, zniknal: p.zniknal };
      await sprzatnijUrzadzenia(); vi.restoreAllMocks();
    }
    expect(wynik).toEqual({
      'R4-a': { ok: false, widokRowny: false, rowne: false, zniknal: true }, // po „Przywróć” gwiazdka tylko na A
      'R4-a′': { ok: false, widokRowny: false, rowne: false, zniknal: true },
      'R4n (R4-b)': { ok: true, widokRowny: true, rowne: true, zniknal: true },
    });
  }, 120_000);
  it('W4 i W4 trzech urządzeń — R4n bez udanego W4p jest czerwone (wynik W4p nie jest pomijany)', async () => {
    const u = await p6swiat(nrP6('R4n (R4-b)'), P6['R4n (R4-b)'], 'zdarzenia');
    const zly = async () => ({ ok: false, widokRowny: true, rowne: false, zniknal: true, roznice: [] });
    const skrot = (w) => [w.ok, w.r4n, w.w4p.map((p) => p.ok)];
    expect(skrot(await w4(u.S, u.A, u.B, { tabela: 'p6' }, { warianty: ['PO-A'] })), 'prawdziwe W4p').toEqual([true, 1, [true]]);
    expect(skrot(await w4(u.S, u.A, u.B, { tabela: 'p6' }, { warianty: ['PO-A'], dowodR4n: zly })), 'W4p zawodzi').toEqual([false, 1, [false]]);
    expect(skrot(await w4(u.S, u.A, u.B, { tabela: 'W4' }, { warianty: ['PO-A'], dowodR4n: zly })), 'W4p zawodzi (tabela W4)').toEqual([false, 1, [false]]);
    krok(); const C = await urzadzenie(u.S, 'C', u.A); // trzecie urządzenie: bliźniak A (ta sama postać gwiazdki co A)
    const trzy = async (o) => { const w = await w4Trzy(u.S, [u.A, u.B, C], u.n, o); return [w.ok, w.pary.map((p) => p.w4p.map((x) => x.ok))]; };
    const prawdziwe = await trzy();
    expect(prawdziwe[0], 'W4 trzech urządzeń: prawdziwe W4p').toBe(true);
    expect(prawdziwe[1].flat().length, 'co najmniej jedna para z R4n').toBeGreaterThan(0);
    expect((await trzy({ dowodR4n: zly }))[0], 'W4 trzech urządzeń: W4p zawodzi').toBe(false);
  }, 120_000);
  it('W4 — negatywy: różnica niedozwolona w tabeli W4 (notatka pod inną kartą) i brak punktu stałego są czerwone', async () => {
    const npik = await p6swiat(nrP6('Scal pacjentów P → Q na A, edycja notatki karty P na B (bez wiedzy o scaleniu)'), P6['Scal pacjentów P → Q na A, edycja notatki karty P na B (bez wiedzy o scaleniu)'], 'zdarzenia');
    const roz = (w) => [w.ok, w.warianty.map((x) => x.roznice.map((r) => [r.rodzaj, r.klasa, r.dozwolona]))];
    expect(roz(await w4(npik.S, npik.A, npik.B, { tabela: 'p6' }, { warianty: ['PO-A'] })), 'p. 6: dozwolona').toEqual([true, [[['pnote', NPIK, 'tak']]]]);
    expect(roz(await w4(npik.S, npik.A, npik.B, { tabela: 'W4' }, { warianty: ['PO-A'] })), 'tabela W4: czerwień').toEqual([false, [[['pnote', NPIK, false]]]]);
    await sprzatnijUrzadzenia(); vi.restoreAllMocks();
    const u = await p6swiat(nrP6('R2-0'), P6['R2-0'], 'zdarzenia');
    const stale = await w4(u.S, u.A, u.B, { tabela: 'W4' }, { warianty: ['PO-A'] });
    expect([stale.ok, stale.warianty[0].punktStaly, stale.warianty[0].roznice], 'R2-0: W4 zielone, punkt stały').toEqual([true, true, []]);
    // druga runda zmienia eksport jednego klonu (zapis po wymianie) — punkt stały nie zachodzi
    const zmieniajaca = async (X, Y, nr) => {
      await rundaPO(X, Y);
      if (nr === 2) { await X.v.saveNote({ title: 'Fikcyjny szablon po wymianie', body: 'Fikcyjna' }); ustawStan(X, await eksport(X)); }
    };
    const bez = await w4(u.S, u.A, u.B, { tabela: 'W4' }, { warianty: ['PO-A'], runda: zmieniajaca });
    expect([bez.ok, bez.warianty[0].punktStaly], 'bez punktu stałego: czerwień').toEqual([false, false]);
  }, 120_000);
});

// ── Właściwość A ≡ B (program losowy) ───────────────────────────────────────────────────────────────────────────────
// Ziarna: E2_AB_ZIARNA (domyślnie 8) od E2_AB_START (1); E2_AB_KROKI — liczba mutacji na ziarno (domyślnie 60–120
// z ziarna, łącznie na A i B). Krok zegara 1–120 s (nagrobki < 365 dni, treść kosza < 30 dni — filtry nic nie tną).
const ILE_ZIAREN = Number(process.env.E2_AB_ZIARNA) || 8;
const START_ZIAREN = Number(process.env.E2_AB_START) || 1;
const ZIARNA = Array.from({ length: ILE_ZIAREN }, (_, i) => START_ZIAREN + i);
const KROKI = Number(process.env.E2_AB_KROKI) || 0;
// E2_AB_WYNIKI=plik — wynik każdego ziarna (liczniki, różnice, dziennik operacji) dopisywany jako JSONL (pomiar).
const WYNIKI = { podstawowy: [], pelny: [], 'podstawowy:ogon': [], 'pelny:ogon': [] };
const wybierz = (los, lista) => lista[Math.floor(los() * lista.length)];
const masa = (los) => 15 + Math.floor(los() * 300) / 10;
// Mutacje profilu podstawowego (projekt.md 7.4): zapis karty i nowej wersji, poprawka w miejscu (preserveSavedAt),
// gwiazdka, kosz (nigdy najnowszej wersji karty na tym urządzeniu — inaczej znane ograniczenie E1 „obecność”, w którym
// także bloby dają różne urządzenia różnie), „Przywróć”, „Usuń pacjenta”, notatka pacjenta, notatka biblioteki, lista,
// zmiana hasła (iteracje 1000). Profil pełny dodatkowo: retencja, „Scal pacjentów” z koszem po scaleniu, przypięta
// wizyta w retencji i „Zostaw notatkę” (wskrzeszenie notatki pacjenta jak w odtworzeniu R3-E1).
const WAGI = {
  podstawowy: { nowaKarta: 7, nowaWersja: 16, poprawka: 14, gwiazdka: 8, kosz: 10, przywroc: 6, usunPacjenta: 4, notatkaPacjenta: 8, usunNotatkePacjenta: 3, notatka: 5, usunNotatke: 2, lista: 5, usunListe: 2, haslo: 2 },
  pelny: { nowaKarta: 7, nowaWersja: 16, poprawka: 14, gwiazdka: 8, kosz: 10, przywroc: 6, usunPacjenta: 4, notatkaPacjenta: 8, usunNotatkePacjenta: 3, notatka: 5, usunNotatke: 2, lista: 5, usunListe: 2, haslo: 2, retencja: 5, scal: 4, retencjaPrzypietej: 3, zostawNotatke: 3 },
};
function losujOperacje(los, profil) {
  const w = WAGI[profil];
  let r = los() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const [k, v] of Object.entries(w)) { r -= v; if (r < 0) return k; }
  return 'nowaKarta';
}
async function wersjaZTresca(U, pid, sid) {
  const p = await U.v.getPatient(pid);
  return p && p.snapshots.find((s) => s.snapshotId === sid);
}
// Jedna mutacja na X; false, gdy warunek wstępny nie jest spełniony (nic się nie dzieje, losowanie od nowa).
async function losowaMutacja(S, X, profil) {
  const los = S.los;
  const op = losujOperacje(los, profil);
  const karty = X.stan.patients || [];
  const karta = karty.length ? wybierz(los, karty) : null;
  const wersja = karta ? wybierz(los, karta.snapshots) : null;
  const nr = (pid) => S.indeks.get(pid) || 1;
  switch (op) {
    case 'nowaKarta': {
      if (karty.length >= 7) return false;
      S.nrKarty += 1;
      const i = S.nrKarty;
      await mutacja(S, X, `nowa karta ${i}`, async () => { const r = await X.d.zapiszKarte(i, { masa: masa(los) }); S.indeks.set(r.patientId, i); return r; });
      return true;
    }
    case 'nowaWersja':
      if (!karta) return false;
      await mutacja(S, X, `nowa wersja ${nr(karta.patientId)}`, () => X.d.zapiszKarte(nr(karta.patientId), { wzrost: 100 + Math.floor(los() * 60), masa: masa(los), zapis: { patientId: karta.patientId, forceNewSnapshot: true } }));
      return true;
    case 'poprawka': {
      if (!wersja) return false;
      const s = await wersjaZTresca(X, karta.patientId, wersja.snapshotId);
      if (!s || !s.payload) return false;
      const kg = masa(los);
      await mutacja(S, X, `poprawka ${nr(karta.patientId)}/${wersja.snapshotId.slice(0, 4)} ${kg} kg`, () => X.v.updateSnapshotPayload(karta.patientId, wersja.snapshotId, { ...s.payload, user: { ...s.payload.user, weight: kg } }, { preserveSavedAt: true }));
      return true;
    }
    case 'gwiazdka': {
      if (!wersja) return false;
      const s = await wersjaZTresca(X, karta.patientId, wersja.snapshotId);
      if (!s || !s.payload) return false;
      await mutacja(S, X, `${s.pinned ? 'odpięcie' : 'gwiazdka'} ${nr(karta.patientId)}/${wersja.snapshotId.slice(0, 4)}`, () => X.v.setSnapshotPinned(karta.patientId, wersja.snapshotId, !s.pinned));
      return true;
    }
    case 'kosz': {
      if (!karta || karta.snapshots.length < 2) return false;
      const najnowsza = naj(karta.snapshots).snapshotId;
      const cel = wybierz(los, karta.snapshots.filter((s) => s.snapshotId !== najnowsza));
      await mutacja(S, X, `kosz ${nr(karta.patientId)}/${cel.snapshotId.slice(0, 4)}`, () => X.v.moveSnapshotToTrash(karta.patientId, cel.snapshotId, { odepnij: true }));
      return true;
    }
    case 'przywroc': {
      const ids = new Set(karty.map((p) => p.patientId));
      const wKartach = new Set(karty.flatMap((p) => p.snapshots.map((s) => s.snapshotId)));
      const kosz = (await X.v.listTrashedSnapshots()).filter((e) => ids.has(e.patientId) && !wKartach.has(e.snapshotId));
      if (!kosz.length) return false;
      const e = wybierz(los, kosz);
      await mutacja(S, X, `przywróć ${nr(e.patientId)}/${e.snapshotId.slice(0, 4)}`, () => X.v.restoreTrashedSnapshot(e.patientId, e.snapshotId));
      return true;
    }
    case 'usunPacjenta':
      if (!karta || karty.length < 2) return false;
      await mutacja(S, X, `usuń pacjenta ${nr(karta.patientId)}`, () => X.v.removePatient(karta.patientId));
      return true;
    case 'notatkaPacjenta': {
      const notatki = (X.stan.patientNotes || []).filter((n) => karty.some((p) => p.patientId === n.patientId));
      if (notatki.length && los() < 0.4) {
        const n = wybierz(los, notatki);
        await mutacja(S, X, `edycja notatki pacjenta ${n.id.slice(0, 4)}`, () => X.v.savePatientNote({ id: n.id, patientId: n.patientId, title: n.title || 'Fikcyjna', body: `Fikcyjna treść ${Math.floor(los() * 1000)}`, category: 'inne' }));
        return true;
      }
      if (!karta) return false;
      await mutacja(S, X, `notatka pacjenta ${nr(karta.patientId)}`, () => X.v.savePatientNote({ patientId: karta.patientId, title: 'Fikcyjna notatka', body: `Fikcyjna treść ${Math.floor(los() * 1000)}`, category: 'inne' }));
      return true;
    }
    case 'usunNotatkePacjenta': {
      const notatki = X.stan.patientNotes || [];
      if (!notatki.length) return false;
      const n = wybierz(los, notatki);
      await mutacja(S, X, `usuń notatkę pacjenta ${n.id.slice(0, 4)}`, () => X.v.removePatientNote(n.id));
      return true;
    }
    case 'notatka': {
      const notatki = X.stan.notes || [];
      if (notatki.length && los() < 0.4) {
        const n = wybierz(los, notatki);
        await mutacja(S, X, `edycja notatki ${n.id.slice(0, 4)}`, () => X.v.saveNote({ id: n.id, title: n.title || 'Fikcyjny szablon', body: `Fikcyjny ${Math.floor(los() * 1000)}` }));
        return true;
      }
      await mutacja(S, X, 'notatka biblioteki', () => X.v.saveNote({ title: 'Fikcyjny szablon', body: `Fikcyjny ${Math.floor(los() * 1000)}` }));
      return true;
    }
    case 'usunNotatke': {
      const notatki = X.stan.notes || [];
      if (!notatki.length) return false;
      const n = wybierz(los, notatki);
      await mutacja(S, X, `usuń notatkę ${n.id.slice(0, 4)}`, () => X.v.removeNote(n.id));
      return true;
    }
    case 'lista': {
      const listy = X.stan.patientLists || [];
      const czlonkowie = karty.filter(() => los() < 0.5).map((p) => p.patientId);
      if (listy.length && los() < 0.4) {
        const l = wybierz(los, listy);
        await mutacja(S, X, `edycja listy ${l.id.slice(0, 4)}`, () => X.v.savePatientList({ id: l.id, name: l.name || 'Fikcyjna lista', memberIds: czlonkowie }));
        return true;
      }
      await mutacja(S, X, 'lista', () => X.v.savePatientList({ name: `Fikcyjna lista ${Math.floor(los() * 100)}`, memberIds: czlonkowie }));
      return true;
    }
    case 'usunListe': {
      const listy = X.stan.patientLists || [];
      if (!listy.length) return false;
      const l = wybierz(los, listy);
      await mutacja(S, X, `usuń listę ${l.id.slice(0, 4)}`, () => X.v.deletePatientList(l.id));
      return true;
    }
    case 'haslo':
      await zmianaHasla(S, X);
      return true;
    case 'zostawNotatke': {
      // „Zostaw notatkę” (P5): zapis notatki pacjenta o znanym id, której tu już nie ma (edytor
      // otwarty przed usunięciem na tym albo innym urządzeniu) — wskrzeszenie od rev nagrobka (vilda_vault.js:7662, 7670).
      const nagr = (X.stan.patientNoteTombstones || []).filter((t) => X.znaneNotatki.has(t.id) && karty.some((p) => p.patientId === X.znaneNotatki.get(t.id).patientId));
      if (!nagr.length) return false;
      const t = wybierz(los, nagr);
      const z = X.znaneNotatki.get(t.id);
      S.wskrzeszone.add(t.id);
      await mutacja(S, X, `zostaw notatkę ${t.id.slice(0, 4)}`, () => X.v.savePatientNote({ id: t.id, patientId: z.patientId, title: z.title || 'Fikcyjna notatka', body: `Fikcyjna treść zostawiona ${Math.floor(los() * 1000)}`, category: 'inne' }));
      return true;
    }
    case 'retencja':
      if (!karta || karta.snapshots.length < 2) return false;
      await mutacja(S, X, `retencja ${nr(karta.patientId)}`, () => X.v.pruneSnapshotsForPatient(karta.patientId, { recentHours: 0 }));
      return true;
    case 'retencjaPrzypietej': {
      if (!karta || karta.snapshots.length < 2) return false;
      const najnowsza = naj(karta.snapshots).snapshotId;
      const cel = wybierz(los, karta.snapshots.filter((s) => s.snapshotId !== najnowsza));
      const s = await wersjaZTresca(X, karta.patientId, cel.snapshotId);
      if (!s || !s.payload) return false;
      if (!s.pinned) await mutacja(S, X, `gwiazdka ${nr(karta.patientId)}/${cel.snapshotId.slice(0, 4)}`, () => X.v.setSnapshotPinned(karta.patientId, cel.snapshotId, true));
      krok(1000 + Math.floor(los() * 60e3));
      await mutacja(S, X, `retencja przypiętej ${nr(karta.patientId)}`, () => X.v.pruneSnapshotsForPatient(karta.patientId, { recentHours: 0 }));
      return true;
    }
    case 'scal': {
      if (karty.length < 2) return false;
      const z = karta, na = wybierz(los, karty.filter((p) => p.patientId !== z.patientId));
      await mutacja(S, X, `Scal pacjentów ${nr(z.patientId)} → ${nr(na.patientId)}`, () => X.v.mergePatients(z.patientId, na.patientId));
      if (los() < 0.5) {
        krok(1000 + Math.floor(los() * 60e3));
        const cel = (X.stan.patients || []).find((p) => p.patientId === na.patientId);
        if (cel && cel.snapshots.length >= 2) {
          const najnowsza = naj(cel.snapshots).snapshotId;
          const w = wybierz(los, cel.snapshots.filter((q) => q.snapshotId !== najnowsza));
          await mutacja(S, X, `kosz po scaleniu ${nr(na.patientId)}/${w.snapshotId.slice(0, 4)}`, () => X.v.moveSnapshotToTrash(na.patientId, w.snapshotId, { odepnij: true }));
        }
      }
      return true;
    }
    default: throw new Error('nieznana operacja ' + op);
  }
}
// Dostawa losowa: kierunek, FIFO-prefiks k (połowa dostaw pełna), czasem powtórka sufiksu.
async function losowaDostawa(S, A, B) {
  const los = S.los;
  const [X, Y] = los() < 0.5 ? [A, B] : [B, A];
  const c = kursor(S, X, Y);
  const cofnij = c > 0 && los() < 0.15 ? 1 + Math.floor(los() * Math.min(c, 4)) : 0;
  const oczekujace = X.Q.length - c + cofnij;
  if (!oczekujace) return;
  const k = los() < 0.5 ? oczekujace : 1 + Math.floor(los() * oczekujace);
  S.losowa = los() < 0.3;
  await dostawa(S, X, Y, { k, cofnij });
  S.losowa = false;
}
// Punkt spoczynku: spoczynek, W1 i W2r (jak dotąd), potem NOWE pomiary (izolowane): klasy W1, W4 i W4p.
async function punktSpoczynku(S, A, B, { ostatni = false } = {}) {
  S.stat.spoczynki += 1;
  const r = await spoczynek(S, A, B);
  if (r === null) { S.stat.brakSpoczynku.push({ krok: S.nrKroku, ostatnie: S.dziennik.slice(-10) }); return; }
  const roznice = await w1(A, B);
  const wpis = roznice ? { krok: S.nrKroku, ostatnie: S.dziennik.slice(-10), sciezki: roznice } : null;
  if (wpis) S.stat.w1Bledy.push(wpis);
  S.stat.w2r += 1;
  for (const [X, Y] of [[A, B], [B, A]]) {
    const r2 = await w2r(S, X, Y);
    if (r2) S.stat.w2rBledy.push({ krok: S.nrKroku, strona: X.nazwa, sciezki: [...r2], klasy: klasyPunktu(r2.roznice), roznice: r2.roznice.map(skrotRoznicy) });
  }
  if (wpis) {
    const d = await w1Klasy(S, A, B, { tabela: S.profil });
    Object.assign(wpis, { klasy: klasyPunktu(d), roznice: d.map(skrotRoznicy) });
  }
  // W4 (3.2): w każdym punkcie spoczynku obie pary; przy przekroczeniu celu czasu (3.3) PO-B tylko w ostatnim punkcie.
  const warianty = S.tylkoPOA && !ostatni ? ['PO-A'] : ['PO-A', 'PO-B'];
  const w = await w4(S, A, B, { tabela: S.profil === 'pelny' ? 'pelny:W4' : 'W4', wskrzeszone: S.wskrzeszone }, { warianty });
  S.stat.w4 += 1;
  S.stat.w4R4n += new Set(w.w4p.map((p) => p.klucz)).size; // encje R4n punktu (krok|klucz), nie warianty PO-A/PO-B (P8)
  for (const p of w.w4p) S.stat.w4p.push({ krok: S.nrKroku, ...p });
  const klasyW4 = [...new Set(w.warianty.flatMap((x) => x.roznice.map((q) => q.klasa || 'null')))].sort();
  if (klasyW4.length) S.stat.w4Klasy.push({ krok: S.nrKroku, klasy: klasyW4 });
  if (!w.ok) S.stat.w4Bledy.push({ krok: S.nrKroku, ostatnie: S.dziennik.slice(-10), warianty: w.warianty });
}
// Opcje (E2-PR2b): koalescencja 'ogon' — kolejki z łączeniem wpisów (doKolejkiOgon); w2s false — bez W2s i W3 w punktach
// pełnej dostawy (inny program ziarna: klon W2s w kolejności losowej zużywa losowania).
async function przebiegZiarna(ziarno, profil, { koalescencja = null, w2s = true } = {}) {
  const t0 = performance.now();
  const S = swiat(ziarno + (profil === 'pelny' ? 100000 : 0));
  S.profil = profil;
  if (koalescencja) zKoalescencja(S);
  if (!w2s) S.w2s = false;
  // Cel czasu 3.3 (≤ 45 s dla ziaren domyślnych) przekroczony przy obu parach W4 w każdym punkcie spoczynku (zmierzone
  // 2026-11-03: 75 s, ziarno 5–13 s): para PO-B liczy się tylko w ostatnim punkcie spoczynku ziarna, PO-A zawsze
  // (w 40 ziarnach z obiema parami PO-A i PO-B dały w każdym punkcie ten sam wynik W4).
  S.tylkoPOA = true;
  S.los = rng(S.ziarno);
  S.indeks = new Map();
  S.nrKarty = 0;
  S.nrKroku = 0;
  const losMath = rng(S.ziarno ^ 0x5bd1e995);
  // Math.random programu z ziarna; na czas nowego pomiaru (kr_cicho) — S.losAlt.
  vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || losMath)());
  const A = await urzadzenie(S, 'A');
  krok(); await mutacja(S, A, 'nowa karta 1', async () => { const r = await A.d.zapiszKarte(1); S.indeks.set(r.patientId, 1); return r; });
  S.nrKarty = 1;
  A.Q.length = 0;
  const B = await urzadzenie(S, 'B', A);
  const ile = KROKI || 60 + Math.floor(S.los() * 61);
  let mutacji = 0;
  while (mutacji < ile) {
    S.nrKroku += 1;
    krok(1000 + Math.floor(S.los() * 119e3));
    if (S.los() < 0.3) { await losowaDostawa(S, A, B); continue; }
    const X = S.los() < 0.5 ? A : B;
    if (await losowaMutacja(S, X, profil)) {
      mutacji += 1;
      if (S.los() < 1 / 25) await punktSpoczynku(S, A, B);
    }
  }
  S.nrKroku += 1;
  await punktSpoczynku(S, A, B, { ostatni: true });
  const wynik = { ziarno, profil, ...(koalescencja ? { koalescencja, w2s } : {}), mutacji, ms: Math.round(performance.now() - t0), ...S.stat, braki: S.braki, dziennikZostaw: S.dziennik.filter((l) => / zostaw notatkę /.test(l)).length };
  WYNIKI[koalescencja ? `${profil}:${koalescencja}` : profil].push(wynik);
  if (process.env.E2_AB_WYNIKI) appendFileSync(process.env.E2_AB_WYNIKI, JSON.stringify({ ...wynik, dziennik: S.dziennik, ...(S.kolejkaLog ? { kolejka: S.kolejkaLog } : {}) }) + '\n');
  return wynik;
}
// Listy literałów (3.6): [ziarno, krok, [klasy]] punktów W1 z niepustym D, [ziarno, krok, strona, [klasy]] punktów W2r.
const listaW1 = (w) => w.w1Bledy.map((b) => [w.ziarno, b.krok, b.klasy]);
const listaW2r = (w) => w.w2rBledy.map((b) => [w.ziarno, b.krok, b.strona, b.klasy]);
const opisBledow = (w) => JSON.stringify({
  ziarno: w.ziarno, W1: w.w1Bledy.map((b) => ({ krok: b.krok, klasy: b.klasy, roznice: b.roznice, ostatnie: b.ostatnie })), W2r: w.w2rBledy,
  W3: w.w3Bledy, W4: w.w4Bledy, W4p: w.w4p.filter((p) => !p.ok), brakSpoczynku: w.brakSpoczynku, W2sInne: w.w2sLista.filter((x) => x.roznice.some((r) => r.kategoria === 'inne')),
}, null, 1);
function suma(lista) {
  const s = { ziaren: lista.length, mutacji: 0, zdarzen: 0, dostaw: 0, pelnych: 0, spoczynki: 0, h1: 0, h2: 0, w2r: 0, w3: 0, w4: 0, w1Bledy: 0, w2rBledy: 0, w3Bledy: 0, w4Bledy: 0, w4R4n: 0, w4pZle: 0, brakSpoczynku: 0, w2sZgodne: 0, w2sNiezgodne: 0, kategorie: {}, kategorieRoznic: {}, losowaZgodne: 0, losowaNiezgodne: 0, losowaLista: [], brakiNosnika: 0, ms: 0, klasyW1: {}, klasyW2r: {}, klasyW4: {}, w1Lista: [], w2rLista: [] };
  for (const w of lista) {
    for (const k of ['mutacji', 'zdarzen', 'dostaw', 'pelnych', 'spoczynki', 'h1', 'h2', 'w2r', 'w3', 'w4', 'w4R4n', 'ms']) s[k] += w[k];
    s.w1Bledy += w.w1Bledy.length; s.w2rBledy += w.w2rBledy.length; s.w3Bledy += w.w3Bledy.length; s.brakSpoczynku += w.brakSpoczynku.length;
    s.w4Bledy += w.w4Bledy.length; s.w4pZle += w.w4p.filter((p) => !p.ok).length;
    s.w2sZgodne += w.w2s.zgodne; s.w2sNiezgodne += w.w2s.niezgodne;
    for (const [k, v] of Object.entries(w.w2s.kategorie)) s.kategorie[k] = (s.kategorie[k] || 0) + v;
    if (w.koalescencja) for (const k of ['koal', 'koalWierszy', 'koalPominiete']) s[k] = (s[k] || 0) + w[k];
    for (const [k, v] of Object.entries(w.w2s.roznice)) s.kategorieRoznic[k] = (s.kategorieRoznic[k] || 0) + v;
    s.losowaZgodne += w.losowa.zgodne; s.losowaNiezgodne += w.losowa.niezgodne; s.brakiNosnika += w.braki.length;
    for (const x of w.losowaLista) s.losowaLista.push(`${w.ziarno}#${x.krok} ${x.klasy.join('+')}`);
    for (const b of w.w1Bledy) { s.w1Lista.push(`${w.ziarno}#${b.krok} ${b.klasy.join('+')}`); for (const k of b.klasy) s.klasyW1[k] = (s.klasyW1[k] || 0) + 1; }
    for (const b of w.w2rBledy) { s.w2rLista.push(`${w.ziarno}#${b.krok}${b.strona} ${b.klasy.join('+')}`); for (const k of b.klasy) s.klasyW2r[k] = (s.klasyW2r[k] || 0) + 1; }
    for (const b of w.w4Klasy) for (const k of b.klasy) s.klasyW4[k] = (s.klasyW4[k] || 0) + 1;
  }
  return s;
}

// Literały dla ziaren domyślnych (E2_AB_START=1, E2_AB_ZIARNA=8; specyfikacja 2a, 3.6): dokładna charakterystyka —
// nowa różnica, nowa klasa albo zniknięcie znanej różnicy czerwienią test. Naprawa zbieżności bez pełnej wysyłki
// (E2-PR3c, E3-PR0) ZMIENIA te literały — to zamierzone.
const ZNANE_W1 = [[1, 26, ['R2']], [1, 43, ['R2']], [1, 47, ['R2']], [4, 92, ['R2']], [6, 124, ['R3']], [6, 130, ['R3']]];
const ZNANE_W2R = [[1, 26, 'A', ['R2']], [1, 43, 'A', ['R2']], [1, 47, 'A', ['R2']], [4, 92, 'A', ['R2']],
  [6, 124, 'B', ['R3']], [6, 130, 'B', ['R3']]];
const ZNANE_W4_R4N = 0; // normalizacje R4n w W4 w ziarnach domyślnych
const DOMYSLNE_ZIARNA = [1, 2, 3, 4, 5, 6, 7, 8];
const domyslne = (z) => !KROKI && DOMYSLNE_ZIARNA.includes(z);
// Zieleń profilu (3.3): W3, W4, W4p, W2s „inne” = ∅, spoczynek w ≤ 4 rundach, klasyfikator W1/W2r bez klasy
// niedozwolonej, W2r ⊆ W1.
function zielenProfilu(w) {
  const bezKlasy = (lista) => lista.flatMap((b) => b.roznice.filter((r) => r.dozwolona !== 'tak').map((r) => ({ krok: b.krok, ...r })));
  return {
    W3: w.w3Bledy, W4: w.w4Bledy.map((b) => b.krok), W4p: w.w4p.filter((p) => !p.ok), brakSpoczynku: w.brakSpoczynku,
    W2sInne: w.w2sLista.filter((x) => x.roznice.some((r) => r.kategoria === 'inne')).map((x) => `${x.krok} ${x.dostawa}`),
    W1BezKlasy: bezKlasy(w.w1Bledy), W2rBezKlasy: bezKlasy(w.w2rBledy),
    W2rPozaW1: w.w2rBledy.filter((b) => !w.w1Bledy.some((x) => x.krok === b.krok)).map((b) => b.krok),
  };
}
const ZIELEN = { W3: [], W4: [], W4p: [], brakSpoczynku: [], W2sInne: [], W1BezKlasy: [], W2rBezKlasy: [], W2rPozaW1: [] };
describe('A ≡ B, właściwość: profil podstawowy (W3, W4, W4p — zieleń; W1, W2r — dokładna charakterystyka znanych klas; W2s „inne” = ∅)', () => {
  d1();
  for (const z of ZIARNA) {
    it(`ziarno ${z}`, async () => {
      const w = await przebiegZiarna(z, 'podstawowy');
      expect(w.spoczynki, 'co najmniej jeden punkt spoczynku').toBeGreaterThan(0);
      expect(zielenProfilu(w), opisBledow(w)).toEqual(ZIELEN);
      if (domyslne(z)) {
        expect(listaW1(w), `ZNANE_W1 (ziarno ${z})\n${opisBledow(w)}`).toEqual(ZNANE_W1.filter((x) => x[0] === z));
        expect(listaW2r(w), `ZNANE_W2R (ziarno ${z})`).toEqual(ZNANE_W2R.filter((x) => x[0] === z));
      }
    }, 180_000);
  }
  it('podsumowanie (druk do opisu PR; ZNANE_W4_R4N)', () => {
    const s = suma(WYNIKI.podstawowy);
    console.log('E2-AB podstawowy', JSON.stringify(s));
    expect(s.ziaren).toBe(ZIARNA.length);
    expect(s.pelnych, 'punkty pełnej dostawy (W2s, W3)').toBeGreaterThan(0);
    expect(s.zdarzen).toBeGreaterThan(0);
    const dom = WYNIKI.podstawowy.filter((w) => domyslne(w.ziarno));
    if (dom.length === DOMYSLNE_ZIARNA.length) expect(dom.reduce((n, w) => n + w.w4R4n, 0), 'ZNANE_W4_R4N').toBe(ZNANE_W4_R4N);
  });
});

// ── Koalescencja kolejki (reguła ogona, E2-PR2b) — profil podstawowy bez W2s ─────────────────────────────────────────
// Kolejki Q_X z łączeniem wpisów (doKolejkiOgon: wycięta Bob_plan sejfu, tests/support/model-kolejki.mjs). Bez W2s i W3
// (nie badają łączenia wpisów; W3 bez zmian od E2-PR2a), więc ziarno to inny program niż w profilu podstawowym.
// Zieleń jak w profilu podstawowym (W4, W4p, spoczynek ≤ 4 rundy, klasyfikator W1/W2r bez klasy niedozwolonej), W1 dla
// ziaren domyślnych — literał ZNANE_W1_KOAL, a suma koalescencji > 0 (test nie może być pusty). Ziarna: ZIARNA_KOAL,
// E2_AB_ZIARNA_KOAL (liczba ziaren od E2_AB_START) nadpisuje; ziarna domyślne liczą się osobno od celu czasu profilu
// podstawowego (ziarna E2_AB_ZIARNA).
const DOMYSLNE_ZIARNA_KOAL = [1, 7, 8];
const ZIARNA_KOAL = process.env.E2_AB_ZIARNA_KOAL
  ? Array.from({ length: Number(process.env.E2_AB_ZIARNA_KOAL) }, (_, i) => START_ZIAREN + i) : DOMYSLNE_ZIARNA_KOAL;
const ZNANE_W1_KOAL = [];
describe('A ≡ B, koalescencja kolejki (reguła ogona) — profil podstawowy bez W2s', () => {
  d1();
  for (const z of ZIARNA_KOAL) {
    it(`ziarno ${z}`, async () => {
      const w = await przebiegZiarna(z, 'podstawowy', { koalescencja: 'ogon', w2s: false });
      expect(w.spoczynki, 'co najmniej jeden punkt spoczynku').toBeGreaterThan(0);
      expect(zielenProfilu(w), opisBledow(w)).toEqual(ZIELEN);
      if (!KROKI && DOMYSLNE_ZIARNA_KOAL.includes(z)) expect(listaW1(w), `ZNANE_W1_KOAL (ziarno ${z})\n${opisBledow(w)}`).toEqual(ZNANE_W1_KOAL.filter((x) => x[0] === z));
    }, 180_000);
  }
  it('podsumowanie (druk do opisu PR): suma koalescencji > 0', () => {
    const s = suma(WYNIKI['podstawowy:ogon']);
    console.log('E2-AB koalescencja', JSON.stringify(s));
    expect(s.ziaren).toBe(ZIARNA_KOAL.length);
    expect(s.koal, 'dopisania, które zastąpiły wpis kolejki').toBeGreaterThan(0);
  });
});

// ── Profil pełny (charakteryzujący; specyfikacja 2a, 3.3) ──────────────────────────────────────────────────────────
// Zieleń: brak wyjątków, statusy applied, spoczynek w ≤ 4 rundach, W3 = 0 i W4 jak w profilu podstawowym z klasami
// dozwolonymi w profilu pełnym (R4n z W4p; createdAtISO-notatki tylko dla notatki z „Zostaw notatkę”, D7 i „notatka pod
// inną kartą” po „Scal pacjentów” — raport).
// W1, W2r, W2s: klasy drukowane, różnice bez klasy do raportu jako lista z kluczem encji (nie czerwienią).
// W CI 2 ziarna (E2_AB_ZIARNA nadpisuje; do raportu 20). E2_AB_KOAL=ogon (przebieg ręczny) — kolejki z łączeniem wpisów
// (reguła ogona), W2s jak bez łączenia.
const KOAL_PELNY = process.env.E2_AB_KOAL === 'ogon' ? 'ogon' : null;
const ZIARNA_PELNY = Array.from({ length: Number(process.env.E2_AB_ZIARNA) || 2 }, (_, i) => START_ZIAREN + i);
function raportPelny(lista) {
  const s = suma(lista);
  const bezKlasy = [];
  for (const w of lista) {
    for (const b of w.w1Bledy) for (const r of b.roznice.filter((q) => !q.klasa)) bezKlasy.push(`W1 ${w.ziarno}#${b.krok} ${r.rodzaj} ${r.klucz.slice(0, 13)} ${r.tylko ? 'tylko ' + r.tylko : r.sciezki.slice(0, 3).join(',')}`);
    for (const b of w.w2rBledy) for (const r of b.roznice.filter((q) => !q.klasa)) bezKlasy.push(`W2r ${w.ziarno}#${b.krok}${b.strona} ${r.rodzaj} ${r.klucz.slice(0, 13)} ${r.tylko ? 'tylko ' + r.tylko : r.sciezki.slice(0, 3).join(',')}`);
  }
  return { ...s, bezKlasy, wskrzeszen: lista.reduce((n, w) => n + w.dziennikZostaw, 0) };
}
describe('A ≡ B, właściwość: profil pełny (charakterystyka; W3 i W4 z klasami profilu pełnego — zieleń)', () => {
  d1();
  for (const z of ZIARNA_PELNY) {
    it(`ziarno ${z}`, async () => {
      const w = await przebiegZiarna(z, 'pelny', { koalescencja: KOAL_PELNY });
      expect(w.spoczynki, 'co najmniej jeden punkt spoczynku').toBeGreaterThan(0);
      expect({ W3: w.w3Bledy, W4: w.w4Bledy.map((b) => b.krok), W4p: w.w4p.filter((p) => !p.ok), brakSpoczynku: w.brakSpoczynku }, opisBledow(w))
        .toEqual({ W3: [], W4: [], W4p: [], brakSpoczynku: [] });
    }, 600_000);
  }
  it('podsumowanie profilu pełnego (druk do opisu PR)', () => {
    const s = raportPelny(WYNIKI[KOAL_PELNY ? 'pelny:ogon' : 'pelny']);
    console.log('E2-AB pelny', JSON.stringify(s));
    expect(s.ziaren).toBe(ZIARNA_PELNY.length);
  });
});

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); ustaw(START); });
afterEach(async () => { await sprzatnijUrzadzenia(); vi.useRealTimers(); vi.restoreAllMocks(); });
