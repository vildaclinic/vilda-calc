// P-DZIENNIK-ZDARZEN (E2-PR2a, E2-PR2b) — strażniki uśpienia bloku dziennika zdarzeń w vilda_vault.js: kod produkcyjny nie
// woła nowych funkcji (eksport tylko pod VildaVault._eventLog, nikt go nie używa), blok nie ma skutków ubocznych przy
// ładowaniu, część Bev_ (koperty, buildery, szyfrowanie, zastosowanie) nie zawiera wywołań zapisu, emisji, sieci ani
// magazynów przeglądarki, a część magazynu kolejki (Bob_, poniżej znacznika magazynu) sięga do okna wyłącznie przez
// nazwane pola w nazwanych funkcjach i działa tylko za bramką (pole okna VILDA_EVENT_LOG === true). Testy źródła
// (vilda_vault.js, pliki produktu z git ls-files) i eksportu (prawdziwy sejf w oknie uprzęży, dane wyłącznie fikcyjne).
//
//   U1    bramka: gateOpen() fałszywe dla każdej wartości pola poza true (także getter rzucający); każda chroniona
//         operacja magazynu (pętla po kluczach eksportu minus jawna lista niechronionych — nowy klucz bez bramki =
//         czerwony test) → { ok: false, powod: 'bramka' } bez odczytu window.indexedDB, localStorage i crypto (gettery
//         liczące) i bez wywołań magazynu sejfu; na adapterze IndexedDB nad atrapą — bez wpisów vilda_sync_* w jej
//         dzienniku i bez klucza urządzenia; zablokowany sejf przy zamkniętej bramce → bramka.
//   U2(a) identyfikatory Bev_ i Bob_ leżą między znacznikami bloku (każdy znacznik dokładnie raz), poza blokiem dokładnie
//         jedno `_eventLog:Bev_EKSPORT`; `_eventLog` dokładnie raz w pliku; zero `._eventLog` i `VildaVault._eventLog`;
//         blok stoi między Bsl_usunPacjenta a `function yr(`. Znacznik magazynu kolejki dokładnie raz, za literałem
//         Bev_EKSPORT; w części Bev_ identyfikatory Bob_ wyłącznie w tym literale (11 kluczy magazynu).
//   U2(b) żaden plik produktu poza vilda_vault.js (git ls-files *.js *.mjs *.cjs *.html *.htm bez tests/ i docs/) nie
//         zawiera `_eventLog`, applyEncryptedEvent, encryptEvent, nazw 14 builderów, nazw API magazynu (gateOpen,
//         outbox…), VILDA_EVENT_LOG, klucza urządzenia, nazwy bazy kolejki (vilda_sync_ poza vilda_sync_integration.js),
//         Bev_ ani Bob_ (bez nazw ogólnych: enqueue, eventBytes, kinds, deleteDatabase — istnieją w innych plikach).
//   U2(c) część Bev_: lista zakazana (zapis, emisja, sieć, magazyny przeglądarki, legacy buildery delt, eksport
//         ładunku, console.), także w komentarzach; część Bob_: własna lista tekstowa i reguła domknięcia na drzewie
//         składni (acorn + eslint-scope): wolne identyfikatory wyłącznie z listy, pola okna tylko w swoich funkcjach,
//         Date tylko w funkcjach chwili, zakaz dostępu przez nawias do v, Date, Object, Reflect, liczności wywołań
//         kasowania, listy baz i rejestru.
//   U2(d) najwyższy poziom bloku (AST): w części Bev_ nazwy ^Bev_, w części Bob_ ^Bob_; wyłącznie deklaracje function /
//         async function oraz const z literałem, Object.freeze(…) albo new Map() / new Set(); argumenty Object.freeze
//         tylko z literałów, tablic, obiektów (bez kluczy obliczanych i rozwinięć), identyfikatorów, wyrażeń funkcyjnych
//         i zagnieżdżonego Object.freeze — bez odczytów przy ładowaniu.
//   U2(e) eksport _eventLog zamrożony; klucze = dokładnie lista (18 z E2-PR2a i 11 kluczy magazynu kolejki).
//   U4    krótki scenariusz sejfu na adapterze IndexedDB nad atrapą przy zamkniętej bramce: databases() bez vilda_sync_*,
//         brak klucza o przedrostku vilda-sync-device-v1.
// Każdy przypadek, który tnie blok na części, zaczyna od sprawdzenia, że znacznik magazynu jest dokładnie raz.
// Czerwone na bazie bez magazynu kolejki: U1, nowe części U2(a), U2(c) i U2(d), U2(e); zielone z natury: U2(b),
// samokontrole wzorców i reguł, dotychczasowe przypadki U2(a) bez cięcia na części, U4.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'acorn';
import { analyze } from 'eslint-scope';
import { magazynZRejestrem, naglowek, okno } from './sesja-zapisu-uprzaz.mjs';
import { PRZEDROSTEK_URZADZENIA, ZNACZNIK_MAGAZYNU, oknoMagazynu, przechwycZadaniaWTle } from '../support/okno-magazynu.mjs';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SEJF = 'vilda_vault.js';
const ZRODLO = fs.readFileSync(path.join(KORZEN, SEJF), 'utf8');
const POCZATEK = '/* P-DZIENNIK-ZDARZEN: poczatek bloku */';
const KONIEC = '/* P-DZIENNIK-ZDARZEN: koniec bloku */';
const BUILDERY = ['buildSnapshotEvent', 'buildPatientFullEvents', 'buildPatientTombstoneEvent', 'buildSnapshotTombstoneEvent',
  'buildPatientNoteEvent', 'buildPatientNoteTombstoneEvent', 'buildNoteEvent', 'buildNoteTombstoneEvent', 'buildPatientListEvent',
  'buildPatientListTombstoneEvent', 'buildPreferenceEvent', 'buildPasskeyEvent', 'buildPasskeyTombstoneEvent', 'buildCredentialEvent'];
