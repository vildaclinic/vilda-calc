// E2-PR0 — zapis bazowy dzisiejszego vilda_sync.js (e49ff33e) jako stałe oczekiwania: lista żądań do workera, kolejność
// zdarzeń synchronizacji (onSyncStart/Complete/Error, vilda:sync-* w dokumencie), żądania blokad vilda-sync-* i zapisy
// kluczy vilda-sync-* / vilda-cloud-etag-* w localStorage i sessionStorage. Dwa urządzenia jednego konta (A i bliźniak B)
// i osobne konto C na atrapie workera (tests/support/atrapa-workera-sync.mjs) przez uprząż urządzeń
// (tests/support/urzadzenie-sync.mjs). Dane wyłącznie FIKCYJNE.
//
// Po co: E2-PR1 (pobieranie stronicowane za flagą) dopisuje tylko warianty w WARIANTY (np. flaga vilda-sync-paged-v1
// brak i '0') BEZ zmiany oczekiwań — to dowód „flaga wyłączona = jak dziś”. Oczekiwania zapisano z przebiegów
// dzisiejszego kodu (e49ff33e; dwa przebiegi identyczne). Zmiana oczekiwań wynikająca ze zmiany sejfu (np. echo
// własnej delty w B2) idzie osobnym commitem z uzasadnieniem w tym nagłówku.
//
// Determinizm przez konstrukcję: drenaż /changes jest fire-and-forget, więc każdy scenariusz wstrzymuje odpowiedź
// /changes bramą (faza 'po': atrapa odpowiada w chwili przyjścia, odpowiedź dociera po zwolnij()) — to przy okazji
// DOWODZI, że syncPull nie czeka na drenaż; koniec pracy w tle wykrywa cisza() na licznikach (żądania w locie, czytane
// ciała, scalenia), nie liczba tur. Zegar atrapy sterowany, Math.random zamockowany (odstęp po 412), identyfikatory kart
// poza rzutem (blokady sejfu vilda-save-pat:* i vilda-note-kosz-zapisow poza rzutem osi).
//
// Scenariusze (każdy na świeżym świecie; „przygotuj” odtwarza wcześniejsze kroki bez asercji):
//   B0  rejestracja (A, syncPush, nowy slot).
//   B1  pierwsze pobranie (B, syncPull({pierwszePobranie:true}); w dzienniku delta karty 2, seq 1).
//   B2  zwykły cykl (A, syncFull: pobranie + drenaż + wysyłka; echo własnej delty karty 2).
//   B3  pobranie z kursorem po zmianie ETagu (B, kursor 1, w dzienniku seq 2).
//   B4  pobranie z kursorem, ETag bez zmian (B, kursor 2, w dzienniku seq 3).
//   B5  304 — usterka POZA KONTRAKTEM: /status oddaje nieaktualny ETag (jak opóźniony odczyt KV).
//   B6  404 no-remote-blob (C, slot tylko tożsamości).
//   B7  brak slotu (C, nowe konto bez rejestracji): 401 → not-registered, bez drenażu.
//   B8  drugie pobranie w trakcie drenażu pierwszego (B; jedno /changes).
//   B9  pierwsze pobranie przy kilku wierszach i zaślepce (B; kursor na najwyższy numer, także zaślepki; v36 bez zaślepek).
//   B10 błąd /status 500 (B; onSyncError STATUS_FAILED, bez drenażu i zapisów kluczy).
//   B11 429 na /changes (B; dziś cisza: kursor stoi). B12 503 hub_unavailable na /changes (tylko v37a; dziś cisza).
//       E2-PR1 zmienia B11 i B12 tylko przy włączonej fladze.
// Pole kursor może być mapą po trybie (B9: v36 nie ma zaślepek), pole tryby zawęża scenariusz do trybów, które wytwarzają
// daną odpowiedź (B12). Nowe warianty E2-PR1 (flaga brak / '0') dziedziczą oczekiwania po swoim trybie.
// W każdym: żadne /v1/health, żadne limit=, brak naruszeń atrapy i strażnika (sprzatnijUrzadzenia).
//
// Czerwone na bazie: żadne — zapis bazowy, zielony na e49ff33e.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { utworzAtrapeWorkera, zegarSterowany } from '../support/atrapa-workera-sync.mjs';
import { cisza, sprzatnijUrzadzenia, utworzUrzadzenie } from '../support/urzadzenie-sync.mjs';
import { HASLO_B } from './sesja-zapisu-uprzaz.mjs';

beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(async () => {
  try { await sprzatnijUrzadzenia(); } finally { vi.restoreAllMocks(); }
});

const WARIANTY = [
  { nazwa: 'v37a (produkcja, EVENTS_ENABLED=0)', atrapa: { tryb: 'v37a', eventsEnabled: false } },
  { nazwa: 'v36', atrapa: { tryb: 'v36' } }, // dzisiejszy klient nie rozróżnia — te same oczekiwania
];

// ── Świat: atrapa, A (nowe konto, karta 1), B (bliźniak A przed jakąkolwiek synchronizacją), C (inne konto, leniwie) ──
async function swiat(w) {
  const atrapa = utworzAtrapeWorkera({ ...w.atrapa, zegar: zegarSterowany() });
  const A = await utworzUrzadzenie({ atrapa, nazwa: 'A' });
  const B = await utworzUrzadzenie({ atrapa, nazwa: 'B', zBlizniaka: A });
  await A.zapiszKarte(1);
  const s = { atrapa, A, B, karty: {}, C: null };
  s.daj = async (nazwa) => {
    if (nazwa !== 'C') return s[nazwa];
    if (!s.C) s.C = await utworzUrzadzenie({ atrapa, nazwa: 'C', haslo: HASLO_B });
    return s.C;
  };
  s.wszystkie = () => [s.A, s.B, s.C].filter(Boolean);
  return s;
}

// Pobranie z bramą na odpowiedzi /changes urządzenia: marker po rozstrzygnięciu, potem zwolnienie i cisza.
async function zBrama(s, d, wywolaj, opis) {
  const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: d.nazwa }, { faza: 'po' });
  const r = await wywolaj();
  d.zaznacz(`rozstrzygnięte ${opis(r)}`);
  brama.zwolnij();
  brama.rozbroj();
  await cisza(s.wszystkie());
  return r;
}
async function zapiszIWyslij(s, i) {
  const k = await s.A.zapiszKarte(i);
  s.karty[i] = k.patientId;
  expect(await s.A.wyslijDelteKarty(k.patientId), `delta karty ${i} wysłana beaconem`).toBe(true);
  await cisza(s.wszystkie());
}

