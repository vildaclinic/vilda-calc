// P-DZIENNIK-ZDARZEN (E2-PR2a) — strażniki uśpienia bloku Bev_ w vilda_vault.js: kod produkcyjny nie woła nowych funkcji
// (eksport tylko pod VildaVault._eventLog, nikt go nie używa), blok nie ma skutków ubocznych przy ładowaniu i nie zawiera
// wywołań zapisu, emisji, sieci ani magazynów przeglądarki. Testy źródła (vilda_vault.js, pliki produktu z git ls-files)
// i eksportu (prawdziwy sejf w oknie uprzęży, bez danych).
//
//   U2(a) wszystkie identyfikatory Bev_ leżą między znacznikami bloku (każdy dokładnie raz), poza blokiem dokładnie jedno
//         `_eventLog:Bev_EKSPORT`; `_eventLog` dokładnie raz w pliku; zero `._eventLog` i `VildaVault._eventLog`; blok stoi
//         między Bsl_usunPacjenta a `function yr(` (koniec czytelnego bloku B???_).
//   U2(b) (K12) żaden plik produktu poza vilda_vault.js (git ls-files *.js *.mjs *.cjs *.html *.htm bez tests/ i docs/)
//         nie zawiera `_eventLog`, applyEncryptedEvent, encryptEvent, nazw 14 builderów ani `Bev_` (bez nazw ogólnych:
//         enqueue, eventBytes, kinds, deleteDatabase — istnieją w innych plikach); strażnik „lista nie jest pusta”.
//         Z natury zielony także na bazie (nazw tam nie ma).
//   U2(c) w bloku (także w komentarzach) brak wywołań z listy zakazanej projektu (zapis, emisja, sieć, magazyny
//         przeglądarki, legacy buildery delt, eksport ładunku) i brak `console.`.
//   U2(d) (D5) najwyższy poziom bloku (AST, acorn): wyłącznie deklaracje function / async function oraz const z literałem,
//         Object.freeze(…) albo new Map() / new Set() — bez wywołań innych funkcji przy ładowaniu.
//   U2(e) eksport _eventLog zamrożony; klucze = dokładnie lista E2-PR2a (nowa funkcja bez wpisu na liście = czerwony test).
// Czerwone na bazie 0bd1380d: U2(a), U2(c) (poza samokontrolą wzorców), U2(d), U2(e) (brak znaczników i eksportu);
// zielone z natury: U2(b) i samokontrola wzorców U2(c).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'acorn';
import { okno } from './sesja-zapisu-uprzaz.mjs';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SEJF = 'vilda_vault.js';
const ZRODLO = fs.readFileSync(path.join(KORZEN, SEJF), 'utf8');
const POCZATEK = '/* P-DZIENNIK-ZDARZEN: poczatek bloku */';
const KONIEC = '/* P-DZIENNIK-ZDARZEN: koniec bloku */';
const BUILDERY = ['buildSnapshotEvent', 'buildPatientFullEvents', 'buildPatientTombstoneEvent', 'buildSnapshotTombstoneEvent',
  'buildPatientNoteEvent', 'buildPatientNoteTombstoneEvent', 'buildNoteEvent', 'buildNoteTombstoneEvent', 'buildPatientListEvent',
  'buildPatientListTombstoneEvent', 'buildPreferenceEvent', 'buildPasskeyEvent', 'buildPasskeyTombstoneEvent', 'buildCredentialEvent'];
const KLUCZE_EKSPORTU = ['kinds', ...BUILDERY, 'encryptEvent', 'eventBytes', 'applyEncryptedEvent'];
const RODZAJE = ['snap', 'pfull', 'ptomb', 'stomb', 'pnote', 'pnotetomb', 'note', 'notetomb', 'plist', 'plisttomb', 'pref', 'pk', 'pktomb', 'cred'];
const ile = (tekst, fragment) => tekst.split(fragment).length - 1;

