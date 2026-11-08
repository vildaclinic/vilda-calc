// P-DZIENNIK-ZDARZEN (E2-PR2a, E2-PR2b1, E2-PR2b2, E2-PR3a1, E2-PR3a1b) — strażniki uśpienia bloku dziennika zdarzeń
// w vilda_vault.js:
// kod produkcyjny woła nowe funkcje wyłącznie z listy miejsc (literał MIEJSCA_POZA_BLOKIEM); bez bramki działają
// sprzątanie po koncie, część Bev_ oraz kasowanie bazy (deleteDatabase) i podsumowanie wyniku (resultSummary) z części
// Bob_, a reszta kończy się na bramce: bez otwarcia bazy kolejki, szyfrowania i żądań. Sprzątanie po koncie: kasowanie
// kolejki w removeUser i ponowienie przy odblokowaniu działają przy każdym stanie bramki (w trybie „Zaloguj
// jednorazowo” nie sięgają do IndexedDB, localStorage ani Web Locks), a przy zamkniętej bramce kończą się na
// liście baz (databases(); bez listy — na deleteDatabase nieistniejącej bazy, bez otwarcia) i nie zostawiają klucza;
// znacznik ponowienia zostaje wtedy tylko po nieudanym albo niedokończonym kasowaniu (np. błąd deleteDatabase
// w przeglądarce bez listy baz; limit blokady konta wymaga trwającego ponowienia, czyli wcześniejszego znacznika)
// — do udanego ponowienia przy odblokowaniu poza trybem „Zaloguj jednorazowo”. Eksport tylko pod VildaVault._eventLog
// (nikt go nie używa), blok nie ma skutków ubocznych przy ładowaniu, część Bev_ (koperty, buildery, szyfrowanie,
// zastosowanie) nie zawiera wywołań zapisu, emisji, sieci ani magazynów przeglądarki, a część magazynu kolejki
// i kwarantanny (Bob_, poniżej znacznika magazynu) sięga do okna wyłącznie przez nazwane pola w nazwanych funkcjach
// i poza wymienionymi wyżej działa tylko za bramką (pole okna VILDA_EVENT_LOG === true).
// Testy źródła (vilda_vault.js, pliki produktu z git ls-files) i eksportu (prawdziwy sejf w oknie uprzęży, dane wyłącznie
// fikcyjne).
//
//   U1    bramka: gateOpen() fałszywe dla każdej wartości pola poza true (także getter rzucający); każda chroniona
//         operacja magazynu — kolejki i kwarantanny (pętla po kluczach eksportu minus jawna lista niechronionych; nowy
//         klucz bez argumentów albo bez bramki = czerwony test; lista chronionych sprawdzana osobno) → { ok: false,
//         powod: 'bramka' } bez odczytu window.indexedDB, localStorage i crypto (gettery liczące) i bez wywołań magazynu
//         sejfu; na adapterze IndexedDB nad atrapą — bez wpisów vilda_sync_* w jej dzienniku i bez klucza urządzenia;
//         zablokowany sejf przy zamkniętej bramce → bramka. resultSummary (niechronione, czysta funkcja) przy zamkniętej
//         bramce i zablokowanym sejfie daje pełne podsumowanie synchronicznie, bez odczytu pól okna (także
//         VILDA_EVENT_LOG), bez zegara i bez wywołań magazynu sejfu.
//   U2(a) identyfikatory Bev_, Bob_ i Bem_ leżą między znacznikami bloku (każdy znacznik dokładnie raz) poza literałem
//         miejsc: `_eventLog:Bev_EKSPORT` oraz wywołania z MIEJSCA_POZA_BLOKIEM (funkcja otaczająca → nazwa → liczba;
//         drzewo składni: każde wywołanie instrukcją wyrażeniową albo elementem wyrażenia przecinkowego bez użycia wyniku;
//         Bob_poKasowaniuSejfu wyłącznie w Buk_obce bloku P-USUN-KONTO-KARTY, w bloku try,
//         poza wyjątkami form: `await Bob_kasujKonto(t)` w xa, `const PatientCheckpointSyncMark=Bob_oznacz(userId)`
//         w PatientCheckpointRemoveUser z wynikiem wyłącznie jako argument Bob_odznacz w bloku catch; w xa kolejność
//         usunięcie wpisu rejestru → Bob_poRejestrze → blokada sejfu → await Bob_kasujKonto; w He Bob_poOdblokowaniu po
//         go()); `_eventLog` dokładnie raz w pliku; zero `._eventLog` i `VildaVault._eventLog`; blok stoi między
//         Bsl_usunPacjenta a `function yr(`. Znacznik magazynu kolejki dokładnie raz, za literałem Bev_EKSPORT; w części
//         Bev_ identyfikatory Bob_ wyłącznie w tym literale (17 kluczy magazynu kolejki i kwarantanny) i jedno
//         Bob_wKasowaniu w Bev_start (adapter sejfu strzeżony przy kasowaniu konta).
//   U2(b) żaden plik produktu poza vilda_vault.js (git ls-files *.js *.mjs *.cjs *.html *.htm bez tests/ i docs/) nie
//         zawiera `_eventLog`, applyEncryptedEvent, encryptEvent, nazw 14 builderów, nazw API magazynu (gateOpen,
//         outbox…), VILDA_EVENT_LOG, klucza urządzenia, nazwy bazy kolejki (vilda_sync_ poza vilda_sync_integration.js),
//         Bev_ ani Bob_ (bez nazw ogólnych: enqueue, eventBytes, kinds, deleteDatabase — istnieją w innych plikach).
//   U2(c) część Bev_: lista zakazana (zapis, emisja, sieć, magazyny przeglądarki, legacy buildery delt, eksport
//         ładunku, console.), także w komentarzach; część Bob_: własna lista tekstowa i reguła domknięcia na drzewie
//         składni (acorn + eslint-scope): wolne identyfikatory wyłącznie z listy, pola okna tylko w swoich funkcjach,
//         Date tylko w funkcjach chwili, zakaz dostępu przez nawias do v, Date, Object, Reflect, liczności wywołań
//         kasowania, listy baz i rejestru. Funkcje eksportu kwarantanny i podsumowania wyniku są deklaracjami
//         najwyższego poziomu części Bob_ (obejmują je obie reguły); navigator tylko w Bob_blokady (lista tekstowa na części
//         bez tej funkcji), AbortController tylko w Bob_podBlokada, localStorage tylko w funkcjach identyfikatora
//         urządzenia, znacznika ponowienia, ponowienia i kasowania konta; żądanie blokady tylko w Bob_podBlokada;
//         liczności kasowania (deleteDatabase w Bob_kasujBaze), listy baz (Bob_istnieje, Bob_kasujKonto) i rejestru
//         (Bob_konto, Bob_poOdblokowaniu); podsumowanie wyniku jest czyste: synchroniczne,
//         a w domknięciu wywołań (funkcje i stałe bloku osiągalne z niej) wolne identyfikatory tylko z listy czystych
//         (bez okna, stanu logowania, sejfu, rejestru, zegara, losowości) — z samokontrolą.
//   U2(d) najwyższy poziom bloku (AST): w części Bev_ nazwy ^Bev_, w części Bob_ ^Bob_; wyłącznie deklaracje function /
//         async function oraz const z literałem, Object.freeze(…) albo new Map() / new Set(); argumenty Object.freeze
//         tylko z literałów, tablic, obiektów (bez kluczy obliczanych i rozwinięć), identyfikatorów, wyrażeń funkcyjnych
//         i zagnieżdżonego Object.freeze — bez odczytów przy ładowaniu.
//   U2(e) eksport _eventLog zamrożony; klucze = dokładnie lista (35: 18 z E2-PR2a, 11 kluczy magazynu kolejki z E2-PR2b1
//         i 6 kluczy kwarantanny i podsumowania wyniku z E2-PR2b2).
//   U4    krótki scenariusz sejfu na adapterze IndexedDB nad atrapą przy zamkniętej bramce (każda istniejąca operacja
//         magazynu, także kwarantanny): databases() bez vilda_sync_*, brak klucza o przedrostku vilda-sync-device-v1.
//   U4′   zwykłe użycie z usunięciem konta przy zamkniętej bramce (moduły punktu odzyskiwania), z navigator.locks i bez:
//         0 baz vilda_sync_*, 0 kluczy i 0 zapisów vilda-sync-* w localStorage, 0 odczytów pola bramki.
// Każdy przypadek, który tnie blok na części, zaczyna od sprawdzenia, że znacznik magazynu jest dokładnie raz.
// Czerwone na sejfie bez kasowania konta (E2-PR2b2): literał miejsc poza blokiem U2(a) (tekst i drzewo składni), Bob_wKasowaniu
// w części Bev_, liczności reguły domknięcia części Bob_ (navigator, AbortController, żądanie blokady, kasowanie, lista
// baz, rejestr); zielone z natury: U1, U2(b), samokontrole wzorców i reguł, lista tekstowa części Bob_, U2(d), U2(e),
// U4, U4′.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'acorn';
import { analyze } from 'eslint-scope';
import { magazynZRejestrem, naglowek, okno, wytnijFunkcje } from './sesja-zapisu-uprzaz.mjs';
import { PRZEDROSTEK_URZADZENIA, SKRYPTY_PUNKTU, ZNACZNIK_MAGAZYNU, oknoMagazynu, przechwycZadaniaWTle } from '../support/okno-magazynu.mjs';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SEJF = 'vilda_vault.js';
const ZRODLO = fs.readFileSync(path.join(KORZEN, SEJF), 'utf8');
const POCZATEK = '/* P-DZIENNIK-ZDARZEN: poczatek bloku */';
const KONIEC = '/* P-DZIENNIK-ZDARZEN: koniec bloku */';
const BUILDERY = ['buildSnapshotEvent', 'buildPatientFullEvents', 'buildPatientTombstoneEvent', 'buildSnapshotTombstoneEvent',
  'buildPatientNoteEvent', 'buildPatientNoteTombstoneEvent', 'buildNoteEvent', 'buildNoteTombstoneEvent', 'buildPatientListEvent',
  'buildPatientListTombstoneEvent', 'buildPreferenceEvent', 'buildPasskeyEvent', 'buildPasskeyTombstoneEvent', 'buildCredentialEvent'];
// Klucze magazynu kolejki (E2-PR2b1) oraz kwarantanny i podsumowania wyniku (E2-PR2b2).
const KLUCZE_KWARANTANNY = ['quarantinePut', 'quarantineList', 'quarantineCount', 'quarantineMinSeq', 'quarantineRelease', 'resultSummary'];
const KLUCZE_MAGAZYNU = ['gateOpen', 'enqueue', 'outboxCount', 'outboxList', 'outboxTake', 'outboxAccept', 'outboxReject',
  'outboxFail', 'outboxRequeueStale', 'outboxDiscard', 'deleteDatabase', ...KLUCZE_KWARANTANNY];
