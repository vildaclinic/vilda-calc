import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analizaSkorki, korzen, longhandy, nakladajaSie, regulaSkorki, zlozArkusz, zlozPartial, zlozony, mapaZlozen, WLASNOSCI_BEHAWIORALNE } from '../support/skorka-css.mjs';
import { mozliweTypy, rozlaczne, wiedzaDom, zlozenieSkrajne } from '../support/wiedza-dom.mjs';
import { parsuj } from '../support/szklo-css.mjs';

// P-STYLE rata 4b (decyzja właściciela 2026-09-28: skórka szkła jako baza). Nadpisania skórki `.liquid-ios26 S { p: v
// !important }`, dla których analiza kaskady (tests/support/skorka-css.mjs) dowodzi, że złożenie do `S { p: v }` nie
// zmienia żadnego zwycięzcy porównania, są złożone. To, co zostaje nadpisaniem, jest spisane z powodem w
// tests/fixtures/skorka-nadpisania.json; strażnik pilnuje, że (1) lista nadpisań w arkuszach jest dokładnie tą z fixture
// (nowe nadpisanie skórki wymaga świadomej decyzji: node tests/scripts/zloz-skorke-css.mjs --zapisz), (2) żadne
// nadpisanie z powodem „kaskada”/„grupa” nie stało się składalne, (3) sama analiza działa jak opisano — na małych
// przykładach: rozłączność selektorów, wiedza o DOM, konkurenci, dominatory, podział reguły.

const FIXTURE = path.join(korzen, 'tests/fixtures/skorka-nadpisania.json');
const FIXTURE_NIEOBECNE = path.join(korzen, 'tests/fixtures/skorka-nieobecne.json');

describe.skipIf(!fs.existsSync(FIXTURE))('P-STYLE rata 4b: nadpisania skórki w arkuszach są dokładnie tymi z fixture i żadne nie da się złożyć', () => {
  const fixture = fs.existsSync(FIXTURE) ? JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) : { pozostale: [] };
  const wPliku = new Map(fixture.pozostale.map((p) => [p.klucz, p.powod]));
  const wykluczenia = new Map([...wPliku].filter(([, powod]) => !['kaskada', 'grupa', 'behawioralna'].includes(powod.split(':')[0])));
  const analiza = analizaSkorki({ wykluczenia, wiedza: wiedzaDom() });

  it('zbiór par (deklaracja, część) czystych reguł skórki w arkuszach = zbiór z fixture', () => {
    const wArkuszach = analiza.kandydaci.map((k) => k.klucz).sort();
    const zFixture = [...wPliku.keys()].sort();
    expect(wArkuszach.filter((k) => !wPliku.has(k))).toEqual([]); // nowe nadpisanie skórki bez decyzji w fixture
    expect(zFixture.filter((k) => !wArkuszach.includes(k))).toEqual([]); // wpis fixture bez deklaracji w arkuszu
  });

  it('żadna para nie jest do złożenia (analiza statyczna z aktualną wiedzą o DOM)', () => {
    expect(analiza.zlozone.map((k) => `${k.arkusz} ${k.regula.czesci[k.nr].tekst} { ${k.deklaracja.prop} }`)).toEqual([]);
  });

  it('nazwy z selektorów nieobecne nigdzie w kodzie (rozłączność z założenia „reguła martwa”) są dokładnie tymi z fixture', () => {
    // rata 4b bis: nazwa klasy lub id, której nie ma w HTML (poza <style>) ani w JS, nie dopasowuje niczego — na tym opiera się
    // rozłączność części złożonych reguł. Nazwa, która pojawi się w kodzie, ożywia reguły złożone bez !important.
    const nieobecne = fs.existsSync(FIXTURE_NIEOBECNE) ? JSON.parse(fs.readFileSync(FIXTURE_NIEOBECNE, 'utf8')).nazwy : [];
    const teraz = analiza.nieobecne;
    const ozywione = nieobecne.filter((n) => !teraz.includes(n));
    expect(ozywione, `nazwy dotąd nieobecne w kodzie pojawiły się w HTML/JS — reguły z nimi przestały być martwe; sprawdź ich kaskadę (po złożeniu są bez !important) i odśwież listę: node tests/scripts/zloz-skorke-css.mjs --zapisz:\n${ozywione.join('\n')}`).toEqual([]);
    const nowe = teraz.filter((n) => !nieobecne.includes(n));
    expect(nowe, `nowe nazwy w selektorach bez odpowiednika w kodzie — odśwież listę: node tests/scripts/zloz-skorke-css.mjs --zapisz:\n${nowe.join('\n')}`).toEqual([]);
  });

  it('powody z fixture zgadzają się z analizą: behawioralna = własność z listy, kaskada/grupa = konflikt w kaskadzie', () => {
    for (const p of analiza.pozostale) {
      const zapisany = wPliku.get(p.klucz);
      if (zapisany === 'behawioralna') expect(WLASNOSCI_BEHAWIORALNE.has(p.deklaracja.prop)).toBe(true);
      if (zapisany === 'kaskada' || zapisany === 'grupa') expect(['kaskada', 'grupa']).toContain(p.powod);
    }
  });
});

