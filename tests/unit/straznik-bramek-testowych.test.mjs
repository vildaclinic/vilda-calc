import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const testy = path.join(korzen, 'tests');

// STRAŻNIK FAŁSZYWYCH BRAMEK (2026-09-19, rozszerzony 2026-09-20).
//
// page.waitForFunction NIE CZEKA, gdy predykat oddaje `Promise`: `Promise` jest zawsze
// prawdziwy, więc bramka przepuszcza na pierwszym sprawdzeniu. Dotyczy to dwóch zapisów:
//
//   1. predykat ze słowem `async` (P-BRAMKI, #370);
//   2. predykat bez tego słowa, oddający `Promise` przez łańcuch `.then(…)` (P-BRAMKI-2,
//      PR #375 — i siedem kolejnych miejsc znalezionych w P-BRAMKI-3).
//
// Zmierzone (Chromium 1194, timeout 3000 ms): `() => Promise.resolve(false).then((v) => v)`
// przeszedł po 58 ms, `async () => false` po 3 ms, a synchroniczny `() => false` poprawnie
// doczekał timeoutu 3005 ms.
//
// Skutek pierwszego znaleziska widać było w pełnych przebiegach: test scalania duplikatów
// czytał rekord docelowy w połowie scalania i widział 1 wersję zamiast 4. Sam sejf był
// poprawny — mergePatients przepina wersje PRZED skasowaniem rekordu źródłowego.
//
// Czekanie na stan sejfu należy robić po stronie Node (tests/support/sejf-czekanie.mjs),
// gdzie `await` działa.
//
// UWAGA: `page.evaluate(… .then(…))` jest POPRAWNE — `evaluate` czeka na `Promise`.
// Strażnik pilnuje wyłącznie `waitForFunction`.

/** Wszystkie pliki .mjs w tests/ (rekurencyjnie). */
function plikiTestowe(katalog) {
  const out = [];
  for (const wpis of fs.readdirSync(katalog, { withFileTypes: true })) {
    const p = path.join(katalog, wpis.name);
    if (wpis.isDirectory()) out.push(...plikiTestowe(p));
    else if (wpis.name.endsWith('.mjs')) out.push(p);
  }
  return out;
}

/**
 * Źródło z wygaszonymi komentarzami (blokowymi i liniowymi), ale z zachowaną numeracją
 * wierszy: każdy znak komentarza zamieniony na spację, `\n` zostawione na miejscu.
 *
 * `bezKomentarzy` z tests/support/silnik-bmi.mjs zwija komentarz blokowy do JEDNEJ spacji.
 * Przy skanie wiersz po wierszu to wystarczało, ale wywołanie `waitForFunction` bywa łamane
 * na kilka wierszy, więc ten strażnik czyta cały plik naraz — i wtedy zjedzone `\n`
 * przesunęłyby zgłaszane numery wierszy.
 */
const wygaszoneKomentarze = (src) => String(src)
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])(\/\/[^\n]*)/gm, (_m, przed, kom) => przed + ' '.repeat(kom.length));

// Wzorce składane z kawałków, żeby ten plik nie łapał sam siebie — strażnik skanuje
// WSZYSTKIE pliki testowe, łącznie z własnym.
const WYWOLANIE = 'waitFor' + 'Function\\(';

// Predykat ze słowem `async`. `\s*` obejmuje też złamanie wiersza — wywołanie bywa
// zapisane jako `waitForFunction(\n  async (id) => …`.
const WZORZEC_ASYNC = new RegExp(WYWOLANIE + '\\s*' + 'async' + '\\b');

// Predykat oddający `Promise` przez `.then(`. Między nazwą wywołania a `.then(` wolno
// stać tylko ZBALANSOWANYM nawiasom (do dwóch poziomów zagnieżdżenia) — pierwszy nawias
// zamykający bez pary kończy dopasowanie. Dzięki temu wzorzec nie przeskakuje z jednej
// bramki do `page.evaluate(… .then(…))` stojącego niżej w pliku.
const ZBALANSOWANE = '(?:[^()]|\\((?:[^()]|\\([^()]*\\))*\\))*?';
const WZORZEC_THEN = new RegExp(WYWOLANIE + ZBALANSOWANE + '\\.' + 'then\\(');

/** Numery wierszy, w których wzorzec trafia w podane źródło. */
function trafienia(zrodlo, wzorzec) {
  const out = [];
  for (const m of zrodlo.matchAll(new RegExp(wzorzec.source, 'gs'))) {
    out.push(zrodlo.slice(0, m.index).split('\n').length);
  }
  return out;
}

