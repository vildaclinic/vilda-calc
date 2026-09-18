import { describe, expect, it } from 'vitest';
import { funkcjaZ, oknoZSilnikiem, tablica, zrodlo } from '../support/silnik-bmi.mjs';

// P-MASA rata 3 (audyt werdyktów, decyzje właściciela 2026-09-18: „dopisz zdanie dla 90-97
// i ruszaj z punktami 1-3").
//
// Karta główna miała TRZY kopie progów masy — kolor liczby, zdanie pod kartą i puls ramki —
// i one się rozjeżdżały na granicach. Ten plik pilnuje, że jest jedna.

const PREP = zrodlo('vilda_update_prep.js');
const APP = zrodlo('app.js');

/** Silnik masy z prawdziwymi tablicami — do porównania z lustrem w karcie. */
const win = oknoZSilnikiem();
new Function('window', 'globalThis', zrodlo('vilda_masa.js'))(win, win);
win.VildaMasa.ustawDane({
  LMS_WEIGHT_OLAF_BOYS: tablica('LMS_WEIGHT_BOYS'),
  LMS_WEIGHT_OLAF_GIRLS: tablica('LMS_WEIGHT_GIRLS'),
  LMS_WEIGHT_WHO_BOYS: tablica('LMS_WEIGHT_WHO_BOYS'),
  LMS_WEIGHT_WHO_GIRLS: tablica('LMS_WEIGHT_WHO_GIRLS'),
  LMS_WEIGHT_WHO_INFANT_BOYS: tablica('LMS_INFANT_WEIGHT_BOYS'),
  LMS_WEIGHT_WHO_INFANT_GIRLS: tablica('LMS_INFANT_WEIGHT_GIRLS'),
});

/** Buduje funkcje karty głównej w izolacji. `okno` decyduje, czy silnik jest widoczny. */
function kartaGlowna(okno, wflStan = { eligible: false, warning: false }) {
  const kod = [
    funkcjaZ(PREP, 'vildaUpdatePrepPasmoMasy'),
    funkcjaZ(PREP, 'vildaUpdatePrepResolveCentileSeverity'),
    funkcjaZ(PREP, 'vildaUpdatePrepBuildWeightHeightCentileWarnings'),
    `return {
       pasmo: vildaUpdatePrepPasmoMasy,
       severity: vildaUpdatePrepResolveCentileSeverity,
       zdania: vildaUpdatePrepBuildWeightHeightCentileWarnings,
     };`,
  ].join('\n');
  return new Function(
    'window', 'PERCENTILE_EXTREME_LOW', 'PERCENTILE_EXTREME_HIGH', 'vildaUpdatePrepComputeWflState',
    kod,
  )(okno, 3, 97, () => wflStan);
}

/** Czysty tekst zdań, bez znaczników — tak, jak przeczyta go lekarz. */
const tekst = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const stan = (centylMasy, extra = {}) => Object.assign({
  age: 8, weight: 30, height: 130, sex: 'M', professionalModeActive: false,
  statsW: { percentile: centylMasy }, statsH: { percentile: 50 },
}, extra);

