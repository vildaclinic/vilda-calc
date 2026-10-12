// P-PLEC-IMIE: budowa słownika imion z płcią (vilda_imiona_plec_dane.js) z oficjalnych list PESEL.
//
// Wejście: dwa pliki CSV ze zbioru Ministerstwa Cyfryzacji „Lista imion występujących w rejestrze
// PESEL” (dane.gov.pl) — imiona ŻEŃSKIE i imiona MĘSKIE osób żyjących, pole „imię pierwsze”.
// Parser jest tolerancyjny co do postaci pliku (przecinek, średnik albo tabulator; nagłówek
// „IMIĘ_PIERWSZE / PŁEĆ / LICZBA_WYSTĄPIEŃ” albo bez kolumny płci; BOM; cudzysłowy), ale
// nie zgaduje: kolumna płci, jeżeli jest, musi zgadzać się z rolą pliku.
//
// Klucz imienia liczy PRODUKCYJNY vilda_plec_z_imienia.js (kluczImienia), więc słownik i
// wyszukiwanie w przeglądarce używają dokładnie tej samej normalizacji.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PLIK_DANYCH = path.join(korzen, 'vilda_imiona_plec_dane.js');
export const MIN_DOMYSLNE = 20;

export function silnik() {
  const okno = {
    document: { readyState: 'complete', getElementById: () => null, addEventListener() {} },
    addEventListener() {},
    setTimeout: (f) => { f(); return 1; },
  };
  const zrodlo = fs.readFileSync(path.join(korzen, 'vilda_plec_z_imienia.js'), 'utf8');
  new Function('window', 'globalThis', zrodlo)(okno, okno);
  if (!okno.VildaPlecZImienia) throw new Error('vilda_plec_z_imienia.js nie wystawił VildaPlecZImienia');
  return okno.VildaPlecZImienia;
}

function rozbijWiersz(linia, sep) {
  const pola = [];
  let biezace = '';
  let wCudzyslowie = false;
  for (let i = 0; i < linia.length; i += 1) {
    const z = linia[i];
    if (wCudzyslowie) {
      if (z === '"' && linia[i + 1] === '"') { biezace += '"'; i += 1; }
      else if (z === '"') wCudzyslowie = false;
      else biezace += z;
    } else if (z === '"') wCudzyslowie = true;
    else if (z === sep) { pola.push(biezace); biezace = ''; }
    else biezace += z;
  }
  pola.push(biezace);
  return pola.map((p) => p.trim());
}

const bezOgonkow = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/Ł/g, 'L');

function plecZWartosci(v) {
  const s = bezOgonkow(String(v || '')).trim().toUpperCase();
  if (/^(K|KOBIETA|KOBIETY|F|ZENSKA|ZENSKIE)$/.test(s)) return 'F';
  if (/^(M|MEZCZYZNA|MEZCZYZNI|MESKA|MESKIE)$/.test(s)) return 'M';
  return null;
}

