// P-DIETA rata H1: generator i sprawdzian złotych wartości Henry’ego 2005 (tests/fixtures/henry-2005-zlote.json).
// Wartości liczy STARY silnik — vilda_diet_plan_ui.js z commitu ebc63bb9 (origin/audyt przed ratą H1), który miał
// współczynniki Henry’ego wpisane w `switch`. Dzięki temu fixture nie jest przepisanym wzorem, tylko zapisem wyniku
// produkcji sprzed refaktoryzacji.
//   node tests/scripts/henry-2005-zlote.mjs            → sprawdza, że fixture = wynik starego silnika (Object.is)
//   node tests/scripts/henry-2005-zlote.mjs --zapisz   → zapisuje fixture od nowa
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = path.join(korzen, 'tests/fixtures/henry-2005-zlote.json');
const COMMIT = 'ebc63bb9';

const zrodlo = execFileSync('git', ['show', `${COMMIT}:vilda_diet_plan_ui.js`], { cwd: korzen, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const okno = { addEventListener() {}, location: { pathname: '/' }, navigator: {} };
okno.window = okno;
new Function('window', 'globalThis', zrodlo)(okno, okno);

// Siatka: masy i wzrosty typowe dla przedziału wieku, z ułamkami; child_3_9 M zawiera punkty (12 kg / 91,5 i 92 cm),
// na których rozdzielenie mnożnika × 239 po składnikach zmienia ostatni bit wyniku.
const ZAKRES = {
  child_1_2: [[7.3, 9.1, 10.55, 12.3, 14.8, 17.25], [68.4, 74.5, 79.95, 84.5, 90, 91, 96.3]],
  child_3_9: [[12, 14.8, 16.35, 19.7, 24.6, 31.15, 38.9, 52.4], [91.5, 92, 99.8, 108.25, 116.7, 124.8, 133.4, 141.05, 150.3]],
  child_10_17: [[26.4, 33.7, 41.05, 49.9, 58.2, 71.35, 88.6, 112.4], [128.3, 137.75, 146.2, 155.9, 163.4, 171.05, 180.6, 191.2]],
  child_18: [[45.2, 58.9, 71.9, 88.35, 119.6], [152.4, 163.3, 176.1, 188.95]],
  adult_19_29: [[44.8, 57.35, 64.4, 79.9, 98.2, 131.7], [150.1, 158.65, 168.2, 177.4, 186.35, 198.2]],
  adult_30_59: [[46.3, 59.8, 72.15, 88.7, 104.45, 142.9], [148.2, 157.75, 165, 171.3, 182.65, 195.4]],
  adult_60_plus: [[41.7, 55.3, 67.05, 79.1, 96.8, 124.35], [145.6, 153.2, 162.6, 170.35, 179.8, 188.1]],
};

const wiersze = [];
for (const [stage, [masy, wzrosty]] of Object.entries(ZAKRES)) {
  for (const sex of ['M', 'F']) for (const kg of masy) for (const cm of wzrosty) {
    const kcal = okno.energyHenryREEkcal({ stage, sex, weightKg: kg, heightCm: cm });
    if (!Number.isFinite(kcal)) throw new Error(`stary silnik nie policzył ${stage} ${sex} ${kg}/${cm}`);
    wiersze.push([stage, sex, kg, cm, kcal]);
  }
}
const tekst = `[\n${wiersze.map((w) => `  ${JSON.stringify(w)}`).join(',\n')}\n]\n`;

if (process.argv.includes('--zapisz')) {
  fs.writeFileSync(FIXTURE, tekst);
  console.log(`zapisano ${wiersze.length} punktów do ${path.relative(korzen, FIXTURE)}`);
} else {
  const zapisane = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const zle = wiersze.filter((w, i) => !zapisane[i] || zapisane[i].slice(0, 4).join() !== w.slice(0, 4).join() || !Object.is(zapisane[i][4], w[4]));
  if (zapisane.length !== wiersze.length || zle.length) {
    console.error(`fixture ≠ stary silnik: ${zle.length} różnic, długości ${zapisane.length}/${wiersze.length}`);
    process.exit(1);
  }
  console.log(`fixture = stary silnik (${COMMIT}): ${wiersze.length}/${wiersze.length} punktów, Object.is`);
}
