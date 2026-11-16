import { describe, expect, it } from 'vitest';
import { zwartyCss } from '../support/css-zwarty.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { funkcjaZ, korzen, zrodlo } from '../support/silnik-bmi.mjs';

// P-MODALE — zgłoszenie właściciela (2026-09-17): modale (epikryza, „Jak chronimy dane?", „Siła
// szyfrowania"…) wchodziły w konflikt z dockiem i strzałką w trybie mobilnym. Pomiar pokazał, że
// TYLKO w powłoce app.html: modal otwarty wewnątrz iframe'a nie może zasłonić docka rodzica
// (żaden z-index w iframie tego nie zmieni), więc dolne ~84 px — u epikryzy stopka z „Anuluj /
// Dalej" — lądowały pod dockiem. Na stronach bezpośrednich nakładki mają z-index ponad dockiem
// (1100) i strzałką (1201) — z jednym wyjątkiem (karta pacjenta klirensu, z-index 1000).
//
// Zasada po naprawie: JEDNO miejsce — powłoka obserwuje aktywny panel i gdy widoczna nakładka
// position:fixed sięga poniżej górnej krawędzi docka, dodaje sobie `vilda-pane-modal-open`
// (CSS chowa dock, FAB i strzałkę przez visibility, nie display — pudełko docka zostaje, więc
// `--vilda-shell-dock-h` / `--vilda-dol-wolny` się nie zmieniają). Arkusze terminarza i ekrany auth
// kończą się dokładnie na krawędzi docka, więc warunek ich nie łapie. Ten plik pilnuje obu końców.

const shellJs = zrodlo('vilda_shell.js');
// arkusz jest sformatowany (P-STYLE rata 1); wzorzec niżej jest w postaci zwartej
const shellCss = zwartyCss(zrodlo('vilda_shell.css'));

// Real shell projection, with only viewport/DOM measurements supplied by the
// fixture. The non-modal M1 canvas deliberately has full viewport dimensions.
function projectDock(nodes, initiallyHidden = false) {
  const classes = new Set(initiallyHidden ? ['vilda-pane-modal-open'] : []);
  const host = {
    getElementById: id => id === 'mobileBottomDock' ? { getBoundingClientRect: () => ({ height: 84, top: 760 }) } : null,
    documentElement: { classList: { toggle(name, value) { if (value) classes.add(name); else classes.delete(name); } } },
  };
  const doc = { body: {}, querySelectorAll: () => nodes };
  const win = { innerWidth: 390, innerHeight: 844, getComputedStyle: node => node.css };
  const frame = { contentDocument: doc, contentWindow: win, getBoundingClientRect: () => ({ top: 0, bottom: 844 }) };
  new Function('c', 'l', 'o', `${funkcjaZ(shellJs, 'Mw')}; Mw();`)('start', { start: { frame } }, host);
  return classes.has('vilda-pane-modal-open');
}

function overlay({ preview = false, parent = null, bottom = 844, height = bottom, tagName, open, css = {} } = {}) {
  return {
    tagName, open,
    css: { position: 'fixed', display: 'block', visibility: 'visible', opacity: '1', ...css },
    getBoundingClientRect: () => ({ width: 390, height, bottom }),
    closest: selector => selector === '.vilda-lab-point-preview' && (preview || parent?.closest(selector)) ? {} : null,
  };
}

describe('P-MODALE: readonly result preview keeps shell navigation available', () => {
  it('does not mistake the full-viewport transparent M1 layer for a modal, and clears an old hidden state', () => {
    expect(projectDock([overlay({ preview: true })], true)).toBe(false);
  });
  it('ignores the presentation canvas inside that same M1 layer', () => {
    const preview = overlay({ preview: true });
    expect(projectDock([overlay({ parent: preview })])).toBe(false);
  });
  it('still hides the dock for a real full-screen detail dialog alongside the preview', () => {
    expect(projectDock([overlay({ preview: true }), overlay()])).toBe(true);
  });
  it('does not exempt other transparent fixed overlays or arbitrary popovers', () => {
    expect(projectDock([overlay({ css: { pointerEvents: 'none', backgroundColor: 'transparent' } })])).toBe(true);
  });
  it('keeps the dock for an overlay that ends at the dock boundary', () => {
    expect(projectDock([overlay({ bottom: 760 })])).toBe(false);
  });
});