// Klucze magazynu kolejki (E2-PR2b1); kwarantanna i podsumowanie wyniku dochodzą w E2-PR2b2.
const KLUCZE_MAGAZYNU = ['gateOpen', 'enqueue', 'outboxCount', 'outboxList', 'outboxTake', 'outboxAccept', 'outboxReject',
  'outboxFail', 'outboxRequeueStale', 'outboxDiscard', 'deleteDatabase'];
const KLUCZE_EKSPORTU = ['kinds', ...BUILDERY, 'encryptEvent', 'eventBytes', 'applyEncryptedEvent', ...KLUCZE_MAGAZYNU];
const RODZAJE = ['snap', 'pfull', 'ptomb', 'stomb', 'pnote', 'pnotetomb', 'note', 'notetomb', 'plist', 'plisttomb', 'pref', 'pk', 'pktomb', 'cred'];
const ile = (tekst, fragment) => tekst.split(fragment).length - 1;
const ID_BEV_BOB = /(?<![A-Za-z0-9_$])B(?:ev|ob)_[A-Za-z0-9_$]*/g;
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
  // Klucze bez bramki: z E2-PR2a (nie dotykają magazynu kolejki) oraz gateOpen i deleteDatabase (sprzątanie po koncie).
  const NIECHRONIONE = ['kinds', ...BUILDERY, 'encryptEvent', 'eventBytes', 'applyEncryptedEvent', 'gateOpen', 'deleteDatabase'];
  const EID = '00000000-0000-4000-8000-000000000001';
  const ARGUMENTY = (k) => ({
    enqueue: ['snap', k], outboxCount: [], outboxList: [], outboxTake: [], outboxAccept: [[EID]],
    outboxReject: [[{ eid: EID, code: 'EVENT_REJECTED' }]], outboxFail: [[EID], { code: 'NETWORK' }], outboxRequeueStale: [],
    outboxDiscard: [[EID], { potwierdzone: true }],
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
  function chronione(ev) {
    const lista = Object.keys(ev).filter((k) => !NIECHRONIONE.includes(k));
    expect(lista.sort(), 'chronione klucze eksportu').toEqual(KLUCZE_MAGAZYNU.filter((k) => !NIECHRONIONE.includes(k)).sort());
    return lista;
  }
  async function kazdaNaBramce(win, ev, k) {
    const arg = ARGUMENTY(k);
    for (const nazwa of chronione(ev)) {
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
});

describe('U2(a): identyfikatory Bev_ i Bob_ tylko w bloku; _eventLog dokładnie raz', () => {
  it('eksport dziennika zdarzeń istnieje (VildaVault._eventLog)', () => {
    expect(typeof eksport).toBe('object');
  });

  it('znaczniki bloku dokładnie raz; poza blokiem jedyne Bev_/Bob_ to _eventLog:Bev_EKSPORT', () => {
    expect(ile(ZRODLO, POCZATEK), 'znacznik początku').toBe(1);
    expect(ile(ZRODLO, KONIEC), 'znacznik końca').toBe(1);
    const { a, z } = blok();
    const poza = ZRODLO.slice(0, a) + ZRODLO.slice(z);
    const ids = [...poza.matchAll(ID_BEV_BOB)].map((m) => poza.slice(m.index - 10, m.index + m[0].length));
    expect(ids, 'Bev_/Bob_ poza blokiem').toEqual(['_eventLog:Bev_EKSPORT']);
    expect(ile(poza, '_eventLog:Bev_EKSPORT')).toBe(1);
    expect(ile(ZRODLO, 'STORAGE_MODE_CLOUD_ONLY:Se,_eventLog:Bev_EKSPORT};v.VildaVault=$s'), 'klucz na końcu eksportu').toBe(1);
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

  it('U2(a) (E2-PR2b): znacznik magazynu kolejki dokładnie raz, za literałem Bev_EKSPORT, przed znacznikiem końca; Bob_ w części Bev_ wyłącznie w tym literale (11 kluczy)', () => {
    znacznikRaz();
    expect(ZNACZNIK_MAGAZYNU.includes('Bob_'), 'tekst znacznika bez Bob_').toBe(false);
    const { a, z, i, bev } = czesci();
    const lit = literalEksportu();
    expect(lit.start).toBeGreaterThan(a);
    expect(lit.koniec, 'znacznik magazynu za literałem Bev_EKSPORT').toBeLessThan(i);
    expect(i).toBeLessThan(z);
    expect(ZRODLO.slice(lit.koniec, i).trim(), 'między literałem eksportu a znacznikiem magazynu tylko średnik').toBe(';');
    const wBev = [...bev.matchAll(ID_BOB)].map((m) => a + m.index);
    expect(wBev.filter((p) => p < lit.start || p >= lit.koniec), 'Bob_ w części Bev_ poza literałem eksportu').toEqual([]);
    expect(wBev, 'Bob_ w literale eksportu: 11 kluczy magazynu').toHaveLength(11);
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

  it('część Bob_: żaden zakazany wzorzec tekstowy (także w komentarzach)', () => {
    znacznikRaz();
    const { bob } = czesci();
    expect(bob.trim().length, 'część Bob_ nie jest pusta').toBeGreaterThan(1000);
    expect(znajdz(ZAKAZANE_BOB, bob)).toEqual([]);
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
  const POLA_V = { VILDA_EVENT_LOG: ['Bob_bramka'], indexedDB: ['Bob_idb'], localStorage: ['Bob_urzadzenie', 'Bob_urzadzenieZapisz'],
    crypto: ['Bob_urzadzenie'], setTimeout: ['Bob_limit'], clearTimeout: ['Bob_limit'] };
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
        if (!POLA_V[pole].includes(gdzie)) naruszenia.push(`v.${pole} w ${gdzie}`);
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
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && ['deleteDatabase', 'databases', 'getRegistryEntry'].includes(n.callee.property.name)) {
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
    for (const k of Object.keys(p)) if (!raz[k] && !/^localStorage@Bob_urzadzenie(Zapisz)?$/.test(k)) bledy.push(`pole okna ${k}`);
    const w = policz(uzycia.wywolania);
    const wolania = { 'deleteDatabase@Bob_usunBaze': 1, 'databases@Bob_istnieje': 1, 'getRegistryEntry@Bob_konto': 1 };
    for (const [k, n] of Object.entries(wolania)) if (w[k] !== n) bledy.push(`${k}: ${w[k] || 0} zamiast ${n}`);
    for (const k of Object.keys(w)) if (!wolania[k]) bledy.push(`wywołanie ${k}`);
    if (uzycia.I.join() !== 'I()@Bob_konto') bledy.push(`I: ${uzycia.I.join(', ') || 'brak'} zamiast jednego I() w Bob_konto`);
    return bledy;
  }

  it('część Bob_: reguła domknięcia — wolne identyfikatory z listy, pola okna w swoich funkcjach, Date w funkcjach chwili, bez nawiasu na v/Date/Object/Reflect, liczności', () => {
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
    // liczności: drugie I() i wywołanie kasowania poza Bob_usunBaze
    expect(licznosci(analizuj('function Bob_konto(u) { I(); return I().getRegistryEntry(u); }')).join()).toContain('I:');
    expect(licznosci(analizuj('function Bob_inna(i, n) { return i.deleteDatabase(n); }')).join()).toContain('deleteDatabase@Bob_inna');
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
  it('Object.isFrozen, klucze = lista E2-PR2a i 11 kluczy magazynu kolejki (29), kinds zamrożone (14 rodzajów), funkcje', () => {
    expect(typeof eksport).toBe('object');
    expect(Object.isFrozen(eksport)).toBe(true);
    expect(KLUCZE_EKSPORTU).toHaveLength(29);
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
    };
    for (const k of Object.keys(arg)) if (typeof o.ev[k] === 'function') await o.ev[k](...arg[k]);
    await o.cisza();
    const bazy = (await o.idb.databases()).map((x) => x.name);
    expect(bazy.filter((n) => n.startsWith('vilda_sync_'))).toEqual([]);
    expect(bazy.length, 'skan widzi bazy sejfu').toBeGreaterThan(0);
    expect(o.win.localStorage.klucze().filter((k) => k.startsWith(PRZEDROSTEK_URZADZENIA))).toEqual([]);
    expect(o.dziennik.filter((x) => String(x.klucz).startsWith(PRZEDROSTEK_URZADZENIA))).toEqual([]);
  });
});
