import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
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
  '/ladowacz.js?v=7',
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
};

const SRODOWISKO = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
};

function repo() {
  const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'podbij-wersje-'));
  const git = (...a) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...a], { cwd: katalog, encoding: 'utf8', env: SRODOWISKO, stdio: ['ignore', 'pipe', 'pipe'] });
  const zapisz = (p, t) => {
    fs.mkdirSync(path.dirname(path.join(katalog, p)), { recursive: true });
    fs.writeFileSync(path.join(katalog, p), t);
  };
  const czytaj = (p) => fs.readFileSync(path.join(katalog, p), 'utf8');
  for (const [p, t] of Object.entries(PLIKI)) zapisz(p, t);
  zapisz('tests/fixtures/wersje-zasobow.json', `${JSON.stringify(biezaceWersje(katalog), null, 1)}\n`);
  git('init', '-q');
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
    expect(p.pliki).toEqual([{ plik: 'silnik.js', vBazy: 3, vPrzed: 3, cel: 4, zmieniony: true }]);
    expect(r.czytaj('index.html')).toContain('<script src="silnik.js?v=4">');
    expect(r.czytaj('app.html')).toContain('<script src="silnik.js?v=4">');
    expect(r.czytaj('vilda_smoke_tests.js')).toContain("'silnik.js?v=4'");
    const sw = r.czytaj('service-worker-kalorii.js');
    expect(sw).toContain("  '/silnik.js?v=3',\n  '/silnik.js?v=4',\n  '/ladowacz.js?v=7',");
    expect(wersjaSW(sw)).toBe('1.1.11');
    expect(r.czytaj('tests/unit/klirens-ui-model.test.mjs')).toContain("const SW_VERSION = '1.1.11'");
    expect(stan(r)['silnik.js'].v).toBe(4);
    expect(stan(r)).toEqual(biezaceWersje(r.katalog));
    // Pin wersji pliku w teście nie jest zmieniany, tylko zgłaszany.
    expect(r.czytaj('tests/unit/klirens-ui-model.test.mjs')).toContain("'silnik.js?v=3'");
    expect(p.testyDoSprawdzenia.join('\n')).toContain('tests/unit/klirens-ui-model.test.mjs:2: silnik.js?v=3 (teraz 4)');
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
    expect(sw).toContain("  '/ladowacz.js?v=7',\n  '/ladowacz.js?v=8',\n];");
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

  it('brak rewizji bazowej daje zrozumiały błąd', () => {
    const r = repo();
    expect(() => zaplanuj({ katalog: r.katalog, baza: 'origin/audyt' })).toThrow(/git fetch origin audyt/);
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
