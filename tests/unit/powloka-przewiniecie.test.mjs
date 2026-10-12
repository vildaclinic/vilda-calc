import { describe, expect, it, vi } from 'vitest';
import { powloka } from '../support/powloka-harness.mjs';

// P-PANEL-PRZEWINIECIE (decyzja właściciela 2026-10-12): panel powłoki wraca tam, gdzie go zostawiono.
// Prawdziwy vilda_shell.js na atrapie okna (tests/support/powloka-harness.mjs). Ramka odwzorowuje to, co zmierzono
// w Chromium: ukrycie (display:none) zeruje przewinięcie dokumentu, a ukryta ramka czyta scrollY 0. Tu sprawdzamy
// kolejność i przypadki brzegowe, których e2e nie rozstrzyga deterministycznie: cel nawigacji (także z historii),
// nowy dokument w ramce, kilka przełączeń w jednym zadaniu. Przebieg na prawdziwej powłoce:
// tests/e2e/powloka-przewiniecie-panelu.spec.mjs i powloka-przewiniecie-panelu-mobile.spec.mjs.

function przewijana(frame) {
  const w = frame.contentWindow;
  let y = 0;
  let ukryta = Boolean(frame.hidden);
  Object.defineProperty(frame, 'hidden', {
    configurable: true,
    get: () => ukryta,
    set(v) { ukryta = Boolean(v); if (ukryta) y = 0; },
  });
  Object.defineProperty(w, 'scrollY', { configurable: true, get: () => (ukryta ? 0 : y) });
  w.scrollTo = vi.fn((a, b) => { if (!ukryta) y = typeof a === 'object' ? a.top : b; });
  return { w, przewin: (v) => { y = v; } };
}

function przygotuj(trasa = 'start') {
  const p = powloka();
  p.load('docpro');
  p.shell.navigate(trasa);
  const ramka = p.load(trasa);
  return { p, ramka, ...przewijana(ramka) };
}

describe('vilda_shell.js — panel wraca tam, gdzie go zostawiono (P-PANEL-PRZEWINIECIE)', () => {
  it('powrót: pozycja z chwili ukrycia wraca w tym samym zadaniu, natychmiast (nie płynnie), przed odtworzeniem sesji', () => {
    const { p, w, przewin } = przygotuj();
    // Odcisk sesji zmienia się przy każdym odczycie, więc powrót odtwarza sesję (Gp_p) — jak po wizycie w DocPro.
    let odcisk = 0;
    w.VildaPersistence = { readMainSession: () => ({ odcisk: (odcisk += 1) }) };
    let przewiniecieWChwiliOdtworzeniaSesji = null;
    w.vildaPersistRestoreAll = vi.fn(() => { przewiniecieWChwiliOdtworzeniaSesji = w.scrollY; });
    przewin(679);
    p.shell.navigate('docpro');
    expect(w.scrollY, 'ukryta ramka czyta 0, jak w Chromium').toBe(0);
    p.shell.navigate('start');
    expect(w.scrollTo).toHaveBeenCalledTimes(1);
    expect(w.scrollTo).toHaveBeenCalledWith({ top: 679, behavior: 'instant' });
    expect(w.scrollY).toBe(679);
    expect(w.vildaPersistRestoreAll).toHaveBeenCalledTimes(1);
    expect(przewiniecieWChwiliOdtworzeniaSesji, 'odtworzenie sesji przebudowuje treść już przy odtworzonej pozycji').toBe(679);
  });

  it('kontrola: panel bez przewinięcia — powłoka niczego nie przewija', () => {
    const { p, w } = przygotuj();
    p.shell.navigate('docpro');
    p.shell.navigate('start');
    expect(w.scrollTo).not.toHaveBeenCalled();
  });

  it('cel nawigacji ma pierwszeństwo: z celem pozycja nie wraca, a cel trafia do panelu; potem zwykły powrót odtwarza', () => {
    const { p, ramka, w, przewin } = przygotuj('ustawienia');
    przewin(900);
    p.shell.navigate('docpro');
    p.shell.navigate('ustawienia', true, 'ustawienia.html#settings-section-account');
    expect(w.scrollTo).not.toHaveBeenCalled();
    expect(w.scrollY).toBe(0);
    expect(ramka.contentWindow.__events).toEqual(['/ustawienia.html#settings-section-account']);
    przewin(1500); // tu przewinąłby sam cel (sekcja konta)
    p.shell.navigate('docpro');
    p.shell.navigate('ustawienia');
    expect(w.scrollTo).toHaveBeenCalledWith({ top: 1500, behavior: 'instant' });
    expect(w.scrollY).toBe(1500);
  });

  it('Wstecz: do wpisu bez celu pozycja wraca; do wpisu z celem cel ma pierwszeństwo', () => {
    const { p, ramka, w, przewin } = przygotuj('ustawienia');
    przewin(700);
    p.shell.navigate('docpro');
    p.history.back();
    p.tick(1);
    expect(w.scrollY, 'wpis bez celu').toBe(700);
    p.shell.navigate('ustawienia', true, 'ustawienia.html#settings-section-account');
    przewin(900); // użytkownik przewija dalej od sekcji konta
    p.shell.navigate('docpro');
    w.scrollTo.mockClear();
    p.history.back();
    p.tick(1);
    expect(w.scrollTo, 'wpis z celem').not.toHaveBeenCalled();
    expect(ramka.contentWindow.__events.at(-1)).toBe('/ustawienia.html#settings-section-account');
  });

  it('nowy dokument w ramce (przeładowanie ukrytego panelu) startuje od góry, bez pozycji starego dokumentu', () => {
    const { p, ramka, w, przewin } = przygotuj();
    przewin(679);
    p.shell.navigate('docpro');
    p.shell.reload('start');
    // Pokazanie w trakcie przeładowania: stary dokument jeszcze stoi, ale panel nie jest wczytany.
    p.shell.navigate('start');
    expect(w.scrollTo).not.toHaveBeenCalled();
    przewin(400);
    p.shell.navigate('docpro');
    p.shell.reload('start');
    ramka.contentDocument = p.doc.createElement('iframe').contentDocument; // nowy dokument atrapy
    p.load('start');
    p.shell.navigate('start');
    expect(w.scrollTo).not.toHaveBeenCalled();
  });

  it('kilka przełączeń w jednym zadaniu: pozycja nie przepada', () => {
    const { p, w, przewin } = przygotuj();
    przewin(679);
    p.shell.navigate('docpro');
    p.shell.navigate('start');
    p.shell.navigate('docpro');
    p.shell.navigate('start');
    expect(w.scrollY).toBe(679);
  });

  it('lista pacjentów otwierana z innego panelu (Sn_openPatient): Start pod listą wraca na zapamiętane miejsce', () => {
    const { p, ramka, w, przewin } = przygotuj();
    przewin(679);
    p.shell.navigate('docpro');
    p.shell.openPatientsInStart();
    expect(ramka.contentWindow.VildaAuthUI.showPatientsList).toHaveBeenCalledTimes(1);
    expect(w.scrollY).toBe(679);
  });
});
