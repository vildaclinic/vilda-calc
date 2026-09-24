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
  // Widok sam z siebie nic nie liczy — bez silnika nie ma czego narysowac, wiec jego brak
  // dalby pusty HTML zamiast bledu, czyli znowu cicha zmiane wyniku zamiast glosnej awarii.
  'vilda_postepy_doroslego_ui.js': ['vilda_postepy_doroslego.js'],
  // Modul wydruku sklada dokument z tego, co narysowal widok; bez widoku oddaje pusty napis,
  // czyli znowu cicha zmiane wyniku zamiast glosnej awarii.
  'vilda_postepy_doroslego_wydruk.js': ['vilda_postepy_doroslego_ui.js'],
  // P-DIETA rata H1: wspolczynniki Henry'ego 2005 (i Molnara 1995) sa danymi — bez pliku danych silnik
  // diety nie liczy REE wcale (null), czyli znowu cicha zmiana wyniku zamiast glosnej awarii.
  'vilda_diet_plan_ui.js': ['vilda_ree_rownania_data.js'],
};

// Zaleznosci sa PRZECHODNIE i wykonywane RAZ na dane okno.
//
// Do 2026-09-20 petla wolala `wykonaj(dep)` zamiast rekurencji, wiec zaleznosc zaleznosci
// nie ladowala sie wcale: widok postepow dostawal silnik bez pliku danych pasm i bez
// kryteriow ChPL, i rysowal wykres bez pasm i bez punktu oceny — cicho, bez bledu.
// Dedup po `wykonane` jest tu konieczny, a nie kosmetyczny: ponowne wykonanie pliku
// wyzerowaloby stan ustawiony po jego zaladowaniu (np. VildaBmi.ustawDane).
const wykonane = new WeakMap();

export function loadBrowserScript(relativePath, browserGlobal = {}) {
  if (!wykonane.has(browserGlobal)) wykonane.set(browserGlobal, new Set());
  const juz = wykonane.get(browserGlobal);
  if (juz.has(relativePath)) return browserGlobal;
  juz.add(relativePath);
  for (const dep of ZALEZNOSCI[relativePath] || []) {
    loadBrowserScript(dep, browserGlobal);
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