describe('longhandy i selektor po złożeniu', () => {
  it('skrót ma składowe, własność zwykła i własna — siebie; prefiksy dostawców zdjęte', () => {
    expect(longhandy('background')).toContain('background-color');
    expect(longhandy('border')).toContain('border-top-color');
    expect(longhandy('-webkit-backdrop-filter')).toEqual(['backdrop-filter']);
    expect(longhandy('--lg-border')).toEqual(['--lg-border']);
    expect(nakladajaSie('border', 'border-color')).toBe(true);
    expect(nakladajaSie('background', 'background-color')).toBe(true);
    expect(nakladajaSie('padding', 'margin')).toBe(false);
    expect(nakladajaSie('white-space', 'text-wrap')).toBe(true);
    // `all` resetuje każdą własność poza własnymi (rata 4b bis)
    expect(nakladajaSie('all', 'color')).toBe(true);
    expect(nakladajaSie('border', 'all')).toBe(true);
    expect(nakladajaSie('all', '--x')).toBe(false);
  });

  it('zdejmuje klasę skórki (i gołe body przed potomkiem), zostawia body przed kombinatorem dziecka', () => {
    expect(zlozony('.liquid-ios26 .card')).toBe('.card');
    expect(zlozony('body.liquid-ios26 .x')).toBe('.x');
    expect(zlozony('body.liquid-ios26.page-settings .x')).toBe('body.page-settings .x');
    expect(zlozony('body.liquid-ios26')).toBe('body');
    expect(zlozony('body.liquid-ios26:before')).toBe('body:before');
    expect(zlozony('body.liquid-ios26 > .x')).toBe('body > .x');
    expect(zlozony('.a .liquid-ios26 .x')).toBeNull();
    expect(regulaSkorki('.liquid-ios26 .a, .liquid-ios26 .b')).toBe(true);
    expect(regulaSkorki('.liquid-ios26 .a, .b')).toBe(false);
    expect(regulaSkorki('body.high-contrast-level-1.liquid-ios26 .a')).toBe(false);
  });
});

