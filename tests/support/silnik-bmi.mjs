import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Wspólne rusztowanie testów BMI: PRAWDZIWY silnik vilda_bmi.js z PRAWDZIWYMI tablicami
// (OLAF z app.js, WHO 2006/2007 z vilda_growth_reference_data.js, Palczewska przez
// vilda_centile_interpolation.js). Testy dietetyczne, karty i strażnik ładowały to samo okno
// pięcioma kopiami tego kodu — P-DIETA-SILNIK sprowadza je do jednego miejsca, żeby żaden
// test nie pracował na atrapie LMS.

export const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const zrodlo = (f) => fs.readFileSync(path.join(korzen, f), 'utf8');
export const appSrc = zrodlo('app.js');

const PLIKI_SILNIKA = ['vilda_growth_reference_data.js', 'centile_data.js', 'vilda_centile_interpolation.js', 'vilda_bmi.js'];

/** Wycina zbalansowany blok { … } zaczynający się od pierwszego „{" za pozycją `od`. */
export function wytnij(src, od) {
  let d = 0;
  for (let k = src.indexOf('{', od); k < src.length; k += 1) {
    if (src[k] === '{') d += 1;
    else if (src[k] === '}') { d -= 1; if (d === 0) return src.slice(od, k + 1); }
  }
  throw new Error('niezbalansowane nawiasy');
}

/** Literał tablicy z app.js (np. OLAF_LMS_BOYS) — bez kopiowania liczb do testu. */
export function tablica(nazwa) {
  const i = appSrc.indexOf(`${nazwa}={`);
  if (i < 0) throw new Error(`app.js nie ma tablicy ${nazwa}`);
  return new Function(`return ${wytnij(appSrc, i).slice(nazwa.length + 1)}`)();
}

/** Źródło funkcji `nazwa` wycięte z podanego pliku (do izolowanego uruchomienia). */
export function funkcjaZ(src, nazwa) {
  const i = src.indexOf(`function ${nazwa}(`);
  if (i < 0) throw new Error(`źródło nie ma funkcji ${nazwa}()`);
  return wytnij(src, i);
}

/** Tablice LMS BMI dla VildaBmi.ustawDane() — prosto z produkcyjnych plików. */
export function daneSilnika(win) {
  const R = win.VildaGrowthReferenceData.getData();
  return {
    LMS_BMI_OLAF_BOYS: tablica('OLAF_LMS_BOYS'), LMS_BMI_OLAF_GIRLS: tablica('OLAF_LMS_GIRLS'),
    LMS_BMI_WHO_INFANT_BOYS: R.LMS_INFANT_BOYS, LMS_BMI_WHO_INFANT_GIRLS: R.LMS_INFANT_GIRLS,
    LMS_BMI_WHO_BOYS: R.LMS_BOYS, LMS_BMI_WHO_GIRLS: R.LMS_GIRLS,
  };
}

/** Okno przeglądarki z gotowym silnikiem BMI (window === globalThis modułu). */
export function oknoZSilnikiem(extra = {}) {
  const win = Object.assign({ addEventListener() {}, location: { pathname: '/' }, navigator: {} }, extra);
  win.window = win;
  for (const f of PLIKI_SILNIKA) new Function('window', 'globalThis', zrodlo(f))(win, win);
  win.VildaBmi.ustawDane(Object.assign(
    { palCentyl: (p, m, c, t) => win.VildaCentileInterp.palCentileValue(p, m, c, t) },
    daneSilnika(win),
  ));
  return win;
}

/** Ładuje plik produkcyjny do okna z silnikiem (kolejność jak w HTML: silnik przed konsumentem). */
export function wczytajDoOkna(win, plik) {
  new Function('window', 'globalThis', zrodlo(plik))(win, win);
  return win;
}
