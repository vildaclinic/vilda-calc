// P-STYLE krok 7: reguły NIEOSIĄGALNE — część selektora, w której (poza pseudoklasami funkcyjnymi i selektorami atrybutu)
// stoi nazwa klasy albo id nieobecna nigdzie w kodzie (HTML poza blokami <style>, JS; z regułą sklejania z tokenu-prefiksu
// i sufiksu z łącznikiem — `nieobecnosc()` z wiedzy o DOM, rata 4b bis), nie dopasowuje żadnego elementu. Reguła, której
// każda część jest nieosiągalna, znika w całości; nieosiągalna część znika z listy selektorów. Źródła: arkusze i bloki
// <style> stron z tests/support/skorka-css.mjs (zrodlaStron), więc kryterium jest globalne (jedna wiedza dla wszystkich stron).
import fs from 'node:fs';
import path from 'node:path';
import { korzen, parsuj, usunMartwe } from './szklo-css.mjs';
import { nieobecnosc, wiedzaDom } from './wiedza-dom.mjs';
import { zrodlaStron } from './skorka-css.mjs';

/** Części listy selektorów (podział po przecinku poza nawiasami i cudzysłowami). */
export function czesciSelektora(prelude) {
  const out = [];
  let d = 0;
  let cur = '';
  let cudz = null;
  for (const ch of prelude) {
    if (cudz) { cur += ch; if (ch === cudz) cudz = null; continue; }
    if (ch === '"' || ch === "'") { cudz = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') d++;
    else if (ch === ')' || ch === ']') d--;
    if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Nazwy klas i id w części selektora, które muszą wystąpić na elementach, by część coś dopasowała: poza pseudoklasami
 * funkcyjnymi (`:not(.x)` dopasowuje wszystko poza `.x`; `:is`/`:where`/`:has` — ostrożnie pomijane) i poza selektorami
 * atrybutu. Część ze znakiem ucieczki (`.sm\:flex`) nie jest oceniana (pusta lista).
 */
export function nazwyCzesci(czesc) {
  if (czesc.includes('\\')) return [];
  let t = '';
  let d = 0;
  let wAtr = false;
  for (const ch of czesc) {
    if (wAtr) { if (ch === ']') wAtr = false; continue; }
    if (d > 0) { if (ch === '(') d++; else if (ch === ')') d--; continue; }
    if (ch === '[') { wAtr = true; t += ' '; continue; }
    if (ch === '(') { d++; t += ' '; continue; }
    t += ch;
  }
  return [...t.matchAll(/[.#]([A-Za-z_-][\w-]*)/g)].map((m) => m[1]);
}

const czytajDomyslnie = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');

/**
 * Analiza wszystkich źródeł stylów stron: dla każdego źródła (arkusz, blok <style>, arkusz wstrzykiwany) lista reguł
 * nieosiągalnych w całości (`martwe`: każda deklaracja) i nieosiągalnych części (`martweCzesci`), w kształcie, jaki
 * przyjmuje usunMartwe(). Zwraca { zrodla: [{ id, typ, nazwa, css, reguly, martwe, martweCzesci, opis }], nieobecna }.
 */
export function analizaNieosiagalnych({ czytaj = czytajDomyslnie, wiedza = null, strony = null } = {}) {
  const w = wiedza || wiedzaDom(czytaj);
  const nieobecna = nieobecnosc(w.tokeny);
  const zrodla = zrodlaStron(czytaj, strony);
  const wyniki = [];
  const widziane = new Set();
  for (const lista of zrodla.values()) {
    for (const z of lista) {
      if (widziane.has(z.id)) continue;
      widziane.add(z.id);
      let css;
      try { css = z.typ === 'style' ? z.css : czytaj(z.nazwa); } catch { continue; }
      const reguly = parsuj(css);
      const martwe = [];
      const martweCzesci = [];
      const opis = [];
      for (const r of reguly) {
        if (r.kontekst.some((k) => /^@(?:keyframes|font-face|page)/.test(k))) continue;
        const czesci = czesciSelektora(r.prelude);
        if (!czesci.length) continue;
        const ocena = czesci.map((c) => nazwyCzesci(c).filter(nieobecna));
        const numery = ocena.map((n, i) => (n.length ? i : -1)).filter((i) => i >= 0);
        if (!numery.length) continue;
        const nazwy = [...new Set(ocena.flat())];
        if (numery.length === czesci.length) {
          if (!r.deklaracje.length) continue; // pusta reguła: usunMartwe nie ma czego usunąć
          for (const d of r.deklaracje) martwe.push({ regula: r, deklaracja: d });
          opis.push({ prelude: r.prelude, kontekst: r.kontekst, cala: true, deklaracje: r.deklaracje.length, nazwy });
        } else {
          for (const nr of numery) martweCzesci.push({ regula: r, nr, nadpisanie: null });
          opis.push({ prelude: r.prelude, kontekst: r.kontekst, cala: false, czesci: numery.map((i) => czesci[i]), nazwy });
        }
      }
      wyniki.push({ id: z.id, typ: z.typ, nazwa: z.nazwa, css, reguly: reguly.length, martwe, martweCzesci, opis });
    }
  }
  return { zrodla: wyniki, nieobecna };
}

/** Tekst źródła po usunięciu reguł i części nieosiągalnych (arkusz: cały plik; blok <style>: treść bloku). */
export function usunNieosiagalne(zrodlo) {
  const wynik = usunMartwe(zrodlo.css, zrodlo.martwe, zrodlo.martweCzesci);
  // po usunięciu ostatniej reguły pliku nie zostaje pusty wiersz na końcu
  return { ...wynik, text: wynik.text.replace(/\n{2,}$/, '\n') };
}

/** Podmienia treść bloku <style> w HTML strony; blok musi występować dokładnie raz. */
export function podmienBlok(html, stary, nowy) {
  const czesci = html.split(stary);
  if (czesci.length !== 2) throw new Error(`blok <style> występuje ${czesci.length - 1} razy`);
  return czesci.join(nowy);
}