describe('rozłączność skrajnych złożeń i wiedza o DOM', () => {
  const wiedza = { klasy: new Map([['btn', { tagi: new Set(['button']), wolna: false }], ['luz', { tagi: new Set(['a', 'button']), wolna: false }], ['dyn', { tagi: new Set(['div']), wolna: true }]]), idy: new Map([['name', { tagi: new Set(['input']), wolna: false }]]) };
  const z = (s) => zlozenieSkrajne(s);
  it('typ, id, pseudoelement, wartość atrybutu', () => {
    expect(rozlaczne(z('button'), z('.x header'))).toBe(true);
    expect(rozlaczne(z('#a'), z('#b'))).toBe(true);
    expect(rozlaczne(z('.card'), z('.card:after'))).toBe(true);
    expect(rozlaczne(z('input[type=text]'), z('input[type=button]'))).toBe(true);
    expect(rozlaczne(z('input[type=text]'), z('input'))).toBe(false);
    expect(rozlaczne(z('.card'), z('.plan-card'))).toBe(false);
    expect(rozlaczne(z('button'), z('.x'))).toBe(false);
  });
  it('klasa i id na znanych typach elementów', () => {
    expect(mozliweTypy(z('.btn'), wiedza)).toEqual(new Set(['button']));
    expect(mozliweTypy(z('.btn.luz'), wiedza)).toEqual(new Set(['button']));
    expect(mozliweTypy(z('.dyn'), wiedza)).toBeNull();
    expect(mozliweTypy(z('.nieznana'), wiedza)).toBeNull(); // nazwa nieznana: może być budowana dynamicznie, nie zawęża
    expect(rozlaczne(z('header'), z('.btn'), wiedza)).toBe(true);
    expect(rozlaczne(z('a'), z('.luz'), wiedza)).toBe(false);
    expect(rozlaczne(z('header'), z('.dyn'), wiedza)).toBe(false); // klasa wolna: może być wszędzie
    expect(rozlaczne(z('header'), z('.nieznana'), wiedza)).toBe(false); // bez tokenów kodu nazwa nieznana nie dowodzi rozłączności (rata 4b bis)
    expect(rozlaczne(z('button'), z('#name[disabled]'), wiedza)).toBe(true);
  });
  it('nazwa nierozpoznana: nieobecna w kodzie nic nie dopasowuje, obecna (np. stała w JS) nie zawęża', () => {
    const w = { ...wiedza, tokeny: new Set(['btn', 'luz', 'dyn', 'name', 'stala']) };
    expect(mozliweTypy(z('.nieznana'), w)).toEqual(new Set()); // nie ma jej nigdzie w HTML ani JS: reguła martwa
    expect(rozlaczne(z('header'), z('.nieznana'), w)).toBe(true);
    expect(mozliweTypy(z('.stala'), w)).toBeNull(); // jest w kodzie, skaner nie zna typu: może być wszędzie
    expect(rozlaczne(z('header'), z('.stala'), w)).toBe(false);
    expect(rozlaczne(z('header'), z('button.stala'), w)).toBe(true); // typ nadal rozstrzyga
    // nazwa sklejalna z tokenu-prefiksu (`'is-' + stan`) albo sufiksu (`x + '-high'`) nie jest nieobecna
    const w2 = { ...wiedza, tokeny: new Set(['btn', 'is-', '-high']) };
    expect(mozliweTypy(z('.is-active'), w2)).toBeNull();
    expect(mozliweTypy(z('.tone-high'), w2)).toBeNull();
    expect(mozliweTypy(z('.nieznana'), w2)).toEqual(new Set());
  });
  it('wiedza z kodu: znaczniki, szablony, fabryki i zapisy w JS', () => {
    const pliki = { 'a.html': '<body><button class="x y" id="ok">a</button><span data-lucide="x" class="ikona"></span><script>var e=document.createElement("div");e.className="fab";var q=document.getElementById("ok");q.classList.add("z");t.classList.add("w");f("section",{class:"fabr"});e("input",Object.assign({class:"pole"},{}));</script></body>' };
    const w = wiedzaDom((p) => pliki[p], Object.keys(pliki), null);
    expect([...w.klasy.get('x').tagi]).toEqual(['button']);
    expect([...w.klasy.get('ikona').tagi]).toEqual(['span', 'svg']);
    expect([...w.klasy.get('fab').tagi]).toEqual(['div']);
    expect([...w.klasy.get('z').tagi]).toEqual(['button']); // przez id
    expect(w.klasy.get('w').wolna).toBe(true);
    expect([...w.klasy.get('fabr').tagi]).toEqual(['section']);
    expect([...w.klasy.get('pole').tagi]).toEqual(['input']);
  });
});

