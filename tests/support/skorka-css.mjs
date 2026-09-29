// P-STYLE rata 4b (decyzja właściciela 2026-09-28: skórka szkła jako baza). Skórka `.liquid-ios26` jest zawsze
// włączona, więc reguła skórki `.liquid-ios26 S { p: v !important }` opisuje wygląd bazowy elementów S. ZŁOŻENIE
// takiej deklaracji to zapisanie jej jako `S { p: v }` w tym samym miejscu arkusza (bez prefiksu skórki i bez
// !important). Złożenie jest BEZPIECZNE, gdy dla każdej innej deklaracji tej samej własności (lub własności
// o wspólnym longhandzie) w kaskadzie każdej strony, na której arkusz skórki jest ładowany, zwycięzca porównania
// „przed” i „po” jest ten sam: ważność, potem swoistość, potem kolejność w kaskadzie strony (linki i bloki <style>
// w kolejności dokumentu). Konkurentem jest każda reguła, której skrajne złożenie selektora nie jest dowodliwie
// rozłączne ze skrajnym złożeniem selektora skórki (inny typ elementu, inny #id, inny pseudoelement, inna wartość
// tego samego atrybutu, klasa/id na innym typie wg wiedzy o DOM); kontekst @media/@supports nie zwalnia z porównania
// (zachowawczo). Konflikt nie liczy się, gdy trzecia deklaracja o selektorze pokrywającym konkurenta i tych samych
// longhandach wygrywa z obojgiem przed i po złożeniu (rozstrzyga o wyniku niezależnie od złożenia). Analiza jest
// PER CZĘŚĆ selektora: `button` może się złożyć, gdy `input[type=submit]` z tej samej reguły zostaje nadpisaniem —
// reguła dzieli się wtedy na regułę bazową i resztę skórki o tych samych wartościach. Deklaracje jednej reguły
// o wspólnych longhandach (np. `backdrop-filter` i `-webkit-backdrop-filter`) składa się razem albo wcale.
// Własności behawioralne (display, position, wymiary, przezroczystość, transformacje…) są poza ratą 4b: skrypty
// aplikacji ustawiają je inline, a !important skórki wygrywa dziś z takim stylem inline — złożenie zmieniłoby to.
// Analiza nie widzi stylów inline ustawianych przez skrypty ani arkuszy wstrzykiwanych z JS — to sprawdza przebieg
// w Chromium (node tests/scripts/zloz-skorke-css.mjs --dom), a wynik trafia do tests/fixtures/skorka-nadpisania.json.
import fs from 'node:fs';
import path from 'node:path';
import { KLASA_SKORKI, arkuszeAplikacji, bezSkorki, korzen, parsuj, pokrywaCzesc } from './szklo-css.mjs';
import { canonicalSelector, canonicalSelectorList, specificity, splitTopLevel } from '../../design-system/lib/css.mjs';
import { mozliweTypy, rozlaczne, wiedzaDom, zlozenieSkrajne } from './wiedza-dom.mjs';
import { ALIASY, longhandy } from './longhandy.mjs';

export { longhandy } from './longhandy.mjs';

export { faktyDom, mozliweTypy, rozlaczne, wiedzaDom, zlozenieSkrajne } from './wiedza-dom.mjs';

export const KLASY_TRYBOW = /\.(?:high-contrast-level|dark-bg-level|glass-level)-\d/;

/** Własności poza ratą 4b (skrypty ustawiają je inline; skórka z !important dziś to przykrywa). */
export const WLASNOSCI_BEHAWIORALNE = new Set([
  'display', 'visibility', 'pointer-events', 'opacity', 'transform', 'position', 'top', 'right', 'bottom', 'left', 'inset',
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'z-index', 'overflow', 'overflow-x', 'overflow-y',
  'animation', 'transition',
]);

/** Arkusze dokładane do strony przez skrypt (link dopisywany na końcu <head>), gdy strona sama ich nie linkuje. */
export const WSTRZYKIWANE = [{ skrypt: 'vilda_chrome.js', arkusz: 'vilda_auth_ui.css' }];

