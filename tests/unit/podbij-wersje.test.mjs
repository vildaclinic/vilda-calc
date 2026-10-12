import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { opiszPlan, zaplanuj, zastosuj } from '../support/podbij-wersje.mjs';
import { biezaceWersje, korzen } from '../support/wersje-zasobow.mjs';

// P-WATKI (zlecenie właściciela 2026-09-30): kilka wątków naraz podbijało te same wersje. Skrypt
// `npm run podbij-wersje` liczy je wyłącznie z bazy i z treści plików. Każdy test buduje małe,
// syntetyczne repozytorium git o układzie aplikacji (strony, skrypt wstrzykujący, zestaw smoke,
// service worker z tablicami, pin SW w teście, stan wersji) i woła prawdziwe zaplanuj()/zastosuj().

const SW = `const SW_VERSION = '1.1.10';
const ROOT_DOCUMENT = '/index.html';
const CORE_SHELL_URLS = [
  ROOT_DOCUMENT,
  '/manifest.json',
  '/silnik.js?v=2',
  '/silnik.js?v=3',
  '/ladowacz.js?v=7'
];
const OPTIONAL_DOCUMENTS = [
  '/app.html',
];
const OPTIONAL_ASSETS = [
  '/styl.css?v=4',
  '/styl.css?v=5',
];
`;

const PLIKI = {
  'index.html': `<!doctype html>
<link rel="stylesheet" href="styl.css?v=5">
<script src="silnik.js?v=3"></script>
<script src="./ladowacz.js?v=7"></script>
<p>Strona główna</p>
`,
  'app.html': `<!doctype html>
<script src="silnik.js?v=3"></script>
<p>Powłoka</p>
`,
  'ladowacz.js': `var l = document.createElement('link');
l.href = 'styl.css?v=5';
document.head.appendChild(l);
`,
  'silnik.js': `// silnik
window.silnikA = 1;
// środek 1
// środek 2
// środek 3
window.silnikB = 1;
`,
  'styl.css': 'body { color: black; }\n',
  'manifest.json': '{ "name": "syntetyczna" }\n',
  'vilda_smoke_tests.js': `const EXPECTED_BROWSER_SCRIPTS = [
  'silnik.js?v=3',
  'ladowacz.js?v=7',
];
`,
  'service-worker-kalorii.js': SW,
  'tests/unit/klirens-ui-model.test.mjs': `expect(sw).toContain("const SW_VERSION = '1.1.10'");\nexpect(html).toContain('silnik.js?v=3');\n`,
  'docs/notatka.md': 'notatka\n',
  '.gitignore': 'makieta_*.html\n',
};

// Git testu nie czyta konfiguracji globalnej ani systemowej (np. core.autocrlf=true na Windows).
const SRODOWISKO = {
  ...process.env,
  GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
};

const katalogi = [];
afterEach(() => {
  for (const k of katalogi.splice(0)) fs.rmSync(k, { recursive: true, force: true });
});

function repo() {
  const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'podbij-wersje-'));
  katalogi.push(katalog);
  const git = (...a) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...a], { cwd: katalog, encoding: 'utf8', env: SRODOWISKO, stdio: ['ignore', 'pipe', 'pipe'] });
  const zapisz = (p, t) => {
    fs.mkdirSync(path.dirname(path.join(katalog, p)), { recursive: true });
    fs.writeFileSync(path.join(katalog, p), t);
  };
  const czytaj = (p) => fs.readFileSync(path.join(katalog, p), 'utf8');
  for (const [p, t] of Object.entries(PLIKI)) zapisz(p, t);
  zapisz('tests/fixtures/wersje-zasobow.json', `${JSON.stringify(biezaceWersje(katalog), null, 1)}\n`);
  git('init', '-q');
  git('config', 'core.autocrlf', 'false');
  git('checkout', '-q', '-b', 'audyt');
  git('add', '-A');
  git('commit', '-q', '-m', 'baza');
  git('checkout', '-q', '-b', 'agent/watek');
  const plan = () => zaplanuj({ katalog, baza: 'audyt' });
  const podbij = () => {
    const p = plan();
    zastosuj(p, { katalog });
    return p;
  };
  return { katalog, git, zapisz, czytaj, plan, podbij };
}

const wersjaSW = (tekst) => /const SW_VERSION = '([^']+)'/.exec(tekst)[1];

/** Zmiana wprowadzona w audyt (jak scalony wcześniej PR), a potem scalona do gałęzi wątku. */
function wAudyt(r, zmien) {
  r.git('checkout', '-q', 'audyt');
  zmien();
  r.zapisz('tests/fixtures/wersje-zasobow.json', `${JSON.stringify(biezaceWersje(r.katalog), null, 1)}\n`);
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'zmiana w audyt');
  r.git('checkout', '-q', 'agent/watek');
  r.git('merge', '-q', 'audyt');
}
const stan = (r) => JSON.parse(r.czytaj('tests/fixtures/wersje-zasobow.json'));