function blok() {
  const a = ZRODLO.indexOf(POCZATEK);
  const z = ZRODLO.indexOf(KONIEC);
  if (a < 0 || z < a) throw new Error('brak bloku P-DZIENNIK-ZDARZEN (znaczniki początku i końca)');
  return { a, z: z + KONIEC.length, tekst: ZRODLO.slice(a, z + KONIEC.length) };
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

describe('U2(a): identyfikatory Bev_ tylko w bloku; _eventLog dokładnie raz', () => {
  it('eksport dziennika zdarzeń istnieje (VildaVault._eventLog)', () => {
    expect(typeof eksport).toBe('object');
  });

  it('znaczniki bloku dokładnie raz; poza blokiem jedyne Bev_ to _eventLog:Bev_EKSPORT', () => {
    expect(ile(ZRODLO, POCZATEK), 'znacznik początku').toBe(1);
    expect(ile(ZRODLO, KONIEC), 'znacznik końca').toBe(1);
    const { a, z } = blok();
    const poza = ZRODLO.slice(0, a) + ZRODLO.slice(z);
    const bev = [...poza.matchAll(/(?<![A-Za-z0-9_$])Bev_[A-Za-z0-9_$]*/g)].map((m) => poza.slice(m.index - 10, m.index + m[0].length));
    expect(bev, 'Bev_ poza blokiem').toEqual(['_eventLog:Bev_EKSPORT']);
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
});

describe('U2(b): pliki produktu poza sejfem nie znają nowego API', () => {
  const NAZWY = ['_eventLog', 'applyEncryptedEvent', 'encryptEvent', ...BUILDERY];
  it('żaden plik produktu poza vilda_vault.js nie zawiera _eventLog, applyEncryptedEvent, encryptEvent, nazw builderów ani Bev_', () => {
    const winne = [];
    for (const plik of plikiProdukcyjne()) {
      const tresc = fs.readFileSync(path.join(KORZEN, plik), 'utf8');
      for (const n of NAZWY) if (tresc.includes(n)) winne.push(`${plik}: ${n}`);
      if (/(?<![A-Za-z0-9_$])Bev_/.test(tresc)) winne.push(`${plik}: Bev_`);
    }
    expect(winne).toEqual([]);
  });

  it('strażnik nie jest pusty — skan widzi moduły synchronizacji, service worker i strony', () => {
    const pliki = plikiProdukcyjne();
    for (const p of ['vilda_sync.js', 'vilda_sync_integration.js', 'vilda_realtime.js', 'service-worker-kalorii.js', 'app.html']) {
      expect(pliki, p).toContain(p);
    }
    expect(pliki).not.toContain(SEJF);
  });
});

describe('U2(c): w bloku brak wywołań zakazanych', () => {
  // Lista z projektu E2-PR2a (1.1): zapis magazynu i metadanych konta, emisje i powiadomienia, sieć, magazyny przeglądarki,
  // legacy buildery delt i eksport ładunku (is kasuje stare nagrobki), skutki uboczne przy ładowaniu. „.delete…(” to wywołania
  // metod delete* (Map.delete, deleteDatabase, deleteSnapshot…), nie pole deletedAtISO.
  // Wzorce bez nawiasu wywołania (U2c weryfikacji, mutanty X3 i X4): dostęp przez nawias (c.a['putUserMeta'](…))
  // i przez .call (.removeNoteTombstoneForUser.call(…)) — sama nazwa metody zapisu/usuwania, poza polami deletedAtISO
  // i deletedWithPatient.
  const ZAKAZANE = [
    /console\./, /fetch\(/, /sendBeacon/, /BroadcastChannel/, /postMessage/, /indexedDB/, /localStorage/, /sessionStorage/,
    /\.putUserMeta\(/, /Bmk_zmien\(/, /\.put[A-Za-z]*ForUser\(/, /\.remove[A-Za-z]*ForUser\(/, /\.delete[A-Za-z]*\s*\(/, /Bkz_zmienListe\(/,
    /VaultChangeSignal/, /syncPush/, /addEventListener/, /setTimeout/, /setInterval/, /navigator\./,
    /(?<![A-Za-z0-9_$])(?:Vn|ws|Qr|qr|vs|Yn|Qe2|jn|is|Bkz_eksport|Gc5|Gc3|us|ls|ds|cs|Qb0|Qb1|Bsw_deltaNagrobka|ps)\(/,
    /\.delete(?!dAtISO\b|dWithPatient\b)[A-Za-z]*/, /\.(?:put|remove)[A-Za-z]*ForUser\b/, /\.putUserMeta\b/,
    /\[\s*['"`](?:put|remove|write|update|delete(?!dAtISO\b|dWithPatient\b))/,
  ];
  it('żaden zakazany wzorzec (także w komentarzach)', () => {
    expect(typeof eksport).toBe('object');
    const { tekst } = blok();
    const znalezione = [];
    for (const re of ZAKAZANE) {
      const g = new RegExp(re.source, 'g');
      for (const m of tekst.matchAll(g)) znalezione.push(`${re}: …${tekst.slice(Math.max(0, m.index - 30), m.index + 30)}…`);
    }
    expect(znalezione).toEqual([]);
  });
  it('samokontrola wzorców: lista łapie przykładowe naruszenia', () => {
    const proby = ['console.log(1)', 'await I().putPatientForUser(b, x)', 'Vn({})', 'is()', 'x.deleteDatabase(n)', 'm.delete(k)', 'v.localStorage.setItem(k, v)', 'Bkz_eksport()',
      "await c.a['putUserMeta'](c.u, m)", 'await c.a.removeNoteTombstoneForUser.call(c.a, c.u, id)', 'const f = c.a.putUserMeta', 'a[`deleteSnapshotForUser`](u, s)'];
    for (const p of proby) expect(ZAKAZANE.some((re) => re.test(p)), p).toBe(true);
    for (const p of ['Bev_kluczeW(o, k)', 'Number.isInteger(x)', 'Object.keys(o)', 'await Le(t)', 'n.deletedAtISO', 'r.deletedWithPatient', 'Bev_wynik(status)',
      'await c.a.getPatientForUser(c.u, id)', "e['deletedAtISO']"]) expect(ZAKAZANE.some((re) => re.test(p)), p).toBe(false);
  });
});

describe('U2(d) (D5): najwyższy poziom bloku — tylko deklaracje bez skutków przy ładowaniu', () => {
  it('function / async function albo const z literałem, Object.freeze(…), new Map() / new Set()', () => {
    expect(typeof eksport).toBe('object');
    const { tekst } = blok();
    const ast = parse(tekst, { ecmaVersion: 'latest', sourceType: 'script' });
    const bledy = [];
    const freeze = (n) => n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed &&
      n.callee.object.type === 'Identifier' && n.callee.object.name === 'Object' && n.callee.property.name === 'freeze';
    // wywołania przy ładowaniu poza ciałami funkcji (dozwolone: zagnieżdżone Object.freeze)
    const wywolaniaPrzyLadowaniu = (n, sciezka) => {
      if (!n || typeof n.type !== 'string') return;
      if (/Function/.test(n.type)) return;
      if ((n.type === 'CallExpression' && !freeze(n)) || n.type === 'NewExpression' || n.type === 'TaggedTemplateExpression' ||
        n.type === 'AwaitExpression' || n.type === 'AssignmentExpression' || n.type === 'UpdateExpression') bledy.push(`${sciezka}: ${n.type}`);
      for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach((y) => wywolaniaPrzyLadowaniu(y, sciezka)); else if (x && typeof x.type === 'string') wywolaniaPrzyLadowaniu(x, sciezka); }
    };
    for (const s of ast.body) {
      if (s.type === 'FunctionDeclaration') {
        if (!/^Bev_/.test(s.id.name)) bledy.push(`funkcja bez prefiksu Bev_: ${s.id.name}`);
        continue;
      }
      if (s.type !== 'VariableDeclaration' || s.kind !== 'const') { bledy.push(`instrukcja ${s.type}${s.kind ? ' ' + s.kind : ''}`); continue; }
      for (const d of s.declarations) {
        const nazwa = d.id.type === 'Identifier' ? d.id.name : '?';
        if (!/^Bev_/.test(nazwa)) bledy.push(`stała bez prefiksu Bev_: ${nazwa}`);
        const i = d.init;
        if (!i) { bledy.push(`${nazwa}: bez wartości`); continue; }
        if (i.type === 'Literal') continue;
        if (i.type === 'NewExpression' && i.callee.type === 'Identifier' && ['Map', 'Set'].includes(i.callee.name) && !i.arguments.length) continue;
        if (freeze(i)) { i.arguments.forEach((x) => wywolaniaPrzyLadowaniu(x, nazwa)); continue; }
        bledy.push(`${nazwa}: ${i.type}`);
      }
    }
    expect(bledy).toEqual([]);
    expect(ast.body.length).toBeGreaterThan(20);
  });
});

describe('U2(e): eksport _eventLog zamrożony, klucze dokładnie z listy', () => {
  it('Object.isFrozen, klucze = lista E2-PR2a, kinds zamrożone (14 rodzajów), funkcje', () => {
    expect(typeof eksport).toBe('object');
    expect(Object.isFrozen(eksport)).toBe(true);
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
