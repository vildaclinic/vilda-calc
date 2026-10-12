// P-PLEC-IMIE: generator i sprawdzian słownika imion z płcią (vilda_imiona_plec_dane.js).
//
// Źródło: Ministerstwo Cyfryzacji, zbiór „Lista imion występujących w rejestrze PESEL” na dane.gov.pl.
// Potrzebne dwa pliki CSV z tego zbioru: imiona żeńskie i imiona męskie osób żyjących, pole
// „imię pierwsze” (ta sama data stanu). Logika budowy: tests/support/imiona-pesel.mjs.
//
//   node tests/scripts/imiona-pesel.mjs --kobiety <żeńskie.csv> --mezczyzni <męskie.csv> \
//        --stan-na RRRR-MM-DD --adres <strona zbioru> [--min 20] [--warunki "<tekst>"] --zapisz
//       → zapisuje vilda_imiona_plec_dane.js od nowa
//   ta sama komenda bez --zapisz
//       → sprawdza, że vilda_imiona_plec_dane.js jest dokładnie tym, co wyjdzie z tych plików
//
// Po zapisie: podbij ?v= pliku danych (npm run podbij-wersje) i uruchom npm test.
import fs from 'node:fs';
import { MIN_DOMYSLNE, PLIK_DANYCH, trescPliku, zbudujZrodlo } from '../support/imiona-pesel.mjs';

const POMOC = `Użycie: node tests/scripts/imiona-pesel.mjs --kobiety <plik.csv> --mezczyzni <plik.csv> --stan-na RRRR-MM-DD --adres <url> [--min ${MIN_DOMYSLNE}] [--warunki "<tekst>"] [--zapisz]`;

const args = process.argv.slice(2);
const opcja = (nazwa) => {
  const i = args.indexOf(nazwa);
  return i >= 0 ? args[i + 1] : undefined;
};
if (args.includes('--pomoc') || args.includes('-h')) {
  console.log(POMOC);
  process.exit(0);
}
const kobiety = opcja('--kobiety');
const mezczyzni = opcja('--mezczyzni');
if (!kobiety || !mezczyzni) {
  console.error(POMOC);
  process.exit(2);
}

let zrodlo;
try {
  zrodlo = zbudujZrodlo({
    kobiety,
    mezczyzni,
    stanNa: opcja('--stan-na'),
    adres: opcja('--adres'),
    warunki: opcja('--warunki'),
    min: opcja('--min') ? Number(opcja('--min')) : MIN_DOMYSLNE,
  });
} catch (blad) {
  console.error(`imiona-pesel: ${blad.message}`);
  process.exit(2);
}

const tresc = trescPliku(zrodlo);
const opis = `${zrodlo.id}: ${zrodlo.liczbaImion} imion (≥ ${zrodlo.minLiczba} osób), pliki: ${zrodlo.pliki.map((p) => `${p.nazwa} ${p.sha256.slice(0, 12)}`).join(', ')}`;
if (args.includes('--zapisz')) {
  fs.writeFileSync(PLIK_DANYCH, tresc);
  console.log(`zapisano vilda_imiona_plec_dane.js — ${opis}`);
} else {
  const obecna = fs.existsSync(PLIK_DANYCH) ? fs.readFileSync(PLIK_DANYCH, 'utf8') : '';
  if (obecna === tresc) {
    console.log(`zgodny: ${opis}`);
  } else {
    console.error(`NIEZGODNY: vilda_imiona_plec_dane.js różni się od wyniku generatora (${opis}). Uruchom z --zapisz.`);
    process.exit(1);
  }
}