describe('P-WATKI: podbij-wersje liczy wersje z bazy i treści', () => {
  it('bez zmian w plikach aplikacji nie ma nic do zapisu i SW zostaje', () => {
    const r = repo();
    r.zapisz('docs/notatka.md', 'inna notatka\n');
    r.zapisz('tests/unit/nowy.test.mjs', 'it("x", () => {});\n');
    const p = r.plan();
    expect(p.zmiany.size, opiszPlan(p)).toBe(0);
    expect(p.sw.cel).toBe('1.1.10');
    expect(p.bazaWHistorii).toBe(true);
  });

  it('zmieniony skrypt: ?v= na wszystkich stronach i w smoke, wpis precache po poprzednim, SW, pin, stan', () => {
    const r = repo();
    r.zapisz('silnik.js', r.czytaj('silnik.js').replace('silnikA = 1', 'silnikA = 2'));
    const p = r.podbij();
    expect(p.pliki).toEqual([{ plik: 'silnik.js', vBazy: 3, vPrzed: 3, cel: 4, zmieniony: true, przezWstrzykniecie: false, zHistoriiSW: null }]);
    expect(r.czytaj('index.html')).toContain('<script src="silnik.js?v=4">');
    expect(r.czytaj('app.html')).toContain('<script src="silnik.js?v=4">');
    expect(r.czytaj('vilda_smoke_tests.js')).toContain("'silnik.js?v=4'");
    const sw = r.czytaj('service-worker-kalorii.js');
    expect(sw).toContain("  '/silnik.js?v=3',\n  '/silnik.js?v=4',\n  '/ladowacz.js?v=7'\n];");
    expect(wersjaSW(sw)).toBe('1.1.11');
    expect(r.czytaj('tests/unit/klirens-ui-model.test.mjs')).toContain("const SW_VERSION = '1.1.11'");
    expect(stan(r)['silnik.js'].v).toBe(4);
    expect(stan(r)).toEqual(biezaceWersje(r.katalog));
    // Pin wersji pliku w teście nie jest zmieniany, tylko zgłaszany.
    expect(r.czytaj('tests/unit/klirens-ui-model.test.mjs')).toContain("'silnik.js?v=3'");
    expect(p.testyDoSprawdzenia.join('\n')).toContain('tests/unit/klirens-ui-model.test.mjs:2: silnik.js?v=3 (nowa wersja 4)');
    expect(opiszPlan(p)).toContain('Do decyzji: pin wersji w teście — tests/unit/klirens-ui-model.test.mjs:2');
    // Drugi przebieg niczego nie zmienia.
    expect(r.plan().zmiany.size).toBe(0);
  });

  it('kaskada: zmiana arkusza zmienia skrypt, który go wstrzykuje, więc ten też dostaje nowe ?v=', () => {
    const r = repo();
    r.zapisz('styl.css', 'body { color: navy; }\n');
    const p = r.podbij();
    expect(p.pliki.map((w) => `${w.plik} ${w.vBazy}→${w.cel}`)).toEqual(['ladowacz.js 7→8', 'styl.css 5→6']);
    expect(r.czytaj('ladowacz.js')).toContain("'styl.css?v=6'");
    expect(r.czytaj('index.html')).toContain('href="styl.css?v=6"');
    expect(r.czytaj('index.html')).toContain('src="./ladowacz.js?v=8"');
    expect(r.czytaj('vilda_smoke_tests.js')).toContain("'ladowacz.js?v=8'");
    const sw = r.czytaj('service-worker-kalorii.js');
    // Dawny ostatni element tablicy (bez przecinka) dostaje przecinek, nowy wpis staje się ostatnim.
    expect(sw).toContain("  '/ladowacz.js?v=7',\n  '/ladowacz.js?v=8'\n];");
    expect(p.pliki.find((w) => w.plik === 'ladowacz.js').przezWstrzykniecie).toBe(true);
    expect(sw).toContain("  '/styl.css?v=5',\n  '/styl.css?v=6',\n];");
    expect(r.plan().zmiany.size).toBe(0);
  });

  it('dwa wątki zmieniają ten sam plik: po scaleniu pierwszego drugi dostaje następny numer, nie ten sam', () => {
    const r = repo();
    const staraBaza = r.git('rev-parse', 'audyt').trim();
    // Wątek A zmienia górę pliku, podbija i trafia do audyt pierwszy.
    r.git('checkout', '-q', '-b', 'agent/a', 'audyt');
    r.zapisz('silnik.js', r.czytaj('silnik.js').replace('silnikA = 1', 'silnikA = 2'));
    r.podbij();
    r.git('commit', '-q', '-am', 'A');
    r.git('checkout', '-q', 'audyt');
    r.git('merge', '-q', '--no-ff', '-m', 'scal A', 'agent/a');
    // Wątek B zaczął wcześniej: zmienia dół tego samego pliku i podbija względem STAREJ bazy — też do 4.
    r.git('checkout', '-q', 'agent/watek');
    r.zapisz('silnik.js', r.czytaj('silnik.js').replace('silnikB = 1', 'silnikB = 2'));
    const planB = zaplanuj({ katalog: r.katalog, baza: staraBaza });
    zastosuj(planB, { katalog: r.katalog });
    expect(planB.pliki[0].cel).toBe(4);
    r.git('commit', '-q', '-am', 'B');
    // Scalenie audyt do B: strony i SW scalają się CZYSTO (obie strony wpisały to samo ?v=4, 1.1.11),
    // konflikt jest tylko w stanie wersji. Dowolna strona konfliktu wystarcza.
    const scalenie = spawnSync('git', ['merge', 'audyt'], { cwd: r.katalog, encoding: 'utf8', env: SRODOWISKO });
    expect(scalenie.status).not.toBe(0);
    const wKonflikcie = r.git('diff', '--name-only', '--diff-filter=U').trim().split('\n');
    expect(wKonflikcie).toEqual(['tests/fixtures/wersje-zasobow.json']);
    expect(r.czytaj('index.html')).toContain('silnik.js?v=4');
    expect(r.czytaj('silnik.js')).toContain('silnikA = 2');
    expect(r.czytaj('silnik.js')).toContain('silnikB = 2');
    r.git('checkout', '--theirs', 'tests/fixtures/wersje-zasobow.json');
    r.git('add', '-A');
    // W trakcie scalania HEAD to jeszcze B, a baza jest w MERGE_HEAD — to się liczy jako „baza w historii”.
    const p = r.podbij();
    expect(p.bazaWHistorii).toBe(true);
    expect(p.pliki.find((w) => w.plik === 'silnik.js')).toMatchObject({ vBazy: 4, vPrzed: 4, cel: 5 });
    expect(r.czytaj('index.html')).toContain('silnik.js?v=5');
    const sw = r.czytaj('service-worker-kalorii.js');
    expect(sw).toContain("  '/silnik.js?v=3',\n  '/silnik.js?v=4',\n  '/silnik.js?v=5',\n");
    expect(wersjaSW(sw)).toBe('1.1.12');
    expect(r.czytaj('tests/unit/klirens-ui-model.test.mjs')).toContain("const SW_VERSION = '1.1.12'");
    expect(stan(r)).toEqual(biezaceWersje(r.katalog));
  });

  it('konflikt ?v= rozwiązany stroną wątku (starsza wersja) wraca do wersji z bazy, bez podbijania', () => {
    const r = repo();
    // W audyt ktoś zmienił arkusz: styl.css 5 → 6, ladowacz.js 7 → 8.
    r.git('checkout', '-q', 'audyt');
    r.zapisz('styl.css', 'body { color: navy; }\n');
    zastosuj(zaplanuj({ katalog: r.katalog, baza: 'audyt' }), { katalog: r.katalog });
    r.git('commit', '-q', '-am', 'arkusz w audyt');
    // Wątek scala audyt, ale w stronie zostaje jego (stara) strona tokenów.
    r.git('checkout', '-q', 'agent/watek');
    r.git('merge', '-q', 'audyt');
    r.zapisz('index.html', r.czytaj('index.html').replace('styl.css?v=6', 'styl.css?v=5').replace('ladowacz.js?v=8', 'ladowacz.js?v=7'));
    const p = r.podbij();
    // vPrzed to najwyższy token w korzeniu: styl.css ma jeszcze 6 w ladowacz.js, ladowacz.js tylko 7 w index.html.
    expect(p.pliki.map((w) => `${w.plik} ${w.vPrzed}→${w.cel}`)).toEqual(['ladowacz.js 7→8']);
    expect(r.czytaj('index.html')).toContain('href="styl.css?v=6"');
    expect(p.sw.cel).toBe('1.1.11');
    expect(r.git('status', '--porcelain').trim()).toBe('');
  });

  it('usunięty wpis precache obecny w bazie (np. konflikt w SW rozwiązany stroną wątku) jest błędem append-only', () => {
    const r = repo();
    r.zapisz('silnik.js', r.czytaj('silnik.js').replace('silnikA = 1', 'silnikA = 2'));
    r.zapisz('service-worker-kalorii.js', r.czytaj('service-worker-kalorii.js').replace("  '/silnik.js?v=2',\n", ''));
    const p = r.plan();
    expect(p.bledy.join('\n')).toContain("usunięto historyczny wpis precache '/silnik.js?v=2'");
  });

  it('zbędne podbicie bez zmiany treści jest cofane razem z wpisem precache i SW_VERSION', () => {
    const r = repo();
    r.zapisz('index.html', r.czytaj('index.html').replace('styl.css?v=5', 'styl.css?v=6'));
    r.zapisz('ladowacz.js', r.czytaj('ladowacz.js').replace('styl.css?v=5', 'styl.css?v=6'));
    r.zapisz('service-worker-kalorii.js', r.czytaj('service-worker-kalorii.js')
      .replace("  '/styl.css?v=5',\n", "  '/styl.css?v=5',\n  '/styl.css?v=6',\n")
      .replace("'1.1.10'", "'1.1.11'"));
    r.podbij();
    expect(r.git('status', '--porcelain').trim()).toBe('');
  });

  it('zmiana samej strony HTML podbija SW bez żadnego ?v=', () => {
    const r = repo();
    r.zapisz('app.html', r.czytaj('app.html').replace('Powłoka', 'Powłoka aplikacji'));
    const p = r.podbij();
    expect(p.pliki).toEqual([]);
    expect(p.sw).toMatchObject({ przed: '1.1.10', cel: '1.1.11' });
    expect(p.sw.powody.join(' ')).toContain('app.html');
  });

  it('zmiana zasobu bez ?v= z pamięci SW (manifest.json) też podbija SW', () => {
    const r = repo();
    r.zapisz('manifest.json', '{ "name": "syntetyczna 2" }\n');
    expect(r.plan().sw.cel).toBe('1.1.11');
  });

  it('SW podbity ręcznie ponad potrzebę wraca do wersji z bazy + 1, niezależnie od tego, co wpisał wątek', () => {
    const r = repo();
    r.zapisz('silnik.js', r.czytaj('silnik.js').replace('silnikA = 1', 'silnikA = 2'));
    r.zapisz('service-worker-kalorii.js', r.czytaj('service-worker-kalorii.js').replace("'1.1.10'", "'1.1.17'"));
    expect(r.podbij().sw).toMatchObject({ przed: '1.1.17', cel: '1.1.11' });
  });

  it('nowy plik bez wpisu w precache: wersja autora zostaje, skrypt zgłasza brak wpisu zamiast zgadywać tablicę', () => {
    const r = repo();
    r.zapisz('nowy.js', 'window.nowy = 1;\n');
    r.zapisz('index.html', r.czytaj('index.html').replace('<p>', '<script src="nowy.js?v=1"></script>\n<p>'));
    const p = r.podbij();
    expect(p.ostrzezenia.join('\n')).toContain('nowy plik nowy.js?v=1 nie ma wpisu');
    expect(stan(r)['nowy.js'].v).toBe(1);
    expect(p.sw.cel).toBe('1.1.11');
  });

  it('gałąź bez najnowszej bazy: plan to zgłasza (CLI wtedy odmawia zapisu)', () => {
    const r = repo();
    r.git('checkout', '-q', 'audyt');
    r.zapisz('docs/notatka.md', 'zmiana w audyt\n');
    r.git('commit', '-q', '-am', 'nowszy audyt');
    r.git('checkout', '-q', 'agent/watek');
    const p = r.plan();
    expect(p.bazaWHistorii).toBe(false);
    expect(opiszPlan(p)).toContain('gałąź nie zawiera audyt');
  });

  it('nierozwiązane znaczniki konfliktu przerywają liczenie', () => {
    const r = repo();
    r.zapisz('index.html', `<<<<<<< HEAD\n${r.czytaj('index.html')}=======\nx\n>>>>>>> audyt\n`);
    expect(() => r.plan()).toThrow(/znaczniki konfliktu[\s\S]*index\.html/);
  });

  it('pin SW zmienia się tylko w klirens-ui-model.test.mjs, nie w testach z syntetycznym service workerem', () => {
    const r = repo();
    const syntetyczny = `const SW = \`const SW_VERSION = '1.1.10';\`;\n`;
    r.zapisz('tests/unit/inny.test.mjs', syntetyczny);
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'test z syntetycznym SW');
    r.zapisz('app.html', r.czytaj('app.html').replace('Powłoka', 'Powłoka aplikacji'));
    r.podbij();
    expect(r.czytaj('tests/unit/klirens-ui-model.test.mjs')).toContain("const SW_VERSION = '1.1.11'");
    expect(r.czytaj('tests/unit/inny.test.mjs')).toBe(syntetyczny);
  });

  it('wpis dopisany po ostatnim elemencie tablicy (bez przecinka) nie jest brany za usunięty wpis bazy', () => {
    const r = repo();
    r.zapisz('nowy.js', 'window.nowy = 1;\n');
    r.zapisz('index.html', r.czytaj('index.html').replace('<p>', '<script src="nowy.js?v=1"></script>\n<p>'));
    r.zapisz('service-worker-kalorii.js', r.czytaj('service-worker-kalorii.js')
      .replace("  '/ladowacz.js?v=7'\n];", "  '/ladowacz.js?v=7',\n  '/nowy.js?v=1'\n];"));
    const p = r.podbij();
    expect(p.bledy).toEqual([]);
    expect(p.precache.usuniete).toEqual([]);
    expect(p.ostrzezenia.join('\n')).not.toContain('nowy.js');
    expect(r.czytaj('service-worker-kalorii.js')).toContain("  '/ladowacz.js?v=7',\n  '/nowy.js?v=1'\n];");
  });

  it('dopisany brakujący wpis bieżącej wersji niezmienionego pliku zostaje i podbija SW (P-SW-LAB-PIN)', () => {
    const r = repo();
    wAudyt(r, () => {
      r.zapisz('dodatek.js', 'window.dodatek = 1;\n');
      r.zapisz('app.html', r.czytaj('app.html').replace('<p>', '<script src="dodatek.js?v=4"></script>\n<p>'));
      r.zapisz('service-worker-kalorii.js', r.czytaj('service-worker-kalorii.js').replace("  '/styl.css?v=5',\n", "  '/styl.css?v=5',\n  '/dodatek.js?v=3',\n"));
    });
    expect(r.plan().ostrzezenia.join('\n')).toContain("bieżąca wersja '/dodatek.js?v=4' nie ma wpisu");
    r.zapisz('service-worker-kalorii.js', r.czytaj('service-worker-kalorii.js').replace("  '/dodatek.js?v=3',\n", "  '/dodatek.js?v=3',\n  '/dodatek.js?v=4',\n"));
    const p = r.podbij();
    expect(p.precache.usuniete).toEqual([]);
    expect(r.czytaj('service-worker-kalorii.js')).toContain("'/dodatek.js?v=4',");
    expect(p.sw).toMatchObject({ cel: '1.1.11' });
    expect(p.sw.powody.join(' ')).toContain('zmieniony sam service-worker-kalorii.js');
  });

  it('nowe ?v= przeskakuje wersje, które precache bazy już ma (klucz może być w pamięci klienta)', () => {
    const r = repo();
    wAudyt(r, () => {
      r.zapisz('service-worker-kalorii.js', r.czytaj('service-worker-kalorii.js').replace("  '/silnik.js?v=3',\n", "  '/silnik.js?v=3',\n  '/silnik.js?v=4',\n"));
    });
    r.zapisz('silnik.js', r.czytaj('silnik.js').replace('silnikA = 1', 'silnikA = 2'));
    const p = r.podbij();
    expect(p.pliki.find((w) => w.plik === 'silnik.js')).toMatchObject({ vBazy: 3, cel: 5, zHistoriiSW: 4 });
    expect(r.czytaj('index.html')).toContain('silnik.js?v=5');
    expect(r.czytaj('service-worker-kalorii.js')).toContain("  '/silnik.js?v=4',\n  '/silnik.js?v=5',\n");
  });

  it('plik spoza stron bazy z historią w precache: ?v= nie wyższe niż w bazie przy innej treści to błąd', () => {
    const r = repo();
    wAudyt(r, () => {
      r.zapisz('stary.js', 'window.stary = 1;\n');
      r.zapisz('service-worker-kalorii.js', r.czytaj('service-worker-kalorii.js').replace("  '/styl.css?v=5',\n", "  '/styl.css?v=5',\n  '/stary.js?v=3',\n"));
    });
    r.zapisz('stary.js', 'window.stary = 2;\n');
    r.zapisz('app.html', r.czytaj('app.html').replace('<p>', '<script src="stary.js?v=3"></script>\n<p>'));
    expect(r.plan().bledy.join('\n')).toContain('stary.js?v=3: precache bazy ma już ten plik do ?v=3 z inną treścią');
  });

  it('wpis dodany na gałęzi dla pliku, którego strony przestały ładować, znika', () => {
    const r = repo();
    r.zapisz('silnik.js', r.czytaj('silnik.js').replace('silnikA = 1', 'silnikA = 2'));
    r.podbij();
    expect(r.czytaj('service-worker-kalorii.js')).toContain("'/silnik.js?v=4'");
    for (const f of ['index.html', 'app.html']) r.zapisz(f, r.czytaj(f).replace('<script src="silnik.js?v=4"></script>\n', ''));
    r.zapisz('vilda_smoke_tests.js', r.czytaj('vilda_smoke_tests.js').replace("  'silnik.js?v=4',\n", ''));
    const p = r.podbij();
    expect(p.precache.usuniete).toEqual(["'/silnik.js?v=4'"]);
    expect(r.czytaj('service-worker-kalorii.js')).not.toContain("'/silnik.js?v=4'");
    expect(r.czytaj('service-worker-kalorii.js')).toContain("'/silnik.js?v=3'");
    expect(stan(r)['silnik.js']).toBeUndefined();
  });

  it('przeniesienie wpisu bazy do innej tablicy zmienia SW, więc podbija SW_VERSION', () => {
    const r = repo();
    r.zapisz('service-worker-kalorii.js', r.czytaj('service-worker-kalorii.js')
      .replace("  '/styl.css?v=5',\n", '')
      .replace("  '/ladowacz.js?v=7'\n];", "  '/ladowacz.js?v=7',\n  '/styl.css?v=5',\n];"));
    const p = r.plan();
    expect(p.bledy).toEqual([]);
    expect(p.sw.cel).toBe('1.1.11');
    expect(p.sw.powody.join(' ')).toContain('zmieniony sam');
  });

  it('najmniejszy punkt stały: skrypty wstrzykujące się nawzajem wracają do wersji bazy po cofnięciu zmiany', () => {
    const r = repo();
    wAudyt(r, () => {
      r.zapisz('a.js', "// a\nvar x = 'b.js?v=2';\n");
      r.zapisz('b.js', "var y = 'a.js?v=5';\n");
      r.zapisz('index.html', r.czytaj('index.html').replace('<p>', '<script src="a.js?v=5"></script>\n<script src="b.js?v=2"></script>\n<p>'));
      r.zapisz('service-worker-kalorii.js', r.czytaj('service-worker-kalorii.js').replace("  '/styl.css?v=5',\n", "  '/styl.css?v=5',\n  '/a.js?v=5',\n  '/b.js?v=2',\n"));
    });
    r.zapisz('a.js', r.czytaj('a.js').replace('// a', '// a zmienione'));
    const p1 = r.podbij();
    expect(p1.pliki.map((w) => `${w.plik} ${w.vBazy}→${w.cel}`)).toEqual(['a.js 5→6', 'b.js 2→3']);
    r.zapisz('a.js', r.czytaj('a.js').replace('// a zmienione', '// a'));
    r.podbij();
    expect(r.git('status', '--porcelain').trim()).toBe('');
  });

  it('wersje nieliczbowe: ostrzeżenie tylko przy zmienionej treści bez zmiany tokenu', () => {
    const r = repo();
    wAudyt(r, () => {
      r.zapisz('edu.css', '.edu { color: red; }\n');
      r.zapisz('app.html', r.czytaj('app.html').replace('<p>', '<link rel="stylesheet" href="edu.css?v=20261001a">\n<p>'));
    });
    const ostrzezenie = (p) => p.ostrzezenia.filter((o) => o.includes('nieliczbowe')).join('\n');
    expect(ostrzezenie(r.plan())).toBe('');
    r.zapisz('edu.css', '.edu { color: blue; }\n');
    expect(ostrzezenie(r.plan())).toContain('edu.css ma nieliczbowe ?v= (20261001a)');
    r.zapisz('app.html', r.czytaj('app.html').replace('edu.css?v=20261001a', 'edu.css?v=20261002a'));
    expect(ostrzezenie(r.plan())).toBe('');
  });

  it('nowa strona spoza tablic SW jest zgłaszana', () => {
    const r = repo();
    r.zapisz('kontakt.html', '<!doctype html>\n<p>Kontakt</p>\n');
    const p = r.plan();
    expect(p.ostrzezenia.join('\n')).toContain('nowa strona kontakt.html nie jest w tablicach');
    expect(p.sw.cel).toBe('1.1.11');
  });

  it('znaczniki konfliktu w liczonym arkuszu CSS też przerywają liczenie', () => {
    const r = repo();
    r.zapisz('styl.css', '<<<<<<< HEAD\nbody { color: red; }\n=======\nbody { color: blue; }\n>>>>>>> audyt\n');
    expect(() => r.plan()).toThrow(/znaczniki konfliktu[\s\S]*styl\.css/);
  });

  it('ignorowane pliki w korzeniu (makiety) nie liczą się, nawet gdy nie są UTF-8', () => {
    const r = repo();
    fs.writeFileSync(path.join(r.katalog, 'makieta_klirens_1.html'), Buffer.from('<p>Za\xbf\xf3\xb3\xe6</p>\n<script src="silnik.js?v=9"></script>\n', 'latin1'));
    const p = r.plan();
    expect(p.zmiany.size, opiszPlan(p)).toBe(0);
    expect(p.sw.cel).toBe('1.1.10');
  });

  it('nierozwiązany plik scalania (poza stanem wersji) przerywa liczenie', () => {
    const r = repo();
    r.git('checkout', '-q', 'audyt');
    r.zapisz('docs/notatka.md', 'wersja audyt\n');
    r.git('commit', '-q', '-am', 'notatka w audyt');
    r.git('checkout', '-q', 'agent/watek');
    r.zapisz('docs/notatka.md', 'wersja wątku\n');
    r.git('commit', '-q', '-am', 'notatka w wątku');
    expect(spawnSync('git', ['merge', 'audyt'], { cwd: r.katalog, env: SRODOWISKO }).status).not.toBe(0);
    expect(() => r.plan()).toThrow(/nierozwiązane pliki[\s\S]*docs\/notatka\.md/);
  });

  it('kopia z core.autocrlf=true: odmowa z jasnym komunikatem zamiast fałszywych podbić', () => {
    const r = repo();
    r.git('config', 'core.autocrlf', 'true');
    expect(() => r.plan()).toThrow(/core\.autocrlf/);
  });

  it('brak rewizji bazowej daje zrozumiały błąd', () => {
    const r = repo();
    expect(() => zaplanuj({ katalog: r.katalog, baza: 'origin/audyt' })).toThrow(/git fetch origin audyt/);
  });
});

