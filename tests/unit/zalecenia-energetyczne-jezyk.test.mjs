import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ENERGY-REC-4 (PR 4 audytu zaleceń energetycznych, 2026-09-12): język narracji.
// Strażnicy STRUKTURALNI na pliku produkcyjnym `vilda_diet_recommendations.js` (zwroty, które
// audyt J1–J4 kazał usunąć, nie mogą wrócić) oraz pomocnik czasu dojścia `dietCzasDojscia`
// wycinany z pliku (po „około" dopełniacz: „około 46 tygodni (ok. 10,5 miesiąca)";
// powyżej roku tylko miesiące). Na pliku sprzed łaty: zwroty obecne → czerwone.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = fs.readFileSync(path.join(korzen, 'vilda_diet_recommendations.js'), 'utf8');

// Plik trzyma polskie znaki jako sekwencje \uXXXX / \xHH — szukamy w tej samej postaci.
function esc(t) {
  let out = '';
  for (const ch of t) {
    const o = ch.codePointAt(0);
    if (o < 128) out += ch;
    else if (o < 256) out += `\\x${o.toString(16).toUpperCase().padStart(2, '0')}`;
    else out += `\\u${o.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return out;
}
const zawiera = (t) => src.includes(t) || src.includes(esc(t));

// Pomocnik stoi za `mLb` w tej samej linii (do końca linii); `mLb` (odmiana miesięcy) wycinany tak samo.
function helper(name) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) return null;
  const body = src.slice(i, src.indexOf('\n', i));
  const m = src.indexOf('function mLb(A){');
  const mlb = m >= 0 ? src.slice(m, src.indexOf('}function ', m) + 1) : '';
  return new Function(`${mlb}; ${body}; return ${name};`)();
}

describe('J1 — rejestr standardowy u dzieci < 11 lat bez „Proszę / ty / wy"', () => {
  it('zwroty do rodziców w 2. osobie zniknęły z wariantu standardowego', () => {
    expect(zawiera('Rodzice powinni zadbać')).toBe(false);
    expect(zawiera('Ograniczajcie czas')).toBe(false);
    expect(zawiera('skonsultujcie się')).toBe(false);
    expect(zawiera('Wspólnie skupcie się')).toBe(false);
    expect(zawiera('Skupcie się na')).toBe(false);
    expect(zawiera('Dziecko powinno zachęcać się')).toBe(false);
    expect(zawiera('(unikaj bardzo słodkich)')).toBe(false);
    expect(zawiera('Zalecane jest regularne spożywanie przez dziecko')).toBe(true);
    expect(zawiera('Zalecana jest codzienna aktywność fizyczna dziecka')).toBe(true);
  });
});

describe('J2 — zwroty wg wieku w trybie „ty"', () => {
  it('rówieśnik zamiast „dziecka w Twoim wieku"; ≥ 18 lat bez rodziców i psychologa dziecięcego', () => {
    expect(zawiera('dziecka w Twoim wieku')).toBe(false);
    expect(zawiera('osoby w Twoim wieku i o Twoim wzroście')).toBe(true);
    expect(zawiera('e>=18?"Jeżeli wdrożenie zaleceń okaże się trudne, rozważ konsultację z dietetykiem lub psychologiem."')).toBe(true);
    expect(zawiera('psychologiem"+(e>=18?"":" dziecięcym")')).toBe(true);
    expect(zawiera('"Twoja masa ciała mieści się w granicach normy dla Twojego wieku."')).toBe(false);
  });
});

describe('J3 — stabilizacja bez powtórzeń i bez „Przeliczenie wykonano…"', () => {
  it('jedno zdanie celu; „bez dodatkowego deficytu"; podstawa norm w nawiasie', () => {
    expect(zawiera('nie stosuje się deficytu energetycznego')).toBe(false);
    expect(zawiera('nie planujemy deficytu energetycznego')).toBe(false);
    expect(zawiera('Celem jest utrzymanie obecnej masy ciała przy dalszym wzrastaniu')).toBe(false);
    expect(zawiera('Najważniejsze jest utrzymanie obecnej masy ciała – wraz z dalszym wzrastaniem')).toBe(false);
    expect(zawiera('rosła minimalnie')).toBe(false);
    expect(zawiera('rosła jak najwolniej')).toBe(false);
    expect(zawiera('Przeliczenie wykonano')).toBe(false);
    expect(zawiera('${i.basisLabelOverride?` (${i.basisLabelOverride})`:""}')).toBe(true);
    expect(src.includes('var Je=A')).toBe(false);
  });
});

describe('J4 — liczebniki, jednostki, formaty', () => {
  const czas = helper('dietCzasDojscia');
  it('pomocnik istnieje; do 52 tygodni: tygodnie + miesiące słownie; powyżej roku tylko miesiące', () => {
    expect(typeof czas).toBe('function');
    expect(czas(46, '10,5')).toBe('około 46 tygodni (ok. 10,5 miesiąca)');
    expect(czas(33, null)).toBe('około 33 tygodni (ok. 7,6 miesiąca)');
    expect(czas(4, '1')).toBe('około 4 tygodni (ok. 1 miesiąca)');
    expect(czas(87, '20')).toBe('około 20 miesięcy');
    expect(czas(232, '53.4')).toBe('około 53,4 miesiąca');
  });
  it('kalki i niespójne jednostki zniknęły', () => {
    expect(zawiera('kg na tydzień')).toBe(false);
    expect(zawiera('przy wybraniu tej diety')).toBe(false);
    expect(zawiera('przy wyborze tej diety')).toBe(false);
    expect(zawiera('stopniowa poprawa masy ciała')).toBe(false);
    expect(zawiera('stopniowej poprawie masy ciała')).toBe(false);
    expect(zawiera('co najmniej 150–300 minut')).toBe(false);
    expect(zawiera('mies.).')).toBe(false);
    expect(zawiera('${b}" (PAL')).toBe(false);
    expect(zawiera('${b}” (PAL')).toBe(true);
  });
});
