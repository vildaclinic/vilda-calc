import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// GROWTH-HV-KARTA — HV-SDS jako liczba opisowa w karcie wzrostowej.
//
// Funkcje są WYCIĘTE Z PLIKU PRODUKCYJNEGO i uruchomione na prawdziwym silniku oraz
// prawdziwych tablicach norm. Testujemy zachowanie karty, nie kopię jej logiki.
//
// Rzecz najważniejsza: werdykt tempa („poniżej normy dla wieku") pochodzi wyłącznie
// z velocityAssessment. HV-SDS nie może go dotknąć — ani zmienić klasy, ani dołożyć flagi.

function karta(dodatkoweOkno) {
  const src = fs.readFileSync(path.join(korzen, 'vilda_trajectory_analysis.js'), 'utf8');
  const start = src.indexOf('  var NAZWA_PODGRUPY = {');
  const end = src.indexOf('  function delayedPubertyHtml(');
  expect(start, 'znaleziono blok HV-SDS').toBeGreaterThan(-1);
  expect(end, 'znaleziono koniec bloku').toBeGreaterThan(start);

  const okno = Object.assign({}, dodatkoweOkno);
  for (const plik of ['hv_donald_data.js', 'hv_kelly_data.js', 'hv_cdgp_data.js',
    'vilda_height_velocity.js']) {
    new Function('window', fs.readFileSync(path.join(korzen, plik), 'utf8'))(okno);
  }
  const esc = (x) => String(x)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = (v, d) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
  const fmtS = (v) => {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    const t = Math.abs(v).toFixed(1);
    return (parseFloat(t) === 0 ? '' : (v > 0 ? '+' : '−')) + t.replace('.', ',');
  };
  const velocityAssessment = () => ({ cls: 'bad', text: 'poniżej normy dla wieku' });
  return new Function(
    'w', 'esc', 'fmt', 'fmtS', 'velocityAssessment',
    `${src.slice(start, end)}\nreturn { hvSdsHtml, velocityHtml };`,
  )(okno, esc, fmt, fmtS, velocityAssessment);
}

// Dziewczynka 9,5 r.ż. w środku przedziału, 3,0 cm/rok, odstęp 12 mies.
const VEL = { cmPerYear: 3, gapM: 12, wiekSrodekMies: 114, plec: 'F', usedLastYear: true };
const MODEL = { sex: 'F' };

describe('Liczba opisowa w karcie', () => {
  it('podaje SDS, centyl, medianę i nazwaną populację odniesienia', () => {
    const { hvSdsHtml } = karta();
    const html = hvSdsHtml(VEL, MODEL);
    expect(html).toContain('SDS tempa:');
    expect(html).toContain('−2,4');
    expect(html).toContain('0,8 centyl');
    expect(html).toContain('mediana 5,87 cm/rok');
    expect(html).toMatch(/populacja niemiecka/);
  });

  it('każdy wynik niesie zastrzeżenie o wahaniach i o braku polskich norm', () => {
    const { hvSdsHtml } = karta();
    const html = hvSdsHtml(VEL, MODEL);
    expect(html).toMatch(/2,8 SD/);
    expect(html).toMatch(/Polskich norm tempa nie ma/);
  });

  it('nie dopisuje żadnej klasy werdyktowej — tylko neutralną vta-stable', () => {
    const { hvSdsHtml } = karta();
    const html = hvSdsHtml(VEL, MODEL);
    expect(html).not.toMatch(/vta-bad|vta-warn|vta-good/);
  });

  it('werdykt tempa zostaje nietknięty obok HV-SDS', () => {
    const { velocityHtml } = karta();
    const html = velocityHtml(VEL, MODEL);
    expect(html).toContain('Tempo wzrastania:');
    expect(html).toContain('<span class="vta-bad">poniżej normy dla wieku</span>');
    expect(html).toContain('SDS tempa:');
  });

  it('bez silnika karta pokazuje samo tempo, bez awarii', () => {
    const src = fs.readFileSync(path.join(korzen, 'vilda_trajectory_analysis.js'), 'utf8');
    const start = src.indexOf('  var NAZWA_PODGRUPY = {');
    const end = src.indexOf('  function delayedPubertyHtml(');
    const puste = new Function('w', 'esc', 'fmt', 'fmtS', 'velocityAssessment',
      `${src.slice(start, end)}\nreturn { velocityHtml };`)(
      {}, (x) => String(x), (v, d) => v.toFixed(d), (v) => String(v),
      () => ({ cls: 'bad', text: 'poniżej normy' }));
    const html = puste.velocityHtml(VEL, MODEL);
    expect(html).toContain('Tempo wzrastania:');
    expect(html).not.toContain('SDS tempa:');
  });
});