// P-WERSJE-CI: krok „Sprawdź wersje względem audyt” w ci.yml. Na PR-ze checkout daje commit scalenia
// z audyt (fetch-depth 2), więc HEAD^1 jest bazą; przy workflow_dispatch na gałęzi PR-a (commit bota
// z „Wygląd”) — pełna historia i baza origin/audyt. Test wycina polecenia kroku z joba unit prawdziwego
// ci.yml i uruchamia je w klonie jak na runnerze — z prawdziwymi skryptami podbij-wersje.
const CI = fs.readFileSync(path.join(korzen, '.github/workflows/ci.yml'), 'utf8');
const NAZWA_KROKU = 'Sprawdź wersje względem audyt';
const wciecie = (l) => l.search(/\S/);

/** Linie kroku `- name: <nazwa>` (do następnego kroku albo końca joba), z wcięciem kreski. */
function blokKroku(yml, nazwa) {
  const linie = yml.split('\n');
  const start = linie.findIndex((l) => l.trim() === `- name: ${nazwa}`);
  if (start < 0) return null;
  const d = linie[start].indexOf('-');
  let i = start + 1;
  while (i < linie.length && !(linie[i].trim() && wciecie(linie[i]) <= d)) i += 1;
  return { linie: linie.slice(start, i), d };
}

