import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { korzen, zrodlo } from '../support/silnik-bmi.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-PDF (2026-09-20) — wydruk postępów jako PRAWDZIWY PDF, po zgłoszeniu właściciela, że na
// iPhonie w trybie PWA oba przyciski nie robiły nic.
//
// Poprzednia wersja tego pliku pilnowała dokumentu HTML: braku `<script>`, braku adresów
// sieciowych, reguł `@page` i łamania stron. Dokument HTML zniknął, więc tamte asercje nie
// mają czego strzec — ale KAŻDA z nich ma tu następczynię o tym samym sensie, liczoną na
// definicji dokumentu pdfmake. Gwarancja offline nie znika, tylko zmienia postać: zamiast
// „żadnego http w dokumencie" jest „biblioteka ładowana z plików, które service worker ma
// w precache".
//
// Testy wołają PRAWDZIWE `buildDokument`, `nazwaPliku` i `mozliwosci`. Dane FIKCYJNE.

function moduly() {
  const g = loadBrowserScript('vilda_postepy_doroslego_wydruk.js', {});
  return { P: g.VildaPostepyDoroslego, U: g.VildaPostepyDoroslegoUI, W: g.VildaPostepyDoroslegoWydruk };
}

const SERIA = [
  { dateISO: '2026-01-01', weight: 120, height: 170 },
  { dateISO: '2026-04-02', weight: 108, height: 170 },
  { dateISO: '2026-07-02', weight: 100, height: 170 },
  { dateISO: '2026-10-01', weight: 114, height: 170 },
];
const PUNKT = {
  id: 'p1', type: 'start', dateISO: '2026-01-01', weight: 120, height: 170,
  ageYears: 52, ageMonths: 0, drug: 'Saxenda (liraglutyd)', substance: 'liraglutide',
};
const OPCJE = { pacjent: 'Testowy Fikcyjny', wiekLat: 52, dataWydruku: '2026-09-20' };

const model = (extra) => moduly().P.analizuj({
  wiekLat: 52, pomiary: SERIA, punktyLeczenia: [PUNKT], ...extra,
});
const dok = (wariant, extra) => moduly().W.buildDokument(model(extra), { ...OPCJE, wariant });

/** Cały tekst dokumentu, niezależnie od zagnieżdżenia w stackach, tabelach i kolumnach. */
function tekstem(w) {
  if (w == null) return '';
  if (typeof w === 'string' || typeof w === 'number') return String(w);
  if (Array.isArray(w)) return w.map(tekstem).join(' ');
  if (typeof w !== 'object') return '';
  return [w.text, w.stack, w.columns, w.content, w.table && w.table.body, w.ul, w.ol]
    .map(tekstem).join(' ');
}

/** Wszystkie węzły `svg` w dokumencie — wykres ma być wektorem, nie obrazkiem. */
function svgi(w, out) {
  out = out || [];
  if (!w || typeof w !== 'object') return out;
  if (Array.isArray(w)) { w.forEach((x) => svgi(x, out)); return out; }
  if (typeof w.svg === 'string') out.push(w.svg);
  [w.stack, w.columns, w.content, w.table && w.table.body].forEach((x) => svgi(x, out));
  return out;
}

const tabele = (w, out) => {
  out = out || [];
  if (!w || typeof w !== 'object') return out;
  if (Array.isArray(w)) { w.forEach((x) => tabele(x, out)); return out; }
  if (w.table) out.push(w.table);
  [w.stack, w.columns, w.content, w.table && w.table.body].forEach((x) => tabele(x, out));
  return out;
};

