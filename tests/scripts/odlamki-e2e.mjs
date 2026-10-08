// E2E-ODŁAMKI: lista plików jednego odłamka CI, podział po zmierzonym czasie zamiast po liczbie
// testów (`--shard`). Logika i opis modelu: tests/support/odlamki-e2e.mjs.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PLIK_CZASOW,
  WZGLEDNY_PLIK_CZASOW,
  czasyZRaportow,
  korzen,
  plikiZRaportu,
  podziel,
  porownajZPlaywrightem,
  szacujCzasy,
  trescListy,
  uwagiDoRaportow,
  wczytajCzasy
} from '../support/odlamki-e2e.mjs';

const POMOC = `Użycie: node tests/scripts/odlamki-e2e.mjs <tryb>

  --odlamek=<k>/<n> --zapisz=<plik>
                  zapisuje listę plików odłamka k z n (dla playwright test --test-list=<plik>)
                  i sprawdza, że Playwright z tą listą widzi dokładnie te pliki i tyle testów
  --plan[=<n>]    pokazuje podział na n odłamków (domyślnie 3): pliki, testy, szacowany czas
  --czasy-z=<raport.json>[,<raport2.json>...]
                  odświeża ${WZGLEDNY_PLIK_CZASOW} z raportów JSON PEŁNYCH przebiegów, np.:
                    PLAYWRIGHT_WORKERS=4 PLAYWRIGHT_JSON_OUTPUT_NAME=raport.json \\
                      npx playwright test --reporter=json,dot
                  (4 workery jak na runnerze CI; kilka raportów = średnia)
  --pomoc         ten opis`;

const argumenty = process.argv.slice(2);
const opcja = (nazwa) => argumenty.find((a) => a === `--${nazwa}` || a.startsWith(`--${nazwa}=`));
const wartosc = (nazwa) => opcja(nazwa)?.split('=').slice(1).join('=');
const znane = ['odlamek', 'zapisz', 'plan', 'czasy-z', 'pomoc'];
if (opcja('pomoc') || argumenty.includes('-h') || argumenty.includes('--help')) {
  console.log(POMOC);
  process.exit(0);
}
const nieznane = argumenty.filter((a) => !znane.some((z) => a === `--${z}` || a.startsWith(`--${z}=`)));
if (nieznane.length || !argumenty.length) {
  console.error(`${nieznane.length ? `nieznane opcje: ${nieznane.join(' ')}\n\n` : ''}${POMOC}`);
  process.exit(2);
}

const CLI_PLAYWRIGHTA = path.join(korzen, 'node_modules/@playwright/test/cli.js');

/** `playwright test --list` z reporterem JSON zapisanym do pliku (raport ma kilkaset kB). */
function listaPlaywrighta(dodatkowe = []) {
  const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'odlamki-e2e-'));
  const wyjscie = path.join(katalog, 'lista.json');
  try {
    // PLAYWRIGHT_JSON_OUTPUT_FILE/DIR z otoczenia wygrałyby z naszym _NAME — raport poszedłby gdzie indziej.
    const env = { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: wyjscie };
    delete env.PLAYWRIGHT_JSON_OUTPUT_FILE;
    delete env.PLAYWRIGHT_JSON_OUTPUT_DIR;
    const wynik = spawnSync(process.execPath, [CLI_PLAYWRIGHTA, 'test', '--list', '--reporter=json', ...dodatkowe], {
      cwd: korzen,
      env,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000
    });
    if (wynik.status !== 0 || !fs.existsSync(wyjscie)) {
      const powod = wynik.error ? wynik.error.message : `kod ${wynik.status}`;
      throw new Error(`playwright test --list nie powiódł się (${powod})\n${wynik.stderr || wynik.stdout || ''}`);
    }
    const raport = JSON.parse(fs.readFileSync(wyjscie, 'utf8'));
    if (raport.errors?.length) {
      throw new Error(`playwright test --list zgłosił błędy:\n${raport.errors.map((e) => e.message).join('\n')}`);
    }
    return raport;
  } finally {
    fs.rmSync(katalog, { recursive: true, force: true });
  }
}