const KROKI = {
  async B0(s) { const r = await s.A.sync.syncPush(); await cisza(s.wszystkie()); return r; },
  P2: (s) => zapiszIWyslij(s, 2),
  B1: (s) => zBrama(s, s.B, () => s.B.sync.syncPull({ pierwszePobranie: true }), (r) => r.action),
  async P4(s) { s.karty[3] = (await s.A.zapiszKarte(3)).patientId; },
  B2: (s) => zBrama(s, s.A, () => s.A.sync.syncFull(), (r) => `${r.pull.action}/${r.push.action}`),
  async P5(s) { expect(await s.A.wyslijDelteKarty(s.karty[3])).toBe(true); await cisza(s.wszystkie()); },
  B3: (s) => zBrama(s, s.B, () => s.B.sync.syncPull(), (r) => r.action),
  P6: (s) => zapiszIWyslij(s, 4),
  B4: (s) => zBrama(s, s.B, () => s.B.sync.syncPull(), (r) => r.action),
  B5(s) {
    // POZA KONTRAKTEM: nieaktualny odczyt KV — /status podaje inny ETag niż blob (If-None-Match klienta = bieżący).
    s.atrapa.usterka({ gdy: { trasa: 'status', urzadzenie: 'B' }, zmien: (o) => ({ ...o, cialo: JSON.stringify({ ...JSON.parse(o.cialo), etag: 'f'.repeat(32) }), naglowki: { ...o.naglowki, etag: `"${'f'.repeat(32)}"` } }) });
    return zBrama(s, s.B, () => s.B.sync.syncPull(), (r) => r.action);
  },
  P8: (s) => zapiszIWyslij(s, 8),
  async B8(s) {
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B' }, { faza: 'po' });
    const r1 = await s.B.sync.syncPull();
    await brama.osiagnieta;
    s.B.zaznacz(`pierwsze rozstrzygnięte ${r1.action}`);
    const r2 = await s.B.sync.syncPull();
    s.B.zaznacz(`drugie rozstrzygnięte ${r2.action}`);
    brama.zwolnij();
    brama.rozbroj();
    await cisza(s.wszystkie());
    return [r1, r2];
  },
  async B6(s) {
    const C = await s.daj('C');
    const m = await C.material();
    await s.atrapa.zasiejSlot({ slotId: m.slotId, tokenHash: m.authTokenHash, tylkoTozsamosc: true });
    return zBrama(s, C, () => C.sync.syncPull(), (r) => r.action);
  },
  async B7(s) {
    const C = await s.daj('C');
    const r = await C.sync.syncPull();
    C.zaznacz(`rozstrzygnięte ${r.action} ${r.httpStatus}`);
    await cisza(s.wszystkie());
    return r;
  },
  // Dwie delty i zaślepka (numer bez treści, jak po imporcie ogona v36) przed pierwszym pobraniem B.
  async P9(s) { await zapiszIWyslij(s, 2); await zapiszIWyslij(s, 3); s.atrapa.dopiszZaslepke({ slotId: s.A.slotId }); },
  B9: (s) => zBrama(s, s.B, () => s.B.sync.syncPull({ pierwszePobranie: true }), (r) => r.action),
  async B10(s) {
    s.atrapa.usterka({ gdy: { trasa: 'status', urzadzenie: 'B' }, kod: 'internal_error' });
    const w = await s.B.sync.syncPull().then((r) => ({ r }), (e) => ({ e }));
    s.B.zaznacz(`rozstrzygnięte ${w.e ? w.e.code : w.r.action}`);
    await cisza(s.wszystkie());
    return w;
  },
  B11(s) {
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, kod: 'rate_limited' });
    return zBrama(s, s.B, () => s.B.sync.syncPull(), (r) => r.action);
  },
  B12(s) {
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, kod: 'hub_unavailable' });
    return zBrama(s, s.B, () => s.B.sync.syncPull(), (r) => r.action);
  },
};