describe('P-PDF — dokument powstaje i trzyma format', () => {
  it('to definicja pdfmake w formacie A4, nie fragment HTML', () => {
    const d = dok('pacjent');
    expect(d).toBeTruthy();
    expect(d.pageSize).toBe('A4');
    expect(d.pageOrientation).toBe('portrait');
    expect(d.pageMargins, 'marginesy podane wprost').toHaveLength(4);
    expect(d.defaultStyle.font, 'czcionka z dołączonego vfs').toBe('Roboto');
    expect(Array.isArray(d.content)).toBe(true);
    expect(typeof d, 'to obiekt, nie napis HTML').toBe('object');
  });

  it('biblioteka idzie z plików, które service worker trzyma w precache — czyli offline', () => {
    // NASTĘPCZYNI asercji „dokument nie pobiera nic z sieci". Tamta pilnowała, że w HTML nie
    // ma adresu http. Teraz gwarancji offline pilnuje co innego: pdfmake ładuje się leniwie
    // z LOKALNYCH plików, a te muszą być w precache — inaczej pierwsze kliknięcie bez sieci
    // skończy się błędem.
    const { W } = moduly();
    const sw = zrodlo('service-worker-kalorii.js');
    expect(W.PLIKI.length, 'biblioteka i czcionki').toBe(2);
    for (const plik of W.PLIKI) {
      expect(plik, 'adres lokalny, bez CDN').not.toMatch(/^https?:/);
      expect(fs.existsSync(path.join(korzen, plik.split('?')[0])), plik + ' istnieje w repo').toBe(true);
      expect(sw, plik + ' w precache').toContain("'/" + plik + "'");
    }
    const kod = zrodlo('vilda_postepy_doroslego_wydruk.js');
    expect(kod, 'moduł nie sięga po CDN').not.toMatch(/https?:\/\/[a-z]/i);
  });

  it('wykres wchodzi jako WEKTOR — węzeł svg, nigdy obrazek', () => {
    const d = dok('kliniczny');
    const s = svgi(d);
    expect(s.length, 'masa i BMI').toBe(2);
    s.forEach((x) => {
      expect(x.startsWith('<svg'), 'to naprawdę SVG').toBe(true);
      expect(x, 'bez rastra w środku').not.toContain('data:image');
    });
    expect(JSON.stringify(d), 'żadnego węzła obrazkowego').not.toContain('"image"');
  });

  it('SVG do PDF nie niesie atrybutów ekranowych, bo psuły wysokość strony', () => {
    // `width="100%"` na korzeniu rozdmuchiwał jedną kartkę na trzy (sprawdzone generowaniem).
    const [masa] = svgi(dok('pacjent'));
    expect(masa).not.toContain('width="100%"');
    expect(masa).not.toContain('font-family:inherit');
    expect(masa, 'geometria zostaje').toContain('viewBox=');
  });

  it('ramka wykresu liczona z proporcji viewBox, nie zgadywana', () => {
    const { U } = moduly();
    const d = dok('pacjent');
    const wezel = d.content.find((x) => x && typeof x.svg === 'string');
    expect(Array.isArray(wezel.fit), 'podana ramka, nie sama szerokość').toBe(true);
    const [szer, wys] = wezel.fit;
    expect(Math.round(szer * (U.GEOMETRIA.wys / U.GEOMETRIA.szer))).toBe(wys);
  });
});