describe('P-MASA-3 — jedno pasmo masy dla koloru, zdania i pulsu', () => {
  it('lustro w karcie i silnik dają to samo pasmo na CAŁYM zakresie centyli', () => {
    // Karta trzyma zapas na wypadek, gdyby vilda_masa.js się nie załadował — alert o masie
    // poniżej 3. centyla jest klinicznie ważny i nie może zniknąć przez brak skryptu.
    // Zapas wolno mieć tylko wtedy, gdy nie da się rozjechać z silnikiem. To sprawdza ten test.
    const lustro = kartaGlowna({}).pasmo;            // window bez silnika → zapas
    const zSilnikiem = kartaGlowna(win).pasmo;       // window z silnikiem → VildaMasa.kategoria
    const rozjazdy = [];
    for (let p = 0; p <= 100.0001; p += 0.1) {
      const c = Math.round(p * 10) / 10;
      const a = lustro(c);
      const b = zSilnikiem(c);
      if (a !== b) rozjazdy.push(`${c}: zapas=${a} silnik=${b}`);
    }
    expect(rozjazdy, 'zapas rozjechał się z silnikiem').toEqual([]);
  });

  it('pasma są dokładnie te z PROGI silnika — bez zaokrąglania (punkt 1)', () => {
    const { pasmo } = kartaGlowna(win);
    expect(pasmo(2.99)).toBe('niedobor');
    expect(pasmo(3)).toBe('niska');
    expect(pasmo(9.99)).toBe('niska');
    expect(pasmo(10)).toBe('typowa');
    expect(pasmo(89.99)).toBe('typowa');
    expect(pasmo(90)).toBe('podwyzszona');
    expect(pasmo(96.99)).toBe('podwyzszona');
    expect(pasmo(97)).toBe('wysoka');
    expect(pasmo(null)).toBeNull();
    expect(pasmo(Number.NaN)).toBeNull();
  });

  it('kolor liczby wychodzi z tego samego pasma (punkt 2)', () => {
    const { severity } = kartaGlowna(win);
    expect(severity(1, 'weight')).toBe('danger');
    expect(severity(5, 'weight')).toBe('warning');
    expect(severity(50, 'weight')).toBe(null);
    expect(severity(93, 'weight')).toBe('warning');
    expect(severity(97, 'weight')).toBe('danger');
    // Wzrost ma własną regułę i ta rata jej nie dotyka.
    expect(severity(2, 'height')).toBe('danger');
    expect(severity(98, 'height')).toBe('warning');
  });
});

describe('P-MASA-3 — zdania pod kartą główną', () => {
  const { zdania } = kartaGlowna(win);

  it('pasmo 90-97 dostaje zdanie — dotąd była tam cisza', () => {
    const t = tekst(zdania(stan(93)));
    expect(t).toContain('Regularnie monitoruj masę ciała dziecka');
    expect(t).toContain('w górnym zakresie normy (90–97 centyl)');
    expect(t, 'ton łagodny: żadnego alarmu ani skierowania').not.toContain('⚠');
    expect(t).not.toContain('Umów wizytę');
  });

  it('nowe zdanie jest lustrem istniejącego dolnego — ta sama klasa i ten sam czasownik', () => {
    const gora = zdania(stan(93));
    const dol = zdania(stan(5));
    expect(gora).toContain('class="centile-monitor-warning"');
    expect(dol).toContain('class="centile-monitor-warning"');
    expect(tekst(dol)).toContain('w dolnym zakresie normy (3–10 centyl)');
  });

  it('cisza zostaje tam, gdzie była: 10-90', () => {
    expect(zdania(stan(10))).toBe('');
    expect(zdania(stan(50))).toBe('');
    expect(zdania(stan(89.99))).toBe('');
  });

  it('2,6 centyla to już alarm, nie „monitoruj" — koniec zaokrąglania (punkt 1)', () => {
    // Dotąd próg liczył Math.round(centyl) < 3, więc alarm zaczynał się faktycznie od 2,5.
    const t = tekst(zdania(stan(2.6)));
    expect(t).toContain('Waga poniżej 3 centyla');
    expect(t).toContain('gastroenterologiem');
    expect(t).not.toContain('dolnym zakresie normy');
  });

  it('dokładnie 97,0 centyla mówi to samo, co kolor — koniec rozjazdu >= vs > (punkt 2)', () => {
    const { severity } = kartaGlowna(win);
    expect(severity(97, 'weight')).toBe('danger');
    expect(tekst(zdania(stan(97)))).toContain('Waga powyżej 97 centyla');
  });

  it('tryb profesjonalny nadal bez zdań — to kanał koloru i pulsu', () => {
    expect(zdania(stan(93, { professionalModeActive: true }))).toBe('');
    expect(zdania(stan(1, { professionalModeActive: true }))).toBe('');
  });
});

