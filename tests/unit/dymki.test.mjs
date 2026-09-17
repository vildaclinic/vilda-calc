import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { korzen, zrodlo } from '../support/silnik-bmi.mjs';

// P-DYMKI — zgłoszenie właściciela (2026-09-17): w trybie mobilnym/tabletowym dymki potwierdzeń
// wyskakiwały POD dockiem nawigacji albo pod strzałką „na górę" i nie było widać ich treści.
// Do 1.0.976 w kodzie było dwanaście osobnych dymków, każdy z własnym `position:fixed;bottom:1rem`
// w stylach inline — żaden nie wiedział, że na dole ekranu stoi dock.
//
// Zasada po naprawie: dymek NIE ZNA geometrii dołu. Pozycję daje klasa `.vilda-dymek` w style.css,
// liczona ze zmiennej `--vilda-dol-wolny`, którą publikuje właściciel docka (ios26-ui.js na
// stronach wprost, vilda_shell.js w powłoce i jej ramkach). Ten plik pilnuje obu końców:
// modułu (żadnego `style.bottom`) i publikacji (obaj właściciele docka piszą tę zmienną).

function fakeOkno() {
  const dzieci = [];
  const body = {
    appendChild(el) { el.parentNode = body; dzieci.push(el); return el; },
    removeChild(el) { const i = dzieci.indexOf(el); if (i >= 0) dzieci.splice(i, 1); el.parentNode = null; return el; },
  };
  const win = { zegary: [] };
  win.window = win;
  win.document = {
    body,
    getElementById: (id) => dzieci.find((d) => d.id === id) || null,
    createElement() {
      const el = { style: {}, atrybuty: {}, parentNode: null, className: '', id: '', textContent: '' };
      el.setAttribute = (k, v) => { el.atrybuty[k] = v; };
      return el;
    },
  };
  win.setTimeout = (fn, ms) => { win.zegary.push({ fn, ms }); return win.zegary.length; };
  win.clearTimeout = (id) => { if (win.zegary[id - 1]) win.zegary[id - 1].fn = null; };
  loadBrowserScript('vilda_dymek.js', win);
  return { win, dzieci };
}

describe('VildaDymek — jeden dymek, pozycja z CSS, nie ze stylów inline', () => {
  it('pokazuje dymek klasą .vilda-dymek i NIE ustawia żadnej pozycji inline', () => {
    const { win, dzieci } = fakeOkno();
    const el = win.VildaDymek.pokaz('Dane zostały skopiowane do schowka.');
    expect(dzieci).toHaveLength(1);
    expect(el.id).toBe('vildaDymek');
    expect(el.className).toBe('vilda-dymek vilda-dymek--ok');
    expect(el.textContent).toBe('Dane zostały skopiowane do schowka.');
    expect(el.atrybuty.role).toBe('status');
    // sedno naprawy: żadnego `bottom`, `position` ani `zIndex` w stylach inline — to one chowały dymek pod dockiem
    expect(Object.keys(el.style), 'style inline puste').toEqual([]);
  });

  it('ton i pozycja są klasami, nie stylami', () => {
    const { win } = fakeOkno();
    expect(win.VildaDymek.pokaz('x', { ton: 'blad', poz: 'prawo' }).className).toBe('vilda-dymek vilda-dymek--blad vilda-dymek--prawo');
    expect(win.VildaDymek.pokaz('x', { ton: 'info' }).className).toBe('vilda-dymek vilda-dymek--info');
    expect(win.VildaDymek.pokaz('x', { ton: 'nieznany', poz: 'nieznana' }).className, 'nieznane opcje = domyślne').toBe('vilda-dymek vilda-dymek--ok');
  });

  it('nowy dymek zastępuje poprzedni — jeden naraz, bez stosu nachodzących komunikatów', () => {
    const { win, dzieci } = fakeOkno();
    win.VildaDymek.pokaz('pierwszy');
    win.VildaDymek.pokaz('drugi');
    expect(dzieci).toHaveLength(1);
    expect(dzieci[0].textContent).toBe('drugi');
  });

  it('znika po zadanym czasie (domyślnie 2500 ms); czas 0 zostaje do schowaj()', () => {
    const { win, dzieci } = fakeOkno();
    win.VildaDymek.pokaz('a');
    expect(win.zegary.at(-1).ms).toBe(2500);
    win.zegary.at(-1).fn();
    expect(dzieci).toHaveLength(0);
    win.VildaDymek.pokaz('b', { czas: 3600 });
    expect(win.zegary.at(-1).ms).toBe(3600);
    const przed = win.zegary.length;
    win.VildaDymek.pokaz('c', { czas: 0 });
    expect(win.zegary.length, 'bez zegara przy czas:0').toBe(przed);
    win.VildaDymek.schowaj();
    expect(dzieci).toHaveLength(0);
  });
});