/** Czy dwie własności mają wspólny longhand (konkurują o ten sam wynik kaskady). */
export function nakladajaSie(a, b) {
  const s = new Set(longhandy(a));
  return longhandy(b).some((x) => s.has(x));
}

/**
 * Selektor po złożeniu: z pierwszego złożenia znika `.liquid-ios26`; złożenie, które po tym zostaje puste albo jest
 * gołym `body`, znika razem z kombinatorem potomka (każdy element jest w body), a przed `>`/`+`/`~` albo na końcu
 * zostaje jako `body`. Zwraca null, gdy klasa skórki jest gdzie indziej niż w pierwszym złożeniu.
 */
export function zlozony(czesc) {
  const s = czesc.trim();
  const klasa = `.${KLASA_SKORKI}`;
  if (!s.includes(klasa)) return null;
  const m = /^([^\s>+~]+)(.*)$/s.exec(s);
  if (!m) return null;
  const [, pierwsze, reszta] = m;
  if (reszta.includes(klasa) || !pierwsze.includes(klasa)) return null;
  const zdjete = pierwsze.split(klasa).join('');
  if (zdjete === '' || zdjete === 'body' || /^(?:body)?(?::[:a-zA-Z-]+)+$/.test(zdjete)) {
    const r = /^\s+(?![>+~])(.+)$/s.exec(reszta);
    if (r) return r[1].trim();
    return `body${zdjete.replace(/^body/, '')}${reszta.replace(/^\s+/, ' ')}`.trim();
  }
  return `${zdjete}${reszta}`;
}

/**
 * Źródła stylów każdej strony w kolejności dokumentu: linki `<link rel=stylesheet href=X.css>` i bloki `<style>`,
 * plus arkusze wstrzykiwane przez skrypt (na końcu <head>), gdy strona ich nie linkuje. Zwraca Map strona →
 * [{ id, typ: 'link'|'style'|'wstrzykniety', nazwa, css (bloki), wHead }].
 */