// Fikcyjne argumenty operacji kwarantanny (slot: 64 znaki hex; wynik o kształcie unreadable z applyEncryptedEvent).
const SLOT = '1a2b3c4d'.repeat(8);
const ZMIANA = Object.freeze({ seq: 1, eid: '00000000-0000-4000-8000-000000000001', payload: { iv: 'Rmlrc3lqbmVJVjEy', data: 'AAAA' } });
const NIECZYTELNY = Object.freeze({ status: 'unreadable', reason: 'decrypt' });
const KLUCZE_EKSPORTU = ['kinds', ...BUILDERY, 'encryptEvent', 'eventBytes', 'applyEncryptedEvent', ...KLUCZE_MAGAZYNU];
const RODZAJE = ['snap', 'pfull', 'ptomb', 'stomb', 'pnote', 'pnotetomb', 'note', 'notetomb', 'plist', 'plisttomb', 'pref', 'pk', 'pktomb', 'cred'];
const ile = (tekst, fragment) => tekst.split(fragment).length - 1;
const ID_BEV_BOB = /(?<![A-Za-z0-9_$])B(?:ev|ob|em)_[A-Za-z0-9_$]*/g;
// Wywołania części dziennika spoza bloku: funkcja otaczająca → nazwa → liczba (sprzątanie po koncie w removeUser i ponowienie
// przy odblokowaniu).
const MIEJSCA_POZA_BLOKIEM = Object.freeze({
  PatientCheckpointRemoveUser: { Bob_oznacz: 1, Bob_odznacz: 1 },
  Buk_obce: { Bob_poKasowaniuSejfu: 1 },
  xa: { Bob_poRejestrze: 2, Bob_kasujKonto: 2 },
  He: { Bob_poOdblokowaniu: 1 },
});
const ID_BOB = /(?<![A-Za-z0-9_$])Bob_[A-Za-z0-9_$]*/g;

function blok() {
  const a = ZRODLO.indexOf(POCZATEK);
  const z = ZRODLO.indexOf(KONIEC);
  if (a < 0 || z < a) throw new Error('brak bloku P-DZIENNIK-ZDARZEN (znaczniki początku i końca)');
  return { a, z: z + KONIEC.length, tekst: ZRODLO.slice(a, z + KONIEC.length) };
}
// Część Bev_ = od znacznika początku do znacznika magazynu (bez niego); część Bob_ = od znacznika magazynu (bez niego) do
// znacznika końca (bez niego). Pozycje względem całego pliku.
function czesci() {
  const { a, z } = blok();
  const i = ZRODLO.indexOf(ZNACZNIK_MAGAZYNU);
  if (ile(ZRODLO, ZNACZNIK_MAGAZYNU) !== 1 || i < a || i > z) throw new Error('brak znacznika magazynu kolejki w bloku');
  const zBob = i + ZNACZNIK_MAGAZYNU.length;
  const zKonca = z - KONIEC.length;
  return { a, z, i, bev: ZRODLO.slice(a, i), bob: ZRODLO.slice(zBob, zKonca), odBob: zBob };
}
// Literał Object.freeze({ … }) obiektu Bev_EKSPORT (pozycje w pliku).
function literalEksportu() {
  const start = ZRODLO.indexOf('const Bev_EKSPORT = Object.freeze(');
  if (start < 0) throw new Error('brak const Bev_EKSPORT = Object.freeze(');
  let g = 0;
  for (let k = ZRODLO.indexOf('(', start); k < ZRODLO.length; k += 1) {
    if (ZRODLO[k] === '(') g += 1;
    else if (ZRODLO[k] === ')') { g -= 1; if (!g) return { start, koniec: k + 1, tekst: ZRODLO.slice(start, k + 1) }; }
  }
  throw new Error('nie domknięto literału Bev_EKSPORT');
}
const znacznikRaz = () => expect(ile(ZRODLO, ZNACZNIK_MAGAZYNU), 'znacznik magazynu kolejki dokładnie raz').toBe(1);
// Wywołania części dziennika w kodzie spoza bloku (blok zastąpiony spacjami): { miejsca: funkcja → nazwa → liczba, bledy }.
// Forma domyślna: instrukcja wyrażeniowa albo element wyrażenia przecinkowego, który nie jest ostatni (wynik nieużyty).
// Wyjątki: `await Bob_kasujKonto(…)` w xa (element wyrażenia przecinkowego, nie ostatni);
// `const PatientCheckpointSyncMark = Bob_oznacz(…)` w PatientCheckpointRemoveUser, a ta stała wyłącznie jako drugi argument
// Bob_odznacz w bloku catch. Kolejność: w xa (w każdym wyrażeniu przecinkowym z kasowaniem kolejki) usunięcie wpisu
// rejestru → Bob_poRejestrze → [blokada sejfu kn] → await Bob_kasujKonto; w He Bob_poOdblokowaniu po go().
function miejscaPozaBlokiem(zrodlo) {
  const ast = parse(zrodlo, { ecmaVersion: 'latest', sourceType: 'script' });
  const rodzic = new Map();
  const idz = (n, p) => {
    if (!n || typeof n.type !== 'string') return;
    rodzic.set(n, p);
    for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach((y) => idz(y, n)); else if (x && typeof x.type === 'string') idz(x, n); }
  };
  idz(ast, null);
  const FUNKCJE = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'];
  const funkcja = (n) => { let p = rodzic.get(n); while (p && !FUNKCJE.includes(p.type)) p = rodzic.get(p); return p; };
  const nazwaFunkcji = (f) => (f && f.type === 'FunctionDeclaration' && f.id ? f.id.name : f ? '(funkcja zagnieżdżona)' : '(najwyższy poziom)');
  const zawiera = (n, test) => {
    let jest = false;
    const szukaj = (x) => { if (jest || !x || typeof x.type !== 'string') return; if (test(x)) { jest = true; return; } for (const k of Object.keys(x)) { const y = x[k]; if (Array.isArray(y)) y.forEach(szukaj); else if (y && typeof y.type === 'string') szukaj(y); } };
    szukaj(n);
    return jest;
  };
  const wywolanie = (x, nazwa) => x.type === 'CallExpression' && x.callee.type === 'Identifier' && x.callee.name === nazwa;
  const metoda = (x, nazwa) => x.type === 'CallExpression' && x.callee.type === 'MemberExpression' && !x.callee.computed && x.callee.property.name === nazwa;
  const miejsca = {};
  const bledy = [];
  const wezly = [];
  const zbierz = (n) => { if (!n || typeof n.type !== 'string') return; wezly.push(n); for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach(zbierz); else if (x && typeof x.type === 'string') zbierz(x); } };
  zbierz(ast);
  for (const id of wezly) {
    if (id.type !== 'Identifier' || !/^B(?:ev|ob|em)_/.test(id.name)) continue;
    const p = rodzic.get(id);
    if (p.type === 'MemberExpression' && p.property === id && !p.computed) continue;
    if (p.type === 'Property' && p.key === id && !p.computed) continue;
    if (id.name === 'Bev_EKSPORT' && p.type === 'Property' && p.value === id && !p.computed && p.key.name === '_eventLog') continue;
    const f = funkcja(id);
    const fn = nazwaFunkcji(f);
    const gdzie = `${id.name} w ${fn}`;
    miejsca[fn] = miejsca[fn] || {};
    miejsca[fn][id.name] = (miejsca[fn][id.name] || 0) + 1;
    if (!(p.type === 'CallExpression' && p.callee === id)) { bledy.push(`${gdzie}: odwołanie bez wywołania`); continue; }
    const wyzej = rodzic.get(p);
    const nieOstatni = (seq, el) => seq && seq.type === 'SequenceExpression' && seq.expressions.indexOf(el) >= 0 && seq.expressions.indexOf(el) < seq.expressions.length - 1;
    if (id.name === 'Bob_kasujKonto' && fn === 'xa') {
      if (!(wyzej.type === 'AwaitExpression' && nieOstatni(rodzic.get(wyzej), wyzej))) bledy.push(`${gdzie}: forma inna niż await jako element wyrażenia przecinkowego`);
      continue;
    }
    if (id.name === 'Bob_oznacz' && fn === 'PatientCheckpointRemoveUser') {
      const dekl = rodzic.get(wyzej);
      if (!(wyzej.type === 'VariableDeclarator' && wyzej.id.name === 'PatientCheckpointSyncMark' && dekl.kind === 'const')) { bledy.push(`${gdzie}: forma inna niż const PatientCheckpointSyncMark = Bob_oznacz(…)`); continue; }
      const uzycia = wezly.filter((x) => x.type === 'Identifier' && x.name === 'PatientCheckpointSyncMark' && x !== wyzej.id && funkcja(x) === f);
      const poprawne = uzycia.filter((x) => { const c = rodzic.get(x); return wywolanie(c, 'Bob_odznacz') && c.arguments[1] === x; });
      if (uzycia.length !== 1 || poprawne.length !== 1) bledy.push(`${gdzie}: wynik użyty poza jednym argumentem Bob_odznacz (${uzycia.length} użyć)`);
      continue;
    }
    if (!(wyzej.type === 'ExpressionStatement' || nieOstatni(wyzej, p))) { bledy.push(`${gdzie}: wynik użyty (${wyzej.type})`); continue; }
    if (id.name === 'Bob_odznacz') {
      let c = rodzic.get(p);
      while (c && c !== f && c.type !== 'CatchClause') c = rodzic.get(c);
      if (!c || c.type !== 'CatchClause') bledy.push(`${gdzie}: poza blokiem catch`);
    }
    if (id.name === 'Bob_poKasowaniuSejfu') {
      let c = wyzej;
      let w = rodzic.get(c);
      while (w && w !== f && !(w.type === 'TryStatement' && w.block === c)) { c = w; w = rodzic.get(w); }
      if (!w || w === f) bledy.push(`${gdzie}: poza blokiem try`);
    }
  }
  // Kolejność w xa: każde wyrażenie przecinkowe z Bob_poRejestrze ma kasowanie kolejki po nim i usunięcie wpisu rejestru przed nim.
  for (const seq of wezly.filter((x) => x.type === 'SequenceExpression' && x.expressions.some((e) => wywolanie(e, 'Bob_poRejestrze')))) {
    const el = seq.expressions;
    const i = (test) => el.findIndex((e) => zawiera(e, test));
    const rej = i((x) => metoda(x, 'removeRegistryEntry'));
    const po = el.findIndex((e) => wywolanie(e, 'Bob_poRejestrze'));
    const kas = el.findIndex((e) => e.type === 'AwaitExpression' && wywolanie(e.argument, 'Bob_kasujKonto'));
    const kn = i((x) => wywolanie(x, 'kn'));
    if (!(rej >= 0 && rej < po && po < kas)) bledy.push(`xa: kolejność usunięcie wpisu rejestru (${rej}) → Bob_poRejestrze (${po}) → await Bob_kasujKonto (${kas})`);
    if (kn >= 0 && !(po < kn && kn < kas)) bledy.push(`xa: blokada sejfu (${kn}) nie między Bob_poRejestrze (${po}) a await Bob_kasujKonto (${kas})`);
  }
  // He: Bob_poOdblokowaniu po go().
  for (const he of wezly.filter((x) => x.type === 'FunctionDeclaration' && x.id && x.id.name === 'He')) {
    const go = wezly.filter((x) => wywolanie(x, 'go') && funkcja(x) === he).map((x) => x.start);
    const po = wezly.filter((x) => wywolanie(x, 'Bob_poOdblokowaniu') && funkcja(x) === he).map((x) => x.start);
    if (po.length && !(go.length && po.every((x) => x > Math.max(...go)))) bledy.push('He: Bob_poOdblokowaniu przed go()');
  }
  return { miejsca, bledy };
}
function plikiProdukcyjne() {
  return execFileSync('git', ['ls-files', '-z', '--', '*.js', '*.mjs', '*.cjs', '*.html', '*.htm'], { cwd: KORZEN, encoding: 'utf8' })
    .split('\0')
    .filter((p) => p && !p.startsWith('tests/') && !p.startsWith('docs/') && p !== SEJF);
}

