import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { korzen, zrodlo } from '../support/silnik-bmi.mjs';

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
const shellCss = zrodlo('vilda_shell.css');

describe('P-MODALE: powłoka chowa dock, gdy modal z iframe\'a sięga pod dock', () => {
  it('vilda_shell.js obserwuje aktywny panel (childList + subtree + class/style/hidden) i przełącza vilda-pane-modal-open', () => {
    expect(shellJs).toContain('classList.toggle("vilda-pane-modal-open",n)');
    expect(shellJs).toMatch(/observe\(e\.body,\{childList:!0,subtree:!0,attributes:!0,attributeFilter:\["class","style","hidden"\]\}\)/);
    // warunek geometryczny: nakładka ≥90% szerokości, ≥60% wysokości okna ramki i sięga POD górną krawędź docka
    expect(shellJs).toMatch(/r\.width>=W\*\.9&&r\.height>=H\*\.6&&fr\.top\+r\.bottom>dr\.top\+1/);
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
  const znalezione = [];
  for (const f of css) {
    const src = fs.readFileSync(path.join(korzen, f), 'utf8');
    const re = /([^{}]+)\{([^{}]*position:\s*fixed;\s*inset:\s*0;[^{}]*)\}/g;
    let m;
    while ((m = re.exec(src))) {
      const z = m[2].match(/z-index:\s*(-?\d+)/);
      if (z) znalezione.push({ plik: f, selektor: m[1].trim().slice(-60), z: Number(z[1]) });
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
