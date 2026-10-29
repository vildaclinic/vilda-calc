// P-KOSZ-USUWANEJ-KARTY (E4a, decyzja właściciela D6 = a, Q7 z S4): wersje karty, która w scalaniu przegrywa
// z nagrobkiem pacjenta, przechodzą tę samą decyzję kosza co pozostałe wersje — w koszu poprawka sprzed „Scal pacjentów”.
//
// Dotąd (25dfbbe0) karta przegrana z nagrobkiem pacjenta znikała razem z wersjami (removePatientForUser) przed końcem
// scalania kosza, a karta z ładunku z takim nagrobkiem omijała pętlę wersji: poprawka zrobiona w starej karcie przed
// „Scal pacjentów” na innym urządzeniu, które potem dało tę wizytę do kosza, ginęła na wszystkich urządzeniach (w koszu
// 23 kg zamiast 74 kg; ograniczenie K6, PD-16). Teraz wersja, z którą wygrywa wpis kosza tej samej wersji (pod dowolną
// kartą), oddaje mu zmianę, opis, rev i treść: na urządzeniu z kartą — przed jej usunięciem (z zapisem listy), na
// urządzeniu, które dostaje kartę w ładunku — jako kandydat treści. Tylko wygrana kosza (przycięcie nie robi cienia karty
// usuwanej — decyzja 1 z 2026-10-26), bez wpisu kosza nic nie powstaje.
//
// Scenariusze (przygotowanie trzyKarty z s4d7-wspolne.mjs: na K „Testowy Jan” X z trzema wizytami — x = druga, 125 cm /
// 23 kg — oraz „Testowa Ola” Y i Z; komplet na P i C; kroki co minutę (bez synchronizacji poza krokami sync w E4a-Y
// i E4a-*Cpin*), potem pierwsze scalenia w jednej
// z 8 kolejności, 3 pełne rundy i runda kontrolna z licznikiem zapisów). Wynik na kodzie sprzed zmiany (25dfbbe0) —
// zmierzony tymi samymi krokami, w każdej z 8 kolejności ten sam:
//   E4a-C      C (zamiast P) poprawia x w starej X na 74; K: X → Y → Z, kosz x        → kosz 74 r2   (dotąd kosz 23 r2)
//   E4a-Y      K: X → Y; P←K (P zna X → Y), P poprawia x pod Y na 74; K: Y → Z, kosz  → kosz 74 r2   (dotąd kosz 23 r2)
//   E4a-pin    P przypina x w starej X (bez poprawki); K: X → Y → Z, kosz             → kosz 23* r2  (dotąd kosz 23 r2 —
//              gwiazdka ginęła)
//   E4a-pin74  P poprawia x na 74 i przypina; K: X → Y → Z, kosz                       → kosz 74* r2  (dotąd kosz 23 r2)
//   E4a-2kor   P poprawia x na 74, później C na 80 (obie w starej X); K: X → Y → Z, kosz → kosz 80 r2 (dotąd kosz 23 r2)
//   E4a-pin-2kor P przypina x, później C poprawia x na 80 (obie w starej X); K: scalenia, kosz → kosz 80* r2 — treść z C,
//              gwiazdka z rejestru wersji usuwanej karty P (dotąd kosz 23 bez gwiazdki); E4a-2kor-pin — odwrotna kolejność
//              kroków P i C, to samo
//   E4a-kp-remis K daje x do kosza w X i P poprawia x w tej samej chwili; K: X → Y → Z → kosz 74 r1 — remis to wygrana
//              kosza (dotąd kosz 23)
//   U1         P poprawia x na 74; K: kosz x (w X), „Usuń pacjenta” X                 → kosz 74 r1   (dotąd kosz 23 r0)
//   U3         P poprawia x na 74; K: X → Y, kosz x (pod Y), „Usuń pacjenta” Y         → kosz 74 r1   (dotąd kosz 23 r1)
//   kontrole bez zmian (zielone także na 25dfbbe0):
//   U2         P poprawia x na 74; K: „Usuń pacjenta” X (bez kosza)                    → brak — „Usuń pacjenta” bez kosza
//              usuwa wszystko, nowego wpisu kosza nie ma
//   U1-bez     K: kosz x, „Usuń pacjenta” X (bez poprawki)                             → kosz 23 r0
//   E4a-ret    P poprawia x na 74; K: X → Y → Z, retencja przycina x (zamiast kosza)   → brak (nagrobek retencji r2,
//              bez chwili zmianaISO z poprawki P — przycięcie nie bierze wkładu wersji karty usuwanej)
//   E4a-kp-ret K: kosz x w X; P poprawia x później; C (bez wiedzy) przycina x; K: scalenia → kosz 23 r0 w 6 z 8, nagrobek
//              retencji r1 w P←C,P←K i C←P,C←K — tak samo jak dotąd (późniejsze wersje nie dochodzą do wpisu kosza)
//   znane ograniczenie (opis w ALGORITHMS, P-KOSZ-USUWANEJ-KARTY) — E4a-kp bez zmian, zielone także na 25dfbbe0:
//   E4a-kp     K: kosz x w X; P (bez wiedzy) poprawia x na 74; K: X → Y → Z           → kosz 23 r0 — poprawka późniejsza
//              niż kosz przegrywa z „Scal pacjentów”: wpis kosza wskazuje X, a żadne urządzenie nie zna karty docelowej
//              (bez scaleń poprawka wygrywa: karta X 74)
//   domknięte przez P-KOSZ-PO-KLUCZU (np-ret-A1, Bsw_przezyteRetencji): wersja karty usuwanej, która wygrywa ze swoim
//   wpisem retencji, przechodzi pod kartę docelową (tu karta wpisu Z) zamiast zginąć z kartą:
//   E4a-ret-pin P poprawia x na 74 i przypina; K: X → Y → Z, retencja przycina x       → karta Z 74* w 8 z 8, nagrobek
//              retencji zna wersję (zmiana t+2, A3a) (8240e0df, 25dfbbe0 i E3 bez reguły np-ret-A1: brak — przypięta
//              wizyta znikała na trzech)
//   gwiazdka C pod kartą docelową i poprawka P w starej karcie — domknięte przez P-KOSZ-PO-KLUCZU (PR-E3, sejf 231):
//   wersję wspólną dwóm kartom składa reguła W3 (treść po chwili treści S4, gwiazdka po rejestrze — Bsw_rekordW3),
//   a nie cały rekord nowszy po chwili zmiany (Bsw_rekord). Widok (karta albo kosz z gwiazdką) we wszystkich
//   8 kolejnościach ten sam; w E4a-Cpin-przed rev wpisu kosza i _pinned w jego treści nadal zależą od kolejności
//   (P←C,P←K: rev 4, treść złożona z gwiazdką; pozostałe: rev 3, gwiazdka tylko w rejestrze wpisu):
//   E4a-Cpin   P poprawia x na 74; K: X → Y → Z, K→C, kosz x; C (bez wiedzy o koszu) przypina x pod Z → karta Z 74*
//              z rev 4 w 8 z 8 (25dfbbe0: 23* w 8 z 8; 8240e0df, E4a: 74* z rev 4 w 4 z 8, 23* z rev 3 w pozostałych)
//   E4a-Cpin-przed jak E4a-Cpin, ale C przypina przed koszem K (K o gwiazdce nie wie) → kosz 74* w 8 z 8; wpis rev 3
//              bez _pinned w treści w 7 z 8, w P←C,P←K rev 4 z _pinned (25dfbbe0: kosz 23* w 8 z 8; 8240e0df: kosz 74*,
//              wpis rev 3 bez _pinned w 7 z 8, w P←C,P←K kosz 23*, wpis rev 3 z _pinned)
//   E4a-kontrola-Cpin jak E4a-Cpin bez kosza → karta Z 74* z rev 4 w 8 z 8 (25dfbbe0 i 8240e0df: 74* z rev 4 w 3 z 8,
//              23* z rev 3 w 5 z 8)
// E4a, E4a-1 i E4a-kontrola — w polkrata-katalog.test.mjs; K6 (E4a) — w kosz-nowsza-tresc.test.mjs; przerwane scalenie,
// zmiana sesji, strona ładunku i wersja nieczytelna — w kosz-usuwanej-karty-sesja.test.mjs; flota mieszana z 221 —
// w kosz-usuwanej-karty-flota.test.mjs.
//
// Przy każdej kolejności: ten sam pełny stan na wszystkich urządzeniach (także nagrobek i chwile), stan stabilny, 0 zapisów
// listy, wersji i kart w dodatkowej rundzie (nagrobki pacjentów piszą się w każdym scaleniu, jak dotąd — licznik „inne”
// nie jest sprawdzany). Prawdziwy vilda_vault.js, sejfy w pamięci, sztuczny zegar, dane fikcyjne.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KOLEJNOSCI_8, przebieg, popraw, przypnij, doKosza, przytnij, scalPacjentow, sync, przesunZegar, gdzieJest } from './s4d7-wspolne.mjs';