describe('analiza złożenia na małej kaskadzie', () => {
  const html = '<html><head><link rel="stylesheet" href="skin.css"><link rel="stylesheet" href="base.css"></head><body><button class="btn">a</button><div class="card special">b</div></body></html>';
  const uruchom = (skin, base, opcje = {}) => {
    const pliki = { 'index.html': opcje.html || html, 'skin.css': skin, 'base.css': base };
    const czytaj = (p) => { if (!(p in pliki)) throw new Error(p); return pliki[p]; };
    const wiedza = wiedzaDom(czytaj, ['index.html'], null);
    const { zrodlaStron } = opcje;
    const zrodla = zrodlaStron ? zrodlaStron(czytaj, ['index.html']) : new Map([['index.html', [{ id: 'skin.css', typ: 'link', nazwa: 'skin.css', css: null, wHead: true }, { id: 'base.css', typ: 'link', nazwa: 'base.css', css: null, wHead: true }]]]);
    return analizaSkorki({ zrodla, czytaj, wiedza, ...opcje });
  };
  const opis = (a) => ({ zlozone: a.zlozone.map((k) => `${k.regula.czesci[k.nr].tekst} ${k.deklaracja.prop}`), pozostale: a.pozostale.map((p) => `${p.regula.czesci[p.nr].tekst} ${p.deklaracja.prop}: ${p.powod}`) });

  it('bez konkurenta: do złożenia; własność behawioralna zostaje', () => {
    const a = opis(uruchom('.liquid-ios26 .card {\n  color: red !important;\n  display: block !important\n}\n', '.card {\n  padding: 1rem\n}\n'));
    expect(a.zlozone).toEqual(['.liquid-ios26 .card color']);
    expect(a.pozostale).toEqual(['.liquid-ios26 .card display: behawioralna']);
  });

  it('konkurent o wyższej swoistości później w kaskadzie blokuje; rozłączny (inny typ) nie', () => {
    const a = opis(uruchom('.liquid-ios26 .card {\n  color: red !important\n}\n\n.liquid-ios26 button {\n  color: blue !important\n}\n', '.card.special {\n  color: green\n}\n\n.x header {\n  color: black\n}\n'));
    expect(a.zlozone).toEqual(['.liquid-ios26 button color']);
    expect(a.pozostale[0]).toMatch(/^\.liquid-ios26 \.card color: kaskada/);
  });

  it('konkurent z nazwą obecną w kodzie, lecz nierozpoznaną przez skaner (stała w JS), blokuje', () => {
    // `.card.stala` (0,2,0) wygrałby po złożeniu z `.card` (0,1,0); klasa `stala` jest tylko w stałej JS, więc skaner nie zna
    // jej typu — może być wszędzie (rata 4b bis; wcześniej nazwa spoza wiedzy uchodziła za niedopasowywalną)
    const a = opis(uruchom('.liquid-ios26 .card {\n  color: red !important\n}\n', '.card.stala {\n  color: green\n}\n', { html: html.replace('</body>', '<script>var KLASA = "stala"; el.classList.add(KLASA);</script></body>') }));
    expect(a.zlozone).toEqual([]);
    expect(a.pozostale[0]).toMatch(/^\.liquid-ios26 \.card color: kaskada/);
  });

  it('konkurent z nazwą nieobecną nigdzie w kodzie nie blokuje (reguła martwa)', () => {
    const a = opis(uruchom('.liquid-ios26 .card {\n  color: red !important\n}\n', '.card.nigdzie {\n  color: green\n}\n'));
    expect(a.zlozone).toEqual(['.liquid-ios26 .card color']);
  });

  it('konkurent ze skrótem `all` blokuje każdą własność poza własnymi', () => {
    // `.special { all: unset }` stoi później w kaskadzie o tej samej swoistości co `.card`: po złożeniu wygrałby z `color`,
    // a własności własnej (`--x`) `all` nie dotyka
    const a = opis(uruchom('.liquid-ios26 .card {\n  color: red !important;\n  --x: 1 !important\n}\n', '.special {\n  all: unset\n}\n'));
    expect(a.zlozone).toEqual(['.liquid-ios26 .card --x']);
    expect(a.pozostale[0]).toMatch(/^\.liquid-ios26 \.card color: kaskada/);
  });

  it('ta sama własność o tej samej wartości nie jest konfliktem', () => {
    const a = opis(uruchom('.liquid-ios26 .card {\n  color: red !important\n}\n', '.card.special {\n  color: red\n}\n'));
    expect(a.zlozone).toEqual(['.liquid-ios26 .card color']);
  });

  it('per część: część `button` składa się, choć `input[type=submit]` z tej samej reguły zostaje', () => {
    const a = opis(uruchom('.liquid-ios26 button, .liquid-ios26 input[type=submit] {\n  color: red !important\n}\n', 'input:focus {\n  color: green\n}\n'));
    expect(a.zlozone).toEqual(['.liquid-ios26 button color']);
    expect(a.pozostale).toEqual([expect.stringMatching(/^\.liquid-ios26 input\[type=submit\] color: kaskada/)]);
  });

  it('dominator: trzecia deklaracja pokrywająca konkurenta i wygrywająca z obojgiem znosi konflikt', () => {
    // `.card.special { color: green }` przegrywa i przed, i po z `.liquid-ios26 .special { color: … !important }`, które pokrywa `.card.special`
    const a = opis(uruchom('.liquid-ios26 .card {\n  color: red !important\n}\n\n.liquid-ios26 .special {\n  color: black !important\n}\n', '.card.special {\n  color: green\n}\n', { wykluczenia: new Map([['skin.css||.liquid-ios26 .special|color#0', 'js: test']]) }));
    expect(a.zlozone).toEqual(['.liquid-ios26 .card color']);
  });

  it('najpierw wypada para niebezpieczna samodzielnie: `._glass` nie traci przez `header`, który i tak zostaje', () => {
    const skin = '.liquid-ios26 ._glass {\n  color: red\n}\n\n.liquid-ios26 header {\n  color: blue !important\n}\n';
    const base = '.x header {\n  color: green\n}\n';
    const a = opis(uruchom(skin, base));
    expect(a.zlozone).toEqual(['.liquid-ios26 ._glass color']);
    expect(a.pozostale).toEqual([expect.stringMatching(/^\.liquid-ios26 header color: kaskada/)]);
  });

  it('konkurent z arkusza wstrzykiwanego z JS daje powód „dynamiczna”', () => {
    const a = opis(uruchom('.liquid-ios26 .card {\n  color: red !important\n}\n', '.x {\n  padding: 0\n}\n', { dynamiczne: new Map([['index.html', [{ pozycja: 2, css: '.card.special { color: green }' }]]]) }));
    expect(a.pozostale).toEqual([expect.stringMatching(/^\.liquid-ios26 \.card color: dynamiczna/)]);
  });
});