/** Klucze YAML na danym wcięciu (bez komentarzy); `- name:` w pierwszej linii kroku to klucz `name` na wcięciu kreski + 2. */
function kluczeNaWcieciu(linie, w) {
  return linie
    .map((l, i) => {
      if (i === 0 && /^\s*- name:/.test(l)) return wciecie(l) + 2 === w ? 'name' : undefined;
      return wciecie(l) === w && !l.trim().startsWith('#') ? (/^\s*([A-Za-z0-9_-]+):/.exec(l) || [])[1] : undefined;
    })
    .filter(Boolean);
}

/** Wartość klucza z jednej linii (np. `if: …`, `BAZA: …`) w bloku. */
function wartosc(linie, klucz) {
  const l = linie.find((x) => x.trim().startsWith(`${klucz}: `));
  return l ? l.trim().slice(klucz.length + 2) : null;
}

/** Blok `run: |` kroku, bez wcięcia YAML. */
function poleceniaKroku(yml, nazwa) {
  const krok = blokKroku(yml, nazwa);
  if (!krok) return null;
  const i = krok.linie.findIndex((l) => /^\s*run: \|\s*$/.test(l));
  if (i < 0) return null;
  const blok = krok.linie.slice(i + 1);
  const w = Math.min(...blok.filter((l) => l.trim()).map(wciecie));
  return blok.map((l) => l.slice(w)).join('\n').trim();
}