afterEach(() => { vi.useRealTimers(); });

const usunPacjenta = async (u, n, karta) => { await u[n].removePatient(u[karta]); przesunZegar(60e3); };
const XYZ = async (u) => { await scalPacjentow(u, 'K', 'X', 'Y'); await scalPacjentow(u, 'K', 'Y', 'Z'); };
const KOSZ = (masa, rev, pin = false) => ({ status: 'kosz', karta: null, kosz: { masa, pin }, n: { masa, rev, pin, powod: null } });
const KARTA = (masa, pin, rev) => ({ status: 'karta', karta: rev === undefined ? { masa, pin } : { masa, pin, rev }, kosz: null, n: null });

const SCEN = {
  'E4a-C': [async (u) => { await popraw(u, 'C', 74); await XYZ(u); await doKosza(u, 'K'); }, KOSZ(74, 2)],
  'E4a-Y': [async (u) => {
    await scalPacjentow(u, 'K', 'X', 'Y'); await sync(u.K, u.P); await popraw(u, 'P', 74);
    await scalPacjentow(u, 'K', 'Y', 'Z'); await doKosza(u, 'K');
  }, KOSZ(74, 2)],
  'E4a-pin': [async (u) => { await przypnij(u, 'P', true); await XYZ(u); await doKosza(u, 'K'); }, KOSZ(23, 2, true)],
  'E4a-pin74': [async (u) => { await popraw(u, 'P', 74); await przypnij(u, 'P', true); await XYZ(u); await doKosza(u, 'K'); }, KOSZ(74, 2, true)],
  'E4a-2kor': [async (u) => { await popraw(u, 'P', 74); await popraw(u, 'C', 80); await XYZ(u); await doKosza(u, 'K'); }, KOSZ(80, 2)],
  // n.pin (_pinned w treści wpisu) zależy od kolejności — decyduje rejestr gwiazdki (widok kosza: 80*), poza wzorem
  'E4a-pin-2kor': [async (u) => { await przypnij(u, 'P', true); await popraw(u, 'C', 80); await XYZ(u); await doKosza(u, 'K'); },
    { status: 'kosz', karta: null, kosz: { masa: 80, pin: true }, n: { masa: 80, rev: 2, powod: null } }],
  'E4a-2kor-pin': [async (u) => { await popraw(u, 'C', 80); await przypnij(u, 'P', true); await XYZ(u); await doKosza(u, 'K'); },
    { status: 'kosz', karta: null, kosz: { masa: 80, pin: true }, n: { masa: 80, rev: 2, powod: null } }],
  // remis: kosz K i poprawka P w tej samej chwili (bez przesunięcia zegara między nimi)
  'E4a-kp-remis': [async (u) => {
    const gK = await gdzieJest(u.K, u.sid); await u.K.moveSnapshotToTrash(gK.pid, u.sid, { odepnij: true });
    const gP = await gdzieJest(u.P, u.sid);
    await u.P.updateSnapshotPayload(gP.pid, u.sid, { ...gP.s.payload, user: { ...gP.s.payload.user, weight: 74 } }, { preserveSavedAt: true });
    przesunZegar(60e3); await XYZ(u);
  }, KOSZ(74, 1)],
  U1: [async (u) => { await popraw(u, 'P', 74); await doKosza(u, 'K'); await usunPacjenta(u, 'K', 'X'); }, KOSZ(74, 1)],
  U3: [async (u) => { await popraw(u, 'P', 74); await scalPacjentow(u, 'K', 'X', 'Y'); await doKosza(u, 'K'); await usunPacjenta(u, 'K', 'Y'); }, KOSZ(74, 1)],
  // kontrole
  U2: [async (u) => { await popraw(u, 'P', 74); await usunPacjenta(u, 'K', 'X'); }, { status: 'brak', karta: null, kosz: null, n: null }],
  'U1-bez': [async (u) => { await doKosza(u, 'K'); await usunPacjenta(u, 'K', 'X'); }, KOSZ(23, 0)],
  'E4a-ret': [async (u) => { await popraw(u, 'P', 74); await XYZ(u); await przytnij(u, 'K'); },
    { status: 'brak', karta: null, kosz: null, n: { masa: null, rev: 2, pin: null, powod: 'retencja', zmiana: null } }],
  'E4a-kp-ret': [async (u) => { await doKosza(u, 'K'); await popraw(u, 'P', 74); await przytnij(u, 'C'); await XYZ(u); },
    (kol) => (['P←C,P←K', 'C←P,C←K'].includes(kol)
      ? { status: 'brak', karta: null, kosz: null, n: { masa: null, rev: 1, powod: 'retencja' } }
      : { status: 'kosz', karta: null, kosz: { masa: 23, pin: false }, n: { masa: 23, rev: 0, powod: null } })],
  // znane ograniczenie
  'E4a-kp': [async (u) => { await doKosza(u, 'K'); await popraw(u, 'P', 74); await XYZ(u); }, KOSZ(23, 0)],
  // domknięte przez np-ret-A1: przypięta wersja karty usuwanej przechodzi pod kartę docelową Z
  'E4a-ret-pin': [async (u) => { await popraw(u, 'P', 74); await przypnij(u, 'P', true); await XYZ(u); await przytnij(u, 'K'); },
    { status: 'karta', karta: { masa: 74, pin: true }, kosz: null, n: { masa: null, rev: 2, pin: null, powod: 'retencja', zmiana: '2' } }],
  // domknięte przez P-KOSZ-PO-KLUCZU (W3 między kartami)
  'E4a-Cpin': [async (u) => { await popraw(u, 'P', 74); await XYZ(u); await sync(u.K, u.C); await doKosza(u, 'K'); await przypnij(u, 'C', true); },
    KARTA(74, true, 4)],
  // widok kosza 74* w 8 z 8 (decyduje rejestr gwiazdki); rev wpisu i _pinned w jego treści zależą od kolejności:
  // w P←C,P←K rekord złożony W3 (Bsw_rekordW3: treść P, gwiazdka C, rev = max + 1) dochodzi do wpisu, w pozostałych — tylko rejestr
  'E4a-Cpin-przed': [async (u) => { await popraw(u, 'P', 74); await XYZ(u); await sync(u.K, u.C); await przypnij(u, 'C', true); await doKosza(u, 'K'); },
    (kol) => ({ status: 'kosz', karta: null, kosz: { masa: 74, pin: true }, n: { masa: 74, rev: kol === 'P←C,P←K' ? 4 : 3, pin: kol === 'P←C,P←K', powod: null } })],
  'E4a-kontrola-Cpin': [async (u) => { await popraw(u, 'P', 74); await XYZ(u); await sync(u.K, u.C); await przypnij(u, 'C', true); },
    KARTA(74, true, 4)],
};