const SCENARIUSZE = [
  {
    id: 'B0', nazwa: 'rejestracja (A, syncPush, nowy slot)', przygotuj: [], urzadzenie: 'A',
    os: ['start push', '→ POST /v1/slots/<slot>/register [X-Auth-Token-Hash]', '← 201', 'koniec push registered'],
    magazyn: ['set localStorage vilda-sync-state-v1:<slot>'],
    wynik: (r) => expect(r.action).toBe('registered'),
  },
  {
    id: 'B1', nazwa: 'pierwsze pobranie (B, delta karty 2 w dzienniku)', przygotuj: ['B0', 'P2'], urzadzenie: 'B',
    os: [
      'blokada vilda-sync-pierwsze-pobranie-v1 exclusive', 'start pull',
      '→ GET /v1/slots/<slot>/status [Bearer]', '← 200', '→ GET /v1/slots/<slot>/blob [Bearer]', '← 200',
      'vilda:sync-download-progress download', 'vilda:sync-download-progress decrypt', 'vilda:sync-stale-device',
      '→ GET /v1/slots/<slot>/changes?since=0 [Bearer]', 'koniec pull merged', 'test: rozstrzygnięte merged', '← 200',
      'vilda:sync-merged changes-drain',
    ],
    magazyn: [
      'remove localStorage vilda-cloud-etag-v1:<slot>', 'remove localStorage vilda-sync-cursor-v1:<slot>',
      'set localStorage vilda-sync-state-v1:<slot>', 'set localStorage vilda-sync-state-v1:<slot>',
      'set sessionStorage vilda-sync-pulled-v1', 'set localStorage vilda-sync-cursor-v1:<slot>',
    ],
    kursor: 1,
  },
  {
    id: 'B2', nazwa: 'zwykły cykl (A, syncFull: pobranie, drenaż, wysyłka)', przygotuj: ['B0', 'P2', 'B1', 'P4'], urzadzenie: 'A',
    os: [
      'start full', 'blokada vilda-sync-pierwsze-pobranie-v1 shared', 'start pull',
      '→ GET /v1/slots/<slot>/status [Bearer]', '← 200', '→ GET /v1/slots/<slot>/changes?since=0 [Bearer]',
      'koniec pull up-to-date', 'start push', '→ PUT /v1/slots/<slot>/blob [Bearer, If-Match]', '← 200',
      'koniec push uploaded', 'koniec full', 'test: rozstrzygnięte up-to-date/uploaded', '← 200', 'vilda:sync-merged changes-drain',
    ],
    magazyn: ['set sessionStorage vilda-sync-pulled-v1', 'set localStorage vilda-sync-state-v1:<slot>', 'set localStorage vilda-sync-cursor-v1:<slot>'],
    kursor: 1,
  },
  {
    id: 'B3', nazwa: 'pobranie z kursorem po zmianie ETagu (B, kursor 1)', przygotuj: ['B0', 'P2', 'B1', 'P4', 'B2', 'P5'], urzadzenie: 'B',
    os: [
      'blokada vilda-sync-pierwsze-pobranie-v1 shared', 'start pull',
      '→ GET /v1/slots/<slot>/status [Bearer]', '← 200', '→ GET /v1/slots/<slot>/blob [Bearer, If-None-Match]', '← 200',
      'vilda:sync-download-progress download', 'vilda:sync-download-progress decrypt', 'vilda:sync-stale-device',
      '→ GET /v1/slots/<slot>/changes?since=1 [Bearer]', 'koniec pull merged', 'test: rozstrzygnięte merged', '← 200',
      'vilda:sync-merged changes-drain',
    ],
    magazyn: ['set localStorage vilda-sync-state-v1:<slot>', 'set sessionStorage vilda-sync-pulled-v1', 'set localStorage vilda-sync-cursor-v1:<slot>'],
    kursor: 2,
  },
  {
    id: 'B4', nazwa: 'pobranie z kursorem, ETag bez zmian (B, kursor 2)', przygotuj: ['B0', 'P2', 'B1', 'P4', 'B2', 'P5', 'B3', 'P6'], urzadzenie: 'B',
    os: [
      'blokada vilda-sync-pierwsze-pobranie-v1 shared', 'start pull',
      '→ GET /v1/slots/<slot>/status [Bearer]', '← 200', '→ GET /v1/slots/<slot>/changes?since=2 [Bearer]',
      'koniec pull up-to-date', 'test: rozstrzygnięte up-to-date', '← 200', 'vilda:sync-merged changes-drain',
    ],
    magazyn: ['set sessionStorage vilda-sync-pulled-v1', 'set localStorage vilda-sync-cursor-v1:<slot>'],
    kursor: 3,
  },
  {
    id: 'B5', nazwa: '304 (POZA KONTRAKTEM: nieaktualny ETag w /status)', przygotuj: ['B0', 'P2', 'B1', 'P4', 'B2', 'P5', 'B3', 'P6', 'B4'], urzadzenie: 'B',
    os: [
      'blokada vilda-sync-pierwsze-pobranie-v1 shared', 'start pull',
      '→ GET /v1/slots/<slot>/status [Bearer]', '← 200', '→ GET /v1/slots/<slot>/blob [Bearer, If-None-Match]', '← 304',
      '→ GET /v1/slots/<slot>/changes?since=3 [Bearer]', 'koniec pull up-to-date', 'test: rozstrzygnięte up-to-date', '← 200',
    ],
    magazyn: ['set sessionStorage vilda-sync-pulled-v1'],
    kursor: 3,
    pozaKontraktem: 1,
  },
  {
    id: 'B6', nazwa: '404 no-remote-blob (C, slot tylko tożsamości)', przygotuj: [], urzadzenie: 'C',
    os: [
      'blokada vilda-sync-pierwsze-pobranie-v1 shared', 'start pull',
      '→ GET /v1/slots/<slot>/status [Bearer]', '← 200', '→ GET /v1/slots/<slot>/blob [Bearer]', '← 404 blob_not_found',
      '→ GET /v1/slots/<slot>/changes?since=0 [Bearer]', 'koniec pull no-remote-blob', 'test: rozstrzygnięte no-remote-blob', '← 200',
    ],
    magazyn: [
      'remove localStorage vilda-cloud-etag-v1:<slot>', 'remove localStorage vilda-sync-cursor-v1:<slot>',
      'set localStorage vilda-sync-state-v1:<slot>', 'set sessionStorage vilda-sync-pulled-v1',
    ],
  },
  {
    id: 'B7', nazwa: 'brak slotu (C, 401 → not-registered, bez drenażu)', przygotuj: [], urzadzenie: 'C',
    os: [
      'blokada vilda-sync-pierwsze-pobranie-v1 shared', 'start pull',
      '→ GET /v1/slots/<slot>/status [Bearer]', '← 401 invalid_credentials', 'koniec pull not-registered',
      'test: rozstrzygnięte not-registered 401',
    ],
    magazyn: ['set sessionStorage vilda-sync-pulled-v1'],
  },
  {
    id: 'B8', nazwa: 'drugie pobranie w trakcie drenażu pierwszego (B; jedno /changes)',
    przygotuj: ['B0', 'P2', 'B1', 'P4', 'B2', 'P5', 'B3', 'P6', 'B4', 'B5', 'P8'], urzadzenie: 'B',
    os: [
      'blokada vilda-sync-pierwsze-pobranie-v1 shared', 'start pull',
      '→ GET /v1/slots/<slot>/status [Bearer]', '← 200', '→ GET /v1/slots/<slot>/changes?since=3 [Bearer]',
      'koniec pull up-to-date', 'test: pierwsze rozstrzygnięte up-to-date',
      'blokada vilda-sync-pierwsze-pobranie-v1 shared', 'start pull',
      '→ GET /v1/slots/<slot>/status [Bearer]', '← 200', 'koniec pull up-to-date', 'test: drugie rozstrzygnięte up-to-date',
      '← 200', 'vilda:sync-merged changes-drain',
    ],
    magazyn: ['set sessionStorage vilda-sync-pulled-v1', 'set sessionStorage vilda-sync-pulled-v1', 'set localStorage vilda-sync-cursor-v1:<slot>'],
    kursor: 4,
    pozaKontraktem: 1,
  },
  {
    id: 'B9', nazwa: 'pierwsze pobranie przy kilku wierszach i zaślepce (B; dwie delty i zaślepka w dzienniku)', przygotuj: ['B0', 'P9'], urzadzenie: 'B',
    os: [
      'blokada vilda-sync-pierwsze-pobranie-v1 exclusive', 'start pull',
      '→ GET /v1/slots/<slot>/status [Bearer]', '← 200', '→ GET /v1/slots/<slot>/blob [Bearer]', '← 200',
      'vilda:sync-download-progress download', 'vilda:sync-download-progress decrypt', 'vilda:sync-stale-device',
      '→ GET /v1/slots/<slot>/changes?since=0 [Bearer]', 'koniec pull merged', 'test: rozstrzygnięte merged', '← 200',
      'vilda:sync-merged changes-drain',
    ],
    magazyn: [
      'remove localStorage vilda-cloud-etag-v1:<slot>', 'remove localStorage vilda-sync-cursor-v1:<slot>',
      'set localStorage vilda-sync-state-v1:<slot>', 'set localStorage vilda-sync-state-v1:<slot>',
      'set sessionStorage vilda-sync-pulled-v1', 'set localStorage vilda-sync-cursor-v1:<slot>',
    ],
    // Kursor = najwyższy numer zwróconego wiersza, także zaślepki (v37a: 1, 2, zaślepka 3). v36 czyta lustro R2, w którym
    // zaślepek nie ma (wiersze 1, 2; headSeq 3), więc kursor 2 — nie headSeq (P-SYNC-KURSOR).
    kursor: { v37a: 3, v36: 2 },
  },
  {
    id: 'B10', nazwa: 'błąd /status 500 (B; onSyncError, bez drenażu i zapisów)', przygotuj: ['B0', 'P2', 'B1'], urzadzenie: 'B',
    os: [
      'blokada vilda-sync-pierwsze-pobranie-v1 shared', 'start pull',
      '→ GET /v1/slots/<slot>/status [Bearer]', '← 500 internal_error', 'blad pull STATUS_FAILED', 'test: rozstrzygnięte STATUS_FAILED',
    ],
    magazyn: [],
    kursor: 1,
    wynik: (w) => expect([w.e && w.e.code, w.r]).toEqual(['STATUS_FAILED', undefined]),
  },
  {
    id: 'B11', nazwa: '429 na /changes (B; dziś cisza: kursor stoi, bez scalenia)', przygotuj: ['B0', 'P2', 'B1', 'P6'], urzadzenie: 'B',
    os: [
      'blokada vilda-sync-pierwsze-pobranie-v1 shared', 'start pull',
      '→ GET /v1/slots/<slot>/status [Bearer]', '← 200', '→ GET /v1/slots/<slot>/changes?since=1 [Bearer]',
      'koniec pull up-to-date', 'test: rozstrzygnięte up-to-date', '← 429 rate_limited',
    ],
    magazyn: ['set sessionStorage vilda-sync-pulled-v1'],
    kursor: 1,
  },
  {
    // v36 nie wytwarza 503 na /changes (v36/changes.mjs:30-64) — scenariusz tylko dla v37a.
    id: 'B12', nazwa: '503 hub_unavailable na /changes (B; dziś cisza: kursor stoi, bez scalenia)', przygotuj: ['B0', 'P2', 'B1', 'P6'], urzadzenie: 'B',
    tryby: ['v37a'],
    os: [
      'blokada vilda-sync-pierwsze-pobranie-v1 shared', 'start pull',
      '→ GET /v1/slots/<slot>/status [Bearer]', '← 200', '→ GET /v1/slots/<slot>/changes?since=1 [Bearer]',
      'koniec pull up-to-date', 'test: rozstrzygnięte up-to-date', '← 503 hub_unavailable',
    ],
    magazyn: ['set sessionStorage vilda-sync-pulled-v1'],
    kursor: 1,
  },
];

