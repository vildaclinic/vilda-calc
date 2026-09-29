// P-STYLE krok 5a: bloki <style> stron przechodzą do arkuszy linkowanych W TYM SAMYM MIEJSCU dokumentu, więc kaskada
// (kolejność źródeł — także względem arkuszy wstrzykiwanych z JS na końcu <head> i względem bloków w <body>) nie zmienia
// się. Kolejne bloki trafiają do jednego arkusza tylko wtedy, gdy między nimi nie stoi nic, co mogłoby wnieść style
// pomiędzy nie: link do arkusza, synchroniczny skrypt (bez defer/async, wykonywany w trakcie parsowania — może wstrzyknąć
// arkusz w to miejsce) ani granica <body>. Skrypt defer/async/module wykonuje się po sparsowaniu dokumentu, więc jego
// wstrzyknięcia lądują za wszystkimi blokami z <head>; dane (application/ld+json) nie są skryptem.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Arkusz powłoki osadzonej: app.html osadza strony w ramkach i daje <html> klasę vilda-embedded. Ten sam blok stoi
 * jako pierwsze źródło stylów na 10 stronach (terminarz.html dokłada po nim jedną regułę) — idzie do jednego arkusza. */
export const ARKUSZ_WSPOLNY = 'vilda_embedded.css';
export const BLOK_WSPOLNY = '.vilda-embedded header,\n.vilda-embedded .sidebar,\n.vilda-embedded #mobileBottomDock,\n'
  + '.vilda-embedded #scrollTopBtn{display:none!important}'
  + '.vilda-embedded body.liquid-ios26::before{display:none!important}'
  + '.vilda-embedded .desktop-layout{display:block!important;padding-top:0!important}'
  + '.vilda-embedded .main-content{margin:0!important;padding-top:0!important}'
  + '.vilda-embedded body{padding-top:0!important;padding-bottom:0!important}';

/** Nazwa arkusza strony: inline_<strona>_<NN>.css (jak wyciągnięte wcześniej skrypty inline_<strona>_<NN>.js). */
export function nazwaArkusza(strona, nr) {
  return `inline_${strona.replace(/\.html$/, '').replace(/-/g, '_')}_${String(nr).padStart(2, '0')}.css`;
}

/** Komentarze HTML zamienione na spacje (te same indeksy): <body>, <script> czy <style> w komentarzu to nie znaczniki. */
export function bezKomentarzy(html) {
  return html.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));
}