/** Skan wszystkich plików testowych jednym wzorcem — lista `ścieżka:wiersz`. */
function skanTestow(wzorzec) {
  const pliki = plikiTestowe(testy);
  expect(pliki.length, 'skaner znalazł pliki testowe').toBeGreaterThan(50);
  const out = [];
  for (const p of pliki) {
    const zrodlo = wygaszoneKomentarze(fs.readFileSync(p, 'utf8'));
    for (const wiersz of trafienia(zrodlo, wzorzec)) {
      out.push(`${path.relative(korzen, p)}:${wiersz}`);
    }
  }
  return out;
}

describe('strażnik: bramka, która nie czeka', () => {
  it('żaden test nie używa page.waitForFunction z predykatem asynchronicznym', () => {
    expect(
      skanTestow(WZORZEC_ASYNC),
      'taka bramka przepuszcza od razu — czekaj przez expect.poll w Node',
    ).toEqual([]);
  });

  it('żaden test nie używa page.waitForFunction z predykatem oddającym Promise przez .then', () => {
    expect(
      skanTestow(WZORZEC_THEN),
      'predykat bez słowa `async` też oddaje Promise — czekaj przez expect.poll w Node',
    ).toEqual([]);
  });

  it('kontrola negatywna: wzorce faktycznie łapią oba zapisy', () => {
    // Próbki składane z kawałków — inaczej ten plik złapałby sam siebie.
    const zly = 'await page.waitForFunction(' + 'async () => true);';
    const zlyZArg = 'await page.waitForFunction(' + 'async (x) => x);';
    expect(WZORZEC_ASYNC.test(zly)).toBe(true);
    expect(WZORZEC_ASYNC.test(zlyZArg)).toBe(true);

    const zlyThen = 'await page.waitForFunction((id) => V.getPatient(id)'
      + '.' + 'then((r) => r.snapshots.length > 1), patientId);';
    const zlyThenWieleWierszy = [
      'await page.waitForFunction(',
      '  (id) => window.VildaVault.getPatient(id)'
        + '.' + 'then((r) => Boolean(r.snapshots[0].payload.puberty)),',
      '  patientId,',
      ');',
    ].join('\n');
    expect(WZORZEC_THEN.test(zlyThen), 'zapis w jednym wierszu').toBe(true);
    expect(WZORZEC_THEN.test(zlyThenWieleWierszy), 'zapis złamany na kilka wierszy').toBe(true);
  });

  it('kontrola negatywna: poprawne zapisy nie są łapane', () => {
    const dobry = 'await page.waitForFunction(() => true);';
    expect(WZORZEC_ASYNC.test(dobry), 'synchroniczny jest w porządku').toBe(false);
    expect(WZORZEC_THEN.test(dobry), 'synchroniczny jest w porządku').toBe(false);

    // `page.evaluate` POPRAWNIE czeka na Promise, więc `.then(…)` jest tam dozwolone —
    // także wtedy, gdy wyżej w pliku stoi zwykła, synchroniczna bramka.
    const dobryEvaluate = [
      'await page.waitForFunction(() => Boolean(window.VildaVault));',
      'const ile = await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id)',
      '  ' + '.' + 'then((l) => l.length), patientId);',
    ].join('\n');
    expect(
      WZORZEC_THEN.test(dobryEvaluate),
      'wzorzec nie może przeskakiwać z bramki do evaluate niżej w pliku',
    ).toBe(false);

    // Bramka synchroniczna z zagnieżdżonymi nawiasami też zostaje w spokoju.
    const dobryZagniezdzony = 'await page.waitForFunction(() => Boolean(document.querySelector(".x")));';
    expect(WZORZEC_THEN.test(dobryZagniezdzony)).toBe(false);
    expect(WZORZEC_ASYNC.test(dobryZagniezdzony)).toBe(false);
  });

  it('pomocnik do czekania na sejf istnieje i sam nie używa zakazanych bramek', () => {
    const p = path.join(testy, 'support', 'sejf-czekanie.mjs');
    expect(fs.existsSync(p), 'tests/support/sejf-czekanie.mjs').toBe(true);
    const kod = wygaszoneKomentarze(fs.readFileSync(p, 'utf8'));
    expect(kod).toContain('expect');
    expect(kod).toContain('poll');
    expect(trafienia(kod, WZORZEC_ASYNC), 'pomocnik sam używa złej bramki').toEqual([]);
    expect(trafienia(kod, WZORZEC_THEN), 'pomocnik sam używa złej bramki').toEqual([]);
  });
});
