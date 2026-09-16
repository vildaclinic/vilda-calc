import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');

// P-PANEL-ZWINIETY / P-MPH-KOLOR (decyzje właściciela 2026-09-16):
//   1. panel „Dane pokwitaniowe" domyślnie zwinięty, także z danymi i po wczytaniu pacjenta;
//   2. wiersz wieku na docpro w jednym wierszu, jak na index;
//   3. kafelek MPH w Karcie pacjenta kolorowany tą samą regułą, co kafelek wzrostu.
// Dane wyłącznie FIKCYJNE.

/* Atrapa DOM dla inline_index_02.js: panel z polami, przycisk i płeć. */
function panel(wartosci = {}) {
  const el = (id) => ({ id, value: wartosci[id] || '', style: {}, hidden: false, disabled: false, textContent: '',
    nasluchy: {}, addEventListener(n, f) { (this.nasluchy[n] = this.nasluchy[n] || []).push(f); },
    setAttribute() {}, removeAttribute() {}, focus() {}, querySelector() { return null; }, querySelectorAll() { return []; } });
  const pola = {};
  ['tannerStageWrap', 'pubertyExtraWrap', 'testicularVolumeWrap', 'tannerStage', 'tannerToggleBtn', 'sex', 'height', 'age',
    'ageMonths', 'pubertyOnsetAge', 'pubertyMenarcheAge', 'pubertyMenarcheHeight', 'pubertyMenarcheBoneAge',
    'pubertyGnrhaStatus', 'pubertyGnrhaStartAge', 'pubertyGnrhaStopAge', 'pubertyCdgp', 'advTesticularVolume',
    'pubertyConflicts', 'pubertyGnrhaAgesWrap'].forEach((id) => { pola[id] = el(id); });
  const win = { addEventListener() {}, setTimeout: (f) => f() };
  const document = { getElementById: (id) => pola[id] || null, querySelector: () => null };
  const src = zrodlo('inline_index_02.js');
  new Function('window', 'document', src)(win, document);
  return { pola, win };
}

describe('Panel pokwitaniowy domyślnie zwinięty (inline_index_02.js)', () => {
  it('skrypt nie ma już auto-otwarcia przy wpisanej wartości', () => {
    const src = zrodlo('inline_index_02.js');
    expect(src).not.toContain('cokolwiekWpisane()) otwarty = true');
    expect(src).not.toContain('decyzjaUzytkownika');
    expect(src).toContain("'+ Dane pokwitaniowe (wpisane)'");
  });

  it('z wpisaną wartością panel zostaje zwinięty, a przycisk mówi „(wpisane)"; klik otwiera; „Wyczyść" zwija', () => {
    const { pola, win } = panel({ pubertyOnsetAge: '10.5' });
    win.updateTannerVisibility();
    expect(pola.tannerStageWrap.style.display).toBe('none');
    expect(pola.pubertyExtraWrap.style.display).toBe('none');
    expect(pola.tannerToggleBtn.textContent).toBe('+ Dane pokwitaniowe (wpisane)');
    pola.tannerToggleBtn.nasluchy.click[0]();
    expect(pola.tannerStageWrap.style.display).toBe('');
    expect(pola.tannerToggleBtn.textContent).toBe('− Dane pokwitaniowe');
    win.vildaZwinDanePokwitaniowe();
    expect(pola.tannerStageWrap.style.display).toBe('none');
    expect(pola.tannerToggleBtn.textContent).toBe('+ Dane pokwitaniowe (wpisane)');
  });

  it('bez wartości przycisk brzmi zwyczajnie', () => {
    const { pola, win } = panel();
    win.updateTannerVisibility();
    expect(pola.tannerToggleBtn.textContent).toBe('+ Dane pokwitaniowe');
  });
});

describe('Wiersz wieku na docpro jak na index', () => {
  const index = zrodlo('index.html');
  const docpro = zrodlo('docpro.html');
  const blok = (h) => (h.match(/<div class="vild-age-row">[\s\S]*?<\/div>/) || [null])[0];

  it('blok .vild-age-row (lata + miesiące w jednym wierszu) jest identyczny na obu stronach', () => {
    expect(blok(index)).toBeTruthy();
    expect(blok(docpro)).toBe(blok(index));
  });

  it('docpro ma te same reguły CSS wiersza wieku', () => {
    ['.vild-age-row{display:flex;gap:12px;align-items:flex-start;}',
      '.vild-age-row > label{flex:1 1 0;min-width:0;}',
      '.vild-age-row > label.vild-age-years{flex:1.1 1 0;}',
      '@media (max-width:360px){ .vild-age-row{flex-direction:column;gap:0;} }'].forEach((r) => {
      expect(index).toContain(r);
      expect(docpro).toContain(r);
    });
  });
});

describe('Kafelek MPH w Karcie pacjenta kolorowany regułą wzrostu (vilda_auth_ui.js)', () => {
  const src = zrodlo('vilda_auth_ui.js');

  it('kafelek MPH dostaje klasę koloru z Y("height", …) — tej samej, co kafelek wzrostu', () => {
    expect(src).toContain('ce.push(xt("MPH",St(rt)+" cm",Oe,Y("height",rt,vt)))');
    expect(src).not.toContain('ce.push(xt("MPH",St(rt)+" cm",Oe,null))');
    expect(src).toContain('At.push(xt("Wzrost",St(D)+" cm",ne,Dt,zt))');
  });

  it('reguła Y dla wzrostu: < 3 lub > 97 → alarm, 3–10 lub 90–97 → ostrzeżenie, inaczej neutralny', () => {
    const i = src.indexOf('function Y(ct,Lt,Yt){');
    expect(i).toBeGreaterThan(-1);
    let d = 0; let k = src.indexOf('{', i); let koniec = -1;
    for (; k < src.length; k += 1) { if (src[k] === '{') d += 1; else if (src[k] === '}') { d -= 1; if (d === 0) { koniec = k + 1; break; } } }
    const Y = new Function('tt', `${src.slice(i, koniec)}return Y;`)(false);
    expect(Y('height', 160, 2.4)).toBe('alert');
    expect(Y('height', 160, 5)).toBe('improve');
    expect(Y('height', 160, 50)).toBeNull();
    expect(Y('height', 160, 93)).toBe('improve');
    expect(Y('height', 160, 98)).toBe('alert');
    expect(Y('height', 160, null)).toBeNull();
    // Dorosły (tt = true): reguła wzrostu nie koloruje — jak dla kafelka wzrostu.
    const Ydorosly = new Function('tt', `${src.slice(i, koniec)}return Y;`)(true);
    expect(Ydorosly('height', 160, 2)).toBeNull();
  });
});