const min = (s) => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`;

function przydzial(liczba) {
  const pliki = plikiZRaportu(listaPlaywrighta());
  if (!pliki.length) throw new Error('Playwright nie widzi żadnego pliku testów');
  const czasy = wczytajCzasy();
  const zCzasami = szacujCzasy(pliki, czasy.pliki);
  return { odlamki: podziel(zCzasami, { odlamki: liczba }), zCzasami, czasy };
}

try {
  if (opcja('czasy-z')) {
    const raporty = wartosc('czasy-z').split(',').filter(Boolean).map((p) => JSON.parse(fs.readFileSync(path.resolve(p), 'utf8')));
    const { niepelne, nieudane } = uwagiDoRaportow(raporty);
    const opisz = (lista) => lista.slice(0, 10).map((t) => `  ${t.plik} › ${t.tytul} [${t.projekt}]: ${t.status}, ${t.sekundy} s`).join('\n') + (lista.length > 10 ? `\n  … i ${lista.length - 10} więcej` : '');
    if (niepelne.length) {
      throw new Error(`raport nie jest z pełnego przebiegu — ${niepelne.length} testów bez wyniku albo przerwanych (sumy plików byłyby ucięte):\n${opisz(niepelne)}`);
    }
    if (nieudane.length) {
      console.log(`Uwaga: ${nieudane.length} testów z nieudaną pierwszą próbą — ich czas wchodzi do tabeli (przekroczenie limitu zawyża plik o sam limit):\n${opisz(nieudane)}`);
    }
    const pliki = czasyZRaportow(raporty);
    const liczba = Object.keys(pliki).length;
    if (!liczba) throw new Error('raporty nie zawierają żadnego wykonanego testu (czy to raport z --list?)');
    const dane = {
      opis: 'E2E-ODŁAMKI: sekundy na plik e2e (pierwsza próba każdego testu, wszystkie projekty razem). Źródło podziału na odłamki CI — tests/support/odlamki-e2e.mjs. Odświeżenie: node tests/scripts/odlamki-e2e.mjs --pomoc.',
      zrodlo: `${raporty.length} raport(y) JSON pełnego przebiegu, Playwright ${raporty[0]?.config?.version || '?'}, ${new Date().toISOString().slice(0, 10)}`,
      pliki
    };
    fs.writeFileSync(PLIK_CZASOW, `${JSON.stringify(dane, null, 2)}\n`);
    const suma = Object.values(pliki).reduce((a, b) => a + b, 0);
    console.log(`Zapisano ${WZGLEDNY_PLIK_CZASOW}: ${liczba} plików, łącznie ${min(suma)} pracy workerów.`);
  } else if (opcja('plan')) {
    const liczba = Number(wartosc('plan') || 3);
    const { odlamki, zCzasami } = przydzial(liczba);
    const bezPomiaru = zCzasami.filter((p) => !p.zmierzony);
    odlamki.forEach((o, k) => {
      console.log(`odłamek ${k + 1}/${liczba}: ${o.pliki.length} plików, ${o.testy} testów, szacunek ${min(o.czas)} (suma ${min(o.suma)})`);
    });
    if (bezPomiaru.length) {
      console.log(`bez pomiaru (szacunek z liczby testów): ${bezPomiaru.map((p) => p.plik).join(', ')}`);
    }
  } else if (opcja('odlamek')) {
    const [k, n] = String(wartosc('odlamek')).split('/').map(Number);
    if (!Number.isInteger(k) || !Number.isInteger(n) || k < 1 || k > n) {
      throw new Error(`--odlamek oczekuje k/n z 1 ≤ k ≤ n, jest „${wartosc('odlamek')}”`);
    }
    const docelowy = wartosc('zapisz');
    if (!docelowy) throw new Error('--odlamek wymaga --zapisz=<plik>');
    const { odlamki, zCzasami } = przydzial(n);
    const odlamek = odlamki[k - 1];
    if (!odlamek.pliki.length) throw new Error(`odłamek ${k}/${n} wyszedł pusty — za mało plików na ${n} odłamki`);
    fs.writeFileSync(path.resolve(docelowy), trescListy(odlamek, { numer: k, liczba: n }));

    // Kontrola: Playwright z tą listą ma zobaczyć dokładnie te pliki i tyle testów. `--test-list`
    // z ścieżką, której nie rozpozna, daje po cichu 0 testów i zielony wynik — stąd sprawdzenie.
    const widziane = plikiZRaportu(listaPlaywrighta([`--test-list=${path.resolve(docelowy)}`]));
    const { zgodne, brak, nadmiar, testy } = porownajZPlaywrightem(odlamek, widziane);
    if (!zgodne) {
      throw new Error(`Playwright z listą ${docelowy} widzi co innego niż podział: brak [${brak.join(', ')}], nadmiar [${nadmiar.join(', ')}], testów ${testy} zamiast ${odlamek.testy}`);
    }

    const wszystkie = odlamki.reduce((s, o) => s + o.testy, 0);
    console.log(`Odłamek ${k}/${n}: ${odlamek.pliki.length} plików, ${odlamek.testy} z ${wszystkie} testów, szacunek ${min(odlamek.czas)}.`);
    console.log(`Szacunki wszystkich odłamków: ${odlamki.map((o, i) => `${i + 1}/${n} ${min(o.czas)}`).join(', ')}.`);
    const bezPomiaru = zCzasami.filter((p) => !p.zmierzony).length;
    if (bezPomiaru) console.log(`Pliki bez pomiaru w ${WZGLEDNY_PLIK_CZASOW}: ${bezPomiaru} (szacunek z liczby testów).`);
    console.log(odlamek.pliki.map((p) => `  ${p.plik}`).join('\n'));
  } else {
    console.error(POMOC);
    process.exit(2);
  }
} catch (blad) {
  console.error(`odlamki-e2e: ${blad.message}`);
  process.exit(1);
}