/** Czyta jeden plik CSV listy imion. Zwraca wiersze { imie, liczba } i opis pliku. */
export function czytajListe(sciezka, plec) {
  const bufor = fs.readFileSync(sciezka);
  const sha256 = crypto.createHash('sha256').update(bufor).digest('hex');
  const surowy = bufor.toString('utf8');
  const tekst = surowy.charCodeAt(0) === 0xfeff ? surowy.slice(1) : surowy;
  const linie = tekst.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!linie.length) throw new Error(`${sciezka}: pusty plik`);
  const naglowek = linie[0];
  const sep = [',', ';', '\t'].map((s) => [s, naglowek.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const kolumny = rozbijWiersz(naglowek, sep).map((k) => bezOgonkow(k).toUpperCase());
  const iImie = kolumny.findIndex((k) => k.includes('IMIE'));
  const iLiczba = kolumny.findIndex((k) => k.includes('LICZBA'));
  const iPlec = kolumny.findIndex((k) => k.includes('PLEC'));
  if (iImie < 0 || iLiczba < 0) throw new Error(`${sciezka}: brak kolumny imienia albo liczby w nagłówku „${naglowek}”`);
  const wiersze = [];
  for (const linia of linie.slice(1)) {
    const pola = rozbijWiersz(linia, sep);
    const imie = pola[iImie] || '';
    const liczba = Number.parseInt(String(pola[iLiczba] || '').replace(/\s/g, ''), 10);
    if (!imie || !Number.isFinite(liczba) || liczba < 0) continue;
    if (iPlec >= 0) {
      const p = plecZWartosci(pola[iPlec]);
      if (p !== plec) throw new Error(`${sciezka}: wiersz „${linia}” ma płeć „${pola[iPlec]}”, a plik podano jako ${plec === 'F' ? 'żeński' : 'męski'}`);
    }
    wiersze.push({ imie, liczba });
  }
  return { wiersze, plik: { plec, nazwa: path.basename(sciezka), sha256 } };
}

/**
 * Buduje źródło słownika. Wynik: obiekt źródła (id, metadane, imiona) gotowy do zapisania.
 * Imiona sumowane po kluczu silnika; zostają te, które nosi co najmniej `min` osób łącznie.
 */
export function zbudujZrodlo({ kobiety, mezczyzni, stanNa, adres, warunki, min = MIN_DOMYSLNE }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(stanNa || ''))) throw new Error('--stan-na musi mieć postać RRRR-MM-DD');
  if (!adres) throw new Error('--adres (strona zbioru na dane.gov.pl) jest wymagany');
  const { kluczImienia } = silnik();
  const z = czytajListe(kobiety, 'F');
  const m = czytajListe(mezczyzni, 'M');
  const sumy = new Map();
  const dodaj = (wiersze, i) => {
    for (const { imie, liczba } of wiersze) {
      const k = kluczImienia(imie);
      if (!k) continue;
      const s = sumy.get(k) || [0, 0];
      s[i] += liczba;
      sumy.set(k, s);
    }
  };
  dodaj(z.wiersze, 0);
  dodaj(m.wiersze, 1);
  const imiona = {};
  [...sumy.keys()].sort().forEach((k) => {
    const [kob, mez] = sumy.get(k);
    if (kob + mez >= min) imiona[k] = [kob, mez];
  });
  return {
    id: `PESEL-${stanNa}`,
    kraj: 'PL',
    nazwa: 'Rejestr PESEL — imiona pierwsze osób żyjących',
    zbior: 'Lista imion występujących w rejestrze PESEL',
    wydawca: 'Ministerstwo Cyfryzacji',
    populacja: 'osoby żyjące z numerem PESEL',
    pole: 'imię pierwsze',
    stanNa,
    adres,
    warunki: warunki || 'Informacja sektora publicznego z portalu dane.gov.pl; warunki ponownego wykorzystania — na stronie zbioru.',
    pliki: [z.plik, m.plik],
    minLiczba: min,
    liczbaImion: Object.keys(imiona).length,
    imiona,
  };
}

const jsonStr = (v) => JSON.stringify(v);

/** Treść pliku vilda_imiona_plec_dane.js — deterministyczna (bez znaczników czasu). */
export function trescPliku(zrodlo) {
  const meta = Object.entries(zrodlo).filter(([k]) => k !== 'imiona');
  const wpisy = Object.entries(zrodlo.imiona).map(([k, v]) => `      ${jsonStr(k)}: [${v[0]}, ${v[1]}]`);
  return `/* vilda_imiona_plec_dane.js — PLIK GENEROWANY, nie edytuj ręcznie (P-PLEC-IMIE).
 *
 * Słownik imion pierwszych z liczbą kobiet i mężczyzn, którzy je noszą: rejestr PESEL, osoby żyjące.
 * Źródło: ${zrodlo.wydawca}, „${zrodlo.zbior}”, ${zrodlo.adres}, stan na ${zrodlo.stanNa}.
 * Pliki źródłowe i ich SHA-256 są w polu \`pliki\`. Imiona noszone łącznie przez mniej niż
 * ${zrodlo.minLiczba} osób pominięto (silnik i tak traktuje je jak nieznane).
 *
 * Generator: node tests/scripts/imiona-pesel.mjs (sposób użycia w pliku generatora).
 * Silnik: vilda_plec_z_imienia.js. Rejestr: docs/clinical/ALGORITHMS.md, P-PLEC-IMIE.
 * Format wpisu: "imię": [kobiety, mężczyźni].
 */
(function (w) {
  'use strict';
  if (!w) return;
  var rejestr = w.VildaImionaPlecZrodla = w.VildaImionaPlecZrodla || {};
  rejestr[${jsonStr(zrodlo.id)}] = {
${meta.map(([k, v]) => `    ${k}: ${jsonStr(v)},`).join('\n')}
    imiona: {
${wpisy.join(',\n')}
    }
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
`;
}

/** Wczytuje plik danych tak, jak przeglądarka (własne okno), i zwraca rejestr źródeł. */
export function wczytajPlikDanych(plik = PLIK_DANYCH) {
  const okno = {};
  new Function('window', 'globalThis', fs.readFileSync(plik, 'utf8'))(okno, okno);
  return okno.VildaImionaPlecZrodla || {};
}