/** Zakresy <script>…</script> (blok <style> w łańcuchu skryptu nie jest źródłem stylów strony). */
function zakresySkryptow(html) {
  return [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map((m) => [m.index, m.index + m[0].length]);
}

/** Bloki <style> strony w kolejności dokumentu: { start, koniec, css, atrybuty, wHead, linia }. */
export function blokiStrony(html) {
  const czysty = bezKomentarzy(html);
  const body = czysty.search(/<body\b/i);
  const skrypty = zakresySkryptow(czysty);
  const out = [];
  for (const m of czysty.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)) {
    if (skrypty.some(([a, b]) => m.index > a && m.index < b)) continue;
    out.push({
      start: m.index,
      koniec: m.index + m[0].length,
      atrybuty: m[1].trim(),
      css: m[2],
      wHead: body < 0 || m.index < body,
      linia: html.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

/** Powód, dla którego dwa bloki z tym fragmentem między nimi nie mogą iść do jednego arkusza (null — mogą). */
export function rozdzielaBloki(miedzy) {
  if (/<link\b[^>]*\brel=["']?stylesheet\b/i.test(miedzy)) return 'link do arkusza';
  if (/<body\b/i.test(miedzy)) return 'granica <body>';
  for (const m of miedzy.matchAll(/<script\b([^>]*)>/gi)) {
    const atr = m[1];
    if (/\b(?:defer|async)\b/i.test(atr)) continue;
    const typ = /\btype=["']?([^"'\s>]+)/i.exec(atr);
    if (typ && !/^(?:text\/javascript|application\/javascript|module)$/i.test(typ[1])) continue; // dane, nie skrypt
    if (typ && typ[1].toLowerCase() === 'module') continue; // moduł jest odraczany jak defer
    return 'synchroniczny skrypt';
  }
  return null;
}

/** Segmenty: kolejne bloki, między którymi nic nie wnosi stylów — każdy segment to jeden arkusz. */
export function segmentyStrony(html) {
  const segmenty = [];
  const czysty = bezKomentarzy(html);
  for (const b of blokiStrony(html)) {
    const ost = segmenty[segmenty.length - 1];
    const powod = ost ? rozdzielaBloki(czysty.slice(ost.bloki[ost.bloki.length - 1].koniec, b.start)) : null;
    if (ost && !powod) ost.bloki.push(b);
    else segmenty.push({ bloki: [b], powod: ost ? powod : 'pierwszy blok' });
  }
  return segmenty;
}

/**
 * Plan wyciągnięcia: dla każdego segmentu linki (w miejscu pierwszego bloku) i pliki do zapisania.
 *   istnieje(nazwa) → treść istniejącego pliku albo null: numer arkusza omija nazwy zajęte inną treścią.
 * Zwraca [{ bloki, linki, pliki: { nazwa: css }, powod }].
 */
export function planStrony(strona, html, istnieje = () => null) {
  const plan = [];
  let nr = 0;
  for (const seg of segmentyStrony(html)) {
    for (const b of seg.bloki) if (b.atrybuty) throw new Error(`${strona}:${b.linia}: blok <style ${b.atrybuty}> ma atrybuty — poza planem`);
    const linki = [];
    const czesci = [];
    seg.bloki.forEach((b, i) => {
      let t = b.css.replace(/\r\n/g, '\n').trim();
      if (i === 0 && t.startsWith(BLOK_WSPOLNY)) { linki.push(ARKUSZ_WSPOLNY); t = t.slice(BLOK_WSPOLNY.length).trim(); }
      if (t) czesci.push(t);
    });
    const pliki = {};
    if (czesci.length) {
      const css = `${czesci.join('\n')}\n`;
      let nazwa = nazwaArkusza(strona, nr++);
      while (istnieje(nazwa) !== null && istnieje(nazwa) !== css) nazwa = nazwaArkusza(strona, nr++);
      linki.push(nazwa);
      pliki[nazwa] = css;
    }
    plan.push({ bloki: seg.bloki, linki, pliki, powod: seg.powod });
  }
  return plan;
}

/** Zakres do usunięcia: cały wiersz (z wcięciem i końcem linii), gdy blok stoi w nim sam. */
function calyWiersz(html, start, koniec) {
  const od = html.lastIndexOf('\n', start - 1) + 1;
  const doKonca = html.indexOf('\n', koniec);
  const koniecWiersza = doKonca < 0 ? html.length : doKonca + 1;
  if (/^\s*$/.test(html.slice(od, start)) && /^\s*$/.test(html.slice(koniec, koniecWiersza))) return [od, koniecWiersza];
  return [start, koniec];
}

/** Nowa treść strony: pierwszy blok segmentu → linki (z wcięciem bloku), pozostałe bloki segmentu znikają. */
export function zastosuj(html, plan) {
  let out = html;
  const zmiany = [];
  for (const seg of plan) {
    const [pierwszy, ...reszta] = seg.bloki;
    const od = out.lastIndexOf('\n', pierwszy.start - 1) + 1;
    const wciecie = /^\s*$/.test(html.slice(od, pierwszy.start)) ? html.slice(od, pierwszy.start) : '';
    const linki = seg.linki.map((n) => `<link href="${n}?v=1" rel="stylesheet">`).join(`\n${wciecie}`);
    zmiany.push([pierwszy.start, pierwszy.koniec, linki]);
    for (const b of reszta) zmiany.push([...calyWiersz(html, b.start, b.koniec), '']);
  }
  for (const [start, koniec, tekst] of zmiany.sort((a, b) => b[0] - a[0])) out = out.slice(0, start) + tekst + out.slice(koniec);
  return out;
}

/** Plan dla całego repozytorium: Map strona → plan (tylko strony z blokami). */
export function planRepozytorium(czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8'), strony = null) {
  const lista = strony || fs.readdirSync(korzen).filter((f) => f.endsWith('.html')).sort();
  const istnieje = (n) => (fs.existsSync(path.join(korzen, n)) ? fs.readFileSync(path.join(korzen, n), 'utf8') : null);
  const wynik = new Map();
  for (const strona of lista) {
    const html = czytaj(strona);
    const plan = planStrony(strona, html, istnieje);
    if (plan.length) wynik.set(strona, { html, plan });
  }
  return wynik;
}