describe('zlozArkusz i zlozPartial', () => {
  const css = ['.liquid-ios26 .card,', '.liquid-ios26 .plan-card {', '  background: #fff !important;', '  color: #111!important;', '  display: block !important', '}', '', '.liquid-ios26 .only {', '  color: red !important', '}', ''].join('\n');
  const reguly = parsuj(css);

  it('reguła złożona w całości: selektory bez skórki, deklaracje bez !important', () => {
    const r = reguly[1];
    const { text, reguly: n, deklaracje } = zlozArkusz(css, [{ regula: r, pary: [{ deklaracja: r.deklaracje[0], nr: 0 }] }]);
    expect(n).toBe(1);
    expect(deklaracje).toBe(1);
    expect(text).toContain('.only {\n  color: red\n}');
    expect(text).not.toContain('.liquid-ios26 .only');
  });

  it('podział: część `.card` z dwiema deklaracjami do bazy, reszta i `.plan-card` zostają skórką', () => {
    const r = reguly[0];
    const { text } = zlozArkusz(css, [{ regula: r, pary: [{ deklaracja: r.deklaracje[0], nr: 0 }, { deklaracja: r.deklaracje[1], nr: 0 }] }]);
    expect(text).toContain('.card {\n  background: #fff;\n  color: #111\n}');
    expect(text).toContain('.liquid-ios26 .card {\n  display: block !important\n}');
    expect(text).toContain('.liquid-ios26 .plan-card {\n  background: #fff !important;\n  color: #111!important;\n  display: block !important\n}');
    expect(text).toContain('.liquid-ios26 .only {\n  color: red !important\n}'); // nietknięte
  });

  it('partial: te same pary po kontekście i częściach (partial może być wycinkiem listy selektorów)', () => {
    const r = reguly[0];
    const zlozone = [{ arkusz: 'x.css', regula: { ...r, czesci: r.prelude.split(',').map((t) => ({ tekst: t.trim() })) }, deklaracja: r.deklaracje[0], nr: 0 }];
    const partial = '.liquid-ios26 .card{\n  background:#fff!important;\n  color:#111!important}\n';
    const { text, deklaracje } = zlozPartial(partial, mapaZlozen(zlozone));
    expect(deklaracje).toBe(1);
    expect(text).toContain('.card {\n  background:#fff\n}');
    expect(text).toContain('.liquid-ios26 .card {\n  color:#111!important\n}');
  });
});