describe('P-PDF — dwa warianty to dwa profile treści', () => {
  it('kartka dla pacjenta: jeden wykres, bez tabeli, bez ChPL i bez nazwy leku', () => {
    const d = dok('pacjent');
    expect(svgi(d), 'tylko masa').toHaveLength(1);
    const t = tekstem(d);
    expect(t).toContain('Moje postępy');
    expect(t, 'bez nazwy leku').not.toContain('Saxenda');
    expect(t, 'bez reguły ChPL').not.toContain('ChPL');
    expect(t, 'bez tabeli pomiarów').not.toContain('Zmiana [%]');
  });

  it('kartka do dokumentacji: oba wykresy, tabela, ChPL i lek', () => {
    const d = dok('kliniczny');
    expect(svgi(d)).toHaveLength(2);
    const t = tekstem(d);
    expect(t).toContain('Postępy redukcji masy ciała');
    expect(t).toContain('Saxenda');
    expect(t).toContain('ChPL');
    expect(t, 'nagłówki kolumn').toContain('Zmiana [%]');
    expect(t, 'wiek pacjenta').toContain('52 l.');
  });

  it('oba warianty pokazują TE SAME liczby', () => {
    const p = tekstem(dok('pacjent'));
    const k = tekstem(dok('kliniczny'));
    for (const liczba of ['120,0', '114,0', '100,0']) {
      expect(p, 'pacjent: ' + liczba).toContain(liczba);
      expect(k, 'kliniczny: ' + liczba).toContain(liczba);
    }
  });

  it('punkt oceny wg ChPL nie trafia na kartkę dla pacjenta', () => {
    const m = model();
    expect(m.kamienie.some((x) => x.typ === 'punkt-chpl'), 'model ten kamień ma').toBe(true);
    expect(tekstem(dok('pacjent'))).not.toContain('Punkt oceny');
    expect(tekstem(dok('kliniczny'))).toContain('Punkt oceny');
  });

  it('nieznany wariant spada na kartkę dla pacjenta', () => {
    expect(tekstem(moduly().W.buildDokument(model(), { ...OPCJE, wariant: 'wymyslony' })))
      .toContain('Moje postępy');
  });

  it('zamknięta bramka modelu → brak dokumentu', () => {
    expect(dok('kliniczny', { pomiary: SERIA.slice(0, 1) })).toBeNull();
    expect(dok('kliniczny', { wiekLat: 12 })).toBeNull();
  });

  it('przyrost masy opisany tak samo rzeczowo jak ubytek', () => {
    const t = tekstem(moduly().W.buildDokument(
      moduly().P.analizuj({
        wiekLat: 52,
        pomiary: [{ dateISO: '2026-01-01', weight: 100, height: 170 },
          { dateISO: '2026-07-01', weight: 108, height: 170 }],
      }), { ...OPCJE, wariant: 'pacjent' },
    ));
    expect(t).toContain('zwiększyła się o');
  });
});

describe('P-PDF — czego dołączony Roboto nie ma', () => {
  it('strzałka zamieniana na znak, który czcionka zna', () => {
    // Sprawdzone generowaniem PDF: U+2192 i U+27A1 wychodzą jako pusty prostokąt, natomiast
    // minus U+2212, półpauza, kropka środkowa i polskie znaki renderują się poprawnie.
    const m = model();
    expect(m.kamienie.some((k) => (k.opis || '').includes('→')),
      'model niesie prawdziwą strzałkę i ma ją nieść').toBe(true);
    const t = tekstem(dok('kliniczny'));
    expect(t, 'w PDF strzałki już nie ma').not.toContain('→');
    expect(t, 'jest jej zamiennik').toContain('»');
  });

  it('znaki, które Roboto zna, zostają nietknięte', () => {
    // Kontrola nadgorliwości: podmiana ma być wąska i jawna, nie „czyść wszystko dziwne".
    const t = tekstem(dok('kliniczny'));
    expect(t, 'minus typograficzny').toContain('−');
    expect(t, 'polskie znaki').toMatch(/[ąćęłńóśźż]/);
  });
});

