// P-STYLE krok 6: inwentarz progów szerokości (`min-width`/`max-width` w `@media`) we wszystkich źródłach stylów stron —
// arkuszach, blokach <style> i arkuszu wstrzykiwanym (tests/support/skorka-css.mjs, zrodlaStron). Progi nie są
// ujednolicane (zmiana progu zmienia układ przy części szerokości okna — decyzja właściciela); strażnik pilnuje, by
// nowa reguła używała progu już obecnego w inwentarzu (tests/fixtures/breakpointy.json).
import fs from 'node:fs';
import path from 'node:path';
import { korzen, parsuj } from './szklo-css.mjs';
import { zrodlaStron } from './skorka-css.mjs';

const czytajDomyslnie = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');

/** Wartość progu w pikselach (em/rem liczone po 16 px) — do sortowania. */
export function wPikselach(prog) {
  const m = /^([\d.]+)(px|em|rem)$/.exec(prog);
  return m ? parseFloat(m[1]) * (m[2] === 'px' ? 1 : 16) : Number.NaN;
}

/** Progi szerokości z zapytania @media: [{ rodzaj: 'min'|'max', prog: '700px' }]. */
export function progiZapytania(zapytanie) {
  return [...zapytanie.matchAll(/\((min|max)-width\s*:\s*([\d.]+)(px|em|rem)\)/g)].map((m) => ({ rodzaj: m[1], prog: `${m[2]}${m[3]}` }));
}

/**
 * Inwentarz: Map prog → { reguly, min: Set źródeł, max: Set źródeł } oraz lista zapytań @media. Źródła jak w analizie
 * skórki (każde raz), reguły liczone z zagnieżdżonych kontekstów @media.
 */
export function inwentarzBreakpointow({ czytaj = czytajDomyslnie, strony = null } = {}) {
  const zrodla = zrodlaStron(czytaj, strony);
  const teksty = new Map();
  for (const lista of zrodla.values()) for (const z of lista) if (!teksty.has(z.id)) { try { teksty.set(z.id, z.typ === 'style' ? z.css : czytaj(z.nazwa)); } catch { /* brak pliku */ } }
  const progi = new Map();
  const zapytania = new Map();
  for (const [id, css] of teksty) {
    for (const r of parsuj(css)) for (const k of r.kontekst) {
      if (!/^@media/.test(k)) continue;
      const q = k.replace(/\s+/g, ' ').trim();
      if (!zapytania.has(q)) zapytania.set(q, { zrodla: new Set(), reguly: 0 });
      zapytania.get(q).zrodla.add(id); zapytania.get(q).reguly++;
      for (const { rodzaj, prog } of progiZapytania(q)) {
        if (!progi.has(prog)) progi.set(prog, { reguly: 0, min: new Set(), max: new Set() });
        progi.get(prog)[rodzaj].add(id); progi.get(prog).reguly++;
      }
    }
  }
  const posortowane = new Map([...progi].sort((a, b) => wPikselach(a[0]) - wPikselach(b[0]) || a[0].localeCompare(b[0])));
  return { progi: posortowane, zapytania };
}
