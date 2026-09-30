import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { czyZrodloWersji, korzen, skanujWersje, WZGLEDNY_PLIK_STANU, WZORZEC_WERSJI } from './wersje-zasobow.mjs';

// P-WATKI (zlecenie właściciela 2026-09-30): kilka wątków pracuje naraz i każdy PR podbijał te same linie —
// `SW_VERSION`, `?v=` na stronach, wpisy precache, pin w teście Klirensu i tests/fixtures/wersje-zasobow.json.
// Dwa wątki brały ten sam „następny numer”, więc drugi PR zawsze wpadał w konflikt, a gorzej: po scaleniu
// obie zmiany jednego pliku mogły zostać pod JEDNYM ?v=, które klient z zainstalowaną aplikacją ma już
// w pamięci z treścią tylko pierwszej (service worker trzyma wpisy ?v= jako niezmienne, P-SW rata 1).
//
// Ten moduł wylicza wersje WYŁĄCZNIE z dwóch rzeczy: z gałęzi bazowej (domyślnie origin/audyt) i z treści
// plików w drzewie roboczym. Plik o treści innej niż w bazie (tokeny ?v= innych plików liczone jak w bazie)
// dostaje ?v= o jeden większe niż najwyższe ?v= tego pliku w bazie — na stronach i w tablicach SW; plik
// niezmieniony — wersję z bazy. Skrypt, który wstrzykuje plik z nowym ?v=, zmienia przez to treść i też
// dostaje nowe ?v=. SW_VERSION = wersja z bazy + 1, jeżeli zmienił się jakikolwiek zasób z pamięci service
// workera (albo sam SW), inaczej wersja z bazy. Wynik nie zależy od tego, co wątek wpisał wcześniej, więc
// konflikt w liniach wersji rozwiązuje się mechanicznie, a potem skrypt uruchamia się ponownie
// (npm run podbij-wersje). Procedura: docs/GITHUB_WORKFLOW.md, „Kilka wątków naraz”.
//
// Granice (celowo): wpisy precache obecne w bazie są nietykalne (append-only, AGENTS.md § 6) — ich brak jest
// błędem; skrypt dopisuje i poprawia tylko wpisy plików znanych z bazy, dodane na tej gałęzi. Nowego pliku
// ani nowej strony nie dopisuje do tablic SW (wybór tablicy należy do autora) i nie zmienia pinów wersji
// w testach poza pinem SW_VERSION — zgłasza je. Wersje nieliczbowe (np. edu-video-ui.css?v=20261003v4)
// zostają ręczne.