/** Job `unit` z ci.yml (do następnego joba). */
function jobUnit(yml) {
  const m = /^ {2}unit:\n([\s\S]*?)(?=^ {2}[A-Za-z0-9_-]+:\n)/m.exec(yml);
  return m ? m[1] : '';
}

/** Kopiuje do klonu prawdziwe skrypty podbij-wersje (syntetyczne repozytorium ich nie ma). */
function dolozSkrypty(klon) {
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: klon, env: SRODOWISKO });
  for (const p of ['tests/scripts/podbij-wersje.mjs', 'tests/support/podbij-wersje.mjs', 'tests/support/wersje-zasobow.mjs']) {
    fs.mkdirSync(path.dirname(path.join(klon, p)), { recursive: true });
    fs.copyFileSync(path.join(korzen, p), path.join(klon, p));
  }
  return klon;
}

/**
 * Commit scalenia PR-a jak na GitHubie (pierwszy rodzic: audyt, drugi: głowa PR-a), sklonowany płytko
 * (--depth=… jak actions/checkout z fetch-depth).
 */
function klonScaleniaPR(r, galaz, glebokosc = 2) {
  const powrot = r.git('rev-parse', '--abbrev-ref', 'HEAD').trim();
  r.git('checkout', '-q', '-B', 'pr/scalenie', 'audyt');
  r.git('merge', '-q', '--no-ff', '--no-edit', galaz);
  r.git('checkout', '-q', powrot);
  const klon = fs.mkdtempSync(path.join(os.tmpdir(), 'podbij-wersje-ci-'));
  katalogi.push(klon);
  execFileSync('git', ['clone', '-q', `--depth=${glebokosc}`, '--branch', 'pr/scalenie', `file://${r.katalog}`, klon], { env: SRODOWISKO, stdio: 'ignore' });
  return dolozSkrypty(klon);
}