describe('P-PDF — przyciski nie obiecują tego, czego przeglądarka nie zrobi', () => {
  /** Okno udające iPhone'a z ekranu głównego. */
  function oknoIos() {
    const g = loadBrowserScript('vilda_postepy_doroslego_wydruk.js', {});
    g.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
      standalone: true, share: () => Promise.resolve(), canShare: () => true,
    };
    g.File = function File() {};
    g.Blob = g.Blob || function Blob() {};
    g.matchMedia = () => ({ matches: true });
    return g;
  }

  it('iPhone w trybie aplikacji: udostępnianie zamiast pobierania, druku nie ma wcale', () => {
    // Sedno zgłoszenia: `<a download>` jest tam ignorowany, a okna druku nie ma — więc
    // rysowanie tych przycisków było obiecywaniem czegoś, co nie nastąpi.
    const g = oknoIos();
    const m = g.VildaPostepyDoroslegoWydruk.mozliwosci();
    expect(m.iosStandalone).toBe(true);
    expect(m.drogaZapisu).toBe('udostepnij');
    expect(m.pobieranie, 'download tam nie działa').toBe(false);
    expect(m.druk, 'okna druku tam nie ma').toBe(false);

    const html = g.VildaPostepyDoroslegoUI.buildHtml(g.VildaPostepyDoroslego.analizuj({
      wiekLat: 52, pomiary: SERIA, punktyLeczenia: [PUNKT],
    }));
    expect(html).toContain('Udostępnij PDF');
    expect(html, 'martwego przycisku druku nie rysujemy').not.toContain('data-akcja="drukuj"');
    expect(html, 'i mówimy, gdzie szukać wyniku').toContain('arkusza udostępniania');
  });

  /** Okno udające zwykłą przeglądarkę na komputerze. */
  function oknoDesktop() {
    const g = loadBrowserScript('vilda_postepy_doroslego_wydruk.js', {});
    // NAVIGATOR MUSI BYĆ PRAWDZIWY. Bez niego wykrywanie iOS padało na wyjątku i oddawało
    // `false` niezależnie od logiki — przez co kontrola negatywna „iOS wykryty ZAWSZE"
    // przechodziła na zielono. Test przechodził z właściwego wyniku, ale z niewłaściwego
    // powodu, czyli nie pilnował niczego.
    g.navigator = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140',
      standalone: undefined,
    };
    g.matchMedia = () => ({ matches: false });
    return g;
  }

  it('zwykła przeglądarka: zapis pliku i druk, z wyjaśnieniem drogi do PDF', () => {
    const g = oknoDesktop();
    const W = g.VildaPostepyDoroslegoWydruk;
    const U = g.VildaPostepyDoroslegoUI;
    const P = g.VildaPostepyDoroslego;
    const m = W.mozliwosci();
    expect(m.iosStandalone, 'to nie jest iPhone z ekranu głównego').toBe(false);
    expect(m.drogaZapisu).toBe('pobierz');
    expect(m.druk).toBe(true);
    const html = U.buildHtml(P.analizuj({ wiekLat: 52, pomiary: SERIA, punktyLeczenia: [PUNKT] }));
    expect(html).toContain('Zapisz PDF');
    expect(html).toContain('data-akcja="drukuj"');
    expect(html).toContain('Zapisz jako PDF');
  });

  it('Vilda zainstalowana jako aplikacja NA KOMPUTERZE zachowuje pobieranie i druk', () => {
    // Znalezione kontrolą negatywną: „display-mode: standalone" ma też desktopowa PWA,
    // a tam `download` i okno druku działają normalnie. Gdyby wykrywanie pytało wyłącznie
    // o tryb standalone, lekarz z Vildą przypiętą do paska zadań straciłby oba przyciski
    // bez powodu. Dlatego warunek jest DWUCZŁONOWY: iOS *i* tryb aplikacji.
    const g = loadBrowserScript('vilda_postepy_doroslego_wydruk.js', {});
    g.navigator = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140',
      standalone: undefined,
    };
    g.matchMedia = () => ({ matches: true });   // zainstalowana jako aplikacja
    const m = g.VildaPostepyDoroslegoWydruk.mozliwosci();
    expect(m.iosStandalone, 'to nie iPhone, tylko desktopowa PWA').toBe(false);
    expect(m.pobieranie, 'pobieranie tam działa').toBe(true);
    expect(m.druk, 'okno druku też').toBe(true);
    expect(m.drogaZapisu).toBe('pobierz');
  });

  it('panel ma miejsce na komunikat — cisza po kliknięciu była osobnym błędem', () => {
    const { U, P } = moduly();
    const html = U.buildHtml(P.analizuj({ wiekLat: 52, pomiary: SERIA, punktyLeczenia: [PUNKT] }));
    expect(html).toContain('vilda-pd-akcje-stan');
    expect(html, 'czytnik ekranu też ma się dowiedzieć').toContain('aria-live="polite"');
  });

  it('bez modułu wydruku panel nie obiecuje przycisków', () => {
    const g = loadBrowserScript('vilda_postepy_doroslego_ui.js', {});
    const m = g.VildaPostepyDoroslego.analizuj({ wiekLat: 52, pomiary: SERIA });
    const html = g.VildaPostepyDoroslegoUI.buildHtml(m);
    expect(html).not.toContain('data-akcja=');
    expect(html).not.toContain('Wydruk');
  });
});