const podzbior = (o, wzor) => (o ? Object.fromEntries(Object.keys(wzor).map((k) => [k, o[k]])) : o);

describe('P-KOSZ-USUWANEJ-KARTY — rodzina E4a, „Usuń pacjenta”, kontrole i znane ograniczenia', () => {
  for (const [nazwa, [kroki, oczek]] of Object.entries(SCEN)) {
    for (const kol of KOLEJNOSCI_8) {
      const oczekiwany = typeof oczek === 'function' ? oczek(kol) : oczek;
      it(`${nazwa} (${kol})`, async () => {
        const r = await przebieg({ przygotuj: 'trzyKarty', kroki }, kol);
        expect(r.u.warunkiBledne, `warunki scenariusza: ${r.u.warunki.join('; ')}`).toBe(false);
        for (const n of ['P', 'K', 'C']) {
          const s = r.st[n];
          const wynik = {
            status: s.status,
            karta: s.karta ? (oczekiwany.karta && 'rev' in oczekiwany.karta ? { masa: s.karta.masa, pin: s.karta.pin, rev: s.karta.rev } : { masa: s.karta.masa, pin: s.karta.pin }) : null,
            kosz: s.kosz ? { masa: s.kosz.masa, pin: s.kosz.pin } : null,
            n: oczekiwany.n ? podzbior(s.nagrobek, oczekiwany.n) : s.nagrobek,
          };
          expect(wynik, `${n}: stan`).toEqual(oczekiwany);
        }
        expect(r.zbieznyPelny, 'ten sam pełny stan na trzech').toBe(true);
        expect(r.stabilny, 'stan stabilny').toBe(true);
        for (const n of ['P', 'K', 'C']) expect({ ...r.zapisy[n], inne: 0 }, `${n}: runda kontrolna bez zapisów`).toEqual({ lista: 0, wersje: 0, karty: 0, inne: 0 });
      });
    }
  }
});