/** Gałąź PR-a z pełną historią i origin/audyt — jak checkout z fetch-depth 0 przy workflow_dispatch. */
function klonGaleziPR(r, galaz) {
  const klon = fs.mkdtempSync(path.join(os.tmpdir(), 'podbij-wersje-ci-'));
  katalogi.push(klon);
  execFileSync('git', ['clone', '-q', '--no-single-branch', '--branch', galaz, `file://${r.katalog}`, klon], { env: SRODOWISKO, stdio: 'ignore' });
  return dolozSkrypty(klon);
}

// Wyjście kroku zawiera polecenia przepływu pracy (`::error …`). W komunikacie niezaliczonej asercji
// runner wziąłby je za prawdziwe adnotacje joba `npm test` — stąd neutralizacja.
const bezPolecen = (wynik) => `${wynik.stdout}${wynik.stderr}`.replace(/^::/gm, '› ::');

function uruchomKrokCI(klon, baza = 'HEAD^1') {
  const polecenia = poleceniaKroku(jobUnit(CI), NAZWA_KROKU);
  // Domyślna powłoka kroku w Actions (bez `shell:`) to `bash -e {0}` — widać ją w logu joba;
  // BAZA ustawia `env:` kroku z wyrażenia na event (sprawdzane w teście statycznym).
  return spawnSync('bash', ['-e', '-c', polecenia], { cwd: klon, encoding: 'utf8', env: { ...SRODOWISKO, BAZA: baza } });
}