export function zrodlaStron(czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8'), strony = null) {
  const lista = strony || fs.readdirSync(korzen).filter((f) => f.endsWith('.html')).sort();
  const wynik = new Map();
  for (const strona of lista) {
    const html = czytaj(strona);
    const body = html.indexOf('<body');
    const zrodla = [];
    let nr = 0;
    for (const m of html.matchAll(/<link\b[^>]*>|<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
      const wHead = body < 0 || m.index < body;
      if (m[0].startsWith('<link')) {
        if (!/\brel=["']stylesheet["']/i.test(m[0])) continue;
        const href = /\bhref=["']([a-z0-9_-]+\.css)(?:\?[^"']*)?["']/i.exec(m[0]);
        if (!href) continue;
        zrodla.push({ id: href[1], typ: 'link', nazwa: href[1], css: null, wHead });
      } else {
        zrodla.push({ id: `${strona}#${nr++}`, typ: 'style', nazwa: strona, css: m[1], wHead });
      }
    }
    if (!zrodla.some((z) => z.typ === 'link')) continue;
    for (const w of WSTRZYKIWANE) {
      if (!new RegExp(`<script\\b[^>]*\\bsrc=["']${w.skrypt.replace('.', '\\.')}`).test(html) || zrodla.some((z) => z.id === w.arkusz)) continue;
      const ostatniHead = zrodla.map((z) => z.wHead).lastIndexOf(true);
      zrodla.splice(ostatniHead + 1, 0, { id: w.arkusz, typ: 'wstrzykniety', nazwa: w.arkusz, css: null, wHead: true });
    }
    wynik.set(strona, zrodla);
  }
  return wynik;
}

/** Klucz deklaracji skórki w fixture: arkusz | kontekst | selektor | własność#numer (numer wśród tej samej własności w regule). */
export function kluczDeklaracji(arkusz, regula, deklaracja) {
  const nr = regula.deklaracje.filter((d) => d.prop === deklaracja.prop).indexOf(deklaracja);
  return `${arkusz}|${regula.kontekst.join('|')}|${regula.prelude}|${deklaracja.prop}#${nr}`;
}

/** Klucz pary (deklaracja, część selektora): klucz deklaracji | część#numer. */
export function kluczPary(arkusz, regula, deklaracja, nr) {
  return `${kluczDeklaracji(arkusz, regula, deklaracja)}|część#${nr}`;
}

function czyRegulaSkorki(prelude) {
  const czesci = splitTopLevel(prelude, ',').map((p) => p.trim()).filter(Boolean);
  return czesci.length > 0 && czesci.every((p) => p.includes(`.${KLASA_SKORKI}`)) && !KLASY_TRYBOW.test(prelude);
}

/** Czy reguła jest czystą regułą skórki: każda część z klasą skórki w pierwszym złożeniu, bez klas trybów. */
export function regulaSkorki(prelude) {
  if (!czyRegulaSkorki(prelude)) return false;
  return splitTopLevel(prelude, ',').map((p) => p.trim()).every((p) => zlozony(p) != null);
}

function wygrywa(x, y) {
  if (x.wazne !== y.wazne) return x.wazne;
  if (x.spec !== y.spec) return x.spec > y.spec;
  if (x.poz[0] !== y.poz[0]) return x.poz[0] > y.poz[0];
  return x.poz[1] > y.poz[1];
}

/** Część bez klasy skórki w postaci kanonicznej (dla pokrycia między regułami). */
function czescBez(tekst) {
  const z = zlozony(tekst) ?? bezSkorki(tekst) ?? tekst;
  return canonicalSelector(z);
}

/**
 * Analiza złożenia skórki — per para (deklaracja, część selektora).
 *   zrodla      — Map strona → źródła (zrodlaStron()); css linków czyta `czytaj(nazwa)`;
 *   wykluczenia — Map klucz (pary albo deklaracji) → powód (decyzje z fixture, poza analizą);
 *   dynamiczne  — Map strona → [{ pozycja, css }] arkusze wstrzykiwane z JS (z przebiegu --dom);
 *   wiedza      — wiedzaDom().
 * Zwraca { arkusze, kandydaci: [{ arkusz, regula, deklaracja, nr, klucz }], zlozone (bezpieczne pary),
 *          pozostale: [{ ...para, powod, szczegoly }], obecnosc }.
 */
export function analizaSkorki({ zrodla = zrodlaStron(), czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8'), wykluczenia = new Map(), dynamiczne = null, wiedza = wiedzaDom() } = {}) {
  // 1. źródła z regułami (arkusz raz, blok <style> per strona) i obecność na stronach z pozycją
  const teksty = new Map();
  const obecnosc = new Map();
  const przygotuj = (id, typ, nazwa, css) => {
    if (teksty.has(id)) return teksty.get(id);
    const reguly = parsuj(css).map((r, indeks) => ({ ...r, zrodlo: id, indeks, czesci: splitTopLevel(r.prelude, ',').map((p) => p.trim()).filter(Boolean).map((tekst) => ({ tekst, spec: specificity(tekst), skrajne: zlozenieSkrajne(tekst), bez: czescBez(tekst) })) }));
    const z = { id, typ, nazwa, css, reguly };
    teksty.set(id, z);
    return z;
  };
  for (const [strona, lista] of zrodla) {
    const pelna = [...lista];
    for (const d of (dynamiczne && dynamiczne.get(strona)) || []) pelna.splice(Math.min(d.pozycja, pelna.length), 0, { id: `${strona}#dyn${d.pozycja}${d.arkusz ? `:${d.arkusz}` : ''}`, typ: 'dynamiczny', nazwa: strona, css: d.css });
    pelna.forEach((z, pozycja) => {
      let css = z.css;
      if (css == null) { try { css = czytaj(z.nazwa); } catch { return; } }
      przygotuj(z.id, z.typ, z.nazwa, css);
      if (!obecnosc.has(z.id)) obecnosc.set(z.id, new Map());
      obecnosc.get(z.id).set(strona, pozycja);
    });
  }
  // 2. indeks deklaracji po longhandach
  const indeks = new Map();
  for (const z of teksty.values()) for (const r of z.reguly) for (const d of r.deklaracje) for (const l of longhandy(d.prop)) { if (!indeks.has(l)) indeks.set(l, []); indeks.get(l).push({ zrodlo: z.id, regula: r, deklaracja: d }); }
  // 3. kandydaci: pary (deklaracja, część) czystych reguł skórki w arkuszach (nie w blokach <style>)
  const kandydaci = [];
  const pozostale = [];
  const stan = new Map(); // klucz pary → 'kandydat' | powód
  const paraKlucz = new Map(); // deklaracja → [klucze par po częściach]
  const arkusze = new Map();
  for (const z of teksty.values()) {
    if (z.typ !== 'link' && z.typ !== 'wstrzykniety') continue;
    arkusze.set(z.id, z);
    for (const r of z.reguly) {
      if (!regulaSkorki(r.prelude)) continue;
      for (const c of r.czesci) { c.zlozony = zlozony(c.tekst); c.specZlozony = specificity(c.zlozony); }
      for (const d of r.deklaracje) {
        const kluczD = kluczDeklaracji(z.id, r, d);
        paraKlucz.set(d, []);
        r.czesci.forEach((c, nr) => {
          const klucz = kluczPary(z.id, r, d, nr);
          paraKlucz.get(d).push(klucz);
          const k = { arkusz: z.id, regula: r, deklaracja: d, nr, klucz };
          kandydaci.push(k);
          const wykl = wykluczenia.get(klucz) ?? wykluczenia.get(kluczD);
          if (wykl) { stan.set(klucz, wykl); pozostale.push({ ...k, powod: wykl.split(':')[0], szczegoly: wykl }); }
          else if (WLASNOSCI_BEHAWIORALNE.has(d.prop)) { stan.set(klucz, 'behawioralna'); pozostale.push({ ...k, powod: 'behawioralna', szczegoly: d.prop }); }
          else stan.set(klucz, 'kandydat');
        });
      }
    }
  }
  const jestKandydatem = (klucz) => stan.get(klucz) === 'kandydat';
  const kluczCzesci = (d, nr) => (paraKlucz.get(d) || [])[nr];
  const wartosc = (v) => v.replace(/\s+/g, ' ').trim().toLowerCase();
  const wlasnosc = (p) => (p.startsWith('--') ? p : (ALIASY[p.replace(/^-(?:webkit|moz|ms|o)-/, '')] || p.replace(/^-(?:webkit|moz|ms|o)-/, '')));
  // Dla elementów pasujących do części i reguły K i do części j konkurenta liczy się najsilniejsza część K, która
  // pasuje do wszystkich takich elementów: część o tym samym przedrostku, której skrajne złożenie zawiera proste
  // selektory obu (np. `header._glass` przy porównaniu `header` z `._glass`).
  const czesciWspolne = (K, i, zj) => K.czesci.map((c, n) => n).filter((n) => n === i || (K.czesci[n].skrajne.przedrostek === K.czesci[i].skrajne.przedrostek && [...K.czesci[i].skrajne.proste, ...zj.proste].every((p) => K.czesci[n].skrajne.proste.has(p))));
  // stan deklaracji d reguły R na częściach `czesci` w świecie „po”: część złożona (wg `zlozona(nr)`) jest nieważna
  // o swoistości bez skórki; jeśli jakaś część zostaje, a d jest ważna, liczy się ona (ważne bije nieważne)
  const stanPrzed = (R, czesci, d) => ({ wazne: d.important, spec: Math.max(...czesci.map((n) => R.czesci[n].spec)) });
  const stanPo = (R, czesci, d, zlozona) => {
    const zostaja = czesci.filter((n) => !zlozona(n));
    if (!zostaja.length) return { wazne: false, spec: Math.max(...czesci.map((n) => R.czesci[n].specZlozony ?? R.czesci[n].spec)) };
    if (d.important) return { wazne: true, spec: Math.max(...zostaja.map((n) => R.czesci[n].spec)) };
    return { wazne: false, spec: Math.max(...czesci.map((n) => (zlozona(n) ? R.czesci[n].specZlozony : R.czesci[n].spec))) };
  };
  const pamiecPokrycia = new Map();
  const pokrywaZPamiecia = (P, B) => { const k = `${P}\u0000${B}`; if (!pamiecPokrycia.has(k)) pamiecPokrycia.set(k, pokrywaCzesc(P, B, wiedza)); return pamiecPokrycia.get(k); };
  // 4. konkurent zmieniający wynik pary (d, i) reguły K; `zalozenie(klucz)` mówi, czy inna para liczy się jako złożona
  const konkurent = (k, zalozenie) => {
    const { arkusz, regula: K, deklaracja: d, nr: i } = k;
    const stronyK = obecnosc.get(arkusz);
    const widziane = new Set();
    const zlozonaK = (nr) => nr === i || (kluczCzesci(d, nr) ? zalozenie(kluczCzesci(d, nr)) : false);
    for (const l of longhandy(d.prop)) {
      for (const e of indeks.get(l) || []) {
        if (e.regula === K || widziane.has(e.deklaracja)) continue;
        widziane.add(e.deklaracja);
        // ta sama własność o tej samej wartości: kto by nie wygrał, wynik jest ten sam
        if (wlasnosc(e.deklaracja.prop) === wlasnosc(d.prop) && wartosc(e.deklaracja.value) === wartosc(d.value)) continue;
        const stronyR = obecnosc.get(e.zrodlo);
        const wspolne = [...stronyK].filter(([s]) => stronyR.has(s));
        if (!wspolne.length) continue;
        const R = e.regula;
        const zlozonaR = (nr) => (kluczCzesci(e.deklaracja, nr) ? zalozenie(kluczCzesci(e.deklaracja, nr)) : false);
        for (let j = 0; j < R.czesci.length; j++) {
          if (rozlaczne(K.czesci[i].skrajne, R.czesci[j].skrajne, wiedza)) continue;
          const iK = czesciWspolne(K, i, R.czesci[j].skrajne);
          const jR = czesciWspolne(R, j, K.czesci[i].skrajne);
          for (const [strona, pozK] of wspolne) {
            const pozR = stronyR.get(strona);
            const dPrzed = { ...stanPrzed(K, iK, d), poz: [pozK, K.indeks] };
            const dPo = { ...stanPo(K, iK, d, zlozonaK), poz: [pozK, K.indeks] };
            const ePrzed = { ...stanPrzed(R, jR, e.deklaracja), poz: [pozR, R.indeks] };
            const ePo = { ...stanPo(R, jR, e.deklaracja, zlozonaR), poz: [pozR, R.indeks] };
            const przed = wygrywa(dPrzed, ePrzed);
            const po = wygrywa(dPo, ePo);
            if (przed === po) continue;
            // trzecia deklaracja pokrywająca konkurenta, o wszystkich wspólnych longhandach, wygrywająca z obojgiem
            // przed i po: rozstrzyga niezależnie od złożenia
            const wspolneLonghandy = longhandy(d.prop).filter((x) => longhandy(e.deklaracja.prop).includes(x));
            const dominator = (() => {
              const kandydaciF = new Set();
              for (const x of wspolneLonghandy) for (const f of indeks.get(x) || []) kandydaciF.add(f);
              for (const f of kandydaciF) {
                const F = f.regula;
                if (F === K || F === R) continue;
                const lf = longhandy(f.deklaracja.prop);
                if (!wspolneLonghandy.every((x) => lf.includes(x))) continue;
                const stronyF = obecnosc.get(f.zrodlo);
                if (!stronyF || !stronyF.has(strona)) continue;
                const pozF = stronyF.get(strona);
                const zlozonaF = (nr) => (kluczCzesci(f.deklaracja, nr) ? zalozenie(kluczCzesci(f.deklaracja, nr)) : false);
                for (let m = 0; m < F.czesci.length; m++) {
                  if (!pokrywaZPamiecia(F.czesci[m].bez, R.czesci[j].bez)) continue;
                  const fPrzed = { ...stanPrzed(F, [m], f.deklaracja), poz: [pozF, F.indeks] };
                  const fPo = { ...stanPo(F, [m], f.deklaracja, zlozonaF), poz: [pozF, F.indeks] };
                  if (wygrywa(fPrzed, ePrzed) && wygrywa(fPo, ePo) && wygrywa(fPrzed, dPrzed) && wygrywa(fPo, dPo)) return f;
                }
              }
              return null;
            })();
            if (dominator) continue;
            return { strona, zrodlo: e.zrodlo, regula: R, deklaracja: e.deklaracja, czesc: K.czesci[i].tekst, czescKonkurenta: R.czesci[j].tekst, przed, po, eZlozony: jR.some((n) => zlozonaR(n)) };
          }
        }
      }
    }
    return null;
  };
  const opisKonfliktu = (w) => `${w.strona}: ${w.zrodlo} ${w.regula.kontekst.length ? `[${w.regula.kontekst.join(' » ')}] ` : ''}${w.czescKonkurenta} { ${w.deklaracja.prop}: ${w.deklaracja.value}${w.deklaracja.important ? ' !important' : ''} }${w.eZlozony ? ' (też złożony)' : ''} — ${w.przed ? 'skórka wygrywała, po złożeniu przegrywa' : 'skórka przegrywała, po złożeniu wygrywa'} (część ${w.czesc})`;
  // 5. do punktu stałego. Gdy para traci przez inną parę, która sama jest niebezpieczna niezależnie od reszty
  //    (np. `header` z !important przegrałby ze złożonym `._glass`), najpierw wypada ta druga — inaczej kolejność
  //    przeglądu przesądzałaby wynik i jedna reguła blokowałaby łańcuchowo dziesiątki innych.
  for (;;) {
    const aktywni = kandydaci.filter((k) => jestKandydatem(k.klucz));
    const niebezpieczni = aktywni.map((k) => ({ k, w: konkurent(k, jestKandydatem) })).filter((x) => x.w);
    if (!niebezpieczni.length) {
      // deklaracje jednej reguły o wspólnych longhandach: dla danej części razem albo wcale
      let zmiana = false;
      for (const k of aktywni) {
        if (!jestKandydatem(k.klucz)) continue;
        const blokada = k.regula.deklaracje.find((e) => e !== k.deklaracja && nakladajaSie(k.deklaracja.prop, e.prop) && !jestKandydatem(kluczCzesci(e, k.nr)));
        if (!blokada) continue;
        stan.set(k.klucz, 'grupa');
        pozostale.push({ ...k, powod: 'grupa', szczegoly: `w tej samej regule ${blokada.prop} zostaje dla tej części (${stan.get(kluczCzesci(blokada, k.nr))})` });
        zmiana = true;
      }
      if (!zmiana) break;
      continue;
    }
    const samodzielni = niebezpieczni.map((x) => ({ k: x.k, w: konkurent(x.k, () => false) })).filter((x) => x.w);
    for (const x of (samodzielni.length ? samodzielni : niebezpieczni)) {
      const powod = x.w.zrodlo.includes('#dyn') ? 'dynamiczna' : 'kaskada';
      stan.set(x.k.klucz, powod);
      pozostale.push({ ...x.k, powod, szczegoly: opisKonfliktu(x.w) });
    }
  }
  const zlozone = kandydaci.filter((k) => jestKandydatem(k.klucz));
  return { arkusze, kandydaci, zlozone, pozostale, obecnosc };
}

function wciecieLinii(css, poz) {
  const start = css.lastIndexOf('\n', poz - 1) + 1;
  return /^\s*/.exec(css.slice(start, poz))[0];
}

/** Tekst deklaracji z arkusza bez końcowego średnika (i, dla złożonej, bez !important). */
function tekstDeklaracji(css, d, bezWaznosci) {
  let t = css.slice(d.start, d.end).replace(/\s*;\s*$/, '').trim();
  if (bezWaznosci) t = t.replace(/\s*!important\s*$/, '');
  return t;
}

function tekstReguly(wciecie, czesci, deklaracje) {
  return `${wciecie}${czesci.join(`,\n${wciecie}`)} {\n${deklaracje.map((d, i) => `${wciecie}  ${d}${i < deklaracje.length - 1 ? ';' : ''}`).join('\n')}\n${wciecie}}`;
}

/**
 * Składa w tekście arkusza wskazane pary (deklaracja, część) reguł skórki: `zlozenia` = [{ regula (z dowolnego
 * parsowania tego samego tekstu), pary: [{ deklaracja, nr }] }]. Reguła złożona w całości dostaje selektor bez skórki
 * i traci !important. Inaczej reguła dzieli się: części o tym samym zestawie złożonych deklaracji tworzą regułę bazową
 * (selektory bez skórki, deklaracje bez !important), a ich pozostałe deklaracje — oraz części bez złożeń ze wszystkimi
 * deklaracjami — zostają regułami skórki bez zmian wartości. Zwraca { text, reguly, deklaracje }.
 */
export function zlozArkusz(css, zlozenia) {
  if (!zlozenia.length) return { text: css, reguly: 0, deklaracje: 0 };
  const reguly = parsuj(css);
  const edycje = [];
  let deklaracje = 0;
  let zmienione = 0;
  for (const z of zlozenia) {
    const r = reguly.find((x) => x.start === z.regula.start && x.prelude === z.regula.prelude);
    if (!r) throw new Error(`zlozArkusz: nie ma reguły ${z.regula.prelude}`);
    const czesci = splitTopLevel(css.slice(r.start, css.indexOf('{', r.start)), ',').map((c) => c.trim());
    const wgCzesci = czesci.map(() => new Set());
    for (const p of z.pary) { const idx = z.regula.deklaracje.indexOf(p.deklaracja); if (idx >= 0 && wgCzesci[p.nr]) wgCzesci[p.nr].add(idx); }
    if (wgCzesci.every((s) => !s.size)) continue;
    const wciecie = wciecieLinii(css, r.start);
    const wszystkie = r.deklaracje.map((_, i) => i);
    const bloki = [];
    // grupy części o tym samym zestawie złożonych deklaracji, w kolejności pierwszej części
    const grupy = new Map();
    czesci.forEach((c, nr) => { const sygnatura = [...wgCzesci[nr]].sort((a, b) => a - b).join(','); if (!grupy.has(sygnatura)) grupy.set(sygnatura, []); grupy.get(sygnatura).push(nr); });
    for (const [sygnatura, numery] of grupy) {
      const zlozoneIdx = sygnatura ? sygnatura.split(',').map(Number) : [];
      const reszta = wszystkie.filter((i) => !zlozoneIdx.includes(i));
      if (zlozoneIdx.length) {
        const bazowe = [];
        for (const nr of numery) { const b = zlozony(czesci[nr]); if (b && !bazowe.includes(b)) bazowe.push(b); }
        bloki.push(tekstReguly(wciecie, bazowe, zlozoneIdx.map((i) => tekstDeklaracji(css, r.deklaracje[i], true))));
        deklaracje += zlozoneIdx.length;
      }
      if (reszta.length) bloki.push(tekstReguly(wciecie, numery.map((nr) => czesci[nr]), reszta.map((i) => tekstDeklaracji(css, r.deklaracje[i], false))));
    }
    const liniaStart = css.lastIndexOf('\n', r.start - 1) + 1;
    const start = css.slice(liniaStart, r.start).trim() ? r.start : liniaStart;
    edycje.push({ start, end: r.end, tekst: bloki.join('\n\n') });
    zmienione++;
  }
  edycje.sort((a, b) => b.start - a.start);
  let text = css;
  for (const e of edycje) text = text.slice(0, e.start) + e.tekst + text.slice(e.end);
  return { text, reguly: zmienione, deklaracje };
}

/** Klucz reguły do dopasowania partiali design systemu: kontekst + kanoniczna lista selektorów. */
export function kluczReguly(regula) {
  return `${regula.kontekst.join('|')}::${canonicalSelectorList(regula.prelude).join(',')}`;
}

/**
 * Mapa złożeń dla partiali: [{ kontekst, czesci: Set kanonicznych części reguły źródłowej, dekl: Map 'prop#nr' → Set
 * kanonicznych części, dla których deklaracja została złożona }].
 */
export function mapaZlozen(zlozone) {
  const mapa = new Map();
  for (const k of zlozone) {
    const klucz = kluczReguly(k.regula);
    if (!mapa.has(klucz)) mapa.set(klucz, { kontekst: k.regula.kontekst.join('|'), czesci: new Set(k.regula.czesci.map((c) => canonicalSelector(c.tekst))), dekl: new Map() });
    const w = mapa.get(klucz);
    const nrDekl = `${k.deklaracja.prop}#${k.regula.deklaracje.filter((q) => q.prop === k.deklaracja.prop).indexOf(k.deklaracja)}`;
    if (!w.dekl.has(nrDekl)) w.dekl.set(nrDekl, new Set());
    w.dekl.get(nrDekl).add(canonicalSelector(k.regula.czesci[k.nr].tekst));
  }
  return [...mapa.values()];
}

/**
 * Składa w partialu design systemu te same pary, co w arkuszach źródłowych: reguła partiala odpowiada regule
 * źródłowej, gdy jej kanoniczne części są podzbiorem części reguły źródłowej w tym samym kontekście (tak dopasowuje
 * producent). Zwraca jak zlozArkusz.
 */
export function zlozPartial(css, mapa) {
  const reguly = parsuj(css);
  const zlozenia = [];
  for (const r of reguly) {
    const kontekst = r.kontekst.join('|');
    const czesci = splitTopLevel(r.prelude, ',').map((c) => c.trim()).filter(Boolean).map((c) => canonicalSelector(c));
    if (!czesci.length) continue;
    const zrodlo = mapa.find((m) => m.kontekst === kontekst && czesci.every((c) => m.czesci.has(c)));
    if (!zrodlo) continue;
    const pary = [];
    r.deklaracje.forEach((d) => {
      const nrDekl = `${d.prop}#${r.deklaracje.filter((q) => q.prop === d.prop).indexOf(d)}`;
      const zlozoneCzesci = zrodlo.dekl.get(nrDekl);
      if (!zlozoneCzesci) return;
      czesci.forEach((c, nr) => { if (zlozoneCzesci.has(c)) pary.push({ deklaracja: d, nr }); });
    });
    if (pary.length) zlozenia.push({ regula: r, pary });
  }
  return zlozArkusz(css, zlozenia);
}

/**
 * Partial dogania złożone arkusze: dla reguły skórki partiala szuka w arkuszach (Map nazwa → { reguly }) reguły w tym
 * samym kontekście, której kanoniczne części zawierają złożone części partiala i która ma deklarację o tej samej
 * własności i wartości bez !important — taka para (deklaracja, część) jest w arkuszu złożona, więc partial składa ją
 * tak samo. Zwraca jak zlozArkusz.
 */
export function synchronizujPartial(css, arkusze) {
  const reguly = parsuj(css);
  const wartosc = (v) => v.replace(/\s+/g, ' ').trim().toLowerCase();
  const zrodlowe = [...arkusze.values()].flatMap((a) => a.reguly.map((r) => ({ r, kontekst: r.kontekst.join('|'), czesci: new Set(r.czesci.map((c) => canonicalSelector(c.tekst))) })));
  const zlozenia = [];
  for (const r of reguly) {
    if (!regulaSkorki(r.prelude)) continue;
    const kontekst = r.kontekst.join('|');
    const czesci = splitTopLevel(r.prelude, ',').map((c) => c.trim()).filter(Boolean);
    const pary = [];
    czesci.forEach((c, nr) => {
      const bez = canonicalSelector(zlozony(c));
      const kandydaci = zrodlowe.filter((z) => z.kontekst === kontekst && z.czesci.has(bez));
      for (const d of r.deklaracje) {
        if (kandydaci.some((z) => z.r.deklaracje.some((e) => !e.important && e.prop === d.prop && wartosc(e.value) === wartosc(d.value)))) pary.push({ deklaracja: d, nr });
      }
    });
    if (pary.length) zlozenia.push({ regula: r, pary });
  }
  return zlozArkusz(css, zlozenia);
}

export { arkuszeAplikacji, korzen };