export const DOMYSLNA_BAZA = 'origin/audyt';
export const PLIK_SW = 'service-worker-kalorii.js';
const LINIA_SW_VERSION = /^const SW_VERSION = '(\d+)\.(\d+)\.(\d+)';\r?$/m;
// Jeden wpis w linii; ostatni element tablicy nie ma przecinka, a po wpisie może stać komentarz.
const WPIS_PRECACHE = /^(\s*)'\/([A-Za-z0-9_./-]+)\?v=(\d+)'(,?)[ \t]*(?:\/\/.*)?\r?$/;
// Pliki z pinem SW_VERSION — ta sama lista, której pilnuje tests/unit/piny-wersji.test.mjs. Jawna, bo tekst
// „const SW_VERSION = '…'” występuje w testach także jako treść syntetycznych service workerów.
export const PINY_SW = ['tests/unit/klirens-ui-model.test.mjs'];
const PIN_SW = /(const SW_VERSION = ')(\d+\.\d+\.\d+)(')/g;
const SCIEZKA_W_SW = /'\/([A-Za-z0-9_./-]+?)(?:\?[^'\s]*)?'/g;
const TOKEN_DOWOLNY = /(['"])([A-Za-z0-9_./-]+\.(?:js|css|mjs))\?v=([A-Za-z0-9._-]+)\1/g;
const ZNACZNIK_KONFLIKTU = /^(?:<{7}|>{7})(?: |\r?$)/m;
const TEKSTOWY = /\.(?:html|js|mjs|css|json|txt|svg|xml|webmanifest)$/i;

const skrot = (bufor) => crypto.createHash('sha256').update(bufor).digest('hex');
const normalizuj = (sciezka) => sciezka.replace(/^\.?\//, '');

function git(katalog, argumenty) {
  return execFileSync('git', argumenty, { cwd: katalog, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
}

function gitProbuj(katalog, argumenty) {
  try {
    return git(katalog, argumenty);
  } catch {
    return null;
  }
}

/** Treści plików z rewizji jednym wywołaniem `git cat-file --batch` (Buffer albo null dla braku). */
function czytajZRewizji(katalog, rewizja, sciezki) {
  const wynik = new Map();
  if (!sciezki.length) return wynik;
  const r = spawnSync('git', ['cat-file', '--batch'], {
    cwd: katalog,
    input: sciezki.map((p) => `${rewizja}:${p}\n`).join(''),
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`git cat-file nie powiódł się: ${String(r.stderr || '').trim()}`);
  const bufor = r.stdout;
  let poz = 0;
  for (const p of sciezki) {
    const konie = bufor.indexOf(0x0a, poz);
    const naglowek = bufor.toString('utf8', poz, konie);
    poz = konie + 1;
    if (/ (?:missing|ambiguous)$/.test(naglowek)) {
      wynik.set(p, null);
      continue;
    }
    const [, typ, rozmiar] = naglowek.split(' ');
    const n = Number(rozmiar);
    wynik.set(p, typ === 'blob' ? bufor.subarray(poz, poz + n) : null);
    poz += n + 1;
  }
  return wynik;
}

/** Pliki z korzenia, które git śledzi albo mógłby śledzić — bez ignorowanych (makiety, ._* z macOS). */
function plikiKorzenia(katalog) {
  const lista = git(katalog, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0');
  return [...new Set(lista.filter((p) => p && !p.includes('/')))]
    .filter((p) => {
      const abs = path.join(katalog, p);
      return fs.existsSync(abs) && fs.statSync(abs).isFile();
    })
    .sort();
}

function plikiTestow(katalog) {
  const out = [];
  const odwiedz = (wzgledny) => {
    const bezwzgledny = path.join(katalog, wzgledny);
    if (!fs.existsSync(bezwzgledny)) return;
    for (const d of fs.readdirSync(bezwzgledny, { withFileTypes: true })) {
      const p = path.posix.join(wzgledny, d.name);
      if (d.isDirectory()) odwiedz(p);
      else if (/\.(?:mjs|js|html)$/.test(d.name)) out.push(p);
    }
  };
  odwiedz('tests');
  return out.sort();
}

function wersjaSW(tekst, skad) {
  const m = LINIA_SW_VERSION.exec(tekst || '');
  if (!m) throw new Error(`nie znaleziono linii „const SW_VERSION = 'x.y.z';” w ${PLIK_SW} (${skad})`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const tekstWersji = (w) => w.join('.');
const skrocListe = (lista, ile = 6) => (lista.length > ile ? `${lista.slice(0, ile).join(', ')} i ${lista.length - ile} innych` : lista.join(', '));

function wpisyPrecache(tekst) {
  const out = [];
  tekst.split('\n').forEach((linia, nr) => {
    const m = WPIS_PRECACHE.exec(linia);
    if (m) {
      out.push({
        nr, wciecie: m[1], plik: m[2], v: Number(m[3]), klucz: `${m[2]}?v=${m[3]}`,
        przecinek: m[4] === ',', cr: linia.endsWith('\r') ? '\r' : '',
      });
    }
  });
  return out;
}

function sciezkiSW(tekst) {
  return new Set([...tekst.matchAll(SCIEZKA_W_SW)].map((m) => m[1]));
}

/**
 * Czy gałąź bazowa jest w historii bieżącej gałęzi (albo w scalanej właśnie rewizji — w trakcie `git merge`
 * HEAD to jeszcze stara głowa gałęzi, a baza siedzi w MERGE_HEAD).
 */
function bazaWHistorii(katalog, rewizja) {
  const przodek = (kto) => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', rewizja, kto], { cwd: katalog, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };
  if (przodek('HEAD')) return true;
  return gitProbuj(katalog, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']) !== null && przodek('MERGE_HEAD');
}

/**
 * Porównuje lokalną referencję origin/<gałąź> z serwerem (`git ls-remote`). Zwraca
 * { sprawdzono: false, powod } bez sieci albo dla bazy spoza origin/, inaczej { sprawdzono: true, aktualna, lokalnie, zdalnie }.
 */
export function sprawdzSwiezoscBazy({ katalog = korzen, baza = DOMYSLNA_BAZA } = {}) {
  const m = /^origin\/(.+)$/.exec(baza);
  if (!m) return { sprawdzono: false, powod: `baza ${baza} nie jest gałęzią origin/…` };
  const lokalnie = gitProbuj(katalog, ['rev-parse', '--verify', '--quiet', `${baza}^{commit}`]);
  let wyjscie;
  try {
    wyjscie = execFileSync('git', ['ls-remote', 'origin', `refs/heads/${m[1]}`], {
      cwd: katalog, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000,
    }).trim();
  } catch {
    return { sprawdzono: false, powod: 'git ls-remote nie odpowiedział (brak sieci?)' };
  }
  const zdalnie = wyjscie.split(/\s+/)[0] || null;
  if (!zdalnie) return { sprawdzono: false, powod: `na serwerze nie ma gałęzi ${m[1]}` };
  return { sprawdzono: true, aktualna: zdalnie === lokalnie, lokalnie, zdalnie };
}


function tokenyNieliczbowe(teksty) {
  const out = new Map();
  for (const t of teksty) {
    if (!t) continue;
    for (const m of t.toString('utf8').matchAll(TOKEN_DOWOLNY)) {
      if (/^\d+$/.test(m[3])) continue;
      const p = normalizuj(m[2]);
      if (!out.has(p)) out.set(p, new Set());
      out.get(p).add(m[3]);
    }
  }
  return out;
}

/** Ustawia tokeny ?v= plików, dla których wersjaDla(plik) zwraca liczbę; pozostałe zostawia. */
function ustawTokeny(tekst, wersjaDla) {
  return tekst.replace(new RegExp(WZORZEC_WERSJI.source, 'g'), (cale, cudzyslow, sciezka, v) => {
    const w = wersjaDla(normalizuj(sciezka));
    return w === undefined || Number(v) === w ? cale : `${cudzyslow}${sciezka}?v=${w}${cudzyslow}`;
  });
}

/**
 * Wylicza wszystkie zmiany bez zapisu. Rzuca błąd, gdy nie da się liczyć (brak bazy, znaczniki konfliktu,
 * zły format SW). Problemy, które wymagają ręcznej decyzji, trafiają do `bledy` i `ostrzezenia`.
 */
export function zaplanuj({ katalog = korzen, baza = DOMYSLNA_BAZA } = {}) {
  const rewizja = gitProbuj(katalog, ['rev-parse', '--verify', '--quiet', `${baza}^{commit}`]);
  if (!rewizja) throw new Error(`nie ma rewizji bazowej ${baza} — najpierw: git fetch origin audyt`);
  // Skrypt porównuje bajty drzewa roboczego z blobami bazy; konwersja końców linii by to zafałszowała.
  if (gitProbuj(katalog, ['config', '--get', 'core.autocrlf']) === 'true'
    || !git(katalog, ['check-attr', 'text', 'eol', 'filter', '--', PLIK_SW]).split('\n').every((l) => l.endsWith(': unspecified'))) {
    throw new Error('ta kopia konwertuje końce linii (core.autocrlf=true albo atrybuty text/eol/filter) — ' +
      'skrypt porównuje bajty z bazą i nie policzy tego wiarygodnie; ustaw: git config core.autocrlf false');
  }
  const nierozwiazane = [...new Set(git(katalog, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean))]
    .filter((p) => p !== WZGLEDNY_PLIK_STANU);
  if (nierozwiazane.length) {
    throw new Error(`scalanie ma nierozwiązane pliki — rozwiąż je i oznacz (git add), potem uruchom ponownie:\n  ${nierozwiazane.join('\n  ')}`);
  }

  // --- drzewo robocze (treści w pamięci; pliki zmienia dopiero zastosuj()) ---
  const oryginaly = new Map();
  const tresci = new Map();
  const czytaj = (p) => {
    if (!tresci.has(p)) {
      const abs = path.join(katalog, p);
      const buf = fs.existsSync(abs) && fs.statSync(abs).isFile() ? fs.readFileSync(abs) : null;
      oryginaly.set(p, buf);
      tresci.set(p, buf);
    }
    return tresci.get(p);
  };
  const ustaw = (p, tekst) => {
    czytaj(p);
    tresci.set(p, Buffer.from(tekst, 'utf8'));
  };
  const istniejeTeraz = (p) => czytaj(p) !== null;

  const korzenTeraz = plikiKorzenia(katalog);
  const zrodlaTeraz = korzenTeraz.filter(czyZrodloWersji);
  // Tokeny ?v= przepisujemy w każdej stronie i każdym skrypcie z korzenia — także w vilda_smoke_tests.js
  // (EXPECTED_BROWSER_SCRIPTS musi mówić to samo co index.html, P-PINY-WERSJI). Service worker osobno.
  const doPrzepisania = korzenTeraz.filter((f) => (f.endsWith('.html') || f.endsWith('.js')) && f !== PLIK_SW);
  const doPrzepisaniaZbior = new Set(doPrzepisania);
  const pinyTestow = PINY_SW.filter(istniejeTeraz);

  // --- baza ---
  const drzewoBazy = new Set(git(katalog, ['ls-tree', '-r', '-z', '--name-only', rewizja]).split('\0').filter(Boolean));
  const zrodlaBazy = [...drzewoBazy].filter((p) => !p.includes('/') && czyZrodloWersji(p)).sort();
  const odczyt1 = czytajZRewizji(katalog, rewizja, [...zrodlaBazy, PLIK_SW]);
  const wersjeBazy = skanujWersje(zrodlaBazy, (p) => odczyt1.get(p), (p) => drzewoBazy.has(p));
  const nieliczboweBazy = tokenyNieliczbowe(zrodlaBazy.map((p) => odczyt1.get(p)));
  const swBazy = odczyt1.get(PLIK_SW)?.toString('utf8');
  if (!swBazy) throw new Error(`w ${baza} nie ma ${PLIK_SW}`);
  const wersjaSWBazy = wersjaSW(swBazy, baza);
  const wpisyBazy = wpisyPrecache(swBazy);
  const liczBazy = new Map();
  const maksWSWBazy = new Map();
  for (const w of wpisyBazy) {
    liczBazy.set(w.klucz, (liczBazy.get(w.klucz) || 0) + 1);
    maksWSWBazy.set(w.plik, Math.max(maksWSWBazy.get(w.plik) || 0, w.v));
  }

  const wersjePrzed = skanujWersje(zrodlaTeraz, czytaj, istniejeTeraz);
  const nieliczboweTeraz = tokenyNieliczbowe(zrodlaTeraz.map(czytaj));
  const swTeraz = czytaj(PLIK_SW)?.toString('utf8');
  if (!swTeraz) throw new Error(`w drzewie roboczym nie ma ${PLIK_SW}`);
  const wersjaSWPrzed = wersjaSW(swTeraz, 'drzewo robocze');

  const zasobyPamieci = new Set([
    ...sciezkiSW(swBazy), ...sciezkiSW(swTeraz),
    ...[...drzewoBazy].filter((p) => !p.includes('/') && p.endsWith('.html')),
    ...korzenTeraz.filter((p) => p.endsWith('.html')),
  ]);
  zasobyPamieci.delete(PLIK_SW);

  // --- znaczniki konfliktu we wszystkim, co skrypt przepisuje albo porównuje z bazą (stan wersji skrypt
  // przepisuje w całości, więc tam znaczniki nie przeszkadzają) ---
  const sprawdzane = new Set([
    ...doPrzepisania, PLIK_SW, ...pinyTestow, ...wersjePrzed.keys(), ...nieliczboweTeraz.keys(),
    ...[...zasobyPamieci].filter((p) => TEKSTOWY.test(p)),
  ]);
  const zKonfliktem = [...sprawdzane].filter((p) => {
    const buf = istniejeTeraz(p) ? czytaj(p) : null;
    return buf && ZNACZNIK_KONFLIKTU.test(buf.toString('utf8'));
  }).sort();
  if (zKonfliktem.length) {
    throw new Error(
      'pliki mają nierozwiązane znaczniki konfliktu — rozwiąż je najpierw (tabela w docs/GITHUB_WORKFLOW.md, ' +
      `„Kilka wątków naraz”), potem uruchom ponownie:\n  ${zKonfliktem.join('\n  ')}`,
    );
  }
  for (const p of doPrzepisania) {
    const buf = czytaj(p);
    if (!Buffer.from(buf.toString('utf8'), 'utf8').equals(buf)) throw new Error(`${p} nie jest poprawnym UTF-8 — skrypt go nie przepisze`);
  }

  const potrzebneZBazy = [...new Set([...wersjeBazy.keys(), ...wersjePrzed.keys(), ...nieliczboweTeraz.keys(), ...zasobyPamieci])]
    .filter((p) => drzewoBazy.has(p));
  const odczyt2 = czytajZRewizji(katalog, rewizja, potrzebneZBazy);
  const skrotBazy = (p) => {
    const buf = odczyt2.get(p);
    return buf ? skrot(buf) : null;
  };

  // --- wersje: najmniejszy punkt stały ---
  // Plik zarządzany = ładowany z liczbowym ?v= i teraz, i w bazie. Zmieniony „sam z siebie”: treść różna od
  // bazy po ustawieniu tokenów plików zarządzanych na wersje z bazy — dzięki temu wynik nie zależy od numerów
  // wpisanych wcześniej (także przy skryptach, które wstrzykują się nawzajem). Potem propagacja: skrypt, który
  // wstrzykuje plik zmieniony, dostaje nowy token, więc też się zmienia.
  const zarzadzane = [...wersjePrzed.keys()].filter((p) => wersjeBazy.has(p)).sort();
  const zarzadzaneZbior = new Set(zarzadzane);
  const wersjaBazyDla = (p) => (zarzadzaneZbior.has(p) ? wersjeBazy.get(p) : undefined);
  const zmienioneSame = new Set();
  const odwolania = new Map();
  for (const p of zarzadzane) {
    const buf = czytaj(p);
    const tekstowy = doPrzepisaniaZbior.has(p);
    const znormalizowana = tekstowy ? Buffer.from(ustawTokeny(buf.toString('utf8'), wersjaBazyDla), 'utf8') : buf;
    if (skrot(znormalizowana) !== skrotBazy(p)) zmienioneSame.add(p);
    if (tekstowy) {
      const cele = [...buf.toString('utf8').matchAll(new RegExp(WZORZEC_WERSJI.source, 'g'))]
        .map((m) => normalizuj(m[2]))
        .filter((q) => q !== p && zarzadzaneZbior.has(q));
      if (cele.length) odwolania.set(p, new Set(cele));
    }
  }
  const zmienione = new Set(zmienioneSame);
  for (let zmiana = true; zmiana;) {
    zmiana = false;
    for (const [p, cele] of odwolania) {
      if (!zmienione.has(p) && [...cele].some((q) => zmienione.has(q))) {
        zmienione.add(p);
        zmiana = true;
      }
    }
  }
  const cele = new Map();
  for (const p of zarzadzane) {
    const vBazy = wersjeBazy.get(p);
    const zmieniony = zmienione.has(p);
    // Najwyższe ?v= w bazie liczy też tablice SW: klucz ?v= z precache bazy klient może już mieć w pamięci.
    const najwyzsza = Math.max(vBazy, maksWSWBazy.get(p) || 0);
    cele.set(p, {
      vBazy, cel: zmieniony ? najwyzsza + 1 : vBazy, zmieniony,
      przezWstrzykniecie: zmieniony && !zmienioneSame.has(p), zHistoriiSW: zmieniony && najwyzsza > vBazy ? najwyzsza : null,
    });
  }
  for (const f of doPrzepisania) {
    const stara = czytaj(f).toString('utf8');
    const nowa = ustawTokeny(stara, (p) => cele.get(p)?.cel);
    if (nowa !== stara) ustaw(f, nowa);
  }
  for (const [p, c] of cele) {
    if ((skrot(czytaj(p)) !== skrotBazy(p)) !== c.zmieniony) throw new Error(`niespójna wersja ${p} — zgłoś to jako błąd skryptu`);
  }
  const wersjePo = skanujWersje(zrodlaTeraz, czytaj, istniejeTeraz);

  const bledy = [];
  const ostrzezenia = [];

  // --- wpisy precache ---
  const wpisyTeraz = wpisyPrecache(swTeraz);
  const liczTeraz = new Map();
  for (const w of wpisyTeraz) liczTeraz.set(w.klucz, (liczTeraz.get(w.klucz) || 0) + 1);
  for (const [klucz, ile] of liczBazy) {
    if ((liczTeraz.get(klucz) || 0) < ile) {
      bledy.push(`usunięto historyczny wpis precache '/${klucz}' obecny w ${baza} (append-only, AGENTS.md § 6) — przywróć go`);
    }
  }

  const linie = swTeraz.split('\n');
  const doUsuniecia = new Set();
  const zamienione = new Map(); // numer linii → nowa treść (przecinek po dawnym ostatnim elemencie)
  const doWstawienia = new Map(); // numer linii → linie wstawiane PO niej
  const dodane = [];
  const usuniete = [];
  // Korekta obejmuje pliki ładowane teraz i pliki znane z bazy, którym ta gałąź dopisała wpis (np. plik,
  // którego strony już nie ładują). Wpisy nowych plików należą do autora.
  const doKorekty = new Set([
    ...cele.keys(),
    ...wpisyTeraz.filter((w) => wersjeBazy.has(w.plik) && !liczBazy.has(w.klucz)).map((w) => w.plik),
  ]);
  for (const plik of [...doKorekty].sort()) {
    const c = cele.get(plik);
    const kluczCelu = c ? `${plik}?v=${c.cel}` : null;
    // Wpis bieżącej wersji jest dozwolony także dla pliku bez zmian — tak dopisuje się brakujący wpis
    // (P-SW-LAB-PIN: lab_pin_result.js?v=4).
    const dozwolone = (klucz) => (liczBazy.get(klucz) || 0) + (klucz === kluczCelu && !liczBazy.has(klucz) ? 1 : 0);
    const wlasne = wpisyTeraz.filter((w) => w.plik === plik);
    const widziane = new Map();
    for (const w of wlasne) {
      const ile = (widziane.get(w.klucz) || 0) + 1;
      widziane.set(w.klucz, ile);
      if (ile > dozwolone(w.klucz)) {
        doUsuniecia.add(w.nr);
        usuniete.push(`'/${w.klucz}'`);
      }
    }
    if (!c) continue;
    const pozostale = wlasne.filter((w) => !doUsuniecia.has(w.nr));
    if (pozostale.some((w) => w.klucz === kluczCelu)) continue;
    if (c.cel === c.vBazy) {
      if (pozostale.length) ostrzezenia.push(`bieżąca wersja '/${kluczCelu}' nie ma wpisu w tablicach ${PLIK_SW} (tak było już w bazie)`);
      continue;
    }
    if (!pozostale.length) {
      ostrzezenia.push(`${plik}: brak jakiegokolwiek wpisu w tablicach ${PLIK_SW} — dopisz '/${kluczCelu}' ręcznie albo uzasadnij pominięcie`);
      continue;
    }
    const po = pozostale.reduce((a, b) => (b.v >= a.v ? b : a));
    if (!doWstawienia.has(po.nr)) doWstawienia.set(po.nr, []);
    if (po.przecinek) {
      doWstawienia.get(po.nr).push(`${po.wciecie}'/${kluczCelu}',${po.cr}`);
    } else {
      zamienione.set(po.nr, (zamienione.get(po.nr) ?? linie[po.nr]).replace(`'/${po.klucz}'`, `'/${po.klucz}',`));
      doWstawienia.get(po.nr).push(`${po.wciecie}'/${kluczCelu}'${po.cr}`);
    }
    dodane.push(`'/${kluczCelu}' (po '/${po.klucz}')`);
  }
  const noweLinie = [];
  linie.forEach((linia, nr) => {
    if (!doUsuniecia.has(nr)) noweLinie.push(zamienione.get(nr) ?? linia);
    if (doWstawienia.has(nr)) noweLinie.push(...doWstawienia.get(nr));
  });
  let noweSW = noweLinie.join('\n');

  // --- pliki spoza bazy ---
  for (const plik of [...wersjePo.keys()].filter((p) => !wersjeBazy.has(p)).sort()) {
    const v = wersjePo.get(plik);
    const maks = maksWSWBazy.get(plik);
    if (maks !== undefined && v <= maks && skrot(czytaj(plik)) !== skrotBazy(plik)) {
      bledy.push(`${plik}?v=${v}: precache bazy ma już ten plik do ?v=${maks} z inną treścią — nadaj ?v=${maks + 1} lub wyższe`);
    }
    if (!wpisyTeraz.some((w) => w.plik === plik)) {
      ostrzezenia.push(`nowy plik ${plik}?v=${v} nie ma wpisu w tablicach ${PLIK_SW} — dopisz go do CORE_SHELL_URLS albo OPTIONAL_ASSETS`);
    }
  }
  const sciezkiNowegoSW = sciezkiSW(noweSW);
  for (const strona of korzenTeraz.filter((p) => p.endsWith('.html') && !drzewoBazy.has(p) && !sciezkiNowegoSW.has(p))) {
    ostrzezenia.push(`nowa strona ${strona} nie jest w tablicach ${PLIK_SW} — dopisz ją do OPTIONAL_DOCUMENTS albo uzasadnij pominięcie`);
  }
  for (const [plik, zestaw] of [...nieliczboweTeraz].sort(([a], [b]) => a.localeCompare(b))) {
    if (!drzewoBazy.has(plik) || !istniejeTeraz(plik) || skrot(czytaj(plik)) === skrotBazy(plik)) continue;
    const wBazie = nieliczboweBazy.get(plik) || new Set();
    if (zestaw.size === wBazie.size && [...zestaw].every((v) => wBazie.has(v))) {
      ostrzezenia.push(`${plik} ma nieliczbowe ?v= (${[...zestaw].join(', ')}) i zmienioną treść — podbij jego wersję ręcznie na stronach i w precache`);
    }
  }

  // --- SW_VERSION ---
  const dodaneKlucze = new Set([...cele].filter(([, c]) => c.cel !== c.vBazy).map(([p, c]) => `${p}?v=${c.cel}`)
    .filter((k) => !liczBazy.has(k)));
  const bezWersji = (tekst) => tekst.split('\n')
    .filter((l) => {
      const m = WPIS_PRECACHE.exec(l);
      return !(m && dodaneKlucze.has(`${m[2]}?v=${m[3]}`));
    })
    .map((l) => l.replace(/^(\s*'\/[A-Za-z0-9_./-]+\?v=\d+'),/, '$1'))
    .join('\n')
    .replace(LINIA_SW_VERSION, "const SW_VERSION = '#';");
  const podbite = [...cele].filter(([, c]) => c.cel !== c.vBazy).map(([plik]) => plik);
  const zmienioneZasoby = [...zasobyPamieci]
    .filter((p) => (drzewoBazy.has(p) ? skrotBazy(p) : null) !== (istniejeTeraz(p) ? skrot(czytaj(p)) : null))
    .sort();
  const swInaczej = bezWersji(swBazy) !== bezWersji(noweSW);
  const powody = [];
  if (podbite.length) powody.push(`podbite ?v=: ${podbite.length}`);
  const zmienioneBezPodbic = zmienioneZasoby.filter((p) => !podbite.includes(p));
  if (zmienioneBezPodbic.length) powody.push(`zmienione zasoby z pamięci SW: ${skrocListe(zmienioneBezPodbic)}`);
  if (swInaczej) powody.push(`zmieniony sam ${PLIK_SW}`);
  const celSW = powody.length ? [wersjaSWBazy[0], wersjaSWBazy[1], wersjaSWBazy[2] + 1] : wersjaSWBazy;
  noweSW = noweSW.replace(LINIA_SW_VERSION, (linia) => linia.replace(/'[^']+'/, `'${tekstWersji(celSW)}'`));
  if (noweSW !== swTeraz) ustaw(PLIK_SW, noweSW);

  for (const p of pinyTestow) {
    const stara = czytaj(p).toString('utf8');
    const nowa = stara.replace(PIN_SW, (cale, a, _v, b) => `${a}${tekstWersji(celSW)}${b}`);
    if (nowa !== stara) ustaw(p, nowa);
  }

  // --- stan wersji (ten sam format co tests/scripts/wersje-zasobow.mjs --zapisz) ---
  const stan = {};
  for (const plik of [...wersjePo.keys()].sort()) stan[plik] = { v: wersjePo.get(plik), sha256: skrot(czytaj(plik)) };
  const stanTekst = `${JSON.stringify(stan, null, 1)}\n`;
  const stanPlik = czytaj(WZGLEDNY_PLIK_STANU);
  if (!stanPlik || stanPlik.toString('utf8') !== stanTekst) ustaw(WZGLEDNY_PLIK_STANU, stanTekst);

  // --- piny wersji plików w testach (zgłaszane, bez zmian): każdy token podbitego pliku od wersji z bazy
  // wzwyż, który nie jest nową wersją — niezależnie od tego, co było w drzewie przed uruchomieniem ---
  const testyDoSprawdzenia = [];
  const podbiteCele = new Map([...cele].filter(([, c]) => c.cel !== c.vBazy));
  if (podbiteCele.size) {
    for (const p of plikiTestow(katalog)) {
      czytaj(p).toString('utf8').split('\n').forEach((linia, i) => {
        for (const m of linia.matchAll(new RegExp(WZORZEC_WERSJI.source, 'g'))) {
          const c = podbiteCele.get(normalizuj(m[2]));
          if (c && Number(m[3]) >= c.vBazy && Number(m[3]) !== c.cel) testyDoSprawdzenia.push(`${p}:${i + 1}: ${normalizuj(m[2])}?v=${m[3]} (nowa wersja ${c.cel})`);
        }
      });
    }
  }

  const zmiany = new Map();
  for (const [p, buf] of tresci) {
    const org = oryginaly.get(p);
    if (buf && !(org && org.equals(buf))) zmiany.set(p, buf);
  }

  const pliki = [...cele]
    .map(([plik, c]) => ({
      plik, vBazy: c.vBazy, vPrzed: wersjePrzed.get(plik), cel: c.cel, zmieniony: c.zmieniony,
      przezWstrzykniecie: c.przezWstrzykniecie, zHistoriiSW: c.zHistoriiSW,
    }))
    .filter((w) => w.cel !== w.vBazy || w.vPrzed !== w.cel)
    .sort((a, b) => a.plik.localeCompare(b.plik));

  return {
    baza: { nazwa: baza, rewizja, sw: tekstWersji(wersjaSWBazy) },
    bazaWHistorii: bazaWHistorii(katalog, rewizja),
    pliki,
    sw: { przed: tekstWersji(wersjaSWPrzed), baza: tekstWersji(wersjaSWBazy), cel: tekstWersji(celSW), powody },
    precache: { dodane, usuniete },
    zmiany,
    bledy,
    ostrzezenia,
    testyDoSprawdzenia,
  };
}

/** Zapisuje wyliczone zmiany. */
export function zastosuj(plan, { katalog = korzen } = {}) {
  for (const [p, buf] of plan.zmiany) fs.writeFileSync(path.join(katalog, p), buf);
}

/** Czytelny raport planu (po polsku, do konsoli i do opisu PR). */
export function opiszPlan(plan) {
  const out = [];
  out.push(`Baza: ${plan.baza.nazwa} (${plan.baza.rewizja.slice(0, 7)}), SW ${plan.baza.sw}`);
  if (!plan.bazaWHistorii) out.push(`UWAGA: gałąź nie zawiera ${plan.baza.nazwa} — najpierw scal bazę (git merge ${plan.baza.nazwa}).`);
  if (plan.pliki.length) {
    out.push('Wersje plików:');
    for (const w of plan.pliki) {
      let opis = 'treść jak w bazie';
      if (w.zmieniony) opis = w.przezWstrzykniecie ? 'wstrzykuje plik z nowym ?v=' : 'treść zmieniona względem bazy';
      if (w.zHistoriiSW) opis += `; precache bazy ma już ?v=${w.zHistoriiSW}`;
      const przed = w.vPrzed === w.cel ? 'bez zmian' : `było ${w.vPrzed}`;
      out.push(`  ${w.plik}: baza ${w.vBazy} → ${w.cel} (${opis}; ${przed})`);
    }
  }
  const sw = plan.sw.przed === plan.sw.cel ? `bez zmian (${plan.sw.cel})` : `${plan.sw.przed} → ${plan.sw.cel}`;
  out.push(`SW_VERSION: ${sw}${plan.sw.powody.length ? ` — ${plan.sw.powody.join('; ')}` : ' — nic z pamięci SW się nie zmieniło'}`);
  for (const d of plan.precache.dodane) out.push(`  precache +${d}`);
  for (const u of plan.precache.usuniete) out.push(`  precache −${u} (dodany na tej gałęzi, zbędny)`);
  if (plan.zmiany.size) out.push(`Pliki do zapisu (${plan.zmiany.size}): ${[...plan.zmiany.keys()].join(', ')}`);
  else out.push('Nic do zmiany — wersje są spójne z bazą.');
  for (const b of plan.bledy) out.push(`BŁĄD: ${b}`);
  for (const o of plan.ostrzezenia) out.push(`Do decyzji: ${o}`);
  for (const t of plan.testyDoSprawdzenia) out.push(`Do decyzji: pin wersji w teście — ${t}`);
  const podbite = plan.pliki.filter((w) => w.cel !== w.vBazy).map((w) => `${w.plik} ${w.cel}`);
  if (podbite.length || plan.sw.cel !== plan.sw.baza) {
    out.push(`Do opisu PR: Wersje: ${podbite.length ? `${podbite.join(', ')}; ` : ''}SW ${plan.sw.baza} → ${plan.sw.cel}.`);
  }
  return out.join('\n');
}