/** Scenariusz #592 + #594: dwa wątki z tym samym SW_VERSION, drugi dostaje audyt czystym scaleniem. */
function kolizjaPoCzystymScaleniu() {
  const r = repo();
  // Wątek B (ta gałąź) zmienia samą stronę i podbija względem audyt sprzed A: SW 1.1.11.
  r.zapisz('index.html', r.czytaj('index.html').replace('<p>Strona główna</p>', '<p>Strona główna, nowa treść</p>'));
  expect(r.podbij().sw.cel).toBe('1.1.11');
  r.git('commit', '-q', '-am', 'B');
  // Wątek A zmienia skrypt, podbija względem tego samego audyt — też SW 1.1.11 — i wchodzi pierwszy (squash).
  r.git('checkout', '-q', '-b', 'agent/a', 'audyt');
  r.zapisz('silnik.js', r.czytaj('silnik.js').replace('silnikA = 1', 'silnikA = 2'));
  expect(r.podbij().sw.cel).toBe('1.1.11');
  r.git('commit', '-q', '-am', 'A');
  r.git('checkout', '-q', 'audyt');
  r.git('merge', '-q', '--squash', 'agent/a');
  r.git('commit', '-q', '-m', 'A (#1)');
  // „Update branch”: audyt do B scala się bez konfliktu, bo obie strony wpisały to samo SW_VERSION.
  r.git('checkout', '-q', 'agent/watek');
  r.git('merge', '-q', '--no-edit', 'audyt');
  return r;
}