describe.each(WARIANTY)('E2-PR0 zapis bazowy vilda_sync.js: $nazwa', (w) => {
  const scenariusze = SCENARIUSZE.filter((sc) => !sc.tryby || sc.tryby.includes(w.atrapa.tryb));
  it.each(scenariusze.map((sc) => [`${sc.id} ${sc.nazwa}`, sc]))('%s', async (_opis, sc) => {
    const s = await swiat(w);
    for (const k of sc.przygotuj) await KROKI[k](s);
    const d = await s.daj(sc.urzadzenie);
    const z = d.znacznik();
    const zm = d.znacznikMagazynu();
    const r = await KROKI[sc.id](s);
    expect(d.rzutOsi({ od: z }), `${sc.id}: oś urządzenia ${sc.urzadzenie}`).toEqual(sc.os);
    expect(d.rzutMagazynu({ od: zm }), `${sc.id}: zapisy kluczy vilda-sync-* / vilda-cloud-etag-*`).toEqual(sc.magazyn);
    const kursor = sc.kursor && typeof sc.kursor === 'object' ? sc.kursor[w.atrapa.tryb] : sc.kursor;
    if (kursor !== undefined) expect(d.kursor(), `${sc.id}: kursor`).toBe(kursor);
    if (sc.wynik) sc.wynik(r);
    const wszystkie = s.atrapa.zadania;
    expect(wszystkie.filter((x) => x.sciezka === '/v1/health'), 'klient dziś nie woła /v1/health').toEqual([]);
    expect(wszystkie.filter((x) => /limit=/.test(x.zapytanie)), 'klient dziś nie wysyła limit=').toEqual([]);
    expect(wszystkie.filter((x) => x.transport === 'fetch-okna'), 'beacony bez rezerwy fetch okna').toEqual([]);
    expect(wszystkie.filter((x) => x.pozaKontraktem).length, 'usterki POZA KONTRAKTEM tylko jawne (B5)').toBe(sc.pozaKontraktem || 0);
    expect(s.atrapa.naruszenia).toEqual([]);
  });
});