describe('P-PDF — nazwa pliku i granica warstw', () => {
  it('nazwa pliku niesie wariant, nazwisko bez znaków psujących zapis, i rozszerzenie pdf', () => {
    const { W } = moduly();
    expect(W.nazwaPliku('kliniczny', OPCJE)).toBe('postepy_kliniczny_Testowy-Fikcyjny_2026-09-20.pdf');
    expect(W.nazwaPliku('pacjent', { pacjent: '../../etc/passwd', dataWydruku: '2026-09-20' }))
      .toBe('postepy_pacjent_etc-passwd_2026-09-20.pdf');
    expect(W.nazwaPliku('pacjent', {})).toBe('postepy_pacjent_wydruk.pdf');
  });

  it('moduł wydruku nie zna progów, okien ani kategorii BMI', () => {
    // Strażnik warstwy przeniesiony z poprzedniej wersji bez zmian: wydruk ma układać,
    // a nie liczyć. Jedna kopia progu wystarczyłaby, żeby kartka i ekran się rozjechały.
    const kod = zrodlo('vilda_postepy_doroslego_wydruk.js');
    for (const zakazane of ['thresholdPct', 'windowWeeks', 'PROGI', 'kategoriaDorosly', '0.75']) {
      expect(kod, 'wydruk liczy sam: ' + zakazane).not.toContain(zakazane);
    }
  });

  it('tytuły sekcji siedzą w tabelach, więc nie zostają same na dole strony', () => {
    // Widziane na wygenerowanej kartce: „Pomiary" na dole strony 1, tabela na stronie 2.
    // Osobny węzeł tytułu nigdy nie jest ostatni — razem z nim zostaje wiersz nagłówkowy
    // tabeli — więc żadne „złam, gdy nic po nim nie ma" nie działa. Tytuł w `headerRows`
    // usuwa całą klasę problemu.
    const t = tabele(dok('kliniczny'));
    const zTytulem = t.filter((x) => tekstem(x.body[0]).includes('Pomiary')
      || tekstem(x.body[0]).includes('Kamienie milowe'));
    expect(zTytulem.length, 'obie sekcje').toBe(2);
    zTytulem.forEach((x) => {
      expect(x.headerRows, 'tytuł w nagłówku tabeli').toBeGreaterThanOrEqual(1);
      expect(tekstem(x.body[0]), 'a tytuł jest pierwszym wierszem').toMatch(/Pomiary|Kamienie milowe/);
    });
  });
});

describe('P-PDF — wpięcie w strony i Kartę Pacjenta', () => {
  it('moduł wydruku ładuje się na wszystkich ośmiu stronach po module widoku', () => {
    const strony = fs.readdirSync(korzen).filter((f) => f.endsWith('.html'));
    let z = 0;
    for (const plik of strony) {
      const h = fs.readFileSync(path.join(korzen, plik), 'utf8');
      if (!h.includes('vilda_postepy_doroslego_wydruk.js')) continue;
      z += 1;
      expect(h.indexOf('vilda_postepy_doroslego_wydruk.js'),
        plik + ': wydruk po widoku').toBeGreaterThan(h.indexOf('vilda_postepy_doroslego_ui.js'));
    }
    expect(z, 'osiem stron z Kartą Pacjenta').toBe(8);
  });

  it('Karta Pacjenta podaje kontekst identyfikacyjny do panelu', () => {
    const karta = zrodlo('vilda_auth_ui.js');
    expect(karta).toContain('_pdU.renderPanel(Ct,_pdM,{pacjent:w');
    expect(karta, 'data wydruku liczona lokalnie, nie po UTC').toContain('getTimezoneOffset');
  });
});