describe('P-WERSJE-CI: CI sprawdza wersje PR-a względem audyt', () => {
  it('ci.yml: krok w wymaganym jobie unit, na pull_request i workflow_dispatch poza audyt, bez furtek', () => {
    const unit = jobUnit(CI);
    // Job bez własnego `if:` ani `continue-on-error` — inaczej wymagany status mógłby przejść bez kroku.
    expect(kluczeNaWcieciu(unit.split('\n'), 4)).toEqual(['name', 'runs-on', 'timeout-minutes', 'steps']);
    expect(wartosc(unit.split('\n'), 'name')).toBe('Lint, składnia i testy jednostkowe');
    // Checkout: tylko fetch-depth (bez `ref:` itp.) — 2 na PR-ze (commit scalenia z rodzicami), 0 przy dispatch poza audyt.
    const checkout = blokKroku(unit, 'Pobierz repozytorium');
    expect(kluczeNaWcieciu(checkout.linie, checkout.d + 2)).toEqual(['name', 'uses', 'with']);
    expect(wartosc(checkout.linie, 'uses')).toMatch(/^actions\/checkout@v\d+$/);
    expect(kluczeNaWcieciu(checkout.linie, checkout.d + 4)).toEqual(['fetch-depth']);
    expect(wartosc(checkout.linie, 'fetch-depth'))
      .toBe("${{ github.event_name == 'workflow_dispatch' && github.ref != 'refs/heads/audyt' && '0' || '2' }}");
    // Krok: dokładnie name/if/env/run — bez continue-on-error, shell, working-directory; jedyny o tej nazwie.
    expect(CI.split(`- name: ${NAZWA_KROKU}\n`).length - 1).toBe(1);
    const krok = blokKroku(unit, NAZWA_KROKU);
    expect(krok, 'krok w jobie unit').not.toBeNull();
    expect(kluczeNaWcieciu(krok.linie, krok.d + 2)).toEqual(['name', 'if', 'env', 'run']);
    expect(wartosc(krok.linie, 'if'))
      .toBe("github.event_name == 'pull_request' || (github.event_name == 'workflow_dispatch' && github.ref != 'refs/heads/audyt')");
    expect(kluczeNaWcieciu(krok.linie, krok.d + 4)).toEqual(['BAZA']);
    expect(wartosc(krok.linie, 'BAZA')).toBe("${{ github.event_name == 'pull_request' && 'HEAD^1' || 'origin/audyt' }}");
    expect(poleceniaKroku(unit, NAZWA_KROKU)).toContain('node tests/scripts/podbij-wersje.mjs --sprawdz --bez-sieci --baza="$BAZA"');
  });

  it('kolizja SW po czystym scaleniu (#592 + #594): npm test zielony, krok CI kończy się kodem 1 i żąda SW + 1', () => {
    const r = kolizjaPoCzystymScaleniu();
    expect(r.czytaj('index.html')).toContain('silnik.js?v=4');
    expect(r.czytaj('index.html')).toContain('nowa treść');
    expect(wersjaSW(r.czytaj('service-worker-kalorii.js'))).toBe('1.1.11');
    // Drzewo jest wewnętrznie spójne — dlatego strażnicy z npm test tego nie widzą.
    expect(stan(r)).toEqual(biezaceWersje(r.katalog));

    const klon = klonScaleniaPR(r, 'agent/watek');
    expect(execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: klon, encoding: 'utf8' }).trim()).toBe('true');
    const krok = uruchomKrokCI(klon);
    expect(krok.status, bezPolecen(krok)).toBe(1);
    expect(krok.stdout).toContain('SW_VERSION: 1.1.11 → 1.1.12');
    expect(krok.stdout).toContain('::error title=Wersje niespójne z audyt::');
    expect(krok.stdout).not.toContain('::error title=Błąd wersji do ręcznej poprawki::');

    // Po npm run podbij-wersje na gałęzi PR-a ten sam krok przechodzi.
    expect(r.podbij().sw.cel).toBe('1.1.12');
    r.git('commit', '-q', '-am', 'podbij-wersje po scaleniu audyt');
    const poPoprawce = uruchomKrokCI(klonScaleniaPR(r, 'agent/watek'));
    expect(poPoprawce.status, bezPolecen(poPoprawce)).toBe(0);
    expect(poPoprawce.stdout).toContain('Nic do zmiany — wersje są spójne z bazą.');
  });

  it('workflow_dispatch (commit bota z „Wygląd” na gałęzi PR-a): baza origin/audyt łapie tę samą kolizję i brak audyt w gałęzi', () => {
    const r = kolizjaPoCzystymScaleniu();
    const krok = uruchomKrokCI(klonGaleziPR(r, 'agent/watek'), 'origin/audyt');
    expect(krok.status, bezPolecen(krok)).toBe(1);
    expect(krok.stdout).toContain('SW_VERSION: 1.1.11 → 1.1.12');
    expect(krok.stdout).toContain('::error title=Wersje niespójne z audyt::');

    expect(r.podbij().sw.cel).toBe('1.1.12');
    r.git('commit', '-q', '-am', 'podbij-wersje po scaleniu audyt');
    const poPoprawce = uruchomKrokCI(klonGaleziPR(r, 'agent/watek'), 'origin/audyt');
    expect(poPoprawce.status, bezPolecen(poPoprawce)).toBe(0);

    // audyt poszedł dalej, a gałąź go nie zawiera — tego nie wolno przepuścić (reguła „up to date”).
    r.git('checkout', '-q', 'audyt');
    r.zapisz('docs/notatka.md', 'nowsza notatka w audyt\n');
    r.git('commit', '-q', '-am', 'nowszy audyt');
    r.git('checkout', '-q', 'agent/watek');
    const zaGalezia = uruchomKrokCI(klonGaleziPR(r, 'agent/watek'), 'origin/audyt');
    expect(zaGalezia.status, bezPolecen(zaGalezia)).toBe(1);
    expect(zaGalezia.stdout).toContain('UWAGA: gałąź nie zawiera origin/audyt');
  });

  it('BŁĄD planu (usunięty historyczny wpis precache) dostaje osobną adnotację do ręcznej poprawki', () => {
    const r = repo();
    r.zapisz('service-worker-kalorii.js', r.czytaj('service-worker-kalorii.js').replace("  '/silnik.js?v=2',\n", ''));
    r.git('commit', '-q', '-am', 'konflikt w SW rozwiązany stroną wątku');
    const krok = uruchomKrokCI(klonScaleniaPR(r, 'agent/watek'));
    expect(krok.status, bezPolecen(krok)).toBe(1);
    expect(krok.stdout).toMatch(/^::error title=Błąd wersji do ręcznej poprawki::usunięto historyczny wpis precache '\/silnik\.js\?v=2'/m);
    expect(krok.stdout).toContain('::error title=Wersje niespójne z audyt::');
  });

  it('„Do decyzji” (nieliczbowe ?v= ze zmienioną treścią) daje ostrzeżenie w podsumowaniu, lista pinów w testach — nie', () => {
    const r = repo();
    wAudyt(r, () => {
      r.zapisz('edu.css', '.edu { color: red; }\n');
      r.zapisz('app.html', r.czytaj('app.html').replace('<p>', '<link rel="stylesheet" href="edu.css?v=20261001a">\n<p>'));
    });
    r.zapisz('edu.css', '.edu { color: blue; }\n');
    r.podbij();
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'edu.css bez nowego tokenu');
    const krok = uruchomKrokCI(klonScaleniaPR(r, 'agent/watek'));
    expect(krok.status, bezPolecen(krok)).toBe(0);
    expect(krok.stdout).toMatch(/^::warning title=Wersje — do decyzji::edu\.css ma nieliczbowe \?v= \(20261001a\)/m);

    // Zwykłe podbicie pliku z pinem w teście: lista pinów zostaje w logu, bez ostrzeżenia.
    const r2 = repo();
    r2.zapisz('silnik.js', r2.czytaj('silnik.js').replace('silnikA = 1', 'silnikA = 2'));
    r2.podbij();
    r2.git('commit', '-q', '-am', 'silnik 4');
    const zwykly = uruchomKrokCI(klonScaleniaPR(r2, 'agent/watek'));
    expect(zwykly.status, bezPolecen(zwykly)).toBe(0);
    expect(zwykly.stdout).toContain('Do decyzji: pin wersji w teście');
    expect(zwykly.stdout).not.toMatch(/^::warning/m);
  });

  it('PR bez zmian w zasobach przechodzi, a bez rodzica commita scalenia (fetch-depth 1) krok pada zamiast przejść', () => {
    const r = repo();
    r.zapisz('docs/notatka.md', 'notatka 2\n');
    r.git('commit', '-q', '-am', 'tylko dokumentacja');
    const zielony = uruchomKrokCI(klonScaleniaPR(r, 'agent/watek'));
    expect(zielony.status, bezPolecen(zielony)).toBe(0);
    expect(zielony.stdout).not.toMatch(/^::error/m);
    const bezRodzica = uruchomKrokCI(klonScaleniaPR(r, 'agent/watek', 1));
    expect(bezRodzica.status).toBe(2);
    expect(bezRodzica.stdout).toContain('nie ma rewizji bazowej HEAD^1');
    expect(bezRodzica.stdout).toContain('::error title=Nie policzono wersji::');
  });
});

describe('P-WATKI: skrypt rozumie prawdziwe repozytorium', () => {
  it('prawdziwy service worker i strony dają się przeliczyć względem HEAD', () => {
    const p = zaplanuj({ katalog: korzen, baza: 'HEAD' });
    expect(p.baza.sw).toMatch(/^\d+\.\d+\.\d+$/);
    expect(p.bledy).toEqual([]);
  });

  it('CLI: --pomoc opisuje użycie, nieznana opcja kończy się kodem 2', () => {
    const skrypt = path.join(korzen, 'tests/scripts/podbij-wersje.mjs');
    const pomoc = spawnSync(process.execPath, [skrypt, '--pomoc'], { encoding: 'utf8' });
    expect(pomoc.status).toBe(0);
    expect(pomoc.stdout).toContain('npm run podbij-wersje');
    const zla = spawnSync(process.execPath, [skrypt, '--zapis'], { encoding: 'utf8' });
    expect(zla.status).toBe(2);
    expect(zla.stderr).toContain('nieznane opcje: --zapis');
  });
});