let eksport = null;
beforeAll(() => {
  const { win } = okno();
  eksport = win.VildaVault._eventLog;
});

describe('U1: bramka zamknięta — każda chroniona operacja magazynu kończy się na bramce', () => {
  // Klucze bez bramki: z E2-PR2a (nie dotykają magazynu kolejki), gateOpen i resultSummary (czyste) oraz deleteDatabase
  // (sprzątanie po koncie).
  const NIECHRONIONE = ['kinds', ...BUILDERY, 'encryptEvent', 'eventBytes', 'applyEncryptedEvent', 'gateOpen', 'resultSummary', 'deleteDatabase'];
  const EID = '00000000-0000-4000-8000-000000000001';
  const ARGUMENTY = (k) => ({
    enqueue: ['snap', k], outboxCount: [], outboxList: [], outboxTake: [], outboxAccept: [[EID]],
    outboxReject: [[{ eid: EID, code: 'EVENT_REJECTED' }]], outboxFail: [[EID], { code: 'NETWORK' }], outboxRequeueStale: [],
    outboxDiscard: [[EID], { potwierdzone: true }],
    quarantinePut: [ZMIANA, NIECZYTELNY, { slotId: SLOT, appVersion: '1.1.459' }], quarantineList: [], quarantineCount: [],
    quarantineMinSeq: [{ slotId: SLOT }], quarantineRelease: [[1], { slotId: SLOT }],
  });
  const POLA = ['indexedDB', 'localStorage', 'crypto'];
  const makrozadania = async (n) => { for (let i = 0; i < n; i += 1) await new Promise((r) => { setImmediate(r); }); };
  const okna = [];
  beforeEach(() => { przechwycZadaniaWTle(); });
  afterEach(() => {
    for (const o of okna.splice(0)) { if (o.krypto) o.krypto.rozbroj(); o.timery.wyczysc(); }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  // Na czas każdego wywołania: gettery pól okna liczą odczyty i rzucają; potem pola wracają.
  async function bezDostepu(win, wywolanie) {
    const odczyty = { indexedDB: 0, localStorage: 0, crypto: 0 };
    const oryginalne = {};
    for (const k of POLA) {
      oryginalne[k] = Object.getOwnPropertyDescriptor(win, k);
      Object.defineProperty(win, k, { get() { odczyty[k] += 1; throw new Error(`odczyt ${k}`); }, configurable: true });
    }
    let w;
    let odrzucona = null;
    try { w = await wywolanie(); } catch (x) { odrzucona = x; } finally {
      for (const k of POLA) {
        if (oryginalne[k]) Object.defineProperty(win, k, oryginalne[k]);
        else delete win[k];
      }
    }
    return { w, odrzucona: odrzucona && String(odrzucona.message || odrzucona), odczyty };
  }
  // Klucze obecne w eksporcie poza niechronionymi (pełną listę sprawdza osobny przypadek niżej).
  const chronione = (ev) => Object.keys(ev).filter((k) => !NIECHRONIONE.includes(k));
  async function kazdaNaBramce(win, ev, k, tylko = null) {
    const arg = ARGUMENTY(k);
    const lista = chronione(ev).filter((n) => !tylko || tylko.includes(n));
    if (tylko) expect(lista.sort(), 'operacje do sprawdzenia').toEqual([...tylko].sort());
    for (const nazwa of lista) {
      expect(arg[nazwa], `${nazwa}: nowy klucz eksportu bez argumentów w U1 (dopisać i sprawdzić bramkę)`).toBeTruthy();
      const r = await bezDostepu(win, () => ev[nazwa](...arg[nazwa]));
      expect(r, nazwa).toEqual({ w: { ok: false, powod: 'bramka' }, odrzucona: null, odczyty: { indexedDB: 0, localStorage: 0, crypto: 0 } });
    }
  }

  it('U1: gateOpen() — false dla braku pola, false, \'true\', 1, obiektu (element o tym id) i gettera rzucającego; true → true', () => {
    const { win, timery } = okno();
    okna.push({ timery });
    const ev = win.VildaVault._eventLog;
    expect(typeof ev.gateOpen, 'API magazynu kolejki (gateOpen)').toBe('function');
    expect(ev.gateOpen()).toBe(false);
    for (const x of [false, 'true', 1, {}, { tagName: 'DIV', id: 'VILDA_EVENT_LOG' }, null]) {
      win.VILDA_EVENT_LOG = x;
      expect(ev.gateOpen(), String(x)).toBe(false);
    }
    Object.defineProperty(win, 'VILDA_EVENT_LOG', { get() { throw new Error('Fikcyjny getter'); }, configurable: true });
    expect(ev.gateOpen(), 'getter rzucający').toBe(false);
    Object.defineProperty(win, 'VILDA_EVENT_LOG', { value: true, writable: true, configurable: true });
    expect(ev.gateOpen()).toBe(true);
  });

  it('U1(a): sejf na adapterze w pamięci z rejestrem — każda chroniona operacja → bramka; zero odczytów pól okna i wywołań magazynu', async () => {
    const o = okno();
    okna.push(o);
    const v = o.win.VildaVault;
    expect(typeof v._eventLog.gateOpen, 'API magazynu kolejki (gateOpen)').toBe('function');
    const m = magazynZRejestrem(v.createInMemoryAdapter());
    v.setStorageAdapter(m.adapter);
    await v.createUser('Fikcyjne#Bramka!2026aa', { label: 'Fikcyjna Lekarka Bramka', iterations: 1000 });
    const r = await v.savePatient(naglowek(1), { dedup: false });
    await makrozadania(50);
    const przed = m.wyw.length;
    await kazdaNaBramce(o.win, v._eventLog, { patientId: r.patientId, snapshotId: r.snapshotId });
    await makrozadania(20);
    expect(m.wyw.slice(przed), 'wywołania magazynu sejfu').toEqual([]);
  });

  it('U1(b): adapter IndexedDB nad atrapą (tryb prywatny spełniony) — każda chroniona operacja → bramka; dziennik atrapy bez vilda_sync_*, brak klucza urządzenia', async () => {
    const o = await oknoMagazynu({ konta: 'A', bramka: false });
    okna.push(o);
    expect(typeof o.ev.gateOpen, 'API magazynu kolejki (gateOpen)').toBe('function');
    const r = await o.v.savePatient(naglowek(1), { dedup: false });
    await o.cisza();
    await kazdaNaBramce(o.win, o.ev, { patientId: r.patientId, snapshotId: r.snapshotId });
    await o.cisza();
    expect(o.idb.__atrapa.log.filter((w) => typeof w[1] === 'string' && w[1].startsWith('vilda_sync_'))).toEqual([]);
    expect(o.win.localStorage.klucze().filter((k) => k.startsWith(PRZEDROSTEK_URZADZENIA))).toEqual([]);
  });

  it('U1: zablokowany sejf przy zamkniętej bramce → bramka (bramka sprawdzana przed blokadą)', async () => {
    const o = await oknoMagazynu({ konta: 'A', bramka: false });
    okna.push(o);
    expect(typeof o.ev.gateOpen, 'API magazynu kolejki (gateOpen)').toBe('function');
    const r = await o.v.savePatient(naglowek(1), { dedup: false });
    await o.cisza();
    o.zablokuj();
    await kazdaNaBramce(o.win, o.ev, { patientId: r.patientId, snapshotId: r.snapshotId });
  });

  it('U1 (E2-PR2b2): chronione klucze eksportu = operacje kolejki i kwarantanny (14), każdy z argumentami w U1; niechronione — klucze E2-PR2a, gateOpen, resultSummary, deleteDatabase', () => {
    const { win, timery } = okno();
    okna.push({ timery });
    const ev = win.VildaVault._eventLog;
    expect(typeof ev.quarantinePut, 'API kwarantanny (quarantinePut)').toBe('function');
    const lista = chronione(ev).sort();
    expect(lista, 'chronione klucze eksportu').toEqual(KLUCZE_MAGAZYNU.filter((k) => !NIECHRONIONE.includes(k)).sort());
    expect(lista).toHaveLength(14);
    expect(Object.keys(ARGUMENTY(null)).sort(), 'argumenty U1 dla każdego chronionego klucza').toEqual(lista);
    expect(Object.keys(ev).filter((k) => NIECHRONIONE.includes(k)).sort()).toEqual([...NIECHRONIONE].sort());
  });

  it('U1 (kwarantanna): każda operacja kwarantanny → bramka bez odczytu pól okna — sejf na adapterze w pamięci z rejestrem (zero wywołań magazynu) i na adapterze IndexedDB nad atrapą (bez wpisów vilda_sync_*), także przy zablokowanym sejfie', async () => {
    const KW = KLUCZE_KWARANTANNY.filter((k) => k !== 'resultSummary');
    const o = okno();
    okna.push(o);
    const v = o.win.VildaVault;
    expect(typeof v._eventLog.quarantinePut, 'API kwarantanny (quarantinePut)').toBe('function');
    const m = magazynZRejestrem(v.createInMemoryAdapter());
    v.setStorageAdapter(m.adapter);
    await v.createUser('Fikcyjne#Bramka!2026aa', { label: 'Fikcyjna Lekarka Bramka', iterations: 1000 });
    await makrozadania(50);
    const przed = m.wyw.length;
    await kazdaNaBramce(o.win, v._eventLog, null, KW);
    await makrozadania(20);
    expect(m.wyw.slice(przed), 'wywołania magazynu sejfu').toEqual([]);
    const o2 = await oknoMagazynu({ konta: 'A', bramka: false });
    okna.push(o2);
    await o2.cisza();
    await kazdaNaBramce(o2.win, o2.ev, null, KW);
    o2.zablokuj();
    await kazdaNaBramce(o2.win, o2.ev, null, KW);
    await o2.cisza();
    expect(o2.idb.__atrapa.log.filter((w) => typeof w[1] === 'string' && w[1].startsWith('vilda_sync_'))).toEqual([]);
    expect(o2.win.localStorage.klucze().filter((k) => k.startsWith(PRZEDROSTEK_URZADZENIA))).toEqual([]);
  });

  // Synchronicznie, na czas jednego wywołania: gettery pól okna (także pola bramki) liczą odczyty i rzucają, zegar (Date:
  // konstruktor, wywołanie, now) liczy użycia; potem wszystko wraca.
  function bezDostepuSync(win, wywolanie) {
    const pola = [...POLA, 'VILDA_EVENT_LOG'];
    const odczyty = Object.fromEntries(pola.map((k) => [k, 0]));
    const oryginalne = {};
    for (const k of pola) {
      oryginalne[k] = Object.getOwnPropertyDescriptor(win, k);
      Object.defineProperty(win, k, { get() { odczyty[k] += 1; throw new Error(`odczyt ${k}`); }, configurable: true });
    }
    const D = globalThis.Date;
    let zegar = 0;
    globalThis.Date = new Proxy(D, {
      construct(t, a) { zegar += 1; return Reflect.construct(t, a); },
      apply(t, ten, a) { zegar += 1; return Reflect.apply(t, ten, a); },
      get(t, k) { if (k === 'now') return () => { zegar += 1; return D.now(); }; return Reflect.get(t, k); },
    });
    let s;
    let blad = null;
    try { s = wywolanie(); } catch (x) { blad = String(x && x.message); } finally {
      globalThis.Date = D;
      for (const k of pola) {
        if (oryginalne[k]) Object.defineProperty(win, k, oryginalne[k]);
        else delete win[k];
      }
    }
    return { s, blad, obietnica: !!s && typeof s.then === 'function', zegar, odczyty };
  }
  it('U1: resultSummary (bez bramki) przy zamkniętej bramce i przy zablokowanym sejfie — pełne podsumowanie synchronicznie, bez odczytu pól okna (indexedDB, localStorage, crypto, VILDA_EVENT_LOG), bez zegara i bez wywołań magazynu sejfu', async () => {
    const o = okno();
    okna.push(o);
    const v = o.win.VildaVault;
    expect(typeof v._eventLog.resultSummary, 'API podsumowania wyniku (resultSummary)').toBe('function');
    const m = magazynZRejestrem(v.createInMemoryAdapter());
    v.setStorageAdapter(m.adapter);
    await v.createUser('Fikcyjne#Bramka!2026aa', { label: 'Fikcyjna Lekarka Bramka', iterations: 1000 });
    await makrozadania(50);
    const blad = { status: 'apply-error', code: 'QuotaExceededError' };
    Object.defineProperty(blad, 'error', { value: new Error('Fikcyjny błąd zapisu'), enumerable: false });
    const PRZYPADKI = [
      [{ status: 'applied', result: { mergedPatientCount: 1, addedPatientCount: 1, credentialUpdated: false, staleDevice: { warn: false }, clockSkew: null } },
        { status: 'applied', liczniki: { mergedPatientCount: 1, addedPatientCount: 1 } }],
      [NIECZYTELNY, { status: 'unreadable', reason: 'decrypt' }],
      [{ status: 'busy', code: 'MERGE_BUSY' }, { status: 'busy', code: 'MERGE_BUSY' }],
      [blad, { status: 'apply-error', code: 'QuotaExceededError' }],
      [{ status: 'locked' }, { status: 'locked' }],
      [{ status: 'session-changed' }, { status: 'session-changed' }],
      [null, { status: 'nieznany' }],
    ];
    const ZERO = { indexedDB: 0, localStorage: 0, crypto: 0, VILDA_EVENT_LOG: 0 };
    for (const stan of ['bramka zamknięta', 'sejf zablokowany']) {
      if (stan === 'sejf zablokowany') v.lock('manual');
      const przed = m.wyw.length;
      for (const [w, ocz] of PRZYPADKI) {
        const r = bezDostepuSync(o.win, () => v._eventLog.resultSummary(w));
        expect(r, `${stan}: ${JSON.stringify(w)}`).toEqual({ s: ocz, blad: null, obietnica: false, zegar: 0, odczyty: ZERO });
      }
      await makrozadania(20);
      expect(m.wyw.slice(przed), `${stan}: wywołania magazynu sejfu`).toEqual([]);
    }
  });
});

describe('U2(a): identyfikatory Bev_ i Bob_ tylko w bloku; _eventLog dokładnie raz', () => {
  it('eksport dziennika zdarzeń istnieje (VildaVault._eventLog)', () => {
    expect(typeof eksport).toBe('object');
  });

  it('znaczniki bloku dokładnie raz; poza blokiem Bev_/Bob_/Bem_ tylko _eventLog:Bev_EKSPORT i wywołania z literału miejsc (tekst, także komentarze)', () => {
    expect(ile(ZRODLO, POCZATEK), 'znacznik początku').toBe(1);
    expect(ile(ZRODLO, KONIEC), 'znacznik końca').toBe(1);
    const { a, z } = blok();
    const poza = ZRODLO.slice(0, a) + ZRODLO.slice(z);
    const ids = [...poza.matchAll(ID_BEV_BOB)].map((m) => m[0]);
    const policz = (lista) => lista.reduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {});
    const oczekiwane = { Bev_EKSPORT: 1 };
    for (const nazwy of Object.values(MIEJSCA_POZA_BLOKIEM)) for (const [n, k] of Object.entries(nazwy)) oczekiwane[n] = (oczekiwane[n] || 0) + k;
    expect(policz(ids), 'Bev_/Bob_/Bem_ poza blokiem (nazwa → liczba)').toEqual(oczekiwane);
    expect(ile(poza, '_eventLog:Bev_EKSPORT')).toBe(1);
    expect(ile(ZRODLO, 'STORAGE_MODE_CLOUD_ONLY:Se,_eventLog:Bev_EKSPORT};'), 'klucz na końcu eksportu').toBe(1);
    expect(Object.keys(eksport).sort()).toEqual([...KLUCZE_EKSPORTU].sort());
  });

  it('U2(a): wywołania z literału miejsc poza blokiem — funkcja otaczająca, liczba i forma (drzewo składni; bez użycia wyniku poza wyjątkami form), kolejność w xa i He', () => {
    const { a, z } = blok();
    const poza = ZRODLO.slice(0, a) + ' '.repeat(z - a) + ZRODLO.slice(z);
    expect(miejscaPozaBlokiem(poza)).toEqual({ miejsca: MIEJSCA_POZA_BLOKIEM, bledy: [] });
  });

  it('samokontrola literału miejsc: użycie wyniku, await, return, miejsce spoza literału, zła kolejność w xa albo He i wynik oznaczenia poza Bob_odznacz — czerwone; formy z literału zielone', () => {
    const DOBRE = [
      'async function PatientCheckpointRemoveUser(userId, password) { const PatientCheckpointSyncMark=Bob_oznacz(userId); try { await f(); } catch (e) { Bob_odznacz(userId, PatientCheckpointSyncMark); throw e; } finally { g(); } }',
      'async function xa(t,e){ if(!r){ return W(A,(await I().getRegistryEntry(t)&&await I().removeRegistryEntry(W(A,t)),Bob_poRejestrze(t),await Bob_kasujKonto(t),true)); } return W(A,(await I().deleteUserDatabase(W(t,t)),await I().removeRegistryEntry(W(A,t)),Bob_poRejestrze(t),b===t&&kn("user-removed"),await Bob_kasujKonto(t),true)); }',
      'function He(t){ $n.forEach(function(n){ n(e); }); try{go()}catch(x){r(x);} Bob_poOdblokowaniu(); }',
      'function Buk_obce(uid) { try { Buk_usuniete.add(uid); Bob_poKasowaniuSejfu(uid); } catch (x) { g(); } }',
    ].join('\n');
    expect(miejscaPozaBlokiem(DOBRE)).toEqual({ miejsca: MIEJSCA_POZA_BLOKIEM, bledy: [] });
    const zle = [
      DOBRE.replace('Bob_poOdblokowaniu();', 'const x = Bob_poOdblokowaniu();'),
      DOBRE.replace('function He(t){', 'async function He(t){').replace('Bob_poOdblokowaniu();', 'await Bob_poOdblokowaniu();'),
      DOBRE.replace('Bob_poOdblokowaniu();', 'return Bob_poOdblokowaniu();'),
      DOBRE.replace('Bob_poOdblokowaniu();', 'Bob_poOdblokowaniu().then(f);'),
      DOBRE.replace('try{go()}catch(x){r(x);} Bob_poOdblokowaniu();', 'Bob_poOdblokowaniu(); try{go()}catch(x){r(x);}'),
      DOBRE.replace(',Bob_poRejestrze(t),b===t&&kn("user-removed"),await Bob_kasujKonto(t),true', ',Bob_poRejestrze(t),await Bob_kasujKonto(t),b===t&&kn("user-removed"),true'),
      DOBRE.replace('await I().deleteUserDatabase(W(t,t)),await I().removeRegistryEntry(W(A,t)),Bob_poRejestrze(t)', 'await I().deleteUserDatabase(W(t,t)),Bob_poRejestrze(t),await I().removeRegistryEntry(W(A,t))'),
      DOBRE.replace(',Bob_poRejestrze(t),await Bob_kasujKonto(t),true));', ',Bob_poRejestrze(t),Bob_kasujKonto(t),true));'),
      DOBRE.replace(',Bob_poRejestrze(t),await Bob_kasujKonto(t),true));', ',Bob_poRejestrze(t),true)); await Bob_kasujKonto(t);'),
      DOBRE.replace('Bob_odznacz(userId, PatientCheckpointSyncMark);', 'Bob_odznacz(userId, PatientCheckpointSyncMark); h(PatientCheckpointSyncMark);'),
      DOBRE.replace('catch (e) { Bob_odznacz(userId, PatientCheckpointSyncMark); throw e; } finally { g(); }', 'catch (e) { throw e; } finally { g(); } Bob_odznacz(userId, PatientCheckpointSyncMark);'),
      DOBRE.replace('const PatientCheckpointSyncMark=Bob_oznacz(userId);', 'let PatientCheckpointSyncMark=Bob_oznacz(userId);'),
      `${DOBRE}\nfunction Inna() { Bob_poRejestrze(u); }`,
      `${DOBRE}\nfunction ns() { Bem_partia(1); }`,
      DOBRE.replace('try{go()}catch(x){r(x);} Bob_poOdblokowaniu(); }', 'try{go()}catch(x){r(x);} }').replace('$n.forEach(function(n){ n(e); });', '$n.forEach(function(n){ n(e); Bob_poOdblokowaniu(); });'),
      DOBRE.replace('try { Buk_usuniete.add(uid); Bob_poKasowaniuSejfu(uid); } catch (x) { g(); }', 'Buk_usuniete.add(uid); Bob_poKasowaniuSejfu(uid);'),
      DOBRE.replace('Bob_poKasowaniuSejfu(uid); } catch (x) { g(); }', '} catch (x) { Bob_poKasowaniuSejfu(uid); }'),
      DOBRE.replace('Bob_poKasowaniuSejfu(uid);', 'const x = Bob_poKasowaniuSejfu(uid);'),
      DOBRE.replace('function Buk_obce(uid) {', 'function Buk_zmiana(uid) {'),
      DOBRE.replace('try { Buk_usuniete.add(uid); Bob_poKasowaniuSejfu(uid); }', 'try { Buk_usuniete.add(uid); [1].forEach(function () { Bob_poKasowaniuSejfu(uid); }); }'),
    ];
    for (const [i, kod] of zle.entries()) {
      expect(kod, `wariant ${i} różni się od form z literału`).not.toBe(DOBRE);
      const w = miejscaPozaBlokiem(kod);
      expect(w.bledy.length + (JSON.stringify(w.miejsca) === JSON.stringify(MIEJSCA_POZA_BLOKIEM) ? 0 : 1), `wariant ${i}`).toBeGreaterThan(0);
    }
  });

  it('_eventLog dokładnie raz w pliku; zero odwołań przez obiekt (._eventLog, VildaVault._eventLog, [\'_eventLog\'])', () => {
    expect(ile(ZRODLO, '_eventLog')).toBe(1);
    expect(ZRODLO.match(/\._eventLog\b/g)).toBe(null);
    expect(ZRODLO.match(/VildaVault\s*\.\s*_eventLog/g)).toBe(null);
    expect(ZRODLO.match(/\[\s*['"`]_eventLog['"`]\s*\]/g)).toBe(null);
  });

  it('blok stoi na końcu czytelnego bloku B???_: po Bsl_usunPacjenta, tuż przed `function yr(t,e){`', () => {
    const { a, z } = blok();
    expect(ZRODLO.indexOf('async function Bsl_usunPacjenta(')).toBeLessThan(a);
    expect(ZRODLO.slice(z, z + 1 + 'function yr(t,e){'.length)).toBe('\nfunction yr(t,e){');
    expect(ZRODLO.slice(0, a).endsWith('}\n'), 'blok zaczyna się od nowej linii po klamrze Bsl_usunPacjenta').toBe(true);
  });

  it('U2(a) (E2-PR2b, E2-PR3a1): znacznik magazynu kolejki dokładnie raz, za literałem Bev_EKSPORT, przed znacznikiem końca; Bob_ w części Bev_ wyłącznie w tym literale (17 kluczy magazynu kolejki i kwarantanny) i jedno Bob_wKasowaniu w Bev_start', () => {
    znacznikRaz();
    expect(ZNACZNIK_MAGAZYNU.includes('Bob_'), 'tekst znacznika bez Bob_').toBe(false);
    const { a, z, i, bev } = czesci();
    const lit = literalEksportu();
    expect(lit.start).toBeGreaterThan(a);
    expect(lit.koniec, 'znacznik magazynu za literałem Bev_EKSPORT').toBeLessThan(i);
    expect(i).toBeLessThan(z);
    expect(ZRODLO.slice(lit.koniec, i).trim(), 'między literałem eksportu a znacznikiem magazynu tylko średnik').toBe(';');
    const wBev = [...bev.matchAll(ID_BOB)].map((m) => ({ poz: a + m.index, nazwa: m[0] }));
    const start = ZRODLO.indexOf('function Bev_start(');
    const poza = wBev.filter((x) => x.poz < lit.start || x.poz >= lit.koniec);
    const wStart = start >= 0 ? start + wytnijFunkcje(ZRODLO.slice(start), 'Bev_start').length : -1;
    expect(poza.map((x) => `${x.nazwa}${x.poz > start && x.poz < wStart ? ' w Bev_start' : ''}`), 'Bob_ w części Bev_ poza literałem eksportu').toEqual(['Bob_wKasowaniu w Bev_start']);
    expect(KLUCZE_MAGAZYNU).toHaveLength(17);
    expect(wBev.length - poza.length, 'Bob_ w literale eksportu: 17 kluczy magazynu kolejki i kwarantanny').toBe(KLUCZE_MAGAZYNU.length);
    const pary = [...lit.tekst.matchAll(/(\w+)\s*:\s*(Bob_[A-Za-z0-9_$]*)/g)].map((m) => m[1]);
    expect(pary.sort()).toEqual([...KLUCZE_MAGAZYNU].sort());
  });
});

describe('U2(b): pliki produktu poza sejfem nie znają nowego API', () => {
  const NAZWY = ['_eventLog', 'applyEncryptedEvent', 'encryptEvent', ...BUILDERY, 'VILDA_EVENT_LOG', PRZEDROSTEK_URZADZENIA,
    ...KLUCZE_MAGAZYNU.filter((k) => k !== 'enqueue' && k !== 'deleteDatabase')];
  const WZORCE = [/vilda_sync_(?!integration\.js)/, /(?<![A-Za-z0-9_$])Bev_/, /(?<![A-Za-z0-9_$])Bob_/];
  it('żaden plik produktu poza vilda_vault.js nie zawiera _eventLog, nazw API dziennika i magazynu, VILDA_EVENT_LOG, klucza urządzenia, nazwy bazy kolejki, Bev_ ani Bob_', () => {
    const winne = [];
    for (const plik of plikiProdukcyjne()) {
      const tresc = fs.readFileSync(path.join(KORZEN, plik), 'utf8');
      for (const n of NAZWY) if (tresc.includes(n)) winne.push(`${plik}: ${n}`);
      for (const re of WZORCE) if (re.test(tresc)) winne.push(`${plik}: ${re}`);
    }
    expect(winne).toEqual([]);
  });

  it('strażnik nie jest pusty — skan widzi moduły synchronizacji, service worker i strony; wzorzec bazy kolejki przepuszcza tylko vilda_sync_integration.js', () => {
    const pliki = plikiProdukcyjne();
    for (const p of ['vilda_sync.js', 'vilda_sync_integration.js', 'vilda_realtime.js', 'service-worker-kalorii.js', 'app.html']) {
      expect(pliki, p).toContain(p);
    }
    expect(pliki).not.toContain(SEJF);
    const re = WZORCE[0];
    for (const p of ["'vilda_sync_' + uid", '`vilda_sync_${uid}`', '"vilda_sync_"', 'vilda_sync_x']) expect(re.test(p), p).toBe(true);
    for (const p of ['<script src="vilda_sync_integration.js"></script>', 'vilda_sync.js', 'vilda-sync-data']) expect(re.test(p), p).toBe(false);
  });
});

describe('U2(c): wywołania zakazane i reguła domknięcia części magazynu', () => {
  // Część Bev_ (lista z E2-PR2a; ALGORITHMS, P-DZIENNIK-ZDARZEN): zapis magazynu i metadanych konta, emisje
  // i powiadomienia, sieć, magazyny przeglądarki, legacy buildery delt i eksport ładunku (is kasuje stare nagrobki),
  // skutki uboczne przy ładowaniu.
  // „.delete…(” to wywołania metod delete* (Map.delete, deleteDatabase, deleteSnapshot…), nie pole deletedAtISO.
  // Wzorce bez nawiasu wywołania: dostęp przez nawias (c.a['putUserMeta'](…)) i przez .call
  // (.removeNoteTombstoneForUser.call(…)) — sama nazwa metody zapisu/usuwania, poza polami deletedAtISO i deletedWithPatient.
  const ZAKAZANE = [
    /console\./, /fetch\(/, /sendBeacon/, /BroadcastChannel/, /postMessage/, /indexedDB/, /localStorage/, /sessionStorage/,
    /\.putUserMeta\(/, /Bmk_zmien\(/, /\.put[A-Za-z]*ForUser\(/, /\.remove[A-Za-z]*ForUser\(/, /\.delete[A-Za-z]*\s*\(/, /Bkz_zmienListe\(/,
    /VaultChangeSignal/, /syncPush/, /addEventListener/, /setTimeout/, /setInterval/, /navigator\./,
    /(?<![A-Za-z0-9_$])(?:Vn|ws|Qr|qr|vs|Yn|Qe2|jn|is|Bkz_eksport|Gc5|Gc3|us|ls|ds|cs|Qb0|Qb1|Bsw_deltaNagrobka|ps)\(/,
    /\.delete(?!dAtISO\b|dWithPatient\b)[A-Za-z]*/, /\.(?:put|remove)[A-Za-z]*ForUser\b/, /\.putUserMeta\b/,
    /\[\s*['"`](?:put|remove|write|update|delete(?!dAtISO\b|dWithPatient\b))/,
  ];
  // Część Bob_: lista tekstowa (także komentarze). Magazyn kolejki sięga do IndexedDB, localStorage i zegarów okna
  // wyłącznie przez pola v (reguła domknięcia niżej); tu zakazane są pozostałe kanały, emitery i zapisy sejfu.
  const ZAKAZANE_BOB = [
    /console\./, /fetch/, /sendBeacon/, /BroadcastChannel/, /postMessage/, /sessionStorage/, /addEventListener/, /setInterval/,
    /navigator/, /document/, /XMLHttpRequest/, /importScripts/,
    /(?<![\w$])(?:Vn|ws|Qr|qr|vs|Yn|Qe2|jn|is|Le|ps|G|V|kn|xa|us|ls|ds|cs|Qb0|Qb1|Gc5|Gc3)\s*\(/,
    /Bkz_/, /Bsl_/, /Bsw_/, /Bnp_/, /Bpk_/, /Bgw_/, /VaultChangeSignal/, /syncPush/, /\$s\b/, /Bmk_zmien/,
    /\.(?:put|remove|delete|update|write)[A-Za-z]*ForUser\b/, /\.putUserMeta\b/, /deleteUserDatabase/,
    /\[\s*['"`](?:put|remove|write|update|delete)/, /\.call\s*\(/, /\.apply\s*\(/, /\bReflect\./, /\bFunction\b/, /\beval\b/,
  ];
  const znajdz = (lista, tekst) => {
    const out = [];
    for (const re of lista) {
      const g = new RegExp(re.source, 'g');
      for (const m of tekst.matchAll(g)) out.push(`${re}: …${tekst.slice(Math.max(0, m.index - 30), m.index + 30)}…`);
    }
    return out;
  };

  it('część Bev_: żaden zakazany wzorzec (także w komentarzach)', () => {
    expect(typeof eksport).toBe('object');
    znacznikRaz();
    expect(znajdz(ZAKAZANE, czesci().bev)).toEqual([]);
  });
  it('samokontrola wzorców części Bev_: lista łapie przykładowe naruszenia', () => {
    const proby = ['console.log(1)', 'await I().putPatientForUser(b, x)', 'Vn({})', 'is()', 'x.deleteDatabase(n)', 'm.delete(k)', 'v.localStorage.setItem(k, v)', 'Bkz_eksport()',
      "await c.a['putUserMeta'](c.u, m)", 'await c.a.removeNoteTombstoneForUser.call(c.a, c.u, id)', 'const f = c.a.putUserMeta', 'a[`deleteSnapshotForUser`](u, s)'];
    for (const p of proby) expect(ZAKAZANE.some((re) => re.test(p)), p).toBe(true);
    for (const p of ['Bev_kluczeW(o, k)', 'Number.isInteger(x)', 'Object.keys(o)', 'await Le(t)', 'n.deletedAtISO', 'r.deletedWithPatient', 'Bev_wynik(status)',
      'await c.a.getPatientForUser(c.u, id)', "e['deletedAtISO']", 'deleteDatabase: Bob_usunBaze', 'outboxDiscard: Bob_porzuc']) expect(ZAKAZANE.some((re) => re.test(p)), p).toBe(false);
  });

  // Funkcja dostępu do Web Locks (jedyne miejsce z navigator w części Bob_) — lista tekstowa obejmuje resztę części.
  const bezBlokad = (bob) => {
    const i = bob.indexOf('function Bob_blokady(');
    return i < 0 ? bob : bob.slice(0, i) + bob.slice(i + wytnijFunkcje(bob.slice(i), 'Bob_blokady').length);
  };
  it('część Bob_: żaden zakazany wzorzec tekstowy (także w komentarzach) poza funkcją Bob_blokady (navigator tylko tam)', () => {
    znacznikRaz();
    const { bob } = czesci();
    expect(bob.trim().length, 'część Bob_ nie jest pusta').toBeGreaterThan(1000);
    expect(znajdz(ZAKAZANE_BOB, bezBlokad(bob))).toEqual([]);
    const i = bob.indexOf('function Bob_blokady(');
    if (i >= 0) {
      const f = wytnijFunkcje(bob.slice(i), 'Bob_blokady');
      expect(znajdz(ZAKAZANE_BOB, f).filter((x) => !x.startsWith('/navigator/')), 'Bob_blokady: zakazane wzorce poza navigator').toEqual([]);
    }
  });
  it('samokontrola wzorców części Bob_: lista łapie przykładowe naruszenia, przepuszcza zwykły kod magazynu', () => {
    const proby = ['console.log(1)', 'fetch(u)', 'navigator.locks.request(n, f)', 'document.cookie', 'Vn({})', 'V(k)', 'G (iv, d)', 'Le(t)', 'kn("x")',
      'is()', 'xa(u)', 'Bkz_czytaj()', 'Bnp_nagrobek(a, id)', '$s.removeUser(u)', 'a.putPatientForUser(u, p)', 'a.putUserMeta(u, m)', "a['put' + n](x)",
      'x.call(y)', 'f.apply(t, a)', 'Reflect.get(o, k)', 'new Function("x")', 'eval("1")', 'setInterval(f, 1)', 'sessionStorage.getItem(k)',
      'new BroadcastChannel(n)', 'self.postMessage(x)', 'navigator.sendBeacon(u, b)', 'new XMLHttpRequest()', 'a.deleteUserDatabase(u)', 'Bmk_zmien(u, f)'];
    for (const p of proby) expect(ZAKAZANE_BOB.some((re) => re.test(p)), p).toBe(true);
    for (const p of ['Bev_szyfruj(k)', 'Bob_tx(db, s, t, x, f)', 'store.put(w)', 'k.delete(e)', 'store.add(w)', 'Number.isSafeInteger(x)', 'r.onsuccess = f',
      'Bev_BUILDERY[kind](k, dev, o)', 'v.indexedDB', 'v.setTimeout(f, Bob_LIMIT_MS)', 'Object.freeze([])', "meta.get('licznik')", 'I().getRegistryEntry(uid)',
      'idb.deleteDatabase(n)', 'db.transaction(s, t)', 'this.x', 'Bses_zmieniona(s)', 'T()', 'be(w.storageMode)']) expect(ZAKAZANE_BOB.some((re) => re.test(p)), p).toBe(false);
  });

  // Reguła domknięcia (drzewo składni części Bob_ jako skryptu). W uprzęży goły identyfikator trafia w obiekt globalny Node,
  // nie w okno (load-browser-script.mjs: new Function('window', 'globalThis', source)), więc testy dynamiczne by go nie
  // widziały — dlatego lista wolnych identyfikatorów jest zamknięta.
  const WOLNE = new Set(['v', 'T', 'b', 'yt', 'ee', 'lt', 'gt', '$t', 'I', 'ne', 'be', 'Bses_opcje', 'Bses_zmieniona',
    'PatientCheckpointNativeAdapters', 'Object', 'Array', 'JSON', 'Number', 'String', 'Math', 'Promise', 'Uint8Array', 'Error', 'Set',
    'Map', 'Date', 'isFinite', 'undefined']);
  // Pola okna i funkcje, w których wolno ich użyć (napis albo wzorzec nazwy funkcji).
  const POLA_V = {
    VILDA_EVENT_LOG: ['Bob_bramka'], indexedDB: ['Bob_idb'], crypto: ['Bob_urzadzenie'],
    localStorage: ['Bob_urzadzenie', 'Bob_urzadzenieZapisz', 'Bob_urzadzenieUsun', /^Bob_znacznik[A-Za-z]*$/, 'Bob_poOdblokowaniu', 'Bob_kasujKonto'],
    setTimeout: ['Bob_limit', 'Bob_podBlokada'], clearTimeout: ['Bob_limit', 'Bob_podBlokada'], navigator: ['Bob_blokady'],
    AbortController: ['Bob_podBlokada'],
  };
  const wolnoPole = (pole, gdzie) => POLA_V[pole].some((x) => (x instanceof RegExp ? x.test(gdzie) : x === gdzie));
  const CHWILA = ['Bob_teraz', 'Bob_wiek'];
  function analizuj(zrodlo) {
    const ast = parse(zrodlo, { ecmaVersion: 'latest', sourceType: 'script', ranges: true });
    const sm = analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
    const rodzic = new Map();
    const idz = (n, p) => {
      if (!n || typeof n.type !== 'string') return;
      rodzic.set(n, p);
      for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach((y) => idz(y, n)); else if (x && typeof x.type === 'string') idz(x, n); }
    };
    idz(ast, null);
    const funkcje = ast.body.filter((s) => s.type === 'FunctionDeclaration');
    const wFunkcji = (n) => { const f = funkcje.find((x) => x.start <= n.start && n.end <= x.end); return f ? f.id.name : '(najwyższy poziom)'; };
    const naruszenia = [];
    const uzycia = { pola: [], wywolania: [], I: [] };
    for (const r of sm.globalScope.through) {
      const id = r.identifier;
      const nazwa = id.name;
      const gdzie = wFunkcji(id);
      if (!WOLNE.has(nazwa) && !nazwa.startsWith('Bev_')) { naruszenia.push(`wolny identyfikator ${nazwa} w ${gdzie}`); continue; }
      const p = rodzic.get(id);
      if (nazwa === 'v') {
        if (!p || p.type !== 'MemberExpression' || p.object !== id || p.computed || !Object.hasOwn(POLA_V, p.property.name)) {
          naruszenia.push(`v poza dostępem do nazwanego pola okna w ${gdzie}`);
          continue;
        }
        const pole = p.property.name;
        if (!wolnoPole(pole, gdzie)) naruszenia.push(`v.${pole} w ${gdzie}`);
        if (pole === 'crypto') {
          const pp = rodzic.get(p);
          if (!pp || pp.type !== 'MemberExpression' || pp.object !== p || pp.computed || pp.property.name !== 'getRandomValues') naruszenia.push(`v.crypto poza getRandomValues w ${gdzie}`);
        }
        uzycia.pola.push(`${pole}@${gdzie}`);
      }
      if (nazwa === 'Date' && !CHWILA.includes(gdzie)) naruszenia.push(`Date w ${gdzie}`);
      if (nazwa === 'I') uzycia.I.push(`${p && p.type === 'CallExpression' && p.callee === id ? 'I()' : 'I'}@${gdzie}`);
    }
    const sprawdzWezel = (n) => {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'MemberExpression' && n.computed && n.object.type === 'Identifier' && ['v', 'Date', 'Object', 'Reflect'].includes(n.object.name)) {
        naruszenia.push(`dostęp przez nawias do ${n.object.name} w ${wFunkcji(n)}`);
      }
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && ['deleteDatabase', 'databases', 'getRegistryEntry', 'request'].includes(n.callee.property.name)) {
        uzycia.wywolania.push(`${n.callee.property.name}@${wFunkcji(n)}`);
      }
      for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach(sprawdzWezel); else if (x && typeof x.type === 'string') sprawdzWezel(x); }
    };
    sprawdzWezel(ast);
    return { naruszenia, uzycia };
  }
  // Liczności w całej części: każde pole i wywołanie dokładnie tam, gdzie wolno, w podanej liczbie.
  function licznosci({ uzycia }) {
    const policz = (lista) => lista.reduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {});
    const bledy = [];
    const p = policz(uzycia.pola);
    const raz = { 'VILDA_EVENT_LOG@Bob_bramka': 1, 'indexedDB@Bob_idb': 1, 'crypto@Bob_urzadzenie': 1, 'setTimeout@Bob_limit': 1, 'clearTimeout@Bob_limit': 1 };
    for (const [k, n] of Object.entries(raz)) if (p[k] !== n) bledy.push(`${k}: ${p[k] || 0} zamiast ${n}`);
    // Co najmniej raz i tylko tam (E2-PR3a1): navigator w Bob_blokady, AbortController w Bob_podBlokada.
    const conajmniej = ['navigator@Bob_blokady', 'AbortController@Bob_podBlokada'];
    for (const k of conajmniej) if (!p[k]) bledy.push(`${k}: brak`);
    // Bez liczności (wolno w swoich funkcjach): localStorage w funkcjach identyfikatora urządzenia, znacznika, ponowienia
    // i kasowania konta; zegar limitu blokady w Bob_podBlokada.
    for (const k of Object.keys(p)) if (!raz[k] && !conajmniej.includes(k) && !/^localStorage@/.test(k) && !/^(setTimeout|clearTimeout)@Bob_podBlokada$/.test(k)) bledy.push(`pole okna ${k}`);
    const w = policz(uzycia.wywolania);
    const wolania = {
      'deleteDatabase@Bob_kasujBaze': 1, 'databases@Bob_istnieje': 1, 'databases@Bob_kasujKonto': 1, 'getRegistryEntry@Bob_konto': 1,
      'getRegistryEntry@Bob_poOdblokowaniu': 1, 'request@Bob_podBlokada': 1,
    };
    for (const [k, n] of Object.entries(wolania)) if (w[k] !== n) bledy.push(`${k}: ${w[k] || 0} zamiast ${n}`);
    for (const k of Object.keys(w)) if (!wolania[k]) bledy.push(`wywołanie ${k}`);
    const ii = [...uzycia.I].sort().join();
    if (ii !== 'I()@Bob_konto,I()@Bob_poOdblokowaniu') bledy.push(`I: ${ii || 'brak'} zamiast po jednym I() w Bob_konto i Bob_poOdblokowaniu`);
    return bledy;
  }

  it('część Bob_: reguła domknięcia — wolne identyfikatory z listy, pola okna w swoich funkcjach, Date w funkcjach chwili, bez nawiasu na v/Date/Object/Reflect, liczności (E2-PR3a1: Web Locks, kasowanie konta, ponowienie)', () => {
    znacznikRaz();
    const wynik = analizuj(czesci().bob);
    expect(wynik.naruszenia).toEqual([]);
    expect(licznosci(wynik)).toEqual([]);
  });
  it('samokontrola reguły domknięcia: przykładowe naruszenia czerwone, zwykły kod magazynu zielony', () => {
    const czerwone = [
      "function Bob_x() { return v['indexedDB']; }", 'function Bob_x() { return globalThis.indexedDB; }', 'function Bob_x(n) { return indexedDB.open(n); }',
      'function Bob_x() { const w = v; return w.indexedDB; }', 'function Bob_x() { const { localStorage: s } = v; return s; }',
      "function Bob_wiek() { return Date['now'](); }", 'function Bob_x(f) { return setTimeout(f, 1); }', 'function Bob_x() { return v.document; }',
      'function Bob_x(f) { return Bob_y(v); }', 'function Bob_y() {} function Bob_x() { return Date.now(); }', 'function Bob_idb() { return v.localStorage; }',
      'function Bob_x() { return localStorage.getItem("k"); }', 'function Bob_urzadzenie() { return v.crypto.subtle; }', "function Bob_x(o) { return Object['keys'](o); }",
      'function Bob_x() { return window.VILDA_EVENT_LOG; }', 'function Bob_x() { return self.crypto; }',
    ];
    for (const p of czerwone) expect(analizuj(p).naruszenia.length, p).toBeGreaterThan(0);
    const zielone = [
      "const Bob_ALFABET = 'ab'; function Bob_z(bajt) { return Bob_ALFABET[bajt & 31]; }", 'function Bob_idb() { return v.indexedDB; }',
      'function Bob_wiek(i) { return Date.now() - Date.parse(i); }', 'function Bob_teraz() { return new Date().toISOString(); }',
      'function Bob_bramka() { try { return v.VILDA_EVENT_LOG === true; } catch (x) { return false; } }',
      'function Bob_urzadzenie(u) { const b8 = v.crypto.getRandomValues(new Uint8Array(8)); return v.localStorage.getItem(u) || b8; }',
      'function Bob_x(o) { return Object.keys(o).map((k) => Bev_utf8(k)); }', 'async function Bob_konto(u) { return I().getRegistryEntry(u); }',
    ];
    for (const p of zielone) expect(analizuj(p).naruszenia, p).toEqual([]);
    // E2-PR3a1: navigator, AbortController i localStorage tylko w swoich funkcjach.
    for (const p of ['function Bob_x() { return v.navigator; }', 'function Bob_podBlokada() { return v.navigator.locks; }', 'function Bob_x() { return new v.AbortController(); }',
      'function Bob_dopisz(u) { v.localStorage.setItem(u, "1"); }', 'function Bob_blokady() { return v.localStorage; }']) expect(analizuj(p).naruszenia.length, p).toBeGreaterThan(0);
    for (const p of ['function Bob_blokady() { try { return v.navigator.locks; } catch (x) { return null; } }', 'function Bob_podBlokada(f) { const c = new v.AbortController(); v.setTimeout(f, 1); return c; }',
      'function Bob_znacznikZapisz(u) { v.localStorage.setItem(u, "1"); }', 'function Bob_poOdblokowaniu() { return v.localStorage.length; }']) expect(analizuj(p).naruszenia, p).toEqual([]);
    expect(licznosci(analizuj('function Bob_x(l) { return l.request("n", f); }')).join()).toContain('wywołanie request@Bob_x');
    // liczności: drugie I() i wywołanie kasowania poza Bob_usunBaze
    expect(licznosci(analizuj('function Bob_konto(u) { I(); return I().getRegistryEntry(u); }')).join()).toContain('I:');
    expect(licznosci(analizuj('function Bob_inna(i, n) { return i.deleteDatabase(n); }')).join()).toContain('deleteDatabase@Bob_inna');
  });

  // ── E2-PR2b2: funkcje kwarantanny i podsumowania wyniku ──
  // Nazwa wewnętrzna klucza eksportu z literału Bev_EKSPORT.
  function wewnetrzna(klucz) {
    const m = literalEksportu().tekst.match(new RegExp(`\\b${klucz}\\s*:\\s*(B(?:ev|ob)_[A-Za-z0-9_$]*)`));
    if (!m) throw new Error(`brak klucza ${klucz} w literale Bev_EKSPORT`);
    return m[1];
  }
  // Domknięcie wywołań od funkcji start: przez odwołania do funkcji i stałych najwyższego poziomu kodu (obie części
  // bloku); wynik — osiągnięte nazwy i wolne identyfikatory (spoza kodu) użyte w domknięciu, z miejscem użycia.
  function domkniecie(zrodlo, start) {
    const ast = parse(zrodlo, { ecmaVersion: 'latest', sourceType: 'script', ranges: true });
    const sm = analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
    const gora = new Map();
    for (const s of ast.body) {
      if (s.type === 'FunctionDeclaration') gora.set(s.id.name, s);
      else if (s.type === 'VariableDeclaration') for (const d of s.declarations) if (d.id.type === 'Identifier') gora.set(d.id.name, d);
    }
    const referencje = sm.scopes.flatMap((sc) => sc.references);
    const osiagniete = new Set();
    const wolne = [];
    const kolejka = [start];
    while (kolejka.length) {
      const nazwa = kolejka.shift();
      if (osiagniete.has(nazwa)) continue;
      const wezel = gora.get(nazwa);
      if (!wezel) throw new Error(`brak deklaracji ${nazwa}`);
      osiagniete.add(nazwa);
      for (const r of referencje) {
        const [p, k] = r.identifier.range;
        if (p < wezel.range[0] || k > wezel.range[1]) continue;
        if (!r.resolved) wolne.push([r.identifier.name, nazwa]);
        else if (r.resolved.scope.type === 'global' && gora.has(r.identifier.name)) kolejka.push(r.identifier.name);
      }
    }
    return { osiagniete, wolne };
  }
  // Wolne identyfikatory dozwolone w czystej funkcji (bez okna, stanu logowania, sejfu, rejestru, zegara i losowości).
  const CZYSTE = new Set(['Object', 'Array', 'Number', 'String', 'Boolean', 'JSON', 'Math', 'RegExp', 'Set', 'Map', 'isFinite', 'undefined', 'NaN', 'Infinity']);
  const nieczyste = (zrodlo, start) => domkniecie(zrodlo, start).wolne.filter(([n]) => !CZYSTE.has(n)).map(([n, f]) => `${n} w ${f}`);

  it('U2(c) (E2-PR2b2): funkcje eksportu kwarantanny i podsumowania wyniku to deklaracje najwyższego poziomu części Bob_ (obejmuje je lista tekstowa i reguła domknięcia); operacje kwarantanny async, podsumowanie wyniku nie', () => {
    znacznikRaz();
    const ast = parse(czesci().bob, { ecmaVersion: 'latest', sourceType: 'script' });
    const dekl = new Map(ast.body.filter((s) => s.type === 'FunctionDeclaration').map((s) => [s.id.name, s]));
    for (const k of KLUCZE_KWARANTANNY) {
      const n = wewnetrzna(k);
      expect(n.startsWith('Bob_'), `${k} → ${n}`).toBe(true);
      expect(dekl.has(n), `${k}: deklaracja ${n} w części Bob_`).toBe(true);
      expect(dekl.get(n).async, `${k}: async`).toBe(k !== 'resultSummary');
      expect(dekl.get(n).generator, `${k}: bez generatora`).toBe(false);
    }
  });

  it('U2(c) (E2-PR2b2): resultSummary jest czysta — w domknięciu wywołań (funkcje i stałe bloku osiągalne z niej) wolne identyfikatory tylko z listy czystych (bez v, b, T, I, ne, Bses_, Date, Promise)', () => {
    znacznikRaz();
    const n = wewnetrzna('resultSummary');
    const { osiagniete } = domkniecie(blok().tekst, n);
    expect(osiagniete.has(n)).toBe(true);
    expect(nieczyste(blok().tekst, n)).toEqual([]);
    expect([...osiagniete].filter((x) => ['Bob_wejscie', 'Bob_bramka', 'Bob_teraz', 'Bob_wiek', 'Bob_konto', 'Bob_otworz', 'Bob_idb'].includes(x)), 'funkcje wejścia, chwili i bazy').toEqual([]);
  });

  it('samokontrola domknięcia czystości: odwołanie (także przez funkcję pomocniczą albo stałą) do v, Date, I(), b, T, Bses_ albo Promise jest czerwone; czyste funkcje i stałe bloku zielone', () => {
    const czerwone = [
      'function Bob_s(w) { return Bob_p(w); } function Bob_p(w) { return v.x; }',
      'function Bob_s(w) { return { t: Bob_teraz() }; } function Bob_teraz() { return new Date().toISOString(); }',
      'function Bob_s(w) { return I().getRegistryEntry(b); }',
      'const Bob_X = Object.freeze([Bob_f]); function Bob_s(w) { return Bob_X[0](w); } function Bob_f() { return Bses_opcje(null); }',
      'function Bob_s(w) { return Promise.resolve(w); }',
      'function Bob_s(w) { return Bev_obiekt(w) && T(); } function Bev_obiekt(x) { return !!x; }',
      'function Bob_s(w) { return Bev_p(w); } function Bev_p(w) { return Bob_q(w); } function Bob_q() { return Date.now(); }',
    ];
    for (const kod of czerwone) expect(nieczyste(kod, 'Bob_s').length, kod).toBeGreaterThan(0);
    const zielone = [
      "const Bob_KOD = /^[A-Z]+$/; const Bob_P = Object.freeze(['a']); function Bob_s(w) { return Bev_obiekt(w) && Bob_KOD.test(w.code) && Bob_P.indexOf(w.reason) >= 0 ? { status: String(w.status) } : { status: 'nieznany' }; } function Bev_obiekt(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }",
      'function Bob_s(w) { const l = {}; Object.keys(w).forEach(function (k) { if (/Count$/.test(k) && Number.isSafeInteger(w[k])) l[k] = w[k]; }); return JSON.parse(JSON.stringify(l)); }',
      'function Bob_s(w) { return Bob_t(w); } function Bob_t(w) { return w; } function Bob_inna() { return v.indexedDB; }',
    ];
    for (const kod of zielone) expect(nieczyste(kod, 'Bob_s'), kod).toEqual([]);
  });
});

describe('U2(d): najwyższy poziom bloku — tylko deklaracje bez skutków przy ładowaniu', () => {
  const freeze = (n) => n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed &&
    n.callee.object.type === 'Identifier' && n.callee.object.name === 'Object' && n.callee.property.name === 'freeze';
  // Argumenty Object.freeze: literały, tablice, obiekty (własności init bez kluczy obliczanych i bez rozwinięć),
  // identyfikatory, wyrażenia funkcyjne (ciało nie biegnie przy ładowaniu) i zagnieżdżone Object.freeze.
  function typyFreeze(n, nazwa, bledy) {
    if (!n) { bledy.push(`${nazwa}: dziura w tablicy`); return; }
    if (n.type === 'Literal' || n.type === 'Identifier' || n.type === 'FunctionExpression') return;
    if (n.type === 'ArrayExpression') { n.elements.forEach((x) => typyFreeze(x, nazwa, bledy)); return; }
    if (n.type === 'ObjectExpression') {
      for (const p of n.properties) {
        if (p.type !== 'Property' || p.kind !== 'init' || p.computed) { bledy.push(`${nazwa}: ${p.type}${p.computed ? ' (klucz obliczany)' : ''}`); continue; }
        typyFreeze(p.value, nazwa, bledy);
      }
      return;
    }
    if (freeze(n)) { n.arguments.forEach((x) => typyFreeze(x, nazwa, bledy)); return; }
    bledy.push(`${nazwa}: ${n.type} w argumencie Object.freeze`);
  }
  function najwyzszyPoziom(body, prefiks, bledy) {
    for (const s of body) {
      if (s.type === 'FunctionDeclaration') {
        if (!s.id.name.startsWith(prefiks)) bledy.push(`funkcja bez prefiksu ${prefiks}: ${s.id.name}`);
        continue;
      }
      if (s.type !== 'VariableDeclaration' || s.kind !== 'const') { bledy.push(`instrukcja ${s.type}${s.kind ? ' ' + s.kind : ''}`); continue; }
      for (const d of s.declarations) {
        const nazwa = d.id.type === 'Identifier' ? d.id.name : '?';
        if (!nazwa.startsWith(prefiks)) bledy.push(`stała bez prefiksu ${prefiks}: ${nazwa}`);
        const i = d.init;
        if (!i) { bledy.push(`${nazwa}: bez wartości`); continue; }
        if (i.type === 'Literal') continue;
        if (i.type === 'NewExpression' && i.callee.type === 'Identifier' && ['Map', 'Set'].includes(i.callee.name) && !i.arguments.length) continue;
        if (freeze(i)) { i.arguments.forEach((x) => typyFreeze(x, nazwa, bledy)); continue; }
        bledy.push(`${nazwa}: ${i.type}`);
      }
    }
  }
  it('część Bev_ (^Bev_) i część Bob_ (^Bob_): function / async function albo const z literałem, Object.freeze(…) z dozwolonymi typami, new Map() / new Set()', () => {
    expect(typeof eksport).toBe('object');
    znacznikRaz();
    const { a, tekst } = blok();
    const { i } = czesci();
    const ast = parse(tekst, { ecmaVersion: 'latest', sourceType: 'script' });
    const granica = i - a;
    const bev = ast.body.filter((s) => s.end <= granica);
    const bob = ast.body.filter((s) => s.start >= granica + ZNACZNIK_MAGAZYNU.length);
    expect(bev.length + bob.length, 'żadna instrukcja nie przecina znacznika magazynu').toBe(ast.body.length);
    const bledy = [];
    najwyzszyPoziom(bev, 'Bev_', bledy);
    najwyzszyPoziom(bob, 'Bob_', bledy);
    expect(bledy).toEqual([]);
    expect(bev.length).toBeGreaterThan(20);
    expect(bob.length).toBeGreaterThan(20);
  });
  it('samokontrola typów argumentów Object.freeze: odczyt pola okna, rozwinięcie i klucz obliczany czerwone; literały, tablice, obiekty, identyfikatory i funkcje zielone', () => {
    const sprawdz = (kod) => { const b = []; najwyzszyPoziom(parse(kod, { ecmaVersion: 'latest', sourceType: 'script' }).body, 'Bob_', b); return b; };
    for (const kod of ['const Bob_X = Object.freeze({ s: v.localStorage });', 'const Bob_X = Object.freeze([v.VILDA_EVENT_LOG]);',
      'const Bob_X = Object.freeze({ ...v.localStorage });', 'const Bob_X = Object.freeze({ [k]: 1 });', 'const Bob_X = Object.freeze(Bob_f());',
      'const Bob_X = Object.freeze(`x${v.crypto}`);', 'const Bob_X = Object.freeze({ a: -1 });', 'const Bob_X = Object.freeze({ get a() { return 1; } });',
      'const Bob_X = v.indexedDB;', 'Bob_f();', 'let Bob_X = 1;', 'function Bev_f() {}']) expect(sprawdz(kod).length, kod).toBeGreaterThan(0);
    for (const kod of ["const Bob_X = Object.freeze({ a: 1, b: [1, 'x', null], c: Bob_f, d: function () { return v.x; }, e: Object.freeze({}) });",
      "const Bob_KOD = /^[A-Za-z0-9_.:-]{1,64}$/;", 'const Bob_usuwane = new Set();', 'function Bob_f() {}', 'async function Bob_g() {}']) expect(sprawdz(kod), kod).toEqual([]);
  });
});

describe('U2(e): eksport _eventLog zamrożony, klucze dokładnie z listy', () => {
  it('Object.isFrozen, klucze = lista E2-PR2a, 11 kluczy magazynu kolejki i 6 kluczy kwarantanny i podsumowania wyniku (35), kinds zamrożone (14 rodzajów), funkcje', () => {
    expect(typeof eksport).toBe('object');
    expect(Object.isFrozen(eksport)).toBe(true);
    expect(KLUCZE_EKSPORTU).toHaveLength(35);
    expect(Object.keys(eksport).sort()).toEqual([...KLUCZE_EKSPORTU].sort());
    expect(Object.isFrozen(eksport.kinds)).toBe(true);
    expect(eksport.kinds).toEqual(RODZAJE);
    for (const k of KLUCZE_EKSPORTU.filter((x) => x !== 'kinds')) expect(typeof eksport[k], k).toBe('function');
    const { win } = okno();
    expect(Object.getOwnPropertyDescriptor(win.VildaVault, '_eventLog').enumerable, 'jeden klucz eksportu sejfu').toBe(true);
    expect(win.VildaVault._eventLog).not.toBe(eksport); // osobne okno — osobny obiekt
    expect(win.VildaVault.applyEncryptedDelta, 'applyEncryptedDelta bez zmian').toBeTypeOf('function');
  });
});

describe('U4: zwykłe użycie sejfu przy zamkniętej bramce nie tworzy bazy kolejki ani klucza urządzenia', () => {
  const okna = [];
  beforeEach(() => { przechwycZadaniaWTle(); });
  afterEach(() => {
    for (const o of okna.splice(0)) { o.krypto.rozbroj(); o.timery.wyczysc(); }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('U4: adapter IndexedDB nad atrapą — karta, wersja, notatki, lista, blokada, odblokowanie i każda istniejąca operacja magazynu → databases() bez vilda_sync_*, brak klucza vilda-sync-device-v1', async () => {
    const o = await oknoMagazynu({ konta: 'A', bramka: false });
    okna.push(o);
    const v = o.v;
    const r = await v.savePatient(naglowek(1), { dedup: false });
    await v.savePatient(naglowek(1, { masa: 23 }), { dedup: false, patientId: r.patientId });
    await v.savePatientNote({ patientId: r.patientId, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' });
    await v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' });
    await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [r.patientId] });
    o.zablokuj();
    await o.zaloguj('A');
    const EID = '00000000-0000-4000-8000-000000000001';
    const arg = {
      enqueue: ['snap', { patientId: r.patientId, snapshotId: r.snapshotId }], outboxCount: [], outboxList: [], outboxTake: [], outboxAccept: [[EID]],
      outboxReject: [[{ eid: EID, code: 'EVENT_REJECTED' }]], outboxFail: [[EID], { code: 'NETWORK' }], outboxRequeueStale: [],
      outboxDiscard: [[EID], { potwierdzone: true }], gateOpen: [],
      quarantinePut: [ZMIANA, NIECZYTELNY, { slotId: SLOT, appVersion: '1.1.459' }], quarantineList: [], quarantineCount: [],
      quarantineMinSeq: [{ slotId: SLOT }], quarantineRelease: [[1], { slotId: SLOT }], resultSummary: [NIECZYTELNY],
    };
    for (const k of Object.keys(arg)) if (typeof o.ev[k] === 'function') await o.ev[k](...arg[k]);
    await o.cisza();
    const bazy = (await o.idb.databases()).map((x) => x.name);
    expect(bazy.filter((n) => n.startsWith('vilda_sync_'))).toEqual([]);
    expect(bazy.length, 'skan widzi bazy sejfu').toBeGreaterThan(0);
    expect(o.win.localStorage.klucze().filter((k) => k.startsWith(PRZEDROSTEK_URZADZENIA))).toEqual([]);
    expect(o.dziennik.filter((x) => String(x.klucz).startsWith(PRZEDROSTEK_URZADZENIA))).toEqual([]);
  });

  it.each([['z navigator.locks', true], ['bez navigator.locks', false]])('U4′ (%s): zwykłe użycie i usunięcie konta przy zamkniętej bramce (moduły punktu odzyskiwania) — 0 baz vilda_sync_*, 0 kluczy i 0 zapisów vilda-sync-* w localStorage, 0 odczytów pola bramki', async (_, zLocks) => {
    const o = await oknoMagazynu({ konta: 'AB', bramka: false, skrypty: SKRYPTY_PUNKTU, ...(zLocks ? {} : { locks: false }) });
    okna.push(o);
    expect(!!o.win.navigator.locks, 'navigator.locks okna').toBe(zLocks);
    let odczyty = 0;
    Object.defineProperty(o.win, 'VILDA_EVENT_LOG', { get() { odczyty += 1; return undefined; }, configurable: true });
    const v = o.v;
    const r = await v.savePatient(naglowek(1), { dedup: false });
    await v.savePatient(naglowek(1, { masa: 23 }), { dedup: false, patientId: r.patientId });
    await v.savePatientNote({ patientId: r.patientId, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' });
    await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [r.patientId] });
    await o.zaloguj('B');
    await o.zaloguj('A');
    expect(await v.removeUser(o.B.userId, o.B.haslo), 'usunięcie konta niebieżącego').toBe(true);
    expect(await v.removeUser(o.A.userId, o.A.haslo), 'usunięcie konta bieżącego').toBe(true);
    await o.cisza();
    const bazy = (await o.idb.databases()).map((x) => x.name);
    expect(bazy.filter((n) => n.startsWith('vilda_sync_'))).toEqual([]);
    expect(bazy, 'skan widzi rejestr kont').toContain('vilda_registry');
    expect(o.win.localStorage.klucze().filter((k) => k.startsWith('vilda-sync-'))).toEqual([]);
    expect(o.dziennik.filter((x) => x.magazyn === 'localStorage' && String(x.klucz).startsWith('vilda-sync-'))).toEqual([]);
    expect(o.idb.__atrapa.log.filter((w) => typeof w[1] === 'string' && w[1].startsWith('vilda_sync_') && w[0] !== 'deleteDatabase')).toEqual([]);
    expect(odczyty, 'odczyty pola VILDA_EVENT_LOG').toBe(0);
  });
});