describe('P-DYMKI — strażnik: jeden dół dla wszystkich dymków', () => {
  const NIE_DOTYKAC = /position\s*[:=]\s*"?fixed"?[^}]{0,220}bottom\s*[:=]\s*"?(1rem|16px|18px|24px|26px)/;

  it('zmigrowane moduły nie mają już własnego dymka z bottom na sztywno', () => {
    for (const plik of [
      'vilda_summary_cards.js', 'app.js', 'vilda_diet_recommendations.js', 'gh_igf_therapy.js',
      'vilda_patient_report.js', 'vilda_patient_narrative_ui.js', 'vilda_b64_checklist_ui.js',
      'vilda_app_helpers.js', 'inline_kalkulator_klirens_04.js',
    ]) {
      const src = zrodlo(plik);
      expect(src, `${plik}: dymek przez moduł`).toContain('VildaDymek');
      expect(NIE_DOTYKAC.test(src), `${plik}: żadnego position:fixed + bottom:1rem/16px/…`).toBe(false);
    }
    // baner sync nie jest dymkiem tekstowym (ma przyciski) — zostaje własny wygląd, ale bottom bierze z kotwicy
    expect(NIE_DOTYKAC.test(zrodlo('vilda_chrome.js')), 'vilda_chrome.js: baner bez bottom na sztywno').toBe(false);
  });

  /* Komentarz nagłówkowy modułu CELOWO wymienia zakazane nazwy (tłumaczy, czemu ich nie ma), więc
     asercja musi najpierw odciąć komentarze — inaczej czytałaby dokumentację zamiast kodu. */
  function bezKomentarzy(src) {
    let out = '', i = 0, stan = 'kod', cudzyslow = '';
    while (i < src.length) {
      const c = src[i], d = src[i + 1];
      if (stan === 'kod') {
        if (c === '/' && d === '*') { stan = 'blok'; i += 2; continue; }
        if (c === '/' && d === '/') { stan = 'linia'; i += 2; continue; }
        if (c === '"' || c === "'" || c === '`') { stan = 'tekst'; cudzyslow = c; }
        out += c; i += 1; continue;
      }
      if (stan === 'tekst') {
        if (c === '\\') { out += c + (d || ''); i += 2; continue; }
        if (c === cudzyslow) stan = 'kod';
        out += c; i += 1; continue;
      }
      if (stan === 'blok') { if (c === '*' && d === '/') { stan = 'kod'; i += 2; } else i += 1; continue; }
      if (c === '\n') { stan = 'kod'; out += c; }
      i += 1;
    }
    return out;
  }

  it('sam moduł nie zna geometrii dołu — bez style.bottom, style.zIndex i pomiaru docka', () => {
    const src = bezKomentarzy(zrodlo('vilda_dymek.js'));
    expect(src, 'kontrola: komentarze naprawdę odcięte').not.toContain('PO CO TO JEST');
    for (const zakazane of ['style.bottom', 'style.zIndex', 'style.position', 'cssText', 'getBoundingClientRect', 'mobileBottomDock', 'scrollTopBtn']) {
      expect(src, `vilda_dymek.js nie może zawierać: ${zakazane}`).not.toContain(zakazane);
    }
  });

  it('CSS: .vilda-dymek i kotwice bogatszych elementów liczą bottom z --vilda-dol-wolny', () => {
    const css = zrodlo('style.css');
    expect(css).toMatch(/\.vilda-dymek\{[^}]*bottom:calc\(var\(--vilda-dol-wolny,env\(safe-area-inset-bottom,0px\)\) \+ 16px\)/);
    expect(css).toMatch(/\.vilda-dol-kotwica\{bottom:calc\(var\(--vilda-dol-wolny,env\(safe-area-inset-bottom,0px\)\) \+ 16px\)!important/);
    // te, które zachowują własny wygląd, ale muszą stać nad dockiem
    expect(zrodlo('vilda_deps.js')).toContain('#vilda-dependency-notice-container{position:fixed;z-index:2147483647;right:16px;bottom:calc(var(--vilda-dol-wolny,env(safe-area-inset-bottom,0px)) + 16px)');
    expect(zrodlo('vilda_growth_prediction_validation.js')).toContain('.vgpv-toast{position:fixed;left:50%;bottom:calc(var(--vilda-dol-wolny,env(safe-area-inset-bottom,0px)) + 16px)');
    expect(zrodlo('vilda_terminarz.js')).toContain('.tz-undo-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(var(--vilda-dol-wolny,env(safe-area-inset-bottom,0px)) + 16px)');
    expect(zrodlo('vilda_auth_ui.css')).toContain('.vilda-copy-summary-toast{position:fixed;left:50%;bottom:calc(var(--vilda-dol-wolny,env(safe-area-inset-bottom,0px)) + 16px)');
    expect(zrodlo('vilda_auth_ui.css'), 'stara, jednorazowa formuła z --vilda-dock-occ zniknęła').not.toContain('--vilda-dock-occ, calc(env(safe-area-inset-bottom, 0px) + max(');
    expect(zrodlo('vilda_chrome.js')).toContain('d.className="vilda-dol-kotwica"');
  });

  it('obaj właściciele docka publikują --vilda-dol-wolny, każdy w swoim trybie', () => {
    const ios = zrodlo('ios26-ui.js');
    expect(ios).toContain('v.setProperty("--vilda-dol-wolny"');
    expect(ios, 'w ramce powłoki (embedded=1) nie publikuje — tam dół zna vilda_shell.js').toContain('if(!Me()){const Sb=document.getElementById("scrollTopBtn")');
    expect(ios, 'poza trybem docka zmienna znika').toContain('v.removeProperty("--vilda-dol-wolny")');
    const shell = zrodlo('vilda_shell.js');
    expect(shell, 'do każdej ramki').toContain('i.documentElement.style.setProperty("--vilda-dol-wolny",Dw+"px")');
    expect(shell, 'i na korzeń powłoki (baner sync żyje w dokumencie nadrzędnym)').toContain('o.documentElement.style.setProperty("--vilda-dol-wolny",Dw+"px")');
    expect(shell, 'rezerwa: dock + większy przycisk powłoki (54px na dock+14px) + luz').toContain('var Dw=t>0?Math.round(t)+14+54+4:0;');
  });

  it('każda strona z modułem wołającym VildaDymek ładuje vilda_dymek.js — bez tego komunikat by przepadł', () => {
    const wolajace = ['vilda_summary_cards.js', 'app.js', 'vilda_diet_recommendations.js', 'gh_igf_therapy.js', 'vilda_patient_report.js',
      'vilda_patient_narrative_ui.js', 'vilda_b64_checklist_ui.js', 'vilda_app_helpers.js', 'inline_kalkulator_klirens_04.js'];
    const strony = fs.readdirSync(korzen).filter((f) => f.endsWith('.html'));
    let sprawdzono = 0;
    for (const strona of strony) {
      const html = fs.readFileSync(path.join(korzen, strona), 'utf8');
      const laduje = wolajace.some((m) => html.includes(`src="${m}`));
      if (!laduje) continue;
      sprawdzono += 1;
      expect(html, `${strona} ładuje moduł z dymkiem, więc musi ładować vilda_dymek.js`).toMatch(/src="vilda_dymek\.js\?v=\d+"/);
    }
    expect(sprawdzono, 'kontrola: strażnik naprawdę coś sprawdził').toBeGreaterThanOrEqual(3);
    expect(zrodlo('service-worker-kalorii.js')).toMatch(/'\/vilda_dymek\.js\?v=\d+',/);
  });
});
