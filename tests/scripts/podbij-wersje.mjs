// P-WATKI: nadaje ?v= zmienionym plikom, dopisuje wpisy precache, ustawia SW_VERSION, pin SW w testach
// i tests/fixtures/wersje-zasobow.json — wszystko względem gałęzi bazowej (domyślnie origin/audyt).
// Uruchom jako OSTATNI krok przed oddaniem PR, po scaleniu najnowszego audyt. Procedura dla kilku wątków
// naraz: docs/GITHUB_WORKFLOW.md, „Kilka wątków naraz”. Logika: tests/support/podbij-wersje.mjs.
import { DOMYSLNA_BAZA, opiszPlan, sprawdzSwiezoscBazy, zaplanuj, zastosuj } from '../support/podbij-wersje.mjs';

const POMOC = `Użycie: npm run podbij-wersje [-- opcje]

  (bez opcji)     wylicza i zapisuje wersje względem ${DOMYSLNA_BAZA}
  --sprawdz       tylko raport; kod wyjścia 1, gdy coś trzeba zmienić, jest błąd albo baza jest nieaktualna
  --baza=<ref>    inna gałąź bazowa (domyślnie ${DOMYSLNA_BAZA})
  --bez-sieci     nie porównuj lokalnego ${DOMYSLNA_BAZA} z serwerem (git ls-remote)
  --pomoc         ten opis

Przed zapisem: git fetch origin audyt && git merge origin/audyt (skrypt odmówi, jeżeli gałąź
nie zawiera bazy albo lokalna baza jest starsza niż na serwerze).`;

const argumenty = process.argv.slice(2);
const znane = new Set(['--sprawdz', '--bez-sieci', '--pomoc', '-h', '--help']);
const nieznane = argumenty.filter((a) => !znane.has(a) && !a.startsWith('--baza='));
if (argumenty.some((a) => ['--pomoc', '-h', '--help'].includes(a))) {
  console.log(POMOC);
  process.exit(0);
}
if (nieznane.length) {
  console.error(`nieznane opcje: ${nieznane.join(' ')}\n\n${POMOC}`);
  process.exit(2);
}

const sprawdz = argumenty.includes('--sprawdz');
const baza = argumenty.find((a) => a.startsWith('--baza='))?.slice('--baza='.length) || DOMYSLNA_BAZA;

let plan;
try {
  plan = zaplanuj({ baza });
} catch (blad) {
  console.error(`podbij-wersje: ${blad.message}`);
  process.exit(2);
}

// Przeszkody poza planem: baza spoza historii gałęzi i baza starsza niż na serwerze. Obie oznaczają, że
// numery policzone teraz mogą się zderzyć z już scalonym PR.
const przeszkody = [];
if (!plan.bazaWHistorii) przeszkody.push(`gałąź nie zawiera ${baza} — najpierw: git fetch origin audyt && git merge ${baza}`);
if (!argumenty.includes('--bez-sieci')) {
  const swiezosc = sprawdzSwiezoscBazy({ baza });
  if (!swiezosc.sprawdzono) console.log(`(świeżości ${baza} nie sprawdzono: ${swiezosc.powod})`);
  else if (!swiezosc.aktualna) {
    przeszkody.push(`lokalne ${baza} (${String(swiezosc.lokalnie).slice(0, 7)}) jest starsze niż na serwerze (${swiezosc.zdalnie.slice(0, 7)}) — git fetch origin audyt, scal i uruchom ponownie`);
  }
}

console.log(opiszPlan(plan));
for (const p of przeszkody) if (plan.bazaWHistorii || !p.startsWith('gałąź nie zawiera')) console.log(`UWAGA: ${p}`);

if (sprawdz) process.exit(plan.zmiany.size || plan.bledy.length || przeszkody.length ? 1 : 0);
przeszkody.unshift(...plan.bledy);
if (przeszkody.length) {
  console.error(`\nNic nie zapisano:\n  ${przeszkody.join('\n  ')}`);
  process.exit(1);
}
zastosuj(plan);
console.log(plan.zmiany.size ? `\nZapisano ${plan.zmiany.size} plików. Dalej: npm test.` : '');