describe('P-MASA-3 — niemowlęta i karta masa-do-długości (punkt 3)', () => {
  it('dziecko proporcjonalnie małe poniżej 2 lat dostaje wreszcie sygnał', () => {
    // Niski centyl masy dla wieku przy PRAWIDŁOWEJ proporcji masa-do-długości: karta WFL
    // milczy (z-score w normie), a bramka age>=2 wycinała zdanie o masie dla wieku.
    // Dziecko nie dostawało nic — a to typowy obraz zahamowania przyrostu masy.
    const { zdania } = kartaGlowna(win, { eligible: true, warning: false });
    const t = tekst(zdania(stan(1.5, { age: 1 })));
    expect(t).toContain('Waga poniżej 3 centyla');
  });

  it('gdy karta masa-do-długości już ostrzega, nie dokładamy drugiego skierowania', () => {
    const { zdania } = kartaGlowna(win, { eligible: true, warning: true });
    expect(zdania(stan(1.5, { age: 1 })), 'WFL mówi „Niedowaga" — jedno ostrzeżenie wystarczy').toBe('');
    expect(zdania(stan(99, { age: 1 }))).toBe('');
  });

  it('powyżej 2 lat karta WFL nie obowiązuje i nic nie wycisza masy', () => {
    const { zdania } = kartaGlowna(win, { eligible: true, warning: true });
    expect(tekst(zdania(stan(1.5, { age: 5 })))).toContain('Waga poniżej 3 centyla');
  });

  it('wzrost nadal od 2. roku życia — ta rata nie rusza reguły wzrostu', () => {
    const { zdania } = kartaGlowna(win);
    const niemowle = tekst(zdania(stan(50, { age: 1, statsH: { percentile: 1 } })));
    expect(niemowle, 'wzrost milczy poniżej 2 lat, jak dotąd').not.toContain('Wzrost poniżej 3');
    const przedszkolak = tekst(zdania(stan(50, { age: 3, statsH: { percentile: 1 } })));
    expect(przedszkolak).toContain('Wzrost poniżej 3 centyla');
  });
});

describe('P-MASA-3 — koniec trzech kopii progów', () => {
  it('puls w app.js pyta o pasmo kartę, zamiast trzymać własne liczby', () => {
    const i = APP.indexOf('function applyProModePulse(');
    const cialo = APP.slice(i, APP.indexOf('window.setPulseMode', i));
    expect(cialo).toContain('vildaUpdatePrepPasmoMasy');
    expect(cialo).toContain('pm==="niedobor"||pm==="wysoka"');
    expect(cialo).toContain('pm==="niska"||pm==="podwyzszona"');
  });

  it('zdania nie mają już własnych progów masy', () => {
    const cialo = funkcjaZ(PREP, 'vildaUpdatePrepBuildWeightHeightCentileWarnings');
    expect(cialo, 'masa pyta o pasmo').toContain('vildaUpdatePrepPasmoMasy(e.statsW.percentile)');
    expect(cialo, 'koniec zaokrąglania centyla masy').not.toContain('Math.round(e.statsW.percentile)');
    expect(cialo, 'koniec własnego progu górnego dla masy')
      .not.toContain('e.statsW.percentile>PERCENTILE_EXTREME_HIGH');
  });

  it('progi masy istnieją już tylko w silniku i w jawnie oznaczonym zapasie karty', () => {
    const zapas = funkcjaZ(PREP, 'vildaUpdatePrepPasmoMasy');
    expect(zapas).toContain('window.VildaMasa');
    expect(zapas, 'zapas jest jeden i jest opisany').toContain('e<3?"niedobor"');
    // Poza tą jedną funkcją plik nie ma już liczbowych pasm masy.
    const bezZapasu = PREP.split(zapas).join('');
    expect(bezZapasu).not.toContain('e>=90&&e<97');
  });
});
