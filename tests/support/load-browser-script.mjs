import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Twarde zależności modułów przeglądarkowych — ładowane przed plikiem docelowym, tak jak
// na stronie robi to kolejność tagów <script defer>. Lista jest krótka celowo: trafia tu
// tylko zależność, której BRAK nie wywala testu, lecz cicho zmienia wynik na „brak danych"
// — czyli taka, której przeoczenie czyta się jak regresja produktu, a jest brakiem wsadu.
//
// vilda_werdykt.js (P-WERDYKT rata 1) jest jedynym miejscem, w którym powstaje werdykt
// odcinka. Bez niego vilda_trajectory_analysis.js oddaje verdict = null dla każdej pary.
// vilda_postepy_doroslego.js (P-POSTEPY rata 1) liczy postępy redukcji masy u dorosłego.
// Bez pliku danych pasma znikają, bez silnika BMI znikają klasy, bez kryteriów ChPL znika
// punkt decyzyjny — w każdym z tych przypadków wynik jest UBOŻSZY, a nie błędny, więc brak
// zależności czytałby się jak regresja produktu.
const ZALEZNOSCI = {
  'vilda_trajectory_analysis.js': ['vilda_werdykt.js'],
  'vilda_postepy_doroslego.js': [
    'vilda_bmi.js',
    'obesity_response_criteria.js',
    'vilda_postepy_doroslego_dane.js',
  ],
};

export function loadBrowserScript(relativePath, browserGlobal = {}) {
  for (const dep of ZALEZNOSCI[relativePath] || []) {
    wykonaj(dep, browserGlobal);
  }
  return wykonaj(relativePath, browserGlobal);
}

function wykonaj(relativePath, browserGlobal) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const execute = new Function('window', 'globalThis', source);
  execute(browserGlobal, browserGlobal);
  return browserGlobal;
}