describe('P-MODALE: powłoka chowa dock, gdy modal z iframe\'a sięga pod dock', () => {
  it('hides the dock for an open native dialog in a clipped iframe, also during its first transparent animation frame', () => {
    expect(projectDock([overlay({ height: 220, tagName: 'DIALOG', open: true, css: { opacity: '0' } })])).toBe(true);
  });
  it('keeps the dock for a closed native dialog or a small non-modal panel', () => {
    expect(projectDock([overlay({ height: 220, tagName: 'DIALOG', open: false })])).toBe(false);
    expect(projectDock([overlay({ height: 220 })])).toBe(false);
  });

  it('vilda_shell.js obserwuje aktywny panel (childList + subtree + class/style/hidden/open) i przełącza vilda-pane-modal-open', () => {
    expect(shellJs).toContain('classList.toggle("vilda-pane-modal-open",n)');
    expect(shellJs).toMatch(/observe\(e\.body,\{childList:!0,subtree:!0,attributes:!0,attributeFilter:\["class","style","hidden","open"\]\}\)/);
    // warunek geometryczny: nakładka ≥90% szerokości, ≥60% wysokości okna ramki i sięga POD górną krawędź docka
    expect(shellJs).toMatch(/r\.width>=W\*\.9&&\(r\.height>=H\*\.6\|\|el\.tagName==="DIALOG"&&el\.open\)&&fr\.top\+r\.bottom>dr\.top\+1/);
    // dławik: jeden pomiar na klatkę, nie na każdą mutację
    expect(shellJs).toMatch(/Mr\|\|\(Mr=a\.requestAnimationFrame\(/);
    // pomiar także po zmianie rozmiaru okna (obrót telefonu)
    expect(shellJs).toContain('a.addEventListener("resize",Mz)');
  });

  it('vilda_shell.css chowa dock, FAB i strzałkę przez visibility (nie display) pod tą klasą', () => {
    const regula = shellCss.match(/html\.vilda-pane-modal-open #mobileBottomDock,html\.vilda-pane-modal-open #appShellTermFab,html\.vilda-pane-modal-open #appShellScrollTop\{([^}]*)\}/);
    expect(regula, 'reguła dla vilda-pane-modal-open').toBeTruthy();
    expect(regula[1]).toContain('visibility:hidden!important');
    expect(regula[1]).toContain('pointer-events:none!important');
    expect(regula[1], 'display:none zmieniłoby pomiar wysokości docka (--vilda-shell-dock-h) i przesunęło treść ramek').not.toContain('display');
  });

  it('kontrola negatywna: ta klasa nie jest ustawiana nigdzie poza powłoką', () => {
    const pliki = fs.readdirSync(korzen).filter((f) => /\.(js|css|html)$/.test(f) && f !== 'vilda_shell.js' && f !== 'vilda_shell.css');
    const winni = pliki.filter((f) => fs.readFileSync(path.join(korzen, f), 'utf8').includes('vilda-pane-modal-open'));
    expect(winni).toEqual([]);
  });
});

describe('P-MODALE: strony bezpośrednie — każda pełnoekranowa nakładka w CSS stoi ponad dockiem (1100) i strzałką (1201)', () => {
  // Reguły `position:fixed; inset:0` z jawnym z-index w plikach CSS. Nakładki tworzone w JS mają
  // z-index ≥ 9999 (sprawdzone ręcznie 2026-09-17); tu pilnujemy plików CSS, gdzie siedział wyjątek.
  const css = fs.readdirSync(korzen).filter((f) => f.endsWith('.css'));
  // z-index bywa tokenem (P-STYLE rata 2a: `z-index: var(--z-…)`) — wartość liczbowa jest w :root style.css
  const zmienneRoot = new Map();
  for (const blok of fs.readFileSync(path.join(korzen, 'style.css'), 'utf8').matchAll(/^:root \{\n([\s\S]*?)\n\}/gm)) {
    for (const d of blok[1].matchAll(/^\s*--([A-Za-z0-9_-]+):\s*([^;]+);?$/gm)) zmienneRoot.set(d[1], d[2].trim());
  }
  const znalezione = [];
  for (const f of css) {
    const src = fs.readFileSync(path.join(korzen, f), 'utf8');
    const re = /([^{}]+)\{([^{}]*position:\s*fixed;\s*inset:\s*0;[^{}]*)\}/g;
    let m;
    while ((m = re.exec(src))) {
      const z = m[2].match(/z-index:\s*(?:(-?\d+)|var\(--([A-Za-z0-9_-]+)\))/);
      if (!z) continue;
      const wartosc = z[1] !== undefined ? Number(z[1]) : Number(zmienneRoot.get(z[2]));
      znalezione.push({ plik: f, selektor: m[1].trim().slice(-60), z: wartosc });
    }
  }
  it('lista nie jest pusta (kontrola: regex naprawdę coś łapie)', () => {
    expect(znalezione.length).toBeGreaterThanOrEqual(3);
    expect(znalezione.some((x) => x.plik === 'clcr_ui_workflow.css' && /clcr-patient-card/.test(x.selektor))).toBe(true);
  });
  it.each(znalezione.map((x) => [x.plik, x.selektor, x.z]))('%s → %s: z-index %i > 1201', (plik, selektor, z) => {
    expect(z).toBeGreaterThan(1201);
  });
});