describe('Podgrupa wg czasu pokwitania', () => {
  const zeStartem = (start) => ({
    VildaPubertalStatus: {
      dane: () => ({ wiekStartuLat: start, wiekMenarcheLat: null, kowd: '' }),
    },
  });

  it('dokładana tylko wtedy, gdy znany jest wiek startu pokwitania', () => {
    const { hvSdsHtml } = karta();
    expect(hvSdsHtml(VEL, MODEL)).not.toContain('Wg czasu pokwitania');
  });

  it('przy znanym wieku startu podaje drugą liczbę i nazwę podgrupy', () => {
    const { hvSdsHtml } = karta(zeStartem(12.5));
    const html = hvSdsHtml({ ...VEL, wiekSrodekMies: 132 }, MODEL);
    expect(html).toContain('Wg czasu pokwitania:');
    expect(html).toContain('dzieci dojrzewające później');
  });

  it('dziecko spoza kryteriów kohorty nie dostaje podgrupy, tylko powód', () => {
    const { hvSdsHtml } = karta(zeStartem(7.5));
    const html = hvSdsHtml({ ...VEL, wiekSrodekMies: 132 }, MODEL);
    expect(html).toContain('podgrupy nie przypisano');
    expect(html).toMatch(/pokwitanie przedwczesne/);
    expect(html).not.toMatch(/dzieci dojrzewające/);
  });

  it('sam wiek menarche nie wywołuje podgrupy', () => {
    const { hvSdsHtml } = karta({
      VildaPubertalStatus: { dane: () => ({ wiekStartuLat: null, wiekMenarcheLat: 12, kowd: '' }) },
    });
    expect(hvSdsHtml(VEL, MODEL)).not.toContain('Wg czasu pokwitania');
  });
});

describe('Gałąź KOWD', () => {
  const zDeklaracja = (kowd) => ({
    VildaPubertalStatus: { dane: () => ({ wiekStartuLat: null, wiekMenarcheLat: null, kowd: kowd }) },
  });

  it('bez deklaracji lekarza gałąź się nie pokazuje', () => {
    const { hvSdsHtml } = karta(zDeklaracja(''));
    expect(hvSdsHtml({ ...VEL, plec: 'M', wiekSrodekMies: 162, cmPerYear: 4.2 }, { sex: 'M' }))
      .not.toContain('KOWD');
  });

  it('odpowiedź „nie” też jej nie pokazuje', () => {
    const { hvSdsHtml } = karta(zDeklaracja('nie'));
    expect(hvSdsHtml({ ...VEL, plec: 'M', wiekSrodekMies: 162, cmPerYear: 4.2 }, { sex: 'M' }))
      .not.toContain('KOWD');
  });

  it('po deklaracji „tak” podaje położenie wobec kwartyli, a nie SDS', () => {
    const { hvSdsHtml } = karta(zDeklaracja('tak'));
    const html = hvSdsHtml({ ...VEL, plec: 'M', wiekSrodekMies: 162, cmPerYear: 4.2 }, { sex: 'M' });
    expect(html).toContain('KOWD (deklaracja lekarza):');
    expect(html).toContain('poniżej 25. centyla');
    expect(html).toMatch(/n = 21/);
  });
});

describe('Kiedy karta milczy, a kiedy mówi dlaczego', () => {
  it('brak środka przedziału to brak zdania — nie ma czym indeksować normy', () => {
    const { hvSdsHtml } = karta();
    expect(hvSdsHtml({ ...VEL, wiekSrodekMies: null }, MODEL)).toBe('');
  });

  it('odstęp poza oknem norm dostaje zdanie z powodem, nie ciszę', () => {
    const { hvSdsHtml } = karta();
    const html = hvSdsHtml({ ...VEL, gapM: 3 }, MODEL);
    expect(html).toContain('nie policzono');
    expect(html).toMatch(/Odstęp między pomiarami/);
  });

  it('wiek poniżej dolnej granicy tablic również', () => {
    const { hvSdsHtml } = karta();
    const html = hvSdsHtml({ ...VEL, wiekSrodekMies: 18 }, MODEL);
    expect(html).toContain('nie policzono');
    expect(html).toMatch(/poniżej dolnej granicy/);
  });
});
